"""Sprites — sheets, drawables, and animation.

Three small classes, related by composition rather than inheritance:

* ``SpriteSheet`` slices a source surface into frames once, up front.
* ``Sprite`` is a positioned, flippable, palette-indexed drawable referencing a
  sheet frame.
* ``AnimatedSprite`` *contains* a ``Sprite`` and drives its ``frame_idx`` from
  named animations.

Palette swapping: if a sprite's frames are 8-bit indexed surfaces, changing
``palette_id`` re-points the surface palette to a different sub-palette — a
recolour with no pixel work, exactly like an OAM palette attribute on hardware.
"""

from __future__ import annotations

from typing import Callable

import pygame

from ..renderer.palette import ColorPalette
from ..utils.vec2 import Vec2


class SpriteSheet:
    """Slices a surface into equal-sized frames (or explicit rects)."""

    def __init__(self, surface: pygame.Surface, frame_w: int, frame_h: int) -> None:
        self.surface = surface
        self.frame_w = frame_w
        self.frame_h = frame_h
        self.frames: list[pygame.Surface] = []
        self._slice_grid()

    def _slice_grid(self) -> None:
        w, h = self.surface.get_size()
        for fy in range(0, h - self.frame_h + 1, self.frame_h):
            for fx in range(0, w - self.frame_w + 1, self.frame_w):
                rect = pygame.Rect(fx, fy, self.frame_w, self.frame_h)
                self.frames.append(self.surface.subsurface(rect).copy())

    def slice_by_rects(self, rects: list[pygame.Rect]) -> None:
        """Replace the grid slicing with an explicit list of frame rects."""
        self.frames = [self.surface.subsurface(r).copy() for r in rects]

    def get_frame(self, idx: int) -> pygame.Surface:
        return self.frames[idx]

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
        self.priority = priority
        self.flip_h = False
        self.flip_v = False
        self.visible = True
        self.alpha = 255
        self._last_palette_id = -1

    def draw(self, surface: pygame.Surface, camera_x: float, camera_y: float,
             palette: ColorPalette | None = None) -> None:
        if not self.visible:
            return
        frame = self.sheet.get_frame(self.frame_idx)

        # Apply palette swap on indexed surfaces only, and only when it changed.
        if palette is not None and frame.get_bitsize() == 8:
            if self.palette_id != self._last_palette_id:
                frame.set_palette(palette.as_pygame_colorlist(self.palette_id))
                self._last_palette_id = self.palette_id

        if self.flip_h or self.flip_v:
            frame = pygame.transform.flip(frame, self.flip_h, self.flip_v)
        if self.alpha != 255:
            frame = frame.copy()
            frame.set_alpha(self.alpha)

        sx = int(self.pos.x - camera_x)
        sy = int(self.pos.y - camera_y)
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
        self.on_complete: Callable[[], None] | None = None

    def add(self, name: str, frames: list[int], frame_time: float = 0.1,
            loop: bool = True) -> None:
        self.animations[name] = frames
        self.durations[name] = frame_time
        self.loops[name] = loop

    def play(self, name: str, restart: bool = False) -> None:
        if name == self.current and not restart:
            return
        if name not in self.animations:
            return
        self.current = name
        self._timer = 0.0
        self._index = 0
        self.sprite.frame_idx = self.animations[name][0]

    def update(self, dt: float) -> None:
        if self.current is None:
            return
        frames = self.animations[self.current]
        self._timer += dt
        ft = self.durations[self.current]
        while self._timer >= ft:
            self._timer -= ft
            self._index += 1
            if self._index >= len(frames):
                if self.loops[self.current]:
                    self._index = 0
                else:
                    self._index = len(frames) - 1
                    if self.on_complete is not None:
                        self.on_complete()
                    break
            self.sprite.frame_idx = frames[self._index]
