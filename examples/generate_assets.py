"""Generate clean placeholder assets for the example games.

Rather than ship binary art (or pull "slop" from the web), this script draws a
small, tidy tileset and a player spritesheet procedurally and writes a Tiled-
format JSON level. Run it once to (re)create the assets used by the platformer
and top-down demos::

    python examples/generate_assets.py

The output is deterministic, tiny, and committed alongside the examples so they
run out of the box.
"""

from __future__ import annotations

import json
import os

import pygame

TILE = 16
HERE = os.path.dirname(os.path.abspath(__file__))


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def make_tileset(path: str) -> None:
    """A 7-tile sheet: empty, ground, grass-top, brick, two ramps, ladder."""
    pygame.init()
    sheet = pygame.Surface((TILE * 7, TILE), pygame.SRCALPHA)

    # tile 0: transparent (empty / sky)
    # tile 1: solid ground (brown with darker speckle)
    ground = pygame.Surface((TILE, TILE))
    ground.fill((120, 78, 40))
    for x in range(0, TILE, 4):
        for y in range(0, TILE, 4):
            pygame.draw.rect(ground, (96, 60, 30), (x, y, 2, 2))
    sheet.blit(ground, (TILE * 1, 0))

    # tile 2: grass-topped ground
    grass = ground.copy()
    pygame.draw.rect(grass, (74, 168, 74), (0, 0, TILE, 5))
    pygame.draw.rect(grass, (54, 130, 54), (0, 4, TILE, 2))
    sheet.blit(grass, (TILE * 2, 0))

    # tile 3: brick
    brick = pygame.Surface((TILE, TILE))
    brick.fill((176, 96, 72))
    pygame.draw.line(brick, (60, 30, 20), (0, TILE // 2), (TILE, TILE // 2))
    pygame.draw.line(brick, (60, 30, 20), (TILE // 2, 0), (TILE // 2, TILE // 2))
    pygame.draw.line(brick, (60, 30, 20), (0, 0), (TILE, 0))
    sheet.blit(brick, (TILE * 3, 0))

    # tiles 4 and 5: 45-degree ramps, drawn as the filled triangle below the
    # surface so the art matches what the slope plane says is solid.
    for index, climbs_right in ((4, True), (5, False)):
        ramp = pygame.Surface((TILE, TILE), pygame.SRCALPHA)
        if climbs_right:
            points = [(0, TILE), (TILE, 0), (TILE, TILE)]
            grass_edge = [(0, TILE), (TILE, 0), (TILE, 5), (0, TILE)]
        else:
            points = [(0, 0), (TILE, TILE), (0, TILE)]
            grass_edge = [(0, 0), (TILE, TILE), (TILE, TILE), (0, 5)]
        pygame.draw.polygon(ramp, (120, 78, 40), points)
        pygame.draw.polygon(ramp, (74, 168, 74), grass_edge)
        sheet.blit(ramp, (TILE * index, 0))

    # tile 6: ladder
    ladder = pygame.Surface((TILE, TILE), pygame.SRCALPHA)
    rail = (150, 110, 60)
    pygame.draw.rect(ladder, rail, (3, 0, 3, TILE))
    pygame.draw.rect(ladder, rail, (TILE - 6, 0, 3, TILE))
    for y in (2, 8, 14):
        pygame.draw.rect(ladder, (186, 146, 88), (3, y, TILE - 6, 2))
    sheet.blit(ladder, (TILE * 6, 0))

    pygame.image.save(sheet, path)


def make_platform(path: str) -> None:
    """A 32x8 floating ledge for the moving platform."""
    pygame.init()
    surf = pygame.Surface((32, 8), pygame.SRCALPHA)
    pygame.draw.rect(surf, (150, 150, 170), (0, 0, 32, 8))
    pygame.draw.rect(surf, (206, 206, 226), (0, 0, 32, 2))   # lit top edge
    pygame.draw.rect(surf, (92, 92, 116), (0, 6, 32, 2))     # shadowed underside
    for x in range(3, 32, 8):                                 # rivets
        pygame.draw.rect(surf, (72, 72, 92), (x, 3, 2, 2))
    pygame.image.save(surf, path)


def make_player(path: str) -> None:
    """A 4-frame 16x24 spritesheet: idle + 3 run frames."""
    pygame.init()
    fw, fh = 16, 24
    sheet = pygame.Surface((fw * 4, fh), pygame.SRCALPHA)

    def draw_guy(surf: pygame.Surface, ox: int, leg_phase: int) -> None:
        body = (224, 64, 64)
        skin = (250, 214, 165)
        # head
        pygame.draw.rect(surf, skin, (ox + 5, 2, 6, 6))
        # torso
        pygame.draw.rect(surf, body, (ox + 4, 8, 8, 9))
        # legs animate via phase
        if leg_phase == 0:
            pygame.draw.rect(surf, (40, 40, 120), (ox + 5, 17, 3, 6))
            pygame.draw.rect(surf, (40, 40, 120), (ox + 9, 17, 3, 6))
        elif leg_phase == 1:
            pygame.draw.rect(surf, (40, 40, 120), (ox + 4, 17, 3, 6))
            pygame.draw.rect(surf, (40, 40, 120), (ox + 10, 17, 3, 5))
        else:
            pygame.draw.rect(surf, (40, 40, 120), (ox + 6, 17, 3, 5))
            pygame.draw.rect(surf, (40, 40, 120), (ox + 8, 17, 3, 6))

    draw_guy(sheet, fw * 0, 0)  # idle
    draw_guy(sheet, fw * 1, 1)  # run 1
    draw_guy(sheet, fw * 2, 0)  # run 2
    draw_guy(sheet, fw * 3, 2)  # run 3

    pygame.image.save(sheet, path)


def make_hero_topdown(path: str) -> None:
    """A 4-frame 16x16 top-down character (facing down, simple walk)."""
    pygame.init()
    fw = fh = 16
    sheet = pygame.Surface((fw * 4, fh), pygame.SRCALPHA)
    for i in range(4):
        ox = fw * i
        pygame.draw.rect(sheet, (250, 214, 165), (ox + 5, 2, 6, 5))  # head
        pygame.draw.rect(sheet, (64, 128, 224), (ox + 4, 7, 8, 7))   # body
        foot = 13 + (i % 2)
        pygame.draw.rect(sheet, (40, 40, 40), (ox + 5, foot, 2, 3))
        pygame.draw.rect(sheet, (40, 40, 40), (ox + 9, 13 + ((i + 1) % 2), 2, 3))
    pygame.image.save(sheet, path)


def _tiled_layer(name: str, data: list[int], w: int, h: int) -> dict:
    return {
        "name": name,
        "type": "tilelayer",
        "width": w,
        "height": h,
        "x": 0,
        "y": 0,
        "visible": True,
        "opacity": 1,
        "data": data,
    }


def make_platformer_level(path: str) -> None:
    """Write a small Tiled JSON level with a main layer + collision layer."""
    w, h = 40, 14
    main = [0] * (w * h)
    coll = [0] * (w * h)

    def put(tx: int, ty: int, gid: int, solid: bool = True) -> None:
        idx = ty * w + tx
        main[idx] = gid          # Tiled GID (1-based)
        if solid:
            coll[idx] = 1

    GROUND, RAMP_UP, RAMP_DOWN, LADDER = 3, 5, 6, 7   # Tiled GIDs

    # Ground across the bottom two rows, with a pit for the moving platform.
    PIT = range(26, 31)
    for tx in range(w):
        if tx in PIT:
            continue
        put(tx, h - 2, GROUND)   # grass-top (gid 3 == tile id 2)
        put(tx, h - 1, 2)        # ground   (gid 2 == tile id 1)

    # A few floating brick platforms (gid 4 == tile id 3).
    for tx in range(6, 10):
        put(tx, h - 5, 4)

    # A ramp up to a ledge and back down again. The ramp tile sits in row 11, so
    # it climbs from its own bottom edge — the surface of the ground in row 12 —
    # to its top edge, which is the surface of the ledge beside it.
    put(10, h - 3, RAMP_UP, solid=False)
    for tx in range(11, 15):
        put(tx, h - 3, GROUND)   # grass-top, so the ramp and ledge read as one hill
    put(15, h - 3, RAMP_DOWN, solid=False)

    # A ladder climbing to a ledge, passing through a gap in it.
    for tx in (18, 19, 21, 22):
        put(tx, h - 6, 4)
    for ty in range(h - 6, h - 2):
        put(20, ty, LADDER, solid=False)

    # A small step / wall.
    for ty in range(h - 4, h - 2):
        put(34, ty, 2)
        put(35, ty, 2)

    tiled = {
        "width": w,
        "height": h,
        "tilewidth": TILE,
        "tileheight": TILE,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "layers": [
            _tiled_layer("main", main, w, h),
            _tiled_layer("collision", coll, w, h),
        ],
        # Embedded so the slope and ladder tile properties travel with the map,
        # exercising the same import path a real Tiled export uses.
        "tilesets": [{
            "firstgid": 1,
            "name": "tiles",
            "image": "tiles.png",
            "tilewidth": TILE,
            "tileheight": TILE,
            "tilecount": 7,
            "columns": 7,
            "tiles": [
                {"id": 4, "properties": [
                    {"name": "slope", "type": "string", "value": "up_right"}]},
                {"id": 5, "properties": [
                    {"name": "slope", "type": "string", "value": "up_left"}]},
                {"id": 6, "properties": [
                    {"name": "ladder", "type": "bool", "value": True}]},
            ],
        }],
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(tiled, fh)


def make_topdown_level(path: str) -> None:
    """A walled room with a solid block obstacle in the middle."""
    w, h = 20, 14
    main = [0] * (w * h)
    coll = [0] * (w * h)

    def put(tx: int, ty: int, gid: int, solid: bool = True) -> None:
        idx = ty * w + tx
        main[idx] = gid
        if solid:
            coll[idx] = 1

    # Floor everywhere (grass, non-solid).
    for ty in range(h):
        for tx in range(w):
            main[ty * w + tx] = 3  # grass

    # Border walls (brick, solid).
    for tx in range(w):
        put(tx, 0, 4)
        put(tx, h - 1, 4)
    for ty in range(h):
        put(0, ty, 4)
        put(w - 1, ty, 4)

    # Central obstacle.
    for tx in range(8, 12):
        for ty in range(5, 8):
            put(tx, ty, 2)

    tiled = {
        "width": w,
        "height": h,
        "tilewidth": TILE,
        "tileheight": TILE,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "layers": [
            _tiled_layer("main", main, w, h),
            _tiled_layer("collision", coll, w, h),
        ],
        "tilesets": [{"firstgid": 1, "source": "tiles.png"}],
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(tiled, fh)


def main() -> None:
    plat = os.path.join(HERE, "platformer", "assets")
    topd = os.path.join(HERE, "topdown", "assets")
    _ensure_dir(plat)
    _ensure_dir(topd)

    make_tileset(os.path.join(plat, "tiles.png"))
    make_player(os.path.join(plat, "player.png"))
    make_platform(os.path.join(plat, "platform.png"))
    make_platformer_level(os.path.join(plat, "level1.json"))

    make_tileset(os.path.join(topd, "tiles.png"))
    make_hero_topdown(os.path.join(topd, "hero.png"))
    make_topdown_level(os.path.join(topd, "room.json"))

    print("Assets generated.")


if __name__ == "__main__":
    main()
