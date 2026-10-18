// The generated video's storyboard. scripts/auto.ts writes storyboard.json (scenes, footage, timing)
// and voice.json (narration) from a topic; this turns the storyboard into the "auto" timeline.
// Every plate is the same module (auto/plate.ts) and draws the scene it is handed.
import type { Entry } from '../../timeline';

export type SceneType = 'hook' | 'title' | 'stat' | 'list' | 'steps' | 'compare' | 'quote' | 'fact' | 'outro' | 'board' | 'diagram' | 'model' | 'photo' | 'sim';

/** An animation cue as the storyboard writes it: timed by a narration line (index into lines) and a 0..1 point within it. */
export interface DiagramCue {
  effect: string;
  target: string;
  line?: number;
  at?: number;
  dur?: number;
  dx?: number;
  dy?: number;
  dz?: number;
  deg?: number;
  axis?: 'x' | 'y' | 'z';
  amount?: number;
  zoom?: number;
  path?: string;
  text?: string;
}

export interface Side {
  title: string;
  points: string[];
}

export interface StoryScene {
  id: string;
  type: SceneType;
  /** voice line ids (voice.json), spoken back to back */
  lines: string[];
  /** big on-screen words; *stars* highlight */
  headline?: string;
  heading?: string;
  items?: string[];
  value?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label?: string;
  /** who published a stat */
  source?: string;
  left?: Side;
  right?: Side;
  quote?: string;
  author?: string;
  /** diagram scenes: the illustration (SVG, movable parts as top-level <g id>) and its animation cues */
  svg?: string;
  anims?: DiagramCue[];
  /** photo scenes: the photo (served path), named points in it (0..1), and who took it */
  photo?: { src: string; points: Record<string, [number, number]>; credit?: string };
  /** model scenes: camera angle on the video's 3D model (model3d.ts) */
  view?: { azimuth?: number; elevation?: number; distance?: number };
  /** board scenes: parts of the Arduino Uno to point at, in order (arduino.ts PARTS) */
  focus?: string[];
  /** board scenes: a live demonstration */
  demo?: 'upload' | 'blink';
  /** animated background drawn in code (backdrops.ts), used when there is no footage */
  visual?: string;
  /** stock footage search term (--stock) */
  search?: string;
  /** seconds, from the voice clips (scripts/auto.ts) */
  length: number;
  /** footage frames at /auto/broll/<id>/NNNN.jpg, 30 fps; 0 = no footage */
  frames: number;
}

export interface Timing {
  lead: number;
  gap: number;
  tail: number;
}

export interface Storyboard {
  topic: string;
  title: string;
  kicker: string;
  timing: Timing;
  scenes: StoryScene[];
}

const found = import.meta.glob<Storyboard>('./storyboard.json', { eager: true, import: 'default' });
export const STORY: Storyboard | undefined = Object.values(found)[0];

export interface PlateData {
  scene: StoryScene;
  index: number;
  count: number;
  /** video start of each scene, for the progress bar */
  starts: number[];
  total: number;
}

export function autoTimeline(): Entry[] {
  if (!STORY?.scenes?.length) return [{ id: 'empty', file: 'auto/plate', start: 0, end: 3 }];
  const starts: number[] = [];
  let t = 0;
  for (const s of STORY.scenes) {
    starts.push(t);
    t += s.length;
  }
  return STORY.scenes.map((scene, index) => {
    const data: PlateData = { scene, index, count: STORY.scenes.length, starts, total: t };
    return { id: scene.id, file: 'auto/plate', start: starts[index], end: starts[index] + scene.length, data };
  });
}
