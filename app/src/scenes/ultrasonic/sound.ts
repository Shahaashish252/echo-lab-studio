// 04 — What is ultrasound? A speaker pushes air molecules into compressions (a longitudinal wave),
// the pressure trace below it, and a log frequency scale whose marker drives the wave's pitch:
// sweep through human hearing, past 20 kHz into ultrasound, and settle on 40 kHz.
import { clamp, lerp, outCubic, range, smooth } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, MONO, paper, SIGNAL, W } from '../../kit';
import { beats } from './script';
import { CYAN, DIM, headingV, label, mix, pop } from './ui';

const B = beats(['sound-1', 'sound-2', 'sound-3', 'sound-4'], { lead: 0.4, tail: 0.9 });
export const LENGTH = B.length;

/** log10(frequency) keyframes; the marker and the wave follow these. */
const KEYS: [number, number][] = [
  [0, 2.3],
  [B.at('sound-2'), 2.3],
  [B.at('sound-2') + 0.5, 1.3],
  [B.end('sound-2'), 4.3],
  [B.at('sound-3') + 1.6, 5.2],
  [B.at('sound-4'), 5.2],
  [B.at('sound-4') + 1.0, Math.log10(40000)],
];
function logF(t: number) {
  if (t <= KEYS[0][0]) return KEYS[0][1];
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, v1] = KEYS[i];
    const [t0, v0] = KEYS[i - 1];
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / Math.max(1e-6, t1 - t0)));
  }
  return KEYS[KEYS.length - 1][1];
}
/** on-screen wavelength (px) for a frequency */
const lambda = (lf: number) => clamp(560 / Math.pow(2, (lf - 1.3) * 1.05), 44, 900);
const C = 300; // on-screen wave speed, px/s
// accumulated phase, so changing the wavelength never makes the wave jump
const STEP = 1 / 240;
const PHASE: number[] = [0];
for (let i = 1; i * STEP <= LENGTH + 1; i++) PHASE.push(PHASE[i - 1] + ((2 * Math.PI * C) / lambda(logF((i - 0.5) * STEP))) * STEP);
const phase = (t: number) => {
  const i = Math.min(PHASE.length - 2, Math.max(0, Math.floor(t / STEP)));
  return lerp(PHASE[i], PHASE[i + 1], t / STEP - i);
};

// spectrum axis: 1 Hz .. 1 MHz
const AX0 = 90;
const AX1 = 990;
const AY = 1150;
const fx = (lf: number) => lerp(AX0, AX1, lf / 6);

export default class Sound extends Scene {
  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [43, 50, 55, 59, 62] },
      ...B.cues(),
      { t: B.at('sound-2') + 0.5, kind: 'riser', dur: B.end('sound-2') - B.at('sound-2'), gain: 0.4 },
      { t: B.at('sound-3') + 0.2, kind: 'chime', gain: 0.35, pitch: 2 },
      { t: B.at('sound-4') + 1.0, kind: 'pop', gain: 0.8 },
      { t: B.at('sound-4') + 1.05, kind: 'hit', gain: 0.5, pitch: 1.4 },
      { t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'THE PHYSICS', 'What is ultrasound?', t, out);

    const lf = logF(t);
    const lam = lambda(lf);
    const ph = phase(t);
    const ultra = smooth(range(lf, 4.2, 4.4));
    const waveColor = mix('#efe6d6', CYAN, ultra);
    const show = outCubic(range(t, 0.3, 1.0)) * out;

    // speaker
    const cone = Math.sin(-ph) * 10;
    fg.save();
    fg.globalAlpha = show;
    fg.fillStyle = '#3a332c';
    fg.fillRect(50, 520, 60, 160);
    fg.fillStyle = '#5a5047';
    fg.beginPath();
    fg.moveTo(110 + cone, 470);
    fg.lineTo(150 + cone, 470);
    fg.lineTo(150 + cone, 730);
    fg.lineTo(110 + cone, 730);
    fg.closePath();
    fg.fill();
    fg.fillStyle = waveColor;
    fg.fillRect(146 + cone, 470, 8, 260);
    fg.restore();

    // air molecules: longitudinal wave
    const A = 11;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 29; c++) {
        const x0 = 190 + c * 29 + (r % 2) * 14;
        const y = 480 + r * 34;
        const arg = (2 * Math.PI * (x0 - 160)) / lam - ph;
        const dx = A * Math.sin(arg);
        // density is highest where displacement gradient is most negative
        const dens = -Math.cos(arg);
        const a = show * clamp(range(t, 0.3 + c * 0.02, 0.6 + c * 0.02));
        if (a <= 0) continue;
        fg.globalAlpha = a * (0.45 + 0.55 * (0.5 + 0.5 * dens));
        fg.fillStyle = dens > 0.3 ? waveColor : 'rgba(239,230,214,0.7)';
        fg.beginPath();
        fg.arc(x0 + dx, y, 6.5, 0, Math.PI * 2);
        fg.fill();
      }
    fg.globalAlpha = 1;

    // pressure trace
    const pa = range(t, 1.2, 1.8) * out;
    if (pa > 0) {
      const py = 840;
      fg.save();
      fg.globalAlpha = pa;
      fg.strokeStyle = 'rgba(239,230,214,0.2)';
      fg.lineWidth = 2;
      fg.beginPath();
      fg.moveTo(190, py);
      fg.lineTo(1010, py);
      fg.stroke();
      fg.strokeStyle = waveColor;
      fg.lineWidth = 4;
      fg.shadowColor = waveColor;
      fg.shadowBlur = 10;
      fg.beginPath();
      for (let x = 190; x <= 1010; x += 3) {
        const y = py - 42 * -Math.cos((2 * Math.PI * (x - 160)) / lam - ph);
        if (x === 190) fg.moveTo(x, y);
        else fg.lineTo(x, y);
      }
      fg.stroke();
      fg.restore();
      label(fg, 'PRESSURE', 190, py - 62, MONO(24, 500), DIM, pa, 'left');
      label(fg, 'compression', 1000, 470 - 16, MONO(24, 500), DIM, pa * range(t, 1.6, 2.0), 'right');
    }

    // frequency scale
    const sa = range(t, B.at('sound-2') - 0.4, B.at('sound-2')) * out;
    if (sa > 0) {
      fg.save();
      fg.globalAlpha = sa;
      // bands
      const band = (l0: number, l1: number, color: string, a: number) => {
        if (a <= 0) return;
        fg.globalAlpha = sa * a;
        fg.fillStyle = color;
        fg.beginPath();
        fg.roundRect(fx(l0), AY - 30, fx(l1) - fx(l0), 60, 8);
        fg.fill();
      };
      band(0, 6, 'rgba(239,230,214,0.08)', 1);
      const hearing = range(t, B.at('sound-2') + 0.5, B.end('sound-2'));
      band(1.3, lerp(1.3, 4.3, hearing), 'rgba(239,230,214,0.35)', 1);
      const ua = range(t, B.at('sound-3'), B.at('sound-3') + 0.6);
      band(4.3, lerp(4.3, 6, ua), 'rgba(79,214,255,0.45)', 1);
      fg.globalAlpha = sa;
      fg.font = MONO(24, 500);
      fg.textAlign = 'center';
      ['1', '10', '100', '1k', '10k', '100k', '1M'].forEach((s, i) => {
        fg.fillStyle = DIM;
        fg.fillRect(fx(i) - 1, AY + 32, 2, 12);
        fg.fillText(`${s}`, fx(i), AY + 76);
      });
      fg.fillText('Hz', AX1 + 2, AY + 108);
      fg.restore();
      label(fg, 'HUMAN HEARING', fx(2.8), AY - 52, DISPLAY(34, 800), BONE, sa * range(t, B.at('sound-2') + 0.8, B.at('sound-2') + 1.2));
      label(fg, '20 Hz', fx(1.3), AY + 8, MONO(22, 500), BONE, sa * range(t, B.at('sound-2') + 0.6, B.at('sound-2') + 0.9));
      label(fg, '20 kHz', fx(4.3) - 4, AY + 8, MONO(22, 500), BONE, sa * range(t, B.end('sound-2') - 0.3, B.end('sound-2')), 'right');
      label(fg, 'ULTRASOUND', fx(5.15), AY - 52, DISPLAY(34, 800), CYAN, sa * ua);
      label(fg, 'INFRA', fx(0.65), AY + 8, MONO(22, 500), DIM, sa * range(t, B.at('sound-2') + 0.6, B.at('sound-2') + 0.9));

      // marker following the wave's frequency
      const mx = fx(lf);
      fg.save();
      fg.globalAlpha = sa;
      fg.fillStyle = waveColor;
      fg.beginPath();
      fg.moveTo(mx, AY - 36);
      fg.lineTo(mx - 14, AY - 60);
      fg.lineTo(mx + 14, AY - 60);
      fg.closePath();
      fg.fill();
      fg.fillRect(mx - 2, AY - 36, 4, 72);
      fg.restore();
      const hz = Math.pow(10, lf);
      const txt = hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
      label(fg, txt, clamp(mx, 150, 930), AY - 160, MONO(40, 500), waveColor, sa * (1 - range(t, B.at('sound-4') + 0.8, B.at('sound-4') + 1.0)));

      // 40 kHz pin
      const p40 = pop(t, B.at('sound-4') + 1.0);
      if (p40 > 0) {
        const x = fx(Math.log10(40000));
        fg.save();
        fg.globalAlpha = out;
        fg.translate(x, AY - 205);
        fg.scale(p40, p40);
        fg.fillStyle = SIGNAL;
        fg.beginPath();
        fg.roundRect(-150, -58, 300, 92, 18);
        fg.fill();
        fg.beginPath();
        fg.moveTo(-14, 32);
        fg.lineTo(14, 32);
        fg.lineTo(0, 52);
        fg.closePath();
        fg.fill();
        fg.fillStyle = '#14110e';
        fg.font = DISPLAY(48, 900);
        fg.textAlign = 'center';
        fg.fillText('40 kHz', 0, 4);
        fg.font = MONO(20, 500);
        fg.fillText('HC-SR04', 0, 26);
        fg.restore();
      }
      // vibrations per second counter
      const ca = range(t, B.at('sound-4') + 1.6, B.at('sound-4') + 2.0) * out;
      if (ca > 0) {
        const n = Math.round(40000 * smooth(range(t, B.at('sound-4') + 1.6, B.at('sound-4') + 3.0)));
        label(fg, `${n.toLocaleString('en-US')} vibrations / second`, W / 2, AY + 140, MONO(32, 500), BONE, ca);
      }
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
