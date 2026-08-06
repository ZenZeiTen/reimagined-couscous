import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kamus Dwibahasa — Indonesian–English Dictionary",
  description:
    "Kamus daring dwibahasa Indonesia–Inggris / Bilingual Indonesian–English online dictionary with phonetics, audio, synonyms, antonyms, themes, and Word of the Day.",
};

const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem("kamus-theme");
    var f = localStorage.getItem("kamus-font");
    if (t === "light" || t === "dark" || t === "sepia") document.documentElement.dataset.theme = t;
    if (f === "sans" || f === "serif" || f === "mono") document.documentElement.dataset.font = f;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-theme="light" data-font="sans" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
