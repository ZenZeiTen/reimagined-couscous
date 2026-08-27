# Kamus Dwibahasa / Bilingual Indonesian–English Dictionary

**ID:** Aplikasi web kamus dwibahasa Indonesia–Inggris full-stack, dibangun dengan Next.js (App Router), TypeScript, dan Tailwind CSS.
**EN:** A full-stack bilingual Indonesian–English dictionary web app built with Next.js (App Router), TypeScript, and Tailwind CSS.

## URL

- **Produksi (Vercel) / Production (Vercel):** https://vercel-sandbox-default-project-rho-indol.vercel.app
- **Proyek v0 / v0 project:** https://v0.app/admin-69517516s-projects/chat/kamus-dwibahasa-id-en-bilingual-dictionary-m9hkMGznFI3

> **ID:** Jika URL produksi meminta login, nonaktifkan "Vercel Authentication" pada Settings → Deployment Protection proyek `vercel-sandbox-default-project`.
> **EN:** If the production URL asks for a login, disable "Vercel Authentication" under Settings → Deployment Protection of the `vercel-sandbox-default-project` project.

## Fitur / Features

1. **ID:** Pencarian instan dengan debouncing 350 ms dan sakelar arah EN→ID / ID→EN (dengan saran deteksi bahasa otomatis). / **EN:** Instant search with 350 ms debouncing and an EN→ID / ID→EN direction toggle (with auto language-detection suggestions).
2. **ID:** Definisi lengkap: fonetik, tombol audio pelafalan (HTML5 Audio), kelas kata, contoh kalimat, chip sinonim/antonim yang dapat diklik, plus terjemahan Indonesia yang ditampilkan menonjol. / **EN:** Rich definitions: phonetics, audio pronunciation toggle (HTML5 Audio), parts of speech, example sentences, clickable synonym/antonym chips, plus a prominently displayed Indonesian translation.
3. **ID:** Tiga tema — Terang, Gelap, dan mode kustom "Sepia/Buku" — plus pengalih jenis huruf (Sans/Serif/Mono), semuanya tersimpan di localStorage tanpa kedipan saat reload. / **EN:** Three themes — Light, Dark, and a custom "Sepia/Book" mode — plus font-family toggles (Sans/Serif/Mono), all persisted to localStorage with no flash on reload.
4. **ID:** Riwayat pencarian (maks 10, dapat diklik, tombol hapus) dan bookmark kata beserta terjemahannya, tersinkron ke localStorage. / **EN:** Search history (max 10, clickable, clear button) and word bookmarks with their translations, synced to localStorage.
5. **ID:** "Kata Hari Ini / Word of the Day" interaktif di beranda — dipilih deterministik per tanggal dari daftar 50 kata kurasi, diambil live dari API. / **EN:** An interactive "Word of the Day" homepage component — picked deterministically per date from a 50-word curated list, fetched live from the API.
6. **ID:** UI dwibahasa penuh (semua label, tombol, dan pesan dalam bahasa Indonesia dan Inggris). / **EN:** Fully bilingual UI (every label, button, and message in both Indonesian and English).

## Sumber data / Data sources

- [Free Dictionary API](https://dictionaryapi.dev) — entri Inggris (fonetik, audio, definisi, sinonim, antonim) / English entries (phonetics, audio, definitions, synonyms, antonyms)
- [MyMemory Translation API](https://mymemory.translated.net) — terjemahan EN↔ID / EN↔ID translation

## Menjalankan secara lokal / Run locally

```bash
npm install
npm run dev
```
