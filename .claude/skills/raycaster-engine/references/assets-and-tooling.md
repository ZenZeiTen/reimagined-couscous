# Assets, tooling and tests

Contents:
1. [Project scaffold](#1-project-scaffold)
2. [Levels](#2-levels)
3. [Textures without image files](#3-textures-without-image-files)
4. [Sprite sheet metadata](#4-sprite-sheet-metadata)
5. [Baking sprites from Blender](#5-baking-sprites-from-blender)
6. [The HUD canvas](#6-the-hud-canvas)
7. [What to test](#7-what-to-test)

---

## 1. Project scaffold

Vite + TypeScript, no framework. The engine is plain DOM and canvas, so a UI
framework only adds a render loop fighting yours for control of the frame.

`package.json` needs `vite` and `typescript` as dev dependencies plus `vitest`
if you want tests. Scripts: `dev`, `build` (`tsc --noEmit && vite build`),
`typecheck`, `test`.

`tsconfig.json` — the settings that matter for engine code:

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "noImplicitOverride": true, "exactOptionalPropertyTypes": true,
    "isolatedModules": true, "skipLibCheck": true, "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`exactOptionalPropertyTypes` is worth the friction here: engine config objects
are full of optional fields, and it catches the difference between "absent" and
"explicitly undefined" before it becomes a runtime `NaN` in the render loop.

`index.html` carries two stacked canvases and a start overlay:

```html
<div id="stage">
  <canvas id="view"></canvas>   <!-- world, low internal res, scaled up -->
  <canvas id="hud"></canvas>    <!-- text and gauges, display res -->
  <div id="overlay">Click to start</div>
</div>
```

Style both canvases `position: absolute; left: 0; top: 0` and set
`image-rendering: pixelated` on the world canvas. The overlay exists because
pointer lock and audio both require a user gesture — one click satisfies both.

Two gotchas when embedding in a larger repo:

- If a parent directory has a `postcss.config.mjs` (a Next.js app, say), Vite
  will find it and fail on missing plugins. Set `css: { postcss: {} }` in
  `vite.config.ts` to stop the upward search.
- Add the engine directory to the parent `tsconfig.json`'s `exclude` so the two
  projects typecheck independently.

Use `base: './'` in the Vite config so the build works from a subdirectory or a
file URL.

---

## 2. Levels

ASCII maps are the right authoring format: readable in a diff, editable in any
text editor, and trivially diffable when a level changes.

```ts
const LEVEL = {
  legend: {
    '#': { wall: TEX.BRICK, floor: 0, ceiling: 0 },
    '.': { wall: 0, floor: TEX.FLOOR, ceiling: TEX.CEILING },
    'P': { wall: 0, floor: TEX.FLOOR, ceiling: TEX.CEILING, playerStart: true, startAngleDeg: 0 },
    'g': { wall: 0, floor: TEX.FLOOR, ceiling: TEX.CEILING, spawn: 'grunt', startAngleDeg: 180 },
    'D': { wall: TEX.DOOR, floor: TEX.FLOOR, ceiling: TEX.CEILING, spawn: 'door' },
  },
  rows: [
    '########',
    '#P..g..#',
    '####D###',
  ],
};
```

Each glyph carries wall, floor and ceiling ids plus an optional spawn, so one
grid defines the whole level. Doors are the interesting case: the glyph is both
a wall tile *and* a spawn, because the door entity clears that wall when opened.

Parse into flat `Uint8Array` layers (`walls`, `floors`, `ceilings`) sized
`width * height`. Flat typed arrays are what let the DDA loop index with
`y * width + x` and no bounds objects.

Validate at parse time — ragged rows, unknown glyphs, a missing player start —
and throw with the coordinates. A silent parse failure surfaces as an
inexplicable rendering bug much later.

Keep a JSON form (`serializeMap` / `parseJsonMap`) for anything machine
generated. Round-tripping ASCII → JSON → ASCII is also a cheap unit test of the
parser.

For an enclosed dungeon, make sure no walkable cell has ceiling id 0 (the sky
sentinel) or light leaks in from nowhere and the darkness effect collapses.

---

## 3. Textures without image files

Generate wall and floor textures procedurally so the project has no binary
assets to begin with. `ProceduralTextures.ts` in the kernel has brick, stone,
tech panel, wood, floor tile, ceiling, door and lava generators built on a
seeded value-noise function.

They are deterministic, which matters more than it sounds: the same seed gives
the same texture every run, so a screenshot diff is meaningful.

Register real PNGs later under the same numeric ids and nothing else changes:

```ts
textures.register(TEX.BRICK, await Texture.load('assets/textures/1.png'));
```

Have the asset loader probe for optional overrides and fall back silently. That
way the game runs before any art exists, and art can be added file by file
without touching code.

---

## 4. Sprite sheet metadata

One image plus one JSON file describing it:

```json
{
  "name": "grunt",
  "image": "grunt.png",
  "frameWidth": 64, "frameHeight": 64,
  "directions": 8,
  "origin": { "x": 0.5, "y": 0.93 },
  "worldHeight": 0.9,
  "animations": {
    "idle":   { "fps": 2,  "loop": true,  "frameCount": 2 },
    "walk":   { "fps": 8,  "loop": true,  "frameCount": 4 },
    "attack": { "fps": 10, "loop": false, "frameCount": 3 }
  },
  "frames": [
    { "animation": "idle", "frame": 0, "direction": 0, "x": 0, "y": 0, "w": 64, "h": 64 }
  ]
}
```

The fields that carry real meaning:

- **`origin`** is where the model's ground contact point sits inside the frame,
  normalised, y measured from the top. The baker measures it by projecting the
  model's base through the render camera. It is what makes sprites stand on the
  floor instead of hovering, and it is not always `(0.5, 1)` — an elevated
  camera pushes the contact point up into the frame.
- **`worldHeight`** is the frame's height in tiles, so 1.0 is exactly wall
  height. This is the sprite's scale, and keeping it in world units (not pixels)
  means the same sheet works at any internal resolution.
- **`directions`** with the frame table indexed by (animation, frame,
  direction). Validate on load that every triple exists and lies inside the
  image, and throw naming the missing one.

An explicit frame table rather than an implied grid layout costs a few kilobytes
and buys the freedom to pack frames however the baker likes.

There is a lighter variant for static props: one PNG per angle plus a
`metadata.json` listing them, packed into a sheet at load time
(`DirectionalSprites.ts`, produced by `directional_sprite_addon.py`).

---

## 5. Baking sprites from Blender

`assets/blender/sprite_baker.py` runs headless and does the whole job: import a
model, orbit a camera through N azimuths for every sampled animation frame,
render with a transparent background, pack a sheet, measure the origin, write
the JSON.

```bash
blender -b -P sprite_baker.py -- \
  --input models/grunt.glb --output public/assets/sprites --name grunt \
  --directions 8 --size 64 --fps 8 --elevation 12 \
  --animations "idle:Idle:2,walk:Walk:4,attack:Attack:3:noloop"
```

`assets/blender/directional_sprite_addon.py` is the lighter one — an installable
add-on with a sidebar panel that rotates the active object in front of the
scene's camera. Good for props and quick previews.

Conventions to hold onto:

- **Direction 0 is the view from in front of the model**, with directions
  advancing clockwise seen from above. Blender's front is -Y. Write this down
  in both the baker and the engine, because a mismatch shows as enemies walking
  backwards and is easy to overlook.
- **Bound the camera across every sampled frame**, not just the rest pose, or a
  raised weapon clips at the frame edge in exactly one attack frame.
- **Fixed camera, rotating object** is equivalent to orbiting the camera and far
  simpler to frame consistently.
- **Orthographic** by default. Perspective at close range makes each direction a
  slightly different size, which reads as jitter when the sprite turns.
- **Elevation around 10-15°** matches a standing player's eye line. Bake at 0°
  and characters look like paper cutouts; bake too high and they look tilted.
- **Neutral colour management** (`view_transform = 'Standard'`) so albedo
  survives; Filmic will wash the sprites out relative to the walls.

Blender's Python API moves between versions — the EEVEE engine id changed in
4.2, `bpy.ops.import_scene.obj` became `bpy.ops.wm.obj_import` in 3.3. Both
bundled scripts probe for what exists rather than assuming.

---

## 6. The HUD canvas

Draw the HUD with the ordinary 2D API on the second canvas, at display
resolution — sharp text over pixelated world is the look you want, and it costs
nothing because the HUD is a few dozen draw calls.

Size everything from a `unit` derived from the canvas (`min(w, h) / 100`) so the
layout survives any window size. Absolute pixel sizes break on the first
resolution you didn't test.

Two layout rules learned the hard way: lay out label/value pairs on a column
grid rather than positioning each string independently, or text overlaps at some
aspect ratios; and give any panel a solid background rather than drawing text
directly over the world, or it becomes unreadable against a bright wall.

The HUD is also where the game communicates. A shooter needs health, ammo and a
crosshair; a crawler needs health, mana, stamina, a compass, an equipment
window and an interaction prompt. Match the layout to the pace: gauges that
demand a glance mid-fight go low and central, reference information goes to a
corner.

Render the HUD from a plain state object built each frame rather than letting it
reach into the game. It stays testable and you can screenshot arbitrary states.

---

## 7. What to test

Engine code is unusually testable if you keep rendering separate from
simulation. Worth covering, roughly in order of payoff:

- **Raycaster geometry.** Cast into a known map and assert the perpendicular
  distance, hit side, wall id and texture coordinate for the centre ray. Also
  assert that every column hitting one flat wall reports the *same* distance —
  that single test catches fisheye regressions permanently. Use an even column
  count so `cameraX` is exactly 0 for the centre column.
- **Collision.** Sliding along a wall, blocked axis, no escape through corners.
- **Map parsing.** Ragged rows, unknown glyphs, missing player start, JSON
  round-trip.
- **Grid movement.** One step lands exactly on the cell centre, turns land
  exactly on 90°, actions are refused during a tween and during the post-action
  delay, stamina gates and recovers.
- **Sprite sheets.** Direction selection at the cardinals, non-looping
  animations holding the last frame, malformed metadata rejected.
- **Interactables.** Doors clear and restore their wall tile, keys are required
  and permanent, levers toggle by tag.
- **Shading curves.** Linear and exponential falloff at sampled distances,
  clamping at the fog distance.

For the renderer, a fake framebuffer (`{ width, height, data: new Uint32Array(w*h) }`)
is enough — the passes only touch those three fields, so no canvas is needed.
Assert that pixels changed in the expected span rather than exact colours; exact
values make the tests brittle against texture tweaks.

The one thing unit tests cannot cover is whether it *looks* right. Drive the
real page in a headless browser, pause the loop, and step `update`/`render`
directly rather than sleeping on wall-clock time:

```js
await page.evaluate(() => window.__game.engine.pause());
await page.evaluate(() => { for (let i = 0; i < 30; i++) g.update(1/60); g.render(0.5, 1/60); });
```

Deterministic stepping makes screenshots reproducible and avoids depending on
requestAnimationFrame scheduling, which is unreliable in headless environments.
Expose the engine on `window` in development for exactly this.
