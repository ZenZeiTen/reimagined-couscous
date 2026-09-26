# ElevenLabs audio pipeline

The engine resolves every sound through four layers, in order:

1. **Baked bank** — `public/audio/bank/manifest.json` plus MP3s produced by
   `bake_sound_bank.mjs`. This is the shipping path; no key reaches browsers.
2. **Persistent cache** — the browser Cache Storage API, keyed by a SHA-256 of
   the generation request.
3. **Live ElevenLabs generation** — only in development builds (`vite dev`)
   and only when `VITE_ELEVENLABS_API_KEY` is set. Production builds ignore
   the key and log a warning, because Vite would otherwise inline it into the
   bundle shipped to every player.
4. **RetroSynth** — procedural chip-tune style fallbacks rendered offline with
   Web Audio, so the game is always audible.

`sound_bank.spec.json` is the single source of truth for prompts and voice
lines. Both the runtime (`src/audio/AudioManager.ts`) and the bake script read
it, and both hash requests the same way, so a baked file and a cached live
generation of the same prompt share an identity.

## Baking

```bash
ELEVENLABS_API_KEY=sk_... npm run bake:audio            # everything that changed
node tools/audio/bake_sound_bank.mjs --dry-run           # show what would run
node tools/audio/bake_sound_bank.mjs --only pistol_fire,voice:intro --force
```

Generated MP3s are git-ignored; commit `manifest.json` only if you also ship
the files through another channel, otherwise leave the directory empty and the
runtime falls through to the cache/synth layers.
