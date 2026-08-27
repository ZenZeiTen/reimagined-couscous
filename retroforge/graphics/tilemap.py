"""TileMap — the background/level data model.

Tiles are stored in parallel numpy arrays (one per attribute) rather than a list
of Python objects. This keeps collision range-queries and rendering visibility
culling vectorised, and makes the common ``is_solid`` lookup a single array
index. A lightweight ``TileData`` view is materialised only when a caller asks
for one tile.

Tiled import
------------
The Tiled (https://www.mapeditor.org/) JSON export is read directly so levels
can be authored in a real editor. Tiled has more than one way to write the same
map and a loader that only handles one of them is a loader that fails on most
real files, so all of them are supported:

* **Layer encodings** — plain CSV arrays *and* base64, with no compression, zlib,
  or gzip. Base64+zlib is Tiled's default, so this is the common case, not the
  exotic one.
* **firstgid** — global tile IDs are offset by the owning tileset's ``firstgid``,
  which is only 1 when the map has a single tileset that was added first.
* **Object layers** — spawn points, triggers, and regions are kept in
  ``TileMap.objects`` instead of being dropped.
* **Infinite maps** — chunked layer data is stitched into the map's bounds.

Tiled uses 1-based global tile IDs with 0 meaning "empty"; on import IDs become
0-based within their tileset and empty becomes -1, so numpy comparisons stay
clean.
"""

from __future__ import annotations

import base64
import gzip
import json
import zlib
from dataclasses import dataclass, field
from typing import Any

import numpy as np

EMPTY_TILE = -1

#: Slope shapes, as the surface height at the tile's left and right edges given
#: as a fraction of tile height (0.0 = tile top, 1.0 = tile bottom). The set
#: matches what 16-bit platformers actually used: two 45-degree ramps and the
#: two halves of each gentle 22.5-degree ramp, which tile into a longer run.
SLOPE_NONE = 0
SLOPE_UP_RIGHT = 1        # "/"  floor climbs left-to-right
SLOPE_UP_LEFT = 2         # "\"  floor falls left-to-right
SLOPE_UP_RIGHT_LOW = 3    # gentle "/", lower half
SLOPE_UP_RIGHT_HIGH = 4   # gentle "/", upper half
SLOPE_UP_LEFT_HIGH = 5    # gentle "\", upper half
SLOPE_UP_LEFT_LOW = 6     # gentle "\", lower half

SLOPE_SHAPES: dict[int, tuple[float, float]] = {
    SLOPE_UP_RIGHT: (1.0, 0.0),
    SLOPE_UP_LEFT: (0.0, 1.0),
    SLOPE_UP_RIGHT_LOW: (1.0, 0.5),
    SLOPE_UP_RIGHT_HIGH: (0.5, 0.0),
    SLOPE_UP_LEFT_HIGH: (0.0, 0.5),
    SLOPE_UP_LEFT_LOW: (0.5, 1.0),
}

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
    one_way: bool = False
    priority: int = 1  # 0 = behind sprites, 1 = normal, 2 = above sprites

    @property
    def is_empty(self) -> bool:
        return self.tile_id == EMPTY_TILE


@dataclass
class MapObject:
    """An entry from a Tiled object layer — a spawn point, trigger, or region."""

    name: str = ""
    type: str = ""
    x: float = 0.0
    y: float = 0.0
    width: float = 0.0
    height: float = 0.0
    gid: int = 0
    layer: str = ""
    properties: dict[str, Any] = field(default_factory=dict)

    @property
    def center(self) -> tuple[float, float]:
        return self.x + self.width / 2, self.y + self.height / 2

    def get(self, key: str, default: Any = None) -> Any:
        return self.properties.get(key, default)


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
        #: Jump-through platforms: block a falling body only from above.
        self.one_way = np.zeros((height, width), dtype=bool)
        #: Slope shape code per tile, 0 for none. See ``SLOPE_SHAPES``.
        self.slope = np.zeros((height, width), dtype=np.uint8)
        #: Climbable tiles: gravity is suspended while a body is attached.
        self.ladder = np.zeros((height, width), dtype=bool)
        self.priority = np.ones((height, width), dtype=np.uint8)
        # Set once any slope is placed, so maps without slopes pay nothing for
        # the extra lookup on the hot is_solid path.
        self._has_slopes = False
        #: Which tileset each tile came from (0 when the map has only one).
        self.tileset_index = np.zeros((height, width), dtype=np.uint8)
        #: Treat the space outside the map as solid walls.
        self.oob_solid = True
        #: Treat the space below the map as solid. Set False for pits.
        self.oob_solid_below = True
        #: Objects from every Tiled object layer, in file order.
        self.objects: list[MapObject] = []
        #: Tileset metadata from the Tiled file (name, firstgid, tilecount, ...).
        self.tilesets: list[dict] = []

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
            one_way=bool(self.one_way[ty, tx]),
            priority=int(self.priority[ty, tx]),
        )

    def is_solid(self, tx: int, ty: int) -> bool:
        """Cheap solidity test.

        Outside the map, ``oob_solid`` decides. It defaults to True so a body
        cannot wander out of a room, but a platformer with pits wants to fall
        out of the bottom, so set ``oob_solid_below = False`` for that.
        """
        if not self.in_bounds(tx, ty):
            if ty >= self.height:
                return self.oob_solid_below
            return self.oob_solid
        # A slope tile is never a solid box — walking into one must not be
        # blocked, or the body stops dead at the foot of the ramp. The slope
        # pass in move_and_slide owns its surface instead.
        if self._has_slopes and self.slope[ty, tx]:
            return False
        return bool(self.solid[ty, tx])

    def slope_surface_y(self, world_x: int, ty: int) -> int | None:
        """World y of the slope surface at ``world_x`` in tile row ``ty``.

        Returns None when that tile is not a slope. The surface is the top of
        the solid part, so a body stands with its feet exactly on this y.
        """
        tx = world_x // self.tile_w
        if not self.in_bounds(tx, ty):
            return None
        code = int(self.slope[ty, tx])
        shape = SLOPE_SHAPES.get(code)
        if shape is None:
            return None
        left_frac, right_frac = shape
        local = world_x - tx * self.tile_w
        t = local / max(1, self.tile_w - 1)
        frac = left_frac + (right_frac - left_frac) * t
        return ty * self.tile_h + round(frac * self.tile_h)

    def is_ladder(self, tx: int, ty: int) -> bool:
        if not self.in_bounds(tx, ty):
            return False
        return bool(self.ladder[ty, tx])

    def ladder_at_pixel(self, px: int, py: int) -> bool:
        """True if the pixel lies inside a climbable tile."""
        return self.is_ladder(px // self.tile_w, py // self.tile_h)

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
        one_way: bool = False,
        slope: int = SLOPE_NONE,
        ladder: bool = False,
        priority: int = 1,
    ) -> None:
        if not self.in_bounds(tx, ty):
            return
        self.tiles[ty, tx] = tile_id
        self.palette[ty, tx] = palette_id
        self.flip_h[ty, tx] = flip_h
        self.flip_v[ty, tx] = flip_v
        self.solid[ty, tx] = solid
        self.one_way[ty, tx] = one_way
        self.slope[ty, tx] = slope
        self.ladder[ty, tx] = ladder
        self.priority[ty, tx] = priority
        if slope:
            self._has_slopes = True

    def fill_solid_from_tiles(self, solid_ids: set[int]) -> None:
        """Mark every tile whose id is in ``solid_ids`` as solid."""
        mask = np.isin(self.tiles, list(solid_ids))
        self.solid |= mask

    def fill_one_way_from_tiles(self, one_way_ids: set[int]) -> None:
        """Mark every tile whose id is in ``one_way_ids`` as a jump-through."""
        mask = np.isin(self.tiles, list(one_way_ids))
        self.one_way |= mask

    def fill_slope_from_tiles(self, slope_ids: dict[int, int]) -> None:
        """Assign slope shapes by tile id: ``{tile_id: SLOPE_UP_RIGHT, ...}``."""
        for tile_id, code in slope_ids.items():
            if code:
                self.slope[self.tiles == tile_id] = code
                self._has_slopes = True

    def fill_ladder_from_tiles(self, ladder_ids: set[int]) -> None:
        """Mark every tile whose id is in ``ladder_ids`` as climbable."""
        self.ladder |= np.isin(self.tiles, list(ladder_ids))

    # -- object queries -------------------------------------------------------
    def find_objects(self, *, name: str | None = None,
                     type: str | None = None) -> list[MapObject]:
        """Objects matching a name and/or type — how you place entities."""
        return [
            o for o in self.objects
            if (name is None or o.name == name) and (type is None or o.type == type)
        ]

    def find_object(self, *, name: str | None = None,
                    type: str | None = None) -> MapObject | None:
        matches = self.find_objects(name=name, type=type)
        return matches[0] if matches else None

    # -- Tiled import ---------------------------------------------------------
    @classmethod
    def from_tiled_json(
        cls,
        data: dict,
        layer_index: int = 0,
        *,
        layer_name: str | None = None,
        solid_property: str = "solid",
        one_way_property: str = "one_way",
        slope_property: str = "slope",
        ladder_property: str = "ladder",
    ) -> TileMap:
        """Build a TileMap from parsed Tiled JSON map data.

        Reads one tile layer (by ``layer_name`` if given, else ``layer_index``).
        Flip flags in the GID high bits become the flip planes; object layers
        become ``objects``.

        Solidity is taken, in order of precedence, from a tile layer named
        "collision" (any non-empty tile is solid), then from tiles marked with a
        boolean ``solid_property`` in the tileset.
        """
        width = int(data["width"])
        height = int(data["height"])
        tile_w = int(data.get("tilewidth", 16))
        tile_h = int(data.get("tileheight", 16))
        infinite = bool(data.get("infinite", False))

        layers = _flatten_layers(data.get("layers", []))
        tile_layers = [ly for ly in layers if ly.get("type") == "tilelayer"]
        if not tile_layers:
            raise ValueError("Tiled map contains no tile layers")

        if layer_name is not None:
            named = [ly for ly in tile_layers if ly.get("name") == layer_name]
            if not named:
                raise ValueError(
                    f"no tile layer named {layer_name!r}; found "
                    f"{[ly.get('name') for ly in tile_layers]}"
                )
            layer = named[0]
        else:
            if not -len(tile_layers) <= layer_index < len(tile_layers):
                raise IndexError(
                    f"layer_index {layer_index} out of range: the map has "
                    f"{len(tile_layers)} tile layers"
                )
            layer = tile_layers[layer_index]

        tmap = cls(width, height, tile_w, tile_h)
        tmap.tilesets = list(data.get("tilesets", []))

        raw = _layer_gids(layer, width, height, infinite)
        gid = raw & _GID_MASK
        tmap.flip_h = (raw & _FLIP_H) != 0
        tmap.flip_v = (raw & _FLIP_V) != 0
        # Diagonal flip is rare in 2D engines; fold it into H-flip so the tile is
        # at least not dropped silently.
        tmap.flip_h |= (raw & _FLIP_D) != 0

        local, tileset_idx = _localise_gids(gid, tmap.tilesets)
        tmap.tiles = local.astype(np.int16)
        tmap.tileset_index = tileset_idx.astype(np.uint8)

        # Objects from every object layer.
        for ly in layers:
            if ly.get("type") == "objectgroup":
                tmap.objects.extend(_read_objects(ly))

        # Solidity: an explicit collision layer wins, else tileset properties.
        collision = next(
            (ly for ly in tile_layers if (ly.get("name") or "").lower() == "collision"),
            None,
        )
        if collision is not None:
            coll = _layer_gids(collision, width, height, infinite)
            tmap.solid = (coll & _GID_MASK) != 0
        else:
            solid_ids = _solid_tile_ids(tmap.tilesets, solid_property)
            if solid_ids:
                tmap.solid = np.isin(gid, list(solid_ids))

        one_way_ids = _solid_tile_ids(tmap.tilesets, one_way_property)
        if one_way_ids:
            tmap.one_way = np.isin(gid, list(one_way_ids))

        ladder_ids = _solid_tile_ids(tmap.tilesets, ladder_property)
        if ladder_ids:
            tmap.ladder = np.isin(gid, list(ladder_ids))

        # `slope` is a named shape rather than a flag, e.g. slope = "up_right".
        slope_ids = _slope_tile_ids(tmap.tilesets, slope_property)
        for slope_gid, code in slope_ids.items():
            tmap.slope[gid == slope_gid] = code
            tmap._has_slopes = True

        return tmap

    @classmethod
    def load_tiled(cls, path: str, layer_index: int = 0, **kwargs) -> TileMap:
        with open(path, encoding="utf-8") as fh:
            return cls.from_tiled_json(json.load(fh), layer_index, **kwargs)


# ---------------------------------------------------------------------------
# Tiled decoding helpers
# ---------------------------------------------------------------------------

def _flatten_layers(layers: list[dict]) -> list[dict]:
    """Expand Tiled group layers so nested layers are visible."""
    out: list[dict] = []
    for ly in layers:
        if ly.get("type") == "group":
            out.extend(_flatten_layers(ly.get("layers", [])))
        else:
            out.append(ly)
    return out


def _decode_data(payload, encoding: str, compression: str) -> np.ndarray:
    """Decode one Tiled data payload into a flat uint32 array of GIDs."""
    if encoding in ("", None, "csv") and isinstance(payload, list):
        return np.asarray(payload, dtype=np.uint32)

    if encoding != "base64":
        raise ValueError(f"unsupported Tiled layer encoding {encoding!r}")

    blob = base64.b64decode(payload)
    if compression in ("", None):
        pass
    elif compression == "zlib":
        blob = zlib.decompress(blob)
    elif compression == "gzip":
        blob = gzip.decompress(blob)
    elif compression == "zstd":
        try:
            import zstandard
        except ImportError as exc:      # pragma: no cover - optional dependency
            raise ValueError(
                "this map uses zstd compression; install 'zstandard' or re-export "
                "from Tiled with zlib/gzip compression or CSV encoding"
            ) from exc
        blob = zstandard.ZstdDecompressor().decompress(blob)
    else:
        raise ValueError(f"unsupported Tiled layer compression {compression!r}")

    return np.frombuffer(blob, dtype="<u4").astype(np.uint32)


def _layer_gids(layer: dict, width: int, height: int, infinite: bool) -> np.ndarray:
    """Return a (height, width) uint32 GID array for a tile layer."""
    encoding = layer.get("encoding", "")
    compression = layer.get("compression", "")

    if infinite or "chunks" in layer:
        grid = np.zeros((height, width), dtype=np.uint32)
        # Chunk coordinates are in the map's own space and may be negative, so
        # offset them by the layer origin before writing into the grid.
        ox = int(layer.get("startx", 0))
        oy = int(layer.get("starty", 0))
        for chunk in layer.get("chunks", []):
            cw, ch = int(chunk["width"]), int(chunk["height"])
            block = _decode_data(chunk["data"], encoding, compression)
            if block.size != cw * ch:
                raise ValueError("Tiled chunk data size does not match its bounds")
            block = block.reshape((ch, cw))
            cx = int(chunk["x"]) - ox
            cy = int(chunk["y"]) - oy
            # Clip to the map bounds; chunks can extend past them.
            x0, y0 = max(0, cx), max(0, cy)
            x1, y1 = min(width, cx + cw), min(height, cy + ch)
            if x0 >= x1 or y0 >= y1:
                continue
            grid[y0:y1, x0:x1] = block[y0 - cy:y1 - cy, x0 - cx:x1 - cx]
        return grid

    if "data" not in layer:
        raise ValueError(
            f"tile layer {layer.get('name', '?')!r} has no data; if this is an "
            "infinite map, re-export it or check the 'chunks' key"
        )
    flat = _decode_data(layer["data"], encoding, compression)
    if flat.size != width * height:
        raise ValueError(
            f"tile layer {layer.get('name', '?')!r} has {flat.size} tiles, "
            f"expected {width * height} ({width}x{height})"
        )
    return flat.reshape((height, width))


def _localise_gids(gid: np.ndarray,
                   tilesets: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """Map global IDs to per-tileset 0-based IDs, with -1 for empty.

    Tiled numbers tiles globally across every tileset in the map, offset by each
    tileset's ``firstgid``. Assuming firstgid == 1 renders any map with a
    different one entirely blank.
    """
    empty = gid == 0
    firstgids = sorted(int(ts.get("firstgid", 1)) for ts in tilesets) or [1]
    bounds = np.asarray(firstgids, dtype=np.int64)

    gid64 = gid.astype(np.int64)
    # For each gid, the owning tileset is the last one whose firstgid <= gid.
    idx = np.searchsorted(bounds, gid64, side="right") - 1
    np.clip(idx, 0, len(bounds) - 1, out=idx)
    local = gid64 - bounds[idx]

    local[empty] = EMPTY_TILE
    idx[empty] = 0
    return local, idx


def _read_objects(layer: dict) -> list[MapObject]:
    layer_name = layer.get("name", "")
    out: list[MapObject] = []
    for obj in layer.get("objects", []):
        out.append(MapObject(
            name=obj.get("name", ""),
            # Tiled 1.9+ writes "class"; older files write "type".
            type=obj.get("class", obj.get("type", "")),
            x=float(obj.get("x", 0.0)),
            y=float(obj.get("y", 0.0)),
            width=float(obj.get("width", 0.0)),
            height=float(obj.get("height", 0.0)),
            gid=int(obj.get("gid", 0)) & _GID_MASK,
            layer=layer_name,
            properties=_read_properties(obj),
        ))
    return out


def _read_properties(node: dict) -> dict[str, Any]:
    """Tiled writes properties as a list of {name, type, value} dicts."""
    props = node.get("properties")
    if isinstance(props, dict):          # very old Tiled format
        return dict(props)
    if not isinstance(props, list):
        return {}
    return {p["name"]: p.get("value") for p in props if "name" in p}


#: Tiled writes the slope shape as a string, which is far more legible in the
#: editor than a bare number.
SLOPE_NAMES: dict[str, int] = {
    "up_right": SLOPE_UP_RIGHT,
    "up_left": SLOPE_UP_LEFT,
    "up_right_low": SLOPE_UP_RIGHT_LOW,
    "up_right_high": SLOPE_UP_RIGHT_HIGH,
    "up_left_high": SLOPE_UP_LEFT_HIGH,
    "up_left_low": SLOPE_UP_LEFT_LOW,
}


def _slope_tile_ids(tilesets: list[dict], slope_property: str) -> dict[int, int]:
    """Global ID -> slope code, from a string (or numeric) tileset property."""
    out: dict[int, int] = {}
    for ts in tilesets:
        firstgid = int(ts.get("firstgid", 1))
        tiles = ts.get("tiles")
        if isinstance(tiles, dict):
            tiles = [{"id": int(k), **v} for k, v in tiles.items()]
        for tile in tiles or []:
            tile_id = tile.get("id")
            if tile_id is None:
                continue
            raw = _read_properties(tile).get(slope_property)
            if raw is None:
                continue
            code = SLOPE_NAMES.get(raw) if isinstance(raw, str) else int(raw)
            if code:
                out[firstgid + int(tile_id)] = code
    return out


def _solid_tile_ids(tilesets: list[dict], solid_property: str) -> set[int]:
    """Global IDs of tiles flagged solid by a tileset property."""
    solid: set[int] = set()
    for ts in tilesets:
        firstgid = int(ts.get("firstgid", 1))
        tiles = ts.get("tiles", [])
        # Tiled writes `tiles` as a list of {id, properties}; some tools use a
        # dict keyed by id.
        entries = tiles.items() if isinstance(tiles, dict) else (
            (t.get("id"), t) for t in tiles
        )
        for tile_id, tile in entries:
            if tile_id is None:
                continue
            if _read_properties(tile).get(solid_property) is True:
                solid.add(firstgid + int(tile_id))
    return solid
