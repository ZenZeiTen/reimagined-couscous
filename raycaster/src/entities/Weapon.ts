export interface WeaponSpec {
  name: string;
  damage: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Max hit distance in tiles. */
  range: number;
  /** Half-angle of the hit cone in radians; hits are tested against target radius too. */
  spread: number;
  magazine: number;
  reloadTime: number;
  /** Sound ids (resolved by the AudioManager). */
  fireSound: string;
  emptySound: string;
  reloadSound: string;
}

export const PISTOL: WeaponSpec = {
  name: 'Pistol',
  damage: 34,
  cooldown: 0.28,
  range: 24,
  spread: 0.035,
  magazine: 12,
  reloadTime: 1.1,
  fireSound: 'pistol_fire',
  emptySound: 'pistol_empty',
  reloadSound: 'pistol_reload',
};

/** Ammunition and timing state for a hitscan weapon. */
export class Weapon {
  readonly spec: WeaponSpec;
  inMagazine: number;
  reserve: number;
  private cooldownLeft = 0;
  private reloadLeft = 0;
  /** Seconds remaining of the muzzle-flash effect. */
  flashLeft = 0;

  constructor(spec: WeaponSpec, reserve = 36) {
    this.spec = spec;
    this.inMagazine = spec.magazine;
    this.reserve = reserve;
  }

  get isReloading(): boolean {
    return this.reloadLeft > 0;
  }

  get canFire(): boolean {
    return this.cooldownLeft <= 0 && this.reloadLeft <= 0 && this.inMagazine > 0;
  }

  get totalAmmo(): number {
    return this.inMagazine + this.reserve;
  }

  update(dt: number): void {
    if (this.cooldownLeft > 0) this.cooldownLeft -= dt;
    if (this.flashLeft > 0) this.flashLeft -= dt;
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const needed = this.spec.magazine - this.inMagazine;
        const taken = Math.min(needed, this.reserve);
        this.inMagazine += taken;
        this.reserve -= taken;
      }
    }
  }

  /** Attempt to fire. Returns 'fired', 'empty' or 'busy'. */
  fire(): 'fired' | 'empty' | 'busy' {
    if (this.cooldownLeft > 0 || this.reloadLeft > 0) return 'busy';
    if (this.inMagazine <= 0) {
      this.cooldownLeft = 0.2;
      return 'empty';
    }
    this.inMagazine--;
    this.cooldownLeft = this.spec.cooldown;
    this.flashLeft = 0.07;
    return 'fired';
  }

  /** Start a reload if it makes sense. Returns true if a reload began. */
  reload(): boolean {
    if (this.reloadLeft > 0 || this.inMagazine >= this.spec.magazine || this.reserve <= 0) return false;
    this.reloadLeft = this.spec.reloadTime;
    return true;
  }

  addAmmo(amount: number, maxReserve = 99): number {
    const before = this.reserve;
    this.reserve = Math.min(maxReserve, this.reserve + amount);
    return this.reserve - before;
  }
}
