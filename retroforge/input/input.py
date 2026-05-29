"""InputManager — an SNES-style 12-button controller abstraction.

Game code asks about logical buttons (A, B, X, Y, L, R, START, SELECT, and the
d-pad), never raw keycodes. That keeps gameplay logic console-authentic and lets
the keyboard mapping or a gamepad be swapped without touching the game.

Edge detection (``is_just_pressed`` / ``is_just_released``) is provided by
diffing the current button set against the previous frame's, so the manager must
be ``update``-d exactly once per frame with that frame's events.
"""

from __future__ import annotations

from enum import IntEnum

import pygame


class Button(IntEnum):
    UP = 0
    DOWN = 1
    LEFT = 2
    RIGHT = 3
    A = 4
    B = 5
    X = 6
    Y = 7
    L = 8
    R = 9
    START = 10
    SELECT = 11


# Default keyboard layout (mirrors a common emulator default).
DEFAULT_KEYMAP: dict[int, Button] = {
    pygame.K_UP: Button.UP,
    pygame.K_DOWN: Button.DOWN,
    pygame.K_LEFT: Button.LEFT,
    pygame.K_RIGHT: Button.RIGHT,
    pygame.K_w: Button.UP,
    pygame.K_s: Button.DOWN,
    pygame.K_a: Button.LEFT,
    pygame.K_d: Button.RIGHT,
    pygame.K_z: Button.A,
    pygame.K_x: Button.B,
    pygame.K_c: Button.X,
    pygame.K_v: Button.Y,
    pygame.K_q: Button.L,
    pygame.K_e: Button.R,
    pygame.K_RETURN: Button.START,
    pygame.K_RSHIFT: Button.SELECT,
}

# Gamepad button indices vary; this is a sensible default for common pads.
DEFAULT_PADMAP: dict[int, Button] = {
    0: Button.A,
    1: Button.B,
    2: Button.X,
    3: Button.Y,
    4: Button.L,
    5: Button.R,
    6: Button.SELECT,
    7: Button.START,
}


class InputManager:
    def __init__(self, keymap: dict[int, Button] | None = None) -> None:
        self._keymap = dict(keymap) if keymap else dict(DEFAULT_KEYMAP)
        self._current: set[Button] = set()
        self._previous: set[Button] = set()

        self._joystick: pygame.joystick.JoystickType | None = None
        if pygame.joystick.get_init() and pygame.joystick.get_count() > 0:
            self._joystick = pygame.joystick.Joystick(0)
            self._joystick.init()

    def update(self, events: list[pygame.event.Event]) -> None:
        """Rebuild button state from the keyboard and (optional) gamepad."""
        self._previous = self._current
        current: set[Button] = set()

        pressed = pygame.key.get_pressed()
        for key, btn in self._keymap.items():
            if pressed[key]:
                current.add(btn)

        if self._joystick is not None:
            self._poll_joystick(current)

        self._current = current

    def _poll_joystick(self, current: set[Button]) -> None:
        js = self._joystick
        assert js is not None
        for idx, btn in DEFAULT_PADMAP.items():
            if idx < js.get_numbuttons() and js.get_button(idx):
                current.add(btn)
        if js.get_numaxes() >= 2:
            ax, ay = js.get_axis(0), js.get_axis(1)
            dz = 0.4
            if ax < -dz:
                current.add(Button.LEFT)
            elif ax > dz:
                current.add(Button.RIGHT)
            if ay < -dz:
                current.add(Button.UP)
            elif ay > dz:
                current.add(Button.DOWN)
        if js.get_numhats() >= 1:
            hx, hy = js.get_hat(0)
            if hx < 0:
                current.add(Button.LEFT)
            elif hx > 0:
                current.add(Button.RIGHT)
            if hy > 0:
                current.add(Button.UP)
            elif hy < 0:
                current.add(Button.DOWN)

    # -- queries --------------------------------------------------------------
    def is_pressed(self, btn: Button) -> bool:
        return btn in self._current

    def is_just_pressed(self, btn: Button) -> bool:
        return btn in self._current and btn not in self._previous

    def is_just_released(self, btn: Button) -> bool:
        return btn not in self._current and btn in self._previous

    def remap(self, key: int, btn: Button) -> None:
        self._keymap[key] = btn
