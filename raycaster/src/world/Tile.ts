/**
 * Tile ids stored in the map's wall layer. 0 is walkable; any positive value is
 * a solid wall whose value doubles as the wall texture id.
 */
export const TILE_EMPTY = 0;

export interface TileDefinition {
  /** Wall texture id (0 = not a wall). */
  wall: number;
  /** Floor texture id used when the tile is walkable. */
  floor: number;
  /** Ceiling texture id; 0 renders an open sky. */
  ceiling: number;
  /** Optional entity to spawn on this tile. */
  spawn?: string;
  /** Marks the player start (only one per map is used; the last wins). */
  playerStart?: boolean;
  /** Facing angle in degrees for the player start. */
  startAngleDeg?: number;
}

/** Character → tile definition mapping used by the ASCII map parser. */
export type TileLegend = Record<string, TileDefinition>;

export interface EntitySpawn {
  type: string;
  x: number;
  y: number;
  angle: number;
}
