// 09 — Inside the atom. Zoom from the foil into one gold atom, then fire alpha particles past its
// nucleus, showing the impact parameter b. Paths are integrated from a 1/r² repulsion, so the
// deflections are real Rutherford scattering.
import { hash, inOutCubic, lerp, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { arrow, BONE, callout, CLEAN, eq, fadeInk, glow, GOLD, H, heading, MONO, paper, particle, SIGNAL, slate, W, type Ctx } from '../../kit';
import { beats, dur } from './script';

const B = beats(['inside-1', 'inside-2', 'inside-3', 'inside-4', 'inside-5', 'inside-6'], { lead: 0.5, tail: 1.6 });
export const LENGTH = B.length;
const [A1, A2, A3, A4, A5, A6] = ['inside-1', 'inside-2', 'inside-3', 'inside-4', 'inside-5', 'inside-6'].map(B.at);

const CX = W / 2;
const CY = H / 2 + 20;
const SPACING0 = 14; // lattice spacing at the start of the zoom (px)
const SPACING1 = 840; // ... and at the end, when one atom fills the frame
const ATOM_R = SPACING1 * 0.45;
const ZOOM: [number, number] = [A1 + 0.1, A1 + 2.7];

// Trajectories: head-on closest approach d = 2K (unit speed). tan(θ/2) = d / 2b.
const K = 15;
const PX_PER_S = 1100;
type Role = '' | 'b' | 'large' | 'small' | 'head';
/** [impact parameter (px, + is below the axis), launch time, role] */
const SHOTS: [number, number, Role][] = [
  [-330, A2 + 0.3, ''], [280, A2 + 0.7, ''], [-210, A2 + 1.1, ''], [170, A2 + 1.6, ''], [-260, A2 + 2.1, ''],
  [-60, A3 + 1.0, ''], [45, A3 + 1.8, ''],
  [110, A4 + 0.1, 'b'],
  [230, A5 - 0.4, 'large'], [-24, A5 + dur('inside-5') * 0.45 - 0.6, 'small'],
  [3, A6 + 0.1, 'head'],
];

interface Path {
  pts: Float32Array; // x,y pairs relative to the nucleus
  len: Float32Array; // cumulative arc length at each point
}

function integrate(b: number): Path {
  let x = -1150;
  let y = b;
  let vx = 1;
  let vy = 0;
  const pts: number[] = [x, y];
  const len: number[] = [0];
  let L = 0;
  let lastX = x;
  let lastY = y;
  for (let i = 0; i < 20000; i++) {
    const r = Math.hypot(x, y);
    const dt = Math.min(1, r / 60);
    const a = K / (r * r * r);
    vx += a * x * dt;
    vy += a * y * dt;
    x += vx * dt;
    y += vy * dt;
    const step = Math.hypot(x - lastX, y - lastY);
    if (step >= 3) {
      L += step;
      pts.push(x, y);
      len.push(L);
      lastX = x;
      lastY = y;
    }
    if (Math.abs(x) > 1200 || Math.abs(y) > 800) break;
  }
  return { pts: new Float32Array(pts), len: new Float32Array(len) };
}

/** Index of the last point with arc length <= L. */
function indexAt(p: Path, L: number) {
  let lo = 0;
  let hi = p.len.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.len[mid] <= L) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lattice(ctx: Ctx, t: number) {
  const e = inOutCubic(range(t, ZOOM[0], ZOOM[1]));
  const sp = SPACING0 * Math.pow(SPACING1 / SPACING0, e);
  const band = lerp(70, W * 4, Math.pow(e, 0.6)); // the foil strip widens as we zoom in
  const fadeOthers = 1 - range(t, ZOOM[1] - 0.6, ZOOM[1] + 0.1);
  const n = Math.ceil(Math.max(W, H) / 2 / sp) + 1;
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const x = CX + i * sp + (j % 2 ? sp / 2 : 0);
      const y = CY + j * sp * 0.87;
      if (Math.abs(x - CX) > band / 2 || x < -sp || x > W + sp || y < -sp || y > H + sp) continue;
      const centre = i === 0 && j === 0;
      const a = centre ? 1 : fadeOthers * (0.65 + 0.35 * hash(i * 31 + j));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(232,182,74,0.10)';
      ctx.strokeStyle = 'rgba(232,182,74,0.55)';
      ctx.lineWidth = Math.max(1, sp / 300);
      ctx.beginPath();
      ctx.arc(x, y, sp * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, sp * 0.008), 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.globalAlpha = 1;
}

/** Index of the point where the path gets nearest the nucleus. */
function closest(p: Path) {
  let best = 0;
  let bestR = Infinity;
  for (let k = 0; k < p.len.length; k++) {
    const r = Math.hypot(p.pts[k * 2], p.pts[k * 2 + 1]);
    if (r < bestR) [best, bestR] = [k, r];
  }
  return best;
}

/** First point after closest approach that is at least `r` from the nucleus. */
function outbound(p: Path, r: number): [number, number] {
  for (let k = closest(p); k < p.len.length; k++) {
    const x = p.pts[k * 2];
    const y = p.pts[k * 2 + 1];
    if (Math.hypot(x, y) >= r) return [CX + x, CY + y];
  }
  return [CX + p.pts[p.pts.length - 2], CY + p.pts[p.pts.length - 1]];
}

export default class Inside extends Scene {
  private paths = SHOTS.map(([b]) => integrate(b));

  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [41, 48, 52, 57, 59, 64] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: ZOOM[0], kind: 'riser', dur: ZOOM[1] - ZOOM[0] + 0.2, gain: 0.5 },
      { t: ZOOM[1] + 0.2, kind: 'boom', gain: 0.5, pitch: 1.3 },
      { t: A3 + 0.3, kind: 'chime', gain: 0.25, pitch: 2 },
      { t: A3 + 0.65, kind: 'type', dur: 0.65, gain: 0.3 },
      { t: A4 + 0.9, kind: 'chime', gain: 0.25, pitch: 1.5 },
    ];
    this.paths.forEach((p, i) => {
      const [b, t0, role] = SHOTS[i];
      c.push({ t: t0, kind: 'zap', gain: role ? 0.45 : 0.3, pitch: 0.85 + hash(i) * 0.3, pan: -0.7 });
      const t = t0 + p.len[closest(p)] / PX_PER_S;
      const near = Math.abs(b);
      if (near < 15) c.push({ t, kind: 'hit', gain: 0.9, pitch: 0.9 });
      c.push({ t, kind: 'flash', gain: near < 40 ? 0.5 : 0.15, pitch: 0.6 + Math.min(1, 30 / near) * 0.6 });
    });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    paper(bg, { alpha: 0.6 });
    slate(fg, 'RUTHERFORD  /  09 INSIDE', f.t, out);

    fg.save();
    fg.globalAlpha = out;
    if (t < ZOOM[1] + 0.2) lattice(fg, t);
    else this.atom(fg, t);
    fg.restore();

    // Impact parameter: the axis through the nucleus, and b measured to the incoming line.
    const bShow = range(t, A4 + 0.5, A4 + 1.0) * (1 - range(t, B.end('inside-5'), B.end('inside-5') + 0.4)) * out;
    if (bShow > 0) {
      const b = SHOTS.find((s) => s[2] === 'b')![0];
      const x = CX - 300;
      fg.save();
      fg.globalAlpha = bShow;
      fg.strokeStyle = 'rgba(239,230,214,0.5)';
      fg.setLineDash([8, 8]);
      fg.lineWidth = 1.5;
      fg.beginPath();
      fg.moveTo(CX - 900, CY);
      fg.lineTo(CX + 500, CY);
      fg.moveTo(CX - 900, CY + b);
      fg.lineTo(CX + 300, CY + b);
      fg.stroke();
      fg.setLineDash([]);
      arrow(fg, x, CY + b / 2, x, CY + 4, GOLD, 1, 2.5, 12);
      arrow(fg, x, CY + b / 2, x, CY + b - 4, GOLD, 1, 2.5, 12);
      fg.restore();
      eq(fg, 'b', x - 30, CY + b / 2 + 14, 44, GOLD, 'center', bShow);
    }

    // Alpha particles past the nucleus.
    this.paths.forEach((p, i) => {
      const [, t0, role] = SHOTS[i];
      const Ld = (t - t0) * PX_PER_S;
      if (Ld <= 0) return;
      const end = indexAt(p, Ld);
      fg.save();
      fg.globalAlpha = (role ? 0.85 : 0.3) * out;
      fg.strokeStyle = role === 'b' || role === 'large' ? GOLD : SIGNAL;
      fg.lineWidth = role ? 3 : 2;
      fg.beginPath();
      for (let k = 0; k <= end; k++) {
        const x = CX + p.pts[k * 2];
        const y = CY + p.pts[k * 2 + 1];
        k ? fg.lineTo(x, y) : fg.moveTo(x, y);
      }
      fg.stroke();
      fg.restore();
      if (end < p.len.length - 1) {
        const pts: [number, number][] = [];
        for (let k = Math.max(0, end - 12); k <= end; k++) pts.push([CX + p.pts[k * 2], CY + p.pts[k * 2 + 1]]);
        particle(fg, pts, SIGNAL, role ? 8 : 6, out);
      }
      // labels once each highlighted particle has passed the nucleus
      if (role !== 'large' && role !== 'small' && role !== 'head') return;
      const passed = Ld - p.len[closest(p)];
      const la = range(passed, 150, 450) * out * (1 - range(t, L - 1.2, L - 0.6));
      if (la <= 0) return;
      const [lx, ly] = role === 'head' ? [CX - 60, CY - 90] : outbound(p, 420);
      const text =
        role === 'large' ? 'large b → small deflection' : role === 'small' ? 'small b → large deflection' : 'b = 0 → bounces straight back (180°)';
      fg.save();
      fg.globalAlpha = la;
      fg.font = MONO(22, 500);
      fg.fillStyle = role === 'large' ? GOLD : SIGNAL;
      fg.textAlign = lx > CX ? 'left' : 'right';
      fg.fillText(text, lx + (lx > CX ? 20 : -20), ly + (ly > CY ? 30 : -16));
      fg.restore();
    });

    heading(fg, '07 / THE EXPLANATION', 'Inside the atom', t, out);
    callout(fg, CX + 8, CY - 8, CX + 150, CY - 150, 'nucleus · all the + charge', range(t, A3 + 0.3, A3 + 1.3), out * (1 - range(t, A4, A4 + 0.4)));
    fg.save();
    fg.globalAlpha = CLEAN ? 0 : 0.55 * range(t, A3 + 1.5, A3 + 2) * out;
    fg.font = MONO(16, 400);
    fg.fillStyle = BONE;
    fg.textAlign = 'right';
    fg.fillText('not to scale: the real nucleus would be smaller than a pixel here', W - 90, 300);
    fg.restore();

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }

  private atom(ctx: Ctx, t: number) {
    ctx.fillStyle = 'rgba(232,182,74,0.06)';
    ctx.strokeStyle = 'rgba(232,182,74,0.45)';
    ctx.lineWidth = 2.8;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.arc(CX, CY, ATOM_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    for (let k = 0; k < 7; k++) {
      const r = ATOM_R * (0.45 + 0.5 * hash(k + 40));
      const a = hash(k + 70) * Math.PI * 2 + t * (0.5 + hash(k + 90)) * (k % 2 ? 1 : -1);
      ctx.fillStyle = 'rgba(239,230,214,0.75)';
      ctx.beginPath();
      ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    glow(ctx, CX, CY, 8 + 4 * range(t, A3, A3 + 0.4) * (1 - range(t, A3 + 1.2, A3 + 2)), SIGNAL, range(t, ZOOM[1], ZOOM[1] + 0.5));
  }
}
