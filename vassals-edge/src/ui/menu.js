/** Pause menu: STATUS · EQUIP · ITEMS · SPELLS · BESTIARY · MAP · SETTINGS. Keyboard, pad and pointer. */
import { G, equipItem, unequipSlot, useItem, recalc } from '../state.js';
import { SPEC, turnRate } from '../spec.js';
import { ITEMS, SLOTS, slotOf } from '../data/items.js';
import { SPELLS } from '../data/spells.js';
import { BEST } from '../data/bestiary.js';
import { U } from '../engine/retro.js';
import { $, esc, fmt } from '../util.js';
import { drawMap, layerOf } from './map.js';
import { INPUT } from '../systems/player.js';

export const MENU = { open: false, tab: 0, idx: 0, sub: null, subIdx: 0, tabs: ['STATUS', 'EQUIP', 'ITEMS', 'SPELLS', 'BESTIARY', 'MAP', 'SETTINGS'], pipe: null, prevMode: 'play', toggleCRT: null, toggleDbg: null, dbgOn: () => false };
export const SETTINGS = [
  { l: 'CRT signal', get: () => MENU.pipe.signalOn ? 'on' : 'off', adj: () => MENU.toggleCRT() },
  { l: 'Scanlines', vals: [0, 0.15, 0.28, 0.45], get: () => SPEC.signal.scanline, set: v => { SPEC.signal.scanline = v; MENU.pipe.setSignal(MENU.pipe.signalOn); } },
  { l: 'Vertex snap (PS1 jitter)', get: () => U.snap.value ? 'on' : 'off', adj: () => { U.snap.value = U.snap.value ? 0 : 1; } },
  { l: 'Affine textures', vals: [0, 0.5, 1], get: () => U.affine.value, set: v => { U.affine.value = v; } },
  { l: 'Look recenters', get: () => SPEC.input.pitchRecenter ? 'on' : 'off', adj: () => { SPEC.input.pitchRecenter = !SPEC.input.pitchRecenter; } },
  { l: 'Invert look', get: () => SPEC.input.invertPitch ? 'on' : 'off', adj: () => { SPEC.input.invertPitch = !SPEC.input.invertPitch; } },
  { l: 'Mouse sensitivity', vals: [0.1, 0.16, 0.22, 0.3, 0.4], get: () => SPEC.input.mouseSens, set: v => { SPEC.input.mouseSens = v; } },
  { l: 'Pad turn scale', vals: [0.6, 0.8, 1, 1.2, 1.5], get: () => SPEC.input.padTurn, set: v => { SPEC.input.padTurn = v; } },
  { l: 'Volume', vals: [0, 0.2, 0.4, 0.6, 0.8, 1], get: () => G.audio.vol.master, set: v => G.audio.setVol('master', v) },
  { l: 'Ambience', vals: [0, 0.25, 0.5, 0.75, 1], get: () => G.audio.vol.amb, set: v => G.audio.setVol('amb', v) },
  { l: 'Effects', vals: [0, 0.25, 0.5, 0.75, 1], get: () => G.audio.vol.sfx, set: v => G.audio.setVol('sfx', v) },
  { l: 'HUD map (against the design)', get: () => SPEC.ui.hudMap ? 'on' : 'off', adj: () => { SPEC.ui.hudMap = !SPEC.ui.hudMap; } },
  { l: 'Doc turn cap (30°/s over 70% load)', get: () => SPEC.formula.hardCapAbove70 ? 'on' : 'off', adj: () => { SPEC.formula.hardCapAbove70 = !SPEC.formula.hardCapAbove70; } },
  { l: 'Skippable first prologue', get: () => SPEC.boot.firstViewingSkippable ? 'on' : 'off', adj: () => { SPEC.boot.firstViewingSkippable = !SPEC.boot.firstViewingSkippable; } },
  { l: 'Debug overlay', get: () => MENU.dbgOn() ? 'on' : 'off', adj: () => MENU.toggleDbg() }
];
function settingAdj(st, dir) { if (st.adj) { st.adj(); return; } const i = st.vals.indexOf(st.get()); let j = i < 0 ? 0 : i + dir; if (j < 0) j = st.vals.length - 1; if (j >= st.vals.length) j = 0; st.set(st.vals[j]); }
export function itemInfo(id) { const it = ITEMS[id], PR = SPEC.progression, p = G.player; let t = it.name + '\n';
  if (it.kind === 'weapon') { const up = p.upgrades[id] || 0; t += 'Physical ' + it.phys + (up ? ' +' + up * 5 : '') + ' ' + it.type + (it.magic ? ' · Magic ' + it.magic + ' ' + it.element : '') +
    '\nScaling STR ' + it.scale + ' → attack ' + fmt(it.phys + up * 5 + p.eff.STR * PR.scaling[it.scale]) + '\nStamina drain ' + it.drain + '% · reach ' + it.reach + ' m · arc ' + it.arcDeg + '° · ' + (it.swing || 'slash') +
    '\nWindup ' + it.windup + ' s · active ' + it.active + ' s · recover ' + it.recover + ' s\nWeight ' + it.weight + ' kg' + (it.bleed ? '\nInflicts bleeding' : ''); }
  else if (it.kind === 'armor') t += (SLOTS.find(sl => sl[0] === it.slot) || ['', ''])[1] + ' · Defense ' + it.def + ' · Weight ' + it.weight + ' kg' + (it.agi ? ' · AGI +' + it.agi : '') + (it.mnd ? ' · MND +' + it.mnd : '') + (it.resist ? ' · resists ' + Object.keys(it.resist).join(', ') : '');
  else if (it.kind === 'ring') t += 'Ring' + (it.agi ? ' · Agility +' + it.agi : '') + (it.str ? ' · Strength +' + it.str : '') + (it.vit ? ' · Vitality +' + it.vit : '');
  else if (it.kind === 'consumable') t += [it.heal && 'Restores ' + it.heal + ' vitality', it.stam && 'Restores ' + it.stam + ' stamina', it.mp && 'Restores ' + it.mp + ' magic', it.cure && 'cures ' + it.cure.join(', ')].filter(Boolean).join(' · ');
  else if (it.kind === 'key') t += 'Key item'; else if (it.kind === 'material') t += 'Material · Garrick forges with it'; else if (it.kind === 'trade') t += 'Trade · Mael takes these';
  else if (it.kind === 'scroll') t += 'Scroll · teaches ' + SPELLS[it.spell].name;
  return t + '\n\n' + it.lore; }
function sheet() { const p = G.player; return { atk: p.weapon.base, def: p.def, load: p.load, R: turnRate(p.agi, p.load), hp: p.hpMax, st: p.stamMax }; }
function deltaInfo(slot, id) { const p = G.player, prev = p.equip[slot], a = sheet(); p.equip[slot] = id; recalc(); const b = sheet(); p.equip[slot] = prev; recalc();
  const d = (l, x, y, dd, u) => { const c = y - x; if (Math.abs(c) < 1e-6) return ''; const cls = (c > 0) === (l !== 'Load') ? 'up' : 'down';
    return '\n' + l + ' ' + fmt(x, dd) + u + ' → <span class="' + cls + '">' + fmt(y, dd) + u + '</span>'; };
  return d('Attack', a.atk, b.atk, 0, '') + d('Defense', a.def, b.def, 0, '') + d('Load', a.load * 100, b.load * 100, 0, '%') + d('Turn rate', a.R, b.R, 1, '°/s') + d('Stamina', a.st, b.st, 0, '') + d('Vitality', a.hp, b.hp, 0, ''); }
function menuModel() {
  const p = G.player, PR = SPEC.progression, rows = []; let detail = '', foot = '';
  const nav = '↑↓ select · Enter activate · ←→ tab or adjust · Esc back';
  switch (MENU.tabs[MENU.tab]) {
    case 'STATUS': { const R = turnRate(p.agi, p.load);
      [['Name', p.name || 'Vassal'], ['Level', p.level], ['Experience', p.exp + ' / ' + PR.expNext(p.level)], ['Vitality', fmt(p.hp) + ' / ' + p.hpMax], ['Magic', fmt(p.mp) + ' / ' + p.mpMax], ['Stamina', fmt(p.stam) + ' / ' + p.stamMax],
       ['STR', p.stats.STR + (p.eff.STR !== p.stats.STR ? ' (+' + (p.eff.STR - p.stats.STR) + ')' : '')], ['AGI', p.stats.AGI + (p.eff.AGI !== p.stats.AGI ? ' (+' + (p.eff.AGI - p.stats.AGI) + ')' : '')], ['VIT', p.stats.VIT + (p.eff.VIT !== p.stats.VIT ? ' (+' + (p.eff.VIT - p.stats.VIT) + ')' : '')], ['MND', p.stats.MND + (p.eff.MND !== p.stats.MND ? ' (+' + (p.eff.MND - p.stats.MND) + ')' : '')],
       ['Attack', fmt(p.weapon.base) + ' (' + p.weapon.name + (p.weapon.up ? ' +' + p.weapon.up : '') + ')'], ['Defense', p.def], ['Equipment load', fmt(p.weight, 1) + ' / ' + fmt(p.cap, 1) + ' kg  (' + fmt(p.load * 100) + '%)'], ['Turn rate', fmt(R, 1) + '°/s'],
       ['Kills', p.kills], ['Status', p.rot > 0 ? 'Seawater Rot (' + fmt(p.rot) + ' s)' : 'none']].forEach(r => rows.push({ l: r[0], v: r[1], dim: true }));
      detail = 'Attack = weapon physical (+5 per forge) + STR × scaling grade.\nDamage dealt × (stamina / max)^1.8 — only a full bar staggers.\nDamage taken × 40 / (40 + Defense).\nTurn rate R = (45 + 1.5·AGI)(1 − 0.5·L²), L = load / capacity.\nCapacity = 15 + 0.6·STR kg. Vitality 80 + 2·VIT, Stamina 80 + 2·AGI, Magic 5·MND.\nEach level: STR +1, VIT +1, AGI +½, MND +⅓.' + (p.rot > 0 ? '\n\nSeawater Rot: 2% vitality per second, stamina regen halved. Moon-Lily Extract or Tide Salve cures it.' : '');
      break; }
    case 'EQUIP': {
      if (!MENU.sub) { SLOTS.forEach(sl => { const id = p.equip[sl[0]]; rows.push({ l: sl[1], v: id ? ITEMS[id].name : '—', act: () => { MENU.sub = { slot: sl[0] }; MENU.subIdx = 0; }, info: id ? esc(itemInfo(id)) : 'Nothing equipped.' }); });
        foot = 'Enter: choose what to wear in this slot. ' + nav; }
      else { const slot = MENU.sub.slot; rows.push({ l: '← back', act: () => { MENU.sub = null; } });
        if (slot !== 'weapon' && p.equip[slot]) rows.push({ l: 'Remove', v: '', act: () => { unequipSlot(slot); MENU.sub = null; }, info: esc('Bare.') + deltaInfo(slot, null) });
        p.inv.filter(e => slotOf(ITEMS[e.id]) === slot).forEach(e => rows.push({ l: (p.equip[slot] === e.id ? '▸ ' : '') + ITEMS[e.id].name, v: ITEMS[e.id].kind === 'weapon' ? 'ATK ' + fmt(ITEMS[e.id].phys + (p.upgrades[e.id] || 0) * 5 + p.eff.STR * PR.scaling[ITEMS[e.id].scale]) : ITEMS[e.id].def !== undefined ? 'DEF ' + ITEMS[e.id].def : '',
          act: () => { equipItem(e.id); MENU.sub = null; }, info: esc(itemInfo(e.id)) + (p.equip[slot] === e.id ? '\n\n(equipped)' : deltaInfo(slot, e.id)) }));
        foot = 'Green raises, red lowers. Load above 70% is where flanking becomes lethal. ' + nav; }
      break; }
    case 'ITEMS': { if (!p.inv.length) rows.push({ l: 'Nothing.', dim: true });
      const order = { weapon: 0, armor: 1, ring: 2, consumable: 3, scroll: 4, material: 5, trade: 6, key: 7 };
      p.inv.slice().sort((a, b) => (order[ITEMS[a.id].kind] || 0) - (order[ITEMS[b.id].kind] || 0)).forEach(e => { const it = ITEMS[e.id], sl = slotOf(it), eq = sl && p.equip[sl] === e.id;
        rows.push({ l: (eq ? '▸ ' : '') + it.name + (e.qty > 1 ? ' ×' + e.qty : ''), v: it.kind + (eq ? ' · equipped' : ''),
          act: () => { if (it.kind === 'consumable') useItem(e.id); else if (sl) { if (eq) { if (sl !== 'weapon') unequipSlot(sl); } else equipItem(e.id); } },
          info: esc(itemInfo(e.id)) + (it.kind === 'consumable' ? '\n\nEnter: use.' : sl && !eq ? deltaInfo(sl, e.id) + '\n\nEnter: equip.' : eq && sl !== 'weapon' ? '\n\nEnter: remove.' : '') }); });
      foot = nav; break; }
    case 'SPELLS': { if (!p.spells.length) rows.push({ l: 'No spells known. Scrolls teach them.', dim: true });
      p.spells.forEach(id => { const sp = SPELLS[id]; rows.push({ l: (p.spell === id ? '▸ ' : '') + sp.name, v: sp.element + ' · ' + sp.mp + ' MP', act: () => { p.spell = id; },
        info: esc(sp.name + '\n' + sp.element + ' · ' + sp.mp + ' MP · charge ' + sp.charge + ' s' + (sp.dmg ? ' · ' + sp.dmg + ' ' + sp.type : '') + (sp.heal ? ' · heals ' + sp.heal : '') + '\n\n' + sp.lore) + (p.spell === id ? '\n\n(readied)' : '\n\nEnter: ready this spell. Cast with R / Y / CAST.') }); });
      foot = 'Magic regenerates slowly; crystals refill it. Charging halves your speed. ' + nav; break; }
    case 'BESTIARY': { const seen = Object.keys(BEST).filter(k => G.flags['seen:' + k]); if (!seen.length) rows.push({ l: 'Nothing met yet.', dim: true });
      seen.forEach(k => { const C = BEST[k]; rows.push({ l: C.name, v: G.flags['slain:' + k] ? 'slain ' + G.flags['slain:' + k] : 'seen', act: () => {},
        info: esc(C.name + '\nVitality ' + C.hp + ' · damage ' + C.damage + (C.ranged ? ' · throws ' + C.ranged.type : '') + '\nWeak: ' + (Object.keys(C.weak).map(w => w + ' ×' + C.weak[w]).join(', ') || 'nothing') + '\nResists: ' + (Object.keys(C.resist).map(w => w + ' ×' + C.resist[w]).join(', ') || 'nothing') + '\n\n' + C.lore) }); });
      foot = 'What you have met, and what it fears. ' + nav; break; }
    case 'MAP': { foot = 'Only where you have walked. Gold: you and your facing. Layer follows your height. ' + nav; break; }
    case 'SETTINGS': { SETTINGS.forEach(st => rows.push({ l: st.l, v: String(st.get()), act: () => settingAdj(st, 1), adj: dir => settingAdj(st, dir) }));
      foot = 'Enter or → next value, ← previous. Settings live for this session. ' + nav; break; }
  }
  return { rows, detail, foot };
}
export function menuRender() {
  const m = menuModel(), tabs = $('#mtabs'), list = $('#mlist'), det = $('#mdetail'), p = G.player;
  tabs.innerHTML = MENU.tabs.map((t, i) => '<div class="' + (i === MENU.tab ? 'on' : '') + '" data-tab="' + i + '">' + t + '</div>').join('') + '<div id="mclose">✕</div>';
  const idx = MENU.sub ? 'subIdx' : 'idx'; if (MENU[idx] >= m.rows.length) MENU[idx] = Math.max(0, m.rows.length - 1);
  const selectable = m.rows.map((r, i) => i).filter(i => !m.rows[i].dim);
  if (selectable.length && m.rows[MENU[idx]] && m.rows[MENU[idx]].dim) MENU[idx] = selectable[0];
  if (MENU.tabs[MENU.tab] === 'MAP') { list.innerHTML = '<canvas id="mapCanvas"></canvas>'; drawMap($('#mapCanvas'), 6); const L = layerOf(p.y); det.innerHTML = 'Layer ' + (L === 0 ? 'ground — the shore and the gallery' : L === -1 ? 'below — the cloister and the cistern' : L < -1 ? 'deep — the sepulchre' : 'above') + '\n\nPale: walked. Dark: within sight but blocked. Black: unknown.'; }
  else { list.innerHTML = m.rows.map((r, i) => '<div class="mrow ' + (r.dim ? 'dim' : '') + (i === MENU[idx] ? ' sel' : '') + '" data-i="' + i + '"><span>' + esc(r.l) + '</span><span class="v">' + esc(r.v === undefined ? '' : r.v) + '</span></div>').join('');
    const cur = m.rows[MENU[idx]]; det.innerHTML = cur && cur.info !== undefined ? cur.info : m.detail; }
  $('#mfoot').textContent = m.foot;
  const selEl = list.querySelector('.mrow.sel'); if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
}
export function menuNav(a) {
  const m = menuModel(), idx = MENU.sub ? 'subIdx' : 'idx', rows = m.rows, sel = rows.map((r, i) => i).filter(i => !rows[i].dim);
  const move = d => { if (!sel.length) return; let k = sel.indexOf(MENU[idx]); k = (k + d + sel.length) % sel.length; MENU[idx] = sel[k]; };
  const tab = d => { MENU.tab = (MENU.tab + d + MENU.tabs.length) % MENU.tabs.length; MENU.sub = null; MENU.idx = 0; };
  const cur = rows[MENU[idx]];
  if (a === 'up') move(-1); else if (a === 'down') move(1);
  else if (a === 'tabL') tab(-1); else if (a === 'tabR') tab(1);
  else if (a === 'left' || a === 'right') { if (cur && cur.adj) cur.adj(a === 'left' ? -1 : 1); else tab(a === 'left' ? -1 : 1); }
  else if (a === 'ok') { if (cur && cur.act) cur.act(); }
  else if (a === 'back') { if (MENU.sub) MENU.sub = null; else { menuToggle(false); return; } }
  menuRender();
}
export function menuToggle(force) { const o = force === undefined ? !MENU.open : force; if (o === MENU.open) return; MENU.open = o; MENU.sub = null;
  $('#menu').classList.toggle('open', o); $('#prompt').classList.remove('show');
  if (o) { MENU.prevMode = G.mode; if (G.mode === 'play') G.mode = 'menu'; for (const k in INPUT.keys) INPUT.keys[k] = false; INPUT.blockHeld.key = INPUT.blockHeld.mouse = false; INPUT.stick.fx = INPUT.stick.fy = 0;
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); menuRender(); }
  else if (G.mode === 'menu') G.mode = 'play'; }
export function initMenu(pipe, toggleCRT, toggleDbg, dbgOn) { MENU.pipe = pipe; MENU.toggleCRT = toggleCRT; MENU.toggleDbg = toggleDbg; MENU.dbgOn = dbgOn;
  $('#menu').addEventListener('click', e => { const row = e.target.closest('.mrow'), tab = e.target.closest('[data-tab]');
    if (e.target.id === 'mclose') { menuToggle(false); return; }
    if (tab) { MENU.tab = +tab.dataset.tab; MENU.sub = null; MENU.idx = 0; menuRender(); return; }
    if (row && !row.classList.contains('dim')) { const i = +row.dataset.i, idx = MENU.sub ? 'subIdx' : 'idx'; if (MENU[idx] === i) menuNav('ok'); else { MENU[idx] = i; menuRender(); } } });
  $('#menuBtn').addEventListener('click', () => menuToggle()); }
