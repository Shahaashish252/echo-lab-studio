// 11 — How small is the nucleus? A continuous zoom from the atom (~10⁻¹⁰ m) down to the
// nucleus (~10⁻¹⁵ m), then the textbook analogy: a cricket ball in an atom 5 km in radius.
import { hash, inOutCubic, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { arrow, BONE, DISPLAY, fadeInk, glow, GOLD, H, heading, MONO, paper, SIGNAL, slate, W, type Ctx } from '../../kit';
import { beats } from './script';

const B = beats(['scale-1', ['scale-2', 0.4]], { lead: 0.6, tail: 1.8 });
export const LENGTH = B.length;
const [S1, S2] = ['scale-1', 'scale-2'].map(B.at);
const ZOOM: [number, number] = [S1 + 0.8, B.end('scale-1') - 0.2];

const CX = W / 2;
const CY = H / 2 + 20;
const ATOM_R = 360; // px at zoom 1
const NUC_R_END = 150; // nucleus radius at the end of the zoom
const RATIO = 1e-5; // nucleus / atom
const ZEND = NUC_R_END / (ATOM_R * RATIO);

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const pow10 = (n: number) => `10${String(n).split('').map((c) => SUP[c]).join('')}`;

function zoomPart(ctx: Ctx, t: number, a: number) {
  if (a <= 0) return;
  const e = inOutCubic(range(t, ZOOM[0], ZOOM[1]));
  const z = Math.pow(ZEND, e);
  const atomR = ATOM_R * z;
  const nucR = ATOM_R * RATIO * z;
  ctx.save();
  ctx.globalAlpha = a;
  // atom boundary and electrons, until they leave the frame
  if (atomR < 4000) {
    ctx.strokeStyle = 'rgba(232,182,74,0.5)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.arc(CX, CY, atomR * outBack(range(t, S1, S1 + 0.6), 1.3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let k = 0; k < 8; k++) {
    const r = atomR * (0.5 + 0.45 * hash(k + 3));
    if (r > 3000) continue;
    const ang = hash(k + 11) * Math.PI * 2 + t * 0.6 * (k % 2 ? 1 : -1);
    ctx.fillStyle = 'rgba(239,230,214,0.8)';
    ctx.beginPath();
    ctx.arc(CX + Math.cos(ang) * r, CY + Math.sin(ang) * r, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // powers-of-ten rings sweeping past: a circle for each size from 10⁻¹¹ to 10⁻¹⁴ m
  for (let n = 11; n <= 14; n++) {
    const r = ATOM_R * Math.pow(10, 10 - n) * z;
    if (r < 30 || r > 1400) continue;
    const fade = Math.min(1, (r - 30) / 60) * Math.min(1, (1400 - r) / 300);
    ctx.strokeStyle = `rgba(239,230,214,${0.28 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = MONO(18, 500);
    ctx.fillStyle = `rgba(239,230,214,${0.6 * fade})`;
    ctx.textAlign = 'left';
    ctx.fillText(`${pow10(-n)} m`, CX + r * 0.72 + 8, CY - r * 0.72);
  }
  // nucleus: a speck that grows into a ball of nucleons
  if (nucR < 6) glow(ctx, CX, CY, Math.max(2.5, nucR), SIGNAL, 1);
  else {
    const g = ctx.createRadialGradient(CX - nucR * 0.3, CY - nucR * 0.3, nucR * 0.1, CX, CY, nucR);
    g.addColorStop(0, '#ffb08a');
    g.addColorStop(1, '#c83e12');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(CX, CY, nucR, 0, Math.PI * 2);
    ctx.fill();
  }
  // labels
  ctx.font = MONO(24, 500);
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(232,182,74,${range(t, S1 + 0.2, S1 + 0.6) * (1 - range(t, ZOOM[0], ZOOM[0] + 0.5))})`;
  ctx.fillText(`atom ≈ ${pow10(-10)} m across`, CX, CY + ATOM_R + 50);
  ctx.fillStyle = `rgba(255,140,90,${range(t, ZOOM[1] - 0.3, ZOOM[1] + 0.2)})`;
  ctx.fillText(`nucleus ≈ ${pow10(-15)} m across`, CX, CY + NUC_R_END + 50);
  // a running read-out of how wide the view is
  const mPerPx = 1e-10 / (2 * ATOM_R) / z;
  const exp = Math.round(Math.log10(W * mPerPx));
  ctx.textAlign = 'left';
  ctx.font = MONO(20, 500);
  ctx.fillStyle = 'rgba(239,230,214,0.75)';
  ctx.fillText(`view width ≈ ${pow10(exp)} m`, 140, 300);
  ctx.fillStyle = 'rgba(239,230,214,0.12)';
  ctx.fillRect(140, 318, 400, 6);
  ctx.fillStyle = SIGNAL;
  ctx.fillRect(140, 318, 400 * e, 6);
  ctx.restore();
  const big = outBack(range(t, ZOOM[1], ZOOM[1] + 0.5), 1.8) * a;
  if (big > 0) {
    ctx.save();
    ctx.globalAlpha = big;
    ctx.font = DISPLAY(92, 900);
    ctx.fillStyle = SIGNAL;
    ctx.textAlign = 'left';
    ctx.fillText('× 100,000', CX + NUC_R_END + 70, CY + 30);
    ctx.font = MONO(20, 500);
    ctx.fillStyle = BONE;
    ctx.fillText('smaller than the atom', CX + NUC_R_END + 76, CY + 70);
    ctx.restore();
  }
}

/** A city-sized circle with a cricket ball at its centre, plus a magnified inset of the ball. */
function analogy(ctx: Ctx, t: number, a: number) {
  if (a <= 0) return;
  const cx = 820;
  const cy = 560;
  const R = 360 * outCubic(range(t, S2, S2 + 0.8));
  ctx.save();
  ctx.globalAlpha = a;
  // "city" blocks inside the atom
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(232,182,74,0.05)';
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  for (let i = -9; i <= 9; i++)
    for (let j = -9; j <= 9; j++) {
      if (hash(i * 31 + j * 7) < 0.25) continue;
      const w = 22 + hash(i + j * 13) * 18;
      const h = 22 + hash(i * 5 + j) * 18;
      ctx.fillStyle = 'rgba(239,230,214,0.06)';
      ctx.fillRect(cx + i * 42 - w / 2, cy + j * 42 - h / 2, w, h);
    }
  ctx.restore();
  ctx.strokeStyle = 'rgba(232,182,74,0.6)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // radius: 5 km
  const ra = range(t, S2 + 1.6, S2 + 2.4);
  if (ra > 0) {
    arrow(ctx, cx, cy, cx + R * Math.cos(-0.5), cy + R * Math.sin(-0.5), GOLD, outCubic(ra), 2.5, 13);
    ctx.font = DISPLAY(40, 800);
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = a * ra;
    ctx.fillText('≈ 5 km', cx + 150, cy - 130);
    ctx.globalAlpha = a;
  }
  // the ball at the centre
  ctx.fillStyle = '#c81e1e';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  // magnified inset
  const ins = outBack(range(t, S2 + 0.7, S2 + 1.3), 1.5);
  if (ins > 0) {
    const ix = 1500;
    const iy = 470;
    const ir = 150 * ins;
    ctx.strokeStyle = 'rgba(239,230,214,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 4);
    ctx.lineTo(ix - ir * 0.7, iy - ir * 0.7);
    ctx.moveTo(cx + 6, cy + 4);
    ctx.lineTo(ix - ir * 0.7, iy + ir * 0.7);
    ctx.stroke();
    ctx.fillStyle = 'rgba(20,17,14,0.9)';
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const br = ir * 0.62;
    const g = ctx.createRadialGradient(ix - br * 0.3, iy - br * 0.35, br * 0.1, ix, iy, br);
    g.addColorStop(0, '#e84a3a');
    g.addColorStop(1, '#7a0f0f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ix, iy, br, 0, Math.PI * 2);
    ctx.fill();
    // seam with stitches
    ctx.strokeStyle = '#f4ecdf';
    ctx.lineWidth = 2;
    for (const off of [-0.18, 0.18]) {
      ctx.beginPath();
      ctx.ellipse(ix + off * br, iy, br * 0.25, br * 0.97, 0, -Math.PI / 2, Math.PI / 2, off < 0);
      ctx.stroke();
    }
    ctx.font = MONO(20, 500);
    ctx.fillStyle = BONE;
    ctx.textAlign = 'center';
    ctx.fillText('nucleus = a cricket ball', ix, iy + ir + 40);
    ctx.fillStyle = 'rgba(239,230,214,0.6)';
    ctx.fillText('atom = everything out to 5 km', ix, iy + ir + 72);
  }
  ctx.restore();
}

export default class Scale extends Scene {
  cues(dur: number): Cue[] {
    return [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [41, 48, 53, 57, 60, 65] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: ZOOM[0], kind: 'riser', dur: ZOOM[1] - ZOOM[0], gain: 0.5 },
      { t: ZOOM[1], kind: 'boom', gain: 0.5, pitch: 1.4 },
      { t: ZOOM[1] + 0.1, kind: 'chime', gain: 0.35, pitch: 1.5 },
      { t: S2 - 0.3, kind: 'whoosh', dur: 0.6, gain: 0.35 },
      { t: S2 + 0.8, kind: 'pop', gain: 0.5, pitch: 0.8 },
      { t: S2 + 1.7, kind: 'chime', gain: 0.3, pitch: 2 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  11 SCALE', f.t, out);
    heading(fg, '09 / HOW SMALL?', 'The size of the nucleus', t, out * (1 - range(t, ZOOM[0] + 0.2, ZOOM[0] + 0.6)));
    zoomPart(fg, t, out * (1 - range(t, S2 - 0.4, S2)));
    analogy(fg, t, out * range(t, S2 - 0.1, S2 + 0.3));
    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
