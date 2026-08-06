"use client";

import { useEffect, useState } from "react";
import { lookupWordOfTheDay } from "@/lib/api";
import { wordOfTheDay } from "@/lib/word-of-the-day";
import type { LookupResult } from "@/lib/types";

export default function WordOfTheDay({
  onOpen,
}: {
  onOpen: (word: string) => void;
}) {
  const [word, setWord] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const todayWord = wordOfTheDay();
    setWord(todayWord);
    const controller = new AbortController();
    lookupWordOfTheDay(todayWord, controller.signal)
      .then((res) => {
        setResult(res);
        setState("ready");
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, []);

  const preview =
    result?.entries[0]?.meanings[0]?.definitions[0]?.definition ?? "";
  const phonetic =
    result?.entries[0]?.phonetic ??
    result?.entries[0]?.phonetics.find((p) => p.text)?.text ??
    "";

  return (
    <section className="rounded-2xl border border-accent/40 bg-surface p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">
        ✨ Kata Hari Ini / Word of the Day
      </p>
      {state === "loading" && (
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-8 w-40 rounded bg-surface-2" />
          <div className="h-4 w-full rounded bg-surface-2" />
        </div>
      )}
      {state === "error" && (
        <p className="mt-3 text-sm text-muted">
          Gagal memuat kata hari ini. / Failed to load today’s word.
        </p>
      )}
      {state === "ready" && result && (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-3xl font-bold capitalize">{word}</h2>
            {phonetic && <span className="text-primary">{phonetic}</span>}
          </div>
          {result.indonesianTranslation && (
            <p className="mt-1 text-lg font-semibold text-accent">
              {result.indonesianTranslation}
            </p>
          )}
          {preview && <p className="mt-2 leading-relaxed text-muted">{preview}</p>}
          <button
            type="button"
            onClick={() => onOpen(word)}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast transition hover:opacity-90"
          >
            Lihat entri lengkap / View full entry →
          </button>
        </>
      )}
    </section>
  );
}
