/** NPCs: model, collider, talk trigger, idle motion. Dialogue lives in data/dialogue.js and runs through systems/scripts.js. */
import * as THREE from 'three';
import { scene, collider } from '../engine/level.js';
import { modelGroup } from '../engine/models.js';
import { MAT } from '../engine/textures.js';
import { psxMat } from '../engine/retro.js';
import { W } from '../world/build.js';
import { G } from '../state.js';
import { CLOCK } from '../util.js';

export function buildNPCs() {
  for (const n of W.npcs) {
    const mats = n.ghost ? { crystal: MAT.ghost, iron: psxMat({ color: 0x4a4038, stipple: true, opacity: 0.7 }) } : undefined;
    const g = modelGroup(n.model, mats); g.position.set(n.x, n.y, n.z); g.rotation.y = n.yaw; scene.add(g);
    const npc = { id: n.id, def: n, group: g, parts: g.userData.parts, t: Math.random() * 6, box: collider(n.box[0], n.box[1], n.box[2], n.box[3], n.box[4], n.box[5], 'npc') };
    if (n.hammer) { const arm = new THREE.Group(); arm.position.set(0.42, 1.36, 0); g.add(arm); for (const k of ['arm', 'hammer', 'hammerhead']) arm.add(npc.parts[k]); npc.arm = arm; }
    G.npcs[n.id] = npc;
    G.interact.push({ x: n.talk.x, y: n.talk.y, z: n.talk.z, r: n.talk.r, label: n.talk.label, npc: n.id,
      on() { if (G.hooks.talk) G.hooks.talk(n.id); }, done: () => n.removeOn && G.flags[n.removeOn] });
  }
}
export function updateNPCs(dt) {
  const t = CLOCK.t, p = G.player;
  for (const id in G.npcs) { const n = G.npcs[id], d = n.def; if (!d) continue; n.t += dt;
    if (d.removeOn && G.flags[d.removeOn]) { if (n.group.visible) { n.group.visible = false; n.box.disabled = true; } continue; }
    if (n.arm) { n.arm.rotation.x = 0.9 + Math.max(0, Math.sin(n.t * 7.5)) * -1.4;
      if (Math.sin(n.t * 7.5) < 0 && Math.sin((n.t - dt) * 7.5) >= 0 && p && Math.hypot(p.x - d.x, p.z - d.z) < 14 && G.audio) G.audio.clank(0.4); }
    if (d.ghost) { n.group.position.y = d.y + Math.sin(t * 0.9) * 0.06; if (n.parts.flame) n.parts.flame.scale.y = 1 + Math.sin(t * 9) * 0.15; }
    if (id === 'cinder' && n.parts.head) n.parts.head.rotation.y = Math.sin(t * 0.35) * 0.25;
    if (id === 'aldous' && n.parts.head) n.parts.head.rotation.x = G.flags.aldous_met ? 0.35 : Math.sin(t * 0.5) * 0.04; }
}
