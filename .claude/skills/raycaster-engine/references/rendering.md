# Rendering

Contents:
1. [The DDA loop](#1-the-dda-loop)
2. [Textured wall columns](#2-textured-wall-columns)
3. [Floor and ceiling casting](#3-floor-and-ceiling-casting)
4. [Billboard sprites](#4-billboard-sprites)
5. [Multi-angle sprite directions](#5-multi-angle-sprite-directions)
6. [Shading and light models](#6-shading-and-light-models)
7. [The framebuffer](#7-the-framebuffer)

---

## 1. The DDA loop

The camera is a position plus two vectors: `dir` (where you look) and `plane`
(the camera plane, perpendicular to `dir`). The plane's length encodes the
horizontal field of view: `|plane| = tan(fov / 2) * |dir|`. Column `x` of the
screen casts the ray

```
cameraX = 2 * x / width - 1          // -1 at the left edge, +1 at the right
rayDir  = dir + plane * cameraX
```

That linear sweep across the plane — rather than sweeping the *angle* — is what
makes the projection rectilinear. Sweeping angles uniformly is a subtly
different (and wrong for a flat screen) picture.

Digital Differential Analysis then walks the ray cell by cell. `deltaDist` is
the ray length between consecutive grid lines on each axis, `sideDist` the
length from the origin to the next grid line. Step whichever is nearer:

```ts
const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
// stepX/sideDistX set from the sign of rayDirX and the fractional position
while (hit === 0 && steps < maxSteps) {
  if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
  else                       { sideDistY += deltaDistY; mapY += stepY; side = 1; }
  hit = walls[mapY * mapWidth + mapX];
  steps++;
}
```

`side` records which face was crossed: 0 for an x-facing wall, 1 for y-facing.
This drives both the perpendicular distance and the texture coordinate.

**Perpendicular distance.** After the loop, the `sideDist` for the axis you just
crossed has already been advanced one step past the hit, so backing it off gives
exactly the distance measured perpendicular to the camera plane:

```ts
const perp = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
```

No `sqrt`, no cosine correction, no fisheye. If you ever find yourself writing
`Math.hypot` here, that is the bug.

**Termination.** Bound the walk with a step counter and treat out-of-bounds as
solid. A ray escaping an unclosed map otherwise runs until the guard trips, and
with no guard at all it hangs the tab.

**Storage.** Write results into preallocated typed arrays indexed by column
(`perpDist`, `side`, `wallId`, `wallX`, `mapX`, `mapY`, `rayDirX`, `rayDirY`).
Returning objects per column allocates thousands of them per frame.

The kernel's `Raycaster.cast()` is this loop, already written.

---

## 2. Textured wall columns

Height and vertical extent:

```ts
const halfLine  = Math.ceil((h * 0.5) / perp);   // ceil, see below
const drawStart = horizon - halfLine;
const drawEnd   = horizon + halfLine;
```

`horizon` is `h / 2` shifted by pitch and head bob. Rounding the half-height up
rather than truncating matters: truncation leaves a one-pixel strip of floor
below the wall base that flickers as you move.

**Where along the wall face did we hit?** Take the fractional part of the
non-stepped coordinate at the hit distance:

```ts
let wallX = side === 0 ? posY + perp * rayDirY : posX + perp * rayDirX;
wallX -= Math.floor(wallX);            // 0..1 across the face
let texX = (wallX * texWidth) | 0;
if ((side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0)) {
  texX = texWidth - texX - 1;          // mirror far-facing sides
}
```

The mirror keeps the texture reading continuously around a corner. Skip it and
lettering or directional patterns appear reversed on half the walls.

**Vertical sampling** steps a fixed amount per screen row:

```ts
const step = texHeight / (halfLine * 2);
let texPos = (clippedStart - drawStart) * step;   // resume mid-texture when clipped
```

Starting `texPos` from the *unclipped* `drawStart` is what keeps textures stable
when you walk into a wall and the column extends past the screen; using the
clipped start makes the texture visibly slide.

**Shading** multiplies the texel by a fixed-point 8.8 factor (0-256), with
y-facing sides darkened by a constant so corners read. Doing this with integers
avoids float work in the innermost loop.

Write `perp` into `zBuffer[x]` here — the sprite pass depends on it.

---

## 3. Floor and ceiling casting

The insight that makes this cheap: for a given screen row the distance to the
floor plane is **constant across the row**. So compute it once per row, derive
the world-space step per pixel, and then advance by addition.

For row `y` below the horizon, with `p = y - horizon` rows below it and camera
height `camH` (0.5 = eye level midway between floor and ceiling):

```ts
const rowDistance = (camH * h) / p;
```

The two edge rays (`dir - plane` and `dir + plane`) give the world positions at
the row's left and right ends, so the per-pixel step is their difference divided
by the width:

```ts
const stepX = rowDistance * (rayDirX1 - rayDirX0) / width;
const stepY = rowDistance * (rayDirY1 - rayDirY0) / width;
let floorX = posX + rowDistance * rayDirX0;
let floorY = posY + rowDistance * rayDirY0;
// per pixel: sample at (floorX, floorY), then floorX += stepX; floorY += stepY;
```

Ceilings are the mirror image with `p = horizon - y` and `(1 - camH)`.

**Per-cell textures.** `Math.floor(floorX/floorY)` is the map cell, so you can
look up a different floor texture per tile and give rooms distinct surfaces at
no extra cost. The texel is the fractional part times the texture size.

**Sky.** Reserve ceiling id 0 to mean "open sky" and paint a precomputed
per-row gradient instead of sampling. For a fully enclosed dungeon, don't leave
any cell at 0 or light leaks in from nowhere.

**The horizon row** has `p === 0` and infinite distance — special-case it or you
divide by zero.

**Cost.** This pass touches every pixel and is the most expensive part of the
frame. Cache the texture registry into flat arrays indexed by id (rebuilt only
when the registry version changes) rather than calling a lookup method per
pixel; the kernel does this.

---

## 4. Billboard sprites

Transform each sprite into camera space with the inverse of the `[plane|dir]`
matrix:

```ts
const invDet = 1 / (planeX * dirY - dirX * planeY);
const transformX = invDet * ( dirY * relX - dirX * relY);   // lateral offset
const transformY = invDet * (-planeY * relX + planeX * relY); // depth
```

`transformY` is the depth (cull anything `<= 0.05`, behind or on the camera),
and the screen centre is `(width / 2) * (1 + transformX / transformY)`.

Size follows the same `1/distance` rule as walls: a sprite `worldHeight` tiles
tall covers `h * worldHeight / transformY` pixels.

**Vertical placement.** Anchor to the floor plane, not the screen centre:

```ts
const floorScreenY = horizon + (camH * h) / transformY;
const bottom = floorScreenY - (zOffset * h) / transformY + spriteH * (originY - 1);
```

`originY` comes from the sprite sheet (1 = the art's feet are at the bottom
edge), and `zOffset` lifts pickups or projectiles off the ground. Sprites that
appear to float or sink almost always ignore one of these two terms.

**Draw far to near** so nearer sprites overwrite farther ones, and test each
column against the wall z-buffer:

```ts
for (let x = drawStartX; x < drawEndX; x++) {
  if (transformY >= zBuffer[x]) continue;   // hidden behind a wall
  ...
}
```

Sort with an insertion sort over an index array — sprite counts are small, and
`Array.prototype.sort` with a comparator allocates and is slower here.

**Transparency** is an alpha test, not blending: skip texels whose alpha byte is
zero. Blending would need back-to-front ordering against walls too, and retro
sprite art doesn't want it.

---

## 5. Multi-angle sprite directions

A sprite sheet baked from a 3D model has N views around the model. To pick one,
compute the angle from the sprite to the viewer, subtract the sprite's facing,
and quantise:

```ts
const toViewer = Math.atan2(viewerY - spriteY, viewerX - spriteX);
let rel = (toViewer - facing) % TWO_PI;
if (rel < 0) rel += TWO_PI;
const direction = Math.round(rel / (TWO_PI / directions)) % directions;
```

Direction 0 must therefore be the view *from in front of* the model. Pin this
convention down in writing and make the baking tool match it, because the
failure mode — an enemy showing its back while walking toward you — is easy to
miss during development and unmistakable to a player.

Round, don't floor: rounding centres each direction's wedge on its rendered
angle, so the sprite flips at the midpoint between two views rather than a
quarter-wedge early.

`SpriteSheet` in the kernel validates on construction that every
(animation, frame, direction) triple exists and lies inside the image, then
serves lookups from a flat `Int32Array`. Failing loudly at load beats a missing
frame surfacing as a stray texel mid-fight.

---

## 6. Shading and light models

Distance fog is what sells the space, and the shape of the falloff is the whole
mood:

- **Linear** — `1 - d / fogDistance`, clamped to a floor. Reads as haze or
  draw-distance. Right for outdoor and well-lit levels.
- **Exponential** — `exp(-density * (d - lightRadius))`, clamped to black.
  Reads as a torch in a dungeon: bright within a step or two, near-total dark
  beyond. This is the King's Field / survival-horror look.

Precompute either into a lookup table indexed by distance and return a
fixed-point 8.8 factor (0-256, where 256 = unchanged). Per-pixel `exp()` is
wasteful and per-pixel float multiply-and-round is slower than an array read.

```ts
factorFor(distance) {
  let i = (distance * this.scale) | 0;
  return this.table[i < 0 ? 0 : i >= n ? n - 1 : i];
}
```

An `ambient` multiplier baked into the table gives you free global effects:
scale it with a slow sine plus a little noise for torch flicker, drop it during
a blackout, raise it when a light spell is cast. Rebuild the table on change,
not per frame.

Give walls a constant extra darkening for y-facing sides. It is physically
arbitrary but reads as directional light and makes corners legible.

---

## 7. The framebuffer

Render into a CPU-side `ImageData` viewed as a `Uint32Array`, then upload once
per frame with `putImageData` into a backing canvas and `drawImage` it scaled to
the display canvas with `imageSmoothingEnabled = false`.

Two reasons for the indirection: `putImageData` ignores transforms so it can't
scale, and per-pixel `fillRect` calls are orders of magnitude slower than
writing into a typed array.

Pixel order is the trap. `ImageData` bytes are R,G,B,A in memory, so as a
`Uint32Array` on little-endian hardware a pixel is `0xAABBGGRR`. Detect once:

```ts
export const IS_LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
```

and route every colour through `packRGBA` / `shadePixel`. Hand-written
`(r << 24) | ...` is the source of "why is everything cyan".

Keep the internal buffer small (240 rows is a good default) and let the width
follow the display aspect ratio. Widening the buffer for a wide window should
widen the field of view, not stretch the pixels — recompute the camera FOV from
the aspect ratio on resize so wall proportions stay constant.
