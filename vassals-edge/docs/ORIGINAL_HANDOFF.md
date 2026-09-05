# Vassal's Edge — *The Fall of Vareth-Ghar*
## Handoff for Claude Code / Claude Design

A browser dungeon crawler in the King's Field II line. One self-contained HTML file, Three.js r128, deliberate PSX-era rendering. Everything below describes the build as it actually stands, including what is unfinished and where it broke.

---

## 1. What you are getting

```
vareth-handoff/
  vareth_phase1_core_feel.html   the game — open in a browser, nothing else needed (216 KB)
  models/
    models_v1_embedded.json      the 14 Blender models currently baked into the file
    models_v2_INCOMPLETE_...     first third of the upgraded model set (see §6 — DO NOT ship as-is)
  harnesses/                     12 headless test harnesses + 3 jsdom boot tests + package.json
  patches/                       the six patch scripts that built phases 2–6 and the model pass
  HANDOFF.md                     this file
```

`main.js` is not included because it is generated: extract it from the HTML when you need to syntax-check.

```bash
python3 -c "import re;s=open('vareth_phase1_core_feel.html').read();open('main.js','w').write(re.findall(r'<script>(.*?)</script>',s,re.S)[-1])"
node --check main.js
```

For the harnesses: `cd harnesses && npm i` (three@0.128.0, jsdom@24), then copy `main.js` alongside them.

---

## 2. State by phase

| Phase | Scope | State |
|---|---|---|
| 1 | Weighted first-person controller, stamina swing arcs, test room | done |
| 2 | Five seamless regions, key–lock loops, doors, lift, water, ladders | done |
| 3 | Four-archetype bestiary, projectiles, five elemental spells, scrolls | done |
| 4 | Web Audio: buses, zone ambience, generated reverb, surfaces, feedback | done |
| Boot | Studio card → prologue → title card → menu → oath → world | done |
| Models | Blender-authored enemies, weapons, items, props | v1 shipped; v2 upgrade **incomplete** |

Not started: save system (Continue is hidden on the title because no save exists), environment architecture beyond greybox, real audio assets.

---

## 3. Non-negotiables

These came from the design documents and from RSA's corrections. Breaking them breaks the game's identity.

- **No minimap, no markers, no quest log.** The compass and the explored-only MAP page are the limit. The HUD-map toggle in SETTINGS is labelled "against the design" on purpose.
- **No press-start prompt, no musical sting, no glow or drop shadow on text.** Silence is the sting.
- **Damage is `(stam/max)^1.8`** in the engine, and staggering only at 100% stamina. Two source documents disagree; the engine's value wins.
- **Turn rate `R = (45 + 1.5·AGI)(1 − 0.5·L²)`.** The doc's flat 30°/s cap above 70% load exists only as `SPEC.formula.hardCapAbove70`, default `false`.
- **The one deliberate anachronism** is the halation bloom on crystals. Everything else obeys the 240 px virtual resolution, RGB555 + Bayer dither, NDC vertex snap, affine UVs, Gouraud lighting.
- **Enemy meshes hang off rig sockets** (`P.torso`, `P.head`, `P.armL/R`, `P.legL/R`, `P.pelvis`). Animation, hit tint and dissolve drive the sockets. Replace a mesh, never a socket.

---

## 4. The pipeline that kept this correct

Every change went through this. It caught real bugs repeatedly; I recommend keeping it.

1. Python patch script with `assert s.count(a) == 1` guards — no blind replacements.
2. Extract `main.js`, `node --check`.
3. Run the relevant harness (stub DOM/renderer/AudioContext, real Three.js).
4. Full regression sweep: every harness must print `^OK`.
5. Only then stage the file.

**In-game validators, bound to `V`:**

- `validateMap()` — fixpoint flood-fill from spawn on a 0.25 m grid using the real collider. Mechanisms (trap, illusion wall, lever→gate, grate, key→door, ember→timber) fire *only* from cells already proven reachable. 16 objectives, all must resolve.
- `auditLayout()` — headroom ≥ 2.2 m on every walkable cell, and every prop-sized box must rest on a floor or another box.

Bugs these caught that a screenshot would have missed: the Crystal Sepulchre overlapping the Cloister above it, barrels sealing the wreck interior, the stair passage too short for the player body.

---

## 5. Architecture quick map

Search these strings in the HTML to land in the right place.

| Section | Anchor |
|---|---|
| Tunables and formulas | `const SPEC = {` |
| Rendering (snap, affine, dither, CRT) | `Retro Forge` |
| World geometry, zones, key–lock chain | `PHASE 2 — WORLD INTERCONNECTIVITY` |
| Blender model data + loader | `const MODEL_DATA =` / `function partGeometry` |
| Bestiary table | `const BEST = {` |
| Shared enemy FSM | `function updateEnemy` |
| Spells | `const SPELLS = {` / `function updateMagic` |
| Audio | `const AUDIO = {` — zone table is `AUDIO.AMB` |
| Boot sequence | `const BOOT = {` — prologue shots in `const SHOTS = [` |
| Validators | `function validateMap` / `function auditLayout` |

The frame loop is `frameInner`, wrapped by `frame` which catches exceptions, prints them to the hint line, and bails to the title after three consecutive failures rather than leaving a dead screen.

---

## 6. Unfinished work — read before touching models

I was mid-way through a second model pass when the session ended. **The upgraded models are not in the game.** The shipped file still carries the v1 set (14 models, 55 parts, 2,200 tris).

What exists:

- The Blender build script for v2 ran successfully and produced 10 upgraded models — Moonlight-lineage Pale Crystal Blade with wave guard and pommel gem, swept-hilt rapier with cup guard and knuckle bow, notched falchion, horned kettle helm, barnacled hauberk, a heavier Sentry with fauld lames and lamellar pauldrons, plus Cinder, Garrick, King Orlan and the drowned bishop as proper NPC models. Total 6,112 tris; per your instruction, only the character models were budgeted.
- `models/models_v2_INCOMPLETE_chunk1of3.txt` holds **only the first third** of that JSON. Chunks 2 and 3 were never transcribed. The file is truncated mid-string and will not parse.

Because Blender globals do not persist between calls and the geometry only reaches me through tool results, the reliable path forward is to **re-run the v2 Blender script and write the JSON directly to disk on your machine**, rather than trying to repair the partial chunk:

```python
# at the end of the v2 build script, instead of returning JSON in the result:
import json, pathlib
pathlib.Path(r"C:\path\to\models_v2.json").write_text(json.dumps(data, separators=(',',':')))
```

Then swap `MODEL_DATA` in the HTML for the new file's contents. The loader needs no changes — same base64 int16 mm + uint16 index format, same `{a: attach, c: colour, v, i}` shape. Add the new part names (`fuller`, `pommel`, `horns`, `rings`, `barnacles`) to `MODEL_COLORS` if you want distinct tints; unknown names fall back to stone.

Two integration notes for the NPC models (`cinder`, `garrick`, `king`, `bishop_corpse`): they are built as single `root`-attached props, so they drop in via `modelGroup(name)` replacing the hand-built box groups currently at the belltower, the anvil, the throne and the altar. Garrick's `arm` part attaches to a socket so the existing hammer loop keeps driving it.

**Re-run `V` after any model change.** That is exactly how the barrels-sealing-the-wreck bug surfaced.

---

## 7. Other open threads

- **Audio assets.** Everything is synthesised. If you want ElevenLabs material, the format decision is still open: base64-embedded keeps the single file but pushes it past 6 MB, or a project folder with an `audio/` directory and a loader that falls back to the synth per missing cue. The second is the better shape once this leaves the artifact sandbox.
- **Save system.** `prologue_seen` is session-only because the sandbox forbids storage. Wire it and the Save Crystals to `localStorage` and un-hide Continue.
- **Spec open items.** Studio name and mark (placeholder "PALE COURT" and a quartz diamond), serif typeface licence, whether the oath name stays free-text.
- **Never visually reviewed at 320×240 with snap on:** the Sentry crest and visor slit, the rapier guard. They may read as noise; rebuild chunkier if so.
- **Not audited automatically:** rotated meshes (the stair ramp and its roof) and posed Groups. Clearance there is by construction only.

---

## 8. Sandbox limitations that shaped decisions

Worth knowing so you don't repeat the diagnosis. The artifact preview blocks pointer lock and `getGamepads` (both wrapped in try/catch), forbids `localStorage`, and only allows cdnjs — which is why Three.js r128 is pinned there and why every asset is procedural. In a normal browser tab these all work; if the game misbehaves in a preview pane, try a real tab before debugging the code.
