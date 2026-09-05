import { Entity, type WorldContext } from './Entity';
import { moveWithCollision, hasLineOfSight } from '../world/Collision';
import { angleDiff, normalizeAngle } from '../math/angle';

export type EnemyState = 'idle' | 'chase' | 'attack' | 'hurt' | 'dead';

export interface EnemySpec {
  type: string;
  sheet: string;
  health: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackWindup: number;
  attackCooldown: number;
  sightRange: number;
  /** Half field-of-view in radians for noticing the player. */
  sightHalfFov: number;
  radius: number;
  scale: number;
  sounds: { alert: string; attack: string; hurt: string; die: string };
  voiceOnAlert?: string;
}

export const GRUNT: EnemySpec = {
  type: 'grunt',
  sheet: 'grunt',
  health: 60,
  speed: 0.9,
  damage: 12,
  attackRange: 1.2,
  attackWindup: 0.45,
  attackCooldown: 1.1,
  sightRange: 12,
  sightHalfFov: Math.PI * 0.6,
  radius: 0.3,
  scale: 1,
  sounds: { alert: 'enemy_alert', attack: 'enemy_attack', hurt: 'enemy_hurt', die: 'enemy_die' },
  voiceOnAlert: 'enemy_taunt',
};

export const BRUTE: EnemySpec = {
  type: 'brute',
  sheet: 'brute',
  health: 140,
  speed: 0.6,
  damage: 25,
  attackRange: 1.4,
  attackWindup: 0.7,
  attackCooldown: 1.6,
  sightRange: 10,
  sightHalfFov: Math.PI * 0.5,
  radius: 0.36,
  scale: 1.25,
  sounds: { alert: 'enemy_alert', attack: 'enemy_attack', hurt: 'enemy_hurt', die: 'enemy_die' },
};

/**
 * Finite-state-machine enemy: waits until it sees the player, chases with
 * wall sliding and separation from other enemies, attacks in melee range with
 * a wind-up, and leaves a corpse when killed.
 */
export class Enemy extends Entity {
  override readonly type: string;
  readonly spec: EnemySpec;
  state: EnemyState = 'idle';
  private stateTime = 0;
  private cooldown = 0;
  private lastKnownX = 0;
  private lastKnownY = 0;
  private hasTarget = false;
  private losTimer = 0;
  private losCached = false;

  constructor(spec: EnemySpec) {
    super();
    this.spec = spec;
    this.type = spec.type;
    this.sheet = spec.sheet;
    this.health = spec.health;
    this.maxHealth = spec.health;
    this.radius = spec.radius;
    this.scale = spec.scale;
    this.targetable = true;
    this.solid = true;
    // Stagger LOS checks so many enemies don't all trace on the same tick.
    this.losTimer = Math.random() * 0.15;
  }

  private setState(next: EnemyState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateTime = 0;
    switch (next) {
      case 'idle': this.setAnimation('idle'); break;
      case 'chase': this.setAnimation('walk'); break;
      case 'attack': this.setAnimation('attack', true); break;
      case 'hurt': this.setAnimation('hurt', true); break;
      case 'dead': this.setAnimation('die', true); break;
      default: break;
    }
  }

  private canSee(world: WorldContext, dt: number): boolean {
    this.losTimer -= dt;
    if (this.losTimer > 0) return this.losCached;
    this.losTimer = 0.15;
    const p = world.player.pos;
    const dx = p.x - this.pos.x;
    const dy = p.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.spec.sightRange) {
      this.losCached = false;
      return false;
    }
    if (this.state === 'idle') {
      const toPlayer = Math.atan2(dy, dx);
      if (Math.abs(angleDiff(this.angle, toPlayer)) > this.spec.sightHalfFov) {
        this.losCached = false;
        return false;
      }
    }
    this.losCached = hasLineOfSight(world.map, this.pos.x, this.pos.y, p.x, p.y);
    return this.losCached;
  }

  override update(dt: number, world: WorldContext): void {
    this.tickAnimation(dt);
    this.stateTime += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.state === 'dead') {
      this.solid = false;
      this.targetable = false;
      return;
    }

    const player = world.player;
    const dx = player.pos.x - this.pos.x;
    const dy = player.pos.y - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sees = player.isAlive() && this.canSee(world, dt);
    if (sees) {
      this.lastKnownX = player.pos.x;
      this.lastKnownY = player.pos.y;
      this.hasTarget = true;
    }

    switch (this.state) {
      case 'idle':
        if (sees) {
          world.playSound(this.spec.sounds.alert, this.pos.x, this.pos.y);
          if (this.spec.voiceOnAlert) world.speak(this.spec.voiceOnAlert);
          this.setState('chase');
        }
        break;

      case 'chase': {
        if (!player.isAlive()) {
          this.setState('idle');
          break;
        }
        if (sees && dist <= this.spec.attackRange && this.cooldown <= 0) {
          this.angle = Math.atan2(dy, dx);
          world.playSound(this.spec.sounds.attack, this.pos.x, this.pos.y);
          this.setState('attack');
          break;
        }
        if (!this.hasTarget) {
          this.setState('idle');
          break;
        }
        const tx = this.lastKnownX - this.pos.x;
        const ty = this.lastKnownY - this.pos.y;
        const tdist = Math.sqrt(tx * tx + ty * ty);
        if (tdist < 0.2 && !sees) {
          this.hasTarget = false;
          this.setState('idle');
          break;
        }
        let mx = tx / (tdist || 1);
        let my = ty / (tdist || 1);
        // Separation from other solid entities.
        const ents = world.entities;
        for (let i = 0; i < ents.length; i++) {
          const o = ents[i]!;
          if (o === this || !o.solid) continue;
          const ox = this.pos.x - o.pos.x;
          const oy = this.pos.y - o.pos.y;
          const d2 = ox * ox + oy * oy;
          const minD = this.radius + o.radius + 0.1;
          if (d2 < minD * minD && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (minD - d) / minD;
            mx += (ox / d) * push * 1.5;
            my += (oy / d) * push * 1.5;
          }
        }
        // Do not walk into the player.
        const stopDist = this.radius + player.radius + 0.15;
        if (sees && dist <= stopDist) {
          mx = 0;
          my = 0;
        }
        const len = Math.sqrt(mx * mx + my * my);
        if (len > 1e-4) {
          mx /= len;
          my /= len;
          this.angle = normalizeAngle(Math.atan2(my, mx));
          moveWithCollision(world.map, this.pos, mx * this.spec.speed * dt, my * this.spec.speed * dt, this.radius);
        }
        break;
      }

      case 'attack':
        if (this.stateTime >= this.spec.attackWindup && this.cooldown <= 0) {
          this.cooldown = this.spec.attackCooldown;
          if (dist <= this.spec.attackRange + 0.2 && hasLineOfSight(world.map, this.pos.x, this.pos.y, player.pos.x, player.pos.y)) {
            player.takeDamage(this.spec.damage, this.pos.x, this.pos.y);
            world.playSound('player_hurt', player.pos.x, player.pos.y);
          }
        }
        if (this.stateTime >= this.spec.attackWindup + 0.25) this.setState('chase');
        break;

      case 'hurt':
        if (this.stateTime >= 0.3) this.setState('chase');
        break;

      default:
        break;
    }
  }

  override takeDamage(amount: number, fromX: number, fromY: number, world?: WorldContext): boolean {
    if (!this.targetable || this.state === 'dead') return false;
    this.health -= amount;
    this.hasTarget = true;
    this.lastKnownX = fromX;
    this.lastKnownY = fromY;
    this.angle = Math.atan2(fromY - this.pos.y, fromX - this.pos.x);
    if (this.health <= 0) {
      this.health = 0;
      this.setState('dead');
      this.solid = false;
      this.targetable = false;
      world?.playSound(this.spec.sounds.die, this.pos.x, this.pos.y);
      return true;
    }
    world?.playSound(this.spec.sounds.hurt, this.pos.x, this.pos.y);
    this.setState('hurt');
    return false;
  }
}
