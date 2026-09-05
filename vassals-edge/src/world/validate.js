/**
 * Map validator: flood-fill walkable space from spawn (0.25 m grid, real floorAt + collider) through the phases a player can
 * trigger, as a fixpoint: a mechanism fires only from a cell already proven reachable. Every objective must resolve to a phase.
 * Layout audit: headroom >= 2.2 m on every walkable cell; every prop-sized box rests on a floor or another box.
 */
import { LEVEL, floorAt, collide, STEP_BODY } from '../engine/level.js';
import { SPEC } from '../spec.js';
import { MECH } from './build.js';
import { inRect } from '../util.js';

export function validateMap(spawn) {
  spawn = spawn || { x: -30, z: 0 };
  const step = 0.25, r = SPEC.player.radius, { trap, gate, illusion, LIFT, HATCH, CDOOR, SHRINE_DOOR, timber, alcoveDoor, throneWall } = MECH;
  const T = [['shore', -24, 0, 0], ['belltower crystal', -26, 0, 5.5], ['pier (Mael)', -38, 0.15, 0], ['stair to cloister', -21, -3, -17],
    ['cloister altar (key)', -22, -3, -30.25], ['Aldous', -30.5, -3, -20.5], ['cove (via grate)', -14, 0, -12], ['hall', 0, 0, 0], ['pit floor', 1, -3, -2.25], ['lever', 7.5, -3, -2.25],
    ['landing', 13.5, 0, -2.25], ['gallery crystal', 11, 0, 1.5], ['gate (hall side)', 7.5, 0, 0], ['ring niche', 5, 0, -5],
    ['cistern chamber', -6, -3, 1], ['lift (top)', -10, -3, -4.5], ['sepulchre key', -10, -9, -11], ['wreck interior (fire)', -31, 0, -6.5],
    ['shrine (seal)', -32, 0, -13], ['drained alcove (bell)', -18.4, -3, -33.5], ['moon gate (king)', -10, -9, -23]];
  const trapF = LEVEL.floors.find(f => f.tag === 'trap'), illB = illusion.userData.box;
  const key = (x, z, y) => Math.round(x / step) + ',' + Math.round(z / step) + ',' + Math.round(y * 2);
  const cell = (x, z, refY) => { const y = floorAt(x, z, refY); if (y === -Infinity) return null; const q = { x, z };
    collide(q, r, y + STEP_BODY, y + 1.75); return (Math.abs(q.x - x) > 1e-6 || Math.abs(q.z - z) > 1e-6) ? null : y; };
  const flood = () => { const seen = new Set(), q = []; const push = (x, z, y) => { const k = key(x, z, y); if (!seen.has(k)) { seen.add(k); q.push([x, z, y]); } };
    push(spawn.x, spawn.z, cell(spawn.x, spawn.z, 1));
    while (q.length) { const [x, z, y] = q.pop();
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const ny = cell(x + dx, z + dz, y); if (ny !== null) push(x + dx, z + dz, ny); }
      for (const l of LEVEL.ladders) if (l.enabled() && x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1 && Math.abs(y - l.y0) < 0.6) push(x, z, l.yTop ? l.yTop() : l.y1);
      if (inRect(x, z, LIFT.rect)) { if (Math.abs(y - LIFT.top) < 0.3) push(x, z, LIFT.bottom); if (Math.abs(y - LIFT.bottom) < 0.3) push(x, z, LIFT.top); } }
    return seen; };
  const saved = [trap.armed, trapF.disabled, illB.disabled, gate.block.disabled, HATCH.block.disabled, HATCH.floor.disabled, CDOOR.block.disabled, SHRINE_DOOR.block.disabled,
    timber.userData.box.disabled, alcoveDoor.userData.box.disabled, throneWall.userData.box.disabled];
  const liftSaved = LIFT.rect.y; LIFT.rect.y = LIFT.top; const liftLow = Object.assign({}, LIFT.rect, { y: LIFT.bottom }); LEVEL.floors.push(liftLow);
  const MECHS = [
    { n: 'trap', at: [-0.75, 0, -2.25], apply: () => { trap.armed = false; trapF.disabled = true; } },
    { n: 'wall', at: [4.5, 0, -3.5], apply: () => { illB.disabled = true; } },
    { n: 'lever→gate', at: [7.5, -3, -2.25], apply: () => { gate.block.disabled = true; } },
    { n: 'grate', at: [-13.5, -3, -14.75], apply: () => { HATCH.block.disabled = true; HATCH.floor.disabled = true; } },
    { n: 'key→cistern door', at: [-22, -3, -30.25], apply: () => { CDOOR.block.disabled = true; } },
    { n: 'ember→timber', at: [-25, 0, 4.5], apply: () => { timber.userData.box.disabled = true; } },
    { n: 'seal→shrine', at: [-30.5, -3, -20.5], apply: () => { SHRINE_DOOR.block.disabled = true; } },
    { n: 'clapper→bell→alcove', at: [-30.25, 0, -14.75], apply: () => { alcoveDoor.userData.box.disabled = true; } },
    { n: 'moon key→king→gate', at: [-10, -9, -11], apply: () => { throneWall.userData.box.disabled = true; } } ];
  const result = {}, phases = [];
  const run = name => { const seen = flood(); phases.push(name); for (const t of T) if (!result[t[0]] && seen.has(key(t[1], t[3], t[2]))) result[t[0]] = name; return seen; };
  let seen = run('1 initial'), fired = new Set(), n = 1;
  for (;;) { const ready = MECHS.filter(m => !fired.has(m.n) && seen.has(key(m.at[0], m.at[2], m.at[1]))); if (!ready.length) break;
    ready.forEach(m => { fired.add(m.n); m.apply(); }); seen = run(++n + ' ' + ready.map(m => m.n).join('+')); }
  [trap.armed, trapF.disabled, illB.disabled, gate.block.disabled, HATCH.block.disabled, HATCH.floor.disabled, CDOOR.block.disabled, SHRINE_DOOR.block.disabled,
    timber.userData.box.disabled, alcoveDoor.userData.box.disabled, throneWall.userData.box.disabled] = saved;
  LIFT.rect.y = liftSaved; LEVEL.floors.splice(LEVEL.floors.indexOf(liftLow), 1);
  const lines = T.map(t => (result[t[0]] ? 'ok  ' : 'UNREACHABLE  ') + t[0] + (result[t[0]] ? ' (phase ' + result[t[0]] + ')' : ''));
  return { ok: T.every(t => result[t[0]]), lines, phases, text: lines.join('\n') + '\nphases: ' + phases.join(' | ') };
}
export function auditLayout() {
  const step = 0.5, r = SPEC.player.radius, low = [], floating = [], boxes = LEVEL.blocks.concat(LEVEL.visuals);
  const cellFloor = (x, z, refY) => { const y = floorAt(x, z, refY); if (y === -Infinity) return null; const q = { x, z }; collide(q, r, y + STEP_BODY, y + 1.75); return (Math.abs(q.x - x) > 1e-6 || Math.abs(q.z - z) > 1e-6) ? null : y; };
  for (const f of LEVEL.floors) { if (f.disabled) continue;
    for (let x = Math.ceil(f.x0 / step) * step; x <= f.x1; x += step) for (let z = Math.ceil(f.z0 / step) * step; z <= f.z1; z += step) {
      const fy = cellFloor(x, z, (f.ramp ? Math.max(f.ramp.y0, f.ramp.y1) : f.y) + 0.1); if (fy === null) continue;
      let ceil = Infinity; for (const b of boxes) if (!b.disabled && b.y0 > fy + 0.3 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) ceil = Math.min(ceil, b.y0);
      if (ceil - fy < 2.2) low.push([x, fy, z, +(ceil - fy).toFixed(2)]); } }
  for (const b of boxes) { if (b.disabled || b.tag === 'mounted' || b.tag === 'door' || b.tag === 'lift' || b.tag === 'sea') continue;
    const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0; if (h > 1.5 || w > 3 || d > 3) continue;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, fy = floorAt(cx, cz, b.y0 + 0.1); if (fy === -Infinity || b.y0 - fy <= 0.08) continue;
    const rests = boxes.some(o => o !== b && Math.abs(o.y1 - b.y0) < 0.08 && o.x0 < b.x1 && o.x1 > b.x0 && o.z0 < b.z1 && o.z1 > b.z0);
    if (!rests) floating.push([+cx.toFixed(2), +b.y0.toFixed(2), +cz.toFixed(2), b.tag || '']); }
  const lines = ['headroom < 2.2 m: ' + low.length + (low.length ? '  e.g. ' + low.slice(0, 4).map(c => `(${c[0]},${c[1].toFixed(1)},${c[2]}) ${c[3]} m`).join(' ') : ''),
                 'floating props: ' + floating.length + (floating.length ? '  e.g. ' + floating.slice(0, 4).map(c => `(${c[0]},${c[1]},${c[2]}) ${c[3]}`).join(' ') : '')];
  return { ok: !low.length && !floating.length, low, floating, lines, text: lines.join('\n') };
}
