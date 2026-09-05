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
  enemiesLeft: number;
  enemiesTotal: number;
  status: 'playing' | 'dead' | 'won';
  showFps: boolean;
  audioMuted: boolean;
  audioSource: string;
}

/** 2D overlay drawn at display resolution on top of the raycast view. */
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
    this.drawDamageFlash(state, w, h);
    this.drawCrosshair(w, h, unit);
    this.drawStatusBar(state, w, h, unit);
    this.drawMessages(state, w, h, unit);
    if (state.showFps) this.drawStats(state, unit);
    if (state.status !== 'playing') this.drawEndScreen(state, w, h, unit);
  }

  private drawWeapon(state: HudState, w: number, h: number): void {
    const ctx = this.ctx;
    const p = state.player;
    if (!p.isAlive()) return;
    const weapon = p.weapon;
    const size = h * 0.42;
    const recoil = weapon.flashLeft > 0 ? size * 0.06 : 0;
    const bob = p.bobOffset * (h / 240);
    const baseX = w * 0.5 + size * 0.28 + Math.sin(p.bobPhase * 0.5) * size * 0.02;
    const baseY = h + recoil + Math.abs(bob) * 1.5;
    const reloadDrop = weapon.isReloading ? size * 0.35 : 0;

    ctx.save();
    ctx.translate(baseX, baseY + reloadDrop);
    // Arm/grip.
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(-size * 0.16, -size * 0.55, size * 0.34, size * 0.6);
    // Slide.
    ctx.fillStyle = '#3c3f46';
    ctx.fillRect(-size * 0.22, -size * 0.92, size * 0.42, size * 0.22);
    ctx.fillStyle = '#5a5f68';
    ctx.fillRect(-size * 0.22, -size * 0.92, size * 0.42, size * 0.06);
    // Barrel.
    ctx.fillStyle = '#2b2d33';
    ctx.fillRect(-size * 0.06, -size * 1.02, size * 0.12, size * 0.14);
    // Trigger guard.
    ctx.strokeStyle = '#2b2d33';
    ctx.lineWidth = size * 0.03;
    ctx.beginPath();
    ctx.arc(0, -size * 0.6, size * 0.09, 0, Math.PI);
    ctx.stroke();

    if (weapon.flashLeft > 0) {
      const r = size * (0.16 + Math.random() * 0.06);
      const g = ctx.createRadialGradient(0, -size * 1.05, 0, 0, -size * 1.05, r);
      g.addColorStop(0, 'rgba(255,255,220,0.95)');
      g.addColorStop(0.4, 'rgba(255,190,60,0.8)');
      g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -size * 1.05, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawDamageFlash(state: HudState, w: number, h: number): void {
    const p = state.player;
    if (p.hurtFlash <= 0) return;
    const a = Math.min(0.55, p.hurtFlash * 1.5);
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.8);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawCrosshair(w: number, h: number, unit: number): void {
    const ctx = this.ctx;
    const cx = w / 2;
    const cy = h / 2;
    const gap = unit * 0.8;
    const len = unit * 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, unit * 0.25);
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();
  }

  private drawStatusBar(state: HudState, w: number, h: number, unit: number): void {
    const ctx = this.ctx;
    const p = state.player;
    const pad = unit * 2;
    const barH = unit * 9;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = '#c8a000';
    ctx.fillRect(0, h - barH, w, Math.max(1, unit * 0.3));

    const font = `${Math.round(unit * 3.4)}px "Courier New", monospace`;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    const y = h - barH / 2;

    // Health.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aaa';
    ctx.fillText('HEALTH', pad, y - unit * 2);
    ctx.fillStyle = p.health > 30 ? '#4ae05a' : '#e04a4a';
    ctx.font = `bold ${Math.round(unit * 5)}px "Courier New", monospace`;
    ctx.fillText(String(Math.ceil(p.health)), pad, y + unit * 1.5);
    const hbX = pad + unit * 16;
    const hbW = unit * 24;
    ctx.fillStyle = '#333';
    ctx.fillRect(hbX, y - unit * 1.5, hbW, unit * 3);
    ctx.fillStyle = p.health > 30 ? '#4ae05a' : '#e04a4a';
    ctx.fillRect(hbX, y - unit * 1.5, hbW * (p.health / p.maxHealth), unit * 3);

    // Enemies.
    ctx.textAlign = 'center';
    ctx.font = font;
    ctx.fillStyle = '#aaa';
    ctx.fillText('HOSTILES', w / 2, y - unit * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(unit * 5)}px "Courier New", monospace`;
    ctx.fillText(`${state.enemiesLeft} / ${state.enemiesTotal}`, w / 2, y + unit * 1.5);

    // Ammo.
    ctx.textAlign = 'right';
    ctx.font = font;
    ctx.fillStyle = '#aaa';
    ctx.fillText(p.weapon.isReloading ? 'RELOADING' : p.weapon.spec.name.toUpperCase(), w - pad, y - unit * 2);
    ctx.fillStyle = p.weapon.inMagazine === 0 ? '#e04a4a' : '#f0d060';
    ctx.font = `bold ${Math.round(unit * 5)}px "Courier New", monospace`;
    ctx.fillText(`${p.weapon.inMagazine} | ${p.weapon.reserve}`, w - pad, y + unit * 1.5);

    // Audio indicator.
    ctx.font = `${Math.round(unit * 2.4)}px "Courier New", monospace`;
    ctx.fillStyle = state.audioMuted ? '#e04a4a' : '#8a8';
    ctx.fillText(state.audioMuted ? 'AUDIO MUTED (N)' : `AUDIO: ${state.audioSource.toUpperCase()}`, w - pad, h - barH - unit * 2);
  }

  private drawMessages(state: HudState, w: number, _h: number, unit: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.round(unit * 3.2)}px "Courier New", monospace`;
    let y = unit * 3;
    for (const m of state.messages) {
      const a = Math.min(1, m.ttl);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`;
      const tw = ctx.measureText(m.text).width;
      ctx.fillRect(w / 2 - tw / 2 - unit, y - unit * 0.5, tw + unit * 2, unit * 4.2);
      ctx.fillStyle = `rgba(240,220,160,${a})`;
      ctx.fillText(m.text, w / 2, y);
      y += unit * 5;
    }
  }

  private drawStats(state: HudState, unit: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(unit * 2.4)}px "Courier New", monospace`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(unit, unit, unit * 34, unit * 9);
    ctx.fillStyle = '#9f9';
    const s = state.stats;
    ctx.fillText(`FPS ${s.fps.toFixed(0)}  frame ${s.frameMs.toFixed(1)}ms`, unit * 2, unit * 1.8);
    ctx.fillText(`update ${s.updateMs.toFixed(2)}ms  render ${s.renderMs.toFixed(2)}ms`, unit * 2, unit * 5);
  }

  private drawEndScreen(state: HudState, w: number, h: number, unit: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = state.status === 'dead' ? 'rgba(120,0,0,0.55)' : 'rgba(0,40,0,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(unit * 10)}px "Courier New", monospace`;
    ctx.fillText(state.status === 'dead' ? 'SIGNAL LOST' : 'SECTOR CLEARED', w / 2, h / 2 - unit * 6);
    ctx.font = `${Math.round(unit * 3.5)}px "Courier New", monospace`;
    ctx.fillText('Press R to restart', w / 2, h / 2 + unit * 4);
  }
}
