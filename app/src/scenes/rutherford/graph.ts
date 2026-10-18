// 08 — The angular distribution: counts vs scattering angle on a log scale, Rutherford's
// 1/sin⁴(θ/2) curve through the points, and Thomson's prediction for comparison.
import { hash, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, eq, fadeInk, frac, glow, GOLD, heading, MONO, paper, SIGNAL, slate, type Ctx } from '../../kit';
import { beats } from './script';

const B = beats(['graph-1', 'graph-2', 'graph-3'], { lead: 0.6, tail: 1.4 });
export const LENGTH = B.length;

const X0 = 330;
const X1 = 1400;
const Y0 = 860; // log N = 0
const Y1 = 320; // log N = 6
const xOf = (deg: number) => X0 + (deg / 180) * (X1 - X0);
const yOf = (logN: number) => Y0 - (logN / 6) * (Y0 - Y1);
const rutherford = (deg: number) => -4 * Math.log10(Math.sin(((deg / 2) * Math.PI) / 180)); // log10 of 1/sin⁴(θ/2)
const thomson = (deg: number) => 5.6 - 0.09 * deg * deg;

const ANGLES = [5, 10, 15, 22.5, 30, 37.5, 45, 60, 75, 90, 105, 120, 135, 150];
const POINTS = ANGLES.map((a, i) => [a, rutherford(a) + (hash(i * 7.1) - 0.5) * 0.14] as const);

function axes(ctx: Ctx, p: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = p;
  ctx.strokeStyle = 'rgba(239,230,214,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X0, Y1 - 20);
  ctx.lineTo(X0, Y0);
  ctx.lineTo(X0 + (X1 - X0 + 30) * outCubic(p), Y0);
  ctx.stroke();
  ctx.font = MONO(18, 500);
  ctx.fillStyle = 'rgba(239,230,214,0.7)';
  ctx.textAlign = 'center';
  for (let d = 0; d <= 180; d += 30) {
    ctx.fillRect(xOf(d) - 1, Y0, 2, 8);
    ctx.fillText(`${d}°`, xOf(d), Y0 + 32);
  }
  ctx.textAlign = 'right';
  const sup = ['1', '10', '10²', '10³', '10⁴', '10⁵', '10⁶'];
  for (let k = 0; k <= 6; k++) {
    ctx.fillStyle = 'rgba(239,230,214,0.08)';
    ctx.fillRect(X0, yOf(k), X1 - X0, 1);
    ctx.fillStyle = 'rgba(239,230,214,0.7)';
    ctx.fillText(sup[k], X0 - 14, yOf(k) + 6);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = BONE;
  ctx.font = MONO(20, 500);
  ctx.fillText('scattering angle θ', (X0 + X1) / 2, Y0 + 70);
  ctx.save();
  ctx.translate(X0 - 90, (Y0 + Y1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('number of α particles (log scale)', 0, 0);
  ctx.restore();
  ctx.restore();
}

function curve(ctx: Ctx, fn: (d: number) => number, from: number, to: number, p: number, color: string, width: number, dash: number[] = []) {
  if (p <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(X0, Y1 - 10, X1 - X0 + 20, Y0 - Y1 + 10);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const end = from + (to - from) * p;
  let first = true;
  for (let d = from; d <= end; d += 0.5) {
    const v = fn(d);
    if (v < -0.2) break;
    const x = xOf(d);
    const y = yOf(Math.min(6.3, v));
    first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    first = false;
  }
  ctx.stroke();
  ctx.restore();
}

export default class Graph extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [40, 47, 52, 55, 59] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: B.at('graph-1') + 0.1, kind: 'whoosh', dur: 0.6, gain: 0.3 },
      { t: B.at('graph-2') + 0.5, kind: 'riser', dur: 2.0, gain: 0.25 },
      { t: B.at('graph-2') + 2.6, kind: 'chime', gain: 0.35, pitch: 1.5 },
      { t: B.at('graph-3') + 0.4, kind: 'whoosh', dur: 0.6, gain: 0.25 },
      { t: B.at('graph-3') + 2.4, kind: 'chime', gain: 0.3, pitch: 2 },
    ];
    POINTS.forEach((_, i) => c.push({ t: B.at('graph-1') + 1.2 + i * 0.18, kind: 'pop', gain: 0.28, pitch: 1.6 - i * 0.05, pan: -0.6 + i * 0.09 }));
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    const [g1, g2, g3] = ['graph-1', 'graph-2', 'graph-3'].map(B.at);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  08 DISTRIBUTION', f.t, out);
    heading(fg, '06 / THE DATA', 'Counts vs. scattering angle', t, out);

    fg.save();
    fg.globalAlpha = out;
    axes(fg, range(t, g1, g1 + 0.9));

    // Thomson's prediction: almost nothing beyond a few degrees.
    const th = range(t, g3 + 0.4, g3 + 1.6);
    curve(fg, thomson, 0, 12, th, 'rgba(159,216,255,0.9)', 3, [10, 8]);
    if (th > 0) {
      fg.globalAlpha = out * range(t, g3 + 1.2, g3 + 1.7);
      fg.font = MONO(19, 500);
      fg.fillStyle = '#9fd8ff';
      fg.fillText('Thomson model: nothing beyond a few degrees', xOf(14), yOf(4.9));
      fg.globalAlpha = out;
    }

    // Rutherford's curve.
    curve(fg, rutherford, 3, 178, outCubic(range(t, g2 + 0.5, g2 + 2.6)), SIGNAL, 4);

    // Measured-style points.
    POINTS.forEach(([a, n], i) => {
      const p = outBack(range(t, g1 + 1.2 + i * 0.18, g1 + 1.45 + i * 0.18), 2.5);
      if (p <= 0) return;
      fg.fillStyle = BONE;
      fg.beginPath();
      fg.arc(xOf(a), yOf(n), 7 * p, 0, Math.PI * 2);
      fg.fill();
    });
    const back = range(t, g3 + 2.2, g3 + 2.7);
    if (back > 0) {
      fg.globalAlpha = out * back;
      fg.strokeStyle = SIGNAL;
      fg.lineWidth = 2;
      fg.setLineDash([6, 6]);
      fg.beginPath();
      fg.roundRect(xOf(86), yOf(1.9), xOf(154) - xOf(86), yOf(-0.2) - yOf(1.9), 16);
      fg.stroke();
      fg.setLineDash([]);
      fg.font = MONO(19, 500);
      fg.fillStyle = SIGNAL;
      fg.fillText('impossible without a point-like nucleus', xOf(70), yOf(2.25));
      glow(fg, xOf(178), yOf(0), 6, SIGNAL, back * (0.6 + 0.4 * Math.sin(t * 6)));
      fg.globalAlpha = out;
    }
    fg.font = MONO(15, 400);
    fg.fillStyle = 'rgba(239,230,214,0.45)';
    fg.fillText('points illustrative, after Geiger & Marsden (1913)', X0 + 10, Y1 - 30);
    fg.restore();

    // The formula.
    const fa = outCubic(range(t, g2 + 0.3, g2 + 0.9)) * out;
    if (fa > 0) {
      fg.save();
      fg.globalAlpha = fa;
      fg.fillStyle = 'rgba(20,17,14,0.88)';
      fg.strokeStyle = 'rgba(255,90,31,0.6)';
      fg.lineWidth = 1.5;
      fg.beginPath();
      fg.roundRect(1440, 300, 430, 210, 16);
      fg.fill();
      fg.stroke();
      fg.font = MONO(18, 500);
      fg.fillStyle = SIGNAL;
      fg.fillText('RUTHERFORD SCATTERING', 1470, 340);
      fg.restore();
      eq(fg, 'N(θ)  ∝', 1470, 445, 56, BONE, 'left', fa);
      frac(fg, '1', 'sin⁴(θ/2)', 1735, 430, 50, GOLD, fa);
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
