/**
 * G — the game state and the hub every system hangs off (avoids import cycles: systems register their entry
 * points on G at load, and call each other through it). Saved fields are listed in save.js.
 */
import { SPEC } from './spec.js';
import { ITEMS, slotOf } from './data/items.js';
import { SPELLS } from './data/spells.js';
import { clamp, CLOCK } from './util.js';

export const G = {
  flags: {}, player: null, enemies: [], proj: [], interact: [], npcs: {}, boss: null,
  mode: 'boot',                       // boot | play | cutscene | dialogue | menu | dead | end
  say: (t, s) => console.log('[say]', t),   // replaced by the HUD
  audio: null, hooks: {},
  hasItem(id) { return !!invEntry(id); }, count(id) { const e = invEntry(id); return e ? e.qty : 0; }
};
export function makePlayer() {
  return { x: -30, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: -Math.PI / 2, pitch: 0, turnIntent: 0, pitchIntent: 0, turnVel: 0, swayV: 0,
    hp: 100, stam: 100, mp: 40, agi: 10, load: 0, lastSwing: -9, attack: null, name: 'Vassal',
    bob: 0, bobAmt: 0, dead: false, iframes: 0, shake: 0, spawn: { x: -30, z: 0, yaw: -Math.PI / 2, y: 0 }, grounded: true, lastGround: 0, block: false, blockAmt: 0, guardBreak: 0, pitchHold: 0, retract: 0,
    stats: Object.assign({}, SPEC.player.stats), acc: { AGI: 0, MND: 0 }, level: 1, exp: 0, rot: 0, bleed: 0, upgrades: {},
    inv: [{ id: 'pale_blade', qty: 1 }, { id: 'wanderer_coat', qty: 1 }, { id: 'pilgrim_sandals', qty: 1 }], spells: [], spell: null, cast: null, wardT: 0, galeT: 0, kills: 0,
    equip: { weapon: 'pale_blade', head: null, body: 'wanderer_coat', arms: null, legs: 'pilgrim_sandals', ring: null } };
}
export function invEntry(id) { return G.player.inv.find(e => e.id === id); }
/** derived sheet: everything combat reads comes from here, never from the raw stats */
export function recalc() {
  const p = G.player, PR = SPEC.progression, st = Object.assign({}, p.stats); let resist = {};
  for (const k in p.equip) { const it = p.equip[k] && ITEMS[p.equip[k]]; if (!it) continue;
    st.AGI += it.agi || 0; st.MND += it.mnd || 0; st.STR += it.str || 0; st.VIT += it.vit || 0; if (it.resist) Object.assign(resist, it.resist); }
  p.eff = st; p.agi = st.AGI; p.resist = resist;
  p.hpMax = PR.baseHP + st.VIT * PR.hpPerVIT; p.stamMax = PR.baseSTAM + st.AGI * PR.stamPerAGI; p.mpMax = st.MND * PR.mpPerMND;
  let w = 0, def = 0; for (const k in p.equip) { const it = p.equip[k] && ITEMS[p.equip[k]]; if (it) { w += it.weight; def += it.def || 0; } }
  p.cap = PR.capBase + st.STR * PR.capPerSTR; p.weight = w; p.load = clamp(w / p.cap, 0, 1); p.def = def;
  const wp = ITEMS[p.equip.weapon], up = p.upgrades[p.equip.weapon] || 0;
  p.weapon = Object.assign({}, wp, { id: p.equip.weapon, base: wp.phys + up * 5 + st.STR * PR.scaling[wp.scale], up });
  p.hp = Math.min(p.hp, p.hpMax); p.stam = Math.min(p.stam, p.stamMax); p.mp = Math.min(p.mp, p.mpMax);
}
export function giveItem(id, qty, quiet) { qty = qty || 1; const it = ITEMS[id], p = G.player; if (!it) return;
  if (it.kind === 'scroll') { if (p.spells.indexOf(it.spell) < 0) p.spells.push(it.spell); if (!p.spell) p.spell = it.spell;
    if (!quiet) G.say(it.name + ' — ' + SPELLS[it.spell].name + ' learned. ' + SPELLS[it.spell].lore, 8); return; }
  const e = invEntry(id); if (e) e.qty += qty; else p.inv.push({ id, qty }); if (it.kind === 'ring' && !p.equip.ring) p.equip.ring = id;
  recalc(); if (!quiet) G.say(it.name + (qty > 1 ? ' ×' + qty : '') + ' — ' + it.lore, 8); }
export function takeItem(id, qty) { const e = invEntry(id); if (!e || e.qty < (qty || 1)) return false; e.qty -= qty || 1; if (e.qty <= 0) G.player.inv.splice(G.player.inv.indexOf(e), 1); recalc(); return true; }
export function equipItem(id) { const it = ITEMS[id]; if (!it || !invEntry(id)) return false; const slot = slotOf(it);
  if (!slot) return false; G.player.equip[slot] = id; recalc(); if (slot === 'weapon' && G.hooks.weaponChanged) G.hooks.weaponChanged(id); return true; }
export function unequipSlot(slot) { if (slot === 'weapon') return false; G.player.equip[slot] = null; recalc(); return true; }
export function useItem(id) { const it = ITEMS[id], e = invEntry(id); if (!it || !e || it.kind !== 'consumable') return false;
  const p = G.player; const parts = [];
  if (it.heal) { p.hp = Math.min(p.hpMax, p.hp + it.heal); parts.push('vitality restored'); }
  if (it.stam) { p.stam = Math.min(p.stamMax, p.stam + it.stam); parts.push('the arm steadies'); }
  if (it.mp) { p.mp = Math.min(p.mpMax, p.mp + it.mp); parts.push('magic returns'); }
  if (it.cure) { if (it.cure.indexOf('rot') >= 0 && p.rot > 0) { p.rot = 0; parts.push('the Rot recedes'); } if (it.cure.indexOf('bleed') >= 0 && p.bleed > 0) { p.bleed = 0; parts.push('the bleeding stops'); } }
  e.qty--; if (e.qty <= 0) p.inv.splice(p.inv.indexOf(e), 1); if (G.audio) G.audio.chime(); G.say(it.name + ': ' + (parts.join(', ') || 'used') + '.', 3); return true; }
export function gainExp(n) { const p = G.player, PR = SPEC.progression; p.exp += n; let up = false;
  while (p.exp >= PR.expNext(p.level)) { p.exp -= PR.expNext(p.level); p.level++; up = true;
    p.stats.STR += PR.perLevel.STR; p.stats.VIT += PR.perLevel.VIT; p.acc.AGI += PR.perLevel.AGI; p.acc.MND += PR.perLevel.MND;
    while (p.acc.AGI >= 1) { p.acc.AGI -= 1; p.stats.AGI++; } while (p.acc.MND >= 1) { p.acc.MND -= 1; p.stats.MND++; } }
  if (up) { recalc(); if (G.audio) G.audio.crystal(); G.say('Level ' + p.level + '. Something in you hardens.', 4); } }
export const time = () => CLOCK.t;
