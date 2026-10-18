// 13 — Recap and follow. SEND · TIME · HALVE, the formula, then a follow card with the sensor pinging.
import { clamp, range, spring } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, eq, fadeInk, frac, INK, letters, MONO, paper, SIGNAL, W } from '../../kit';
import { beats, dur } from './script';
import { CYAN, DIM, GREEN, label, panel, pop, ripples, sensorFront } from './ui';

const B = beats(['outro-1', ['outro-2', 0.3]], { lead: 0.4, tail: 2.0 });
export const LENGTH = B.length;

const O1 = B.at('outro-1');
const D1 = dur('outro-1');
const O2 = B.at('outro-2');
const STEPS = [
  { word: 'SEND', sub: 'a 40 kHz ping', color: CYAN, at: O1 + 0.15 },
  { word: 'TIME', sub: 'the echo', color: BONE, at: O1 + D1 * 0.3 },
  { word: 'HALVE', sub: 'it', color: SIGNAL, at: O1 + D1 * 0.48 },
];
const PINGS = [O2 + 0.3, O2 + 1.1, O2 + 1.9, O2 + 2.7];

export default class Outro extends Scene {
  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [45, 52, 57, 61, 64, 69] },
      ...B.cues(),
      ...STEPS.map((s, i) => ({ t: s.at, kind: 'hit', gain: 0.7, pitch: 1 + i * 0.15 })),
      { t: O1 + D1 * 0.7, kind: 'chime', gain: 0.4, pitch: 1.5 },
      { t: O2 - 0.2, kind: 'whoosh', dur: 0.5, gain: 0.5 },
      { t: O2 + 0.2, kind: 'boom', gain: 0.6 },
      ...PINGS.map((p) => ({ t: p, kind: 'zap', gain: 0.3, pitch: 1.8 })),
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    paper(bg);
    const recap = 1 - range(t, O2 - 0.4, O2);

    // recap
    label(fg, 'RECAP', W / 2, 260, MONO(30, 500), SIGNAL, range(t, 0.1, 0.4) * recap);
    STEPS.forEach((s, i) => {
      const p = pop(t, s.at - 0.1, 0.4);
      if (p <= 0) return;
      const y = 480 + i * 210;
      fg.save();
      fg.globalAlpha = recap;
      fg.translate(W / 2, y);
      fg.scale(p, p);
      fg.fillStyle = s.color;
      fg.beginPath();
      fg.arc(-330, -20, 46, 0, Math.PI * 2);
      fg.fill();
      fg.fillStyle = INK;
      fg.font = DISPLAY(52, 900);
      fg.textAlign = 'center';
      fg.fillText(String(i + 1), -330, -2);
      fg.textAlign = 'left';
      fg.fillStyle = s.color;
      fg.font = DISPLAY(110, 900);
      fg.fillText(s.word, -250, 18);
      fg.font = MONO(30, 500);
      fg.fillStyle = DIM;
      fg.fillText(s.sub, -246, 64);
      fg.restore();
    });
    const fa = range(t, O1 + D1 * 0.7, O1 + D1 * 0.7 + 0.4) * recap;
    if (fa > 0) {
      panel(fg, W / 2 - 250, 1070, 500, 180, fa, GREEN);
      eq(fg, 'd =', W / 2 - 40, 1180, 76, BONE, 'right', fa);
      frac(fg, 'v × t', '2', W / 2 + 90, 1158, 76, GREEN, fa);
    }

    // follow card
    const fo = range(t, O2 - 0.1, O2 + 0.3);
    if (fo > 0) {
      ripples(bg, W / 2, 640, t, fo, CYAN, 1100);
      const glow = Math.max(0, ...PINGS.map((p) => (t >= p ? Math.exp(-(t - p) * 4) : 0)));
      const s = 1.5 * (1 - (1 - fo) * 0.2);
      sensorFront(fg, W / 2, 640, s, { tx: glow, rx: glow * 0.6, alpha: fo });
      for (const p of PINGS) {
        if (t < p) continue;
        const age = t - p;
        fg.save();
        fg.globalAlpha = clamp(1 - age / 1.2) * fo;
        fg.strokeStyle = CYAN;
        fg.lineWidth = 5;
        fg.beginPath();
        fg.arc(W / 2 - 128 * s, 640, 120 + age * 600, 0, Math.PI * 2);
        fg.stroke();
        fg.restore();
      }
      letters(fg, 'FOLLOW', W / 2, 1050, DISPLAY(150, 900), BONE, (i) => {
        const a = t - O2 - 0.1 - i * 0.04;
        return { dy: (1 - spring(a, 1.5, 7)) * 100, alpha: clamp(a * 6) };
      }, 'center');
      const bp = pop(t, O2 + 0.7, 0.4);
      if (bp > 0) {
        fg.save();
        fg.translate(W / 2, 1170);
        fg.scale(bp, bp);
        fg.fillStyle = SIGNAL;
        fg.beginPath();
        fg.roundRect(-300, -50, 600, 100, 50);
        fg.fill();
        fg.fillStyle = INK;
        fg.font = DISPLAY(46, 900);
        fg.textAlign = 'center';
        fg.fillText('+  HOW IT WORKS', 0, 16);
        fg.restore();
      }
    }

    B.subs(fg, t, 1440);
    fadeInk(fg, 1 - range(t, 0, 0.2) + range(t, L - 0.5, L));
  }
}
