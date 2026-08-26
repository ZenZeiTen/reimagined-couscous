"""Generate every asset for the Coin Rush demo.

Tiles, sprites, and the level itself are drawn/emitted programmatically, so
nothing binary is committed and the demo runs straight after a checkout.

The level is written as a real Tiled JSON map — base64 + zlib layer data (what
Tiled actually exports by default), a tileset whose ``firstgid`` is deliberately
not 1, a one-way platform flagged by tile property, and an object layer holding
the player start, the enemy patrol posts, and the coins. Loading it exercises
the importer the same way an editor-authored level would.

    python examples/coin_rush/generate_assets.py
"""

from __future__ import annotations

import base64
import json
import os
import random
import zlib

import pygame

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

TILE = 16
MAP_W, MAP_H = 64, 24
FIRSTGID = 17          # not 1, so the importer's firstgid handling is exercised

# Local tile ids inside the tileset image.
EMPTY, ROCK, GRASS, BRICK, PLATFORM = -1, 0, 1, 2, 3


# ---------------------------------------------------------------------------
# Art
# ---------------------------------------------------------------------------

def make_tiles(path: str) -> None:
    """A 4-tile sheet: rock, grass-topped rock, brick, one-way platform."""
    sheet = pygame.Surface((TILE * 4, TILE), pygame.SRCALPHA)
    rng = random.Random(11)

    def speckle(x0: int, base: tuple[int, int, int], n: int = 26) -> None:
        for _ in range(n):
            x = rng.randint(x0, x0 + TILE - 1)
            y = rng.randint(0, TILE - 1)
            d = rng.randint(-12, 12)
            sheet.set_at((x, y), (max(0, base[0] + d), max(0, base[1] + d),
                                  max(0, base[2] + d)))

    # 0: rock
    ROCK_C = (78, 68, 92)
    pygame.draw.rect(sheet, ROCK_C, (0, 0, TILE, TILE))
    speckle(0, ROCK_C)

    # 1: grass-topped rock
    pygame.draw.rect(sheet, ROCK_C, (TILE, 0, TILE, TILE))
    speckle(TILE, ROCK_C)
    pygame.draw.rect(sheet, (72, 168, 84), (TILE, 0, TILE, 5))
    pygame.draw.rect(sheet, (128, 216, 116), (TILE, 0, TILE, 2))

    # 2: brick
    BRICK_C = (150, 78, 62)
    pygame.draw.rect(sheet, BRICK_C, (TILE * 2, 0, TILE, TILE))
    for y in (0, 8):
        pygame.draw.line(sheet, (96, 48, 40), (TILE * 2, y), (TILE * 3 - 1, y))
    pygame.draw.line(sheet, (96, 48, 40), (TILE * 2 + 7, 0), (TILE * 2 + 7, 7))
    pygame.draw.line(sheet, (96, 48, 40), (TILE * 2 + 12, 8), (TILE * 2 + 12, 15))

    # 3: one-way wooden platform — visibly thin so you read it as jump-through
    pygame.draw.rect(sheet, (156, 112, 62), (TILE * 3, 0, TILE, 5))
    pygame.draw.rect(sheet, (196, 152, 92), (TILE * 3, 0, TILE, 2))
    pygame.draw.line(sheet, (110, 74, 40), (TILE * 3 + 5, 0), (TILE * 3 + 5, 4))
    pygame.draw.line(sheet, (110, 74, 40), (TILE * 3 + 11, 0), (TILE * 3 + 11, 4))

    pygame.image.save(sheet, path)


def make_player(path: str) -> None:
    """16x24, four frames: idle, three-frame run cycle."""
    sheet = pygame.Surface((16 * 4, 24), pygame.SRCALPHA)
    SKIN = (245, 200, 160)
    SHIRT = (64, 128, 232)
    TROUSER = (48, 60, 110)
    BOOT = (52, 40, 34)
    HAIR = (96, 62, 40)

    def figure(ox: int, leg_l: int, leg_r: int, arm: int) -> None:
        pygame.draw.rect(sheet, HAIR, (ox + 4, 1, 8, 4))
        pygame.draw.rect(sheet, SKIN, (ox + 4, 4, 8, 6))
        pygame.draw.rect(sheet, (30, 30, 40), (ox + 6, 6, 2, 2))
        pygame.draw.rect(sheet, (30, 30, 40), (ox + 10, 6, 2, 2))
        pygame.draw.rect(sheet, SHIRT, (ox + 3, 10, 10, 7))
        pygame.draw.rect(sheet, SKIN, (ox + 1, 11 + arm, 2, 5))      # left arm
        pygame.draw.rect(sheet, SKIN, (ox + 13, 11 - arm, 2, 5))     # right arm
        pygame.draw.rect(sheet, TROUSER, (ox + 4, 17, 3, 4 + leg_l))
        pygame.draw.rect(sheet, TROUSER, (ox + 9, 17, 3, 4 + leg_r))
        pygame.draw.rect(sheet, BOOT, (ox + 3, 20 + leg_l, 4, 2))
        pygame.draw.rect(sheet, BOOT, (ox + 9, 20 + leg_r, 4, 2))

    figure(0, 0, 0, 0)        # idle
    figure(16, 1, -1, 1)      # run 1
    figure(32, 0, 0, 0)       # run 2 (pass)
    figure(48, -1, 1, -1)     # run 3
    pygame.image.save(sheet, path)


def make_enemy(path: str) -> None:
    """16x16, two-frame waddling blob."""
    sheet = pygame.Surface((16 * 2, 16), pygame.SRCALPHA)
    BODY = (196, 72, 96)
    DARK = (128, 40, 62)

    for i, squash in enumerate((0, 1)):
        ox = i * 16
        top = 3 + squash
        pygame.draw.ellipse(sheet, BODY, (ox + 1, top, 14, 13 - squash))
        pygame.draw.ellipse(sheet, DARK, (ox + 1, top + 8 - squash, 14, 5))
        pygame.draw.rect(sheet, (255, 255, 255), (ox + 4, top + 3, 3, 3))
        pygame.draw.rect(sheet, (255, 255, 255), (ox + 9, top + 3, 3, 3))
        pygame.draw.rect(sheet, (20, 20, 30), (ox + 5, top + 4, 2, 2))
        pygame.draw.rect(sheet, (20, 20, 30), (ox + 10, top + 4, 2, 2))
    pygame.image.save(sheet, path)


def make_coin(path: str) -> None:
    """8x8, four-frame spin."""
    sheet = pygame.Surface((8 * 4, 8), pygame.SRCALPHA)
    GOLD = (255, 206, 64)
    EDGE = (198, 138, 28)
    SHINE = (255, 246, 190)
    widths = (7, 5, 2, 5)
    for i, w in enumerate(widths):
        ox = i * 8 + (8 - w) // 2
        pygame.draw.ellipse(sheet, EDGE, (ox, 0, w, 8))
        if w > 2:
            pygame.draw.ellipse(sheet, GOLD, (ox, 1, w, 6))
        if w > 4:
            pygame.draw.rect(sheet, SHINE, (ox + 1, 2, 1, 3))
    pygame.image.save(sheet, path)


# ---------------------------------------------------------------------------
# Level
# ---------------------------------------------------------------------------

def build_level() -> tuple[list[int], list[dict]]:
    """Return (gids, objects) for a hand-shaped run of platforms and gaps."""
    grid = [[EMPTY] * MAP_W for _ in range(MAP_H)]
    ground_y = MAP_H - 4
    objects: list[dict] = []
    rng = random.Random(5)

    def fill(x0: int, y0: int, w: int, h: int, tile: int) -> None:
        for y in range(y0, min(MAP_H, y0 + h)):
            for x in range(x0, min(MAP_W, x0 + w)):
                if 0 <= x < MAP_W and 0 <= y < MAP_H:
                    grid[y][x] = tile

    def ground(x0: int, w: int) -> None:
        fill(x0, ground_y, w, 1, GRASS)
        fill(x0, ground_y + 1, w, MAP_H - ground_y - 1, ROCK)

    def coin(tx: float, ty: float) -> None:
        objects.append({"name": "coin", "type": "coin",
                        "x": tx * TILE + 4, "y": ty * TILE + 4,
                        "width": 8, "height": 8})

    # Ground with two pits.
    ground(0, 18)
    ground(23, 15)
    ground(43, MAP_W - 43)

    # Brick steps up out of the first pit.
    fill(20, ground_y - 2, 3, 1, BRICK)
    fill(15, ground_y - 4, 3, 1, BRICK)

    # A tower to climb, with jump-through platforms.
    fill(28, ground_y - 3, 2, 3, BRICK)
    fill(32, ground_y - 6, 4, 1, PLATFORM)
    fill(38, ground_y - 9, 4, 1, PLATFORM)
    fill(33, ground_y - 12, 5, 1, PLATFORM)

    # Floating islands over the second pit.
    fill(39, ground_y - 2, 3, 1, BRICK)
    fill(46, ground_y - 5, 4, 1, PLATFORM)
    fill(53, ground_y - 3, 3, 1, BRICK)

    # Coins: a trail along the ground and clusters over the interesting bits.
    for x in range(3, 17, 3):
        coin(x, ground_y - 2)
    for x in range(32, 36):
        coin(x, ground_y - 7)
    for x in range(38, 42):
        coin(x, ground_y - 10)
    for x in range(33, 38):
        coin(x, ground_y - 13)
    for x in range(46, 50):
        coin(x, ground_y - 6)
    for x in range(56, 62, 2):
        coin(x, ground_y - 2)

    # Scatter a few loose bricks for silhouette.
    for _ in range(6):
        x = rng.randint(5, MAP_W - 6)
        if grid[ground_y - 5][x] == EMPTY:
            grid[ground_y - 5][x] = BRICK

    objects.append({"name": "player", "type": "spawn",
                    "x": 2 * TILE, "y": (ground_y - 2) * TILE,
                    "width": 12, "height": 22})
    for tx in (10, 26, 30, 45, 50, 58):
        objects.append({"name": "walker", "type": "enemy",
                        "x": tx * TILE, "y": (ground_y - 1) * TILE,
                        "width": 14, "height": 14,
                        "properties": [{"name": "range", "type": "int",
                                        "value": 48}]})

    gids = [0 if grid[y][x] == EMPTY else FIRSTGID + grid[y][x]
            for y in range(MAP_H) for x in range(MAP_W)]
    return gids, objects


def write_level(path: str) -> None:
    gids, objects = build_level()
    blob = bytes()
    for gid in gids:
        blob += int(gid).to_bytes(4, "little")
    data = base64.b64encode(zlib.compress(blob)).decode("ascii")

    level = {
        "type": "map",
        "version": "1.10",
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "width": MAP_W,
        "height": MAP_H,
        "tilewidth": TILE,
        "tileheight": TILE,
        "tilesets": [{
            "firstgid": FIRSTGID,
            "name": "tiles",
            "image": "tiles.png",
            "imagewidth": TILE * 4,
            "imageheight": TILE,
            "tilewidth": TILE,
            "tileheight": TILE,
            "tilecount": 4,
            "columns": 4,
            "tiles": [
                {"id": ROCK, "properties": [
                    {"name": "solid", "type": "bool", "value": True}]},
                {"id": GRASS, "properties": [
                    {"name": "solid", "type": "bool", "value": True}]},
                {"id": BRICK, "properties": [
                    {"name": "solid", "type": "bool", "value": True}]},
                {"id": PLATFORM, "properties": [
                    {"name": "one_way", "type": "bool", "value": True}]},
            ],
        }],
        "layers": [
            {
                "type": "tilelayer",
                "name": "world",
                "id": 1,
                "width": MAP_W,
                "height": MAP_H,
                "x": 0, "y": 0,
                "opacity": 1,
                "visible": True,
                "encoding": "base64",
                "compression": "zlib",
                "data": data,
            },
            {
                "type": "objectgroup",
                "name": "spawns",
                "id": 2,
                "opacity": 1,
                "visible": True,
                "objects": objects,
            },
        ],
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(level, fh)


def main() -> None:
    pygame.init()
    os.makedirs(ASSETS, exist_ok=True)
    make_tiles(os.path.join(ASSETS, "tiles.png"))
    make_player(os.path.join(ASSETS, "player.png"))
    make_enemy(os.path.join(ASSETS, "enemy.png"))
    make_coin(os.path.join(ASSETS, "coin.png"))
    write_level(os.path.join(ASSETS, "level.json"))
    print("Coin Rush assets generated.")


if __name__ == "__main__":
    main()
