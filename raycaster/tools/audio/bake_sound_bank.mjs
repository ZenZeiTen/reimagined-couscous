#!/usr/bin/env node
/**
 * Pre-render the game's sound bank with ElevenLabs so the browser never needs
 * an API key. Reads tools/audio/sound_bank.spec.json, writes MP3s and a
 * manifest.json into public/audio/bank/.
 *
 *   ELEVENLABS_API_KEY=... node tools/audio/bake_sound_bank.mjs [--only pistol_fire,voice:intro] [--force] [--dry-run]
 *
 * Cache keys use the same request hashing as src/audio/AudioCache.ts, so files
 * are only regenerated when their prompt, voice or format changes.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function parseArgs(argv) {
  const out = { spec: path.join(here, 'sound_bank.spec.json'), out: path.join(root, 'public', 'audio', 'bank'), only: null, force: false, dryRun: false, concurrency: 2, apiKey: process.env.ELEVENLABS_API_KEY ?? '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--spec') out.spec = path.resolve(next());
    else if (a === '--out') out.out = path.resolve(next());
    else if (a === '--only') out.only = new Set(next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--concurrency') out.concurrency = Math.max(1, Number(next()) || 1);
    else if (a === '--api-key') out.apiKey = next();
    else if (a === '--help' || a === '-h') {
      console.log('Usage: bake_sound_bank.mjs [--spec file] [--out dir] [--only a,b] [--force] [--dry-run] [--concurrency n] [--api-key key]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

/** Mirror of hashRequest() in src/audio/AudioCache.ts. */
function hashRequest(parts) {
  const json = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash('sha256').update(json).digest('hex');
}

function sfxKey(spec, outputFormat) {
  return { kind: 'sfx', text: spec.prompt, durationSeconds: spec.durationSeconds ?? null, promptInfluence: spec.promptInfluence ?? null, outputFormat };
}

function voiceKey(spec, defaults) {
  return { kind: 'voice', text: spec.text, voiceId: spec.voiceId ?? defaults.voiceId, modelId: spec.modelId ?? defaults.modelId, outputFormat: defaults.outputFormat };
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function requestAudio(url, apiKey, body, attempt = 0) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const text = await res.text().catch(() => '');
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
    return requestAudio(url, apiKey, body, attempt + 1);
  }
  throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 300)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = JSON.parse(await readFile(args.spec, 'utf8'));
  const defaults = { voiceId: spec.defaultVoiceId, modelId: spec.defaultModelId, outputFormat: spec.outputFormat };
  const base = 'https://api.elevenlabs.io';

  await mkdir(args.out, { recursive: true });
  const manifestPath = path.join(args.out, 'manifest.json');
  let manifest = { version: 1, generatedAt: '', entries: {} };
  if (await exists(manifestPath)) {
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.entries ??= {};
    } catch {
      manifest = { version: 1, generatedAt: '', entries: {} };
    }
  }

  const jobs = [];
  for (const [name, s] of Object.entries(spec.sounds ?? {})) {
    const body = { text: s.prompt };
    if (s.durationSeconds !== undefined) body.duration_seconds = s.durationSeconds;
    if (s.promptInfluence !== undefined) body.prompt_influence = s.promptInfluence;
    jobs.push({ name, kind: 'sfx', hash: hashRequest(sfxKey(s, defaults.outputFormat)), url: `${base}/v1/sound-generation?output_format=${encodeURIComponent(defaults.outputFormat)}`, body, file: `${name}.mp3` });
  }
  for (const [id, v] of Object.entries(spec.voices ?? {})) {
    const name = `voice:${id}`;
    const voiceId = v.voiceId ?? defaults.voiceId;
    jobs.push({ name, kind: 'voice', hash: hashRequest(voiceKey(v, defaults)), url: `${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(defaults.outputFormat)}`, body: { text: v.text, model_id: v.modelId ?? defaults.modelId }, file: `voice_${id}.mp3` });
  }

  const selected = jobs.filter((j) => !args.only || args.only.has(j.name));
  const todo = [];
  let skipped = 0;
  for (const j of selected) {
    const entry = manifest.entries[j.name];
    const fresh = entry && entry.hash === j.hash && (await exists(path.join(args.out, entry.file)));
    if (fresh && !args.force) {
      skipped++;
      continue;
    }
    todo.push(j);
  }
  console.log(`[bake] ${selected.length} selected, ${skipped} up to date, ${todo.length} to generate`);
  if (args.dryRun) {
    for (const j of todo) console.log(`  would generate ${j.name} → ${j.file}`);
    return;
  }
  if (todo.length > 0 && !args.apiKey) {
    console.error('ELEVENLABS_API_KEY is required (env or --api-key)');
    process.exit(2);
  }

  const failures = [];
  let index = 0;
  const worker = async () => {
    while (index < todo.length) {
      const j = todo[index++];
      try {
        process.stdout.write(`[bake] generating ${j.name} ... `);
        const bytes = await requestAudio(j.url, args.apiKey, j.body);
        await writeFile(path.join(args.out, j.file), bytes);
        manifest.entries[j.name] = { file: j.file, mimeType: 'audio/mpeg', hash: j.hash, kind: j.kind };
        manifest.generatedAt = new Date().toISOString();
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`${(bytes.length / 1024).toFixed(1)} KiB`);
      } catch (err) {
        console.log('FAILED');
        failures.push({ name: j.name, error: String(err instanceof Error ? err.message : err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.concurrency, todo.length) }, worker));

  if (failures.length) {
    console.error(`[bake] ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  ${f.name}: ${f.error}`);
    process.exit(1);
  }
  console.log(`[bake] manifest written to ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
