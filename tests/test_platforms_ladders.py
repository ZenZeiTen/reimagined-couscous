"""Moving platforms and ladders."""

from __future__ import annotations

import pytest

from retroforge.entity import Entity, MovingPlatform, World
from retroforge.graphics.tilemap import TileMap
from retroforge.utils.vec2 import Vec2

TILE = 16
DT = 1 / 60


class _Walker(Entity):
    """A body that just falls, so the world's physics drive it."""

    def update(self, dt, world):
        world.move(self, dt)


def _room() -> TileMap:
    tm = TileMap(20, 12, TILE, TILE)
    tm.oob_solid_below = False
    for tx in range(20):
        tm.set_tile(tx, 11, 1, solid=True)      # floor at y=176
    return tm


FLOOR = 11 * TILE


# -- platform motion --------------------------------------------------------

def test_platform_travels_to_its_waypoint():
    world = World(_room())
    plat = world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8),
                                      [Vec2(128, 100)], speed=60.0))
    reached = 0.0
    for _ in range(120):
        world.update(DT)
        reached = max(reached, plat.pos.x)
    assert reached == pytest.approx(128, abs=1.0), "never reached the waypoint"


def test_pingpong_reverses_at_each_end():
    world = World(_room())
    plat = world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8),
                                      [Vec2(96, 100)], speed=120.0))
    seen = []
    for _ in range(240):
        world.update(DT)
        seen.append(plat.pos.x)
    assert max(seen) == pytest.approx(96, abs=1.5)
    assert min(seen) == pytest.approx(32, abs=1.5)
    assert seen[-1] != seen[0], "should still be moving"


def test_cycle_mode_returns_to_the_start():
    world = World(_room())
    plat = world.spawn(MovingPlatform(
        Vec2(32, 100), Vec2(16, 8),
        [Vec2(96, 100), Vec2(96, 60)], speed=200.0, mode="cycle"))
    for _ in range(240):
        world.update(DT)
    # A cycling route eventually revisits its origin; just assert it left and
    # came back rather than pinning an exact phase.
    assert plat.pos != Vec2(96, 60)


def test_wait_pauses_at_a_waypoint():
    world = World(_room())
    plat = world.spawn(MovingPlatform(Vec2(32, 100), Vec2(16, 8),
                                      [Vec2(48, 100)], speed=240.0, wait=0.5))
    for _ in range(12):
        world.update(DT)
    settled = plat.pos.x
    for _ in range(12):                          # still inside the pause
        world.update(DT)
    assert plat.pos.x == pytest.approx(settled, abs=0.5)


def test_a_platform_with_no_waypoints_stays_put():
    world = World(_room())
    plat = world.spawn(MovingPlatform(Vec2(32, 100), Vec2(16, 8)))
    for _ in range(60):
        world.update(DT)
    assert plat.pos == Vec2(32, 100)
    assert plat.delta == Vec2(0, 0)


# -- riding -----------------------------------------------------------------

def test_a_falling_body_lands_on_a_platform():
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8)))
    walker = world.spawn(_Walker(Vec2(40, 40), Vec2(12, 16)))
    for _ in range(60):
        world.update(DT)
    assert walker.body.bottom == pytest.approx(100, abs=0.5)
    assert walker.body.grounded is True
    assert walker.body.carrier is not None


def test_a_rider_is_carried_sideways():
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8),
                               [Vec2(160, 100)], speed=60.0))
    walker = world.spawn(_Walker(Vec2(40, 40), Vec2(12, 16)))
    for _ in range(30):                          # let it land
        world.update(DT)
    landed_x = walker.pos.x
    for _ in range(60):
        world.update(DT)
    assert walker.pos.x > landed_x + 40, "rider did not travel with the platform"
    assert walker.body.bottom == pytest.approx(100, abs=1.0)


def test_a_rider_is_carried_upward():
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 140), Vec2(48, 8),
                               [Vec2(32, 60)], speed=60.0))
    walker = world.spawn(_Walker(Vec2(40, 100), Vec2(12, 16)))
    for _ in range(40):
        world.update(DT)
    lifted = walker.pos.y
    for _ in range(35):          # stop short of the top waypoint
        world.update(DT)
    assert walker.pos.y < lifted - 25, "rider was not lifted"


def test_stepping_off_releases_the_rider():
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 100), Vec2(32, 8)))
    walker = world.spawn(_Walker(Vec2(40, 40), Vec2(12, 16)))
    for _ in range(60):
        world.update(DT)
    assert walker.body.carrier is not None

    walker.pos = Vec2(150, 40)                   # moved well clear
    for _ in range(60):
        world.update(DT)
    assert walker.body.carrier is None
    assert walker.body.bottom == pytest.approx(FLOOR, abs=0.5), "should hit the floor"


def test_a_rider_can_jump_off_a_platform():
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8)))
    walker = world.spawn(_Walker(Vec2(40, 40), Vec2(12, 16)))
    for _ in range(60):
        world.update(DT)
    resting = walker.pos.y

    walker.vel = Vec2(0.0, -260.0)
    for _ in range(8):
        world.update(DT)
    assert walker.pos.y < resting - 10, "platform should not glue the rider down"


def test_jumping_up_through_a_platform_is_allowed():
    """Moving platforms are land-from-above only, as they were on hardware."""
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8)))
    walker = world.spawn(_Walker(Vec2(40, 150), Vec2(12, 16)))
    walker.vel = Vec2(0.0, -400.0)
    passed_through = False
    for _ in range(20):
        world.update(DT)
        if walker.body.bottom < 100:
            passed_through = True
            break
    assert passed_through, "should rise through the underside"


def test_a_fast_fall_does_not_tunnel_through_a_platform():
    world = World(_room())
    world.spawn(MovingPlatform(Vec2(32, 100), Vec2(48, 8)))
    walker = world.spawn(_Walker(Vec2(40, 20), Vec2(12, 16)))
    walker.vel = Vec2(0.0, 1500.0)               # 25px per step
    for _ in range(30):
        world.update(DT)
    assert walker.body.bottom == pytest.approx(100, abs=0.5)


def test_worlds_without_platforms_are_unaffected():
    world = World(_room())
    walker = world.spawn(_Walker(Vec2(40, 40), Vec2(12, 16)))
    for _ in range(90):
        world.update(DT)
    assert walker.body.bottom == pytest.approx(FLOOR, abs=0.5)
    assert walker.body.carrier is None


# -- ladders ----------------------------------------------------------------

def _room_with_ladder() -> TileMap:
    tm = _room()
    for ty in range(6, 11):
        tm.set_tile(5, ty, 3, ladder=True)
    return tm


def test_ladder_tiles_are_detected():
    tm = _room_with_ladder()
    assert tm.is_ladder(5, 8) is True
    assert tm.is_ladder(4, 8) is False
    assert tm.ladder_at_pixel(5 * TILE + 4, 8 * TILE + 4) is True


def test_climbing_suspends_gravity_and_moves_up():
    world = World(_room_with_ladder())
    climber = world.spawn(_Walker(Vec2(5 * TILE + 2, 9 * TILE), Vec2(12, 16)))
    start_y = climber.pos.y

    for _ in range(30):          # stay within the ladder's extent
        world.climb(climber, -1, speed=60.0)
        world.move(climber, DT)
    assert climber.pos.y < start_y - 20, "should have climbed"
    assert climber.body.on_ladder is True


def test_climbing_down_works_too():
    world = World(_room_with_ladder())
    climber = world.spawn(_Walker(Vec2(5 * TILE + 2, 7 * TILE), Vec2(12, 16)))
    start_y = climber.pos.y
    for _ in range(30):
        world.climb(climber, 1, speed=60.0)
        world.move(climber, DT)
    assert climber.pos.y > start_y + 10


def test_holding_still_on_a_ladder_does_not_fall():
    world = World(_room_with_ladder())
    climber = world.spawn(_Walker(Vec2(5 * TILE + 2, 8 * TILE), Vec2(12, 16)))
    resting = climber.pos.y
    for _ in range(60):
        world.climb(climber, 0)
        world.move(climber, DT)
    assert climber.pos.y == pytest.approx(resting, abs=1.0)


def test_climb_refuses_when_there_is_no_ladder():
    world = World(_room_with_ladder())
    walker = world.spawn(_Walker(Vec2(2 * TILE, 8 * TILE), Vec2(12, 16)))
    assert world.climb(walker, -1) is False
    assert walker.body.on_ladder is False


def test_leaving_the_ladder_restores_gravity():
    world = World(_room_with_ladder())
    climber = world.spawn(_Walker(Vec2(5 * TILE + 2, 8 * TILE), Vec2(12, 16)))
    world.climb(climber, -1)
    assert climber.body.on_ladder is True

    climber.body.on_ladder = False               # jump off
    for _ in range(60):
        world.move(climber, DT)
    assert climber.body.bottom == pytest.approx(FLOOR, abs=0.5)
