"""Sprite sheets, palette swapping, and animation."""

from __future__ import annotations

import pygame
import pytest

from retroforge.graphics.sprite import AnimatedSprite, Sprite, SpriteSheet
from retroforge.renderer.palette import ColorPalette
from retroforge.utils.vec2 import Vec2

RED = (255, 0, 0)
BLUE = (0, 0, 255)
GREEN = (0, 255, 0)


def _indexed_sheet(frames: int = 1, size: int = 8) -> SpriteSheet:
    """A sheet of 8-bit indexed frames where every pixel is colour index 1."""
    surf = pygame.Surface((size * frames, size), depth=8)
    surf.set_palette([(0, 0, 0)] * 256)
    surf.fill(1)
    return SpriteSheet(surf, size, size)


def _pixel(sprite: Sprite, palette: ColorPalette) -> tuple[int, int, int]:
    target = pygame.Surface((16, 16))
    target.fill((0, 0, 0))
    sprite.draw(target, 0, 0, palette)
    return target.get_at((0, 0))[:3]


def test_sprites_sharing_a_sheet_keep_independent_palettes():
    """The headline recolour feature: two sprites, one sheet, two colours.

    Frames are shared surfaces, so recolouring one at draw time used to recolour
    it for every other sprite as well.
    """
    sheet = _indexed_sheet()
    palette = ColorPalette()
    palette.set_color(1, 1, *RED)
    palette.set_color(2, 1, *BLUE)

    hero = Sprite(sheet, Vec2(0, 0), palette_id=1)
    clone = Sprite(sheet, Vec2(0, 0), palette_id=2)

    # Redraw several times: the bug only showed from the second frame onward.
    for _ in range(3):
        assert _pixel(hero, palette) == RED
        assert _pixel(clone, palette) == BLUE


def test_many_sprites_each_keep_their_own_palette():
    sheet = _indexed_sheet()
    palette = ColorPalette()
    wanted = [RED, BLUE, GREEN, (255, 255, 0)]
    for i, colour in enumerate(wanted):
        palette.set_color(i, 1, *colour)

    sprites = [Sprite(sheet, Vec2(0, 0), palette_id=i) for i in range(len(wanted))]
    for _ in range(3):
        for sprite, colour in zip(sprites, wanted, strict=True):
            assert _pixel(sprite, palette) == colour


def test_recolour_follows_a_palette_edit():
    """Cached recolours must not survive a colour change (fades, cycling)."""
    sheet = _indexed_sheet()
    palette = ColorPalette()
    palette.set_color(1, 1, *RED)
    sprite = Sprite(sheet, Vec2(0, 0), palette_id=1)
    assert _pixel(sprite, palette) == RED

    palette.set_color(1, 1, *BLUE)
    assert _pixel(sprite, palette) == BLUE


def test_recolour_follows_palette_cycling():
    sheet = _indexed_sheet()
    palette = ColorPalette()
    palette.set_color(0, 1, *RED)
    palette.set_color(0, 2, *BLUE)
    sprite = Sprite(sheet, Vec2(0, 0), palette_id=0)
    assert _pixel(sprite, palette) == RED

    palette.cycle(0, 1, 3, steps=1)   # swap colours 1 and 2
    assert _pixel(sprite, palette) == BLUE


def test_a_faded_palette_renders_faded():
    sheet = _indexed_sheet()
    palette = ColorPalette()
    palette.set_color(1, 1, *RED)
    sprite = Sprite(sheet, Vec2(0, 0), palette_id=1)

    assert _pixel(sprite, palette) == RED
    assert _pixel(sprite, palette.fade(1.0)) == (0, 0, 0)
    half = _pixel(sprite, palette.fade(0.5))
    assert 120 <= half[0] <= 135 and half[1] == 0 and half[2] == 0


def test_palette_revision_and_uid_track_changes():
    palette = ColorPalette()
    start = palette.revision
    palette.set_color(0, 0, 1, 2, 3)
    assert palette.revision > start
    before = palette.revision
    palette.cycle(0, 0, 4)
    assert palette.revision > before
    # Derived palettes are distinct objects, so caches cannot confuse them.
    assert palette.fade(0.5).uid != palette.uid


def test_flip_variants_are_cached_not_rebuilt():
    sheet = _indexed_sheet()
    a = sheet.prepare(0, None, 0, True, False)
    b = sheet.prepare(0, None, 0, True, False)
    assert a is b, "flipped frames should be built once and reused"
    assert sheet.prepare(0, None, 0, False, False) is sheet.frames[0]
    assert sheet.prepare(0, None, 0, True, False) is not sheet.frames[0]


def test_sheet_slices_with_margin_and_spacing():
    # 2x1 grid of 8x8 frames, 2px margin all round, 3px between frames.
    surf = pygame.Surface((2 + 8 + 3 + 8 + 2, 2 + 8 + 2))
    sheet = SpriteSheet(surf, 8, 8, margin=2, spacing=3)
    assert len(sheet) == 2


def test_sheet_ignores_a_trailing_partial_frame():
    surf = pygame.Surface((8 * 3 + 5, 8))   # 3 whole frames plus 5 stray px
    assert len(SpriteSheet(surf, 8, 8)) == 3


def test_non_looping_animation_completes_once():
    sheet = _indexed_sheet(frames=3)
    anim = AnimatedSprite(Sprite(sheet, Vec2(0, 0)))
    anim.add("death", [0, 1, 2], frame_time=0.1, loop=False)
    seen: list[str] = []
    anim.on_complete = seen.append
    anim.play("death")

    for _ in range(120):          # two seconds of a 0.3s one-shot
        anim.update(1 / 60)

    assert seen == ["death"]
    assert anim.finished is True
    assert anim.sprite.frame_idx == 2, "should hold the final frame"


def test_looping_animation_never_completes():
    sheet = _indexed_sheet(frames=3)
    anim = AnimatedSprite(Sprite(sheet, Vec2(0, 0)))
    anim.add("walk", [0, 1, 2], frame_time=0.1, loop=True)
    seen: list[str] = []
    anim.on_complete = seen.append
    anim.play("walk")
    for _ in range(120):
        anim.update(1 / 60)
    assert seen == []
    assert anim.finished is False


def test_replaying_a_finished_animation_restarts_it():
    sheet = _indexed_sheet(frames=3)
    anim = AnimatedSprite(Sprite(sheet, Vec2(0, 0)))
    anim.add("hit", [0, 1], frame_time=0.05, loop=False)
    calls: list[str] = []
    anim.on_complete = calls.append

    anim.play("hit")
    for _ in range(30):
        anim.update(1 / 60)
    assert calls == ["hit"]

    anim.play("hit", restart=True)
    assert anim.finished is False
    for _ in range(30):
        anim.update(1 / 60)
    assert calls == ["hit", "hit"]


def test_playing_an_unknown_animation_raises():
    anim = AnimatedSprite(Sprite(_indexed_sheet(), Vec2(0, 0)))
    with pytest.raises(KeyError):
        anim.play("nope")


def test_sprite_offset_shifts_the_draw_position():
    sheet = _indexed_sheet(size=4)
    palette = ColorPalette()
    palette.set_color(0, 1, *RED)
    sprite = Sprite(sheet, Vec2(8, 8))
    sprite.offset = Vec2(4, 4)

    target = pygame.Surface((16, 16))
    target.fill((0, 0, 0))
    sprite.draw(target, 0, 0, palette)
    assert target.get_at((4, 4))[:3] == RED     # drawn at pos - offset
    assert target.get_at((8, 8))[:3] == (0, 0, 0)
    assert sprite.rect.topleft == (4, 4)


def test_invisible_or_transparent_sprite_draws_nothing():
    sheet = _indexed_sheet()
    palette = ColorPalette()
    palette.set_color(0, 1, *RED)
    sprite = Sprite(sheet, Vec2(0, 0))

    sprite.visible = False
    assert _pixel(sprite, palette) == (0, 0, 0)
    sprite.visible = True
    sprite.alpha = 0
    assert _pixel(sprite, palette) == (0, 0, 0)


def test_alpha_does_not_corrupt_the_cached_variant():
    """Per-sprite alpha must not leak onto the shared cached surface."""
    sheet = _indexed_sheet()
    palette = ColorPalette()
    palette.set_color(0, 1, *RED)
    faded = Sprite(sheet, Vec2(0, 0))
    faded.alpha = 64
    solid = Sprite(sheet, Vec2(0, 0))

    _pixel(faded, palette)
    assert _pixel(solid, palette) == RED


def test_a_finished_one_shot_replays_without_restart():
    """A game calls play("hit") on every hit and expects it to play.

    The guard used to check only the animation name, so once a non-looping
    animation had finished, replaying it was a silent no-op for the rest of
    the session and the character never flinched again.
    """
    sheet = _indexed_sheet(frames=3)
    anim = AnimatedSprite(Sprite(sheet, Vec2(0, 0)))
    anim.add("hit", [0, 1, 2], frame_time=0.05, loop=False)
    plays: list[str] = []
    anim.on_complete = plays.append

    for _ in range(3):
        anim.play("hit")                 # no restart=True
        assert anim.finished is False
        for _ in range(30):
            anim.update(1 / 60)
    assert plays == ["hit", "hit", "hit"]


def test_columns_and_rows_agree_with_what_was_sliced():
    # A sheet whose trailing margin leaves room for a frame that is not one.
    surf = pygame.Surface((33, 10))
    sheet = SpriteSheet(surf, 8, 8, margin=1)
    assert sheet.columns * sheet.rows == len(sheet)
    for idx in range(len(sheet)):
        row, col = divmod(idx, sheet.columns)
        assert row < sheet.rows and col < sheet.columns


@pytest.mark.parametrize("size,frame,margin,spacing", [
    ((32, 8), 8, 0, 0),
    ((33, 10), 8, 1, 0),
    ((2 + 8 + 3 + 8 + 2, 12), 8, 2, 3),
    ((64, 24), 16, 1, 0),
    ((100, 100), 16, 0, 4),
])
def test_columns_times_rows_is_always_the_frame_count(size, frame, margin, spacing):
    sheet = SpriteSheet(pygame.Surface(size), frame, frame,
                        margin=margin, spacing=spacing)
    assert sheet.columns * sheet.rows == len(sheet)
