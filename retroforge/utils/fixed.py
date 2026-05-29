"""Q16.16 fixed-point arithmetic.

Real 16-bit consoles integrated motion in fixed-point, not floats: the top 16
bits of a 32-bit value were the integer pixel, the bottom 16 the sub-pixel
fraction. Using the same representation for physics keeps motion deterministic
and free of float drift, which matters for pixel-perfect platforming and replay
consistency.

``Fixed`` wraps a plain Python ``int`` (the raw fixed-point value). It is used
for scalar math only — bulk pixel work belongs in numpy, not here.
"""

from __future__ import annotations

FRAC_BITS = 16
ONE = 1 << FRAC_BITS
HALF = ONE >> 1


class Fixed:
    """A Q16.16 fixed-point number."""

    __slots__ = ("raw",)

    def __init__(self, raw: int = 0) -> None:
        # ``raw`` is the already-scaled integer. Use the classmethods below to
        # build from floats/ints.
        self.raw = int(raw)

    # -- construction ---------------------------------------------------------
    @classmethod
    def from_float(cls, f: float) -> "Fixed":
        return cls(int(round(f * ONE)))

    @classmethod
    def from_int(cls, i: int) -> "Fixed":
        return cls(int(i) << FRAC_BITS)

    @classmethod
    def zero(cls) -> "Fixed":
        return cls(0)

    @classmethod
    def one(cls) -> "Fixed":
        return cls(ONE)

    # -- conversion -----------------------------------------------------------
    def to_float(self) -> float:
        return self.raw / ONE

    def to_int(self) -> int:
        """Truncate toward negative infinity (arithmetic shift), like hardware."""
        return self.raw >> FRAC_BITS

    def round_int(self) -> int:
        return (self.raw + HALF) >> FRAC_BITS

    # -- arithmetic -----------------------------------------------------------
    def __add__(self, other: "Fixed") -> "Fixed":
        return Fixed(self.raw + other.raw)

    def __sub__(self, other: "Fixed") -> "Fixed":
        return Fixed(self.raw - other.raw)

    def __mul__(self, other: "Fixed") -> "Fixed":
        # Multiply the raw values then shift back down to remove the extra
        # fractional scaling introduced by the product.
        return Fixed((self.raw * other.raw) >> FRAC_BITS)

    def __floordiv__(self, other: "Fixed") -> "Fixed":
        # Shift the numerator up first so the quotient lands back in Q16.16.
        return Fixed((self.raw << FRAC_BITS) // other.raw)

    def __neg__(self) -> "Fixed":
        return Fixed(-self.raw)

    def __abs__(self) -> "Fixed":
        return Fixed(abs(self.raw))

    # -- comparison -----------------------------------------------------------
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Fixed):
            return NotImplemented
        return self.raw == other.raw

    def __lt__(self, other: "Fixed") -> bool:
        return self.raw < other.raw

    def __le__(self, other: "Fixed") -> bool:
        return self.raw <= other.raw

    def __gt__(self, other: "Fixed") -> bool:
        return self.raw > other.raw

    def __ge__(self, other: "Fixed") -> bool:
        return self.raw >= other.raw

    def __hash__(self) -> int:
        return hash(self.raw)

    def __repr__(self) -> str:
        return f"Fixed({self.to_float():g})"
