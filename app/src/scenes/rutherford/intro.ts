// 01 — Title. Alpha particles stream across the frame behind the title.
import { clamp, hash, inExpo, outCubic, range, spring } from '../../engine/ease';
import { beats } from './script';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, GOLD, H, letters, paper, particle, SIGNAL, slate, typed, W, type Ctx } from '../../kit';

/** Background stream of alpha particles, left to right. Pure function of t. */
export function stream(ctx: Ctx, t: number, alpha: number, count = 26) {
  if (alpha <= 0) return;
  for (let k = 0; k < count; k++) {
    const speed = 700 + hash(k) * 600;
    const span = W + 600;
    const x = ((t * speed + hash(k + 99) * span) % span) - 300;
    const y = 80 + hash(k + 7) * (H - 160);
    const pts: [number, number][] = [];
    for (let s = 12; s >= 0; s--) pts.push([x - s * speed * 0.012, y]);
    particle(ctx, pts, SIGNAL, 3.5, alpha * (0.25 + 0.35 * hash(k + 3)));
  }
}

const B = beats(['intro-1'], { lead: 0.4, tail: 0.9, min: 6 });
export const LENGTH = B.length;

export default class Intro extends Scene {
  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [45, 52, 59, 60, 64] },
      ...B.cues(),
      { t: 0.3, kind: 'type', dur: 0.8, gain: 0.5 },
      { t: 0.62, kind: 'hit', gain: 0.9 },
      { t: 1.02, kind: 'hit', gain: 0.9, pitch: 1.25 },
      { t: 2.2, kind: 'chime', gain: 0.3, pitch: 1.5 },
      { t: dur - 0.95, kind: 'whoosh', dur: 0.8, gain: 0.6 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.7, L - 0.1);
    paper(bg, { alpha: outCubic(range(t, 0, 1)) });
    stream(bg, t, range(t, 0.2, 1.2) * out);
    slate(fg, 'RUTHERFORD  /  01 INTRO', f.t, range(t, 0.3, 0.8) * out);

    typed(fg, 'MANCHESTER  ·  1909', W / 2, 330, range(t, 0.3, 1.1), 26, SIGNAL, { align: 'center', alpha: out });

    const fly = (i: number) => inExpo(range(t, L - 0.85 + i * 0.02, L - 0.25 + i * 0.02));
    letters(fg, 'THE GOLD FOIL', W / 2, 515, DISPLAY(150), BONE, (i) => {
      const a = t - 0.6 - i * 0.035;
      return { dy: (1 - spring(a, 1.6, 7)) * 120 - fly(i) * 700, alpha: clamp(a * 6) };
    }, 'center');
    letters(fg, 'EXPERIMENT', W / 2, 670, DISPLAY(150), GOLD, (i) => {
      const a = t - 1.0 - i * 0.035;
      return { dy: (1 - spring(a, 1.6, 7)) * 120 - fly(i + 13) * 700, alpha: clamp(a * 6) };
    }, 'center');

    B.subs(fg, t, 830);
    fadeInk(fg, 1 - range(t, 0, 0.3));
  }
}
