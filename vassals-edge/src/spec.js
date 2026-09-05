/** SPEC — every tunable in one place. Engine values win where the design documents disagree. */
export const SPEC = {
  virtualShort: 240,
  hfov: 92,
  player: { stamRegen: 25, regenDelay: 0.5,
            speed: 2.3, backSpeed: 1.4, strafeSpeed: 1.8, accel: 6.5, eyeHeight: 1.62, radius: 0.34,
            stats: { STR: 10, AGI: 10, VIT: 10, MND: 8 },
            guard: { drain: 8, cost: 30, reduce: 0.3, arcDeg: 100, breakTime: 0.6, moveMult: 0.5, turnMult: 0.7 } },
  input: { deadzone: 0.18, pitchRecenter: true, pitchMax: 0.7, invertPitch: false, mouseSens: 0.22, padTurn: 1.0 },
  progression: {
    baseHP: 80, hpPerVIT: 2, baseSTAM: 80, stamPerAGI: 2, mpPerMND: 5,
    capBase: 15, capPerSTR: 0.6,
    scaling: { S: 1.6, A: 1.4, B: 1.2, C: 0.8, D: 0.4 },
    defK: 40,
    expNext: L => Math.round(50 * Math.pow(L, 1.5)),
    perLevel: { STR: 1, VIT: 1, AGI: 0.5, MND: 0.34 } },
  status: { rot: { hpPerSec: 0.02, regenMult: 0.5, duration: 20 }, bleed: { hpPerSec: 0.01, duration: 8 } },
  ui: { hudMap: false, mapReveal: 2.5, mapCell: 0.5 },
  enemy: { hitTint: 0.45, death: { fall: 0.8, linger: 2.5, dissolve: 3.2, motes: 10 }, loseDist: 14, loseTime: 3 },
  magic: { mpRegen: 0.8, castMove: 0.5 },
  boot: { firstViewingSkippable: true, skipGrace: 2.0 },
  formula: {
    turnRate: (agi, L) => (45 + 1.5 * agi) * (1 - 0.5 * L * L),
    hardCapAbove70: false,
    stamMult: r => Math.pow(Math.max(r, 0), 1.8),
    staggerNeedsFull: true
  },
  signal: { curvature: 0.045, scanline: 0.28, mask: 0.25, chroma: 0.6, vignette: 0.28, brightness: 1.35, halation: 0.3, virtualShort: 240 },
  render: { subdiv: 0.5, affine: 1.0, weaponLength: 1.15 },
  fallDamage: { safeSpeed: 7, perMs: 4 },
  save: { key: 'vassals-edge.save.v2' }
};
export function turnRate(agi, L) {
  let R = SPEC.formula.turnRate(agi, L);
  if (SPEC.formula.hardCapAbove70 && L > 0.7) R = Math.min(R, 30);
  return R;
}
