# Vassal's Edge — *The Fall of Vareth-Ghar*

A browser dungeon crawler in the King's Field II line, remade on **three.js r185** with the Retro Forge PSX pipeline,
with a **Blender model pipeline** for every creature, weapon, armour piece and key item.

Seven seamless regions, one key-lock chain, eight enemy archetypes and a boss, five NPCs with branching dialogue,
a trader and a forge, seven in-engine cutscenes, sixteen weapons and armour pieces, and a save system.

```
npx http-server . -p 8080 -c-1        # or: python3 -m http.server 8080
open http://localhost:8080/
```

ES modules need an http server; nothing else is fetched. three.js is vendored under `vendor/` (MIT, see `vendor/THREE-LICENSE`).

## The constraint budget (the spec)

| dial | value |
|---|---|
| res | short side 240 virtual px, integer upscale, letterboxed remainder |
| color | RGB555 (32 levels/channel) + canonical 4×4 Bayer, in display space, at res |
| vertex | snapped to the virtual pixel grid in NDC (w ≤ 0 guarded) |
| surface | affine UVs, nearest filtering, 64 px per game-metre, every box tessellated to ≤ 0.5 m quads |
| light | per-vertex Gouraud, 4 point lights (torch + 3 per zone) + ambient + emissive, linear hard fog |
| signal | CRT TV: barrel 0.045, scanlines 0.28, aperture mask (≥ 3× only), chroma 0.6, vignette 0.28 |
| anachronism | one, deliberate: real-time halation on the Pale Crystal sources |

Every one of these lives in `src/spec.js` and `src/engine/retro.js`; the SETTINGS tab can switch the signal chain
and the snap off (the accessibility escape hatch), and `prefers-reduced-motion` disables jitter and shake.

## What is in the world

**Regions.** The Ash-Girt Shore (belltower, forge, pier, wreck, cove) · the Tide-Warden's Shrine (new) · the Sunken
Cloister of Saint Vael (with the drained alcove, new) · the High Citadel lower gallery · the Iron Cistern · the
Crystal Sepulchre · the Moon Gate hall (new).

**The chain.** Cistern Key on the drowned bishop (he rises when you take it) → Ser Aldous gives the Tide-Warden's
Seal → the Seal opens the Shrine (Bell Clapper, Warden's Spear, Seer's Tincture) → the Clapper rings the bell, which
drains the Cloister (Warden's Plate, Moonfall scroll) → the Cistern door, the lift, the Sepulchre → the Moon-Sealed
Key wakes the Hollowed King → his fall opens the throne wall → the Moon Gate ends the game.

**NPCs.** Cinder the Seer (lore, the Ember Lance scroll, a hood after the bell) · Garrick the Blacksmith (Ember
Bread, a forge: Moon-Veined Ore → +5 attack per heat, five times) · Old Mael the Tide-Warden (a ghost; trades
pearls for consumables, the Tidewrought Dagger, Kelp Bracers, the Stone Ward scroll, the Sea-Glass Lens which
shows illusion walls) · Ser Aldous (a cutscene, the Seal) · the kneeling bishop.

**Enemies.** Tarnished Sentry (raises its guard against a swing it sees coming) · Hollowed Mariner · Barnacle
Crawler (lunges, shrugs off points, hates hammers) · Hollow Bowman (keeps range, arrows) · Drowned Bishop (water
bolts) · Bile-Bloated Husk (bursts into Rot) · Pale Wisp (hovers, blinks away from blades, void bolts) · **The
Hollowed King** (boss: three phases, stagger armour, light bolts, drops Orlan's Signet and Astraea's Edge).

**Weapons.** Pale Crystal Blade, Rusted Sentry Blade, Seaspray Rapier, Tidewrought Dagger (bleeds), Notched
Falchion, Bell-Ringer's Maul (crush), Tide-Warden's Spear (2.8 m reach), Astraea's Edge. Three swing types
(slash, thrust, crush) with their own view-model animation and hit test.

**Armour.** Kettle Helm, Horned Reaver Helm, Seer's Hood (+MND), Wanderer's Coat, Barnacle Hauberk, Tide-Warden's
Plate (water resist), Drowned Gauntlets, Kelp Bracers (+AGI), Pilgrim's Sandals, Sentry Greaves; rings: the
Sovereign Ring, Orlan's Signet.

**Items and key items.** Moon-Lily Extract, Ash-Girt Salt, Tide-Water Phial, Ember Bread, Seer's Tincture; six
scrolls; Cistern Key, Moon-Sealed Key, Tide-Warden's Seal, Bell Clapper, Sea-Glass Lens, Moon-Veined Ore, Drowned
Pearls. Three chests with swinging lids.

**Systems.** Rig-based animation clips (`src/data/anim.js`: idle/walk/windup/swing/recover/stagger/cast/guard/lunge/
death per archetype, crossfaded), a dialogue runtime with branches, choices, trade and forge nodes
(`src/data/dialogue.js`), a cutscene system with camera rails, captions and actor hooks (`src/data/cutscenes.js`),
zone-driven lighting and ambience, Web Audio synthesis for everything, a bestiary that fills in as you meet things,
and Save Crystals that write to `localStorage`.

**Non-negotiables kept from the original design.** No minimap, no markers, no quest log. No press-start prompt, no
sting. Damage is `(stam/max)^1.8`, staggering only at full stamina. Turn rate `R = (45 + 1.5·AGI)(1 − 0.5·L²)`.
Enemy meshes hang off rig sockets; animation, hit tint and dissolve drive the sockets.

## Controls

| | |
|---|---|
| keyboard / mouse | click to lock the mouse · W/S move · A/D turn · Q/E strafe · I/K look · Space / LMB attack · Shift / RMB / B block · F interact / talk · R cast · Tab or 1–6 ready a spell · M / Esc menu · C CRT · V map check · ` debug |
| gamepad | L-stick move · R-stick look · LB/RB strafe · RT / X attack · LT / B block · A interact · Y cast · Start menu · Back CRT |
| touch | left stick move · drag right side to look · ATTACK / BLOCK (hold) / USE / CAST |

## The model pipeline (Blender)

Models are packed as base64 int16 millimetre positions + uint16 indices, one part per rig socket
(`MODEL_DATA[model][part] = { a, c, v, i }`). Two builders share one declarative spec:

- `tools/models_spec.py` — every v2 model as primitives (box, cylinder, lathe, blade) in socket-local millimetres.
- `tools/bake_models.py` — pure Python; bakes the spec to `models/models_v2.json` and regenerates `src/data/models.js`
  (merged with the 14 v1 models that were authored in Blender for the original build). Run: `npm run models`.
- `tools/blender/build_models.py` — the same spec built as editable Blender objects (one object per part, a parent
  Empty per model, socket and colour stored as custom properties), exporting the identical JSON:

  ```
  blender -b -P tools/blender/build_models.py -- --out models/models_v2.json --blend models/vareth_models.blend
  ```

  Edit a part in Blender, keep its `socket` / `colour` properties, re-export, re-run `npm run models`. The loader
  needs no changes; unknown colour keys fall back to stone.

50 models, 162 parts, ~6.7k triangles in total.

## Tests

```
npm run check      # syntax of every module · model bake · headless playthrough · screenshots + validators
npm run shots      # screenshots of every region, the menu, a dialogue, a cutscene, the boss
```

`tools/playthrough.cjs` drives the whole key-lock chain end to end in headless Chromium (SwiftShader WebGL2) and
fails on any wrong state or page error; `tools/screenshot.cjs` runs the two in-game validators bound to **V**:

- `validateMap()` — fixpoint flood-fill from spawn on a 0.25 m grid using the real collider; mechanisms (trap,
  illusion wall, lever→gate, grate, key→door, ember→timber, seal→shrine, clapper→bell→alcove, moon key→king→gate)
  fire only from cells already proven reachable. 21 objectives, all must resolve.
- `auditLayout()` — headroom ≥ 2.2 m on every walkable cell; every prop-sized box rests on a floor or another box.

## Layout

```
index.html                 DOM shell (HUD, dialogue box, boss bar, boot screens, menu, touch overlay)
src/spec.js                every tunable
src/engine/                retro.js (pipeline + PSX material) · textures.js · models.js (loader) · level.js (boxes, floors, colliders)
src/data/                  items · spells · bestiary · dialogue · cutscenes · anim clips · models (generated)
src/world/                 build.js (the map, placements) · validate.js
src/systems/               player · combat · enemies · anim · magic · npcs · interact · scripts (dialogue) · cutscenes · worldsys · audio · save
src/ui/                    hud · menu · map
src/boot.js · input.js · main.js
tools/                     models_spec.py · bake_models.py · blender/build_models.py · check.cjs · playthrough.cjs · screenshot.cjs
docs/ORIGINAL_HANDOFF.md   the handoff this remake started from
```
