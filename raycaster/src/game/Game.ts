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
import { Chest, Door, Lever, Interactable } from '../entities/Interactable';
import { Projectile } from '../entities/Projectile';
import { hitscan } from '../entities/Hitscan';
import type { WorldContext } from '../entities/Entity';
import type { AudioManager, LoopHandle } from '../audio/AudioManager';
import { HUD, type HudMessage } from './HUD';
import { Minimap } from './Minimap';
import type { AssetBundle } from './Assets';
import { lerpAngle } from '../math/angle';
import { TEX } from '../renderer/ProceduralTextures';

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

/** Distance (tiles) within which the centre ray can select a door or prop. */
const INTERACT_RANGE = 1.6;

/**
 * Dungeon-crawler game shell: grid-locked player, interactables, melee and
 * spell combat, exponential darkness and an ambient audio bed. Implements
 * `GameHost` so the `Engine` drives it.
 */
export class Game implements GameHost {
  readonly input: Input;
  readonly camera: Camera;
  readonly player = new Player();
  readonly entities = new EntityManager();
  readonly minimap = new Minimap();
  readonly shading = new Shading(7.5, 0.0, 0.72, 'dungeon', 0.62, 0.7);
  private readonly viewCtx: CanvasRenderingContext2D;
  private readonly hud: HUD;
  private readonly hudCtx: CanvasRenderingContext2D;
  private readonly assets: AssetBundle;
  private readonly audio: AudioManager;
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
  private lowManaWarned = false;
  private ambient: LoopHandle | null = null;
  private torchPhase = 0;
  /** Current interaction target and prompt, refreshed every tick. */
  private focus: Interactable | null = null;
  private focusPrompt: string | null = null;
  private readonly frontCell = { x: 0, y: 0 };
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
    this.minimap.visible = false;

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
    this.player.onFootstep = () => this.audio.play('footstep', { x: this.player.pos.x, y: this.player.pos.y, volume: 0.6, pitchVariance: 0.12 });
    this.player.onBlocked = () => this.audio.play('blocked', { volume: 0.5 });
    this.player.onAttackImpact = (kind) => (kind === 'attack' ? this.resolveSwing() : this.resolveCast());
    this.loadLevel();
  }

  private registerFactories(): void {
    const pickupHandler = {
      collect: (kind: PickupKind, amount: number): boolean => {
        if (kind === 'mana') {
          const added = this.player.restoreMana(amount);
          if (added <= 0) return false;
          this.message(`+${Math.round(added)} MP`);
          this.lowManaWarned = false;
          return true;
        }
        const healed = this.player.heal(amount);
        if (healed <= 0) return false;
        this.message(`+${healed} HP`);
        this.lowHealthWarned = false;
        return true;
      },
    };
    this.entities.registerFactory('grunt', () => new Enemy(GRUNT));
    this.entities.registerFactory('brute', () => new Enemy(BRUTE));
    this.entities.registerFactory('pickup_mana', () => new Pickup('mana', 25, pickupHandler));
    this.entities.registerFactory('pickup_health', () => new Pickup('health', 25, pickupHandler));
    this.entities.registerFactory('pillar', () => new Decoration('pillar', true, 0.3));
    this.entities.registerFactory('door', () => new Door(TEX.DOOR));
    this.entities.registerFactory('door_iron', () => new Door(TEX.DOOR, 'iron'));
    this.entities.registerFactory('door_gate', () => new Door(TEX.DOOR, null, 'gate'));
    this.entities.registerFactory('chest_potion', () => new Chest({ kind: 'potion', amount: 2 }));
    this.entities.registerFactory('chest_ether', () => new Chest({ kind: 'ether', amount: 1 }));
    this.entities.registerFactory('chest_key', () => new Chest({ kind: 'key', amount: 1, keyId: 'iron' }));
    this.entities.registerFactory('chest_gold', () => new Chest({ kind: 'gold', amount: 50 }));
    this.entities.registerFactory('lever_gate', () => new Lever('gate'));
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
    this.lowManaWarned = false;
    this.message(this.map.name.toUpperCase(), 4);
    this.audio.play('level_start');
    this.audio.speak('intro');
    this.startAmbience();
  }

  /** Looped dungeon drone; safe to call before audio is unlocked (it retries on the next call). */
  startAmbience(): void {
    if (this.ambient?.isActive) return;
    this.ambient?.stop();
    this.ambient = this.audio.playLoop('ambient_dungeon', { volume: 0.55 });
  }

  private countEnemies(aliveOnly: boolean): number {
    let n = 0;
    for (const e of this.entities.entities) if (e instanceof Enemy && (!aliveOnly || e.isAlive())) n++;
    return n;
  }

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
    this.camera.setFov(2 * Math.atan(0.66 * aspect * 0.75));
  }

  message(text: string, ttl = 3): void {
    if (!text) return;
    this.messages.unshift({ text, ttl });
    if (this.messages.length > 4) this.messages.length = 4;
  }

  get fov(): number {
    return this.camera.fov;
  }

  get prompt(): string | null {
    return this.focusPrompt;
  }

  update(dt: number): void {
    const input = this.input;
    this.time += dt;
    (this.world as { time: number }).time = this.time;

    if (input.actionPressed('toggleMinimap')) this.minimap.visible = !this.minimap.visible;
    if (input.actionPressed('toggleMute')) this.message(this.audio.toggleMute() ? 'AUDIO MUTED' : 'AUDIO ON', 1.5);
    if (input.wasPressed('F3')) this.showFps = !this.showFps;

    if (this.status !== 'playing') {
      if (input.actionPressed('restart')) this.loadLevel();
      this.tickMessages(dt);
      input.endFrame();
      return;
    }

    if (!this.ambient?.isActive && this.audio.isUnlocked) this.startAmbience();

    this.player.update(dt, input, this.map, this.entities, this.fb.height);
    this.handleActions();
    this.entities.update(dt, this.world);
    this.updateFocus();

    // Torch flicker: slow wander plus a little noise, kept subtle.
    this.torchPhase += dt;
    const flicker = 0.93 + Math.sin(this.torchPhase * 7.3) * 0.03 + Math.sin(this.torchPhase * 13.1) * 0.02 + (Math.random() - 0.5) * 0.02;
    this.shading.configure({ ambient: flicker });

    this.audio.setListener(this.player.pos.x, this.player.pos.y, this.player.angle);
    this.audio.update();

    if (this.player.health <= 30 && this.player.isAlive() && !this.lowHealthWarned) {
      this.lowHealthWarned = true;
      this.audio.speak('low_health');
    }
    if (this.player.mana < this.player.inventory.equipment.spell.manaCost && !this.lowManaWarned) {
      this.lowManaWarned = true;
      this.audio.speak('low_mana');
    }

    if (!this.player.isAlive()) {
      this.status = 'dead';
      this.audio.play('player_die');
      this.audio.speak('player_dead');
      this.ambient?.stop(2);
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

  private handleActions(): void {
    const input = this.input;
    const p = this.player;
    if (!p.isAlive()) return;
    if (input.actionPressed('interact')) this.interact();
    if (input.actionPressed('useItem')) {
      const used = p.useItem();
      if (used) {
        this.audio.play('potion');
        this.message(used === 'potion' ? 'You drink a potion.' : 'You drink an ether.');
      } else this.message('Nothing useful to drink.', 1.5);
    }
    if (input.actionPressed('attack') || input.mousePressedThisFrame(0)) {
      if (p.tryAttack()) this.audio.play('sword_swing', { pitchVariance: 0.08 });
      else if (p.exhausted) this.message('Too exhausted.', 1);
    } else if (input.actionPressed('cast') || input.mousePressedThisFrame(2)) {
      if (p.tryCast()) this.audio.play('spell_cast');
      else if (!p.isBusy) this.message('Not enough mana.', 1);
    }
  }

  /** Sword impact: hits the nearest targetable entity within reach in front of the player. */
  private resolveSwing(): void {
    const p = this.player;
    const weapon = p.inventory.equipment.weapon;
    const hit = hitscan(this.map, this.entities.entities, p.pos.x, p.pos.y, p.facingAngle(), weapon.range, 0.35);
    if (hit.entity) {
      this.audio.play('sword_hit', { x: hit.x, y: hit.y });
      const killed = hit.entity.takeDamage(weapon.damage, p.pos.x, p.pos.y, this.world);
      if (killed) this.onKill();
    }
  }

  private resolveCast(): void {
    const p = this.player;
    const spell = p.inventory.equipment.spell;
    const bolt = new Projectile(p.facingAngle(), 7, spell.damage, spell.range);
    bolt.pos.set(p.pos.x + Math.cos(p.facingAngle()) * 0.4, p.pos.y + Math.sin(p.facingAngle()) * 0.4);
    bolt.angle = p.facingAngle();
    this.entities.add(bolt);
  }

  private onKill(): void {
    const left = this.countEnemies(true);
    this.message(left > 0 ? `It falls. ${left} remain.` : 'The last of them falls.', 2.5);
  }

  /**
   * Interactive raycasting check: the centre column's DDA hit tells us which
   * wall cell is ahead (doors), and the front grid cell is scanned for props.
   */
  private updateFocus(): void {
    this.focus = null;
    this.focusPrompt = null;
    const p = this.player;
    if (!p.isAlive() || p.action === 'move' || p.action === 'turn') return;
    const front = p.frontCell(this.frontCell);
    const centre = this.raycaster.columns >> 1;
    const hitX = this.raycaster.mapX[centre]!;
    const hitY = this.raycaster.mapY[centre]!;
    const hitDist = this.raycaster.perpDist[centre]!;
    let best: Interactable | null = null;
    for (const e of this.entities.entities) {
      if (!(e instanceof Interactable) || e.removed) continue;
      const inFront = e.cellX === front.x && e.cellY === front.y;
      const rayHit = e instanceof Door && hitDist <= INTERACT_RANGE && e.cellX === hitX && e.cellY === hitY;
      if (inFront || rayHit) {
        best = e;
        if (e instanceof Door) break;
      }
    }
    if (best) {
      const prompt = best.prompt(p);
      if (prompt) {
        this.focus = best;
        this.focusPrompt = prompt;
      }
    }
  }

  private interact(): void {
    if (!this.focus) {
      this.message('Nothing here.', 1);
      return;
    }
    const result = this.focus.interact(this.world, this.player);
    if (result.message) this.message(result.message, 2.5);
  }

  render(alpha: number): void {
    const p = this.player;
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
      prompt: this.focusPrompt,
      enemiesLeft: this.countEnemies(true),
      enemiesTotal: this.enemiesTotal,
      status: this.status,
      showFps: this.showFps,
      audioMuted: this.audio.isMuted,
      audioSource: this.audio.sourceOf('ambient_dungeon') ?? 'loading',
    });
    this.minimap.draw(this.hudCtx, this.map, p, this.entities.entities, this.camera.fov);
  }

  dispose(): void {
    this.ambient?.stop();
    this.input.dispose();
  }
}
