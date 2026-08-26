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


def test_ixy_floors():
    assert Vec2(3.9, 1.2).ixy == (3, 1)


def test_ixy_floors_negatives_instead_of_truncating():
    """Truncation is not monotonic across zero.

    int(-0.5) and int(0.5) are both 0, so a sprite scrolling left past the
    origin sits on pixel 0 for twice as long as on any other pixel and visibly
    stalls. Flooring gives every pixel the same dwell time.
    """
    assert Vec2(-1.2, -0.2).ixy == (-2, -1)

    dwell: dict[int, int] = {}
    x = 3.0
    while x > -3.0:
        dwell[Vec2(x, 0).ixy[0]] = dwell.get(Vec2(x, 0).ixy[0], 0) + 1
        x -= 0.25
    interior = [n for px, n in dwell.items() if -3 < px < 3]
    assert len(set(interior)) == 1, f"uneven pixel dwell times: {dwell}"


def test_iter_unpacks():
    x, y = Vec2(7, 8)
    assert (x, y) == (7.0, 8.0)
