"""Vec2 — a fast, lightweight 2D vector.

This is the most frequently constructed type in the engine, so it uses
``__slots__`` to avoid per-instance ``__dict__`` overhead and treats vectors as
value types: arithmetic returns new ``Vec2`` instances rather than mutating in
place. That mirrors the way 16-bit hardware recomputed positions fresh each
frame, and keeps the hot path free of aliasing bugs.
"""

from __future__ import annotations

import math
from typing import Iterator


class Vec2:
    """An immutable-style 2D vector of floats."""

    __slots__ = ("x", "y")

    def __init__(self, x: float = 0.0, y: float = 0.0) -> None:
        self.x = float(x)
        self.y = float(y)

    # -- construction helpers -------------------------------------------------
    @classmethod
    def zero(cls) -> "Vec2":
        return cls(0.0, 0.0)

    @classmethod
    def one(cls) -> "Vec2":
        return cls(1.0, 1.0)

    def copy(self) -> "Vec2":
        return Vec2(self.x, self.y)

    # -- arithmetic (returns new instances) -----------------------------------
    def __add__(self, other: "Vec2") -> "Vec2":
        return Vec2(self.x + other.x, self.y + other.y)

    def __sub__(self, other: "Vec2") -> "Vec2":
        return Vec2(self.x - other.x, self.y - other.y)

    def __mul__(self, scalar: float) -> "Vec2":
        return Vec2(self.x * scalar, self.y * scalar)

    __rmul__ = __mul__

    def __truediv__(self, scalar: float) -> "Vec2":
        return Vec2(self.x / scalar, self.y / scalar)

    def __neg__(self) -> "Vec2":
        return Vec2(-self.x, -self.y)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Vec2):
            return NotImplemented
        return self.x == other.x and self.y == other.y

    # -- vector math ----------------------------------------------------------
    def dot(self, other: "Vec2") -> float:
        return self.x * other.x + self.y * other.y

    def length_sq(self) -> float:
        """Squared length — use this for comparisons to avoid a sqrt."""
        return self.x * self.x + self.y * self.y

    def length(self) -> float:
        return math.sqrt(self.length_sq())

    def normalized(self) -> "Vec2":
        ln = self.length()
        if ln == 0.0:
            return Vec2(0.0, 0.0)
        return Vec2(self.x / ln, self.y / ln)

    def lerp(self, other: "Vec2", t: float) -> "Vec2":
        return Vec2(self.x + (other.x - self.x) * t, self.y + (other.y - self.y) * t)

    def distance_to(self, other: "Vec2") -> float:
        return (other - self).length()

    # -- pixel helpers --------------------------------------------------------
    @property
    def ixy(self) -> tuple[int, int]:
        """Integer pixel coordinates (truncated, matching hardware snapping)."""
        return (int(self.x), int(self.y))

    def floor(self) -> "Vec2":
        return Vec2(math.floor(self.x), math.floor(self.y))

    # -- protocol -------------------------------------------------------------
    def __iter__(self) -> Iterator[float]:
        yield self.x
        yield self.y

    def __getitem__(self, idx: int) -> float:
        if idx == 0:
            return self.x
        if idx == 1:
            return self.y
        raise IndexError("Vec2 index out of range")

    def __repr__(self) -> str:
        return f"Vec2({self.x:g}, {self.y:g})"

    def __hash__(self) -> int:
        return hash((self.x, self.y))
