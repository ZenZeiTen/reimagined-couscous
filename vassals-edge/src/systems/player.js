/** The weighted first-person controller, the held weapon (view-model, layer 1) with per-type swing animations, and the camera. */
import * as THREE from 'three';
import { G } from '../state.js';
import { SPEC, turnRate } from '../spec.js';
import { SPELLS } from '../data/spells.js';
import { ITEMS } from '../data/items.js';
import { collide, floorAt, rayBlocks, lineOfSight, ladderAt, STEP_BODY } from '../engine/level.js';
import { U, psxMat } from '../engine/retro.js';
import { MAT } from '../engine/textures.js';
import { buildModel, hasModel } from '../engine/models.js';
import { inWater } from './worldsys.js';
import { startAttack, relAngleFromPlayer, hurtPlayer, damageEnemy, die } from './combat.js';
import { revealIllusion } from './worldsys.js';
import { startCast } from './magic.js';
import { MECH } from '../world/build.js';
import { clamp, lerp, DEG, reducedMotion, CLOCK } from '../util.js';

export const camera = new THREE.PerspectiveCamera(80, 4 / 3, 0.05, 40); camera.rotation.order = 'YXZ';
export const rig = new THREE.Group(); camera.add(rig);
export const INPUT = { keys: {}, wantAttack: false, wantInteract: false, wantCast: false, blockHeld: { key: false, mouse: false, touch: false }, stick: { fx: 0, fy: 0 }, pad: { fx: 0, fy: 0, tx: 0, ty: 0, block: false, connected: false, prev: {} } };
G.fwd = { x: 0, z: 0 }; G.right = { x: 0, z: 0 };
export function updateBasis() { const p = G.player; G.fwd.x = -Math.sin(p.yaw); G.fwd.z = -Math.cos(p.yaw); G.right.x = Math.cos(p.yaw); G.right.z = -Math.sin(p.yaw); }
const VIEW_MATS = { blade: MAT.blade, hilt: MAT.hilt, steel: psxMat({ color: 0x7d7f82 }), crystal: MAT.crystal, sapphire: psxMat({ color: 0x2a3550, emissive: 0x101a30 }), wood: psxMat({ color: 0x4a3a28 }), iron: psxMat({ color: 0x4a4038 }) };
let viewModelId = null;
export function setViewModel(id) {
  if (viewModelId === id) return; viewModelId = id;
  for (let i = rig.children.length - 1; i >= 0; i--) rig.remove(rig.children[i]);
  const it = ITEMS[id], model = it && hasModel(it.model) ? it.model : 'pale_blade';
  buildModel(model, VIEW_MATS, { root: rig });
  const s = it && it.kind === 'weapon' ? Math.min(1, 1.15 / Math.max(1, (it.reach || 1.9) * 0.6)) : 1; rig.scale.setScalar(s);
  rig.traverse(o => o.layers.set(1));
}
G.hooks.weaponChanged = id => { setViewModel(id); if (G.hooks.showWeaponName) G.hooks.showWeaponName(); };

export function updatePlayer(dt) {
  const p = G.player, S = SPEC.player, keys = INPUT.keys, pad = INPUT.pad, stick = INPUT.stick;
  const Gd = S.guard, IN = SPEC.input;
  p.guardBreak = Math.max(0, p.guardBreak - dt);
  const holdBlock = INPUT.blockHeld.key || INPUT.blockHeld.mouse || INPUT.blockHeld.touch || pad.block;
  p.block = holdBlock && !p.attack && p.guardBreak <= 0 && p.stam > 0;
  if (p.block) { p.stam = Math.max(0, p.stam - Gd.drain * dt); p.lastSwing = CLOCK.t; }
  p.blockAmt += ((p.block ? 1 : 0) - p.blockAmt) * Math.min(1, 12 * dt);
  const R = turnRate(p.agi, p.load) * (p.block ? Gd.turnMult : 1) * (p.galeT > CLOCK.t ? SPELLS.gale.gale.turn : 1), maxStep = R * dt;
  if (keys.turnL) p.turnIntent -= maxStep * 1.05; if (keys.turnR) p.turnIntent += maxStep * 1.05;
  if (pad.tx) p.turnIntent += pad.tx * maxStep * 1.05 * IN.padTurn;
  p.turnIntent = clamp(p.turnIntent, -110, 110);
  const step = clamp(p.turnIntent, -maxStep, maxStep); p.yaw -= step * DEG; p.turnIntent -= step; p.turnVel = step / Math.max(dt, 1e-4);
  let pitchAxis = clamp(pad.ty + (keys.lookDn ? 1 : 0) - (keys.lookUp ? 1 : 0), -1, 1) * (IN.invertPitch ? -1 : 1);
  if (pitchAxis) { p.pitchIntent += pitchAxis * maxStep * 0.8; p.pitchHold = 0.3; }
  if (Math.abs(p.pitchIntent) > 0.02) p.pitchHold = 0.3;
  const pstep = clamp(p.pitchIntent, -maxStep * 0.8, maxStep * 0.8); p.pitch = clamp(p.pitch - pstep * DEG, -IN.pitchMax, IN.pitchMax); p.pitchIntent -= pstep;
  p.pitchHold -= dt;
  if (IN.pitchRecenter && p.pitchHold <= 0 && !pitchAxis) { const rc = maxStep * 0.6 * DEG; p.pitch = Math.abs(p.pitch) <= rc ? 0 : p.pitch - Math.sign(p.pitch) * rc; }
  updateBasis();
  let fv = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0) + stick.fy + pad.fy, sv = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stick.fx + pad.fx;
  fv = clamp(fv, -1, 1); sv = clamp(sv, -1, 1);
  const loadF = 1 - 0.3 * p.load, atkF = ((p.attack && p.attack.t < p.weapon.windup + p.weapon.active) ? 0.35 : 1) * (p.block ? Gd.moveMult : 1);
  const gale = p.galeT > CLOCK.t ? SPELLS.gale.gale.speed : 1, castF = p.cast ? SPEC.magic.castMove : 1;
  const wet = inWater() ? 0.6 : 1, fs = (fv >= 0 ? S.speed : S.backSpeed) * loadF * atkF * wet * gale * castF, ss = S.strafeSpeed * loadF * atkF * wet * gale * castF;
  const lad = ladderAt(p.x, p.z, p.y), onLadder = !!lad; let climbing = false;
  if (onLadder) { const fd = G.fwd.x * lad.fx + G.fwd.z * lad.fz, vin = fd > 0.25 ? fv : fd < -0.25 ? -fv : 0;
    if ((vin > 0.05 && p.y < (lad.yTop ? lad.yTop() : lad.y1) - 1e-3) || (vin < -0.05 && p.y > lad.y0 + 1e-3)) { climbing = true; const py = p.y;
      p.y = clamp(p.y + vin * 1.3 * dt, lad.y0, lad.yTop ? lad.yTop() : lad.y1); if (Math.floor(py / 0.6) !== Math.floor(p.y / 0.6) && G.audio) G.audio.clank(-0.2); } }
  if (climbing) fv = sv = 0;
  const tx = G.fwd.x * fv * fs + G.right.x * sv * ss, tz = G.fwd.z * fv * fs + G.right.z * sv * ss;
  const k = Math.min(1, S.accel * dt); p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
  const pos = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
  const ceil = { y: Infinity }; collide(pos, S.radius, p.y + STEP_BODY, p.y + 1.75, null, ceil);
  if (ceil.y < Infinity && p.y + 1.75 > ceil.y) { p.y = ceil.y - 1.75; p.vy = Math.min(p.vy, 0); }
  for (const e of G.enemies) if (e.state !== 'DEAD' && e.state !== 'DORMANT' && e.group.visible) { const dx = pos.x - e.x, dz = pos.z - e.z, d = Math.hypot(dx, dz), minD = S.radius + e.C.radius;
    if (d < minD && d > 1e-4 && Math.abs(p.y - e.y) < 1.5) { pos.x += dx / d * (minD - d); pos.z += dz / d * (minD - d); } }
  p.x = pos.x; p.z = pos.z;
  let g = floorAt(p.x, p.z, p.y); if (g === -Infinity) g = p.lastGround; else p.lastGround = g;
  if (onLadder) { p.vy = 0; p.grounded = true; if (g > p.y) p.y = g; }
  else if (p.y > g + 0.02) { p.vy -= 14 * dt; p.y += p.vy * dt; p.grounded = false;
    if (p.y <= g) { const v = -p.vy; p.y = g; p.vy = 0; p.grounded = true; if (G.audio) { G.audio.step(0.3, 0, inWater() ? 'water' : (floorAt.last && floorAt.last.surf) || 'stone'); if (v > 4) G.audio.noise(0.2, 'lowpass', 500, 120, 0.3, 0); }
      if (v > SPEC.fallDamage.safeSpeed) hurtPlayer((v - SPEC.fallDamage.safeSpeed) * SPEC.fallDamage.perMs); } }
  else { p.y = g; p.vy = 0; p.grounded = true; }
  if (p.y < -11) hurtPlayer(999);
  const spd = Math.hypot(p.vx, p.vz) / S.speed; p.bobAmt += (spd - p.bobAmt) * Math.min(1, 6 * dt);
  if (p.grounded && spd > 0.05) { const prev = p.bob; p.bob += dt * 7.5 * (0.5 + spd * 0.5);
    if (Math.floor(prev / Math.PI) !== Math.floor(p.bob / Math.PI)) { floorAt(p.x, p.z, p.y); const f = floorAt.last;
      if (G.audio) G.audio.step(0.16 + 0.1 * spd, 0, inWater() ? 'water' : (f && f.tag === 'lift') ? 'iron' : (f && f.surf) || 'stone'); } }
  if (CLOCK.t - p.lastSwing > S.regenDelay) p.stam = Math.min(p.stamMax, p.stam + S.stamRegen * (p.rot > 0 ? SPEC.status.rot.regenMult : 1) * dt);
  if (p.rot > 0) { p.rot -= dt; p.hp -= p.hpMax * SPEC.status.rot.hpPerSec * dt; if (p.hp <= 0) { p.hp = 0; die(); } }
  p.iframes = Math.max(0, p.iframes - dt); p.shake = Math.max(0, p.shake - dt);
  if (INPUT.wantAttack) { p.cast = null; startAttack(); }
  INPUT.wantAttack = false; if (p.block) p.cast = null;
  if (INPUT.wantCast) startCast(); INPUT.wantCast = false;
}
/** The swing itself: pose curves per weapon type, the sweep hit test, the illusion-wall knock, retraction near walls. */
export function updateWeapon(dt) {
  const p = G.player, W = p.weapon, a = p.attack; let ax = 0, ay = 0, az = 0, px = 0, py = 0, pz = 0;
  if (a) { a.t += dt; const w = W.windup, ac = W.active, rc = W.recover, kind = a.kind;
    if (a.t < w) { const u = a.t / w;
      if (kind === 'thrust') { pz = 0.18 * u; ax = 0.15 * u; ay = -0.2 * u; } else if (kind === 'crush') { ax = 1.3 * u; py = 0.15 * u; az = -0.1 * u; } else { ay = -0.7 * u; ax = 0.45 * u; px = 0.12 * u; az = -0.3 * u; } }
    else if (a.t < w + ac) { const u = (a.t - w) / ac, e = u * u;
      if (kind === 'thrust') { pz = lerp(0.18, -0.55, e); px = -0.08 * u; ax = lerp(0.15, -0.1, u); ay = lerp(-0.2, 0.05, u); }
      else if (kind === 'crush') { ax = lerp(1.3, -0.5, e); py = lerp(0.15, -0.2, e); pz = -0.15 * u; az = lerp(-0.1, 0.15, u); }
      else { ay = lerp(-0.7, 1.35, e); ax = lerp(0.45, -0.35, u); px = lerp(0.12, -0.3, e); az = lerp(-0.3, 0.4, e); py = -0.12 * Math.sin(u * Math.PI); }
      const ang = W.arcDeg / 2 - W.arcDeg * u;
      for (const e2 of G.enemies) { if (e2.state === 'DEAD' || e2.state === 'DORMANT' || e2.state === 'WAKING' || !e2.group.visible || (a.hitSet && a.hitSet.has(e2))) continue; const dx = e2.x - p.x, dz = e2.z - p.z, d = Math.hypot(dx, dz);
        if (d <= W.reach + e2.C.radius && Math.abs(e2.y + (e2.hover || 0) - p.y) < 1.8) { const rel = relAngleFromPlayer(e2.x, e2.z);
          const inArc = kind === 'thrust' ? (Math.abs(rel) <= W.arcDeg / 2 + 6 && u > 0.3) : (rel <= a.prev + 6 && rel >= ang - 6);
          if (inArc && lineOfSight(p.x, p.y + 1.4, p.z, e2.x, e2.y + 1.2, e2.z)) { (a.hitSet = a.hitSet || new Set()).add(e2); a.hit = true; damageEnemy(e2, a.dmg, W.type, a.stagger); } } }
      if (!a.illusionHit && !MECH.illusion.userData.revealed) { const d = Math.hypot(5 - p.x, -4.0 - p.z);
        if (d <= W.reach + 0.6 && Math.abs(p.y) < 1) { const rel = relAngleFromPlayer(5, -4.0); if (Math.abs(rel) < W.arcDeg / 2 + 8) { a.illusionHit = true; revealIllusion(); } } }
      a.prev = ang; }
    else if (a.t < w + ac + rc) { const u = (a.t - w - ac) / rc, e = 1 - (1 - u) * (1 - u);
      if (kind === 'thrust') { pz = lerp(-0.55, 0, e); px = lerp(-0.08, 0, e); ax = lerp(-0.1, 0, e); } else if (kind === 'crush') { ax = lerp(-0.5, 0, e); py = lerp(-0.2, 0, e); pz = lerp(-0.15, 0, e); az = lerp(0.15, 0, e); }
      else { ay = lerp(1.35, 0, e); ax = lerp(-0.35, 0, e); px = lerp(-0.3, 0, e); az = lerp(0.4, 0, e); } }
    else p.attack = null; }
  p.swayV += (clamp(p.turnVel, -70, 70) / 70 - p.swayV) * Math.min(1, 6 * dt);
  const probe = rayBlocks(p.x, p.y + SPEC.player.eyeHeight - 0.2, p.z, G.fwd.x, 0, G.fwd.z, SPEC.render.weaponLength);
  const retT = clamp((SPEC.render.weaponLength - probe) / (SPEC.render.weaponLength - 0.25), 0, 1);
  p.retract = lerp(p.retract || 0, retT, Math.min(1, 10 * dt)); const rt = p.retract;
  const bobY = reducedMotion ? 0 : Math.sin(p.bob) * 0.045 * p.bobAmt, bobX = reducedMotion ? 0 : Math.cos(p.bob * 0.5) * 0.02 * p.bobAmt;
  const gb = p.blockAmt, cs = p.cast ? Math.min(1, p.cast.t * 3) : 0;
  rig.position.set(0.36 + px + p.swayV * 0.03 - rt * 0.08 - gb * 0.22 + cs * 0.1, -0.34 + py + bobY * 0.5 - rt * 0.1 + gb * 0.06 - cs * 0.08, -0.62 + pz + rt * 0.28 - gb * 0.05 + cs * 0.1);
  rig.rotation.set(-0.38 + ax + rt * 0.95 + gb * 0.35 + cs * 0.3, -0.28 + ay + p.swayV * 0.14 + rt * 0.25 + gb * 0.55, 0.32 + az - p.swayV * 0.08 - rt * 0.2 + gb * 1.15);
  const sh = p.shake > 0 ? p.shake * 0.05 : 0;
  camera.position.set(p.x + bobX * G.right.x + (Math.random() - 0.5) * sh, p.y + SPEC.player.eyeHeight + bobY + (Math.random() - 0.5) * sh, p.z + bobX * G.right.z + (Math.random() - 0.5) * sh);
  camera.rotation.set(p.pitch, p.yaw, 0);
  U.lightPos.value[0].set(p.x + G.fwd.x * 0.3, p.y + 1.4, p.z + G.fwd.z * 0.3);
}
