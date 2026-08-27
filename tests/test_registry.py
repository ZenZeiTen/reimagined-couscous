"""Spawning entities from a level file."""

from __future__ import annotations

import pytest

from retroforge.entity import Entity, World
from retroforge.graphics.tilemap import MapObject, TileMap
from retroforge.registry import EntityRegistry, describe_map
from retroforge.utils.vec2 import Vec2


class Coin(Entity):
    def __init__(self, pos: Vec2, value: int = 1) -> None:
        super().__init__(pos, Vec2(8, 8), tags=("coin",))
        self.value = value


class Walker(Entity):
    def __init__(self, pos: Vec2, patrol: float = 48.0) -> None:
        super().__init__(pos, Vec2(16, 16), tags=("enemy",))
        self.patrol = patrol


def _map_with(*objects: MapObject) -> TileMap:
    tm = TileMap(20, 12)
    for tx in range(20):
        tm.set_tile(tx, 11, 1, solid=True)
    tm.objects = list(objects)
    return tm


def _obj(type_name: str, x=0.0, y=0.0, layer="spawns", **props) -> MapObject:
    return MapObject(type=type_name, x=x, y=y, layer=layer, properties=props)


# -- registration -----------------------------------------------------------

def test_decorator_registers_a_factory():
    registry = EntityRegistry()

    @registry.spawns("coin")
    def make(obj, ctx):
        return Coin(Vec2(obj.x, obj.y))

    assert registry.handles("coin")
    assert "coin" in registry
    assert registry.types == ["coin"]
    assert len(registry) == 1


def test_one_factory_can_serve_several_types():
    registry = EntityRegistry()

    @registry.spawns("coin", "gem", "ruby")
    def make(obj, ctx):
        return Coin(Vec2(obj.x, obj.y))

    assert registry.types == ["coin", "gem", "ruby"]


def test_register_class_passes_map_properties_to_the_constructor():
    registry = EntityRegistry()
    registry.register_class("enemy", Walker)

    world = World(_map_with(_obj("enemy", 32, 48, patrol=96.0)))
    spawned = registry.populate(world)

    walker = spawned.first("enemy")
    assert isinstance(walker, Walker)
    assert walker.pos == Vec2(32, 48)
    assert walker.patrol == 96.0


def test_register_class_defaults_are_overridden_by_the_map():
    registry = EntityRegistry()
    registry.register_class("enemy", Walker, patrol=10.0)

    world = World(_map_with(_obj("enemy", 0, 0), _obj("enemy", 16, 0, patrol=99.0)))
    walkers = registry.populate(world).of("enemy")
    assert sorted(w.patrol for w in walkers) == [10.0, 99.0]


def test_unregister_removes_a_type():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    registry.unregister("coin")
    assert not registry.handles("coin")


# -- spawning ---------------------------------------------------------------

def test_populate_spawns_every_handled_object():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    registry.register_class("enemy", Walker)

    world = World(_map_with(
        _obj("coin", 0, 0), _obj("coin", 16, 0), _obj("coin", 32, 0),
        _obj("enemy", 64, 0),
    ))
    spawned = registry.populate(world)

    assert len(spawned) == 4
    assert len(spawned.of("coin")) == 3
    assert len(spawned.of("enemy")) == 1
    assert len(world) == 4, "entities should actually be in the world"


def test_first_finds_the_player():
    registry = EntityRegistry()
    registry.register_class("spawn", Coin)
    world = World(_map_with(_obj("spawn", 24, 40)))
    assert registry.populate(world).first("spawn").pos == Vec2(24, 40)


def test_first_of_a_missing_type_is_none():
    registry = EntityRegistry()
    world = World(_map_with())
    assert registry.populate(world).first("nope") is None


def test_a_factory_may_return_none_to_skip():
    registry = EntityRegistry()

    @registry.spawns("marker")
    def make(obj, ctx):
        ctx.setdefault("seen", []).append((obj.x, obj.y))
        return None                       # a location, not an entity

    context = {}
    world = World(_map_with(_obj("marker", 8, 8)))
    spawned = registry.populate(world, context=context)
    assert len(spawned) == 0
    assert len(world) == 0
    assert context["seen"] == [(8.0, 8.0)]


def test_context_reaches_every_factory():
    registry = EntityRegistry()

    @registry.spawns("coin")
    def make(obj, ctx):
        return Coin(Vec2(obj.x, obj.y), value=ctx["worth"])

    world = World(_map_with(_obj("coin"), _obj("coin", 16)))
    coins = registry.populate(world, context={"worth": 50}).of("coin")
    assert [c.value for c in coins] == [50, 50]


def test_layer_filter_restricts_spawning():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)

    world = World(_map_with(
        _obj("coin", 0, 0, layer="gameplay"),
        _obj("coin", 16, 0, layer="decoration"),
    ))
    assert len(registry.populate(world, layer="gameplay")) == 1


def test_objects_without_a_type_are_skipped():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    world = World(_map_with(MapObject(name="note", x=8, y=8)))
    assert len(registry.populate(world)) == 0


def test_populate_needs_a_tilemap_somewhere():
    registry = EntityRegistry()
    with pytest.raises(ValueError, match="no tilemap"):
        registry.populate(World())


def test_populate_accepts_an_explicit_tilemap():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    tm = _map_with(_obj("coin", 8, 8))
    assert len(registry.populate(World(), tilemap=tm)) == 1


# -- unknown types ----------------------------------------------------------

def test_unknown_types_are_ignored_by_default():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    world = World(_map_with(_obj("coin"), _obj("mystery", 16)))

    spawned = registry.populate(world)
    assert len(spawned) == 1
    assert spawned.unhandled == ["mystery"]


def test_unknown_types_can_warn():
    registry = EntityRegistry(on_unknown="warn")
    world = World(_map_with(_obj("mystery")))
    with pytest.warns(RuntimeWarning, match="mystery"):
        registry.populate(world)


def test_unknown_types_can_raise():
    registry = EntityRegistry(on_unknown="raise")
    world = World(_map_with(_obj("mystery")))
    with pytest.raises(KeyError, match="mystery"):
        registry.populate(world)


def test_a_bad_on_unknown_is_rejected_up_front():
    with pytest.raises(ValueError, match="on_unknown"):
        EntityRegistry(on_unknown="explode")


# -- validation -------------------------------------------------------------

def test_validate_lists_types_nothing_handles():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    tm = _map_with(_obj("coin"), _obj("enemy", 16), _obj("boss", 32))
    assert registry.validate(tm) == ["boss", "enemy"]


def test_validate_is_empty_when_the_map_is_covered():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    assert registry.validate(_map_with(_obj("coin"))) == []


# -- build ------------------------------------------------------------------

def test_build_makes_one_entity_without_a_world():
    registry = EntityRegistry()
    registry.register_class("coin", Coin)
    entity = registry.build(_obj("coin", 40, 8))
    assert isinstance(entity, Coin)
    assert entity.pos == Vec2(40, 8)


def test_build_returns_none_for_an_unknown_type():
    assert EntityRegistry().build(_obj("mystery")) is None


# -- describe_map -----------------------------------------------------------

def test_describe_map_summarises_a_level():
    tm = _map_with(_obj("coin"), _obj("coin", 16), _obj("enemy", 32))
    summary = describe_map(tm)

    assert summary["size"]["tiles"] == [20, 12]
    assert summary["size"]["pixels"] == [320, 192]
    assert summary["tile_size"] == [16, 16]
    assert summary["solid_tiles"] == 20
    assert summary["objects"] == 3
    assert summary["object_types"] == {"coin": 2, "enemy": 1}
    assert summary["object_layers"] == ["spawns"]


def test_describe_map_counts_the_platforming_planes():
    from retroforge.graphics.tilemap import SLOPE_UP_RIGHT

    tm = _map_with()
    tm.set_tile(3, 10, 2, slope=SLOPE_UP_RIGHT)
    tm.set_tile(5, 9, 3, ladder=True)
    tm.set_tile(7, 9, 4, one_way=True)

    summary = describe_map(tm)
    assert summary["slope_tiles"] == 1
    assert summary["ladder_tiles"] == 1
    assert summary["one_way_tiles"] == 1


def test_describe_map_is_plain_json_data():
    import json

    json.dumps(describe_map(_map_with(_obj("coin"))))    # must not raise
