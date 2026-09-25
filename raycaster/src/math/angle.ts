/** Angle helpers. All angles are radians. The world is y-down, so angles increase clockwise on screen. */

export const PI = Math.PI;
export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI * 0.5;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Wrap an angle into [0, 2π). */
export function normalizeAngle(a: number): number {
  a %= TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Wrap an angle into [-π, π). */
export function wrapAngle(a: number): number {
  a = normalizeAngle(a);
  return a >= PI ? a - TWO_PI : a;
}

/** Shortest signed difference `b - a` in [-π, π). */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Interpolate along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  return normalizeAngle(a + angleDiff(a, b) * t);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Positive modulo for integer indices (JavaScript `%` keeps the sign of the dividend). */
export function wrapIndex(i: number, n: number): number {
  const m = i % n;
  return m < 0 ? m + n : m;
}

/**
 * Quantise a relative angle into one of `steps` discrete view directions.
 * Direction 0 is centred on angle 0; each step spans 2π/steps.
 */
export function angleToStep(angle: number, steps: number): number {
  const stepSize = TWO_PI / steps;
  return wrapIndex(Math.round(normalizeAngle(angle) / stepSize), steps);
}
