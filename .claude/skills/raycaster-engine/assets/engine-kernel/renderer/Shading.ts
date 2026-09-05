export type ShadingMode = 'linear' | 'dungeon';

/**
 * Shared fog/darkness parameters for wall, floor and sprite passes. Factors
 * come from a lookup table so the per-pixel cost is one array read.
 *
 * - `linear`: brightness falls linearly to `minFactor` at `fogDistance`.
 * - `dungeon`: exponential falloff `exp(-density * d)` beyond `lightRadius`,
 *   clamped to `minFactor`; distant geometry sinks into near-total darkness.
 */
export class Shading {
  private _fogDistance: number;
  private _minFactor: number;
  private _sideFactor: number;
  private _mode: ShadingMode;
  private _density: number;
  private _lightRadius: number;
  /** Global brightness multiplier (torch flicker etc.), 0..1.5. */
  private _ambient = 1;
  private readonly table = new Int32Array(1024);
  private scale = 0;

  constructor(fogDistance = 14, minFactor = 0.08, sideFactor = 0.7, mode: ShadingMode = 'linear', density = 0.55, lightRadius = 0.75) {
    this._fogDistance = fogDistance;
    this._minFactor = minFactor;
    this._sideFactor = sideFactor;
    this._mode = mode;
    this._density = density;
    this._lightRadius = lightRadius;
    this.rebuild();
  }

  get fogDistance(): number { return this._fogDistance; }
  get minFactor(): number { return this._minFactor; }
  get sideFactor(): number { return this._sideFactor; }
  get mode(): ShadingMode { return this._mode; }
  get density(): number { return this._density; }
  get lightRadius(): number { return this._lightRadius; }
  get ambient(): number { return this._ambient; }

  configure(opts: Partial<{ fogDistance: number; minFactor: number; sideFactor: number; mode: ShadingMode; density: number; lightRadius: number; ambient: number }>): void {
    if (opts.fogDistance !== undefined) this._fogDistance = Math.max(0.1, opts.fogDistance);
    if (opts.minFactor !== undefined) this._minFactor = Math.min(1, Math.max(0, opts.minFactor));
    if (opts.sideFactor !== undefined) this._sideFactor = opts.sideFactor;
    if (opts.mode !== undefined) this._mode = opts.mode;
    if (opts.density !== undefined) this._density = Math.max(0, opts.density);
    if (opts.lightRadius !== undefined) this._lightRadius = Math.max(0, opts.lightRadius);
    if (opts.ambient !== undefined) this._ambient = Math.min(1.5, Math.max(0, opts.ambient));
    this.rebuild();
  }

  /** Continuous brightness (0..1) before ambient scaling; used to build the table. */
  brightnessAt(distance: number): number {
    let f: number;
    if (this._mode === 'linear') {
      f = 1 - distance / this._fogDistance;
    } else {
      const d = Math.max(0, distance - this._lightRadius);
      f = Math.exp(-this._density * d);
      if (distance >= this._fogDistance) f = 0;
    }
    if (f < this._minFactor) f = this._minFactor;
    if (f > 1) f = 1;
    return f;
  }

  private rebuild(): void {
    const n = this.table.length;
    this.scale = (n - 1) / this._fogDistance;
    for (let i = 0; i < n; i++) {
      const d = i / this.scale;
      this.table[i] = Math.round(this.brightnessAt(d) * this._ambient * 256);
    }
  }

  /** Fixed-point 8.8 brightness factor (0..384) for a given distance. */
  factorFor(distance: number): number {
    let i = (distance * this.scale) | 0;
    if (i < 0) i = 0;
    else if (i >= this.table.length) i = this.table.length - 1;
    return this.table[i]!;
  }
}
