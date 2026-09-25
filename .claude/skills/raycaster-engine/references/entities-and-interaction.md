# Entities and interaction

Contents:
1. [Entity base and the world context](#1-entity-base-and-the-world-context)
2. [The entity manager](#2-the-entity-manager)
3. [Enemy state machines](#3-enemy-state-machines)
4. [Projectiles](#4-projectiles)
5. [Interactables: doors, chests, levers](#5-interactables-doors-chests-levers)
6. ["What am I looking at?"](#6-what-am-i-looking-at)
7. [Inventory](#7-inventory)

---

## 1. Entity base and the world context

Every entity is also a `Billboard`, so the sprite renderer can consume the
entity list directly with no adapter layer:

```ts
export abstract class Entity implements Billboard {
  readonly pos = new Vec2();
  angle = 0; radius = 0.3; solid = true; targetable = false;
  sheet = ''; animation = 'idle'; animTime = 0;
  scale = 1; zOffset = 0; visible = true; brightness = 1;
  removed = false;
  abstract update(dt: number, world: WorldContext): void;
}
```

Entities reach the rest of the game through a **world context** rather than a
reference to the game object:

```ts
export interface WorldContext {
  map: GameMap;
  player: { pos: Vec2; angle: number; radius: number; isAlive(): boolean;
            takeDamage(amount: number, fromX: number, fromY: number): void };
  entities: readonly Entity[];
  playSound(name: string, x?: number, y?: number): void;
  speak(lineId: string): void;
  message(text: string): void;
  time: number;
}
```

This is worth the small ceremony. Entities become testable with a plain object
literal — no canvas, no audio context, no engine — which is what makes it
practical to unit-test enemy AI and door logic at all. Note that `player` is
structural: the same enemy code works against a free-roam or a grid-locked
player because neither type is named.

---

## 2. The entity manager

Owns the list, spawns from a type registry, and defers removal:

```ts
update(dt, world) {
  for (const e of this.list) if (!e.removed) e.update(dt, world);
  let write = 0;                                   // compact in place, no allocation
  for (const e of this.list) if (!e.removed) this.list[write++] = e;
  this.list.length = write;
}
```

Deferred removal is what lets an entity remove itself, or kill another, in the
middle of the iteration without corrupting the loop. Splicing during iteration
skips the next element — a bug that shows up as "sometimes an enemy survives a
killing blow".

A **type registry** (`registerFactory('grunt', () => new Enemy(GRUNT))`) keeps
map parsing decoupled from entity classes: the level format only names types, so
a level editor or JSON map never imports game code.

Expose a reused array for billboards rather than building one per frame:

```ts
billboards(): readonly Billboard[] {
  const out = this.billboardList;                  // member, reused
  out.length = this.list.length;
  for (let i = 0; i < this.list.length; i++) out[i] = this.list[i];
  return out;
}
```

---

## 3. Enemy state machines

A small explicit FSM — `idle → chase → attack → hurt → dead` — is easier to
tune and debug than behaviour trees at this scale, and its states map one-to-one
onto sprite animations.

Data-drive the archetypes so a new enemy is a constant, not a class:

```ts
export const GRUNT: EnemySpec = {
  type: 'grunt', sheet: 'grunt', health: 60, speed: 0.9, damage: 12,
  attackRange: 1.2, attackWindup: 0.45, attackCooldown: 1.1,
  sightRange: 12, sightHalfFov: Math.PI * 0.6, radius: 0.3, scale: 1,
  sounds: { alert: 'enemy_alert', attack: 'enemy_attack', hurt: 'enemy_hurt', die: 'enemy_die' },
};
```

Details that make the AI read as intentional rather than robotic:

- **Attack wind-up.** Commit to the attack, then apply damage partway through
  and re-check range and line of sight at that moment. Instant damage on contact
  gives the player nothing to react to; damage that lands regardless of what
  happened during the wind-up feels unfair.
- **A sight cone while idle, none while chasing.** An unaware enemy shouldn't
  notice you behind it; an alerted one shouldn't forget you the moment you step
  aside.
- **Last known position.** Chase a remembered point rather than the live
  position, and give up on arriving without reacquiring. This produces searching
  behaviour for free and stops enemies tracking you through walls.
- **Separation.** Push away from other solid entities while chasing, or a group
  converges into one shape. Sum a repulsion vector proportional to overlap
  before normalising the movement direction.
- **Stop short of the player.** Clamp movement at `radius + playerRadius +
  margin`; without it enemies grind into the player's collision circle and
  jitter.
- **Corpses stay.** On death clear `solid` and `targetable`, keep the final
  animation frame. Vanishing bodies cheapen every kill.

---

## 4. Projectiles

A projectile is an entity that moves along a fixed heading and removes itself on
the first wall or target:

```ts
update(dt, world) {
  const step = this.speed * dt;
  const nx = this.pos.x + this.dx * step, ny = this.pos.y + this.dy * step;
  this.travelled += step;
  if (world.map.isSolidAt(nx, ny) || this.travelled >= this.maxRange) {
    world.playSound('spell_hit', this.pos.x, this.pos.y);
    this.removed = true; return;
  }
  this.pos.set(nx, ny);
  for (const e of world.entities) {
    if (!e.targetable || !e.isAlive()) continue;
    const r = e.radius + this.radius;
    if (e.pos.distanceSqTo(this.pos) <= r * r) { e.takeDamage(...); this.removed = true; return; }
  }
}
```

Compare squared distances to skip the `sqrt`. At high speeds the discrete step
can tunnel through thin targets; if that matters, sample a few points along the
step rather than raising the tick rate.

Give projectiles `brightness > 1` and a `zOffset` so they read as glowing and
hover at chest height. The shading factor is clamped by the renderer, so
over-bright values are safe.

---

## 5. Interactables: doors, chests, levers

An interactable is an entity with a prompt and an action:

```ts
export abstract class Interactable extends Entity {
  get cellX() { return Math.floor(this.pos.x); }
  get cellY() { return Math.floor(this.pos.y); }
  abstract prompt(who: Adventurer): string | null;    // null = nothing to offer
  abstract interact(world: WorldContext, who: Adventurer): InteractResult;
}
```

Returning `null` from `prompt` for an already-open chest or door means the
prompt logic and the "can I still use this" logic can never disagree.

**Doors live in wall cells.** The door entity is invisible; the *wall tile* is
its appearance, and opening it clears the tile:

```ts
setOpen(world, open) {
  if (this.open === open) return;
  this.open = open;
  world.map.setWall(this.cellX, this.cellY, open ? 0 : this.wallId);
  world.playSound(open ? 'door_open' : 'door_close', this.pos.x, this.pos.y);
}
```

Because the raycaster reads the wall grid every frame, the door opens for
rendering, collision, line of sight and pathing in one assignment. No separate
door geometry, no special case in the DDA loop.

**Track "unlocked" separately from "open".** This is a real bug worth naming: if
`isLocked` is derived as `keyId !== null && !open`, then a lever or a script
that closes the door re-locks it, and the player's key is consumed for nothing.
Unlocking is permanent; opening is not.

```ts
get isLocked() { return this.keyId !== null && !this.unlocked; }
```

**Levers** address doors by tag rather than by reference, so a level file can
wire them up by name and one lever can drive several doors. Have levers skip
still-locked doors — a remote switch that bypasses a key defeats the key.

---

## 6. "What am I looking at?"

Two complementary checks, refreshed each tick:

1. **The centre raycast column** already tells you the wall cell you are facing
   and its distance. That is the door check — free, because the renderer cast
   that ray anyway.
2. **The front grid cell** (`cell + FACING_D*`) catches props standing in open
   floor, which no wall ray will ever hit.

```ts
const front = player.frontCell();
const centre = raycaster.columns >> 1;
for (const e of entities) {
  if (!(e instanceof Interactable) || e.removed) continue;
  const inFront = e.cellX === front.x && e.cellY === front.y;
  const rayHit = e instanceof Door && raycaster.perpDist[centre] <= INTERACT_RANGE
              && e.cellX === raycaster.mapX[centre] && e.cellY === raycaster.mapY[centre];
  if (inFront || rayHit) { best = e; if (e instanceof Door) break; }
}
```

Skip the check while a move or turn tween is running: mid-step the player is
between cells and the answer flickers, which makes the prompt strobe.

Store the focus and its prompt on the game object so the HUD can render `[F]
Open chest` without repeating the search. The prompt appearing at all is the
game's affordance system — if it isn't shown, players won't discover that
interaction exists.

---

## 7. Inventory

A flat stack list is enough, with keys distinguished by id:

```ts
add(kind: ItemKind, amount = 1, keyId?: string) {
  const existing = this.items.find(s => s.kind === kind && s.keyId === keyId);
  if (existing) existing.amount += amount;
  else this.items.push(keyId !== undefined ? { kind, amount, keyId } : { kind, amount });
}
```

Keep equipment as data (`{ name, damage, staminaCost, range }`) rather than
subclasses. The HUD then renders any weapon or spell without knowing what it is,
and adding a second weapon is a constant rather than a new class plus a switch.
