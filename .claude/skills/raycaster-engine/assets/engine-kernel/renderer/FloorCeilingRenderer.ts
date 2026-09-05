import type { Framebuffer } from './Framebuffer';
import type { Camera } from './Camera';
import type { GameMap } from '../world/GameMap';
import type { Texture, TextureRegistry } from './Texture';
import type { Shading } from './Shading';
import { packRGBA, shadePixel } from './Color';

/**
 * Horizontal-scanline floor and ceiling casting. For every screen row the
 * distance to the floor plane is constant, so the world-space step per pixel
 * is computed once per row and texels are sampled by simple addition.
 *
 * Floor/ceiling textures are looked up per map cell, so different rooms can
 * use different surfaces. Ceiling id 0 renders a sky gradient instead.
 */
export class FloorCeilingRenderer {
  skyTop = packRGBA(20, 24, 48);
  skyBottom = packRGBA(90, 70, 110);
  private readonly skyRows: Uint32Array;
  private cacheVersion = -1;
  private cacheRegistry: TextureRegistry | null = null;
  private texPixels: Uint32Array[] = [];
  private texW: Int32Array = new Int32Array(0);
  private texH: Int32Array = new Int32Array(0);
  private texCount = 0;
  private fallback: Texture | null = null;

  constructor(height: number) {
    this.skyRows = new Uint32Array(height);
    this.rebuildSky(height);
  }

  /** Flatten the registry into arrays indexed by id; runs only when textures change. */
  private rebuildTextureCache(textures: TextureRegistry): void {
    const count = Math.max(textures.count, 1);
    this.texPixels = new Array(count);
    this.texW = new Int32Array(count);
    this.texH = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const t = textures.get(i);
      this.texPixels[i] = t.pixels;
      this.texW[i] = t.width;
      this.texH[i] = t.height;
    }
    this.texCount = count;
    this.fallback = textures.get(-1);
    this.cacheRegistry = textures;
    this.cacheVersion = textures.version;
  }

  private rebuildSky(height: number): void {
    const sr = this.skyRows;
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const r = (20 + (90 - 20) * t) | 0;
      const g = (24 + (70 - 24) * t) | 0;
      const b = (48 + (110 - 48) * t) | 0;
      sr[y] = packRGBA(r, g, b);
    }
  }

  render(fb: Framebuffer, camera: Camera, map: GameMap, textures: TextureRegistry, shading: Shading): void {
    const w = fb.width;
    const h = fb.height;
    const data = fb.data;
    const horizon = (h >> 1) + (camera.pitch | 0) + (camera.bob | 0);
    const posX = camera.pos.x;
    const posY = camera.pos.y;
    const dirX = camera.dir.x;
    const dirY = camera.dir.y;
    const planeX = camera.plane.x;
    const planeY = camera.plane.y;
    const camH = camera.height;

    const rayDirX0 = dirX - planeX;
    const rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX;
    const rayDirY1 = dirY + planeY;
    const invW = 1 / w;

    const mw = map.width;
    const mh = map.height;
    const floors = map.floors;
    const ceilings = map.ceilings;
    const skyRows = this.skyRows;

    if (this.cacheRegistry !== textures || this.cacheVersion !== textures.version) this.rebuildTextureCache(textures);
    const texCount = this.texCount;
    const texPixels = this.texPixels;
    const texW = this.texW;
    const texH = this.texH;
    const fallback = this.fallback!;

    // Floor: rows below the horizon. Ceiling: rows above (mirrored distance).
    for (let y = 0; y < h; y++) {
      const isFloor = y >= horizon;
      const p = isFloor ? y - horizon : horizon - y;
      if (p === 0) {
        // Row exactly at the horizon has infinite distance: paint sky/fog.
        const idx = y * w;
        const c = shadePixel(isFloor ? this.skyBottom : skyRows[Math.min(y, h - 1)]!, (shading.minFactor * 256) | 0);
        for (let x = 0; x < w; x++) data[idx + x] = c;
        continue;
      }
      const rowDistance = ((isFloor ? camH : 1 - camH) * h) / p;
      const stepX = (rowDistance * (rayDirX1 - rayDirX0)) * invW;
      const stepY = (rowDistance * (rayDirY1 - rayDirY0)) * invW;
      let floorX = posX + rowDistance * rayDirX0;
      let floorY = posY + rowDistance * rayDirY0;
      const factor = shading.factorFor(rowDistance);
      const rowIdx = y * w;
      const skyColor = skyRows[Math.min(Math.max(y, 0), h - 1)]!;
      const fogColor = shadePixel(this.skyBottom, (shading.minFactor * 256) | 0);
      const layer = isFloor ? floors : ceilings;

      for (let x = 0; x < w; x++) {
        const cellX = Math.floor(floorX);
        const cellY = Math.floor(floorY);
        let id = 0;
        if (cellX >= 0 && cellY >= 0 && cellX < mw && cellY < mh) id = layer[cellY * mw + cellX]!;
        let pixel: number;
        if (id === 0) {
          // Ceiling 0 is open sky; floor 0 only shows inside wall cells, so paint it as fog.
          pixel = isFloor ? fogColor : skyColor;
        } else {
          let pix = texPixels[id];
          let tw: number;
          let th: number;
          if (pix === undefined || id >= texCount) {
            pix = fallback.pixels;
            tw = fallback.width;
            th = fallback.height;
          } else {
            tw = texW[id]!;
            th = texH[id]!;
          }
          const tx = ((floorX - cellX) * tw) | 0;
          const ty = ((floorY - cellY) * th) | 0;
          pixel = factor >= 256 ? pix[ty * tw + tx]! : shadePixel(pix[ty * tw + tx]!, factor);
        }
        data[rowIdx + x] = pixel;
        floorX += stepX;
        floorY += stepY;
      }
    }
  }
}
