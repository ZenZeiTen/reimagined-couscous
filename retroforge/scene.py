"""Scenes and the scene stack.

A ``Scene`` is one screen of the game — a title, a level, a pause menu. The
``SceneManager`` keeps scenes on a stack so a pause menu can be pushed over a
running level and popped to resume it exactly where it left off. Scenes may be
marked ``transparent`` to let the scene beneath keep drawing (the pause-overlay
case).

``Scene`` is the engine's single base class: it exists to define the mandatory
lifecycle interface, which subclasses override.
"""

from __future__ import annotations

from .input.input import InputManager
from .renderer.renderer import Renderer


class Scene:
    """Base class for all scenes. Override the hooks you need."""

    #: When True, the scene below this one still draws (overlay menus, etc.).
    transparent: bool = False

    def on_enter(self, engine) -> None:  # noqa: ANN001 - avoid import cycle
        """Called when the scene is pushed onto the stack."""

    def on_exit(self) -> None:
        """Called when the scene is popped off the stack."""

    def on_resume(self) -> None:
        """Called when a scene above this one is popped, exposing it again."""

    def update(self, dt: float, inp: InputManager) -> None:
        """Advance simulation by ``dt`` seconds (fixed timestep)."""

    def draw(self, renderer: Renderer) -> None:
        """Render the scene onto ``renderer.target``."""


class SceneManager:
    def __init__(self) -> None:
        self._stack: list[Scene] = []
        self._engine = None

    def bind(self, engine) -> None:  # noqa: ANN001
        self._engine = engine

    @property
    def current(self) -> Scene | None:
        return self._stack[-1] if self._stack else None

    @property
    def is_empty(self) -> bool:
        return not self._stack

    def push(self, scene: Scene) -> None:
        self._stack.append(scene)
        scene.on_enter(self._engine)

    def pop(self) -> None:
        if not self._stack:
            return
        self._stack.pop().on_exit()
        if self._stack:
            self._stack[-1].on_resume()

    def replace(self, scene: Scene) -> None:
        if self._stack:
            self._stack.pop().on_exit()
        self.push(scene)

    def clear(self) -> None:
        while self._stack:
            self._stack.pop().on_exit()

    # -- per-frame ------------------------------------------------------------
    def update(self, dt: float, inp: InputManager) -> None:
        if self._stack:
            self._stack[-1].update(dt, inp)

    def draw(self, renderer: Renderer) -> None:
        if not self._stack:
            return
        # Find the lowest scene that needs drawing: walk down through any
        # transparent scenes, then draw bottom-up.
        first = len(self._stack) - 1
        while first > 0 and self._stack[first].transparent:
            first -= 1
        for scene in self._stack[first:]:
            scene.draw(renderer)
