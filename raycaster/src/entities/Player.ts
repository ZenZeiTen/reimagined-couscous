import { Vec2 } from '../math/Vec2';
import { normalizeAngle, clamp } from '../math/angle';
import type { Input } from '../core/Input';
import type { GameMap } from '../world/GameMap';
import { moveWithCollision } from '../world/Collision';
import { Weapon, PISTOL } from './Weapon';

export interface PlayerConfig {
  moveSpeed: number;
  runMultiplier: number;
  turnSpeed: number;
  radius: number;
  maxHealth: number;
  /** Vertical mouse look enabled. */
  mouseLookY: boolean;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  moveSpeed: 3.2,
  runMultiplier: 1.7,
  turnSpeed: 2.4,
  radius: 0.22,
  maxHealth: 100,
  mouseLookY: true,
};

/** First-person player controller with grid collision, head bob and a weapon. */
export class Player {
  readonly pos = new Vec2();
  readonly prevPos = new Vec2();
  angle = 0;
  prevAngle = 0;
  /** Look pitch in screen pixels of the internal render target. */
  pitch = 0;
  radius: number;
  health: number;
  maxHealth: number;
  weapon = new Weapon(PISTOL);
  readonly config: PlayerConfig;
  /** Seconds remaining of the damage flash. */
  hurtFlash = 0;
  /** Head-bob phase (radians) and current bob offset in pixels. */
  bobPhase = 0;
  bobOffset = 0;
  private readonly moveDir = new Vec2();
  private readonly velocity = new Vec2();
  /** Distance walked this tick, used for footstep timing. */
  stepDistance = 0;
  private stepAccumulator = 0;
  onFootstep: (() => void) | null = null;

  constructor(config: Partial<PlayerConfig> = {}) {
    this.config = { ...DEFAULT_PLAYER_CONFIG, ...config };
    this.radius = this.config.radius;
    this.maxHealth = this.config.maxHealth;
    this.health = this.maxHealth;
  }

  isAlive(): boolean {
    return this.health > 0;
  }

  spawn(x: number, y: number, angle: number): void {
    this.pos.set(x, y);
    this.prevPos.set(x, y);
    this.angle = normalizeAngle(angle);
    this.prevAngle = this.angle;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.weapon = new Weapon(PISTOL);
    this.hurtFlash = 0;
  }

  takeDamage(amount: number, _fromX: number, _fromY: number): void {
    if (!this.isAlive()) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.35;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  /** Read input and integrate movement against the map. */
  update(dt: number, input: Input, map: GameMap, viewHeight: number): void {
    this.prevPos.copy(this.pos);
    this.prevAngle = this.angle;
    this.weapon.update(dt);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (!this.isAlive()) {
      this.bobOffset = 0;
      return;
    }

    // Look.
    let turn = 0;
    if (input.isAction('turnLeft')) turn -= 1;
    if (input.isAction('turnRight')) turn += 1;
    this.angle = normalizeAngle(this.angle + turn * this.config.turnSpeed * dt + input.mouseDeltaX * input.sensitivity);
    if (this.config.mouseLookY) {
      // Pitch is stored in render pixels; scale mouse motion to roughly match horizontal feel.
      this.pitch = clamp(this.pitch - input.mouseDeltaY * 0.6, -viewHeight * 0.4, viewHeight * 0.4);
    }

    // Move.
    const md = this.moveDir.set(0, 0);
    if (input.isAction('forward')) md.x += 1;
    if (input.isAction('backward')) md.x -= 1;
    if (input.isAction('strafeRight')) md.y += 1;
    if (input.isAction('strafeLeft')) md.y -= 1;
    const moving = md.x !== 0 || md.y !== 0;
    if (moving) {
      md.normalize();
      const speed = this.config.moveSpeed * (input.isAction('run') ? this.config.runMultiplier : 1);
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      // Forward along dir, strafe along the perpendicular (plane direction).
      this.velocity.set((cos * md.x - sin * md.y) * speed, (sin * md.x + cos * md.y) * speed);
      const before = this.pos.clone();
      moveWithCollision(map, this.pos, this.velocity.x * dt, this.velocity.y * dt, this.radius);
      this.stepDistance = this.pos.distanceTo(before);
    } else {
      this.stepDistance = 0;
    }

    // Head bob and footsteps.
    if (this.stepDistance > 0) {
      this.bobPhase += this.stepDistance * 5.5;
      this.bobOffset = Math.sin(this.bobPhase) * viewHeight * 0.012;
      this.stepAccumulator += this.stepDistance;
      if (this.stepAccumulator >= 1.1) {
        this.stepAccumulator = 0;
        this.onFootstep?.();
      }
    } else {
      this.bobOffset *= 0.85;
      if (Math.abs(this.bobOffset) < 0.05) this.bobOffset = 0;
    }
  }
}
