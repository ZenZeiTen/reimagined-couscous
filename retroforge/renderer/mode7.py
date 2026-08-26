"""Mode7 — perspective-projected background plane.

This reproduces the SNES "Mode 7" effect: a single tiled texture transformed
into a ground plane that recedes toward a horizon, the trick behind F-Zero
tracks, Mario Kart courses, and rotating world maps.

Each scanline below the horizon samples the source texture at a depth-dependent
scale: rows near the horizon cover a lot of world distance (far away), rows near
the bottom cover little (close up). The per-scanline sampling coordinates are
computed with numpy across the whole row at once, and the source is gathered
with advanced indexing, so a full-screen transform stays within a 60Hz budget.

Camera convention
-----------------
``angle`` is the *camera's heading*, so the ground counter-rotates beneath it:
turn the camera right and the world swings left, which is what makes steering
feel like steering rather than strafing. At any heading the camera looks along

    forward = (sin(angle), cos(angle))

in texture space, and screen-right is ``(cos(angle), -sin(angle))``. Advance a
racer with ``pos += forward * speed * dt`` and whatever was ahead of it stays in
the centre of the screen.

Source pixels are copied into a ``(width, height, 3)`` uint8 array at load, so
any surface depth works and the caller keeps ownership of their surface. Write
to ``mode7.pixels`` to animate the ground, or call ``refresh_from_surface`` after
drawing onto the original.
"""

from __future__ import annotations

import math

import numpy as np
import pygame

from ..utils.vec2 import Vec2


class Mode7:
    def __init__(self, source: pygame.Surface) -> None:
        self.set_source(source)

        # Transform parameters.
        self.angle = 0.0          # camera heading in radians
        self.scale = 1.0          # overall zoom (larger = closer/bigger texels)
        self.pivot = Vec2(self._src_w / 2, self._src_h / 2)
        self.horizon = 0          # screen y where the plane begins
        self.cam_height = 64.0    # higher = flatter/farther horizon
        self.fov = 100.0          # depth scaling constant

        # Pre-allocated render strip — avoids per-frame surface allocation.
        self._strip: pygame.Surface | None = None
        self._strip_size: tuple[int, int] = (0, 0)
        self._strip_alpha = False

    # -- source pixels --------------------------------------------------------
    def set_source(self, source: pygame.Surface) -> None:
        """Replace the ground texture, copying its pixels into the sample array."""
        self._src = source
        self._src_w, self._src_h = source.get_size()
        self.refresh_from_surface()

    @property
    def pixels(self) -> np.ndarray:
        """The live ``(width, height, 3)`` uint8 sample array.

        Write to it directly to animate the ground — that is how the lane
        markers in the racer demo pulse. Changes take effect on the next render;
        nothing needs to be flushed. Note the width-first axis order.
        """
        return self._src_rgb

    def refresh_from_surface(self) -> None:
        """Re-read pixels from the source surface after drawing onto it.

        ``array3d`` copies and normalises to RGB whatever the surface's depth is,
        so any format works and the caller keeps ownership of their surface.
        """
        self._src_rgb = np.ascontiguousarray(pygame.surfarray.array3d(self._src))

    @property
    def source_size(self) -> tuple[int, int]:
        return self._src_w, self._src_h

    def forward(self) -> Vec2:
        """Unit heading vector in texture space; move the camera along this."""
        return Vec2(math.sin(self.angle), math.cos(self.angle))

    def right(self) -> Vec2:
        """Unit screen-right vector in texture space."""
        return Vec2(math.cos(self.angle), -math.sin(self.angle))

    # -- rendering ------------------------------------------------------------
    def render(self, dest: pygame.Surface, *, wrap: bool = True) -> None:
        """Render the projected plane into ``dest`` from ``horizon`` downward.

        With ``wrap`` the texture tiles infinitely. Without it, ground beyond the
        texture edge is left transparent so whatever is already on ``dest`` — the
        sky, a horizon haze — shows through instead of being painted black.
        """
        dest_w, dest_h = dest.get_size()
        y0 = max(0, self.horizon)
        if y0 >= dest_h or dest_w <= 0:
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
        # world_x scales with depth (perspective); world_y is the depth itself.
        depth_col = depth[:, None]            # (rows, 1)
        px_row = px[None, :]                  # (1, cols)

        world_x = px_row * depth_col / self.fov
        world_y = depth_col

        # Rotate by -angle: the camera turns, so the ground turns the other way.
        # This is what puts forward = (sin a, cos a) at the centre of the screen.
        src_x = self.pivot.x + world_x * cos_a + world_y * sin_a
        src_y = self.pivot.y - world_x * sin_a + world_y * cos_a

        sx = src_x.astype(np.int32)
        sy = src_y.astype(np.int32)

        valid = None
        if wrap:
            sx %= self._src_w
            sy %= self._src_h
        else:
            valid = (sx >= 0) & (sx < self._src_w) & (sy >= 0) & (sy < self._src_h)
            if not valid.any():
                return
            np.clip(sx, 0, self._src_w - 1, out=sx)
            np.clip(sy, 0, self._src_h - 1, out=sy)

        # Gather source pixels: result shape (rows, cols, 3).
        sampled = self._src_rgb[sx, sy]

        # Build the destination block as (w, h, 3) for surfarray, so transpose.
        # ascontiguousarray forces C-contiguous layout after the view-creating
        # transpose — required for blit_array's row-major pixel scan.
        block = np.ascontiguousarray(np.transpose(sampled, (1, 0, 2)))

        need_alpha = valid is not None
        if self._strip_size != (dest_w, rows) or self._strip_alpha != need_alpha:
            self._strip = pygame.Surface(
                (dest_w, rows), pygame.SRCALPHA if need_alpha else 0
            )
            self._strip_size = (dest_w, rows)
            self._strip_alpha = need_alpha
        strip = self._strip
        assert strip is not None

        if need_alpha:
            rgb = pygame.surfarray.pixels3d(strip)
            rgb[:] = block
            del rgb                        # release the lock before touching alpha
            alpha = pygame.surfarray.pixels_alpha(strip)
            alpha[:] = np.ascontiguousarray(np.transpose(valid, (1, 0))) * np.uint8(255)
            del alpha
        else:
            pygame.surfarray.blit_array(strip, block)

        dest.blit(strip, (0, y0))
