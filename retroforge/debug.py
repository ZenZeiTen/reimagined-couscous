"""Debug overlay — see what the simulation is actually doing.

Game feel is tuned by watching, and you cannot tune what you cannot see. This
draws the things that are otherwise invisible: the frame budget, the collision
boxes that are not the sprite, which tiles the map thinks are solid, and whatever
values you want to watch this session.

    self.debug = rf.DebugOverlay(engine)
    self.debug.watch("vel.y", lambda: round(self.body.vel.y, 1))
    ...
    self.debug.draw(renderer, world=self.world, tilemap=self.tilemap,
                    camera=self.camera)

Toggle it with ``debug.enabled = not debug.enabled`` on a key of your choosing —
the overlay deliberately does not steal a button from the game.
"""

from __future__ import annotations

import time
from collections.abc import Callable

import pygame

from .graphics.font import BitmapFont
from .graphics.tilemap import TileMap
from .physics.body import RigidBody2D

SOLID_COLOR = (255, 64, 64)
ONE_WAY_COLOR = (255, 200, 0)
BODY_COLOR = (64, 255, 128)
HITBOX_COLOR = (255, 64, 255)
TEXT_COLOR = (235, 240, 255)
SHADOW = (0, 0, 0)


class DebugOverlay:
    def __init__(self, engine=None, *, font: BitmapFont | None = None,
                 enabled: bool = True, sample_window: int = 60) -> None:
        self.engine = engine
        self.font = font or BitmapFont.default()
        self.enabled = enabled
        self.show_bodies = True
        self.show_tiles = False
        self.show_stats = True

        self._watches: dict[str, Callable[[], object]] = {}
        self._frames: list[float] = []
        self._window = max(1, sample_window)
        self._last = time.perf_counter()

    # -- data -----------------------------------------------------------------
    def watch(self, label: str, getter: Callable[[], object]) -> None:
        """Show ``label: getter()`` in the corner every frame."""
        self._watches[label] = getter

    def unwatch(self, label: str) -> None:
        self._watches.pop(label, None)

    def tick(self) -> None:
        """Sample the frame time. Call once per rendered frame."""
        now = time.perf_counter()
        self._frames.append(now - self._last)
        self._last = now
        if len(self._frames) > self._window:
            del self._frames[:-self._window]

    @property
    def fps(self) -> float:
        if not self._frames:
            return 0.0
        mean = sum(self._frames) / len(self._frames)
        return 1.0 / mean if mean > 0 else 0.0

    @property
    def frame_ms(self) -> float:
        if not self._frames:
            return 0.0
        return 1000.0 * sum(self._frames) / len(self._frames)

    @property
    def worst_ms(self) -> float:
        return 1000.0 * max(self._frames) if self._frames else 0.0

    # -- drawing --------------------------------------------------------------
    def draw(self, renderer, *, world=None, bodies=None, tilemap: TileMap | None = None,
             camera=None) -> None:
        if not self.enabled:
            return
        self.tick()
        target = renderer.target
        cx, cy = _offset(camera)

        if self.show_tiles and tilemap is not None:
            self._draw_tiles(target, tilemap, cx, cy, renderer.width, renderer.height)
        if self.show_bodies:
            self._draw_bodies(target, _bodies_of(world, bodies), cx, cy)
        if self.show_stats:
            self._draw_stats(target, world)

    def _draw_tiles(self, target, tm: TileMap, cx: float, cy: float,
                    view_w: int, view_h: int) -> None:
        tx0 = max(0, int(cx) // tm.tile_w)
        ty0 = max(0, int(cy) // tm.tile_h)
        tx1 = min(tm.width, tx0 + view_w // tm.tile_w + 2)
        ty1 = min(tm.height, ty0 + view_h // tm.tile_h + 2)
        for ty in range(ty0, ty1):
            for tx in range(tx0, tx1):
                if tm.solid[ty, tx]:
                    colour = SOLID_COLOR
                elif tm.one_way[ty, tx]:
                    colour = ONE_WAY_COLOR
                else:
                    continue
                rect = pygame.Rect(int(tx * tm.tile_w - cx), int(ty * tm.tile_h - cy),
                                   tm.tile_w, tm.tile_h)
                pygame.draw.rect(target, colour, rect, 1)

    def _draw_bodies(self, target, bodies, cx: float, cy: float) -> None:
        for body in bodies:
            rect = body.rect.move(int(-cx), int(-cy))
            pygame.draw.rect(target, BODY_COLOR, rect, 1)
            for name in body.hitboxes:
                hb = body.hitbox(name).move(int(-cx), int(-cy))
                pygame.draw.rect(target, HITBOX_COLOR, hb, 1)

    def _draw_stats(self, target, world) -> None:
        lines = [f"{self.fps:5.1f} FPS  {self.frame_ms:4.1f}ms  peak {self.worst_ms:4.1f}"]
        if world is not None:
            lines.append(f"entities {len(world)}")
        for label, getter in self._watches.items():
            try:
                lines.append(f"{label} {getter()}")
            except Exception as exc:            # a broken watch must not crash the game
                lines.append(f"{label} <{type(exc).__name__}>")
        self.font.draw(target, "\n".join(lines), 2, 2, TEXT_COLOR, shadow=SHADOW)


def _bodies_of(world, bodies) -> list[RigidBody2D]:
    if bodies is not None:
        return [b if isinstance(b, RigidBody2D) else b.body for b in bodies]
    if world is None:
        return []
    return [e.body for e in world if getattr(e, "active", True)]


def _offset(camera) -> tuple[float, float]:
    if camera is None:
        return 0.0, 0.0
    top_left = getattr(camera, "top_left", None)
    if top_left is not None:
        return float(top_left.x), float(top_left.y)
    try:
        return float(camera[0]), float(camera[1])
    except (TypeError, IndexError):
        return 0.0, 0.0
