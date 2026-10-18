// ElevenLabs narration. Speaks each line of app/src/scenes/<video>/voice.json with the voice and
// model under "elevenlabs", writes 48 kHz mono clips to app/public/voice/<video>/elevenlabs/, records
// their lengths in voice.gen.json, and switches the video's "engine" to "elevenlabs".
//
// Credits are precious on the free plan, so lines are cached: only new or changed lines are sent.
//
//   bun scripts/voice.ts [--video rutherford] [--dry-run] [--only id,id] [--force]
//
// Needs ELEVENLABS_API_KEY in the environment (ElevenLabs → Profile → API Keys).
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appDir } from './app';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const video = opt('video') ?? 'rutherford';
const dryRun = argv.includes('--dry-run');
const force = argv.includes('--force');
const only = opt('only')?.split(',');

const sceneDir = resolve(appDir, 'src', 'scenes', video);
const cfgPath = join(sceneDir, 'voice.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const el: { voiceId: string; voiceName?: string; modelId: string; languageCode?: string } = cfg.elevenlabs;
const lines: Record<string, { text: string; say?: string }> = cfg.lines;
const outDir = resolve(appDir, 'public', 'voice', video, 'elevenlabs');
const cachePath = join(sceneDir, 'voice.cache.json');
const genPath = join(sceneDir, 'voice.gen.json');
const cache: Record<string, string> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const gen: Record<string, Record<string, number>> = existsSync(genPath) ? JSON.parse(readFileSync(genPath, 'utf8')) : {};
const durations: Record<string, number> = gen.elevenlabs ?? {};

/** What the voice reads: `say`, else the caption text without *highlight* markers. [tags] are kept for v3+ models. */
const spoken = (id: string) => (lines[id].say ?? lines[id].text).replace(/\*/g, '');
const key = (id: string) => createHash('sha1').update([el.voiceId, el.modelId, el.languageCode ?? '', spoken(id)].join('|')).digest('hex');

const todo = Object.keys(lines).filter((id) => {
  if (only && !only.includes(id)) return false;
  if (force) return true;
  return cache[id] !== key(id) || !existsSync(join(outDir, `${id}.wav`));
});
const chars = todo.reduce((n, id) => n + spoken(id).length, 0);
console.log(`${video}: ${Object.keys(lines).length} lines, ${todo.length} to generate (${chars} characters ≈ credits)`);
console.log(`voice: ${el.voiceName ?? el.voiceId} (${el.voiceId}), model: ${el.modelId}`);
if (dryRun) {
  for (const id of todo) console.log(`  ${id.padEnd(11)} ${spoken(id).length.toString().padStart(4)}  ${spoken(id)}`);
  process.exit(0);
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error(
    '\nELEVENLABS_API_KEY is not set.\n' +
      '  1. ElevenLabs → Profile → API Keys → Create, copy the key\n' +
      '  2. PowerShell:  setx ELEVENLABS_API_KEY "your-key"\n' +
      '  3. Open a new terminal (or restart VS Code) and run this again.\n',
  );
  process.exit(1);
}

const client = new ElevenLabsClient();
mkdirSync(outDir, { recursive: true });

if (todo.length) {
  try {
    const sub = await client.user.subscription.get();
    const left = sub.characterLimit - sub.characterCount;
    console.log(`credits: ${left} of ${sub.characterLimit} left this period`);
    if (left < chars) {
      console.error(`Not enough credits for ${chars} characters. Use --only to generate some lines, or wait for the reset.`);
      process.exit(1);
    }
  } catch {
    console.warn('(could not read remaining credits; continuing)');
  }
}

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
const trimTail = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,adelay=30,apad=pad_dur=0.1';

let used = 0;
for (const id of todo) {
  const text = spoken(id);
  process.stdout.write(`  ${id.padEnd(11)} `);
  let audio: ReadableStream<Uint8Array>;
  try {
    audio = await client.textToSpeech.convert(el.voiceId, {
      text,
      modelId: el.modelId,
      ...(el.languageCode ? { languageCode: el.languageCode } : {}),
      outputFormat: 'mp3_44100_128',
    });
  } catch (e: any) {
    const body = e?.body ? JSON.stringify(e.body) : '';
    console.error(`\nElevenLabs refused "${id}": ${e?.statusCode ?? ''} ${e?.message ?? e} ${body}`);
    break;
  }
  const chunks: Uint8Array[] = [];
  const reader = audio.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const mp3 = join(outDir, `${id}.mp3`);
  writeFileSync(mp3, Buffer.concat(chunks));
  const wav = join(outDir, `${id}.wav`);
  ff(['-i', mp3, '-af', trimTail, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  rmSync(mp3);
  durations[id] = Math.round(((statSync(wav).size - 44) / 2 / 48000) * 1000) / 1000;
  cache[id] = key(id);
  used += text.length;
  console.log(`${durations[id].toFixed(2)}s  ${text}`);
  // save as we go, so an interruption doesn't waste credits
  writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
  gen.elevenlabs = durations;
  writeFileSync(genPath, JSON.stringify(gen, null, 2) + '\n');
}

const missing = Object.keys(lines).filter((id) => !existsSync(join(outDir, `${id}.wav`)));
console.log(`used ~${used} credits`);
if (missing.length) {
  console.log(`${missing.length} line(s) still missing: ${missing.join(', ')}. The video keeps its current voice until all are done.`);
} else if (cfg.engine !== 'elevenlabs') {
  writeFileSync(cfgPath, readFileSync(cfgPath, 'utf8').replace(/"engine":\s*"[^"]*"/, '"engine": "elevenlabs"'));
  console.log('all lines ready: voice.json now uses "engine": "elevenlabs". Run `bun run sound` to remix.');
} else {
  console.log('all lines ready. Run `bun run sound` to remix.');
}
