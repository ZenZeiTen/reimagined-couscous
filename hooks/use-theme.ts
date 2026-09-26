"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "sepia";
export type FontChoice = "sans" | "serif" | "mono";

export const THEME_KEY = "kamus-theme";
export const FONT_KEY = "kamus-font";

const THEMES: readonly Theme[] = ["light", "dark", "sepia"];
const FONTS: readonly FontChoice[] = ["sans", "serif", "mono"];

const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);
const isFont = (v: unknown): v is FontChoice => FONTS.includes(v as FontChoice);

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [font, setFontState] = useState<FontChoice>("sans");

  // The inline script in app/layout.tsx has already validated localStorage
  // and applied the result to <html> before hydration, so the document is
  // the source of truth here. Reading it (rather than localStorage again)
  // also avoids throwing where storage access is blocked.
  useEffect(() => {
    const { theme: t, font: f } = document.documentElement.dataset;
    if (isTheme(t)) setThemeState(t);
    if (isFont(f)) setFontState(f);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the theme still applies.
    }
  }, []);

  const setFont = useCallback((next: FontChoice) => {
    setFontState(next);
    document.documentElement.dataset.font = next;
    try {
      window.localStorage.setItem(FONT_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the font still applies.
    }
  }, []);

  return { theme, setTheme, font, setFont };
}
