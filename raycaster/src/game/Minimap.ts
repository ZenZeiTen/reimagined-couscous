import type { GameMap } from '../world/GameMap';
import type { Player } from '../entities/Player';
import type { Entity } from '../entities/Entity';

/** Top-down overlay drawn into the HUD canvas. */
export class Minimap {
  visible = true;
  cellSize = 6;
  margin = 12;

  draw(ctx: CanvasRenderingContext2D, map: GameMap, player: Player, entities: readonly Entity[], fov: number): void {
    if (!this.visible) return;
    const cs = Math.max(2, Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) / 100));
    this.cellSize = cs;
    const ox = ctx.canvas.width - map.width * cs - this.margin;
    const oy = this.margin;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ox - 2, oy - 2, map.width * cs + 4, map.height * cs + 4);
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const wall = map.walls[y * map.width + x]!;
        if (wall !== 0) {
          ctx.fillStyle = '#8a8a9a';
          ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
        } else if (map.ceilings[y * map.width + x] === 0) {
          ctx.fillStyle = 'rgba(60,80,120,0.5)';
          ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
        }
      }
    }

    for (const e of entities) {
      const ex = ox + e.pos.x * cs;
      const ey = oy + e.pos.y * cs;
      if (e.targetable && e.isAlive()) ctx.fillStyle = '#e04040';
      else if (e.type.startsWith('pickup')) ctx.fillStyle = '#f0d060';
      else if (e.targetable === false && e.solid) ctx.fillStyle = '#bbb';
      else continue;
      ctx.beginPath();
      ctx.arc(ex, ey, cs * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = ox + player.pos.x * cs;
    const py = oy + player.pos.y * cs;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(player.angle - fov / 2) * cs * 6, py + Math.sin(player.angle - fov / 2) * cs * 6);
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(player.angle + fov / 2) * cs * 6, py + Math.sin(player.angle + fov / 2) * cs * 6);
    ctx.stroke();

    ctx.fillStyle = '#4ae05a';
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(player.angle) * cs * 0.9, py + Math.sin(player.angle) * cs * 0.9);
    ctx.lineTo(px + Math.cos(player.angle + 2.5) * cs * 0.6, py + Math.sin(player.angle + 2.5) * cs * 0.6);
    ctx.lineTo(px + Math.cos(player.angle - 2.5) * cs * 0.6, py + Math.sin(player.angle - 2.5) * cs * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
