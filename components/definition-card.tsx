"use client";

import AudioButton from "./audio-button";
import WordChip from "./word-chip";
import type { LookupResult } from "@/lib/types";

export default function DefinitionCard({
  result,
  bookmarked,
  onToggleBookmark,
  onSelectWord,
}: {
  result: LookupResult;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onSelectWord: (word: string) => void;
}) {
  const entry = result.entries[0];
  const phoneticText =
    entry.phonetic ?? entry.phonetics.find((p) => p.text)?.text ?? "";
  const rawAudio = entry.phonetics.find((p) => p.audio)?.audio ?? "";
  // Some API entries return protocol-relative URLs like //ssl.gstatic.com/...
  const audioSrc = rawAudio.startsWith("//") ? `https:${rawAudio}` : rawAudio;

  return (
    <article className="space-y-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-4xl font-bold capitalize">
            {result.englishWord}
          </h2>
          {phoneticText && (
            <p className="mt-1 text-lg text-primary">{phoneticText}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {audioSrc && <AudioButton src={audioSrc} />}
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-pressed={bookmarked}
            aria-label={
              bookmarked
                ? "Hapus bookmark / Remove bookmark"
                : "Simpan kata / Bookmark word"
            }
            title={bookmarked ? "Hapus bookmark / Remove bookmark" : "Simpan kata / Bookmark word"}
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${
              bookmarked
                ? "border-accent bg-accent text-primary-contrast"
                : "border-border text-muted hover:text-accent"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M3 1.5h10a.5.5 0 0 1 .5.5v12.5L8 11l-5.5 3.5V2a.5.5 0 0 1 .5-.5z" />
            </svg>
          </button>
        </div>
      </header>

      {result.indonesianTranslation && (
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Terjemahan Indonesia / Indonesian translation
          </p>
          <p className="mt-1 text-2xl font-semibold text-accent">
            {result.indonesianTranslation}
          </p>
          {result.direction === "id-en" && (
            <p className="mt-1 text-sm text-muted">
              Dicari dari kata / Searched from: “{result.query}”
            </p>
          )}
        </div>
      )}

      {entry.meanings.map((meaning, mi) => {
        const synonyms = Array.from(
          new Set([...meaning.synonyms, ...meaning.definitions.flatMap((d) => d.synonyms)])
        ).slice(0, 12);
        const antonyms = Array.from(
          new Set([...meaning.antonyms, ...meaning.definitions.flatMap((d) => d.antonyms)])
        ).slice(0, 12);
        return (
          <section key={`${meaning.partOfSpeech}-${mi}`} className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-display text-xl font-semibold italic">
                {meaning.partOfSpeech}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <ol className="list-decimal space-y-2 pl-5">
              {meaning.definitions.slice(0, 5).map((def, di) => (
                <li key={di} className="leading-relaxed">
                  {def.definition}
                  {def.example && (
                    <p className="mt-1 text-sm italic text-muted">
                      “{def.example}”
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {synonyms.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-muted">
                  Sinonim / Synonyms:
                </span>
                {synonyms.map((s) => (
                  <WordChip key={s} word={s} kind="synonym" onSelect={onSelectWord} />
                ))}
              </div>
            )}
            {antonyms.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-muted">
                  Antonim / Antonyms:
                </span>
                {antonyms.map((a) => (
                  <WordChip key={a} word={a} kind="antonym" onSelect={onSelectWord} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </article>
  );
}
