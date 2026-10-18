// 04 — Alpha particles: emitted by a radioactive nucleus; what one is; how fast and energetic.
import { clamp, hash, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, glow, GOLD, heading, INK, MONO, paper, particle, SIGNAL, slate, W, type Ctx } from '../../kit';
import { stream } from './intro';
import { beats } from './script';

const B = beats(['alpha-1', 'alpha-2', 'alpha-3', 'alpha-4'], { lead: 0.5, tail: 1.1 });
export const LENGTH = B.length;

const NUC = { x: 470, y: 560 };

// A big nucleus: nucleons packed on a sunflower spiral.
const PARENT: [number, number, boolean][] = [];
for (let i = 0; i < 90; i++) {
  const r = Math.sqrt(i + 0.5) * 13;
  const a = i * 2.39996;
  PARENT.push([Math.cos(a) * r, Math.sin(a) * r, hash(i * 3.3) < 0.45]);
}

function nucleon(ctx: Ctx, x: number, y: number, r: number, proton: boolean, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, proton ? '#ffb08a' : '#fffaf0');
  g.addColorStop(1, proton ? '#c83e12' : '#a99c88');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** He-4: 2 protons + 2 neutrons. */
export function helium(ctx: Ctx, x: number, y: number, r: number, labels = 0) {
  const parts: [number, number, boolean][] = [
    [-0.55, -0.5, true], [0.55, 0.5, true], [0.55, -0.5, false], [-0.55, 0.5, false],
  ];
  for (const [dx, dy, p] of parts) nucleon(ctx, x + dx * r * 1.15, y + dy * r * 1.15, r, p);
  if (labels > 0) {
    ctx.save();
    ctx.globalAlpha *= labels;
    ctx.font = DISPLAY(r * 0.9, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    for (const [dx, dy, p] of parts) ctx.fillText(p ? '+' : 'n', x + dx * r * 1.15, y + dy * r * 1.15 + 2);
    ctx.restore();
  }
}

export default class Alpha extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [43, 50, 55, 59, 62] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: B.at('alpha-2') + 0.2, kind: 'boom', gain: 0.35, pitch: 1.6 },
      { t: B.at('alpha-2') + 1.3, kind: 'chime', gain: 0.25, pitch: 1.5 },
      { t: B.at('alpha-3') + 0.5, kind: 'riser', dur: 1.6, gain: 0.35 },
    ];
    for (let k = 0; this.emitAt(k) < B.at('alpha-2') - 0.2; k++) c.push({ t: this.emitAt(k), kind: 'zap', gain: 0.5, pitch: 0.85, pan: -0.5 });
    [0, 1, 2].forEach((k) => c.push({ t: B.at('alpha-4') + 0.6 + k * 0.45, kind: 'pop', gain: 0.45, pitch: 1 + k * 0.25 }));
    return c;
  }

  private emitAt(k: number) {
    return B.at('alpha-1') + 1.2 + k * 1.1;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    const [a1, a2, a3, a4] = ['alpha-1', 'alpha-2', 'alpha-3', 'alpha-4'].map(B.at);
    paper(bg);
    stream(bg, t, range(t, a4, a4 + 0.6) * out, 34);
    slate(fg, 'RUTHERFORD  /  04 ALPHA', f.t, out);
    heading(fg, '03 / THE PROBE', 'Alpha particles', t, out);

    // A radioactive nucleus that shudders and spits out alpha particles.
    const ns = outBack(range(t, a1 - 0.2, a1 + 0.5), 1.5);
    if (ns > 0) {
      fg.save();
      fg.globalAlpha = out;
      glow(fg, NUC.x, NUC.y, 70 * ns, 'rgba(255,90,31,0.25)');
      PARENT.forEach(([x, y, p], i) => {
        const j = Math.sin(t * 23 + i) * 1.6;
        nucleon(fg, NUC.x + (x + j) * ns, NUC.y + (y - j) * ns, 11 * ns, p);
      });
      fg.font = MONO(20, 500);
      fg.fillStyle = 'rgba(239,230,214,0.7)';
      fg.textAlign = 'center';
      fg.fillText('radioactive nucleus (e.g. radium)', NUC.x, NUC.y + 190);
      fg.restore();
      for (let k = 0; ; k++) {
        const t0 = this.emitAt(k);
        if (t0 > t) break;
        const x = NUC.x + 140 + (t - t0) * 900;
        if (x > W + 100) continue;
        const pts: [number, number][] = [];
        for (let j = 10; j >= 0; j--) pts.push([Math.max(NUC.x + 140, x - j * 14), NUC.y - 10 + (k % 3) * 10]);
        particle(fg, pts, SIGNAL, 2, out * 0.6);
        fg.save();
        fg.globalAlpha = out;
        helium(fg, x, NUC.y - 10 + (k % 3) * 10, 9);
        fg.restore();
      }
    }

    // What an alpha particle is: a big He-4 with labels.
    const he = outBack(range(t, a2, a2 + 0.6), 1.5) * out;
    if (he > 0) {
      fg.save();
      fg.globalAlpha = he;
      helium(fg, 1180, 470, 46 * he, range(t, a2 + 0.6, a2 + 1.0));
      fg.restore();
      fg.save();
      fg.globalAlpha = out * range(t, a2 + 0.4, a2 + 0.9);
      fg.font = DISPLAY(96, 900);
      fg.fillStyle = BONE;
      fg.fillText('He', 1340, 500);
      fg.font = DISPLAY(48, 900);
      fg.fillStyle = SIGNAL;
      fg.fillText('2+', 1462, 445);
      fg.font = MONO(22, 500);
      const facts = ['2 protons + 2 neutrons', 'charge  +2e', 'mass    ≈ 4 u  (~7300 × electron)'];
      facts.forEach((s, i) => {
        fg.globalAlpha = out * range(t, a2 + 1.0 + i * 0.7, a2 + 1.4 + i * 0.7);
        fg.fillStyle = BONE;
        fg.fillText(s, 1340, 560 + i * 38);
      });
      fg.restore();
    }

    // Speed and energy gauges.
    const g = range(t, a3 + 0.3, a3 + 0.8) * out;
    if (g > 0) {
      const x = 1040;
      // bars: speed on a 0–c scale, energy on a 0–10 MeV scale
      const rows: [string, string, number, string, string][] = [
        ['speed', '≈ 2 × 10⁷ m/s  (~7% of light)', outCubic(range(t, a3 + 0.6, a3 + 2.2)) * 0.07, SIGNAL, 'c'],
        ['energy', '≈ 4–8 MeV per particle', outCubic(range(t, a3 + 2.6, a3 + 4.0)) * 0.6, GOLD, '10 MeV'],
      ];
      rows.forEach(([label, val, fill, color, max], i) => {
        const y = 760 + i * 80;
        fg.save();
        fg.globalAlpha = g;
        fg.font = MONO(18, 500);
        fg.fillStyle = 'rgba(239,230,214,0.6)';
        fg.fillText(label.toUpperCase(), x, y - 14);
        fg.fillStyle = 'rgba(239,230,214,0.12)';
        fg.fillRect(x, y, 760, 14);
        fg.fillStyle = color;
        fg.fillRect(x, y, 760 * clamp(fill), 14);
        fg.font = MONO(16, 400);
        fg.fillStyle = 'rgba(239,230,214,0.5)';
        fg.textAlign = 'right';
        fg.fillText(max, x + 760, y + 36);
        fg.textAlign = 'left';
        fg.font = MONO(20, 500);
        fg.fillStyle = BONE;
        fg.fillText(val, x + 240, y - 14);
        fg.restore();
      });
    }

    // Tags: fast, heavy, positive.
    ['FAST', 'HEAVY', 'POSITIVE'].forEach((w, k) => {
      const a = outBack(range(t, a4 + 0.6 + k * 0.45, a4 + 0.9 + k * 0.45), 2.2) * out;
      if (a <= 0) return;
      fg.save();
      fg.translate(1180 + k * 210, 330);
      fg.scale(a, a);
      fg.fillStyle = k === 2 ? SIGNAL : 'rgba(239,230,214,0.12)';
      fg.strokeStyle = SIGNAL;
      fg.lineWidth = 2;
      fg.beginPath();
      fg.roundRect(-90, -30, 180, 52, 26);
      fg.fill();
      fg.stroke();
      fg.font = DISPLAY(26, 800);
      fg.textAlign = 'center';
      fg.fillStyle = k === 2 ? INK : BONE;
      fg.fillText(w, 0, 5);
      fg.restore();
    });

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
