// 13 — Limitations. An orbiting electron accelerates toward the centre, radiates, spirals in and
// the atom collapses (~10⁻⁸ s); and the model predicts a continuous spectrum, not the line spectra seen.
import { outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { arrow, BONE, DISPLAY, eq, fadeInk, glow, GOLD, heading, MONO, paper, SIGNAL, slate, type Ctx } from '../../kit';
import { beats } from './script';

const B = beats(['limits-1', 'limits-2', 'limits-3', ['limits-4', 0.3]], { lead: 0.6, tail: 1.4 });
export const LENGTH = B.length;
const [L1, L2, L3, L4] = ['limits-1', 'limits-2', 'limits-3', 'limits-4'].map(B.at);

const NX = 640;
const NY = 560;
const R = 240;
const W0 = 2.2; // rad/s in the stable orbit
const SPIRAL: [number, number] = [L3 + 0.3, L3 + 3.2];
const E_BLUE = '#9fd8ff';

// Spiral: r falls to 0 while the angle speeds up (ω ∝ r^-1.5). Tabulate angle against progress.
const SP_N = 600;
const SP_ANG: number[] = [0];
for (let i = 1; i <= SP_N; i++) {
  const u = (i - 0.5) / SP_N;
  const r = Math.max(0.04, Math.pow(1 - u, 0.6));
  SP_ANG.push(SP_ANG[i - 1] + ((W0 * (SPIRAL[1] - SPIRAL[0])) / SP_N) * Math.min(25, Math.pow(r, -1.5)));
}

/** Electron position: steady orbit, then the spiral. Returns [x, y, r, angle]. */
function electron(t: number): [number, number, number, number] {
  const ang0 = W0 * t;
  if (t <= SPIRAL[0]) return [NX + Math.cos(ang0) * R, NY + Math.sin(ang0) * R, R, ang0];
  const u = range(t, SPIRAL[0], SPIRAL[1]);
  const i = Math.min(SP_N, Math.floor(u * SP_N));
  const ang = W0 * SPIRAL[0] + SP_ANG[i];
  const r = R * Math.pow(1 - u, 0.6);
  return [NX + Math.cos(ang) * r, NY + Math.sin(ang) * r, r, ang];
}

function spectra(ctx: Ctx, t: number, a: number) {
  if (a <= 0) return;
  const x0 = 1100;
  const w = 720;
  const xOf = (nm: number) => x0 + ((nm - 400) / 300) * w;
  const rows: [string, number, boolean][] = [
    ['Rutherford model predicts: a continuous spectrum', 380, false],
    ['Observed, hydrogen: a line spectrum', 590, true],
  ];
  rows.forEach(([label, y, lines], k) => {
    const wipe = outCubic(range(t, L4 + 0.5 + k * 1.4, L4 + 1.4 + k * 1.4));
    if (wipe <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = MONO(20, 500);
    ctx.fillStyle = BONE;
    ctx.fillText(label, x0, y - 22);
    ctx.beginPath();
    ctx.rect(x0, y, w * wipe, 70);
    ctx.clip();
    if (!lines) {
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      ['#7a00ff', '#2b3cff', '#00b8ff', '#00e07a', '#d8f000', '#ffb000', '#ff4a00', '#d80000'].forEach((c, i, arr) => g.addColorStop(i / (arr.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(x0, y, w, 70);
    } else {
      ctx.fillStyle = '#050403';
      ctx.fillRect(x0, y, w, 70);
      const hLines: [number, string][] = [[410, '#8a2bff'], [434, '#4b3bff'], [486, '#00c8ff'], [656, '#ff2a1a']];
      for (const [nm, c] of hLines) {
        glow(ctx, xOf(nm), y + 35, 4, c, 0.5);
        ctx.fillStyle = c;
        ctx.fillRect(xOf(nm) - 2.5, y, 5, 70);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a * wipe;
    ctx.strokeStyle = 'rgba(239,230,214,0.35)';
    ctx.strokeRect(x0, y, w, 70);
    ctx.font = MONO(16, 400);
    ctx.fillStyle = 'rgba(239,230,214,0.55)';
    ctx.fillText('400 nm', x0, y + 96);
    ctx.textAlign = 'right';
    ctx.fillText('700 nm', x0 + w, y + 96);
    ctx.restore();
    // verdicts
    const v = outBack(range(t, L4 + 3.4 + k * 0.4, L4 + 3.8 + k * 0.4), 2.5) * a;
    if (v > 0) {
      ctx.save();
      ctx.globalAlpha = v;
      ctx.font = DISPLAY(54, 900);
      ctx.fillStyle = lines ? '#7ee07a' : SIGNAL;
      ctx.fillText(lines ? '✓' : '✗', x0 + w + 24, y + 54);
      ctx.restore();
    }
  });
}

export default class Limits extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [38, 45, 48, 53, 56] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: L1 + 1.5, kind: 'pop', gain: 0.4, pitch: 1.2 },
      { t: SPIRAL[0], kind: 'riser', dur: SPIRAL[1] - SPIRAL[0], gain: 0.55 },
      { t: SPIRAL[1], kind: 'boom', gain: 0.9 },
      { t: SPIRAL[1] + 0.05, kind: 'slowmo', gain: 0.5 },
      { t: L4 + 0.5, kind: 'whoosh', dur: 0.7, gain: 0.3 },
      { t: L4 + 1.9, kind: 'whoosh', dur: 0.7, gain: 0.3 },
      { t: L4 + 3.4, kind: 'hit', gain: 0.5, pitch: 1.4 },
      { t: L4 + 3.8, kind: 'chime', gain: 0.35, pitch: 2 },
    ];
    for (let k = 0; L2 + 0.3 + k * 0.35 < SPIRAL[1]; k++) c.push({ t: L2 + 0.3 + k * 0.35, kind: 'flash', gain: 0.08, pitch: 0.5 + k * 0.03 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  13 LIMITATIONS', f.t, out);
    heading(fg, '11 / THE PROBLEM', 'Limitations of the model', t, out);

    const dimLeft = 1 - 0.55 * range(t, L4, L4 + 0.6);
    const atomA = range(t, L1 - 0.3, L1 + 0.4) * out * dimLeft;
    const [ex, ey, er, ang] = electron(t);
    const collapsed = t >= SPIRAL[1];
    if (atomA > 0) {
      fg.save();
      fg.globalAlpha = atomA;
      // original orbit, dashed
      fg.strokeStyle = 'rgba(239,230,214,0.3)';
      fg.setLineDash([5, 9]);
      fg.beginPath();
      fg.arc(NX, NY, R, 0, Math.PI * 2);
      fg.stroke();
      fg.setLineDash([]);
      // spiral trail
      if (t > SPIRAL[0]) {
        fg.strokeStyle = E_BLUE;
        fg.globalAlpha = atomA * 0.7;
        fg.lineWidth = 2;
        fg.beginPath();
        for (let s = SPIRAL[0]; s <= Math.min(t, SPIRAL[1]); s += 1 / 240) {
          const [x, y] = electron(s);
          s === SPIRAL[0] ? fg.moveTo(x, y) : fg.lineTo(x, y);
        }
        fg.stroke();
        fg.globalAlpha = atomA;
      }
      fg.restore();
      glow(fg, NX, NY, 16 + (collapsed ? 30 * Math.exp(-(t - SPIRAL[1]) * 3) : 0), SIGNAL, atomA);
      eq(fg, '+', NX, NY + 9, 30, '#1b1411', 'center', atomA);
      if (!collapsed) {
        glow(fg, ex, ey, 9, E_BLUE, atomA);
        // velocity (tangent) and acceleration (to the centre)
        const va = range(t, L1 + 1.2, L1 + 1.8) * (1 - range(t, SPIRAL[0], SPIRAL[0] + 0.3)) * atomA;
        if (va > 0) {
          const tx = -Math.sin(ang);
          const ty = Math.cos(ang);
          fg.save();
          fg.globalAlpha = va;
          arrow(fg, ex, ey, ex + tx * 110, ey + ty * 110, BONE, 1, 2.5, 12);
          arrow(fg, ex, ey, ex + (NX - ex) * 0.42, ey + (NY - ey) * 0.42, SIGNAL, 1, 3, 13);
          fg.restore();
          eq(fg, 'v', ex + tx * 130, ey + ty * 130 + 10, 32, BONE, 'center', va);
          eq(fg, 'a', ex + (NX - ex) * 0.55 + 18, ey + (NY - ey) * 0.55, 32, SIGNAL, 'center', va);
        }
      }
      // radiation: ripples leaving the electron
      if (t > L2 + 0.3) {
        for (let k = 0; ; k++) {
          const te = L2 + 0.3 + k * 0.35;
          if (te > t || te > SPIRAL[1]) break;
          const age = t - te;
          if (age > 1.6) continue;
          const [px, py] = electron(te);
          fg.save();
          fg.globalAlpha = atomA * (1 - age / 1.6) * 0.6;
          fg.strokeStyle = GOLD;
          fg.lineWidth = 2;
          fg.beginPath();
          fg.arc(px, py, 20 + age * 160, 0, Math.PI * 2);
          fg.stroke();
          fg.restore();
        }
      }
    }

    const lab = (text: string, y: number, a: number, color = BONE) => {
      if (a <= 0) return;
      fg.save();
      fg.globalAlpha = a * out * dimLeft;
      fg.font = MONO(21, 500);
      fg.fillStyle = color;
      fg.fillText(text, 140, y);
      fg.restore();
    };
    lab('circular motion = constant acceleration toward the centre', 880, range(t, L1 + 1.8, L1 + 2.4) * (1 - range(t, L2, L2 + 0.3)));
    lab('accelerating charge → emits EM waves → loses energy', 880, range(t, L2 + 0.5, L2 + 1.0) * (1 - range(t, SPIRAL[0], SPIRAL[0] + 0.3)), GOLD);
    if (t > SPIRAL[0]) {
      const u = range(t, SPIRAL[0], SPIRAL[1]);
      lab(`orbit radius ${(100 * (er / R)).toFixed(0)}%   ·   t ≈ ${u < 1 ? (u * 1.0).toFixed(2) : '1.00'} × 10⁻⁸ s`, 880, 1 - range(t, SPIRAL[1] + 1.0, SPIRAL[1] + 1.4), E_BLUE);
    }
    const col = outBack(range(t, SPIRAL[1], SPIRAL[1] + 0.4), 2) * out * (1 - range(t, L4 - 0.3, L4 + 0.2));
    if (col > 0) {
      fg.save();
      fg.globalAlpha = col;
      fg.font = DISPLAY(70, 900);
      fg.fillStyle = SIGNAL;
      fg.fillText('COLLAPSE', NX + R + 60, NY + 24);
      fg.restore();
      lab('…but real atoms are stable', 880, range(t, SPIRAL[1] + 1.2, SPIRAL[1] + 1.7), SIGNAL);
    }

    spectra(fg, t, range(t, L4, L4 + 0.4) * out);
    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
