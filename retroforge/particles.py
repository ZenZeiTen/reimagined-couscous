"""Particles — pooled, numpy-backed sparks, dust, and debris.

Every 16-bit game threw a handful of pixels at the screen on impact: coins burst,
enemies puffed, footfalls kicked up dust. The effect is cheap only if the
particles are, so this is a fixed-capacity pool of parallel numpy arrays — the
same data-oriented shape as ``TileMap`` and ``ColorPalette`` — rather than a list
of objects. Ageing and integrating a few thousand particles is then a handful of
vectorised operations, and drawing is one batched ``Surface.blits``.

The pool never allocates after construction. When it is full, ``emit`` quietly
drops the excess, which is what you want in a game: a dropped spark is invisible,
a frame-time spike is not.

    sparks = ParticleSystem(512)
    sparks.burst(x, y, count=12, speed=(40, 90), life=(0.3, 0.6),
                 colors=[(255, 220, 0), (255, 140, 0)])
    ...
    sparks.update(dt)
    sparks.draw(renderer.target, camera)
"""

from __future__ import annotations

import math
import random

import numpy as np
import pygame

RGB = tuple[int, int, int]

DEFAULT_COLORS: tuple[RGB, ...] = ((255, 255, 255),)


class ParticleSystem:
    """A fixed-capacity particle pool."""

    def __init__(self, capacity: int = 256, *, gravity: float = 0.0,
                 drag: float = 0.0, seed: int | None = None) -> None:
        self.capacity = int(capacity)
        self.gravity = gravity
        #: Fraction of velocity shed per second, 0 for none.
        self.drag = drag

        n = self.capacity
        self._x = np.zeros(n, dtype=np.float32)
        self._y = np.zeros(n, dtype=np.float32)
        self._vx = np.zeros(n, dtype=np.float32)
        self._vy = np.zeros(n, dtype=np.float32)
        self._life = np.zeros(n, dtype=np.float32)      # seconds remaining
        self._max_life = np.ones(n, dtype=np.float32)
        self._size = np.ones(n, dtype=np.int16)
        self._color = np.zeros((n, 3), dtype=np.uint8)
        self._alive = np.zeros(n, dtype=bool)

        self._rng = random.Random(seed)
        self._surfaces: dict[tuple[RGB, int], pygame.Surface] = {}

    # -- state ----------------------------------------------------------------
    @property
    def count(self) -> int:
        """How many particles are currently alive."""
        return int(self._alive.sum())

    def clear(self) -> None:
        self._alive[:] = False

    def __len__(self) -> int:
        return self.count

    # -- emission -------------------------------------------------------------
    def emit(
        self,
        x: float,
        y: float,
        *,
        count: int = 1,
        angle: tuple[float, float] = (0.0, 2.0 * math.pi),
        speed: tuple[float, float] = (20.0, 60.0),
        life: tuple[float, float] = (0.3, 0.7),
        size: tuple[int, int] = (1, 1),
        colors: tuple[RGB, ...] | list[RGB] = DEFAULT_COLORS,
        spread: float = 0.0,
    ) -> int:
        """Spawn up to ``count`` particles. Returns how many were actually made.

        ``angle`` is a radian range (screen space, y down), ``spread`` scatters
        the starting position within that radius. Ranges are (min, max) pairs and
        each particle draws uniformly from them, which is what gives a burst its
        variety without any per-particle bookkeeping.
        """
        free = np.flatnonzero(~self._alive)
        if free.size == 0:
            return 0
        made = min(int(count), free.size)
        idx = free[:made]
        rng = self._rng

        angles = np.array([rng.uniform(*angle) for _ in range(made)],
                          dtype=np.float32)
        speeds = np.array([rng.uniform(*speed) for _ in range(made)],
                          dtype=np.float32)
        lives = np.array([rng.uniform(*life) for _ in range(made)],
                         dtype=np.float32)

        self._x[idx] = x
        self._y[idx] = y
        if spread > 0.0:
            offs = np.array([rng.uniform(0.0, spread) for _ in range(made)],
                            dtype=np.float32)
            self._x[idx] += np.cos(angles) * offs
            self._y[idx] += np.sin(angles) * offs

        self._vx[idx] = np.cos(angles) * speeds
        self._vy[idx] = np.sin(angles) * speeds
        self._life[idx] = lives
        self._max_life[idx] = np.maximum(lives, 1e-6)
        self._size[idx] = [rng.randint(*size) for _ in range(made)]
        palette = list(colors) or list(DEFAULT_COLORS)
        self._color[idx] = [palette[rng.randrange(len(palette))]
                            for _ in range(made)]
        self._alive[idx] = True
        return made

    def burst(self, x: float, y: float, **kwargs) -> int:
        """An outward puff in every direction — impacts, pickups, explosions."""
        kwargs.setdefault("count", 12)
        return self.emit(x, y, **kwargs)

    def spray(self, x: float, y: float, direction: float, *,
              cone: float = math.pi / 6, **kwargs) -> int:
        """A directional jet — dust from running feet, an engine's exhaust."""
        kwargs["angle"] = (direction - cone, direction + cone)
        kwargs.setdefault("count", 4)
        return self.emit(x, y, **kwargs)

    # -- simulation -----------------------------------------------------------
    def update(self, dt: float) -> None:
        """Age and integrate every live particle in one vectorised pass."""
        alive = self._alive
        if not alive.any():
            return

        self._life[alive] -= dt
        expired = alive & (self._life <= 0.0)
        if expired.any():
            self._alive[expired] = False
            alive = self._alive
            if not alive.any():
                return

        if self.gravity:
            self._vy[alive] += self.gravity * dt
        if self.drag:
            keep = max(0.0, 1.0 - self.drag * dt)
            self._vx[alive] *= keep
            self._vy[alive] *= keep

        self._x[alive] += self._vx[alive] * dt
        self._y[alive] += self._vy[alive] * dt

    # -- drawing --------------------------------------------------------------
    def _chip(self, color: RGB, size: int) -> pygame.Surface:
        key = (color, size)
        surf = self._surfaces.get(key)
        if surf is None:
            surf = pygame.Surface((size, size))
            surf.fill(color)
            self._surfaces[key] = surf
        return surf

    def draw(self, surface: pygame.Surface, camera=None) -> None:
        """Blit every live particle in a single batched call."""
        alive = np.flatnonzero(self._alive)
        if alive.size == 0:
            return

        cx, cy = _camera_offset(camera)
        xs = self._x[alive] - cx
        ys = self._y[alive] - cy
        sizes = self._size[alive]
        colors = self._color[alive]

        blits: list[tuple[pygame.Surface, tuple[int, int]]] = []
        for i in range(alive.size):
            size = int(sizes[i])
            chip = self._chip((int(colors[i, 0]), int(colors[i, 1]),
                               int(colors[i, 2])), size)
            blits.append((chip, (int(xs[i]), int(ys[i]))))
        surface.blits(blits, doreturn=False)


def _camera_offset(camera) -> tuple[float, float]:
    if camera is None:
        return 0.0, 0.0
    if isinstance(camera, tuple):
        return float(camera[0]), float(camera[1])
    top_left = getattr(camera, "top_left", None)
    if top_left is not None:
        return float(top_left.x), float(top_left.y)
    return 0.0, 0.0
