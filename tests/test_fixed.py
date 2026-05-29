"""Unit tests for Q16.16 fixed-point math."""

import math

from retroforge.utils.fixed import Fixed, ONE


def test_from_int_roundtrip():
    assert Fixed.from_int(5).to_int() == 5
    assert Fixed.from_int(5).raw == 5 * ONE


def test_from_float_roundtrip():
    f = Fixed.from_float(1.5)
    assert math.isclose(f.to_float(), 1.5, rel_tol=1e-4)


def test_add_sub():
    assert (Fixed.from_int(3) + Fixed.from_int(4)).to_int() == 7
    assert (Fixed.from_int(10) - Fixed.from_int(4)).to_int() == 6


def test_mul():
    # 1.5 * 2.0 == 3.0
    r = Fixed.from_float(1.5) * Fixed.from_float(2.0)
    assert math.isclose(r.to_float(), 3.0, rel_tol=1e-4)


def test_div():
    r = Fixed.from_float(3.0) // Fixed.from_float(2.0)
    assert math.isclose(r.to_float(), 1.5, rel_tol=1e-4)


def test_comparisons():
    assert Fixed.from_int(1) < Fixed.from_int(2)
    assert Fixed.from_int(2) >= Fixed.from_int(2)


def test_no_drift_on_fractional_accumulation():
    # Adding 0.1 ten times should land on 1.0 exactly enough to truncate to 1.
    acc = Fixed.zero()
    tenth = Fixed.from_float(0.1)
    for _ in range(10):
        acc = acc + tenth
    assert math.isclose(acc.to_float(), 1.0, abs_tol=1e-3)
