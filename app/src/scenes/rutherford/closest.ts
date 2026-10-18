// 10 — Distance of closest approach. A head-on alpha particle slows as kinetic energy turns into
// electric potential energy (bars), stops at d, and returns. Then the formula and the worked example.
import { clamp, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { arrow, BONE, card, eq, fadeInk, frac, glow, GOLD, heading, MONO, paper, SIGNAL, slate, type Ctx } from '../../kit';
import { helium } from './alpha';
import { beats } from './script';

const B = beats(['closest-1', 'closest-2', 'closest-3', 'closest-4', 'closest-5'], { lead: 0.5, tail: 1.4 });
export const LENGTH = B.length;
const [C1, C2, C3, C4, C5] = ['closest-1', 'closest-2', 'closest-3', 'closest-4', 'closest-5'].map(B.at);

const LANE = 390;
const NX = 1500; // nucleus
const X0 = 260; // alpha start
const D = 170; // closest approach (px from nucleus)
const R0 = NX - X0;
// The approach: the particle reaches d exactly as "distance of closest approach" is said, then returns.
const TA0 = C1 + 0.8;
const TA1 = C2 + 0.5;

// Head-on motion under 1/r repulsion energy: v = v0·sqrt(1 − d/r). Tabulate time to fall from R0 to r.
const RS: number[] = [];
const TS: number[] = [];
{
  let tt = 0;
  const n = 4000;
  for (let i = 0; i <= n; i++) {
    const r = R0 - ((R0 - D) * i) / n;
    if (i > 0) {
      const rm = r + (R0 - D) / n / 2;
      tt += (R0 - D) / n / Math.sqrt(1 - D / rm);
    }
    RS.push(r);
    TS.push(tt);
  }
}
const T_APPROACH = TS[TS.length - 1];

/** Distance from the nucleus at plate time t (approach, turn, recede). */
function rAt(t: number) {
  const span = TA1 - TA0;
  let u = (t - TA0) / span;
  if (u <= 0) return R0;
  if (u > 1) u = 2 - u; // recede symmetrically
  if (u <= 0) return R0;
  const target = u * T_APPROACH;
  let lo = 0;
  let hi = TS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TS[mid] <= target) lo = mid;
    else hi = mid;
  }
  return RS[lo];
}

function bars(ctx: Ctx, r: number, a: number) {
  if (a <= 0) return;
  const K = 1 - D / r;
  const U = D / r;
  const x = 260;
  const w = 700;
  const rows: [string, number, string][] = [
    ['KINETIC ENERGY  K', K, SIGNAL],
    ['POTENTIAL ENERGY  U', U, GOLD],
  ];
  ctx.save();
  ctx.globalAlpha = a;
  rows.forEach(([label, v, color], i) => {
    const y = 545 + i * 70;
    ctx.font = MONO(17, 500);
    ctx.fillStyle = 'rgba(239,230,214,0.65)';
    ctx.fillText(label, x, y - 12);
    ctx.fillStyle = 'rgba(239,230,214,0.1)';
    ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(v), 16);
  });
  ctx.font = MONO(17, 500);
  ctx.fillStyle = 'rgba(239,230,214,0.55)';
  ctx.fillText('K + U = constant', x + w + 30, 600);
  ctx.restore();
}

export default class Closest extends Scene {
  cues(dur: number): Cue[] {
    return [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [38, 45, 50, 53, 57, 60] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: TA0, kind: 'zap', gain: 0.5, pitch: 0.8, pan: -0.6 },
      { t: TA0 + 0.3, kind: 'riser', dur: TA1 - TA0 - 0.2, gain: 0.3 },
      { t: TA1, kind: 'hit', gain: 0.8, pitch: 1.1 },
      { t: TA1 + 0.05, kind: 'chime', gain: 0.3, pitch: 2 },
      { t: C3 + 0.2, kind: 'whoosh', dur: 0.5, gain: 0.25 },
      { t: C4 + 0.2, kind: 'whoosh', dur: 0.5, gain: 0.25 },
      { t: B.end('closest-4') - 0.6, kind: 'chime', gain: 0.4, pitch: 1.5 },
      { t: C5 + 0.2, kind: 'pop', gain: 0.5, pitch: 0.6 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  10 CLOSEST APPROACH', f.t, out);
    heading(fg, '08 / HOW CLOSE?', 'Distance of closest approach', t, out);

    const lane = range(t, C1, C1 + 0.6) * out;
    const r = rAt(t);
    if (lane > 0) {
      fg.save();
      fg.globalAlpha = lane;
      fg.strokeStyle = 'rgba(239,230,214,0.18)';
      fg.setLineDash([4, 10]);
      fg.beginPath();
      fg.moveTo(X0 - 60, LANE);
      fg.lineTo(NX + 120, LANE);
      fg.stroke();
      fg.setLineDash([]);
      fg.font = MONO(18, 500);
      fg.fillStyle = 'rgba(239,230,214,0.6)';
      fg.fillText('head-on: b = 0', X0 - 60, LANE - 40);
      fg.restore();
      glow(fg, NX, LANE, 22, GOLD, lane);
      eq(fg, '+Ze', NX + 40, LANE + 12, 34, GOLD, 'left', lane);
      eq(fg, 'gold nucleus, Z = 79', NX, LANE + 74, 26, BONE, 'center', lane * 0.7);

      // the alpha particle, and the separation r while it moves
      const ax = NX - r;
      fg.save();
      fg.globalAlpha = lane;
      helium(fg, ax, LANE, 11);
      fg.restore();
      const moving = t > TA0 && t < TA1 + (TA1 - TA0);
      if (moving && r > D + 30) {
        fg.save();
        fg.globalAlpha = lane * 0.7;
        arrow(fg, ax + 30, LANE + 34, NX - 26, LANE + 34, 'rgba(239,230,214,0.7)', 1, 1.5, 9);
        fg.restore();
        eq(fg, 'r', (ax + NX) / 2, LANE + 26, 30, BONE, 'center', lane * 0.8);
      }
      // the turning point stays marked, with d measured to the nucleus
      const mark = range(t, TA1, TA1 + 0.3) * lane;
      if (mark > 0) {
        fg.save();
        fg.globalAlpha = mark * 0.5;
        helium(fg, NX - D, LANE, 11);
        fg.restore();
        fg.save();
        fg.globalAlpha = mark;
        arrow(fg, NX - D / 2, LANE - 60, NX - D + 6, LANE - 60, SIGNAL, 1, 2.5, 11);
        arrow(fg, NX - D / 2, LANE - 60, NX - 6, LANE - 60, SIGNAL, 1, 2.5, 11);
        fg.restore();
        eq(fg, 'd', NX - D / 2, LANE - 74, 40, SIGNAL, 'center', mark);
        fg.save();
        fg.globalAlpha = mark * range(t, TA1 + 0.3, TA1 + 0.8);
        fg.font = MONO(18, 500);
        fg.fillStyle = SIGNAL;
        fg.textAlign = 'center';
        fg.fillText('K = 0 here: all energy is potential', NX - D, LANE - 130);
        fg.restore();
      }
      // closest-5: the nucleus must fit inside d
      const inside = range(t, C5, C5 + 0.5) * lane;
      if (inside > 0) {
        fg.save();
        fg.globalAlpha = inside;
        fg.strokeStyle = SIGNAL;
        fg.setLineDash([6, 6]);
        fg.lineWidth = 2;
        fg.beginPath();
        fg.arc(NX, LANE, D, 0, Math.PI * 2);
        fg.stroke();
        fg.restore();
      }
    }

    bars(fg, r, range(t, C1 + 0.4, C1 + 1.0) * out);

    // closest-3: the formula, built in two steps.
    const e1 = outCubic(range(t, C3, C3 + 0.5)) * out;
    const e2 = outCubic(range(t, C3 + 0.5 * (B.end('closest-3') - C3), C3 + 0.5 * (B.end('closest-3') - C3) + 0.5)) * out;
    if (e1 > 0) {
      const y = 790;
      eq(fg, 'K  =', 260, y + 14, 46, BONE, 'left', e1);
      frac(fg, '1', '4πε₀', 420, y, 42, BONE, e1);
      eq(fg, '·', 480, y + 14, 46, BONE, 'left', e1);
      frac(fg, '(2e)(Ze)', 'd', 590, y, 42, BONE, e1);
      eq(fg, '⇒   d  =', 720, y + 14, 46, SIGNAL, 'left', e2);
      frac(fg, '2Ze²', '4πε₀ K', 990, y, 46, SIGNAL, e2);
    }

    // closest-4: the worked example.
    card(
      fg, 1150, 520, 720, 'worked example',
      ['K = 7.7 MeV = 1.23 × 10⁻¹² J', 'Z = 79,   e = 1.6 × 10⁻¹⁹ C', '1/4πε₀ = 9 × 10⁹ N m² C⁻²', 'd ≈ 3.0 × 10⁻¹⁴ m'],
      outCubic(range(t, C4, C4 + 0.5)) * out,
      (i) => range(t, C4 + 0.6 + i * ((B.end('closest-4') - C4 - 1.2) / 3), C4 + 0.9 + i * ((B.end('closest-4') - C4 - 1.2) / 3)),
    );

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
