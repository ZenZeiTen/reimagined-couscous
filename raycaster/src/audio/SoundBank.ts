/**
 * Sound bank specification and manifest formats.
 *
 * - `SoundBankSpec` (tools/audio/sound_bank.spec.json) describes what to
 *   generate: prompts for sound effects and scripts for voice lines.
 * - `SoundBankManifest` (public/audio/bank/manifest.json) is written by the
 *   bake script and lists the pre-rendered files the AudioManager loads.
 */
export interface SoundEffectSpec {
  prompt: string;
  durationSeconds?: number;
  promptInfluence?: number;
}

export interface VoiceLineSpec {
  text: string;
  /** Human-readable direction; stored alongside the line for reference. */
  style?: string;
  voiceId?: string;
  modelId?: string;
}

export interface SoundBankSpec {
  version: number;
  defaultVoiceId: string;
  defaultModelId: string;
  outputFormat: string;
  sounds: Record<string, SoundEffectSpec>;
  voices: Record<string, VoiceLineSpec>;
}

export interface SoundBankEntry {
  file: string;
  mimeType: string;
  /** Hash of the request that produced this file; matches AudioCache keys. */
  hash: string;
  kind: 'sfx' | 'voice';
}

export interface SoundBankManifest {
  version: number;
  generatedAt: string;
  entries: Record<string, SoundBankEntry>;
}

export class SoundBankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SoundBankError';
  }
}

export function validateSoundBankSpec(raw: unknown): SoundBankSpec {
  if (typeof raw !== 'object' || raw === null) throw new SoundBankError('spec must be an object');
  const s = raw as Record<string, unknown>;
  const str = (k: string): string => {
    const v = s[k];
    if (typeof v !== 'string' || !v) throw new SoundBankError(`spec.${k} must be a non-empty string`);
    return v;
  };
  const sounds: Record<string, SoundEffectSpec> = {};
  const soundsRaw = s['sounds'];
  if (typeof soundsRaw !== 'object' || soundsRaw === null) throw new SoundBankError('spec.sounds must be an object');
  for (const [name, val] of Object.entries(soundsRaw as Record<string, unknown>)) {
    if (typeof val !== 'object' || val === null) throw new SoundBankError(`sound '${name}' must be an object`);
    const v = val as Record<string, unknown>;
    if (typeof v['prompt'] !== 'string' || !v['prompt']) throw new SoundBankError(`sound '${name}' needs a prompt`);
    const entry: SoundEffectSpec = { prompt: v['prompt'] };
    if (typeof v['durationSeconds'] === 'number') entry.durationSeconds = v['durationSeconds'];
    if (typeof v['promptInfluence'] === 'number') entry.promptInfluence = v['promptInfluence'];
    sounds[name] = entry;
  }
  const voices: Record<string, VoiceLineSpec> = {};
  const voicesRaw = s['voices'] ?? {};
  if (typeof voicesRaw !== 'object' || voicesRaw === null) throw new SoundBankError('spec.voices must be an object');
  for (const [name, val] of Object.entries(voicesRaw as Record<string, unknown>)) {
    if (typeof val !== 'object' || val === null) throw new SoundBankError(`voice '${name}' must be an object`);
    const v = val as Record<string, unknown>;
    if (typeof v['text'] !== 'string' || !v['text']) throw new SoundBankError(`voice '${name}' needs text`);
    const entry: VoiceLineSpec = { text: v['text'] };
    if (typeof v['style'] === 'string') entry.style = v['style'];
    if (typeof v['voiceId'] === 'string') entry.voiceId = v['voiceId'];
    if (typeof v['modelId'] === 'string') entry.modelId = v['modelId'];
    voices[name] = entry;
  }
  return {
    version: typeof s['version'] === 'number' ? s['version'] : 1,
    defaultVoiceId: str('defaultVoiceId'),
    defaultModelId: str('defaultModelId'),
    outputFormat: str('outputFormat'),
    sounds,
    voices,
  };
}

export function validateSoundBankManifest(raw: unknown): SoundBankManifest {
  if (typeof raw !== 'object' || raw === null) throw new SoundBankError('manifest must be an object');
  const m = raw as Record<string, unknown>;
  const entriesRaw = m['entries'];
  if (typeof entriesRaw !== 'object' || entriesRaw === null) throw new SoundBankError('manifest.entries must be an object');
  const entries: Record<string, SoundBankEntry> = {};
  for (const [name, val] of Object.entries(entriesRaw as Record<string, unknown>)) {
    if (typeof val !== 'object' || val === null) throw new SoundBankError(`entry '${name}' must be an object`);
    const v = val as Record<string, unknown>;
    if (typeof v['file'] !== 'string') throw new SoundBankError(`entry '${name}' needs a file`);
    const kind = v['kind'] === 'voice' ? 'voice' : 'sfx';
    entries[name] = {
      file: v['file'],
      mimeType: typeof v['mimeType'] === 'string' ? v['mimeType'] : 'audio/mpeg',
      hash: typeof v['hash'] === 'string' ? v['hash'] : '',
      kind,
    };
  }
  return {
    version: typeof m['version'] === 'number' ? m['version'] : 1,
    generatedAt: typeof m['generatedAt'] === 'string' ? m['generatedAt'] : '',
    entries,
  };
}

/** Request descriptor hashed for cache keys; shared by the bake script and the runtime. */
export function soundEffectRequestKey(spec: SoundEffectSpec, outputFormat: string): Record<string, unknown> {
  return {
    kind: 'sfx',
    text: spec.prompt,
    durationSeconds: spec.durationSeconds ?? null,
    promptInfluence: spec.promptInfluence ?? null,
    outputFormat,
  };
}

export function voiceRequestKey(spec: VoiceLineSpec, defaults: { voiceId: string; modelId: string; outputFormat: string }): Record<string, unknown> {
  return {
    kind: 'voice',
    text: spec.text,
    voiceId: spec.voiceId ?? defaults.voiceId,
    modelId: spec.modelId ?? defaults.modelId,
    outputFormat: defaults.outputFormat,
  };
}
