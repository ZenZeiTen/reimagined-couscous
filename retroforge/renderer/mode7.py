"""Mode7 — perspective-projected background plane.

This reproduces the SNES "Mode 7" effect: a single tiled texture transformed
into a ground plane that recedes toward a horizon, the trick behind F-Zero
tracks, Mario Kart courses, and rotating world maps.

Each scanline below the horizon samples the source texture at a depth-dependent
scale: rows near the horizon cover a lot of world distance (far away), rows near
the bottom cover little (close up). The per-scanline sampling coordinates are
computed with numpy across the whole row at once, and the source is gathered
with advanced indexing, so a full-screen transform stays within a 60Hz budget.

The source surface must be 24-bit RGB so ``surfarray.pixels3d`` yields a
contiguous ``(w, h, 3)`` array.
"""

from __future__ import annotations

import math

import numpy as np
import pygame

from ..utils.vec2 import Vec2


class Mode7:
    def __init__(self, source: pygame.Surface) -> None:
        # Store the source as a contiguous RGB array indexed [x, y, channel].
        if source.get_bitsize() != 24:
            source = source.convert(24)
        self._src = source
        self._src_rgb = pygame.surfarray.array3d(source)  # (w, h, 3) copy, safe
        self._src_w, self._src_h = source.get_size()

        # Transform parameters.
        self.angle = 0.0          # rotation in radians
        self.scale = 1.0          # overall zoom (larger = closer/bigger texels)
        self.pivot = Vec2(self._src_w / 2, self._src_h / 2)
        self.horizon = 0          # screen y where the plane begins
        self.cam_height = 64.0    # higher = flatter/farther horizon
        self.fov = 100.0          # depth scaling constant

    def render(self, dest: pygame.Surface, *, wrap: bool = True) -> None:
        """Render the projected plane into ``dest`` from ``horizon`` downward."""
        dest_w, dest_h = dest.get_size()
        y0 = max(0, self.horizon)
        if y0 >= dest_h:
            return
        rows = dest_h - y0

        # Per-row depth: distance increases as we approach the horizon.
        screen_y = np.arange(rows, dtype=np.float32) + 1.0  # avoid /0 at horizon
        depth = (self.cam_height * self.fov) / (screen_y * self.scale)  # (rows,)

        # Horizontal sample positions across the row, centred on screen middle.
        px = np.arange(dest_w, dtype=np.float32) - dest_w / 2.0  # (cols,)

        cos_a = math.cos(self.angle)
        sin_a = math.sin(self.angle)

        # Broadcast: for each (row, col) compute a world space sample.
        # world_x scales with depth (perspective), then rotates.
        depth_col = depth[:, None]            # (rows, 1)
        px_row = px[None, :]                  # (1, cols)

        world_x = px_row * depth_col / self.fov
        world_y = depth_col

        src_x = (self.pivot.x + world_x * cos_a - world_y * sin_a)
        src_y = (self.pivot.y + world_x * sin_a + world_y * cos_a)

        sx = src_x.astype(np.int32)
        sy = src_y.astype(np.int32)

        if wrap:
            sx %= self._src_w
            sy %= self._src_h
            valid = np.ones_like(sx, dtype=bool)
        else:
            valid = (sx >= 0) & (sx < self._src_w) & (sy >= 0) & (sy < self._src_h)
            sx = np.clip(sx, 0, self._src_w - 1)
            sy = np.clip(sy, 0, self._src_h - 1)

        # Gather source pixels: result shape (rows, cols, 3).
        sampled = self._src_rgb[sx, sy]

        # Build the destination block as (w, h, 3) for surfarray, so transpose.
        block = np.transpose(sampled, (1, 0, 2))  # (cols, rows, 3)
        if not wrap:
            block = block * np.transpose(valid, (1, 0))[..., None]

        strip = pygame.Surface((dest_w, rows))
        pygame.surfarray.blit_array(strip, block.astype(np.uint8))
        dest.blit(strip, (0, y0))
