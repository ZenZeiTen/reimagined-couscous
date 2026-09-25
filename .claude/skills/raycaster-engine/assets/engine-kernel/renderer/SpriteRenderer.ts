import type { Framebuffer } from './Framebuffer';
import type { Camera } from './Camera';
import type { Shading } from './Shading';
import type { Billboard } from './Sprite';
import type { SpriteSheetRegistry } from './SpriteSheet';
import { ALPHA_MASK, shadePixel } from './Color';

/**
 * Multi-angle billboard renderer. Sprites are transformed into camera space
 * with the inverse camera matrix, sorted far-to-near, and drawn column by
 * column against the wall depth buffer. Frame and direction are selected from
 * the sprite sheet metadata, so a Blender-baked 8- or 16-way sheet just works.
 */
export class SpriteRenderer {
  private order = new Int32Array(64);
  private depth = new Float32Array(64);
  private screenX = new Float32Array(64);
  private capacity = 64;

  private ensureCapacity(n: number): void {
    if (n <= this.capacity) return;
    let cap = this.capacity;
    while (cap < n) cap *= 2;
    this.order = new Int32Array(cap);
    this.depth = new Float32Array(cap);
    this.screenX = new Float32Array(cap);
    this.capacity = cap;
  }

  render(
    fb: Framebuffer,
    camera: Camera,
    sprites: readonly Billboard[],
    sheets: SpriteSheetRegistry,
    zBuffer: Float32Array,
    shading: Shading,
  ): void {
    const count = sprites.length;
    if (count === 0) return;
    this.ensureCapacity(count);

    const w = fb.width;
    const h = fb.height;
    const data = fb.data;
    const posX = camera.pos.x;
    const posY = camera.pos.y;
    const dirX = camera.dir.x;
    const dirY = camera.dir.y;
    const planeX = camera.plane.x;
    const planeY = camera.plane.y;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const horizon = (h >> 1) + (camera.pitch | 0) + (camera.bob | 0);
    const camH = camera.height;

    // Transform and cull.
    let visible = 0;
    const order = this.order;
    const depth = this.depth;
    const screenX = this.screenX;
    for (let i = 0; i < count; i++) {
      const s = sprites[i]!;
      if (!s.visible) continue;
      const relX = s.x - posX;
      const relY = s.y - posY;
      const transformY = invDet * (-planeY * relX + planeX * relY);
      if (transformY <= 0.05) continue;
      const transformX = invDet * (dirY * relX - dirX * relY);
      depth[i] = transformY;
      screenX[i] = (w / 2) * (1 + transformX / transformY);
      order[visible++] = i;
    }
    if (visible === 0) return;

    // Insertion sort far-to-near (sprite counts are small; stable and allocation-free).
    for (let i = 1; i < visible; i++) {
      const key = order[i]!;
      const keyDepth = depth[key]!;
      let j = i - 1;
      while (j >= 0 && depth[order[j]!]! < keyDepth) {
        order[j + 1] = order[j]!;
        j--;
      }
      order[j + 1] = key;
    }

    for (let k = 0; k < visible; k++) {
      const i = order[k]!;
      const s = sprites[i]!;
      const sheet = sheets.get(s.sheet);
      const transformY = depth[i]!;
      const sx = screenX[i]!;

      const frame = sheet.frameAt(s.animation, s.animTime);
      const dir = sheet.directionFor(s.x, s.y, s.angle, posX, posY);
      const rectIdx = sheet.frameIndex(s.animation, frame, dir);
      const rx = sheet.rectX[rectIdx]!;
      const ry = sheet.rectY[rectIdx]!;
      const rw = sheet.rectW[rectIdx]!;
      const rh = sheet.rectH[rectIdx]!;

      // World-space size in tiles → screen size.
      const worldH = sheet.worldHeight * s.scale;
      const worldW = worldH * (rw / rh);
      const spriteH = (h * worldH) / transformY;
      const spriteW = (h * worldW) / transformY;
      if (spriteH < 1 || spriteW < 1) continue;

      // Vertical placement: the sprite's origin sits on the floor plane (camera height camH below eye).
      const floorScreenY = horizon + (camH * h) / transformY;
      const zShift = (s.zOffset * h) / transformY;
      const bottom = floorScreenY - zShift + spriteH * (sheet.originY - 1);
      const top = bottom - spriteH;
      const left = sx - spriteW * sheet.originX;

      const drawStartY = Math.max(0, top | 0);
      const drawEndY = Math.min(h, (bottom + 1) | 0);
      const drawStartX = Math.max(0, left | 0);
      const drawEndX = Math.min(w, (left + spriteW + 1) | 0);
      if (drawEndY <= drawStartY || drawEndX <= drawStartX) continue;

      const texStepX = rw / spriteW;
      const texStepY = rh / spriteH;
      const texPixels = sheet.texture.pixels;
      const texW = sheet.texture.width;
      let factor = shading.factorFor(transformY);
      factor = (factor * s.brightness) | 0;
      const fullBright = factor >= 256;

      for (let x = drawStartX; x < drawEndX; x++) {
        if (transformY >= zBuffer[x]!) continue;
        let tx = ((x - left) * texStepX) | 0;
        if (tx < 0) tx = 0;
        else if (tx >= rw) tx = rw - 1;
        const texCol = rx + tx;
        let texPos = (drawStartY - top) * texStepY;
        let idx = drawStartY * w + x;
        for (let y = drawStartY; y < drawEndY; y++) {
          let ty = texPos | 0;
          if (ty >= rh) ty = rh - 1;
          else if (ty < 0) ty = 0;
          const p = texPixels[(ry + ty) * texW + texCol]!;
          if ((p & ALPHA_MASK) !== 0) {
            data[idx] = fullBright ? p : shadePixel(p, factor);
          }
          texPos += texStepY;
          idx += w;
        }
      }
    }
  }
}
