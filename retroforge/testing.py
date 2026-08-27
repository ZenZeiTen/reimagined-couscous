"""Harness — drive a game headlessly and assert what it did.

Writing a game is only half the job; the other half is checking it still works.
That is hard to automate here because a game is a loop over real input and real
pixels, and the engine's own test suite had to reach past the public API to fake
either — monkeypatching ``pygame.key.get_pressed`` is not something a game
developer should have to discover.

So this is the supported way. It runs a real ``GameEngine`` against the dummy SDL
drivers, feeds it synthetic input that the real ``InputManager`` consumes through
its real code path, and hands back the rendered frame::

    with Harness(MyScene()) as h:
        h.hold(rf.Button.RIGHT, steps=40)       # walk right for 40 steps
        h.tap(rf.Button.A)                      # jump
        h.run_until(lambda: h.scene.player.body.grounded, limit=120)
        assert h.pixel(80, 100) == (92, 148, 252)
        h.capture("landing.png")                # look at it yourself

Everything is deterministic: no wall clock, one fixed step per ``step()``, so a
run replays identically. That is what makes it usable in CI and what lets a tool
verify a game it just generated.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterable

# Must be set before pygame initialises its video/audio backends.
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pygame

from .engine import PHYSICS_DT, GameEngine
from .input.input import DEFAULT_KEYMAP, Button, InputManager
from .renderer.renderer import RES_SNES, Renderer
from .scene import Scene

RGB = tuple[int, int, int]


class ScriptedKeyboard:
    """Stands in for ``pygame.key.get_pressed()``, driven by held buttons."""

    def __init__(self) -> None:
        self.keys: set[int] = set()

    def __getitem__(self, key: int) -> bool:
        return key in self.keys


class Harness:
    """A headless engine you can script and inspect.

    Usable as a context manager, which quits pygame on exit so several harnesses
    can run in one process (one test file, many games).
    """

    def __init__(
        self,
        scene: Scene | None = None,
        *,
        size: tuple[int, int] = RES_SNES,
        engine: GameEngine | None = None,
        init_audio: bool = False,
    ) -> None:
        if not pygame.get_init():
            pygame.init()

        if engine is None:
            renderer = Renderer(*size, scale=1, vsync=False)
            engine = GameEngine(renderer, init_audio=init_audio)
        self.engine = engine
        self.renderer = engine.renderer

        # One key per button, so holding a button presses exactly one key and
        # releasing it releases that button — the default map binds several keys
        # to some buttons, which would make "release" ambiguous.
        self._key_for: dict[Button, int] = {}
        for key, button in DEFAULT_KEYMAP.items():
            self._key_for.setdefault(button, key)

        self._keyboard = ScriptedKeyboard()
        self._real_get_pressed = pygame.key.get_pressed
        pygame.key.get_pressed = lambda: self._keyboard  # type: ignore[assignment]

        self._held: set[Button] = set()
        self._pending: list[pygame.event.Event] = []
        self.steps = 0
        self.closed = False

        if scene is not None:
            self.engine.scenes.push(scene)

    # -- lifecycle ------------------------------------------------------------
    def __enter__(self) -> Harness:
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        """Restore pygame and drop the scene stack."""
        if self.closed:
            return
        pygame.key.get_pressed = self._real_get_pressed  # type: ignore[assignment]
        self.engine.scenes.clear()
        self.closed = True

    @property
    def scene(self) -> Scene | None:
        """The scene currently on top of the stack."""
        return self.engine.scenes.current

    @property
    def input(self) -> InputManager:
        return self.engine.input

    def push(self, scene: Scene) -> Scene:
        self.engine.scenes.push(scene)
        return scene

    # -- input ----------------------------------------------------------------
    def press(self, *buttons: Button) -> None:
        """Hold buttons down until released. Does not advance the game."""
        for button in buttons:
            if button in self._held:
                continue
            key = self._key_for[button]
            self._held.add(button)
            self._keyboard.keys.add(key)
            self._pending.append(pygame.event.Event(pygame.KEYDOWN, key=key))

    def release(self, *buttons: Button) -> None:
        for button in buttons:
            if button not in self._held:
                continue
            key = self._key_for[button]
            self._held.discard(button)
            self._keyboard.keys.discard(key)
            self._pending.append(pygame.event.Event(pygame.KEYUP, key=key))

    def release_all(self) -> None:
        self.release(*list(self._held))

    def tap(self, *buttons: Button, steps: int = 2) -> None:
        """Press, advance a couple of steps, release — one deliberate press."""
        self.press(*buttons)
        self.step(steps)
        self.release(*buttons)
        self.step(1)

    def hold(self, *buttons: Button, steps: int = 1) -> None:
        """Hold buttons for ``steps`` fixed steps, then release them."""
        self.press(*buttons)
        self.step(steps)
        self.release(*buttons)

    @property
    def held(self) -> set[Button]:
        return set(self._held)

    # -- running --------------------------------------------------------------
    def step(self, count: int = 1) -> None:
        """Advance ``count`` fixed steps, each with one update and one draw."""
        for _ in range(count):
            self.engine.input.update(self._drain_events())
            self.engine.input.begin_step()
            self.engine.scenes.update(PHYSICS_DT, self.engine.input)
            self.renderer.begin_frame()
            self.engine.scenes.draw(self.renderer)
            self.renderer.end_frame()
            self.steps += 1
            if self.engine.scenes.is_empty:
                break

    def _drain_events(self) -> list[pygame.event.Event]:
        events, self._pending = self._pending, []
        return events

    def run_until(self, predicate: Callable[[], bool], *, limit: int = 600,
                  buttons: Iterable[Button] = ()) -> int:
        """Step until ``predicate`` holds, holding ``buttons`` meanwhile.

        Returns the number of steps taken. Raises ``TimeoutError`` at ``limit``
        rather than looping forever, so a broken condition fails a test loudly
        instead of hanging CI.
        """
        buttons = tuple(buttons)
        if buttons:
            self.press(*buttons)
        try:
            for taken in range(limit + 1):
                if predicate():
                    return taken
                self.step(1)
        finally:
            if buttons:
                self.release(*buttons)
        raise TimeoutError(
            f"condition still false after {limit} steps "
            f"({limit * PHYSICS_DT:.1f}s of game time)"
        )

    def run_for(self, seconds: float, *, buttons: Iterable[Button] = ()) -> None:
        """Advance a number of seconds of game time."""
        steps = max(0, round(seconds / PHYSICS_DT))
        buttons = tuple(buttons)
        if buttons:
            self.press(*buttons)
        self.step(steps)
        if buttons:
            self.release(*buttons)

    # -- inspecting the frame -------------------------------------------------
    @property
    def frame(self) -> pygame.Surface:
        """The virtual screen as last drawn."""
        return self.renderer.target

    def pixel(self, x: int, y: int) -> RGB:
        """Colour of one virtual-screen pixel."""
        return tuple(self.renderer.target.get_at((int(x), int(y)))[:3])

    def count_color(self, color: RGB, *, tolerance: int = 0) -> int:
        """How many pixels match a colour — a cheap 'is it on screen?' check."""
        import numpy as np

        arr = pygame.surfarray.array3d(self.renderer.target).astype(np.int16)
        target = np.array(color, dtype=np.int16)
        if tolerance <= 0:
            return int((arr == target).all(axis=2).sum())
        return int((np.abs(arr - target).max(axis=2) <= tolerance).sum())

    def is_blank(self) -> bool:
        """True if the whole frame is one colour — usually a sign of trouble."""

        arr = pygame.surfarray.array3d(self.renderer.target)
        return bool((arr == arr[0, 0]).all())

    def capture(self, path: str, *, scale: int = 1) -> str:
        """Save the current frame as a PNG and return the path.

        A rendered frame is the only honest evidence for a lot of visual bugs,
        and it is something a person or a vision model can actually look at.
        """
        surface = self.renderer.target
        if scale > 1:
            surface = pygame.transform.scale(
                surface, (surface.get_width() * scale, surface.get_height() * scale)
            )
        directory = os.path.dirname(os.path.abspath(path))
        if directory:
            os.makedirs(directory, exist_ok=True)
        pygame.image.save(surface, path)
        return path


def smoke(scene_factory: Callable[[], Scene], *, steps: int = 120,
          size: tuple[int, int] = RES_SNES) -> None:
    """Run a scene for ``steps`` and raise if it errors or renders nothing.

    The minimum check worth having on a game: it starts, it runs, it draws.
    """
    with Harness(scene_factory(), size=size) as harness:
        harness.step(steps)
        if harness.is_blank():
            raise AssertionError(
                f"scene rendered a blank frame after {steps} steps"
            )
