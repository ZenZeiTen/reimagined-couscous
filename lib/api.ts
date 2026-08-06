import type { DictionaryEntry, Direction, LookupResult } from "./types";

const DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const TRANSLATE_API = "https://api.mymemory.translated.net/get";

export class WordNotFoundError extends Error {
  constructor(word: string) {
    super(`Word not found: ${word}`);
    this.name = "WordNotFoundError";
  }
}

async function fetchEnglishEntries(
  word: string,
  signal?: AbortSignal
): Promise<DictionaryEntry[]> {
  const res = await fetch(DICT_API + encodeURIComponent(word.toLowerCase()), {
    signal,
  });
  if (res.status === 404) throw new WordNotFoundError(word);
  if (!res.ok) throw new Error(`Dictionary API error (${res.status})`);
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
): Promise<string> {
  const url = `${TRANSLATE_API}?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Translation API error (${res.status})`);
  const data = await res.json();
  const translated: string | undefined = data?.responseData?.translatedText;
  if (!translated) throw new WordNotFoundError(text);
  return translated.trim();
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
      indonesianTranslation = await translate(entries[0].word, "en", "id", signal);
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
  // MyMemory may return a phrase; try the full result, then the first word.
  const candidates = [english, english.split(/\s+/)[0]].filter(
    (c, i, arr) => c && arr.indexOf(c) === i
  );
  let entries: DictionaryEntry[] | null = null;
  let headword = english;
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
