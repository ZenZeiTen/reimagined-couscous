#!/usr/bin/env node
/** One-shot checks: syntax of every module, the model bake, the headless playthrough, then screenshots + validators. */
const { execSync, spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..'); let bad = 0;
const run = (label, cmd, args) => { const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' }); console.log((r.status === 0 ? '✔ ' : '✘ ') + label); if (r.status !== 0) bad++; };
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
for (const f of walk(path.join(ROOT, 'src'))) { const r = spawnSync('node', ['--check', f], { stdio: 'pipe' }); if (r.status !== 0) { console.log('✘ syntax ' + f + '\n' + r.stderr); bad++; } }
console.log('✔ syntax (' + walk(path.join(ROOT, 'src')).length + ' modules)');
run('bake models', 'python3', ['tools/bake_models.py']);
run('playthrough', 'node', ['tools/playthrough.cjs']);
run('screenshots + validators', 'node', ['tools/screenshot.cjs', process.argv[2] || path.join(ROOT, 'shots')]);
process.exit(bad ? 1 : 0);
