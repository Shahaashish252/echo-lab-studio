import * as THREE from 'three';

/** Everything a plate needs to draw one frame. Must be enough to draw it deterministically. */
export interface Frame {
  /** global time (s) */
  t: number;
  /** time since this plate started (s) */
  lt: number;
  /** progress through the plate, 0..1 */
  p: number;
  /** plate duration (s) */
  dur: number;
  /** true on the first frame after a jump in time; stateful plates reset on it */
  seeked: boolean;
}

/** Drawing surfaces. 2D contexts are always in the video's W x H units (src/format.ts), whatever the render scale. */
export interface Layers {
  /** drawn first, behind the 3D layer */
  bg: CanvasRenderingContext2D;
  /** drawn last, over the 3D layer */
  fg: CanvasRenderingContext2D;
}

/** A sound event, in plate-local time. Rendered by scripts/sound.ts. */
export interface Cue {
  t: number;
  kind: string;
  /** linear gain, default 1 */
  gain?: number;
  /** pitch multiplier, default 1 */
  pitch?: number;
  /** seconds, for sustained sounds */
  dur?: number;
  /** -1 (left) .. 1 (right) */
  pan?: number;
  /** MIDI notes, for 'pad' */
  notes?: number[];
  /** clip name, for 'voice' (app/public/voice/<video>/<id>.wav) */
  id?: string;
}

/**
 * A plate. Subclasses implement render(); it is called once per frame (or sub-frame)
 * and must be a pure function of `f`. Set uses3D and build `three` / `camera` to draw 3D.
 */
export abstract class Scene {
  uses3D = false;
  readonly three = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
  abstract render(f: Frame, out: Layers): void;
  /** Sound events for this plate, in plate-local seconds. `dur` is the plate's length. */
  cues?(dur: number): Cue[];
  /** Called once with the renderer before the plate's first 3D render (e.g. to build an environment map). */
  init3D?(renderer: THREE.WebGLRenderer): void;
  /** Loads anything frame `f` needs (footage images). The renderer awaits it before render(); the preview doesn't. */
  prepare?(f: Frame): Promise<void>;
}
