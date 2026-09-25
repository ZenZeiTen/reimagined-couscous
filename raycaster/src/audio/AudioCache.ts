/**
 * Persistent byte cache for generated audio. Uses the Cache Storage API when
 * available (browsers) and falls back to memory (tests, Node, private mode).
 * Keys are content hashes of the generation request so identical prompts are
 * never billed twice.
 */
export interface AudioCacheStore {
  get(key: string): Promise<ArrayBuffer | null>;
  put(key: string, bytes: ArrayBuffer, mimeType: string): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export class MemoryAudioCache implements AudioCacheStore {
  private readonly map = new Map<string, ArrayBuffer>();

  async get(key: string): Promise<ArrayBuffer | null> {
    return this.map.get(key) ?? null;
  }

  async put(key: string, bytes: ArrayBuffer, _mimeType = 'audio/mpeg'): Promise<void> {
    this.map.set(key, bytes);
  }

  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }
}

export class CacheStorageAudioCache implements AudioCacheStore {
  private readonly cacheName: string;
  private readonly origin: string;

  constructor(cacheName = 'raycaster-audio-v1', origin = 'https://audio-cache.invalid/') {
    this.cacheName = cacheName;
    this.origin = origin;
  }

  static isSupported(): boolean {
    return typeof caches !== 'undefined' && typeof Request !== 'undefined';
  }

  private url(key: string): string {
    return this.origin + encodeURIComponent(key);
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const cache = await caches.open(this.cacheName);
    const res = await cache.match(this.url(key));
    return res ? res.arrayBuffer() : null;
  }

  async put(key: string, bytes: ArrayBuffer, mimeType: string): Promise<void> {
    const cache = await caches.open(this.cacheName);
    await cache.put(this.url(key), new Response(bytes, { headers: { 'Content-Type': mimeType } }));
  }

  async delete(key: string): Promise<boolean> {
    const cache = await caches.open(this.cacheName);
    return cache.delete(this.url(key));
  }
}

/** Pick the best available cache backend. */
export function createAudioCache(): AudioCacheStore {
  try {
    if (CacheStorageAudioCache.isSupported()) return new CacheStorageAudioCache();
  } catch {
    // fall through
  }
  return new MemoryAudioCache();
}

/** FNV-1a 32-bit hash, used when SubtleCrypto is unavailable. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Stable cache key for a generation request. */
export async function hashRequest(parts: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(parts, Object.keys(parts).sort());
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(json));
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fall through to FNV
    }
  }
  return fnv1a(json) + fnv1a(json.split('').reverse().join(''));
}
