# Audio

Contents:
1. [The unlock problem](#1-the-unlock-problem)
2. [Positional mixing](#2-positional-mixing)
3. [Ambient loops](#3-ambient-loops)
4. [Procedural retro sound](#4-procedural-retro-sound)
5. [Layering a real asset bank](#5-layering-a-real-asset-bank)
6. [Wiring audio into the game](#6-wiring-audio-into-the-game)

`assets/audio-kernel/` has this implemented: `PositionalAudio.ts` (mixing,
loops, unlock) and `RetroSynth.ts` (procedural sounds). Copy it as `src/audio/`.

---

## 1. The unlock problem

Browsers refuse to start an `AudioContext` outside a user gesture. So audio has
two phases: construct the manager whenever you like, but create the context in a
click or keypress handler.

```ts
overlay.addEventListener('click', async () => {
  await audio.unlock();          // creates or resumes the context
  engine.start();
});
```

**Drop sounds requested before unlock; don't queue them.** A queue means that
the instant the player clicks "start", every footstep and gunshot from the
loading sequence fires at once. Silence is the better failure.

The same gesture is the natural place to request pointer lock, so a single
"click to start" overlay solves both. That overlay is not a nicety — without it
there is no legal moment to start audio at all.

---

## 2. Positional mixing

Two effects sell position: distance attenuation and stereo panning.

```ts
const dx = v.x - listenerX, dy = v.y - listenerY;
const dist = Math.sqrt(dx * dx + dy * dy);
const atten = dist <= 0.5 ? 1 : clamp(1 - (dist - 0.5) / maxDistance, 0, 1);
v.gain.gain.value = v.volume * atten * atten;         // squared: near sources dominate

const fx = Math.cos(listenerAngle), fy = Math.sin(listenerAngle);
v.panner.pan.value = clamp(((fx * dy - fy * dx) / dist) * 0.8, -1, 1);
```

The pan term is the 2D cross product of the listener's forward vector with the
offset: positive means the source is on the listener's right. Deriving it this
way rather than from an angle difference avoids the wraparound bugs that make
sounds jump between ears as you cross north.

Cap the pan below 1.0 (0.8 works). Full hard-panning sounds like a fault in one
speaker rather than a sound in the world.

A `StereoPannerNode` is enough here. The full `PannerNode` HRTF path costs more
and buys little for a game whose world is flat.

**Re-mix live voices once per tick** against the current listener, or a long
sound stays glued to where the player was when it started.

Small touches that matter more than they should:

- **Pitch variance** of a few percent on repeated sounds (footsteps, gunshots)
  stops them sounding like a machine gun of identical samples.
- **Non-positional sounds** for the player's own actions. A sword swing panned
  by the player's own position is nonsense.

---

## 3. Ambient loops

A looping drone needs a handle, and the handle has one non-obvious requirement:
it must report **active** from the moment it is created, not from the moment
audio starts flowing.

```ts
export interface LoopHandle {
  readonly isPlaying: boolean;   // audio is actually flowing
  readonly isActive: boolean;    // created and not stopped — including while loading
  setVolume(volume: number, fadeSeconds?: number): void;
  setPosition(x: number, y: number): void;
  stop(fadeSeconds?: number): void;
}
```

The reason is a bug worth avoiding by construction: game code typically does
`if (!ambient?.isPlaying) startAmbience()` every tick. If the buffer resolves
asynchronously, `isPlaying` stays false for several frames and the loop is
started dozens of times, stacking copies until the mix clips. Checking
`isActive` starts exactly one.

Fade loops in and out with `linearRampToValueAtTime` rather than stopping them
outright; an ambience that cuts dead on a room transition is jarring.

---

## 4. Procedural retro sound

Rendering sounds from synth recipes means the game is audible with zero binary
assets — nothing to download, nothing to license, and no silent build while
someone finds sound effects.

A recipe is a list of segments: waveform, frequency sweep, duration, envelope,
optional low-pass and vibrato.

```ts
pistol_fire: {
  segments: [
    { wave: 'noise',  freq: 0,   duration: 0.18, gain: 0.9, release: 0.15, lowpass: 3500 },
    { wave: 'square', freq: 520, freqEnd: 70, duration: 0.14, gain: 0.5, release: 0.1 },
  ],
},
```

Rules of thumb that produce recognisable retro sounds:

- **Noise plus a pitch sweep** covers most impacts: noise is the transient, the
  downward sweep is the body. Gunshots, hits, doors.
- **Rising square/triangle arpeggios** read as pickups and success; falling ones
  read as damage and death.
- **Low-passed noise** is footsteps, wind, rumble. Cutoff sets the surface.
- **Ambience is layered low sines with slow vibrato at slightly detuned
  frequencies.** The beating between them is what stops a drone sounding like a
  test tone. Give ambient recipes no attack or release — envelope edges click
  audibly at the loop point.

Render deterministically (seed the noise from the sound's name) so a sound is
identical every run and regressions are reproducible.

`voiceBlipRecipe(text)` turns a line of text into a Zelda-style blip sequence
whose length tracks the sentence — a serviceable stand-in for voice acting.

---

## 5. Layering a real asset bank

When real audio does arrive, resolve each sound through layers and take the
first that answers:

1. **Pre-baked bank** — files shipped with the build, listed in a manifest.
   This is the production path: no API key reaches the browser.
2. **Persistent cache** — the Cache Storage API, keyed by a hash of the
   generation request, so a given prompt is never paid for twice.
3. **Live generation** — a TTS/SFX API, gated behind a build-time key. Useful
   while iterating; never in a shipped build.
4. **Procedural synth** — the fallback that guarantees sound.

Hash the *request* (prompt text, voice, duration, format), not the file name, so
a baked file and a cached generation of the same prompt share an identity and
editing a prompt invalidates exactly the sounds it changed.

Keep the prompts in one spec file that both the runtime and the offline bake
script read, and have the bake script skip entries whose hash already matches.
Otherwise a re-bake regenerates and re-bills everything.

Voice lines want two extra rules: play them one at a time through a queue (two
narrators talking over each other is unusable), and rate-limit repeats of the
same line id so a repeatedly triggered condition doesn't nag.

---

## 6. Wiring audio into the game

Update the listener once per tick, before anything plays:

```ts
audio.setListener(player.pos.x, player.pos.y, player.angle);
audio.update();                     // re-mix live positional voices
```

Trigger sounds from state changes rather than polling. The clean way is
callbacks on the player and a `playSound` on the world context, so entities
never import the audio manager:

```ts
player.onFootstep      = () => audio.play('footstep', { x: player.pos.x, y: player.pos.y, pitchVariance: 0.12 });
player.onBlocked       = () => audio.play('blocked', { volume: 0.5 });
player.onAttackImpact  = (kind) => (kind === 'attack' ? resolveSwing() : resolveCast());
```

Footsteps belong to distance walked, not to a timer — a timer keeps stepping
while you push against a wall. In a grid-locked game, fire one at the midpoint
of each step tween.

Give the player a way to mute (one key, shown in the HUD). Many people play with
audio off, and a game that can't be muted gets closed instead.
