// Re-renders a finished generated video from its saved bundle (out/auto/<name>.bundle), e.g. after an
// engine fix, without making a new script, voice or model. Takes the same lock as scripts/auto.ts, so it
// never mixes with a video being made, and puts the scene files back exactly as that video had them.
//
//   bun scripts/rerender.ts <name>            (out/auto/<name>.mp4)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appDir, outRoot } from './app';

const name = process.argv[2]?.replace(/\.mp4$/, '');
if (!name) {
  console.error('usage: bun scripts/rerender.ts <video name in out/auto>');
  process.exit(1);
}
const bundle = join(outRoot, 'auto', `${name}.bundle`);
if (!existsSync(bundle)) {
  console.error(`no bundle at ${bundle}`);
  process.exit(1);
}

const LOCK = join(outRoot, 'auto.lock');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
for (let waited = 0; existsSync(LOCK); waited += 30) {
  const [pid, since] = readFileSync(LOCK, 'utf8').split(' ').map(Number);
  if (!alive(pid) || Date.now() - since > 2 * 3600_000) break;
  if (waited === 0) console.log('a video is being made; waiting for it to finish...');
  await Bun.sleep(30_000);
}
writeFileSync(LOCK, `${process.pid} ${Date.now()}`);
process.on('exit', () => rmSync(LOCK, { force: true }));

const SCENES = join(appDir, 'src', 'scenes', 'auto');
for (const f of ['storyboard.json', 'voice.json', 'voice.gen.json', 'model.gen.js', 'sim.gen.js']) {
  rmSync(join(SCENES, f), { force: true });
  if (existsSync(join(bundle, f))) cpSync(join(bundle, f), join(SCENES, f));
}
const VOICE = join(appDir, 'public', 'voice', 'auto');
rmSync(VOICE, { recursive: true, force: true });
cpSync(join(bundle, 'voice'), VOICE, { recursive: true });
mkdirSync(join(appDir, 'public', 'audio'), { recursive: true });
cpSync(join(bundle, 'auto.wav'), join(appDir, 'public', 'audio', 'auto.wav'));
const BROLL = join(appDir, 'public', 'auto', 'broll');
rmSync(BROLL, { recursive: true, force: true });
if (existsSync(join(bundle, 'broll'))) cpSync(join(bundle, 'broll'), BROLL, { recursive: true });
const PHOTOS = join(appDir, 'public', 'auto', 'photos');
rmSync(PHOTOS, { recursive: true, force: true });
if (existsSync(join(bundle, 'photos'))) cpSync(join(bundle, 'photos'), PHOTOS, { recursive: true });

const out = join(outRoot, 'auto', `${name}.mp4`);
const r = spawnSync('bun', ['scripts/render.ts', 'video', '--video', 'auto', '--samples', '2', '--crf', '16', '--out', out], { cwd: appDir, stdio: 'inherit' });
process.exit(r.status ?? 1);
