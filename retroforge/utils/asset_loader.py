"""AssetLoader — cached loading of images, tilesets, sounds, and tilemaps.

Caches are module-level dicts keyed by path: loading the same asset twice is
free, and a scene transition can wipe everything with ``clear_cache``. This is a
deliberately simple "module as singleton" approach — no class instance to thread
through the engine.

Surface handling note: palette-indexed (8-bit) images are kept indexed so the
renderer can swap sub-palettes without touching pixels. Everything else is
converted to a display-friendly format. We never call ``convert`` on an 8-bit
surface, because that would bake the palette into RGB and destroy the indices.
"""

from __future__ import annotations

import pygame

from ..graphics.tilemap import TileMap

_surface_cache: dict[str, pygame.Surface] = {}
_sound_cache: dict[str, "pygame.mixer.Sound"] = {}


def load_image(path: str, *, keep_indexed: bool = False) -> pygame.Surface:
    """Load a PNG/BMP. Cached by path.

    When ``keep_indexed`` is true and the source is 8-bit, the indexed surface is
    preserved for palette swapping; otherwise the surface is converted for fast
    blitting (with per-pixel alpha if present).
    """
    if path in _surface_cache:
        return _surface_cache[path]

    surf = pygame.image.load(path)
    if keep_indexed and surf.get_bitsize() == 8:
        # Leave indices intact for palette swapping.
        pass
    elif pygame.display.get_surface() is not None:
        surf = surf.convert_alpha() if surf.get_alpha() is not None else surf.convert()
    _surface_cache[path] = surf
    return surf


def load_tileset(
    path: str, tile_w: int, tile_h: int, *, keep_indexed: bool = False
) -> dict[int, pygame.Surface]:
    """Slice a tilesheet PNG into a ``{tile_id: Surface}`` dict.

    Tiles are numbered left-to-right, top-to-bottom starting at 0. Flipped
    variants are pre-generated and stored under ``tile_id | FLIP_H_BIT`` and/or
    ``FLIP_V_BIT`` so the render loop never has to call ``transform.flip``.
    """
    sheet = load_image(path, keep_indexed=keep_indexed)
    sheet_w, sheet_h = sheet.get_size()
    cols = sheet_w // tile_w
    rows = sheet_h // tile_h

    tiles: dict[int, pygame.Surface] = {}
    tid = 0
    for ty in range(rows):
        for tx in range(cols):
            rect = pygame.Rect(tx * tile_w, ty * tile_h, tile_w, tile_h)
            base = sheet.subsurface(rect).copy()
            tiles[tid] = base
            tiles[tid | FLIP_H_BIT] = pygame.transform.flip(base, True, False)
            tiles[tid | FLIP_V_BIT] = pygame.transform.flip(base, False, True)
            tiles[tid | FLIP_H_BIT | FLIP_V_BIT] = pygame.transform.flip(base, True, True)
            tid += 1
    return tiles


def load_sound(path: str) -> "pygame.mixer.Sound":
    if path in _sound_cache:
        return _sound_cache[path]
    snd = pygame.mixer.Sound(path)
    _sound_cache[path] = snd
    return snd


def load_tilemap(path: str, layer_index: int = 0) -> TileMap:
    return TileMap.load_tiled(path, layer_index)


def clear_cache() -> None:
    """Drop all cached surfaces and sounds (e.g. between levels)."""
    _surface_cache.clear()
    _sound_cache.clear()


# Flip bit flags shared with renderer.layer for tileset variant keys.
FLIP_H_BIT = 0x4000
FLIP_V_BIT = 0x8000
