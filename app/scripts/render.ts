// Offline renderer: serves the app with Vite, drives headless Chrome frame by frame,
// and pipes PNG frames into ffmpeg (libx264).
//
//   bun scripts/render.ts video  [--video rutherford] [--samples 6] [--shutter 0.5] [--scale 1] [--crf 17] [--only <plate>] [--out file.mp4]
//                                [--part k/n: only the k-th of n equal frame ranges, silent, for cloud-render.ts] [--lite: cheaper 3D for GPU-less machines]
//   bun scripts/render.ts stills [--video rutherford] --t 1.5,9.2,fire@0.6 [--only <plate>] [--samples 1] [--out dir]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { appDir, openApp, outRoot } from './app';

const argv = process.argv.slice(2);
const mode = argv[0] === 'stills' ? 'stills' : 'video';
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};

const scale = Number(opt('scale', '1'));
const samples = Math.max(1, Number(opt('samples', mode === 'video' ? '6' : '1')));
const shutter = Number(opt('shutter', '0.5'));
const crf = opt('crf', '17')!;
const only = opt('only');

// --clean: no slates, headings or captions (thumbnails)
const { page, info, close } = await openApp({ video: opt('video'), scale, clean: argv.includes('--clean'), lite: argv.includes('--lite') });

let exitCode = 0;
try {
  const plate = only ? info.plates.find((p) => p.id === only) : undefined;
  if (only && !plate) throw new Error(`No plate "${only}". Plates: ${info.plates.map((p) => p.id).join(', ')}`);

  const grab = async (t: number) => {
    const url: string = await page.evaluate(
      ([t, s, sh]) => (window as any).__mac.frame(t, s, sh),
      [t, samples, shutter] as const,
    );
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  };

  if (mode === 'stills') {
    const outDir = resolve(opt('out', join(outRoot, 'stills'))!);
    mkdirSync(outDir, { recursive: true });
    // --t takes seconds, or plate@fraction (e.g. fire@0.6 = 60% through the "fire" plate)
    const parseT = (x: string) => {
      const [id, frac] = x.split('@');
      if (frac === undefined) return Number(x);
      const p = info.plates.find((q) => q.id === id);
      if (!p) throw new Error(`No plate "${id}"`);
      return p.start + Number(frac) * (p.end - p.start);
    };
    const ts = opt('t')
      ? opt('t')!.split(',').map(parseT)
      : plate
        ? [(plate.start + plate.end) / 2]
        : info.plates.map((p) => (p.start + p.end) / 2);
    for (const t of ts) {
      if (plate && (t < plate.start || t >= plate.end))
        console.warn(`! t=${t} is outside plate "${plate.id}" (${plate.start}-${plate.end}s)`);
      const id = info.plates.findLast((p) => t >= p.start)?.id ?? 'x';
      const file = join(outDir, `${info.video}_${id}_${t.toFixed(2)}s.png`);
      writeFileSync(file, await grab(t));
      console.log(file);
    }
  } else {
    const start = plate?.start ?? 0;
    const end = plate?.end ?? info.duration;
    const all = Math.round((end - start) * info.fps);
    // --part k/n renders frames [k*all/n, (k+1)*all/n) without sound; cloud-render.ts joins the parts
    const part = opt('part')?.split('/').map(Number);
    const first = part ? Math.floor((part[0] * all) / part[1]) : 0;
    const frames = part ? Math.floor(((part[0] + 1) * all) / part[1]) - first : all;
    const out = resolve(opt('out', join(outRoot, plate ? `${info.video}_${plate.id}.mp4` : `${info.video}.mp4`))!);
    mkdirSync(dirname(out), { recursive: true });
    // soundtrack made by scripts/sound.ts
    const vo = resolve(appDir, 'public', 'audio', `${info.video}.wav`);
    const withAudio = !plate && !part && existsSync(vo);

    const ff = spawn(
      'ffmpeg',
      [
        '-y', '-loglevel', 'error',
        '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'png', '-i', '-',
        ...(withAudio ? ['-i', vo, '-c:a', 'aac', '-b:a', '320k', '-shortest'] : []),
        '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        out,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const done = once(ff, 'close');

    console.log(`rendering ${frames} frames (${start}-${end}s) at ${info.width}x${info.height}, ${samples} sample(s)/frame`);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      const png = await grab(start + (first + i) / info.fps);
      if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
      if (i % 30 === 29 || i === frames - 1) {
        const el = (performance.now() - t0) / 1000;
        const eta = (el / (i + 1)) * (frames - i - 1);
        process.stdout.write(`\r  frame ${i + 1}/${frames}  ${(((i + 1) / el) || 0).toFixed(1)} fps  eta ${eta.toFixed(0)}s   `);
      }
    }
    ff.stdin.end();
    const [code] = await done;
    process.stdout.write('\n');
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
    console.log(`wrote ${out}${withAudio ? ' (with sound)' : ''}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  exitCode = 1;
} finally {
  await close();
}
process.exit(exitCode);
