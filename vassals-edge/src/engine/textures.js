/** Procedural 64 px textures (64 px per game-metre) authored AT target size, nearest-filtered, and the shared material table. */
import * as THREE from 'three';
import { psxMat } from './retro.js';
import { rnd } from '../util.js';

export function makeTex(size, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  fn(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function bricks(g, s, rows, cols, base, spread, tint) {
  g.fillStyle = `rgb(${base - 34},${base - 34},${base - 28})`; g.fillRect(0, 0, s, s);
  const bw = s / cols, bh = s / rows;
  for (let r = 0; r < rows; r++) { const off = (r % 2) ? bw / 2 : 0;
    for (let c = -1; c < cols; c++) { const x = c * bw + off, y = r * bh;
      const v = base + Math.floor((rnd() - 0.5) * spread);
      g.fillStyle = `rgb(${v},${v + tint},${v + 6})`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      for (let i = 0; i < 6; i++) { const q = v + Math.floor((rnd() - 0.5) * 26);
        g.fillStyle = `rgb(${q},${q + tint},${q + 4})`;
        g.fillRect(x + 1 + Math.floor(rnd() * (bw - 3)), y + 1 + Math.floor(rnd() * (bh - 3)), 2, 2); } } }
}
const speckle = (g, s, base, n, spread, tint) => { g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { const v = spread[0] + Math.floor(rnd() * spread[1]); g.fillStyle = `rgb(${v + tint[0]},${v + tint[1]},${v + tint[2]})`; g.fillRect(Math.floor(rnd() * s), Math.floor(rnd() * s), 1 + Math.floor(rnd() * 2), 1); } };

export const TEX = {
  stone: makeTex(64, (g, s) => bricks(g, s, 4, 4, 92, 40, 1)),
  floor: makeTex(64, (g, s) => bricks(g, s, 2, 2, 62, 30, 0)),
  iron: makeTex(32, (g, s) => speckle(g, s, '#2a2320', 90, [30, 40], [12, 0, -6])),
  sand: makeTex(64, (g, s) => speckle(g, s, '#6e6d68', 700, [95, 45], [0, -2, -6])),
  quartz: makeTex(64, (g, s) => bricks(g, s, 2, 2, 150, 30, 8)),
  wood: makeTex(64, (g, s) => { g.fillStyle = '#3a2e22'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 8) { const v = 50 + Math.floor(rnd() * 30); g.fillStyle = `rgb(${v + 14},${v},${v - 12})`; g.fillRect(0, y + 1, s, 6); } }),
  moss: makeTex(64, (g, s) => { bricks(g, s, 4, 4, 84, 36, 1); for (let i = 0; i < 260; i++) { const v = 40 + Math.floor(rnd() * 40); g.fillStyle = `rgb(${v - 10},${v + 22},${v - 12})`; g.fillRect(Math.floor(rnd() * s), Math.floor(rnd() * s), 1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2)); } }),
  bone: makeTex(64, (g, s) => speckle(g, s, '#b8b0a0', 300, [150, 60], [8, 4, -6])),
  tile: makeTex(64, (g, s) => { bricks(g, s, 4, 4, 70, 24, 4); g.fillStyle = 'rgba(90,110,140,.35)'; for (let i = 0; i < 4; i++) g.fillRect(i * 16 + ((i % 2) ? 8 : 0), i * 16, 8, 8); }),
  ash: makeTex(64, (g, s) => speckle(g, s, '#4a4744', 900, [60, 40], [4, 2, 0]))
};
export const MAT = {
  stone: psxMat({ map: TEX.stone }), ceiling: psxMat({ map: TEX.stone, color: 0x8a8a90 }),
  sand: psxMat({ map: TEX.sand }), rock: psxMat({ map: TEX.stone, color: 0xc9c4b8 }), wood: psxMat({ map: TEX.wood }),
  quartz: psxMat({ map: TEX.quartz, color: 0xbfd0ea, emissive: 0x3a4a66 }), water: psxMat({ color: 0x0d1a2a, emissive: 0x08141f, stipple: true, opacity: 0.55, side: THREE.DoubleSide }),
  sea: psxMat({ color: 0x1a2430, emissive: 0x0a1018, stipple: true, opacity: 0.8 }), robe: psxMat({ color: 0x2a2d40 }), pale: psxMat({ color: 0xd8dde8, emissive: 0x2a3040 }),
  floor: psxMat({ map: TEX.floor }), iron: psxMat({ map: TEX.iron }), moss: psxMat({ map: TEX.moss }), tile: psxMat({ map: TEX.tile }), ash: psxMat({ map: TEX.ash }),
  bone: psxMat({ color: 0xc9c2b0 }), crystal: psxMat({ color: 0xcfe2ff, emissive: 0x6d86b0, stipple: true, opacity: 0.85 }),
  crystalBase: psxMat({ map: TEX.stone, color: 0x9ab0d0 }), gold: psxMat({ color: 0x3a3226, emissive: 0x181008 }),
  blade: psxMat({ color: 0xc6d8ff, emissive: 0x4a5c80, stipple: true, opacity: 0.78 }), hilt: psxMat({ color: 0x2a2624 }),
  armor: psxMat({ color: 0x4d4a44 }), sludge: psxMat({ color: 0x1e3a1a, emissive: 0x14301a, stipple: true, opacity: 0.75 }),
  mote: psxMat({ color: 0xdfe8ff, emissive: 0x7a8cc0, stipple: true, opacity: 0.9 }), ghost: psxMat({ color: 0xbfd6ff, emissive: 0x3a5070, stipple: true, opacity: 0.55 }),
  ember: psxMat({ color: 0xff8a3a, emissive: 0xa03a10, stipple: true, opacity: 0.85 }), steel: psxMat({ color: 0x7d7f82 })
};
