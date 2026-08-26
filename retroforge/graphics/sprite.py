"""Sprites — sheets, drawables, and animation.

Three small classes, related by composition rather than inheritance:

* ``SpriteSheet`` slices a source surface into frames once, up front.
* ``Sprite`` is a positioned, flippable, palette-indexed drawable referencing a
  sheet frame.
* ``AnimatedSprite`` *contains* a ``Sprite`` and drives its ``frame_idx`` from
  named animations.

Palette swapping
----------------
On hardware, an OAM palette attribute recoloured a sprite for free — that is how
one goblin sheet became four goblin colours. Here, an 8-bit indexed frame is
recoloured by pointing its surface palette at a different sub-palette.

The catch is that frames are *shared*: every Sprite built from one sheet
references the same ``pygame.Surface`` objects. Calling ``set_palette`` on a
shared frame at draw time recolours it for every other sprite too, so the last
sprite drawn wins and palette swapping silently stops working the moment two
sprites share a sheet — which is the normal case.

So recoloured frames are *cached per sub-palette* on the sheet instead: each
distinct ``palette_id`` gets its own recoloured copy, built once and reused.
The cache is keyed on the palette's ``(uid, revision)`` so it rebuilds when the
colours themselves change (a fade, a cross-fade, colour cycling).

Flipping is cached the same way, for the same reason the tile loader pre-bakes
flip variants: ``pygame.transform.flip`` is far too expensive to call once per
sprite per frame.
"""

from __future__ import annotations

from collections.abc import Callable

import pygame

from ..renderer.palette import ColorPalette
from ..utils.vec2 import Vec2


class SpriteSheet:
    """Slices a surface into equal-sized frames (or explicit rects)."""

    def __init__(
        self,
        surface: pygame.Surface,
        frame_w: int,
        frame_h: int,
        *,
        margin: int = 0,
        spacing: int = 0,
    ) -> None:
        self.surface = surface
        self.frame_w = frame_w
        self.frame_h = frame_h
        self.margin = margin
        self.spacing = spacing
        self.frames: list[pygame.Surface] = []
        # (frame_idx, palette_id, flip_h, flip_v) -> prepared surface
        self._variants: dict[tuple[int, int, bool, bool], pygame.Surface] = {}
        self._palette_token: tuple[int, int] | None = None
        self._slice_grid()

    def _slice_grid(self) -> None:
        w, h = self.surface.get_size()
        step_x = self.frame_w + self.spacing
        step_y = self.frame_h + self.spacing
        fy = self.margin
        while fy + self.frame_h <= h:
            fx = self.margin
            while fx + self.frame_w <= w:
                rect = pygame.Rect(fx, fy, self.frame_w, self.frame_h)
                self.frames.append(self.surface.subsurface(rect).copy())
                fx += step_x
            fy += step_y

    def slice_by_rects(self, rects: list[pygame.Rect]) -> None:
        """Replace the grid slicing with an explicit list of frame rects."""
        self.frames = [self.surface.subsurface(r).copy() for r in rects]
        self._variants.clear()

    def get_frame(self, idx: int) -> pygame.Surface:
        return self.frames[idx]

    @property
    def columns(self) -> int:
        w = self.surface.get_width()
        step = self.frame_w + self.spacing
        return max(0, (w - 2 * self.margin + self.spacing) // step) if step else 0

    def prepare(
        self,
        idx: int,
        palette: ColorPalette | None,
        palette_id: int,
        flip_h: bool,
        flip_v: bool,
    ) -> pygame.Surface:
        """Return the frame recoloured and flipped as asked, building it once.

        Each distinct combination gets its own surface, so sprites sharing this
        sheet never clobber each other's palette.
        """
        # Drop every cached recolour when the palette's colours change.
        if palette is not None:
            token = (palette.uid, palette.revision)
            if token != self._palette_token:
                self._palette_token = token
                self._variants.clear()

        base = self.frames[idx]
        indexed = base.get_bitsize() == 8
        # An unrecoloured, unflipped frame needs no variant at all.
        key_pal = palette_id if (indexed and palette is not None) else -1
        if key_pal == -1 and not flip_h and not flip_v:
            return base

        key = (idx, key_pal, flip_h, flip_v)
        cached = self._variants.get(key)
        if cached is not None:
            return cached

        surf = base.copy()
        if key_pal != -1:
            assert palette is not None
            surf.set_palette(palette.as_pygame_colorlist(palette_id))
        if flip_h or flip_v:
            surf = pygame.transform.flip(surf, flip_h, flip_v)
        self._variants[key] = surf
        return surf

    def __len__(self) -> int:
        return len(self.frames)


class Sprite:
    """A drawable sprite referencing a frame in a sheet."""

    def __init__(
        self,
        sheet: SpriteSheet,
        pos: Vec2 | None = None,
        *,
        palette_id: int = 0,
        priority: int = 1,
    ) -> None:
        self.sheet = sheet
        self.frame_idx = 0
        self.pos = pos if pos is not None else Vec2()
        self.palette_id = palette_id
        #: Draw-order hint. A lone Sprite draws whenever you blit it, so this
        #: only means something to whatever sorts them — ``World`` sorts on
        #: ``Entity.priority``, and ``TileLayer.render(only_priority=...)``
        #: splits a tile layer around the sprites.
        self.priority = priority
        self.flip_h = False
        self.flip_v = False
        self.visible = True
        self.alpha = 255
        #: Drawn at ``pos`` minus this, so a sprite wider than its hitbox can be
        #: centred on it (e.g. a 24px sprite on a 16px body).
        self.offset = Vec2()

    @property
    def width(self) -> int:
        return self.sheet.frame_w

    @property
    def height(self) -> int:
        return self.sheet.frame_h

    @property
    def rect(self) -> pygame.Rect:
        return pygame.Rect(
            int(self.pos.x - self.offset.x), int(self.pos.y - self.offset.y),
            self.sheet.frame_w, self.sheet.frame_h,
        )

    def draw(
        self,
        surface: pygame.Surface,
        camera_x: float = 0.0,
        camera_y: float = 0.0,
        palette: ColorPalette | None = None,
    ) -> None:
        if not self.visible or self.alpha <= 0:
            return
        frame = self.sheet.prepare(
            self.frame_idx, palette, self.palette_id, self.flip_h, self.flip_v
        )
        if self.alpha != 255:
            # A per-sprite alpha has to be set on the surface, so copy rather
            # than mutate the shared cached variant.
            frame = frame.copy()
            frame.set_alpha(self.alpha)

        sx = int(self.pos.x - self.offset.x - camera_x)
        sy = int(self.pos.y - self.offset.y - camera_y)
        surface.blit(frame, (sx, sy))


class AnimatedSprite:
    """Drives a Sprite's frame index from named, timed animations."""

    def __init__(self, sprite: Sprite) -> None:
        self.sprite = sprite
        self.animations: dict[str, list[int]] = {}
        self.durations: dict[str, float] = {}
        self.loops: dict[str, bool] = {}
        self.current: str | None = None
        self._timer = 0.0
        self._index = 0
        self._finished = False
        self.on_complete: Callable[[str], None] | None = None

    def add(self, name: str, frames: list[int], frame_time: float = 0.1,
            loop: bool = True) -> None:
        self.animations[name] = frames
        self.durations[name] = frame_time
        self.loops[name] = loop

    def play(self, name: str, restart: bool = False) -> None:
        if name not in self.animations:
            raise KeyError(
                f"no animation named {name!r}; known: {sorted(self.animations)}"
            )
        if name == self.current and not restart:
            return
        self.current = name
        self._timer = 0.0
        self._index = 0
        self._finished = False
        self.sprite.frame_idx = self.animations[name][0]

    @property
    def finished(self) -> bool:
        """True once a non-looping animation has reached its last frame."""
        return self._finished

    def update(self, dt: float) -> None:
        if self.current is None or self._finished:
            return
        frames = self.animations[self.current]
        ft = self.durations[self.current]
        if ft <= 0.0:
            return
        self._timer += dt
        while self._timer >= ft:
            self._timer -= ft
            self._index += 1
            if self._index >= len(frames):
                if self.loops[self.current]:
                    self._index = 0
                else:
                    # Hold the last frame and fire the callback exactly once.
                    self._index = len(frames) - 1
                    self._finished = True
                    self.sprite.frame_idx = frames[self._index]
                    if self.on_complete is not None:
                        self.on_complete(self.current)
                    return
            self.sprite.frame_idx = frames[self._index]
