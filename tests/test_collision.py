"""Unit tests for tile-based AABB collision resolution."""

from retroforge.graphics.tilemap import TileMap
from retroforge.physics.body import RigidBody2D
from retroforge.physics.collision import move_and_slide
from retroforge.utils.vec2 import Vec2


def _floor_map():
    # 6 wide x 6 tall, tile size 16. Bottom row solid.
    tm = TileMap(6, 6, 16, 16)
    for tx in range(6):
        tm.set_tile(tx, 5, 1, solid=True)
    return tm


def test_falls_and_lands_on_floor():
    tm = _floor_map()
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    for _ in range(120):
        move_and_slide(body, 1.0 / 60.0, 900.0, tm)
    # Floor top is at y = 5*16 = 80; body height 16 -> rests at y = 64.
    assert body.grounded is True
    assert abs(body.pos.y - 64) <= 1


def test_horizontal_wall_blocks():
    tm = TileMap(6, 6, 16, 16)
    for ty in range(6):
        tm.set_tile(3, ty, 1, solid=True)  # vertical wall at column 3
    body = RigidBody2D(Vec2(16, 16), Vec2(12, 12), gravity_scale=0.0)
    for _ in range(60):
        body.vel = Vec2(200, 0)  # re-apply each frame, as game input would
        move_and_slide(body, 1.0 / 60.0, 0.0, tm)
    # Wall left edge at x = 48; body width 12 -> blocked before x = 36.
    assert body.on_wall is True
    assert body.pos.x + body.size.x <= 48


def test_no_motion_when_resting():
    tm = _floor_map()
    body = RigidBody2D(Vec2(32, 64), Vec2(12, 16))
    move_and_slide(body, 1.0 / 60.0, 900.0, tm)
    assert body.grounded is True
    assert abs(body.pos.y - 64) <= 1


def test_ceiling_stops_upward():
    tm = TileMap(6, 6, 16, 16)
    for tx in range(6):
        tm.set_tile(tx, 0, 1, solid=True)  # ceiling row
    body = RigidBody2D(Vec2(32, 32), Vec2(12, 12), gravity_scale=0.0)
    for _ in range(60):
        body.vel = Vec2(0, -200)  # re-apply each frame, as game input would
        move_and_slide(body, 1.0 / 60.0, 0.0, tm)
    assert body.on_ceiling is True
    assert body.pos.y >= 16  # cannot pass the 16px-tall ceiling tile
