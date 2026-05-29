"""ColorPalette — numpy-backed 16-bit colour system.

The palette is organised the way SNES hardware organised CGRAM: 16 sub-palettes
of 16 colours each. Sprites and background tiles reference a sub-palette index
rather than carrying raw RGB, so recolouring a character or cycling water/lava
colours is a cheap palette edit instead of a pixel rewrite.

Colours are stored in a single ``(16, 16, 4)`` uint8 numpy array so whole-screen
operations — fade-to-black, cross-fades, colour cycling — are one vectorised
call rather than 256 Python iterations.
"""

from __future__ import annotations

import numpy as np

NUM_PALETTES = 16
COLORS_PER_PALETTE = 16

RGBA = tuple[int, int, int, int]


class ColorPalette:
    """16 sub-palettes x 16 RGBA colours."""

    def __init__(self) -> None:
        # Shape (palette, color, channel). Channel order is R, G, B, A.
        self._data = np.zeros((NUM_PALETTES, COLORS_PER_PALETTE, 4), dtype=np.uint8)
        # Default everything opaque; index 0 of palette 0 is the backdrop colour.
        self._data[..., 3] = 255

    # -- single colour access -------------------------------------------------
    def set_color(
        self,
        palette_idx: int,
        color_idx: int,
        r: int,
        g: int,
        b: int,
        a: int = 255,
    ) -> None:
        self._data[palette_idx, color_idx] = (r, g, b, a)

    def get_rgba(self, palette_idx: int, color_idx: int) -> RGBA:
        r, g, b, a = self._data[palette_idx, color_idx]
        return (int(r), int(g), int(b), int(a))

    def set_palette(self, palette_idx: int, colors: list[RGBA]) -> None:
        """Replace a full sub-palette (up to 16 colours)."""
        for i, c in enumerate(colors[:COLORS_PER_PALETTE]):
            if len(c) == 3:
                self._data[palette_idx, i] = (c[0], c[1], c[2], 255)
            else:
                self._data[palette_idx, i] = c

    # -- pygame interop -------------------------------------------------------
    def as_pygame_colorlist(self, palette_idx: int) -> list[RGBA]:
        """Return a sub-palette as a list usable with ``Surface.set_palette``."""
        return [tuple(int(v) for v in c) for c in self._data[palette_idx]]

    # -- whole-palette effects (vectorised) -----------------------------------
    def copy(self) -> "ColorPalette":
        clone = ColorPalette()
        clone._data = self._data.copy()
        return clone

    def fade(self, t: float, to_white: bool = False) -> "ColorPalette":
        """Return a faded copy: ``t`` in [0,1], 0 = unchanged, 1 = fully faded.

        Fades toward black by default, or toward white when ``to_white`` is set.
        Alpha is preserved.
        """
        t = max(0.0, min(1.0, t))
        out = self.copy()
        rgb = out._data[..., :3].astype(np.float32)
        if to_white:
            rgb = rgb + (255.0 - rgb) * t
        else:
            rgb = rgb * (1.0 - t)
        out._data[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
        return out

    def lerp_to(self, other: "ColorPalette", t: float) -> "ColorPalette":
        """Interpolate toward another palette — used for scene transitions."""
        t = max(0.0, min(1.0, t))
        out = self.copy()
        a = self._data.astype(np.float32)
        b = other._data.astype(np.float32)
        out._data = np.clip(a + (b - a) * t, 0, 255).astype(np.uint8)
        return out

    def cycle(self, palette_idx: int, start: int, end: int, steps: int = 1) -> None:
        """Rotate a contiguous colour range in place (classic colour cycling).

        Rotates colours ``[start, end)`` of one sub-palette by ``steps``. Great
        for animated water, waterfalls, lava, and glowing UI.
        """
        block = self._data[palette_idx, start:end]
        self._data[palette_idx, start:end] = np.roll(block, steps, axis=0)

    # -- introspection --------------------------------------------------------
    @property
    def data(self) -> np.ndarray:
        return self._data
