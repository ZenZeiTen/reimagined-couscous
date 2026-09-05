import { Vec2 } from '../math/Vec2';
import { HALF_PI, TWO_PI, clamp, lerpAngle, normalizeAngle } from '../math/angle';
import type { Input } from '../core/Input';
import type { GameMap } from '../world/GameMap';
import { Inventory } from './Inventory';

/** Cardinal facing: 0 = +x (east), 1 = +y (south), 2 = -x (west), 3 = -y (north). */
export type Facing = 0 | 1 | 2 | 3;
export const FACING_DX = [1, 0, -1, 0] as const;
export const FACING_DY = [0, 1, 0, -1] as const;
export const FACING_NAMES = ['E', 'S', 'W', 'N'] as const;

export type PlayerAction = 'idle' | 'move' | 'turn' | 'attack' | 'cast' | 'stagger';

export interface GridPlayerConfig {
  /** Seconds for a one-tile step. */
  moveDuration: number;
  /** Seconds for a 90° turn. */
  turnDuration: number;
  /** Seconds a sword swing occupies the player. */
  attackDuration: number;
  castDuration: number;
  maxHealth: number;
  maxMana: number;
  maxStamina: number;
  moveStaminaCost: number;
  turnStaminaCost: number;
  /** Stamina per second while idle. */
  staminaRegen: number;
  /** Mana per second. */
  manaRegen: number;
  /** Extra delay after any action before the next is accepted. */
  actionDelay: number;
  radius: number;
  mouseLookY: boolean;
}

export const DEFAULT_GRID_CONFIG: GridPlayerConfig = {
  moveDuration: 0.34,
  turnDuration: 0.24,
  attackDuration: 0.42,
  castDuration: 0.5,
  maxHealth: 100,
  maxMana: 60,
  maxStamina: 100,
  moveStaminaCost: 10,
  turnStaminaCost: 0,
  staminaRegen: 26,
  manaRegen: 1.5,
  actionDelay: 0.08,
  radius: 0.3,
  mouseLookY: true,
};

/** Something that can block a grid step (the entity manager). */
export interface StepBlocker {
  blocksCircle(x: number, y: number, radius: number): boolean;
}

/**
 * Tile-locked dungeon-crawler controller. The player always sits at the
 * centre of a grid cell facing one of four directions; moves are one-tile
 * tweens and turns are 90° tweens. A stamina meter gates how often actions
 * can be taken, and the camera reads `pos`/`angle` as usual.
 */
export class Player {
  readonly pos = new Vec2();
  readonly prevPos = new Vec2();
  angle = 0;
  prevAngle = 0;
  pitch = 0;
  radius: number;
  cellX = 0;
  cellY = 0;
  facing: Facing = 0;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  readonly inventory = new Inventory();
  readonly config: GridPlayerConfig;
  action: PlayerAction = 'idle';
  /** Progress of the current action in [0,1]. */
  actionProgress = 0;
  hurtFlash = 0;
  bobOffset = 0;
  /** True once stamina hit zero, until it recovers past `exhaustedRecovery`. */
  exhausted = false;
  exhaustedRecovery = 30;
  private actionTime = 0;
  private actionDuration = 0;
  private delayLeft = 0;
  private readonly moveFrom = new Vec2();
  private readonly moveTo = new Vec2();
  private turnFrom = 0;
  private turnTo = 0;
  private blockedCooldown = 0;
  onFootstep: (() => void) | null = null;
  onBlocked: (() => void) | null = null;
  /** Called when a swing/cast reaches its impact point. */
  onAttackImpact: ((kind: 'attack' | 'cast') => void) | null = null;
  private impactFired = false;

  constructor(config: Partial<GridPlayerConfig> = {}) {
    this.config = { ...DEFAULT_GRID_CONFIG, ...config };
    this.radius = this.config.radius;
    this.maxHealth = this.config.maxHealth;
    this.maxMana = this.config.maxMana;
    this.maxStamina = this.config.maxStamina;
    this.health = this.maxHealth;
    this.mana = this.maxMana;
    this.stamina = this.maxStamina;
  }

  isAlive(): boolean {
    return this.health > 0;
  }

  get isBusy(): boolean {
    return this.action !== 'idle' || this.delayLeft > 0;
  }

  get facingName(): string {
    return FACING_NAMES[this.facing];
  }

  /** Grid cell directly ahead. */
  frontCell(out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    out.x = this.cellX + FACING_DX[this.facing];
    out.y = this.cellY + FACING_DY[this.facing];
    return out;
  }

  spawn(x: number, y: number, angle: number): void {
    this.cellX = Math.floor(x);
    this.cellY = Math.floor(y);
    this.facing = (Math.round(normalizeAngle(angle) / HALF_PI) % 4) as Facing;
    this.pos.set(this.cellX + 0.5, this.cellY + 0.5);
    this.prevPos.copy(this.pos);
    this.angle = this.facing * HALF_PI;
    this.prevAngle = this.angle;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.mana = this.maxMana;
    this.stamina = this.maxStamina;
    this.action = 'idle';
    this.delayLeft = 0;
    this.hurtFlash = 0;
    this.bobOffset = 0;
    this.exhausted = false;
    this.inventory.items.length = 0;
  }

  takeDamage(amount: number, _fromX: number, _fromY: number): void {
    if (!this.isAlive()) return;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.4;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  restoreMana(amount: number): number {
    const before = this.mana;
    this.mana = Math.min(this.maxMana, this.mana + amount);
    return this.mana - before;
  }

  private spendStamina(cost: number): boolean {
    if (cost <= 0) return true;
    if (this.exhausted || this.stamina < cost) return false;
    this.stamina -= cost;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.exhausted = true;
    }
    return true;
  }

  private begin(action: PlayerAction, duration: number): void {
    this.action = action;
    this.actionTime = 0;
    this.actionDuration = duration;
    this.actionProgress = 0;
    this.impactFired = false;
  }

  /** Attempt a one-tile step; `dir` is relative to facing (0 = ahead, 1 = right, 2 = back, 3 = left). */
  tryStep(relDir: 0 | 1 | 2 | 3, map: GameMap, blockers: StepBlocker | null): boolean {
    if (this.isBusy) return false;
    const f = ((this.facing + relDir) % 4) as Facing;
    const tx = this.cellX + FACING_DX[f];
    const ty = this.cellY + FACING_DY[f];
    if (map.isSolid(tx, ty) || (blockers && blockers.blocksCircle(tx + 0.5, ty + 0.5, this.radius))) {
      if (this.blockedCooldown <= 0) {
        this.blockedCooldown = 0.3;
        this.onBlocked?.();
      }
      return false;
    }
    if (!this.spendStamina(this.config.moveStaminaCost)) return false;
    this.moveFrom.copy(this.pos);
    this.moveTo.set(tx + 0.5, ty + 0.5);
    this.cellX = tx;
    this.cellY = ty;
    this.begin('move', this.config.moveDuration);
    return true;
  }

  /** Snap-turn 90°: +1 clockwise (right), -1 counter-clockwise (left). */
  tryTurn(dir: 1 | -1): boolean {
    if (this.isBusy) return false;
    if (!this.spendStamina(this.config.turnStaminaCost)) return false;
    this.turnFrom = this.angle;
    this.facing = ((((this.facing + dir) % 4) + 4) % 4) as Facing;
    this.turnTo = this.facing * HALF_PI;
    this.begin('turn', this.config.turnDuration);
    return true;
  }

  tryAttack(): boolean {
    if (this.isBusy) return false;
    if (!this.spendStamina(this.inventory.equipment.weapon.staminaCost)) return false;
    this.begin('attack', this.config.attackDuration);
    return true;
  }

  tryCast(): boolean {
    if (this.isBusy) return false;
    const cost = this.inventory.equipment.spell.manaCost;
    if (this.mana < cost) return false;
    this.mana -= cost;
    this.begin('cast', this.config.castDuration);
    return true;
  }

  /** Drink a potion or ether if carried. Returns what was used, or null. */
  useItem(): 'potion' | 'ether' | null {
    if (this.inventory.count('potion') > 0 && this.health < this.maxHealth) {
      this.inventory.remove('potion');
      this.heal(40);
      return 'potion';
    }
    if (this.inventory.count('ether') > 0 && this.mana < this.maxMana) {
      this.inventory.remove('ether');
      this.restoreMana(30);
      return 'ether';
    }
    return null;
  }

  /** Read input and advance tweens. `blockers` may be null in tests. */
  update(dt: number, input: Input, map: GameMap, blockers: StepBlocker | null, viewHeight: number): void {
    this.prevPos.copy(this.pos);
    this.prevAngle = this.angle;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.blockedCooldown > 0) this.blockedCooldown -= dt;
    if (this.delayLeft > 0) this.delayLeft -= dt;

    // Meters.
    if (this.action === 'idle') this.stamina = Math.min(this.maxStamina, this.stamina + this.config.staminaRegen * dt);
    if (this.exhausted && this.stamina >= this.exhaustedRecovery) this.exhausted = false;
    this.mana = Math.min(this.maxMana, this.mana + this.config.manaRegen * dt);

    if (!this.isAlive()) {
      this.action = 'idle';
      this.bobOffset *= 0.9;
      return;
    }

    if (this.config.mouseLookY) {
      this.pitch = clamp(this.pitch - input.mouseDeltaY * 0.6, -viewHeight * 0.35, viewHeight * 0.35);
    }

    // Advance the current action.
    if (this.action !== 'idle') {
      this.actionTime += dt;
      const t = Math.min(1, this.actionTime / this.actionDuration);
      this.actionProgress = t;
      const ease = t * t * (3 - 2 * t);
      switch (this.action) {
        case 'move':
          this.pos.set(this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * ease, this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * ease);
          this.bobOffset = Math.sin(t * Math.PI) * viewHeight * 0.02;
          if (!this.impactFired && t >= 0.5) {
            this.impactFired = true;
            this.onFootstep?.();
          }
          break;
        case 'turn':
          this.angle = lerpAngle(this.turnFrom, this.turnTo, ease);
          break;
        case 'attack':
        case 'cast':
          if (!this.impactFired && t >= 0.45) {
            this.impactFired = true;
            this.onAttackImpact?.(this.action);
          }
          break;
        default:
          break;
      }
      if (t >= 1) {
        if (this.action === 'move') this.pos.copy(this.moveTo);
        if (this.action === 'turn') this.angle = normalizeAngle(this.turnTo);
        this.action = 'idle';
        this.bobOffset = 0;
        this.delayLeft = this.config.actionDelay;
      }
      return;
    }

    // Accept a new command.
    if (input.isAction('forward')) this.tryStep(0, map, blockers);
    else if (input.isAction('backward')) this.tryStep(2, map, blockers);
    else if (input.isAction('strafeLeft')) this.tryStep(3, map, blockers);
    else if (input.isAction('strafeRight')) this.tryStep(1, map, blockers);
    else if (input.isAction('turnLeft')) this.tryTurn(-1);
    else if (input.isAction('turnRight')) this.tryTurn(1);
  }

  /** Angle of the facing direction (exact, not the tweened camera angle). */
  facingAngle(): number {
    return normalizeAngle(this.facing * HALF_PI) % TWO_PI;
  }
}
