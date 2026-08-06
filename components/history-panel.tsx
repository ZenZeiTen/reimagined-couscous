"use client";

import type { HistoryItem } from "@/lib/types";

export default function HistoryPanel({
  items,
  onSelect,
  onClear,
}: {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          🕘 Riwayat / History
        </h3>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-accent underline underline-offset-2"
          >
            Hapus riwayat / Clear history
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Belum ada pencarian. / No searches yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={`${item.word}-${item.at}`}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-2"
              >
                <span className="capitalize">{item.word}</span>
                <span className="text-xs text-muted">
                  {item.direction === "en-id" ? "EN→ID" : "ID→EN"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
