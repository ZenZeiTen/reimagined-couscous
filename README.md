# RetroForge

A 2D game engine for building games in the spirit of the 16-bit console era —
a fusion of SNES and Sega Genesis capabilities, built in Python on
[pygame-ce](https://pyga.me/) and NumPy.

RetroForge is designed for three things at once:

- **Easy to deploy** — pure-Python, `pip install` and go.
- **Great for prototyping** — concise, readable API; write a playable scene in a
  few dozen lines.
- **Authentic and fast** — a low-resolution virtual screen scaled with crisp
  nearest-neighbour pixels, sub-palette colour, and NumPy-accelerated hot paths
  (Mode 7, palette effects, tile rendering).

## Features

| System | What it gives you |
| --- | --- |
| **Virtual screen** | 256×224 (SNES), 320×224 (Genesis) or 320×240, upscaled by a whole number with letterbox bars and no blur; optional CRT scanlines, mosaic and fade effects |
| **Palette** | 16 sub-palettes × 16 colours, NumPy-backed; fades, cross-fades, and colour cycling that reach sprites *and* tiles |
| **Backgrounds** | Scrollable tile layers with independent parallax, animated tiles, and per-tile priority so foreground tiles can draw in front of sprites — all through one batched `blits()` call |
| **Mode 7** | NumPy affine ground-plane with a documented camera heading, infinite wrap, and a transparent void so the sky shows past a finite course |
| **Sprites** | Sheets with margin/spacing, animation with completion callbacks, H/V flip, and palette-swap recolouring that works when sprites share a sheet |
| **Text** | Built-in 5×7 ASCII bitmap font (no binary asset), plus alignment, shadowing, word wrap, and your own glyph sheets |
| **Entities** | `World` owns your game objects: deferred spawn/despawn, stable update order, priority draw order, tag and type lookup |
| **Physics** | AABB bodies with sub-pixel accumulation, X-then-Y tile collision, depenetration, one-way platforms, swept AABB for fast projectiles, layer/mask filtering, and a grid broadphase |
| **Platforming** | Slopes you walk up and down, moving platforms that carry riders, and ladders — the 16-bit vocabulary, not just flat boxes |
| **Particles** | Fixed-capacity NumPy-backed pool with bursts and directional sprays, drawn in one batched call and allocating nothing per frame |
| **Behaviour** | Named state machines with enter/update/exit hooks, guarded transitions, and `time_in_state` |
| **Levels** | Tiled JSON import: CSV *and* base64/zlib/gzip, correct `firstgid`, object layers for spawn points, infinite maps, group layers |
| **Camera** | Smooth follow, level-bound clamping, trauma-based shake |
| **Input** | SNES-style 12-button model, keyboard + gamepad, remappable, with edges latched so a press is never dropped or doubled regardless of refresh rate |
| **Audio** | 8-channel mixer with panning, pause/resume, intro-then-loop BGM, degrading safely with no audio device |
| **Scenes** | Stack-based manager with pause/resume hooks, overlays that can keep the world running, and fade/wipe/iris/mosaic transitions |
| **Game feel** | Timers, repeating schedules, tweens, and ten easing curves |
| **Tools** | Save slots with atomic writes and schema versions, settings and key-remap persistence, and a debug overlay for FPS, hitboxes and tile solidity |
| **Level-driven** | `EntityRegistry` maps Tiled object types to entity factories, so adding content is a change to the map rather than to your code |
| **Testable** | A headless `Harness` with scripted input, `run_until` predicates, pixel assertions and PNG capture — no monkeypatching required |
| **CLI** | `retroforge run / new / check / info` — scaffold a game, validate a level, or read the engine's capabilities as JSON |
| **Loop** | Fixed 60 Hz timestep decoupled from render rate, with spiral-of-death protection |

## Install

```bash
pip install pygame-ce numpy        # runtime deps
pip install -e .                   # install RetroForge in editable mode
```

Requires Python 3.10+.

## Quick start

```python
import pygame
import retroforge as rf


class Level(rf.Scene):
    def on_enter(self, engine):
        self.engine = engine
        self.font = rf.BitmapFont.default()
        self.world = rf.World(gravity=900.0)
        self.timers = rf.Scheduler()
        self.score = 0
        self.timers.every(1.0, self.tick_score)

    def tick_score(self):
        self.score += 10

    def update(self, dt, inp):
        self.timers.update(dt)
        self.world.update(dt)
        if inp.is_just_pressed(rf.Button.START):
            self.engine.scenes.push(rf.Transition(Level(), style="iris"))

    def draw(self, renderer):
        self.world.draw(renderer.target)
        self.font.draw(renderer.target, f"SCORE {self.score:06d}", 8, 8,
                       shadow=(0, 0, 0))


pygame.init()
renderer = rf.Renderer(*rf.RES_SNES, scale=3, title="My Game")
rf.GameEngine(renderer).run(Level())
pygame.quit()
```

## Building a game

**Entities.** Subclass `Entity`, put it in a `World`, and the world handles
update order, deferred spawn/despawn, the broadphase, and priority draw order:

```python
class Goblin(rf.Entity):
    def __init__(self, pos):
        super().__init__(pos, rf.Vec2(12, 16), layer=rf.Layer.ENEMY, tags=["enemy"])
        self.hp = 3

    def update(self, dt, world):
        self.vel = rf.Vec2(-30.0, self.vel.y)
        world.move(self, dt)
        for hit in world.overlapping(self):
            self.hp -= 1
            if self.hp <= 0:
                self.kill()
```

**Levels from Tiled.** Author in [Tiled](https://www.mapeditor.org/), export
JSON in any encoding, and read spawn points straight out of the object layer:

```python
tmap = rf.TileMap.load_tiled("level1.json")
for spawn in tmap.find_objects(type="enemy"):
    world.spawn(Goblin(rf.Vec2(spawn.x, spawn.y)))
```

**Content from the level, not from code.** A loop per object type means every
new kind of thing needs new Python. Register a factory per Tiled type once and
the map decides what exists — which is what lets a level editor, or a tool,
extend the game without touching your source:

```python
registry = rf.EntityRegistry(on_unknown="raise")
registry.register_class("enemy", Goblin)        # map properties become kwargs

@registry.spawns("coin")
def make_coin(obj, ctx):
    return Coin(rf.Vec2(obj.x, obj.y), ctx["coin_sheet"])

spawned = registry.populate(world, tmap, context={"coin_sheet": sheet})
player = spawned.first("spawn")

registry.validate(tmap)     # -> ['boss'] — object types nothing can spawn
```

**Fast projectiles.** A bullet moving 27 px per step will step straight over an
8 px target, so sweep instead of testing overlap:

```python
hit, t = rf.sweep_first(bullet.rect, travel, world, mask=rf.Layer.ENEMY)
if hit is not None:
    hit.take_damage(1)
```

**Saving.** Slots are written atomically to the OS's per-user data directory and
carry a schema version:

```python
saves = rf.SaveManager("MyGame")
saves.write(1, {"level": 3, "hp": 12})
state = saves.read(1, default={"level": 1, "hp": 16})
```

**Debugging game feel.** You cannot tune what you cannot see:

```python
self.debug = rf.DebugOverlay()
self.debug.show_tiles = True
self.debug.watch("vel.y", lambda: round(self.player.vel.y, 1))
...
self.debug.draw(renderer, world=self.world, tilemap=self.tmap, camera=self.camera)
```

**Checking it still works.** A game is a loop over real input and real pixels,
which makes it awkward to test. `Harness` runs one headlessly, feeds synthetic
input through the real `InputManager`, and hands back the frame. It is
deterministic — one fixed step per `step()`, no wall clock — so a run replays
identically in CI:

```python
from retroforge.testing import Harness

with Harness(Level()) as h:
    h.run_until(lambda: h.scene.player.body.grounded, limit=120)
    h.hold(rf.Button.RIGHT, steps=40)       # walk right
    h.tap(rf.Button.A)                      # jump — exactly one press
    assert h.scene.player.pos.y < resting_y
    assert h.count_color((240, 90, 90)) > 0 # the player is on screen
    h.capture("jump.png")                   # and you can go look at it
```

## Command line

`pip install` gives you a `retroforge` command:

```bash
retroforge examples                  # what can I look at?
retroforge run platformer            # run one (generates its assets if needed)
retroforge new mygame                # scaffold a game — and tests for it
retroforge check assets/level.json   # is this level sound?
retroforge info                      # buttons, resolutions, easings, exports
```

`check` and `info` take `--json`, so a script or an agent can consume them:

```bash
$ retroforge check assets/level.json --json | jq '.object_types'
{ "coin": 25, "enemy": 6, "spawn": 1 }
```

`retroforge new` writes a playable scene, a README, and a `test_game.py` that
uses the harness above — so a new project starts out already checkable.

## Working with Claude

The repo ships a skill at `.claude/skills/retroforge/`, so `/retroforge` in
Claude Code loads the whole build workflow — scaffolding, the Entity/World model,
authoring Tiled levels that spawn content through `EntityRegistry`, verifying with
the headless `Harness`, and the engine's non-obvious constraints.

```
/retroforge a top-down dungeon crawler with torch-lit rooms
```

It fires on `/retroforge` or a clear mention of RetroForge or pygame. Browser
games belong to other tools; this one builds desktop Python.

## Examples

Four runnable demos live under `examples/`. All assets — sprites, tilesets and
the levels themselves — are drawn or emitted programmatically, so nothing binary
is committed. Generate them, then run one:

```bash
python examples/generate_assets.py             # tilesets, sprites, Tiled levels
python examples/mode7_racer/generate_assets.py
python examples/coin_rush/generate_assets.py

python examples/coin_rush/main.py      # ← a complete little game
python examples/platformer/main.py     # slopes, ladders, moving platforms, dust
python examples/topdown/main.py        # top-down RPG-style room
python examples/mode7_racer/main.py    # F-Zero-style Mode 7 racer
```

**Coin Rush** is the one to read first. It is a whole game rather than a feature
demo — title screen, a timed run, a pause menu, deaths, a game over, and a high
score that survives quitting — and it is the file to copy when starting your
own. It exercises the engine end to end: a Tiled level with base64+zlib data and
a non-trivial `firstgid`, entities placed from the map's object layer, coyote
time and a jump buffer, one-way platforms you jump up through and drop down
from, stomping, invulnerability flicker, parallax clouds, a bitmap-font HUD,
iris and fade transitions, atomic saves, and an F1 debug overlay.

**Platformer** is the one to read for the platforming vocabulary: a ramp you
walk up and down without catching on its lip, a ladder you climb through a gap
in a ledge, a metal platform that ferries you over a pit, and dust kicked up by
running and landing. Its slopes and ladders come in through Tiled tile
properties, so the same level would load out of the real editor.

Controls: arrow keys / WASD to move (up/down to climb), **Z** to jump or boost,
**Down+Z** to drop through a platform, **Enter** to pause, **F1** for the debug
overlay, **Esc** to quit.

## Project layout

```
retroforge/
├── cli.py               # the `retroforge` command
├── testing.py           # headless Harness for verifying a game
├── registry.py          # Tiled object types -> entity factories
├── engine.py            # fixed-timestep main loop
├── scene.py             # Scene + stack-based SceneManager
├── transition.py        # fade / wipe / iris / mosaic scene transitions
├── entity.py            # Entity + World game-object model
├── debug.py             # FPS, hitbox and tile-solidity overlay
├── save.py              # save slots, settings, key remapping
├── renderer/            # renderer, palette, tile layers, Mode 7
├── graphics/            # sprites, bitmap font, tilemaps, camera
├── physics/             # rigid bodies, tile + entity collision
├── input/               # SNES-style input manager
├── audio/               # 8-channel audio engine
└── utils/               # Vec2, fixed-point, timers/tweens, asset loader
examples/
├── coin_rush/           # a complete game: title, run, pause, game over, saves
├── platformer/          # minimal side-scroller
├── topdown/             # top-down room
└── mode7_racer/         # Mode 7 showcase
tools/                   # headless example smoke runner
tests/                   # pytest suite (runs headless)
```

## Tests

The suite runs fully headless — no display or audio device needed:

```bash
pytest                          # 314 tests
python -m tools.smoke_examples  # run every example for 120 frames
```

## License

MIT — see [LICENSE](LICENSE).
