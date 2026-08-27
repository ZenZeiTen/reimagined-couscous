/** Curated list of interesting English words for "Kata Hari Ini". */
const WORDS = [
  "serendipity", "eloquent", "resilience", "wanderlust", "ephemeral",
  "luminous", "solitude", "harmony", "tranquil", "vivid",
  "curiosity", "gratitude", "wisdom", "courage", "delight",
  "genuine", "flourish", "radiant", "serene", "whimsical",
  "benevolent", "candor", "dazzle", "effervescent", "felicity",
  "gleam", "halcyon", "idyllic", "jubilant", "kindred",
  "lucid", "mellifluous", "nostalgia", "opulent", "panacea",
  "quintessential", "reverie", "sonorous", "tenacity", "ubiquitous",
  "vernacular", "wistful", "zenith", "arcane", "blissful",
  "cascade", "diligent", "ember", "fathom", "gossamer",
];

/** Deterministically pick the same word for the whole calendar day. */
export function wordOfTheDay(date: Date = new Date()): string {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = Math.floor((today - start) / 86_400_000);
  const seed = date.getFullYear() * 366 + dayOfYear;
  return WORDS[seed % WORDS.length];
}
