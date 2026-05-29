"""Renderer — the virtual low-res screen and its scaled presentation.

Everything is drawn to a small virtual surface at the authentic console
resolution (e.g. 256x224). At the end of the frame that surface is upscaled to
the window with nearest-neighbour scaling, so pixels stay crisp and square the
way they did on a CRT-fed 16-bit console. An optional scanline overlay adds the
CRT feel.

Draw order, back to front, matches hardware layer priority:
    BG4 -> BG3 -> BG2 -> BG1 -> low-priority sprites -> normal sprites ->
    high-priority sprites -> UI overlay.
The Renderer owns the virtual surface; scenes draw onto ``renderer.target``.
"""

from __future__ import annotations

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
    ) -> None:
        self.width = width
        self.height = height
        self.palette = ColorPalette()

        flags = pygame.SCALED if False else 0  # we manage scaling ourselves
        self.scale = self._auto_scale(scale)
        win_size = (width * self.scale, height * self.scale)
        try:
            self._display = pygame.display.set_mode(win_size, flags, vsync=1 if vsync else 0)
        except pygame.error:
            # vsync unsupported on some headless/dummy drivers
            self._display = pygame.display.set_mode(win_size, flags)
        pygame.display.set_caption(title)

        # The authentic-resolution canvas. SRCALPHA so layers composite cleanly.
        self._virtual = pygame.Surface((width, height), pygame.SRCALPHA)

        self._scanline_overlay: pygame.Surface | None = None
        if scanlines:
            self._scanline_overlay = self._build_scanlines(win_size)

    # -- public surface scenes draw onto --------------------------------------
    @property
    def target(self) -> pygame.Surface:
        return self._virtual

    # -- frame lifecycle ------------------------------------------------------
    def begin_frame(self) -> None:
        """Clear the virtual screen to the backdrop colour (palette 0, colour 0)."""
        self._virtual.fill(self.palette.get_rgba(0, 0))

    def end_frame(self) -> None:
        """Upscale the virtual screen to the window and present it."""
        pygame.transform.scale(self._virtual, self._display.get_size(), self._display)
        if self._scanline_overlay is not None:
            self._display.blit(self._scanline_overlay, (0, 0))
        pygame.display.flip()

    # -- screen-wide effects --------------------------------------------------
    def apply_fade(self, t: float, to_white: bool = False) -> None:
        """Darken (or whiten) the whole virtual screen by ``t`` in [0,1]."""
        t = max(0.0, min(1.0, t))
        if t <= 0.0:
            return
        overlay = pygame.Surface((self.width, self.height))
        overlay.fill((255, 255, 255) if to_white else (0, 0, 0))
        overlay.set_alpha(int(t * 255))
        self._virtual.blit(overlay, (0, 0))

    def apply_mosaic(self, block: int) -> None:
        """Pixelate the virtual screen using ``block``-sized cells."""
        if block <= 1:
            return
        small = (max(1, self.width // block), max(1, self.height // block))
        shrunk = pygame.transform.scale(self._virtual, small)
        pygame.transform.scale(shrunk, (self.width, self.height), self._virtual)

    # -- resolution -----------------------------------------------------------
    def set_resolution(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self._virtual = pygame.Surface((width, height), pygame.SRCALPHA)
        win_size = (width * self.scale, height * self.scale)
        self._display = pygame.display.set_mode(win_size)
        if self._scanline_overlay is not None:
            self._scanline_overlay = self._build_scanlines(win_size)

    # -- helpers --------------------------------------------------------------
    def _auto_scale(self, scale: int) -> int:
        if scale > 0:
            return scale
        info = pygame.display.Info()
        max_w = max(1, info.current_w // self.width)
        max_h = max(1, info.current_h // self.height)
        return max(1, min(max_w, max_h))

    @staticmethod
    def _build_scanlines(size: tuple[int, int]) -> pygame.Surface:
        overlay = pygame.Surface(size, pygame.SRCALPHA)
        line = (0, 0, 0, 64)
        for y in range(0, size[1], 2):
            pygame.draw.line(overlay, line, (0, y), (size[0], y))
        return overlay
