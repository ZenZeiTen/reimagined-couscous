import type { Camera } from './Camera';
import type { GameMap } from '../world/GameMap';

/**
 * DDA raycaster. Casts one ray per screen column and stores the results in
 * preallocated typed arrays so the render loop never allocates.
 */
export class Raycaster {
  readonly columns: number;
  /** Perpendicular (fisheye-corrected) distance to the hit wall. */
  readonly perpDist: Float32Array;
  /** 0 = hit an x-facing wall side, 1 = y-facing side. */
  readonly side: Uint8Array;
  /** Wall id (texture id) that was hit. */
  readonly wallId: Uint16Array;
  /** Fractional position along the wall face in [0,1). */
  readonly wallX: Float32Array;
  readonly mapX: Int32Array;
  readonly mapY: Int32Array;
  readonly rayDirX: Float32Array;
  readonly rayDirY: Float32Array;
  /** Set to true for columns that ran out of steps without hitting a wall. */
  readonly miss: Uint8Array;
  maxSteps: number;

  constructor(columns: number, maxSteps = 256) {
    this.columns = columns;
    this.perpDist = new Float32Array(columns);
    this.side = new Uint8Array(columns);
    this.wallId = new Uint16Array(columns);
    this.wallX = new Float32Array(columns);
    this.mapX = new Int32Array(columns);
    this.mapY = new Int32Array(columns);
    this.rayDirX = new Float32Array(columns);
    this.rayDirY = new Float32Array(columns);
    this.miss = new Uint8Array(columns);
    this.maxSteps = maxSteps;
  }

  cast(camera: Camera, map: GameMap): void {
    const cols = this.columns;
    const posX = camera.pos.x;
    const posY = camera.pos.y;
    const dirX = camera.dir.x;
    const dirY = camera.dir.y;
    const planeX = camera.plane.x;
    const planeY = camera.plane.y;
    const walls = map.walls;
    const mw = map.width;
    const mh = map.height;
    const invCols = 2 / cols;
    const maxSteps = this.maxSteps;

    for (let x = 0; x < cols; x++) {
      const cameraX = x * invCols - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      let mapX = Math.floor(posX);
      let mapY = Math.floor(posY);

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX: number;
      let stepY: number;
      let sideDistX: number;
      let sideDistY: number;
      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - posX) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - posY) * deltaDistY;
      }

      let side = 0;
      let hit = 0;
      let steps = 0;
      while (hit === 0 && steps < maxSteps) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) {
          hit = 1;
        } else {
          hit = walls[mapY * mw + mapX]!;
        }
        steps++;
      }

      let perp = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
      if (perp < 1e-4) perp = 1e-4;

      let wallX = side === 0 ? posY + perp * rayDirY : posX + perp * rayDirX;
      wallX -= Math.floor(wallX);

      this.perpDist[x] = perp;
      this.side[x] = side;
      this.wallId[x] = hit;
      this.wallX[x] = wallX;
      this.mapX[x] = mapX;
      this.mapY[x] = mapY;
      this.rayDirX[x] = rayDirX;
      this.rayDirY[x] = rayDirY;
      this.miss[x] = hit === 0 ? 1 : 0;
    }
  }
}
