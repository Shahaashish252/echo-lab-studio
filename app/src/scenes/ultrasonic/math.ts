// 08 — The maths. Speed of sound, distance = speed × time, halve it for the round trip, a worked
// example (1166 µs → 20 cm) and the ÷58 shortcut.
import { inOutCubic, lerp, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, eq, fadeInk, frac, MONO, paper, SIGNAL, W, type Ctx } from '../../kit';
import { beats } from './script';
import { CYAN, DIM, GREEN, headingV, label, panel, sensorSide, wall } from './ui';

const B = beats(['math-1', 'math-2', 'math-3', 'math-4', 'math-5'], { lead: 0.4, tail: 1.2 });
export const LENGTH = B.length;

const M1 = B.at('math-1');
const M2 = B.at('math-2');
const M3 = B.at('math-3');
const M4 = B.at('math-4');
const M5 = B.at('math-5');

/** fades/slides in at t0, out at t1 */
const vis = (t: number, t0: number, t1 = Infinity) =>
  outCubic(range(t, t0, t0 + 0.4)) * (t1 === Infinity ? 1 : 1 - range(t, t1, t1 + 0.35));

function line(ctx: Ctx, text: string, y: number, size: number, color: string, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.translate(0, (1 - a) * 24);
  eq(ctx, text, W / 2, y, size, color, 'center', a);
  ctx.restore();
}

export default class MathPlate extends Scene {
  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [43, 50, 55, 58, 62] },
      ...B.cues(),
      { t: M1 + 2.2, kind: 'pop', gain: 0.5 },
      { t: M2 + 0.2, kind: 'pop', gain: 0.5 },
      { t: M2 + 2.4, kind: 'pop', gain: 0.5, pitch: 1.2 },
      { t: M3 + 1.5, kind: 'hit', gain: 0.7 },
      { t: M3 + 1.55, kind: 'chime', gain: 0.4, pitch: 1.5 },
      { t: M4 + 0.2, kind: 'whoosh', dur: 0.5, gain: 0.35 },
      { t: M4 + 3.6, kind: 'chime', gain: 0.5, pitch: 2 },
      { t: M5 + 0.3, kind: 'pop', gain: 0.6 },
      { t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'THE MATHS', 'Time → distance', t, out);

    // mini scene: sensor, wall, the out-and-back path
    const sa = range(t, 0.3, 0.8) * out;
    const { tx, rx } = sensorSide(fg, 130, 545, 0.5, { alpha: sa });
    wall(fg, 880, 430, W + 20, 660, sa);
    const there = range(t, M2 + 1.6, M2 + 2.4);
    const back = range(t, M2 + 2.4, M2 + 3.2);
    fg.save();
    fg.globalAlpha = sa;
    fg.lineWidth = 5;
    fg.lineCap = 'round';
    if (there > 0) {
      fg.strokeStyle = CYAN;
      fg.beginPath();
      fg.moveTo(tx[0], tx[1]);
      fg.lineTo(lerp(tx[0], 880, there), tx[1]);
      fg.stroke();
    }
    if (back > 0) {
      fg.strokeStyle = SIGNAL;
      fg.beginPath();
      fg.moveTo(880, rx[1]);
      fg.lineTo(lerp(880, rx[0], back), rx[1]);
      fg.stroke();
    }
    fg.restore();
    label(fg, 'there', 520, tx[1] - 18, MONO(26, 500), CYAN, sa * range(t, M2 + 2.0, M2 + 2.3));
    label(fg, 'back', 520, rx[1] + 40, MONO(26, 500), SIGNAL, sa * range(t, M2 + 2.8, M2 + 3.1));
    // d marker
    const da = range(t, M3 + 0.2, M3 + 0.6) * sa;
    if (da > 0) {
      fg.save();
      fg.globalAlpha = da;
      fg.strokeStyle = GREEN;
      fg.lineWidth = 3;
      fg.beginPath();
      fg.moveTo(tx[0], 690);
      fg.lineTo(880, 690);
      fg.moveTo(tx[0], 678);
      fg.lineTo(tx[0], 702);
      fg.moveTo(880, 678);
      fg.lineTo(880, 702);
      fg.stroke();
      fg.restore();
      label(fg, 'd', 520, 680, MONO(36, 500), GREEN, da);
    }

    // equations
    const shift = inOutCubic(range(t, M4, M4 + 0.6));
    const top = vis(t, M1 + 2.0, M4);
    line(fg, 'v ≈ 343 m/s', 840, 72, CYAN, top * out);
    label(fg, 'speed of sound in air, 20 °C', W / 2, 892, MONO(26, 500), DIM, top * out);
    const d1 = vis(t, M2 + 0.2, M4);
    line(fg, 'distance = v × t', 1000, 64, BONE, d1 * out);
    const strike = range(t, M2 + 2.4, M2 + 2.8) * (1 - shift);
    if (strike > 0) {
      fg.save();
      fg.globalAlpha = out;
      fg.strokeStyle = SIGNAL;
      fg.lineWidth = 5;
      fg.beginPath();
      fg.moveTo(W / 2 - 250, 980);
      fg.lineTo(W / 2 - 250 + 500 * strike, 980);
      fg.stroke();
      fg.restore();
      label(fg, 'path = 2d', W / 2, 1070, MONO(34, 500), SIGNAL, range(t, M2 + 2.6, M2 + 3.0) * (1 - shift) * out);
    }

    // the formula, boxed; slides up for the example
    const fa = vis(t, M3 + 1.4) * out;
    if (fa > 0) {
      const y = lerp(1160, 820, shift);
      panel(fg, W / 2 - 260, y - 110, 520, 190, fa, SIGNAL);
      fg.save();
      fg.translate(0, (1 - fa) * 24);
      eq(fg, 'd =', W / 2 - 50, y + 22, 84, BONE, 'right', fa);
      frac(fg, 'v × t', '2', W / 2 + 90, y - 2, 84, SIGNAL, fa);
      fg.restore();
    }

    // worked example
    const ex1 = vis(t, M4 + 0.6) * out;
    line(fg, 't = 1166 µs = 0.001166 s', 1010, 52, BONE, ex1);
    const ex2 = vis(t, M4 + 2.0) * out;
    line(fg, 'd = 343 × 0.001166 ÷ 2', 1090, 52, BONE, ex2);
    const ex3 = vis(t, M4 + 3.5) * out;
    line(fg, 'd ≈ 0.20 m = 20 cm', 1180, 66, GREEN, ex3);

    // shortcut
    const sc = vis(t, M5 + 0.3) * out;
    if (sc > 0) {
      fg.save();
      fg.globalAlpha = sc;
      fg.fillStyle = 'rgba(20,17,14,0.92)';
      fg.fillRect(0, 960, W, 300);
      fg.restore();
      panel(fg, 90, 990, 900, 250, sc, CYAN);
      label(fg, 'SHORTCUT', W / 2, 1050, MONO(28, 500), CYAN, sc);
      line(fg, 'cm = µs ÷ 58', 1150, 84, BONE, sc);
      label(fg, 'sound covers 1 cm and back in ≈ 58 µs', W / 2, 1210, MONO(24, 500), DIM, sc * range(t, M5 + 2.5, M5 + 3.0));
    }

    B.subs(fg, t, 1420);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
