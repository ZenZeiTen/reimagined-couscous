/**
 * Clip sampler for the shared rig. play(e, name) starts a clip on an enemy; sample(e, dt) writes socket rotations with a
 * short crossfade from the previous pose so state changes never pop. Root tracks give a bob (dy) and a body tilt.
 */
import { CLIPS } from '../data/anim.js';
import { lerp } from '../util.js';
const SOCKETS = ['torso', 'pelvis', 'head', 'armL', 'armR', 'legL', 'legR'];
function sampleTrack(track, t, loop, dur) {
  if (!track || !track.length) return null;
  if (loop && dur > 0) { t = t % dur; } else t = Math.min(t, track[track.length - 1][0]);
  let i = 0; while (i < track.length - 1 && track[i + 1][0] <= t) i++;
  const a = track[i], b = track[Math.min(i + 1, track.length - 1)]; const span = b[0] - a[0], u = span > 1e-6 ? (t - a[0]) / span : 0;
  const out = []; for (let k = 1; k < a.length; k++) out.push(lerp(a[k], b[k], u)); return out;
}
export function play(e, name, force) {
  const set = CLIPS[e.C.anim] || CLIPS.knight; const clip = set[name] || set.idle; if (!clip) return;
  if (e.clip === clip && !force) return;
  e.prevPose = capture(e); e.clip = clip; e.clipT = 0; e.clipName = name; e.blend = 0;
}
function capture(e) { const P = e.parts, pose = {}; for (const s of SOCKETS) if (P[s]) pose[s] = [P[s].rotation.x, P[s].rotation.y, P[s].rotation.z]; pose.root = [e.rootDy || 0, e.rootTilt || 0]; return pose; }
export function sample(e, dt) {
  if (!e.clip) play(e, 'idle');
  const clip = e.clip; e.clipT += dt; e.blend = Math.min(1, (e.blend || 0) + dt / 0.12);
  const done = !clip.loop && e.clipT >= clip.dur;
  for (const s of SOCKETS) { const node = e.parts[s]; if (!node) continue;
    let v = sampleTrack(clip[s], e.clipT, clip.loop, clip.dur);
    if (!v) { const set = CLIPS[e.C.anim] || CLIPS.knight; v = sampleTrack(set.idle && set.idle[s], e.clipT, true, set.idle ? set.idle.dur : 1) || [0, 0, 0]; }
    const pv = e.prevPose && e.prevPose[s]; if (pv && e.blend < 1) v = v.map((x, i) => lerp(pv[i], x, e.blend));
    node.rotation.set(v[0], v[1], v[2]); }
  let r = sampleTrack(clip.root, e.clipT, clip.loop, clip.dur) || [0, 0];
  if (e.prevPose && e.blend < 1) r = [lerp(e.prevPose.root[0], r[0], e.blend), lerp(e.prevPose.root[1], r[1], e.blend)];
  e.rootDy = r[0]; e.rootTilt = r[1];
  return done;
}
