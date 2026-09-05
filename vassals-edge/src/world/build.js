/**
 * THE WORLD — seven regions, one seamless map, no loading. Coordinates in metres: x east, z north, y up.
 *
 *   ASH-GIRT SHORE     x -34..-12, y 0        start · belltower (Cinder, crystal, the bell) · Garrick's anvil · broken pier (Mael) · wreck · stair down · cove
 *   WARDEN'S SHRINE    x -34.6..-29.4, z -15.6..-10.4, y 0   behind a sealed door in the south cliff (Tide-Warden's Seal)
 *   SUNKEN CLOISTER    x -32..-12, z -32..-16, y -3, water -2.5   arches · altar (Cistern Key on the bishop) · Ser Aldous · the drained alcove
 *   HIGH CITADEL       lower gallery: hall, trapdoor, niche, ledge room, gate
 *   IRON CISTERN       tunnel · locked iron door · chamber · lift
 *   CRYSTAL SEPULCHRE  x -18..-2, z -13.6..-6, y -9   quartz pillars · the Hollowed King · Moon-Sealed Key
 *   MOON GATE HALL     x -16..-4, z -25..-14.6, y -9  opens when the King falls; the Moon Gate ends the game
 *
 *   KEY-LOCK CHAIN  Shore → Cloister (Cistern Key; Aldous → Warden's Seal) → Shrine (Bell Clapper, Spear) → Bell (drains the cloister: Plate, Moonfall)
 *                   Citadel tunnel door → Cistern → lift → Sepulchre → Moon Key wakes the King → Moon Gate.
 */
import * as THREE from 'three';
import { scene, LEVEL, block, slab, ramp, zone, addLadder, waterPlane, door, collider, boxGeo } from '../engine/level.js';
import { MAT, TEX } from '../engine/textures.js';
import { psxMat } from '../engine/retro.js';
import { modelGroup } from '../engine/models.js';
import { rnd } from '../util.js';

export const W = { crystals: [], props: [], lights: {}, spawns: [], npcs: [], pickups: [], chests: [] };

/* ---------------- HIGH CITADEL — LOWER GALLERY (Greybox 0) ---------------- */
/* corridor (x -12..-8) */
slab(-12, -8, -1, 1, 0);
block(-10, 1.5, -1.2, 4, 3, 0.4); block(-10, 1.5, 1.2, 4, 3, 0.4);
block(-10.1, 3.15, 0, 4.2, 0.3, 2.8, { noCollide: true, mat: MAT.ceiling });
/* hall (x -8..8, z -4..4), floor split around the trap */
slab(-8, 0, -4, 4, 0); slab(2, 8, -4, 4, 0); slab(0, 2, -4, -3.2, 0); slab(0, 2, -1.2, 4, 0);
block(0, 2, 4.2, 16.8, 4, 0.4);
block(-2, 2, -4.2, 12, 4, 0.4); block(7.2, 2, -4.2, 2.4, 4, 0.4);
export const illusion = block(5, 1.5, -4.2, 2, 3, 0.4, { tag: 'illusion' }); block(5, 3.5, -4.2, 2, 1, 0.4);
block(-8.2, 2, -2.7, 0.4, 4, 3.4); block(-8.2, 2, 2.7, 0.4, 4, 3.4); block(-8.2, 3.5, 0, 0.4, 1, 2.2);
block(8.2, 2, -2.5, 0.4, 4, 3); block(8.2, 2, 2.5, 0.4, 4, 3); block(8.2, 3.3, 0, 0.4, 1.4, 2.2);
[[-3, -2.6], [-3, 2.6], [3, -2.6], [3, 2.6]].forEach(p => block(p[0], 2, p[1], 0.7, 4, 0.7));
block(0, 4.15, 0, 16.8, 0.3, 8.8, { noCollide: true, mat: MAT.ceiling });
/* niche behind the illusion */
slab(4, 6, -6.5, -4.0, 0);
block(3.8, 1.5, -5.45, 0.4, 3, 2.1); block(6.2, 1.5, -5.45, 0.4, 3, 2.1); block(5, 1.5, -6.7, 2.8, 3, 0.4);
block(5, 3.15, -5.35, 2.8, 0.3, 2.7, { noCollide: true, mat: MAT.ceiling });
/* trapdoor */
export const trap = { armed: true, open: 0, rect: { x0: 0, x1: 2, z0: -3.2, z1: -1.2 }, flaps: [] };
LEVEL.floors.push({ x0: 0, x1: 2, z0: -3.2, z1: -1.2, y: 0, tag: 'trap', surf: 'iron' });
for (let i = 0; i < 2; i++) { const g = new THREE.Group(); g.position.set(1, -0.06, i === 0 ? -3.2 : -1.2);
  const m = new THREE.Mesh(boxGeo(2, 0.12, 1), MAT.iron); m.position.z = i === 0 ? 0.5 : -0.5; g.add(m); scene.add(g); trap.flaps.push(g); }
export const LADDER = addLadder(0.0, 0.75, -2.65, -1.75, -3, 0, -1, 0, () => !trap.armed);
/* pit + tunnel */
slab(0, 8, -3.2, -1.2, -3);
block(4, -1.65, -1.0, 8, 2.7, 0.4); block(4, -1.65, -3.4, 8, 2.7, 0.4);
/* ramp trench and the exposed ledge room */
ramp('x', 8, 13.4, -3.2, -1.2, -3, 0); slab(13.4, 14, -3.2, -1.2, 0);
block(11, 0.2, -3.4, 6, 7.6, 0.4);
block(11, -1.5, 0.9, 6, 3, 4.2); LEVEL.floors.push({ x0: 8, x1: 14, z0: -1.2, z1: 3, y: 0, surf: 'stone' });
block(11, 2, 3.2, 6.8, 4, 0.4); block(14.2, 0.2, -0.3, 0.4, 7.6, 7);
block(11, 4.15, -0.1, 6.8, 0.3, 7, { noCollide: true, mat: MAT.ceiling });
/* iron gate at x 8.2 */
export const gate = { open: false, t: 0, group: new THREE.Group(), block: null };
gate.group.position.set(8.2, 0, 0); scene.add(gate.group);
for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(boxGeo(0.08, 2.6, 0.08), MAT.iron); b.position.set(0, 1.3, -0.9 + i * 0.3); gate.group.add(b); }
{ const t = new THREE.Mesh(boxGeo(0.14, 0.12, 2.0), MAT.iron); t.position.set(0, 0.06, 0); gate.group.add(t); }
gate.block = collider(8.05, 8.35, 0, 2.6, -1, 1, 'gate');
/* drain lever */
export const lever = { pulled: false, handle: new THREE.Group() };
block(7.4, -2.0, -3.13, 0.4, 0.5, 0.14, { noCollide: true, mat: MAT.iron, tag: 'mounted' });
lever.handle.position.set(7.4, -2.0, -3.04); lever.handle.rotation.x = -0.9;
{ const h = new THREE.Mesh(boxGeo(0.06, 0.7, 0.06), MAT.iron); h.position.y = 0.32; lever.handle.add(h); }
scene.add(lever.handle);
/* save crystal + ring pedestal */
export function crystalAt(x, y, z, s) { const c = modelGroup('shard', { crystal: MAT.crystal }); c.position.set(x, y, z); c.scale.setScalar(s || 1); scene.add(c); W.crystals.push(c); return c; }
function pedestal(x, y, z, rt, rb, h, mat) { const p = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 6), mat || MAT.stone); p.position.set(x, y + h / 2, z); scene.add(p);
  collider(x - rb, x + rb, y, y + h, z - rb, z + rb, 'pedestal'); return p; }
crystalAt(12, 1.15, 1.6, 1); pedestal(12, 0, 1.6, 0.42, 0.55, 0.9, MAT.crystalBase);
pedestal(5, 0, -5.9, 0.22, 0.28, 0.8);
collider(4.95, 5.45, 0, 0.9, -3.36, -2.84, 'chair');
zone('gallery', 'The High Citadel — Lower Gallery', -12, 15, -8, 5, -0.5, 5, [0.018, 0.02, 0.035], 2.5, 13, [0.07, 0.07, 0.10],
  { lights: [[[12, 1.4, 1.6], [0.55, 0.72, 1.0], 10], [[-3, 3.2, 0], [0.9, 0.55, 0.3], 6]] });
/* sconces along the hall pillars (dressing) */
[[-3, -2.2], [3, 2.2]].forEach(q => { const s = modelGroup('sconce'); s.position.set(q[0] + (q[1] < 0 ? 0 : 0), 2.4, q[1]); s.rotation.y = q[1] < 0 ? Math.PI : 0; scene.add(s); W.props.push(s); });

/* ---------------- IRON CISTERN ---------------- */
zone('cistern', 'The Iron Cistern', -13, 15, -8, 5, -4.2, -0.5, [0.03, 0.022, 0.016], 2, 11, [0.07, 0.05, 0.035],
  { lights: [[[-6.5, -2.3, -1], [0.25, 0.6, 0.2], 6], [[4, -2.0, -2.2], [0.20, 0.36, 0.16], 7]] });
export const CDOOR = door('cistern', -0.2, -1.65, -2.2, 0.4, 2.7, 2, { key: 'cistern_key', label: 'Unlock the iron door', lockedMsg: 'An iron door, sweating rust. The lock wants a key shaped like a rusted tooth.' });
slab(-12, -11, -6, 4, -3, { mat: MAT.floor }); slab(-9, 0, -6, 4, -3, { mat: MAT.floor });
slab(-11, -9, -6, -5.5, -3, { mat: MAT.floor }); slab(-11, -9, -3.5, 4, -3, { mat: MAT.floor }); slab(-11.4, -8.6, -5.9, -3.1, -9, { mat: MAT.iron });
block(-12.2, -1.65, -1, 0.4, 2.7, 10); block(-6.2, -1.65, 4.2, 12, 2.7, 0.4); block(-6.2, -1.65, -6.2, 12, 2.7, 0.4);
block(-0.2, -1.65, -4.6, 0.4, 2.7, 2.8); block(-0.2, -1.65, 1.4, 0.4, 2.7, 5.2);
block(-10, -0.15, -3.5, 4, 0.3, 5, { noCollide: true, mat: MAT.ceiling }); block(-10, -0.15, 2.5, 4, 0.3, 3, { noCollide: true, mat: MAT.ceiling }); block(-4.2, -0.15, -5, 8, 0.3, 2, { noCollide: true, mat: MAT.ceiling });
export const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 8), MAT.wood);
{ [3.5, -5.5].forEach(z => { const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 11, 8), MAT.iron); pipe.rotation.z = Math.PI / 2; pipe.position.set(-6.2, -1.1, z); scene.add(pipe); });
  wheel.rotation.x = Math.PI / 2; wheel.position.set(-10.5, -1.9, 2.4); scene.add(wheel);
  collider(-12, -9, -3, -0.4, 2, 2.9, 'wheel');
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), MAT.sludge); sl.rotation.x = -Math.PI / 2; sl.position.set(-6.5, -2.98, -1); scene.add(sl);
  const cage = modelGroup('cage'); cage.position.set(-3, -3, 3.2); scene.add(cage); collider(-3.45, -2.55, -3, -1, 2.75, 3.65, 'cage');
  const bones = modelGroup('bones'); bones.position.set(-3, -3, 3.2); scene.add(bones); }
export const POOLS = [{ x0: -8, x1: -5, z0: -2, z1: 0, y: -3 }, { x0: 3.4, x1: 5.6, z0: -3.2, z1: -2.3, y: -3 }];
{ const P = POOLS[1], g = new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, MAT.sludge); m.position.set((P.x0 + P.x1) / 2, -2.98, (P.z0 + P.z1) / 2); scene.add(m); }
/* lift */
export const LIFT = { x0: -11, x1: -9, z0: -5.5, z1: -3.5, top: -3, bottom: -9, moving: false, t: 0, dur: 6, from: -3, to: -9 };
LIFT.rect = { x0: LIFT.x0, x1: LIFT.x1, z0: LIFT.z0, z1: LIFT.z1, y: -3, tag: 'lift', surf: 'iron' }; LEVEL.floors.push(LIFT.rect);
LIFT.mesh = new THREE.Mesh(boxGeo(2, 0.25, 2), MAT.iron); LIFT.mesh.position.set(-10, -3.125, -4.5); scene.add(LIFT.mesh);
LIFT.lever = new THREE.Group(); LIFT.lever.position.set(-9.3, -3, -3.7); { const h = new THREE.Mesh(boxGeo(0.06, 0.8, 0.06), MAT.iron); h.position.y = 0.4; LIFT.lever.add(h); } scene.add(LIFT.lever);
block(-11.6, -6, -4.5, 0.4, 6.4, 3); block(-8.4, -6, -4.5, 0.4, 6.4, 3); block(-10, -6, -3.1, 3.6, 6, 0.4);

/* ---------------- CRYSTAL SEPULCHRE ---------------- */
zone('sepulchre', 'The Crystal Sepulchre', -19, -1, -14.5, -5.5, -10, -4.5, [0.52, 0.6, 0.74], 6, 26, [0.24, 0.27, 0.34],
  { lights: [[[-15, -5.5, -8], [0.6, 0.75, 1.0], 9], [[-5, -5.5, -11.5], [0.6, 0.75, 1.0], 9], [[-10, -7.5, -12.4], [0.7, 0.6, 0.9], 5]] });
slab(-18, -2, -13.6, -6, -9, { mat: MAT.quartz });
block(-18.2, -5.5, -9.8, 0.4, 7, 8); block(-1.8, -5.5, -9.8, 0.4, 7, 8);
export const throneWall = block(-10, -5.5, -13.8, 4, 7, 0.4, { tag: 'throne_wall' }); block(-15, -5.5, -13.8, 6.4, 7, 0.4); block(-5, -5.5, -13.8, 6.4, 7, 0.4);
block(-14.7, -5.5, -5.8, 6.6, 7, 0.4); block(-5.3, -5.5, -5.8, 6.6, 7, 0.4); block(-10, -3.1, -5.8, 2.8, 2.2, 0.4);
block(-10, -1.85, -9.8, 16.4, 0.3, 8, { noCollide: true, mat: MAT.quartz });
[[-15, -8], [-5, -8], [-15, -11.5], [-5, -11.5]].forEach(q => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6.6, 6), MAT.quartz); c.position.set(q[0], -5.7, q[1]); scene.add(c);
  crystalAt(q[0], -2.4, q[1], 1.5); collider(q[0] - 0.5, q[0] + 0.5, -9, -2, q[1] - 0.5, q[1] + 0.5); });
export const throne = { seat: block(-10, -8.3, -12.9, 1.6, 1.4, 1.0, { mat: MAT.quartz }), back: block(-10, -7.3, -13.45, 1.6, 2.6, 0.3, { mat: MAT.quartz }) };
[[-11.6, -9, -7.4], [-8.4, -9, -7.4]].forEach(q => { const b = modelGroup('brazier'); b.position.set(q[0], q[1] + 0.42, q[2]); scene.add(b); collider(q[0] - 0.3, q[0] + 0.3, q[1], q[1] + 0.65, q[2] - 0.3, q[2] + 0.3, 'brazier'); });

/* ---------------- MOON GATE HALL (behind the throne; the wall opens when the King falls) ---------------- */
zone('moongate', 'The Moon Gate', -17, -3, -26, -13.8, -10, -3.5, [0.06, 0.07, 0.14], 4, 22, [0.14, 0.16, 0.28],
  { lights: [[[-10, -6, -23.5], [0.8, 0.85, 1.0], 12], [[-10, -7.2, -16], [0.5, 0.55, 0.9], 6]] });
slab(-16, -4, -25, -13.5, -9, { mat: MAT.tile });
block(-16.2, -6.5, -19.4, 0.4, 5.2, 11.2); block(-3.8, -6.5, -19.4, 0.4, 5.2, 11.2); block(-10, -6.5, -25.2, 12.4, 5.2, 0.4);
block(-14, -6.5, -14.0, 4, 5.2, 0.4); block(-6, -6.5, -14.0, 4, 5.2, 0.4); block(-10, -4.3, -14.0, 4, 0.8, 0.4);   // the throne wall is the doorway's own block
block(-10, -3.75, -19.4, 12.4, 0.3, 11.2, { noCollide: true, mat: MAT.quartz });
[[-14, -18], [-6, -18], [-14, -22], [-6, -22]].forEach(q => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5.2, 6), MAT.quartz); c.position.set(q[0], -6.5, q[1]); scene.add(c); collider(q[0] - 0.45, q[0] + 0.45, -9, -4, q[1] - 0.45, q[1] + 0.45); });
export const moongate = modelGroup('moongate'); moongate.position.set(-10, -9, -24.4); scene.add(moongate); W.props.push(moongate);
collider(-11.9, -8.1, -9, -4.4, -24.9, -23.9, 'moongate');
/* the tell: a seated corpse facing the blank south wall of the hall */
{ const g = new THREE.Group(); g.position.set(5.2, 0, -3.1);
  const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(boxGeo(w, h, d), mat || MAT.bone); m.position.set(x, y, z); g.add(m); };
  [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]].forEach(q => add(0.06, 0.42, 0.06, q[0], 0.21, q[1], MAT.hilt));
  add(0.5, 0.06, 0.5, 0, 0.45, 0, MAT.hilt); add(0.5, 0.55, 0.06, 0, 0.755, 0.22, MAT.hilt);
  add(0.3, 0.42, 0.18, 0, 0.69, 0.06); add(0.2, 0.2, 0.2, 0, 1.0, 0.04);
  add(0.1, 0.1, 0.36, -0.12, 0.53, -0.14); add(0.1, 0.1, 0.36, 0.12, 0.53, -0.14);
  add(0.1, 0.48, 0.1, -0.12, 0.24, -0.3); add(0.1, 0.48, 0.1, 0.12, 0.24, -0.3);
  scene.add(g); }

/* ---------------- ASH-GIRT SHORE (start) ---------------- */
zone('shore', 'The Ash-Girt Shore', -46, -12, -17, 9, -1, 8, [0.36, 0.38, 0.41], 5, 19, [0.17, 0.18, 0.20],
  { lights: [[[-26, 0.9, 4.4], [1.0, 0.55, 0.25], 7], [[-38.6, 1.0, 0.3], [0.5, 0.8, 0.9], 6], [[-27.3, 1.6, 6.2], [0.55, 0.72, 1.0], 5]] });
slab(-34, -12, -10, 8, 0, { mat: MAT.sand });
slab(-16, -12, -16, -15.4, 0, { mat: MAT.sand }); slab(-16, -12, -14.2, -10, 0, { mat: MAT.sand });
slab(-16, -14.2, -15.4, -14.2, 0, { mat: MAT.sand }); slab(-12.8, -12, -15.4, -14.2, 0, { mat: MAT.sand });
block(-23, 3, 8.2, 22.8, 6, 0.4, { mat: MAT.rock }); block(-12.2, 3, -5.5, 0.4, 6, 9, { mat: MAT.rock }); block(-12.2, 3, 4.5, 0.4, 6, 7, { mat: MAT.rock });
block(-12.2, 4.5, 0, 0.4, 3, 2.2, { mat: MAT.rock });
block(-25.75, 3, -10.2, 7.5, 6, 0.4, { mat: MAT.rock }); block(-18, 3, -10.2, 4, 6, 0.4, { mat: MAT.rock });               // south cliff; gaps: shrine x -34.5..-29.5, stair x -22..-20, cove x -16..-12
block(-29.75, 4.6, -10.2, 0.5, 2.8, 0.4, { mat: MAT.rock }); block(-34.25, 4.6, -10.2, 0.5, 2.8, 0.4, { mat: MAT.rock });
block(-12.2, 3, -13, 0.4, 6, 6, { mat: MAT.rock }); block(-16.2, 3, -13, 0.4, 6, 6, { mat: MAT.rock }); block(-14, 3, -16.2, 4.4, 6, 0.4, { mat: MAT.rock });
/* the sea, the pier, the wreck */
{ const sea = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), MAT.sea); sea.rotation.x = -Math.PI / 2; sea.position.set(-54, -0.35, -1); scene.add(sea);
  block(-34.2, 1, -6, 0.4, 4, 8, { tag: 'sea', hidden: true }); block(-34.2, 1, 4.6, 0.4, 4, 6.8, { tag: 'sea', hidden: true });            // the sea does not want you (gap: the pier)
  slab(-42, -34, -1.2, 1.2, 0.15, { mat: MAT.wood }); block(-42.2, 1, 0, 0.4, 3, 2.8, { tag: 'sea', hidden: true });                      // the pier, longer now
  block(-38, 0.6, -1.4, 8, 1.2, 0.4, { tag: 'sea', hidden: true }); block(-38, 0.6, 1.4, 8, 1.2, 0.4, { tag: 'sea', hidden: true });        // rails: fall-guards (invisible)
  [[-36, -1.3], [-36, 1.3], [-40, -1.3], [-40, 1.3]].forEach(q => block(q[0], 0.55, q[1], 0.12, 1.1, 0.12, { noCollide: true, mat: MAT.wood, tag: 'mounted' }));
  const post = modelGroup('sconce'); post.position.set(-41.5, 1.1, 1.0); post.rotation.y = Math.PI; scene.add(post);
  [[-20, -3], [-31, 4], [-17, 5]].forEach(q => block(q[0], 0.35, q[1], 1.2, 0.7, 0.9, { mat: MAT.rock })); }
/* the wreck is hollow: hull walls, a swollen timber door on the landward side (an elemental lock — fire), a chest inside */
block(-33.6, 1.2, -6.5, 0.4, 2.6, 2.4, { mat: MAT.wood }); block(-30, 1.2, -5.5, 7, 2.6, 0.4, { mat: MAT.wood }); block(-30, 1.2, -7.5, 7, 2.6, 0.4, { mat: MAT.wood });
block(-30, 2.55, -6.5, 7.2, 0.2, 2.6, { mat: MAT.wood, noCollide: true }); block(-29, 3.1, -6.5, 4, 1.2, 1.4, { mat: MAT.wood, noCollide: true });
export const timber = block(-26.5, 1.2, -6.5, 0.4, 2.4, 2.0, { mat: MAT.wood, tag: 'timber' });
/* belltower: x -28..-24, z 3..7, with the bell, its rope, and Cinder */
block(-26, 3.5, 7.2, 4.8, 7, 0.4); block(-28.2, 3.5, 5, 0.4, 7, 4); block(-23.8, 3.5, 5, 0.4, 7, 4);
block(-27.4, 3.5, 2.8, 1.2, 7, 0.4); block(-24.6, 3.5, 2.8, 1.2, 7, 0.4); block(-26, 4.8, 2.8, 1.6, 4.4, 0.4);
block(-26, 7.15, 5, 4.8, 0.3, 4.8, { noCollide: true, mat: MAT.ceiling });
export const bell = modelGroup('bell'); bell.position.set(-26, 5.2, 5); scene.add(bell); W.props.push(bell);
bell.userData.parts.clapper.visible = false;                                                   // the clapper was taken down
{ const rope = new THREE.Mesh(boxGeo(0.05, 3.6, 0.05), MAT.wood); rope.position.set(-25.2, 3.4, 5); scene.add(rope); }
crystalAt(-27.3, 1.0, 6.2, 0.9); pedestal(-27.3, 0, 6.2, 0.36, 0.48, 0.8, MAT.crystalBase);
{ const b = modelGroup('brazier'); b.position.set(-26, 0.42, 4.4); scene.add(b); collider(-26.3, -25.7, 0, 0.65, 4.1, 4.7, 'brazier'); }
/* Garrick's forge under the north cliff */
{ const an = modelGroup('anvil'); an.position.set(-13.6, 0, 6.0); scene.add(an); collider(-13.95, -13.25, 0, 0.95, 5.7, 6.3, 'anvil');
  const s = modelGroup('sconce'); s.position.set(-12.2, 2.2, 6.0); s.rotation.y = -Math.PI / 2; scene.add(s); }
/* barrels and chests: dressing that reads as inventory */
[[-36.8, 0.15, -0.8], [-24.0, 0, -8.8], [-22.6, 0, -8.2], [-5.2, -3, 3.2], [-4.4, -3, 3.4], [-10.4, -3, 0.6], [-33.2, 0, -14.6], [-31.6, 0, 6.8]].forEach(q => {
  const b = modelGroup('barrel'); b.position.set(q[0], q[1], q[2]); b.rotation.y = rnd() * 3; scene.add(b);
  collider(q[0] - 0.33, q[0] + 0.33, q[1], q[1] + 0.62, q[2] - 0.33, q[2] + 0.33, 'barrel'); });
/* stair trench down to the cloister: x -22..-20, z -16..-10, y 0 → -3 */
ramp('z', -22, -20, -16, -10, -3, 0, { mat: MAT.stone, roof: 2.6, roofMat: MAT.rock });
block(-22.2, -0.15, -13, 0.4, 6.3, 6); block(-19.8, -0.15, -13, 0.4, 6.3, 6);
block(-21, 4.3, -10.2, 2, 3.4, 0.4, { mat: MAT.rock });

/* ---------------- WARDEN'S SHRINE — behind the south cliff, opened by the Tide-Warden's Seal ---------------- */
zone('shrine', 'The Tide-Warden’s Shrine', -35, -29, -16, -10.3, -0.5, 4, [0.05, 0.08, 0.09], 2, 10, [0.08, 0.12, 0.14],
  { lights: [[[-32, 1.4, -14.2], [0.5, 0.85, 0.9], 6], [[-32, 2.6, -11.5], [0.9, 0.55, 0.3], 4]] });
export const SHRINE_DOOR = door('shrine', -32, 1.3, -10.2, 2, 2.6, 0.4, { key: 'warden_seal', label: 'The shrine door', lockedMsg: 'A door of green bronze set into the cliff. A round recess waits for a seal.', mat: MAT.gold });
block(-33.5, 4.3, -10.2, 1, 3.4, 0.4, { mat: MAT.rock }); block(-30.5, 4.3, -10.2, 1, 3.4, 0.4, { mat: MAT.rock }); block(-32, 4.3, -10.2, 2, 3.4, 0.4, { mat: MAT.rock });   // lintel over the door
slab(-34.6, -29.4, -15.6, -10.0, 0, { mat: MAT.tile });                                                         // runs under the door: no floor gap when it opens
block(-34.8, 1.6, -13, 0.4, 3.2, 5.2, { mat: MAT.moss }); block(-29.2, 1.6, -13, 0.4, 3.2, 5.2, { mat: MAT.moss }); block(-32, 1.6, -15.8, 5.6, 3.2, 0.4, { mat: MAT.moss });
block(-33.75, 1.6, -10.2, 1.5, 3.2, 0.4, { mat: MAT.moss }); block(-30.25, 1.6, -10.2, 1.5, 3.2, 0.4, { mat: MAT.moss });
block(-32, 3.35, -13, 5.6, 0.3, 5.6, { noCollide: true, mat: MAT.ceiling });
pedestal(-32, 0, -14.6, 0.5, 0.6, 1.0, MAT.crystalBase);
{ const s = modelGroup('sconce'); s.position.set(-32, 2.2, -10.5); scene.add(s); const b = modelGroup('bones'); b.position.set(-34, 0, -12.2); scene.add(b); }

/* ---------------- SUNKEN CLOISTER OF SAINT VAEL (y -3, water -2.5) ---------------- */
zone('cloister', 'The Sunken Cloister of Saint Vael', -33, -11.5, -33, -13.5, -4, -0.6, [0.02, 0.05, 0.08], 2.5, 12, [0.05, 0.09, 0.13],
  { lights: [[[-22, -1.9, -31], [0.45, 0.65, 0.9], 7], [[-30.6, -1.6, -20.5], [0.5, 0.75, 0.9], 4]] });
slab(-32, -12, -32, -16, -3);
block(-27.2, -1.65, -16.2, 10.4, 2.7, 0.4, { mat: MAT.moss }); block(-17.1, -1.65, -16.2, 5.8, 2.7, 0.4, { mat: MAT.moss }); block(-12.2, -1.65, -16.2, 1.2, 2.7, 0.4, { mat: MAT.moss });
block(-32.2, -1.65, -24, 0.4, 2.7, 16.8, { mat: MAT.moss }); block(-12.2, -1.65, -24, 0.4, 2.7, 16.8, { mat: MAT.moss });
block(-26, -1.65, -32.2, 12.8, 2.7, 0.4, { mat: MAT.moss }); block(-14.6, -1.65, -32.2, 5.2, 2.7, 0.4, { mat: MAT.moss });
export const alcoveDoor = block(-18.4, -1.65, -32.2, 2.4, 2.7, 0.4, { mat: MAT.stone, tag: 'alcove' });                                    // sealed by water until the bell
block(-22, -0.15, -24, 20.8, 0.3, 16.8, { noCollide: true, mat: MAT.ceiling });
[-28, -24, -20, -16].forEach(x => [-29, -22].forEach(z => block(x, -1.65, z, 0.8, 2.7, 0.8, { mat: MAT.moss })));
export const cloisterWater = waterPlane(-32, -12, -32, -16, -2.5);
pedestal(-22, -3, -31.2, 0.3, 0.36, 1.0);
/* the drained alcove: x -19.6..-17.2, z -35..-32.4 */
slab(-19.6, -17.2, -35, -32.0, -3, { mat: MAT.tile }); block(-19.8, -1.65, -33.7, 0.4, 2.7, 2.6, { mat: MAT.moss }); block(-17.0, -1.65, -33.7, 0.4, 2.7, 2.6, { mat: MAT.moss }); block(-18.4, -1.65, -35.2, 2.8, 2.7, 0.4, { mat: MAT.moss });
block(-18.4, -0.15, -33.8, 2.8, 0.3, 2.8, { noCollide: true, mat: MAT.ceiling }); pedestal(-18.4, -3, -34.4, 0.4, 0.5, 0.9, MAT.crystalBase);
/* cove shaft: passage through the north wall, ladder up the shaft, iron grate at the cove floor (forced from below) */
slab(-14.2, -12.8, -16.4, -14.2, -3);
block(-14.4, -1.65, -15.1, 0.4, 2.7, 1.8); block(-12.6, -1.65, -15.1, 0.4, 2.7, 1.8); block(-13.5, -1.65, -14.0, 1.4, 2.7, 0.4);
export const HATCH = door('hatch', -13.5, -0.15, -14.8, 1.4, 0.3, 1.2, { label: 'Force the grate', lockedMsg: 'A rusted grate, barred from below.' });
{ const l = addLadder(-14.2, -12.8, -15.2, -14.2, -3, 0, 0, 1); l.yTop = () => HATCH.block.disabled ? 0 : -2.1; }
HATCH.floor = { x0: -14.2, x1: -12.8, z0: -15.4, z1: -14.2, y: 0, tag: 'hatch', surf: 'iron' }; LEVEL.floors.push(HATCH.floor);

/* ---------------- NPC placement (models built in systems/npcs.js) ---------------- */
W.npcs = [
  { id: 'cinder', model: 'cinder', x: -25.2, y: 0, z: 6.2, yaw: 0, talk: { x: -25.2, y: 0, z: 5.8, r: 2.0, label: 'Speak with the seer' }, box: [-25.7, -24.7, 0, 1.5, 5.9, 6.5] },
  { id: 'garrick', model: 'garrick', x: -14.6, y: 0, z: 6.0, yaw: Math.PI / 2, talk: { x: -14.2, y: 0, z: 5.3, r: 1.8, label: 'The blacksmith' }, box: [-15.1, -14.1, 0, 1.8, 5.6, 6.4], hammer: true },
  { id: 'mael', model: 'mael', x: -39.2, y: 0.15, z: 0.3, yaw: -Math.PI / 2, talk: { x: -38.6, y: 0.15, z: 0.3, r: 2.0, label: 'The lantern-keeper' }, box: [-39.6, -38.8, 0, 1.9, -0.1, 0.7], ghost: true },
  { id: 'aldous', model: 'aldous', x: -31.4, y: -3, z: -20.5, yaw: -Math.PI / 2, talk: { x: -30.8, y: -3, z: -20.5, r: 1.8, label: 'The knight against the wall' }, box: [-31.9, -30.9, -3, -1.6, -21, -20] },
  { id: 'bishop_corpse', model: 'bishop_corpse', x: -23.1, y: -3, z: -31.3, yaw: -Math.PI / 2, talk: { x: -22.8, y: -3, z: -30.8, r: 1.4, label: 'The kneeling bishop' }, box: [-23.4, -22.8, -3, -1.9, -31.6, -31.0], removeOn: 'bishop_woke' }
];
/* ---------------- enemy placement ---------------- */
W.spawns = [
  { type: 'sentry', x: -3, y: 0, z: 1.5, A: { x: -3, z: 1.5 }, B: { x: 7, z: 1.5 }, bounds: { x0: -7.4, x1: 7.4, z0: -3.4, z1: 3.4 }, avoid: [{ x0: -0.5, x1: 2.5, y0: -1, y1: 3, z0: -3.7, z1: -0.7 }], id: 'sentry' },
  { type: 'mariner', x: -20, y: 0, z: 4, A: { x: -20, z: 4 }, B: { x: -14, z: 4 }, bounds: { x0: -33.5, x1: -12.6, z0: -9.5, z1: 7.5 } },
  { type: 'mariner', x: -32, y: 0, z: -3, yaw: -Math.PI / 2, bounds: { x0: -33.5, x1: -12.6, z0: -9.5, z1: 7.5 } },
  { type: 'crawler', x: -31.5, y: 0, z: 4.5, yaw: Math.PI, bounds: { x0: -33.5, x1: -12.6, z0: -9.5, z1: 7.5 } },
  { type: 'crawler', x: -23, y: 0, z: -7.5, yaw: 0, bounds: { x0: -33.5, x1: -12.6, z0: -9.5, z1: 7.5 } },
  { type: 'crawler', x: -14, y: 0, z: -12, yaw: 0, bounds: { x0: -15.8, x1: -12.2, z0: -14, z1: -10.2 } },
  { type: 'bowman', x: -16, y: -3, z: -28, yaw: -Math.PI / 2, bounds: { x0: -31.5, x1: -12.5, z0: -31.5, z1: -16.6 } },
  { type: 'mariner', x: -27, y: -3, z: -19, A: { x: -27, z: -19 }, B: { x: -27, z: -29 }, bounds: { x0: -31.5, x1: -12.5, z0: -31.5, z1: -16.6 } },
  { type: 'bishop', x: -22, y: -3, z: -29.5, yaw: Math.PI, bounds: { x0: -31.5, x1: -12.5, z0: -31.5, z1: -16.6 }, dormant: 'bishop_woke', id: 'bishop' },
  { type: 'bowman', x: 11, y: 0, z: 1.5, yaw: -Math.PI / 2, bounds: { x0: 8.4, x1: 13.8, z0: -1, z1: 2.8 } },
  { type: 'husk', x: -4, y: -3, z: 2, yaw: Math.PI / 2, bounds: { x0: -11.5, x1: -0.9, z0: -5.5, z1: 3.5 }, avoid: [{ x0: -11.6, x1: -8.4, y0: -4, y1: 0, z0: -6, z1: -3 }] },
  { type: 'husk', x: -8, y: -3, z: -4.5, yaw: 0, bounds: { x0: -11.5, x1: -0.9, z0: -5.5, z1: 3.5 }, avoid: [{ x0: -11.6, x1: -8.4, y0: -4, y1: 0, z0: -6, z1: -3 }] },
  { type: 'wisp', x: -14.5, y: -9, z: -7.5, yaw: 0, bounds: { x0: -17.5, x1: -2.5, z0: -13.2, z1: -6.4 } },
  { type: 'wisp', x: -5, y: -9, z: -12, yaw: 0, bounds: { x0: -17.5, x1: -2.5, z0: -13.2, z1: -6.4 } },
  { type: 'king', x: -10, y: -9, z: -12.6, yaw: Math.PI, bounds: { x0: -17.5, x1: -2.5, z0: -13.2, z1: -6.4 }, dormant: 'king_woke', id: 'king', seated: true }
];
/* ---------------- pickups: [item, qty, x, y, z, options] ---------------- */
W.pickups = [
  ['sovereign_ring', 1, 5, 0.86, -5.9, { spin: 'z' }],
  ['scroll_gale', 1, -31, 0.06, -6.5, {}], ['scroll_tide', 1, -20.6, -2.94, -30.6, {}], ['scroll_ward', 1, -9.6, -2.94, 0.6, {}], ['scroll_rebuke', 1, -9, -8.94, -11.2, {}],
  ['cistern_key', 1, -22, -1.95, -31.2, { rotz: 1.2, event: 'bishop_rise' }],
  ['moon_key', 1, -10, -8.4, -11.2, { rotz: 1.1, scale: 1.15, tint: 0xd8dde8, event: 'king_wake' }],
  ['seaspray_rapier', 1, 1.0, -2.5, -2.85, { rot: [-0.35 - Math.PI / 2, 0, 0.4] }],
  ['barnacle_hauberk', 1, 6.8, -2.94, -1.55, {}],
  ['notched_falchion', 1, -13.4, 0.04, -11.6, { rot: [0, 0.6, Math.PI / 2] }],
  ['ash_salt', 1, -18.5, 0.02, -8.5, {}], ['ash_salt', 1, -31.5, -2.94, -22.5, {}],
  ['pearl', 1, -36.5, 0.17, -0.6, {}], ['pearl', 1, -28.5, -2.94, -30.5, {}], ['pearl', 1, -14.2, -2.94, -17.5, {}], ['pearl', 2, -13.5, -2.94, -15.4, {}],
  ['tide_water', 1, 12.6, 0.02, -2.6, {}], ['forge_ore', 1, -2.4, -2.94, -5.2, {}], ['forge_ore', 1, -8.2, -8.94, -7.2, {}],
  ['moon_lily', 1, -17.6, -8.94, -12.6, {}], ['sentry_greaves', 1, 13.2, 0.02, 2.4, {}],
  ['bell_maul', 1, -11.2, -2.94, 3.4, { rot: [0, 0.4, Math.PI / 2] }],
  ['warden_spear', 1, -32, 1.05, -14.6, { rot: [0, 0, Math.PI / 2 - 0.15] }], ['bell_clapper', 1, -30.2, 0.05, -14.8, {}], ['seer_tincture', 1, -33.6, 0.05, -14.6, {}],
  ['warden_plate', 1, -18.4, -2.1, -34.4, { rot: [0, Math.PI, 0] }], ['scroll_moonfall', 1, -17.7, -2.94, -33.2, {}]
];
/* chests: the lid swings on the 'lid' socket; contents are given when opened */
W.chests = [
  { x: -32.9, y: 0, z: -6.5, yaw: Math.PI / 2, items: [['horned_helm', 1]], id: 'wreck_chest' },
  { x: 9.2, y: 0, z: 2.5, yaw: -Math.PI / 2, items: [['drowned_gauntlets', 1], ['moon_lily', 1]], id: 'ledge_chest' },
  { x: -3.6, y: -9, z: -6.8, yaw: Math.PI, items: [['tide_water', 2], ['ember_bread', 1]], id: 'sepulchre_chest' }
];
/* the drained-alcove and bell-vault mechanisms are driven from systems/world.js via these handles */
export const MECH = { alcoveDoor, throneWall, timber, cloisterWater, bell, moongate, trap, gate, lever, illusion, LIFT, HATCH, CDOOR, SHRINE_DOOR };
export function boat() { const b = new THREE.Group(); const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(boxGeo(w, h, d), MAT.wood); m.position.set(x, y, z); b.add(m); };
  add(3.2, 0.5, 1.4, 0, 0.25, 0); add(3.4, 0.16, 0.16, 0, 0.6, 0.72); add(3.4, 0.16, 0.16, 0, 0.6, -0.72); add(0.14, 0.14, 2.4, -0.4, 0.62, 0); b.position.set(-48, -0.3, 0); scene.add(b); return b; }
