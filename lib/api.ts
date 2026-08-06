import type { DictionaryEntry, Direction, LookupResult } from "./types";

// Same-origin Next.js API routes proxy the public APIs server-side —
// the Free Dictionary API sits behind Cloudflare and its rate-limit
// responses lack CORS headers, so direct browser calls fail opaquely.
const DICT_API = "/api/dictionary?word=";
const TRANSLATE_API = "/api/translate";

export class WordNotFoundError extends Error {
  constructor(word: string) {
    super(`Word not found: ${word}`);
    this.name = "WordNotFoundError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

async function safeFetch(url: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new NetworkError();
  }
}

async function fetchEnglishEntries(
  word: string,
  signal?: AbortSignal
): Promise<DictionaryEntry[]> {
  const res = await safeFetch(
    DICT_API + encodeURIComponent(word.toLowerCase()),
    signal
  );
  if (res.status === 404) throw new WordNotFoundError(word);
  if (!res.ok) throw new NetworkError(`Dictionary API error (${res.status})`);
  const data = (await res.json()) as DictionaryEntry[];
  if (!Array.isArray(data) || data.length === 0)
    throw new WordNotFoundError(word);
  return data;
}

async function translate(
  text: string,
  from: "en" | "id",
  to: "en" | "id",
  signal?: AbortSignal
): Promise<{ best: string; candidates: string[] }> {
  const url = `${TRANSLATE_API}?q=${encodeURIComponent(text)}&from=${from}&to=${to}`;
  const res = await safeFetch(url, signal);
  if (res.status === 404) throw new WordNotFoundError(text);
  if (!res.ok) throw new NetworkError(`Translation API error (${res.status})`);
  const data = await res.json();
  const best: string | undefined = data?.translatedText;
  if (!best) throw new WordNotFoundError(text);
  const candidates: string[] = Array.isArray(data?.candidates)
    ? data.candidates
    : [best];
  return { best: best.trim(), candidates };
}

/** Heuristic: does the input look Indonesian rather than English? */
export function looksIndonesian(word: string): boolean {
  const w = word.toLowerCase().trim();
  if (!w) return false;
  const affixes = [/^meng/, /^meny/, /^mem/, /^men/, /^ber/, /^ter/, /^peng/, /^per/, /kan$/, /nya$/, /lah$/];
  const commonWords = new Set([
    "kucing", "anjing", "makan", "minum", "rumah", "buku", "kata", "hari",
    "ini", "itu", "dan", "atau", "yang", "tidak", "saya", "kamu", "dia",
    "kami", "mereka", "besar", "kecil", "baik", "buruk", "cinta", "kerja",
    "jalan", "air", "api", "tanah", "udara", "senang", "sedih", "cepat",
    "lambat", "baru", "lama", "orang", "anak", "ibu", "bapak", "teman",
  ]);
  if (commonWords.has(w)) return true;
  return affixes.some((re) => re.test(w));
}

/**
 * EN→ID: fetch the rich English entry, then translate the headword to Indonesian.
 * ID→EN: translate the Indonesian word to English first, then fetch the rich
 * English entry for the translated word — both directions show rich data.
 */
export async function lookupWord(
  query: string,
  direction: Direction,
  signal?: AbortSignal
): Promise<LookupResult> {
  const trimmed = query.trim();
  if (direction === "en-id") {
    const entries = await fetchEnglishEntries(trimmed, signal);
    let indonesianTranslation = "";
    try {
      indonesianTranslation = (
        await translate(entries[0].word, "en", "id", signal)
      ).best;
    } catch {
      indonesianTranslation = "";
    }
    return {
      query: trimmed,
      direction,
      englishWord: entries[0].word,
      indonesianTranslation,
      entries,
    };
  }

  const english = await translate(trimmed, "id", "en", signal);
  // Translation memories can surface junk as the top match ("kucing" → "neko"),
  // so try every candidate — full phrase then its first word — against the
  // dictionary until one resolves to a real English entry.
  const candidates = english.candidates
    .flatMap((c) => [c, c.split(/\s+/)[0]])
    .filter((c, i, arr) => c && arr.indexOf(c) === i)
    .slice(0, 8);
  let entries: DictionaryEntry[] | null = null;
  let headword = english.best;
  for (const candidate of candidates) {
    try {
      entries = await fetchEnglishEntries(candidate, signal);
      headword = entries[0].word;
      break;
    } catch (err) {
      if (!(err instanceof WordNotFoundError)) throw err;
    }
  }
  if (!entries) throw new WordNotFoundError(trimmed);
  return {
    query: trimmed,
    direction,
    englishWord: headword,
    indonesianTranslation: trimmed,
    entries,
  };
}

/** Fetch a compact Word-of-the-Day payload for a known English word. */
export async function lookupWordOfTheDay(
  word: string,
  signal?: AbortSignal
): Promise<LookupResult> {
  return lookupWord(word, "en-id", signal);
}
