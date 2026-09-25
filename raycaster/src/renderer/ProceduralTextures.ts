import { Texture } from './Texture';

/**
 * Deterministic procedural textures so the engine runs with zero binary assets.
 * Real PNG textures can be dropped in via `Texture.load` and registered under
 * the same ids.
 */

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function brickTexture(size = 64, seed = 1): Texture {
  const brickH = size / 8;
  const brickW = size / 4;
  return Texture.generate(size, size, (x, y, out) => {
    const row = Math.floor(y / brickH);
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    const bx = (x + offset) % brickW;
    const by = y % brickH;
    const mortar = bx < 2 || by < 2;
    const n = noise(x * 0.4, y * 0.4, seed) * 30;
    if (mortar) {
      const m = 70 + n;
      out[0] = m; out[1] = m; out[2] = m - 10;
    } else {
      const shade = 0.85 + hash2(Math.floor((x + offset) / brickW), row, seed) * 0.3;
      out[0] = (150 + n) * shade;
      out[1] = (60 + n * 0.5) * shade;
      out[2] = (45 + n * 0.3) * shade;
    }
  });
}

export function stoneTexture(size = 64, seed = 2): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const n1 = noise(x * 0.15, y * 0.15, seed);
    const n2 = noise(x * 0.6, y * 0.6, seed + 7) * 0.4;
    const crack = Math.abs(Math.sin(x * 0.3 + n1 * 6) + Math.cos(y * 0.25)) < 0.08 ? 0.5 : 1;
    const v = (95 + (n1 + n2) * 70) * crack;
    out[0] = v; out[1] = v * 0.98; out[2] = v * 0.92;
  });
}

export function techPanelTexture(size = 64, seed = 3): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const panel = size / 2;
    const px = x % panel;
    const py = y % panel;
    const edge = px < 2 || py < 2 || px >= panel - 2 || py >= panel - 2;
    const n = noise(x * 0.5, y * 0.5, seed) * 20;
    let r = 70 + n;
    let g = 80 + n;
    let b = 95 + n;
    if (edge) { r *= 0.5; g *= 0.5; b *= 0.5; }
    const light = ((x >> 3) + (y >> 3)) % 7 === 0 && px > 6 && py > 6 && px < 12 && py < 12;
    if (light) { r = 80; g = 220; b = 120; }
    const rivet = (px - 5) ** 2 + (py - 5) ** 2 < 4 || (px - panel + 5) ** 2 + (py - panel + 5) ** 2 < 4;
    if (rivet) { r += 60; g += 60; b += 60; }
    out[0] = r; out[1] = g; out[2] = b;
  });
}

export function woodTexture(size = 64, seed = 4): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const grain = Math.sin((x * 0.25 + noise(x * 0.1, y * 0.05, seed) * 8) * 2) * 0.5 + 0.5;
    const plank = Math.floor(y / (size / 4));
    const gap = y % (size / 4) < 2;
    const shade = gap ? 0.4 : 0.8 + hash2(plank, 0, seed) * 0.25;
    out[0] = (120 + grain * 60) * shade;
    out[1] = (80 + grain * 35) * shade;
    out[2] = (40 + grain * 15) * shade;
  });
}

export function floorTileTexture(size = 64, seed = 5): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const tile = size / 2;
    const tx = x % tile;
    const ty = y % tile;
    const grout = tx < 2 || ty < 2;
    const check = ((x / tile) | 0) + ((y / tile) | 0);
    const n = noise(x * 0.3, y * 0.3, seed) * 25;
    let v = (check & 1 ? 110 : 85) + n;
    if (grout) v *= 0.55;
    out[0] = v * 0.9; out[1] = v * 0.92; out[2] = v;
  });
}

export function ceilingTexture(size = 64, seed = 6): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const n = noise(x * 0.2, y * 0.2, seed);
    const beam = x % (size / 2) < 4;
    const v = beam ? 35 : 55 + n * 30;
    out[0] = v; out[1] = v * 0.95; out[2] = v * 0.9;
  });
}

export function metalDoorTexture(size = 64, seed = 8): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const n = noise(x * 0.4, y * 0.4, seed) * 15;
    const frame = x < 4 || x >= size - 4 || y < 4;
    const stripe = Math.abs(y - size / 2) < 3;
    const window = x > size * 0.3 && x < size * 0.7 && y > size * 0.15 && y < size * 0.4;
    let r = 90 + n; let g = 95 + n; let b = 100 + n;
    if (frame) { r = 50; g = 50; b = 55; }
    if (stripe) { r = 200; g = 170; b = 30; }
    if (window) { r = 30; g = 60; b = 90 + noise(x * 0.8, y * 0.8, seed + 1) * 60; }
    out[0] = r; out[1] = g; out[2] = b;
  });
}

export function lavaTexture(size = 64, seed = 9): Texture {
  return Texture.generate(size, size, (x, y, out) => {
    const n = noise(x * 0.12, y * 0.12, seed) * 0.6 + noise(x * 0.5, y * 0.5, seed + 3) * 0.4;
    out[0] = 120 + n * 135;
    out[1] = 20 + n * n * 160;
    out[2] = 10 + n * 20;
  });
}

/** Ids used by the demo level; shared between the map legend and the registry. */
export const TEX = {
  BRICK: 1,
  STONE: 2,
  TECH: 3,
  WOOD: 4,
  DOOR: 5,
  FLOOR_TILE: 6,
  CEILING: 7,
  LAVA: 8,
} as const;

export function createDefaultTextures(size = 64): Map<number, Texture> {
  return new Map<number, Texture>([
    [TEX.BRICK, brickTexture(size)],
    [TEX.STONE, stoneTexture(size)],
    [TEX.TECH, techPanelTexture(size)],
    [TEX.WOOD, woodTexture(size)],
    [TEX.DOOR, metalDoorTexture(size)],
    [TEX.FLOOR_TILE, floorTileTexture(size)],
    [TEX.CEILING, ceilingTexture(size)],
    [TEX.LAVA, lavaTexture(size)],
  ]);
}
