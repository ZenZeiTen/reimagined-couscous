"""RigidBody2D — an axis-aligned moving body for tile-based physics.

The body is an AABB with a velocity and gravity scale. A sub-pixel ``_remainder``
accumulator carries the fractional part of each frame's motion so that bodies
moving at fractional speeds (e.g. 1.5 px/frame) advance smoothly instead of
jittering between 1 and 2 pixels — the same reason hardware integrated motion in
fixed-point.

Bodies also carry the vocabulary entity collision needs: a ``layer`` they belong
to, a ``mask`` of layers they care about, and optional named hitboxes offset from
the body (a sword arc, a hurtbox smaller than the sprite). Collision resolution
itself lives in ``collision.py``.
"""

from __future__ import annotations

import math

import pygame

from ..utils.vec2 import Vec2


class Layer:
    """Conventional collision layer bits. Combine them freely.

    These are only defaults — ``layer`` and ``mask`` are plain ints, so a game
    can define its own scheme.
    """

    NONE = 0
    PLAYER = 1 << 0
    ENEMY = 1 << 1
    PLAYER_SHOT = 1 << 2
    ENEMY_SHOT = 1 << 3
    PICKUP = 1 << 4
    TRIGGER = 1 << 5
    ALL = 0xFFFF


class RigidBody2D:
    def __init__(
        self,
        pos: Vec2,
        size: Vec2,
        *,
        gravity_scale: float = 1.0,
        layer: int = Layer.NONE,
        mask: int = Layer.ALL,
    ) -> None:
        self.pos = pos            # world top-left
        self.size = size          # AABB extents (w, h)
        self.vel = Vec2()         # pixels per second
        self.gravity_scale = gravity_scale

        self.grounded = False
        self.on_ceiling = False
        self.on_wall = False
        #: True while the body is dropping through a one-way platform.
        self.drop_through = False
        self.active = True

        self.layer = layer
        self.mask = mask
        #: name -> (dx, dy, w, h) offsets from the body's top-left. Flipped
        #: horizontally with the body when ``facing`` is -1.
        self.hitboxes: dict[str, tuple[int, int, int, int]] = {}
        self.facing = 1

        #: Position at the start of the last move_and_slide, for swept tests.
        self.prev_pos = pos.copy()
        self._remainder = Vec2()

    @property
    def rect(self) -> pygame.Rect:
        return pygame.Rect(math.floor(self.pos.x), math.floor(self.pos.y),
                           int(self.size.x), int(self.size.y))

    @property
    def center(self) -> Vec2:
        return Vec2(self.pos.x + self.size.x / 2, self.pos.y + self.size.y / 2)

    @property
    def bottom(self) -> float:
        return self.pos.y + self.size.y

    @property
    def right(self) -> float:
        return self.pos.x + self.size.x

    def hitbox(self, name: str) -> pygame.Rect:
        """A named hitbox in world space, mirrored when the body faces left."""
        dx, dy, w, h = self.hitboxes[name]
        if self.facing < 0:
            dx = int(self.size.x) - dx - w
        return pygame.Rect(math.floor(self.pos.x) + dx,
                           math.floor(self.pos.y) + dy, w, h)

    def teleport(self, pos: Vec2) -> None:
        """Move without carrying sub-pixel motion or stale swept history."""
        self.pos = pos.copy()
        self.prev_pos = pos.copy()
        self._remainder = Vec2()

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
