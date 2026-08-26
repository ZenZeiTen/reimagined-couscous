"""Tiled JSON import across the formats Tiled actually writes."""

from __future__ import annotations

import base64
import gzip
import json
import zlib

import numpy as np
import pytest

from retroforge.graphics.tilemap import EMPTY_TILE, TileMap

W, H = 4, 3
# GIDs as Tiled would write them for a 4x3 map using a tileset at firstgid 1.
GIDS = [
    1, 2, 0, 3,
    0, 0, 2, 2,
    4, 4, 4, 4,
]


def _encode(gids: list[int], compression: str = "") -> str:
    blob = np.asarray(gids, dtype="<u4").tobytes()
    if compression == "zlib":
        blob = zlib.compress(blob)
    elif compression == "gzip":
        blob = gzip.compress(blob)
    return base64.b64encode(blob).decode("ascii")


def _map(layer: dict, *, tilesets=None, extra_layers=(), infinite=False) -> dict:
    return {
        "width": W, "height": H, "tilewidth": 16, "tileheight": 16,
        "infinite": infinite,
        "tilesets": tilesets if tilesets is not None else [{"firstgid": 1}],
        "layers": [layer, *extra_layers],
    }


def _csv_layer(gids=None) -> dict:
    return {"type": "tilelayer", "name": "bg", "width": W, "height": H,
            "data": gids if gids is not None else GIDS}


def _b64_layer(compression: str, gids=None) -> dict:
    return {"type": "tilelayer", "name": "bg", "width": W, "height": H,
            "encoding": "base64", "compression": compression,
            "data": _encode(gids if gids is not None else GIDS, compression)}


EXPECTED = np.array([
    [0, 1, EMPTY_TILE, 2],
    [EMPTY_TILE, EMPTY_TILE, 1, 1],
    [3, 3, 3, 3],
], dtype=np.int16)


# -- encodings --------------------------------------------------------------

@pytest.mark.parametrize("layer", [
    _csv_layer(),
    _b64_layer(""),
    _b64_layer("zlib"),        # Tiled's default export
    _b64_layer("gzip"),
], ids=["csv", "base64", "base64+zlib", "base64+gzip"])
def test_every_layer_encoding_loads(layer):
    tmap = TileMap.from_tiled_json(_map(layer))
    assert tmap.width == W and tmap.height == H
    np.testing.assert_array_equal(tmap.tiles, EXPECTED)


def test_unknown_encoding_is_reported_clearly():
    layer = dict(_csv_layer(), encoding="quantum")
    with pytest.raises(ValueError, match="encoding"):
        TileMap.from_tiled_json(_map(layer))


def test_wrong_sized_layer_is_reported_clearly():
    with pytest.raises(ValueError, match="expected 12"):
        TileMap.from_tiled_json(_map(_csv_layer([1, 2, 3])))


# -- firstgid ---------------------------------------------------------------

def test_firstgid_offset_is_applied():
    """A map whose tileset does not start at 1 used to render entirely blank."""
    shifted = [g + 256 if g else 0 for g in GIDS]
    tmap = TileMap.from_tiled_json(
        _map(_csv_layer(shifted), tilesets=[{"firstgid": 257}])
    )
    np.testing.assert_array_equal(tmap.tiles, EXPECTED)


def test_multiple_tilesets_resolve_to_their_own_local_ids():
    tilesets = [{"firstgid": 1, "tilecount": 4}, {"firstgid": 5, "tilecount": 4}]
    # 1 -> tileset 0 local 0; 6 -> tileset 1 local 1; 0 -> empty
    gids = [1, 6, 0, 5, 2, 7, 8, 0, 3, 4, 5, 6]
    tmap = TileMap.from_tiled_json(_map(_csv_layer(gids), tilesets=tilesets))
    assert tmap.tiles[0, 0] == 0 and tmap.tileset_index[0, 0] == 0
    assert tmap.tiles[0, 1] == 1 and tmap.tileset_index[0, 1] == 1
    assert tmap.tiles[0, 3] == 0 and tmap.tileset_index[0, 3] == 1
    assert tmap.tiles[0, 2] == EMPTY_TILE


# -- flips ------------------------------------------------------------------

def test_flip_bits_become_flip_planes():
    gids = [1 | 0x80000000, 1 | 0x40000000, 1, 1] + [1] * 8
    tmap = TileMap.from_tiled_json(_map(_csv_layer(gids)))
    assert tmap.flip_h[0, 0] and not tmap.flip_v[0, 0]
    assert tmap.flip_v[0, 1] and not tmap.flip_h[0, 1]
    assert not tmap.flip_h[0, 2] and not tmap.flip_v[0, 2]
    assert tmap.tiles[0, 0] == 0, "flip bits must not leak into the tile id"


# -- object layers ----------------------------------------------------------

def _object_layer() -> dict:
    return {
        "type": "objectgroup",
        "name": "spawns",
        "objects": [
            {"name": "player", "type": "spawn", "x": 32, "y": 48,
             "width": 16, "height": 24},
            {"name": "goblin", "class": "enemy", "x": 96, "y": 48,
             "properties": [{"name": "hp", "type": "int", "value": 3},
                            {"name": "boss", "type": "bool", "value": True}]},
            {"name": "exit", "type": "trigger", "x": 200, "y": 0,
             "width": 16, "height": 48},
        ],
    }


def test_object_layers_are_kept():
    """Spawn points are how a level says where entities go."""
    tmap = TileMap.from_tiled_json(
        _map(_csv_layer(), extra_layers=[_object_layer()])
    )
    assert len(tmap.objects) == 3
    player = tmap.find_object(name="player")
    assert player is not None
    assert (player.x, player.y) == (32, 48)
    assert player.type == "spawn"
    assert player.layer == "spawns"
    assert player.center == (40, 60)


def test_object_custom_properties_are_parsed():
    tmap = TileMap.from_tiled_json(
        _map(_csv_layer(), extra_layers=[_object_layer()])
    )
    goblin = tmap.find_object(name="goblin")
    assert goblin.properties == {"hp": 3, "boss": True}
    assert goblin.get("hp") == 3
    assert goblin.get("missing", "fallback") == "fallback"


def test_tiled_19_class_field_is_read_as_type():
    tmap = TileMap.from_tiled_json(
        _map(_csv_layer(), extra_layers=[_object_layer()])
    )
    assert tmap.find_object(name="goblin").type == "enemy"


def test_find_objects_filters_by_type():
    tmap = TileMap.from_tiled_json(
        _map(_csv_layer(), extra_layers=[_object_layer()])
    )
    assert [o.name for o in tmap.find_objects(type="trigger")] == ["exit"]
    assert tmap.find_object(name="nobody") is None


# -- group layers -----------------------------------------------------------

def test_layers_nested_in_a_group_are_found():
    grouped = {"type": "group", "name": "world",
               "layers": [_csv_layer(), _object_layer()]}
    tmap = TileMap.from_tiled_json({
        "width": W, "height": H, "tilewidth": 16, "tileheight": 16,
        "tilesets": [{"firstgid": 1}], "layers": [grouped],
    })
    np.testing.assert_array_equal(tmap.tiles, EXPECTED)
    assert len(tmap.objects) == 3


# -- infinite maps ----------------------------------------------------------

def test_infinite_chunked_map_is_stitched():
    """Infinite maps used to die with a bare KeyError 'data'."""
    layer = {
        "type": "tilelayer", "name": "bg", "startx": 0, "starty": 0,
        "chunks": [
            {"x": 0, "y": 0, "width": 2, "height": 2, "data": [1, 2, 0, 0]},
            {"x": 2, "y": 0, "width": 2, "height": 2, "data": [0, 3, 2, 2]},
            {"x": 0, "y": 2, "width": 4, "height": 1, "data": [4, 4, 4, 4]},
        ],
    }
    tmap = TileMap.from_tiled_json(_map(layer, infinite=True))
    np.testing.assert_array_equal(tmap.tiles, EXPECTED)


def test_infinite_chunks_outside_the_bounds_are_clipped():
    layer = {
        "type": "tilelayer", "name": "bg", "startx": 0, "starty": 0,
        "chunks": [
            {"x": 0, "y": 0, "width": 4, "height": 3, "data": GIDS},
            {"x": 8, "y": 8, "width": 2, "height": 2, "data": [9, 9, 9, 9]},
        ],
    }
    tmap = TileMap.from_tiled_json(_map(layer, infinite=True))
    np.testing.assert_array_equal(tmap.tiles, EXPECTED)


# -- solidity ---------------------------------------------------------------

def test_collision_layer_sets_solid():
    collision = {"type": "tilelayer", "name": "Collision",
                 "width": W, "height": H,
                 "data": [0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1]}
    tmap = TileMap.from_tiled_json(_map(_csv_layer(), extra_layers=[collision]))
    assert not tmap.is_solid(0, 0)
    assert tmap.is_solid(0, 1)
    assert tmap.is_solid(3, 2)


def test_tileset_solid_property_marks_tiles_solid():
    tilesets = [{
        "firstgid": 1,
        "tiles": [
            {"id": 0, "properties": [{"name": "solid", "value": False}]},
            {"id": 3, "properties": [{"name": "solid", "value": True}]},
        ],
    }]
    tmap = TileMap.from_tiled_json(_map(_csv_layer(), tilesets=tilesets))
    # gid 4 (local id 3) is the bottom row.
    assert tmap.is_solid(0, 2) and tmap.is_solid(3, 2)
    assert not tmap.is_solid(0, 0)


# -- layer selection --------------------------------------------------------

def test_layer_can_be_chosen_by_name():
    fg = {"type": "tilelayer", "name": "fg", "width": W, "height": H,
          "data": [9] * (W * H)}
    tmap = TileMap.from_tiled_json(
        _map(_csv_layer(), extra_layers=[fg]), layer_name="fg"
    )
    assert (tmap.tiles == 8).all()


def test_unknown_layer_name_lists_what_exists():
    with pytest.raises(ValueError, match="bg"):
        TileMap.from_tiled_json(_map(_csv_layer()), layer_name="nope")


def test_out_of_range_layer_index_is_reported():
    with pytest.raises(IndexError, match="1 tile layers"):
        TileMap.from_tiled_json(_map(_csv_layer()), layer_index=5)


def test_load_tiled_reads_a_file(tmp_path):
    path = tmp_path / "level.json"
    path.write_text(json.dumps(_map(_b64_layer("zlib"))), encoding="utf-8")
    tmap = TileMap.load_tiled(str(path))
    np.testing.assert_array_equal(tmap.tiles, EXPECTED)
