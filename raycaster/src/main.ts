import { Engine } from './core/Engine';
import { Game } from './game/Game';
import { loadAssets } from './game/Assets';
import { DEMO_LEVEL } from './game/DemoLevel';
import { AudioManager } from './audio/AudioManager';
import { ElevenLabsClient } from './audio/ElevenLabsClient';
import { validateSoundBankSpec } from './audio/SoundBank';
import soundBankSpec from '../tools/audio/sound_bank.spec.json';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

async function boot(): Promise<void> {
  const view = byId<HTMLCanvasElement>('view');
  const hud = byId<HTMLCanvasElement>('hud');
  const overlay = byId<HTMLDivElement>('overlay');
  const overlayText = overlay.querySelector('p');

  const fit = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    view.width = w;
    view.height = h;
    hud.width = w;
    hud.height = h;
  };
  fit();

  // Vite inlines VITE_* variables into the bundle, so a key set here would ship
  // to every player in a production build. Live generation is a development
  // convenience only; production builds use the baked bank, cache and synth.
  const apiKey = (import.meta.env['VITE_ELEVENLABS_API_KEY'] as string | undefined) ?? '';
  if (apiKey && !import.meta.env.DEV) {
    console.warn('[audio] VITE_ELEVENLABS_API_KEY is ignored in production builds; bake a sound bank instead (see tools/audio/README.md).');
  }
  const elevenLabs = apiKey && import.meta.env.DEV ? new ElevenLabsClient({ apiKey }) : null;
  const audio = new AudioManager({ spec: validateSoundBankSpec(soundBankSpec), elevenLabs, bankUrl: 'audio/bank/' });

  const assets = await loadAssets();
  const engine = new Engine({ update: () => undefined, render: () => undefined });
  const game = new Game({ viewCanvas: view, hudCanvas: hud, assets, audio, level: DEMO_LEVEL, stats: engine.stats });
  engine.setHost(game);

  window.addEventListener('resize', () => {
    fit();
    game.resize(view.width, view.height);
  });

  let started = false;
  const showPaused = (text: string): void => {
    engine.pause();
    overlay.classList.remove('hidden');
    if (overlayText) overlayText.textContent = text;
  };

  overlay.addEventListener('click', async () => {
    overlay.classList.add('hidden');
    // Requested synchronously so it still counts as part of the click gesture.
    game.input.requestPointerLock();
    try {
      await audio.unlock();
      if (!started) {
        await audio.loadBank();
        void audio.preloadAll();
      }
    } catch (err) {
      console.warn('[audio] unlock failed', err);
    }
    if (!started) {
      started = true;
      engine.start();
    }
    // Resuming is driven by `pointerlockchange` below, so the game never runs
    // unlocked behind a hidden overlay. If the lock was refused (browsers
    // enforce a cooldown after Esc) or is still pending, stay paused; a
    // granted lock resumes and hides the overlay.
    if (document.pointerLockElement !== hud) showPaused('Paused — click to resume');
  });

  document.addEventListener('pointerlockchange', () => {
    if (!started) return;
    if (document.pointerLockElement === hud) {
      engine.resume();
      overlay.classList.add('hidden');
    } else {
      showPaused('Paused — click to resume');
    }
  });

  document.addEventListener('pointerlockerror', () => {
    if (started) showPaused('Mouse capture failed — click to try again');
  });

  const sources = Object.entries(assets.spriteSources)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  console.info(`[assets] sprite sources → ${sources}`);
  console.info(`[audio] ElevenLabs ${elevenLabs ? 'enabled (live generation)' : 'disabled (bank/cache/synth only)'}`);

  (window as unknown as { __raycaster: { engine: Engine; game: Game; audio: AudioManager } }).__raycaster = { engine, game, audio };
}

boot().catch((err: unknown) => {
  console.error(err);
  const overlay = document.getElementById('overlay');
  if (overlay) {
    // Error text can echo fetched level/sprite data, so never render it as HTML.
    overlay.replaceChildren();
    const h1 = document.createElement('h1');
    h1.textContent = 'BOOT FAILED';
    const p = document.createElement('p');
    p.textContent = String(err instanceof Error ? err.message : err);
    overlay.append(h1, p);
  }
});
