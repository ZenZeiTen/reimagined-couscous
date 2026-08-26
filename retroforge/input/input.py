"""InputManager — an SNES-style 12-button controller abstraction.

Game code asks about logical buttons (A, B, X, Y, L, R, START, SELECT, and the
d-pad), never raw keycodes. That keeps gameplay logic console-authentic and lets
the keyboard mapping or a gamepad be swapped without touching the game.

Edges vs. the fixed timestep
----------------------------
Held state (``is_pressed``) is polled once per rendered frame. Edges
(``is_just_pressed`` / ``is_just_released``) cannot be, because rendered frames
and fixed simulation steps do not run at the same rate: a 144 Hz display renders
2.4 frames per 60 Hz step, and a stuttering one renders none. Diffing state per
*frame* would therefore drop a press whose frame happened to run no step (on a
144 Hz display, that is most of them) and report it twice on a frame that ran
two.

So edges are **latched**: ``update`` records every press/release it sees into a
pending set, and ``begin_step`` — which the engine calls immediately before each
fixed update — hands that set to the step and clears it. Every edge is therefore
observed by exactly one simulation step, no matter how frames and steps line up.

Latching also catches taps shorter than one frame: those never appear in polled
state at all, but they do arrive as KEYDOWN/KEYUP events, which are folded in.
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
    pygame.K_SPACE: Button.A,
    pygame.K_ESCAPE: Button.SELECT,
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

AXIS_DEADZONE = 0.4


class InputManager:
    def __init__(self, keymap: dict[int, Button] | None = None) -> None:
        self._keymap = dict(keymap) if keymap else dict(DEFAULT_KEYMAP)
        self._padmap = dict(DEFAULT_PADMAP)

        self._current: set[Button] = set()      # live held state
        self._pressed_latch: set[Button] = set()
        self._released_latch: set[Button] = set()
        self._just_pressed: set[Button] = set()  # edges owned by the current step
        self._just_released: set[Button] = set()

        self._joystick: pygame.joystick.JoystickType | None = None
        if pygame.joystick.get_init() and pygame.joystick.get_count() > 0:
            self._open_joystick(0)

    # -- per-frame ------------------------------------------------------------
    def update(self, events: list[pygame.event.Event]) -> None:
        """Refresh held state and latch any edges seen since the last step."""
        touched: set[Button] = set()   # buttons any event mentioned this frame
        focus_lost = False

        for e in events:
            etype = e.type
            if etype in (pygame.KEYDOWN, pygame.KEYUP):
                btn = self._keymap.get(e.key)
                if btn is not None:
                    touched.add(btn)
            elif etype in (pygame.JOYBUTTONDOWN, pygame.JOYBUTTONUP):
                btn = self._padmap.get(e.button)
                if btn is not None:
                    touched.add(btn)
            elif etype == pygame.JOYDEVICEADDED:
                if self._joystick is None:
                    self._open_joystick(e.device_index)
            elif etype == pygame.JOYDEVICEREMOVED:
                if (self._joystick is not None
                        and e.instance_id == self._joystick.get_instance_id()):
                    self._joystick = None
            elif etype == pygame.WINDOWFOCUSLOST:
                focus_lost = True

        current: set[Button] = set()
        pressed = pygame.key.get_pressed()
        for key, btn in self._keymap.items():
            if pressed[key]:
                current.add(btn)
        if self._joystick is not None:
            self._poll_joystick(current)

        if focus_lost:
            # Keys physically released while unfocused never send KEYUP. Report
            # them as released so hold-based logic unwinds, then start clean.
            self._released_latch |= self._current | current
            self._pressed_latch -= self._released_latch
            self._current = set()
            return

        # Polled state is the authority for edges. It aggregates every key bound
        # to a button, so releasing W while the Up arrow is still held is
        # correctly *not* a release — deriving edges from raw KEYUP events would
        # report a phantom one, and the default keymap binds two keys to every
        # d-pad direction.
        self._pressed_latch |= current - self._current
        self._released_latch |= self._current - current

        # Events only fill the gap polling cannot see: a tap that began and
        # ended between two polls never appears in either sample.
        for btn in touched:
            if btn not in current and btn not in self._current:
                self._pressed_latch.add(btn)
                self._released_latch.add(btn)

        self._current = current

    def begin_step(self) -> None:
        """Hand the latched edges to the next fixed update, then clear them.

        The engine calls this before every ``Scene.update``. Each edge is
        therefore delivered to exactly one simulation step.
        """
        self._just_pressed = self._pressed_latch
        self._just_released = self._released_latch
        self._pressed_latch = set()
        self._released_latch = set()

    def _open_joystick(self, index: int) -> None:
        try:
            js = pygame.joystick.Joystick(index)
            js.init()
        except pygame.error:
            return
        self._joystick = js

    def _poll_joystick(self, current: set[Button]) -> None:
        js = self._joystick
        assert js is not None
        try:
            for idx, btn in self._padmap.items():
                if idx < js.get_numbuttons() and js.get_button(idx):
                    current.add(btn)
            if js.get_numaxes() >= 2:
                ax, ay = js.get_axis(0), js.get_axis(1)
                if ax < -AXIS_DEADZONE:
                    current.add(Button.LEFT)
                elif ax > AXIS_DEADZONE:
                    current.add(Button.RIGHT)
                if ay < -AXIS_DEADZONE:
                    current.add(Button.UP)
                elif ay > AXIS_DEADZONE:
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
        except pygame.error:
            # Pad yanked mid-poll; drop it and carry on with the keyboard.
            self._joystick = None

    # -- queries --------------------------------------------------------------
    def is_pressed(self, btn: Button) -> bool:
        return btn in self._current

    def is_just_pressed(self, btn: Button) -> bool:
        return btn in self._just_pressed

    def is_just_released(self, btn: Button) -> bool:
        return btn in self._just_released

    def any_pressed(self, *buttons: Button) -> bool:
        return any(b in self._current for b in buttons)

    def axis(self) -> tuple[int, int]:
        """The d-pad as a (-1..1, -1..1) pair — handy for top-down movement."""
        x = (Button.RIGHT in self._current) - (Button.LEFT in self._current)
        y = (Button.DOWN in self._current) - (Button.UP in self._current)
        return x, y

    def remap(self, key: int, btn: Button) -> None:
        self._keymap[key] = btn

    def remap_pad(self, index: int, btn: Button) -> None:
        self._padmap[index] = btn

    def reset(self, *, emit_releases: bool = True) -> None:
        """Drop all held state.

        By default every currently-held button is reported released, so logic
        waiting on a release (a charged shot, a held block) unwinds instead of
        hanging forever. Pass ``emit_releases=False`` for a hard clear.
        """
        released = self._current if emit_releases else set()
        self._current = set()
        self._pressed_latch = set()
        self._released_latch = set(released)
        self._just_pressed = set()
        self._just_released = set()
