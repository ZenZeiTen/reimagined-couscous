import { describe, it, expect } from 'vitest';
import { Vec2, Mat2, normalizeAngle, wrapAngle, angleDiff, lerpAngle, angleToStep, wrapIndex, TWO_PI, PI } from '../src/math';

describe('angle helpers', () => {
  it('normalizes into [0, 2π)', () => {
    expect(normalizeAngle(-0.5)).toBeCloseTo(TWO_PI - 0.5);
    expect(normalizeAngle(TWO_PI * 3 + 1)).toBeCloseTo(1);
    expect(normalizeAngle(TWO_PI)).toBeCloseTo(0);
  });

  it('wraps into [-π, π)', () => {
    expect(wrapAngle(PI + 0.1)).toBeCloseTo(-PI + 0.1);
    expect(wrapAngle(-PI - 0.1)).toBeCloseTo(PI - 0.1);
  });

  it('computes shortest signed differences', () => {
    expect(angleDiff(0.1, TWO_PI - 0.1)).toBeCloseTo(-0.2);
    expect(angleDiff(TWO_PI - 0.1, 0.1)).toBeCloseTo(0.2);
    expect(lerpAngle(TWO_PI - 0.2, 0.2, 0.5)).toBeCloseTo(0);
  });

  it('quantizes angles into discrete steps with wrap-around', () => {
    expect(angleToStep(0, 8)).toBe(0);
    expect(angleToStep(PI / 2, 8)).toBe(2);
    expect(angleToStep(-PI / 4, 8)).toBe(7);
    expect(angleToStep(TWO_PI - 0.01, 8)).toBe(0);
    expect(wrapIndex(-1, 8)).toBe(7);
  });
});

describe('Vec2', () => {
  it('supports in-place arithmetic', () => {
    const v = new Vec2(1, 2).add(new Vec2(3, 4)).scale(2);
    expect(v.x).toBe(8);
    expect(v.y).toBe(12);
    expect(new Vec2(3, 4).length()).toBe(5);
    expect(new Vec2(3, 4).normalize().length()).toBeCloseTo(1);
    expect(new Vec2(0, 0).normalize().length()).toBe(0);
  });

  it('rotates and computes angles consistently', () => {
    const v = Vec2.fromAngle(0).rotate(PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
    expect(v.angle()).toBeCloseTo(PI / 2);
    expect(new Vec2(1, 0).perp().equals(new Vec2(0, 1))).toBe(true);
    expect(new Vec2(1, 0).cross(new Vec2(0, 1))).toBe(1);
  });
});

describe('Mat2', () => {
  it('inverts and multiplies', () => {
    const m = Mat2.rotation(0.7);
    const inv = new Mat2(m.a, m.b, m.c, m.d);
    expect(inv.invert()).toBe(true);
    const id = m.multiply(inv);
    expect(id.a).toBeCloseTo(1);
    expect(id.b).toBeCloseTo(0);
    expect(id.c).toBeCloseTo(0);
    expect(id.d).toBeCloseTo(1);
  });

  it('refuses to invert a singular matrix', () => {
    expect(new Mat2(1, 2, 2, 4).invert()).toBe(false);
  });

  it('applies rotation to vectors', () => {
    const v = Mat2.rotation(PI / 2).apply(new Vec2(1, 0));
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });
});
