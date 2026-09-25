/**
 * Thin, dependency-free wrapper around the ElevenLabs REST API for the two
 * endpoints the engine uses: text-to-speech and sound-effect generation.
 * Works in browsers and Node 18+ (global `fetch`).
 */
export interface ElevenLabsClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Injected fetch for tests / custom transports. */
  fetchImpl?: typeof fetch;
  /** Retries on 429 / 5xx. Default 2. */
  maxRetries?: number;
  /** Per-request timeout in ms. Default 30000. */
  timeoutMs?: number;
}

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

export interface TextToSpeechRequest {
  text: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  voiceSettings?: VoiceSettings;
  /** Optional language hint (ISO 639-1) for multilingual models. */
  languageCode?: string;
  signal?: AbortSignal;
}

export interface SoundEffectRequest {
  text: string;
  /** 0.5 – 22 seconds; omit to let the model choose. */
  durationSeconds?: number;
  /** 0..1, how literally to follow the prompt. */
  promptInfluence?: number;
  outputFormat?: string;
  signal?: AbortSignal;
}

export interface VoiceSummary {
  voiceId: string;
  name: string;
  category: string;
  labels: Record<string, string>;
}

export class ElevenLabsError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body = '') {
    super(message);
    this.name = 'ElevenLabsError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
export const DEFAULT_TTS_MODEL = 'eleven_multilingual_v2';
export const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(options: ElevenLabsClientOptions) {
    if (!options.apiKey) throw new Error('ElevenLabsClient requires an apiKey');
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  /** Synthesize speech; resolves to the encoded audio bytes (MP3 by default). */
  async textToSpeech(req: TextToSpeechRequest): Promise<ArrayBuffer> {
    if (!req.text.trim()) throw new Error('textToSpeech: text is empty');
    if (!req.voiceId) throw new Error('textToSpeech: voiceId is required');
    const format = req.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${encodeURIComponent(format)}`;
    const body: Record<string, unknown> = {
      text: req.text,
      model_id: req.modelId ?? DEFAULT_TTS_MODEL,
    };
    if (req.voiceSettings) body['voice_settings'] = req.voiceSettings;
    if (req.languageCode) body['language_code'] = req.languageCode;
    return this.requestBinary(url, body, 'audio/mpeg', req.signal);
  }

  /** Generate a sound effect from a text prompt. */
  async generateSoundEffect(req: SoundEffectRequest): Promise<ArrayBuffer> {
    if (!req.text.trim()) throw new Error('generateSoundEffect: text is empty');
    const format = req.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const url = `${this.baseUrl}/v1/sound-generation?output_format=${encodeURIComponent(format)}`;
    const body: Record<string, unknown> = { text: req.text };
    if (req.durationSeconds !== undefined) body['duration_seconds'] = req.durationSeconds;
    if (req.promptInfluence !== undefined) body['prompt_influence'] = req.promptInfluence;
    return this.requestBinary(url, body, 'audio/mpeg', req.signal);
  }

  /** List voices available to the account. */
  async listVoices(signal?: AbortSignal): Promise<VoiceSummary[]> {
    const res = await this.fetchWithRetry(`${this.baseUrl}/v1/voices`, { method: 'GET', headers: this.headers('application/json') }, signal);
    const json = (await res.json()) as { voices?: Array<Record<string, unknown>> };
    return (json.voices ?? []).map((v) => ({
      voiceId: String(v['voice_id'] ?? ''),
      name: String(v['name'] ?? ''),
      category: String(v['category'] ?? ''),
      labels: (v['labels'] as Record<string, string>) ?? {},
    }));
  }

  private headers(accept: string): Record<string, string> {
    return {
      'xi-api-key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: accept,
    };
  }

  private async requestBinary(url: string, body: unknown, accept: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const res = await this.fetchWithRetry(url, { method: 'POST', headers: this.headers(accept), body: JSON.stringify(body) }, signal);
    return res.arrayBuffer();
  }

  private async fetchWithRetry(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const onAbort = (): void => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await this.fetchImpl(url, { ...init, signal: controller.signal });
        if (res.ok) return res;
        const text = await res.text().catch(() => '');
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < this.maxRetries) {
          attempt++;
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
          continue;
        }
        throw new ElevenLabsError(`ElevenLabs request failed (${res.status}) for ${url}`, res.status, text);
      } catch (err) {
        if (err instanceof ElevenLabsError) throw err;
        if (signal?.aborted) throw err;
        if (attempt < this.maxRetries) {
          attempt++;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
  }
}
