/** Magic: a charge you can walk through slowly, then a projectile, a self-buff, or a word everything nearby stops for. */
import * as THREE from 'three';
import { G } from '../state.js';
import { SPEC } from '../spec.js';
import { SPELLS } from '../data/spells.js';
import { U } from '../engine/retro.js';
import { spawnProj } from './enemies.js';
import { damageEnemy } from './combat.js';
import { CLOCK } from '../util.js';

export function startCast() { const p = G.player; if (p.dead || p.cast || p.attack || p.block || !p.spell) return; const sp = SPELLS[p.spell];
  if (p.mp < sp.mp) { G.say('Not enough magic.', 2); return; } p.cast = { id: p.spell, t: 0 }; if (G.audio) G.audio.tone(180, 720, sp.charge, 'triangle', 0.1, 0); }
export function updateMagic(dt) { const p = G.player; p.mp = Math.min(p.mpMax, p.mp + SPEC.magic.mpRegen * dt);
  if (!p.cast) { U.lightCol.value[0].setRGB(1.0, 0.70, 0.40); return; }
  const sp = SPELLS[p.cast.id]; p.cast.t += dt; const ec = new THREE.Color(sp.color); U.lightCol.value[0].setRGB(1.0, 0.70, 0.40).lerp(ec, Math.min(1, p.cast.t / sp.charge) * 0.8);
  if (p.cast.t < sp.charge) return;
  p.cast = null; p.mp -= sp.mp;
  if (sp.kind === 'proj') { const ox = p.x + G.fwd.x * 0.5, oz = p.z + G.fwd.z * 0.5, oy = p.y + 1.3, pd = Math.sin(p.pitch);
    spawnProj('player', ox, oy, oz, G.fwd.x, pd, G.fwd.z, { speed: sp.speed, dmg: sp.dmg, type: sp.type, color: sp.color, stagger: true, r: sp.r || 0.28 }); if (G.audio) G.audio.noise(0.35, 'bandpass', 700, 2600, 0.35, 0); }
  else if (sp.kind === 'self') { if (sp.heal) p.hp = Math.min(p.hpMax, p.hp + sp.heal); if (sp.cure) { p.rot = 0; p.bleed = 0; } if (sp.ward) p.wardT = CLOCK.t + sp.ward.dur; if (sp.gale) p.galeT = CLOCK.t + sp.gale.dur;
    if (G.audio) G.audio.crystal(); G.say(sp.name + '.', 2); }
  else if (sp.kind === 'aoe') { let n = 0; for (const e of G.enemies) if (e.state !== 'DEAD' && e.state !== 'DORMANT' && Math.hypot(e.x - p.x, e.z - p.z) < sp.radius && Math.abs(e.y - p.y) < 1.5) { damageEnemy(e, sp.dmg, sp.type, true, true); n++; }
    if (G.audio) G.audio.ether(0); G.say(sp.name + (n ? '. ' + n + ' stop to listen.' : '.'), 2); }
}
export function cycleSpell(dir) { const p = G.player; if (!p.spells.length) return; let i = p.spells.indexOf(p.spell); i = (i + dir + p.spells.length) % p.spells.length; p.spell = p.spells[i]; G.say(SPELLS[p.spell].name + ' readied.', 2); }
