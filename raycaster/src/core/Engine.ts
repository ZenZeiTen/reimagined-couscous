import { Clock } from './Time';

/** Anything the engine drives: a fixed-step simulation plus a variable-rate render. */
export interface GameHost {
  /** Called at a fixed rate (`Engine.fixedStep` seconds per call). */
  update(dt: number): void;
  /**
   * Called once per animation frame. `alpha` is the fraction [0,1) of the next
   * fixed step that has elapsed, for interpolating render state.
   */
  render(alpha: number, frameDt: number): void;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  updateMs: number;
  renderMs: number;
  frames: number;
}

export interface EngineOptions {
  /** Fixed simulation step in seconds. Default 1/60. */
  fixedStep?: number;
  /** Max fixed steps per frame before dropping time (spiral-of-death guard). Default 5. */
  maxSubSteps?: number;
  /** Pause automatically when the document is hidden. Default true. */
  pauseWhenHidden?: boolean;
}

/**
 * Game loop with a fixed-timestep update and render tick. The accumulator
 * pattern keeps simulation deterministic regardless of display refresh rate.
 */
export class Engine {
  readonly fixedStep: number;
  readonly maxSubSteps: number;
  readonly stats: EngineStats = { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0, frames: 0 };

  private host: GameHost;
  private readonly clock: Clock;
  private accumulator = 0;
  private rafId = 0;
  private running = false;
  private paused = false;
  private fpsWindowStart = 0;
  private fpsWindowFrames = 0;
  private readonly boundFrame: (now: number) => void;
  private readonly onVisibility: () => void;

  constructor(host: GameHost, options: EngineOptions = {}) {
    this.host = host;
    this.fixedStep = options.fixedStep ?? 1 / 60;
    this.maxSubSteps = options.maxSubSteps ?? 5;
    this.clock = new Clock(this.fixedStep * this.maxSubSteps);
    this.boundFrame = (now) => this.frame(now);
    const pauseWhenHidden = options.pauseWhenHidden ?? true;
    this.onVisibility = () => {
      if (!pauseWhenHidden) return;
      if (document.hidden) this.pause();
      else this.resume();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setHost(host: GameHost): void {
    this.host = host;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.clock.reset();
    this.accumulator = 0;
    this.fpsWindowStart = performance.now();
    this.fpsWindowFrames = 0;
    this.rafId = requestAnimationFrame(this.boundFrame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.clock.reset();
    this.accumulator = 0;
  }

  dispose(): void {
    this.stop();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Advance the simulation manually (used by tests and headless tooling). */
  step(frameDt: number): void {
    this.accumulator += frameDt;
    let steps = 0;
    const t0 = performance.now();
    while (this.accumulator >= this.fixedStep && steps < this.maxSubSteps) {
      this.host.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps++;
    }
    if (steps === this.maxSubSteps) this.accumulator = 0;
    const t1 = performance.now();
    this.host.render(this.accumulator / this.fixedStep, frameDt);
    const t2 = performance.now();
    this.stats.updateMs = t1 - t0;
    this.stats.renderMs = t2 - t1;
    this.stats.frameMs = t2 - t0;
    this.stats.frames++;
  }

  private frame(now: number): void {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.boundFrame);
    const dt = this.clock.tick();
    if (this.paused) return;
    this.step(dt);

    this.fpsWindowFrames++;
    const windowMs = now - this.fpsWindowStart;
    if (windowMs >= 500) {
      this.stats.fps = (this.fpsWindowFrames * 1000) / windowMs;
      this.fpsWindowStart = now;
      this.fpsWindowFrames = 0;
    }
  }
}
