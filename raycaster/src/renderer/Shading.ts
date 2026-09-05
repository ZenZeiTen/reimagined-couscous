/** Shared fog/shade parameters for wall, floor and sprite passes. */
export class Shading {
  /** Distance at which surfaces fade fully to `minFactor`. */
  fogDistance: number;
  /** Lowest brightness factor (0..1) at or beyond `fogDistance`. */
  minFactor: number;
  /** Extra darkening for y-facing wall sides for a classic look. */
  sideFactor: number;

  constructor(fogDistance = 14, minFactor = 0.08, sideFactor = 0.7) {
    this.fogDistance = fogDistance;
    this.minFactor = minFactor;
    this.sideFactor = sideFactor;
  }

  /** Fixed-point 8.8 brightness factor (0..256) for a given distance. */
  factorFor(distance: number): number {
    let f = 1 - distance / this.fogDistance;
    if (f < this.minFactor) f = this.minFactor;
    if (f > 1) f = 1;
    return (f * 256) | 0;
  }
}
