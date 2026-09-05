/** In-engine cutscenes: letterboxed camera rails with captions, actor hooks, and an `after` block. Skippable after a grace period. */
import * as THREE from 'three';
import { CUTSCENES } from '../data/cutscenes.js';
import { G, giveItem } from '../state.js';
import { SPEC } from '../spec.js';
import { U } from '../engine/retro.js';
import { camera, rig } from './player.js';
import { zoneLook, WORLD, drainCloister, openThroneWall } from './worldsys.js';
import { wakeEnemy } from './enemies.js';
import { play } from './anim.js';
import { MECH, boat } from '../world/build.js';
import { DLG, endDialogue } from './scripts.js';
import { lerp, smooth, $, CLOCK } from '../util.js';

export const CS = { active: false, id: null, def: null, shot: 0, t: 0, total: 0, seen: {}, boatObj: null, onEnd: null };
const el = () => $('#cine');
function lookAt(cx, cy, cz, tx, ty, tz) { const dx = tx - cx, dz = tz - cz; camera.position.set(cx, cy, cz); camera.rotation.set(Math.atan2(ty - cy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0); camera.updateMatrixWorld(); }
export function letterbox() { const H = window.innerHeight, Wd = window.innerWidth, want = Math.round(Wd / 2.35), bar = Math.max(0, Math.round((H - want) / 2));
  el().querySelector('.bar.top').style.height = bar + 'px'; el().querySelector('.bar.bot').style.height = bar + 'px'; }
export function startCutscene(id, onEnd) {
  const def = CUTSCENES[id]; if (!def || CS.active) return; if (DLG.active) endDialogue(); CS.active = true; CS.id = id; CS.def = def; CS.shot = -1; CS.total = 0; CS.onEnd = onEnd || null; CS.prevMode = G.mode; G.mode = 'cutscene';
  document.body.classList.add('cine'); el().classList.add('on'); $('#prompt').classList.remove('show'); $('#dlg').classList.remove('on'); letterbox(); nextShot();
}
const ACTORS = {
  sentry_patrol: { enter() { const s = G.npcs.enemy_sentry; if (s) { s.state = 'PATROL'; s.alert = false; s.x = -3; s.z = 1.5; s.dir = 1; } }, tick(t) { const s = G.npcs.enemy_sentry; if (s && t > 14) { s.state = 'GUARD'; s.home = { x: s.x, z: s.z, yaw: Math.atan2(-(2 - s.x), -(-1.6 - s.z)) }; } if (s && t > 19.9 && !CS.clanked) { CS.clanked = true; if (G.audio) G.audio.clank(0); } },
    exit() { const s = G.npcs.enemy_sentry; if (s) { s.state = 'PATROL'; s.home = { x: -3, z: 1.5, yaw: 0 }; } } },
  king_twitch: { tick(t) { const k = G.npcs.enemy_king; if (k && k.parts.head) k.parts.head.rotation.y = (t > 10 && t < 10.06) ? 0.3 : 0; if (t > 4 && G.audio && !CS.hum) { CS.hum = true; G.audio.tone(120, 2000, 16, 'sine', 0.1, 0); } } },
  boat: { enter() { if (!CS.boatObj) CS.boatObj = boat(); CS.boatObj.visible = true; rig.visible = true; U.fogColor.value.setRGB(0.012, 0.014, 0.03); U.fogFar.value = 9; U.fogNear.value = 1.5; G.renderer.setClearColor(U.fogColor.value, 1); },
    tick(t, dt) { const bob = Math.sin(t * 1.3) * 0.05; CS.boatObj.position.y = -0.3 + bob; lookAt(-47.4, 0.85 + bob, 0, -60, 0.6, 0); rig.position.set(0.36, -0.3, -0.62); rig.rotation.set(0.5, -0.2, 0.3);
      if (Math.floor(t / 2.4) !== Math.floor((t - dt) / 2.4) && G.audio) { G.audio.noise(0.5, 'bandpass', 500, 180, 0.2, -0.5); G.audio.tone(120, 70, 0.4, 'sawtooth', 0.05, 0.5); } },
    exit() { if (CS.boatObj) CS.boatObj.visible = false; } },
  aldous_rest: { enter() { G.flags.aldous_met = true; } },
  bishop_rise: { enter() { const b = G.npcs.enemy_bishop; G.flags.bishop_woke = true; if (b) { wakeEnemy(b, true); b.group.visible = true; b.y = -3.9; b.riseT = 0; } if (G.audio) G.audio.noise(2.5, 'bandpass', 300, 900, 0.3, 0); },
    tick(t) { const b = G.npcs.enemy_bishop; if (b) b.y = lerp(-3.9, -3, Math.min(1, t / 3.5)); }, exit() { const b = G.npcs.enemy_bishop; if (b) { b.y = -3; b.state = 'CHASE'; b.alert = true; } } },
  bell_swing: { enter() { WORLD.bellSwing = 8; if (G.audio) { G.audio.bell(0, 0.5); setTimeout(() => G.audio.bell(0.2, 0.4), 1400); setTimeout(() => G.audio.bell(-0.2, 0.3), 2800); } } },
  shrine_open: { enter() { drainCloister(); } },
  king_wake: { enter() { const k = G.npcs.enemy_king; G.flags.king_woke = true; if (k) wakeEnemy(k, true); if (G.audio) G.audio.tone(60, 240, 4, 'sawtooth', 0.15, 0); } },
  king_stand: { enter() { if (G.audio) G.audio.bossRoar(); }, exit() { const k = G.npcs.enemy_king; if (k) { k.state = 'CHASE'; k.alert = true; } } },
  king_sit: { enter() { const k = G.npcs.enemy_king; if (k) play(k, 'death', true); } },
  gate_reveal: { enter() { openThroneWall(); if (G.audio) G.audio.gate(); } },
  gate_open: { enter() { if (G.audio) { G.audio.crystal(); G.audio.bell(0, 0.4); } }, tick(t) { const ks = MECH.moongate.userData.parts.keystone; if (ks) ks.material.uniforms.uEmissive.value.setRGB(0.4 + t * 0.08, 0.45 + t * 0.08, 0.7 + t * 0.04); } }
};
function nextShot() {
  const prev = CS.def.shots[CS.shot]; if (prev && prev.actor && ACTORS[prev.actor] && ACTORS[prev.actor].exit) ACTORS[prev.actor].exit();
  CS.shot++; CS.t = 0;
  const L = el().querySelectorAll('.line'); L.forEach(l => l.classList.remove('on'));
  if (CS.shot >= CS.def.shots.length) { endCutscene(); return; }
  const sh = CS.def.shots[CS.shot]; el().querySelector('.black').classList.toggle('on', !!sh.black);
  L[0].textContent = sh.cap ? sh.cap[0] : ''; L[1].textContent = sh.cap ? sh.cap[1] : ''; L[2].textContent = sh.vo || '';
  rig.visible = !!sh.weapon;
  if (sh.zone === 'sea') { if (G.audio) G.audio.setZone('none', true); } else if (sh.zone) { zoneLook(sh.zone); if (G.audio) G.audio.setZone(sh.zone, true); }
  if (sh.actor && ACTORS[sh.actor] && ACTORS[sh.actor].enter) ACTORS[sh.actor].enter();
}
export function updateCutscene(dt) {
  if (!CS.active) return; const sh = CS.def.shots[CS.shot]; if (!sh) return; CS.t += dt; CS.total += dt; const t = CS.t;
  const lines = el().querySelectorAll('.line'), hold = t > (sh.in || 1.2) && t < sh.dur - 1.0;
  if (sh.cap) { lines[0].classList.toggle('on', hold); lines[1].classList.toggle('on', t > (sh.in || 1.2) + 1.4 && t < sh.dur - 1.0); }
  if (sh.vo) lines[2].classList.toggle('on', hold);
  el().querySelector('.skip').classList.toggle('on', CS.total > SPEC.boot.skipGrace && skippable());
  if (sh.cam) { const u = smooth(Math.min(1, t / sh.dur)); const c = sh.camTo ? sh.cam.map((v, i) => lerp(v, sh.camTo[i], u)) : sh.cam; const l = sh.lookTo ? sh.look.map((v, i) => lerp(v, sh.lookTo[i], u)) : sh.look; lookAt(c[0], c[1], c[2], l[0], l[1], l[2]); }
  if (sh.actor && ACTORS[sh.actor] && ACTORS[sh.actor].tick) ACTORS[sh.actor].tick(t, dt);
  if (t >= sh.dur) nextShot();
}
function skippable() { return !(CS.def.unskippableFirst && !CS.seen[CS.id] && !SPEC.boot.firstViewingSkippable); }
export function cutsceneInput() { if (!CS.active || CS.total < SPEC.boot.skipGrace || !skippable()) return;
  for (let i = CS.shot + 1; i < CS.def.shots.length; i++) { const s = CS.def.shots[i]; if (s.actor && ACTORS[s.actor] && ACTORS[s.actor].enter) ACTORS[s.actor].enter(); if (s.actor && ACTORS[s.actor] && ACTORS[s.actor].exit) ACTORS[s.actor].exit(); }
  const cur = CS.def.shots[CS.shot]; if (cur && cur.actor && ACTORS[cur.actor] && ACTORS[cur.actor].exit) ACTORS[cur.actor].exit();
  CS.shot = CS.def.shots.length; endCutscene(); }
function endCutscene() {
  const def = CS.def, id = CS.id; CS.seen[id] = true; CS.active = false; el().classList.remove('on'); document.body.classList.remove('cine'); el().querySelector('.black').classList.remove('on'); rig.visible = true;
  G.mode = (CS.prevMode === 'boot' || CS.prevMode === 'end') ? CS.prevMode : 'play';
  const A = def.after; if (A) { if (A.set) G.flags[A.set] = true; if (A.give) giveItem(A.give, 1, true); if (A.msg) G.say(A.msg, 5); if (A.boss && G.audio) G.audio.bossRoar(); if (A.end && G.hooks.gameEnd) G.hooks.gameEnd(); }
  if (G.hooks.resetZone) G.hooks.resetZone();
  const cb = CS.onEnd; CS.onEnd = null; if (cb) cb();
}
G.hooks.cutscene = id => startCutscene(id);
G.hooks.bossDied = e => { if (e.type === 'king') setTimeout(() => startCutscene('king_fall'), 3200); };
