---
name: raycaster-engine
description: >-
  Build, extend, or debug a 3.5D raycasting game engine,
  Wolfenstein/Doom/King's Field style pseudo-3D that renders a first-person
  view from a 2D tile grid to an HTML canvas via per-column DDA raycasting.
  Ships a TypeScript kernel (DDA raycaster, textured walls with z-buffer,
  floor/ceiling casting, billboard sprites, fixed-timestep loop, grid
  collision) plus positional Web Audio and procedural sound. Use it whenever
  the user wants a retro first-person shooter, dungeon crawler, maze or
  corridor game drawn from a tile map, or grid-locked first-person movement,
  and whenever they say raycaster, raycasting, Wolfenstein, Doom-style, King's
  Field, Eye of the Beholder, pseudo-3D, 2.5D, or first-person tile grid,
  including when they only describe a retro first-person game without naming
  it. Also use it for broken-raycaster symptoms such as fisheye or curved
  walls, warped or seamed wall textures, sprites drawing through walls, floors
  that swim, and render-loop GC stutter. Not for true 3D via Three.js or
  WebGL.
---

# Raycasting game engines

## What a raycaster actually is

A raycaster computes **one number per screen column**: the perpendicular distance
from the camera plane to the nearest solid tile along that column's ray. Every
other feature is a consequence of that number.

- Wall height for the column is `screenHeight / perpDistance`. That single
  division is the entire projection; there is no matrix pipeline.
- The distance doubles as a depth buffer, so sprites just compare against it.
- Floors and ceilings invert the relation: for a given screen *row* the distance
  is constant, so you walk texels along the row with two adds.

Understanding it as "a depth query per column" is what lets you extend it
confidently. A new feature is almost always "what do I do with the depth I
already have?" rather than new geometry.

The technique is fast because it never touches a triangle: cost scales with
screen pixels, not scene complexity, so a hundred-room dungeon costs the same as
a closet. It is limited in exactly the ways that follow from casting on a plane:
walls are axis-aligned and full-height, and there is no true floor-over-floor
geometry. If the user needs sloped floors, room-over-room, or arbitrary 3D
meshes, say so early and point them at a real 3D renderer (Three.js) instead of
bending a raycaster into one.

## Start from the kernel — don't retype the math

`assets/engine-kernel/` is a working, typechecked engine core. Copy it rather
than writing these files from memory; the subtle parts (fisheye correction,
pixel endianness, texture mirroring, sprite depth tests) are exactly where
from-scratch attempts break, and debugging them later costs far more than the
copy costs now.

```bash
cp -r <skill-dir>/assets/engine-kernel/* src/          # core, math, renderer, world
cp -r <skill-dir>/assets/audio-kernel   src/audio      # optional, see references/audio.md
```

| Path | What it gives you |
| --- | --- |
| `core/Engine.ts` | Fixed-timestep loop with render interpolation, FPS/frame-time stats, pause on tab hide |
| `core/Input.ts` | Keyboard + mouse + pointer lock, action bindings, per-frame edge detection |
| `math/` | `Vec2`, `Mat2`, angle wrapping / shortest-arc lerp / direction quantisation |
| `renderer/Raycaster.ts` | The DDA loop, results in preallocated typed arrays |
| `renderer/WallRenderer.ts` | Textured wall columns + per-column z-buffer |
| `renderer/FloorCeilingRenderer.ts` | Per-row floor and ceiling casting with per-cell textures |
| `renderer/SpriteRenderer.ts` | Multi-angle billboards, depth-tested against the z-buffer |
| `renderer/Framebuffer.ts`, `Color.ts` | Packed `Uint32Array` pixel buffer and endian-safe colour helpers |
| `renderer/Shading.ts` | Distance fog: linear (outdoor) and exponential (dungeon) modes via a lookup table |
| `renderer/Texture.ts`, `ProceduralTextures.ts` | Texture registry plus brick/stone/tech/wood/floor generators, so you ship with zero image files |
| `renderer/SpriteSheet.ts` | Multi-angle sheet metadata, validation, frame/direction lookup |
| `world/` | `GameMap` typed-array layers, ASCII + JSON map parsers, sliding collision, line of sight, ray distance |

It targets ES2022 + DOM, has no npm dependencies, and compiles under `strict`
with `exactOptionalPropertyTypes` and `noUnusedLocals`.
`references/assets-and-tooling.md` has the Vite config, tsconfig and
`index.html` that go around it.

Wiring is short — this is the whole renderer:

```ts
// once
const fb       = new Framebuffer(384, 240);        // internal resolution
const rc       = new Raycaster(fb.width);
const walls    = new WallRenderer(fb.width);
const floors   = new FloorCeilingRenderer(fb.height);
const sprites  = new SpriteRenderer();
const shading  = new Shading(16, 0.06, 0.72);      // or 'dungeon' mode for a crawler
const camera   = new Camera();
const map      = parseAsciiMap({ rows, legend });
const textures = new TextureRegistry();
for (const [id, tex] of createDefaultTextures()) textures.register(id, tex);

// per rendered frame, in this order
camera.setPosition(x, y);        // interpolated between fixed steps
camera.setAngle(angle);
camera.pitch = player.pitch;
camera.bob   = player.bobOffset;
rc.cast(camera, map);
floors.render(fb, camera, map, textures, shading);
walls.render(fb, rc, textures, camera, shading);   // fills walls.zBuffer
sprites.render(fb, camera, billboards, sheets, walls.zBuffer, shading);
fb.present(viewCtx);                               // one upload, scaled to the display
```

If the user already has a raycaster, don't force the kernel on them. Read their
code, find which invariant below it violates, and fix that.

## Build order

Each phase is independently visible on screen, which matters: a raycaster that
is 80% written shows nothing, so build in an order where you can look at the
result and catch mistakes early.

1. **Loop and input.** `Engine` + `Input` + a canvas that clears to a flat
   colour. Confirm the frame counter moves and keys register.
2. **Map and movement.** `GameMap` from an ASCII level, a player position, and
   collision. Draw a top-down debug view first — a 2D map with a dot and a
   direction line proves movement before projection can hide bugs.
3. **Walls.** `Raycaster` + `WallRenderer`. Flat-shaded first, textures second.
   Now it looks like a game.
4. **Floors and ceilings.** `FloorCeilingRenderer`. Expensive per pixel, so add
   it once walls are correct.
5. **Sprites.** `SpriteRenderer` + entities. Requires the wall z-buffer, hence
   the ordering.
6. **Game layer.** HUD, interaction, audio, level content.

Per frame the order is fixed and matters: cast rays → floors/ceilings (they
paint every pixel) → walls (overwrite with correct depth, fill z-buffer) →
sprites (depth-tested) → present the framebuffer once → draw the HUD on a second
canvas at display resolution.

That last split is worth doing from the start: the world renders at a low
internal resolution (240 rows is a good default) and scales up with
nearest-neighbour for crisp retro pixels, while text and gauges stay sharp on
their own full-resolution canvas.

## Invariants that keep it correct

These are the things that, when violated, produce the classic broken-raycaster
symptoms. The kernel already respects all of them; preserve them when you edit.

**Use perpendicular distance, never Euclidean.** Divide the wall height by the
distance to the *camera plane*, not to the camera point. DDA gives you this for
free: `sideDistX - deltaDistX` at the moment of the hit already is the
perpendicular distance. Euclidean distance makes straight walls bow outward at
the screen edges — the "fisheye" everyone hits first.

**Pack pixels through the colour helpers.** `ImageData` bytes are R,G,B,A in
memory; viewed as a `Uint32Array` on a little-endian machine that is
`0xAABBGGRR`, not `0xRRGGBBAA`. Writing the intuitive order gives you a picture
with red and blue swapped. `Color.ts` detects endianness once and hides it.

**Allocate nothing in the per-frame path.** A `new Vec2()` per ray at 384
columns × 60 fps is 23k objects a second and shows up as periodic stutter, not
as a lower average frame rate — which is why it survives naive profiling. Ray
results live in preallocated typed arrays; vector methods mutate in place;
sprite lists are reused arrays. When you add a system, give it its own scratch
buffers in the constructor.

**Round wall columns outward, not toward zero.** Truncating the half-height
leaves a one-pixel line of floor showing past the base of every wall, which
reads as a shimmering seam when you move. `Math.ceil` on the half-height (as the
kernel does) makes wall bases meet the floor exactly.

**Keep a z-buffer per column and test sprites against it.** One `Float32Array`
of length = width, written by the wall pass. A sprite column draws only where
`spriteDistance < zBuffer[x]`. Without it, enemies are visible through walls.

**Separate fixed-step simulation from variable-rate rendering.** Accumulate real
time, run `update(dt)` at a fixed step, then render once with an `alpha` in
[0,1) and interpolate the camera between the previous and current pose. Without
this, movement speed depends on refresh rate and physics explode after a tab
switch. Cap the sub-steps per frame or a slow frame spirals into more slow
frames.

**One tile is one world unit.** Positions are floats, `Math.floor` gives the
cell. Fighting a pixels-per-tile scale factor through the DDA math is a
persistent source of off-by-one bugs; scale only at the display step.

## Choose the movement feel before writing the controller

This decision shapes input handling, collision, animation and audio pacing, so
make it explicitly rather than defaulting to free-roam.

| | Free-roam (Wolfenstein, Doom) | Grid-locked (King's Field, Eye of the Beholder) |
| --- | --- | --- |
| Position | Continuous float, any angle | Snapped to cell centres, 4 cardinal facings |
| Motion | Velocity integrated per tick, slides along walls | One-tile and 90° tweens, eased, non-interruptible |
| Collision | Circle vs cells, resolved per axis | Test the target cell before committing |
| Pacing | Reflex, mouse-look | Deliberate; a stamina/delay meter gates action frequency |
| Feels like | Shooter | Dungeon crawler, dread, deliberation |

Both are documented with working code in `references/movement.md`. A useful
detail for the grid-locked style: the *camera* angle interpolates smoothly
through the turn while the *logical* facing snaps at the end, so the view feels
fluid but the game state stays discrete and testable.

## Debug by symptom

| Symptom | Cause |
| --- | --- |
| Walls bow outward toward the screen edges | Euclidean instead of perpendicular distance |
| Colours wrong (red/blue swapped) | Packed pixels in `0xRRGGBBAA` order; use `packRGBA` |
| Thin flickering line at the base of walls | Wall column half-height truncated instead of rounded up |
| Wall texture reversed on some faces | Missing the `texX` mirror for far-facing sides |
| Sprites visible through walls | No z-buffer test, or sprites drawn before walls |
| Sprites at the wrong height or floating | Sprite vertical anchor ignores the sheet's `origin` or camera pitch |
| Floors shear or swim as you turn | Row distance recomputed per pixel, or the row step derived from the wrong ray pair |
| Periodic stutter at a good average fps | Allocation in the render loop (GC) |
| Movement faster on a 144 Hz screen | Variable dt applied directly instead of a fixed step |
| Player sticks on corners | Collision resolved on both axes at once instead of per axis |
| Everything dark or blown out | Shading factor applied twice, or fixed-point 8.8 factor treated as 0..1 |

## Performance

The whole frame is CPU work, so budget it: on a 384×240 internal buffer expect
roughly 2-4 ms per update+render frame, dominated by floor/ceiling casting
(every pixel) and then walls. That leaves large headroom at 60 fps even on
software rendering.

If you need more: shrink the internal resolution before optimising the inner
loops (cost is linear in pixels), skip floor casting for ceiling-less outdoor
levels, and keep the shading factor a table lookup rather than an `exp()` call
per pixel. Resist the urge to reach for WebGL — a correct software raycaster at
this resolution is not the bottleneck in any game you build with it.

## References

Read the one that matches what you're building; they contain the full derivations
and copy-ready code.

- `references/rendering.md` — DDA derivation, wall texturing, floor/ceiling
  casting, billboard projection and multi-angle sprite direction selection,
  distance fog and light models.
- `references/movement.md` — free-roam sliding collision, grid-locked stepping
  and snap-turning with stamina gating, camera interpolation, head bob.
- `references/entities-and-interaction.md` — entity manager with deferred
  removal, enemy state machines with staggered line-of-sight, hitscan and
  projectiles, doors/chests/levers and the "what am I looking at" check.
- `references/audio.md` — positional Web Audio, ambient loops, procedural retro
  sound with zero assets, and layering a generated/pre-baked asset bank on top.
- `references/assets-and-tooling.md` — project scaffold, sprite-sheet metadata
  schema, Blender multi-angle baking conventions, procedural textures, and what
  to unit-test in an engine like this.
