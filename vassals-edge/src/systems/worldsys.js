/** World update: mechanisms (trap, gate, lever, illusion, lift, doors, bell, drain), zone presets, pools, idle props. */
import * as THREE from 'three';
import { LEVEL, floorAt, scene } from '../engine/level.js';
import { U, psxMat } from '../engine/retro.js';
import { TEX, MAT } from '../engine/textures.js';
import { MECH, W, POOLS, wheel } from '../world/build.js';
import { G } from '../state.js';
import { SPEC } from '../spec.js';
import { lerp, inRect, CLOCK, reducedMotion, smooth } from '../util.js';

export let zoneCur = null;
export function zoneAt(x, y, z) { for (const Z of LEVEL.zones) if (x >= Z.x0 && x <= Z.x1 && z >= Z.z0 && z <= Z.z1 && y >= Z.y0 && y <= Z.y1) return Z; return null; }
export function zoneLook(id, hard) { const Z = typeof id === 'string' ? LEVEL.zones.find(z => z.id === id) : id; if (!Z) return;
  U.fogColor.value.copy(Z.fogC); U.ambient.value.copy(Z.ambC); U.fogNear.value = Z.near; U.fogFar.value = Z.far; applyZoneLights(Z, 1); if (G.renderer) G.renderer.setClearColor(U.fogColor.value, 1); }
function applyZoneLights(Z, k) { const L = Z.lights || [];
  for (let i = 1; i < 4; i++) { const l = L[i - 1]; const pos = U.lightPos.value[i], col = U.lightCol.value[i];
    if (l) { pos.lerp(new THREE.Vector3(l[0][0], l[0][1], l[0][2]), k); col.lerp(new THREE.Color(l[1][0], l[1][1], l[1][2]), k); U.lightRange.value[i] = lerp(U.lightRange.value[i], l[2], k); }
    else { col.lerp(new THREE.Color(0, 0, 0), k); U.lightRange.value[i] = lerp(U.lightRange.value[i], 1, k); } } }
export function updateZone(dt) { const p = G.player; const z = zoneAt(p.x, p.y, p.z); if (!z) return;
  if (z !== zoneCur) { const first = !zoneCur; zoneCur = z; if (G.mode === 'play') { G.say(z.name, 4); if (G.audio) G.audio.setZone(z.id); } if (first) { zoneLook(z); return; } }
  const k = Math.min(1, dt * 1.2); U.fogColor.value.lerp(z.fogC, k); U.ambient.value.lerp(z.ambC, k);
  U.fogNear.value = lerp(U.fogNear.value, z.near, k); U.fogFar.value = lerp(U.fogFar.value, z.far, k); applyZoneLights(z, k); G.renderer.setClearColor(U.fogColor.value, 1); }
export function resetZone() { zoneCur = null; }
export function inWater() { const p = G.player; for (const Wt of LEVEL.water) if (inRect(p.x, p.z, Wt) && p.y < Wt.level - 0.05) return Wt; return null; }
export function openDoor(D) { if (D.open) return; D.open = true; D.block.disabled = true; if (D.floor) D.floor.disabled = true; if (G.audio) G.audio.gate(); }

const { trap, gate, lever, illusion, LIFT, cloisterWater, bell, alcoveDoor, throneWall, moongate } = MECH;
export const WORLD = { drainT: 0, bellSwing: 0, gateOpenT: 0 };
export function revealIllusion() { if (illusion.userData.revealed) return; illusion.userData.revealed = true; illusion.userData.fade = 1;
  illusion.material = psxMat({ map: TEX.stone, stipple: true, opacity: 1 }); illusion.userData.box.disabled = true; if (G.audio) G.audio.noise(0.8, 'lowpass', 500, 120, 0.25, 0); G.say('The wall was never there.', 3); }
export function pullLever() { if (lever.pulled) return; lever.pulled = true; gate.open = true; if (G.audio) { G.audio.clank(0); G.audio.gate(); } G.say('Somewhere above, iron grinds against stone.', 4); }
export function workLift() { if (LIFT.moving) return; LIFT.moving = true; LIFT.t = 0; LIFT.from = LIFT.rect.y; LIFT.to = LIFT.rect.y > -6 ? LIFT.bottom : LIFT.top; if (G.audio) G.audio.gate(); }
export function drainCloister() { if (G.flags.cloister_drained) return; G.flags.cloister_drained = true; alcoveDoor.userData.box.disabled = true; alcoveDoor.visible = false; }
export function openThroneWall() { throneWall.userData.box.disabled = true; throneWall.visible = false; }

export function updateWorld(dt) {
  const p = G.player, t = CLOCK.t;
  /* trapdoor */
  if (trap.armed && !p.dead && p.grounded && Math.abs(p.y) < 0.05 && G.mode === 'play' &&
      p.x > trap.rect.x0 + 0.15 && p.x < trap.rect.x1 - 0.15 && p.z > trap.rect.z0 + 0.15 && p.z < trap.rect.z1 - 0.15) {
    trap.armed = false; LEVEL.floors.find(f => f.tag === 'trap').disabled = true; if (G.audio) G.audio.trap(); G.say('The floor gives way.', 2.5); }
  if (!trap.armed && trap.open < 1) { trap.open = Math.min(1, trap.open + dt * 3); const e = trap.open * trap.open;
    trap.flaps[0].position.set(1, -0.06 - 0.3 * e, -3.2 - 1.1 * e); trap.flaps[1].position.set(1, -0.06 - 0.3 * e, -1.2 + 1.1 * e); }
  /* gate */
  if (gate.open && gate.t < 1) { gate.t = Math.min(1, gate.t + dt / 1.6); gate.group.position.y = 2.7 * gate.t; if (gate.t >= 1) gate.block.disabled = true; }
  lever.handle.rotation.x = lerp(lever.handle.rotation.x, lever.pulled ? 0.9 : -0.9, Math.min(1, 6 * dt));
  /* illusion fade */
  if (illusion.userData.revealed && illusion.userData.fade > 0) { illusion.userData.fade -= dt * 1.4; illusion.material.uniforms.uAlpha.value = Math.max(0, illusion.userData.fade); if (illusion.userData.fade <= 0) illusion.visible = false; }
  else if (!illusion.userData.revealed && G.hasItem('sea_glass_lens')) { if (!illusion.userData.lensed) { illusion.userData.lensed = true; illusion.material = psxMat({ map: TEX.stone, stipple: true, opacity: 0.55 }); } }
  /* doors that slide */
  for (const D of LEVEL.doors) if (D.open && D.t < 1) { D.t = Math.min(1, D.t + dt / 1.4); const e = smooth(D.t);
    if (D.id === 'cistern') D.mesh.position.z = D.cz - 1.9 * e; else if (D.id === 'hatch') { D.mesh.position.y = D.cy + 0.65 * e; D.mesh.rotation.x = -1.4 * e; } else if (D.id === 'shrine') D.mesh.position.y = D.cy + 2.5 * e; }
  /* bile pools → Seawater Rot */
  for (let i = POOLS.length - 1; i >= 0; i--) if (POOLS[i].until && POOLS[i].until < t) { if (POOLS[i].mesh) scene.remove(POOLS[i].mesh); POOLS.splice(i, 1); }
  for (const P of POOLS) if (!p.dead && G.mode === 'play' && inRect(p.x, p.z, P) && Math.abs(p.y - P.y) < 0.3) { if (p.rot <= 0) G.say('The black water finds a way in. Seawater Rot.', 3); p.rot = SPEC.status.rot.duration; }
  /* the cloister drains after the bell */
  if (G.flags.cloister_drained && WORLD.drainT < 1) { WORLD.drainT = Math.min(1, WORLD.drainT + dt / 6); cloisterWater.level = lerp(-2.5, -2.98, WORLD.drainT); cloisterWater.mesh.position.y = cloisterWater.level; }
  /* the bell */
  if (WORLD.bellSwing > 0) { WORLD.bellSwing -= dt; bell.rotation.z = Math.sin(t * 5.5) * 0.35 * Math.min(1, WORLD.bellSwing / 2); } else bell.rotation.z = lerp(bell.rotation.z, 0, Math.min(1, dt * 4));
  /* moon gate pulse */
  if (moongate.userData.parts.keystone) { moongate.userData.parts.keystone.rotation.y += dt * 0.5; }
  updateZone(dt); wheel.rotation.z += dt * 0.08;
  /* lift */
  if (LIFT.moving) { LIFT.t += dt; const u = Math.min(1, LIFT.t / LIFT.dur), e = smooth(u), prev = LIFT.rect.y; LIFT.rect.y = lerp(LIFT.from, LIFT.to, e);
    LIFT.mesh.position.y = LIFT.rect.y - 0.125; LIFT.lever.position.y = LIFT.rect.y;
    if (inRect(p.x, p.z, LIFT.rect) && Math.abs(p.y - prev) < 0.4) { p.y = LIFT.rect.y; p.vy = 0; p.grounded = true; }
    if (u >= 1) { LIFT.moving = false; if (G.audio) G.audio.clank(0); } }
  { const li = G.interact.find(e => e.lift); if (li) li.y = LIFT.rect.y; }
  /* crystals idle + torch flicker */
  W.crystals.forEach((c, i) => { c.rotation.y += dt * 0.5; c.position.y = c.userData.baseY === undefined ? (c.userData.baseY = c.position.y) : c.userData.baseY + (reducedMotion ? 0 : Math.sin(t * 1.3 + i) * 0.05); });
  U.lightRange.value[0] = 9 + (reducedMotion ? 0 : Math.sin(t * 7.3) * 0.25 + Math.sin(t * 11.1) * 0.2);
  if (G.audio) G.audio.update(dt, G.enemies.some(e => e.alert && e.state !== 'DEAD' && e.state !== 'DORMANT' && Math.hypot(e.x - p.x, e.z - p.z) < 15 && Math.abs(e.y - p.y) < 2), G.boss && G.boss.state !== 'DEAD' && G.boss.state !== 'DORMANT' && G.boss.alert);
}
