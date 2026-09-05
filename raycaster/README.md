# Raycaster Engine

A modular 3.5D raycasting game engine written in TypeScript on the HTML5 Canvas
2D API, bundled with Vite. It renders textured walls with DDA raycasting,
floor and ceiling casting, multi-angle billboard sprites, and ships with a
playable grid-based dungeon-crawler demo (King's Field style), a Blender
sprite-baking pipeline and an ElevenLabs audio pipeline.

```bash
cd raycaster
npm install
npm run dev        # http://localhost:5173
npm test           # vitest unit tests
npm run build      # typecheck + production bundle in dist/
```

Controls: `W`/`S` step one tile forward/back, `A`/`D` snap-turn 90°, `Q`/`E`
sidestep, `Space` or left click swings the sword, `C` or right click casts
Fire Bolt, `F` interacts with what is ahead (chests, levers, doors), `H`
drinks a potion or ether, `M` toggles the map, `N` mutes audio, `R` restarts
after the end screen, `F3` toggles the performance readout, `Esc` pauses.
Mouse Y tilts the view; turning is keyboard only, by design.

## Layout

| Module | Contents |
| --- | --- |
| `src/core/` | `Engine` fixed-timestep loop with render interpolation, `Input` (keyboard, mouse, pointer lock, action bindings), `Clock`. |
| `src/math/` | `Vec2`, `Mat2`, angle utilities (wrapping, shortest-arc lerp, direction quantisation). |
| `src/renderer/` | `Raycaster` (DDA, typed-array results), `WallRenderer`, `FloorCeilingRenderer` (per-cell floor/ceiling textures, sky), `SpriteRenderer` (multi-angle billboards with depth test), `SpriteSheet` (Blender metadata loader), `Texture`/`TextureRegistry`, procedural textures and sprites, packed-colour helpers. |
| `src/world/` | `GameMap` (flat typed-array layers), ASCII/JSON map parsers, circle-vs-grid sliding collision, line of sight, wall ray distance. |
| `src/entities/` | Grid-locked `Player` (one-tile steps, 90° snap turns, stamina/mana meters, inventory), `FreeRoamPlayer` (continuous shooter controller kept for reuse), `Enemy` finite-state AI, `Chest`/`Door`/`Lever` interactables, spell `Projectile`, pickups, `EntityManager`, hitscan. |
| `src/audio/` | `ElevenLabsClient` (TTS + sound-effect endpoints), `AudioManager` (Web Audio, stereo positional mixing, looped ambience via `playLoop`, voice queue), persistent `AudioCache`, `RetroSynth` procedural fallbacks, sound bank formats. |
| `src/game/` | Catacombs demo level, RPG HUD (health/mana/stamina gauges, compass strip, equipment and inventory window, interaction prompt, sword swing), minimap, asset loader, `Game` host with the interactive raycast check. |
| `tools/blender/` | `sprite_baker.py`: Blender CLI script that orbits a camera around a model in N directions, renders each animation frame with a transparent background and packs a sheet plus JSON metadata. |
| `tools/audio/` | `sound_bank.spec.json` prompts and voice scripts; `bake_sound_bank.mjs` pre-renders them with ElevenLabs into `public/audio/bank/`. |
| `tests/` | Vitest suites for math, world/collision, renderer (DDA, walls, sprites), entities, audio, engine loop. |

## Rendering pipeline

Each frame the `Game` host interpolates the camera between fixed steps, then:

1. `Raycaster.cast` runs one DDA walk per screen column and writes
   perpendicular distance, side, wall id, wall-x and ray direction into
   preallocated typed arrays.
2. `FloorCeilingRenderer` fills every row with horizontally cast floor and
   ceiling texels; ceiling id 0 paints a sky gradient.
3. `WallRenderer` draws textured columns with side shading and distance fog
   and fills the per-column z-buffer.
4. `SpriteRenderer` transforms billboards into camera space, sorts far to
   near, picks the animation frame and view direction from the sprite sheet,
   and draws columns that pass the z-buffer test.
5. The packed `Uint32Array` framebuffer is uploaded once and scaled to the
   display canvas with nearest-neighbour filtering; the HUD is drawn on a
   second canvas.

The internal resolution is 240 rows by default with the width following the
display aspect ratio, so the horizontal field of view widens on wider screens
while wall proportions stay constant. Inner loops use fixed-point shading and
no per-frame allocations; the headless smoke test measures a few
milliseconds per update+render frame at 384x240 in Chromium's software
renderer.

## Dungeon-crawler rules

- **Movement**: the player always occupies a grid cell facing one of four
  directions. Steps are one-tile tweens, turns are 90° tweens, and both are
  refused while a tween or the post-action delay runs. Each step spends
  stamina; hitting zero marks the player exhausted until the meter recovers.
- **Lighting**: `Shading` in `dungeon` mode applies `exp(-density * d)` beyond
  a small torch radius, clamped to black at the fog distance, through a
  lookup table shared by the wall, floor and sprite passes. The game shell
  adds a subtle torch flicker on the ambient multiplier.
- **Interaction**: every tick the centre raycast column reports the wall cell
  ahead (for doors) and the front grid cell is scanned for props (chests,
  levers). The HUD shows an `[F]` prompt; doors clear their wall tile when
  opened, locked doors need a key, levers toggle doors sharing their tag.
- **Combat**: the sword hits the nearest enemy within reach in front of the
  player (stamina cost); Fire Bolt spawns a projectile (mana cost).
- **Audio**: `AudioManager.playLoop` runs the ambient drone; footsteps,
  door mechanisms, chests and levers are positional one-shots at their cell.

## Sprite sheets

`SpriteSheetMeta` (see `src/renderer/SpriteSheet.ts`) describes a sheet:
frame size, number of directions, per-animation frame counts and a frame
table. Direction `d` is the view from azimuth `d * 360 / directions` degrees
clockwise from the sprite's forward axis, which is exactly what
`tools/blender/sprite_baker.py` emits. The demo loads
`public/assets/sprites/grunt.json` and `brute.json` when present and falls
back to procedural sheets built through the same metadata schema.

## Audio

Sounds resolve through baked bank → browser cache → live ElevenLabs
generation (only with `VITE_ELEVENLABS_API_KEY`) → procedural synth. See
`tools/audio/README.md` for baking. Positional effects are mixed with stereo
panning and distance attenuation relative to the player; voice lines play
one at a time through a rate-limited queue.
