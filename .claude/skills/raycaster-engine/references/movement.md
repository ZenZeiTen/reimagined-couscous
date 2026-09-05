# Movement, collision and the camera

Contents:
1. [Grid collision](#1-grid-collision)
2. [Free-roam controller](#2-free-roam-controller)
3. [Grid-locked controller](#3-grid-locked-controller)
4. [Action gating with stamina](#4-action-gating-with-stamina)
5. [Camera interpolation, pitch and bob](#5-camera-interpolation-pitch-and-bob)
6. [Line of sight and hitscan](#6-line-of-sight-and-hitscan)

---

## 1. Grid collision

Movers are circles; walls are axis-aligned cells. For radius < 0.5 an exact test
is just "does any cell overlapped by the circle's bounding box contain a wall":

```ts
export function circleHitsWall(map, x, y, radius) {
  for (let cy = Math.floor(y - radius); cy <= Math.floor(y + radius); cy++)
    for (let cx = Math.floor(x - radius); cx <= Math.floor(x + radius); cx++)
      if (map.isSolid(cx, cy)) return true;
  return false;
}
```

**Resolve each axis separately.** This is the whole trick to walls that feel
right:

```ts
if (dx !== 0 && !circleHitsWall(map, pos.x + dx, pos.y, radius)) pos.x += dx;
if (dy !== 0 && !circleHitsWall(map, pos.x, pos.y + dy, radius)) pos.y += dy;
```

Testing the combined move instead stops the player dead whenever either
component is blocked, so they snag on corners and cannot slide along a wall —
the single most common "the movement feels bad" complaint.

Treat out-of-bounds cells as solid in `isSolid`. It costs one comparison and
removes an entire class of escape bugs.

---

## 2. Free-roam controller

Continuous position and angle; the shooter feel.

```ts
const md = moveDir.set(0, 0);                       // reused, not allocated
if (input.isAction('forward'))     md.x += 1;
if (input.isAction('backward'))    md.x -= 1;
if (input.isAction('strafeRight')) md.y += 1;
if (input.isAction('strafeLeft'))  md.y -= 1;
if (md.x !== 0 || md.y !== 0) {
  md.normalize();                                    // no diagonal speed bonus
  const speed = moveSpeed * (input.isAction('run') ? runMultiplier : 1);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  velocity.set((cos * md.x - sin * md.y) * speed, (sin * md.x + cos * md.y) * speed);
  moveWithCollision(map, pos, velocity.x * dt, velocity.y * dt, radius);
}
```

Normalising the input vector before scaling is what stops diagonal movement
being 41% faster — a bug that ships surprisingly often.

Mouse look adds `mouseDeltaX * sensitivity` to the angle. Accumulate deltas
during the frame and consume them in `update`, so a 1000 Hz mouse doesn't apply
motion at a different rate than a 125 Hz one.

---

## 3. Grid-locked controller

The dungeon-crawler feel: the player always occupies a cell centre facing one of
four directions, and every action is a non-interruptible tween.

Represent facing as an integer 0-3 with lookup tables rather than an angle:

```ts
export const FACING_DX = [1, 0, -1, 0] as const;   // 0=E 1=S 2=W 3=N
export const FACING_DY = [0, 1,  0, -1] as const;
```

Integer facing makes "what is in front of me" exact — no float comparison, no
drift after a thousand turns — which the interaction system depends on.

**A step** validates the target cell before committing, then tweens:

```ts
tryStep(relDir, map, blockers) {           // relDir: 0 ahead, 1 right, 2 back, 3 left
  if (this.isBusy) return false;
  const f = (this.facing + relDir) % 4;
  const tx = this.cellX + FACING_DX[f], ty = this.cellY + FACING_DY[f];
  if (map.isSolid(tx, ty) || blockers?.blocksCircle(tx + 0.5, ty + 0.5, this.radius)) {
    this.onBlocked?.();                    // bump sound, rate-limited
    return false;
  }
  if (!this.spendStamina(this.config.moveStaminaCost)) return false;
  this.moveFrom.copy(this.pos);
  this.moveTo.set(tx + 0.5, ty + 0.5);
  this.cellX = tx; this.cellY = ty;        // logical position updates immediately
  this.begin('move', this.config.moveDuration);
  return true;
}
```

Updating `cellX/cellY` at the *start* while the visual position tweens keeps
game logic discrete and testable: queries like "what is in front of me" have one
answer during the whole step, and a test can assert the destination without
waiting out the animation.

**Advance the tween** with smooth-step easing so starts and stops feel weighted:

```ts
const t = Math.min(1, this.actionTime / this.actionDuration);
const ease = t * t * (3 - 2 * t);
this.pos.set(from.x + (to.x - from.x) * ease, from.y + (to.y - from.y) * ease);
if (t >= 1) { this.pos.copy(this.moveTo); this.action = 'idle'; this.delayLeft = actionDelay; }
```

Snapping exactly to `moveTo` on completion matters — easing leaves float error
that accumulates into visible drift off the cell centre over a long session.

**Turning** interpolates the camera angle along the shortest arc while the
logical facing flips at the end:

```ts
this.turnFrom = this.angle;
this.facing = (((this.facing + dir) % 4) + 4) % 4;   // double modulo: JS % keeps sign
this.turnTo = this.facing * HALF_PI;
```

The double modulo is not paranoia: `(0 - 1) % 4` is `-1` in JavaScript, which
indexes the facing tables as `undefined`.

**A short delay after each action** (~80 ms) before the next is accepted is what
separates "deliberate" from "sluggish" or "twitchy". Tune this before tuning the
tween durations; it has more effect on feel than either.

---

## 4. Action gating with stamina

A stamina meter converts movement from a continuous stream into a resource the
player spends, which is the mechanical core of the slow-paced style.

```ts
private spendStamina(cost: number): boolean {
  if (cost <= 0) return true;
  if (this.exhausted || this.stamina < cost) return false;
  this.stamina -= cost;
  if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
  return true;
}
```

Two details make it feel fair rather than punishing:

- **Regenerate only while idle.** Regenerating mid-action lets a player chain
  moves indefinitely at a slight delay, which erases the mechanic.
- **Exhaustion needs a recovery threshold**, not just `stamina > 0`. Clearing
  the flag the instant a single point returns produces a stutter of one step,
  exhausted, one step. Require a meaningful fraction (say 30%) before acting
  again.

Mana works the same way but regenerates always and gates spells rather than
steps, so the two meters give the player different kinds of pressure.

---

## 5. Camera interpolation, pitch and bob

With a fixed-step simulation the render happens between ticks, so interpolate:

```ts
const x = prevPos.x + (pos.x - prevPos.x) * alpha;
const y = prevPos.y + (pos.y - prevPos.y) * alpha;
const angle = lerpAngle(prevAngle, angle, alpha);   // shortest arc, not raw lerp
camera.setPosition(x, y);
camera.setAngle(angle);
```

Use a shortest-arc angle lerp. A raw lerp across the 0/2π seam spins the camera
the long way round — a full whip-pan for a one-degree turn.

**Pitch** in a raycaster is not a rotation; it is a vertical shift of the
horizon in screen rows. That is why it must be clamped to a fraction of the
buffer height (about ±40%): push further and the floor/ceiling casting runs out
of rows and the illusion collapses. Store pitch in render pixels so the clamp is
resolution-independent.

**Head bob** is the same shift driven by distance walked, not by time — bob tied
to a clock keeps bobbing when you stop against a wall. A few percent of the
buffer height is plenty; more induces motion sickness.

Both pitch and bob feed the same `horizon` value used by the wall, floor and
sprite passes, so they stay consistent for free.

---

## 6. Line of sight and hitscan

Reuse the DDA walk for gameplay queries. Line of sight steps cells between two
points and fails on the first solid one, with the parametric length bounded to
the segment so it stops at the destination:

```ts
if (sideDistX > 1) return true;   // passed the far endpoint without hitting
```

**Stagger LOS checks across entities.** Give each a small random initial timer
and re-check every ~150 ms rather than every tick. Twenty enemies each tracing a
ray every frame is a real cost, and no player can perceive the delay.

**Hitscan** casts against walls first, then tests targetable entities as circles
along the ray, keeping the nearest hit in front of the wall:

```ts
const along = ex * dx + ey * dy;                  // projection onto the ray
if (along <= 0 || along >= bestDist) continue;    // behind, or already occluded
const perp = Math.abs(ex * dy - ey * dx);         // perpendicular offset
if (perp <= e.radius + along * Math.tan(spread)) { best = e; bestDist = along; }
```

Growing the effective hit radius with distance (the `tan(spread)` term) keeps
distant targets hittable without making the crosshair lie. Return a shared
result object rather than allocating one per shot.
