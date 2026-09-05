import { describe, it, expect, vi } from 'vitest';
import { ElevenLabsClient, ElevenLabsError, fnv1a, hashRequest, MemoryAudioCache, renderRecipeToSamples, RETRO_RECIPES, voiceBlipRecipe, validateSoundBankSpec, validateSoundBankManifest, soundEffectRequestKey, voiceRequestKey } from '../src/audio';
import spec from '../tools/audio/sound_bank.spec.json';
import { createHash } from 'node:crypto';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

describe('ElevenLabsClient', () => {
  it('sends the expected TTS request and returns bytes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_128');
      expect(init?.method).toBe('POST');
      const headers = init?.headers as Record<string, string>;
      expect(headers['xi-api-key']).toBe('key');
      expect(headers['Accept']).toBe('audio/mpeg');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ text: 'hello', model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4 } });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    });
    const client = new ElevenLabsClient({ apiKey: 'key', fetchImpl: fetchImpl as unknown as typeof fetch });
    const bytes = await client.textToSpeech({ text: 'hello', voiceId: 'voice123', voiceSettings: { stability: 0.4 } });
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('builds sound-effect requests with optional fields', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_22050_32');
      expect(JSON.parse(String(init?.body))).toEqual({ text: 'laser', duration_seconds: 1.5, prompt_influence: 0.3 });
      return new Response(new Uint8Array([9]), { status: 200 });
    });
    const client = new ElevenLabsClient({ apiKey: 'key', fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.generateSoundEffect({ text: 'laser', durationSeconds: 1.5, promptInfluence: 0.3, outputFormat: 'mp3_22050_32' });
  });

  it('retries on 429 and surfaces non-retryable errors', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) return jsonResponse(429, 'slow down', { 'retry-after': '0' });
      return new Response(new Uint8Array([7]), { status: 200 });
    });
    const client = new ElevenLabsClient({ apiKey: 'key', fetchImpl: fetchImpl as unknown as typeof fetch, maxRetries: 2 });
    await client.generateSoundEffect({ text: 'x' });
    expect(calls).toBe(2);

    const bad = new ElevenLabsClient({ apiKey: 'key', fetchImpl: (async () => jsonResponse(400, { detail: 'bad' })) as unknown as typeof fetch });
    await expect(bad.generateSoundEffect({ text: 'x' })).rejects.toBeInstanceOf(ElevenLabsError);
  });

  it('parses the voices listing', async () => {
    const client = new ElevenLabsClient({ apiKey: 'key', fetchImpl: (async () => jsonResponse(200, { voices: [{ voice_id: 'a', name: 'Alice', category: 'premade', labels: { accent: 'us' } }] })) as unknown as typeof fetch });
    expect(await client.listVoices()).toEqual([{ voiceId: 'a', name: 'Alice', category: 'premade', labels: { accent: 'us' } }]);
  });

  it('requires an api key', () => {
    expect(() => new ElevenLabsClient({ apiKey: '' })).toThrow();
  });
});

describe('audio cache keys', () => {
  it('hashes deterministically and matches the bake script formula', async () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    const parts = soundEffectRequestKey({ prompt: 'boom', durationSeconds: 1 }, 'mp3_44100_128');
    const key = await hashRequest(parts);
    const expected = createHash('sha256').update(JSON.stringify(parts, Object.keys(parts).sort())).digest('hex');
    expect(key).toBe(expected);
    const vk = voiceRequestKey({ text: 'hi' }, { voiceId: 'v', modelId: 'm', outputFormat: 'f' });
    expect(vk).toEqual({ kind: 'voice', text: 'hi', voiceId: 'v', modelId: 'm', outputFormat: 'f' });
  });

  it('memory cache stores and deletes', async () => {
    const cache = new MemoryAudioCache();
    await cache.put('k', new Uint8Array([1]).buffer, 'audio/mpeg');
    expect(await cache.get('k')).not.toBeNull();
    expect(await cache.delete('k')).toBe(true);
    expect(await cache.get('k')).toBeNull();
  });
});

describe('RetroSynth', () => {
  it('renders every recipe to bounded, non-silent samples', () => {
    for (const [name, recipe] of Object.entries(RETRO_RECIPES)) {
      const samples = renderRecipeToSamples(recipe, 22050);
      expect(samples.length, name).toBeGreaterThan(100);
      let peak = 0;
      for (const s of samples) {
        expect(Math.abs(s)).toBeLessThanOrEqual(1);
        peak = Math.max(peak, Math.abs(s));
      }
      expect(peak, name).toBeGreaterThan(0.05);
    }
  });

  it('builds voice blips proportional to the text', () => {
    const short = renderRecipeToSamples(voiceBlipRecipe('Hi'), 8000);
    const long = renderRecipeToSamples(voiceBlipRecipe('Warning. Vital signs critical.'), 8000);
    expect(long.length).toBeGreaterThan(short.length);
  });
});

describe('sound bank formats', () => {
  it('validates the shipped spec', () => {
    const s = validateSoundBankSpec(spec);
    expect(Object.keys(s.sounds)).toContain('pistol_fire');
    expect(Object.keys(s.voices)).toContain('intro');
    expect(s.defaultVoiceId.length).toBeGreaterThan(0);
    // Every synth fallback exists for every spec sound so the game is never silent.
    for (const name of Object.keys(s.sounds)) expect(RETRO_RECIPES[name], name).toBeDefined();
  });

  it('rejects malformed specs and manifests', () => {
    expect(() => validateSoundBankSpec({ sounds: {} })).toThrow();
    expect(() => validateSoundBankSpec({ ...spec, sounds: { x: {} } })).toThrow(/prompt/);
    expect(() => validateSoundBankManifest({ entries: { a: {} } })).toThrow(/file/);
    const m = validateSoundBankManifest({ version: 1, generatedAt: 'now', entries: { a: { file: 'a.mp3', hash: 'h', kind: 'voice' } } });
    expect(m.entries['a']).toEqual({ file: 'a.mp3', mimeType: 'audio/mpeg', hash: 'h', kind: 'voice' });
  });
});
