/**
 * Item registry: concrete stats first, then the lore line. Every id here has a pickup model (models.js) — `model`
 * names the mesh used when it lies on the ground; weapons also become the held view-model.
 *   kind: weapon | armor (slot head/body/arms/legs) | ring | consumable | scroll | key | material | trade
 */
export const ITEMS = {
  /* ---------------- weapons: type slash | pierce | crush; scale grade S..D; drain = stamina per swing ---------------- */
  pale_blade: { name: 'Pale Crystal Blade', kind: 'weapon', model: 'pale_blade', phys: 45, type: 'slash', magic: 80, element: 'light', weight: 4.2, drain: 35, scale: 'B',
    reach: 1.9, arcDeg: 90, windup: 0.18, active: 0.22, recover: 0.38, swing: 'slash',
    lore: 'A translucent blade forged from hardened sea spray. It echoes with the voice of Astraea. Swung at full stamina it remembers what it was.' },
  sentry_blade: { name: 'Rusted Sentry Blade', kind: 'weapon', model: 'sentry_blade', phys: 38, type: 'slash', magic: 0, weight: 5.5, drain: 42, scale: 'C',
    reach: 2.0, arcDeg: 120, windup: 0.24, active: 0.26, recover: 0.5, swing: 'slash',
    lore: 'Three hundred years of the same arc have worn a groove into the steel. It wants to swing right to left, and it is slow to be told otherwise.' },
  seaspray_rapier: { name: 'Seaspray Rapier', kind: 'weapon', model: 'seaspray_rapier', phys: 34, type: 'pierce', magic: 0, weight: 2.4, drain: 22, scale: 'B',
    reach: 1.7, arcDeg: 40, windup: 0.12, active: 0.16, recover: 0.3, swing: 'thrust',
    lore: 'Found through the spine of something that died in a hole. A thrust, not a sweep: it goes where the eye goes and finds the joints in tarnished plate.' },
  tide_dagger: { name: 'Tidewrought Dagger', kind: 'weapon', model: 'tide_dagger', phys: 22, type: 'pierce', magic: 0, weight: 0.9, drain: 12, scale: 'A',
    reach: 1.2, arcDeg: 50, windup: 0.08, active: 0.12, recover: 0.18, swing: 'thrust', bleed: true,
    lore: 'Mael’s gutting knife. Too short for a knight and too quick for a corpse. It opens what it touches, and what it opens keeps bleeding.' },
  notched_falchion: { name: 'Notched Falchion', kind: 'weapon', model: 'notched_falchion', phys: 52, type: 'slash', magic: 0, weight: 6.0, drain: 46, scale: 'C',
    reach: 1.8, arcDeg: 110, windup: 0.26, active: 0.24, recover: 0.55, swing: 'slash',
    lore: 'A mariner’s cleaver, notched where it met something harder. Heavy at the tip. It does not so much cut as insist.' },
  bell_maul: { name: 'Bell-Ringer’s Maul', kind: 'weapon', model: 'bell_maul', phys: 74, type: 'crush', magic: 0, weight: 11.5, drain: 62, scale: 'S',
    reach: 2.1, arcDeg: 80, windup: 0.42, active: 0.22, recover: 0.9, swing: 'crush',
    lore: 'The hammer that used to wake the belltower. Nothing in plate wants to be under it. Nothing in you wants to carry it far.' },
  warden_spear: { name: 'Tide-Warden’s Spear', kind: 'weapon', model: 'warden_spear', phys: 41, type: 'pierce', magic: 20, element: 'water', weight: 4.8, drain: 30, scale: 'B',
    reach: 2.8, arcDeg: 30, windup: 0.2, active: 0.18, recover: 0.42, swing: 'thrust',
    lore: 'Mael carried it up and down the pier for forty years and never once used it. The point is still wet.' },
  moon_greatsword: { name: 'Astraea’s Edge', kind: 'weapon', model: 'moon_greatsword', phys: 66, type: 'slash', magic: 120, element: 'light', weight: 8.5, drain: 50, scale: 'A',
    reach: 2.4, arcDeg: 130, windup: 0.3, active: 0.3, recover: 0.6, swing: 'slash', light: true,
    lore: 'The Moonlight lineage, whole. Orlan carried it into the dark and the dark carried it back out. It hums the note the bell forgot.' },
  /* ---------------- armour ---------------- */
  wanderer_coat: { name: 'Ash-Girt Wanderer’s Coat', kind: 'armor', slot: 'body', model: 'warden_plate', def: 4, weight: 2.5, lore: 'Salt-stiff wool. Whoever wore it before you did not drown.' },
  pilgrim_sandals: { name: 'Pilgrim’s Sandals', kind: 'armor', slot: 'legs', model: 'greaves', def: 1, weight: 0.8, lore: 'Rope soles, worn to the weave.' },
  kettle_helm: { name: 'Tarnished Kettle Helm', kind: 'armor', slot: 'head', model: 'helm', def: 5, weight: 3.0, lore: 'The visor is rusted half-shut. Its last wearer stopped needing to see.' },
  horned_helm: { name: 'Horned Reaver Helm', kind: 'armor', slot: 'head', model: 'horned_helm', def: 8, weight: 4.2, lore: 'Bone horns set into a steel skull-cap. The mariners wore these to be seen from the shore. The shore stopped looking.' },
  seer_hood: { name: 'Moonlight Seer’s Hood', kind: 'armor', slot: 'head', model: 'seer_hood', def: 2, weight: 0.6, mnd: 3, lore: 'Cinder’s second hood. It smells of cold ash and is warmer than it should be. Mind +3.' },
  barnacle_hauberk: { name: 'Barnacle-Crusted Hauberk', kind: 'armor', slot: 'body', model: 'warden_plate', def: 9, weight: 7.5, lore: 'Mail dredged from the Cistern. The barnacles have grown through the rings and hold them shut.' },
  warden_plate: { name: 'Tide-Warden’s Plate', kind: 'armor', slot: 'body', model: 'warden_plate', def: 14, weight: 10.5, resist: { water: 0.5 }, lore: 'Verdigris over steel over forty winters of spray. Water runs off it as if ashamed.' },
  drowned_gauntlets: { name: 'Drowned Gauntlets', kind: 'armor', slot: 'arms', model: 'gauntlets', def: 3, weight: 2.0, lore: 'Still damp. They will always be damp.' },
  kelp_bracers: { name: 'Kelp-Wound Bracers', kind: 'armor', slot: 'arms', model: 'bracers', def: 2, weight: 0.7, agi: 1, lore: 'Leather wound with dried kelp. Light enough to forget. Agility +1.' },
  sentry_greaves: { name: 'Sentry Greaves', kind: 'armor', slot: 'legs', model: 'greaves', def: 6, weight: 4.0, lore: 'Shin plates worn into a bow by three centuries of the same patrol. They still want to walk the line.' },
  /* ---------------- rings ---------------- */
  sovereign_ring: { name: 'Tarnished Sovereign Ring', kind: 'ring', model: 'ring', agi: 4, weight: 0,
    lore: 'A heavy band of blackened gold set with a cloudy sapphire. King Orlan gifted these rings to his closest advisors on the night the Great Cistern turned black. The sapphire does not reflect light, but seems to absorb the heat from the wearer’s hand.' },
  orlan_signet: { name: 'Orlan’s Signet', kind: 'ring', model: 'signet', str: 3, vit: 2, weight: 0,
    lore: 'The king’s own seal, cut from the finger that wore it. The wax it pressed sealed the Cistern. Strength +3, Vitality +2.' },
  /* ---------------- consumables ---------------- */
  moon_lily: { name: 'Moon-Lily Extract', kind: 'consumable', model: 'vial', heal: 40, cure: ['rot'], weight: 0.1,
    lore: 'Pressed from petals that open only under Val-Azaer’s hum. It tastes of cold glass and undoes the Rot.' },
  ash_salt: { name: 'Ash-Girt Salt', kind: 'consumable', model: 'salt', stam: 60, weight: 0.1,
    lore: 'Grey salt scraped from the shore stones. Bitter, and it steadies the arm. Restores stamina.' },
  tide_water: { name: 'Tide-Water Phial', kind: 'consumable', model: 'vial', tint: 0x4a8ad0, mp: 25, weight: 0.1,
    lore: 'Sea water that remembers being rain. Restores magic.' },
  ember_bread: { name: 'Ember Bread', kind: 'consumable', model: 'bread', heal: 20, stam: 30, weight: 0.2,
    lore: 'Garrick bakes it on the anvil when there is nothing to forge. It is always slightly burnt and always warm.' },
  seer_tincture: { name: 'Seer’s Tincture', kind: 'consumable', model: 'vial', tint: 0xd0c8ff, heal: 80, mp: 40, cure: ['rot', 'bleed'], weight: 0.1,
    lore: 'Cinder’s last vial. “Drink it when the count stops,” she said, and would not say which count.' },
  /* ---------------- scrolls ---------------- */
  scroll_ember: { name: 'Scroll: Ember Lance', kind: 'scroll', model: 'scroll', spell: 'ember', weight: 0.1, lore: 'Burnt at one corner, as if it had been read aloud too near itself.' },
  scroll_tide: { name: 'Scroll: Tide Salve', kind: 'scroll', model: 'scroll', spell: 'tide', weight: 0.1, lore: 'The ink has run, but the words have not moved.' },
  scroll_ward: { name: 'Scroll: Stone Ward', kind: 'scroll', model: 'scroll', spell: 'ward', weight: 0.1, lore: 'Heavy for paper. It smells of the deep root.' },
  scroll_gale: { name: 'Scroll: Gale Step', kind: 'scroll', model: 'scroll', spell: 'gale', weight: 0.1, lore: 'It wants to leave your hand.' },
  scroll_rebuke: { name: 'Scroll: Pale Rebuke', kind: 'scroll', model: 'scroll', spell: 'rebuke', weight: 0.1, lore: 'Written in a hand that turned to quartz halfway through the last line.' },
  scroll_moonfall: { name: 'Scroll: Moonfall', kind: 'scroll', model: 'scroll', spell: 'moonfall', weight: 0.1, lore: 'The last page of the Seer’s book. The word on it is the one the bell used to say.' },
  /* ---------------- key items ---------------- */
  cistern_key: { name: 'Rusted Cistern Key', kind: 'key', model: 'key', weight: 0.2, lore: 'Iron, eaten to a tooth. The wards still hold their shape under the rust.' },
  moon_key: { name: 'Moon-Sealed Key', kind: 'key', model: 'key', tint: 0xd8dde8, weight: 0.1, lore: 'Cold enough to burn. It opens the Moon Gate at the island’s core.' },
  warden_seal: { name: 'Tide-Warden’s Seal', kind: 'key', model: 'seal', weight: 0.3, lore: 'A disc of green bronze stamped with the pier. Mael’s office, and the shrine door knows it.' },
  bell_clapper: { name: 'Bell Clapper', kind: 'key', model: 'clapper', weight: 1.6, lore: 'Iron, cold. The belltower has hung silent since it was taken. Silence is the sting.' },
  sea_glass_lens: { name: 'Sea-Glass Lens', kind: 'key', model: 'lens', weight: 0.2, lore: 'Green glass ground by the tide into a lens. Held to the eye, some walls are not there.' },
  forge_ore: { name: 'Moon-Veined Ore', kind: 'material', model: 'ore', weight: 1.2, stack: true, lore: 'Ore with a thread of crystal through it. Garrick says it will take an edge. Garrick has said that before.' },
  pearl: { name: 'Drowned Pearl', kind: 'trade', model: 'pearl', weight: 0, stack: true, lore: 'The mariners carry them in their mouths so the sea will know them. Mael trades for them.' }
};
export const SLOTS = [['weapon', 'Weapon'], ['head', 'Head'], ['body', 'Body'], ['arms', 'Arms'], ['legs', 'Legs'], ['ring', 'Ring']];
export function slotOf(it) { return it.kind === 'weapon' ? 'weapon' : it.kind === 'ring' ? 'ring' : it.kind === 'armor' ? it.slot : null; }
