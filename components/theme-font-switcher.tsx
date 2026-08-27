"use client";

import { useTheme, type FontChoice, type Theme } from "@/hooks/use-theme";

const THEMES: { value: Theme; label: string; title: string }[] = [
  { value: "light", label: "☀️", title: "Terang / Light" },
  { value: "sepia", label: "📜", title: "Sepia (Buku / Book)" },
  { value: "dark", label: "🌙", title: "Gelap / Dark" },
];

const FONTS: { value: FontChoice; label: string; title: string }[] = [
  { value: "sans", label: "Aa", title: "Sans-serif" },
  { value: "serif", label: "Aa", title: "Serif" },
  { value: "mono", label: "Aa", title: "Monospace" },
];

export default function ThemeFontSwitcher() {
  const { theme, setTheme, font, setFont } = useTheme();

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Pengaturan tema dan huruf / Theme and font settings">
      <div className="flex rounded-full border border-border bg-surface p-1" role="radiogroup" aria-label="Tema warna / Color theme">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={theme === t.value}
            title={t.title}
            onClick={() => setTheme(t.value)}
            className={`rounded-full px-2.5 py-1 text-sm transition ${
              theme === t.value ? "bg-primary text-primary-contrast" : "hover:bg-surface-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex rounded-full border border-border bg-surface p-1" role="radiogroup" aria-label="Jenis huruf / Font family">
        {FONTS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={font === f.value}
            title={f.title}
            onClick={() => setFont(f.value)}
            className={`rounded-full px-2.5 py-1 text-sm transition ${
              font === f.value ? "bg-primary text-primary-contrast" : "hover:bg-surface-2"
            } ${f.value === "serif" ? "font-serif" : f.value === "mono" ? "font-mono" : "font-sans"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
