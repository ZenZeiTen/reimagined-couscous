import type { Vec2 } from '../math/Vec2';
import type { GameMap } from './GameMap';

/**
 * Does a circle of `radius` centred at (x, y) overlap any solid cell?
 * Checks the cells covered by the circle's bounding box, which is exact for
 * axis-aligned grid walls when radius < 0.5.
 */
export function circleHitsWall(map: GameMap, x: number, y: number, radius: number): boolean {
  const minX = Math.floor(x - radius);
  const maxX = Math.floor(x + radius);
  const minY = Math.floor(y - radius);
  const maxY = Math.floor(y + radius);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (map.isSolid(cx, cy)) return true;
    }
  }
  return false;
}

/**
 * Move `pos` by (dx, dy) with wall sliding. Each axis is resolved separately
 * so the mover slides along walls instead of sticking. Returns true if the
 * move was blocked on at least one axis.
 */
export function moveWithCollision(map: GameMap, pos: Vec2, dx: number, dy: number, radius: number): boolean {
  let blocked = false;
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (!circleHitsWall(map, nx, pos.y, radius)) pos.x = nx;
    else blocked = true;
  }
  if (dy !== 0) {
    const ny = pos.y + dy;
    if (!circleHitsWall(map, pos.x, ny, radius)) pos.y = ny;
    else blocked = true;
  }
  return blocked;
}

/**
 * Grid DDA line test between two world points. Returns true if no solid cell
 * lies between them (the destination cell itself is not tested).
 */
export function hasLineOfSight(map: GameMap, ax: number, ay: number, bx: number, by: number): boolean {
  let mapX = Math.floor(ax);
  let mapY = Math.floor(ay);
  const endX = Math.floor(bx);
  const endY = Math.floor(by);
  const dirX = bx - ax;
  const dirY = by - ay;
  const deltaDistX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaDistY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;
  if (dirX < 0) {
    stepX = -1;
    sideDistX = (ax - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - ax) * deltaDistX;
  }
  if (dirY < 0) {
    stepY = -1;
    sideDistY = (ay - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - ay) * deltaDistY;
  }
  // Total parametric length of the segment in "delta" units is 1 (t in [0,1]).
  let guard = map.width + map.height + 2;
  while ((mapX !== endX || mapY !== endY) && guard-- > 0) {
    if (sideDistX < sideDistY) {
      if (sideDistX > 1) return true;
      sideDistX += deltaDistX;
      mapX += stepX;
    } else {
      if (sideDistY > 1) return true;
      sideDistY += deltaDistY;
      mapY += stepY;
    }
    if (map.isSolid(mapX, mapY)) return false;
  }
  return true;
}

/**
 * Cast a ray from (ox, oy) along (dx, dy) and return the distance to the first
 * solid cell, or `maxDist` if nothing is hit. Used for hitscan weapons.
 */
export function castRayDistance(map: GameMap, ox: number, oy: number, dx: number, dy: number, maxDist: number): number {
  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);
  const deltaDistX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const deltaDistY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;
  if (dx < 0) {
    stepX = -1;
    sideDistX = (ox - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - ox) * deltaDistX;
  }
  if (dy < 0) {
    stepY = -1;
    sideDistY = (oy - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - oy) * deltaDistY;
  }
  let guard = 4096;
  while (guard-- > 0) {
    let dist: number;
    if (sideDistX < sideDistY) {
      dist = sideDistX;
      sideDistX += deltaDistX;
      mapX += stepX;
    } else {
      dist = sideDistY;
      sideDistY += deltaDistY;
      mapY += stepY;
    }
    if (dist > maxDist) return maxDist;
    if (map.isSolid(mapX, mapY)) return dist;
  }
  return maxDist;
}
