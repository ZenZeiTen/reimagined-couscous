import { ElevenLabsClient } from './ElevenLabsClient';
import { createAudioCache, hashRequest, type AudioCacheStore } from './AudioCache';
import { RETRO_RECIPES, renderRecipeToBuffer, voiceBlipRecipe } from './RetroSynth';
import {
  soundEffectRequestKey,
  validateSoundBankManifest,
  voiceRequestKey,
  type SoundBankManifest,
  type SoundBankSpec,
} from './SoundBank';
import { clamp } from '../math/angle';

export interface AudioManagerOptions {
  spec: SoundBankSpec;
  /** Directory URL holding manifest.json and the baked files; null disables. */
  bankUrl?: string | null;
  /** Live generation fallback; null disables API calls. */
  elevenLabs?: ElevenLabsClient | null;
  cache?: AudioCacheStore;
  /** Distance (tiles) at which positional sounds are inaudible. */
  maxDistance?: number;
  /** Minimum seconds between two plays of the same voice line id. */
  voiceRepeatCooldown?: number;
  /** Injected AudioContext factory (tests). */
  contextFactory?: () => AudioContext;
}

export interface PlayOptions {
  x?: number;
  y?: number;
  volume?: number;
  loop?: boolean;
  /** Random pitch variation, e.g. 0.05 = ±5%. */
  pitchVariance?: number;
}

export type BufferSource = 'bank' | 'cache' | 'api' | 'synth';

/** Handle for a looping sound started with `playLoop`. */
export interface LoopHandle {
  readonly name: string;
  /** Audio is actually flowing (buffer resolved and source started). */
  readonly isPlaying: boolean;
  /** True from creation until `stop()`; covers the async load so callers do not start duplicates. */
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

/**
 * Web Audio playback with positional mixing, a voice-line queue and a layered
 * asset pipeline: baked bank → persistent cache → ElevenLabs API → RetroSynth.
 */
export class AudioManager {
  readonly spec: SoundBankSpec;
  private readonly bankUrl: string | null;
  private readonly client: ElevenLabsClient | null;
  private readonly cache: AudioCacheStore;
  private readonly maxDistance: number;
  private readonly voiceRepeatCooldown: number;
  private readonly contextFactory: () => AudioContext;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Map<string, Promise<AudioBuffer>>();
  private readonly sources = new Map<string, BufferSource>();
  private manifest: SoundBankManifest | null = null;
  private readonly active = new Set<ActiveVoice>();
  private readonly voiceQueue: string[] = [];
  private voicePlaying = false;
  private readonly lastVoiceAt = new Map<string, number>();
  private muted = false;
  private masterVolume = 0.8;
  listenerX = 0;
  listenerY = 0;
  listenerAngle = 0;
  /** Logs for diagnostics (which pipeline stage served each sound). */
  onResolved: ((name: string, source: BufferSource) => void) | null = null;

  constructor(options: AudioManagerOptions) {
    this.spec = options.spec;
    this.bankUrl = options.bankUrl === undefined ? 'audio/bank/' : options.bankUrl;
    this.client = options.elevenLabs ?? null;
    this.cache = options.cache ?? createAudioCache();
    this.maxDistance = options.maxDistance ?? 18;
    this.voiceRepeatCooldown = options.voiceRepeatCooldown ?? 6;
    this.contextFactory = options.contextFactory ?? (() => new AudioContext());
  }

  get isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Create/resume the AudioContext. Must be called from a user gesture in browsers. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.voiceBus = this.ctx.createGain();
      this.voiceBus.gain.value = 1;
      this.voiceBus.connect(this.master);
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

  setListener(x: number, y: number, angle: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerAngle = angle;
  }

  /** Load the baked manifest if present. Missing manifests are not an error. */
  async loadBank(): Promise<SoundBankManifest | null> {
    if (!this.bankUrl) return null;
    try {
      const res = await fetch(this.bankUrl + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) return null;
      this.manifest = validateSoundBankManifest(await res.json());
      return this.manifest;
    } catch {
      return null;
    }
  }

  /** Resolve and decode every sound and voice in the spec ahead of time. */
  async preloadAll(): Promise<void> {
    const names = [...Object.keys(this.spec.sounds), ...Object.keys(this.spec.voices).map((v) => `voice:${v}`)];
    await Promise.all(names.map((n) => this.getBuffer(n).catch(() => undefined)));
  }

  sourceOf(name: string): BufferSource | undefined {
    return this.sources.get(name);
  }

  /**
   * Resolve an AudioBuffer by name. Voice lines are addressed as `voice:<id>`.
   * Resolution order: baked bank → persistent cache → ElevenLabs → RetroSynth.
   */
  async getBuffer(name: string): Promise<AudioBuffer> {
    const existing = this.buffers.get(name);
    if (existing) return existing;
    const inflight = this.pending.get(name);
    if (inflight) return inflight;
    const p = this.resolveBuffer(name).then((buf) => {
      this.buffers.set(name, buf);
      this.pending.delete(name);
      return buf;
    });
    this.pending.set(name, p);
    return p;
  }

  private requireContext(): AudioContext {
    if (!this.ctx) throw new Error('AudioManager.unlock() must be called before loading audio');
    return this.ctx;
  }

  private async resolveBuffer(name: string): Promise<AudioBuffer> {
    const ctx = this.requireContext();
    const isVoice = name.startsWith('voice:');
    const id = isVoice ? name.slice('voice:'.length) : name;
    const sfxSpec = isVoice ? undefined : this.spec.sounds[id];
    const voiceSpec = isVoice ? this.spec.voices[id] : undefined;

    const defaults = { voiceId: this.spec.defaultVoiceId, modelId: this.spec.defaultModelId, outputFormat: this.spec.outputFormat };
    const keyParts = voiceSpec ? voiceRequestKey(voiceSpec, defaults) : sfxSpec ? soundEffectRequestKey(sfxSpec, this.spec.outputFormat) : null;
    const key = keyParts ? await hashRequest(keyParts) : null;

    // 1. Baked bank.
    if (this.manifest && this.bankUrl) {
      const entry = this.manifest.entries[name];
      if (entry) {
        try {
          const res = await fetch(this.bankUrl + entry.file);
          if (res.ok) {
            const buf = await ctx.decodeAudioData(await res.arrayBuffer());
            this.markSource(name, 'bank');
            return buf;
          }
        } catch {
          // fall through
        }
      }
    }

    // 2. Persistent cache.
    if (key) {
      try {
        const bytes = await this.cache.get(key);
        if (bytes) {
          const buf = await ctx.decodeAudioData(bytes.slice(0));
          this.markSource(name, 'cache');
          return buf;
        }
      } catch {
        // fall through
      }
    }

    // 3. Live generation.
    if (this.client && key && (sfxSpec || voiceSpec)) {
      try {
        let bytes: ArrayBuffer;
        if (voiceSpec) {
          const req: Parameters<ElevenLabsClient['textToSpeech']>[0] = {
            text: voiceSpec.text,
            voiceId: voiceSpec.voiceId ?? defaults.voiceId,
            modelId: voiceSpec.modelId ?? defaults.modelId,
            outputFormat: defaults.outputFormat,
          };
          bytes = await this.client.textToSpeech(req);
        } else {
          const req: Parameters<ElevenLabsClient['generateSoundEffect']>[0] = { text: sfxSpec!.prompt, outputFormat: defaults.outputFormat };
          if (sfxSpec!.durationSeconds !== undefined) req.durationSeconds = sfxSpec!.durationSeconds;
          if (sfxSpec!.promptInfluence !== undefined) req.promptInfluence = sfxSpec!.promptInfluence;
          bytes = await this.client.generateSoundEffect(req);
        }
        await this.cache.put(key, bytes.slice(0), 'audio/mpeg').catch(() => undefined);
        const buf = await ctx.decodeAudioData(bytes);
        this.markSource(name, 'api');
        return buf;
      } catch (err) {
        console.warn(`[audio] ElevenLabs generation failed for '${name}', using synth fallback`, err);
      }
    }

    // 4. Procedural fallback.
    const recipe = voiceSpec ? voiceBlipRecipe(voiceSpec.text) : RETRO_RECIPES[id] ?? RETRO_RECIPES['pistol_empty']!;
    const buf = renderRecipeToBuffer(ctx, recipe, id.length * 7919);
    this.markSource(name, 'synth');
    return buf;
  }

  private markSource(name: string, source: BufferSource): void {
    this.sources.set(name, source);
    this.onResolved?.(name, source);
  }

  /** Fire-and-forget playback. Sounds not yet loaded are resolved then played. */
  play(name: string, options: PlayOptions = {}): void {
    if (!this.ctx || !this.sfxBus) return;
    const buf = this.buffers.get(name);
    if (buf) {
      this.startVoice(buf, this.sfxBus, options);
      return;
    }
    this.getBuffer(name)
      .then((b) => {
        if (this.ctx && this.sfxBus) this.startVoice(b, this.sfxBus, options);
      })
      .catch((err) => console.warn(`[audio] cannot play '${name}'`, err));
  }

  /**
   * Start a looping sound (ambient drones, machinery). The loop begins as
   * soon as the buffer resolves; the handle controls volume, position and
   * fading regardless of load state.
   */
  playLoop(name: string, options: PlayOptions = {}): LoopHandle {
    let voice: ActiveVoice | null = null;
    let stopped = false;
    let volume = options.volume ?? 1;
    let pending = { ...options, loop: true };
    const applyVolume = (v: ActiveVoice, target: number, fade: number): void => {
      const ctx = this.ctx!;
      const param = v.gain.gain;
      v.volume = target;
      if (v.positional) {
        this.updateVoiceMix(v);
        return;
      }
      param.cancelScheduledValues(ctx.currentTime);
      if (fade > 0) {
        param.setValueAtTime(param.value, ctx.currentTime);
        param.linearRampToValueAtTime(target, ctx.currentTime + fade);
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
        volume = v;
        pending = { ...pending, volume: v };
        if (voice) applyVolume(voice, v, fade);
      },
      setPosition: (x, y) => {
        pending = { ...pending, x, y };
        if (voice) {
          voice.x = x;
          voice.y = y;
          voice.positional = true;
          this.updateVoiceMix(voice);
        }
      },
      stop: (fade = 0) => {
        stopped = true;
        if (!voice || !this.ctx) return;
        const v = voice;
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
    if (!this.ctx || !this.sfxBus) {
      stopped = true;
      return handle;
    }
    this.getBuffer(name)
      .then((buf) => {
        if (stopped || !this.ctx || !this.sfxBus) return;
        voice = this.startVoice(buf, this.sfxBus, { ...pending, volume });
        if (!voice) stopped = true;
      })
      .catch((err) => {
        stopped = true;
        console.warn(`[audio] cannot loop '${name}'`, err);
      });
    return handle;
  }

  /** Queue a voice line. Lines play one at a time; repeats are rate-limited. */
  speak(lineId: string): void {
    if (!this.ctx) return;
    if (!this.spec.voices[lineId]) return;
    const now = this.ctx.currentTime;
    const last = this.lastVoiceAt.get(lineId);
    if (last !== undefined && now - last < this.voiceRepeatCooldown) return;
    this.lastVoiceAt.set(lineId, now);
    if (this.voiceQueue.includes(lineId)) return;
    this.voiceQueue.push(lineId);
    this.drainVoiceQueue();
  }

  private drainVoiceQueue(): void {
    if (this.voicePlaying || !this.ctx || !this.voiceBus) return;
    const next = this.voiceQueue.shift();
    if (!next) return;
    this.voicePlaying = true;
    this.getBuffer(`voice:${next}`)
      .then((buf) => {
        if (!this.ctx || !this.voiceBus) return;
        const voice = this.startVoice(buf, this.voiceBus, { volume: 1 });
        if (!voice) {
          this.voicePlaying = false;
          this.drainVoiceQueue();
          return;
        }
        voice.source.addEventListener('ended', () => {
          this.voicePlaying = false;
          this.drainVoiceQueue();
        });
      })
      .catch(() => {
        this.voicePlaying = false;
        this.drainVoiceQueue();
      });
  }

  private startVoice(buffer: AudioBuffer, bus: GainNode, options: PlayOptions): ActiveVoice | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    if (options.pitchVariance) {
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * options.pitchVariance;
    }
    const gain = ctx.createGain();
    const positional = options.x !== undefined && options.y !== undefined;
    let panner: StereoPannerNode | null = null;
    if (positional && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      source.connect(gain);
      gain.connect(panner);
      panner.connect(bus);
    } else {
      source.connect(gain);
      gain.connect(bus);
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
    this.updateVoiceMix(voice);
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

  private updateVoiceMix(v: ActiveVoice): void {
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
      // Right-hand side of the listener: positive cross product of forward × offset.
      const fx = Math.cos(this.listenerAngle);
      const fy = Math.sin(this.listenerAngle);
      const right = (fx * dy - fy * dx) / dist;
      v.panner.pan.value = clamp(right * 0.8, -1, 1);
    }
  }

  /** Re-mix looping/positional sounds against the current listener; call once per tick. */
  update(): void {
    for (const v of this.active) if (v.positional) this.updateVoiceMix(v);
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
    this.voiceQueue.length = 0;
    this.voicePlaying = false;
  }

  async dispose(): Promise<void> {
    this.stopAll();
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
  }
}
