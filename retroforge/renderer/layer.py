"""TileLayer — a single scrollable background plane (BG1-BG4).

Each layer holds a reference to a ``TileMap`` and a pre-sliced tileset, plus its
own scroll registers and a parallax ``scroll_rate``. Rendering culls to the
visible tile range and emits every visible tile in one ``Surface.blits()`` call,
which runs entirely in pygame's C layer and is dramatically faster than a Python
``blit`` loop.

Flipped tile variants are looked up by OR-ing flip bits into the tile id, using
the variants the asset loader pre-generated — so the hot path never allocates.

Palette handling mirrors ``SpriteSheet``: for 8-bit indexed tilesets, each
(tile, sub-palette) pair gets its own recoloured surface, cached on the layer and
rebuilt when the palette's revision changes. That is what makes the per-tile
sub-palette attribute and whole-screen effects — fades, cross-fades, and the
colour cycling that animates water and lava — actually reach the screen.
"""

from __future__ import annotations

import pygame

from ..graphics.tilemap import EMPTY_TILE, TileMap
from ..utils.asset_loader import FLIP_H_BIT, FLIP_V_BIT
from .palette import ColorPalette

_FLIP_MASK = FLIP_H_BIT | FLIP_V_BIT


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
        # (tile_key, palette_id) -> recoloured surface
        self._variants: dict[tuple[int, int], pygame.Surface] = {}
        self._palette_token: tuple[int, int] | None = None

        #: Animated tiles: base tile id -> (frame ids, seconds per frame).
        #: Water, waterfalls, lava, torches and coin blocks are all this.
        self.animations: dict[int, tuple[list[int], float]] = {}
        self._anim_time = 0.0
        self._anim_frame: dict[int, int] = {}

    def animate(self, tile_id: int, frames: list[int], frame_time: float = 0.15) -> None:
        """Replace ``tile_id`` with a cycling sequence of tiles when drawn."""
        if not frames:
            raise ValueError("an animated tile needs at least one frame")
        self.animations[tile_id] = (list(frames), max(1e-6, float(frame_time)))

    def update(self, dt: float) -> None:
        """Advance tile animations. Call once per fixed step."""
        if not self.animations:
            return
        self._anim_time += dt
        for tile_id, (frames, frame_time) in self.animations.items():
            self._anim_frame[tile_id] = int(self._anim_time / frame_time) % len(frames)

    def _prepare(self, key: int, pal_id: int,
                 palette: ColorPalette | None) -> pygame.Surface | None:
        surf = self.tileset.get(key)
        if surf is None:
            surf = self.tileset.get(key & ~_FLIP_MASK)
        if surf is None or palette is None or surf.get_bitsize() != 8:
            return surf

        cache_key = (key, pal_id)
        cached = self._variants.get(cache_key)
        if cached is None:
            cached = surf.copy()
            cached.set_palette(palette.as_pygame_colorlist(pal_id))
            self._variants[cache_key] = cached
        return cached

    def render(self, surface: pygame.Surface, camera_x: float, camera_y: float,
               palette: ColorPalette | None = None,
               only_priority: int | None = None) -> None:
        """Blit the visible portion of the layer onto ``surface``.

        ``camera_x/y`` are the world-space top-left of the view. The layer's own
        ``scroll_rate`` scales them to produce parallax. Pass ``palette`` (for an
        indexed tileset) to honour per-tile sub-palettes and palette effects.

        ``only_priority`` draws just the tiles at that priority, which is how a
        foreground layer goes *in front of* sprites: render priority 0 and 1
        before the sprites and priority 2 after them.
        """
        if not self.visible:
            return

        if palette is not None:
            token = (palette.uid, palette.revision)
            if token != self._palette_token:
                self._palette_token = token
                self._variants.clear()

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
                if only_priority is not None and tm.priority[ty, tx] != only_priority:
                    continue

                anim = self.animations.get(tile_id)
                if anim is not None:
                    tile_id = anim[0][self._anim_frame.get(tile_id, 0)]

                key = tile_id
                if tm.flip_h[ty, tx]:
                    key |= FLIP_H_BIT
                if tm.flip_v[ty, tx]:
                    key |= FLIP_V_BIT

                pal_id = int(tm.palette[ty, tx]) if palette is not None else -1
                tile_surf = self._prepare(key, pal_id, palette)
                if tile_surf is not None:
                    blit_list.append((tile_surf, (dx, dy)))

        if blit_list:
            surface.blits(blit_list, doreturn=False)
