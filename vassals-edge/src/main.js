/** MAIN — renderer, pipeline, world assembly, the frame loop. */
import * as THREE from 'three';
import { SPEC } from './spec.js';
import { G, makePlayer, recalc } from './state.js';
import { RetroPipeline, U } from './engine/retro.js';
import { scene, floorAt } from './engine/level.js';
import { W } from './world/build.js';
import { validateMap, auditLayout } from './world/validate.js';
import { AUDIO } from './systems/audio.js';
import { camera, rig, updatePlayer, updateWeapon, setViewModel, updateBasis, INPUT } from './systems/player.js';
import { spawnEnemy, updateEnemies } from './systems/enemies.js';
import { CBT, respawn } from './systems/combat.js';
import { updateMagic } from './systems/magic.js';
import { buildNPCs, updateNPCs } from './systems/npcs.js';
import { buildPickups, buildInteractables, updateInteract, updatePickups } from './systems/interact.js';
import { updateWorld, resetZone } from './systems/worldsys.js';
import { updateDialogue, DLG } from './systems/scripts.js';
import { updateCutscene, CS, letterbox } from './systems/cutscenes.js';
import './systems/save.js';
import { initHUD, updateHUD, toggleDbg, dbgOn, say } from './ui/hud.js';
import { mapVisit } from './ui/map.js';
import { initMenu, MENU, menuToggle } from './ui/menu.js';
import { BOOT, bootUpdate, initBoot } from './boot.js';
import { initInput, pollGamepad } from './input.js';
import { CLOCK, clamp, DEG, RAD, isTouch, $, reducedMotion } from './util.js';

const canvas = $('#c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }); }
catch (e) { $('#hint').textContent = 'WebGL unavailable on this device.'; throw e; }
renderer.setClearColor(U.fogColor.value, 1); G.renderer = renderer; G.audio = AUDIO;
if (reducedMotion) U.snap.value = 0;
scene.add(camera);
const pipe = new RetroPipeline(renderer, SPEC.signal);
G.player = makePlayer(); recalc(); G.player.hp = G.player.hpMax; G.player.stam = G.player.stamMax; G.player.mp = G.player.mpMax;
setViewModel('pale_blade');
buildNPCs(); buildPickups(); buildInteractables();
for (const s of W.spawns) spawnEnemy(s);
initHUD(pipe, renderer);
function toggleCRT() { pipe.setSignal(!pipe.signalOn); $('#crtBtn').textContent = 'CRT: ' + (pipe.signalOn ? 'on' : 'off'); $('#crtBtn').setAttribute('aria-pressed', pipe.signalOn); }
G.hooks.toggleCRT = toggleCRT; G.hooks.resetZone = resetZone;
initMenu(pipe, toggleCRT, toggleDbg, dbgOn);
initBoot();
function mapCheck() { const v = validateMap(G.player.spawn), a = auditLayout(); console.log(v.text + '\n' + a.text); say('MAP CHECK ' + (v.ok && a.ok ? 'PASS' : 'FAIL') + ' — ' + v.lines.concat(a.lines).join(' · '), 10); return { v, a }; }
initInput(canvas, { toggleDbg, toggleCRT, mapCheck });
window.__vareth = { G, validateMap, auditLayout, mapCheck, SPEC, pipe, camera, scene, BOOT, CS, DLG, MENU, W };
if (isTouch) document.body.classList.add('touch');

function resize() {
  const s = pipe.setSize(window.innerWidth, window.innerHeight);
  const aspect = s.vw / s.vh, vfov = clamp(2 * Math.atan(Math.tan(SPEC.hfov / 2 * DEG) / aspect) * RAD, 60, 100);
  camera.aspect = aspect; camera.fov = vfov; camera.updateProjectionMatrix(); if (CS.active) letterbox();
}
addEventListener('resize', resize); resize();
$('#hint').textContent = isTouch ? 'Left stick: move · drag the right side: look · ATTACK / BLOCK (hold) / USE / CAST · MENU for status, equipment, items, map.'
  : 'Click to lock the mouse · W/S move · A/D turn · Q/E strafe · I/K look · Space/LMB attack · Shift/RMB block · F interact · R cast · Tab spell · M or Esc menu · gamepad supported';
setTimeout(() => { $('#hint').style.opacity = 0; }, 9000);
G.player.y = floorAt(G.player.x, G.player.z, 1); updateBasis(); mapVisit();
/* bestiary bookkeeping */
G.hooks.gameStarted = () => {};
const seenTimer = { t: 0 };
function bestiaryVisit(dt) { seenTimer.t += dt; if (seenTimer.t < 0.5) return; seenTimer.t = 0; const p = G.player;
  for (const e of G.enemies) { if (e.state === 'DEAD') { if (!e.counted) { e.counted = true; G.flags['slain:' + e.type] = (G.flags['slain:' + e.type] || 0) + 1; } continue; }
    if (e.state !== 'DORMANT' && e.group.visible && Math.hypot(e.x - p.x, e.z - p.z) < 10 && Math.abs(e.y - p.y) < 3) G.flags['seen:' + e.type] = true; } }

const overlay = r => { if (!rig.visible) return; r.autoClear = false; r.clearDepth(); camera.layers.set(1); r.render(scene, camera); camera.layers.set(0); r.autoClear = true; };
let last = performance.now(), frameErr = 0;
function frame(now) { try { frameInner(now); } catch (e) { frameErr++; console.error(e);
    if (frameErr < 4) { $('#hint').style.opacity = 1; $('#hint').textContent = 'error: ' + (e.message || e); }
    if (frameErr === 3 && CS.active) { CS.shot = 99; G.mode = 'play'; CS.active = false; $('#cine').classList.remove('on'); }
    requestAnimationFrame(frame); } }
function frameInner(now) {
  let dt = Math.min((now - last) / 1000, 0.05); last = now; if (CBT.hitStop > 0) { CBT.hitStop -= dt; dt = 0; } CLOCK.t += dt;
  pollGamepad();
  if (CS.active) { updateCutscene(dt); updateEnemies(dt); updateNPCs(dt); updateWorld(dt); updatePickups(dt); camera.updateMatrixWorld(); pipe.render(scene, camera, overlay); requestAnimationFrame(frame); return; }
  if (BOOT.active) { bootUpdate(dt);
    if (BOOT.state === 'attract') { updateEnemies(dt); updateNPCs(dt); updateWorld(dt); updatePickups(dt); pipe.render(scene, camera, null); }
    else if (BOOT.state === 'title') { updateHUD(dt); pipe.render(scene, camera, overlay); }
    requestAnimationFrame(frame); return; }
  if (DLG.active) { updateDialogue(dt); updateNPCs(dt); updateWorld(dt); updateHUD(dt); pipe.render(scene, camera, overlay); requestAnimationFrame(frame); return; }
  if (MENU.open) { updateHUD(dt); pipe.render(scene, camera, overlay); requestAnimationFrame(frame); return; }
  if (G.player.dead) { CBT.deathTimer -= dt; if (CBT.deathTimer <= 0) respawn(); } else if (G.mode === 'play') updatePlayer(dt);
  updateWeapon(dt); updateEnemies(dt); updateMagic(dt); updateNPCs(dt); updateWorld(dt); updatePickups(dt);
  const tgt = updateInteract(); if (INPUT.wantInteract && tgt && !G.player.dead && G.mode === 'play') tgt.on(); INPUT.wantInteract = false;
  mapVisit(); bestiaryVisit(dt); updateHUD(dt);
  pipe.render(scene, camera, overlay);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
