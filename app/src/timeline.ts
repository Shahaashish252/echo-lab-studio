import type { Scene } from './engine/scene';
import { VIDEO } from './format';
import { autoTimeline } from './scenes/auto/storyboard';

/** Footage-based videos run at 30 fps (the stock clips' rate); pure motion graphics at 60. */
export const FPS = VIDEO === 'auto' ? 30 : 60;

export interface Entry {
  id: string;
  file: string;
  start: number;
  end: number;
  /** passed to the plate's constructor (generated videos: the plate's storyboard entry) */
  data?: unknown;
}

const E = (id: string, file: string, start: number, end: number): Entry => ({ id, file, start, end });

const modules = import.meta.glob<{ default: new (data?: unknown) => Scene; LENGTH?: number }>(['./scenes/**/*.ts', '!./scenes/**/_*.ts'], {
  eager: true,
});

/**
 * Back-to-back plates from [id, file, length?]. With no length, the plate module's exported
 * LENGTH is used (voice-driven plates compute it from their narration).
 */
function seq(plates: [string, string, number?][]): Entry[] {
  let t = 0;
  return plates.map(([id, file, len]) => {
    const l = len ?? (modules[`./scenes/${file}.ts`] as { LENGTH?: number } | undefined)?.LENGTH;
    if (!l) throw new Error(`Plate "${file}" has no length: pass one or export LENGTH`);
    return E(id, file, t, (t += l));
  });
}

/** One timeline per video. Plates must be contiguous; the last one ends the video. File is under src/scenes/. */
export const VIDEOS: Record<string, Entry[]> = {
  rutherford: seq([
    ['intro', 'rutherford/intro'],
    ['electron', 'rutherford/electron'],
    ['plum', 'rutherford/plum'],
    ['alpha', 'rutherford/alpha'],
    ['setup', 'rutherford/setup'],
    ['fire', 'rutherford/fire'],
    ['quote', 'rutherford/quote'],
    ['graph', 'rutherford/graph'],
    ['inside', 'rutherford/inside'],
    ['closest', 'rutherford/closest'],
    ['scale', 'rutherford/scale'],
    ['model', 'rutherford/model'],
    ['limits', 'rutherford/limits'],
    ['outro', 'rutherford/outro'],
  ]),
  ultrasonic: seq([
    ['hook', 'ultrasonic/hook'],
    ['title', 'ultrasonic/title'],
    ['bat', 'ultrasonic/bat'],
    ['sound', 'ultrasonic/sound'],
    ['parts', 'ultrasonic/parts'],
    ['piezo', 'ultrasonic/piezo'],
    ['steps', 'ultrasonic/steps'],
    ['math', 'ultrasonic/math'],
    ['code', 'ultrasonic/code'],
    ['spec', 'ultrasonic/spec'],
    ['limits', 'ultrasonic/limits'],
    ['uses', 'ultrasonic/uses'],
    ['outro', 'ultrasonic/outro'],
  ]),
  // channel art and thumbnails: one-frame stills, sizes in format.ts
  'ultrasonic-wide': seq([['wide', 'ultrasonic/wide']]),
  'ultrasonic-thumb': [E('thumb', 'ultrasonic/thumb', 0, 1)],
  'ultrasonic-cover': [E('cover', 'ultrasonic/thumb', 0, 1)],
  'brand-banner': [E('banner', 'brand/banner', 0, 1)],
  'brand-avatar': [E('avatar', 'brand/avatar', 0, 1)],
  // made from a topic by scripts/auto.ts: AI storyboard, stock footage, Kokoro voice
  auto: autoTimeline(),
  demo: [
    E('title', 'demo/title', 0, 4),
    E('shapes', 'demo/shapes', 4, 8),
    E('cubes', 'demo/cubes', 8, 12.5),
    E('outro', 'demo/outro', 12.5, 15),
  ],
};

export { DEFAULT_VIDEO } from './format';

export interface Plate extends Entry {
  scene: Scene;
}

export function buildPlates(video: string): Plate[] {
  const timeline = VIDEOS[video];
  if (!timeline) throw new Error(`Unknown video "${video}". Videos: ${Object.keys(VIDEOS).join(', ')}`);
  return timeline.map((e) => {
    const mod = modules[`./scenes/${e.file}.ts`];
    if (!mod) throw new Error(`Scene module not found: src/scenes/${e.file}.ts`);
    return { ...e, scene: new mod.default(e.data) };
  });
}

export const durationOf = (plates: Plate[]) => plates[plates.length - 1].end;

export function plateIndexAt(plates: Plate[], t: number) {
  for (let i = plates.length - 1; i >= 0; i--) if (t >= plates[i].start) return i;
  return 0;
}
