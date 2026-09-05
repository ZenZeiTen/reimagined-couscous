#!/usr/bin/env node
/**
 * Headless smoke test + screenshots with Playwright (Chromium, SwiftShader WebGL2).
 *   node tools/screenshot.js [outDir]
 * Serves the project, boots the game, skips the prologue, teleports to a set of viewpoints, screenshots each, runs the
 * validators, and fails (exit 1) on any page error. Requires the global playwright install this repo's CI image has, or `npm i -D playwright`.
 */
const path = require('path'); const fs = require('fs'); const http = require('http');
const ROOT = path.join(__dirname, '..'); const OUT = process.argv[2] || path.join(ROOT, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const VIEWS = [
  ['shore', -30, 0, 0, -Math.PI / 2, 0], ['cinder', -25.2, 0, 3.4, Math.PI, 0.05], ['garrick', -17.5, 0, 6.0, -Math.PI / 2, 0], ['pier_mael', -36.2, 0.15, 0.3, Math.PI / 2, 0],
  ['wreck', -28, 0, -6.5, Math.PI / 2, 0], ['stair', -21, 0, -9, 0, -0.2], ['cloister', -22, -3, -18, 0, 0], ['aldous', -29.4, -3, -20.5, Math.PI / 2, 0], ['altar', -22, -3, -27.5, 0, 0],
  ['hall', -7, 0, 0, -Math.PI / 2, 0], ['sentry', -1, 0, 3.2, -Math.PI / 2, 0], ['ledge', 9.2, 0, -0.4, -Math.PI / 2, 0], ['cistern', -1.5, -3, 1, Math.PI / 2, 0],
  ['sepulchre', -10, -9, -7, 0, 0], ['throne', -10, -9, -10.2, 0, 0.1], ['shrine', -32, 0, -11.2, 0, 0], ['moongate', -10, -9, -17, 0, 0.15]
];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = []; const seen = new Set(); const add = s => { const k = s.split('\n')[0]; if (!seen.has(k)) { seen.add(k); errors.push(s.split('\n').slice(0, 3).join('\n')); } }; page.on('pageerror', e => add('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') add('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html`); await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, '00_logo_or_prologue.png') });
  /* the studio card leaves on its own after 3 s into the prologue; skip it after the grace period */
  await page.waitForTimeout(2500); await page.keyboard.press('Space'); await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, '01_title.png') });
  await page.keyboard.press('Space'); await page.waitForTimeout(600); await page.keyboard.press('Enter'); await page.waitForTimeout(900);   // New Oath
  await page.screenshot({ path: path.join(OUT, '02_oath.png') });
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);                                                                    // SWEAR
  await page.screenshot({ path: path.join(OUT, '03_play_start.png') });
  const val = await page.evaluate(() => { const r = window.__vareth.mapCheck(); return { v: r.v.text, a: r.a.text, ok: r.v.ok && r.a.ok }; });
  console.log(val.v + '\n' + val.a);
  for (const [name, x, y, z, yaw, pitch] of VIEWS) {
    await page.evaluate(([x, y, z, yaw, pitch]) => { const p = window.__vareth.G.player; p.x = x; p.z = z; p.y = y; p.yaw = yaw; p.pitch = pitch; p.vx = p.vz = p.vy = 0; window.__vareth.G.hooks.resetZone(); }, [x, y, z, yaw, pitch]);
    await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `10_${name}.png`) });
  }
  /* the pause menu, the dialogue box, and a cutscene */
  await page.keyboard.press('KeyM'); await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, '20_menu.png') });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(200); await page.screenshot({ path: path.join(OUT, '21_menu_equip.png') }); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate(() => { const p = window.__vareth.G.player; p.x = -25.2; p.z = 3.6; p.y = 0; p.yaw = 0; window.__vareth.G.hooks.talk('cinder'); }); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '22_dialogue.png') });
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(200); }
  await page.evaluate(() => window.__vareth.G.hooks.cutscene('aldous')); await page.waitForTimeout(2500); await page.screenshot({ path: path.join(OUT, '23_cutscene.png') });
  await page.waitForTimeout(3000); await page.keyboard.press('Space'); await page.waitForTimeout(500);
  await page.evaluate(() => { const G = window.__vareth.G, p = G.player; p.x = -10; p.z = -8; p.y = -9; p.yaw = 0; G.flags.king_woke = true; G.hooks.resetZone(); }); await page.waitForTimeout(2500); await page.screenshot({ path: path.join(OUT, '24_boss.png') });
  await page.evaluate(() => { const G = window.__vareth.G, p = G.player; p.x = -30.5; p.z = 4.2; p.y = 0; p.yaw = Math.PI; G.hooks.resetZone(); }); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(OUT, '25_crawler.png') });
  const state = await page.evaluate(() => { const G = window.__vareth.G; return { mode: G.mode, flags: Object.keys(G.flags), inv: G.player.inv.map(e => e.id + 'x' + e.qty), enemies: G.enemies.map(e => e.type + ':' + e.state) }; });
  console.log(JSON.stringify(state));
  await browser.close(); server.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log((val.ok ? 'validators PASS' : 'validators FAIL') + ' — screenshots in ' + OUT); if (!val.ok) process.exit(2);
})().catch(e => { console.error(e); process.exit(1); });
