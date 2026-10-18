// 03 — Thomson's plum pudding model: size, spread-out positive charge, embedded electrons,
// the watermelon analogy, and the prediction it makes.
import { hash, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { arrow, BONE, callout, fadeInk, heading, INK, MONO, paper, particle, slate, W, type Ctx } from '../../kit';
import { beats } from './script';

const B = beats(['plum-1', 'plum-2', 'plum-3', ['plum-4', 0.3]], { lead: 0.5, tail: 1.2 });
export const LENGTH = B.length;

const CX = 1240;
const CY = 540;
const R = 270;

// Deterministic points inside the sphere (rejection sampled with hash).
function inside(n: number, seed: number, margin: number) {
  const out: [number, number][] = [];
  for (let k = 0; out.length < n && k < n * 20; k++) {
    const x = (hash(seed + k * 2) * 2 - 1) * R;
    const y = (hash(seed + k * 2 + 1) * 2 - 1) * R;
    if (Math.hypot(x, y) > R - margin) continue;
    if (out.some(([px, py]) => Math.hypot(px - x, py - y) < margin * 1.6)) continue;
    out.push([x, y]);
  }
  return out;
}
const PLUS = inside(46, 11, 30);
const ELECTRONS = inside(13, 503, 52);

/** Half a watermelon: red flesh, green rind, dark seeds. */
function watermelon(ctx: Ctx, x: number, y: number, r: number, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.fillStyle = '#3f8a3a';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#e8f0c8';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#e8484f';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#1b1411';
  for (let k = 0; k < 11; k++) {
    const ang = 0.35 + (k / 10) * (Math.PI - 0.7);
    const rr = r * (0.35 + 0.35 * hash(k + 3));
    ctx.save();
    ctx.translate(Math.cos(ang) * rr, Math.sin(ang) * rr);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export default class Plum extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [41, 48, 52, 57, 64] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: B.at('plum-1') + 0.2, kind: 'pop', gain: 0.8, pitch: 0.45 },
      { t: B.at('plum-2') + 1.4, kind: 'whoosh', dur: 0.5, gain: 0.25 },
      { t: B.at('plum-2') + 2.4, kind: 'chime', gain: 0.22, pitch: 1.5 },
      { t: B.at('plum-2') + 2.75, kind: 'type', dur: 0.6, gain: 0.3 },
      { t: B.at('plum-3') + 1.4, kind: 'pop', gain: 0.5, pitch: 0.7 },
    ];
    ELECTRONS.forEach((e, i) =>
      c.push({ t: B.at('plum-3') + 0.2 + i * 0.07, kind: 'pop', gain: 0.3, pitch: 1.1 + hash(i + 5) * 0.6, pan: (e[0] / R) * 0.6 }),
    );
    for (let k = 0; k < 6; k++) c.push({ t: B.at('plum-4') + 1.6 + k * 0.28, kind: 'zap', gain: 0.45, pitch: 0.9 + hash(k) * 0.2, pan: -0.4 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    const [a1, a2, a3, a4] = ['plum-1', 'plum-2', 'plum-3', 'plum-4'].map(B.at);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  03 PLUM PUDDING', f.t, out);
    heading(fg, '02 / THOMSON, 1904', 'The plum pudding model', t, out);

    // The "pudding": a soft sphere of positive charge.
    const s = outBack(range(t, a1, a1 + 0.7), 1.4);
    if (s > 0) {
      fg.save();
      fg.globalAlpha = out;
      const g = fg.createRadialGradient(CX - R * 0.3, CY - R * 0.35, 10, CX, CY, R * s);
      g.addColorStop(0, 'rgba(255,120,60,0.55)');
      g.addColorStop(1, 'rgba(200,62,18,0.28)');
      fg.fillStyle = g;
      fg.beginPath();
      fg.arc(CX, CY, R * s, 0, Math.PI * 2);
      fg.fill();
      fg.strokeStyle = 'rgba(255,90,31,0.8)';
      fg.lineWidth = 3;
      fg.stroke();

      fg.font = MONO(26, 500);
      fg.textAlign = 'center';
      fg.textBaseline = 'middle';
      PLUS.forEach(([x, y], i) => {
        const a = range(t, a2 + 0.2 + hash(i) * 0.8, a2 + 0.5 + hash(i) * 0.8);
        fg.fillStyle = `rgba(255,214,190,${0.55 * a})`;
        fg.fillText('+', CX + x * s, CY + y * s);
      });

      ELECTRONS.forEach(([x, y], i) => {
        const a = outBack(range(t, a3 + 0.2 + i * 0.07, a3 + 0.5 + i * 0.07), 2.5);
        if (a <= 0) return;
        const ex = CX + x * s + Math.sin(t * 5 + i * 1.7) * 3;
        const ey = CY + y * s + Math.cos(t * 4.3 + i * 2.3) * 3;
        fg.fillStyle = BONE;
        fg.beginPath();
        fg.arc(ex, ey, 17 * a, 0, Math.PI * 2);
        fg.fill();
        fg.fillStyle = INK;
        fg.fillRect(ex - 8 * a, ey - 2, 16 * a, 4);
      });
      fg.restore();
    }

    // Size: a dimension line across the diameter.
    const dim = outCubic(range(t, a2 + 1.4, a2 + 2.1)) * out;
    if (dim > 0) {
      const y = CY + R + 46;
      fg.save();
      fg.globalAlpha = dim;
      arrow(fg, CX, y, CX - R, y, BONE, 1, 2, 12);
      arrow(fg, CX, y, CX + R, y, BONE, 1, 2, 12);
      fg.fillStyle = INK;
      fg.fillRect(CX - 100, y - 22, 200, 40);
      fg.font = MONO(24, 500);
      fg.fillStyle = BONE;
      fg.textAlign = 'center';
      fg.fillText('≈ 10⁻¹⁰ m', CX, y + 8);
      fg.restore();
    }

    callout(fg, CX - R * 0.72, CY - R * 0.55, 860, 360, 'positive charge, spread evenly', range(t, a2 + 2.4, a2 + 3.4), out);
    const e0 = ELECTRONS[0];
    callout(fg, CX + e0[0], CY + e0[1], 860, 470, 'electrons embedded in it', range(t, a3 + 0.6, a3 + 1.6), out);

    // The watermelon analogy.
    const wm = outBack(range(t, a3 + 1.4, a3 + 2.0), 1.6) * out;
    watermelon(fg, 470, 590, 150 * wm, wm);
    if (wm > 0) {
      fg.save();
      fg.globalAlpha = wm;
      fg.font = MONO(20, 500);
      fg.textAlign = 'center';
      fg.fillStyle = BONE;
      fg.fillText('"watermelon model"', 470, 790);
      fg.fillStyle = 'rgba(239,230,214,0.6)';
      fg.fillText('flesh = + charge  ·  seeds = electrons', 470, 824);
      fg.restore();
    }

    // Prediction: alpha particles sail straight through the weak, spread-out charge.
    for (let k = 0; k < 6; k++) {
      const head = (t - (a4 + 1.6 + k * 0.28)) * 1100;
      if (head <= 0 || head > W + 400) continue;
      const y = CY - 220 + k * 88;
      const pts: [number, number][] = [];
      for (let j = 14; j >= 0; j--) {
        const x = 700 + head - j * 16;
        const d = Math.max(0, R - Math.hypot(x - CX, y - CY));
        pts.push([x, y + Math.sign(y - CY + 0.1) * d * 0.02]);
      }
      particle(fg, pts, undefined, 7, out);
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
