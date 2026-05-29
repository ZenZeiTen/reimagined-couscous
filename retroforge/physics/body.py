"""RigidBody2D — an axis-aligned moving body for tile-based physics.

The body is an AABB with a velocity and gravity scale. A sub-pixel ``_remainder``
accumulator carries the fractional part of each frame's motion so that bodies
moving at fractional speeds (e.g. 1.5 px/frame) advance smoothly instead of
jittering between 1 and 2 pixels — the same reason hardware integrated motion in
fixed-point.

Collision resolution itself lives in ``collision.py``; the body just holds state
and exposes its rect.
"""

from __future__ import annotations

import pygame

from ..utils.vec2 import Vec2


class RigidBody2D:
    def __init__(self, pos: Vec2, size: Vec2, *, gravity_scale: float = 1.0) -> None:
        self.pos = pos            # world top-left
        self.size = size          # AABB extents (w, h)
        self.vel = Vec2()         # pixels per second
        self.gravity_scale = gravity_scale

        self.grounded = False
        self.on_ceiling = False
        self.on_wall = False

        self._remainder = Vec2()

    @property
    def rect(self) -> pygame.Rect:
        return pygame.Rect(int(self.pos.x), int(self.pos.y),
                           int(self.size.x), int(self.size.y))

    @property
    def center(self) -> Vec2:
        return Vec2(self.pos.x + self.size.x / 2, self.pos.y + self.size.y / 2)

    def consume_motion(self, dt: float) -> tuple[int, int]:
        """Advance the sub-pixel accumulator and return whole-pixel motion.

        Returns the integer (dx, dy) to move this frame; fractional remainder is
        carried to the next frame.
        """
        self._remainder.x += self.vel.x * dt
        self._remainder.y += self.vel.y * dt
        dx = int(self._remainder.x)
        dy = int(self._remainder.y)
        self._remainder.x -= dx
        self._remainder.y -= dy
        return dx, dy
