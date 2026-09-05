/**
 * Level construction and the collider tables. Every wall is an axis-aligned box; every floor is a slab plus a walkable
 * rect. Boxes are tessellated to <= subdiv-metre quads (the period fix for affine swim) with world-metre UVs.
 */
import * as THREE from 'three';
import { MAT } from './textures.js';
import { SPEC } from '../spec.js';

export const LEVEL = { blocks: [], floors: [], visuals: [], ladders: [], water: [], zones: [], doors: [], pools: [] };
export const scene = new THREE.Scene();

export function boxGeo(w, h, d, tile) {
  tile = tile || 1; const seg = v => Math.max(1, Math.min(48, Math.ceil(v / SPEC.render.subdiv)));
  const sw = seg(w), sh = seg(h), sd = seg(d);
  const g = new THREE.BoxGeometry(w, h, d, sw, sh, sd); const uv = g.attributes.uv;
  const faces = [[d, h, (sd + 1) * (sh + 1)], [d, h, (sd + 1) * (sh + 1)], [w, d, (sw + 1) * (sd + 1)],
                 [w, d, (sw + 1) * (sd + 1)], [w, h, (sw + 1) * (sh + 1)], [w, h, (sw + 1) * (sh + 1)]];
  let k = 0; for (const f of faces) for (let i = 0; i < f[2]; i++, k++) uv.setXY(k, uv.getX(k) * f[0] / tile, uv.getY(k) * f[1] / tile);
  uv.needsUpdate = true; return g;
}
export function block(cx, cy, cz, w, h, d, o) {
  o = o || {}; const m = new THREE.Mesh(boxGeo(w, h, d, o.tile), o.mat || MAT.stone);
  m.position.set(cx, cy, cz); if (o.hidden) m.visible = false; scene.add(m);
  const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, z0: cz - d / 2, z1: cz + d / 2, mesh: m, tag: o.tag };
  if (!o.noCollide) LEVEL.blocks.push(box); else LEVEL.visuals.push(box);
  m.userData.box = box; return m;
}
export function slab(x0, x1, z0, z1, y, o) {          // floor: 0.3 m slab below y + a walkable rect (carries a footstep surface)
  o = o || {}; const mt = o.mat || MAT.floor, m = block((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mat: mt });
  const surf = o.surf || (mt === MAT.sand ? 'sand' : mt === MAT.wood ? 'wood' : mt === MAT.iron ? 'iron' : mt === MAT.quartz ? 'quartz' : mt === MAT.ash ? 'sand' : 'stone');
  const f = { x0, x1, z0, z1, y, tag: o.tag, surf }; LEVEL.floors.push(f); m.userData.floor = f; return m;
}
export function collider(x0, x1, y0, y1, z0, z1, tag) { const b = { x0, x1, y0, y1, z0, z1, tag }; LEVEL.blocks.push(b); return b; }
/** A ramp: a sloped plane, a floor record with interpolation, and (optionally) a parallel roof. axis 'x' rises with +x, 'z' with +z. */
export function ramp(axis, x0, x1, z0, z1, y0, y1, o) {
  o = o || {}; const run = axis === 'x' ? x1 - x0 : z1 - z0, rise = y1 - y0, len = Math.hypot(run, rise), wide = axis === 'x' ? z1 - z0 : x1 - x0;
  const mk = (mat, dy, flip) => { const g = axis === 'x' ? new THREE.PlaneGeometry(len, wide, Math.ceil(len / SPEC.render.subdiv), Math.ceil(wide / SPEC.render.subdiv)) : new THREE.PlaneGeometry(wide, len, Math.ceil(wide / SPEC.render.subdiv), Math.ceil(len / SPEC.render.subdiv));
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (axis === 'x' ? len : wide), uv.getY(i) * (axis === 'x' ? wide : len));
    g.rotateX(flip ? Math.PI / 2 : -Math.PI / 2); if (axis === 'x') g.rotateZ(Math.atan2(rise, run)); else g.rotateX(-Math.atan2(rise, run));
    const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2 + dy, (z0 + z1) / 2); scene.add(m); return m; };
  mk(o.mat || MAT.floor, 0, false);
  if (o.roof) mk(o.roofMat || MAT.rock, o.roof, true);
  LEVEL.floors.push({ x0, x1, z0, z1, y: Math.min(y0, y1), ramp: axis === 'x' ? { axis: 'x', x0, x1, y0, y1 } : { axis: 'z', z0, z1, y0, y1 }, surf: o.surf || 'stone' });
}
export function zone(id, name, x0, x1, z0, z1, y0, y1, fog, near, far, amb, o) {
  const Z = Object.assign({ id, name, x0, x1, z0, z1, y0, y1, fogC: new THREE.Color(fog[0], fog[1], fog[2]), near, far, ambC: new THREE.Color(amb[0], amb[1], amb[2]) }, o || {});
  LEVEL.zones.push(Z); return Z;
}
export function addLadder(x0, x1, z0, z1, y0, y1, fx, fz, enabled) {
  const l = { x0, x1, z0, z1, y0, y1, fx, fz, enabled: enabled || (() => true) }; LEVEL.ladders.push(l);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, wx = fx ? (fx > 0 ? x1 : x0) : cx, wz = fz ? (fz > 0 ? z1 : z0) : cz;   // wall face
  const ox = fx ? -fx * 0.08 : 0, oz = fz ? -fz * 0.08 : 0, px = fz ? 0.25 : 0, pz = fx ? 0.25 : 0, h = y1 - y0;
  block(wx + ox - px, (y0 + y1) / 2 - 0.05, wz + oz - pz, 0.06, h - 0.1, 0.06, { noCollide: true, mat: MAT.iron, tag: 'mounted' });
  block(wx + ox + px, (y0 + y1) / 2 - 0.05, wz + oz + pz, 0.06, h - 0.1, 0.06, { noCollide: true, mat: MAT.iron, tag: 'mounted' });
  for (let y = y0 + 0.2; y <= y1 - 0.19; y += 0.3) block(wx + ox * 1.5, y, wz + oz * 1.5, fx ? 0.06 : 0.5, 0.04, fz ? 0.06 : 0.5, { noCollide: true, mat: MAT.iron, tag: 'mounted' });
  return l;
}
export function ladderAt(x, z, y) { for (const l of LEVEL.ladders) if (l.enabled() && x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1 && y >= l.y0 - 0.05 && y <= l.y1 + 0.05) return l; return null; }
export function waterPlane(x0, x1, z0, z1, level, mat) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) / 2), Math.ceil((z1 - z0) / 2)), mat || MAT.water);
  w.rotation.x = -Math.PI / 2; w.position.set((x0 + x1) / 2, level, (z0 + z1) / 2); scene.add(w);
  const W = { x0, x1, z0, z1, level, mesh: w }; LEVEL.water.push(W); return W;
}
export function door(id, cx, cy, cz, w, h, d, o) {   // o: { key, label, lockedMsg, mat }
  const m = block(cx, cy, cz, w, h, d, { mat: (o && o.mat) || MAT.iron, tag: 'door' }); const b = m.userData.box;
  const D = Object.assign({ id, block: b, mesh: m, open: false, t: 0, cx, cy, cz, h, w, d }, o); LEVEL.doors.push(D); return D;
}

/* ------------- collision ------------- */
export const STEP_UP = 0.5, STEP_BODY = 0.35;
const clampf = (v, a, b) => v < a ? a : v > b ? b : v;
export function floorAt(x, z, refY) {
  let best = -Infinity;
  for (const f of LEVEL.floors) { if (f.disabled) continue;
    if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
    let y = f.y; if (f.ramp) { const R = f.ramp, t = R.axis === 'z' ? clampf((z - R.z0) / (R.z1 - R.z0), 0, 1) : clampf((x - R.x0) / (R.x1 - R.x0), 0, 1); y = R.y0 + (R.y1 - R.y0) * t; }
    if (y <= refY + STEP_UP && y > best) { best = y; floorAt.last = f; } }
  return best;
}
export function collide(p, r, y0, y1, extra, ceil) {   // ceil: blocks entirely above the feet that contain the centre are ceilings, not walls
  const test = b => { if (b.disabled) return; if (y1 <= b.y0 || y0 >= b.y1) return;
    if (ceil && b.y0 > y0 + 0.5 && p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) { ceil.y = Math.min(ceil.y, b.y0); return; }
    if (p.x + r > b.x0 && p.x - r < b.x1 && p.z + r > b.z0 && p.z - r < b.z1) {
      const px = Math.min(p.x + r - b.x0, b.x1 - (p.x - r)), pz = Math.min(p.z + r - b.z0, b.z1 - (p.z - r));
      if (px < pz) p.x += (p.x < (b.x0 + b.x1) / 2) ? -px : px; else p.z += (p.z < (b.z0 + b.z1) / 2) ? -pz : pz; } };
  for (let pass = 0; pass < 2; pass++) { for (const b of LEVEL.blocks) test(b); if (extra) for (const b of extra) test(b); }
}
export function rayBlocks(ox, oy, oz, dx, dy, dz, maxT) {   // slab test against every live AABB; nearest hit t or maxT
  let best = maxT; const o = [ox, oy, oz], d = [dx, dy, dz];
  for (const b of LEVEL.blocks) { if (b.disabled || b.passRay) continue;
    const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1]; let t0 = 0, t1 = best, ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      if (Math.abs(d[i]) < 1e-6) { if (o[i] < lo[i] || o[i] > hi[i]) ok = false; }
      else { let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i]; if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) ok = false; } }
    if (ok && t0 < best) best = t0; }
  return best;
}
export function lineOfSight(ax, ay, az, bx, by, bz) { const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  return L < 1e-3 || rayBlocks(ax, ay, az, dx / L, dy / L, dz / L, L) >= L - 0.05; }
