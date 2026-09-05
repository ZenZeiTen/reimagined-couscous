import type { Vec2 } from './Vec2';

/**
 * 2x2 matrix stored row-major: [a b; c d]. Used for camera-space transforms
 * (the raycaster's inverse camera matrix) and rotations.
 */
export class Mat2 {
  constructor(public a = 1, public b = 0, public c = 0, public d = 1) {}

  static rotation(angle: number): Mat2 {
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    return new Mat2(cs, -sn, sn, cs);
  }

  set(a: number, b: number, c: number, d: number): this {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return this;
  }

  setRotation(angle: number): this {
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    return this.set(cs, -sn, sn, cs);
  }

  /** Column-basis matrix from two vectors: columns are `u` and `v`. */
  setColumns(u: Vec2, v: Vec2): this {
    return this.set(u.x, v.x, u.y, v.y);
  }

  determinant(): number {
    return this.a * this.d - this.b * this.c;
  }

  /** Invert in place. Returns false (and leaves the matrix untouched) if singular. */
  invert(): boolean {
    const det = this.determinant();
    if (Math.abs(det) < 1e-12) return false;
    const inv = 1 / det;
    const a = this.d * inv;
    const b = -this.b * inv;
    const c = -this.c * inv;
    const d = this.a * inv;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return true;
  }

  multiply(m: Mat2): this {
    const a = this.a * m.a + this.b * m.c;
    const b = this.a * m.b + this.b * m.d;
    const c = this.c * m.a + this.d * m.c;
    const d = this.c * m.b + this.d * m.d;
    return this.set(a, b, c, d);
  }

  /** Transform `v` in place. */
  apply(v: Vec2): Vec2 {
    const x = this.a * v.x + this.b * v.y;
    const y = this.c * v.x + this.d * v.y;
    v.x = x;
    v.y = y;
    return v;
  }
}
