"""TileLayer — a single scrollable background plane (BG1-BG4).

Each layer holds a reference to a ``TileMap`` and a pre-sliced tileset, plus its
own scroll registers and a parallax ``scroll_rate``. Rendering culls to the
visible tile range and emits every visible tile in one ``Surface.blits()`` call,
which runs entirely in pygame's C layer and is dramatically faster than a Python
``blit`` loop.

Flipped tile variants are looked up by OR-ing flip bits into the tile id, using
the variants the asset loader pre-generated — so the hot path never allocates.
"""

from __future__ import annotations

import pygame

from ..graphics.tilemap import EMPTY_TILE, TileMap
from ..utils.asset_loader import FLIP_H_BIT, FLIP_V_BIT


class TileLayer:
    def __init__(
        self,
        tilemap: TileMap,
        tileset: dict[int, pygame.Surface],
        *,
        scroll_rate: float = 1.0,
        priority: int = 1,
        visible: bool = True,
        wrap_x: bool = False,
        wrap_y: bool = False,
    ) -> None:
        self.tilemap = tilemap
        self.tileset = tileset
        self.scroll_x = 0.0
        self.scroll_y = 0.0
        self.scroll_rate = scroll_rate  # parallax multiplier (0..1 typical)
        self.priority = priority
        self.visible = visible
        self.wrap_x = wrap_x
        self.wrap_y = wrap_y

    def render(self, surface: pygame.Surface, camera_x: float, camera_y: float) -> None:
        """Blit the visible portion of the layer onto ``surface``.

        ``camera_x/y`` are the world-space top-left of the view. The layer's own
        ``scroll_rate`` scales them to produce parallax.
        """
        if not self.visible:
            return

        tm = self.tilemap
        tw, th = tm.tile_w, tm.tile_h
        view_w, view_h = surface.get_size()

        # Effective scroll for this layer (parallax + manual scroll registers).
        ox = camera_x * self.scroll_rate + self.scroll_x
        oy = camera_y * self.scroll_rate + self.scroll_y

        # First visible tile and the sub-tile pixel offset for smooth scrolling.
        start_tx = int(ox // tw)
        start_ty = int(oy // th)
        offset_x = -int(ox % tw)
        offset_y = -int(oy % th)

        cols = view_w // tw + 2
        rows = view_h // th + 2

        blit_list: list[tuple[pygame.Surface, tuple[int, int]]] = []
        for row in range(rows):
            ty = start_ty + row
            dy = offset_y + row * th
            for col in range(cols):
                tx = start_tx + col
                dx = offset_x + col * tw

                if self.wrap_x:
                    tx %= tm.width
                if self.wrap_y:
                    ty %= tm.height
                if not tm.in_bounds(tx, ty):
                    continue

                tile_id = int(tm.tiles[ty, tx])
                if tile_id == EMPTY_TILE:
                    continue

                key = tile_id
                if tm.flip_h[ty, tx]:
                    key |= FLIP_H_BIT
                if tm.flip_v[ty, tx]:
                    key |= FLIP_V_BIT

                tile_surf = self.tileset.get(key) or self.tileset.get(tile_id)
                if tile_surf is not None:
                    blit_list.append((tile_surf, (dx, dy)))

        if blit_list:
            surface.blits(blit_list, doreturn=False)
