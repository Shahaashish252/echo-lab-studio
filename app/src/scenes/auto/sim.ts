// Live simulations, in the style of "Inside Electronics" explainers: one continuous instrument-panel diagram
// of the mechanism whose state is driven by the narration timing, with every number on screen computed from
// that state. scripts/auto.ts has Claude write sim.gen.js (a draw function); this hands it the canvas, the
// time, the narration timings and a small style kit.
import { clamp, inCubic, inOutCubic, lerp, outBack, outCubic, range, smooth, spring } from '../../engine/ease';
import { H, W, type Ctx } from '../../kit';

export const PALETTE = {
  bg: '#0c0f14',
  panel: '#1a212b',
  panelLine: '#2c3644',
  text: '#e6edf3',
  dim: '#8a96a8',
  teal: '#3fd0c0',
  orange: '#f2a23a',
  purple: '#a78bfa',
  red: '#ff6b6b',
  green: '#7ee787',
  blue: '#58a6ff',
};

export interface SimLine {
  text: string;
  start: number;
  end: number;
}

export interface SimInfo {
  t: number;
  dur: number;
  W: number;
  H: number;
  headline: string;
  lines: SimLine[];
  /** index of the narration line being spoken (or the last one started) */
  lineIndex: (t: number) => number;
  /** 0..1 progress through line i at time t (0 before it, 1 after) */
  lineProgress: (i: number, t: number) => number;
  ease: { clamp: typeof clamp; lerp: typeof lerp; range: typeof range; smooth: typeof smooth; outCubic: typeof outCubic; inCubic: typeof inCubic; inOutCubic: typeof inOutCubic; outBack: typeof outBack; spring: typeof spring };
  palette: typeof PALETTE;
  mono: (size: number, weight?: number) => string;
  sans: (size: number, weight?: number) => string;
  /** the soft rounded face of the reference style (Nunito); use it for most labels and values */
  round: (size: number, weight?: number) => string;
  /** rounded panel with the standard fill and outline */
  panel: (ctx: Ctx, x: number, y: number, w: number, h: number, r?: number) => void;
  brand: string;
}

type Draw = (ctx: Ctx, t: number, s: SimInfo) => void;
const found = import.meta.glob<Draw>('./sim.gen.js', { eager: true, import: 'default' });
const DRAW: Draw | undefined = Object.values(found)[0];

let reported = false;

export function drawSim(ctx: Ctx, t: number, dur: number, headline: string, lines: SimLine[]) {
  const info: SimInfo = {
    t,
    dur,
    W,
    H,
    headline: headline.replace(/\*/g, ''),
    lines,
    lineIndex: (tt) => {
      let k = 0;
      lines.forEach((l, i) => {
        if (tt >= l.start - 0.05) k = i;
      });
      return k;
    },
    lineProgress: (i, tt) => (lines[i] ? clamp((tt - lines[i].start) / Math.max(0.1, lines[i].end - lines[i].start)) : 0),
    ease: { clamp, lerp, range, smooth, outCubic, inCubic, inOutCubic, outBack, spring },
    palette: PALETTE,
    mono: (size, weight = 500) => `${weight} ${size}px "IBM Plex Mono", Consolas, monospace`,
    sans: (size, weight = 800) => `${weight} ${size}px Archivo, "Segoe UI", sans-serif`,
    round: (size, weight = 400) => `${weight} ${size}px Nunito, "Segoe UI", sans-serif`,
    panel: (c, x, y, w, h, r = 22) => {
      c.save();
      c.fillStyle = PALETTE.panel;
      c.strokeStyle = PALETTE.panelLine;
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      c.fill();
      c.stroke();
      c.restore();
    },
    brand: 'ECHO LAB 3D  ·  INSIDE ELECTRONICS',
  };
  if (!DRAW) return false;
  ctx.save();
  try {
    DRAW(ctx, t, info);
  } catch (e) {
    if (!reported) console.error('sim.gen.js failed:', e);
    reported = true;
  }
  ctx.restore();
  return true;
}
