/** Interactables: pickups, chests, levers, crystals, doors, the bell, the gate. One table; the nearest thing you face wins. */
import * as THREE from 'three';
import { scene, collider } from '../engine/level.js';
import { modelGroup, buildModel } from '../engine/models.js';
import { psxMat } from '../engine/retro.js';
import { MAT } from '../engine/textures.js';
import { ITEMS } from '../data/items.js';
import { G, giveItem, invEntry } from '../state.js';
import { W, MECH } from '../world/build.js';
import { openDoor, pullLever, workLift, revealIllusion, WORLD } from './worldsys.js';
import { isTouch, $, rnd, CLOCK } from '../util.js';

export const PICKUPS = []; export const CHESTS = {};
export function addPickup(id, qty, x, y, z, mesh, o) { o = o || {}; mesh.position.set(x, y, z); scene.add(mesh); const key = o.key || (id + '@' + x.toFixed(1) + ',' + z.toFixed(1));
  const e = { x, y, z, r: 1.4, label: 'Take ' + ITEMS[id].name + (qty > 1 ? ' ×' + qty : ''), mesh, taken: false, key, spin: o.spin,
    on() { e.taken = true; mesh.visible = false; giveItem(id, qty); if (G.audio) G.audio.chime(); G.flags['took:' + key] = true; if (o.event && G.hooks.cutscene) G.hooks.cutscene(o.event); }, done: () => e.taken };
  if (G.flags['took:' + key]) { e.taken = true; mesh.visible = false; }
  G.interact.push(e); PICKUPS.push(e); return e; }
G.hooks.addPickup = addPickup;
function tinted(it, tint) { if (!tint && !it.tint) return undefined; const c = tint || it.tint; return { crystal: psxMat({ color: c, emissive: 0x2a3040, stipple: true, opacity: 0.85 }), iron: psxMat({ color: c, emissive: 0x202830 }), bone: psxMat({ color: c }) }; }
export function buildPickups() {
  for (const [id, qty, x, y, z, o] of W.pickups) { const it = ITEMS[id]; const m = modelGroup(it.model, tinted(it, o.tint));
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]); if (o.rotz) m.rotation.z = o.rotz; if (o.scale) m.scale.setScalar(o.scale);
    addPickup(id, qty, x, y, z, m, o); }
  for (const c of W.chests) { const g = new THREE.Group(); const lid = new THREE.Group(); lid.position.set(0, 0.46, -0.28); g.add(lid);
    buildModel('chest', undefined, { root: g, lid }); g.position.set(c.x, c.y, c.z); g.rotation.y = c.yaw; scene.add(g);
    const ch = { id: c.id, group: g, lid, open: !!G.flags['chest:' + c.id], t: 0 }; CHESTS[c.id] = ch; if (ch.open) lid.rotation.x = -1.7;
    collider(c.x - 0.5, c.x + 0.5, c.y, c.y + 0.7, c.z - 0.35, c.z + 0.35, 'chest');
    G.interact.push({ x: c.x, y: c.y, z: c.z, r: 1.5, label: 'Open the chest', on() { ch.open = true; G.flags['chest:' + c.id] = true; if (G.audio) G.audio.clank(0);
      c.items.forEach(([id, q], i) => setTimeout(() => giveItem(id, q), i * 900)); }, done: () => ch.open }); }
}
export function updatePickups(dt) { const t = CLOCK.t; for (const e of PICKUPS) { if (e.taken) continue; if (e.spin === 'z') e.mesh.rotation.z += dt * 0.8; else e.mesh.rotation.y += dt * 0.6; }
  for (const k in CHESTS) { const c = CHESTS[k]; if (c.open && c.lid.rotation.x > -1.7) c.lid.rotation.x = Math.max(-1.7, c.lid.rotation.x - dt * 3); } }

export function buildInteractables() {
  const { LIFT, HATCH, CDOOR, SHRINE_DOOR, illusion, timber, alcoveDoor, moongate } = MECH, p = () => G.player;
  const rest = (x, y, z, sx, sz, syaw, msg) => ({ x, y, z, r: 1.8, label: 'Rest at the crystal', on() { const P = p(); P.hp = P.hpMax; P.stam = P.stamMax; P.mp = P.mpMax; P.rot = 0; P.bleed = 0;
    P.spawn = { x: sx, z: sz, yaw: syaw, y }; if (G.audio) G.audio.crystal(); G.say(msg, 4); if (G.hooks.save) G.hooks.save(); } });
  G.interact.push(
    { x: 7.4, y: -3, z: -2.5, r: 1.5, label: 'Pull the drain lever', on() { pullLever(); }, done: () => MECH.lever.pulled },
    rest(12, 0, 1.6, 11, 1.6, Math.PI / 2, 'The crystal hums. The tide is calm, for a moment. (Saved.)'),
    rest(-27.3, 0, 6.2, -26, 4.5, 0, 'The bell above does not ring. The crystal hums in its place. (Saved.)'),
    rest(-15, -9, -8, -14, -8, -Math.PI / 2, 'The quartz hums under the throne. Something is listening. (Saved.)'),
    { x: 5, y: 0, z: -3.6, r: 1.3, silent: true, on() { revealIllusion(); }, done: () => illusion.userData.revealed },
    { x: 5.2, y: 0, z: -3.1, r: 1.4, label: 'Search the remains', on() { G.flags.remains = true; giveItem('moon_lily', 2, true); if (G.audio) G.audio.chime();
        G.say('Two vials, stoppered with wax, in a hand that has not opened in a very long time. Moon-Lily Extract ×2. Whoever sat here waited for the wall to open, and the wall did not.', 8); }, done: () => G.flags.remains },
    { x: -26.1, y: 0, z: -6.5, r: 1.3, label: 'The timbers', on() { G.say('Swollen timbers, warped shut by the sea. They would burn, if anything here still burned.', 4); }, done: () => timber.userData.box.disabled },
    { x: -13.5, y: -1.2, z: -14.7, r: 1.3, label: 'Force the grate', on() { if (HATCH.open) return; openDoor(HATCH); G.say('The grate gives. Above: grey light, and the sound of the sea.', 4); }, done: () => HATCH.open },
    { x: -13.5, y: 0, z: -13.6, r: 1.1, label: 'The grate', on() { G.say(HATCH.lockedMsg, 3); }, done: () => HATCH.open },
    { x: 0.7, y: -3, z: -2.2, r: 1.4, label: 'The iron door', on() { if (invEntry('cistern_key')) { openDoor(CDOOR); G.say('The key turns twice. Heat breathes out of the dark.', 4); } else G.say(CDOOR.lockedMsg, 4); }, done: () => CDOOR.open },
    { x: -1.1, y: -3, z: -2.2, r: 1.2, label: 'The iron door', on() { if (invEntry('cistern_key')) openDoor(CDOOR); else G.say(CDOOR.lockedMsg, 4); }, done: () => CDOOR.open },
    { x: -10, y: -3, z: -4.5, r: 1.3, label: 'Work the lift', lift: true, on() { workLift(); } },
    { x: -32, y: 0, z: -9.6, r: 1.5, label: 'The shrine door', on() { if (invEntry('warden_seal')) { openDoor(SHRINE_DOOR); G.say('The seal sinks into the recess. Bronze remembers bronze; the door lifts.', 4); G.flags.shrine_open = true; } else G.say(SHRINE_DOOR.lockedMsg, 4); }, done: () => SHRINE_DOOR.open },
    { x: -25.2, y: 0, z: 4.6, r: 1.6, label: 'The bell rope', on() { if (G.flags.bell_rung) { G.say('The bell is still. It said what it had to say.', 3); return; }
        if (invEntry('bell_clapper')) { MECH.bell.userData.parts.clapper.visible = true; if (G.hooks.cutscene) G.hooks.cutscene('bell'); } else G.say('A rope, and above it a bell with nothing inside to strike. It hangs silent on purpose.', 4); }, done: () => G.flags.bell_rung },
    { x: -18.4, y: -3, z: -31.6, r: 1.4, label: 'The sealed door', on() { G.say('A door in the south wall, wedged shut by the weight of the water behind it.', 4); }, done: () => G.flags.cloister_drained },
    { x: -10, y: -9, z: -12.4, r: 1.6, label: 'The King', on() { if (G.hooks.talk) G.hooks.talk('king_sleeping'); }, done: () => G.flags.king_woke },
    { x: -10, y: -9, z: -23.4, r: 2.2, label: 'The Moon Gate', on() { if (invEntry('moon_key')) { if (G.hooks.cutscene) G.hooks.cutscene('ending'); } else G.say('Quartz, grown into an arch. A keyhole shaped like the moon, and the moon is not here.', 4); }, done: () => G.flags.ending }
  );
}
export let interactTarget = null;
export function updateInteract() {
  const p = G.player; interactTarget = null; let best = 9;
  for (const it of G.interact) { if (it.done && it.done()) continue;
    const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz);
    if (d > it.r || Math.abs(it.y - p.y) > 1.5) continue;
    if ((dx * G.fwd.x + dz * G.fwd.z) / Math.max(d, 0.01) < 0.2 && d > 0.6) continue;
    if (d < best) { best = d; interactTarget = it; } }
  const pr = $('#prompt');
  if (interactTarget && !interactTarget.silent && !p.dead && G.mode === 'play') { pr.textContent = (isTouch ? '[USE] ' : '[F] ') + interactTarget.label; pr.classList.add('show'); }
  else pr.classList.remove('show');
  return interactTarget;
}
