import { Vec2 } from '../math/Vec2';
import type { Billboard } from '../renderer/Sprite';
import type { GameMap } from '../world/GameMap';

/** Services the world exposes to entities during `update`. Keeps entities decoupled from the game shell. */
export interface WorldContext {
  map: GameMap;
  player: { pos: Vec2; angle: number; radius: number; isAlive(): boolean; takeDamage(amount: number, fromX: number, fromY: number): void };
  /** All live entities, for separation and targeting. */
  entities: readonly Entity[];
  /** Fire-and-forget positional sound. */
  playSound(name: string, x?: number, y?: number): void;
  /** Queue a voice line by id. */
  speak(lineId: string): void;
  /** HUD message. */
  message(text: string): void;
  /** Seconds since level start. */
  time: number;
}

let nextId = 1;

/** Base class for everything that lives in the map and is drawn as a billboard. */
export abstract class Entity implements Billboard {
  readonly id = nextId++;
  abstract readonly type: string;
  readonly pos = new Vec2();
  angle = 0;
  /** Collision radius in tiles. */
  radius = 0.3;
  /** Blocks other movers. */
  solid = true;
  /** Can be damaged. */
  targetable = false;
  health = 1;
  maxHealth = 1;
  sheet = '';
  animation = 'idle';
  animTime = 0;
  scale = 1;
  zOffset = 0;
  visible = true;
  brightness = 1;
  /** Marked for removal at the end of the update pass. */
  removed = false;

  get x(): number {
    return this.pos.x;
  }

  get y(): number {
    return this.pos.y;
  }

  isAlive(): boolean {
    return this.health > 0;
  }

  setAnimation(name: string, restart = false): void {
    if (this.animation !== name || restart) {
      this.animation = name;
      this.animTime = 0;
    }
  }

  /** Advance the animation clock; subclasses call this from `update`. */
  protected tickAnimation(dt: number): void {
    this.animTime += dt;
  }

  abstract update(dt: number, world: WorldContext): void;

  /** Apply damage from a world position; returns true if this killed the entity. */
  takeDamage(amount: number, _fromX: number, _fromY: number, _world?: WorldContext): boolean {
    if (!this.targetable || !this.isAlive()) return false;
    this.health -= amount;
    return this.health <= 0;
  }
}

/** Reset the id counter (tests). */
export function resetEntityIds(): void {
  nextId = 1;
}
