/**
 * CPU-side RGBA framebuffer. Rendering writes packed pixels into `data`; `present`
 * uploads to a canvas once per frame and scales to the display size with
 * nearest-neighbour filtering for a crisp retro look.
 */
export class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly imageData: ImageData;
  /** Packed pixel view over `imageData.data`. */
  readonly data: Uint32Array;
  private readonly backing: HTMLCanvasElement | OffscreenCanvas;
  private readonly backingCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.imageData = new ImageData(width, height);
    this.data = new Uint32Array(this.imageData.data.buffer);
    if (typeof OffscreenCanvas !== 'undefined') {
      this.backing = new OffscreenCanvas(width, height);
    } else {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      this.backing = c;
    }
    const ctx = this.backing.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('2D context unavailable for framebuffer');
    this.backingCtx = ctx;
  }

  clear(color: number): void {
    this.data.fill(color);
  }

  /** Fill rows [y0, y1) with `color`. */
  fillRows(y0: number, y1: number, color: number): void {
    const start = Math.max(0, y0) * this.width;
    const end = Math.min(this.height, y1) * this.width;
    if (end > start) this.data.fill(color, start, end);
  }

  /** Upload the pixel buffer and draw it scaled into `ctx`'s full canvas. */
  present(ctx: CanvasRenderingContext2D): void {
    this.backingCtx.putImageData(this.imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.backing as CanvasImageSource, 0, 0, this.width, this.height, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}
