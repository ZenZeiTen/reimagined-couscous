"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * React state mirrored to localStorage.
 *
 * `isValid` guards against corrupted or foreign data under the same key
 * (e.g. an object where an array is expected); invalid values are ignored
 * and the initial value is kept.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  isValid?: (value: unknown) => value is T
) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (!isValid || isValid(parsed)) setValue(parsed as T);
      }
    } catch {
      // Ignore corrupted or inaccessible storage.
    }
    setHydrated(true);
    // `isValid` is expected to be a stable function; re-reading storage
    // whenever a caller passes a fresh closure would discard state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage may be unavailable (private mode); state still updates.
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set, hydrated] as const;
}
