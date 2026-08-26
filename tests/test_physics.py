"""Tile collision, depenetration, one-way platforms, and entity collision."""

from __future__ import annotations

import pygame
import pytest

from retroforge.graphics.tilemap import TileMap
from retroforge.physics.body import Layer, RigidBody2D
from retroforge.physics.collision import (
    SpatialHash,
    depenetrate,
    move_and_slide,
    query,
    resolve_overlaps,
    sweep_aabb,
    sweep_first,
)
from retroforge.utils.vec2 import Vec2

TILE = 16
DT = 1 / 60
GRAVITY = 900.0


def _room(cols: int = 10, rows: int = 8, floor_row: int = 5) -> TileMap:
    """A room with a solid floor across ``floor_row`` and nothing else."""
    tm = TileMap(cols, rows, TILE, TILE)
    tm.solid[floor_row, :] = True
    return tm


def _drop(body: RigidBody2D, tm: TileMap, frames: int, vel=None) -> None:
    for _ in range(frames):
        if vel is not None:
            body.vel = Vec2(vel.x, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)


# -- basic resolution -------------------------------------------------------

def test_body_lands_on_the_floor_and_stays():
    tm = _room(floor_row=5)
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    _drop(body, tm, 120)
    assert body.grounded
    assert body.bottom == pytest.approx(5 * TILE, abs=1.0)


def test_walking_into_a_wall_stops_horizontal_motion():
    tm = _room()
    tm.solid[:, 6] = True
    body = RigidBody2D(Vec2(32, 4 * TILE), Vec2(12, 16))
    for _ in range(120):
        body.vel = Vec2(200.0, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.on_wall
    assert body.right <= 6 * TILE


def test_a_fast_body_cannot_tunnel_through_a_thin_floor():
    tm = _room(floor_row=5)
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    body.vel = Vec2(0.0, 6000.0)         # 100 px per step, floor is 16 thick
    for _ in range(10):
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.bottom <= 5 * TILE + 1, "body fell through the floor"


def test_hitting_a_ceiling_sets_the_flag_and_kills_upward_velocity():
    tm = _room(floor_row=7)
    tm.solid[2, :] = True
    body = RigidBody2D(Vec2(32, 3 * TILE + 4), Vec2(12, 16))
    for _ in range(10):
        body.vel = Vec2(0.0, -400.0)
        move_and_slide(body, DT, GRAVITY, tm)
        if body.on_ceiling:
            break
    assert body.on_ceiling
    assert body.pos.y >= 3 * TILE


# -- resting velocity -------------------------------------------------------

def test_resting_body_keeps_vertical_velocity_at_zero():
    """vel.y used to ratchet 0 -> 15 -> 30 every three frames while idle.

    Game code keys animations and fall-damage off vel.y, so a standing
    character strobed between 'idle' and 'fall' at 20 Hz.
    """
    tm = _room(floor_row=5)
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    _drop(body, tm, 60)                 # settle

    observed = []
    for _ in range(60):
        move_and_slide(body, DT, GRAVITY, tm)
        observed.append(body.vel.y)
    assert max(observed) == 0.0, f"vel.y ratcheted while resting: {set(observed)}"
    assert all(body.grounded for _ in observed)


def test_grounded_stays_true_across_many_resting_frames():
    tm = _room(floor_row=5)
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    _drop(body, tm, 60)
    flags = []
    for _ in range(60):
        move_and_slide(body, DT, GRAVITY, tm)
        flags.append(body.grounded)
    assert all(flags), "grounded flickered at rest, so jumping would be unreliable"


def test_walking_off_a_ledge_clears_grounded():
    tm = TileMap(10, 8, TILE, TILE)
    tm.solid[5, 0:4] = True             # floor ends at tile x=3
    body = RigidBody2D(Vec2(16, 4 * TILE), Vec2(12, 16))
    _drop(body, tm, 5)
    assert body.grounded

    went_airborne = False
    for _ in range(60):
        body.vel = Vec2(200.0, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)
        if not body.grounded:
            went_airborne = True
    assert went_airborne, "body kept standing on thin air past the ledge"
    assert body.pos.y > 5 * TILE


def test_a_pit_map_lets_a_body_fall_out_of_the_bottom():
    tm = TileMap(10, 8, TILE, TILE)
    tm.solid[5, 0:4] = True
    tm.oob_solid_below = False
    body = RigidBody2D(Vec2(6 * TILE, 0), Vec2(12, 16))
    for _ in range(120):
        move_and_slide(body, DT, GRAVITY, tm)
    assert not body.grounded
    assert body.pos.y > tm.pixel_height, "body landed on an invisible floor"


def test_out_of_bounds_is_solid_by_default():
    tm = TileMap(4, 4, TILE, TILE)
    body = RigidBody2D(Vec2(0, 0), Vec2(12, 16))
    for _ in range(120):
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.grounded
    assert body.bottom <= tm.pixel_height


# -- depenetration ----------------------------------------------------------

def test_a_body_that_grows_into_the_floor_is_pushed_out_not_frozen():
    """Growing (a powerup) used to wedge the body inside the floor forever."""
    tm = _room(floor_row=5)
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    _drop(body, tm, 60)
    assert body.grounded

    body.size = Vec2(12, 24)            # feet now 8px inside the floor
    start = body.pos.copy()
    for _ in range(120):
        body.vel = Vec2(120.0, body.vel.y)
        move_and_slide(body, DT, GRAVITY, tm)

    assert body.pos != start, "body is permanently stuck inside the floor"
    assert body.pos.x > start.x, "body could not walk after growing"
    assert body.bottom <= 5 * TILE + 1


def test_depenetrate_reports_whether_it_moved():
    tm = _room(floor_row=5)
    clear = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    assert depenetrate(clear, tm) is False

    stuck = RigidBody2D(Vec2(32, 5 * TILE + 4), Vec2(12, 16))
    assert depenetrate(stuck, tm) is True
    assert not tm.is_solid(int(stuck.pos.x) // TILE, int(stuck.pos.y) // TILE)


def test_teleporting_into_geometry_recovers():
    tm = _room(floor_row=5)
    body = RigidBody2D(Vec2(32, 0), Vec2(12, 16))
    body.teleport(Vec2(32, 5 * TILE))   # fully inside the floor row
    move_and_slide(body, DT, GRAVITY, tm)
    assert body.bottom <= 5 * TILE + 1


# -- one-way platforms ------------------------------------------------------

def _platform_room() -> TileMap:
    tm = TileMap(10, 12, TILE, TILE)
    tm.solid[10, :] = True              # ground
    tm.one_way[6, 2:8] = True           # jump-through ledge
    return tm


def test_a_body_can_jump_up_through_a_one_way_platform():
    tm = _platform_room()
    body = RigidBody2D(Vec2(64, 9 * TILE), Vec2(12, 16))
    _drop(body, tm, 30)
    assert body.grounded

    # Enough to clear the ledge at row 6 without escaping the top of the map.
    body.vel = Vec2(0.0, -430.0)
    cleared = False
    for _ in range(40):
        move_and_slide(body, DT, GRAVITY, tm)
        if body.on_ceiling:
            break
        if body.bottom < 6 * TILE:
            cleared = True
    assert not body.on_ceiling, "one-way platform blocked an upward jump"
    assert cleared, "body did not rise above the platform"


def test_a_body_lands_on_a_one_way_platform_from_above():
    tm = _platform_room()
    body = RigidBody2D(Vec2(64, 2 * TILE), Vec2(12, 16))
    for _ in range(120):
        move_and_slide(body, DT, GRAVITY, tm)
        if body.grounded:
            break
    assert body.grounded
    assert body.bottom == pytest.approx(6 * TILE, abs=1.0)


def test_drop_through_lets_a_body_fall_off_a_one_way_platform():
    tm = _platform_room()
    body = RigidBody2D(Vec2(64, 2 * TILE), Vec2(12, 16))
    for _ in range(120):
        move_and_slide(body, DT, GRAVITY, tm)
        if body.grounded:
            break
    assert body.bottom == pytest.approx(6 * TILE, abs=1.0)

    body.drop_through = True
    for _ in range(120):
        move_and_slide(body, DT, GRAVITY, tm)
    assert body.bottom == pytest.approx(10 * TILE, abs=1.0), "did not drop through"


def test_a_one_way_platform_does_not_block_horizontal_movement():
    tm = _platform_room()
    body = RigidBody2D(Vec2(16, 5 * TILE), Vec2(12, 16))   # level with the ledge
    for _ in range(30):
        body.vel = Vec2(200.0, 0.0)
        move_and_slide(body, DT, 0.0, tm)
    assert body.pos.x > 100, "one-way tile acted as a wall"


# -- swept entity collision -------------------------------------------------

def test_sweep_catches_a_fast_bullet_a_discrete_test_would_miss():
    """A bullet at 1600 px/s moves 27px a step; a static test misses an 8px target."""
    target = pygame.Rect(100, 50, 8, 8)
    delta = Vec2(27.0, 0.0)
    misses = 0
    for start_x in range(60, 120):
        bullet = pygame.Rect(start_x, 50, 4, 4)
        moved = bullet.move(int(delta.x), int(delta.y))
        if not (bullet.colliderect(target) or moved.colliderect(target)):
            misses += 1
        assert sweep_aabb(bullet, delta, target) is not None or \
            not _passes_through(bullet, delta, target)
    assert misses > 0, "test setup should include positions a discrete test misses"


def _passes_through(rect: pygame.Rect, delta: Vec2, target: pygame.Rect) -> bool:
    """True if a fine-grained walk of the motion would touch the target."""
    steps = int(max(abs(delta.x), abs(delta.y))) + 1
    for i in range(steps + 1):
        probe = rect.move(int(delta.x * i / steps), int(delta.y * i / steps))
        if probe.colliderect(target):
            return True
    return False


def test_sweep_returns_the_fraction_of_travel_at_first_contact():
    mover = pygame.Rect(0, 0, 10, 10)
    target = pygame.Rect(50, 0, 10, 10)
    t = sweep_aabb(mover, Vec2(100, 0), target)
    assert t == pytest.approx(0.4, abs=0.01)     # travels 40 of 100 to touch


def test_sweep_returns_none_when_the_paths_do_not_cross():
    mover = pygame.Rect(0, 0, 10, 10)
    target = pygame.Rect(50, 400, 10, 10)
    assert sweep_aabb(mover, Vec2(100, 0), target) is None


def test_sweep_reports_zero_for_an_already_overlapping_pair():
    a = pygame.Rect(0, 0, 10, 10)
    b = pygame.Rect(5, 5, 10, 10)
    assert sweep_aabb(a, Vec2(50, 0), b) == 0.0


def test_sweep_with_no_motion_is_a_static_test():
    a = pygame.Rect(0, 0, 10, 10)
    assert sweep_aabb(a, Vec2(0, 0), pygame.Rect(5, 5, 10, 10)) == 0.0
    assert sweep_aabb(a, Vec2(0, 0), pygame.Rect(90, 90, 10, 10)) is None


def test_sweep_first_picks_the_nearest_target():
    bullet = pygame.Rect(0, 0, 4, 4)
    near = RigidBody2D(Vec2(20, 0), Vec2(8, 8), layer=Layer.ENEMY)
    far = RigidBody2D(Vec2(60, 0), Vec2(8, 8), layer=Layer.ENEMY)
    hit, t = sweep_first(bullet, Vec2(200, 0), [far, near])
    assert hit is near and 0.0 < t < 1.0


def test_sweep_first_respects_the_layer_mask():
    bullet = pygame.Rect(0, 0, 4, 4)
    ally = RigidBody2D(Vec2(20, 0), Vec2(8, 8), layer=Layer.PLAYER)
    enemy = RigidBody2D(Vec2(60, 0), Vec2(8, 8), layer=Layer.ENEMY)
    hit, _ = sweep_first(bullet, Vec2(200, 0), [ally, enemy], mask=Layer.ENEMY)
    assert hit is enemy


# -- entity queries ---------------------------------------------------------

def test_query_finds_overlapping_entities_by_layer():
    enemies = [RigidBody2D(Vec2(x, 0), Vec2(8, 8), layer=Layer.ENEMY)
               for x in (0, 20, 40)]
    pickup = RigidBody2D(Vec2(20, 0), Vec2(8, 8), layer=Layer.PICKUP)
    area = pygame.Rect(15, 0, 30, 8)

    found = query(enemies + [pickup], area, mask=Layer.ENEMY)
    assert set(id(e) for e in found) == {id(enemies[1]), id(enemies[2])}


def test_query_skips_inactive_entities():
    a = RigidBody2D(Vec2(0, 0), Vec2(8, 8), layer=Layer.ENEMY)
    b = RigidBody2D(Vec2(0, 0), Vec2(8, 8), layer=Layer.ENEMY)
    b.active = False
    assert query([a, b], pygame.Rect(0, 0, 8, 8)) == [a]


def test_hitbox_mirrors_when_the_body_faces_left():
    body = RigidBody2D(Vec2(100, 50), Vec2(16, 16))
    body.hitboxes["sword"] = (16, 4, 12, 8)      # to the right of the body
    assert body.hitbox("sword").left == 116
    body.facing = -1
    assert body.hitbox("sword").right == 100, "hitbox should mirror to the left"


def test_layers_interact_is_symmetric_on_either_mask():
    from retroforge.physics.collision import layers_interact
    shot = RigidBody2D(Vec2(0, 0), Vec2(4, 4),
                       layer=Layer.PLAYER_SHOT, mask=Layer.ENEMY)
    enemy = RigidBody2D(Vec2(0, 0), Vec2(8, 8),
                        layer=Layer.ENEMY, mask=Layer.PLAYER)
    assert layers_interact(shot, enemy)

    pickup = RigidBody2D(Vec2(0, 0), Vec2(8, 8),
                         layer=Layer.PICKUP, mask=Layer.PLAYER)
    assert not layers_interact(shot, pickup)


# -- broad phase ------------------------------------------------------------

def test_spatial_hash_finds_the_same_pairs_as_brute_force():
    bodies = [RigidBody2D(Vec2((i * 13) % 200, (i * 29) % 150), Vec2(10, 10))
              for i in range(60)]
    grid = SpatialHash(32)
    grid.rebuild(bodies)
    got = {tuple(sorted((id(a), id(b)))) for a, b in grid.pairs()}

    expected = set()
    for i, a in enumerate(bodies):
        for b in bodies[i + 1:]:
            if a.rect.colliderect(b.rect):
                expected.add(tuple(sorted((id(a), id(b)))))
    assert got == expected


def test_spatial_hash_query_matches_a_linear_scan():
    bodies = [RigidBody2D(Vec2(i * 7 % 300, i * 11 % 200), Vec2(12, 12),
                          layer=Layer.ENEMY) for i in range(80)]
    grid = SpatialHash(32)
    grid.rebuild(bodies)
    area = pygame.Rect(40, 40, 60, 60)
    assert {id(e) for e in grid.query(area)} == {
        id(b) for b in bodies if b.rect.colliderect(area)
    }


def test_resolve_overlaps_only_reports_interacting_layers():
    player = RigidBody2D(Vec2(0, 0), Vec2(16, 16),
                         layer=Layer.PLAYER, mask=Layer.ENEMY | Layer.PICKUP)
    enemy = RigidBody2D(Vec2(4, 4), Vec2(16, 16),
                        layer=Layer.ENEMY, mask=Layer.PLAYER)
    other_enemy = RigidBody2D(Vec2(8, 8), Vec2(16, 16),
                              layer=Layer.ENEMY, mask=Layer.PLAYER)

    hits = []
    resolve_overlaps([player, enemy, other_enemy], lambda a, b: hits.append((a, b)))
    pairs = {tuple(sorted((id(a), id(b)))) for a, b in hits}
    assert tuple(sorted((id(player), id(enemy)))) in pairs
    assert tuple(sorted((id(enemy), id(other_enemy)))) not in pairs, \
        "enemies do not mask each other"
