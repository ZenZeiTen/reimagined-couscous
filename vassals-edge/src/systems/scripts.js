/** The dialogue runtime: walks data/dialogue.js nodes, drives the dialogue box, handles choices, trade and the forge. */
import { DIALOGUE } from '../data/dialogue.js';
import { ITEMS } from '../data/items.js';
import { G, giveItem, takeItem, invEntry, recalc } from '../state.js';
import { $, esc } from '../util.js';

export const DLG = { active: false, npc: null, queue: [], page: null, choice: null, choiceIdx: 0, typed: 0, text: '', speaker: '', prevMode: 'play' };
const box = () => $('#dlg');
function flatten(nodes, out) { for (const n of nodes) out.push(n); return out; }
export function startDialogue(id) { const D = DIALOGUE[id]; if (!D || DLG.active) return; DLG.active = true; DLG.npc = D; DLG.queue = D.talk.slice(); DLG.prevMode = G.mode; G.mode = 'dialogue';
  box().classList.add('on'); $('#prompt').classList.remove('show'); next(); }
function show(text, speaker) { DLG.text = text; DLG.speaker = speaker === undefined ? (DLG.npc.name + (DLG.npc.title ? ', ' + DLG.npc.title : '')) : speaker; DLG.typed = 0; DLG.page = true; render(); if (G.audio) G.audio.page(); }
function render() { const b = box(); const vis = DLG.text.slice(0, Math.floor(DLG.typed));
  let html = '<div class="who">' + esc(DLG.speaker) + '</div><div class="txt">' + esc(vis) + '</div>';
  if (DLG.choice && DLG.typed >= DLG.text.length) html += '<div class="opts">' + DLG.choice.map((c, i) => '<div class="' + (i === DLG.choiceIdx ? 'sel' : '') + '">' + esc(c.label) + '</div>').join('') + '</div>';
  b.innerHTML = html; }
export function updateDialogue(dt) { if (!DLG.active) return; if (DLG.typed < DLG.text.length) { DLG.typed = Math.min(DLG.text.length, DLG.typed + dt * 42); render(); } }
function next() {
  while (DLG.queue.length) { const n = DLG.queue.shift();
    if (n.say !== undefined) { show(n.say); return; }
    if (n.msg) { G.say(n.msg, 5); continue; }
    if (n.set) { G.flags[n.set] = true; continue; }
    if (n.give) { giveItem(n.give, n.qty || 1); continue; }
    if (n.if !== undefined) { const ok = typeof n.if === 'function' ? n.if(G) : !!G.flags[n.if]; DLG.queue = (ok ? n.then : n.else || []).concat(DLG.queue); continue; }
    if (n.choice) { DLG.choice = n.choice; DLG.choiceIdx = 0; show('', ''); DLG.typed = 0; DLG.text = ''; render(); return; }
    if (n.trade) { openTrade(n.trade); return; }
    if (n.forge) { forge(); continue; }
    if (n.cutscene) { endDialogue(); if (G.hooks.cutscene) G.hooks.cutscene(n.cutscene); return; } }
  endDialogue();
}
function openTrade(list) { const pearls = G.count('pearl'); const opts = list.filter(t => !(t.once && G.flags['bought:' + t.item])).map(t => ({ label: ITEMS[t.item].name + ' — ' + t.price + (t.price === 1 ? ' pearl' : ' pearls'), buy: t }));
  opts.push({ label: 'Nothing today' }); DLG.choice = opts; DLG.choiceIdx = 0; show('“' + pearls + (pearls === 1 ? ' pearl' : ' pearls') + ' in your purse. What will it be?”', DLG.npc.name); DLG.typed = DLG.text.length; DLG.tradeList = list; render(); }
function forge() { const p = G.player, w = p.equip.weapon, up = p.upgrades[w] || 0;
  if (up >= 5) { DLG.queue.unshift({ say: '“There is no more edge in this. Bring me something that has never had one.”' }); return; }
  if (!invEntry('forge_ore')) { DLG.queue.unshift({ say: '“No ore, no edge. The husks below have it. They will not want to give it.”' }); return; }
  takeItem('forge_ore', 1); p.upgrades[w] = up + 1; recalc(); if (G.audio) G.audio.forge();
  DLG.queue.unshift({ say: 'The hammer falls three times. The ' + ITEMS[w].name + ' comes back with a line of pale crystal along the edge. +' + (up + 1) + '.' }); }
export function dialogueInput(kind) {   // 'ok' | 'up' | 'down' | 'back'
  if (!DLG.active) return;
  if (DLG.choice) { if (DLG.typed < DLG.text.length) { DLG.typed = DLG.text.length; render(); return; }
    if (kind === 'up') { DLG.choiceIdx = (DLG.choiceIdx - 1 + DLG.choice.length) % DLG.choice.length; render(); return; }
    if (kind === 'down') { DLG.choiceIdx = (DLG.choiceIdx + 1) % DLG.choice.length; render(); return; }
    if (kind === 'back') { DLG.choiceIdx = DLG.choice.length - 1; }
    const c = DLG.choice[DLG.choiceIdx]; DLG.choice = null;
    if (c.buy) { const t = c.buy; if (G.count('pearl') >= t.price) { takeItem('pearl', t.price); giveItem(t.item, 1); if (t.once) G.flags['bought:' + t.item] = true; if (G.audio) G.audio.chime(); openTrade(DLG.tradeList); }
      else { DLG.queue.unshift({ say: '“Come back with more of the sea in your pockets.”' }); next(); } return; }
    if (c.then) DLG.queue = c.then.concat(DLG.queue); next(); return; }
  if (DLG.typed < DLG.text.length) { DLG.typed = DLG.text.length; render(); return; }
  if (kind === 'ok' || kind === 'back') next();
}
export function endDialogue() { DLG.active = false; DLG.choice = null; box().classList.remove('on'); if (G.mode === 'dialogue') G.mode = DLG.prevMode === 'boot' ? 'boot' : 'play'; }
G.hooks.talk = startDialogue;
