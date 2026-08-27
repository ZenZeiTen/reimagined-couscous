"""Unit tests for the ColorPalette (numpy-backed, no display needed)."""

from retroforge.renderer.palette import ColorPalette


def test_set_get_color():
    p = ColorPalette()
    p.set_color(1, 2, 10, 20, 30)
    assert p.get_rgba(1, 2) == (10, 20, 30, 255)


def test_fade_to_black():
    p = ColorPalette()
    p.set_color(0, 1, 200, 100, 50)
    faded = p.fade(1.0)
    assert faded.get_rgba(0, 1) == (0, 0, 0, 255)
    # original is untouched
    assert p.get_rgba(0, 1) == (200, 100, 50, 255)


def test_fade_half():
    p = ColorPalette()
    p.set_color(0, 1, 200, 100, 50)
    faded = p.fade(0.5)
    r, g, b, _ = faded.get_rgba(0, 1)
    assert (r, g, b) == (100, 50, 25)


def test_fade_to_white():
    p = ColorPalette()
    p.set_color(0, 1, 0, 0, 0)
    assert p.fade(1.0, to_white=True).get_rgba(0, 1) == (255, 255, 255, 255)


def test_lerp_to():
    a = ColorPalette()
    a.set_color(0, 0, 0, 0, 0)
    b = ColorPalette()
    b.set_color(0, 0, 100, 100, 100)
    mid = a.lerp_to(b, 0.5)
    assert mid.get_rgba(0, 0)[:3] == (50, 50, 50)


def test_cycle_rotates_range():
    p = ColorPalette()
    for i in range(4):
        p.set_color(0, i, i, 0, 0)
    p.cycle(0, 0, 4, steps=1)
    # after roll by 1, color at index 0 should be the old index 3 (value 3)
    assert p.get_rgba(0, 0)[0] == 3
