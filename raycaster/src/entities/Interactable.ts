import { Entity, type WorldContext } from './Entity';
import type { Inventory } from './Inventory';

/** The part of the player interactables need. */
export interface Adventurer {
  inventory: Inventory;
  heal(amount: number): number;
  restoreMana(amount: number): number;
}

export interface InteractResult {
  ok: boolean;
  message: string;
}

/** Entities the player can use with the interact key when standing in front of them. */
export abstract class Interactable extends Entity {
  /** Cell this interactable occupies (integer). */
  get cellX(): number {
    return Math.floor(this.pos.x);
  }

  get cellY(): number {
    return Math.floor(this.pos.y);
  }

  /** Prompt shown when the player faces it; null hides the prompt. */
  abstract prompt(who: Adventurer): string | null;
  abstract interact(world: WorldContext, who: Adventurer): InteractResult;

  override update(dt: number): void {
    this.tickAnimation(dt);
  }
}

export interface ChestContents {
  kind: 'potion' | 'ether' | 'key' | 'gold';
  amount: number;
  keyId?: string;
}

export class Chest extends Interactable {
  override readonly type = 'chest';
  opened = false;
  readonly contents: ChestContents;

  constructor(contents: ChestContents) {
    super();
    this.contents = contents;
    this.sheet = 'chest';
    this.animation = 'closed';
    this.solid = true;
    this.radius = 0.3;
  }

  override prompt(_who: Adventurer): string | null {
    return this.opened ? null : 'Open chest';
  }

  override interact(world: WorldContext, who: Adventurer): InteractResult {
    if (this.opened) return { ok: false, message: 'The chest is empty.' };
    this.opened = true;
    this.setAnimation('open', true);
    const c = this.contents;
    who.inventory.add(c.kind, c.amount, c.keyId);
    world.playSound('chest_open', this.pos.x, this.pos.y);
    const label = c.kind === 'key' ? `${c.keyId ?? 'a'} key` : c.kind === 'gold' ? `${c.amount} gold` : `${c.amount} ${c.kind}${c.amount > 1 ? 's' : ''}`;
    return { ok: true, message: `Found ${label}.` };
  }
}

/** A door occupying a wall cell. Opening clears the wall tile. */
export class Door extends Interactable {
  override readonly type = 'door';
  open = false;
  /** Set once the matching key has been used; the door never re-locks. */
  unlocked = false;
  readonly keyId: string | null;
  /** Tag levers reference. */
  readonly tag: string;
  private readonly wallId: number;

  constructor(wallId: number, keyId: string | null = null, tag = '') {
    super();
    this.wallId = wallId;
    this.keyId = keyId;
    this.tag = tag;
    this.visible = false; // the wall texture is the door
    this.solid = false;
    this.radius = 0;
  }

  get isLocked(): boolean {
    return this.keyId !== null && !this.unlocked;
  }

  override prompt(who: Adventurer): string | null {
    if (this.open) return null;
    if (this.isLocked && !who.inventory.hasKey(this.keyId!)) return `Locked (${this.keyId} key)`;
    return 'Open door';
  }

  override interact(world: WorldContext, who: Adventurer): InteractResult {
    if (this.open) return { ok: false, message: '' };
    if (this.isLocked) {
      if (!who.inventory.hasKey(this.keyId!)) {
        world.playSound('door_locked', this.pos.x, this.pos.y);
        return { ok: false, message: `The door is locked. It needs the ${this.keyId} key.` };
      }
      this.unlocked = true;
      this.setOpen(world, true);
      return { ok: true, message: `Unlocked with the ${this.keyId} key.` };
    }
    this.setOpen(world, true);
    return { ok: true, message: 'The door grinds open.' };
  }

  setOpen(world: WorldContext, open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    world.map.setWall(this.cellX, this.cellY, open ? 0 : this.wallId);
    world.playSound(open ? 'door_open' : 'door_close', this.pos.x, this.pos.y);
  }
}

/** Wall lever that toggles every door sharing its tag. */
export class Lever extends Interactable {
  override readonly type = 'lever';
  on = false;
  readonly targetTag: string;

  constructor(targetTag: string) {
    super();
    this.targetTag = targetTag;
    this.sheet = 'lever';
    this.animation = 'off';
    this.solid = true;
    this.radius = 0.2;
  }

  override prompt(_who: Adventurer): string | null {
    return this.on ? 'Pull lever back' : 'Pull lever';
  }

  override interact(world: WorldContext, _who: Adventurer): InteractResult {
    this.on = !this.on;
    this.setAnimation(this.on ? 'on' : 'off', true);
    world.playSound('lever', this.pos.x, this.pos.y);
    let toggled = 0;
    for (const e of world.entities) {
      if (e instanceof Door && e.tag === this.targetTag && !e.isLocked) {
        e.setOpen(world, this.on);
        toggled++;
      }
    }
    return { ok: true, message: toggled > 0 ? 'Something rumbles in the distance.' : 'The lever clicks uselessly.' };
  }
}
