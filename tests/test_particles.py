"""Particle pool: emission, ageing, capacity, and drawing."""

from __future__ import annotations

import math

import pygame
import pytest

from retroforge.particles import ParticleSystem

DT = 1 / 60


def _lit(surface: pygame.Surface) -> int:
    arr = pygame.surfarray.array3d(surface)
    return int((arr.sum(axis=2) > 0).sum())


def test_a_new_pool_is_empty():
    ps = ParticleSystem(64)
    assert ps.count == 0
    assert len(ps) == 0


def test_emit_creates_particles():
    ps = ParticleSystem(64, seed=1)
    made = ps.emit(10, 10, count=8)
    assert made == 8
    assert ps.count == 8


def test_capacity_is_never_exceeded():
    ps = ParticleSystem(10, seed=1)
    assert ps.emit(0, 0, count=25) == 10
    assert ps.count == 10
    assert ps.emit(0, 0, count=5) == 0, "a full pool makes none"
    assert ps.count == 10


def test_particles_expire_and_free_their_slots():
    ps = ParticleSystem(16, seed=1)
    ps.emit(0, 0, count=16, life=(0.1, 0.1))
    assert ps.count == 16
    for _ in range(12):                 # 0.2s, well past their lifetime
        ps.update(DT)
    assert ps.count == 0
    assert ps.emit(0, 0, count=16) == 16, "slots should be reusable"


def test_particles_move_along_their_velocity():
    ps = ParticleSystem(4, seed=2)
    ps.emit(50, 50, count=1, angle=(0.0, 0.0), speed=(60.0, 60.0),
            life=(5.0, 5.0))
    for _ in range(30):
        ps.update(DT)
    # angle 0 is +x in screen space.
    assert ps._x[0] > 60.0
    assert ps._y[0] == pytest.approx(50.0, abs=0.5)


def test_gravity_pulls_particles_down():
    ps = ParticleSystem(4, gravity=400.0, seed=3)
    ps.emit(0, 0, count=1, speed=(0.0, 0.0), life=(5.0, 5.0))
    for _ in range(30):
        ps.update(DT)
    assert ps._y[0] > 5.0


def test_drag_slows_particles():
    fast = ParticleSystem(4, seed=4)
    slow = ParticleSystem(4, drag=8.0, seed=4)
    for ps in (fast, slow):
        ps.emit(0, 0, count=1, angle=(0.0, 0.0), speed=(100.0, 100.0),
                life=(5.0, 5.0))
    for _ in range(30):
        fast.update(DT)
        slow.update(DT)
    assert slow._x[0] < fast._x[0]


def test_spray_stays_within_its_cone():
    ps = ParticleSystem(64, seed=5)
    direction = math.pi / 2          # straight down
    ps.spray(0, 0, direction, cone=math.pi / 12, count=32,
             speed=(50.0, 50.0), life=(5.0, 5.0))
    ps.update(DT)
    for i in range(ps.count):
        angle = math.atan2(ps._vy[i], ps._vx[i])
        assert abs(angle - direction) <= math.pi / 12 + 1e-3


def test_burst_scatters_in_every_direction():
    ps = ParticleSystem(64, seed=6)
    ps.burst(0, 0, count=48, speed=(50.0, 50.0), life=(5.0, 5.0))
    ps.update(DT)
    angles = [math.atan2(ps._vy[i], ps._vx[i]) for i in range(ps.count)]
    assert max(angles) - min(angles) > math.pi, "should cover a wide arc"


def test_clear_removes_everything():
    ps = ParticleSystem(32, seed=7)
    ps.emit(0, 0, count=32)
    ps.clear()
    assert ps.count == 0


def test_update_on_an_empty_pool_is_harmless():
    ParticleSystem(8).update(DT)     # must not raise


def test_draw_puts_pixels_on_the_surface():
    ps = ParticleSystem(16, seed=8)
    ps.emit(20, 20, count=6, speed=(0.0, 0.0), life=(5.0, 5.0),
            colors=[(255, 0, 0)])
    surf = pygame.Surface((64, 64))
    surf.fill((0, 0, 0))
    ps.draw(surf)
    assert _lit(surf) > 0
    assert surf.get_at((20, 20))[:3] == (255, 0, 0)


def test_draw_honours_a_camera_offset():
    ps = ParticleSystem(8, seed=9)
    ps.emit(40, 40, count=1, speed=(0.0, 0.0), life=(5.0, 5.0),
            colors=[(0, 255, 0)])
    surf = pygame.Surface((64, 64))
    surf.fill((0, 0, 0))
    ps.draw(surf, camera=(30, 30))
    assert surf.get_at((10, 10))[:3] == (0, 255, 0)
    assert surf.get_at((40, 40))[:3] == (0, 0, 0)


def test_draw_on_an_empty_pool_is_harmless():
    surf = pygame.Surface((16, 16))
    surf.fill((0, 0, 0))
    ParticleSystem(8).draw(surf)
    assert _lit(surf) == 0


def test_particle_size_is_respected():
    ps = ParticleSystem(4, seed=10)
    ps.emit(4, 4, count=1, speed=(0.0, 0.0), life=(5.0, 5.0),
            size=(3, 3), colors=[(255, 255, 255)])
    surf = pygame.Surface((32, 32))
    surf.fill((0, 0, 0))
    ps.draw(surf)
    assert _lit(surf) == 9, "a size-3 particle covers 3x3 pixels"


def test_the_same_seed_gives_the_same_burst():
    a, b = ParticleSystem(32, seed=42), ParticleSystem(32, seed=42)
    a.burst(0, 0, count=16)
    b.burst(0, 0, count=16)
    assert list(a._vx[:16]) == list(b._vx[:16])


def test_colors_are_drawn_from_the_given_palette():
    ps = ParticleSystem(32, seed=11)
    palette = [(255, 0, 0), (0, 0, 255)]
    ps.emit(0, 0, count=24, colors=palette)
    used = {tuple(int(c) for c in ps._color[i]) for i in range(ps.count)}
    assert used <= set(palette)
