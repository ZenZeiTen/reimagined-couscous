"""Integration test: the full engine/scene/renderer pipeline runs headless."""

import pygame

import retroforge as rf


class _CountingScene(rf.Scene):
    def __init__(self):
        self.updates = 0
        self.draws = 0

    def update(self, dt, inp):
        self.updates += 1

    def draw(self, renderer):
        renderer.target.fill((10, 20, 30))
        self.draws += 1


def test_engine_steps_drive_scene():
    pygame.init()
    r = rf.Renderer(64, 48, scale=1, vsync=False)
    engine = rf.GameEngine(r, init_audio=False)
    scene = _CountingScene()
    engine.scenes.push(scene)
    engine.step(10)
    assert scene.updates == 10
    assert scene.draws == 10


def test_scene_stack_push_pop():
    sm = rf.SceneManager()
    a, b = rf.Scene(), rf.Scene()
    sm.push(a)
    assert sm.current is a
    sm.push(b)
    assert sm.current is b
    sm.pop()
    assert sm.current is a
    sm.clear()
    assert sm.is_empty


def test_mode7_renders_without_error():
    pygame.init()
    src = pygame.Surface((64, 64))
    src.fill((100, 150, 200))
    m7 = rf.Mode7(src)
    m7.horizon = 20
    dest = pygame.Surface((96, 64))
    m7.render(dest)  # should not raise
    # A pixel below the horizon should have been written (not the fill default).
    assert dest.get_at((48, 40)) != (0, 0, 0, 255)
