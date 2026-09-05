/**
 * Keyboard + mouse input with pointer-lock support and action bindings.
 *
 * Key state is read through `isDown(code)` / `wasPressed(code)` using
 * `KeyboardEvent.code` values ("KeyW", "Space", ...). Actions map a logical name
 * to one or more codes so the game layer never depends on physical keys.
 */
export type ActionBindings = Record<string, readonly string[]>;

export const DEFAULT_BINDINGS: ActionBindings = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight', 'KeyE'],
  run: ['ShiftLeft', 'ShiftRight'],
  fire: ['Space', 'ControlLeft'],
  interact: ['KeyF'],
  toggleMinimap: ['KeyM'],
  toggleMute: ['KeyN'],
  reload: ['KeyR'],
};

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  private readonly mouseDown = new Set<number>();
  private readonly mousePressed = new Set<number>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private bindings: ActionBindings;
  private readonly target: HTMLElement;
  private readonly listeners: Array<() => void> = [];
  /** Mouse sensitivity in radians per pixel. */
  sensitivity = 0.0022;
  pointerLocked = false;

  constructor(target: HTMLElement, bindings: ActionBindings = DEFAULT_BINDINGS) {
    this.target = target;
    this.bindings = { ...bindings };
    this.attach();
  }

  private attach(): void {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (this.pointerLocked && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.down.delete(e.code);
      this.released.add(e.code);
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };
    const onMouseDown = (e: MouseEvent): void => {
      if (!this.mouseDown.has(e.button)) this.mousePressed.add(e.button);
      this.mouseDown.add(e.button);
    };
    const onMouseUp = (e: MouseEvent): void => {
      this.mouseDown.delete(e.button);
    };
    const onWheel = (e: WheelEvent): void => {
      this.wheel += Math.sign(e.deltaY);
    };
    const onLockChange = (): void => {
      this.pointerLocked = document.pointerLockElement === this.target;
      if (!this.pointerLocked) this.clear();
    };
    const onBlur = (): void => this.clear();
    const onContextMenu = (e: Event): void => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    this.target.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this.target.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('blur', onBlur);
    this.target.addEventListener('contextmenu', onContextMenu);

    this.listeners.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('mousemove', onMouseMove),
      () => this.target.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => this.target.removeEventListener('wheel', onWheel),
      () => document.removeEventListener('pointerlockchange', onLockChange),
      () => window.removeEventListener('blur', onBlur),
      () => this.target.removeEventListener('contextmenu', onContextMenu),
    );
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    this.clear();
  }

  requestPointerLock(): void {
    if (document.pointerLockElement !== this.target) {
      const result = this.target.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.target) document.exitPointerLock();
  }

  bind(action: string, codes: readonly string[]): void {
    this.bindings[action] = [...codes];
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  isAction(action: string): boolean {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i]!)) return true;
    return false;
  }

  actionPressed(action: string): boolean {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (let i = 0; i < codes.length; i++) if (this.pressed.has(codes[i]!)) return true;
    return false;
  }

  isMouseDown(button = 0): boolean {
    return this.mouseDown.has(button);
  }

  mousePressedThisFrame(button = 0): boolean {
    return this.mousePressed.has(button);
  }

  /** Accumulated mouse movement since the last `endFrame()`, in pixels. */
  get mouseDeltaX(): number {
    return this.mouseDX;
  }

  get mouseDeltaY(): number {
    return this.mouseDY;
  }

  /** Accumulated wheel notches since the last `endFrame()` (positive = scroll down). */
  get wheelDelta(): number {
    return this.wheel;
  }

  /** Clear per-frame edge state. Call once per update tick after reading input. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  clear(): void {
    this.down.clear();
    this.mouseDown.clear();
    this.endFrame();
  }
}
