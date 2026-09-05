/** Shared helpers: maths, seeded PRNG, environment flags, the game clock. */
export const DEG = Math.PI / 180, RAD = 180 / Math.PI;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
export const smooth = u => u * u * (3 - 2 * u);
let seed = 1337;
export const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
export const reducedMotion = HAS_DOM && !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const isTouch = HAS_DOM && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
export const $ = s => document.querySelector(s);
/** The game clock. Systems read CLOCK.t; the frame loop advances it (hit-stop freezes it). */
export const CLOCK = { t: 0 };
export const turnStep = (cur, target, max) => { const d = wrap(target - cur); return cur + clamp(d, -max, max); };
export const inRect = (x, z, R) => x >= R.x0 && x <= R.x1 && z >= R.z0 && z <= R.z1;
export const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const fmt = (n, d) => (+n).toFixed(d === undefined ? 0 : d);
