/** Save Crystals write to localStorage: the player sheet, flags, mechanisms, opened chests and taken pickups. */
import { G, recalc } from '../state.js';
import { SPEC } from '../spec.js';
import { MECH } from '../world/build.js';
import { openDoor, drainCloister, openThroneWall, WORLD } from './worldsys.js';
import { PICKUPS, CHESTS } from './interact.js';
import { LEVEL } from '../engine/level.js';

export function hasSave() { try { return !!localStorage.getItem(SPEC.save.key); } catch (e) { return false; } }
export function save() {
  const p = G.player, { trap, lever, gate, HATCH, CDOOR, SHRINE_DOOR, illusion, timber } = MECH;
  const data = { v: 2, t: Date.now(), flags: G.flags,
    player: { name: p.name, stats: p.stats, acc: p.acc, level: p.level, exp: p.exp, inv: p.inv, equip: p.equip, spells: p.spells, spell: p.spell, spawn: p.spawn, upgrades: p.upgrades, kills: p.kills },
    mech: { trap: !trap.armed, lever: lever.pulled, hatch: HATCH.open, cdoor: CDOOR.open, shrine: SHRINE_DOOR.open, illusion: !!illusion.userData.revealed, timber: !!timber.userData.box.disabled },
    dead: G.enemies.filter(e => e.C.boss && e.state === 'DEAD').map(e => e.type) };
  try { localStorage.setItem(SPEC.save.key, JSON.stringify(data)); G.say('Saved.', 1.5); return true; } catch (e) { G.say('The crystal cannot hold the memory here (storage blocked).', 3); return false; }
}
export function load() {
  let data; try { data = JSON.parse(localStorage.getItem(SPEC.save.key)); } catch (e) { return false; } if (!data || data.v !== 2) return false;
  const p = G.player; Object.assign(G.flags, data.flags); Object.assign(p, data.player); recalc(); p.hp = p.hpMax; p.stam = p.stamMax; p.mp = p.mpMax;
  const M = data.mech, { trap, HATCH, CDOOR, SHRINE_DOOR, illusion, timber } = MECH;
  if (M.trap) { trap.armed = false; trap.open = 1; LEVEL.floors.find(f => f.tag === 'trap').disabled = true; }
  if (M.lever) { MECH.lever.pulled = true; MECH.gate.open = true; MECH.gate.t = 1; MECH.gate.group.position.y = 2.7; MECH.gate.block.disabled = true; }
  if (M.hatch) { openDoor(HATCH); HATCH.t = 1; HATCH.mesh.position.y = HATCH.cy + 0.65; HATCH.mesh.rotation.x = -1.4; }
  if (M.cdoor) { openDoor(CDOOR); CDOOR.t = 1; CDOOR.mesh.position.z = CDOOR.cz - 1.9; }
  if (M.shrine) { openDoor(SHRINE_DOOR); SHRINE_DOOR.t = 1; SHRINE_DOOR.mesh.position.y = SHRINE_DOOR.cy + 2.5; }
  if (M.illusion) { illusion.userData.revealed = true; illusion.userData.fade = 0; illusion.visible = false; illusion.userData.box.disabled = true; }
  if (M.timber) { timber.userData.box.disabled = true; timber.visible = false; }
  if (G.flags.cloister_drained) { drainCloister(); WORLD.drainT = 1; MECH.cloisterWater.level = -2.98; MECH.cloisterWater.mesh.position.y = -2.98; }
  if (G.flags.king_dead) openThroneWall();
  if (G.flags.bell_rung) MECH.bell.userData.parts.clapper.visible = true;
  for (const e of PICKUPS) if (G.flags['took:' + e.key]) { e.taken = true; e.mesh.visible = false; }
  for (const k in CHESTS) if (G.flags['chest:' + k]) { CHESTS[k].open = true; CHESTS[k].lid.rotation.x = -1.7; }
  for (const e of G.enemies) if (data.dead.indexOf(e.type) >= 0) { e.state = 'DEAD'; e.hp = 0; e.deathT = 99; e.looted = true; if (e.C.boss) { e.group.visible = true; } }
  if (data.dead.indexOf('king') >= 0) { const k = G.npcs.enemy_king; if (k) { k.alert = false; import('./anim.js').then(m => m.play(k, 'sit', true)); } }
  p.x = p.spawn.x; p.z = p.spawn.z; p.y = p.spawn.y || 0; p.yaw = p.spawn.yaw; return true;
}
G.hooks.save = save; G.hooks.load = load; G.hooks.hasSave = hasSave;
