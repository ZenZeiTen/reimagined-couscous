"use client";

import type { BookmarkItem } from "@/lib/types";

export default function BookmarksPanel({
  items,
  onSelect,
  onRemove,
}: {
  items: BookmarkItem[];
  onSelect: (item: BookmarkItem) => void;
  onRemove: (word: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
        🔖 Tersimpan / Bookmarks
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Belum ada kata tersimpan. / No bookmarked words yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li
              key={item.word}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-surface-2"
            >
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex-1 text-left"
              >
                <span className="capitalize">{item.word}</span>
                {item.translation && (
                  <span className="ml-2 text-sm text-accent">
                    {item.translation}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.word)}
                aria-label={`Hapus ${item.word} / Remove ${item.word}`}
                className="text-muted transition hover:text-accent"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
