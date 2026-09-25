import { Vec2 } from '../math/Vec2';
import { clamp } from '../math/angle';

/**
 * Raycasting camera: position, direction vector and the camera plane whose
 * length encodes the horizontal field of view (plane = tan(fov/2) * dir⊥).
 */
export class Camera {
  readonly pos = new Vec2();
  readonly dir = new Vec2(1, 0);
  readonly plane = new Vec2(0, 0.66);
  private _angle = 0;
  private _fov: number;
  /** Vertical look offset in screen pixels (positive = look up). */
  pitch = 0;
  /** Eye height in [0,1] world units, 0.5 is centred between floor and ceiling. */
  height = 0.5;
  /** Extra vertical bob in pixels applied by the renderer. */
  bob = 0;

  constructor(fovRadians = Math.PI / 3) {
    this._fov = fovRadians;
    this.setAngle(0);
  }

  get angle(): number {
    return this._angle;
  }

  get fov(): number {
    return this._fov;
  }

  setFov(fovRadians: number): void {
    this._fov = clamp(fovRadians, 0.1, Math.PI - 0.1);
    this.setAngle(this._angle);
  }

  setAngle(angle: number): void {
    this._angle = angle;
    const halfTan = Math.tan(this._fov / 2);
    this.dir.set(Math.cos(angle), Math.sin(angle));
    this.plane.set(-this.dir.y * halfTan, this.dir.x * halfTan);
  }

  setPosition(x: number, y: number): void {
    this.pos.set(x, y);
  }

  /** Clamp pitch to a sane range given the internal render height. */
  clampPitch(viewHeight: number): void {
    const limit = viewHeight * 0.45;
    this.pitch = clamp(this.pitch, -limit, limit);
  }
}
