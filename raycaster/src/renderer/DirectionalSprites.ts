import { Texture } from './Texture';
import { SpriteSheet, SpriteSheetError, type SpriteFrameMeta, type SpriteSheetMeta } from './SpriteSheet';

/**
 * Loader for the output of `tools/blender/directional_sprite_addon.py`:
 * one PNG per view angle plus a `metadata.json` describing them. The frames
 * are packed into a single sprite-sheet texture at load time so the renderer
 * treats them exactly like a baked sheet (one `idle` animation, N directions).
 */
export interface DirectionalFrameMeta {
  index: number;
  angleDegrees: number;
  filename: string;
}

export interface DirectionalSpriteMeta {
  modelName: string;
  numAngles: number;
  resolution: number;
  frames: DirectionalFrameMeta[];
  convention?: string;
}

export function parseDirectionalMeta(raw: unknown): DirectionalSpriteMeta {
  if (typeof raw !== 'object' || raw === null) throw new SpriteSheetError('directional metadata must be an object');
  const m = raw as Record<string, unknown>;
  if (typeof m['modelName'] !== 'string' || !m['modelName']) throw new SpriteSheetError("'modelName' must be a non-empty string");
  const numAngles = m['numAngles'];
  if (typeof numAngles !== 'number' || !Number.isInteger(numAngles) || numAngles < 1) throw new SpriteSheetError("'numAngles' must be a positive integer");
  const resolution = m['resolution'];
  if (typeof resolution !== 'number' || !Number.isInteger(resolution) || resolution < 1) throw new SpriteSheetError("'resolution' must be a positive integer");
  const framesRaw = m['frames'];
  if (!Array.isArray(framesRaw)) throw new SpriteSheetError("'frames' must be an array");
  if (framesRaw.length !== numAngles) throw new SpriteSheetError(`expected ${numAngles} frames, found ${framesRaw.length}`);
  const seen = new Set<number>();
  const frames: DirectionalFrameMeta[] = framesRaw.map((f, i) => {
    if (typeof f !== 'object' || f === null) throw new SpriteSheetError(`frame ${i} must be an object`);
    const fr = f as Record<string, unknown>;
    const index = fr['index'];
    const angle = fr['angleDegrees'];
    const filename = fr['filename'];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= numAngles) throw new SpriteSheetError(`frame ${i} has an invalid index`);
    if (seen.has(index)) throw new SpriteSheetError(`frame index ${index} appears twice`);
    seen.add(index);
    if (typeof angle !== 'number') throw new SpriteSheetError(`frame ${i} needs angleDegrees`);
    if (typeof filename !== 'string' || !filename) throw new SpriteSheetError(`frame ${i} needs a filename`);
    return { index, angleDegrees: angle, filename };
  });
  const meta: DirectionalSpriteMeta = { modelName: m['modelName'], numAngles, resolution, frames };
  if (typeof m['convention'] === 'string') meta.convention = m['convention'];
  return meta;
}

export interface PackOptions {
  /** Height of the sprite in world tiles. Default 1. */
  worldHeight?: number;
  /** Anchor inside a frame; default bottom-centre. */
  origin?: { x: number; y: number };
  /** Override the sheet name (defaults to modelName). */
  name?: string;
}

/**
 * Pack per-angle textures into one sheet laid out as a single row of
 * directions. `images` must be indexed by frame index and all be
 * `resolution` x `resolution`.
 */
export function packDirectionalFrames(meta: DirectionalSpriteMeta, images: readonly Texture[], options: PackOptions = {}): SpriteSheet {
  const n = meta.numAngles;
  const size = meta.resolution;
  if (images.length !== n) throw new SpriteSheetError(`expected ${n} images, received ${images.length}`);
  const sheetW = size * n;
  const pixels = new Uint32Array(sheetW * size);
  const frames: SpriteFrameMeta[] = [];
  for (let d = 0; d < n; d++) {
    const img = images[d]!;
    if (img.width !== size || img.height !== size) {
      throw new SpriteSheetError(`frame ${d} is ${img.width}x${img.height}, expected ${size}x${size}`);
    }
    const ox = d * size;
    for (let y = 0; y < size; y++) {
      pixels.set(img.pixels.subarray(y * size, (y + 1) * size), y * sheetW + ox);
    }
    frames.push({ animation: 'idle', frame: 0, direction: d, x: ox, y: 0, w: size, h: size });
  }
  const sheetMeta: SpriteSheetMeta = {
    name: options.name ?? meta.modelName,
    image: '',
    frameWidth: size,
    frameHeight: size,
    directions: n,
    origin: options.origin ?? { x: 0.5, y: 1 },
    worldHeight: options.worldHeight ?? 1,
    animations: { idle: { fps: 1, loop: true, frameCount: 1 } },
    frames,
    generator: { tool: 'directional_sprite_addon.py', convention: meta.convention ?? 'clockwise-from-front' },
  };
  return new SpriteSheet(sheetMeta, new Texture(sheetW, size, pixels));
}

/** Fetch `metadata.json` and its PNGs from a folder URL and build a sheet. */
export async function loadDirectionalSprite(metadataUrl: string, options: PackOptions = {}): Promise<SpriteSheet> {
  const res = await fetch(metadataUrl);
  if (!res.ok) throw new SpriteSheetError(`failed to fetch ${metadataUrl}: ${res.status}`);
  const meta = parseDirectionalMeta(await res.json());
  const base = new URL(metadataUrl, window.location.href);
  const ordered = [...meta.frames].sort((a, b) => a.index - b.index);
  const images = await Promise.all(ordered.map((f) => Texture.load(new URL(f.filename, base).toString())));
  return packDirectionalFrames(meta, images, options);
}
