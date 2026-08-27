"""Renderer — the virtual low-res screen and its scaled presentation.

Everything is drawn to a small virtual surface at the authentic console
resolution (e.g. 256x224). At the end of the frame that surface is upscaled to
the window and presented.

Scaling is always by a whole number and always nearest-neighbour. A fractional
scale would make some source pixels two window pixels wide and their neighbours
three, which shimmers horribly on scrolling tile edges — the one artefact no
amount of palette work recovers from. When the window is not an exact multiple
of the virtual screen (fullscreen, a resized window), the largest whole scale
that fits is used and the remainder becomes black letterbox/pillarbox bars.

An optional scanline overlay adds the CRT feel; it is rebuilt per scale so each
virtual pixel row gets the same treatment rather than every second *window* row.
"""

from __future__ import annotations

import numpy as np
import pygame

from .palette import ColorPalette

# Supported authentic resolutions (width, height).
RES_SNES = (256, 224)
RES_GENESIS = (320, 224)
RES_TALL = (320, 240)


class Renderer:
    def __init__(
        self,
        width: int = 256,
        height: int = 224,
        scale: int = 3,
        title: str = "RetroForge",
        scanlines: bool = False,
        vsync: bool = True,
        resizable: bool = False,
        fullscreen: bool = False,
    ) -> None:
        # _auto_scale and set_mode both need the video subsystem up. Both calls
        # are idempotent, so this is safe whether or not the caller ran
        # pygame.init() first.
        if not pygame.display.get_init():
            pygame.display.init()

        self.width = width
        self.height = height
        self.palette = ColorPalette()

        self._title = title
        self._vsync = vsync
        self._resizable = resizable
        self._fullscreen = fullscreen
        self._scanlines_on = scanlines

        self.scale = self._auto_scale(scale)
        self._create_window((width * self.scale, height * self.scale))

        # The authentic-resolution canvas. SRCALPHA so layers composite cleanly.
        self._virtual = pygame.Surface((width, height), pygame.SRCALPHA)
        # Scratch surface holding the upscaled image before it is letterboxed in.
        self._scaled: pygame.Surface | None = None
        self._scanline_overlay: pygame.Surface | None = None

    # -- public surface scenes draw onto --------------------------------------
    @property
    def target(self) -> pygame.Surface:
        return self._virtual

    @property
    def display(self) -> pygame.Surface:
        return self._display

    @property
    def size(self) -> tuple[int, int]:
        return self.width, self.height

    # -- frame lifecycle ------------------------------------------------------
    def begin_frame(self) -> None:
        """Clear the virtual screen to the backdrop colour (palette 0, colour 0)."""
        self._virtual.fill(self.palette.get_rgba(0, 0))

    def end_frame(self) -> None:
        """Upscale the virtual screen to the window and present it."""
        win_w, win_h = self._display.get_size()
        scale = max(1, min(win_w // self.width, win_h // self.height))
        out_w, out_h = self.width * scale, self.height * scale

        if self._scaled is None or self._scaled.get_size() != (out_w, out_h):
            self._scaled = pygame.Surface((out_w, out_h))
            self._scanline_overlay = (
                self._build_scanlines((out_w, out_h), scale)
                if self._scanlines_on else None
            )

        pygame.transform.scale(self._virtual, (out_w, out_h), self._scaled)
        if self._scanline_overlay is not None:
            self._scaled.blit(self._scanline_overlay, (0, 0))

        if (out_w, out_h) != (win_w, win_h):
            self._display.fill((0, 0, 0))          # letterbox / pillarbox bars
        self._display.blit(self._scaled, ((win_w - out_w) // 2, (win_h - out_h) // 2))
        pygame.display.flip()

    # -- screen-wide effects --------------------------------------------------
    def apply_fade(self, t: float, to_white: bool = False) -> None:
        """Darken (or whiten) the whole virtual screen by ``t`` in [0,1]."""
        t = max(0.0, min(1.0, t))
        if t <= 0.0:
            return
        overlay = self._fade_overlay(to_white)
        overlay.set_alpha(int(t * 255))
        self._virtual.blit(overlay, (0, 0))

    def _fade_overlay(self, to_white: bool) -> pygame.Surface:
        # Cached: a fade runs every frame for its whole duration.
        attr = "_fade_white" if to_white else "_fade_black"
        surf = getattr(self, attr, None)
        if surf is None or surf.get_size() != (self.width, self.height):
            surf = pygame.Surface((self.width, self.height))
            surf.fill((255, 255, 255) if to_white else (0, 0, 0))
            setattr(self, attr, surf)
        return surf

    def apply_mosaic(self, block: int) -> None:
        """Pixelate the virtual screen into exact ``block``-sized cells.

        Done by index gathering rather than scale-down/scale-up, so the cells are
        genuinely ``block`` wide even when ``block`` does not divide the screen
        width — otherwise the grid visibly jitters between two cell sizes.
        """
        if block <= 1:
            return
        block = min(block, self.width, self.height)
        arr = pygame.surfarray.pixels3d(self._virtual)
        xs = (np.arange(self.width) // block) * block
        ys = (np.arange(self.height) // block) * block
        arr[:] = arr[xs][:, ys]
        del arr  # release the surface lock before anything else touches it

    # -- window ---------------------------------------------------------------
    def set_resolution(self, width: int, height: int) -> None:
        """Switch the virtual screen size, keeping window flags and vsync."""
        self.width = width
        self.height = height
        self._virtual = pygame.Surface((width, height), pygame.SRCALPHA)
        self._scaled = None
        self._scanline_overlay = None
        self._fade_black = None
        self._fade_white = None
        self._create_window((width * self.scale, height * self.scale))

    def set_scale(self, scale: int) -> None:
        self.scale = self._auto_scale(scale)
        self._scaled = None
        self._scanline_overlay = None
        self._create_window((self.width * self.scale, self.height * self.scale))

    def toggle_fullscreen(self) -> None:
        self._fullscreen = not self._fullscreen
        self._scaled = None
        self._scanline_overlay = None
        self._create_window((self.width * self.scale, self.height * self.scale))

    def set_scanlines(self, on: bool) -> None:
        self._scanlines_on = on
        self._scanline_overlay = None
        self._scaled = None

    def handle_resize(self, size: tuple[int, int]) -> None:
        """Adopt a new window size (call on pygame.VIDEORESIZE)."""
        if not self._resizable:
            return
        self._display = pygame.display.set_mode(size, pygame.RESIZABLE)
        self._scaled = None
        self._scanline_overlay = None

    # -- helpers --------------------------------------------------------------
    def _create_window(self, win_size: tuple[int, int]) -> None:
        flags = 0
        if self._fullscreen:
            flags |= pygame.FULLSCREEN
        if self._resizable:
            flags |= pygame.RESIZABLE
        try:
            self._display = pygame.display.set_mode(
                win_size, flags, vsync=1 if self._vsync else 0
            )
        except pygame.error:
            # vsync is unsupported on some drivers (including the dummy one).
            self._display = pygame.display.set_mode(win_size, flags)
        pygame.display.set_caption(self._title)

    def _auto_scale(self, scale: int) -> int:
        if scale > 0:
            return scale
        info = pygame.display.Info()
        # Leave room for window chrome and a taskbar so the window still fits.
        max_w = max(1, info.current_w // self.width)
        max_h = max(1, (info.current_h - 80) // self.height)
        return max(1, min(max_w, max_h))

    @staticmethod
    def _build_scanlines(size: tuple[int, int], scale: int) -> pygame.Surface:
        """One dark band per *virtual* pixel row, sized to the current scale."""
        overlay = pygame.Surface(size, pygame.SRCALPHA)
        band = max(1, scale // 2)
        line = (0, 0, 0, 64)
        for y in range(scale - band, size[1], scale):
            overlay.fill(line, (0, y, size[0], band))
        return overlay
