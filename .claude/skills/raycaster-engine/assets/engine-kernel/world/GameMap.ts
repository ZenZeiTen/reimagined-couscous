import type { EntitySpawn } from './Tile';

export interface GameMapData {
  width: number;
  height: number;
  walls: Uint8Array;
  floors: Uint8Array;
  ceilings: Uint8Array;
  playerStart: { x: number; y: number; angle: number };
  spawns: EntitySpawn[];
  name?: string;
}

/**
 * Grid-based level. All layers are flat row-major typed arrays sized
 * `width * height`. Out-of-bounds queries are treated as solid so rays and
 * entities can never escape the level.
 */
export class GameMap {
  readonly width: number;
  readonly height: number;
  readonly walls: Uint8Array;
  readonly floors: Uint8Array;
  readonly ceilings: Uint8Array;
  readonly playerStart: { x: number; y: number; angle: number };
  readonly spawns: readonly EntitySpawn[];
  readonly name: string;

  constructor(data: GameMapData) {
    const size = data.width * data.height;
    if (data.walls.length !== size || data.floors.length !== size || data.ceilings.length !== size) {
      throw new Error(`GameMap layer size mismatch: expected ${size} cells`);
    }
    this.width = data.width;
    this.height = data.height;
    this.walls = data.walls;
    this.floors = data.floors;
    this.ceilings = data.ceilings;
    this.playerStart = { ...data.playerStart };
    this.spawns = data.spawns.map((s) => ({ ...s }));
    this.name = data.name ?? 'untitled';
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Wall id at integer cell coordinates; out-of-bounds returns 1 (solid). */
  getWall(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 1;
    return this.walls[y * this.width + x]!;
  }

  setWall(x: number, y: number, id: number): void {
    if (!this.inBounds(x, y)) return;
    this.walls[y * this.width + x] = id;
  }

  isSolid(x: number, y: number): boolean {
    return this.getWall(x, y) !== 0;
  }

  /** Solid test for world-space (fractional) coordinates. */
  isSolidAt(wx: number, wy: number): boolean {
    return this.isSolid(Math.floor(wx), Math.floor(wy));
  }

  getFloor(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.floors[y * this.width + x]!;
  }

  getCeiling(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.ceilings[y * this.width + x]!;
  }
}
