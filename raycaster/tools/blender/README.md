# Blender sprite pipeline

`sprite_baker.py` turns a low-poly 3D model into a multi-angle sprite sheet plus
JSON metadata the engine's `SpriteSheet` loader reads directly.

## Requirements

- Blender 3.6 or newer (4.x tested paths included) on the PATH as `blender`.
- A model in `.glb`, `.gltf`, `.fbx`, `.obj` or `.blend` form. Animated models
  need their clips stored as Actions.

## Usage

```bash
blender -b -P tools/blender/sprite_baker.py -- \
  --input models/grunt.glb \
  --output public/assets/sprites \
  --name grunt \
  --directions 8 \
  --size 64 \
  --fps 8 \
  --elevation 12 \
  --animations "idle:Idle:2,walk:Walk:4,attack:Attack:3:noloop,hurt:Hurt:2:noloop,die:Die:4:noloop"
```

Animation spec entries are `NAME[:ACTION|START-END][:FRAME_COUNT][:noloop]`.
Use `--auto-actions` to bake every Action in the file under its own name.
Static props need no animation flag; a single `idle` frame is baked.

Output:

- `public/assets/sprites/<name>.png` — columns are directions, rows are frames.
- `public/assets/sprites/<name>.json` — `SpriteSheetMeta` (see
  `src/renderer/SpriteSheet.ts`). `origin` is measured from the rendered
  ground-contact point so sprites sit on the floor at any elevation angle.

The demo's asset loader (`src/game/Assets.ts`) checks for
`assets/sprites/grunt.json` and `assets/sprites/brute.json` at startup and uses
them in place of the procedural sheets when present. Names in the demo enemy
specs must match the `--name` you bake with, and the animations `idle`, `walk`,
`attack`, `hurt` and `die` must exist for enemies.

## Direction convention

Direction `d` is rendered with the camera at azimuth `d * 360 / directions`
degrees **clockwise, seen from above**, from the model's forward axis (`-Y` in
Blender by default; override with `--forward-axis`). The engine computes the
same relative angle between a sprite's facing and the viewer, so a sprite
facing away shows its back and a sprite facing left shows its left side.
