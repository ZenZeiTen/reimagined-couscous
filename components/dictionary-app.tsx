"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BookmarksPanel from "./bookmarks-panel";
import DefinitionCard from "./definition-card";
import EmptyState from "./empty-state";
import HistoryPanel from "./history-panel";
import SearchBar from "./search-bar";
import SkeletonLoader from "./skeleton-loader";
import ThemeFontSwitcher from "./theme-font-switcher";
import WordOfTheDay from "./word-of-the-day";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  NetworkError,
  WordNotFoundError,
  looksIndonesian,
  lookupWord,
} from "@/lib/api";
import type {
  BookmarkItem,
  Direction,
  HistoryItem,
  LookupResult,
} from "@/lib/types";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: LookupResult }
  | { status: "not-found"; query: string }
  | { status: "error"; word: string; dir: Direction; network: boolean };

const HISTORY_LIMIT = 10;

export default function DictionaryApp() {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<Direction>("en-id");
  const debouncedQuery = useDebounce(query, 350);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [history, setHistory] = useLocalStorage<HistoryItem[]>(
    "kamus-history",
    []
  );
  const [bookmarks, setBookmarks] = useLocalStorage<BookmarkItem[]>(
    "kamus-bookmarks",
    []
  );
  const abortRef = useRef<AbortController | null>(null);

  const suggestion: Direction | null = query.trim()
    ? looksIndonesian(query)
      ? "id-en"
      : "en-id"
    : null;

  const addToHistory = useCallback(
    (word: string, dir: Direction) => {
      setHistory((prev) => {
        const filtered = prev.filter(
          (h) => h.word.toLowerCase() !== word.toLowerCase()
        );
        return [{ word, direction: dir, at: Date.now() }, ...filtered].slice(
          0,
          HISTORY_LIMIT
        );
      });
    },
    [setHistory]
  );

  const runSearch = useCallback(
    (word: string, dir: Direction) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearch({ status: "loading" });
      lookupWord(word, dir, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setSearch({ status: "ready", result });
          // Skip 1-character intermediate queries so typing doesn't pollute history.
          if (word.trim().length >= 2) addToHistory(word.trim(), dir);
        })
        .catch((err) => {
          if (controller.signal.aborted || err?.name === "AbortError") return;
          if (err instanceof WordNotFoundError) {
            setSearch({ status: "not-found", query: word.trim() });
          } else {
            setSearch({
              status: "error",
              word,
              dir,
              network: err instanceof NetworkError,
            });
          }
        });
    },
    [addToHistory]
  );

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      setSearch({ status: "idle" });
      return;
    }
    runSearch(trimmed, direction);
  }, [debouncedQuery, direction, runSearch]);

  const selectWord = useCallback((word: string, dir: Direction = "en-id") => {
    setDirection(dir);
    setQuery(word);
  }, []);

  const toggleBookmark = useCallback(
    (result: LookupResult) => {
      setBookmarks((prev) => {
        const exists = prev.some(
          (b) => b.word.toLowerCase() === result.englishWord.toLowerCase()
        );
        if (exists) {
          return prev.filter(
            (b) => b.word.toLowerCase() !== result.englishWord.toLowerCase()
          );
        }
        return [
          {
            word: result.englishWord,
            translation: result.indonesianTranslation,
            direction: result.direction,
            at: Date.now(),
          },
          ...prev,
        ];
      });
    },
    [setBookmarks]
  );

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-primary">
            📖 Kamus Dwibahasa
          </h1>
          <p className="text-sm text-muted">
            Indonesia – Inggris / Indonesian – English Dictionary
          </p>
        </div>
        <ThemeFontSwitcher />
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr_16rem]">
        <aside className="order-2 lg:order-1">
          <HistoryPanel
            items={history}
            onSelect={(item) => selectWord(item.word, item.direction)}
            onClear={() => setHistory([])}
          />
        </aside>

        <main className="order-1 space-y-6 lg:order-2">
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            direction={direction}
            onDirectionChange={setDirection}
            suggestion={suggestion}
          />

          {search.status === "idle" && (
            <WordOfTheDay onOpen={(word) => selectWord(word, "en-id")} />
          )}
          {search.status === "loading" && <SkeletonLoader />}
          {search.status === "not-found" && <EmptyState query={search.query} />}
          {search.status === "error" && (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center">
              <p className="text-3xl">⚠️</p>
              <p className="mt-2 font-semibold">
                Terjadi kesalahan / Something went wrong
              </p>
              <p className="mt-1 text-sm text-muted">
                {search.network
                  ? "Layanan kamus sedang tidak dapat dijangkau. Periksa koneksi Anda atau coba lagi sebentar lagi. / The dictionary service is unreachable. Check your connection or try again shortly."
                  : "Terjadi kesalahan tak terduga. Silakan coba lagi. / An unexpected error occurred. Please try again."}
              </p>
              <button
                type="button"
                onClick={() => runSearch(search.word, search.dir)}
                className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast transition hover:opacity-90"
              >
                Coba lagi / Try again
              </button>
            </div>
          )}
          {search.status === "ready" && (
            <DefinitionCard
              result={search.result}
              bookmarked={bookmarks.some(
                (b) =>
                  b.word.toLowerCase() ===
                  search.result.englishWord.toLowerCase()
              )}
              onToggleBookmark={() => toggleBookmark(search.result)}
              onSelectWord={(word) => selectWord(word, "en-id")}
            />
          )}
        </main>

        <aside className="order-3">
          <BookmarksPanel
            items={bookmarks}
            onSelect={(item) => selectWord(item.word, "en-id")}
            onRemove={(word) =>
              setBookmarks((prev) =>
                prev.filter((b) => b.word.toLowerCase() !== word.toLowerCase())
              )
            }
          />
        </aside>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted">
        Data: Free Dictionary API &amp; MyMemory Translation API · Tema &amp;
        bookmark tersimpan di peramban Anda / Themes &amp; bookmarks are stored
        in your browser
      </footer>
    </div>
  );
}
