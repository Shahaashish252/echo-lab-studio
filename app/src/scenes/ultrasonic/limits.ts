// 11 — Blind spots. Three panels: foam swallows the ping; an angled wall throws the echo away
// from the receiver; temperature changes the speed of sound.
import { clamp, lerp, range, smooth } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, eq, fadeInk, MONO, paper, SIGNAL, type Ctx } from '../../kit';
import { beats } from './script';
import { arcs, CYAN, DIM, headingV, label, panel, sensorSide } from './ui';

const B = beats(['limits-1', 'limits-2', 'limits-3'], { lead: 0.4, tail: 1.0 });
export const LENGTH = B.length;

const PANELS = [
  { id: 'limits-1', y: 410, title: 'SOFT SURFACES', sub: 'sound is absorbed' },
  { id: 'limits-2', y: 700, title: 'ANGLED SURFACES', sub: 'echo bounces away' },
  { id: 'limits-3', y: 990, title: 'TEMPERATURE', sub: 'changes the speed of sound' },
];
const PH = 270;
const V = 520;

function foam(ctx: Ctx, x: number, y0: number, y1: number, a: number) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#c96b8a';
  ctx.beginPath();
  ctx.moveTo(x + 140, y0);
  ctx.lineTo(x, y0);
  for (let y = y0; y <= y1; y += 30) ctx.quadraticCurveTo(x - 22, y + 15, x, y + 30);
  ctx.lineTo(x + 140, y1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let k = 0; k < 18; k++) {
    ctx.beginPath();
    ctx.arc(x + 20 + ((k * 37) % 110), y0 + 15 + ((k * 53) % (y1 - y0 - 20)), 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export default class Limits extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'pad', dur, notes: [38, 45, 50, 53, 57] }, ...B.cues()];
    PANELS.forEach((p, i) => {
      const a = B.at(p.id);
      c.push({ t: a, kind: 'pop', gain: 0.5, pitch: 1 + i * 0.1 });
      if (i < 2) for (let s = a + 0.4; s < B.end(p.id); s += 1.3) c.push({ t: s, kind: 'zap', gain: 0.25, pitch: 1.8 });
    });
    c.push({ t: B.at('limits-1') + 1.6, kind: 'flash', gain: 0.4, pitch: 0.6 });
    c.push({ t: B.at('limits-3') + 0.8, kind: 'riser', dur: 1.8, gain: 0.3 });
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'WATCH OUT', 'Blind spots', t, out);

    PANELS.forEach((p, i) => {
      const a0 = B.at(p.id);
      const appear = range(t, a0 - 0.2, a0 + 0.3);
      const next = PANELS[i + 1];
      const active = next ? 1 - range(t, B.at(next.id) - 0.2, B.at(next.id) + 0.2) : 1;
      const a = appear * lerp(0.4, 1, active) * out;
      if (a <= 0) return;
      const y = p.y;
      fg.save();
      fg.translate(0, (1 - appear) * 40);
      panel(fg, 50, y, 980, PH, a, active > 0.5 ? SIGNAL : 'rgba(239,230,214,0.2)');
      label(fg, `${i + 1}  ${p.title}`, 90, y + 56, DISPLAY(40, 900), active > 0.5 ? SIGNAL : BONE, a, 'left');
      label(fg, p.sub, 90, y + 96, MONO(24, 500), DIM, a, 'left');
      const cy = y + 185;
      const lt = t - a0;
      if (i < 2) {
        const { tx } = sensorSide(fg, 140, cy - 8, 0.36, { alpha: a });
        fg.save();
        fg.beginPath();
        fg.rect(55, y + 110, 970, PH - 115);
        fg.clip();
        if (i === 0) {
          foam(fg, 760, y + 115, y + PH - 10, a);
          const fronts: number[] = [];
          for (let s = 0.4; s < lt; s += 1.3) fronts.push((lt - s) * V);
          arcs(fg, tx[0], tx[1], 0, 0.7, fronts.flatMap((r) => [r, r - 18, r - 36]).filter((r) => r > 0), CYAN, (_, r) => {
            const into = r - (760 - tx[0]);
            return a * (into < 0 ? 1 : clamp(1 - into / 80));
          }, 4);
          label(fg, 'no echo', 600, cy + 70, MONO(26, 500), SIGNAL, a * range(lt, 1.6, 1.9));
        } else {
          // wall tilted 35°: the echo heads up and out of the panel
          const wx = 780;
          const ang = (35 * Math.PI) / 180;
          fg.save();
          fg.globalAlpha = a;
          fg.translate(wx, cy);
          fg.rotate(-ang);
          fg.fillStyle = '#7a3e2a';
          fg.fillRect(0, -140, 34, 280);
          fg.fillStyle = 'rgba(255,255,255,0.15)';
          fg.fillRect(0, -140, 5, 280);
          fg.restore();
          for (let s = 0.4; s < lt; s += 1.3) {
            const d = (lt - s) * V;
            const hitD = wx - tx[0];
            // a ray-style packet: travels right, reflects off the tilted wall
            for (let k = 0; k < 3; k++) {
              const dd = d - k * 22;
              if (dd <= 0) continue;
              let px: number;
              let py: number;
              let col = CYAN;
              let dir = 0;
              if (dd < hitD) {
                px = tx[0] + dd;
                py = tx[1];
              } else {
                const r = dd - hitD;
                dir = Math.PI - 2 * ang; // mirror of (1, 0) in the tilted face
                px = wx + Math.cos(dir) * r;
                py = tx[1] + Math.sin(dir) * r;
                col = SIGNAL;
              }
              arcs(fg, px - Math.cos(dir) * 40, py - Math.sin(dir) * 40, dir, 0.9, [40], col, () => a * clamp(1 - dd / 900), 4);
            }
          }
          label(fg, 'missed!', 940, y + 150, MONO(26, 500), SIGNAL, a * range(lt, 1.7, 2.0), 'right');
        }
        fg.restore();
      } else {
        // thermometer + formula
        const k = smooth(range(lt, 0.8, 3.2));
        const T = Math.round(lerp(0, 40, k));
        const v = 331 + 0.6 * T;
        const tx0 = 150;
        fg.save();
        fg.globalAlpha = a;
        fg.fillStyle = 'rgba(239,230,214,0.15)';
        fg.beginPath();
        fg.roundRect(tx0 - 14, y + 110, 28, 120, 14);
        fg.fill();
        fg.fillStyle = SIGNAL;
        fg.beginPath();
        fg.arc(tx0, y + 236, 22, 0, Math.PI * 2);
        fg.fill();
        const h = lerp(20, 110, k);
        fg.fillRect(tx0 - 7, y + 230 - h, 14, h);
        fg.restore();
        label(fg, `${T} °C`, 260, y + 190, MONO(44, 500), BONE, a, 'left');
        eq(fg, `v = 331 + 0.6 × T`, 990, y + 160, 44, CYAN, 'right', a);
        label(fg, `= ${v.toFixed(0)} m/s`, 990, y + 225, MONO(40, 500), BONE, a, 'right');
      }
      fg.restore();
    });

    B.subs(fg, t, 1440);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
