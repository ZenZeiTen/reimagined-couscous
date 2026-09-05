/** Monotonic clock with delta clamping to keep physics stable after tab switches. */
export class Clock {
  private last: number;
  private startTime: number;
  /** Maximum delta (seconds) reported by `tick()`; larger gaps are clamped. */
  maxDelta: number;

  constructor(maxDelta = 0.25, now: () => number = () => performance.now()) {
    this.nowFn = now;
    this.startTime = now();
    this.last = this.startTime;
    this.maxDelta = maxDelta;
  }

  private nowFn: () => number;

  /** Seconds elapsed since the previous call, clamped to `maxDelta`. */
  tick(): number {
    const now = this.nowFn();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt < 0) dt = 0;
    if (dt > this.maxDelta) dt = this.maxDelta;
    return dt;
  }

  /** Seconds since construction. */
  elapsed(): number {
    return (this.nowFn() - this.startTime) / 1000;
  }

  reset(): void {
    this.last = this.nowFn();
  }
}
