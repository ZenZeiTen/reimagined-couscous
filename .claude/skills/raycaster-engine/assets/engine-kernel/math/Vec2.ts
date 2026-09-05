/**
 * Mutable 2D vector. Methods mutate `this` and return it so hot paths can
 * operate without allocating; use `clone()` when a fresh instance is needed.
 */
export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  static fromAngle(angle: number, length = 1): Vec2 {
    return new Vec2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: Vec2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  add(v: Vec2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  addScaled(v: Vec2, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }

  sub(v: Vec2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  /** 2D cross product (z component of the 3D cross product). */
  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-12) {
      this.x /= len;
      this.y /= len;
    } else {
      this.x = 0;
      this.y = 0;
    }
    return this;
  }

  setLength(len: number): this {
    return this.normalize().scale(len);
  }

  /** Rotate counter-clockwise in the mathematical sense (clockwise on a y-down screen). */
  rotate(angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const x = this.x * c - this.y * s;
    const y = this.x * s + this.y * c;
    this.x = x;
    this.y = y;
    return this;
  }

  /** Perpendicular vector (rotated by +90°). */
  perp(): this {
    const x = this.x;
    this.x = -this.y;
    this.y = x;
    return this;
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  distanceTo(v: Vec2): number {
    const dx = v.x - this.x;
    const dy = v.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceSqTo(v: Vec2): number {
    const dx = v.x - this.x;
    const dy = v.y - this.y;
    return dx * dx + dy * dy;
  }

  lerp(v: Vec2, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  equals(v: Vec2, epsilon = 1e-9): boolean {
    return Math.abs(this.x - v.x) <= epsilon && Math.abs(this.y - v.y) <= epsilon;
  }

  toString(): string {
    return `Vec2(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }
}
