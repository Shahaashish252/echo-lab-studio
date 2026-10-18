// 03 — Bats. A bat in the dark sends out calls; echoes come back from a moth. Then the bat
// morphs into the sensor: same trick.
import { clamp, hash, inOutCubic, lerp, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, fadeInk, INK, paper, SIGNAL, W, type Ctx } from '../../kit';
import { beats } from './script';
import { arcs, CYAN, headingV, label, packet, sensorSide } from './ui';
import { DISPLAY } from '../../kit';

const B = beats(['bat-1', 'bat-2', 'bat-3'], { lead: 0.4, tail: 0.8 });
export const LENGTH = B.length;

const V = 700;
const CALLS = (() => {
  const c: number[] = [];
  for (let t = B.at('bat-2') - 0.3; t < B.at('bat-3') - 0.6; t += 0.85) c.push(t);
  return c;
})();
const MORPH = B.at('bat-3');
/** extra sensor pings after the morph */
const SENSOR_PINGS = [MORPH + 0.9, MORPH + 1.9];

const batPos = (t: number): [number, number] => [250 + Math.sin(t * 0.9) * 20, 930 + Math.sin(t * 1.7) * 30];
const mothPos = (t: number): [number, number] => [830 + Math.sin(t * 2.3) * 40, 760 + Math.sin(t * 3.1) * 50];

function bat(ctx: Ctx, x: number, y: number, s: number, t: number, alpha: number) {
  if (alpha <= 0) return;
  const flap = Math.sin(t * 11);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#0a0807';
  ctx.strokeStyle = 'rgba(239,230,214,0.85)';
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    const tipY = -70 * flap;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(side * 70, -40 + tipY * 0.5, side * 160, -20 + tipY);
    // scalloped trailing edge
    const pts = 4;
    for (let k = 1; k <= pts; k++) {
      const px = side * (160 - (160 * k) / pts);
      const py = lerp(-20 + tipY, 10, k / pts) + 12;
      ctx.quadraticCurveTo(side * (160 - (160 * (k - 0.5)) / pts), py - 30, px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // body + head + ears
  ctx.beginPath();
  ctx.ellipse(0, 10, 22, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-18, -26);
  ctx.lineTo(-22, -62);
  ctx.lineTo(-4, -36);
  ctx.lineTo(4, -36);
  ctx.lineTo(22, -62);
  ctx.lineTo(18, -26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = SIGNAL;
  ctx.beginPath();
  ctx.arc(-8, -22, 4, 0, Math.PI * 2);
  ctx.arc(8, -22, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function moth(ctx: Ctx, x: number, y: number, t: number, alpha: number, lit: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(1.6, 1.6);
  const f = 0.6 + 0.4 * Math.abs(Math.sin(t * 18));
  ctx.fillStyle = lit > 0 ? `rgba(255,${Math.round(150 + 60 * (1 - lit))},90,1)` : '#6b5d4c';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 22 * f, -6, 24 * f, 16, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2e2620';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export default class Bat extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'pad', dur, notes: [41, 48, 53, 56, 60] }, ...B.cues()];
    for (const p of CALLS) {
      const [bx, by] = batPos(p);
      const [mx, my] = mothPos(p);
      c.push({ t: p, kind: 'zap', gain: 0.35, pitch: 2.2, pan: -0.5 });
      c.push({ t: p + (2 * Math.hypot(mx - bx, my - by)) / V, kind: 'chime', gain: 0.22, pitch: 2.5, pan: -0.4 });
    }
    c.push({ t: MORPH, kind: 'whoosh', dur: 0.5, gain: 0.5 }, { t: MORPH + 0.45, kind: 'pop', gain: 0.7 });
    for (const p of SENSOR_PINGS) c.push({ t: p, kind: 'zap', gain: 0.35, pitch: 1.8 });
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg, { alpha: 0.5 });
    // night sky
    const sky = bg.createLinearGradient(0, 400, 0, 1300);
    sky.addColorStop(0, 'rgba(30,40,70,0.5)');
    sky.addColorStop(1, 'rgba(20,17,14,0)');
    bg.fillStyle = sky;
    bg.fillRect(0, 380, W, 920);
    for (let k = 0; k < 40; k++) {
      bg.globalAlpha = 0.25 + 0.5 * hash(k + 4) * (0.6 + 0.4 * Math.sin(t * 2 + k));
      bg.fillStyle = BONE;
      bg.fillRect(hash(k) * W, 420 + hash(k + 50) * 760, 3, 3);
    }
    bg.globalAlpha = 1;
    bg.fillStyle = '#e9e1cf';
    bg.beginPath();
    bg.arc(860, 500, 54, 0, Math.PI * 2);
    bg.fill();
    bg.fillStyle = INK;
    bg.beginPath();
    bg.arc(838, 486, 50, 0, Math.PI * 2);
    bg.fill();

    headingV(fg, 'NATURE DID IT FIRST', 'Echolocation', t, out);

    const morph = inOutCubic(range(t, MORPH, MORPH + 0.6));
    const [bx, by] = batPos(t);
    const appear = outCubic(range(t, 0.2, 1.0));
    bat(fg, lerp(-250, bx, appear), by, 1.45, t, (1 - morph) * out);
    const [mx, my] = mothPos(t);
    let lit = 0;

    // calls and echoes
    for (const p of CALLS) {
      if (t < p) continue;
      const [cx, cy] = batPos(p);
      const [px, py] = mothPos(p);
      const d = Math.hypot(px - cx, py - cy);
      const dir = Math.atan2(py - cy, px - cx);
      const front = (t - p) * V;
      const fade = (1 - morph) * out;
      arcs(fg, cx + 30, cy - 20, dir, 0.8, packet(front, 4, 18).filter((r) => r < d + 30), CYAN, (_, r) => (1 - r / 1100) * fade, 4);
      if (front > d) {
        const back = packet(front - d, 4, 18).filter((r) => r > 0 && r < d);
        arcs(fg, px, py, dir + Math.PI, 0.9, back, SIGNAL, (_, r) => (1 - r / d) * fade, 4);
        lit = Math.max(lit, Math.exp(-(front - d) / 200));
      }
    }
    moth(fg, mx, my, t, out * range(t, 0.5, 1.0) * (1 - morph * 0.6), lit);
    label(fg, 'CALL', bx + 130, by - 120, DISPLAY(38, 800), CYAN, range(t, CALLS[0] + 0.2, CALLS[0] + 0.4) * (1 - morph) * out);
    label(fg, 'ECHO', mx - 130, my + 120, DISPLAY(38, 800), SIGNAL, range(t, CALLS[0] + 1.0, CALLS[0] + 1.2) * (1 - morph) * out);

    // bat becomes the sensor
    if (morph > 0) {
      const s = 1.35 * morph;
      const pingGlow = Math.max(0, ...SENSOR_PINGS.map((p) => (t >= p ? Math.exp(-(t - p) * 4) : 0)));
      const { tx } = sensorSide(fg, bx - 40, by, s, { alpha: morph * out, tx: pingGlow });
      for (const p of SENSOR_PINGS) {
        if (t < p) continue;
        const front = (t - p) * V;
        arcs(fg, tx[0], tx[1], Math.atan2(my - tx[1], mx - tx[0]), 0.6, packet(front, 6, 18), CYAN, (_, r) => clamp(1 - r / 900) * out, 5);
      }
      label(fg, '= HC-SR04', bx - 40, by + 300, DISPLAY(64, 900), BONE, range(t, MORPH + 0.5, MORPH + 0.8) * out, 'left');
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
