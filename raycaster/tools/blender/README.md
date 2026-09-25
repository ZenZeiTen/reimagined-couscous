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

## Directional Sprite Baker add-on

`directional_sprite_addon.py` is a lighter alternative for static props or
quick previews. It rotates the **active object** in front of the scene's own
camera and writes one transparent PNG per angle plus `metadata.json`:

```json
{ "modelName": "guard", "numAngles": 8, "resolution": 128,
  "frames": [ { "index": 0, "angleDegrees": 0.0, "filename": "sprite_00_0deg.png" }, ... ] }
```

Use it three ways:

- **Add-on**: Edit > Preferences > Add-ons > Install..., pick the file, then
  open the "Sprite Baker" tab in the 3D viewport sidebar, set the output
  folder, angle count and resolution, and press *Bake Directional Sprites*.
- **Text Editor**: run the file, then call
  `bake_directional_sprites("//../../public/assets/sprites/guard", num_angles=8, resolution=128)`.
- **CLI**: `blender -b model.blend -P tools/blender/directional_sprite_addon.py -- --output public/assets/sprites/guard --angles 8 --resolution 128`

The engine loads this format through `loadDirectionalSprite()` in
`src/renderer/DirectionalSprites.ts`, which packs the PNGs into a sheet at
runtime. The demo asset loader checks `assets/sprites/<name>/metadata.json`
after `<name>.json`. Rotating the object counter-clockwise by θ is the same
view as moving the camera clockwise by θ, so frame indices follow the same
clockwise-from-front convention as `sprite_baker.py`.
