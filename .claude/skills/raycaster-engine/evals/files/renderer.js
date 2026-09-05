// renderer.js — first-person view for my maze game
// map is a 2D array of ints, 0 = floor, >0 = wall texture id
// sprites is [{x, y, tex}], textures is [{w, h, data: Uint8ClampedArray}]

export function renderFrame(ctx, map, player, sprites, textures) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);

  // sky and floor
  for (let y = 0; y < H / 2; y++) {
    for (let x = 0; x < W; x++) buf[y * W + x] = (0x38 << 24) | (0x38 << 16) | (0x50 << 8) | 0xff;
  }
  for (let y = H / 2; y < H; y++) {
    for (let x = 0; x < W; x++) buf[y * W + x] = (0x50 << 24) | (0x48 << 16) | (0x40 << 8) | 0xff;
  }

  const fov = Math.PI / 3;

  for (let x = 0; x < W; x++) {
    // one ray per column, angle swept uniformly across the fov
    const rayAngle = player.angle - fov / 2 + (x / W) * fov;
    const rayDirX = Math.cos(rayAngle);
    const rayDirY = Math.sin(rayAngle);

    // step along the ray until we hit a wall
    let t = 0;
    let hit = 0;
    let hx = player.x;
    let hy = player.y;
    while (t < 40 && hit === 0) {
      t += 0.01;
      hx = player.x + rayDirX * t;
      hy = player.y + rayDirY * t;
      const cx = Math.floor(hx);
      const cy = Math.floor(hy);
      if (cy < 0 || cy >= map.length || cx < 0 || cx >= map[0].length) break;
      hit = map[cy][cx];
    }
    if (!hit) continue;

    const dist = Math.sqrt((hx - player.x) ** 2 + (hy - player.y) ** 2);
    const lineHeight = Math.floor(H / dist);
    const drawStart = Math.max(0, Math.floor(H / 2 - lineHeight / 2));
    const drawEnd = Math.min(H, Math.floor(H / 2 + lineHeight / 2));

    const tex = textures[hit - 1];
    const wallX = (hx - Math.floor(hx)) + (hy - Math.floor(hy));
    const texX = Math.floor(wallX * tex.w) % tex.w;

    for (let y = drawStart; y < drawEnd; y++) {
      const texY = Math.floor(((y - drawStart) / lineHeight) * tex.h) % tex.h;
      const o = (texY * tex.w + texX) * 4;
      const r = tex.data[o], g = tex.data[o + 1], b = tex.data[o + 2];
      buf[y * W + x] = (r << 24) | (g << 16) | (b << 8) | 0xff;
    }
  }

  // sprites
  for (const s of sprites) {
    const dx = s.x - player.x;
    const dy = s.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let a = Math.atan2(dy, dx) - player.angle;
    while (a < -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    if (Math.abs(a) > fov) continue;
    const screenX = Math.floor((0.5 + a / fov) * W);
    const size = Math.floor(H / dist);
    const tex = textures[s.tex];
    for (let sx = 0; sx < size; sx++) {
      const px = screenX - Math.floor(size / 2) + sx;
      if (px < 0 || px >= W) continue;
      for (let sy = 0; sy < size; sy++) {
        const py = Math.floor(H / 2 - size / 2) + sy;
        if (py < 0 || py >= H) continue;
        const o = (Math.floor((sy / size) * tex.h) * tex.w + Math.floor((sx / size) * tex.w)) * 4;
        if (tex.data[o + 3] === 0) continue;
        buf[py * W + px] = (tex.data[o] << 24) | (tex.data[o + 1] << 16) | (tex.data[o + 2] << 8) | 0xff;
      }
    }
  }

  ctx.putImageData(img, 0, 0);
}
