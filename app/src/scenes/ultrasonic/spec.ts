// 10 — Range and beam. The sensor faces up; a ruler runs from 2 cm to 4 m, pulses climb the
// 15° beam, and a ball moving through it gets measured.
import { clamp, inOutCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, MONO, paper, SIGNAL, W } from '../../kit';
import { beats } from './script';
import { arcs, CYAN, DIM, GREEN, headingV, label, sensorSide } from './ui';

const B = beats(['spec-1', 'spec-2'], { lead: 0.4, tail: 1.0 });
export const LENGTH = B.length;

const SX = W / 2;
const SY = 1250;
const SS = 0.75;
const FACE = SY - 86 * SS;
const PX_PER_M = 175;
const yAt = (m: number) => FACE - m * PX_PER_M;
const HALF = (7.5 * Math.PI) / 180;
const S2 = B.at('spec-2');

const ballM = (t: number) => 1 + 2.2 * (0.5 + 0.5 * Math.sin(t * 1.1 - 1));
const ballX = (t: number) => SX + Math.sin(t * 0.7) * 30;

export default class Spec extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'pad', dur, notes: [45, 52, 57, 60, 64] }, ...B.cues()];
    for (let t = 0.8; t < dur - 0.5; t += 0.6) c.push({ t, kind: 'zap', gain: 0.18, pitch: 1.9 });
    c.push({ t: 1.2, kind: 'pop', gain: 0.5 }, { t: 2.2, kind: 'pop', gain: 0.5, pitch: 1.2 }, { t: S2 + 0.4, kind: 'servo', dur: 0.8, gain: 0.3 });
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'THE SPECS', 'Range & beam', t, out);

    // beam cone (wider while we talk about the angle, for legibility)
    const wide = 1 + 0.25 * inOutCubic(range(t, S2, S2 + 0.6));
    const top = yAt(4.15);
    const ca = range(t, 0.4, 0.9) * out;
    fg.save();
    fg.globalAlpha = ca;
    const grad = fg.createLinearGradient(0, FACE, 0, top);
    grad.addColorStop(0, 'rgba(79,214,255,0.32)');
    grad.addColorStop(1, 'rgba(79,214,255,0.04)');
    fg.fillStyle = grad;
    const spread = Math.tan(HALF * wide) * (FACE - top);
    fg.beginPath();
    fg.moveTo(SX, FACE);
    fg.lineTo(SX - spread, top);
    fg.lineTo(SX + spread, top);
    fg.closePath();
    fg.fill();
    fg.strokeStyle = 'rgba(79,214,255,0.5)';
    fg.lineWidth = 2;
    fg.stroke();
    fg.restore();
    // pulses climbing the beam
    const fronts: number[] = [];
    for (let s = 0.8; s < t; s += 0.6) fronts.push((t - s) * 900);
    arcs(fg, SX, FACE, -Math.PI / 2, HALF * 2 * wide, fronts.filter((r) => r < FACE - top), CYAN, (_, r) => (1 - r / (FACE - top)) * out, 4);

    // ruler
    const ra = range(t, 0.6, 1.1) * out;
    fg.save();
    fg.globalAlpha = ra;
    fg.strokeStyle = DIM;
    fg.lineWidth = 2;
    fg.beginPath();
    fg.moveTo(130, FACE);
    fg.lineTo(130, yAt(4));
    fg.stroke();
    for (let m = 0; m <= 4; m += 0.5) {
      const y = yAt(m);
      fg.fillStyle = m % 1 ? 'rgba(239,230,214,0.3)' : BONE;
      fg.fillRect(130, y - 1, m % 1 ? 14 : 26, 2);
      if (m % 1 === 0) {
        fg.font = MONO(26, 500);
        fg.textAlign = 'right';
        fg.fillText(`${m} m`, 116, y + 9);
      }
    }
    fg.restore();

    // min / max markers
    const mark = (y: number, text: string, sub: string, color: string, a: number) => {
      if (a <= 0) return;
      fg.save();
      fg.globalAlpha = a;
      fg.strokeStyle = color;
      fg.lineWidth = 3;
      fg.setLineDash([12, 8]);
      fg.beginPath();
      fg.moveTo(170, y);
      fg.lineTo(1000, y);
      fg.stroke();
      fg.restore();
      label(fg, text, 990, y - 18, DISPLAY(48, 900), color, a, 'right');
      label(fg, sub, 990, y + 38, MONO(24, 500), DIM, a, 'right');
    };
    mark(yAt(4), 'MAX 4 m', '', GREEN, range(t, 2.2, 2.5) * out);
    mark(FACE - 14, 'MIN 2 cm', 'closer = blind zone', SIGNAL, range(t, 1.2, 1.5) * out);

    // angle
    const aa = range(t, S2 + 0.5, S2 + 0.9) * out;
    if (aa > 0) {
      fg.save();
      fg.globalAlpha = aa;
      fg.strokeStyle = BONE;
      fg.lineWidth = 3;
      fg.beginPath();
      fg.arc(SX, FACE, 320, -Math.PI / 2 - HALF * wide, -Math.PI / 2 + HALF * wide);
      fg.stroke();
      fg.restore();
      label(fg, '≈ 15°', SX, FACE - 345, DISPLAY(52, 900), BONE, aa);
    }

    // ball measured in the beam
    const ba = range(t, 1.6, 2.0) * out;
    if (ba > 0) {
      const m = ballM(t);
      const by = yAt(m);
      const bx = ballX(t);
      fg.save();
      fg.globalAlpha = ba;
      const g = fg.createRadialGradient(bx - 12, by - 12, 4, bx, by, 34);
      g.addColorStop(0, '#ffd2b8');
      g.addColorStop(1, SIGNAL);
      fg.fillStyle = g;
      fg.beginPath();
      fg.arc(bx, by, 32, 0, Math.PI * 2);
      fg.fill();
      fg.restore();
      label(fg, `${m.toFixed(2)} m`, bx + 60, by + 12, MONO(34, 500), BONE, ba, 'left');
    }

    sensorSide(fg, SX, SY, SS, { angle: -Math.PI / 2, alpha: range(t, 0.2, 0.6) * out, tx: clamp(Math.sin(t * 10.5) * 0.5 + 0.2) });

    B.subs(fg, t, 1440);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
