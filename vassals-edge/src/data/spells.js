/** Spells: five elements plus the void, one word each. MP + a charge during which you move at half speed. */
export const SPELLS = {
  ember:    { name: 'Ember Lance', element: 'fire',  mp: 12, charge: 0.6, kind: 'proj', speed: 9, dmg: 40, type: 'fire', color: 0xff6a2a, lore: 'A spear of the forge that Garrick no longer remembers lighting.' },
  tide:     { name: 'Tide Salve',  element: 'water', mp: 15, charge: 1.0, kind: 'self', heal: 30, cure: true, color: 0x4a8ad0, lore: 'Clean water, remembered. It undoes the Rot.' },
  ward:     { name: 'Stone Ward',  element: 'earth', mp: 14, charge: 0.9, kind: 'self', ward: { def: 12, dur: 20 }, color: 0x9a8a5a, lore: 'Nidh-Mor’s patience, borrowed for twenty breaths. Defense +12.' },
  gale:     { name: 'Gale Step',   element: 'wind',  mp: 10, charge: 0.5, kind: 'self', gale: { speed: 1.6, turn: 1.5, dur: 8 }, color: 0xb0e0d0, lore: 'The cliff wind, put in your heels. Faster feet and a faster turn, briefly.' },
  rebuke:   { name: 'Pale Rebuke', element: 'void',  mp: 20, charge: 0.9, kind: 'aoe', radius: 3.2, dmg: 25, type: 'void', color: 0xd0c8ff, lore: 'A hum in the shape of a word. Everything near you stops to listen.' },
  moonfall: { name: 'Moonfall',    element: 'light', mp: 34, charge: 1.4, kind: 'proj', speed: 7, dmg: 90, type: 'light', color: 0xe8ecf4, r: 0.45, lore: 'The bell’s note, thrown. It lands like a moon.' }
};
export const ELEMENT_COLOR = { fire: 0xff6a2a, water: 0x4a8ad0, earth: 0x9a8a5a, wind: 0xb0e0d0, void: 0xd0c8ff, light: 0xe8ecf4 };
