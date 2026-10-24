// Serves the app with Vite and opens it in headless Chrome in render mode.
// Shared by render.ts (frames) and sound.ts (cue sheet).
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

export const appDir = resolve(import.meta.dir, '..');
export const outRoot = resolve(appDir, '..', 'out');

export interface AppInfo {
  video: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  plates: { id: string; start: number; end: number }[];
}

export async function openApp({ video, scale = 1, clean = false, lite = false }: { video?: string; scale?: number; clean?: boolean; lite?: boolean }) {
  // No watcher and no HMR: editing files mid-render must not reload the page.
  const server = await createServer({
    root: appDir,
    logLevel: 'error',
    server: { port: 0, strictPort: false, hmr: false, ws: false, watch: null },
  });
  await server.listen();
  const base = server.resolvedUrls!.local[0];
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL ?? 'chrome',
    args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default', '--enable-unsafe-swiftshader'],
  });
  const close = async () => {
    await browser.close();
    await server.close();
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    page.on('console', (m) => {
      // HMR is off on purpose, so ignore the Vite client's websocket complaints.
      if (m.type() === 'error' && !/404|websocket|vite/i.test(m.text())) console.error('[page]', m.text());
    });
    await page.goto(`${base}?render=1&scale=${scale}${video ? `&video=${encodeURIComponent(video)}` : ''}${clean ? '&clean=1' : ''}${lite ? '&lite=1' : ''}`);
    await page.waitForFunction(() => (window as any).__macReady === true, null, { timeout: 60_000 });
    const info: AppInfo = await page.evaluate(() => {
      const m = (window as any).__mac;
      return { video: m.video, duration: m.duration, fps: m.fps, width: m.width, height: m.height, plates: m.plates };
    });
    return { page, info, close };
  } catch (e) {
    await close();
    throw e;
  }
}
