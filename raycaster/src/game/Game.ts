import type { GameHost, EngineStats } from '../core/Engine';
import { Input } from '../core/Input';
import { Camera } from '../renderer/Camera';
import { Framebuffer } from '../renderer/Framebuffer';
import { Raycaster } from '../renderer/Raycaster';
import { WallRenderer } from '../renderer/WallRenderer';
import { FloorCeilingRenderer } from '../renderer/FloorCeilingRenderer';
import { SpriteRenderer } from '../renderer/SpriteRenderer';
import { Shading } from '../renderer/Shading';
import { GameMap } from '../world/GameMap';
import { parseAsciiMap } from '../world/MapParser';
import type { AsciiMapSource } from '../world/MapParser';
import { Player } from '../entities/Player';
import { EntityManager } from '../entities/EntityManager';
import { Enemy, GRUNT, BRUTE } from '../entities/Enemy';
import { Pickup, Decoration, type PickupKind } from '../entities/Pickup';
import { hitscan } from '../entities/Hitscan';
import type { WorldContext } from '../entities/Entity';
import type { AudioManager } from '../audio/AudioManager';
import { HUD, type HudMessage } from './HUD';
import { Minimap } from './Minimap';
import type { AssetBundle } from './Assets';
import { lerpAngle } from '../math/angle';

export interface GameOptions {
  viewCanvas: HTMLCanvasElement;
  hudCanvas: HTMLCanvasElement;
  assets: AssetBundle;
  audio: AudioManager;
  level: AsciiMapSource;
  stats: EngineStats;
  /** Internal vertical resolution; width follows the display aspect. */
  internalHeight?: number;
}

/**
 * Wires renderer, world, entities, audio and HUD into a playable game.
 * Implements `GameHost` so the `Engine` drives it.
 */
export class Game implements GameHost {
  readonly input: Input;
  readonly camera: Camera;
  readonly player = new Player();
  readonly entities = new EntityManager();
  readonly minimap = new Minimap();
  private readonly viewCtx: CanvasRenderingContext2D;
  private readonly hud: HUD;
  private readonly hudCtx: CanvasRenderingContext2D;
  private readonly assets: AssetBundle;
  private readonly audio: AudioManager;
  private readonly shading = new Shading(16, 0.06, 0.72);
  private readonly stats: EngineStats;
  private readonly levelSource: AsciiMapSource;
  private map: GameMap;
  private fb!: Framebuffer;
  private raycaster!: Raycaster;
  private walls!: WallRenderer;
  private floors!: FloorCeilingRenderer;
  private readonly spriteRenderer = new SpriteRenderer();
  private internalHeight: number;
  private readonly messages: HudMessage[] = [];
  private time = 0;
  private status: 'playing' | 'dead' | 'won' = 'playing';
  private enemiesTotal = 0;
  private showFps = true;
  private lowHealthWarned = false;
  private lowAmmoWarned = false;
  private readonly world: WorldContext;

  constructor(options: GameOptions) {
    const viewCtx = options.viewCanvas.getContext('2d', { alpha: false });
    if (!viewCtx) throw new Error('2D context unavailable for view');
    this.viewCtx = viewCtx;
    this.hud = new HUD(options.hudCanvas);
    this.hudCtx = options.hudCanvas.getContext('2d')!;
    this.assets = options.assets;
    this.audio = options.audio;
    this.stats = options.stats;
    this.levelSource = options.level;
    this.internalHeight = options.internalHeight ?? 240;
    this.input = new Input(options.hudCanvas);
    this.camera = new Camera();
    this.map = parseAsciiMap(options.level);

    this.world = {
      map: this.map,
      player: this.player,
      entities: this.entities.entities,
      playSound: (name, x, y) => this.audio.play(name, x !== undefined && y !== undefined ? { x, y, pitchVariance: 0.06 } : { pitchVariance: 0.04 }),
      speak: (id) => this.audio.speak(id),
      message: (text) => this.message(text),
      time: 0,
    };

    this.registerFactories();
    this.resize(options.viewCanvas.width, options.viewCanvas.height);
    this.player.onFootstep = () => this.audio.play('footstep', { volume: 0.5, pitchVariance: 0.15 });
    this.loadLevel();
  }

  private registerFactories(): void {
    const pickupHandler = {
      collect: (kind: PickupKind, amount: number): boolean => {
        if (kind === 'ammo') {
          const added = this.player.weapon.addAmmo(amount);
          if (added <= 0) return false;
          this.message(`+${added} AMMO`);
          this.lowAmmoWarned = false;
          return true;
        }
        const healed = this.player.heal(amount);
        if (healed <= 0) return false;
        this.message(`+${healed} HEALTH`);
        this.lowHealthWarned = false;
        return true;
      },
    };
    this.entities.registerFactory('grunt', () => new Enemy(GRUNT));
    this.entities.registerFactory('brute', () => new Enemy(BRUTE));
    this.entities.registerFactory('pickup_ammo', () => new Pickup('ammo', 12, pickupHandler));
    this.entities.registerFactory('pickup_health', () => new Pickup('health', 25, pickupHandler));
    this.entities.registerFactory('pillar', () => new Decoration('pillar', true, 0.3));
  }

  /** Rebuild the level from its source (also used for restarts). */
  loadLevel(): void {
    this.map = parseAsciiMap(this.levelSource);
    (this.world as { map: GameMap }).map = this.map;
    this.entities.clear();
    for (const s of this.map.spawns) {
      if (this.entities.hasFactory(s.type)) this.entities.spawn(s.type, s.x, s.y, s.angle);
    }
    this.enemiesTotal = this.countEnemies(false);
    this.player.spawn(this.map.playerStart.x, this.map.playerStart.y, this.map.playerStart.angle);
    this.status = 'playing';
    this.time = 0;
    this.messages.length = 0;
    this.lowHealthWarned = false;
    this.lowAmmoWarned = false;
    this.message(`${this.map.name.toUpperCase()} — CLEAR ALL HOSTILES`);
    this.audio.play('level_start');
    this.audio.speak('intro');
  }

  private countEnemies(aliveOnly: boolean): number {
    let n = 0;
    for (const e of this.entities.entities) {
      if (e instanceof Enemy && (!aliveOnly || e.isAlive())) n++;
    }
    return n;
  }

  /** Resize the display canvases and rebuild the internal render target to match the aspect ratio. */
  resize(displayWidth: number, displayHeight: number): void {
    const aspect = displayWidth / Math.max(1, displayHeight);
    const h = this.internalHeight;
    const w = Math.max(64, Math.round(h * aspect) & ~1);
    if (!this.fb || this.fb.width !== w || this.fb.height !== h) {
      this.fb = new Framebuffer(w, h);
      this.raycaster = new Raycaster(w);
      this.walls = new WallRenderer(w);
      this.floors = new FloorCeilingRenderer(h);
    }
    // Keep vertical proportions constant: horizontal FOV grows with aspect.
    this.camera.setFov(2 * Math.atan(0.66 * aspect * 0.75));
  }

  message(text: string, ttl = 3): void {
    this.messages.unshift({ text, ttl });
    if (this.messages.length > 4) this.messages.length = 4;
  }

  get fov(): number {
    return this.camera.fov;
  }

  update(dt: number): void {
    const input = this.input;
    this.time += dt;
    (this.world as { time: number }).time = this.time;

    if (input.actionPressed('toggleMinimap')) this.minimap.visible = !this.minimap.visible;
    if (input.actionPressed('toggleMute')) this.message(this.audio.toggleMute() ? 'AUDIO MUTED' : 'AUDIO ON', 1.5);
    if (input.wasPressed('F3')) this.showFps = !this.showFps;

    if (this.status !== 'playing') {
      if (input.actionPressed('reload')) this.loadLevel();
      this.tickMessages(dt);
      input.endFrame();
      return;
    }

    this.player.update(dt, input, this.map, this.fb.height);
    this.handleWeapon();
    this.entities.update(dt, this.world);

    this.audio.setListener(this.player.pos.x, this.player.pos.y, this.player.angle);
    this.audio.update();

    // Warnings.
    if (this.player.health <= 30 && this.player.isAlive() && !this.lowHealthWarned) {
      this.lowHealthWarned = true;
      this.audio.speak('low_health');
    }
    if (this.player.weapon.totalAmmo <= 6 && !this.lowAmmoWarned) {
      this.lowAmmoWarned = true;
      this.audio.speak('low_ammo');
    }

    // Win / lose.
    if (!this.player.isAlive()) {
      this.status = 'dead';
      this.audio.play('player_die');
      this.audio.speak('player_dead');
    } else if (this.countEnemies(true) === 0) {
      this.status = 'won';
      this.audio.speak('all_clear');
    }

    this.tickMessages(dt);
    input.endFrame();
  }

  private tickMessages(dt: number): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      m.ttl -= dt;
      if (m.ttl <= 0) this.messages.splice(i, 1);
    }
  }

  private handleWeapon(): void {
    const input = this.input;
    const p = this.player;
    if (!p.isAlive()) return;
    if (input.actionPressed('reload')) {
      if (p.weapon.reload()) this.audio.play(p.weapon.spec.reloadSound);
    }
    const wantsFire = input.isAction('fire') || input.isMouseDown(0);
    if (!wantsFire) return;
    const result = p.weapon.fire();
    if (result === 'busy') return;
    if (result === 'empty') {
      this.audio.play(p.weapon.spec.emptySound);
      if (p.weapon.reserve > 0 && p.weapon.reload()) this.audio.play(p.weapon.spec.reloadSound);
      return;
    }
    this.audio.play(p.weapon.spec.fireSound, { pitchVariance: 0.05 });
    const spec = p.weapon.spec;
    const hit = hitscan(this.map, this.entities.entities, p.pos.x, p.pos.y, p.angle, spec.range, spec.spread);
    if (hit.entity) {
      const killed = hit.entity.takeDamage(spec.damage, p.pos.x, p.pos.y, this.world);
      if (killed) {
        const left = this.countEnemies(true);
        this.message(left > 0 ? `HOSTILE DOWN — ${left} LEFT` : 'LAST HOSTILE DOWN', 2);
      }
    }
  }

  render(alpha: number): void {
    const p = this.player;
    // Interpolate between fixed steps for smooth motion at any refresh rate.
    const x = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
    const y = p.prevPos.y + (p.pos.y - p.prevPos.y) * alpha;
    const angle = lerpAngle(p.prevAngle, p.angle, alpha);
    this.camera.setPosition(x, y);
    this.camera.setAngle(angle);
    this.camera.pitch = p.pitch;
    this.camera.bob = p.bobOffset;
    this.camera.clampPitch(this.fb.height);

    this.raycaster.cast(this.camera, this.map);
    this.floors.render(this.fb, this.camera, this.map, this.assets.textures, this.shading);
    this.walls.render(this.fb, this.raycaster, this.assets.textures, this.camera, this.shading);
    this.spriteRenderer.render(this.fb, this.camera, this.entities.billboards(), this.assets.sprites, this.walls.zBuffer, this.shading);
    this.fb.present(this.viewCtx);

    this.hud.draw({
      player: p,
      stats: this.stats,
      messages: this.messages,
      enemiesLeft: this.countEnemies(true),
      enemiesTotal: this.enemiesTotal,
      status: this.status,
      showFps: this.showFps,
      audioMuted: this.audio.isMuted,
      audioSource: this.audio.sourceOf('pistol_fire') ?? 'loading',
    });
    this.minimap.draw(this.hudCtx, this.map, p, this.entities.entities, this.camera.fov);
  }

  dispose(): void {
    this.input.dispose();
  }
}
