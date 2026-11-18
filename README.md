> **This repository has moved.** It now lives in [ZenZeiTen/synthapps](https://github.com/ZenZeiTen/synthapps) at three folders: [`kamus-dwibahasa/`](https://github.com/ZenZeiTen/synthapps/tree/main/kamus-dwibahasa) (the dictionary app), [`raycaster/`](https://github.com/ZenZeiTen/synthapps/tree/main/raycaster) (the game engine) and [`lang-forge/`](https://github.com/ZenZeiTen/synthapps/tree/main/lang-forge) (the language-design skill), with its full history.
> This copy is archived: it stays here for its issues, pull requests and releases, and it is no longer updated. Please open new issues and pull requests in synthapps.

# reimagined-couscous

Three independent pieces live in this repository:

| Path | What it is |
| --- | --- |
| `/` (root) | **Kamus Dwibahasa** — a bilingual Indonesian–English dictionary web app (Next.js App Router, TypeScript, Tailwind CSS). See [APP.md](APP.md). |
| `raycaster/` | A standalone 3.5D raycasting game engine (TypeScript + HTML5 Canvas, Vite) with a Blender sprite pipeline and an ElevenLabs audio pipeline. See [raycaster/README.md](raycaster/README.md). |
| `lang-forge/` | **lang-forge**, a Claude skill for designing new programming languages end-to-end (intent → spec → grammar → semantics → implementation scaffold). See [lang-forge/README.md](lang-forge/README.md). |

`.claude/skills/raycaster-engine/` is a project skill distilled from the
raycaster engine; its `assets/engine-kernel/` is a trimmed, typechecked copy of
the engine core meant to be copied into new games.

## Dictionary app

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # ESLint (next/core-web-vitals + next/typescript)
npm run typecheck  # tsc --noEmit
npm run build
```

## Raycaster engine

```bash
cd raycaster
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # typecheck + vite build
```
