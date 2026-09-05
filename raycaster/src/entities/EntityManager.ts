import type { Entity, WorldContext } from './Entity';
import type { Billboard } from '../renderer/Sprite';

export type EntityFactory = (x: number, y: number, angle: number) => Entity;

/**
 * Owns all non-player entities. Removal is deferred to the end of the update
 * pass so entities can safely remove themselves or others while iterating.
 */
export class EntityManager {
  private readonly list: Entity[] = [];
  private readonly factories = new Map<string, EntityFactory>();
  private readonly billboardList: Billboard[] = [];

  get entities(): readonly Entity[] {
    return this.list;
  }

  get count(): number {
    return this.list.length;
  }

  registerFactory(type: string, factory: EntityFactory): void {
    this.factories.set(type, factory);
  }

  hasFactory(type: string): boolean {
    return this.factories.has(type);
  }

  spawn(type: string, x: number, y: number, angle = 0): Entity {
    const factory = this.factories.get(type);
    if (!factory) throw new Error(`No entity factory registered for '${type}'`);
    const e = factory(x, y, angle);
    e.pos.set(x, y);
    e.angle = angle;
    this.add(e);
    return e;
  }

  add(e: Entity): void {
    this.list.push(e);
  }

  remove(e: Entity): void {
    e.removed = true;
  }

  clear(): void {
    this.list.length = 0;
    this.billboardList.length = 0;
  }

  update(dt: number, world: WorldContext): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.removed) e.update(dt, world);
    }
    // Compact in place (no allocation).
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.removed) list[write++] = e;
    }
    list.length = write;
  }

  /** Billboard view of all entities, reusing the same array each frame. */
  billboards(): readonly Billboard[] {
    const out = this.billboardList;
    out.length = this.list.length;
    for (let i = 0; i < this.list.length; i++) out[i] = this.list[i]!;
    return out;
  }

  /** Find entities within `radius` of a point, filtered by predicate. */
  forEachNear(x: number, y: number, radius: number, fn: (e: Entity) => void): void {
    const r2 = radius * radius;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i]!;
      const dx = e.pos.x - x;
      const dy = e.pos.y - y;
      if (dx * dx + dy * dy <= r2) fn(e);
    }
  }

  /** Does a circle at (x,y) overlap any solid entity (excluding `ignore`)? */
  blocksCircle(x: number, y: number, radius: number, ignore: Entity | null = null): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i]!;
      if (e === ignore || !e.solid) continue;
      const dx = e.pos.x - x;
      const dy = e.pos.y - y;
      const r = e.radius + radius;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
}
