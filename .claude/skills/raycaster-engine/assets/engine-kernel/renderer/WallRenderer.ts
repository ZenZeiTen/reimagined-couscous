import type { Framebuffer } from './Framebuffer';
import type { Raycaster } from './Raycaster';
import type { TextureRegistry } from './Texture';
import type { Camera } from './Camera';
import type { Shading } from './Shading';
import { shadePixel } from './Color';

/**
 * Draws textured wall columns from raycaster results and fills a per-column
 * depth buffer for sprite occlusion.
 */
export class WallRenderer {
  readonly zBuffer: Float32Array;
  /** Screen row where each wall column starts/ends, reused by the floor caster. */
  readonly drawStart: Int32Array;
  readonly drawEnd: Int32Array;

  constructor(columns: number) {
    this.zBuffer = new Float32Array(columns);
    this.drawStart = new Int32Array(columns);
    this.drawEnd = new Int32Array(columns);
  }

  render(fb: Framebuffer, rc: Raycaster, textures: TextureRegistry, camera: Camera, shading: Shading): void {
    const w = fb.width;
    const h = fb.height;
    const data = fb.data;
    const horizon = (h >> 1) + (camera.pitch | 0) + (camera.bob | 0);
    const zBuffer = this.zBuffer;
    const drawStartArr = this.drawStart;
    const drawEndArr = this.drawEnd;

    for (let x = 0; x < w; x++) {
      const perp = rc.perpDist[x]!;
      zBuffer[x] = perp;
      if (rc.miss[x] === 1) {
        drawStartArr[x] = horizon;
        drawEndArr[x] = horizon;
        continue;
      }

      // Round the half-height up so wall bases always meet the floor rows
      // (truncating would leave a one-pixel seam of floor beyond the wall).
      const halfLine = Math.ceil((h * 0.5) / perp);
      const lineHeight = halfLine * 2;
      const drawStart = horizon - halfLine;
      const drawEnd = horizon + halfLine;
      const clippedStart = drawStart < 0 ? 0 : drawStart;
      const clippedEnd = drawEnd > h ? h : drawEnd;
      drawStartArr[x] = clippedStart;
      drawEndArr[x] = clippedEnd;
      if (clippedEnd <= clippedStart) continue;

      const tex = textures.get(rc.wallId[x]!);
      const tw = tex.width;
      const th = tex.height;
      const pixels = tex.pixels;

      let texX = (rc.wallX[x]! * tw) | 0;
      // Mirror texture on the far sides so the pattern reads continuously around corners.
      if ((rc.side[x] === 0 && rc.rayDirX[x]! > 0) || (rc.side[x] === 1 && rc.rayDirY[x]! < 0)) {
        texX = tw - texX - 1;
      }
      if (texX < 0) texX = 0;
      else if (texX >= tw) texX = tw - 1;

      const step = th / lineHeight;
      let texPos = (clippedStart - drawStart) * step;

      let factor = shading.factorFor(perp);
      if (rc.side[x] === 1) factor = (factor * shading.sideFactor) | 0;

      let idx = clippedStart * w + x;
      if (factor >= 256) {
        for (let y = clippedStart; y < clippedEnd; y++) {
          let ty = texPos | 0;
          if (ty >= th) ty = th - 1;
          data[idx] = pixels[ty * tw + texX]!;
          texPos += step;
          idx += w;
        }
      } else {
        for (let y = clippedStart; y < clippedEnd; y++) {
          let ty = texPos | 0;
          if (ty >= th) ty = th - 1;
          data[idx] = shadePixel(pixels[ty * tw + texX]!, factor);
          texPos += step;
          idx += w;
        }
      }
    }
  }
}
