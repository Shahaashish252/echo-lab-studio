// Exports the generated video's 3D studio stage for Blender (photo-real renders on a GPU, blender/render_studio.py):
// scene.glb (every model, hidden sets too) + anim.json (per-frame camera, moving parts, visibility, glows, look).
//
//   bun scripts/export-blender.ts [--fps 30] [--out dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openApp, outRoot } from './app';

const argv = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const fps = Number(opt('fps', '30'));
const out = resolve(opt('out', join(outRoot, 'blender'))!);
mkdirSync(out, { recursive: true });

const { page, close } = await openApp({ video: 'auto' });
let code = 0;
try {
  const t0 = performance.now();
  const sizes = (await page.evaluate((f) => (window as any).__mac.exportBlender(f), fps)) as { glb: number; anim: number } | null;
  if (!sizes) throw new Error('no studio plate in this video');
  const fetch = async (key: 'glb' | 'anim', size: number) => {
    let s = '';
    for (let i = 0; i < size; i += 4_000_000) s += await page.evaluate(([k, a, b]) => (window as any).__mac.exportChunk(k, a, b), [key, i, 4_000_000] as const);
    return s;
  };
  writeFileSync(join(out, 'scene.glb'), Buffer.from(await fetch('glb', sizes.glb), 'base64'));
  writeFileSync(join(out, 'anim.json'), await fetch('anim', sizes.anim));
  console.log(`exported to ${out}: scene.glb ${(sizes.glb * 0.75 / 1e6).toFixed(1)} MB, anim.json ${(sizes.anim / 1e6).toFixed(1)} MB in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  code = 1;
} finally {
  await close();
}
process.exit(code);
