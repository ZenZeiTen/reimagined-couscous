"""Entity and World — the game-object layer.

A ``Sprite`` draws and a ``RigidBody2D`` moves, but a game needs something that
owns both, has behaviour, and can be spawned and killed while fifty others are
mid-update. That is ``Entity``. ``World`` owns the collection: it holds the
tilemap and gravity, runs everyone in a stable order, defers spawns and deaths
until the frame is over so the list is never mutated underneath an iteration,
maintains a broad-phase grid, and draws by priority instead of by whatever order
the scene happened to call things in.

    class Goblin(rf.Entity):
        def __init__(self, pos):
            super().__init__(pos, rf.Vec2(12, 16), layer=rf.Layer.ENEMY)
            self.hp = 3

        def update(self, dt, world):
            self.body.vel = rf.Vec2(-30.0, self.body.vel.y)
            world.move(self, dt)

    world = rf.World(tilemap, gravity=900.0)
    world.spawn(Goblin(rf.Vec2(64, 32)))
    world.update(dt)
    world.draw(renderer.target, camera, renderer.palette)

Entities are drawn low ``priority`` first, so a ``priority`` of 0 puts an entity
behind the pack and 2 in front. Within one priority they draw in spawn order.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Iterator, Sequence

import pygame

from .graphics.sprite import AnimatedSprite, Sprite
from .graphics.tilemap import TileMap
from .physics.body import Layer, RigidBody2D
from .physics.collision import SpatialHash, move_and_slide, to_rect
from .renderer.palette import ColorPalette
from .utils.vec2 import Vec2


class Entity:
    """A game object: a body, an optional sprite, and behaviour."""

    def __init__(
        self,
        pos: Vec2,
        size: Vec2,
        *,
        sprite: Sprite | AnimatedSprite | None = None,
        layer: int = Layer.NONE,
        mask: int = Layer.ALL,
        gravity_scale: float = 1.0,
        priority: int = 1,
        tags: Iterable[str] = (),
    ) -> None:
        self.body = RigidBody2D(pos, size, gravity_scale=gravity_scale,
                                layer=layer, mask=mask)
        self.anim: AnimatedSprite | None = None
        self.sprite: Sprite | None = None
        if isinstance(sprite, AnimatedSprite):
            self.anim = sprite
            self.sprite = sprite.sprite
        else:
            self.sprite = sprite

        self.alive = True
        self.priority = priority
        self.tags = set(tags)
        self.world: World | None = None

    # -- convenience passthroughs --------------------------------------------
    @property
    def pos(self) -> Vec2:
        return self.body.pos

    @pos.setter
    def pos(self, value: Vec2) -> None:
        # A plain move, keeping sub-pixel motion intact. Use ``body.teleport``
        # for a respawn, which also drops the accumulator and swept history.
        self.body.pos = value

    @property
    def vel(self) -> Vec2:
        return self.body.vel

    @vel.setter
    def vel(self, value: Vec2) -> None:
        self.body.vel = value

    @property
    def rect(self) -> pygame.Rect:
        return self.body.rect

    @property
    def center(self) -> Vec2:
        return self.body.center

    @property
    def layer(self) -> int:
        return self.body.layer

    @property
    def active(self) -> bool:
        return self.alive and self.body.active

    @property
    def facing(self) -> int:
        return self.body.facing

    @facing.setter
    def facing(self, value: int) -> None:
        self.body.facing = 1 if value >= 0 else -1

    def has_tag(self, tag: str) -> bool:
        return tag in self.tags

    def kill(self) -> None:
        """Mark for removal at the end of this frame."""
        self.alive = False

    # -- lifecycle hooks ------------------------------------------------------
    def on_spawn(self, world: World) -> None:
        """Called once when added to a world."""

    def on_despawn(self) -> None:
        """Called once when removed from a world."""

    def update(self, dt: float, world: World) -> None:
        """Advance this entity. Call ``world.move(self, dt)`` to apply physics."""

    def draw(self, surface: pygame.Surface, camera_x: float, camera_y: float,
             palette: ColorPalette | None = None) -> None:
        if self.sprite is None:
            return
        self.sprite.pos = self.body.pos
        self.sprite.flip_h = self.body.facing < 0
        self.sprite.draw(surface, camera_x, camera_y, palette)


class MovingPlatform(Entity):
    """A kinematic ledge that carries whatever is standing on it.

    It patrols a list of waypoints at a constant speed. Riders are landed on it
    from above only — which is how 16-bit moving platforms behaved, and what lets
    a player jump up through one — and inherit its motion, so a platform can
    carry you sideways over a pit or lift you to a ledge.
    """

    def __init__(
        self,
        pos: Vec2,
        size: Vec2,
        waypoints: Sequence[Vec2] = (),
        *,
        speed: float = 40.0,
        mode: str = "pingpong",
        wait: float = 0.0,
        **kwargs,
    ) -> None:
        kwargs.setdefault("gravity_scale", 0.0)
        kwargs.setdefault("priority", 0)
        super().__init__(pos, size, **kwargs)
        #: The full route, starting at the spawn position.
        self.waypoints: list[Vec2] = [pos.copy(), *(w.copy() for w in waypoints)]
        self.speed = speed
        self.mode = mode          # "pingpong" turns around, "cycle" loops
        self.wait = wait          # pause on reaching each waypoint
        #: Displacement applied by the most recent step; riders inherit it.
        self.delta = Vec2()
        self._target = 1 if len(self.waypoints) > 1 else 0
        self._step = 1
        self._waiting = 0.0
        self.tags.add("platform")

    def advance(self, dt: float) -> None:
        """Move one step along the route, recording ``delta`` for riders."""
        before = self.body.pos.copy()
        if len(self.waypoints) > 1 and self.speed > 0.0:
            if self._waiting > 0.0:
                self._waiting = max(0.0, self._waiting - dt)
            else:
                self._advance_toward_target(dt)
        self.delta = Vec2(self.body.pos.x - before.x, self.body.pos.y - before.y)
        self.body.prev_pos = before

    def _advance_toward_target(self, dt: float) -> None:
        target = self.waypoints[self._target]
        to_x = target.x - self.body.pos.x
        to_y = target.y - self.body.pos.y
        distance = math.hypot(to_x, to_y)
        travel = self.speed * dt

        if distance <= travel or distance == 0.0:
            self.body.pos = target.copy()
            self._waiting = self.wait
            self._next_target()
            return
        self.body.pos = Vec2(self.body.pos.x + to_x / distance * travel,
                             self.body.pos.y + to_y / distance * travel)

    def _next_target(self) -> None:
        if self.mode == "cycle":
            self._target = (self._target + 1) % len(self.waypoints)
            return
        # Ping-pong: reverse at either end of the route.
        nxt = self._target + self._step
        if not 0 <= nxt < len(self.waypoints):
            self._step = -self._step
            nxt = self._target + self._step
        self._target = nxt

    def carries(self, other: Entity) -> bool:
        """True if ``other`` is resting on this platform's top surface."""
        rider, mine = other.body, self.body
        if rider is mine:
            return False
        if rider.right <= mine.pos.x or rider.pos.x >= mine.right:
            return False
        return -1.0 <= rider.bottom - mine.pos.y <= 1.0


class World:
    """Owns the entities, the level, and the order things happen in."""

    def __init__(
        self,
        tilemap: TileMap | None = None,
        *,
        gravity: float = 900.0,
        cell: int = 32,
    ) -> None:
        self.tilemap = tilemap
        self.gravity = gravity
        self.entities: list[Entity] = []
        self.grid = SpatialHash(cell)
        self.time = 0.0
        self._pending: list[Entity] = []
        self._iterating = False

    # -- membership -----------------------------------------------------------
    def spawn(self, entity: Entity) -> Entity:
        """Add an entity. During an update it joins at the end of the frame."""
        entity.world = self
        # Pooled entities are respawned after being killed; without this they
        # arrive already flagged dead and are swept out again the same frame.
        entity.alive = True
        if self._iterating:
            self._pending.append(entity)
        else:
            self.entities.append(entity)
            entity.on_spawn(self)
        return entity

    def spawn_all(self, entities: Iterable[Entity]) -> None:
        for e in entities:
            self.spawn(e)

    def remove(self, entity: Entity) -> None:
        entity.kill()

    def clear(self) -> None:
        for e in self.entities:
            e.on_despawn()
        self.entities.clear()
        self._pending.clear()
        self.grid.clear()

    def __iter__(self) -> Iterator[Entity]:
        return iter(self.entities)

    def __len__(self) -> int:
        return len(self.entities)

    # -- per-frame ------------------------------------------------------------
    def update(self, dt: float) -> None:
        self.time += dt

        # Kinematic platforms move first, so a rider that integrates this frame
        # already sees the platform where it will be, not where it was.
        platforms = [e for e in self.entities
                     if isinstance(e, MovingPlatform) and e.active]
        for platform in platforms:
            platform.advance(dt)

        # Carry riders along before they run their own physics.
        if platforms:
            for entity in self.entities:
                carrier = entity.body.carrier
                if carrier is not None and carrier.alive and carrier.active:
                    entity.body.pos = Vec2(entity.body.pos.x + carrier.delta.x,
                                           entity.body.pos.y + carrier.delta.y)

        self._iterating = True
        try:
            for entity in self.entities:
                if entity.active:
                    entity.update(dt, self)
                    if entity.anim is not None:
                        entity.anim.update(dt)
        finally:
            self._iterating = False

        # Land anything that fell onto a platform, then record who rides what so
        # the next frame can carry them.
        if platforms:
            for entity in self.entities:
                if entity.active and not isinstance(entity, MovingPlatform):
                    self._settle_on_platforms(entity, platforms)

        # Deferred membership changes, so spawning or killing mid-update is safe.
        if self._pending:
            for entity in self._pending:
                self.entities.append(entity)
                entity.on_spawn(self)
            self._pending.clear()

        dead = [e for e in self.entities if not e.alive]
        if dead:
            for entity in dead:
                entity.on_despawn()
                entity.world = None
            self.entities = [e for e in self.entities if e.alive]

        self.grid.rebuild(self.entities)

    def on_ladder(self, entity: Entity) -> bool:
        """True if the entity's middle is inside a climbable tile."""
        if self.tilemap is None:
            return False
        centre = entity.body.center
        return self.tilemap.ladder_at_pixel(int(centre.x), int(centre.y))

    def climb(self, entity: Entity, direction: int, speed: float = 60.0) -> bool:
        """Attach to a ladder and move up (-1) or down (+1) it.

        Returns False when there is no ladder to climb, so the caller can fall
        back to ordinary walking. Detaching is just ``entity.body.on_ladder =
        False`` — a jump, or stepping off the side.
        """
        body = entity.body
        if not self.on_ladder(entity):
            body.on_ladder = False
            return False
        body.on_ladder = True
        body.vel = Vec2(body.vel.x, direction * speed)
        return True

    def _settle_on_platforms(self, entity: Entity,
                             platforms: list[MovingPlatform]) -> None:
        """Land ``entity`` on a platform it crossed, and note its carrier."""
        body = entity.body
        body.carrier = None
        if body.vel.y < 0.0 or body.drop_through:
            return          # rising, or deliberately dropping through

        feet = body.bottom
        prev_feet = body.prev_pos.y + body.size.y
        for platform in platforms:
            top = platform.body.pos.y
            if body.right <= platform.body.pos.x or body.pos.x >= platform.body.right:
                continue
            # Compare against where the feet were, so a fast fall cannot pass
            # straight through the ledge between two steps.
            if prev_feet <= top + 1.0 <= feet + 1.0:
                body.pos = Vec2(body.pos.x, top - body.size.y)
                body.vel = Vec2(body.vel.x, 0.0)
                body._remainder.y = 0.0
                body.grounded = True
                body.carrier = platform
                return

    def move(self, entity: Entity, dt: float, *, gravity: float | None = None) -> None:
        """Integrate one entity against the tilemap."""
        if self.tilemap is None:
            body = entity.body
            dx, dy = body.consume_motion(dt)
            body.prev_pos = body.pos.copy()
            body.pos = Vec2(body.pos.x + dx, body.pos.y + dy)
            return
        move_and_slide(entity.body, dt,
                       self.gravity if gravity is None else gravity,
                       self.tilemap)

    def draw(self, surface: pygame.Surface, camera=None,
             palette: ColorPalette | None = None) -> None:
        """Draw every entity, lowest ``priority`` first, then spawn order."""
        cx, cy = _camera_offset(camera)
        for entity in sorted(self.entities, key=lambda e: e.priority):
            if entity.active:
                entity.draw(surface, cx, cy, palette)

    # -- queries --------------------------------------------------------------
    def rebuild_grid(self) -> None:
        """Re-bucket every entity at its current position.

        The broadphase is built once per ``update`` and tolerates about a cell
        of movement after that (see ``SpatialHash.insert``), which covers normal
        per-step motion. Call this after moving something a long way mid-step —
        a teleport, a warp, a level-load reposition — so queries see it where it
        actually is.
        """
        self.grid.rebuild(self.entities)

    def query(self, area, *, mask: int = Layer.ALL, exclude=None) -> list[Entity]:
        """Entities overlapping ``area`` whose layer is in ``mask``."""
        return self.grid.query(area, mask=mask, exclude=exclude)

    def overlapping(self, entity: Entity, *, mask: int | None = None) -> list[Entity]:
        """Entities touching ``entity``, filtered by its own mask by default."""
        return self.grid.query(
            to_rect(entity),
            mask=entity.body.mask if mask is None else mask,
            exclude=entity,
        )

    def find(self, tag: str) -> list[Entity]:
        return [e for e in self.entities if tag in e.tags]

    def first(self, tag: str) -> Entity | None:
        for e in self.entities:
            if tag in e.tags:
                return e
        return None

    def of_type(self, cls: type) -> list[Entity]:
        return [e for e in self.entities if isinstance(e, cls)]

    def each(self, fn: Callable[[Entity], None], *, tag: str | None = None) -> None:
        for e in self.entities:
            if tag is None or tag in e.tags:
                fn(e)


def _camera_offset(camera) -> tuple[float, float]:
    """Accept a Camera2D, a Vec2/tuple offset, or None."""
    if camera is None:
        return 0.0, 0.0
    top_left = getattr(camera, "top_left", None)
    if top_left is not None:
        return float(top_left.x), float(top_left.y)
    if isinstance(camera, Vec2):
        return camera.x, camera.y
    return float(camera[0]), float(camera[1])
