"""Collision — tile-based AABB resolution.

The core routine, ``move_and_slide``, integrates a body against a solid-tile
grid using the canonical "resolve X, then resolve Y" approach used by virtually
every SNES-era platformer. Separating the axes is what makes corners behave: a
body sliding along a floor doesn't snag on the vertical seams between tiles, and
pushing into a wall while falling still lets gravity slide it downward.

These are free functions, not methods on a system object — collision is pure
logic over a body and a tilemap, and keeping it functional makes it trivial to
unit test headlessly.
"""

from __future__ import annotations

from ..graphics.tilemap import TileMap
from ..physics.body import RigidBody2D
from ..utils.vec2 import Vec2


def _solid_tiles_overlapping(left: int, top: int, right: int, bottom: int,
                             tm: TileMap) -> list[tuple[int, int]]:
    tx0 = left // tm.tile_w
    tx1 = (right - 1) // tm.tile_w
    ty0 = top // tm.tile_h
    ty1 = (bottom - 1) // tm.tile_h
    hits: list[tuple[int, int]] = []
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            if tm.is_solid(tx, ty):
                hits.append((tx, ty))
    return hits


def move_and_slide(body: RigidBody2D, dt: float, gravity: float,
                   tilemap: TileMap) -> None:
    """Integrate ``body`` for ``dt`` against ``tilemap`` solids.

    Applies gravity, moves on X and resolves wall collisions, then moves on Y and
    resolves floor/ceiling collisions, updating ``grounded``/``on_wall``/
    ``on_ceiling`` flags.
    """
    body.vel = Vec2(body.vel.x, body.vel.y + gravity * body.gravity_scale * dt)

    dx, dy = body.consume_motion(dt)

    body.on_wall = False
    body.grounded = False
    body.on_ceiling = False

    tm = tilemap
    w = int(body.size.x)
    h = int(body.size.y)

    # --- X axis ---
    if dx != 0:
        step = 1 if dx > 0 else -1
        for _ in range(abs(dx)):
            nx = int(body.pos.x) + step
            top = int(body.pos.y)
            if _solid_tiles_overlapping(nx, top, nx + w, top + h, tm):
                body.on_wall = True
                body.vel = Vec2(0.0, body.vel.y)
                body._remainder.x = 0.0
                break
            body.pos = Vec2(float(nx), body.pos.y)

    # --- Y axis ---
    if dy != 0:
        step = 1 if dy > 0 else -1
        for _ in range(abs(dy)):
            ny = int(body.pos.y) + step
            left = int(body.pos.x)
            if _solid_tiles_overlapping(left, ny, left + w, ny + h, tm):
                if step > 0:
                    body.grounded = True
                else:
                    body.on_ceiling = True
                body.vel = Vec2(body.vel.x, 0.0)
                body._remainder.y = 0.0
                break
            body.pos = Vec2(body.pos.x, float(ny))

    # Ground probe: at rest, per-frame gravity may be too small to move a whole
    # pixel, so the loop above never tests the floor. Probe one pixel below to
    # keep ``grounded`` stable (and jumping reliable) whenever falling/at rest.
    if not body.grounded and body.vel.y >= 0.0:
        left = int(body.pos.x)
        below = int(body.pos.y) + 1
        if _solid_tiles_overlapping(left, below, left + w, below + h, tm):
            body.grounded = True


def aabb_overlap(a, b) -> bool:
    """True if two pygame.Rect-likes overlap."""
    return a.colliderect(b)
