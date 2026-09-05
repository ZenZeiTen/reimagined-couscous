/** BOOT — studio card · prologue (cutscene) · title card · attract · main menu · oath. No press-start prompt, no sting. */
import { G, makePlayer, recalc } from './state.js';
import { SPEC } from './spec.js';
import { startCutscene, CS, letterbox } from './systems/cutscenes.js';
import { camera, rig, updateBasis } from './systems/player.js';
import { zoneLook, resetZone } from './systems/worldsys.js';
import { floorAt } from './engine/level.js';
import { hasSave, load } from './systems/save.js';
import { menuToggle, MENU } from './ui/menu.js';
import { $ } from './util.js';

export const BOOT = { active: true, state: 'logo', t: 0, seen: false, sel: 1, idle: 0, debounce: 0.25, name: 'Vassal', ITEMS: ['continue', 'new', 'settings'], strike: 0, attractShot: 0, attractT: 0 };
const bootEl = () => $('#boot'), titleEl = () => $('#title'), fadeEl = () => $('#fadeb');
function bootShow(which) { for (const k of ['logo', 'title', 'oath']) $('#' + k).classList.toggle('on', k === which); if (which !== 'cine') $('#cine').classList.remove('on'); }
export function fadeBlack(on) { fadeEl().classList.toggle('on', !!on); }
export function bootGo(state) { BOOT.state = state; BOOT.t = 0; BOOT.debounce = 0.25; rig.visible = true;
  if (state === 'logo') { bootShow('logo'); if (G.audio.ready) G.audio.tone(55, 40, 2.5, 'sine', 0.35, 0); }
  else if (state === 'prologue') { bootShow(''); BOOT.state = 'prologue'; startCutscene('prologue', () => { BOOT.seen = true; G.mode = 'boot'; bootGo('title'); }); }
  else if (state === 'title') { bootShow('title'); titleEl().className = 'play'; BOOT.idle = 0; G.audio.setZone('none', true); titleAudio('start'); titleMenu(); }
  else if (state === 'titleDone') { bootShow('title'); titleEl().className = 'done idle'; BOOT.state = 'title'; BOOT.idle = 0; titleAudio('idle'); titleMenu(); }
  else if (state === 'attract') { bootShow(''); BOOT.state = 'attract'; attractShot(0); }
  else if (state === 'oath') { bootShow('oath'); const inp = $('#oathName'); inp.value = BOOT.name; setTimeout(() => inp.focus(), 50); }
  else if (state === 'play') { startGame(false); }
  else if (state === 'continue') { startGame(true); } }
function titleMenu() { const cont = titleEl().querySelector('[data-m=continue]'); cont.style.display = hasSave() ? '' : 'none'; if (!hasSave() && BOOT.sel === 0) BOOT.sel = 1; bootRenderMenu(); }
function titleAudio(what) { const A = G.audio; if (!A.ready) return; const c = A.ctx, t = c.currentTime;
  if (what === 'start') { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 120; const g = c.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.linearRampToValueAtTime(0.16, t + 4); g.gain.setValueAtTime(0.16, t + 5.6);
      g.gain.linearRampToValueAtTime(0.0001, t + 6.1); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 6.2); BOOT.strike = t + 5.6; }
  else if (what === 'strike') { A.tone(2400, 2300, 0.3, 'sine', 0.2, 0); }
  A.L.wind.gain.setTargetAtTime(0.045, c.currentTime, 0.8); }
/* attract mode: three quiet shots of the world, 21 s each, until any input */
const ATTRACT = [{ zone: 'gallery', cam: [0, 1.3, -1.8], look: [0, 1.2, 1.5] }, { zone: 'shore', cam: [-33.5, 1.3, 2.4], look: [-38.6, 0.9, 0.3] }, { zone: 'sepulchre', cam: [-13, -7.2, -7.5], look: [-10, -7.6, -12.8] }];
function attractShot(i) { BOOT.attractShot = i; BOOT.attractT = 0; $('#cine').classList.add('on'); $('#cine').querySelector('.black').classList.add('on'); $('#cine').querySelectorAll('.line').forEach(l => l.classList.remove('on')); letterbox(); rig.visible = false; }
function attractUpdate(dt) { const t = BOOT.attractT += dt, sh = ATTRACT[BOOT.attractShot]; $('#cine').querySelector('.black').classList.toggle('on', t < 1);
  zoneLook(sh.zone); const [cx, cy, cz] = sh.cam, [tx, ty, tz] = sh.look, dx = tx - cx, dz = tz - cz; camera.position.set(cx + Math.sin(t * 0.1) * 0.3, cy, cz); camera.rotation.set(Math.atan2(ty - cy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0);
  if (t >= 21) attractShot((BOOT.attractShot + 1) % ATTRACT.length); }
function bootRenderMenu() { titleEl().querySelectorAll('.menu span').forEach(sp => sp.classList.toggle('sel', sp.dataset.m === BOOT.ITEMS[BOOT.sel])); }
export function bootInput(kind) { try { bootInputInner(kind); } catch (e) { console.error(e); $('#hint').style.opacity = 1; $('#hint').textContent = 'input error: ' + (e.message || e); bootGo('titleDone'); } }
function bootInputInner(kind) {
  if (!BOOT.active) return; if (BOOT.debounce > 0 && kind !== 'text') return; BOOT.idle = 0; G.audio.init();
  const st = BOOT.state;
  if (st === 'logo') { if (BOOT.t >= 1.5) { fadeBlack(true); setTimeout(() => { fadeBlack(false); bootGo(BOOT.seen ? 'titleDone' : 'prologue'); }, 500); } return; }
  if (st === 'prologue') return;                                   // the cutscene system owns skipping
  if (st === 'attract') { $('#cine').classList.remove('on'); bootGo('titleDone'); return; }
  if (st === 'title') { if (BOOT.t < 9.5 && titleEl().classList.contains('play')) { titleEl().className = 'done idle'; return; }
    const vis = BOOT.ITEMS.filter(k => k !== 'continue' || hasSave());
    if (kind === 'left' || kind === 'right') { let i = vis.indexOf(BOOT.ITEMS[BOOT.sel]); i = (i + (kind === 'left' ? -1 : 1) + vis.length) % vis.length; BOOT.sel = BOOT.ITEMS.indexOf(vis[i]); bootRenderMenu(); G.audio.tone(160, 120, 0.05, 'triangle', 0.08, 0); }
    else if (kind === 'ok') { const m = BOOT.ITEMS[BOOT.sel]; G.audio.tone(110, 80, 1.2, 'sine', 0.25, 0);
      if (m === 'new') { fadeBlack(true); setTimeout(() => { fadeBlack(false); bootGo('oath'); }, 500); }
      else if (m === 'continue') { fadeBlack(true); setTimeout(() => { fadeBlack(false); bootGo('continue'); }, 500); }
      else if (m === 'settings') { MENU.tab = MENU.tabs.indexOf('SETTINGS'); MENU.idx = 0; menuToggle(true); } }
    return; }
  if (st === 'oath') { if (kind === 'ok') { BOOT.name = ($('#oathName').value.trim() || 'Vassal').slice(0, 16); G.audio.tone(110, 80, 1.2, 'sine', 0.25, 0); fadeBlack(true); setTimeout(() => { fadeBlack(false); bootGo('play'); }, 600); }
    else if (kind === 'back') { bootGo('titleDone'); } return; }
}
function startGame(cont) {
  BOOT.active = false; bootEl().classList.remove('on'); document.body.classList.remove('boot'); rig.visible = true; G.mode = 'play';
  const p = G.player; let loaded = false; if (cont) loaded = load();
  if (!loaded) { p.name = BOOT.name; p.x = p.spawn.x; p.z = p.spawn.z; p.yaw = p.spawn.yaw; }
  p.pitch = 0; p.y = floorAt(p.x, p.z, (p.spawn.y || 0) + 1); updateBasis(); resetZone();
  G.say(loaded ? 'The crystal remembers you, ' + p.name + '.' : 'The tide has left you here, ' + p.name + '. Behind you, the sea; ahead, a mouth in the cliff.', 6);
  if (G.hooks.gameStarted) G.hooks.gameStarted();
}
export function bootUpdate(dt) { BOOT.t += dt; BOOT.debounce = Math.max(0, BOOT.debounce - dt);
  if (BOOT.state === 'logo' && BOOT.t >= 3.0 && !BOOT.logoLeft) { BOOT.logoLeft = true; bootInput('any'); }
  else if (BOOT.state === 'title') { BOOT.idle += dt; if (BOOT.t > 9.5 && titleEl().classList.contains('play')) titleEl().className = 'done idle';
    if (BOOT.strike && G.audio.ready && G.audio.ctx.currentTime >= BOOT.strike) { BOOT.strike = 0; titleAudio('strike'); }
    if (BOOT.idle > 45 && !MENU.open) bootGo('attract'); }
  else if (BOOT.state === 'attract') attractUpdate(dt); }
export function initBoot() {
  $('#title').addEventListener('click', e => { const sp = e.target.closest('[data-m]'); if (sp) { BOOT.sel = BOOT.ITEMS.indexOf(sp.dataset.m); bootRenderMenu(); bootInput('ok'); } else bootInput('any'); });
  $('#oathOk').addEventListener('click', () => bootInput('ok')); $('#oathName').addEventListener('keydown', e => { if (e.code === 'Enter') { e.preventDefault(); bootInput('ok'); } e.stopPropagation(); });
  $('#logo').addEventListener('pointerdown', () => bootInput('any')); $('#cine').addEventListener('pointerdown', () => { if (BOOT.state === 'attract') bootInput('any'); });
  document.body.classList.add('boot'); bootEl().classList.add('on'); bootShow('logo');
  G.hooks.gameEnd = () => { G.mode = 'end'; BOOT.active = true; BOOT.seen = true; document.body.classList.add('boot'); bootEl().classList.add('on'); bootGo('titleDone'); G.player = makePlayer(); recalc(); G.player.hp = G.player.hpMax; G.player.stam = G.player.stamMax; G.player.mp = G.player.mpMax; };
}
