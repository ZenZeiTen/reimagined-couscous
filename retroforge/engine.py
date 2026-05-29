"""GameEngine — the fixed-timestep main loop that ties everything together.

The loop separates simulation from rendering. Physics and game logic advance in
fixed 60 Hz steps drained from a time accumulator, while rendering happens once
per frame at whatever rate the display allows. This keeps collision and movement
deterministic regardless of frame rate, and the per-frame delta is capped so a
single slow frame can't trigger a "spiral of death" of compounding catch-up
steps.

The engine owns the renderer, scene stack, input, and audio, and exposes them to
scenes via ``scene.on_enter(engine)``.
"""

from __future__ import annotations

import pygame

from .audio.audio import AudioEngine
from .input.input import InputManager
from .renderer.renderer import Renderer
from .scene import Scene, SceneManager

PHYSICS_HZ = 60
PHYSICS_DT = 1.0 / PHYSICS_HZ
MAX_FRAME_TIME = 0.05  # cap to avoid the spiral of death (max 3 steps/frame)


class GameEngine:
    def __init__(
        self,
        renderer: Renderer | None = None,
        *,
        fps_limit: int = 60,
        scene_manager: SceneManager | None = None,
        input_manager: InputManager | None = None,
        audio_engine: AudioEngine | None = None,
        init_audio: bool = True,
    ) -> None:
        if not pygame.get_init():
            pygame.init()

        self.renderer = renderer if renderer is not None else Renderer()
        self.scenes = scene_manager if scene_manager is not None else SceneManager()
        self.audio = audio_engine if audio_engine is not None else (
            AudioEngine() if init_audio else None
        )
        # Input depends on the joystick subsystem being initialised.
        if not pygame.joystick.get_init():
            pygame.joystick.init()
        self.input = input_manager if input_manager is not None else InputManager()

        self.scenes.bind(self)
        self._running = False
        self._accumulator = 0.0
        self.fps_limit = fps_limit
        self.clock = pygame.time.Clock()
        self.dt = 0.0  # last frame's wall-clock delta (for non-fixed effects)

    # -- lifecycle ------------------------------------------------------------
    def run(self, initial_scene: Scene) -> None:
        """Push ``initial_scene`` and enter the main loop until quit."""
        self.scenes.push(initial_scene)
        self._running = True
        prev = pygame.time.get_ticks() / 1000.0

        while self._running:
            now = pygame.time.get_ticks() / 1000.0
            frame_time = min(now - prev, MAX_FRAME_TIME)
            prev = now
            self.dt = frame_time
            self._accumulator += frame_time

            self._pump_events()
            if not self._running:
                break

            # Drain fixed physics steps.
            while self._accumulator >= PHYSICS_DT:
                self.scenes.update(PHYSICS_DT, self.input)
                self._accumulator -= PHYSICS_DT
                if self.scenes.is_empty:
                    self._running = False
                    break

            # Render once.
            self.renderer.begin_frame()
            self.scenes.draw(self.renderer)
            self.renderer.end_frame()
            self.clock.tick(self.fps_limit)

    def step(self, frames: int = 1) -> None:
        """Run a fixed number of full update+draw frames (used for tests).

        Unlike ``run`` this does not block on a real clock — handy for headless
        smoke testing of the whole pipeline.
        """
        for _ in range(frames):
            self._pump_events()
            self.scenes.update(PHYSICS_DT, self.input)
            self.renderer.begin_frame()
            self.scenes.draw(self.renderer)
            self.renderer.end_frame()
            if self.scenes.is_empty:
                break

    def quit(self) -> None:
        self._running = False

    # -- internals ------------------------------------------------------------
    def _pump_events(self) -> None:
        events = pygame.event.get()
        for e in events:
            if e.type == pygame.QUIT:
                self._running = False
        self.input.update(events)
