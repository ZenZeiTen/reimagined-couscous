"""EntityRegistry — spawn entities from a level file instead of from code.

Placing objects in Tiled already works: the importer keeps every object layer in
``TileMap.objects``. Turning them into entities did not, though — that was a
hand-written loop per type::

    for obj in tilemap.find_objects(type="coin"):
        world.spawn(Coin(Vec2(obj.x, obj.y), coin_sheet))
    for obj in tilemap.find_objects(type="enemy"):
        world.spawn(Walker(Vec2(obj.x, obj.y), enemy_sheet, obj.get("range", 48)))

So every new kind of thing in a level meant new Python, and a level designer —
or a tool generating levels — could not add content on their own.

A registry maps the object's Tiled type to a factory once, and then the level
file decides what exists::

    registry = EntityRegistry()

    @registry.spawns("coin")
    def make_coin(obj, ctx):
        return Coin(Vec2(obj.x, obj.y), ctx["coin_sheet"])

    spawned = registry.populate(world, tilemap, context={"coin_sheet": sheet})
    player = spawned.first("spawn")

``validate`` answers the question a level tool actually needs — *which object
types in this map does nothing handle?* — which is what makes a map checkable
before it is ever run.
"""

from __future__ import annotations

import warnings
from collections.abc import Callable, Iterator
from typing import Any

from .entity import Entity, World
from .graphics.tilemap import MapObject, TileMap
from .utils.vec2 import Vec2

#: A factory takes the map object and the shared context, and returns an entity
#: (or None to skip this one — useful for objects that only mark a location).
Factory = Callable[[MapObject, dict], Entity | None]

# What to do about an object whose type nothing is registered for.
ON_UNKNOWN = ("ignore", "warn", "raise")


class SpawnResult:
    """What ``populate`` produced, grouped by the Tiled type that made it."""

    def __init__(self) -> None:
        self.by_type: dict[str, list[Entity]] = {}
        #: Object types found in the map that had no registered factory.
        self.unhandled: list[str] = []

    def add(self, type_name: str, entity: Entity) -> None:
        self.by_type.setdefault(type_name, []).append(entity)

    def all(self) -> list[Entity]:
        return [e for group in self.by_type.values() for e in group]

    def of(self, type_name: str) -> list[Entity]:
        return list(self.by_type.get(type_name, ()))

    def first(self, type_name: str) -> Entity | None:
        """The first entity of a type — the usual way to grab the player."""
        group = self.by_type.get(type_name)
        return group[0] if group else None

    def __len__(self) -> int:
        return sum(len(g) for g in self.by_type.values())

    def __iter__(self) -> Iterator[Entity]:
        return iter(self.all())

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        counts = ", ".join(f"{k}={len(v)}" for k, v in sorted(self.by_type.items()))
        return f"<SpawnResult {counts or 'empty'}>"


class EntityRegistry:
    """Maps Tiled object types to entity factories."""

    def __init__(self, *, on_unknown: str = "ignore") -> None:
        if on_unknown not in ON_UNKNOWN:
            raise ValueError(f"on_unknown must be one of {ON_UNKNOWN}")
        self.on_unknown = on_unknown
        self._factories: dict[str, Factory] = {}

    # -- registration ---------------------------------------------------------
    def spawns(self, *type_names: str) -> Callable[[Factory], Factory]:
        """Decorator registering a factory for one or more Tiled types.

            @registry.spawns("coin", "gem")
            def make_pickup(obj, ctx): ...
        """
        def decorate(factory: Factory) -> Factory:
            for name in type_names:
                self.register(name, factory)
            return factory
        return decorate

    def register(self, type_name: str, factory: Factory) -> None:
        self._factories[type_name] = factory

    def register_class(self, type_name: str, cls: type[Entity], **kwargs) -> None:
        """Register an Entity subclass called as ``cls(Vec2(obj.x, obj.y), **kw)``.

        Map properties are merged over ``kwargs``, so a Tiled object with a
        ``speed`` property reaches the constructor as ``speed=...`` without a
        hand-written factory.
        """
        def factory(obj: MapObject, ctx: dict) -> Entity:
            merged = {**kwargs, **obj.properties}
            return cls(Vec2(obj.x, obj.y), **merged)
        self.register(type_name, factory)

    def unregister(self, type_name: str) -> None:
        self._factories.pop(type_name, None)

    # -- introspection --------------------------------------------------------
    @property
    def types(self) -> list[str]:
        """Every Tiled type this registry can spawn, sorted."""
        return sorted(self._factories)

    def handles(self, type_name: str) -> bool:
        return type_name in self._factories

    def __contains__(self, type_name: str) -> bool:
        return type_name in self._factories

    def __len__(self) -> int:
        return len(self._factories)

    def validate(self, tilemap: TileMap) -> list[str]:
        """Object types present in the map that nothing here can spawn.

        Empty means the map is fully handled. This is the check worth running
        before shipping a level — an unhandled type is silently missing content.
        """
        found = {obj.type for obj in tilemap.objects if obj.type}
        return sorted(found - set(self._factories))

    # -- spawning -------------------------------------------------------------
    def build(self, obj: MapObject, context: dict | None = None) -> Entity | None:
        """Make one entity from one map object, without touching a world."""
        factory = self._factories.get(obj.type)
        if factory is None:
            self._report_unknown(obj)
            return None
        return factory(obj, context if context is not None else {})

    def populate(
        self,
        world: World,
        tilemap: TileMap | None = None,
        *,
        context: dict | None = None,
        layer: str | None = None,
    ) -> SpawnResult:
        """Spawn an entity for every handled object in the map.

        ``tilemap`` defaults to the world's own. ``layer`` restricts spawning to
        one named object layer, so a map can keep (say) decoration separate from
        gameplay. ``context`` is handed to every factory — the usual home for
        sprite sheets and shared config.
        """
        source = tilemap if tilemap is not None else world.tilemap
        if source is None:
            raise ValueError("no tilemap: pass one, or give the World a tilemap")

        ctx = context if context is not None else {}
        result = SpawnResult()
        unhandled: set[str] = set()

        for obj in source.objects:
            if layer is not None and obj.layer != layer:
                continue
            if not obj.type:
                continue
            factory = self._factories.get(obj.type)
            if factory is None:
                unhandled.add(obj.type)
                self._report_unknown(obj)
                continue
            entity = factory(obj, ctx)
            if entity is not None:
                world.spawn(entity)
                result.add(obj.type, entity)

        result.unhandled = sorted(unhandled)
        return result

    def _report_unknown(self, obj: MapObject) -> None:
        if self.on_unknown == "ignore":
            return
        message = (
            f"no factory registered for Tiled object type {obj.type!r} "
            f"(at {obj.x:.0f},{obj.y:.0f}); registered: {self.types}"
        )
        if self.on_unknown == "raise":
            raise KeyError(message)
        warnings.warn(message, RuntimeWarning, stacklevel=3)


def describe_map(tilemap: TileMap) -> dict[str, Any]:
    """A summary of what a level contains, for tools that inspect maps.

    Deliberately plain data — a CLI, an editor, or a script can render it
    without knowing anything about the engine's classes.
    """
    object_types: dict[str, int] = {}
    for obj in tilemap.objects:
        if obj.type:
            object_types[obj.type] = object_types.get(obj.type, 0) + 1

    layers = sorted({obj.layer for obj in tilemap.objects if obj.layer})
    return {
        "size": {"tiles": [tilemap.width, tilemap.height],
                 "pixels": [tilemap.pixel_width, tilemap.pixel_height]},
        "tile_size": [tilemap.tile_w, tilemap.tile_h],
        "tiles_used": int((tilemap.tiles >= 0).sum()),
        "solid_tiles": int(tilemap.solid.sum()),
        "one_way_tiles": int(tilemap.one_way.sum()),
        "slope_tiles": int((tilemap.slope > 0).sum()),
        "ladder_tiles": int(tilemap.ladder.sum()),
        "objects": len(tilemap.objects),
        "object_types": dict(sorted(object_types.items())),
        "object_layers": layers,
        "tilesets": [ts.get("name") or ts.get("source") or "?"
                     for ts in tilemap.tilesets],
    }
