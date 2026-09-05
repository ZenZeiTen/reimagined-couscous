import { Texture } from './Texture';
import { SpriteSheet, type SpriteFrameMeta, type SpriteSheetMeta } from './SpriteSheet';
import { packRGBA, hsvToRgb } from './Color';

/**
 * Generates sprite sheets in-engine using exactly the metadata schema the
 * Blender baker emits, so the renderer path is identical for baked assets.
 *
 * The humanoid generator draws a directional figure: a front-facing "visor"
 * that moves around the head as the direction changes, giving a clear read of
 * which way the sprite faces even without a real 3D render.
 */
export interface ProceduralSpriteOptions {
  name: string;
  frameSize?: number;
  directions?: number;
  hue?: number;
  worldHeight?: number;
  animations?: Record<string, { fps: number; loop: boolean; frameCount: number }>;
}

type Painter = (ctx: { px: (x: number, y: number, c: number) => void; size: number; anim: string; frame: number; dir: number; angle: number; t: number }) => void;

function buildSheet(opts: Required<Pick<ProceduralSpriteOptions, 'name' | 'frameSize' | 'directions' | 'worldHeight' | 'animations'>>, paint: Painter): SpriteSheet {
  const { name, frameSize, directions, animations, worldHeight } = opts;
  const animNames = Object.keys(animations);
  let totalRows = 0;
  for (const a of animNames) totalRows += animations[a]!.frameCount;
  const width = frameSize * directions;
  const height = frameSize * totalRows;
  const pixels = new Uint32Array(width * height);
  const frames: SpriteFrameMeta[] = [];

  let row = 0;
  for (const anim of animNames) {
    const a = animations[anim]!;
    for (let f = 0; f < a.frameCount; f++) {
      for (let d = 0; d < directions; d++) {
        const ox = d * frameSize;
        const oy = row * frameSize;
        const px = (x: number, y: number, c: number): void => {
          if (x < 0 || y < 0 || x >= frameSize || y >= frameSize) return;
          pixels[(oy + (y | 0)) * width + ox + (x | 0)] = c;
        };
        const angle = (d / directions) * Math.PI * 2;
        paint({ px, size: frameSize, anim, frame: f, dir: d, angle, t: a.frameCount > 1 ? f / (a.frameCount - 1) : 0 });
        frames.push({ animation: anim, frame: f, direction: d, x: ox, y: oy, w: frameSize, h: frameSize });
      }
      row++;
    }
  }

  const meta: SpriteSheetMeta = {
    name,
    image: `${name}.png`,
    frameWidth: frameSize,
    frameHeight: frameSize,
    directions,
    origin: { x: 0.5, y: 1 },
    worldHeight,
    animations,
    frames,
    generator: { tool: 'ProceduralSprites', version: 1 },
  };
  return new SpriteSheet(meta, new Texture(width, height, pixels));
}

function fillCircle(px: (x: number, y: number, c: number) => void, cx: number, cy: number, r: number, c: number): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(cx + x, cy + y, c);
}

function fillRect(px: (x: number, y: number, c: number) => void, x0: number, y0: number, w: number, h: number, c: number): void {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(x0 + x, y0 + y, c);
}

/** Humanoid enemy with idle, walk, attack, hurt and die animations. */
export function humanoidSheet(opts: ProceduralSpriteOptions): SpriteSheet {
  const frameSize = opts.frameSize ?? 64;
  const directions = opts.directions ?? 8;
  const hue = opts.hue ?? 0.02;
  const animations = opts.animations ?? {
    idle: { fps: 2, loop: true, frameCount: 2 },
    walk: { fps: 8, loop: true, frameCount: 4 },
    attack: { fps: 10, loop: false, frameCount: 3 },
    hurt: { fps: 8, loop: false, frameCount: 2 },
    die: { fps: 6, loop: false, frameCount: 4 },
  };
  const [br, bg, bb] = hsvToRgb(hue, 0.7, 0.75);
  const body = packRGBA(br, bg, bb);
  const bodyDark = packRGBA(br * 0.6, bg * 0.6, bb * 0.6);
  const skin = packRGBA(220, 180, 140);
  const visor = packRGBA(255, 60, 40);
  const boot = packRGBA(40, 30, 30);
  const weapon = packRGBA(70, 70, 80);

  return buildSheet({ name: opts.name, frameSize, directions, worldHeight: opts.worldHeight ?? 0.9, animations }, ({ px, size, anim, frame, angle, t }) => {
    const s = size / 64;
    const cx = size / 2;
    // Facing: angle 0 = camera in front of the model → visor faces the viewer.
    const faceX = Math.sin(angle); // lateral offset of the visor across the head
    const facingCamera = Math.cos(angle); // >0 when the front is visible

    let bob = 0;
    let legSwing = 0;
    let lean = 0;
    let armRaise = 0;
    let fall = 0;
    let flash = 0;
    switch (anim) {
      case 'idle': bob = frame === 1 ? 1 : 0; break;
      case 'walk': legSwing = Math.sin(t * Math.PI * 2) * 5; bob = Math.abs(Math.sin(t * Math.PI * 2)) * 2; break;
      case 'attack': armRaise = frame === 1 ? 10 : 4; flash = frame === 1 ? 1 : 0; break;
      case 'hurt': lean = frame === 0 ? 4 : 2; flash = 1; break;
      case 'die': fall = t; break;
      default: break;
    }

    const groundY = size - 2;
    const headR = 6 * s;
    const torsoH = 22 * s;
    const legH = 18 * s;
    const bodyW = 12 * s;

    if (fall > 0) {
      // Collapse: shrink vertically and widen into a slumped shape.
      const squash = 1 - fall * 0.85;
      const h = (torsoH + legH + headR * 2) * squash;
      const wdt = bodyW * (1 + fall * 1.5);
      fillRect(px, cx - wdt / 2, groundY - h, wdt, h, fall > 0.9 ? bodyDark : body);
      fillCircle(px, cx + faceX * wdt * 0.3, groundY - h - headR * squash, Math.max(1, headR * squash), skin);
      return;
    }

    const baseY = groundY - bob;
    // Legs
    const legW = 4 * s;
    fillRect(px, cx - bodyW / 2 + 1 + legSwing * 0.3, baseY - legH, legW, legH, bodyDark);
    fillRect(px, cx + bodyW / 2 - legW - 1 - legSwing * 0.3, baseY - legH, legW, legH, bodyDark);
    fillRect(px, cx - bodyW / 2 + legSwing * 0.3, baseY - 3 * s, legW + 1, 3 * s, boot);
    fillRect(px, cx + bodyW / 2 - legW - 1 - legSwing * 0.3, baseY - 3 * s, legW + 1, 3 * s, boot);
    // Torso
    const torsoTop = baseY - legH - torsoH;
    fillRect(px, cx - bodyW / 2 + lean, torsoTop, bodyW, torsoH, flash ? packRGBA(255, 220, 220) : body);
    // Shoulder stripe darker on the side facing away
    fillRect(px, cx - bodyW / 2 + lean + (faceX > 0 ? bodyW - 3 * s : 0), torsoTop, 3 * s, torsoH, bodyDark);
    // Weapon arm, only when the front or side is visible
    if (facingCamera > -0.3) {
      const armX = cx + faceX * (bodyW / 2) + (faceX >= 0 ? 2 : -6 * s);
      fillRect(px, armX, torsoTop + 6 * s - armRaise, 4 * s, 10 * s, weapon);
    }
    // Head
    const headY = torsoTop - headR;
    fillCircle(px, cx + lean, headY, headR, skin);
    // Visor: visible only from the front half, slides across the head with the angle.
    if (facingCamera > 0.05) {
      const vw = Math.max(1, Math.round(headR * 1.4 * facingCamera));
      fillRect(px, cx + lean + faceX * headR * 0.6 - vw / 2, headY - 2 * s, vw, 3 * s, visor);
    } else {
      // Back of the head: helmet band.
      fillRect(px, cx + lean - headR, headY - 1, headR * 2, 2 * s, bodyDark);
    }
  });
}

/** Static decoration (single direction). */
export function pillarSheet(name: string, frameSize = 64): SpriteSheet {
  const stone = packRGBA(150, 150, 160);
  const dark = packRGBA(90, 90, 100);
  return buildSheet({ name, frameSize, directions: 1, worldHeight: 1, animations: { idle: { fps: 1, loop: true, frameCount: 1 } } }, ({ px, size }) => {
    const cx = size / 2;
    const w = size * 0.3;
    fillRect(px, cx - w / 2, 2, w, size - 4, stone);
    fillRect(px, cx - w / 2, 2, 3, size - 4, dark);
    fillRect(px, cx - w * 0.7, 0, w * 1.4, 4, dark);
    fillRect(px, cx - w * 0.7, size - 5, w * 1.4, 5, dark);
  });
}

/** Animated pickup (ammo box / medkit) hovering slightly. */
export function pickupSheet(name: string, kind: 'ammo' | 'health', frameSize = 32): SpriteSheet {
  const main = kind === 'ammo' ? packRGBA(200, 160, 40) : packRGBA(230, 230, 230);
  const accent = kind === 'ammo' ? packRGBA(90, 70, 20) : packRGBA(220, 40, 40);
  return buildSheet({ name, frameSize, directions: 1, worldHeight: 0.3, animations: { idle: { fps: 4, loop: true, frameCount: 4 } } }, ({ px, size, frame }) => {
    const hover = Math.round(Math.sin((frame / 4) * Math.PI * 2) * 2);
    const w = size * 0.7;
    const h = size * 0.5;
    const x0 = (size - w) / 2;
    const y0 = size - h - 2 - hover;
    fillRect(px, x0, y0, w, h, main);
    if (kind === 'ammo') {
      fillRect(px, x0, y0 + h / 2 - 1, w, 2, accent);
      fillRect(px, x0 + w / 2 - 1, y0, 2, h, accent);
    } else {
      fillRect(px, x0 + w / 2 - 2, y0 + 2, 4, h - 4, accent);
      fillRect(px, x0 + 2, y0 + h / 2 - 2, w - 4, 4, accent);
    }
  });
}

/** Projectile / muzzle-flash style glowing orb. */
export function orbSheet(name: string, frameSize = 16): SpriteSheet {
  return buildSheet({ name, frameSize, directions: 1, worldHeight: 0.2, animations: { idle: { fps: 12, loop: true, frameCount: 2 } } }, ({ px, size, frame }) => {
    const c = size / 2;
    const r = frame === 0 ? size * 0.35 : size * 0.45;
    fillCircle(px, c, c, r, packRGBA(255, 200, 80));
    fillCircle(px, c, c, r * 0.5, packRGBA(255, 255, 220));
  });
}
