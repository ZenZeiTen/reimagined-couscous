"""Generate the track texture and racer sprite for the Mode 7 demo.

Run once (or whenever you want to refresh the assets)::

    python examples/mode7_racer/generate_assets.py

Everything is drawn programmatically — no external art required.
"""

from __future__ import annotations

import os
import random

import pygame

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")


def make_track(path: str, size: int = 512) -> None:
    """512×512 24-bit race track for Mode 7 (tiles seamlessly on all axes)."""
    surf = pygame.Surface((size, size))

    ASPHALT = (28, 28, 36)
    ASPHALT_ALT = (38, 38, 50)
    CENTER = (200, 200, 200)
    BARRIER = (190, 30, 30)
    BARRIER_INNER = (70, 15, 15)
    YELLOW = (255, 220, 0)   # this is the colour-cycling target

    surf.fill(ASPHALT)

    # Alternating depth bands create the "stripe compression near horizon" cue
    # that makes Mode 7 look genuinely 3D even before perspective kicks in.
    BAND = 32
    for y in range(0, size, BAND * 2):
        pygame.draw.rect(surf, ASPHALT_ALT, (0, y, size, BAND))

    # Red edge barriers and a dark inner border
    pygame.draw.rect(surf, BARRIER,       (0,        0, 12,   size))
    pygame.draw.rect(surf, BARRIER,       (size-12,  0, 12,   size))
    pygame.draw.rect(surf, BARRIER_INNER, (12,       0,  4,   size))
    pygame.draw.rect(surf, BARRIER_INNER, (size-16,  0,  4,   size))

    # White centre divider
    pygame.draw.rect(surf, CENTER, (size // 2 - 2, 0, 4, size))

    # Yellow lane dashes at the quarter and three-quarter marks.
    # These are the colour-cycling targets: bright and large enough to stand
    # out in the numpy mask, and spaced so they pulse rhythmically as you drive.
    DASH_H, GAP = 22, 42
    for lx in (size // 4, 3 * size // 4):
        for y in range(0, size, DASH_H + GAP):
            pygame.draw.rect(surf, YELLOW, (lx - 3, y, 6, DASH_H))

    # Subtle track surface detail: small scattered pebble marks
    rng = random.Random(42)
    for _ in range(600):
        x = rng.randint(20, size - 20)
        y = rng.randint(0, size - 1)
        shade = rng.randint(20, 30)
        surf.set_at((x, y), (ASPHALT[0] + shade, ASPHALT[1] + shade, ASPHALT[2] + shade + 5))

    pygame.image.save(surf, path)


def make_ship(path: str) -> None:
    """32×24 top-down racing craft with SRCALPHA transparency."""
    surf = pygame.Surface((32, 24), pygame.SRCALPHA)

    BODY     = (75,  135, 220)
    WING     = (30,   60, 110)
    COCKPIT  = (10,   30,  70)
    GLASS    = (170, 205, 255)
    EXHAUST  = (255, 140,   0)
    FLAME    = (255, 220, 100)
    ACCENT   = (200, 230, 255)

    # Main body — tapering wedge, nose at y=0 (top of sprite = front of car)
    pts = [(16, 0), (9, 5), (7, 19), (25, 19), (23, 5)]
    pygame.draw.polygon(surf, BODY, pts)

    # Side wings
    pygame.draw.polygon(surf, WING, [(2, 10), (7, 8), (7, 20), (2, 22)])
    pygame.draw.polygon(surf, WING, [(30, 10), (25, 8), (25, 20), (30, 22)])

    # Accent stripe down the spine
    for y in range(3, 19):
        pygame.draw.line(surf, ACCENT, (15, y), (17, y))

    # Cockpit dome
    pygame.draw.ellipse(surf, COCKPIT, (11, 5, 10, 8))
    pygame.draw.ellipse(surf, GLASS,   (13, 6,  5, 5))  # glass highlight

    # Engine exhaust glow at the tail (y=19-23)
    pygame.draw.rect(surf, EXHAUST, (10, 19, 12, 4))
    pygame.draw.rect(surf, FLAME,   (12, 20,  8, 3))
    pygame.draw.rect(surf, (255, 255, 200), (14, 21, 4, 2))  # hot core

    pygame.image.save(surf, path)


def main() -> None:
    pygame.init()
    os.makedirs(ASSETS, exist_ok=True)
    make_track(os.path.join(ASSETS, "track.png"))
    make_ship(os.path.join(ASSETS, "ship.png"))
    print("Mode 7 racer assets generated.")


if __name__ == "__main__":
    main()
