# Raycaster Engine

A modular 3.5D raycasting game engine written in TypeScript on the HTML5 Canvas
2D API, bundled with Vite. It renders textured walls with DDA raycasting,
floor and ceiling casting, multi-angle billboard sprites, and ships with a
playable demo level, a Blender sprite-baking pipeline and an ElevenLabs audio
pipeline.

```bash
cd raycaster
npm install
npm run dev        # http://localhost:5173
npm test           # vitest unit tests
npm run build      # typecheck + production bundle in dist/
```

Controls: `WASD`/arrows move, mouse looks (click to lock the pointer), left
click or `Space` fires, `R` reloads (or restarts after the end screen),
`Shift` runs, `M` toggles the minimap, `N` mutes audio, `F3` toggles the
performance readout, `Esc` releases the mouse and pauses.

## Layout

| Module | Contents |
| --- | --- |
| `src/core/` | `Engine` fixed-timestep loop with render interpolation, `Input` (keyboard, mouse, pointer lock, action bindings), `Clock`. |
| `src/math/` | `Vec2`, `Mat2`, angle utilities (wrapping, shortest-arc lerp, direction quantisation). |
| `src/renderer/` | `Raycaster` (DDA, typed-array results), `WallRenderer`, `FloorCeilingRenderer` (per-cell floor/ceiling textures, sky), `SpriteRenderer` (multi-angle billboards with depth test), `SpriteSheet` (Blender metadata loader), `Texture`/`TextureRegistry`, procedural textures and sprites, packed-colour helpers. |
| `src/world/` | `GameMap` (flat typed-array layers), ASCII/JSON map parsers, circle-vs-grid sliding collision, line of sight, wall ray distance. |
| `src/entities/` | `Player` controller with head bob and weapon, `Enemy` finite-state AI, pickups and decorations, `EntityManager` with deferred removal, hitscan. |
| `src/audio/` | `ElevenLabsClient` (TTS + sound-effect endpoints), `AudioManager` (Web Audio, stereo positional mixing, voice queue), persistent `AudioCache`, `RetroSynth` procedural fallbacks, sound bank formats. |
| `src/game/` | Demo level, HUD (weapon, health, ammo, messages, end screens), minimap, asset loader, `Game` host. |
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
no per-frame allocations; the headless smoke test measures roughly 3 ms per
update+render frame at 384x240 in Chromium's software renderer.

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
