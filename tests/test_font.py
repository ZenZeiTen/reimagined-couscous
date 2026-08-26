"""Bitmap text rendering."""

from __future__ import annotations

import pygame
import pytest

from retroforge.graphics.font import GLYPH_H, GLYPH_W, BitmapFont

WHITE = (255, 255, 255)
RED = (255, 0, 0)


@pytest.fixture
def font() -> BitmapFont:
    return BitmapFont.default()


def _canvas(w: int = 128, h: int = 64) -> pygame.Surface:
    surf = pygame.Surface((w, h))
    surf.fill((0, 0, 0))
    return surf


def _lit(surface: pygame.Surface) -> int:
    """Count non-black pixels."""
    arr = pygame.surfarray.array3d(surface)
    return int((arr.sum(axis=2) > 0).sum())


def test_every_printable_ascii_glyph_exists(font):
    missing = [chr(c) for c in range(32, 127) if chr(c) not in font._masks]
    assert missing == []


def test_default_glyph_table_is_well_formed():
    from retroforge.graphics.font import _DEFAULT_GLYPHS
    for ch, rows in _DEFAULT_GLYPHS.items():
        assert len(rows) == GLYPH_H, ch
        for row in rows:
            assert len(row) == GLYPH_W, ch
            assert set(row) <= {"0", "1"}, ch


def test_glyphs_are_visually_distinct(font):
    """Two different characters must not render identically.

    A copy-paste slip in the glyph table is invisible until someone reads a
    number as a letter mid-game, so assert it here instead.
    """
    from retroforge.graphics.font import _DEFAULT_GLYPHS
    seen: dict[tuple, str] = {}
    for ch, rows in _DEFAULT_GLYPHS.items():
        if ch == " ":
            continue
        key = tuple(rows)
        assert key not in seen, f"{ch!r} renders identically to {seen[key]!r}"
        seen[key] = ch


def test_no_printable_glyph_is_blank_except_space():
    from retroforge.graphics.font import _DEFAULT_GLYPHS
    for ch, rows in _DEFAULT_GLYPHS.items():
        if ch == " ":
            continue
        assert any("1" in row for row in rows), f"{ch!r} is blank"


def test_measure_matches_what_is_drawn(font):
    w, h = font.measure("HI")
    assert w == 2 * GLYPH_W + font.tracking
    assert h == GLYPH_H

    w2, h2 = font.measure("HI\nTHERE")
    assert w2 == font._line_width("THERE")
    assert h2 == 2 * GLYPH_H + font.leading


def test_measure_of_empty_text(font):
    assert font.measure("") == (0, 0)


def test_draw_puts_pixels_on_the_surface(font):
    surf = _canvas()
    rect = font.draw(surf, "A", 3, 4)
    assert _lit(surf) > 0
    assert rect.topleft == (3, 4)
    assert rect.size == (GLYPH_W, GLYPH_H)
    # Nothing drawn outside the reported rect.
    assert surf.get_at((2, 4))[:3] == (0, 0, 0)
    assert surf.get_at((3 + GLYPH_W, 4))[:3] == (0, 0, 0)


def test_draw_uses_the_requested_colour(font):
    surf = _canvas()
    font.draw(surf, "A", 0, 0, RED)
    arr = pygame.surfarray.array3d(surf)
    colours = {tuple(arr[x, y]) for x in range(GLYPH_W) for y in range(GLYPH_H)}
    assert colours <= {(0, 0, 0), RED}
    assert RED in colours


def test_space_draws_nothing_but_still_advances(font):
    surf = _canvas()
    font.draw(surf, "A A", 0, 0)
    third = font.advance * 2
    assert _lit(surf.subsurface((0, 0, GLYPH_W, GLYPH_H))) > 0
    assert _lit(surf.subsurface((font.advance, 0, GLYPH_W, GLYPH_H))) == 0
    assert _lit(surf.subsurface((third, 0, GLYPH_W, GLYPH_H))) > 0


def test_alignment_positions_text_around_x(font):
    width, _ = font.measure("ABC")
    left = font.draw(_canvas(), "ABC", 50, 0, align="left")
    centre = font.draw(_canvas(), "ABC", 50, 0, align="center")
    right = font.draw(_canvas(), "ABC", 50, 0, align="right")
    assert left.left == 50
    assert centre.left == 50 - width // 2
    assert right.left == 50 - width


def test_shadow_draws_extra_pixels_behind(font):
    plain = _canvas()
    font.draw(plain, "A", 2, 2, WHITE)
    shadowed = _canvas()
    font.draw(shadowed, "A", 2, 2, WHITE, shadow=(255, 0, 0))
    assert _lit(shadowed) > _lit(plain)
    arr = pygame.surfarray.array3d(shadowed)
    assert any(tuple(arr[x, y]) == (255, 0, 0)
               for x in range(12) for y in range(12)), "shadow colour missing"


def test_unknown_character_falls_back(font):
    surf = _canvas()
    font.draw(surf, "中", 0, 0)     # CJK char, not in the font
    assert _lit(surf) > 0, "should render the fallback glyph, not nothing"


def test_wrap_respects_pixel_width(font):
    text = "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG"
    max_width = 60
    lines = font.wrap(text, max_width)
    assert len(lines) > 1
    for line in lines:
        assert font.measure(line)[0] <= max_width, line
    # No words lost or reordered.
    assert " ".join(lines).split() == text.split()


def test_wrap_splits_a_word_longer_than_the_box(font):
    lines = font.wrap("SUPERCALIFRAGILISTIC", 30)
    for line in lines:
        assert font.measure(line)[0] <= 30
    assert "".join(lines) == "SUPERCALIFRAGILISTIC"


def test_wrap_preserves_explicit_newlines(font):
    lines = font.wrap("ONE\n\nTWO", 200)
    assert lines == ["ONE", "", "TWO"]


def test_draw_wrapped_stays_inside_the_box(font):
    surf = _canvas(80, 64)
    rect = font.draw_wrapped(surf, "HELLO THERE BRAVE ADVENTURER", 0, 0, 78)
    assert rect.width <= 78


def test_render_returns_a_transparent_surface(font):
    surf = font.render("HI", WHITE)
    assert surf.get_flags() & pygame.SRCALPHA
    w, h = font.measure("HI")
    assert surf.get_size() == (w, h)
    assert surf.get_at((0, 0))[3] == 0 or _lit(surf) > 0


def test_colour_variants_are_cached(font):
    a = font._glyphs_for(RED)
    b = font._glyphs_for(RED)
    assert a is b
    assert font._glyphs_for((0, 255, 0)) is not a


def test_from_sheet_slices_glyphs():
    # Two 4x6 glyphs side by side; the first has a lit pixel, the second not.
    sheet = pygame.Surface((8, 6), pygame.SRCALPHA)
    sheet.fill((0, 0, 0, 0))
    sheet.set_at((0, 0), (255, 255, 255, 255))
    font = BitmapFont.from_sheet(sheet, 4, 6, "AB")
    assert set(font._masks) == {"A", "B"}
    assert font.glyph_w == 4 and font.glyph_h == 6
    assert font._masks["A"].get_at((0, 0))[3] == 255
    assert font._masks["B"].get_at((0, 0))[3] == 0


def test_tracking_and_leading_are_configurable():
    tight = BitmapFont.default(tracking=0, leading=0)
    assert tight.measure("AB")[0] == 2 * GLYPH_W
    assert tight.measure("A\nB")[1] == 2 * GLYPH_H
