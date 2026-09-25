import { describe, it, expect } from 'vitest';
import { Camera, Raycaster, WallRenderer, SpriteRenderer, Shading, Texture, TextureRegistry, SpriteSheet, SpriteSheetRegistry, packRGBA, unpackR, unpackG, unpackB, unpackA, shadePixel, brickTexture, type Billboard } from '../src/renderer';
import type { Framebuffer } from '../src/renderer/Framebuffer';
import { parseAsciiMap, type TileLegend } from '../src/world';

const legend: TileLegend = {
  '#': { wall: 1, floor: 0, ceiling: 0 },
  '=': { wall: 2, floor: 0, ceiling: 0 },
  '.': { wall: 0, floor: 1, ceiling: 1 },
  P: { wall: 0, floor: 1, ceiling: 1, playerStart: true },
};

/** Framebuffer stand-in: the renderers only touch width/height/data. */
function fakeFramebuffer(width: number, height: number): Framebuffer {
  return { width, height, data: new Uint32Array(width * height) } as unknown as Framebuffer;
}

describe('packed colours', () => {
  it('round-trips channels and shades', () => {
    const p = packRGBA(10, 20, 30, 255);
    expect(unpackR(p)).toBe(10);
    expect(unpackG(p)).toBe(20);
    expect(unpackB(p)).toBe(30);
    expect(unpackA(p)).toBe(255);
    const half = shadePixel(packRGBA(200, 100, 50), 128);
    expect(unpackR(half)).toBe(100);
    expect(unpackG(half)).toBe(50);
    expect(unpackB(half)).toBe(25);
    expect(unpackA(half)).toBe(255);
  });
});

describe('Raycaster', () => {
  const map = parseAsciiMap({ rows: ['#####', '#P..#', '#...#', '#...#', '#####'], legend });

  it('finds perpendicular distance and side for the centre ray', () => {
    const cam = new Camera(Math.PI / 3);
    cam.setPosition(1.5, 2.5);
    cam.setAngle(0);
    const rc = new Raycaster(8);
    rc.cast(cam, map);
    const c = 4; // cameraX = 0 exactly: the centre ray
    expect(rc.perpDist[c]).toBeCloseTo(2.5, 5);
    expect(rc.side[c]).toBe(0);
    expect(rc.wallId[c]).toBe(1);
    expect(rc.mapX[c]).toBe(4);
    expect(rc.wallX[c]).toBeCloseTo(0.5, 5);
    expect(rc.miss[c]).toBe(0);
  });

  it('never misses inside a closed map and honours texture ids', () => {
    const walled = parseAsciiMap({ rows: ['#=#', '#P#', '###'], legend });
    const cam = new Camera();
    cam.setPosition(1.5, 1.5);
    cam.setAngle(-Math.PI / 2);
    const rc = new Raycaster(32);
    rc.cast(cam, walled);
    for (let x = 0; x < 32; x++) expect(rc.miss[x]).toBe(0);
    expect(rc.wallId[16]).toBe(2);
    expect(rc.side[16]).toBe(1);
  });

  it('fisheye correction keeps a flat wall flat', () => {
    const cam = new Camera(Math.PI / 3);
    cam.setPosition(1.5, 2.5);
    cam.setAngle(0);
    const rc = new Raycaster(64);
    rc.cast(cam, map);
    // All rays that hit the far wall (x = 4) share the same perpendicular distance.
    for (let x = 0; x < 64; x++) if (rc.mapX[x] === 4 && rc.side[x] === 0) expect(rc.perpDist[x]).toBeCloseTo(2.5, 4);
  });
});

describe('WallRenderer', () => {
  it('draws taller columns for nearer walls and fills the z-buffer', () => {
    const map = parseAsciiMap({ rows: ['#####', '#P..#', '#####'], legend });
    const textures = new TextureRegistry();
    textures.register(1, brickTexture(16));
    const cam = new Camera(Math.PI / 3);
    cam.setPosition(1.5, 1.5);
    cam.setAngle(0);
    const w = 40;
    const h = 30;
    const rc = new Raycaster(w);
    rc.cast(cam, map);
    const fb = fakeFramebuffer(w, h);
    const walls = new WallRenderer(w);
    walls.render(fb, rc, textures, cam, new Shading());
    // Column 0 looks diagonally at the near side wall; centre column sees the far wall.
    const nearHeight = walls.drawEnd[0]! - walls.drawStart[0]!;
    const farHeight = walls.drawEnd[w / 2]! - walls.drawStart[w / 2]!;
    expect(nearHeight).toBeGreaterThan(farHeight);
    expect(walls.zBuffer[w / 2]).toBeCloseTo(2.5, 4);
    // Wall pixels are written (non-zero) inside the drawn span.
    const mid = (walls.drawStart[w / 2]! + walls.drawEnd[w / 2]!) >> 1;
    expect(fb.data[mid * w + w / 2]).not.toBe(0);
  });
});

describe('SpriteSheet metadata', () => {
  const meta = {
    name: 'test',
    image: 'test.png',
    frameWidth: 4,
    frameHeight: 4,
    directions: 4,
    origin: { x: 0.5, y: 1 },
    animations: { idle: { fps: 2, loop: true, frameCount: 2 }, die: { fps: 4, loop: false, frameCount: 2 } },
    frames: [] as Array<{ animation: string; frame: number; direction: number; x: number; y: number; w: number; h: number }>,
  };
  let row = 0;
  for (const anim of ['idle', 'die']) {
    for (let f = 0; f < 2; f++) {
      for (let d = 0; d < 4; d++) meta.frames.push({ animation: anim, frame: f, direction: d, x: d * 4, y: row * 4, w: 4, h: 4 });
      row++;
    }
  }
  const sheet = new SpriteSheet(meta, new Texture(16, 16));

  it('resolves frames and playback timing', () => {
    expect(sheet.frameAt('idle', 0)).toBe(0);
    expect(sheet.frameAt('idle', 0.5)).toBe(1);
    expect(sheet.frameAt('idle', 1.0)).toBe(0);
    expect(sheet.frameAt('die', 10)).toBe(1);
    expect(sheet.isFinished('die', 0.6)).toBe(true);
    expect(sheet.isFinished('idle', 99)).toBe(false);
    const idx = sheet.frameIndex('die', 1, 3);
    expect(sheet.rectX[idx]).toBe(12);
    expect(sheet.rectY[idx]).toBe(12);
  });

  it('follows the clockwise-from-front direction convention', () => {
    // Sprite at origin facing +x. Viewer in front (+x) sees direction 0.
    expect(sheet.directionFor(0, 0, 0, 5, 0)).toBe(0);
    // Viewer at +y (the sprite's right-hand side in a y-down world) sees direction N/4.
    expect(sheet.directionFor(0, 0, 0, 0, 5)).toBe(1);
    // Viewer behind sees N/2, viewer on the left sees 3N/4.
    expect(sheet.directionFor(0, 0, 0, -5, 0)).toBe(2);
    expect(sheet.directionFor(0, 0, 0, 0, -5)).toBe(3);
    // Rotating the sprite rotates the result.
    expect(sheet.directionFor(0, 0, Math.PI / 2, 0, 5)).toBe(0);
  });

  it('rejects incomplete or out-of-bounds frame tables', () => {
    const missing = { ...meta, frames: meta.frames.slice(1) };
    expect(() => new SpriteSheet(missing, new Texture(16, 16))).toThrow(/missing frame/);
    expect(() => new SpriteSheet(meta, new Texture(8, 8))).toThrow(/outside/);
  });

});

describe('SpriteRenderer', () => {
  it('draws visible sprites and occludes them behind walls', () => {
    const map = parseAsciiMap({ rows: ['#######', '#P..#.#', '#######'], legend });
    const textures = new TextureRegistry();
    textures.register(1, brickTexture(8));
    const cam = new Camera(Math.PI / 3);
    cam.setPosition(1.5, 1.5);
    cam.setAngle(0);
    const w = 60;
    const h = 40;
    const rc = new Raycaster(w);
    rc.cast(cam, map);
    const fb = fakeFramebuffer(w, h);
    const walls = new WallRenderer(w);
    walls.render(fb, rc, textures, cam, new Shading());
    const before = Uint32Array.from(fb.data);

    const sheets = new SpriteSheetRegistry();
    // Solid 4x4 single-direction sheet.
    const solid = new Texture(4, 4, new Uint32Array(16).fill(packRGBA(255, 0, 255)));
    sheets.register(new SpriteSheet({ name: 'dot', image: 'dot.png', frameWidth: 4, frameHeight: 4, directions: 1, origin: { x: 0.5, y: 1 }, worldHeight: 0.8, animations: { idle: { fps: 1, loop: true, frameCount: 1 } }, frames: [{ animation: 'idle', frame: 0, direction: 0, x: 0, y: 0, w: 4, h: 4 }] }, solid));

    const mk = (x: number, y: number): Billboard => ({ x, y, angle: 0, sheet: 'dot', animation: 'idle', animTime: 0, scale: 1, zOffset: 0, visible: true, brightness: 1 });
    const visibleSprite = mk(2.5, 1.5);
    const hiddenSprite = mk(5.5, 1.5); // behind the wall at x = 4
    const renderer = new SpriteRenderer();
    renderer.render(fb, cam, [hiddenSprite, visibleSprite], sheets, walls.zBuffer, new Shading());

    let changed = 0;
    for (let i = 0; i < fb.data.length; i++) if (fb.data[i] !== before[i]) changed++;
    expect(changed).toBeGreaterThan(20);

    // Rendering only the hidden sprite must leave the frame untouched.
    const fb2 = fakeFramebuffer(w, h);
    fb2.data.set(before);
    renderer.render(fb2, cam, [hiddenSprite], sheets, walls.zBuffer, new Shading());
    for (let i = 0; i < fb2.data.length; i++) expect(fb2.data[i]).toBe(before[i]);
  });
});

describe('FloorCeilingRenderer sky', () => {
  it('rebuilds the gradient from the configured endpoints', async () => {
    const { FloorCeilingRenderer } = await import('../src/renderer/FloorCeilingRenderer');
    const fc = new FloorCeilingRenderer(16);
    const top = packRGBA(10, 20, 30);
    const bottom = packRGBA(200, 150, 100);
    fc.setSky(top, bottom);
    expect(fc.skyTop).toBe(top);
    expect(fc.skyBottom).toBe(bottom);
    // Render into a map with an open-sky ceiling and confirm the top row matches the new top colour.
    const map = parseAsciiMap({ rows: ['###', '#P#', '###'], legend: { ...legend, P: { wall: 0, floor: 1, ceiling: 0, playerStart: true } } });
    const cam = new Camera(Math.PI / 3);
    cam.setPosition(1.5, 1.5);
    cam.setAngle(0);
    const fb = fakeFramebuffer(8, 16);
    const textures = new TextureRegistry();
    textures.register(1, brickTexture(8));
    fc.render(fb, cam, map, textures, new Shading(20, 1, 1));
    expect(unpackR(fb.data[0]!)).toBe(10);
    expect(unpackG(fb.data[0]!)).toBe(20);
    expect(unpackB(fb.data[0]!)).toBe(30);
  });
});
