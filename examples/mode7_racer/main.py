"""RetroForge demo: Mode 7 racer.

An F-Zero-style race scene that showcases the engine's most SNES-distinctive
feature: the Mode 7 affine ground plane combined with real-time colour cycling
on the lane markers, a starfield, and a smooth fixed-timestep steering loop.

What's happening every frame:
  1. Sky gradient (pre-baked surface) + stars + sun blitted above horizon.
  2. Colour cycling: the yellow lane-marker pixels in the numpy track array are
     rewritten to the current cycle colour before Mode 7 samples them.
  3. Mode 7 renders the perspective ground, wrapping infinitely.
  4. Racer sprite drawn at a fixed screen position.
  5. White boost flash fades out if active.
  6. Minimal boost-charge HUD bar.

Controls: LEFT/RIGHT to steer  |  A/Z to boost  |  Select/Start to quit.
"""

from __future__ import annotations

import math
import os
import random
import sys

import numpy as np
import pygame

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
import retroforge as rf

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

HORIZON_Y    = 88       # screen y where the ground plane begins
BASE_SPEED   = 68.0     # texture px/s at normal cruise
BOOST_SPEED  = 210.0    # texture px/s during boost
TURN_RATE    = 1.3      # radians/s
BOOST_DUR    = 0.5      # seconds
BOOST_CD     = 2.0      # cooldown before boost can be reused

# Lane-marker colour cycle: yellow → amber → orange-red → amber → loop
_CYCLE = [
    (255, 220,   0),
    (255, 170,   0),
    (255,  80,  20),
    (255, 170,   0),
]


def _lerp_color(c0: tuple, c1: tuple, t: float) -> tuple[int, int, int]:
    return (
        int(c0[0] + (c1[0] - c0[0]) * t),
        int(c0[1] + (c1[1] - c0[1]) * t),
        int(c0[2] + (c1[2] - c0[2]) * t),
    )


class Mode7Racer(rf.Scene):
    def on_enter(self, engine: rf.GameEngine) -> None:
        self.engine = engine
        r = engine.renderer

        # --- sky ---
        self._sky  = _bake_sky(r.width, HORIZON_Y)
        self._stars = _gen_stars(r.width, HORIZON_Y, count=55, seed=7)
        self._sun_pos = (r.width - 60, HORIZON_Y - 14)

        # --- Mode 7 ground ---
        src = pygame.image.load(os.path.join(ASSETS, "track.png")).convert(24)
        self.m7 = rf.Mode7(src)
        self.m7.horizon    = HORIZON_Y
        self.m7.cam_height = 58.0
        self.m7.fov        = 88.0
        self.m7.scale      = 1.15

        # Colour cycling setup: keep a pristine copy of the pixel array and a
        # boolean mask of which pixels are the yellow lane markers.
        self._track_base  = self.m7._src_rgb.copy()   # (512, 512, 3) uint8
        base = self._track_base
        self._marker_mask = (base[:, :, 0] > 200) & \
                            (base[:, :, 1] > 160) & \
                            (base[:, :, 2] <  30)  # selects (255,220,0) yellow

        # --- racer sprite ---
        sheet = rf.SpriteSheet(
            pygame.image.load(os.path.join(ASSETS, "ship.png")).convert_alpha(), 32, 24
        )
        self.ship = rf.Sprite(sheet, rf.Vec2(0, 0))

        # --- motion state ---
        self.pos_x   = 256.0
        self.pos_y   = 256.0
        self.angle   = 0.0   # heading in the track texture (radians)
        self.speed   = BASE_SPEED

        self._cycle_t  = 0.0   # 0..1, drives colour cycle
        self._boost_t  = 0.0   # time remaining in current boost
        self._boost_cd = 0.0   # cooldown timer
        self._flash_a  = 0.0   # screen-flash alpha (0..255), decays each frame
        self._time     = 0.0   # total elapsed time (for wobble)

    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_pressed(rf.Button.SELECT) or inp.is_just_pressed(rf.Button.START):
            self.engine.quit()

        self._time += dt
        self._boost_cd = max(0.0, self._boost_cd - dt)

        # Boost trigger
        if inp.is_just_pressed(rf.Button.A) and self._boost_cd <= 0.0:
            self._boost_t = BOOST_DUR
            self._boost_cd = BOOST_DUR + BOOST_CD
            self._flash_a = 180.0

        if self._boost_t > 0.0:
            self._boost_t = max(0.0, self._boost_t - dt)
            self.speed = BOOST_SPEED
        else:
            self.speed = BASE_SPEED

        # Steering — hold to turn, release to go straight
        steer = 0.0
        if inp.is_pressed(rf.Button.LEFT):
            steer -= TURN_RATE
        if inp.is_pressed(rf.Button.RIGHT):
            steer += TURN_RATE
        self.angle += steer * dt

        # Advance camera along heading
        self.pos_x += math.sin(self.angle) * self.speed * dt
        self.pos_y += math.cos(self.angle) * self.speed * dt
        self.m7.pivot = rf.Vec2(self.pos_x % 512, self.pos_y % 512)

        # During boost: subtle angle wobble for vibration feel
        rendered_angle = self.angle
        if self._boost_t > 0.0:
            rendered_angle += math.sin(self._time * 28.0) * 0.022
        self.m7.angle = rendered_angle

        # Colour cycling: overwrite yellow pixels with current cycle colour
        self._cycle_t = (self._cycle_t + dt * 1.8) % 1.0
        n = len(_CYCLE)
        idx_f = self._cycle_t * n
        lo = _CYCLE[int(idx_f) % n]
        hi = _CYCLE[(int(idx_f) + 1) % n]
        color = _lerp_color(lo, hi, idx_f % 1.0)
        self.m7._src_rgb[:] = self._track_base
        self.m7._src_rgb[self._marker_mask] = color

        # Decay flash
        self._flash_a = max(0.0, self._flash_a - 400.0 * dt)

    def draw(self, renderer: rf.Renderer) -> None:
        tgt = renderer.target
        w, h = renderer.width, renderer.height

        # 1. Sky gradient
        tgt.blit(self._sky, (0, 0))

        # 2. Stars (1-px dots, pre-computed positions)
        for sx, sy in self._stars:
            tgt.set_at((sx, sy), (220, 220, 255))

        # 3. Sun (just above horizon, right side)
        pygame.draw.circle(tgt, (255, 200, 60), self._sun_pos, 9)
        pygame.draw.circle(tgt, (255, 235, 140), self._sun_pos, 6)

        # 4. Thin horizon haze band
        for i in range(4):
            alpha_frac = (4 - i) / 4.0
            c = int(40 * alpha_frac)
            pygame.draw.line(tgt, (c, c + 5, c + 30),
                             (0, HORIZON_Y - 1 - i), (w, HORIZON_Y - 1 - i))

        # 5. Mode 7 ground plane
        self.m7.render(tgt)

        # 6. Racer sprite — fixed screen position, lower centre
        self.ship.pos = rf.Vec2(w // 2 - 16, h - 50)
        self.ship.draw(tgt, 0, 0)

        # 7. Boost flash overlay
        if self._flash_a > 1.0:
            flash = pygame.Surface((w, h))
            flash.fill((255, 255, 255))
            flash.set_alpha(int(self._flash_a))
            tgt.blit(flash, (0, 0))

        # 8. HUD — boost charge bar (bottom-right corner)
        _draw_hud(tgt, w, h, self._boost_cd, BOOST_DUR + BOOST_CD)


# ---------------------------------------------------------------------------
# Helpers (module level, not methods — they have no business being on the scene)
# ---------------------------------------------------------------------------

def _bake_sky(w: int, h: int) -> pygame.Surface:
    """Pre-render a vertical gradient: deep space → horizon blue."""
    surf = pygame.Surface((w, h))
    top = (8, 8, 20)
    bot = (28, 45, 110)
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        pygame.draw.line(surf, (r, g, b), (0, y), (w - 1, y))
    return surf


def _gen_stars(w: int, h: int, count: int, seed: int) -> list[tuple[int, int]]:
    rng = random.Random(seed)
    return [(rng.randint(0, w - 1), rng.randint(0, h - 4)) for _ in range(count)]


def _draw_hud(surf: pygame.Surface, w: int, h: int,
              cooldown: float, full_cd: float) -> None:
    """Boost charge bar: fills as cooldown expires, glows when ready."""
    bar_w, bar_h = 36, 4
    bx, by = w - bar_w - 6, h - bar_h - 6
    # Background trough
    pygame.draw.rect(surf, (15, 15, 25), (bx - 1, by - 1, bar_w + 2, bar_h + 2))
    # Charge fill
    charge = 1.0 - min(1.0, cooldown / full_cd if full_cd > 0 else 1.0)
    fill = int(bar_w * charge)
    if fill > 0:
        color = (0, 255, 180) if charge >= 1.0 else (0, 180, 120)
        pygame.draw.rect(surf, color, (bx, by, fill, bar_h))


def main() -> None:
    pygame.init()
    renderer = rf.Renderer(*rf.RES_GENESIS, scale=3, title="RetroForge — Mode 7 Racer")
    engine = rf.GameEngine(renderer, init_audio=False)
    engine.run(Mode7Racer())
    pygame.quit()


if __name__ == "__main__":
    main()
