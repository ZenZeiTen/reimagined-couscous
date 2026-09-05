/** INPUT — keyboard/mouse, standard gamepad, touch overlay. Routed by G.mode: boot · cutscene · dialogue · menu · play. */
import { G } from './state.js';
import { SPEC } from './spec.js';
import { INPUT } from './systems/player.js';
import { cycleSpell } from './systems/magic.js';
import { SPELLS } from './data/spells.js';
import { BOOT, bootInput } from './boot.js';
import { MENU, menuNav, menuToggle } from './ui/menu.js';
import { DLG, dialogueInput } from './systems/scripts.js';
import { CS, cutsceneInput } from './systems/cutscenes.js';
import { $, clamp, isTouch } from './util.js';

const KEY = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'turnL', ArrowLeft: 'turnL', KeyD: 'turnR', ArrowRight: 'turnR',
  KeyQ: 'left', KeyE: 'right', KeyI: 'lookUp', KeyK: 'lookDn', PageUp: 'lookUp', PageDown: 'lookDn' };
const MKEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', Space: 'ok', KeyF: 'ok', Backspace: 'back', KeyQ: 'tabL', KeyE: 'tabR', Tab: 'tabR' };
export function initInput(canvas, hooks) {
  const { toggleDbg, toggleCRT, mapCheck } = hooks; const keys = INPUT.keys;
  addEventListener('keydown', e => { G.audio.init();
    if (e.target && e.target.id === 'oathName') return;
    if (CS.active) { if (!/^(Shift|Control|Alt|Meta)/.test(e.code)) cutsceneInput(); e.preventDefault(); return; }
    if (DLG.active) { const k = /^(ArrowUp|KeyW)$/.test(e.code) ? 'up' : /^(ArrowDown|KeyS)$/.test(e.code) ? 'down' : e.code === 'Escape' || e.code === 'Backspace' ? 'back' : 'ok'; dialogueInput(k); e.preventDefault(); return; }
    if (BOOT.active && !MENU.open) {
      const k = /^(ArrowLeft|KeyA)$/.test(e.code) ? 'left' : /^(ArrowRight|KeyD)$/.test(e.code) ? 'right' : /^(Enter|Space|KeyF)$/.test(e.code) ? 'ok' : e.code === 'Escape' ? 'back' : 'any';
      bootInput(k); e.preventDefault(); return; }
    if (BOOT.active && MENU.open && e.code === 'Escape') { menuNav('back'); e.preventDefault(); return; }
    if (e.code === 'Escape' || e.code === 'KeyM') { if (MENU.open && MENU.sub && e.code === 'Escape') menuNav('back'); else menuToggle(); e.preventDefault(); return; }
    if (MENU.open) { if (MKEY[e.code]) { menuNav(MKEY[e.code]); e.preventDefault(); } return; }
    if (KEY[e.code]) { keys[KEY[e.code]] = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyB') INPUT.blockHeld.key = true;
    if (e.code === 'KeyR') INPUT.wantCast = true; if (e.code === 'Tab') { cycleSpell(1); e.preventDefault(); }
    if (/^Digit[1-6]$/.test(e.code)) { const i = +e.code[5] - 1; if (G.player.spells[i]) { G.player.spell = G.player.spells[i]; G.say(SPELLS[G.player.spell].name + ' readied.', 2); } }
    if (e.code === 'Space') { INPUT.wantAttack = true; e.preventDefault(); } if (e.code === 'KeyF' || e.code === 'Enter') INPUT.wantInteract = true;
    if (e.code === 'Backquote') toggleDbg(); if (e.code === 'KeyC') toggleCRT(); if (e.code === 'KeyV') mapCheck(); });
  addEventListener('keyup', e => { if (KEY[e.code]) keys[KEY[e.code]] = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyB') INPUT.blockHeld.key = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; INPUT.blockHeld.key = INPUT.blockHeld.mouse = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  let dragging = false;
  canvas.addEventListener('mousedown', e => { G.audio.init(); if (isTouch) return;
    if (CS.active) { cutsceneInput(); return; } if (DLG.active) { dialogueInput('ok'); return; }
    if (document.pointerLockElement !== canvas) { if (canvas.requestPointerLock && G.mode === 'play') canvas.requestPointerLock(); dragging = true; }
    else if (e.button === 0) INPUT.wantAttack = true; else if (e.button === 2) INPUT.blockHeld.mouse = true; });
  addEventListener('mouseup', e => { dragging = false; if (e.button === 2) INPUT.blockHeld.mouse = false; });
  addEventListener('mousemove', e => { if (isTouch || G.mode !== 'play') return; if (document.pointerLockElement === canvas || dragging) {
    G.player.turnIntent += e.movementX * SPEC.input.mouseSens; G.player.pitchIntent += e.movementY * SPEC.input.mouseSens * 0.8; } });
  /* touch overlay */
  const T = $('#touch'), stickEl = $('#stick'), knob = $('#knob'); let stickId = null, lookId = null, lookLast = null;
  const updateStick = e => { const r = stickEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy), max = 42; if (len > max) { dx *= max / len; dy *= max / len; } knob.style.transform = `translate(${dx}px,${dy}px)`; INPUT.stick.fx = dx / max; INPUT.stick.fy = -dy / max; };
  T.addEventListener('pointerdown', e => { G.audio.init(); if (CS.active) { cutsceneInput(); return; } if (DLG.active) { dialogueInput('ok'); return; } const r = stickEl.getBoundingClientRect();
    const inStick = e.clientX >= r.left - 24 && e.clientX <= r.right + 24 && e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24;
    if (inStick && stickId === null) { stickId = e.pointerId; updateStick(e); } else if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
    try { T.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  T.addEventListener('pointermove', e => { if (e.pointerId === stickId) updateStick(e); else if (e.pointerId === lookId) { G.player.turnIntent += (e.clientX - lookLast.x) * 0.32; G.player.pitchIntent += (e.clientY - lookLast.y) * 0.25; lookLast = { x: e.clientX, y: e.clientY }; } });
  const endTouch = e => { if (e.pointerId === stickId) { stickId = null; INPUT.stick.fx = INPUT.stick.fy = 0; knob.style.transform = ''; } if (e.pointerId === lookId) lookId = null; };
  T.addEventListener('pointerup', endTouch); T.addEventListener('pointercancel', endTouch);
  const tb = (id, fn) => $(id).addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); G.audio.init(); fn(); });
  tb('#btnAtk', () => { if (DLG.active) dialogueInput('ok'); else INPUT.wantAttack = true; }); tb('#btnUse', () => { if (DLG.active) dialogueInput('ok'); else INPUT.wantInteract = true; }); tb('#btnCast', () => { INPUT.wantCast = true; });
  { const bb = $('#btnBlk'); const on = e => { e.stopPropagation(); e.preventDefault(); INPUT.blockHeld.touch = true; bb.classList.add('on'); }; const off = () => { INPUT.blockHeld.touch = false; bb.classList.remove('on'); };
    bb.addEventListener('pointerdown', on); bb.addEventListener('pointerup', off); bb.addEventListener('pointercancel', off); bb.addEventListener('pointerleave', off); }
  $('#dbgBtn').addEventListener('click', toggleDbg); $('#crtBtn').addEventListener('click', toggleCRT);
  $('#dlg').addEventListener('pointerdown', e => { e.preventDefault(); dialogueInput('ok'); });
}
let padBlocked = false;
export function pollGamepad() {
  if (padBlocked) return; let list; const pad = INPUT.pad;
  try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { padBlocked = true; return; }
  let gp = null; for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; }
  if (!gp) { if (pad.connected) { pad.connected = false; pad.fx = pad.fy = pad.tx = pad.ty = 0; pad.block = false; } return; }
  if (!pad.connected) { pad.connected = true; G.say('Gamepad connected: ' + (gp.id || '').slice(0, 48), 3); }
  const dzv = SPEC.input.deadzone, dz = v => Math.abs(v) < dzv ? 0 : (v - Math.sign(v) * dzv) / (1 - dzv);
  const ax = gp.axes, b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  pad.fx = clamp(dz(ax[0] || 0) + (b(5) ? 1 : 0) - (b(4) ? 1 : 0), -1, 1); pad.fy = clamp(-dz(ax[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0), -1, 1);
  pad.tx = clamp(dz(ax[2] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), -1, 1); pad.ty = dz(ax[3] || 0);
  pad.block = b(6) || b(1);
  const now = { attack: b(7) || b(2), use: b(0), start: b(9), crt: b(8), up: b(12) || (ax[1] || 0) < -0.5, down: b(13) || (ax[1] || 0) > 0.5, left: b(14) || (ax[0] || 0) < -0.5, right: b(15) || (ax[0] || 0) > 0.5, back: b(1), lb: b(4), rb: b(5), cast: b(3) };
  const edge = k => now[k] && !pad.prev[k]; const clearAxes = () => { pad.fx = pad.fy = pad.tx = pad.ty = 0; pad.block = false; };
  if (CS.active) { if (Object.keys(now).some(k => edge(k))) cutsceneInput(); pad.prev = now; clearAxes(); return; }
  if (DLG.active) { if (edge('up')) dialogueInput('up'); else if (edge('down')) dialogueInput('down'); else if (edge('use') || edge('attack')) dialogueInput('ok'); else if (edge('back')) dialogueInput('back'); pad.prev = now; clearAxes(); return; }
  if (BOOT.active && !MENU.open) { if (edge('left')) bootInput('left'); else if (edge('right')) bootInput('right'); else if (edge('use') || edge('start')) bootInput('ok'); else if (edge('back')) bootInput('back');
    else if (Object.keys(now).some(k => edge(k)) || Math.abs(ax[0] || 0) > 0.2 || Math.abs(ax[1] || 0) > 0.2) bootInput('any'); pad.prev = now; clearAxes(); return; }
  if (edge('start')) menuToggle();
  if (MENU.open) { clearAxes(); if (edge('up')) menuNav('up'); if (edge('down')) menuNav('down'); if (edge('left')) menuNav('left'); if (edge('right')) menuNav('right'); if (edge('use')) menuNav('ok'); if (edge('back')) menuNav('back'); if (edge('lb')) menuNav('tabL'); if (edge('rb')) menuNav('tabR'); }
  else { if (edge('attack')) INPUT.wantAttack = true; if (edge('use')) INPUT.wantInteract = true; if (edge('crt')) G.hooks.toggleCRT(); if (edge('cast')) INPUT.wantCast = true; }
  pad.prev = now;
}
