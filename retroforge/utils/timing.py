"""Timers, tweens, and easing — the game-feel toolkit.

Almost every piece of 16-bit game feel is "do this after a delay" or "move this
value smoothly from A to B": invulnerability frames after a hit, a respawn
pause, spawn waves, a coin arcing out of a block, a menu sliding in, a health
bar catching up to the damage it just took.

Both live on a ``Scheduler`` that a scene ticks once per fixed step, so nothing
depends on frame rate and everything pauses when the scene does.

    self.timers = rf.Scheduler()
    self.timers.after(0.5, self.spawn_wave)
    self.timers.every(2.0, self.drop_powerup)
    self.timers.tween(2.0, 0.0, 1.0, lambda v: setattr(self, "fade", v),
                      ease=rf.ease_out_quad)
    ...
    self.timers.update(dt)
"""

from __future__ import annotations

import math
from typing import Callable

# ---------------------------------------------------------------------------
# Easing — all take and return a normalised 0..1 progress.
# ---------------------------------------------------------------------------

def linear(t: float) -> float:
    return t


def ease_in_quad(t: float) -> float:
    return t * t


def ease_out_quad(t: float) -> float:
    return 1.0 - (1.0 - t) * (1.0 - t)


def ease_in_out_quad(t: float) -> float:
    if t < 0.5:
        return 2.0 * t * t
    return 1.0 - ((-2.0 * t + 2.0) ** 2) / 2.0


def ease_in_cubic(t: float) -> float:
    return t * t * t


def ease_out_cubic(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def ease_in_out_cubic(t: float) -> float:
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - ((-2.0 * t + 2.0) ** 3) / 2.0


def ease_out_back(t: float) -> float:
    """Overshoots slightly then settles — a menu snapping into place."""
    c1, c3 = 1.70158, 2.70158
    return 1.0 + c3 * (t - 1.0) ** 3 + c1 * (t - 1.0) ** 2


def ease_out_bounce(t: float) -> float:
    n1, d1 = 7.5625, 2.75
    if t < 1 / d1:
        return n1 * t * t
    if t < 2 / d1:
        t -= 1.5 / d1
        return n1 * t * t + 0.75
    if t < 2.5 / d1:
        t -= 2.25 / d1
        return n1 * t * t + 0.9375
    t -= 2.625 / d1
    return n1 * t * t + 0.984375


def ease_in_out_sine(t: float) -> float:
    return -(math.cos(math.pi * t) - 1.0) / 2.0


EASINGS: dict[str, Callable[[float], float]] = {
    "linear": linear,
    "in_quad": ease_in_quad,
    "out_quad": ease_out_quad,
    "in_out_quad": ease_in_out_quad,
    "in_cubic": ease_in_cubic,
    "out_cubic": ease_out_cubic,
    "in_out_cubic": ease_in_out_cubic,
    "out_back": ease_out_back,
    "out_bounce": ease_out_bounce,
    "in_out_sine": ease_in_out_sine,
}


def _resolve(ease) -> Callable[[float], float]:
    if ease is None:
        return linear
    if callable(ease):
        return ease
    try:
        return EASINGS[ease]
    except KeyError:
        raise KeyError(
            f"unknown easing {ease!r}; known: {sorted(EASINGS)}"
        ) from None


# ---------------------------------------------------------------------------
# Scheduled work
# ---------------------------------------------------------------------------

class Timer:
    """A delayed or repeating callback."""

    __slots__ = ("delay", "callback", "repeat", "remaining", "done", "_args")

    def __init__(self, delay: float, callback: Callable, repeat: bool = False,
                 args: tuple = ()) -> None:
        self.delay = max(0.0, float(delay))
        self.callback = callback
        self.repeat = repeat
        self.remaining = self.delay
        self.done = False
        self._args = args

    def cancel(self) -> None:
        self.done = True

    def update(self, dt: float) -> None:
        if self.done:
            return
        self.remaining -= dt
        # A long dt can cover several periods; fire for each so a repeating
        # spawner does not silently lose waves on a slow frame.
        guard = 0
        while self.remaining <= 0.0 and not self.done:
            self.callback(*self._args)
            if not self.repeat:
                self.done = True
                return
            if self.delay <= 0.0:
                self.done = True
                return
            self.remaining += self.delay
            guard += 1
            if guard > 64:      # pathological dt; stop rather than hang
                self.remaining = self.delay
                return


class Tween:
    """Interpolates a value over a duration and reports it to a setter."""

    __slots__ = ("duration", "start", "end", "setter", "ease", "on_complete",
                 "elapsed", "done")

    def __init__(self, duration: float, start: float, end: float,
                 setter: Callable[[float], None], ease=None,
                 on_complete: Callable[[], None] | None = None) -> None:
        self.duration = max(0.0, float(duration))
        self.start = float(start)
        self.end = float(end)
        self.setter = setter
        self.ease = _resolve(ease)
        self.on_complete = on_complete
        self.elapsed = 0.0
        self.done = False

    @property
    def value(self) -> float:
        if self.duration <= 0.0:
            return self.end
        t = min(1.0, self.elapsed / self.duration)
        return self.start + (self.end - self.start) * self.ease(t)

    def cancel(self) -> None:
        self.done = True

    def update(self, dt: float) -> None:
        if self.done:
            return
        self.elapsed += dt
        finished = self.duration <= 0.0 or self.elapsed >= self.duration
        # Land exactly on `end` rather than wherever the last dt happened to fall.
        self.setter(self.end if finished else self.value)
        if finished:
            self.done = True
            if self.on_complete is not None:
                self.on_complete()


class Scheduler:
    """Owns timers and tweens; tick it once per fixed step."""

    def __init__(self) -> None:
        self._timers: list[Timer] = []
        self._tweens: list[Tween] = []
        self._adding: list = []
        self._ticking = False

    def after(self, delay: float, callback: Callable, *args) -> Timer:
        """Run ``callback`` once, ``delay`` seconds from now."""
        return self._add(Timer(delay, callback, repeat=False, args=args))

    def every(self, interval: float, callback: Callable, *args) -> Timer:
        """Run ``callback`` every ``interval`` seconds until cancelled."""
        return self._add(Timer(interval, callback, repeat=True, args=args))

    def tween(self, duration: float, start: float, end: float,
              setter: Callable[[float], None], ease=None,
              on_complete: Callable[[], None] | None = None) -> Tween:
        """Ease a value from ``start`` to ``end`` over ``duration`` seconds."""
        return self._add(Tween(duration, start, end, setter, ease, on_complete))

    def _add(self, item):
        # Scheduling from inside a callback must not mutate the list mid-tick.
        if self._ticking:
            self._adding.append(item)
        elif isinstance(item, Timer):
            self._timers.append(item)
        else:
            self._tweens.append(item)
        return item

    def cancel_all(self) -> None:
        for item in (*self._timers, *self._tweens):
            item.cancel()
        self._timers.clear()
        self._tweens.clear()
        self._adding.clear()

    @property
    def count(self) -> int:
        return len(self._timers) + len(self._tweens)

    def update(self, dt: float) -> None:
        self._ticking = True
        try:
            for timer in self._timers:
                timer.update(dt)
            for tween in self._tweens:
                tween.update(dt)
        finally:
            self._ticking = False

        for item in self._adding:
            if isinstance(item, Timer):
                self._timers.append(item)
            else:
                self._tweens.append(item)
        self._adding.clear()

        self._timers = [t for t in self._timers if not t.done]
        self._tweens = [t for t in self._tweens if not t.done]
