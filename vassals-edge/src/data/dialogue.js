/**
 * Dialogue and scripts. A conversation is a list of nodes played through the dialogue box (ui/dialogue.js).
 *   { say: 'text' }                                  a page (speaker prefix comes from the NPC)
 *   { if: flagOrFn, then: [...], else: [...] }        branch on a world flag or a predicate(G)
 *   { set: 'flag' } / { give: 'item', qty }           side effects
 *   { choice: [{ label, then: [...] }, ...] }         a menu (Enter picks; Esc = last option)
 *   { trade: [{ item, price }] }                      Mael's stall; price in pearls
 *   { forge: true }                                   Garrick's anvil: ore -> weapon upgrade
 *   { cutscene: 'id' }                                hand off to systems/cutscenes.js
 *   { msg: 'text' }                                   the small HUD line instead of the box
 * Flags live in G.flags (saved). Predicates get the game state.
 */
export const DIALOGUE = {
  cinder: {
    name: 'Cinder', title: 'the Last Moonlight Seer',
    talk: [
      { if: G => !G.flags.cinder_met, then: [
        { say: 'You are early. Or the tide is late. It comes to the same thing on this shore.' },
        { say: 'Do not tell me your name. The sea already has it; I would only be borrowing.' },
        { say: 'Below the cloister the water remembers the priests. Do not drink what remembers.' },
        { say: 'She presses a scroll into your hand without turning her head.' },
        { say: '“The forge is out. This remembers it.”' },
        { give: 'scroll_ember', qty: 1 }, { set: 'cinder_met' } ],
        else: [
          { if: G => G.flags.king_dead, then: [
            { say: 'The count has stopped. I heard it stop. I have been listening for that my whole life and I find I do not know what to do with my hands.' },
            { say: 'Go through the gate, vassal. It was never locked against you. Only against him.' } ],
          else: [
            { if: G => G.flags.bell_rung && !G.flags.cinder_hood, then: [
              { say: 'The bell. I had forgotten I could hear anything but the sea.' },
              { say: 'Take this. I have no further use for a hood; the moon knows my face.' },
              { give: 'seer_hood', qty: 1 }, { set: 'cinder_hood' } ],
            else: [
              { choice: [
                { label: 'The knights', then: [
                  { say: 'The gallery knights turn on a count they set three hundred years ago. Interrupt the count, and stand where the count is not.' },
                  { say: 'Their plate turns a point. Fire finds the gaps. So does a flank, when they are catching their breath.' } ] },
                { label: 'The King', then: [
                  { say: 'When the pale one wakes, the turning will stop. Until then turn slowly, and keep your left side to the wall.' },
                  { say: 'He is not evil, vassal. He is a door that has been told it is a king.' } ] },
                { label: 'The bell', then: [
                  { say: 'The clapper was taken down the day the Cistern turned. Mael took it. He said the bell would only lie.' },
                  { say: 'If it rang again, the shrine under the pier would open. I am not sure that is a kindness.' } ] },
                { label: 'Leave', then: [ { say: 'Keep your left side to the wall.' } ] } ] } ] } ] } ] }
    ]
  },
  garrick: {
    name: 'Garrick', title: 'the Wandering Blacksmith',
    talk: [
      { if: G => !G.flags.garrick_met, then: [
        { say: 'Garrick does not look up. The hammer falls on cold iron, and falls again.' },
        { say: '“Bring ore,” he says, to no one in particular. “Moon-veined. The husks in the Cistern swallowed the last of it.”' },
        { say: '“Bring me ore and I will put an edge on whatever you are carrying. Bring me none and I will keep hitting this.”' },
        { set: 'garrick_met' }, { give: 'ember_bread', qty: 1 }, { msg: 'He pushes a burnt loaf across the anvil. Ember Bread.' } ],
        else: [
          { choice: [
            { label: 'Forge (1 ore: +5 attack)', then: [ { forge: true } ] },
            { label: 'Talk', then: [
              { if: G => G.flags.king_dead, then: [ { say: '“So. The forge remembers heat after all.” He does not say how he knows.' } ],
                else: [ { say: '“The sentry’s blade is honest iron. Ugly, but honest. The rapier is a question. Astraea’s line answers it.”' },
                        { say: '“I made a spear once for a warden who never used it. It is under the pier if the sea has not taken it. It has taken everything else.”' } ] } ] },
            { label: 'Leave', then: [ { say: 'The hammer falls again.' } ] } ] } ] }
    ]
  },
  mael: {
    name: 'Old Mael', title: 'the Tide-Warden',
    talk: [
      { if: G => !G.flags.mael_met, then: [
        { say: 'The lantern turns toward you before the figure does. “A living one. The tide is generous tonight.”' },
        { say: '“I kept this pier forty years and I keep it still. What the mariners bring up, I hold. What you bring me, I trade.”' },
        { say: '“Pearls, vassal. They carry them in their mouths. Do not ask me how I know.”' },
        { set: 'mael_met' } ],
        else: [] },
      { choice: [
        { label: 'Trade', then: [ { trade: [
          { item: 'moon_lily', price: 2 }, { item: 'ash_salt', price: 1 }, { item: 'tide_water', price: 2 }, { item: 'tide_dagger', price: 4, once: true },
          { item: 'kelp_bracers', price: 3, once: true }, { item: 'scroll_ward', price: 6, once: true }, { item: 'sea_glass_lens', price: 5, once: true, key: true } ] } ] },
        { label: 'The clapper', then: [
          { if: G => G.flags.bell_rung, then: [ { say: '“It rang. I heard it under the water. Perhaps it did not lie after all.”' } ],
            else: [ { if: G => G.hasItem('warden_seal'), then: [ { say: '“You carry my seal. Then you carry my office, and my regrets. The clapper is in the shrine. So is the rest.”' } ],
                      else: [ { say: '“I took it down. The bell called the mariners home and home was under the water by then. My seal opens the shrine. My seal is on my other body.”' },
                              { say: '“It sits against the cloister wall where I sat down to rest. Ser Aldous has it now, if he is still Ser Aldous.”' } ] } ] } ] },
        { label: 'Leave', then: [ { say: '“Mind the tide line. It minds you.”' } ] } ] }
    ]
  },
  aldous: {
    name: 'Ser Aldous', title: 'of the Last Watch',
    talk: [
      { if: G => !G.flags.aldous_met, then: [
        { cutscene: 'aldous' } ],
        else: [ { say: 'The knight does not move. The seal is gone from his hand; the sword is still across his knees.' } ] }
    ]
  },
  bishop_corpse: { name: 'The Drowned Bishop', title: '', talk: [ { say: 'He is still kneeling. His hands are open around the place the key was. He is still praying, and the water is still answering.' } ] },
  king_sleeping: { name: 'King Orlan III', title: '', talk: [ { say: 'The King is fused to the throne at the hip and the shoulder. The Moon-Sealed Key lies at his feet, where he dropped it three hundred years ago and has been reaching for it since.' } ] }
};
