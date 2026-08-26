"""Collision — tile resolution and entity queries.

Tile collision
--------------
``move_and_slide`` integrates a body against a solid-tile grid using the
canonical "resolve X, then resolve Y" approach used by virtually every SNES-era
platformer. Separating the axes is what makes corners behave: a body sliding
along a floor doesn't snag on the vertical seams between tiles, and pushing into
a wall while falling still lets gravity slide it downward.

It moves a pixel at a time, so a body can never tunnel through a thin floor no
matter how fast it is going, and it depenetrates first: a body that has somehow
ended up inside geometry (it grew, it was teleported, the level changed) is
pushed back out along the shallowest axis instead of being frozen there forever.

One-way platforms are supported through a ``one_way`` plane on the TileMap: such
a tile blocks only downward motion, and only when the body was already above it,
so you can jump up through a wooden ledge and land on top of it. Set
``body.drop_through`` to fall back down.

Entity collision
----------------
Tiles are not enough for a game — a player needs to touch an enemy, a bullet
needs to hit it. ``overlaps`` and ``query`` answer static questions;
``sweep_aabb`` answers the moving one, because a bullet at 1600 px/s advances 27
pixels per step and a discrete overlap test simply misses an 8-pixel target most
of the time. ``SpatialHash`` keeps broad-phase cost linear once there are more
than a handful of entities.
"""

from __future__ import annotations

import math
from typing import Callable, Iterable, Sequence

import pygame

from ..graphics.tilemap import TileMap
from ..physics.body import Layer, RigidBody2D
from ..utils.vec2 import Vec2


# ---------------------------------------------------------------------------
# Tile collision
# ---------------------------------------------------------------------------

def _blocked(left: int, top: int, right: int, bottom: int, tm: TileMap) -> bool:
    """True if any fully-solid tile overlaps the box. Early-exits."""
    tx0 = left // tm.tile_w
    tx1 = (right - 1) // tm.tile_w
    ty0 = top // tm.tile_h
    ty1 = (bottom - 1) // tm.tile_h
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            if tm.is_solid(tx, ty):
                return True
    return False


def _one_way_floor(left: int, right: int, new_bottom: int, old_bottom: int,
                   tm: TileMap) -> bool:
    """True if a one-way platform should stop a body falling to ``new_bottom``.

    Only the row the feet are entering counts, and only if the body was above
    that row's top edge beforehand — otherwise jumping up through the platform
    would snag on it.
    """
    one_way = getattr(tm, "one_way", None)
    if one_way is None:
        return False
    ty = (new_bottom - 1) // tm.tile_h
    if not (0 <= ty < tm.height):
        return False
    surface = ty * tm.tile_h
    if old_bottom > surface:
        return False        # already inside/below the platform: pass through
    tx0 = max(0, left // tm.tile_w)
    tx1 = min(tm.width - 1, (right - 1) // tm.tile_w)
    for tx in range(tx0, tx1 + 1):
        if one_way[ty, tx]:
            return True
    return False


def depenetrate(body: RigidBody2D, tilemap: TileMap, max_push: int = 64) -> bool:
    """Push ``body`` out of any solid tile it is overlapping.

    Returns True if it had to move. Without this a body that ends up inside
    geometry — after growing, being teleported, or the level changing under it —
    can never move again, because every candidate step is also inside a solid
    and gets rejected.
    """
    w, h = int(body.size.x), int(body.size.y)
    x, y = math.floor(body.pos.x), math.floor(body.pos.y)
    if not _blocked(x, y, x + w, y + h, tilemap):
        return False

    # Try the shallowest escape: search outward one pixel at a time on each
    # axis and take whichever direction frees the body first.
    for dist in range(1, max_push + 1):
        for dx, dy in ((0, -dist), (0, dist), (-dist, 0), (dist, 0)):
            nx, ny = x + dx, y + dy
            if not _blocked(nx, ny, nx + w, ny + h, tilemap):
                body.pos = Vec2(float(nx), float(ny))
                body._remainder = Vec2()
                return True
    return True     # boxed in on every side; leave it where it is


def move_and_slide(body: RigidBody2D, dt: float, gravity: float,
                   tilemap: TileMap) -> None:
    """Integrate ``body`` for ``dt`` against ``tilemap`` solids.

    Applies gravity, moves on X and resolves wall collisions, then moves on Y and
    resolves floor/ceiling collisions, updating ``grounded``/``on_wall``/
    ``on_ceiling`` flags.
    """
    body.prev_pos = body.pos.copy()
    old_bottom = math.floor(body.pos.y) + int(body.size.y)

    # A body inside geometry can't evaluate any move sensibly, so free it first.
    depenetrate(body, tilemap)

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
            nx = math.floor(body.pos.x) + step
            top = math.floor(body.pos.y)
            if _blocked(nx, top, nx + w, top + h, tm):
                body.on_wall = True
                body.vel = Vec2(0.0, body.vel.y)
                body._remainder.x = 0.0
                break
            body.pos = Vec2(float(nx), body.pos.y)

    # --- Y axis ---
    if dy != 0:
        step = 1 if dy > 0 else -1
        for _ in range(abs(dy)):
            ny = math.floor(body.pos.y) + step
            left = math.floor(body.pos.x)
            hit_solid = _blocked(left, ny, left + w, ny + h, tm)
            hit_one_way = (
                not hit_solid and step > 0 and not body.drop_through
                and _one_way_floor(left, left + w, ny + h, old_bottom, tm)
            )
            if hit_solid or hit_one_way:
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
        left = math.floor(body.pos.x)
        below = math.floor(body.pos.y) + 1
        standing = _blocked(left, below, left + w, below + h, tm)
        if not standing and not body.drop_through:
            standing = _one_way_floor(left, left + w, below + h, old_bottom, tm)
        if standing:
            body.grounded = True
            # Without this, gravity keeps accumulating into vel.y while the body
            # rests, so vel.y ratchets 0 -> 15 -> 30 and any "am I falling?"
            # check strobes.
            body.vel = Vec2(body.vel.x, 0.0)
            body._remainder.y = 0.0


# ---------------------------------------------------------------------------
# Entity collision
# ---------------------------------------------------------------------------

def to_rect(thing) -> pygame.Rect:
    """Accept a Rect, a RigidBody2D, or anything exposing ``.rect``."""
    if isinstance(thing, pygame.Rect):
        return thing
    rect = getattr(thing, "rect", None)
    if rect is None:
        raise TypeError(f"{thing!r} is not a Rect and has no .rect")
    return rect


def aabb_overlap(a, b) -> bool:
    """True if two rect-likes overlap. Accepts bodies, sprites, or Rects."""
    return to_rect(a).colliderect(to_rect(b))


overlaps = aabb_overlap


def layers_interact(a: RigidBody2D, b: RigidBody2D) -> bool:
    """True if either body's mask includes the other's layer."""
    return bool(a.mask & b.layer) or bool(b.mask & a.layer)


def query(entities: Iterable, area, *, mask: int = Layer.ALL,
          exclude=None) -> list:
    """Every entity overlapping ``area`` whose layer is in ``mask``."""
    box = to_rect(area)
    out = []
    for ent in entities:
        if ent is exclude or getattr(ent, "active", True) is False:
            continue
        if mask != Layer.ALL and not (mask & getattr(ent, "layer", Layer.ALL)):
            continue
        if box.colliderect(to_rect(ent)):
            out.append(ent)
    return out


def sweep_aabb(moving, delta: Vec2, static) -> float | None:
    """Fraction of ``delta`` at which ``moving`` first touches ``static``.

    Returns a value in [0, 1], or None if they never meet. This is what makes
    fast projectiles reliable: a bullet at 1600 px/s covers 27 pixels in one
    step and a discrete overlap test misses a small target from most starting
    positions, which in play reads as random input loss.
    """
    a = to_rect(moving)
    b = to_rect(static)
    dx, dy = delta.x, delta.y

    if dx == 0.0 and dy == 0.0:
        return 0.0 if a.colliderect(b) else None
    if a.colliderect(b):
        return 0.0

    # Per-axis entry/exit times of the swept box against the static box.
    def axis(a_min, a_max, b_min, b_max, d):
        if d == 0.0:
            # No motion on this axis: overlapping means "always", else "never".
            return (-math.inf, math.inf) if a_max > b_min and a_min < b_max \
                else (math.inf, -math.inf)
        t1 = (b_min - a_max) / d
        t2 = (b_max - a_min) / d
        return (t1, t2) if t1 <= t2 else (t2, t1)

    x_entry, x_exit = axis(a.left, a.right, b.left, b.right, dx)
    y_entry, y_exit = axis(a.top, a.bottom, b.top, b.bottom, dy)

    entry = max(x_entry, y_entry)
    exit_ = min(x_exit, y_exit)
    if entry > exit_ or entry > 1.0 or exit_ < 0.0:
        return None
    return max(0.0, entry)


def sweep_first(moving, delta: Vec2, candidates: Iterable, *,
                mask: int = Layer.ALL, exclude=None):
    """The candidate hit earliest along ``delta``, as ``(entity, t)``."""
    best = None
    best_t = math.inf
    for ent in candidates:
        if ent is exclude or getattr(ent, "active", True) is False:
            continue
        if mask != Layer.ALL and not (mask & getattr(ent, "layer", Layer.ALL)):
            continue
        t = sweep_aabb(moving, delta, ent)
        if t is not None and t < best_t:
            best, best_t = ent, t
    return (best, best_t) if best is not None else (None, None)


class SpatialHash:
    """A uniform grid broad-phase.

    Checking every entity against every other is O(n^2) and already eats a
    noticeable slice of the 16.6 ms step at 50 entities. Bucketing by cell makes
    the common case linear.
    """

    def __init__(self, cell: int = 32) -> None:
        self.cell = max(1, cell)
        self._buckets: dict[tuple[int, int], list] = {}

    def clear(self) -> None:
        self._buckets.clear()

    def insert(self, entity) -> None:
        rect = to_rect(entity)
        for key in self._keys(rect):
            self._buckets.setdefault(key, []).append(entity)

    def rebuild(self, entities: Iterable) -> None:
        self.clear()
        for ent in entities:
            if getattr(ent, "active", True):
                self.insert(ent)

    def _keys(self, rect: pygame.Rect):
        cell = self.cell
        for cy in range(rect.top // cell, (rect.bottom - 1) // cell + 1):
            for cx in range(rect.left // cell, (rect.right - 1) // cell + 1):
                yield (cx, cy)

    def query(self, area, *, mask: int = Layer.ALL, exclude=None) -> list:
        box = to_rect(area)
        seen: set[int] = set()
        out = []
        for key in self._keys(box):
            for ent in self._buckets.get(key, ()):
                if id(ent) in seen or ent is exclude:
                    continue
                seen.add(id(ent))
                if mask != Layer.ALL and not (mask & getattr(ent, "layer", Layer.ALL)):
                    continue
                if box.colliderect(to_rect(ent)):
                    out.append(ent)
        return out

    def pairs(self) -> list[tuple]:
        """Every distinct pair of entities sharing a cell and overlapping."""
        found: set[tuple[int, int]] = set()
        out = []
        for bucket in self._buckets.values():
            for i, a in enumerate(bucket):
                for b in bucket[i + 1:]:
                    key = (id(a), id(b)) if id(a) < id(b) else (id(b), id(a))
                    if key in found:
                        continue
                    found.add(key)
                    if to_rect(a).colliderect(to_rect(b)):
                        out.append((a, b))
        return out


def resolve_overlaps(entities: Sequence, on_overlap: Callable, *,
                     cell: int = 32, respect_layers: bool = True) -> None:
    """Call ``on_overlap(a, b)`` for every overlapping, interacting pair."""
    grid = SpatialHash(cell)
    grid.rebuild(entities)
    for a, b in grid.pairs():
        if respect_layers and isinstance(a, RigidBody2D) and isinstance(b, RigidBody2D):
            if not layers_interact(a, b):
                continue
        on_overlap(a, b)
