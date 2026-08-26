"""Entity/World, timers and tweens, transitions, saves, and the debug overlay."""

from __future__ import annotations

import json
import os

import pygame
import pytest

import retroforge as rf
from retroforge.graphics.tilemap import TileMap
from retroforge.utils.timing import Scheduler

DT = 1 / 60


# ---------------------------------------------------------------------------
# World / Entity
# ---------------------------------------------------------------------------

class Ticker(rf.Entity):
    def __init__(self, pos=None, **kw):
        super().__init__(pos or rf.Vec2(0, 0), rf.Vec2(8, 8), **kw)
        self.ticks = 0

    def update(self, dt, world):
        self.ticks += 1


def test_world_updates_every_active_entity():
    world = rf.World()
    a, b = world.spawn(Ticker()), world.spawn(Ticker())
    for _ in range(5):
        world.update(DT)
    assert a.ticks == 5 and b.ticks == 5
    assert world.time == pytest.approx(5 * DT)


def test_spawning_during_update_is_deferred_not_a_mutation_error():
    world = rf.World()

    class Spawner(rf.Entity):
        def __init__(self):
            super().__init__(rf.Vec2(0, 0), rf.Vec2(8, 8))
            self.done = False

        def update(self, dt, w):
            if not self.done:
                w.spawn(Ticker())
                self.done = True

    world.spawn(Spawner())
    world.update(DT)              # must not raise
    assert len(world) == 2
    world.update(DT)
    assert len(world) == 2


def test_killing_during_update_removes_at_end_of_frame():
    world = rf.World()

    class Suicidal(rf.Entity):
        def update(self, dt, w):
            self.kill()

    victim = world.spawn(Suicidal(rf.Vec2(0, 0), rf.Vec2(8, 8)))
    survivor = world.spawn(Ticker())
    world.update(DT)
    assert list(world) == [survivor]
    assert victim.world is None


def test_lifecycle_hooks_fire_once():
    log = []

    class Logged(rf.Entity):
        def on_spawn(self, world):
            log.append("spawn")

        def on_despawn(self):
            log.append("despawn")

    world = rf.World()
    e = world.spawn(Logged(rf.Vec2(0, 0), rf.Vec2(8, 8)))
    world.update(DT)
    e.kill()
    world.update(DT)
    world.update(DT)
    assert log == ["spawn", "despawn"]


def test_world_moves_entities_against_the_tilemap():
    tm = TileMap(10, 8, 16, 16)
    tm.solid[5, :] = True
    world = rf.World(tm, gravity=900.0)

    class Faller(rf.Entity):
        def update(self, dt, w):
            w.move(self, dt)

    body = world.spawn(Faller(rf.Vec2(32, 0), rf.Vec2(12, 16)))
    for _ in range(120):
        world.update(DT)
    assert body.body.grounded
    assert body.body.bottom == pytest.approx(5 * 16, abs=1.0)


def test_world_without_a_tilemap_still_integrates_velocity():
    world = rf.World()
    e = world.spawn(Ticker())
    e.vel = rf.Vec2(60.0, 0.0)
    for _ in range(60):
        world.move(e, DT)
    assert e.pos.x == pytest.approx(60.0, abs=1.5)


def test_find_and_of_type_locate_entities():
    world = rf.World()
    hero = world.spawn(Ticker(tags=["player"]))
    world.spawn(Ticker(tags=["enemy"]))
    world.spawn(Ticker(tags=["enemy"]))
    assert world.first("player") is hero
    assert len(world.find("enemy")) == 2
    assert len(world.of_type(Ticker)) == 3
    assert world.first("nobody") is None


def test_overlapping_respects_the_entity_mask():
    world = rf.World()
    player = world.spawn(Ticker(rf.Vec2(0, 0), layer=rf.Layer.PLAYER,
                                mask=rf.Layer.ENEMY))
    enemy = world.spawn(Ticker(rf.Vec2(2, 2), layer=rf.Layer.ENEMY))
    world.spawn(Ticker(rf.Vec2(2, 2), layer=rf.Layer.PICKUP))
    world.update(DT)
    assert world.overlapping(player) == [enemy]


def test_entities_draw_in_priority_order():
    order = []

    class Painter(rf.Entity):
        def __init__(self, name, priority):
            super().__init__(rf.Vec2(0, 0), rf.Vec2(8, 8), priority=priority)
            self.name = name

        def draw(self, surface, cx, cy, palette=None):
            order.append(self.name)

    world = rf.World()
    world.spawn(Painter("front", 2))
    world.spawn(Painter("back", 0))
    world.spawn(Painter("normal", 1))
    world.draw(pygame.Surface((32, 32)))
    assert order == ["back", "normal", "front"]


def test_world_draw_accepts_a_camera_or_a_plain_offset():
    seen = []

    class Painter(rf.Entity):
        def draw(self, surface, cx, cy, palette=None):
            seen.append((cx, cy))

    world = rf.World()
    world.spawn(Painter(rf.Vec2(0, 0), rf.Vec2(8, 8)))
    surface = pygame.Surface((32, 32))
    world.draw(surface, (10, 20))
    world.draw(surface, rf.Vec2(5, 6))
    world.draw(surface, None)
    assert seen == [(10.0, 20.0), (5.0, 6.0), (0.0, 0.0)]


def test_entity_animation_advances_with_the_world():
    surf = pygame.Surface((24, 8), depth=8)
    surf.set_palette([(0, 0, 0)] * 256)
    sheet = rf.SpriteSheet(surf, 8, 8)
    anim = rf.AnimatedSprite(rf.Sprite(sheet))
    anim.add("walk", [0, 1, 2], frame_time=0.05)
    anim.play("walk")

    world = rf.World()
    world.spawn(rf.Entity(rf.Vec2(0, 0), rf.Vec2(8, 8), sprite=anim))
    seen = set()
    for _ in range(20):
        world.update(DT)
        seen.add(anim.sprite.frame_idx)
    assert seen == {0, 1, 2}, f"animation did not cycle, saw {seen}"


# ---------------------------------------------------------------------------
# Scheduler: timers and tweens
# ---------------------------------------------------------------------------

def test_after_fires_once_at_the_right_time():
    sched = Scheduler()
    fired = []
    sched.after(0.5, lambda: fired.append(1))
    for _ in range(29):
        sched.update(DT)
    assert fired == []
    for _ in range(5):
        sched.update(DT)
    assert fired == [1]
    for _ in range(120):
        sched.update(DT)
    assert fired == [1], "a one-shot timer fired again"


def test_every_repeats_on_a_steady_cadence():
    sched = Scheduler()
    fired = []
    sched.every(0.25, lambda: fired.append(1))
    for _ in range(4):
        sched.update(0.25)
    assert len(fired) == 4


def test_every_holds_its_cadence_across_many_small_steps():
    """Repeats must not accumulate drift when fed a stream of 1/60s frames.

    Carrying the leftover time forward keeps this exact; resetting the countdown
    to the full interval on each fire would lose most of a frame every time and
    compound into whole missed spawns over a level.
    """
    sched = Scheduler()
    fired = []
    sched.every(0.25, lambda: fired.append(1))
    for _ in range(1200):         # twenty seconds
        sched.update(DT)
    assert abs(len(fired) - 80) <= 1, f"cadence drifted: {len(fired)} fires in 20s"


def test_a_long_frame_does_not_swallow_repeats():
    """A slow frame must not silently lose spawn waves."""
    sched = Scheduler()
    fired = []
    sched.every(0.1, lambda: fired.append(1))
    sched.update(0.55)
    assert len(fired) == 5


def test_timers_can_be_cancelled():
    sched = Scheduler()
    fired = []
    timer = sched.every(0.1, lambda: fired.append(1))
    sched.update(0.15)
    timer.cancel()
    sched.update(1.0)
    assert len(fired) == 1
    assert sched.count == 0


def test_scheduling_from_inside_a_callback_is_safe():
    sched = Scheduler()
    fired = []

    def outer():
        fired.append("outer")
        sched.after(0.1, lambda: fired.append("inner"))

    sched.after(0.1, outer)
    sched.update(0.15)            # must not raise
    sched.update(0.15)
    assert fired == ["outer", "inner"]


def test_tween_lands_exactly_on_the_end_value():
    sched = Scheduler()
    seen = []
    sched.tween(0.5, 0.0, 100.0, seen.append)
    for _ in range(120):
        sched.update(DT)
    assert seen[-1] == 100.0, "tween must land on end, not near it"
    assert seen[0] < seen[len(seen) // 2] < seen[-1]


def test_tween_easing_changes_the_curve_but_not_the_endpoints():
    def run(ease):
        sched, seen = Scheduler(), []
        sched.tween(0.5, 0.0, 1.0, seen.append, ease=ease)
        for _ in range(40):
            sched.update(DT)
        return seen

    lin = run("linear")
    eased = run("out_quad")
    assert lin[-1] == eased[-1] == 1.0
    mid = len(lin) // 2
    assert eased[mid] > lin[mid], "ease_out should be ahead at the midpoint"


def test_tween_on_complete_fires_once():
    sched = Scheduler()
    done = []
    sched.tween(0.1, 0.0, 1.0, lambda v: None, on_complete=lambda: done.append(1))
    for _ in range(60):
        sched.update(DT)
    assert done == [1]


def test_zero_duration_tween_snaps_and_completes():
    sched = Scheduler()
    seen = []
    sched.tween(0.0, 5.0, 9.0, seen.append)
    sched.update(DT)
    assert seen == [9.0]
    assert sched.count == 0


def test_unknown_easing_name_is_reported():
    with pytest.raises(KeyError, match="unknown easing"):
        Scheduler().tween(1.0, 0, 1, lambda v: None, ease="wobble")


@pytest.mark.parametrize("name", sorted(rf.EASINGS))
def test_every_easing_is_normalised(name):
    fn = rf.EASINGS[name]
    assert fn(0.0) == pytest.approx(0.0, abs=1e-6)
    assert fn(1.0) == pytest.approx(1.0, abs=1e-6)


# ---------------------------------------------------------------------------
# Transitions
# ---------------------------------------------------------------------------

@pytest.fixture
def engine():
    pygame.init()
    return rf.GameEngine(rf.Renderer(64, 48, scale=1, vsync=False), init_audio=False)


def test_transition_swaps_the_scene_and_pops_itself(engine):
    class Level(rf.Scene):
        def __init__(self, name):
            self.name = name

        def on_enter(self, eng):
            self.engine = eng

    engine.scenes.push(Level("one"))
    engine.scenes.push(rf.Transition(Level("two"), duration=0.2))

    for _ in range(60):
        engine.input.begin_step()
        engine.scenes.update(DT, engine.input)
        engine.scenes.draw(engine.renderer)

    assert len(engine.scenes._stack) == 1
    assert engine.scenes.current.name == "two"


def test_transition_cover_peaks_at_the_midpoint(engine):
    t = rf.Transition(None, duration=0.4)
    engine.scenes.push(t)
    covers = []
    for _ in range(24):
        engine.input.begin_step()
        engine.scenes.update(DT, engine.input)
        covers.append(t.cover)
        if not engine.scenes._stack:
            break
    assert max(covers) > 0.9
    assert covers[0] < 0.5


@pytest.mark.parametrize("style", ["fade", "fade_white", "mosaic", "wipe", "iris"])
def test_every_transition_style_draws_without_error(engine, style):
    t = rf.Transition(None, style=style, duration=0.2)
    engine.scenes.push(t)
    for _ in range(20):
        engine.input.begin_step()
        engine.scenes.update(DT, engine.input)
        engine.renderer.begin_frame()
        engine.scenes.draw(engine.renderer)
        if not engine.scenes._stack:
            break


def test_transition_darkens_the_screen_at_its_midpoint(engine):
    t = rf.Transition(None, style="fade", duration=0.2)
    engine.scenes.push(t)
    for _ in range(6):            # ~half of 0.2s
        engine.input.begin_step()
        engine.scenes.update(DT, engine.input)
    engine.renderer.target.fill((255, 255, 255))
    engine.scenes.draw(engine.renderer)
    assert engine.renderer.target.get_at((32, 24))[0] < 200


# ---------------------------------------------------------------------------
# SaveManager
# ---------------------------------------------------------------------------

def test_save_round_trips(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    saves.write(1, {"level": 3, "hp": 12})
    data = saves.read(1)
    assert data["level"] == 3 and data["hp"] == 12
    assert data["version"] == 1


def test_missing_slot_returns_the_default(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    assert saves.read(9) is None
    assert saves.read(9, default={"level": 1}) == {"level": 1}
    assert not saves.exists(9)


def test_a_corrupt_save_costs_one_slot_not_the_game(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    saves.write(1, {"level": 3})
    with open(saves.slot_path(1), "w", encoding="utf-8") as fh:
        fh.write('{"level": 3, trunca')
    assert saves.read(1, default={"level": 1}) == {"level": 1}


def test_writes_are_atomic_and_leave_no_temp_files(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    for i in range(5):
        saves.write(1, {"n": i})
    leftovers = [p for p in os.listdir(tmp_path) if p.endswith(".tmp")]
    assert leftovers == []
    assert saves.read(1)["n"] == 4


def test_slots_are_listed(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    saves.write(1, {})
    saves.write("auto", {})
    assert sorted(saves.slots()) == ["1", "auto"]
    assert saves.delete(1) is True
    assert saves.slots() == ["auto"]


def test_settings_and_keymap_persist(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    saves.write_settings({"music": 0.4})
    assert saves.read_settings()["music"] == 0.4

    saves.save_keymap({pygame.K_j: rf.Button.A, pygame.K_k: rf.Button.B})
    restored = saves.load_keymap()
    assert restored == {pygame.K_j: rf.Button.A, pygame.K_k: rf.Button.B}

    inp = rf.InputManager(restored)
    assert inp._keymap[pygame.K_j] == rf.Button.A


def test_a_stale_keymap_entry_does_not_break_startup(tmp_path):
    saves = rf.SaveManager("T", directory=str(tmp_path))
    with open(saves.settings_path, "w", encoding="utf-8") as fh:
        json.dump({"keymap": {"106": 4, "bogus": "nope", "107": 99}}, fh)
    assert saves.load_keymap() == {pygame.K_j: rf.Button.A}


def test_save_dir_is_under_the_user_profile():
    path = rf.save_dir("MyGame")
    assert "MyGame" in path
    assert os.path.isabs(path)


# ---------------------------------------------------------------------------
# Debug overlay
# ---------------------------------------------------------------------------

def test_debug_overlay_draws_stats_bodies_and_tiles():
    renderer = rf.Renderer(96, 64, scale=1, vsync=False)
    tm = TileMap(6, 4, 16, 16)
    tm.solid[3, :] = True
    tm.one_way[2, 1] = True
    world = rf.World(tm)
    world.spawn(Ticker(rf.Vec2(16, 16)))
    world.update(DT)

    overlay = rf.DebugOverlay()
    overlay.show_tiles = True
    overlay.watch("hp", lambda: 12)

    renderer.begin_frame()
    overlay.draw(renderer, world=world, tilemap=tm, camera=(0, 0))
    arr = pygame.surfarray.array3d(renderer.target)
    assert (arr.sum(axis=2) > 0).any(), "overlay drew nothing"


def test_a_broken_watch_does_not_crash_the_game():
    renderer = rf.Renderer(96, 64, scale=1, vsync=False)
    overlay = rf.DebugOverlay()

    def boom():
        raise ValueError("nope")

    overlay.watch("bad", boom)
    renderer.begin_frame()
    overlay.draw(renderer)        # must not raise


def test_disabled_overlay_draws_nothing():
    renderer = rf.Renderer(96, 64, scale=1, vsync=False)
    overlay = rf.DebugOverlay(enabled=False)
    renderer.begin_frame()
    renderer.target.fill((0, 0, 0))
    overlay.draw(renderer)
    arr = pygame.surfarray.array3d(renderer.target)
    assert not (arr.sum(axis=2) > 0).any()


def test_overlay_reports_a_frame_rate():
    overlay = rf.DebugOverlay()
    for _ in range(5):
        overlay.tick()
    assert overlay.fps > 0.0
    assert overlay.frame_ms >= 0.0


# ---------------------------------------------------------------------------
# Tile animation and priority
# ---------------------------------------------------------------------------

def _tileset(n: int = 4) -> dict[int, pygame.Surface]:
    tiles = {}
    for i in range(n):
        surf = pygame.Surface((16, 16))
        surf.fill((10 * (i + 1), 0, 0))
        tiles[i] = surf
    return tiles


def test_animated_tiles_cycle_over_time():
    tm = TileMap(2, 2, 16, 16)
    tm.tiles[:, :] = 0
    layer = rf.TileLayer(tm, _tileset())
    layer.animate(0, [0, 1, 2], frame_time=0.1)

    target = pygame.Surface((32, 32))
    seen = set()
    for _ in range(30):
        layer.update(DT)
        target.fill((0, 0, 0))
        layer.render(target, 0, 0)
        seen.add(target.get_at((4, 4))[:3])
    assert len(seen) == 3, f"expected three animation frames, saw {seen}"


def test_a_layer_without_animations_is_unaffected_by_update():
    tm = TileMap(2, 2, 16, 16)
    tm.tiles[:, :] = 1
    layer = rf.TileLayer(tm, _tileset())
    target = pygame.Surface((32, 32))
    layer.update(DT)
    layer.render(target, 0, 0)
    assert target.get_at((4, 4))[:3] == (20, 0, 0)


def test_only_priority_splits_a_layer_around_the_sprites():
    """Foreground tiles must be drawable after sprites, which is what
    priority has always claimed and never done."""
    tm = TileMap(2, 1, 16, 16)
    tm.set_tile(0, 0, 0, priority=1)
    tm.set_tile(1, 0, 1, priority=2)
    layer = rf.TileLayer(tm, _tileset())

    target = pygame.Surface((32, 16))
    target.fill((0, 0, 0))
    layer.render(target, 0, 0, only_priority=1)
    assert target.get_at((4, 4))[:3] == (10, 0, 0)
    assert target.get_at((20, 4))[:3] == (0, 0, 0), "priority 2 drew too early"

    layer.render(target, 0, 0, only_priority=2)
    assert target.get_at((20, 4))[:3] == (20, 0, 0)


def test_animate_rejects_an_empty_frame_list():
    layer = rf.TileLayer(TileMap(1, 1), _tileset())
    with pytest.raises(ValueError):
        layer.animate(0, [])


# ---------------------------------------------------------------------------
# Tileset loading
# ---------------------------------------------------------------------------

def test_a_tileset_too_large_for_the_flip_bits_is_refused(tmp_path):
    """Past 16384 tiles an id collides with FLIP_H_BIT.

    A plain tile would silently come back mirrored, which is the kind of bug
    that gets blamed on the level data for a week.
    """
    from retroforge.utils import asset_loader

    # 16512 tiles of 8x8: 129 columns x 128 rows.
    sheet = pygame.Surface((129 * 8, 128 * 8))
    path = tmp_path / "huge.png"
    pygame.image.save(sheet, str(path))
    asset_loader.clear_cache()

    with pytest.raises(ValueError, match="flip bits"):
        asset_loader.load_tileset(str(path), 8, 8)

    # The same sheet loads fine without pre-baked flips.
    asset_loader.clear_cache()
    tiles = asset_loader.load_tileset(str(path), 8, 8, flips=False)
    assert len(tiles) == 129 * 128
    asset_loader.clear_cache()


def test_flips_false_skips_the_mirrored_variants(tmp_path):
    from retroforge.utils import asset_loader
    from retroforge.utils.asset_loader import FLIP_H_BIT

    sheet = pygame.Surface((32, 16))
    path = tmp_path / "small.png"
    pygame.image.save(sheet, str(path))

    asset_loader.clear_cache()
    with_flips = asset_loader.load_tileset(str(path), 16, 16)
    asset_loader.clear_cache()
    without = asset_loader.load_tileset(str(path), 16, 16, flips=False)
    asset_loader.clear_cache()

    assert len(with_flips) == 4 * len(without)
    assert (0 | FLIP_H_BIT) in with_flips
    assert (0 | FLIP_H_BIT) not in without
