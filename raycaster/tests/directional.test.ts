import { describe, it, expect } from 'vitest';
import { parseDirectionalMeta, packDirectionalFrames, Texture, packRGBA, unpackR, SpriteSheetError } from '../src/renderer';

const meta = {
  modelName: 'guard',
  numAngles: 4,
  resolution: 8,
  frames: [
    { index: 0, angleDegrees: 0, filename: 'sprite_00_0deg.png' },
    { index: 1, angleDegrees: 90, filename: 'sprite_01_90deg.png' },
    { index: 2, angleDegrees: 180, filename: 'sprite_02_180deg.png' },
    { index: 3, angleDegrees: 270, filename: 'sprite_03_270deg.png' },
  ],
};

describe('directional sprite add-on metadata', () => {
  it('parses the add-on output', () => {
    const m = parseDirectionalMeta(meta);
    expect(m.modelName).toBe('guard');
    expect(m.frames).toHaveLength(4);
  });

  it('rejects inconsistent metadata', () => {
    expect(() => parseDirectionalMeta({ ...meta, frames: meta.frames.slice(1) })).toThrow(SpriteSheetError);
    expect(() => parseDirectionalMeta({ ...meta, frames: [meta.frames[0], meta.frames[0], meta.frames[2], meta.frames[3]] })).toThrow(/twice/);
    expect(() => parseDirectionalMeta({ ...meta, numAngles: 0 })).toThrow(/numAngles/);
  });

  it('packs per-angle images into a sheet with one idle animation', () => {
    const m = parseDirectionalMeta(meta);
    const images = m.frames.map((f) => new Texture(8, 8, new Uint32Array(64).fill(packRGBA(f.index * 50, 0, 0))));
    const sheet = packDirectionalFrames(m, images, { worldHeight: 0.8 });
    expect(sheet.name).toBe('guard');
    expect(sheet.directions).toBe(4);
    expect(sheet.worldHeight).toBe(0.8);
    expect(sheet.texture.width).toBe(32);
    expect(sheet.animationNames()).toEqual(['idle']);
    for (let d = 0; d < 4; d++) {
      const idx = sheet.frameIndex('idle', 0, d);
      expect(sheet.rectX[idx]).toBe(d * 8);
      expect(unpackR(sheet.texture.get(d * 8 + 3, 5))).toBe(d * 50);
    }
    // Direction lookup uses the same convention as full sheets.
    expect(sheet.directionFor(0, 0, 0, 5, 0)).toBe(0);
    expect(sheet.directionFor(0, 0, 0, 0, 5)).toBe(1);
    expect(() => packDirectionalFrames(m, images.slice(1))).toThrow(/expected 4 images/);
    expect(() => packDirectionalFrames(m, [new Texture(4, 4), ...images.slice(1)])).toThrow(/expected 8x8/);
  });
});
