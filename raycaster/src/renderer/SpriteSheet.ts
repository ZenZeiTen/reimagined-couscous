import { TWO_PI, wrapIndex } from '../math/angle';
import { Texture } from './Texture';

/**
 * Sprite-sheet metadata produced by `tools/blender/sprite_baker.py`.
 *
 * Direction convention: direction `d` was rendered with the camera placed at
 * azimuth `d * 360 / directions` degrees, measured clockwise (viewed from
 * above) from the model's forward axis. Direction 0 therefore shows the
 * model's front, direction `directions/4` shows its right side.
 */
export interface SpriteSheetMeta {
  name: string;
  /** Image file relative to the JSON file. */
  image: string;
  frameWidth: number;
  frameHeight: number;
  directions: number;
  /** Normalised anchor inside a frame; (0.5, 1) = bottom centre. */
  origin: { x: number; y: number };
  /** World-space height of one frame in tiles (1 = wall height). */
  worldHeight?: number;
  animations: Record<string, SpriteAnimationMeta>;
  frames: SpriteFrameMeta[];
  /** Free-form info written by the baker. */
  generator?: Record<string, unknown>;
}

export interface SpriteAnimationMeta {
  fps: number;
  loop: boolean;
  /** Number of animation frames (each rendered in every direction). */
  frameCount: number;
}

export interface SpriteFrameMeta {
  animation: string;
  frame: number;
  direction: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AnimationTable {
  fps: number;
  loop: boolean;
  frameCount: number;
  /** Flat table of frame indices: [frameIndex * directions + direction] → index into `rects`. */
  lookup: Int32Array;
}

export class SpriteSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpriteSheetError';
  }
}

/** Validate raw JSON and return typed metadata. Throws on structural errors. */
export function parseSpriteSheetMeta(raw: unknown): SpriteSheetMeta {
  if (typeof raw !== 'object' || raw === null) throw new SpriteSheetError('metadata must be an object');
  const m = raw as Record<string, unknown>;
  const num = (k: string): number => {
    const v = m[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new SpriteSheetError(`'${k}' must be a finite number`);
    return v;
  };
  const str = (k: string): string => {
    const v = m[k];
    if (typeof v !== 'string' || v.length === 0) throw new SpriteSheetError(`'${k}' must be a non-empty string`);
    return v;
  };
  const name = str('name');
  const image = str('image');
  const frameWidth = num('frameWidth');
  const frameHeight = num('frameHeight');
  const directions = num('directions');
  if (directions < 1 || !Number.isInteger(directions)) throw new SpriteSheetError("'directions' must be a positive integer");

  const originRaw = m['origin'];
  let origin = { x: 0.5, y: 1 };
  if (originRaw !== undefined) {
    if (typeof originRaw !== 'object' || originRaw === null) throw new SpriteSheetError("'origin' must be an object");
    const o = originRaw as Record<string, unknown>;
    if (typeof o['x'] !== 'number' || typeof o['y'] !== 'number') throw new SpriteSheetError("'origin' needs numeric x and y");
    origin = { x: o['x'], y: o['y'] };
  }

  const animsRaw = m['animations'];
  if (typeof animsRaw !== 'object' || animsRaw === null) throw new SpriteSheetError("'animations' must be an object");
  const animations: Record<string, SpriteAnimationMeta> = {};
  for (const [key, val] of Object.entries(animsRaw as Record<string, unknown>)) {
    if (typeof val !== 'object' || val === null) throw new SpriteSheetError(`animation '${key}' must be an object`);
    const a = val as Record<string, unknown>;
    const fps = typeof a['fps'] === 'number' ? a['fps'] : 1;
    const loop = typeof a['loop'] === 'boolean' ? a['loop'] : true;
    const frameCount = a['frameCount'];
    if (typeof frameCount !== 'number' || frameCount < 1 || !Number.isInteger(frameCount)) {
      throw new SpriteSheetError(`animation '${key}' needs a positive integer frameCount`);
    }
    animations[key] = { fps, loop, frameCount };
  }
  if (Object.keys(animations).length === 0) throw new SpriteSheetError('at least one animation is required');

  const framesRaw = m['frames'];
  if (!Array.isArray(framesRaw)) throw new SpriteSheetError("'frames' must be an array");
  const frames: SpriteFrameMeta[] = framesRaw.map((f, i) => {
    if (typeof f !== 'object' || f === null) throw new SpriteSheetError(`frame ${i} must be an object`);
    const fr = f as Record<string, unknown>;
    const req = (k: string): number => {
      const v = fr[k];
      if (typeof v !== 'number') throw new SpriteSheetError(`frame ${i} field '${k}' must be a number`);
      return v;
    };
    const animation = fr['animation'];
    if (typeof animation !== 'string' || !(animation in animations)) {
      throw new SpriteSheetError(`frame ${i} references unknown animation '${String(animation)}'`);
    }
    const direction = req('direction');
    if (direction < 0 || direction >= directions) throw new SpriteSheetError(`frame ${i} direction out of range`);
    return { animation, frame: req('frame'), direction, x: req('x'), y: req('y'), w: req('w'), h: req('h') };
  });

  const meta: SpriteSheetMeta = { name, image, frameWidth, frameHeight, directions, origin, animations, frames };
  if (typeof m['worldHeight'] === 'number') meta.worldHeight = m['worldHeight'];
  if (typeof m['generator'] === 'object' && m['generator'] !== null) meta.generator = m['generator'] as Record<string, unknown>;
  return meta;
}

/**
 * Runtime sprite sheet: texture plus O(1) frame lookup by (animation, frame,
 * direction). Rect data lives in typed arrays for allocation-free rendering.
 */
export class SpriteSheet {
  readonly name: string;
  readonly texture: Texture;
  readonly directions: number;
  readonly originX: number;
  readonly originY: number;
  readonly worldHeight: number;
  readonly rectX: Int32Array;
  readonly rectY: Int32Array;
  readonly rectW: Int32Array;
  readonly rectH: Int32Array;
  private readonly animations = new Map<string, AnimationTable>();
  private readonly dirStep: number;

  constructor(meta: SpriteSheetMeta, texture: Texture) {
    this.name = meta.name;
    this.texture = texture;
    this.directions = meta.directions;
    this.originX = meta.origin.x;
    this.originY = meta.origin.y;
    this.worldHeight = meta.worldHeight ?? 1;
    this.dirStep = TWO_PI / meta.directions;

    const n = meta.frames.length;
    this.rectX = new Int32Array(n);
    this.rectY = new Int32Array(n);
    this.rectW = new Int32Array(n);
    this.rectH = new Int32Array(n);

    for (const [name, a] of Object.entries(meta.animations)) {
      this.animations.set(name, {
        fps: a.fps,
        loop: a.loop,
        frameCount: a.frameCount,
        lookup: new Int32Array(a.frameCount * meta.directions).fill(-1),
      });
    }

    meta.frames.forEach((f, i) => {
      if (f.x < 0 || f.y < 0 || f.x + f.w > texture.width || f.y + f.h > texture.height) {
        throw new SpriteSheetError(`frame ${i} of '${meta.name}' lies outside the sheet image`);
      }
      this.rectX[i] = f.x;
      this.rectY[i] = f.y;
      this.rectW[i] = f.w;
      this.rectH[i] = f.h;
      const table = this.animations.get(f.animation)!;
      if (f.frame < 0 || f.frame >= table.frameCount) throw new SpriteSheetError(`frame ${i} index out of range for '${f.animation}'`);
      table.lookup[f.frame * meta.directions + f.direction] = i;
    });

    for (const [name, table] of this.animations) {
      for (let i = 0; i < table.lookup.length; i++) {
        if (table.lookup[i] === -1) {
          const frame = Math.floor(i / meta.directions);
          const dir = i % meta.directions;
          throw new SpriteSheetError(`animation '${name}' is missing frame ${frame} direction ${dir}`);
        }
      }
    }
  }

  hasAnimation(name: string): boolean {
    return this.animations.has(name);
  }

  animationNames(): string[] {
    return [...this.animations.keys()];
  }

  getAnimation(name: string): { fps: number; loop: boolean; frameCount: number } {
    const a = this.animations.get(name);
    if (!a) throw new SpriteSheetError(`unknown animation '${name}' on sheet '${this.name}'`);
    return a;
  }

  /**
   * Resolve the animation frame index for a playback time in seconds.
   * Looping animations wrap; non-looping ones hold their final frame.
   */
  frameAt(animation: string, time: number): number {
    const a = this.animations.get(animation);
    if (!a) return 0;
    const raw = Math.floor(time * a.fps);
    if (a.loop) return wrapIndex(raw, a.frameCount);
    return raw >= a.frameCount ? a.frameCount - 1 : raw < 0 ? 0 : raw;
  }

  isFinished(animation: string, time: number): boolean {
    const a = this.animations.get(animation);
    if (!a || a.loop) return false;
    return time * a.fps >= a.frameCount;
  }

  /**
   * Pick the view direction for a sprite with facing angle `facing` seen from
   * `viewerX/viewerY`. Uses the clockwise-from-front convention documented on
   * `SpriteSheetMeta`.
   */
  directionFor(spriteX: number, spriteY: number, facing: number, viewerX: number, viewerY: number): number {
    if (this.directions === 1) return 0;
    const toViewer = Math.atan2(viewerY - spriteY, viewerX - spriteX);
    let rel = toViewer - facing;
    rel %= TWO_PI;
    if (rel < 0) rel += TWO_PI;
    return wrapIndex(Math.round(rel / this.dirStep), this.directions);
  }

  /** Index into the rect arrays for the given animation frame and direction. */
  frameIndex(animation: string, frame: number, direction: number): number {
    const a = this.animations.get(animation);
    if (!a) return 0;
    return a.lookup[frame * this.directions + direction]!;
  }

  getRect(index: number, out: SpriteFrameRect): SpriteFrameRect {
    out.x = this.rectX[index]!;
    out.y = this.rectY[index]!;
    out.w = this.rectW[index]!;
    out.h = this.rectH[index]!;
    return out;
  }

  /** Fetch metadata JSON and its image relative to the JSON location. */
  static async load(jsonUrl: string): Promise<SpriteSheet> {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new SpriteSheetError(`failed to fetch ${jsonUrl}: ${res.status}`);
    const meta = parseSpriteSheetMeta(await res.json());
    const imageUrl = new URL(meta.image, new URL(jsonUrl, window.location.href)).toString();
    const texture = await Texture.load(imageUrl);
    return new SpriteSheet(meta, texture);
  }
}

/** Registry of sprite sheets by name. */
export class SpriteSheetRegistry {
  private readonly sheets = new Map<string, SpriteSheet>();

  register(sheet: SpriteSheet): void {
    this.sheets.set(sheet.name, sheet);
  }

  get(name: string): SpriteSheet {
    const s = this.sheets.get(name);
    if (!s) throw new SpriteSheetError(`sprite sheet '${name}' is not registered`);
    return s;
  }

  has(name: string): boolean {
    return this.sheets.has(name);
  }
}
