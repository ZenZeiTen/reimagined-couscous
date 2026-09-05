/** The explored map: the world reveals itself only where you have walked, per height layer. No markers, no objectives. */
import { G } from '../state.js';
import { SPEC } from '../spec.js';
import { floorAt, collide, lineOfSight, STEP_BODY } from '../engine/level.js';
export const MAPX = { seen: new Set(), x0: -46, x1: 16, z0: -37, z1: 10, last: '' };
export const layerOf = y => Math.round(y / 3);
export function mapVisit() {
  const c = SPEC.ui.mapCell, p = G.player, L = layerOf(p.y), cx = Math.round(p.x / c), cz = Math.round(p.z / c), k = cx + ',' + cz + ',' + L;
  if (MAPX.last === k) return; MAPX.last = k; const n = Math.ceil(SPEC.ui.mapReveal / c);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { if (i * i + j * j > n * n) continue;
    const fy = floorAt((cx + i) * c, (cz + j) * c, L * 3 + 1); if (fy === -Infinity || layerOf(fy) !== L) continue;
    if (!lineOfSight(p.x, p.y + 1.2, p.z, (cx + i) * c, fy + 1.2, (cz + j) * c)) continue;
    MAPX.seen.add((cx + i) + ',' + (cz + j) + ',' + L); }
}
export function drawMap(cv, px) {
  const c = SPEC.ui.mapCell, W = Math.round((MAPX.x1 - MAPX.x0) / c), H = Math.round((MAPX.z1 - MAPX.z0) / c), p = G.player;
  if (cv.width !== W * px) { cv.width = W * px; cv.height = H * px; }
  const g = cv.getContext('2d'); g.fillStyle = '#06080e'; g.fillRect(0, 0, cv.width, cv.height); const L = layerOf(p.y);
  for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) { const x = MAPX.x0 + i * c, z = MAPX.z0 + j * c;
    if (!MAPX.seen.has(Math.round(x / c) + ',' + Math.round(z / c) + ',' + L)) continue;
    const fy = floorAt(x, z, L * 3 + 1); const q = { x, z }; collide(q, 0.18, fy + STEP_BODY, fy + 1.75);
    g.fillStyle = (Math.abs(q.x - x) > 1e-6 || Math.abs(q.z - z) > 1e-6) ? '#2a3140' : (fy < L * 3 - 0.3 ? '#4a5260' : '#6b7684');
    g.fillRect(i * px, (H - 1 - j) * px, px, px); }
  const pi = (p.x - MAPX.x0) / c + 0.5, pj = (p.z - MAPX.z0) / c - 0.5, cx = pi * px, cy = (H - pj) * px;
  const F = { x: -Math.sin(p.yaw), y: Math.cos(p.yaw) }, P = { x: F.y, y: -F.x };
  g.fillStyle = '#e8c070'; g.beginPath(); g.moveTo(cx + F.x * px * 1.8, cy + F.y * px * 1.8);
  g.lineTo(cx - F.x * px * 0.7 + P.x * px, cy - F.y * px * 0.7 + P.y * px); g.lineTo(cx - F.x * px * 0.7 - P.x * px, cy - F.y * px * 0.7 - P.y * px); g.closePath(); g.fill();
}
