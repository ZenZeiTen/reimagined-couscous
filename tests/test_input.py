"""Input edge detection across the frame-rate / fixed-step mismatch.

Rendered frames and fixed simulation steps do not run at the same rate. A 144 Hz
display renders 2.4 frames per 60 Hz step; a stuttering one renders none. These
tests drive the real ``InputManager`` through that mismatch and assert that a
single button tap is observed by exactly one simulation step — never zero (a
dropped jump) and never two (a double jump).

The keyboard is modelled by one authoritative ``held_at(t)`` predicate. Both the
event stream and the polled state are derived from it, mirroring pygame, where
``key.get_pressed()`` is updated by the same event pump that fills the queue, so
the two can never disagree.
"""

from __future__ import annotations

import pygame
import pytest

from retroforge.engine import MAX_FRAME_TIME, PHYSICS_DT
from retroforge.input.input import Button, InputManager

TAP_KEY = pygame.K_z          # mapped to Button.A in DEFAULT_KEYMAP
SIM_MS = 600.0


class _Keyboard:
    """Stands in for pygame.key.get_pressed(), driven by a held_at predicate."""

    def __init__(self) -> None:
        self.down: set[int] = set()

    def __getitem__(self, key: int) -> bool:
        return key in self.down


def _run(hz: float, hold_ms: float, press_at_ms: float,
         monkeypatch: pytest.MonkeyPatch) -> tuple[int, int, int]:
    """Drive InputManager through a full frame/step loop for one tap.

    Returns (press_edges, release_edges, steps_run).
    """
    release_at_ms = press_at_ms + hold_ms

    def held_at(t: float) -> bool:
        return press_at_ms <= t < release_at_ms

    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)

    inp = InputManager()
    frame_dt = 1000.0 / hz
    accumulator = 0.0
    presses = releases = steps = 0
    prev_t = 0.0
    t = frame_dt

    while t <= SIM_MS:
        # SDL delivers each transition in the first frame at or after it occurs,
        # and updates polled state to match, so derive both from held_at.
        events = []
        for boundary in (press_at_ms, release_at_ms):
            if prev_t < boundary <= t:
                events.append(pygame.event.Event(
                    pygame.KEYDOWN if held_at(boundary) else pygame.KEYUP,
                    key=TAP_KEY,
                ))
        keyboard.down = {TAP_KEY} if held_at(t) else set()

        inp.update(events)

        accumulator += min(frame_dt / 1000.0, MAX_FRAME_TIME)
        while accumulator >= PHYSICS_DT:
            inp.begin_step()
            steps += 1
            if inp.is_just_pressed(Button.A):
                presses += 1
            if inp.is_just_released(Button.A):
                releases += 1
            accumulator -= PHYSICS_DT

        prev_t = t
        t += frame_dt

    return presses, releases, steps


# Refresh rates a player might actually have, including ones far above 60 Hz
# (where per-frame edge diffing silently ate every press) and below it (where it
# reported each press twice).
REFRESH_RATES = [30.0, 45.0, 50.0, 60.0, 72.0, 75.0, 90.0, 100.0,
                 120.0, 144.0, 165.0, 200.0, 240.0, 360.0]
# Hold durations from a sub-frame flick to a deliberate press.
HOLD_MS = [3.0, 8.0, 16.0, 33.0, 50.0, 90.0, 150.0]


@pytest.mark.parametrize("hz", REFRESH_RATES)
@pytest.mark.parametrize("hold_ms", HOLD_MS)
def test_single_tap_is_observed_exactly_once(hz, hold_ms, monkeypatch):
    """One tap -> exactly one is_just_pressed and one is_just_released."""
    frame_ms = 1000.0 / hz
    # Sweep the press across a whole frame period: the bug depended on where the
    # press landed relative to the frame/step phase.
    for i in range(16):
        press_at = 100.0 + i * frame_ms / 16.0
        presses, releases, steps = _run(hz, hold_ms, press_at, monkeypatch)
        assert steps > 0, "simulation ran no fixed steps"
        assert presses == 1, (
            f"{hz}Hz hold={hold_ms}ms press_at={press_at:.3f}: "
            f"press observed {presses}x, want exactly 1"
        )
        assert releases == 1, (
            f"{hz}Hz hold={hold_ms}ms press_at={press_at:.3f}: "
            f"release observed {releases}x, want exactly 1"
        )


def test_edges_survive_a_frame_that_runs_no_step(monkeypatch):
    """A press on a frame too short to advance the accumulator is not lost."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    # Frame 1: press arrives, but no step runs.
    keyboard.down = {TAP_KEY}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY)])
    # Frames 2 and 3: key still held, still no step.
    for _ in range(2):
        inp.update([])
    assert inp.is_just_pressed(Button.A) is False, "no step has run yet"

    # The step finally runs three frames later and must still see the edge.
    inp.begin_step()
    assert inp.is_just_pressed(Button.A) is True
    assert inp.is_pressed(Button.A) is True


def test_edge_is_not_repeated_when_one_frame_runs_several_steps(monkeypatch):
    """A slow frame draining 3 steps reports the press to only the first."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {TAP_KEY}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY)])

    seen = []
    for _ in range(3):
        inp.begin_step()
        seen.append(inp.is_just_pressed(Button.A))
    assert seen == [True, False, False], seen
    # Held state persists across all three, only the edge is consumed.
    assert inp.is_pressed(Button.A) is True


def test_tap_shorter_than_a_frame_is_still_seen(monkeypatch):
    """Press and release inside one frame: polled state never shows it held."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = set()  # already released by the time we poll
    inp.update([
        pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY),
        pygame.event.Event(pygame.KEYUP, key=TAP_KEY),
    ])
    inp.begin_step()
    assert inp.is_just_pressed(Button.A) is True
    assert inp.is_just_released(Button.A) is True
    assert inp.is_pressed(Button.A) is False


def test_two_taps_in_one_frame_reach_two_steps(monkeypatch):
    """A hitching frame runs several fixed steps and can contain two real taps.

    Latching edges as a flag rather than a count merged them into one, so the
    second shot of a quick double-tap vanished during a stutter.
    """
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = set()
    inp.update([
        pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY),
        pygame.event.Event(pygame.KEYUP, key=TAP_KEY),
        pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY),
        pygame.event.Event(pygame.KEYUP, key=TAP_KEY),
    ])

    # A 200ms hitch clamps to MAX_FRAME_TIME and runs three fixed steps.
    seen = []
    for _ in range(3):
        inp.begin_step()
        seen.append(inp.is_just_pressed(Button.A))
    assert seen.count(True) == 2, f"both taps should be delivered, got {seen}"


def test_key_repeat_is_not_a_second_press(monkeypatch):
    """Holding a key can emit repeated KEYDOWNs; only the first is an edge."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {TAP_KEY}
    inp.update([
        pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY),
        pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY),
        pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY),
    ])
    seen = []
    for _ in range(3):
        inp.begin_step()
        seen.append(inp.is_just_pressed(Button.A))
    assert seen == [True, False, False], seen


def test_two_keys_on_one_button_tapped_together_give_one_edge(monkeypatch):
    """Up and W pressed in the same frame is one button press, not two."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {pygame.K_UP, pygame.K_w}
    inp.update([
        pygame.event.Event(pygame.KEYDOWN, key=pygame.K_UP),
        pygame.event.Event(pygame.KEYDOWN, key=pygame.K_w),
    ])
    seen = []
    for _ in range(3):
        inp.begin_step()
        seen.append(inp.is_just_pressed(Button.UP))
    assert seen == [True, False, False], seen


def test_reset_clears_held_state_and_pending_edges(monkeypatch):
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {TAP_KEY}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=TAP_KEY)])
    inp.reset()
    inp.begin_step()
    assert inp.is_pressed(Button.A) is False
    assert inp.is_just_pressed(Button.A) is False


def test_axis_reports_dpad_direction(monkeypatch):
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {pygame.K_RIGHT, pygame.K_UP}
    inp.update([])
    assert inp.axis() == (1, -1)

    keyboard.down = {pygame.K_LEFT, pygame.K_DOWN}
    inp.update([])
    assert inp.axis() == (-1, 1)

    # Opposing directions cancel rather than favouring one.
    keyboard.down = {pygame.K_LEFT, pygame.K_RIGHT}
    inp.update([])
    assert inp.axis() == (0, 0)
