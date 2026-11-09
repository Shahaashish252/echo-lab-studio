// Render the teardown3 page to mp4: node teardown/render.mjs [--part k/n] [--workers 3] [--fps 24] [--q 'lite=1'] --out file.mp4
// --part k/n renders only the k-th of n equal frame ranges (one cloud runner each; teardown/make.py joins them).
import fs from 'fs'; import path from 'path'; import os from 'os'; import { spawn, execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
import { openDemo, closeServer } from './core/render/page.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url)), PAGE = path.join(HERE, 'page');
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const FPS = +opt('--fps', 24), WK = +opt('--workers', 3), Q = opt('--q', ''), out = path.resolve(opt('--out', path.join(PAGE, 'out', 'video.mp4')));
const [pk, pn] = (opt('--part', '0/1')).split('/').map(Number);
const probe = await openDemo(PAGE, { w: 1080, h: 1920, q: Q }); const DUR = await probe.page.evaluate(() => window.DUR); await probe.browser.close();
const N = Math.round(DUR * FPS), f0 = Math.floor(N * pk / pn), f1 = Math.floor(N * (pk + 1) / pn);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'td3-')); fs.mkdirSync(path.dirname(out), { recursive: true });
console.log(`frames ${f0}..${f1 - 1} of ${N} (${WK} workers)`);
const t0 = Date.now();
async function worker(w, a0, a1) {
  const seg = path.join(tmp, `s${w}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  const { page, browser } = await openDemo(PAGE, { w: 1080, h: 1920, q: Q });
  for (let f = a0; f < a1; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - a0) % 48 === 0) console.log(`w${w} ${f - a0}/${a1 - a0}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await browser.close(); ff.stdin.end(); await new Promise((r, j) => ff.on('close', (c) => (c ? j(new Error('ffmpeg ' + c)) : r())));
  return seg;
}
const span = f1 - f0, segs = await Promise.all(Array.from({ length: WK }, (_, w) => worker(w, f0 + Math.floor(span * w / WK), f0 + Math.floor(span * (w + 1) / WK))));
fs.writeFileSync(path.join(tmp, 'list.txt'), segs.map((s) => `file '${s.split(String.fromCharCode(92)).join('/')}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', out]);
fs.rmSync(tmp, { recursive: true, force: true }); closeServer();
console.log(`done ${out} ${span} frames ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(0);
