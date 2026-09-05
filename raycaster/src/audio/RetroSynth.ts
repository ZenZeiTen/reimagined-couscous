/**
 * Procedural retro sound synthesis rendered offline into AudioBuffers.
 * Every engine sound has a synth recipe here, so the game is fully audible
 * with no network access or API key; ElevenLabs assets replace these when
 * present in the sound bank or cache.
 */
export type WaveKind = 'square' | 'sawtooth' | 'triangle' | 'sine' | 'noise';

export interface SynthSegment {
  wave: WaveKind;
  /** Start frequency in Hz (ignored for noise). */
  freq: number;
  /** End frequency for a sweep; defaults to `freq`. */
  freqEnd?: number;
  duration: number;
  gain?: number;
  attack?: number;
  release?: number;
  /** Delay relative to the recipe start. */
  at?: number;
  /** Low-pass cutoff in Hz. */
  lowpass?: number;
  /** Vibrato depth (Hz) and rate (Hz). */
  vibrato?: { depth: number; rate: number };
}

export interface SynthRecipe {
  segments: SynthSegment[];
  /** Total length; defaults to the last segment's end. */
  length?: number;
}

export const RETRO_RECIPES: Record<string, SynthRecipe> = {
  pistol_fire: {
    segments: [
      { wave: 'noise', freq: 0, duration: 0.18, gain: 0.9, attack: 0.001, release: 0.15, lowpass: 3500 },
      { wave: 'square', freq: 520, freqEnd: 70, duration: 0.14, gain: 0.5, attack: 0.001, release: 0.1 },
    ],
  },
  pistol_empty: {
    segments: [{ wave: 'square', freq: 1800, freqEnd: 900, duration: 0.04, gain: 0.35, attack: 0.001, release: 0.03 }],
  },
  pistol_reload: {
    segments: [
      { wave: 'noise', freq: 0, duration: 0.05, gain: 0.4, lowpass: 2500, at: 0 },
      { wave: 'square', freq: 400, freqEnd: 300, duration: 0.05, gain: 0.3, at: 0.35 },
      { wave: 'noise', freq: 0, duration: 0.06, gain: 0.45, lowpass: 4000, at: 0.7 },
      { wave: 'square', freq: 900, freqEnd: 600, duration: 0.05, gain: 0.3, at: 0.75 },
    ],
    length: 1.0,
  },
  enemy_alert: {
    segments: [
      { wave: 'sawtooth', freq: 140, freqEnd: 260, duration: 0.35, gain: 0.5, attack: 0.02, release: 0.1, lowpass: 1800, vibrato: { depth: 12, rate: 18 } },
      { wave: 'square', freq: 90, freqEnd: 60, duration: 0.3, gain: 0.3, at: 0.2, release: 0.2 },
    ],
  },
  enemy_attack: {
    segments: [
      { wave: 'noise', freq: 0, duration: 0.25, gain: 0.5, attack: 0.05, release: 0.15, lowpass: 1200 },
      { wave: 'sawtooth', freq: 220, freqEnd: 90, duration: 0.3, gain: 0.4, release: 0.2, lowpass: 900 },
    ],
  },
  enemy_hurt: {
    segments: [{ wave: 'square', freq: 300, freqEnd: 180, duration: 0.18, gain: 0.45, release: 0.1, vibrato: { depth: 20, rate: 30 } }],
  },
  enemy_die: {
    segments: [
      { wave: 'sawtooth', freq: 260, freqEnd: 40, duration: 0.9, gain: 0.5, release: 0.5, lowpass: 1500, vibrato: { depth: 15, rate: 12 } },
      { wave: 'noise', freq: 0, duration: 0.6, gain: 0.3, at: 0.3, release: 0.5, lowpass: 800 },
    ],
  },
  player_hurt: {
    segments: [
      { wave: 'sine', freq: 110, freqEnd: 50, duration: 0.3, gain: 0.8, release: 0.25 },
      { wave: 'noise', freq: 0, duration: 0.12, gain: 0.35, lowpass: 600 },
    ],
  },
  player_die: {
    segments: [
      { wave: 'square', freq: 440, freqEnd: 330, duration: 0.3, gain: 0.4, at: 0 },
      { wave: 'square', freq: 330, freqEnd: 220, duration: 0.3, gain: 0.4, at: 0.35 },
      { wave: 'square', freq: 220, freqEnd: 60, duration: 0.8, gain: 0.4, at: 0.7, release: 0.6 },
    ],
  },
  pickup_ammo: {
    segments: [
      { wave: 'square', freq: 660, duration: 0.07, gain: 0.35, at: 0 },
      { wave: 'square', freq: 880, duration: 0.07, gain: 0.35, at: 0.08 },
      { wave: 'square', freq: 1320, duration: 0.12, gain: 0.35, at: 0.16, release: 0.08 },
    ],
  },
  pickup_health: {
    segments: [
      { wave: 'triangle', freq: 523, duration: 0.1, gain: 0.4, at: 0 },
      { wave: 'triangle', freq: 659, duration: 0.1, gain: 0.4, at: 0.1 },
      { wave: 'triangle', freq: 784, duration: 0.1, gain: 0.4, at: 0.2 },
      { wave: 'triangle', freq: 1046, duration: 0.25, gain: 0.4, at: 0.3, release: 0.2 },
    ],
  },
  footstep: {
    segments: [{ wave: 'noise', freq: 0, duration: 0.08, gain: 0.25, attack: 0.005, release: 0.06, lowpass: 500 }],
  },
  level_start: {
    segments: [
      { wave: 'square', freq: 392, duration: 0.15, gain: 0.3, at: 0 },
      { wave: 'square', freq: 523, duration: 0.15, gain: 0.3, at: 0.15 },
      { wave: 'square', freq: 659, duration: 0.15, gain: 0.3, at: 0.3 },
      { wave: 'square', freq: 784, duration: 0.5, gain: 0.3, at: 0.45, release: 0.3 },
    ],
  },
};

function recipeLength(recipe: SynthRecipe): number {
  if (recipe.length !== undefined) return recipe.length;
  let end = 0;
  for (const s of recipe.segments) end = Math.max(end, (s.at ?? 0) + s.duration + (s.release ?? 0));
  return end;
}

/** Simple LCG so noise is deterministic across runs. */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296 * 2 - 1;
  };
}

/** Pure-JS renderer used for tests and for environments without OfflineAudioContext. */
export function renderRecipeToSamples(recipe: SynthRecipe, sampleRate = 44100, seed = 1): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.ceil(recipeLength(recipe) * sampleRate));
  const out = new Float32Array(new ArrayBuffer(length * 4));
  const noise = makeNoise(seed);
  for (const seg of recipe.segments) {
    const start = Math.floor((seg.at ?? 0) * sampleRate);
    const attack = Math.max(1, Math.floor((seg.attack ?? 0.002) * sampleRate));
    const release = Math.max(1, Math.floor((seg.release ?? 0.02) * sampleRate));
    const body = Math.floor(seg.duration * sampleRate);
    const total = body + release;
    const gain = seg.gain ?? 0.5;
    const f0 = seg.freq;
    const f1 = seg.freqEnd ?? seg.freq;
    let phase = 0;
    // One-pole low-pass state.
    const lp = seg.lowpass ? Math.exp((-2 * Math.PI * seg.lowpass) / sampleRate) : 0;
    let lpState = 0;
    for (let i = 0; i < total && start + i < length; i++) {
      const t = i / sampleRate;
      const prog = Math.min(1, i / Math.max(1, body));
      let freq = f0 + (f1 - f0) * prog;
      if (seg.vibrato) freq += Math.sin(2 * Math.PI * seg.vibrato.rate * t) * seg.vibrato.depth;
      phase += freq / sampleRate;
      if (phase >= 1) phase -= Math.floor(phase);
      let v: number;
      switch (seg.wave) {
        case 'square': v = phase < 0.5 ? 1 : -1; break;
        case 'sawtooth': v = phase * 2 - 1; break;
        case 'triangle': v = 1 - 4 * Math.abs(phase - 0.5); break;
        case 'sine': v = Math.sin(phase * 2 * Math.PI); break;
        default: v = noise(); break;
      }
      if (seg.lowpass) {
        lpState = lpState * lp + v * (1 - lp);
        v = lpState;
      }
      let env = 1;
      if (i < attack) env = i / attack;
      if (i > body) env *= 1 - (i - body) / release;
      out[start + i] = out[start + i]! + v * gain * env;
    }
  }
  // Soft clip.
  for (let i = 0; i < length; i++) {
    const v = out[i]!;
    out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return out;
}

/** Robotic blip sequence standing in for a voice line when no TTS is available. */
export function voiceBlipRecipe(text: string): SynthRecipe {
  const segments: SynthSegment[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  let at = 0;
  let seed = 0;
  for (const w of words) {
    for (let i = 0; i < w.length; i++) seed = (seed * 31 + w.charCodeAt(i)) >>> 0;
    const syllables = Math.max(1, Math.round(w.length / 3));
    for (let s = 0; s < syllables; s++) {
      const f = 180 + ((seed >> (s * 3)) % 7) * 35;
      segments.push({ wave: 'square', freq: f, freqEnd: f * 0.9, duration: 0.06, gain: 0.25, at, release: 0.02, lowpass: 2200 });
      at += 0.08;
    }
    at += 0.07;
  }
  return { segments, length: at + 0.1 };
}

/** Render a recipe into an AudioBuffer using the given context (any BaseAudioContext). */
export function renderRecipeToBuffer(ctx: BaseAudioContext, recipe: SynthRecipe, seed = 1): AudioBuffer {
  const samples = renderRecipeToSamples(recipe, ctx.sampleRate, seed);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}
