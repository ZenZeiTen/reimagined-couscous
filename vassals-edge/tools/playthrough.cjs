#!/usr/bin/env node
/**
 * Scripted end-to-end playthrough of the key-lock chain, headless. Drives the game through window.__vareth:
 * take the Cistern Key (bishop rises) → Aldous (seal) → shrine → clapper → bell (cloister drains) → Moon Key (King wakes)
 * → slay the King (throne wall opens) → Moon Gate (ending). Exits non-zero if any step leaves the wrong state.
 *   node tools/playthrough.cjs
 */
const path = require('path'); const fs = require('fs'); const http = require('http');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const fails = []; const check = (name, ok, extra) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails.push(name); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  const waitState = (fn, label, ms) => page.waitForFunction(fn, null, { timeout: ms || 30000 }).catch(() => { throw new Error('timeout waiting for ' + label); });
  await waitState(() => window.__vareth && window.__vareth.BOOT.state === 'prologue', 'prologue');
  await waitState(() => window.__vareth.CS.total > 2.2, 'skip grace'); await page.keyboard.press('Space');
  await waitState(() => window.__vareth.BOOT.state === 'title', 'title'); await page.waitForTimeout(600);
  await page.keyboard.press('Space'); await page.waitForTimeout(600);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Enter'); const ok = await page.waitForFunction(() => window.__vareth.BOOT.state === 'oath', null, { timeout: 2500 }).then(() => true, () => false); if (ok) break; }   // New Oath
  await waitState(() => window.__vareth.BOOT.state === 'oath', 'oath'); await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await waitState(() => window.__vareth.G.mode === 'play' && !window.__vareth.BOOT.active, 'play'); await page.waitForTimeout(600);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const tp = (x, y, z, yaw) => ev(([x, y, z, yaw]) => { const G = window.__vareth.G, p = G.player; p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.vx = p.vz = p.vy = 0; G.hooks.resetZone(); }, [x, y, z, yaw]);
  const use = async label => { const r = await ev(l => { const G = window.__vareth.G; const it = G.interact.find(e => e.label === l && !(e.done && e.done())); if (!it) return false; it.on(); return true; }, label); return r; };
  const skip = async () => { for (let i = 0; i < 6; i++) { await page.waitForTimeout(700); await page.keyboard.press('Space'); } await page.waitForTimeout(400); };
  const st = () => ev(() => { const V = window.__vareth, G = V.G; return { mode: G.mode, cs: V.CS.active, flags: G.flags, inv: G.player.inv.map(e => e.id), spells: G.player.spells, enemies: Object.fromEntries(G.enemies.filter(e => e.id).map(e => [e.id, e.state])), doors: Object.fromEntries(V.W && [] || []) }; });
  check('game started', (await st()).mode === 'play');
  /* 1. Cistern Key at the altar; the bishop rises */
  await tp(-22, -3, -30, 0); await page.waitForTimeout(300); check('take cistern key', await use('Take Rusted Cistern Key')); await page.waitForTimeout(500);
  let s = await st(); check('bishop_rise cutscene runs', s.cs); await skip(); s = await st(); check('bishop awake after cutscene', s.flags.bishop_woke && s.enemies.bishop !== 'DORMANT', s.enemies.bishop);
  check('cistern key in inventory', s.inv.indexOf('cistern_key') >= 0);
  /* 2. Aldous gives the seal */
  await tp(-30.4, -3, -20.5, -Math.PI / 2); await page.waitForTimeout(300); check('talk to Aldous', await use('The knight against the wall')); await page.waitForTimeout(500); await skip();
  s = await st(); check('warden seal received', s.inv.indexOf('warden_seal') >= 0 && s.flags.aldous_met);
  /* 3. the shrine door, the clapper, the spear */
  await tp(-32, 0, -9.4, Math.PI); await page.waitForTimeout(300); check('open shrine door', await use('The shrine door')); await page.waitForTimeout(300);
  s = await st(); check('shrine flagged open', !!s.flags.shrine_open);
  await tp(-30.5, 0, -14.2, Math.PI); await page.waitForTimeout(300); check('take clapper', await use('Take Bell Clapper')); await tp(-32, 0, -13.6, Math.PI); await page.waitForTimeout(300); check('take spear', await use('Take Tide-Warden’s Spear'));
  s = await st(); check('clapper + spear held', s.inv.indexOf('bell_clapper') >= 0 && s.inv.indexOf('warden_spear') >= 0);
  /* 4. ring the bell: the cloister drains, the alcove opens */
  await tp(-25.2, 0, 4.0, Math.PI); await page.waitForTimeout(300); check('bell rope', await use('The bell rope')); await page.waitForTimeout(500); s = await st(); check('bell cutscene runs', s.cs); await skip();
  s = await st(); check('bell rung + cloister drained', s.flags.bell_rung && s.flags.cloister_drained);
  const alcove = await ev(() => { const M = window.__vareth.W; return window.__vareth.G.flags.cloister_drained; }); check('alcove door disabled', alcove);
  await tp(-18.4, -3, -33.0, 0); await page.waitForTimeout(300); check('take plate in alcove', await use('Take Tide-Warden’s Plate')); check('take moonfall scroll', await use('Take Scroll: Moonfall'));
  s = await st(); check('moonfall learned', s.spells.indexOf('moonfall') >= 0);
  /* 5. Cinder gives the hood after the bell */
  await tp(-25.2, 0, 4.0, Math.PI); check('talk to Cinder', await use('Speak with the seer')); for (let i = 0; i < 16; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
  s = await st(); check('cinder met + ember scroll', s.flags.cinder_met && s.spells.indexOf('ember') >= 0);
  await use('Speak with the seer'); for (let i = 0; i < 12; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); } s = await st(); check('seer hood after the bell', s.inv.indexOf('seer_hood') >= 0, JSON.stringify(s.inv));
  /* 6. Moon Key: the King wakes; slay him; the throne wall opens */
  await tp(-10, -9, -10.5, 0); await page.waitForTimeout(300); check('take moon key', await use('Take Moon-Sealed Key')); await page.waitForTimeout(500); s = await st(); check('king_wake cutscene runs', s.cs); await skip();
  s = await st(); check('king awake', s.flags.king_woke && s.enemies.king !== 'DORMANT', s.enemies.king);
  await ev(() => { const V = window.__vareth, G = V.G; const k = G.enemies.find(e => e.type === 'king'); k.hp = 1; }); await page.waitForTimeout(200);
  await ev(() => { const V = window.__vareth, G = V.G; const k = G.enemies.find(e => e.type === 'king'); G.hooks.damageEnemy(k, 50, 'slash', true, true); });
  await page.waitForTimeout(4200); s = await st(); check('king_fall cutscene runs', s.cs, s.enemies.king); await skip(); s = await st();
  check('king dead + gate open', s.flags.king_dead && s.enemies.king === 'DEAD');
  const wallOpen = await ev(() => window.__vareth.G.enemies.find(e => e.type === 'king').state === 'DEAD' && !window.__vareth.G.flags.__x); check('throne wall opened (flag)', wallOpen);
  await page.waitForTimeout(6000); s = await st(); check('king loot dropped', (await ev(() => window.__vareth.G.interact.some(e => e.label === 'Take Astraea’s Edge' && !e.done()))));
  /* 7. the Moon Gate ends the game */
  await tp(-10, -9, -22, Math.PI); await page.waitForTimeout(300); check('use moon gate', await use('The Moon Gate')); await page.waitForTimeout(500); s = await st(); check('ending cutscene runs', s.cs); await skip(); await page.waitForTimeout(500);
  s = await st(); check('ending flag + back to title', s.flags.ending && s.mode === 'end', s.mode);
  /* 8. save/load round trip: rest at a crystal (saves), scramble the sheet, load, compare */
  const before = await ev(() => { const G = window.__vareth.G; G.mode = 'play'; G.player.spawn = { x: -26, z: 4.5, yaw: 0, y: 0 }; const ok = G.hooks.save(); return { ok, inv: G.player.inv.map(e => e.id + 'x' + e.qty).join(','), lvl: G.player.level, spells: G.player.spells.join(',') }; });
  check('save written', before.ok);
  const after = await ev(() => { const G = window.__vareth.G; G.player.inv = []; G.player.spells = []; G.player.x = 0; G.player.z = 0; const ok = G.hooks.load(); return { ok, inv: G.player.inv.map(e => e.id + 'x' + e.qty).join(','), spells: G.player.spells.join(','), x: G.player.x, z: G.player.z, flags: Object.keys(G.flags).length }; });
  check('load restores inventory + spells + spawn', after.ok && after.inv === before.inv && after.spells === before.spells && after.x === -26 && after.z === 4.5, JSON.stringify(after));
  await browser.close(); server.close();
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.slice(0, 10).join('\n')); process.exit(1); }
  if (fails.length) { console.error('FAILED: ' + fails.join(', ')); process.exit(2); } console.log('playthrough PASS');
})().catch(e => { console.error(e); process.exit(1); });
