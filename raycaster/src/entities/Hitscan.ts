import type { Entity } from './Entity';
import type { GameMap } from '../world/GameMap';
import { castRayDistance } from '../world/Collision';

export interface HitscanResult {
  entity: Entity | null;
  distance: number;
  /** World point where the ray stopped. */
  x: number;
  y: number;
}

const result: HitscanResult = { entity: null, distance: 0, x: 0, y: 0 };

/**
 * Trace a ray against walls and targetable entities. Entities are tested as
 * circles; the closest hit in front of the first wall wins. Returns a shared
 * result object (do not retain it across calls).
 */
export function hitscan(
  map: GameMap,
  entities: readonly Entity[],
  ox: number,
  oy: number,
  angle: number,
  range: number,
  spread: number,
): HitscanResult {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const wallDist = castRayDistance(map, ox, oy, dx, dy, range);
  let best: Entity | null = null;
  let bestDist = wallDist;

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (!e.targetable || !e.isAlive()) continue;
    const ex = e.pos.x - ox;
    const ey = e.pos.y - oy;
    const along = ex * dx + ey * dy;
    if (along <= 0 || along >= bestDist) continue;
    const perp = Math.abs(ex * dy - ey * dx);
    // Effective hit radius grows with spread so far targets remain hittable.
    const hitRadius = e.radius + along * Math.tan(spread);
    if (perp <= hitRadius) {
      best = e;
      bestDist = along;
    }
  }

  result.entity = best;
  result.distance = bestDist;
  result.x = ox + dx * bestDist;
  result.y = oy + dy * bestDist;
  return result;
}
