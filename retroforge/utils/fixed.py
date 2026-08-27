"""Q16.16 fixed-point arithmetic.

Real 16-bit consoles integrated motion in fixed-point, not floats: the top 16
bits of a 32-bit value were the integer pixel, the bottom 16 the sub-pixel
fraction.

This is **opt-in**, for game code that needs bit-exact reproducibility — replays,
lockstep multiplayer, a speedrun verifier. The engine's own bodies integrate in
floats with a sub-pixel accumulator, which is smooth and fast and reproducible
enough for single-player; reach for ``Fixed`` when "reproducible enough" is not.

Two deliberate departures from the hardware:

* **No overflow.** The raw value is a Python ``int``, so a result outside the
  32-bit Q16.16 range grows instead of wrapping. Silent wraparound is a
  hardware quirk, not a feature worth reproducing; ``in_range`` reports whether
  a value would still have fit.
* **Symmetric rounding.** ``*`` and ``//`` truncate toward zero for both signs.
  A bare arithmetic shift floors instead, so ``-a * b`` was not the mirror of
  ``a * b`` — and a symmetric jump landed on the platform going right but
  missed going left, which is precisely the class of bug fixed-point is adopted
  to prevent.
"""

from __future__ import annotations

FRAC_BITS = 16
ONE = 1 << FRAC_BITS
HALF = ONE >> 1

# The range a hardware 32-bit Q16.16 word could hold, for ``in_range``.
MAX_RAW = (1 << 31) - 1
MIN_RAW = -(1 << 31)


class Fixed:
    """A Q16.16 fixed-point number."""

    __slots__ = ("raw",)

    def __init__(self, raw: int = 0) -> None:
        # ``raw`` is the already-scaled integer. Use the classmethods below to
        # build from floats/ints.
        self.raw = int(raw)

    # -- construction ---------------------------------------------------------
    @classmethod
    def from_float(cls, f: float) -> Fixed:
        return cls(round(f * ONE))

    @classmethod
    def from_int(cls, i: int) -> Fixed:
        return cls(int(i) << FRAC_BITS)

    @classmethod
    def zero(cls) -> Fixed:
        return cls(0)

    @classmethod
    def one(cls) -> Fixed:
        return cls(ONE)

    # -- conversion -----------------------------------------------------------
    def to_float(self) -> float:
        return self.raw / ONE

    def to_int(self) -> int:
        """Truncate toward negative infinity (arithmetic shift), like hardware."""
        return self.raw >> FRAC_BITS

    def round_int(self) -> int:
        return (self.raw + HALF) >> FRAC_BITS

    def in_range(self) -> bool:
        """True if this value would still fit a hardware 32-bit Q16.16 word."""
        return MIN_RAW <= self.raw <= MAX_RAW

    # -- arithmetic -----------------------------------------------------------
    def __add__(self, other: Fixed) -> Fixed:
        return Fixed(self.raw + other.raw)

    def __sub__(self, other: Fixed) -> Fixed:
        return Fixed(self.raw - other.raw)

    def __mul__(self, other: Fixed) -> Fixed:
        # Multiply the raw values then shift back down to remove the extra
        # fractional scaling introduced by the product. The shift is applied to
        # the magnitude so both signs truncate toward zero: a plain `>>` floors,
        # which would make -a*b differ from -(a*b) by one ulp.
        product = self.raw * other.raw
        if product < 0:
            return Fixed(-((-product) >> FRAC_BITS))
        return Fixed(product >> FRAC_BITS)

    def __floordiv__(self, other: Fixed) -> Fixed:
        # Shift the numerator up first so the quotient lands back in Q16.16.
        if other.raw == 0:
            raise ZeroDivisionError("Fixed division by zero")
        numerator = self.raw << FRAC_BITS
        negative = (numerator < 0) != (other.raw < 0)
        magnitude = abs(numerator) // abs(other.raw)
        return Fixed(-magnitude if negative else magnitude)

    __truediv__ = __floordiv__

    def __neg__(self) -> Fixed:
        return Fixed(-self.raw)

    def __abs__(self) -> Fixed:
        return Fixed(abs(self.raw))

    # -- comparison -----------------------------------------------------------
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Fixed):
            return NotImplemented
        return self.raw == other.raw

    def __lt__(self, other: Fixed) -> bool:
        return self.raw < other.raw

    def __le__(self, other: Fixed) -> bool:
        return self.raw <= other.raw

    def __gt__(self, other: Fixed) -> bool:
        return self.raw > other.raw

    def __ge__(self, other: Fixed) -> bool:
        return self.raw >= other.raw

    def __hash__(self) -> int:
        return hash(self.raw)

    def __repr__(self) -> str:
        return f"Fixed({self.to_float():g})"
