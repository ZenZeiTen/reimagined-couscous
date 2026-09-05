/**
 * Blender model loader. MODEL_DATA parts are base64 int16 mm positions + uint16 indices; loaded indexed, then
 * de-indexed so normals come out per-face (faceted), which is what the PSX look wants. Parts hang off rig sockets
 * (torso, pelvis, head, armL/R, legL/R) or 'root'. Replace a mesh, never a socket.
 */
import * as THREE from 'three';
import { MODEL_DATA } from '../data/models.js';
import { psxMat } from './retro.js';
import { MAT } from './textures.js';

export const MODEL_COLORS = {   // part palette; enemies override armor/joint/steel per archetype
  armor: 0x59634f, joint: 0x3a3d3a, steel: 0x7d7f82, dark: 0x14161a, hilt: 0x2a2624, blade: 0xc6d8ff,
  gold: 0x6a5a34, sapphire: 0x2a3550, iron: 0x4a4038, bone: 0xc9c2b0, crystal: 0xcfe2ff, wood: 0x4a3a28
};
const SHARED = {};
function sharedMat(c) { if (SHARED[c]) return SHARED[c];
  if (c === 'crystal') return SHARED[c] = MAT.crystal; if (c === 'blade') return SHARED[c] = MAT.blade; if (c === 'sapphire') return SHARED[c] = psxMat({ color: MODEL_COLORS.sapphire, emissive: 0x101a30 });
  return SHARED[c] = MODEL_COLORS[c] !== undefined ? psxMat({ color: MODEL_COLORS[c] }) : MAT.stone; }
const GEO_CACHE = {};
function b64buf(str) { const bin = atob(str), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }
export function partGeometry(model, part) {
  const key = model + '/' + part; if (GEO_CACHE[key]) return GEO_CACHE[key];
  const d = MODEL_DATA[model][part], pos = new Int16Array(b64buf(d.v)), idx = new Uint16Array(b64buf(d.i));
  const g = new THREE.BufferGeometry(); const f = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) f[i] = pos[i] / 1000;                       // mm -> metres
  g.setAttribute('position', new THREE.BufferAttribute(f, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();          // per-face normals
  return GEO_CACHE[key] = flat;
}
/** Build a model. mats: optional map of colour-name -> material (enemies pass their own). attachMap: socket -> Object3D. */
export function buildModel(name, mats, attachMap) {
  const parts = MODEL_DATA[name], made = {};
  if (!parts) throw new Error('unknown model ' + name);
  for (const pn in parts) {
    const d = parts[pn], mat = (mats && mats[d.c]) || sharedMat(d.c);
    const m = new THREE.Mesh(partGeometry(name, pn), mat); m.name = pn; m.userData.colour = d.c;
    const host = attachMap && attachMap[d.a]; if (host) host.add(m); made[pn] = m;
  }
  return made;
}
export function modelGroup(name, mats) {   // free-standing prop / pickup
  const g = new THREE.Group(); g.name = name; g.userData.parts = buildModel(name, mats, { root: g }); return g;
}
export function hasModel(name) { return !!MODEL_DATA[name]; }
