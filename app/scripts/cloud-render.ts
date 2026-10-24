// Splits a video's render across parallel GitHub Actions runs. The runners have no GPU, so one machine renders the
// 3D studio format far too slowly (~20 s a frame); this packs the scene state into a release asset, dispatches
// .github/workflows/render-part.yml once per part, waits for every part's mp4, then joins them with the soundtrack.
// Used by scripts/auto.ts in the cloud when ECHO_RENDER_PARTS is set.
//
//   bun scripts/cloud-render.ts --parts 12 --out file.mp4
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appDir } from './app';

const argv = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const parts = Math.max(1, Number(opt('parts', '12')));
const out = resolve(opt('out', join(appDir, '..', 'out', 'auto', 'cloud.mp4'))!);
const RELEASE = 'renders';
const job = `${Date.now()}`;
const tmp = join(appDir, '..', 'out', `cloud-${job}`);
mkdirSync(tmp, { recursive: true });

function gh(args: string[], ok = false) {
  const r = spawnSync('gh', args, { encoding: 'utf8', cwd: appDir });
  if (r.status !== 0 && !ok) throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || r.stdout).slice(0, 300)}`);
  return r.status === 0 ? r.stdout : '';
}
const assets = () => {
  try {
    return (JSON.parse(gh(['release', 'view', RELEASE, '--json', 'assets'], true) || '{"assets":[]}').assets as { name: string }[]).map((a) => a.name);
  } catch {
    return [];
  }
};

// 1. the scene, exactly as auto.ts left it
if (!gh(['release', 'view', RELEASE], true))
  gh(['release', 'create', RELEASE, '--title', 'Render parts (temporary)', '--notes', 'Scratch space for split cloud renders; emptied after each video.', '--prerelease']);
const paths = [
  'src/scenes/auto/storyboard.json', 'src/scenes/auto/voice.json', 'src/scenes/auto/voice.gen.json', 'src/scenes/auto/sim.gen.js',
  'src/scenes/auto/model.gen.js', 'src/scenes/auto/studio.gen.json', 'public/voice/auto', 'public/auto/broll', 'public/auto/photos',
].filter((p) => existsSync(join(appDir, p)));
const tgz = join(tmp, `job-${job}.tgz`);
const tar = spawnSync('tar', ['-czf', tgz, ...paths], { cwd: appDir, stdio: 'inherit' });
if (tar.status !== 0) throw new Error('could not pack the scene');
gh(['release', 'upload', RELEASE, tgz, '--clobber']);

// 2. one run per part
const dispatch = (k: number) => gh(['workflow', 'run', 'render-part.yml', '-f', `job=${job}`, '-f', `part=${k}`, '-f', `parts=${parts}`]);
for (let k = 0; k < parts; k++) dispatch(k);
console.log(`  dispatched ${parts} render parts (job ${job})`);

// 3. wait for them (a part that hasn't arrived after 100 min is dispatched once more)
const name = (k: number) => `job-${job}-part-${k}.mp4`;
const t0 = Date.now();
let retried = false;
let last = -1;
for (;;) {
  const have = new Set(assets());
  const done = [...Array(parts).keys()].filter((k) => have.has(name(k)));
  if (done.length !== last) console.log(`  render parts done: ${done.length}/${parts}`);
  last = done.length;
  if (done.length === parts) break;
  const min = (Date.now() - t0) / 60000;
  if (min > 100 && !retried) {
    retried = true;
    for (let k = 0; k < parts; k++) if (!have.has(name(k))) dispatch(k);
    console.log('  some parts are late: dispatched them again');
  }
  if (min > 200) throw new Error(`render parts missing after ${min.toFixed(0)} min`);
  await Bun.sleep(30_000);
}

// 4. join them with the soundtrack
for (let k = 0; k < parts; k++) gh(['release', 'download', RELEASE, '-p', name(k), '-D', tmp, '--clobber']);
writeFileSync(join(tmp, 'list.txt'), [...Array(parts).keys()].map((k) => `file '${join(tmp, name(k)).split('\\').join('/')}'`).join('\n') + '\n');
const wav = join(appDir, 'public', 'audio', 'auto.wav');
const ff = spawnSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), ...(existsSync(wav) ? ['-i', wav, '-c:a', 'aac', '-b:a', '320k', '-shortest'] : []), '-c:v', 'copy', '-movflags', '+faststart', out],
  { stdio: 'inherit' },
);
if (ff.status !== 0) throw new Error('could not join the render parts');
console.log(`wrote ${out} (${parts} parts, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);

// 5. tidy the scratch release
for (const a of assets()) if (a.startsWith(`job-${job}`)) gh(['release', 'delete-asset', RELEASE, a, '-y'], true);
rmSync(tmp, { recursive: true, force: true });
