import { Entity, type WorldContext } from './Entity';

/** Straight-flying spell bolt that damages the first targetable entity or dies on a wall. */
export class Projectile extends Entity {
  override readonly type = 'projectile';
  private readonly dx: number;
  private readonly dy: number;
  private readonly speed: number;
  private readonly damage: number;
  private travelled = 0;
  private readonly maxRange: number;

  constructor(angle: number, speed: number, damage: number, maxRange: number, sheet = 'spell_bolt') {
    super();
    this.dx = Math.cos(angle);
    this.dy = Math.sin(angle);
    this.speed = speed;
    this.damage = damage;
    this.maxRange = maxRange;
    this.sheet = sheet;
    this.solid = false;
    this.targetable = false;
    this.radius = 0.15;
    this.zOffset = 0.35;
    this.brightness = 1.6;
  }

  override update(dt: number, world: WorldContext): void {
    this.tickAnimation(dt);
    if (this.removed) return;
    const step = this.speed * dt;
    const nx = this.pos.x + this.dx * step;
    const ny = this.pos.y + this.dy * step;
    this.travelled += step;
    if (world.map.isSolidAt(nx, ny) || this.travelled >= this.maxRange) {
      world.playSound('spell_hit', this.pos.x, this.pos.y);
      this.removed = true;
      return;
    }
    this.pos.set(nx, ny);
    const ents = world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      if (!e.targetable || !e.isAlive()) continue;
      const r = e.radius + this.radius;
      if (e.pos.distanceSqTo(this.pos) <= r * r) {
        e.takeDamage(this.damage, this.pos.x - this.dx, this.pos.y - this.dy, world);
        world.playSound('spell_hit', this.pos.x, this.pos.y);
        this.removed = true;
        return;
      }
    }
  }
}
