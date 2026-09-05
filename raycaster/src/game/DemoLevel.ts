import type { AsciiMapSource, TileLegend } from '../world';
import { TEX } from '../renderer/ProceduralTextures';

const F = TEX.FLOOR_TILE;
const C = TEX.CEILING;

/**
 * Legend for the demo. Walls double as texture ids; walkable tiles carry floor
 * and ceiling ids (ceiling 0 = open sky).
 */
export const DEMO_LEGEND: TileLegend = {
  '#': { wall: TEX.BRICK, floor: 0, ceiling: 0 },
  '=': { wall: TEX.STONE, floor: 0, ceiling: 0 },
  T: { wall: TEX.TECH, floor: 0, ceiling: 0 },
  W: { wall: TEX.WOOD, floor: 0, ceiling: 0 },
  D: { wall: TEX.DOOR, floor: 0, ceiling: 0 },
  '.': { wall: 0, floor: F, ceiling: C },
  ',': { wall: 0, floor: TEX.STONE, ceiling: 0 },
  L: { wall: 0, floor: TEX.LAVA, ceiling: C },
  w: { wall: 0, floor: TEX.WOOD, ceiling: TEX.WOOD },
  P: { wall: 0, floor: F, ceiling: C, playerStart: true, startAngleDeg: 0 },
  g: { wall: 0, floor: F, ceiling: C, spawn: 'grunt', startAngleDeg: 180 },
  b: { wall: 0, floor: F, ceiling: C, spawn: 'brute', startAngleDeg: 180 },
  a: { wall: 0, floor: F, ceiling: C, spawn: 'pickup_ammo' },
  h: { wall: 0, floor: F, ceiling: C, spawn: 'pickup_health' },
  o: { wall: 0, floor: F, ceiling: C, spawn: 'pillar' },
  x: { wall: 0, floor: TEX.STONE, ceiling: 0, spawn: 'grunt', startAngleDeg: 90 },
};

export const DEMO_LEVEL: AsciiMapSource = {
  name: 'Outpost 7',
  legend: DEMO_LEGEND,
  rows: [
    '########################',
    '#P.....#.......=,,,,,,,#',
    '#......#..a....=,,,,x,,#',
    '#..o...D.......=,,,,,,,#',
    '#......#..g....=,,,,,,,#',
    '#......#.......=,,,,,,,#',
    '####D###.......=,,x,,,,#',
    '#..........o...D,,,,,,,#',
    '#..h.....g.....=,,,,,,,#',
    '#..........o...=,,,,a,,#',
    '#.........#####=========',
    '#....g....#TTTTTTTTTTTT#',
    '#.........DT..........T#',
    '####W#####TT...a...g..T#',
    '#wwwwwww#..T..........T#',
    '#wwwwwww#..T.LLLL.....T#',
    '#ww.h.wwW..T.LLLL..b..T#',
    '#wwwwwww#..T.LLLL.....T#',
    '#wwwwwwW...T..........T#',
    '#wwwwwww#..T....g.....T#',
    '#wwaawww#..T..........T#',
    '#wwwwwww#..TTTTTTTTTTTT#',
    '#########..............#',
    '########################',
  ],
};
