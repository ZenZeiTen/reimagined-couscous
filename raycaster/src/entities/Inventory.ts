/** Item kinds an adventurer can carry. */
export type ItemKind = 'potion' | 'ether' | 'key' | 'gold';

export interface ItemStack {
  kind: ItemKind;
  amount: number;
  /** For keys: which lock they open. */
  keyId?: string;
}

export interface Equipment {
  weapon: { name: string; damage: number; staminaCost: number; range: number };
  spell: { name: string; damage: number; manaCost: number; range: number };
}

export const IRON_SWORD: Equipment['weapon'] = { name: 'Iron Sword', damage: 30, staminaCost: 30, range: 1.4 };
export const FIRE_BOLT: Equipment['spell'] = { name: 'Fire Bolt', damage: 45, manaCost: 20, range: 8 };

/** Simple stackable inventory with key lookup and equipment slots. */
export class Inventory {
  readonly items: ItemStack[] = [];
  equipment: Equipment = { weapon: IRON_SWORD, spell: FIRE_BOLT };

  add(kind: ItemKind, amount = 1, keyId?: string): void {
    const existing = this.items.find((s) => s.kind === kind && s.keyId === keyId);
    if (existing) existing.amount += amount;
    else {
      const stack: ItemStack = { kind, amount };
      if (keyId !== undefined) stack.keyId = keyId;
      this.items.push(stack);
    }
  }

  count(kind: ItemKind, keyId?: string): number {
    let n = 0;
    for (const s of this.items) if (s.kind === kind && (keyId === undefined || s.keyId === keyId)) n += s.amount;
    return n;
  }

  hasKey(keyId: string): boolean {
    return this.count('key', keyId) > 0;
  }

  /** Remove up to `amount`; returns how many were removed. */
  remove(kind: ItemKind, amount = 1, keyId?: string): number {
    const idx = this.items.findIndex((s) => s.kind === kind && (keyId === undefined || s.keyId === keyId));
    if (idx < 0) return 0;
    const stack = this.items[idx]!;
    const taken = Math.min(amount, stack.amount);
    stack.amount -= taken;
    if (stack.amount <= 0) this.items.splice(idx, 1);
    return taken;
  }

  keys(): string[] {
    return this.items.filter((s) => s.kind === 'key' && s.keyId).map((s) => s.keyId!);
  }
}
