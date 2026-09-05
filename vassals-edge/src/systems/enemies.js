/**
 * ENEMIES: a shared state machine over BEST archetypes, driven by animation clips (anim.js). Each enemy owns its
 * materials (hit tint, dissolve) and a mote pool. Bosses add phases and stagger armour; crawlers lunge, wisps blink,
 * bowmen and the bishop keep their distance and throw.
 */
import * as THREE from 'three';
import { scene, collide, rayBlocks, lineOfSight, floorAt, LEVEL } from '../engine/level.js';
import { psxMat, U } from '../engine/retro.js';
import { MAT } from '../engine/textures.js';
import { buildModel, modelGroup } from '../engine/models.js';
import { boxGeo } from '../engine/level.js';
import { BEST, RIG_HUMAN } from '../data/bestiary.js';
import { ITEMS } from '../data/items.js';
import { ELEMENT_COLOR } from '../data/spells.js';
import { SPEC } from '../spec.js';
import { G, gainExp } from '../state.js';
import { play, sample } from './anim.js';
import { POOLS } from '../world/build.js';
import { clamp, lerp, wrap, rnd, DEG, RAD, turnStep, CLOCK } from '../util.js';

const ETHER = new THREE.Color(0.80, 0.88, 1.0);
export function spawnEnemy(o) {
  const type = o.type, C = BEST[type], rig = C.rig || RIG_HUMAN;
  const mats = { armor: psxMat({ color: C.colors[0], stipple: !!C.stipple, opacity: C.stipple || 1 }), joint: psxMat({ color: C.colors[1], stipple: !!C.stipple, opacity: C.stipple || 1 }), steel: psxMat({ color: C.colors[2] }),
    crystal: psxMat({ color: 0xcfe2ff, emissive: 0x6d86b0, stipple: true, opacity: 0.85 }), blade: MAT.blade, dark: psxMat({ color: 0x14161a }) };
  Object.values(mats).forEach(m => { m.userData.base = m.uniforms.uColor.value.clone(); m.userData.baseAlpha = m.uniforms.uAlpha.value; m.userData.baseStipple = m.uniforms.uStipple.value; });
  const e = { type, C: Object.assign({}, C), x: o.x, y: o.y, z: o.z, yaw: 0, hp: C.hp, state: o.dormant ? 'DORMANT' : (o.A ? 'PATROL' : 'GUARD'), t: 0, dir: 1, A: o.A, B: o.B, home: { x: o.x, z: o.z, yaw: o.yaw || 0 },
    bounds: o.bounds, avoid: o.avoid || [], alert: false, loseT: 0, moving: false, swingPrev: 0, swingHit: false, flash: 0, deathT: 0, stepPhase: 0, dormantFlag: o.dormant, seated: o.seated, id: o.id,
    dissolve: 0, dissolving: false, cool: 0, lungeCool: 0, blinkCool: 0, guarding: 0, staggerCount: 0, phase: 0, bleedT: 0, mats, group: new THREE.Group(), parts: {}, motes: [], spawn: { x: o.x, y: o.y, z: o.z }, hover: 0 };
  const g = e.group, P = e.parts;
  for (const s in rig) { const n = new THREE.Group(); n.position.set(rig[s][0], rig[s][1], rig[s][2]); g.add(n); P[s] = n; }
  const built = buildModel(C.model, mats, P);
  if (built.sword) { built.sword.position.y = -0.6; built.sword.rotation.x = Math.PI; } if (built.guard) { built.guard.position.y = -0.6; built.guard.rotation.x = Math.PI; }
  if (built.crozier) { built.crozier.position.y = -0.55; built.crozier.rotation.x = Math.PI; }
  g.scale.setScalar(C.scale);
  for (let i = 0; i < SPEC.enemy.death.motes; i++) { const m = new THREE.Mesh(boxGeo(0.06, 0.06, 0.06), MAT.mote); m.visible = false; scene.add(m); e.motes.push({ mesh: m, vy: 0, phase: 0, x: 0, z: 0 }); }
  e.yaw = e.A ? Math.atan2(-(e.B.x - o.x), -(e.B.z - o.z)) : e.home.yaw;
  if (e.state === 'DORMANT' && !e.seated) g.visible = false;
  if (e.seated) play(e, 'sit', true); else play(e, e.A ? 'walk' : 'idle', true);
  scene.add(g); G.enemies.push(e); if (C.boss) G.boss = e; if (o.id) G.npcs['enemy_' + o.id] = e; return e;
}
export function wakeEnemy(e, viaCutscene) { if (e.state !== 'DORMANT') return; e.group.visible = true; e.state = viaCutscene ? 'WAKING' : 'CHASE'; e.alert = !viaCutscene; e.t = 0;
  if (viaCutscene) play(e, e.seated ? 'wake' : 'idle', true); }
export function resetEnemies() { for (const e of G.enemies) { if (e.C.boss && e.state === 'DEAD') continue;
  const wasDormant = e.dormantFlag && !G.flags[e.dormantFlag];
  Object.assign(e, { x: e.spawn.x, y: e.spawn.y, z: e.spawn.z, hp: e.C.hp, state: wasDormant ? 'DORMANT' : (e.A ? 'PATROL' : 'GUARD'), t: 0, dir: 1, alert: false, loseT: 0, flash: 0, deathT: 0, dissolve: 0, dissolving: false, cool: 0, staggerCount: 0, phase: 0, guarding: 0 });
  e.yaw = e.A ? Math.atan2(-(e.B.x - e.x), -(e.B.z - e.z)) : e.home.yaw; e.group.position.y = e.y; e.group.visible = !(wasDormant && !e.seated); e.motes.forEach(o => { o.mesh.visible = false; });
  for (const k in e.mats) { const m = e.mats[k]; m.uniforms.uColor.value.copy(m.userData.base); m.uniforms.uAlpha.value = m.userData.baseAlpha; m.uniforms.uStipple.value = m.userData.baseStipple; m.uniforms.uEmissive.value.setRGB(0, 0, 0); }
  play(e, wasDormant && e.seated ? 'sit' : 'idle', true); }
  G.proj.forEach(pr => scene.remove(pr.mesh)); G.proj.length = 0; }

export function moveEnemy(e, speed, dt, back) {
  const s = back ? -speed : speed, pos = { x: e.x - Math.sin(e.yaw) * s * dt, z: e.z - Math.cos(e.yaw) * s * dt };
  collide(pos, e.C.radius, e.y + 0.05, e.y + 1.8, e.avoid); const B = e.bounds;
  e.x = B ? clamp(pos.x, B.x0, B.x1) : pos.x; e.z = B ? clamp(pos.z, B.z0, B.z1) : pos.z; e.moving = true;
}
export function spawnProj(from, x, y, z, dx, dy, dz, o) {
  const L = Math.hypot(dx, dy, dz) || 1, m = new THREE.Mesh(new THREE.OctahedronGeometry(o.r || 0.22, 0), psxMat({ color: o.color, emissive: o.color, stipple: true, opacity: 0.85 }));
  m.position.set(x, y, z); scene.add(m);
  G.proj.push({ from, x, y, z, vx: dx / L * o.speed, vy: dy / L * o.speed, vz: dz / L * o.speed, r: o.r || 0.3, dmg: o.dmg, type: o.type, stagger: !!o.stagger, life: 3.5, mesh: m, arrow: o.arrow });
}
export function updateProjectiles(dt) {
  const p = G.player, hurt = G.hooks.hurtPlayer, dmgE = G.hooks.damageEnemy;
  for (let i = G.proj.length - 1; i >= 0; i--) { const pr = G.proj[i]; let dead = false;
    const spd = Math.hypot(pr.vx, pr.vy, pr.vz), step = spd * dt; const t = rayBlocks(pr.x, pr.y, pr.z, pr.vx / spd, pr.vy / spd, pr.vz / spd, step + pr.r);
    if (t < step + pr.r) { dead = true;
      for (const b of LEVEL.blocks) if (b.tag === 'timber' && !b.disabled && pr.type === 'fire') { const hx = pr.x + pr.vx * dt, hz = pr.z + pr.vz * dt;
        if (hx > b.x0 - 0.5 && hx < b.x1 + 0.5 && hz > b.z0 - 0.5 && hz < b.z1 + 0.5) { b.disabled = true; b.mesh.visible = false; if (G.audio) G.audio.noise(1.2, 'lowpass', 900, 200, 0.5, 0); G.say('The swollen timbers catch, and give.', 4); G.flags.timber_burnt = true; } } }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt; pr.life -= dt; pr.mesh.position.set(pr.x, pr.y, pr.z); if (pr.arrow) pr.mesh.lookAt(pr.x + pr.vx, pr.y + pr.vy, pr.z + pr.vz); else pr.mesh.rotation.y += dt * 9;
    if (pr.life <= 0) dead = true;
    if (!dead && pr.from === 'enemy' && G.mode === 'play') { if (Math.hypot(pr.x - p.x, pr.z - p.z) < pr.r + SPEC.player.radius && Math.abs(pr.y - (p.y + 1.1)) < 1.0) { hurt(pr.dmg, pr.x, pr.z, pr.type); dead = true; } }
    if (!dead && pr.from === 'player') { for (const e of G.enemies) if (e.state !== 'DEAD' && e.state !== 'DORMANT' && e.group.visible && Math.hypot(pr.x - e.x, pr.z - e.z) < pr.r + e.C.radius && Math.abs(pr.y - (e.y + 1.1)) < 1.4) { dmgE(e, pr.dmg, pr.type, pr.stagger, true); dead = true; break; } }
    if (dead) { scene.remove(pr.mesh); G.proj.splice(i, 1); } }
}
function applyPhase(e) { const C = e.C, base = BEST[e.type]; const frac = e.hp / base.hp; let ph = 0; if (base.phases) for (let i = 0; i < base.phases.length; i++) if (frac <= base.phases[i].at) ph = i + 1;
  if (ph !== e.phase) { e.phase = ph; const P = base.phases[ph - 1]; Object.assign(e.C, base, P ? { chase: P.chase, windup: P.windup, damage: P.damage || base.damage } : {}); if (P && P.ranged) e.C.ranged = Object.assign({}, base.ranged, P.ranged);
    if (P) { G.say(P.msg, 5); if (G.audio) G.audio.bossRoar(); e.state = 'STAGGER'; e.t = 0; play(e, 'stagger', true); } } }
export function updateEnemy(e, dt) {
  const s = e, C = e.C, P = e.parts, D = SPEC.enemy.death, p = G.player, t = CLOCK.t; s.moving = false; s.flash = Math.max(0, s.flash - dt / SPEC.enemy.hitTint); s.cool = Math.max(0, s.cool - dt); s.lungeCool = Math.max(0, s.lungeCool - dt); s.blinkCool = Math.max(0, s.blinkCool - dt); s.guarding = Math.max(0, s.guarding - dt);
  if (s.bleedT > 0 && s.state !== 'DEAD') { s.bleedT -= dt; s.hp -= 4 * dt; if (s.hp <= 0) G.hooks.damageEnemy(s, 1, 'pierce', false, true); }
  if (s.state === 'DORMANT') { if (s.dormantFlag && G.flags[s.dormantFlag] && G.mode === 'play') wakeEnemy(s, false); else { sample(s, dt); pose(s, dt); return; } }
  if (s.state === 'WAKING') { const done = sample(s, dt); s.t += dt; if (done || s.t > 4.2) { s.state = 'CHASE'; s.alert = true; s.t = 0; } pose(s, dt); return; }
  if (s.state === 'DEAD') { s.deathT += dt; sample(s, dt);
    const td = s.deathT - D.fall - D.linger;
    if (td > 0 && s.group.visible && !C.boss) { const u = Math.min(1, td / D.dissolve); s.dissolve = u;
      if (!s.dissolving) { s.dissolving = true; const dx = s.x - p.x, dz = s.z - p.z, dd = Math.hypot(dx, dz); if (G.audio) G.audio.ether((dx * G.right.x + dz * G.right.z) / Math.max(dd, 0.1));
        s.motes.forEach(o => { o.x = s.x + (rnd() - 0.5) * 1.4; o.z = s.z + (rnd() - 0.5) * 0.8; o.vy = 0.3 + rnd() * 0.45; o.phase = rnd() * 6.28; o.mesh.position.set(o.x, s.y + 0.1 + rnd() * 0.7, o.z); o.mesh.visible = true; });
        if (C.burst) { const pool = { x0: s.x - 1.2, x1: s.x + 1.2, z0: s.z - 1.2, z1: s.z + 1.2, y: s.y, until: t + 15 }; const pm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), MAT.sludge);
          pm.rotation.x = -Math.PI / 2; pm.position.set(s.x, s.y + 0.02, s.z); scene.add(pm); pool.mesh = pm; POOLS.push(pool); } }
      s.motes.forEach(o => { const m = o.mesh; m.position.y += o.vy * dt; m.position.x = o.x + Math.sin(t * 2.2 + o.phase) * 0.12; m.position.z = o.z + Math.cos(t * 1.7 + o.phase) * 0.12; const sc = Math.max(0.01, 1 - u); m.scale.set(sc, sc, sc); });
      if (u >= 1) { s.group.visible = false; s.motes.forEach(o => { o.mesh.visible = false; }); dropLoot(s); } }
    else if (C.boss && td > 0 && !s.looted) { s.looted = true; dropLoot(s); }
    pose(s, dt); return; }
  if (G.mode !== 'play' && G.mode !== 'cutscene') { sample(s, dt); pose(s, dt); return; }
  const dx = p.x - s.x, dz = p.z - s.z, dist = Math.hypot(dx, dz), level = Math.abs(p.y - s.y) < 1.8;
  const targetYaw = Math.atan2(-dx, -dz), rel = wrap(targetYaw - s.yaw), turn = C.turn * DEG * dt, inPlay = G.mode === 'play';
  if (!s.alert && inPlay && !p.dead && level && ((dist < C.detect && Math.abs(rel) < C.detectCone / 2 * DEG) || dist < 2.4) && lineOfSight(s.x, s.y + 1.2, s.z, p.x, p.y + 1.2, p.z)) { s.alert = true; s.state = 'CHASE'; s.t = 0; if (G.audio) G.audio.clank(rel > 0 ? -0.5 : 0.5); if (C.boss && G.audio) G.audio.bossRoar(); }
  if (s.alert && (dist > SPEC.enemy.loseDist || p.dead || !level || !inPlay) && !C.boss) { s.loseT += dt; if (s.loseT > SPEC.enemy.loseTime) { s.alert = false; s.state = s.A ? 'PATROL' : 'GUARD'; s.t = 0; } } else s.loseT = 0;
  if (C.boss) applyPhase(s);
  s.t += dt;
  const face = () => { s.yaw = turnStep(s.yaw, targetYaw, turn); return Math.abs(wrap(targetYaw - s.yaw)); };
  switch (s.state) {
    case 'GUARD': { const ty = Math.atan2(-(s.home.x - s.x), -(s.home.z - s.z)), dh = Math.hypot(s.home.x - s.x, s.home.z - s.z);
      if (dh > 0.3) { s.yaw = turnStep(s.yaw, ty, turn); if (Math.abs(wrap(ty - s.yaw)) < 0.3) moveEnemy(s, C.walk, dt); } else s.yaw = turnStep(s.yaw, s.home.yaw, turn); break; }
    case 'PATROL': { const tgt = s.dir > 0 ? s.B : s.A, ddx = tgt.x - s.x, ddz = tgt.z - s.z;
      if (Math.hypot(ddx, ddz) < 0.15) { s.dir *= -1; s.state = 'TURN'; s.t = 0; break; }
      const ty = Math.atan2(-ddx, -ddz); s.yaw = turnStep(s.yaw, ty, turn); if (Math.abs(wrap(ty - s.yaw)) < 0.3) moveEnemy(s, C.walk, dt); break; }
    case 'TURN': { const tgt = s.dir > 0 ? s.B : s.A, ty = Math.atan2(-(tgt.x - s.x), -(tgt.z - s.z)); s.yaw = turnStep(s.yaw, ty, turn);
      if (s.t > 0.6 && Math.abs(wrap(ty - s.yaw)) < 0.05) { s.state = 'PATROL'; s.t = 0; } break; }
    case 'CHASE': { const facing = face(), R = C.ranged;
      if (!inPlay) break;
      if (R && s.cool <= 0 && dist >= R.min && dist <= R.max && facing < 20 * DEG && level && lineOfSight(s.x, s.y + 1.4, s.z, p.x, p.y + 1.2, p.z)) { s.state = 'CAST'; s.t = 0; if (G.audio) G.audio.tone(220, 660, R.charge, 'sine', 0.12, 0); break; }
      if (C.lunge && s.lungeCool <= 0 && dist > 1.6 && dist < C.lunge.range && facing < 15 * DEG && level) { s.state = 'LUNGE'; s.t = 0; s.lungeHit = false; s.lungeCool = C.lunge.cool; if (G.audio) G.audio.noise(0.3, 'bandpass', 400, 1200, 0.3, 0); break; }
      if (R && R.keepDist && dist < R.keepDist && facing < 0.7 && s.cool > 0.4) moveEnemy(s, C.walk, dt, true);
      else if (dist > C.swingRange && facing < 0.7) moveEnemy(s, C.chase, dt);
      if (dist <= C.swingRange && facing < 15 * DEG && level) { s.state = 'WINDUP'; s.t = 0; if (G.audio) G.audio.noise(0.5, 'bandpass', 300, 900, 0.15, 0); } break; }
    case 'LUNGE': { const u = s.t / 0.45; moveEnemy(s, C.lunge.speed, dt);
      if (!s.lungeHit && dist <= C.swingReach && Math.abs(rel) < 0.6) { s.lungeHit = true; G.hooks.hurtPlayer(C.damage * 1.2, s.x, s.z, 'phys'); }
      if (u >= 1) { s.state = 'RECOVER'; s.t = 0; s.recoverT = 0.6; } break; }
    case 'CAST': { face(); const R = C.ranged;
      if (s.t >= R.charge) { const sx = s.x - Math.sin(s.yaw) * 0.5, sz = s.z - Math.cos(s.yaw) * 0.5, sy = s.y + 1.4;
        spawnProj('enemy', sx, sy, sz, p.x - sx, p.y + 1.1 - sy, p.z - sz, { speed: R.speed, dmg: R.damage, type: R.type, color: ELEMENT_COLOR[R.type] || 0xc9c2b0, r: R.type === 'pierce' ? 0.16 : 0.3, arrow: R.type === 'pierce' });
        if (G.audio) { if (R.type === 'pierce') G.audio.bow(); else G.audio.noise(0.3, 'bandpass', 800, 2400, 0.3, 0); } s.cool = R.cool; s.state = 'RECOVER'; s.t = 0; s.recoverT = R.recover; } break; }
    case 'WINDUP': { s.yaw = turnStep(s.yaw, targetYaw, turn * 0.5);
      if (s.t >= C.windup) { s.state = 'SWING'; s.t = 0; s.swingPrev = C.arcDeg / 2; s.swingHit = false; if (G.audio) G.audio.noise(0.3, 'bandpass', 500, 1800, 0.4, 0); } break; }
    case 'SWING': { const u = Math.min(s.t / C.swing, 1), ang = C.arcDeg / 2 - C.arcDeg * u, relR = -rel * RAD;
      if (!s.swingHit && level && dist <= C.swingReach && relR <= s.swingPrev + 6 && relR >= ang - 6 && lineOfSight(s.x, s.y + 1.2, s.z, p.x, p.y + 1.2, p.z)) { s.swingHit = true; G.hooks.hurtPlayer(C.damage, s.x, s.z, 'phys'); }
      s.swingPrev = ang; if (u >= 1) { s.state = 'RECOVER'; s.t = 0; s.recoverT = C.recover; } break; }
    case 'RECOVER': { if (s.t >= (s.recoverT || C.recover)) { s.state = 'CHASE'; s.t = 0; } break; }
    case 'STAGGER': { if (s.t >= C.stagger) { s.state = 'CHASE'; s.t = 0; } break; }
    case 'BLINK': { if (s.t >= 0.35) { s.state = 'CHASE'; s.t = 0; s.group.visible = true; } break; }
  }
  for (const o of G.enemies) if (o !== s && o.state !== 'DEAD' && o.state !== 'DORMANT' && Math.abs(o.y - s.y) < 1.5) { const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz), md = s.C.radius + o.C.radius;
    if (od < md && od > 1e-4) { s.x += ox / od * (md - od) * 0.5; s.z += oz / od * (md - od) * 0.5; } }
  if (!C.noFall) { const g = floorAt(s.x, s.z, s.y + 0.6); if (g > -Infinity && Math.abs(g - s.y) > 0.01) s.y = lerp(s.y, g, Math.min(1, dt * 8)); }
  if (s.moving) { const prev = s.stepPhase; s.stepPhase += dt * 4.2;
    if (Math.floor(prev) !== Math.floor(s.stepPhase)) { const gn = 0.32 * Math.pow(clamp(1 - dist / 12, 0, 1), 2); if (gn > 0.01 && G.audio) G.audio.clank((dx * G.right.x + dz * G.right.z) / Math.max(dist, 0.1)); } }
  /* animation state → clip */
  const want = s.state === 'WINDUP' ? 'windup' : s.state === 'SWING' ? 'swing' : s.state === 'RECOVER' ? 'recover' : s.state === 'STAGGER' ? 'stagger' : s.state === 'CAST' ? 'cast' : s.state === 'LUNGE' ? 'lunge' : s.guarding > 0 ? 'guard' : s.moving ? 'walk' : 'idle';
  play(s, want); sample(s, dt); pose(s, dt);
}
function pose(s, dt) {
  const g = s.group, C = s.C, t = CLOCK.t;
  if (C.hover !== undefined) s.hover = C.hover + Math.sin(t * 1.7 + s.spawn.x) * 0.12;
  g.position.x = s.x; g.position.z = s.z; g.rotation.y = s.yaw; g.position.y = s.y + (s.rootDy || 0) * C.scale + s.hover;
  g.rotation.x = s.rootTilt || 0;
  const f = s.flash * s.flash, u = s.dissolve, cover = 1 - u * u * (3 - 2 * u);
  for (const k in s.mats) { const m = s.mats[k], c = m.uniforms.uColor.value, b = m.userData.base; if (!b) continue;
    c.setRGB(lerp(b.r, Math.min(1, b.r * 1.6 + 0.30), f), lerp(b.g, b.g * 0.35, f), lerp(b.b, b.b * 0.30, f)); if (u > 0) c.lerp(ETHER, u * 0.85);
    m.uniforms.uEmissive.value.setRGB(0.40 * f + 0.45 * u, 0.05 * f + 0.55 * u, 0.02 * f + 0.85 * u); if (u > 0) { m.uniforms.uStipple.value = 1; m.uniforms.uAlpha.value = cover * m.userData.baseAlpha; } }
  if (C.boss && s.state !== 'DEAD') { const ph = s.phase; s.mats.crystal.uniforms.uEmissive.value.setRGB(0.3 + ph * 0.25 + Math.sin(t * (2 + ph * 2)) * 0.15, 0.35 + ph * 0.15, 0.7); }
}
export function updateEnemies(dt) { for (const e of G.enemies) updateEnemy(e, dt); updateProjectiles(dt); }
export function blinkEnemy(e) { if (e.blinkCool > 0 || e.state === 'DEAD') return false; const a = rnd() * Math.PI * 2, nx = e.x + Math.cos(a) * e.C.blink.dist, nz = e.z + Math.sin(a) * e.C.blink.dist;
  const q = { x: nx, z: nz }; collide(q, e.C.radius, e.y + 0.1, e.y + 1.6); const B = e.bounds; e.x = B ? clamp(q.x, B.x0, B.x1) : q.x; e.z = B ? clamp(q.z, B.z0, B.z1) : q.z;
  e.blinkCool = e.C.blink.cool; e.state = 'BLINK'; e.t = 0; e.group.visible = false; if (G.audio) G.audio.ether(0); return true; }
export function dropLoot(e) { const C = e.C; if (!C.drops.length || rnd() > C.dropChance) return;
  C.drops.forEach((id, i) => { const a = i * 2.1 + rnd(), x = e.x + Math.cos(a) * 0.6, z = e.z + Math.sin(a) * 0.6; const it = ITEMS[id];
    const m = modelGroup(it.model); m.rotation.y = rnd() * 3; if (it.kind === 'weapon') m.rotation.z = Math.PI / 2;
    const y = e.y + (it.kind === 'weapon' ? 0.06 : it.kind === 'armor' ? 0.16 : 0.08); G.hooks.addPickup(id, 1, x, y, z, m); }); }
export const relOfPlayer = e => { const p = G.player, ty = Math.atan2(-(p.x - e.x), -(p.z - e.z)); return wrap(ty - e.yaw); };
