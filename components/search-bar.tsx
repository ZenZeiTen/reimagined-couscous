"use client";

import type { Direction } from "@/lib/types";

export default function SearchBar({
  query,
  onQueryChange,
  direction,
  onDirectionChange,
  suggestion,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  suggestion: Direction | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm">
        <span className="pl-2 text-muted" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Cari kata... / Search a word..."
          aria-label="Cari kata / Search a word"
          className="w-full bg-transparent py-2 text-lg outline-none placeholder:text-muted"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => onDirectionChange(direction === "en-id" ? "id-en" : "en-id")}
          title="Ganti arah bahasa / Switch language direction"
          className="whitespace-nowrap rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-contrast transition hover:opacity-90"
        >
          {direction === "en-id" ? "EN → ID" : "ID → EN"}
        </button>
      </div>
      {suggestion && suggestion !== direction && (
        <button
          type="button"
          onClick={() => onDirectionChange(suggestion)}
          className="text-sm text-accent underline underline-offset-2"
        >
          {suggestion === "id-en"
            ? "Sepertinya ini kata Indonesia — cari sebagai ID → EN? / Looks Indonesian — search as ID → EN?"
            : "Sepertinya ini kata Inggris — cari sebagai EN → ID? / Looks English — search as EN → ID?"}
        </button>
      )}
    </div>
  );
}
