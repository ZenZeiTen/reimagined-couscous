"""Unit tests for Vec2 (pure logic, no display needed)."""

import math

from retroforge.utils.vec2 import Vec2


def test_add_sub():
    assert Vec2(1, 2) + Vec2(3, 4) == Vec2(4, 6)
    assert Vec2(5, 5) - Vec2(2, 1) == Vec2(3, 4)


def test_scalar_mul():
    assert Vec2(2, 3) * 2 == Vec2(4, 6)
    assert 2 * Vec2(2, 3) == Vec2(4, 6)


def test_length_and_normalize():
    v = Vec2(3, 4)
    assert v.length_sq() == 25
    assert v.length() == 5
    n = v.normalized()
    assert math.isclose(n.length(), 1.0, rel_tol=1e-6)


def test_normalize_zero_is_safe():
    assert Vec2(0, 0).normalized() == Vec2(0, 0)


def test_lerp():
    assert Vec2(0, 0).lerp(Vec2(10, 20), 0.5) == Vec2(5, 10)


def test_ixy_truncates():
    assert Vec2(3.9, -1.2).ixy == (3, -1)


def test_iter_unpacks():
    x, y = Vec2(7, 8)
    assert (x, y) == (7.0, 8.0)
