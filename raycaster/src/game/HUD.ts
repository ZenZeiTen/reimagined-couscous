import type { Player } from '../entities/Player';
import type { EngineStats } from '../core/Engine';

export interface HudMessage {
  text: string;
  ttl: number;
}

export interface HudState {
  player: Player;
  stats: EngineStats;
  messages: readonly HudMessage[];
  /** Interaction prompt for whatever is in front of the player, or null. */
  prompt: string | null;
  enemiesLeft: number;
  enemiesTotal: number;
  status: 'playing' | 'dead' | 'won';
  showFps: boolean;
  audioMuted: boolean;
  audioSource: string;
}

const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/**
 * RPG overlay: health/mana/stamina gauges, a compass strip, an equipment and
 * inventory window, interaction prompts and a first-person sword swing.
 */
export class HUD {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for HUD');
    this.ctx = ctx;
  }

  draw(state: HudState): void {
    const ctx = this.ctx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const unit = Math.min(w, h) / 100;

    this.drawWeapon(state, w, h);
    this.drawSpellFlash(state, w, h);
    this.drawDamageFlash(state, w, h);
    this.drawVignette(w, h);
    this.drawGauges(state, w, h, unit);
    this.drawCompass(state, w, h, unit);
    this.drawEquipment(state, w, h, unit);
    this.drawPrompt(state, w, h, unit);
    this.drawMessages(state, w, unit);
    if (state.showFps) this.drawStats(state, unit);
    if (state.status !== 'playing') this.drawEndScreen(state, w, h, unit);
  }

  private drawVignette(w: number, h: number): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawWeapon(state: HudState, w: number, h: number): void {
    const p = state.player;
    if (!p.isAlive()) return;
    const ctx = this.ctx;
    const size = h * 0.5;
    const swinging = p.action === 'attack';
    const t = swinging ? p.actionProgress : 0;
    // Swing arc: raise, slash across, settle.
    const swing = swinging ? Math.sin(t * Math.PI) : 0;
    const bob = p.bobOffset * (h / 240);
    const baseX = w * 0.5 + size * 0.55 - swing * size * 0.7;
    const baseY = h + Math.abs(bob) * 1.5 + size * 0.05;
    const tilt = -0.5 + swing * 1.1;

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(tilt);
    // Grip
    ctx.fillStyle = '#3b2a1a';
    ctx.fillRect(-size * 0.05, -size * 0.35, size * 0.1, size * 0.3);
    // Crossguard
    ctx.fillStyle = '#7a6a3a';
    ctx.fillRect(-size * 0.16, -size * 0.4, size * 0.32, size * 0.06);
    // Blade
    ctx.fillStyle = '#b8bcc8';
    ctx.beginPath();
    ctx.moveTo(-size * 0.06, -size * 0.4);
    ctx.lineTo(size * 0.06, -size * 0.4);
    ctx.lineTo(size * 0.02, -size * 1.15);
    ctx.lineTo(0, -size * 1.22);
    ctx.lineTo(-size * 0.02, -size * 1.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8ecf4';
    ctx.fillRect(-size * 0.012, -size * 1.12, size * 0.024, size * 0.7);
    ctx.restore();
  }

  private drawSpellFlash(state: HudState, w: number, h: number): void {
    const p = state.player;
    if (p.action !== 'cast') return;
    const t = p.actionProgress;
    const a = Math.sin(t * Math.PI) * 0.35;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h * 0.75, 0, w / 2, h * 0.75, h * 0.6);
    g.addColorStop(0, `rgba(255,160,60,${a})`);
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawDamageFlash(state: HudState, w: number, h: number): void {
    const p = state.player;
    if (p.hurtFlash <= 0) return;
    const a = Math.min(0.6, p.hurtFlash * 1.5);
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.8);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(180,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private gauge(x: number, y: number, width: number, height: number, value: number, max: number, color: string, label: string, unit: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.fillRect(x - unit * 0.4, y - unit * 0.4, width + unit * 0.8, height + unit * 0.8);
    ctx.fillStyle = '#2a2420';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, value / max)), height);
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = Math.max(1, unit * 0.15);
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = `${Math.round(unit * 2.2)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label} ${Math.ceil(value)}`, x + unit * 0.8, y + height / 2);
  }

  private drawGauges(state: HudState, _w: number, h: number, unit: number): void {
    const p = state.player;
    const x = unit * 3;
    const width = unit * 28;
    const height = unit * 3.2;
    const gap = unit * 1.2;
    let y = h - unit * 3 - height;
    this.gauge(x, y, width, height, p.stamina, p.maxStamina, p.exhausted ? '#7a6a2a' : '#5aa04a', 'ST', unit);
    y -= height + gap;
    this.gauge(x, y, width, height, p.mana, p.maxMana, '#4a6ae0', 'MP', unit);
    y -= height + gap;
    this.gauge(x, y, width, height, p.health, p.maxHealth, p.health > 30 ? '#c03030' : '#ff5050', 'HP', unit);
  }

  private drawCompass(state: HudState, w: number, _h: number, unit: number): void {
    const ctx = this.ctx;
    const p = state.player;
    const cx = w / 2;
    const y = unit * 4;
    const stripW = unit * 40;
    const stripH = unit * 4.5;
    ctx.fillStyle = 'rgba(10,8,6,0.7)';
    ctx.fillRect(cx - stripW / 2, y - stripH / 2, stripW, stripH);
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = Math.max(1, unit * 0.15);
    ctx.strokeRect(cx - stripW / 2, y - stripH / 2, stripW, stripH);

    // Strip scrolls with the (tweened) camera angle; 8 headings across 360°.
    const headingSpan = stripW / 2.4; // pixels per 90°
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - stripW / 2, y - stripH / 2, stripW, stripH);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = -8; i <= 16; i++) {
      const heading = (i * Math.PI) / 4;
      const dx = ((heading - p.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const px = cx + (dx / (Math.PI / 2)) * headingSpan;
      if (px < cx - stripW / 2 - unit * 3 || px > cx + stripW / 2 + unit * 3) continue;
      const label = COMPASS[((i % 8) + 8) % 8]!;
      const major = label.length === 1;
      ctx.fillStyle = major ? '#f0e0b0' : '#9a8a6a';
      ctx.font = `${major ? 'bold ' : ''}${Math.round(unit * (major ? 3 : 2))}px "Courier New", monospace`;
      ctx.fillText(label, px, y);
    }
    ctx.restore();
    ctx.fillStyle = '#f0c040';
    ctx.beginPath();
    ctx.moveTo(cx, y - stripH / 2 - unit * 0.2);
    ctx.lineTo(cx - unit * 0.9, y - stripH / 2 - unit * 1.4);
    ctx.lineTo(cx + unit * 0.9, y - stripH / 2 - unit * 1.4);
    ctx.closePath();
    ctx.fill();
  }

  private drawEquipment(state: HudState, w: number, h: number, unit: number): void {
    const ctx = this.ctx;
    const p = state.player;
    const inv = p.inventory;
    const boxW = unit * 40;
    const boxH = unit * 19;
    const x = w - boxW - unit * 3;
    const y = h - boxH - unit * 3;
    const labelX = x + unit * 1.2;
    const valueX = x + unit * 10;
    const rowH = unit * 3.1;
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = Math.max(1, unit * 0.15);
    ctx.strokeRect(x, y, boxW, boxH);
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(unit * 2.2)}px "Courier New", monospace`;

    const row = (i: number, label: string, value: string, color: string): void => {
      const ry = y + unit * 1.2 + rowH * i;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9a8a6a';
      ctx.fillText(label, labelX, ry);
      ctx.fillStyle = color;
      ctx.fillText(value, valueX, ry);
    };
    row(0, 'WEAPON', inv.equipment.weapon.name, '#e8dcc0');
    row(1, 'SPELL', `${inv.equipment.spell.name} (${inv.equipment.spell.manaCost} MP)`, p.mana >= inv.equipment.spell.manaCost ? '#c0c8ff' : '#6a6a8a');
    row(2, 'ITEMS', `Potion x${inv.count('potion')}   Ether x${inv.count('ether')}`, '#e8dcc0');
    row(3, 'GOLD', String(inv.count('gold')), '#f0c040');
    const keys = inv.keys();
    row(4, 'KEYS', keys.length ? keys.join(', ') : 'none', keys.length ? '#f0c040' : '#6a6a5a');

    ctx.textAlign = 'right';
    ctx.fillStyle = '#6a6a5a';
    ctx.fillText(`H: use item   foes ${state.enemiesLeft}/${state.enemiesTotal}`, x + boxW - unit, y + boxH - unit * 3);
    ctx.font = `${Math.round(unit * 2)}px "Courier New", monospace`;
    ctx.fillStyle = state.audioMuted ? '#e04a4a' : '#6a8a6a';
    ctx.fillText(state.audioMuted ? 'AUDIO MUTED (N)' : `AUDIO: ${state.audioSource.toUpperCase()}`, x + boxW - unit, y - unit * 3);
  }

  private drawPrompt(state: HudState, w: number, h: number, unit: number): void {
    if (!state.prompt) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(unit * 3)}px "Courier New", monospace`;
    const text = `[F] ${state.prompt}`;
    const tw = ctx.measureText(text).width;
    const y = h * 0.62;
    ctx.fillStyle = 'rgba(10,8,6,0.7)';
    ctx.fillRect(w / 2 - tw / 2 - unit * 1.5, y - unit * 2.2, tw + unit * 3, unit * 4.4);
    ctx.fillStyle = '#f0c040';
    ctx.fillText(text, w / 2, y);
  }

  private drawMessages(state: HudState, w: number, unit: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(unit * 2.8)}px "Courier New", monospace`;
    let y = unit * 9;
    for (const m of state.messages) {
      const a = Math.min(1, m.ttl);
      const tw = ctx.measureText(m.text).width;
      ctx.fillStyle = `rgba(10,8,6,${0.6 * a})`;
      ctx.fillRect(w / 2 - tw / 2 - unit, y - unit * 0.4, tw + unit * 2, unit * 3.8);
      ctx.fillStyle = `rgba(232,220,192,${a})`;
      ctx.fillText(m.text, w / 2, y);
      y += unit * 4.4;
    }
  }

  private drawStats(state: HudState, unit: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(unit * 2.2)}px "Courier New", monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(unit, unit, unit * 32, unit * 6);
    ctx.fillStyle = '#9f9';
    const s = state.stats;
    ctx.fillText(`FPS ${s.fps.toFixed(0)}  frame ${s.frameMs.toFixed(1)}ms  render ${s.renderMs.toFixed(1)}ms`, unit * 2, unit * 2.5);
  }

  private drawEndScreen(state: HudState, w: number, h: number, unit: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = state.status === 'dead' ? 'rgba(60,0,0,0.7)' : 'rgba(20,30,10,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8dcc0';
    ctx.font = `bold ${Math.round(unit * 9)}px "Courier New", monospace`;
    ctx.fillText(state.status === 'dead' ? 'DARKNESS TAKES YOU' : 'THE CATACOMBS ARE STILL', w / 2, h / 2 - unit * 6);
    ctx.font = `${Math.round(unit * 3.5)}px "Courier New", monospace`;
    ctx.fillText('Press R to begin again', w / 2, h / 2 + unit * 4);
  }
}
