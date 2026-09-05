import { RETRO_RECIPES, renderRecipeToBuffer, type SynthRecipe } from './RetroSynth';

/**
 * Web Audio playback for a first-person game: distance-attenuated, stereo-panned
 * one-shots plus looped ambience. Buffers come from `RetroSynth` recipes, so a
 * game is audible with zero binary assets; register decoded `AudioBuffer`s with
 * `registerBuffer` to override any sound with real audio later.
 *
 * Browsers refuse to start an AudioContext outside a user gesture, so nothing
 * plays until `unlock()` runs from a click or key handler. Calls before that are
 * dropped rather than queued: a burst of stale sounds firing the moment audio
 * unlocks is worse than silence.
 */
export interface PlayOptions {
  /** World position; omit for a non-positional (UI / player-centred) sound. */
  x?: number;
  y?: number;
  volume?: number;
  loop?: boolean;
  /** Random pitch spread, e.g. 0.06 = ±6%. Stops repeated sounds from sounding machine-gunned. */
  pitchVariance?: number;
}

/** Handle for a looping sound. `isActive` covers the async load so callers never start duplicates. */
export interface LoopHandle {
  readonly name: string;
  /** Audio is actually flowing (buffer resolved and source started). */
  readonly isPlaying: boolean;
  /** True from creation until `stop()`. Check this, not `isPlaying`, before starting a loop. */
  readonly isActive: boolean;
  setVolume(volume: number, fadeSeconds?: number): void;
  setPosition(x: number, y: number): void;
  stop(fadeSeconds?: number): void;
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
  x: number;
  y: number;
  positional: boolean;
  volume: number;
}

export interface PositionalAudioOptions {
  /** Distance (world units) at which a positional sound is inaudible. */
  maxDistance?: number;
  /** Extra recipes merged over the built-in `RETRO_RECIPES`. */
  recipes?: Record<string, SynthRecipe>;
  /** Injected context factory for tests. */
  contextFactory?: () => AudioContext;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class PositionalAudio {
  private readonly maxDistance: number;
  private readonly recipes: Record<string, SynthRecipe>;
  private readonly contextFactory: () => AudioContext;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly active = new Set<ActiveVoice>();
  private muted = false;
  private masterVolume = 0.8;
  listenerX = 0;
  listenerY = 0;
  /** Listener facing in radians; drives stereo panning. */
  listenerAngle = 0;

  constructor(options: PositionalAudioOptions = {}) {
    this.maxDistance = options.maxDistance ?? 18;
    this.recipes = { ...RETRO_RECIPES, ...(options.recipes ?? {}) };
    this.contextFactory = options.contextFactory ?? (() => new AudioContext());
  }

  get isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.masterVolume;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp(v, 0, 1);
    if (this.master && !this.muted) this.master.gain.value = this.masterVolume;
  }

  /** Update once per tick, before playing this frame's sounds. */
  setListener(x: number, y: number, angle: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerAngle = angle;
  }

  /** Override a synth sound with decoded audio (an mp3/ogg you fetched). */
  registerBuffer(name: string, buffer: AudioBuffer): void {
    this.buffers.set(name, buffer);
  }

  /** Render (and memoise) a sound's buffer. Synth rendering is synchronous and cheap. */
  getBuffer(name: string): AudioBuffer | null {
    const existing = this.buffers.get(name);
    if (existing) return existing;
    const ctx = this.ctx;
    const recipe = this.recipes[name];
    if (!ctx || !recipe) return null;
    const buffer = renderRecipeToBuffer(ctx, recipe, name.length * 7919);
    this.buffers.set(name, buffer);
    return buffer;
  }

  /** Fire-and-forget one-shot. Silently ignored before `unlock()`. */
  play(name: string, options: PlayOptions = {}): void {
    if (!this.ctx || !this.master) return;
    const buffer = this.getBuffer(name);
    if (!buffer) return;
    this.startVoice(buffer, options);
  }

  /** Start a looping sound. The handle is usable immediately. */
  playLoop(name: string, options: PlayOptions = {}): LoopHandle {
    let voice: ActiveVoice | null = null;
    let stopped = false;
    const applyVolume = (v: ActiveVoice, target: number, fade: number): void => {
      v.volume = target;
      if (v.positional) {
        this.mixVoice(v);
        return;
      }
      const param = v.gain.gain;
      const now = this.ctx!.currentTime;
      param.cancelScheduledValues(now);
      if (fade > 0) {
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(target, now + fade);
      } else {
        param.value = target;
      }
    };
    const handle: LoopHandle = {
      name,
      get isPlaying() {
        return voice !== null && !stopped;
      },
      get isActive() {
        return !stopped;
      },
      setVolume: (v, fade = 0) => {
        if (voice) applyVolume(voice, v, fade);
      },
      setPosition: (x, y) => {
        if (!voice) return;
        voice.x = x;
        voice.y = y;
        voice.positional = true;
        this.mixVoice(voice);
      },
      stop: (fade = 0) => {
        stopped = true;
        const v = voice;
        if (!v) return;
        if (fade > 0) {
          applyVolume(v, 0, fade);
          setTimeout(() => {
            try {
              v.source.stop();
            } catch {
              // already stopped
            }
          }, fade * 1000 + 50);
        } else {
          try {
            v.source.stop();
          } catch {
            // already stopped
          }
        }
        this.active.delete(v);
      },
    };
    const buffer = this.ctx ? this.getBuffer(name) : null;
    if (!buffer) {
      stopped = true;
      return handle;
    }
    voice = this.startVoice(buffer, { ...options, loop: true });
    if (!voice) stopped = true;
    return handle;
  }

  private startVoice(buffer: AudioBuffer, options: PlayOptions): ActiveVoice | null {
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    if (options.pitchVariance) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * options.pitchVariance;
    const gain = ctx.createGain();
    const positional = options.x !== undefined && options.y !== undefined;
    let panner: StereoPannerNode | null = null;
    if (positional && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      source.connect(gain);
      gain.connect(panner);
      panner.connect(this.master);
    } else {
      source.connect(gain);
      gain.connect(this.master);
    }
    const voice: ActiveVoice = {
      source,
      gain,
      panner,
      x: options.x ?? 0,
      y: options.y ?? 0,
      positional,
      volume: options.volume ?? 1,
    };
    this.mixVoice(voice);
    this.active.add(voice);
    source.addEventListener('ended', () => {
      this.active.delete(voice);
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
    });
    source.start();
    return voice;
  }

  /**
   * Distance attenuation is squared so nearby sources dominate, and panning uses
   * the cross product of the listener's forward vector with the offset: positive
   * means the source is on the listener's right.
   */
  private mixVoice(v: ActiveVoice): void {
    if (!v.positional) {
      v.gain.gain.value = v.volume;
      return;
    }
    const dx = v.x - this.listenerX;
    const dy = v.y - this.listenerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const atten = dist <= 0.5 ? 1 : clamp(1 - (dist - 0.5) / this.maxDistance, 0, 1);
    v.gain.gain.value = v.volume * atten * atten;
    if (v.panner && dist > 0.05) {
      const fx = Math.cos(this.listenerAngle);
      const fy = Math.sin(this.listenerAngle);
      v.panner.pan.value = clamp(((fx * dy - fy * dx) / dist) * 0.8, -1, 1);
    }
  }

  /** Re-mix live positional voices against the current listener; call once per tick. */
  update(): void {
    for (const v of this.active) if (v.positional) this.mixVoice(v);
  }

  stopAll(): void {
    for (const v of this.active) {
      try {
        v.source.stop();
      } catch {
        // already stopped
      }
    }
    this.active.clear();
  }

  async dispose(): Promise<void> {
    this.stopAll();
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
  }
}
