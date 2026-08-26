"""BitmapFont — pixel text.

No 16-bit game shipped without text: a score, a health label, a shopkeeper's
dialogue, a pause menu. Hardware drew all of it out of the same tile memory as
everything else, one small glyph per cell, which is why the era's text is
crisp, monospaced, and never anti-aliased.

This module does the same. A built-in 5x7 glyph set covering printable ASCII is
defined below as literal pixel art, so the engine has a usable font with no
binary asset and no system font dependency, and renders identically on every
machine. ``BitmapFont.from_sheet`` swaps in your own glyphs when you want a
different look.

Glyphs are stored once as alpha masks. Colouring happens per colour, not per
call: the first draw in a given colour bakes a set of glyph surfaces that every
later draw reuses, so a score redrawn every frame costs a handful of blits.

    font = BitmapFont.default()
    font.draw(renderer.target, f"SCORE {score:06d}", 8, 8)
    font.draw(renderer.target, "GAME OVER", renderer.width // 2, 100,
              color=(255, 80, 80), align="center", shadow=(0, 0, 0))
"""

from __future__ import annotations

import pygame

RGB = tuple[int, int, int]

GLYPH_W = 5
GLYPH_H = 7

# Printable ASCII as literal pixel art: seven rows of five columns per glyph,
# '1' meaning an opaque pixel. Rows 5-6 carry the descenders on g j p q y.
_DEFAULT_GLYPHS: dict[str, tuple[str, ...]] = {
    " ": ("00000", "00000", "00000", "00000", "00000", "00000", "00000"),
    "!": ("00100", "00100", "00100", "00100", "00100", "00000", "00100"),
    '"': ("01010", "01010", "00000", "00000", "00000", "00000", "00000"),
    "#": ("01010", "01010", "11111", "01010", "11111", "01010", "01010"),
    "$": ("00100", "01111", "10100", "01110", "00101", "11110", "00100"),
    "%": ("11001", "11010", "00010", "00100", "01011", "10011", "00000"),
    "&": ("01100", "10010", "10100", "01000", "10101", "10010", "01101"),
    "'": ("00100", "00100", "00000", "00000", "00000", "00000", "00000"),
    "(": ("00010", "00100", "01000", "01000", "01000", "00100", "00010"),
    ")": ("01000", "00100", "00010", "00010", "00010", "00100", "01000"),
    "*": ("00000", "00100", "10101", "01110", "10101", "00100", "00000"),
    "+": ("00000", "00100", "00100", "11111", "00100", "00100", "00000"),
    ",": ("00000", "00000", "00000", "00000", "00110", "00100", "01000"),
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    ".": ("00000", "00000", "00000", "00000", "00000", "01100", "01100"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11111", "00010", "00100", "00010", "00001", "10001", "01110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
    ":": ("00000", "01100", "01100", "00000", "01100", "01100", "00000"),
    ";": ("00000", "01100", "01100", "00000", "00110", "00100", "01000"),
    "<": ("00010", "00100", "01000", "10000", "01000", "00100", "00010"),
    "=": ("00000", "00000", "11111", "00000", "11111", "00000", "00000"),
    ">": ("01000", "00100", "00010", "00001", "00010", "00100", "01000"),
    "?": ("01110", "10001", "00001", "00010", "00100", "00000", "00100"),
    "@": ("01110", "10001", "10111", "10101", "10111", "10000", "01110"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11100", "10010", "10001", "10001", "10001", "10010", "11100"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "J": ("00111", "00010", "00010", "00010", "00010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "10001", "11001", "10101", "10011", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "[": ("01110", "01000", "01000", "01000", "01000", "01000", "01110"),
    "\\": ("10000", "01000", "01000", "00100", "00010", "00010", "00001"),
    "]": ("01110", "00010", "00010", "00010", "00010", "00010", "01110"),
    "^": ("00100", "01010", "10001", "00000", "00000", "00000", "00000"),
    "_": ("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
    "`": ("01000", "00100", "00000", "00000", "00000", "00000", "00000"),
    "a": ("00000", "00000", "01110", "00001", "01111", "10001", "01111"),
    "b": ("10000", "10000", "11110", "10001", "10001", "10001", "11110"),
    "c": ("00000", "00000", "01111", "10000", "10000", "10000", "01111"),
    "d": ("00001", "00001", "01111", "10001", "10001", "10001", "01111"),
    "e": ("00000", "00000", "01110", "10001", "11111", "10000", "01110"),
    "f": ("00110", "01001", "01000", "11100", "01000", "01000", "01000"),
    "g": ("00000", "01111", "10001", "10001", "01111", "00001", "01110"),
    "h": ("10000", "10000", "11110", "10001", "10001", "10001", "10001"),
    "i": ("00100", "00000", "01100", "00100", "00100", "00100", "01110"),
    "j": ("00010", "00000", "00110", "00010", "00010", "10010", "01100"),
    "k": ("10000", "10000", "10010", "10100", "11000", "10100", "10010"),
    "l": ("01100", "00100", "00100", "00100", "00100", "00100", "01110"),
    "m": ("00000", "00000", "11010", "10101", "10101", "10101", "10101"),
    "n": ("00000", "00000", "11110", "10001", "10001", "10001", "10001"),
    "o": ("00000", "00000", "01110", "10001", "10001", "10001", "01110"),
    "p": ("00000", "11110", "10001", "10001", "11110", "10000", "10000"),
    "q": ("00000", "01111", "10001", "10001", "01111", "00001", "00001"),
    "r": ("00000", "00000", "10110", "11001", "10000", "10000", "10000"),
    "s": ("00000", "00000", "01111", "10000", "01110", "00001", "11110"),
    "t": ("01000", "01000", "11100", "01000", "01000", "01001", "00110"),
    "u": ("00000", "00000", "10001", "10001", "10001", "10011", "01101"),
    "v": ("00000", "00000", "10001", "10001", "10001", "01010", "00100"),
    "w": ("00000", "00000", "10001", "10001", "10101", "10101", "01010"),
    "x": ("00000", "00000", "10001", "01010", "00100", "01010", "10001"),
    "y": ("00000", "10001", "10001", "10001", "01111", "00001", "01110"),
    "z": ("00000", "00000", "11111", "00010", "00100", "01000", "11111"),
    "{": ("00110", "01000", "01000", "11000", "01000", "01000", "00110"),
    "|": ("00100", "00100", "00100", "00100", "00100", "00100", "00100"),
    "}": ("01100", "00010", "00010", "00011", "00010", "00010", "01100"),
    "~": ("00000", "00000", "01000", "10101", "00010", "00000", "00000"),
}


class BitmapFont:
    """A monospaced pixel font.

    ``tracking`` is the gap between glyph cells and ``leading`` the gap between
    baselines, both in virtual pixels.
    """

    def __init__(
        self,
        glyph_w: int,
        glyph_h: int,
        masks: dict[str, pygame.Surface],
        *,
        tracking: int = 1,
        leading: int = 2,
        fallback: str = "?",
    ) -> None:
        self.glyph_w = glyph_w
        self.glyph_h = glyph_h
        self.tracking = tracking
        self.leading = leading
        self.fallback = fallback
        self._masks = masks
        self._colored: dict[RGB, dict[str, pygame.Surface]] = {}

    # -- construction ---------------------------------------------------------
    @classmethod
    def default(cls, **kwargs) -> BitmapFont:
        """The built-in 5x7 ASCII font."""
        cached = getattr(cls, "_default_masks", None)
        if cached is None:
            cached = {ch: _mask_from_rows(rows)
                      for ch, rows in _DEFAULT_GLYPHS.items()}
            cls._default_masks = cached
        return cls(GLYPH_W, GLYPH_H, cached, **kwargs)

    @classmethod
    def from_sheet(
        cls,
        surface: pygame.Surface,
        glyph_w: int,
        glyph_h: int,
        charset: str,
        *,
        margin: int = 0,
        spacing: int = 0,
        **kwargs,
    ) -> BitmapFont:
        """Build a font from a glyph sheet laid out left-to-right, top-to-bottom.

        ``charset`` names the characters in sheet order. Any pixel matching the
        sheet's colour-key (or fully transparent pixel) is treated as a hole.
        """
        masks: dict[str, pygame.Surface] = {}
        sheet_w, sheet_h = surface.get_size()
        cols = max(1, (sheet_w - 2 * margin + spacing) // (glyph_w + spacing))
        for i, ch in enumerate(charset):
            gx = margin + (i % cols) * (glyph_w + spacing)
            gy = margin + (i // cols) * (glyph_h + spacing)
            if gy + glyph_h > sheet_h:
                break
            glyph = surface.subsurface(pygame.Rect(gx, gy, glyph_w, glyph_h)).copy()
            if pygame.display.get_init():
                # convert_alpha needs a display; without one the unconverted
                # surface still draws correctly, just a little slower.
                glyph = glyph.convert_alpha()
            masks[ch] = glyph
        return cls(glyph_w, glyph_h, masks, **kwargs)

    # -- metrics --------------------------------------------------------------
    @property
    def line_height(self) -> int:
        return self.glyph_h + self.leading

    @property
    def advance(self) -> int:
        return self.glyph_w + self.tracking

    def measure(self, text: str) -> tuple[int, int]:
        """Pixel size of ``text``, honouring embedded newlines."""
        if not text:
            return 0, 0
        lines = text.split("\n")
        widest = max((self._line_width(ln) for ln in lines), default=0)
        height = len(lines) * self.line_height - self.leading
        return widest, max(0, height)

    def _line_width(self, line: str) -> int:
        if not line:
            return 0
        return len(line) * self.advance - self.tracking

    def wrap(self, text: str, max_width: int) -> list[str]:
        """Break ``text`` into lines that fit ``max_width`` pixels.

        Wraps on spaces; a single word longer than the limit is split so it can
        never run off the edge of a dialogue box.
        """
        if max_width < self.glyph_w:
            return text.split("\n")
        per_line = max(1, (max_width + self.tracking) // self.advance)
        out: list[str] = []
        for paragraph in text.split("\n"):
            if not paragraph:
                out.append("")
                continue
            line = ""
            for word in paragraph.split(" "):
                while len(word) > per_line:      # word longer than the box
                    if line:
                        out.append(line)
                        line = ""
                    out.append(word[:per_line])
                    word = word[per_line:]
                candidate = f"{line} {word}" if line else word
                if len(candidate) <= per_line:
                    line = candidate
                else:
                    out.append(line)
                    line = word
            out.append(line)
        return out

    # -- drawing --------------------------------------------------------------
    def _glyphs_for(self, color: RGB) -> dict[str, pygame.Surface]:
        key = (int(color[0]), int(color[1]), int(color[2]))
        cached = self._colored.get(key)
        if cached is None:
            cached = {}
            for ch, mask in self._masks.items():
                surf = mask.copy()
                surf.fill((*key, 255), special_flags=pygame.BLEND_RGBA_MULT)
                # BLEND_RGBA_MULT scales alpha by 255/255 = unchanged, and RGB
                # by the target colour, so holes stay holes.
                cached[ch] = surf
            self._colored[key] = cached
        return cached

    def draw(
        self,
        surface: pygame.Surface,
        text: str,
        x: int,
        y: int,
        color: RGB = (255, 255, 255),
        *,
        align: str = "left",
        shadow: RGB | None = None,
        shadow_offset: tuple[int, int] = (1, 1),
    ) -> pygame.Rect:
        """Draw ``text`` and return the rect it occupied.

        ``align`` is "left", "center", or "right", positioning ``x`` accordingly.
        ``shadow`` draws the same text offset behind it, which is how 16-bit
        games kept a HUD readable over a busy background.
        """
        lines = text.split("\n")
        width, height = self.measure(text)
        if align == "center":
            origin_x = x - width // 2
        elif align == "right":
            origin_x = x - width
        else:
            origin_x = x

        if shadow is not None:
            ox, oy = shadow_offset
            self._blit_lines(surface, lines, origin_x + ox, y + oy, shadow, align, width)
        self._blit_lines(surface, lines, origin_x, y, color, align, width)
        return pygame.Rect(origin_x, y, width, height)

    def _blit_lines(self, surface, lines, origin_x, y, color, align, block_w) -> None:
        glyphs = self._glyphs_for(color)
        fallback = glyphs.get(self.fallback)
        advance = self.advance
        blits: list[tuple[pygame.Surface, tuple[int, int]]] = []
        for row, line in enumerate(lines):
            line_w = self._line_width(line)
            if align == "center":
                lx = origin_x + (block_w - line_w) // 2
            elif align == "right":
                lx = origin_x + (block_w - line_w)
            else:
                lx = origin_x
            ly = y + row * self.line_height
            for i, ch in enumerate(line):
                if ch == " ":
                    continue
                glyph = glyphs.get(ch, fallback)
                if glyph is not None:
                    blits.append((glyph, (lx + i * advance, ly)))
        if blits:
            surface.blits(blits, doreturn=False)

    def draw_wrapped(
        self,
        surface: pygame.Surface,
        text: str,
        x: int,
        y: int,
        max_width: int,
        color: RGB = (255, 255, 255),
        **kwargs,
    ) -> pygame.Rect:
        """Word-wrap ``text`` to ``max_width`` pixels, then draw it."""
        return self.draw(surface, "\n".join(self.wrap(text, max_width)),
                         x, y, color, **kwargs)

    def render(self, text: str, color: RGB = (255, 255, 255),
               shadow: RGB | None = None) -> pygame.Surface:
        """Render ``text`` to its own transparent surface."""
        pad_x, pad_y = (0, 0)
        if shadow is not None:
            pad_x, pad_y = 1, 1
        w, h = self.measure(text)
        surf = pygame.Surface((max(1, w + pad_x), max(1, h + pad_y)), pygame.SRCALPHA)
        self.draw(surf, text, 0, 0, color, shadow=shadow)
        return surf


def _mask_from_rows(rows: tuple[str, ...]) -> pygame.Surface:
    """Turn seven '0'/'1' rows into a white glyph with transparent holes."""
    h = len(rows)
    w = len(rows[0])
    surf = pygame.Surface((w, h), pygame.SRCALPHA)
    surf.fill((0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            if cell == "1":
                surf.set_at((x, y), (255, 255, 255, 255))
    return surf


def _validate_default_glyphs() -> None:
    """Guard against a typo in the literal glyph table above."""
    for ch, rows in _DEFAULT_GLYPHS.items():
        if len(rows) != GLYPH_H:
            raise ValueError(f"glyph {ch!r} has {len(rows)} rows, expected {GLYPH_H}")
        for row in rows:
            if len(row) != GLYPH_W or set(row) - {"0", "1"}:
                raise ValueError(f"glyph {ch!r} has a malformed row {row!r}")


_validate_default_glyphs()
