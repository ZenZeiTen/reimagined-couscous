/** Minimal view of an entity that the sprite renderer needs. */
export interface Billboard {
  x: number;
  y: number;
  /** Facing angle in radians (for multi-direction sprites). */
  angle: number;
  sheet: string;
  animation: string;
  /** Seconds since the current animation started. */
  animTime: number;
  /** Uniform scale multiplier (1 = sheet's worldHeight). */
  scale: number;
  /** Vertical offset in world units (positive = raised off the floor). */
  zOffset: number;
  visible: boolean;
  /** Brightness multiplier 0..1 applied on top of distance fog (1 = normal). */
  brightness: number;
}
