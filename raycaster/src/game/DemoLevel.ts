import type { AsciiMapSource, TileLegend } from '../world';
import { TEX } from '../renderer/ProceduralTextures';

const F = TEX.FLOOR_TILE;
const C = TEX.CEILING;
const S = TEX.STONE;

/**
 * Legend for the catacomb demo. Every walkable tile is enclosed (ceiling id
 * never 0) so the dungeon shading has no sky to leak light from.
 */
export const DEMO_LEGEND: TileLegend = {
  '#': { wall: TEX.BRICK, floor: 0, ceiling: 0 },
  '=': { wall: TEX.STONE, floor: 0, ceiling: 0 },
  T: { wall: TEX.TECH, floor: 0, ceiling: 0 },
  W: { wall: TEX.WOOD, floor: 0, ceiling: 0 },
  '.': { wall: 0, floor: F, ceiling: C },
  ',': { wall: 0, floor: S, ceiling: S },
  L: { wall: 0, floor: TEX.LAVA, ceiling: C },
  w: { wall: 0, floor: TEX.WOOD, ceiling: TEX.WOOD },
  P: { wall: 0, floor: F, ceiling: C, playerStart: true, startAngleDeg: 0 },
  g: { wall: 0, floor: F, ceiling: C, spawn: 'grunt', startAngleDeg: 180 },
  b: { wall: 0, floor: F, ceiling: C, spawn: 'brute', startAngleDeg: 180 },
  x: { wall: 0, floor: S, ceiling: S, spawn: 'grunt', startAngleDeg: 90 },
  m: { wall: 0, floor: F, ceiling: C, spawn: 'pickup_mana' },
  h: { wall: 0, floor: F, ceiling: C, spawn: 'pickup_health' },
  o: { wall: 0, floor: F, ceiling: C, spawn: 'pillar' },
  // Doors sit in wall cells; the entity clears the wall when opened.
  D: { wall: TEX.DOOR, floor: F, ceiling: C, spawn: 'door' },
  K: { wall: TEX.DOOR, floor: F, ceiling: C, spawn: 'door_iron' },
  G: { wall: TEX.DOOR, floor: F, ceiling: C, spawn: 'door_gate' },
  c: { wall: 0, floor: F, ceiling: C, spawn: 'chest_potion' },
  e: { wall: 0, floor: F, ceiling: C, spawn: 'chest_ether' },
  k: { wall: 0, floor: F, ceiling: C, spawn: 'chest_key' },
  $: { wall: 0, floor: F, ceiling: C, spawn: 'chest_gold' },
  l: { wall: 0, floor: F, ceiling: C, spawn: 'lever_gate' },
};

export const DEMO_LEVEL: AsciiMapSource = {
  name: 'Catacombs of Verdis',
  legend: DEMO_LEGEND,
  rows: [
    '########################',
    '#P.....#.......=,,,,,,,#',
    '#......#..m....=,,,,x,,#',
    '#..o...D.......=,,,,,,,#',
    '#......#..g....=,,,,,,,#',
    '#..c...#.......=,,,,,,,#',
    '####D###.......=,,x,,,,#',
    '#..........o...D,,,,,,,#',
    '#..h.....g.....=,,,,,,,#',
    '#..........o...=,,,,e,,#',
    '#.........#####=========',
    '#....g....#TTTTTTTTTTTT#',
    '#.........KT..........T#',
    '####W#####TT...m...g..T#',
    '#wwwwwww#..T..........T#',
    '#wwwwwww#..T.LLLL.....T#',
    '#ww.k.wwW..T.LLLL..b..T#',
    '#wwwwwww#..T.LLLL.....T#',
    '#wwwwwwW...T..........T#',
    '#wwwwwww#..T....g.....T#',
    '#ww$lwww#..T..........T#',
    '#wwwwwww#..TTTTTTGTTTTT#',
    '#########........$.....#',
    '########################',
  ],
};
