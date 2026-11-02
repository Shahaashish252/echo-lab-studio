// Renders the exported studio stage (scripts/export-blender.ts) photo-real with Blender Cycles on Kaggle's free GPUs
// (2 x Tesla T4, ~30 h a week): uploads scene.glb + anim.json + render_studio.py as a private dataset version, runs
// blender/kaggle_render.py as a private GPU notebook, waits, and downloads what it made (blender.mp4, or preview PNGs).
// Needs the Kaggle CLI (pip install kaggle) with KAGGLE_USERNAME + KAGGLE_API_TOKEN (or KAGGLE_KEY).
//
//   bun scripts/kaggle-render.ts --in out/blender --out out/blender/result [--samples 64] [--step 1]
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appDir } from './app';

const argv = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const input = resolve(opt('in', join(appDir, '..', 'out', 'blender'))!);
const output = resolve(opt('out', join(input, 'result'))!);
const user = process.env.KAGGLE_USERNAME;
if (!user) throw new Error('KAGGLE_USERNAME is not set');
const env = { ...process.env, KAGGLE_API_TOKEN: process.env.KAGGLE_API_TOKEN || process.env.KAGGLE_KEY || '' };
const DATASET = `${user}/echo-lab-render-job`;
const KERNEL = `${user}/echo-lab-render`;
const blenderDir = join(appDir, '..', 'blender');

function kaggle(args: string[], cwd?: string, ok = false) {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync('kaggle', args, { cwd, env, encoding: 'utf8' });
    const outp = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (r.status === 0 || ok) return outp;
    if (attempt >= 4) throw new Error(`kaggle ${args.slice(0, 2).join(' ')} failed: ${outp.slice(-400)}`);
    console.log(`  kaggle ${args[0]} ${args[1]} hiccup, retrying (${outp.trim().split('\n').pop()?.slice(0, 120)})`);
    spawnSync('sleep', [String(15 * attempt)]);
  }
}

// 1. the job as a private dataset (a new version of the same dataset each time)
const job = join(input, '_kaggle_job');
rmSync(job, { recursive: true, force: true });
mkdirSync(job, { recursive: true });
for (const f of ['scene.glb', 'anim.json']) copyFileSync(join(input, f), join(job, f));
copyFileSync(join(blenderDir, 'render_studio.py'), join(job, 'render_studio.py'));
writeFileSync(join(job, 'job.json'), JSON.stringify({ samples: Number(opt('samples', '64')), step: Number(opt('step', '1')) }));
writeFileSync(join(job, 'dataset-metadata.json'), JSON.stringify({ title: 'echo-lab-render-job', id: DATASET, licenses: [{ name: 'CC0-1.0' }] }));
const exists = kaggle(['datasets', 'status', DATASET], undefined, true).toLowerCase().includes('ready');
if (exists) kaggle(['datasets', 'version', '-p', '.', '-m', `job ${Date.now()}`, '-r', 'zip'], job);
else kaggle(['datasets', 'create', '-p', '.', '-r', 'zip'], job);
for (let i = 0; i < 60 && !kaggle(['datasets', 'status', DATASET], undefined, true).toLowerCase().includes('ready'); i++) spawnSync('sleep', ['10']);
console.log('  render job uploaded to Kaggle');

// 2. the GPU notebook
const kern = join(input, '_kaggle_kernel');
rmSync(kern, { recursive: true, force: true });
mkdirSync(kern, { recursive: true });
copyFileSync(join(blenderDir, 'kaggle_render.py'), join(kern, 'kaggle_render.py'));
writeFileSync(join(kern, 'kernel-metadata.json'), JSON.stringify({
  id: KERNEL, title: 'echo-lab-render', code_file: 'kaggle_render.py', language: 'python', kernel_type: 'script', is_private: true,
  enable_gpu: true, enable_internet: true, machine_shape: 'NvidiaTeslaT4', dataset_sources: [DATASET], competition_sources: [], kernel_sources: [],
}));
kaggle(['kernels', 'push', '-p', '.', '--accelerator', 'NvidiaTeslaT4'], kern);
console.log('  Blender is rendering on Kaggle (2 x Tesla T4)');

// 3. wait for it (a full video is ~1 h; Kaggle allows 12 h)
const t0 = Date.now();
let status = '';
for (;;) {
  spawnSync('sleep', ['60']);
  status = kaggle(['kernels', 'status', KERNEL], undefined, true);
  const min = (Date.now() - t0) / 60000;
  if (/complete|error|cancel/i.test(status)) break;
  if (Math.round(min) % 10 === 0) console.log(`  still rendering (${min.toFixed(0)} min)`);
  if (min > Number(opt('max-wait', '600'))) throw new Error(`Kaggle render not done after ${min.toFixed(0)} min`);
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
kaggle(['kernels', 'output', KERNEL, '-p', output], undefined, true);
console.log(`  Kaggle: ${status.trim().split('\n').pop()} after ${((Date.now() - t0) / 60000).toFixed(0)} min; got ${existsSync(output) ? readdirSync(output).join(', ') : 'nothing'}`);
if (!/complete/i.test(status)) process.exit(1);
