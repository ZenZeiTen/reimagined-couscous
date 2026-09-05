import { DEG2RAD } from '../math/angle';
import { GameMap } from './GameMap';
import type { EntitySpawn, TileLegend } from './Tile';

export interface AsciiMapSource {
  name?: string;
  /** Rows of equal length. Each character is looked up in `legend`. */
  rows: readonly string[];
  legend: TileLegend;
  /** Default player facing (degrees) when the legend entry gives none. */
  defaultStartAngleDeg?: number;
}

/** Serialisable level format (what a level editor would emit). */
export interface JsonMapSource {
  name?: string;
  width: number;
  height: number;
  walls: number[];
  floors: number[];
  ceilings: number[];
  playerStart: { x: number; y: number; angleDeg: number };
  spawns?: Array<{ type: string; x: number; y: number; angleDeg?: number }>;
}

export class MapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapParseError';
  }
}

/** Build a `GameMap` from an ASCII layout and legend. */
export function parseAsciiMap(source: AsciiMapSource): GameMap {
  const rows = source.rows;
  if (rows.length === 0) throw new MapParseError('map has no rows');
  const width = rows[0]!.length;
  const height = rows.length;
  if (width === 0) throw new MapParseError('map rows are empty');

  const size = width * height;
  const walls = new Uint8Array(size);
  const floors = new Uint8Array(size);
  const ceilings = new Uint8Array(size);
  const spawns: EntitySpawn[] = [];
  let playerStart: { x: number; y: number; angle: number } | null = null;

  for (let y = 0; y < height; y++) {
    const row = rows[y]!;
    if (row.length !== width) {
      throw new MapParseError(`row ${y} has length ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x]!;
      const def = source.legend[ch];
      if (!def) throw new MapParseError(`unknown tile character '${ch}' at (${x}, ${y})`);
      const i = y * width + x;
      walls[i] = def.wall;
      floors[i] = def.floor;
      ceilings[i] = def.ceiling;
      if (def.spawn) spawns.push({ type: def.spawn, x: x + 0.5, y: y + 0.5, angle: (def.startAngleDeg ?? 0) * DEG2RAD });
      if (def.playerStart) {
        const deg = def.startAngleDeg ?? source.defaultStartAngleDeg ?? 0;
        playerStart = { x: x + 0.5, y: y + 0.5, angle: deg * DEG2RAD };
      }
    }
  }

  if (!playerStart) throw new MapParseError('map has no player start tile');

  const data: ConstructorParameters<typeof GameMap>[0] = { width, height, walls, floors, ceilings, playerStart, spawns };
  if (source.name !== undefined) data.name = source.name;
  return new GameMap(data);
}

/** Build a `GameMap` from the JSON level format. */
export function parseJsonMap(source: JsonMapSource): GameMap {
  const size = source.width * source.height;
  const check = (arr: number[], label: string): Uint8Array => {
    if (arr.length !== size) throw new MapParseError(`${label} layer has ${arr.length} cells, expected ${size}`);
    return Uint8Array.from(arr);
  };
  const data: ConstructorParameters<typeof GameMap>[0] = {
    width: source.width,
    height: source.height,
    walls: check(source.walls, 'walls'),
    floors: check(source.floors, 'floors'),
    ceilings: check(source.ceilings, 'ceilings'),
    playerStart: { x: source.playerStart.x, y: source.playerStart.y, angle: source.playerStart.angleDeg * DEG2RAD },
    spawns: (source.spawns ?? []).map((s) => ({ type: s.type, x: s.x, y: s.y, angle: (s.angleDeg ?? 0) * DEG2RAD })),
  };
  if (source.name !== undefined) data.name = source.name;
  return new GameMap(data);
}

/** Serialise a `GameMap` back into the JSON level format. */
export function serializeMap(map: GameMap): JsonMapSource {
  return {
    name: map.name,
    width: map.width,
    height: map.height,
    walls: Array.from(map.walls),
    floors: Array.from(map.floors),
    ceilings: Array.from(map.ceilings),
    playerStart: { x: map.playerStart.x, y: map.playerStart.y, angleDeg: map.playerStart.angle / DEG2RAD },
    spawns: map.spawns.map((s) => ({ type: s.type, x: s.x, y: s.y, angleDeg: s.angle / DEG2RAD })),
  };
}
