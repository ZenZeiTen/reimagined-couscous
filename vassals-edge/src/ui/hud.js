/** HUD: bars, compass card, status lines, boss bar, messages, debug overlay. No minimap, no markers, no quest log. */
import { G } from '../state.js';
import { SPEC, turnRate } from '../spec.js';
import { SPELLS } from '../data/spells.js';
import { $, clamp, RAD, CLOCK } from '../util.js';
import { drawMap } from './map.js';

const HUD = { msgT: 0, wpnT: 0, dbg: false, hudMapT: -9, pipe: null, renderer: null };
export function initHUD(pipe, renderer) { HUD.pipe = pipe; HUD.renderer = renderer; G.say = say; G.hooks.showWeaponName = showWeaponName; }
export function say(text, secs) { const m = $('#msg'); m.textContent = text; m.classList.add('show'); HUD.msgT = secs || 4; }
export function showWeaponName() { $('#wpn').textContent = G.player.weapon.name + (G.player.weapon.up ? ' +' + G.player.weapon.up : ''); $('#wpn').classList.add('show'); HUD.wpnT = 2.5; }
export function toggleDbg() { HUD.dbg = !HUD.dbg; $('#dbg').style.display = HUD.dbg ? 'block' : 'none'; $('#dbgBtn').setAttribute('aria-pressed', HUD.dbg); }
export const dbgOn = () => HUD.dbg;
function drawCompass() {
  const cv = $('#compass'), g = cv.getContext('2d'); if (!g) return; const S = cv.width, c = S / 2, r = c - 3; g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(6,8,14,.8)'; g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.fill(); g.strokeStyle = '#3a3f4c'; g.lineWidth = 1; g.stroke();
  const heading = Math.atan2(G.fwd.x, G.fwd.z); g.save(); g.translate(c, c); g.rotate(-heading);
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, big = i % 4 === 0, len = big ? 6 : 3; g.strokeStyle = big ? '#9fb0c0' : '#5b6673';
    g.beginPath(); g.moveTo(Math.sin(a) * (r - 2 - len), -Math.cos(a) * (r - 2 - len)); g.lineTo(Math.sin(a) * (r - 2), -Math.cos(a) * (r - 2)); g.stroke(); }
  g.font = 'bold 11px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['N', 0, '#c05050'], ['E', Math.PI / 2, '#9fb0c0'], ['S', Math.PI, '#9fb0c0'], ['W', -Math.PI / 2, '#9fb0c0']].forEach(t => { g.save(); g.rotate(t[1]); g.fillStyle = t[2]; g.fillText(t[0], 0, -(r - 13)); g.restore(); });
  g.restore();
  g.fillStyle = '#e8c070'; g.beginPath(); g.moveTo(c, 1); g.lineTo(c - 4, 8); g.lineTo(c + 4, 8); g.closePath(); g.fill();
}
export function updateHUD(dt) {
  const p = G.player, t = CLOCK.t; drawCompass();
  $('#hp i').style.width = clamp(p.hp / p.hpMax * 100, 0, 100) + '%';
  $('#st i').style.width = clamp(p.stam / p.stamMax * 100, 0, 100) + '%';
  $('#mp i').style.width = clamp(p.mp / p.mpMax * 100, 0, 100) + '%';
  $('#st').classList.toggle('low', p.stam < p.stamMax - 0.5); $('#st').classList.toggle('guard', p.block);
  $('#rot').style.display = p.rot > 0 ? 'block' : 'none';
  $('#spell').textContent = p.spell ? SPELLS[p.spell].name + ' · ' + SPELLS[p.spell].mp + ' MP' + (p.cast ? ' …' : '') + (p.wardT > t ? ' · warded' : '') + (p.galeT > t ? ' · gale' : '') : '';
  $('#pearls').textContent = G.count('pearl') ? '◦ ' + G.count('pearl') + ' pearl' + (G.count('pearl') === 1 ? '' : 's') : '';
  const b = G.boss, bb = $('#boss'); if (b && b.alert && b.state !== 'DEAD' && b.state !== 'DORMANT' && G.mode === 'play' && Math.hypot(b.x - p.x, b.z - p.z) < 18 && Math.abs(b.y - p.y) < 3) { bb.classList.add('show'); $('#boss i').style.width = clamp(b.hp / b.C.hp * 100, 0, 100) + '%'; $('#boss .name').textContent = b.C.name; } else bb.classList.remove('show');
  if (SPEC.ui.hudMap) { $('#hudmap').style.display = 'block'; if (t - HUD.hudMapT > 0.25) { HUD.hudMapT = t; drawMap($('#hudmap'), 3); } } else $('#hudmap').style.display = 'none';
  if (HUD.msgT > 0) { HUD.msgT -= dt; if (HUD.msgT <= 0) $('#msg').classList.remove('show'); }
  if (HUD.wpnT > 0) { HUD.wpnT -= dt; if (HUD.wpnT <= 0) $('#wpn').classList.remove('show'); }
  if (HUD.dbg) { const r = p.stam / p.stamMax, R = turnRate(p.agi, p.load), pipe = HUD.pipe;
    $('#dbg').textContent = `res ${pipe.vw}x${pipe.vh} @${pipe.scale}x  calls ${HUD.renderer.info.render.calls}  tris ${HUD.renderer.info.render.triangles}  mode ${G.mode}\n` +
      `AGI ${p.agi}  L ${p.load.toFixed(2)}  R ${R.toFixed(1)}°/s  stam ${p.stam.toFixed(0)}/${p.stamMax}  mult ${SPEC.formula.stamMult(r).toFixed(2)}  dmg ${(p.weapon.base * SPEC.formula.stamMult(r)).toFixed(1)}  def ${p.def}  lv ${p.level} exp ${p.exp}\n` +
      `pos ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}  yaw ${(p.yaw * RAD).toFixed(0)}  pitch ${(p.pitch * RAD).toFixed(0)}  block ${p.block}${p.guardBreak > 0 ? ' BROKEN' : ''}\n` +
      G.enemies.filter(e => Math.hypot(e.x - p.x, e.z - p.z) < 16).map(e => `${e.type} ${e.state} hp ${Math.max(0, e.hp).toFixed(0)}${e.alert ? '!' : ''}`).join(' | ') + `  proj ${G.proj.length}\nflags ${Object.keys(G.flags).filter(k => G.flags[k] === true && !k.startsWith('took:')).join(',')}`; }
}
