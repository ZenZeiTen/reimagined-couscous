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

  const apiKey = (import.meta.env['VITE_ELEVENLABS_API_KEY'] as string | undefined) ?? '';
  const elevenLabs = apiKey ? new ElevenLabsClient({ apiKey }) : null;
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
  overlay.addEventListener('click', async () => {
    overlay.classList.add('hidden');
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
    } else {
      engine.resume();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== hud && started) {
      engine.pause();
      overlay.classList.remove('hidden');
      if (overlayText) overlayText.textContent = 'Paused — click to resume';
    }
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
    overlay.innerHTML = `<h1>BOOT FAILED</h1><p>${String(err instanceof Error ? err.message : err)}</p>`;
  }
});
