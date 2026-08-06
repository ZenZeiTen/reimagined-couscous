"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "sepia";
export type FontChoice = "sans" | "serif" | "mono";

export const THEME_KEY = "kamus-theme";
export const FONT_KEY = "kamus-font";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [font, setFontState] = useState<FontChoice>("sans");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY) as Theme | null;
    const storedFont = window.localStorage.getItem(FONT_KEY) as FontChoice | null;
    if (storedTheme) setThemeState(storedTheme);
    if (storedFont) setFontState(storedFont);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {}
  }, []);

  const setFont = useCallback((next: FontChoice) => {
    setFontState(next);
    document.documentElement.dataset.font = next;
    try {
      window.localStorage.setItem(FONT_KEY, next);
    } catch {}
  }, []);

  return { theme, setTheme, font, setFont };
}
