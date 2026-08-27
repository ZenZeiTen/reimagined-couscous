export type Direction = "en-id" | "id-en";

export interface Phonetic {
  text?: string;
  audio?: string;
}

export interface DefinitionItem {
  definition: string;
  example?: string;
  synonyms: string[];
  antonyms: string[];
}

export interface Meaning {
  partOfSpeech: string;
  definitions: DefinitionItem[];
  synonyms: string[];
  antonyms: string[];
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics: Phonetic[];
  meanings: Meaning[];
}

export interface LookupResult {
  /** The word the user typed. */
  query: string;
  direction: Direction;
  /** The English headword whose entry is displayed. */
  englishWord: string;
  /** Indonesian equivalent of the English headword. */
  indonesianTranslation: string;
  entries: DictionaryEntry[];
}

export interface HistoryItem {
  word: string;
  direction: Direction;
  at: number;
}

export interface BookmarkItem {
  word: string;
  translation: string;
  direction: Direction;
  at: number;
}
