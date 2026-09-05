import { TextureRegistry, Texture } from '../renderer/Texture';
import { createDefaultTextures } from '../renderer/ProceduralTextures';
import { SpriteSheet, SpriteSheetRegistry } from '../renderer/SpriteSheet';
import { humanoidSheet, pillarSheet, pickupSheet } from '../renderer/ProceduralSprites';
import { loadDirectionalSprite } from '../renderer/DirectionalSprites';

export interface AssetBundle {
  textures: TextureRegistry;
  sprites: SpriteSheetRegistry;
  /** Which sprite sheets came from baked Blender assets vs. procedural fallbacks. */
  spriteSources: Record<string, 'baked' | 'directional' | 'procedural'>;
}

export interface AssetOptions {
  /** Base URL for baked sprite metadata (`<base>/<name>.json`). */
  spriteBaseUrl?: string;
  /** Base URL for optional wall/floor PNG overrides (`<base>/<id>.png`). */
  textureBaseUrl?: string;
  /** Sheet names to attempt loading from the Blender pipeline output. */
  bakedSheets?: string[];
  textureSize?: number;
}

async function isJson(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    return head.ok && (head.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

/**
 * Loads the demo's assets. Baked Blender sprite sheets and PNG textures are
 * used when present; otherwise deterministic procedural stand-ins are built
 * through the exact same metadata and registry paths.
 */
export async function loadAssets(options: AssetOptions = {}): Promise<AssetBundle> {
  const spriteBase = options.spriteBaseUrl ?? 'assets/sprites/';
  const textureBase = options.textureBaseUrl ?? 'assets/textures/';
  const bakedSheets = options.bakedSheets ?? ['grunt', 'brute'];
  const texSize = options.textureSize ?? 64;

  const textures = new TextureRegistry();
  for (const [id, tex] of createDefaultTextures(texSize)) textures.register(id, tex);
  // Optional PNG overrides by id (e.g. assets/textures/1.png).
  await Promise.all(
    Array.from({ length: textures.count }, (_, id) => id).map(async (id) => {
      if (!textures.has(id)) return;
      try {
        const head = await fetch(`${textureBase}${id}.png`, { method: 'HEAD' });
        if (!head.ok || !(head.headers.get('content-type') ?? '').startsWith('image/')) return;
        textures.register(id, await Texture.load(`${textureBase}${id}.png`));
      } catch {
        // keep procedural texture
      }
    }),
  );

  const sprites = new SpriteSheetRegistry();
  const spriteSources: Record<string, 'baked' | 'directional' | 'procedural'> = {};

  const fallbacks: Record<string, () => SpriteSheet> = {
    grunt: () => humanoidSheet({ name: 'grunt', hue: 0.02, worldHeight: 0.9 }),
    brute: () => humanoidSheet({ name: 'brute', hue: 0.78, worldHeight: 1.05, frameSize: 64 }),
  };

  await Promise.all(
    bakedSheets.map(async (name) => {
      try {
        // 1. Full sheet from sprite_baker.py (<name>.json + <name>.png).
        if (await isJson(`${spriteBase}${name}.json`)) {
          sprites.register(await SpriteSheet.load(`${spriteBase}${name}.json`));
          spriteSources[name] = 'baked';
          return;
        }
        // 2. Per-angle PNGs from directional_sprite_addon.py (<name>/metadata.json).
        if (await isJson(`${spriteBase}${name}/metadata.json`)) {
          sprites.register(await loadDirectionalSprite(`${spriteBase}${name}/metadata.json`, { name, worldHeight: 0.9 }));
          spriteSources[name] = 'directional';
          return;
        }
        throw new Error('no baked asset');
      } catch {
        const fb = fallbacks[name];
        if (fb) {
          sprites.register(fb());
          spriteSources[name] = 'procedural';
        }
      }
    }),
  );
  for (const [name, fb] of Object.entries(fallbacks)) {
    if (!sprites.has(name)) {
      sprites.register(fb());
      spriteSources[name] = 'procedural';
    }
  }

  sprites.register(pillarSheet('pillar'));
  sprites.register(pickupSheet('pickup_ammo', 'ammo'));
  sprites.register(pickupSheet('pickup_health', 'health'));
  spriteSources['pillar'] = 'procedural';
  spriteSources['pickup_ammo'] = 'procedural';
  spriteSources['pickup_health'] = 'procedural';

  return { textures, sprites, spriteSources };
}
