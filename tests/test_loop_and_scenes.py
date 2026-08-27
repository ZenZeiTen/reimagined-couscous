"""Main-loop control flow and the scene stack."""

from __future__ import annotations

import pygame
import pytest

import retroforge as rf
from retroforge.input.input import Button, InputManager


class _Keyboard:
    def __init__(self) -> None:
        self.down: set[int] = set()

    def __getitem__(self, key: int) -> bool:
        return key in self.down


@pytest.fixture
def engine():
    pygame.init()
    renderer = rf.Renderer(64, 48, scale=1, vsync=False)
    return rf.GameEngine(renderer, init_audio=False)


class _Recorder(rf.Scene):
    """Records lifecycle callbacks in call order."""

    def __init__(self, log: list[str], name: str) -> None:
        self.log = log
        self.name = name
        self.updates = 0

    def on_enter(self, engine):
        self.engine = engine
        self.log.append(f"enter:{self.name}")

    def on_exit(self):
        self.log.append(f"exit:{self.name}")

    def on_pause(self):
        self.log.append(f"pause:{self.name}")

    def on_resume(self):
        self.log.append(f"resume:{self.name}")

    def update(self, dt, inp):
        self.updates += 1


# -- quitting ---------------------------------------------------------------

def test_quit_stops_the_rest_of_the_frames_steps(engine):
    """A scene that quits mid-update must not be simulated further."""

    class Quitter(rf.Scene):
        def __init__(self):
            self.updates = 0

        def on_enter(self, eng):
            self.engine = eng

        def update(self, dt, inp):
            self.updates += 1
            self.engine.quit()

    scene = Quitter()
    engine.scenes.push(scene)
    engine._running = True
    engine._accumulator = rf.PHYSICS_DT * 3      # three steps are due

    while engine._accumulator >= rf.PHYSICS_DT:
        engine.input.begin_step()
        engine.scenes.update(rf.PHYSICS_DT, engine.input)
        engine._accumulator -= rf.PHYSICS_DT
        if not engine._running or engine.scenes.is_empty:
            break

    assert scene.updates == 1, "quit() should stop the remaining steps"


def test_run_unwinds_the_scene_stack_so_on_exit_fires(engine):
    """Games flush saves in on_exit, so quitting must not skip it."""
    log: list[str] = []

    class QuitsImmediately(_Recorder):
        def update(self, dt, inp):
            super().update(dt, inp)
            self.engine.quit()

    engine.scenes.push(_Recorder(log, "bottom"))
    engine.run(QuitsImmediately(log, "top"))
    assert "exit:top" in log and "exit:bottom" in log
    assert engine.scenes.is_empty


# -- stack lifecycle --------------------------------------------------------

def test_push_pauses_the_scene_below_and_pop_resumes_it(engine):
    log: list[str] = []
    level = _Recorder(log, "level")
    menu = _Recorder(log, "menu")

    engine.scenes.push(level)
    engine.scenes.push(menu)
    engine.scenes.pop()

    assert log == ["enter:level", "pause:level", "enter:menu",
                   "exit:menu", "resume:level"]


def test_replace_does_not_pause_the_scene_underneath(engine):
    log: list[str] = []
    engine.scenes.push(_Recorder(log, "a"))
    engine.scenes.replace(_Recorder(log, "b"))
    assert log == ["enter:a", "exit:a", "enter:b"]


def test_unbound_manager_rejects_a_scene_that_wants_the_engine():
    manager = rf.SceneManager()
    with pytest.raises(RuntimeError, match="unbound"):
        manager.push(_Recorder([], "x"))


def test_unbound_manager_still_accepts_a_plain_scene():
    manager = rf.SceneManager()
    manager.push(rf.Scene())          # base on_enter ignores the engine
    assert manager.current is not None


# -- update_below / transparent --------------------------------------------

def test_pushed_scene_freezes_the_one_below_by_default(engine):
    log: list[str] = []
    level = _Recorder(log, "level")
    menu = _Recorder(log, "menu")
    engine.scenes.push(level)
    engine.scenes.push(menu)

    engine.step(3)
    assert menu.updates == 3
    assert level.updates == 0, "a pause menu should freeze the level"


def test_update_below_keeps_the_scene_underneath_running(engine):
    log: list[str] = []
    level = _Recorder(log, "level")
    hud = _Recorder(log, "hud")
    hud.update_below = True
    engine.scenes.push(level)
    engine.scenes.push(hud)

    engine.step(3)
    assert level.updates == 3 and hud.updates == 3


def test_a_scene_may_pop_itself_during_update(engine):
    class SelfPopping(rf.Scene):
        def on_enter(self, eng):
            self.engine = eng

        def update(self, dt, inp):
            self.engine.scenes.pop()

    engine.scenes.push(rf.Scene())
    engine.scenes.push(SelfPopping())
    engine.step(1)                     # must not raise
    assert len(engine.scenes._stack) == 1


def test_transparent_scene_draws_the_one_below(engine):
    drawn: list[str] = []

    class Painter(rf.Scene):
        def __init__(self, name, transparent=False):
            self.name = name
            self.transparent = transparent

        def draw(self, renderer):
            drawn.append(self.name)

    engine.scenes.push(Painter("level"))
    engine.scenes.push(Painter("overlay", transparent=True))
    engine.scenes.draw(engine.renderer)
    assert drawn == ["level", "overlay"]


# -- input integration ------------------------------------------------------

def test_two_keys_on_one_button_do_not_fake_a_release(monkeypatch):
    """The default keymap binds both Up and W to Button.UP."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {pygame.K_w}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=pygame.K_w)])
    inp.begin_step()
    assert inp.is_just_pressed(Button.UP)

    # Also press the arrow key, then let go of W while the arrow stays down.
    keyboard.down = {pygame.K_w, pygame.K_UP}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=pygame.K_UP)])
    inp.begin_step()

    keyboard.down = {pygame.K_UP}
    inp.update([pygame.event.Event(pygame.KEYUP, key=pygame.K_w)])
    inp.begin_step()
    assert inp.is_pressed(Button.UP), "the arrow key is still held"
    assert not inp.is_just_released(Button.UP), "phantom release from the other key"

    # Releasing the last key bound to the button does release it.
    keyboard.down = set()
    inp.update([pygame.event.Event(pygame.KEYUP, key=pygame.K_UP)])
    inp.begin_step()
    assert inp.is_just_released(Button.UP)
    assert not inp.is_pressed(Button.UP)


def test_focus_loss_releases_held_buttons(monkeypatch):
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = {pygame.K_z}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=pygame.K_z)])
    inp.begin_step()
    assert inp.is_pressed(Button.A)

    # Window loses focus while the key is still physically down.
    inp.update([pygame.event.Event(pygame.WINDOWFOCUSLOST)])
    inp.begin_step()
    assert not inp.is_pressed(Button.A)
    assert inp.is_just_released(Button.A), "hold-based logic must unwind"


def test_focus_loss_does_not_relatch_a_press_from_the_same_batch(monkeypatch):
    """The press and the focus loss arrive together; the press must not stick."""
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()

    keyboard.down = set()
    inp.update([
        pygame.event.Event(pygame.KEYDOWN, key=pygame.K_z),
        pygame.event.Event(pygame.WINDOWFOCUSLOST),
    ])
    inp.begin_step()
    assert not inp.is_pressed(Button.A)
    assert not inp.is_just_pressed(Button.A)


def test_reset_emits_releases_by_default(monkeypatch):
    keyboard = _Keyboard()
    monkeypatch.setattr(pygame.key, "get_pressed", lambda: keyboard)
    inp = InputManager()
    keyboard.down = {pygame.K_z}
    inp.update([pygame.event.Event(pygame.KEYDOWN, key=pygame.K_z)])
    inp.begin_step()

    inp.reset()
    inp.begin_step()
    assert inp.is_just_released(Button.A)

    keyboard.down = {pygame.K_z}
    inp.update([])
    inp.begin_step()
    inp.reset(emit_releases=False)
    inp.begin_step()
    assert not inp.is_just_released(Button.A)


def test_step_can_push_its_own_scene(engine):
    log: list[str] = []
    scene = _Recorder(log, "only")
    engine.step(4, scene)
    assert scene.updates == 4
    assert log[0] == "enter:only"
