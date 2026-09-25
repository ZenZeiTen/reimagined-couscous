import { packRGBA } from './Color';

/**
 * Immutable packed-pixel texture. Textures must be power-of-two square for the
 * wall renderer's mask arithmetic; other sizes are accepted for sprite sheets.
 */
export class Texture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;
  /** `width - 1` when width is a power of two, used for fast wrapping. */
  readonly xMask: number;
  readonly yMask: number;
  readonly isPow2: boolean;

  constructor(width: number, height: number, pixels?: Uint32Array) {
    if (width <= 0 || height <= 0) throw new Error('Texture dimensions must be positive');
    this.width = width;
    this.height = height;
    this.pixels = pixels ?? new Uint32Array(width * height);
    if (this.pixels.length !== width * height) throw new Error('Texture pixel buffer size mismatch');
    this.isPow2 = (width & (width - 1)) === 0 && (height & (height - 1)) === 0;
    this.xMask = width - 1;
    this.yMask = height - 1;
  }

  static fromImageData(img: ImageData): Texture {
    const pixels = new Uint32Array(img.data.buffer.slice(0));
    return new Texture(img.width, img.height, pixels);
  }

  static fromImage(image: CanvasImageSource & { width: number; height: number }): Texture {
    const w = image.width;
    const h = image.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.drawImage(image, 0, 0);
    return Texture.fromImageData(ctx.getImageData(0, 0, w, h));
  }

  static async load(url: string): Promise<Texture> {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load texture: ${url}`));
      img.src = url;
    });
    return Texture.fromImage(img);
  }

  /** Build a texture from a per-pixel callback returning [r,g,b,a]. */
  static generate(width: number, height: number, fn: (x: number, y: number, out: [number, number, number, number]) => void): Texture {
    const tex = new Texture(width, height);
    const out: [number, number, number, number] = [0, 0, 0, 255];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 255;
        fn(x, y, out);
        tex.pixels[y * width + x] = packRGBA(out[0] | 0, out[1] | 0, out[2] | 0, out[3] | 0);
      }
    }
    return tex;
  }

  get(x: number, y: number): number {
    return this.pixels[y * this.width + x]!;
  }
}

/** Registry mapping numeric ids (as stored in map layers) to textures. */
export class TextureRegistry {
  private readonly textures: Texture[] = [];
  private fallback: Texture;
  /** Incremented on every registration so renderers can invalidate caches. */
  version = 0;

  constructor(fallback?: Texture) {
    this.fallback =
      fallback ??
      Texture.generate(8, 8, (x, y, out) => {
        const c = ((x >> 2) + (y >> 2)) & 1 ? 255 : 0;
        out[0] = c; out[1] = 0; out[2] = c;
      });
  }

  register(id: number, texture: Texture): void {
    if (id < 0) throw new Error('Texture ids must be non-negative');
    this.textures[id] = texture;
    this.version++;
  }

  get(id: number): Texture {
    return this.textures[id] ?? this.fallback;
  }

  has(id: number): boolean {
    return this.textures[id] !== undefined;
  }

  get count(): number {
    return this.textures.length;
  }
}
