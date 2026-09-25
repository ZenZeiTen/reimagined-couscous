import { describe, it, expect } from 'vitest';
import { Engine, Clock } from '../src/core';

describe('Engine fixed-step loop', () => {
  it('accumulates time into fixed updates and reports alpha', () => {
    const updates: number[] = [];
    const renders: number[] = [];
    const engine = new Engine({ update: (dt) => updates.push(dt), render: (alpha) => renders.push(alpha) }, { fixedStep: 0.01, maxSubSteps: 5 });
    engine.step(0.025);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toBeCloseTo(0.01);
    expect(renders[0]).toBeCloseTo(0.5);
    engine.step(0.005);
    expect(updates).toHaveLength(3);
    expect(engine.stats.frames).toBe(2);
  });

  it('caps sub-steps to avoid the spiral of death', () => {
    let n = 0;
    const engine = new Engine({ update: () => n++, render: () => undefined }, { fixedStep: 0.01, maxSubSteps: 3 });
    engine.step(10);
    expect(n).toBe(3);
    engine.step(0.005);
    expect(n).toBe(3); // accumulator was reset after the cap
  });
});

describe('Clock', () => {
  it('clamps large deltas', () => {
    let t = 0;
    const clock = new Clock(0.1, () => t);
    t = 50;
    expect(clock.tick()).toBeCloseTo(0.05);
    t = 5000;
    expect(clock.tick()).toBeCloseTo(0.1);
    t = 4000;
    expect(clock.tick()).toBe(0);
  });
});
