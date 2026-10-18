// 07 — How it measures, in four steps. Top: the sensor (seen from above) and a wall 20 cm away;
// a burst leaves the transmitter, reflects and returns to the receiver while a timer counts.
// Bottom: the TRIG / burst / ECHO timing diagram, drawn in step with the same clock.
import { clamp, lerp, range, smooth } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, MONO, paper, SIGNAL, W, type Ctx } from '../../kit';
import { beats } from './script';
import { arcs, CYAN, DIM, GREEN, headingV, label, panel, pop, sensorSide, wall } from './ui';

const B = beats(['steps-1', 'steps-2', 'steps-3', 'steps-4', 'steps-5', 'steps-6'], { lead: 0.4, tail: 1.2 });
export const LENGTH = B.length;

const A1 = B.at('steps-1');
const A2 = B.at('steps-2');
const A3 = B.at('steps-3');
const A5 = B.at('steps-5');
const A6 = B.at('steps-6');
const TRIG0 = A1 + 1.6;
const TRIG1 = TRIG0 + 0.6;
const BURST0 = A2 + 1.3;
const BURST1 = BURST0 + 1.6;
const GO = A3 + 0.9; // echo HIGH, packet launches
const BACK = A5 + 1.0; // packet front reaches the receiver, echo LOW
const ECHO_US = 1166;

const SX = 150;
const SY = 700;
const SS = 0.9;
const WALL_X = 880;
const GAP = 16;

/** travel progress 0..1 */
const u = (t: number) => clamp((t - GO) / (BACK - GO));

// timing diagram geometry
const DX0 = 250;
const DX1 = 990;
const ROWS = { trig: 1095, burst: 1185, echo: 1275 };
const XT0 = 270;
const XT1 = 320;
const XB0 = 345;
const XB1 = 445;
const XE0 = 470;
const XE1 = 930;
/** diagram cursor */
function cursor(t: number) {
  if (t < TRIG0) return DX0;
  if (t < TRIG1) return lerp(DX0, XT1 + 10, smooth((t - TRIG0) / (TRIG1 - TRIG0)));
  if (t < BURST0) return XT1 + 10;
  if (t < BURST1) return lerp(XT1 + 10, XB1 + 10, (t - BURST0) / (BURST1 - BURST0));
  if (t < GO) return XB1 + 10;
  if (t < BACK) return lerp(XE0, XE1, u(t));
  return lerp(XE1, DX1, smooth(range(t, BACK, BACK + 0.5)));
}

function trace(ctx: Ctx, y: number, upTo: number, color: string, high: (x: number) => number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(239,230,214,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(DX0, y);
  ctx.lineTo(DX1, y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let x = DX0; x <= upTo; x += 1) {
    const yy = y - high(x) * 46;
    if (x === DX0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();
  ctx.restore();
}

export default class Steps extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'pad', dur, notes: [45, 52, 55, 59, 64] }, ...B.cues()];
    c.push({ t: TRIG0 + 0.2, kind: 'zap', gain: 0.5, pitch: 0.8 });
    for (let k = 0; k < 8; k++) c.push({ t: BURST0 + (k / 8) * (BURST1 - BURST0), kind: 'zap', gain: 0.3, pitch: 2.2 });
    c.push({ t: GO, kind: 'hit', gain: 0.5, pitch: 1.2 });
    c.push({ t: GO + 0.05, kind: 'type', dur: BACK - GO, gain: 0.25 });
    c.push({ t: GO + (BACK - GO) / 2, kind: 'flash', gain: 0.6, pitch: 0.8 });
    c.push({ t: BACK, kind: 'chime', gain: 0.6, pitch: 1.6 });
    c.push({ t: BACK + 0.05, kind: 'hit', gain: 0.6 });
    c.push({ t: A6 + 0.6, kind: 'pop', gain: 0.6 });
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'THE MEASUREMENT', 'Four steps', t, out);

    // step chips
    const active = t < A2 ? 0 : t < A3 ? 1 : t < A5 ? 2 : 3;
    ['TRIG', 'BURST', 'TIMER', 'ECHO'].forEach((s, i) => {
      const p = pop(t, 0.5 + i * 0.12) * out;
      if (p <= 0) return;
      const on = t >= A1 && i === active;
      const done = t >= A1 && i < active;
      fg.save();
      fg.translate(W / 2 + (i - 1.5) * 240, 440);
      fg.scale(p, p);
      fg.fillStyle = on ? SIGNAL : done ? 'rgba(239,230,214,0.16)' : 'rgba(239,230,214,0.06)';
      fg.beginPath();
      fg.roundRect(-108, -36, 216, 72, 36);
      fg.fill();
      fg.font = DISPLAY(32, 800);
      fg.textAlign = 'center';
      fg.fillStyle = on ? '#14110e' : done ? BONE : DIM;
      fg.fillText(`${i + 1}  ${s}`, 0, 11);
      fg.restore();
    });

    // scene
    const sa = range(t, 0.3, 0.8) * out;
    const glowT = Math.max(range(t, BURST0, BURST0 + 0.1) * (1 - range(t, GO, GO + 0.3)), 0);
    const glowR = range(t, BACK - 0.1, BACK) * (1 - range(t, BACK + 1.0, BACK + 1.6));
    const trigPin = range(t, TRIG0, TRIG0 + 0.1) * (1 - range(t, TRIG1, TRIG1 + 0.3));
    const echoPin = t >= GO && t < BACK ? 1 : 0;
    const { tx, rx } = sensorSide(fg, SX, SY, SS, { alpha: sa, tx: glowT * (0.6 + 0.4 * Math.sin(t * 40)), rx: glowR, pins: [0, trigPin, echoPin, 0] });
    const D = WALL_X - tx[0];
    const hitT = GO + (BACK - GO) * 0.5;
    wall(fg, WALL_X, 520, W + 20, 900, sa, Math.exp(-Math.max(0, t - hitT) * 4) * (t >= hitT ? 1 : 0));

    // the burst: forms at the transmitter, then travels out and back
    const pathLen = Math.hypot(2 * D, rx[1] - tx[1]);
    const formed = clamp((t - BURST0) / (BURST1 - BURST0));
    let s = formed * 8 * GAP + 20;
    if (t >= GO) s = lerp(8 * GAP + 20, pathLen, u(t));
    const fade = 1 - range(t, BACK + 0.1, BACK + 0.6);
    if (t >= BURST0 && fade > 0) {
      const n = Math.ceil(formed * 8);
      const radii = Array.from({ length: n }, (_, k) => s - k * GAP).filter((r) => r > 6);
      fg.save();
      fg.beginPath();
      fg.rect(0, 0, WALL_X, 1000);
      fg.clip();
      arcs(fg, tx[0], tx[1], 0, 0.75, radii.filter((r) => r < D + 6), CYAN, (_, r) => fade * out * (1 - (s - r) / (10 * GAP)), 4);
      const mx = 2 * WALL_X - tx[0];
      // the echo spreads from the transmitter's mirror image behind the wall
      const dir = Math.atan2(rx[1] - tx[1], rx[0] - mx);
      arcs(fg, mx, tx[1], dir, 0.75, radii.filter((r) => r >= D), SIGNAL, (_, r) => fade * out * (1 - (s - r) / (10 * GAP)), 4);
      fg.restore();
    }
    label(fg, '8 × 40 kHz', tx[0] + 190, tx[1] - 70, MONO(30, 500), CYAN, range(t, BURST0 + 0.3, BURST0 + 0.6) * (1 - range(t, GO, GO + 0.3)) * out, 'left');

    // distance marker
    const da = range(t, 1.0, 1.5) * out;
    if (da > 0) {
      fg.save();
      fg.globalAlpha = da;
      fg.strokeStyle = DIM;
      fg.lineWidth = 2;
      fg.setLineDash([8, 8]);
      fg.beginPath();
      fg.moveTo(tx[0], 950);
      fg.lineTo(WALL_X, 950);
      fg.stroke();
      fg.setLineDash([]);
      fg.restore();
      label(fg, '20 cm', (tx[0] + WALL_X) / 2, 985, MONO(30, 500), BONE, da);
    }

    // round-trip path on steps-6
    const rt = range(t, A6 + 0.3, A6 + 1.3) * out;
    if (rt > 0) {
      fg.save();
      fg.strokeStyle = GREEN;
      fg.lineWidth = 4;
      fg.globalAlpha = 0.9;
      fg.setLineDash([14, 10]);
      const mid: [number, number] = [WALL_X, (tx[1] + rx[1]) / 2];
      const seg1 = Math.min(1, rt * 2);
      const seg2 = Math.max(0, rt * 2 - 1);
      fg.beginPath();
      fg.moveTo(tx[0], tx[1]);
      fg.lineTo(lerp(tx[0], mid[0], seg1), lerp(tx[1], mid[1], seg1));
      if (seg2 > 0) fg.lineTo(lerp(mid[0], rx[0], seg2), lerp(mid[1], rx[1], seg2));
      fg.stroke();
      fg.restore();
      label(fg, 'THERE + BACK', 560, 720, DISPLAY(40, 900), GREEN, range(t, A6 + 0.8, A6 + 1.1) * out);
    }

    // timer
    const ta = range(t, A3, A3 + 0.4) * out;
    if (ta > 0) {
      const us = Math.round(ECHO_US * u(t));
      const done = t >= BACK;
      panel(fg, 360, 530, 360, 100, ta, done ? SIGNAL : 'rgba(239,230,214,0.25)');
      label(fg, 'TIMER', 540, 520, MONO(22, 500), DIM, ta);
      label(fg, `${String(us).padStart(4, '0')} µs`, 540, 600, MONO(54, 500), done ? SIGNAL : BONE, ta);
    }

    // timing diagram
    const pa = range(t, A1 + 0.4, A1 + 0.9) * out;
    if (pa > 0) {
      panel(fg, 50, 1020, 980, 300, pa);
      const cx = cursor(t);
      const lbl = (txt: string, y: number, col: string) => label(fg, txt, 80, y + 8, MONO(26, 500), col, pa, 'left');
      lbl('TRIG', ROWS.trig, BONE);
      lbl('SOUND', ROWS.burst, CYAN);
      lbl('ECHO', ROWS.echo, SIGNAL);
      trace(fg, ROWS.trig, cx, BONE, (x) => (x >= XT0 && x < XT1 ? 1 : 0), pa);
      trace(fg, ROWS.burst, cx, CYAN, (x) => (x >= XB0 && x < XB1 ? (Math.floor(((x - XB0) / (XB1 - XB0)) * 16) % 2 ? 0 : 1) : 0), pa);
      trace(fg, ROWS.echo, cx, SIGNAL, (x) => (x >= XE0 && x < XE1 ? 1 : 0), pa);
      label(fg, '10 µs', (XT0 + XT1) / 2, ROWS.trig - 58, MONO(22, 500), BONE, pa * range(t, TRIG1, TRIG1 + 0.3));
      if (t > GO) {
        fg.save();
        fg.globalAlpha = pa;
        fg.fillStyle = SIGNAL;
        fg.fillRect(cx - 1.5, 1035, 3, 270);
        fg.restore();
      }
      const ba = pa * range(t, A6 + 0.5, A6 + 0.9);
      if (ba > 0) {
        const y = ROWS.echo - 70;
        fg.save();
        fg.globalAlpha = ba;
        fg.strokeStyle = GREEN;
        fg.lineWidth = 3;
        fg.beginPath();
        fg.moveTo(XE0, y + 12);
        fg.lineTo(XE0, y);
        fg.lineTo(XE1, y);
        fg.lineTo(XE1, y + 12);
        fg.stroke();
        fg.restore();
        label(fg, `${ECHO_US} µs = round trip`, (XE0 + XE1) / 2, y - 12, MONO(26, 500), GREEN, ba);
      }
      label(fg, 'not to scale', 1010, 1308, MONO(18, 400), DIM, pa * 0.8, 'right');
    }

    B.subs(fg, t, 1430);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
