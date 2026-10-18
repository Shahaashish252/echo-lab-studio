// Stock footage as image sequences: /auto/broll/<scene>/NNNN.jpg at 30 fps, written by scripts/auto.ts.
// Images load on demand into a small cache. The renderer awaits exact frames (prepare); the preview
// draws whatever is ready, falling back to the last frame it drew for that scene, and prefetches ahead.
import { STORY } from './storyboard';

export const BROLL_FPS = 30;
const MAX = 240;
const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement | undefined>>();
const lastDrawn = new Map<string, HTMLImageElement>();
// a new build gets new URLs, so the preview never shows the previous topic's footage
const BUILD = (STORY as { build?: string } | undefined)?.build ?? '';

const pad = (n: number) => String(n).padStart(4, '0');
const url = (scene: string, i: number) => `/auto/broll/${scene}/${pad(i)}.jpg${BUILD ? `?b=${BUILD}` : ''}`;

function load(u: string): Promise<HTMLImageElement | undefined> {
  const hit = cache.get(u);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(u);
  if (p) return p;
  const promise = new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image();
    img.onload = () => {
      cache.set(u, img);
      pending.delete(u);
      if (cache.size > MAX) cache.delete(cache.keys().next().value!);
      resolve(img);
    };
    // a missing frame draws nothing rather than stalling the render
    img.onerror = () => {
      pending.delete(u);
      resolve(undefined);
    };
    img.src = u;
  });
  pending.set(u, promise);
  return promise;
}

/** Footage frame index for plate-local time `lt`; clips are extracted at the scene's length. */
export const frameIndex = (lt: number, frames: number) => Math.min(frames - 1, Math.max(0, Math.floor(lt * BROLL_FPS)));

/** Renderer: wait for this frame. */
export async function ensure(scene: string, i: number) {
  await load(url(scene, i));
}

/** Preview + renderer: the frame if loaded, else the last one drawn for this scene. Prefetches ahead. */
export function frame(scene: string, i: number, frames: number): HTMLImageElement | undefined {
  const img = cache.get(url(scene, i));
  for (let k = 1; k <= 12; k++) if (i + k < frames) void load(url(scene, i + k));
  if (img) {
    lastDrawn.set(scene, img);
    return img;
  }
  void load(url(scene, i));
  return lastDrawn.get(scene);
}
