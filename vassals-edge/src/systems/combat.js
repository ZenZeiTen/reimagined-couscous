/** Combat: swings, stamina arcs, damage with weaknesses/resistances/flanks/guards, guarding, death and respawn. */
import { G, gainExp, recalc } from '../state.js';
import { SPEC } from '../spec.js';
import { SPELLS } from '../data/spells.js';
import { relOfPlayer, blinkEnemy, resetEnemies } from './enemies.js';
import { floorAt } from '../engine/level.js';
import { play } from './anim.js';
import { DEG, RAD, reducedMotion, CLOCK, rnd, $ } from '../util.js';

export const CBT = { hitStop: 0, deathTimer: 0 };
export function relAngleFromPlayer(tx, tz) { const p = G.player, dx = tx - p.x, dz = tz - p.z; return Math.atan2(dx * G.right.x + dz * G.right.z, dx * G.fwd.x + dz * G.fwd.z) * RAD; }
export function startAttack() {
  const p = G.player, W = p.weapon; if (p.dead || p.attack || p.block || p.guardBreak > 0) return; if (p.stam < 8) { if (G.audio) G.audio.empty(); return; }
  const ratio = p.stam / p.stamMax, mult = SPEC.formula.stamMult(ratio); if (ratio < 0.5 && G.audio) G.audio.winded();
  p.attack = { t: 0, ratio, mult, dmg: W.base * mult, stagger: SPEC.formula.staggerNeedsFull ? ratio >= 0.999 : ratio >= 0.5, hit: false, prev: W.arcDeg / 2, illusionHit: false, kind: W.swing || 'slash' };
  p.stam = Math.max(0, p.stam - W.drain); p.lastSwing = CLOCK.t; if (G.audio) G.audio.swing(W.arcDeg, W.swing);
  /* a knight that sees the swing coming may raise its guard */
  for (const e of G.enemies) if (e.C.guard && e.state === 'CHASE' && Math.hypot(e.x - p.x, e.z - p.z) < W.reach + 1 && Math.abs(relOfPlayer(e)) < 35 * DEG && rnd() < e.C.guard) { e.guarding = 0.6; play(e, 'guard', true); }
}
export function damageEnemy(e, dmg, type, stagger, noFlank) {
  const C = e.C; if (e.state === 'DEAD' || e.state === 'DORMANT' || e.state === 'WAKING') return 0;
  if (e.C.blink && e.blinkCool <= 0 && rnd() < 0.5 && blinkEnemy(e)) { G.say('The wisp is not where it was.', 1.5); return 0; }
  let d = dmg * (C.weak[type] || 1) * (C.resist[type] !== undefined ? C.resist[type] : 1);
  const rel = relOfPlayer(e), front = Math.abs(rel) < 60 * DEG;
  if (e.guarding > 0 && front) { d *= 0.25; stagger = false; if (G.audio) G.audio.guard(); G.say('The blade turns on its guard.', 1.5); }
  const flank = !noFlank && e.state === 'RECOVER' && rel > 25 * DEG && rel < 155 * DEG; if (flank) d *= C.flankMult;
  if (G.player.weapon && G.player.weapon.bleed && !noFlank) e.bleedT = SPEC.status.bleed.duration;
  e.hp -= d; e.flash = 1; if (G.audio) G.audio.hit(!!stagger); if (stagger && !reducedMotion) { CBT.hitStop = Math.max(CBT.hitStop, 0.07); G.player.shake = Math.max(G.player.shake, 0.1); }
  if (!e.alert) { e.alert = true; e.state = 'CHASE'; e.t = 0; }
  if (e.hp <= 0) { e.state = 'DEAD'; e.t = 0; e.deathT = 0; e.hp = 0; play(e, 'death', true); G.say(C.deathMsg, 4); gainExp(C.exp); G.player.kills++;
    if (C.boss) { G.flags[e.type + '_dead'] = true; if (G.hooks.bossDied) G.hooks.bossDied(e); } return d; }
  if (stagger) { if (C.staggerHits) { e.staggerCount++; if (e.staggerCount < C.staggerHits) return d; e.staggerCount = 0; } e.state = 'STAGGER'; e.t = 0; play(e, 'stagger', true); }
  return d;
}
export function hurtPlayer(dmg, fromX, fromZ, type) {
  const p = G.player, Gd = SPEC.player.guard; if (p.dead || p.iframes > 0 || G.mode !== 'play') return;
  if (p.block && fromX !== undefined) { const rel = Math.abs(relAngleFromPlayer(fromX, fromZ));
    if (rel <= Gd.arcDeg / 2) {
      if (p.stam >= Gd.cost) { p.stam -= Gd.cost; p.lastSwing = CLOCK.t; dmg *= Gd.reduce; p.shake = reducedMotion ? 0 : 0.15; if (G.audio) G.audio.guard(); }
      else { p.block = false; p.guardBreak = Gd.breakTime; p.stam = 0; p.lastSwing = CLOCK.t; if (G.audio) G.audio.guardBreak(); G.say('Your guard is broken.', 2); } } }
  if (type && p.resist && p.resist[type] !== undefined) dmg *= p.resist[type];
  dmg *= SPEC.progression.defK / (SPEC.progression.defK + p.def + (p.wardT > CLOCK.t ? SPELLS.ward.ward.def : 0));
  p.hp -= dmg; p.iframes = 0.4; if (p.shake === 0 || p.guardBreak > 0) p.shake = reducedMotion ? 0 : 0.35; if (G.audio) G.audio.hurt();
  const fl = $('#flash'); if (fl) { fl.style.opacity = 0.55; setTimeout(() => { fl.style.opacity = 0; }, 130); }
  if (p.hp <= 0) die();
}
export function die() { const p = G.player; p.dead = true; p.attack = null; p.hp = 0; CBT.deathTimer = 3.4; const d = $('#death'); if (d) d.classList.add('show'); if (G.audio) G.audio.death(); G.mode = 'dead'; }
export function respawn() { const p = G.player; p.dead = false; p.hp = p.hpMax; p.stam = p.stamMax; p.mp = p.mpMax; p.rot = 0; p.bleed = 0; p.cast = null; p.wardT = p.galeT = 0; p.x = p.spawn.x; p.z = p.spawn.z; p.y = floorAt(p.x, p.z, p.spawn.y + 1);
  p.yaw = p.spawn.yaw; p.pitch = 0; p.vx = p.vz = p.vy = 0; p.turnIntent = p.pitchIntent = 0; const d = $('#death'); if (d) d.classList.remove('show'); resetEnemies(); G.mode = 'play'; if (G.hooks.resetZone) G.hooks.resetZone(); }
G.hooks.damageEnemy = damageEnemy; G.hooks.hurtPlayer = hurtPlayer;
