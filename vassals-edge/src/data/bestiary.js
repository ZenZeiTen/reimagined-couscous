/**
 * BESTIARY: one table per archetype; the state machine in systems/enemies.js is shared.
 *   rig: socket heights (metres) so a crab and a king can share one skeleton.
 *   anim: which animation set drives the sockets (systems/anim.js).
 *   ranged: a projectile attack with its own range band and charge.
 *   phases (boss): hp fractions where behaviour changes.
 */
export const RIG_HUMAN = { torso: [0, 1.25, 0], pelvis: [0, 0.85, 0], head: [0, 1.78, 0], armL: [-0.42, 1.55, 0], armR: [0.42, 1.55, 0], legL: [-0.15, 0.7, 0], legR: [0.15, 0.7, 0] };
export const BEST = {
  sentry:  { name: 'Tarnished Sentry', model: 'sentry', anim: 'knight', hp: 120, turn: 25, walk: 1.0, chase: 1.15, detect: 6.0, detectCone: 120, swingRange: 2.0, swingReach: 2.25, arcDeg: 120,
             windup: 0.6, swing: 0.35, recover: 1.8, damage: 28, stagger: 0.9, flankMult: 1.5, radius: 0.45, exp: 35, weak: { fire: 1.5, pierce: 1.5 }, resist: {},
             colors: [0x59634f, 0x3a3d3a, 0x7d7f82], scale: 1, drops: ['sentry_blade', 'kettle_helm'], dropChance: 1, guard: 0.35,
             deathMsg: 'The sentry’s arc is broken. It will not patrol again.',
             lore: 'The gallery knights turn on a count they set three hundred years ago. Their plate is tarnished and their pattern is not.' },
  mariner: { name: 'Hollowed Mariner', model: 'mariner', anim: 'shamble', hp: 60, turn: 20, walk: 0.6, chase: 0.85, detect: 7, detectCone: 150, swingRange: 1.7, swingReach: 1.9, arcDeg: 90,
             windup: 0.8, swing: 0.4, recover: 1.4, damage: 14, stagger: 0.7, flankMult: 1.3, radius: 0.4, exp: 15, weak: { fire: 1.3 }, resist: {},
             colors: [0x4a5560, 0x3b4148, 0x2a2a2a], scale: 0.95, drops: ['moon_lily', 'pearl'], dropChance: 0.6,
             deathMsg: 'The mariner’s legs give. They were mostly peat.',
             lore: 'Drowned crews that walked back up the shingle. They carry pearls in their mouths so the sea will know them.' },
  crawler: { name: 'Barnacle Crawler', model: 'crawler', anim: 'crawler', rig: { torso: [0, 0.45, 0], pelvis: [0, 0.3, 0], head: [0, 0.6, -0.4], armL: [-0.4, 0.45, -0.25], armR: [0.4, 0.45, -0.25], legL: [-0.35, 0.35, 0.1], legR: [0.35, 0.35, 0.1] },
             hp: 40, turn: 60, walk: 0.9, chase: 2.4, detect: 6, detectCone: 200, swingRange: 1.3, swingReach: 1.5, arcDeg: 70,
             windup: 0.3, swing: 0.2, recover: 0.9, damage: 11, stagger: 0.5, flankMult: 1.2, radius: 0.45, height: 0.9, exp: 12, weak: { crush: 1.6, fire: 1.2 }, resist: { pierce: 0.6 },
             colors: [0x5a6a5a, 0x3a3a34, 0x8a8a7a], scale: 1, drops: ['pearl', 'ash_salt'], dropChance: 0.5, lunge: { range: 3.5, speed: 6, cool: 3 },
             deathMsg: 'The crawler folds its claws and is only a rock again.',
             lore: 'Rocks that were not rocks. They lunge from the tide line and their shells shrug off a point; bring something heavy.' },
  bowman:  { name: 'Hollow Bowman', model: 'bowman', anim: 'shamble', hp: 55, turn: 30, walk: 0.7, chase: 0.9, detect: 11, detectCone: 160, swingRange: 1.5, swingReach: 1.7, arcDeg: 80,
             windup: 0.7, swing: 0.35, recover: 1.3, damage: 10, stagger: 0.6, flankMult: 1.4, radius: 0.4, exp: 22, weak: { fire: 1.3, slash: 1.2 }, resist: {},
             ranged: { min: 4, max: 12, charge: 1.1, cool: 2.6, speed: 11, damage: 17, type: 'pierce', recover: 0.8, keepDist: 5 },
             colors: [0x3d4a48, 0x2b3330, 0x4a4038], scale: 0.95, drops: ['tide_water', 'pearl'], dropChance: 0.7,
             deathMsg: 'The bowman’s string parts. It had been the last dry thing on him.',
             lore: 'Archers of the drowned watch. They keep their distance and their aim; close it, or bring a ward.' },
  bishop:  { name: 'Drowned Bishop', model: 'bishop', anim: 'knight', hp: 90, turn: 30, walk: 0.7, chase: 0.9, detect: 9, detectCone: 140, swingRange: 1.8, swingReach: 2.0, arcDeg: 100,
             windup: 0.7, swing: 0.4, recover: 1.5, damage: 18, stagger: 0.8, flankMult: 1.4, radius: 0.42, exp: 45, weak: { fire: 1.5, wind: 1.3 }, resist: { water: 0.3 },
             ranged: { min: 3, max: 9, charge: 1.2, cool: 3.5, speed: 6, damage: 22, type: 'water', recover: 1.2 },
             colors: [0x2a2d40, 0x1f2230, 0xc9c2b0], scale: 1, drops: ['moon_lily', 'scroll_tide'], dropChance: 1,
             deathMsg: 'The bishop’s reflection leaves the water first.',
             lore: 'Saint Vael’s last bishop kept praying under the water. The water answered. His crozier throws it.' },
  husk:    { name: 'Bile-Bloated Husk', model: 'husk', anim: 'husk', hp: 150, turn: 18, walk: 0.45, chase: 0.6, detect: 5, detectCone: 120, swingRange: 2.0, swingReach: 2.3, arcDeg: 140,
             windup: 0.9, swing: 0.45, recover: 2.0, damage: 30, stagger: 1.0, flankMult: 1.5, radius: 0.55, exp: 40, weak: { fire: 2.0 }, resist: { slash: 0.7 },
             colors: [0x3f4d3c, 0x2b3328, 0x6a7a5a], scale: 1.25, burst: true, drops: ['forge_ore'], dropChance: 0.5,
             deathMsg: 'The husk splits. What was inside it has been waiting.',
             lore: 'Cistern-keepers who drank from the pipes. They burst when they die, and what they leave behind carries the Rot.' },
  wisp:    { name: 'Pale Wisp', model: 'wisp', anim: 'wisp', rig: { torso: [0, 1.3, 0], pelvis: [0, 1.0, 0], head: [0, 1.75, 0], armL: [-0.3, 1.4, 0], armR: [0.3, 1.4, 0], legL: [0, 0, 0], legR: [0, 0, 0] },
             hp: 45, turn: 90, walk: 0.8, chase: 1.6, detect: 10, detectCone: 360, swingRange: 1.6, swingReach: 1.8, arcDeg: 120, hover: 0.25,
             windup: 0.5, swing: 0.3, recover: 1.2, damage: 16, stagger: 0.4, flankMult: 1.0, radius: 0.4, exp: 30, weak: { void: 1.5, crush: 1.3 }, resist: { pierce: 0.4, slash: 0.6, light: 0 },
             ranged: { min: 3, max: 8, charge: 0.9, cool: 2.4, speed: 8, damage: 20, type: 'void', recover: 0.6, keepDist: 4 }, blink: { cool: 5, dist: 3 },
             colors: [0xcfe2ff, 0x9aa8c8, 0x14161a], scale: 1, drops: ['tide_water'], dropChance: 0.5, noFall: true, stipple: 0.8,
             deathMsg: 'The wisp goes out like a held breath.',
             lore: 'What is left of a Seer who looked too long at the crystal. Blades pass through it; the void and a hammer do not.' },
  king:    { name: 'The Hollowed King', model: 'king', anim: 'king', boss: true, hp: 620, turn: 22, walk: 0.8, chase: 1.1, detect: 14, detectCone: 360, swingRange: 2.8, swingReach: 3.2, arcDeg: 150,
             windup: 0.75, swing: 0.4, recover: 1.6, damage: 42, stagger: 0.5, flankMult: 1.25, radius: 0.7, exp: 400, weak: { fire: 1.2, void: 1.3 }, resist: { light: 0.2, water: 0.5 },
             ranged: { min: 4, max: 12, charge: 1.3, cool: 4.5, speed: 8, damage: 34, type: 'light', recover: 1.0 }, staggerHits: 4,
             phases: [{ at: 0.66, msg: 'The King straightens. The crystal in his chest begins to sing.', chase: 1.4, windup: 0.55 },
                      { at: 0.33, msg: 'Orlan’s crown splits. What is under it was never a face.', chase: 1.7, windup: 0.45, damage: 52, ranged: { cool: 2.5 } }],
             colors: [0x3a4a5c, 0x1e2634, 0xd8dde8], scale: 1.35, drops: ['orlan_signet', 'moon_greatsword'], dropChance: 1,
             deathMsg: 'The King sits down. It is the first thing he has chosen in three hundred years.',
             lore: 'Orlan III drank the black root and did not die. He kept the Moon-Sealed Key; the key kept him.' }
};
