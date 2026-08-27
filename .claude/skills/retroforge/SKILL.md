---
name: retroforge
description: >
  Build, extend, or debug a game with RetroForge — the Python/pygame-ce 16-bit
  engine in this repository. Covers scaffolding a project, the Entity/World model,
  authoring Tiled levels that spawn content through EntityRegistry, verifying
  behaviour with the headless Harness, and the engine's non-obvious constraints.
  Trigger on /retroforge, or when the user names RetroForge, `retroforge`, this
  repo, or asks for a pygame / Python desktop game in a 16-bit style. Do NOT use
  for browser or Canvas games playable as an Artifact — `game-creator-2d` owns
  those. RetroForge produces a desktop Python program, not HTML.
argument-hint: "[what to build, or a subsystem to work on]"
---

# RetroForge

A 2D game engine for the 16-bit era: SNES Mode 7 and Genesis colour, tile physics
with slopes and ladders, and the unglamorous parts a game actually ships with —
text, saves, timers, transitions, a debug overlay.

**The goal for this turn: $ARGUMENTS**

If that is empty, ask what they want to build before writing anything.

---

## Phase 1 — Orient before writing a line

The engine documents itself, and it moves. **Never recall its API from memory.**

```bash
retroforge info --json        # live: exports, buttons, resolutions, easings, slopes
retroforge examples           # what already exists to crib from
```

Then read the README's **"Building a game"** section. For any subsystem you are
about to touch, read that module's docstring first — they are written to explain
*why*, not just what:

| Subsystem | Read |
|---|---|
| Game objects, the update/draw order | `retroforge/entity.py` |
| Spawning content from a level | `retroforge/registry.py` |
| Verifying a game headlessly | `retroforge/testing.py` |
| Tile collision, slopes, one-way | `retroforge/physics/collision.py` |
| Input edges and the fixed timestep | `retroforge/input/input.py` |

`examples/coin_rush/main.py` is a complete game — title, timed run, pause, deaths,
game over, persistent high score. It is the best thing to copy from.
`examples/platformer/main.py` is the reference for slopes, ladders, moving
platforms and particles.

## Phase 2 — Scaffold

Do not hand-write a project skeleton. This already exists and emits a playable
scene *plus* tests wired to the harness:

```bash
retroforge new "Game Name" -d gamedir
cd gamedir && python main.py
```

You get `main.py` (a floor, a player, a working jump), `test_game.py`, `README.md`,
and `assets/`. Confirm it runs before changing anything — a green baseline makes
the first real failure meaningful.

## Phase 3 — Build

**Entities go in a `World`.** Subclass `Entity`, implement `update(self, dt, world)`,
and let `World` own update order, deferred spawn/despawn, the broadphase, and
priority draw order. Call `world.move(self, dt)` for tile physics rather than
integrating by hand.

**Scenes are the screen.** `Scene` has `on_enter` / `update` / `draw`, plus
`on_pause` / `on_resume` for a stack. Push a pause menu over a level; set
`transparent` to keep drawing the level beneath, `update_below` to keep it running.

**Input is logical, never raw keycodes.** Ask about `Button.A`, not `K_z`. Use
`is_just_pressed` for a jump, `is_pressed` for a hold.

**Text exists.** `BitmapFont.default()` needs no asset and renders identically
everywhere. Use `shadow=` over busy backgrounds.

For fast projectiles use `sweep_first` — a bullet at 1600 px/s moves 27 px per
step and a discrete overlap test misses an 8 px target from most positions.

## Phase 4 — Author the level, not the spawn code

Levels come from [Tiled](https://www.mapeditor.org/); any export encoding works.
Solidity, one-way, slope and ladder all come from **tile properties**, so the map
carries its own physics.

Spawn through `EntityRegistry` rather than a loop per object type — otherwise every
new kind of thing in the level needs new Python, and the map can never grow on its
own:

```python
registry = rf.EntityRegistry(on_unknown="raise")
registry.register_class("enemy", Goblin)          # map properties become kwargs

@registry.spawns("coin")
def make_coin(obj, ctx):
    return Coin(rf.Vec2(obj.x, obj.y), ctx["coin_sheet"])

spawned = registry.populate(world, tilemap, context={"coin_sheet": sheet})
player = spawned.first("spawn")
```

Validate before running. This catches an empty map, nothing solid, and objects with
no type set — all of which otherwise present as a game that silently does nothing:

```bash
retroforge check assets/level.json
retroforge check assets/level.json --json | jq '.object_types'
```

`registry.validate(tilemap)` reports object types in the map that nothing can spawn.

An object's `x`/`y` is its **top-left**, and it becomes the entity's top-left
directly. A pickup placed to look like it is resting *on* a surface ends up flush
against it, and two rects that share an edge do not overlap — so the player walks
straight through and nothing fires, with no error anywhere. When a trigger or
pickup silently never fires, print the two rects before suspecting the collision
code.

## Phase 5 — Verify, and actually look

A game is a loop over real input and real pixels. `Harness` runs one headlessly and
deterministically — one fixed step per `step()`, no wall clock, so runs replay:

```python
from retroforge.testing import Harness

with Harness(MainScene()) as h:
    h.run_until(lambda: h.scene.player.body.grounded, limit=120)
    h.hold(rf.Button.RIGHT, steps=40)
    h.tap(rf.Button.A)                       # exactly one press
    assert h.scene.player.pos.y < resting
    h.capture("/tmp/jump.png", scale=3)
```

`run_until` raises `TimeoutError` at its limit rather than hanging — keep it.

**Then open the PNG and look at it.** A large class of visual bugs — a sprite
drawn at the wrong offset, a ramp that reads as a wall, an invisible entity with
no sprite — passes every assertion you would think to write. `capture()` exists so
the frame can be inspected by eye. Use it whenever you change anything visual.

`retroforge.testing.smoke(SceneFactory)` is the cheap always-worth-it check: it
runs and it draws something.

## Phase 6 — Polish

All of this already exists; reach for it rather than reimplementing:

- **Feel** — `Scheduler` for timers, repeats and tweens with ten easings.
  Coyote time and a jump buffer are in `examples/coin_rush/main.py`.
- **Colour** — the palette is 16×16 and NumPy-backed. `fade`, `lerp_to` and
  `cycle` reach sprites *and* tiles. Colour cycling is how water and lava move.
- **Particles** — `ParticleSystem` with `burst()` and `spray()`; a fixed pool that
  allocates nothing per frame.
- **Between scenes** — `Transition` does fade, wipe, iris and mosaic.
- **Behaviour** — `StateMachine` for anything with modes; branch on
  `time_in_state` rather than counting frames by hand.
- **Persistence** — `SaveManager` writes atomically with a schema version.
- **Debugging feel** — `DebugOverlay` shows the frame budget, hitboxes, tile
  solidity, and custom watches. You cannot tune what you cannot see.

## Phase 7 — Pitfalls

Each of these was a real bug in this engine, found by audit. They are not obvious
from the API and they are expensive to rediscover.

- **Never diff input edges per rendered frame.** Frames and fixed steps do not run
  at the same rate; a 144 Hz display renders 2.4 frames per step and a stuttering
  one renders none. Edge state is latched and consumed by exactly one step via
  `begin_step()`. If you write custom input handling, latch — do not diff.
- **Never `set_palette` a frame you got from a `SpriteSheet`.** Frames are shared
  between every sprite using that sheet. Go through `sheet.prepare(...)`, which
  caches per variant.
- **A box rests on the highest ground beneath its footprint**, not on the ground
  under its centre. Centre-sampling makes a body stop dead where a ramp meets flat
  ground.
- **One-way platforms need the previous position.** Whether to block depends on
  where the body *was*, not only where it is.
- **Scale with `pygame.transform.scale`, never `smoothscale`.** Smoothing destroys
  the pixel grid, which is the entire aesthetic. Scale by whole numbers.
- **Do not `.convert()` an 8-bit indexed surface** — it flattens the index and
  palette swapping stops working.
- **Set `oob_solid_below = False`** on any map with a pit, or bodies land on an
  invisible floor at the map's bottom edge.

## Before you call it done

```bash
pytest -q                      # in the game's directory
ruff check .
```

- The game runs, and you have looked at a captured frame of it.
- Levels pass `retroforge check`.
- Anything you changed in the engine itself keeps `tools/smoke_examples.py` clean.
- If you added a mechanic, there is a harness test that would fail without it.
