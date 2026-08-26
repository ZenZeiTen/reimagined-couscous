"""Camera2D — world-to-screen transform with following, bounds, and shake.

The camera position is the world-space point at the centre of the view. It can
smoothly follow a target, clamp to level bounds so the view never shows past the
edges, and apply trauma-based shake that decays over time. Background parallax is
handled by ``TileLayer.scroll_rate`` consuming the camera's top-left.
"""

from __future__ import annotations

import random

import pygame

from ..utils.vec2 import Vec2


class Camera2D:
    def __init__(self, view_w: int, view_h: int, pos: Vec2 | None = None) -> None:
        self.view_w = view_w
        self.view_h = view_h
        self.pos = pos if pos is not None else Vec2()  # centre of view, world space
        self.bounds: pygame.Rect | None = None

        self._shake_time = 0.0
        self._shake_dur = 0.0
        self._shake_mag = 0.0
        self._shake_offset = Vec2()

    # -- view geometry --------------------------------------------------------
    @property
    def top_left(self) -> Vec2:
        """World-space top-left of the view, including shake and clamping."""
        tl = Vec2(self.pos.x - self.view_w / 2, self.pos.y - self.view_h / 2)
        tl = tl + self._shake_offset
        if self.bounds is not None:
            tl = Vec2(
                _clamp_axis(tl.x, self.bounds.left, self.bounds.width, self.view_w),
                _clamp_axis(tl.y, self.bounds.top, self.bounds.height, self.view_h),
            )
        return tl

    def world_to_screen(self, world: Vec2) -> Vec2:
        tl = self.top_left
        return Vec2(world.x - tl.x, world.y - tl.y)

    def screen_to_world(self, screen: Vec2) -> Vec2:
        tl = self.top_left
        return Vec2(screen.x + tl.x, screen.y + tl.y)

    # -- behaviour ------------------------------------------------------------
    def follow(self, target: Vec2, lerp_speed: float, dt: float) -> None:
        """Ease the camera toward ``target`` (a world point to centre on)."""
        t = min(1.0, lerp_speed * dt)
        self.pos = self.pos.lerp(target, t)

    def snap_to(self, target: Vec2) -> None:
        self.pos = target.copy()

    def shake(self, magnitude: float, duration: float) -> None:
        self._shake_mag = magnitude
        self._shake_dur = duration
        self._shake_time = duration

    def update(self, dt: float) -> None:
        if self._shake_time > 0.0:
            self._shake_time = max(0.0, self._shake_time - dt)
            falloff = self._shake_time / self._shake_dur if self._shake_dur else 0.0
            amp = self._shake_mag * falloff
            self._shake_offset = Vec2(
                random.uniform(-amp, amp), random.uniform(-amp, amp)
            )
        else:
            self._shake_offset = Vec2()


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def _clamp_axis(value: float, origin: float, extent: float, view: float) -> float:
    """Keep the view inside the level on one axis.

    When the level is smaller than the view there is nothing to scroll, so the
    level is centred rather than pinned to its top-left corner with all the
    empty space on one side.
    """
    if extent <= view:
        return origin - (view - extent) / 2.0
    return _clamp(value, origin, origin + extent - view)
