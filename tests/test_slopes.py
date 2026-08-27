"""Slope tiles: walking up, walking down, landing, and jumping off."""

from __future__ import annotations

import pytest

from retroforge.graphics.tilemap import (
    SLOPE_UP_LEFT,
    SLOPE_UP_RIGHT,
    SLOPE_UP_RIGHT_HIGH,
    SLOPE_UP_RIGHT_LOW,
    TileMap,
)
from retroforge.physics.body import RigidBody2D
from retroforge.physics.collision import move_and_slide
from retroforge.utils.vec2 import Vec2

TILE = 16
GRAVITY = 900.0
DT = 1 / 60


def _flat_with_ramp() -> TileMap:
    """Low ground, a 45-degree ramp, then high ground one tile up.

    The ramp occupies row 8 and climbs from its own bottom edge (y=144, the
    surface of the low ground in row 9) to its top edge (y=128, the surface of
    the high ground in row 8), so the three surfaces join without a step.

        row 8   . . . . . . . . / # # # #      <- ramp, then high ground
        row 9   # # # # # # # # #              <- low ground
    """
    tm = TileMap(20, 12, TILE, TILE)
    tm.oob_solid_below = False
    for tx in range(0, 9):
        tm.set_tile(tx, 9, 1, solid=True)           # low ground, surface y=144
    tm.set_tile(8, 8, 2, slope=SLOPE_UP_RIGHT)      # ramp, 144 -> 128
    for tx in range(9, 13):
        tm.set_tile(tx, 8, 1, solid=True)           # high ground, surface y=128
    return tm


LOW_SURFACE = 9 * TILE      # y of the low ground
HIGH_SURFACE = 8 * TILE     # y of the high ground


def _body(x: float, y: float, w: int = 12, h: int = 16) -> RigidBody2D:
    return RigidBody2D(Vec2(x, y), Vec2(w, h))


def _settle(body: RigidBody2D, tm: TileMap, steps: int = 40) -> None:
    for _ in range(steps):
        move_and_slide(body, DT, GRAVITY, tm)


# -- the shape itself -------------------------------------------------------

def test_slope_surface_spans_the_tile():
    tm = TileMap(4, 4, TILE, TILE)
    tm.set_tile(1, 2, 5, slope=SLOPE_UP_RIGHT)
    left = tm.slope_surface_y(TILE, 2)              # x at the tile's left edge
    right = tm.slope_surface_y(TILE * 2 - 1, 2)     # x at its right edge
    assert left == 2 * TILE + TILE, "up-right ramp starts at the tile bottom"
    assert right == 2 * TILE, "and reaches the tile top"


def test_up_left_slope_mirrors_up_right():
    tm = TileMap(4, 4, TILE, TILE)
    tm.set_tile(1, 2, 5, slope=SLOPE_UP_LEFT)
    assert tm.slope_surface_y(TILE, 2) == 2 * TILE
    assert tm.slope_surface_y(TILE * 2 - 1, 2) == 2 * TILE + TILE


def test_gentle_slope_halves_join_up():
    tm = TileMap(4, 4, TILE, TILE)
    tm.set_tile(1, 2, 5, slope=SLOPE_UP_RIGHT_LOW)
    tm.set_tile(2, 2, 5, slope=SLOPE_UP_RIGHT_HIGH)
    end_of_low = tm.slope_surface_y(TILE * 2 - 1, 2)
    start_of_high = tm.slope_surface_y(TILE * 2, 2)
    assert abs(end_of_low - start_of_high) <= 1, "halves should meet"


def test_slope_tiles_are_not_solid_boxes():
    tm = _flat_with_ramp()
    assert tm.is_solid(8, 8) is False, "the ramp tile itself"
    assert tm.is_solid(0, 9) is True, "ordinary ground is unaffected"
    assert tm.is_solid(9, 8) is True, "the high ground beside the ramp"


def test_a_map_without_slopes_skips_the_slope_path():
    tm = TileMap(4, 4)
    assert tm._has_slopes is False
    tm.set_tile(1, 1, 3, slope=SLOPE_UP_RIGHT)
    assert tm._has_slopes is True


# -- walking ----------------------------------------------------------------

def test_body_rests_on_a_slope_instead_of_falling_through():
    tm = _flat_with_ramp()
    body = _body(8 * TILE + 2, 0)          # dropped above the ramp
    _settle(body, tm)
    assert body.grounded is True
    # A box rests on the highest ground under it, which on an up-right ramp is
    # beneath its right edge.
    left = int(body.pos.x)
    highest = min(
        tm.slope_surface_y(x, 8)
        for x in range(left, left + int(body.size.x))
        if tm.slope_surface_y(x, 8) is not None
    )
    assert body.bottom == pytest.approx(highest, abs=1.0)
    assert LOW_SURFACE > body.bottom > HIGH_SURFACE, "should be part-way up"


def test_walking_uphill_climbs_the_ramp():
    tm = _flat_with_ramp()
    body = _body(6 * TILE, LOW_SURFACE - 32)
    _settle(body, tm, 20)
    start_y = body.pos.y

    for _ in range(60):                    # walk right, into and up the ramp
        body.vel = Vec2(60.0, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)

    assert body.pos.x > 8 * TILE, "should have entered the ramp"
    assert body.pos.y < start_y, "should be higher than where it started"
    assert body.grounded is True


def test_walking_uphill_is_not_blocked_at_the_foot_of_the_ramp():
    """The classic failure: the body stops dead where the slope tile begins."""
    tm = _flat_with_ramp()
    body = _body(7 * TILE, LOW_SURFACE - 32)
    _settle(body, tm, 20)
    for _ in range(90):
        body.vel = Vec2(60.0, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.pos.x > 9 * TILE, f"stuck at x={body.pos.x}"
    assert body.on_wall is False


def test_walking_downhill_follows_the_ramp_instead_of_launching():
    tm = _flat_with_ramp()
    body = _body(10 * TILE, HIGH_SURFACE - 32)
    _settle(body, tm, 20)

    airborne = 0
    for _ in range(70):                    # walk left, down the ramp
        body.vel = Vec2(-60.0, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)
        if not body.grounded:
            airborne += 1

    assert body.pos.x < 8 * TILE, "should have descended past the ramp"
    assert airborne <= 4, f"left the ground {airborne} steps while walking down"


def test_a_body_can_jump_off_a_slope():
    tm = _flat_with_ramp()
    body = _body(8 * TILE + 4, 0)
    _settle(body, tm)
    assert body.grounded is True
    resting_y = body.pos.y

    body.vel = Vec2(0.0, -300.0)           # jump
    for _ in range(6):
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.pos.y < resting_y - 8, "slope should not glue the body down"
    assert body.grounded is False


def test_falling_fast_does_not_tunnel_through_a_ramp():
    tm = _flat_with_ramp()
    body = _body(8 * TILE + 8, 0)
    body.vel = Vec2(0.0, 1200.0)           # 20px per step
    for _ in range(30):
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.grounded is True
    assert body.bottom <= LOW_SURFACE, "fell straight past the ramp"


def test_a_body_beside_a_ramp_does_not_climb_it():
    """Approaching a tall ramp from the side must not teleport the body up."""
    tm = TileMap(10, 10, TILE, TILE)
    tm.oob_solid_below = False
    for tx in range(10):
        tm.set_tile(tx, 9, 1, solid=True)
    tm.set_tile(5, 5, 2, slope=SLOPE_UP_RIGHT)     # a ramp floating far above
    body = _body(5 * TILE, 9 * TILE - 32)
    _settle(body, tm, 20)
    assert body.pos.y == pytest.approx(9 * TILE - 16, abs=1.0)


def test_flat_ground_still_works_on_a_map_with_slopes():
    tm = _flat_with_ramp()
    body = _body(2 * TILE, 0)
    _settle(body, tm)
    assert body.grounded is True
    assert body.bottom == pytest.approx(LOW_SURFACE, abs=0.5)
    assert body.vel.y == pytest.approx(0.0)
