"""Unit tests for TileMap and Tiled JSON import."""

from retroforge.graphics.tilemap import EMPTY_TILE, TileMap


def _tiny_tiled():
    # 3x2 map. GID 0 = empty, GID 1 = tile 0, GID 2 = tile 1.
    return {
        "width": 3,
        "height": 2,
        "tilewidth": 16,
        "tileheight": 16,
        "layers": [
            {"type": "tilelayer", "name": "main",
             "data": [0, 1, 2, 2, 2, 0]},
            {"type": "tilelayer", "name": "collision",
             "data": [0, 0, 0, 1, 1, 0]},
        ],
    }


def test_dimensions():
    tm = TileMap(4, 3, 16, 16)
    assert tm.pixel_width == 64
    assert tm.pixel_height == 48


def test_tiled_import_subtracts_one():
    tm = TileMap.from_tiled_json(_tiny_tiled())
    # GID 0 -> empty (-1), GID 1 -> 0, GID 2 -> 1
    assert tm.get_tile(0, 0).tile_id == EMPTY_TILE
    assert tm.get_tile(1, 0).tile_id == 0
    assert tm.get_tile(2, 0).tile_id == 1


def test_tiled_collision_layer():
    tm = TileMap.from_tiled_json(_tiny_tiled())
    assert tm.is_solid(0, 1) is True
    assert tm.is_solid(1, 1) is True
    assert tm.is_solid(0, 0) is False


def test_out_of_bounds_is_solid():
    tm = TileMap(2, 2)
    assert tm.is_solid(-1, 0) is True
    assert tm.is_solid(5, 5) is True


def test_set_tile():
    tm = TileMap(2, 2)
    tm.set_tile(1, 1, 7, solid=True, palette_id=3)
    t = tm.get_tile(1, 1)
    assert t.tile_id == 7
    assert t.solid is True
    assert t.palette_id == 3
