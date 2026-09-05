/**
 * Packed 32-bit pixel helpers. Pixels are stored in the byte order the canvas
 * `ImageData` buffer expects (R, G, B, A in memory). On little-endian hosts
 * that is 0xAABBGGRR when read as a Uint32.
 */
export const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;

export function packRGBA(r: number, g: number, b: number, a = 255): number {
  return IS_LITTLE_ENDIAN
    ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export function unpackR(p: number): number {
  return IS_LITTLE_ENDIAN ? p & 0xff : (p >>> 24) & 0xff;
}

export function unpackG(p: number): number {
  return IS_LITTLE_ENDIAN ? (p >>> 8) & 0xff : (p >>> 16) & 0xff;
}

export function unpackB(p: number): number {
  return IS_LITTLE_ENDIAN ? (p >>> 16) & 0xff : (p >>> 8) & 0xff;
}

export function unpackA(p: number): number {
  return IS_LITTLE_ENDIAN ? (p >>> 24) & 0xff : p & 0xff;
}

/** Fully transparent pixel; used for sprite colour-key tests. */
export const TRANSPARENT = 0;
/** Alpha mask for the packed format. */
export const ALPHA_MASK = IS_LITTLE_ENDIAN ? 0xff000000 : 0x000000ff;

/**
 * Multiply RGB by `factor` (0..256, fixed point 8.8) keeping alpha opaque.
 * This is the hot path for distance fog and side shading.
 */
export function shadePixel(p: number, factor: number): number {
  if (IS_LITTLE_ENDIAN) {
    const r = ((p & 0xff) * factor) >>> 8;
    const g = (((p >>> 8) & 0xff) * factor) >>> 8;
    const b = (((p >>> 16) & 0xff) * factor) >>> 8;
    return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }
  const r = (((p >>> 24) & 0xff) * factor) >>> 8;
  const g = (((p >>> 16) & 0xff) * factor) >>> 8;
  const b = (((p >>> 8) & 0xff) * factor) >>> 8;
  return ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

/** Blend `p` toward `fog` by `t` in [0,256]. */
export function mixPixel(p: number, fog: number, t: number): number {
  const it = 256 - t;
  const r = (unpackR(p) * it + unpackR(fog) * t) >>> 8;
  const g = (unpackG(p) * it + unpackG(fog) * t) >>> 8;
  const b = (unpackB(p) * it + unpackB(fog) * t) >>> 8;
  return packRGBA(r, g, b, 255);
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number;
  let g: number;
  let b: number;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
