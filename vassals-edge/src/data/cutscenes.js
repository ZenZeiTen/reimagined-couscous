/**
 * Cutscenes: camera rails and captions, played by systems/cutscenes.js in-engine (letterboxed, input-skippable
 * after `skipGrace`). A shot: { dur, cam: [x,y,z], look: [x,y,z], camTo?, lookTo?, cap: [line1, line2] | vo, zone, on(t, dt, S) }
 *   cam/camTo lerp over the shot; look/lookTo likewise. `on` is a per-frame hook for actors. `enter`/`exit` run once.
 */
export const CUTSCENES = {
  prologue: { unskippableFirst: true, shots: [
    { dur: 6, cap: ['Beneath the tide, the Weaver hums.', 'Beneath the root, the Serpent drinks.'], black: true, cam: [-30, 1, 0], look: [-20, 1, 0] },
    { dur: 15, zone: 'shore', cap: ['They came for the crystal under the crags.', 'The sea kept what the stone would not.'], cam: [-33, 0.32, -3.2], camTo: [-26, 0.32, -3.2], look: [-29, 0.4, -6.2] },
    { dur: 20, zone: 'gallery', cap: ['The knights were never released from their watch.', 'They keep a count no one is left to end.'], cam: [2, 1.3, -1.6], look: [2, 1.2, 1.5], actor: 'sentry_patrol' },
    { dur: 20, zone: 'sepulchre', cap: ['Orlan drank the black root and did not die.', 'That was the whole of his punishment.'], cam: [-10, -7.5, -8.8], look: [-10, -7.2, -12.8], actor: 'king_twitch' },
    { dur: 15, zone: 'sea', vo: 'You swore the oath. The kingdom did not survive to release you from it.', cam: [-47.4, 0.85, 0], look: [-60, 0.6, 0], actor: 'boat', weapon: true }
  ] },
  aldous: { shots: [
    { dur: 5, zone: 'cloister', cam: [-29.5, -1.6, -19.2], look: [-31.4, -2.4, -20.5], vo: 'The knight against the wall lifts his head. It takes him a long time.' },
    { dur: 6, cam: [-30.4, -1.9, -19.6], look: [-31.4, -2.2, -20.5], vo: '“Vassal. You still wear the coat. Good. Someone should.”' },
    { dur: 6, cam: [-30.4, -1.9, -19.6], look: [-31.4, -2.2, -20.5], vo: '“Mael’s seal. Take it. I only held it because he asked, and he asked because he was already dead.”' },
    { dur: 5, cam: [-30.4, -1.9, -19.6], look: [-31.4, -2.6, -20.5], vo: '“Ring the bell for us. Not for him. For us.” His head goes back down.', actor: 'aldous_rest' }
  ], after: { give: 'warden_seal', set: 'aldous_met', msg: 'Tide-Warden’s Seal received.' } },
  bishop_rise: { shots: [
    { dur: 4, zone: 'cloister', cam: [-22, -1.4, -27.5], look: [-22.4, -2.2, -31], vo: 'The water at the altar goes flat. Then it goes up.', actor: 'bishop_rise' },
    { dur: 3, cam: [-22, -1.4, -27.5], look: [-22.4, -1.8, -30.6], vo: 'The bishop stands. The key is in your hand and he wants it back.' }
  ], after: { set: 'bishop_woke' } },
  bell: { shots: [
    { dur: 5, zone: 'shore', cam: [-26, 1.4, 2.0], look: [-26, 5.4, 5.0], vo: 'The clapper finds the bell. The bell finds the note it had been keeping.', actor: 'bell_swing' },
    { dur: 6, cam: [-34.5, 1.2, -1.8], camTo: [-36.5, 1.0, -1.8], look: [-39.5, -0.6, -1.8], vo: 'Under the pier, stone that had been sea for forty years remembers it is a door.', actor: 'shrine_open' }
  ], after: { set: 'bell_rung', msg: 'The Warden’s Shrine is open.' } },
  king_wake: { shots: [
    { dur: 5, zone: 'sepulchre', cam: [-10, -7.3, -9.2], look: [-10, -7.0, -12.8], vo: 'The key leaves the floor. Something on the throne notices its hand is empty.', actor: 'king_wake' },
    { dur: 5, cam: [-8.4, -7.0, -10.0], camTo: [-10, -7.2, -9.4], look: [-10, -6.4, -12.6], vo: '“Vassal,” says the King, in a voice like a door. “You are late.”', actor: 'king_stand' }
  ], after: { set: 'king_woke', boss: 'king' } },
  king_fall: { shots: [
    { dur: 6, zone: 'sepulchre', cam: [-9, -7.0, -10.5], look: [-10, -7.6, -12.6], vo: 'The King sits down. The crystal in his chest goes dark, one facet at a time.', actor: 'king_sit' },
    { dur: 6, zone: 'moongate', cam: [-10, -7.0, -15.6], camTo: [-10, -7.2, -17.5], look: [-10, -5.0, -22], vo: 'Beyond the throne the wall is not a wall. The Moon Gate has been waiting for the key, and for you.', actor: 'gate_reveal' }
  ], after: { set: 'king_dead', msg: 'The way to the Moon Gate is open.' } },
  ending: { shots: [
    { dur: 7, zone: 'moongate', cam: [-10, -7.2, -18.5], camTo: [-10, -7.2, -20.5], look: [-10, -5.0, -23], vo: 'The key turns. The gate does not open so much as stop pretending to be shut.', actor: 'gate_open' },
    { dur: 8, black: true, cap: ['The oath is kept.', 'The sea will have to find another name.'] },
    { dur: 8, black: true, cap: ['VASSAL’S EDGE', 'The Fall of Vareth-Ghar'] }
  ], after: { set: 'ending', end: true } }
};
