"""The ``retroforge`` command line.

``pip install retroforge`` should give you something to run, not just something
to import. Four commands, each answering a question you actually have:

    retroforge examples             what can I look at?
    retroforge run platformer       show me one
    retroforge new mygame           give me a project to start from
    retroforge check level.json     is this level any good?
    retroforge info                 what does the engine offer?

``check`` and ``info`` print JSON with ``--json``, so a script or an agent can
consume them rather than parse prose.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from . import __version__

EXAMPLES = ("coin_rush", "platformer", "topdown", "mode7_racer")


def _examples_root() -> str:
    """Where the bundled examples live, when running from a source checkout."""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "examples")


# ---------------------------------------------------------------------------
# examples / run
# ---------------------------------------------------------------------------

def cmd_examples(args: argparse.Namespace) -> int:
    root = _examples_root()
    if not os.path.isdir(root):
        print("No bundled examples found — they ship with the source checkout, "
              "not the wheel.", file=sys.stderr)
        return 1
    blurbs = {
        "coin_rush": "a complete little game — title, timer, pause, deaths, high score",
        "platformer": "slopes, ladders, a moving platform, and dust",
        "topdown": "a walled RPG-style room",
        "mode7_racer": "an F-Zero-style Mode 7 track",
    }
    for name in EXAMPLES:
        if os.path.isdir(os.path.join(root, name)):
            print(f"  {name:<14} {blurbs.get(name, '')}")
    print("\nRun one with:  retroforge run <name>")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    target = args.target
    root = _examples_root()

    path = target
    if not os.path.exists(path):
        candidate = os.path.join(root, target, "main.py")
        if os.path.exists(candidate):
            path = candidate
        else:
            print(f"No example or file named {target!r}. "
                  f"Try: retroforge examples", file=sys.stderr)
            return 1

    if args.headless:
        os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
        os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

    # Generate the example's assets first if they are missing — otherwise the
    # first thing a new user sees is a missing-file traceback.
    example_dir = os.path.dirname(os.path.abspath(path))
    generator = os.path.join(example_dir, "generate_assets.py")
    assets = os.path.join(example_dir, "assets")
    if os.path.exists(generator) and not os.path.isdir(assets):
        print(f"Generating assets for {os.path.basename(example_dir)}...")
        _run_script(generator)
    shared = os.path.join(root, "generate_assets.py")
    if os.path.exists(shared) and not os.path.isdir(assets):
        _run_script(shared)

    return _run_script(path, argv=args.args)


def _run_script(path: str, argv: list[str] | None = None) -> int:
    """Execute a Python file as __main__, the way running it directly would."""
    import runpy

    directory = os.path.dirname(os.path.abspath(path))
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for entry in (root, directory):
        if entry not in sys.path:
            sys.path.insert(0, entry)

    saved = sys.argv
    sys.argv = [path, *(argv or [])]
    try:
        runpy.run_path(path, run_name="__main__")
        return 0
    except KeyboardInterrupt:
        return 130
    finally:
        sys.argv = saved


# ---------------------------------------------------------------------------
# new
# ---------------------------------------------------------------------------

_TEMPLATE = '''"""{name} — built with RetroForge."""

from __future__ import annotations

import pygame

import retroforge as rf

GRAVITY = 900.0
MOVE_SPEED = 110.0
JUMP_SPEED = 320.0


class Player(rf.Entity):
    def __init__(self, pos: rf.Vec2) -> None:
        super().__init__(pos, rf.Vec2(12, 16), layer=rf.Layer.PLAYER)
        self.inp: rf.InputManager | None = None

    def update(self, dt: float, world: rf.World) -> None:
        if self.inp is None:
            return
        vx = 0.0
        if self.inp.is_pressed(rf.Button.LEFT):
            vx -= MOVE_SPEED
        if self.inp.is_pressed(rf.Button.RIGHT):
            vx += MOVE_SPEED
        vy = self.body.vel.y
        if self.inp.is_just_pressed(rf.Button.A) and self.body.grounded:
            vy = -JUMP_SPEED
        self.vel = rf.Vec2(vx, vy)
        world.move(self, dt)

    def draw(self, surface, camera_x, camera_y, palette=None) -> None:
        pygame.draw.rect(surface, (240, 90, 90), self.rect.move(-camera_x, -camera_y))


class MainScene(rf.Scene):
    def on_enter(self, engine) -> None:
        self.engine = engine
        engine.renderer.palette.set_color(0, 0, 92, 148, 252)
        self.font = rf.BitmapFont.default()

        # A floor to stand on. Swap this for a Tiled level when you have one:
        #   self.tilemap = rf.asset_loader.load_tilemap("assets/level.json")
        self.tilemap = rf.TileMap(40, 14, 16, 16)
        for tx in range(40):
            self.tilemap.set_tile(tx, 12, 1, solid=True)

        self.world = rf.World(self.tilemap, gravity=GRAVITY)
        self.player = self.world.spawn(Player(rf.Vec2(48, 96)))

        self.camera = rf.Camera2D(engine.renderer.width, engine.renderer.height)
        self.camera.bounds = pygame.Rect(
            0, 0, self.tilemap.pixel_width, self.tilemap.pixel_height)

    def update(self, dt: float, inp: rf.InputManager) -> None:
        if inp.is_pressed(rf.Button.SELECT):
            self.engine.quit()
        self.player.inp = inp
        self.world.update(dt)
        self.camera.follow(self.player.center, lerp_speed=8.0, dt=dt)
        self.camera.update(dt)

    def draw(self, renderer: rf.Renderer) -> None:
        tl = self.camera.top_left
        for tx in range(self.tilemap.width):
            for ty in range(self.tilemap.height):
                if self.tilemap.is_solid(tx, ty):
                    pygame.draw.rect(
                        renderer.target, (86, 130, 70),
                        pygame.Rect(tx * 16 - tl.x, ty * 16 - tl.y, 16, 16))
        self.world.draw(renderer.target, self.camera, renderer.palette)
        self.font.draw(renderer.target, "{name}", 6, 6, (255, 255, 255),
                       shadow=(20, 20, 40))


def main() -> None:
    pygame.init()
    renderer = rf.Renderer(*rf.RES_SNES, scale=3, title="{name}")
    rf.GameEngine(renderer).run(MainScene())
    pygame.quit()


if __name__ == "__main__":
    main()
'''

_TEST_TEMPLATE = '''"""Checks that {name} still runs and responds to input."""

from retroforge.testing import Harness
import retroforge as rf

from main import MainScene


def test_it_starts_and_draws():
    with Harness(MainScene()) as h:
        h.step(60)
        assert not h.is_blank(), "nothing was drawn"


def test_the_player_walks_right():
    with Harness(MainScene()) as h:
        h.step(30)                      # let it settle on the floor
        start = h.scene.player.pos.x
        h.hold(rf.Button.RIGHT, steps=40)
        assert h.scene.player.pos.x > start + 20


def test_the_player_jumps():
    with Harness(MainScene()) as h:
        h.run_until(lambda: h.scene.player.body.grounded, limit=120)
        resting = h.scene.player.pos.y
        h.tap(rf.Button.A)
        h.step(8)
        assert h.scene.player.pos.y < resting - 8
'''

_README_TEMPLATE = """# {name}

Built with [RetroForge](https://github.com/ZenZeiTen/reimagined-couscous).

```bash
pip install pygame-ce numpy
python main.py          # play it
pytest                  # check it still works
```

Controls: arrow keys / WASD to move, **Z** to jump, **Esc** to quit.
"""


def cmd_new(args: argparse.Namespace) -> int:
    name = args.name
    target = os.path.abspath(args.directory or name)

    if os.path.exists(target) and os.listdir(target):
        print(f"{target} already exists and is not empty.", file=sys.stderr)
        return 1

    os.makedirs(os.path.join(target, "assets"), exist_ok=True)
    _write(os.path.join(target, "main.py"), _TEMPLATE.format(name=name))
    _write(os.path.join(target, "test_game.py"), _TEST_TEMPLATE.format(name=name))
    _write(os.path.join(target, "README.md"), _README_TEMPLATE.format(name=name))
    _write(os.path.join(target, "assets", ".gitkeep"), "")

    print(f"Created {target}")
    print("  main.py        a playable scene — a floor, a player, a jump")
    print("  test_game.py   headless checks that it runs and responds")
    print("  assets/        put your tilesets, sprites, and Tiled levels here")
    print(f"\nNext:  cd {os.path.relpath(target)} && python main.py")
    return 0


def _write(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

def cmd_check(args: argparse.Namespace) -> int:
    from .graphics.tilemap import TileMap
    from .registry import describe_map

    path = args.level
    if not os.path.exists(path):
        print(f"No such file: {path}", file=sys.stderr)
        return 1

    try:
        tilemap = TileMap.load_tiled(path)
    except Exception as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        else:
            print(f"Failed to load: {exc}", file=sys.stderr)
        return 1

    summary = describe_map(tilemap)
    problems = _level_problems(tilemap, summary)
    summary["ok"] = not problems
    summary["problems"] = problems

    if args.json:
        print(json.dumps(summary, indent=2))
        return 0 if not problems else 1

    size = summary["size"]
    print(f"{os.path.basename(path)}: {size['tiles'][0]}x{size['tiles'][1]} tiles "
          f"({size['pixels'][0]}x{size['pixels'][1]} px), "
          f"{summary['tile_size'][0]}x{summary['tile_size'][1]} tiles")
    print(f"  {summary['tiles_used']} tiles placed, {summary['solid_tiles']} solid")
    for label, key in (("one-way", "one_way_tiles"), ("slope", "slope_tiles"),
                       ("ladder", "ladder_tiles")):
        if summary[key]:
            print(f"  {summary[key]} {label} tiles")
    if summary["object_types"]:
        print("  objects: " + ", ".join(
            f"{n}x {t}" for t, n in summary["object_types"].items()))
    elif summary["objects"]:
        print(f"  {summary['objects']} objects, none with a type set")

    if problems:
        print("\nProblems:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("\nLooks fine.")
    return 0


def _level_problems(tilemap, summary: dict[str, Any]) -> list[str]:
    """The mistakes that actually break a level, not style opinions."""
    problems: list[str] = []
    if summary["tiles_used"] == 0:
        problems.append("no tiles placed — the map is empty")
    if summary["solid_tiles"] == 0:
        problems.append("nothing is solid — a body would fall straight through")
    untyped = sum(1 for obj in tilemap.objects if not obj.type)
    if untyped:
        problems.append(
            f"{untyped} object(s) have no type set, so nothing can spawn them")
    if summary["slope_tiles"] and not tilemap._has_slopes:
        problems.append("slope tiles present but the slope flag is unset")
    return problems


# ---------------------------------------------------------------------------
# info
# ---------------------------------------------------------------------------

def cmd_info(args: argparse.Namespace) -> int:
    import retroforge as rf

    from .graphics.tilemap import SLOPE_NAMES
    from .input.input import Button
    from .renderer.renderer import RES_GENESIS, RES_SNES, RES_TALL
    from .utils.timing import EASINGS

    data = {
        "version": __version__,
        "resolutions": {"RES_SNES": list(RES_SNES),
                        "RES_GENESIS": list(RES_GENESIS),
                        "RES_TALL": list(RES_TALL)},
        "buttons": [b.name for b in Button],
        "easings": sorted(EASINGS),
        "slopes": sorted(SLOPE_NAMES),
        "physics_hz": rf.PHYSICS_HZ,
        "exports": sorted(rf.__all__),
    }

    if args.json:
        print(json.dumps(data, indent=2))
        return 0

    print(f"RetroForge {data['version']}  (physics {data['physics_hz']} Hz)")
    print("\nResolutions:")
    for name, size in data["resolutions"].items():
        print(f"  {name:<12} {size[0]}x{size[1]}")
    print(f"\nButtons:  {', '.join(data['buttons'])}")
    print(f"Easings:  {', '.join(data['easings'])}")
    print(f"Slopes:   {', '.join(data['slopes'])}")
    print(f"\n{len(data['exports'])} public exports. "
          f"Use --json for the full list.")
    return 0


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="retroforge",
        description="A 2D game engine for the 16-bit era.",
    )
    parser.add_argument("--version", action="version",
                        version=f"retroforge {__version__}")
    sub = parser.add_subparsers(dest="command")

    p_examples = sub.add_parser("examples", help="list the bundled examples")
    p_examples.set_defaults(func=cmd_examples)

    p_run = sub.add_parser("run", help="run an example or a game file")
    p_run.add_argument("target", help="an example name, or a path to a .py file")
    p_run.add_argument("--headless", action="store_true",
                       help="run without a window (for CI)")
    p_run.add_argument("args", nargs="*", help="arguments passed to the game")
    p_run.set_defaults(func=cmd_run)

    p_new = sub.add_parser("new", help="scaffold a new game")
    p_new.add_argument("name")
    p_new.add_argument("-d", "--directory", help="where to create it")
    p_new.set_defaults(func=cmd_new)

    p_check = sub.add_parser("check", help="validate a Tiled level")
    p_check.add_argument("level", help="path to a Tiled JSON map")
    p_check.add_argument("--json", action="store_true", help="machine-readable")
    p_check.set_defaults(func=cmd_check)

    p_info = sub.add_parser("info", help="what the engine offers")
    p_info.add_argument("--json", action="store_true", help="machine-readable")
    p_info.set_defaults(func=cmd_info)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return 0
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
