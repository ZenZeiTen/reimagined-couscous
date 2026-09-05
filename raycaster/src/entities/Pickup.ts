import { Entity, type WorldContext } from './Entity';

export type PickupKind = 'ammo' | 'health';

export interface PickupHandler {
  /** Return true if the pickup was consumed. */
  collect(kind: PickupKind, amount: number): boolean;
}

/** Floor item collected when the player walks over it. */
export class Pickup extends Entity {
  override readonly type: string;
  readonly kind: PickupKind;
  readonly amount: number;
  private readonly handler: PickupHandler;

  constructor(kind: PickupKind, amount: number, handler: PickupHandler) {
    super();
    this.kind = kind;
    this.amount = amount;
    this.type = `pickup_${kind}`;
    this.sheet = kind === 'ammo' ? 'pickup_ammo' : 'pickup_health';
    this.handler = handler;
    this.solid = false;
    this.targetable = false;
    this.radius = 0.25;
    this.zOffset = 0.05;
  }

  override update(dt: number, world: WorldContext): void {
    this.tickAnimation(dt);
    if (this.removed) return;
    const p = world.player;
    if (!p.isAlive()) return;
    const r = this.radius + p.radius;
    if (this.pos.distanceSqTo(p.pos) <= r * r) {
      if (this.handler.collect(this.kind, this.amount)) {
        world.playSound(this.kind === 'ammo' ? 'pickup_ammo' : 'pickup_health', this.pos.x, this.pos.y);
        this.removed = true;
      }
    }
  }
}

/** Static scenery billboard (pillars, lamps). */
export class Decoration extends Entity {
  override readonly type = 'decoration';

  constructor(sheet: string, solid = true, radius = 0.25) {
    super();
    this.sheet = sheet;
    this.solid = solid;
    this.radius = radius;
    this.targetable = false;
  }

  override update(dt: number): void {
    this.tickAnimation(dt);
  }
}
