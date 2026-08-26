"""Mode 7 ground plane: camera convention, wrapping, and sampling."""

from __future__ import annotations

import math

import numpy as np
import pygame
import pytest

import retroforge as rf
from retroforge.renderer.mode7 import Mode7

W, H, HORIZON = 160, 100, 40
SRC = 512


def _plane(landmark_at: tuple[int, int] | None = None) -> pygame.Surface:
    surf = pygame.Surface((SRC, SRC))
    surf.fill((20, 20, 20))
    if landmark_at is not None:
        pygame.draw.circle(surf, (255, 0, 0), landmark_at, 6)
    return surf


def _configure(m7: Mode7) -> Mode7:
    m7.horizon = HORIZON
    m7.cam_height = 40.0
    m7.fov = 90.0
    m7.scale = 1.0
    m7.pivot = rf.Vec2(SRC // 2, SRC // 2)
    return m7


def _red_column(dest: pygame.Surface) -> int | None:
    arr = pygame.surfarray.array3d(dest)
    red = (arr[:, :, 0] > 150) & (arr[:, :, 1] < 90)
    if not red.any():
        return None
    return int(np.argwhere(red)[:, 0].mean())


@pytest.mark.parametrize("degrees", [-60, -40, -20, -5, 0, 5, 20, 40, 60])
def test_what_is_ahead_stays_centred_at_every_heading(degrees):
    """The camera convention: forward = (sin angle, cos angle).

    Put a landmark straight ahead of that heading and it must render in the
    middle of the screen. When the ground rotated the wrong way, turning made
    the view strafe sideways instead of steering.
    """
    angle = math.radians(degrees)
    distance = 60.0
    ahead = (
        int(SRC // 2 + math.sin(angle) * distance) % SRC,
        int(SRC // 2 + math.cos(angle) * distance) % SRC,
    )
    m7 = _configure(Mode7(_plane(ahead)))
    m7.angle = angle

    dest = pygame.Surface((W, H))
    dest.fill((0, 0, 0))
    m7.render(dest)

    column = _red_column(dest)
    assert column is not None, f"landmark not visible at {degrees} degrees"
    assert abs(column - W // 2) <= 6, (
        f"{degrees} degrees: landmark at x={column}, expected near {W // 2}"
    )


def test_forward_vector_matches_the_rendered_view():
    m7 = _configure(Mode7(_plane()))
    m7.angle = math.radians(30)
    fwd = m7.forward()
    assert fwd.x == pytest.approx(math.sin(m7.angle))
    assert fwd.y == pytest.approx(math.cos(m7.angle))
    # right is forward turned 90 degrees, so the two are perpendicular.
    rgt = m7.right()
    assert fwd.x * rgt.x + fwd.y * rgt.y == pytest.approx(0.0, abs=1e-6)


def test_turning_moves_a_fixed_landmark_the_opposite_way():
    """Turn the camera right and scenery must sweep left across the screen."""
    m7 = _configure(Mode7(_plane((SRC // 2, SRC // 2 + 60))))
    dest = pygame.Surface((W, H))

    columns = []
    for degrees in (-10, 0, 10):
        m7.angle = math.radians(degrees)
        dest.fill((0, 0, 0))
        m7.render(dest)
        columns.append(_red_column(dest))

    assert all(c is not None for c in columns), columns
    assert columns[0] > columns[1] > columns[2], (
        f"scenery should sweep left as the camera turns right, got {columns}"
    )


def test_wrap_tiles_the_texture_infinitely():
    m7 = _configure(Mode7(_plane()))
    m7.pivot = rf.Vec2(SRC * 4, SRC * 4)     # far outside the texture
    dest = pygame.Surface((W, H))
    dest.fill((0, 0, 0))
    m7.render(dest, wrap=True)
    # Ground was painted, not left black.
    assert dest.get_at((W // 2, H - 4))[:3] == (20, 20, 20)


def test_unwrapped_ground_leaves_the_sky_intact():
    """Off-texture ground must be transparent, not opaque black.

    A finite course (a Mario Kart track) shows sky past its edge; painting the
    whole strip black destroys whatever the scene drew above the horizon.
    """
    SKY = (90, 140, 255)
    m7 = _configure(Mode7(_plane()))
    m7.pivot = rf.Vec2(SRC * 8, SRC * 8)     # entirely off the texture

    dest = pygame.Surface((W, H))
    dest.fill(SKY)
    m7.render(dest, wrap=False)
    assert dest.get_at((W // 2, H - 4))[:3] == SKY, "sky was overpainted"


def test_unwrapped_ground_still_draws_the_part_that_is_on_texture():
    SKY = (90, 140, 255)
    m7 = _configure(Mode7(_plane()))
    dest = pygame.Surface((W, H))
    dest.fill(SKY)
    m7.render(dest, wrap=False)
    # Directly below the camera is well inside the texture.
    assert dest.get_at((W // 2, H - 2))[:3] == (20, 20, 20)


def test_horizon_below_the_screen_draws_nothing():
    m7 = _configure(Mode7(_plane()))
    m7.horizon = H + 10
    dest = pygame.Surface((W, H))
    dest.fill((7, 7, 7))
    m7.render(dest)
    assert dest.get_at((W // 2, H // 2))[:3] == (7, 7, 7)


def test_pixels_are_writable_and_take_effect():
    """The documented way to animate the ground (colour cycling)."""
    m7 = _configure(Mode7(_plane()))
    dest = pygame.Surface((W, H))

    dest.fill((0, 0, 0))
    m7.render(dest)
    assert dest.get_at((W // 2, H - 4))[:3] == (20, 20, 20)

    m7.pixels[:] = (0, 200, 0)
    dest.fill((0, 0, 0))
    m7.render(dest)
    assert dest.get_at((W // 2, H - 4))[:3] == (0, 200, 0)


def test_pixels_has_width_first_axis_order():
    src = pygame.Surface((64, 32))
    src.fill((1, 2, 3))
    m7 = Mode7(src)
    assert m7.pixels.shape == (64, 32, 3)
    assert m7.source_size == (64, 32)


def test_refresh_from_surface_picks_up_drawing():
    src = pygame.Surface((64, 64))
    src.fill((10, 10, 10))
    m7 = _configure(Mode7(src))
    m7.pivot = rf.Vec2(32, 32)

    src.fill((200, 0, 0))
    dest = pygame.Surface((W, H))
    dest.fill((0, 0, 0))
    m7.render(dest)
    assert dest.get_at((W // 2, H - 4))[:3] == (10, 10, 10), "should use the copy"

    m7.refresh_from_surface()
    dest.fill((0, 0, 0))
    m7.render(dest)
    assert dest.get_at((W // 2, H - 4))[:3] == (200, 0, 0)


def test_non_24bit_source_is_converted():
    src = pygame.Surface((64, 64), pygame.SRCALPHA)
    src.fill((10, 20, 30, 255))
    m7 = Mode7(src)                 # must not raise
    assert m7.pixels.shape == (64, 64, 3)
