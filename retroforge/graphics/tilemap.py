"""TileMap — the background/level data model.

Tiles are stored in parallel numpy arrays (one per attribute) rather than a list
of Python objects. This keeps collision range-queries and rendering visibility
culling vectorised, and makes the common ``is_solid`` lookup a single array
index. A lightweight ``TileData`` view is materialised only when a caller asks
for one tile.

The Tiled (https://www.mapeditor.org/) JSON export format is supported directly
so levels can be authored in a real editor. Tiled uses 1-based global tile IDs
with 0 meaning "empty"; on import we subtract 1 and store -1 for empty so numpy
comparisons stay clean.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

EMPTY_TILE = -1

# Tiled stores horizontal/vertical/diagonal flip in the top 3 bits of the GID.
_FLIP_H = 0x80000000
_FLIP_V = 0x40000000
_FLIP_D = 0x20000000
_GID_MASK = 0x1FFFFFFF


@dataclass
class TileData:
    """A materialised view of a single tile's attributes."""

    tile_id: int
    palette_id: int = 0
    flip_h: bool = False
    flip_v: bool = False
    solid: bool = False
    priority: int = 1  # 0 = behind sprites, 1 = normal, 2 = above sprites

    @property
    def is_empty(self) -> bool:
        return self.tile_id == EMPTY_TILE


class TileMap:
    """A grid of tiles with attribute planes stored as numpy arrays."""

    def __init__(self, width: int, height: int, tile_w: int = 16, tile_h: int = 16) -> None:
        self.width = width
        self.height = height
        self.tile_w = tile_w
        self.tile_h = tile_h
        # Attribute planes, shape (height, width).
        self.tiles = np.full((height, width), EMPTY_TILE, dtype=np.int16)
        self.palette = np.zeros((height, width), dtype=np.uint8)
        self.flip_h = np.zeros((height, width), dtype=bool)
        self.flip_v = np.zeros((height, width), dtype=bool)
        self.solid = np.zeros((height, width), dtype=bool)
        self.priority = np.ones((height, width), dtype=np.uint8)

    # -- pixel dimensions -----------------------------------------------------
    @property
    def pixel_width(self) -> int:
        return self.width * self.tile_w

    @property
    def pixel_height(self) -> int:
        return self.height * self.tile_h

    # -- bounds-checked queries -----------------------------------------------
    def in_bounds(self, tx: int, ty: int) -> bool:
        return 0 <= tx < self.width and 0 <= ty < self.height

    def get_tile(self, tx: int, ty: int) -> TileData:
        if not self.in_bounds(tx, ty):
            return TileData(EMPTY_TILE)
        return TileData(
            tile_id=int(self.tiles[ty, tx]),
            palette_id=int(self.palette[ty, tx]),
            flip_h=bool(self.flip_h[ty, tx]),
            flip_v=bool(self.flip_v[ty, tx]),
            solid=bool(self.solid[ty, tx]),
            priority=int(self.priority[ty, tx]),
        )

    def is_solid(self, tx: int, ty: int) -> bool:
        """Cheap solidity test. Out-of-bounds is treated as solid (a wall)."""
        if not self.in_bounds(tx, ty):
            return True
        return bool(self.solid[ty, tx])

    def set_tile(
        self,
        tx: int,
        ty: int,
        tile_id: int,
        *,
        palette_id: int = 0,
        flip_h: bool = False,
        flip_v: bool = False,
        solid: bool = False,
        priority: int = 1,
    ) -> None:
        if not self.in_bounds(tx, ty):
            return
        self.tiles[ty, tx] = tile_id
        self.palette[ty, tx] = palette_id
        self.flip_h[ty, tx] = flip_h
        self.flip_v[ty, tx] = flip_v
        self.solid[ty, tx] = solid
        self.priority[ty, tx] = priority

    def fill_solid_from_tiles(self, solid_ids: set[int]) -> None:
        """Mark every tile whose id is in ``solid_ids`` as solid."""
        mask = np.isin(self.tiles, list(solid_ids))
        self.solid |= mask

    # -- Tiled import ---------------------------------------------------------
    @classmethod
    def from_tiled_json(cls, data: dict, layer_index: int = 0) -> "TileMap":
        """Build a TileMap from parsed Tiled JSON map data.

        Reads the requested tile layer (0 = first/BG1). Flip flags encoded in the
        GID high bits are decoded into the flip planes.
        """
        width = int(data["width"])
        height = int(data["height"])
        tile_w = int(data.get("tilewidth", 16))
        tile_h = int(data.get("tileheight", 16))

        tile_layers = [ly for ly in data.get("layers", []) if ly.get("type") == "tilelayer"]
        if not tile_layers:
            raise ValueError("Tiled map contains no tile layers")
        layer = tile_layers[layer_index]

        tmap = cls(width, height, tile_w, tile_h)
        raw = np.asarray(layer["data"], dtype=np.uint32).reshape((height, width))

        gid = raw & _GID_MASK
        tmap.flip_h = (raw & _FLIP_H) != 0
        tmap.flip_v = (raw & _FLIP_V) != 0
        # Diagonal flip is rare in 2D engines; fold it into H-flip so the tile is
        # at least not dropped silently.
        tmap.flip_h |= (raw & _FLIP_D) != 0

        # Tiled is 1-based; 0 = empty. Convert to 0-based with -1 for empty.
        tile_ids = gid.astype(np.int32) - 1
        tmap.tiles = tile_ids.astype(np.int16)

        # Optional custom collision: a property ``solid`` on the layer, or a
        # second "collision" tile layer where any non-empty tile is solid.
        for ly in tile_layers:
            if ly.get("name", "").lower() == "collision":
                coll = np.asarray(ly["data"], dtype=np.uint32).reshape((height, width))
                tmap.solid = (coll & _GID_MASK) != 0
                break

        return tmap

    @classmethod
    def load_tiled(cls, path: str, layer_index: int = 0) -> "TileMap":
        with open(path, "r", encoding="utf-8") as fh:
            return cls.from_tiled_json(json.load(fh), layer_index)
