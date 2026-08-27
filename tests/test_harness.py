"""The headless verification kit."""

from __future__ import annotations

import os

import pytest

import retroforge as rf
from retroforge.testing import Harness, smoke


class Mover(rf.Scene):
    """A scene with a body you can drive, and something visible to check."""

    def on_enter(self, engine) -> None:
        self.engine = engine
        engine.renderer.palette.set_color(0, 0, 20, 20, 40)
        self.tilemap = rf.TileMap(30, 14, 16, 16)
        for tx in range(30):
            self.tilemap.set_tile(tx, 12, 1, solid=True)
        self.world = rf.World(self.tilemap, gravity=900.0)
        self.player = self.world.spawn(_Puppet(rf.Vec2(48, 100)))
        self.quit_pressed = False

    def update(self, dt, inp) -> None:
        self.player.inp = inp
        if inp.is_just_pressed(rf.Button.START):
            self.quit_pressed = True
        self.world.update(dt)

    def draw(self, renderer) -> None:
        import pygame
        pygame.draw.rect(renderer.target, (240, 90, 90), self.player.rect)


class _Puppet(rf.Entity):
    def __init__(self, pos: rf.Vec2) -> None:
        super().__init__(pos, rf.Vec2(12, 16))
        self.inp: rf.InputManager | None = None
        self.jumps = 0

    def update(self, dt, world) -> None:
        vx = 0.0
        if self.inp is not None:
            if self.inp.is_pressed(rf.Button.LEFT):
                vx -= 110.0
            if self.inp.is_pressed(rf.Button.RIGHT):
                vx += 110.0
            if self.inp.is_just_pressed(rf.Button.A) and self.body.grounded:
                self.vel = rf.Vec2(vx, -320.0)
                self.jumps += 1
                world.move(self, dt)
                return
        self.vel = rf.Vec2(vx, self.body.vel.y)
        world.move(self, dt)


# -- lifecycle --------------------------------------------------------------

def test_harness_runs_a_scene():
    with Harness(Mover()) as h:
        h.step(10)
        assert h.steps == 10
        assert isinstance(h.scene, Mover)


def test_harness_restores_pygame_on_exit():
    import pygame
    original = pygame.key.get_pressed
    with Harness(Mover()) as h:
        h.step(1)
        assert pygame.key.get_pressed is not original
    assert pygame.key.get_pressed is original


def test_closing_twice_is_harmless():
    h = Harness(Mover())
    h.step(1)
    h.close()
    h.close()


def test_a_harness_can_start_empty_and_push_later():
    with Harness() as h:
        assert h.scene is None
        h.push(Mover())
        h.step(5)
        assert isinstance(h.scene, Mover)


# -- input ------------------------------------------------------------------

def test_hold_moves_the_player():
    with Harness(Mover()) as h:
        h.step(30)                       # settle onto the floor
        start = h.scene.player.pos.x
        h.hold(rf.Button.RIGHT, steps=40)
        assert h.scene.player.pos.x > start + 40


def test_holding_left_moves_the_other_way():
    with Harness(Mover()) as h:
        h.step(30)
        start = h.scene.player.pos.x
        h.hold(rf.Button.LEFT, steps=30)
        assert h.scene.player.pos.x < start - 20


def test_tap_registers_exactly_one_press():
    with Harness(Mover()) as h:
        h.run_until(lambda: h.scene.player.body.grounded, limit=120)
        h.tap(rf.Button.A)
        h.step(30)
        assert h.scene.player.jumps == 1, "a tap should be one press"


def test_press_and_release_are_explicit():
    with Harness(Mover()) as h:
        h.step(20)
        h.press(rf.Button.RIGHT)
        assert rf.Button.RIGHT in h.held
        h.step(20)
        moved = h.scene.player.pos.x
        h.release(rf.Button.RIGHT)
        assert rf.Button.RIGHT not in h.held
        h.step(20)
        # After release the body keeps no horizontal speed of its own.
        assert h.scene.player.pos.x == pytest.approx(moved, abs=2.0)


def test_release_all_drops_everything():
    with Harness(Mover()) as h:
        h.press(rf.Button.RIGHT, rf.Button.A)
        assert len(h.held) == 2
        h.release_all()
        assert h.held == set()


def test_pressing_a_held_button_again_is_not_a_second_edge():
    with Harness(Mover()) as h:
        h.run_until(lambda: h.scene.player.body.grounded, limit=120)
        h.press(rf.Button.A)
        h.step(3)
        h.press(rf.Button.A)             # already down
        h.step(3)
        assert h.scene.player.jumps == 1


def test_buttons_bound_to_several_keys_still_release():
    """UP is bound to both Up and W; releasing must actually release it."""
    with Harness(Mover()) as h:
        h.press(rf.Button.UP)
        h.step(1)
        assert h.input.is_pressed(rf.Button.UP)
        h.release(rf.Button.UP)
        h.step(1)
        assert not h.input.is_pressed(rf.Button.UP)


def test_edges_reach_the_scene():
    with Harness(Mover()) as h:
        h.step(5)
        assert h.scene.quit_pressed is False
        h.tap(rf.Button.START)
        assert h.scene.quit_pressed is True


# -- running ----------------------------------------------------------------

def test_run_until_returns_the_step_count():
    with Harness(Mover()) as h:
        taken = h.run_until(lambda: h.scene.player.body.grounded, limit=200)
        assert taken > 0
        assert h.scene.player.body.grounded


def test_run_until_can_hold_buttons():
    with Harness(Mover()) as h:
        h.step(30)
        h.run_until(lambda: h.scene.player.pos.x > 120,
                    limit=200, buttons=[rf.Button.RIGHT])
        assert h.scene.player.pos.x > 120
        assert h.held == set(), "buttons should be released afterwards"


def test_run_until_times_out_loudly():
    with Harness(Mover()) as h:
        with pytest.raises(TimeoutError, match="still false"):
            h.run_until(lambda: False, limit=5)


def test_run_for_advances_game_time():
    with Harness(Mover()) as h:
        h.run_for(1.0)
        assert h.steps == pytest.approx(60, abs=1)


def test_stepping_a_scene_that_pops_itself_stops():
    class Ends(rf.Scene):
        def on_enter(self, engine):
            self.engine = engine

        def update(self, dt, inp):
            self.engine.scenes.pop()

    with Harness(Ends()) as h:
        h.step(50)
        assert h.steps == 1


# -- inspecting the frame ---------------------------------------------------

def test_pixel_reads_the_virtual_screen():
    with Harness(Mover()) as h:
        h.step(5)
        assert h.pixel(2, 2) == (20, 20, 40), "should be the backdrop"


def test_count_color_finds_the_player():
    with Harness(Mover()) as h:
        h.step(5)
        assert h.count_color((240, 90, 90)) == 12 * 16


def test_count_color_tolerance_widens_the_match():
    with Harness(Mover()) as h:
        h.step(5)
        assert h.count_color((238, 92, 88), tolerance=4) == 12 * 16
        assert h.count_color((238, 92, 88)) == 0


def test_is_blank_detects_an_empty_scene():
    class Nothing(rf.Scene):
        pass

    with Harness(Nothing()) as h:
        h.step(3)
        assert h.is_blank() is True

    with Harness(Mover()) as h:
        h.step(3)
        assert h.is_blank() is False


def test_capture_writes_a_png(tmp_path):
    with Harness(Mover()) as h:
        h.step(10)
        path = h.capture(str(tmp_path / "shots" / "frame.png"), scale=2)
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0

        import pygame
        image = pygame.image.load(path)
        assert image.get_size() == (h.renderer.width * 2, h.renderer.height * 2)


def test_frame_exposes_the_surface():
    with Harness(Mover()) as h:
        h.step(2)
        assert h.frame.get_size() == (h.renderer.width, h.renderer.height)


# -- smoke ------------------------------------------------------------------

def test_smoke_passes_a_working_scene():
    smoke(Mover, steps=30)


def test_smoke_fails_a_scene_that_draws_nothing():
    class Nothing(rf.Scene):
        pass

    with pytest.raises(AssertionError, match="blank"):
        smoke(Nothing, steps=5)


def test_smoke_propagates_a_crash():
    class Broken(rf.Scene):
        def update(self, dt, inp):
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError, match="boom"):
        smoke(Broken, steps=5)


# -- determinism ------------------------------------------------------------

def test_two_identical_runs_agree():
    def run() -> tuple[float, float]:
        with Harness(Mover()) as h:
            h.step(20)
            h.hold(rf.Button.RIGHT, steps=25)
            h.tap(rf.Button.A)
            h.step(20)
            return h.scene.player.pos.x, h.scene.player.pos.y

    assert run() == run()
