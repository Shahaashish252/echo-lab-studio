// 12 — Where you'll find them: parking sensors, robots, drones, water tanks. Four cards pop in as
// they're named, each with its own little animation.
import { clamp, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, MONO, paper, SIGNAL, type Ctx } from '../../kit';
import { beats, dur } from './script';
import { arcs, CYAN, DIM, GREEN, headingV, label, panel, pop, robot, robotEye } from './ui';

const B = beats(['uses-1'], { lead: 0.4, tail: 1.6 });
export const LENGTH = B.length;

const U = B.at('uses-1');
const D = dur('uses-1');
const CARDS = [
  { name: 'PARKING', at: U + D * 0.22, x: 60, y: 430 },
  { name: 'ROBOTS', at: U + D * 0.5, x: 560, y: 430 },
  { name: 'DRONES', at: U + D * 0.63, x: 60, y: 880 },
  { name: 'WATER TANKS', at: U + D * 0.78, x: 560, y: 880 },
];
const CW = 460;
const CH = 420;

function pings(ctx: Ctx, x: number, y: number, dir: number, t: number, maxR: number, a: number, every = 0.7) {
  const r: number[] = [];
  for (let s = t % every; s < 3; s += every) r.push(s * 260);
  arcs(ctx, x, y, dir, 0.8, r.filter((v) => v < maxR && v > 4), CYAN, (_, v) => a * (1 - v / maxR), 4);
}

function car(ctx: Ctx, cx: number, cy: number, t: number, a: number) {
  const back = 30 * (0.5 + 0.5 * Math.sin(t * 1.2));
  const x = cx + 40 - back;
  ctx.save();
  ctx.globalAlpha = a;
  // post
  ctx.fillStyle = '#d9b25a';
  ctx.fillRect(cx - 190, cy - 40, 18, 100);
  ctx.fillStyle = '#efe6d6';
  ctx.beginPath();
  ctx.moveTo(x - 140, cy + 20);
  ctx.lineTo(x - 140, cy - 20);
  ctx.quadraticCurveTo(x - 80, cy - 34, x - 60, cy - 70);
  ctx.lineTo(x + 50, cy - 70);
  ctx.quadraticCurveTo(x + 80, cy - 34, x + 140, cy - 24);
  ctx.lineTo(x + 140, cy + 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2b2622';
  ctx.fillRect(x - 50, cy - 60, 40, 30);
  ctx.fillRect(x, cy - 60, 42, 30);
  for (const wx of [x - 85, x + 85]) {
    ctx.beginPath();
    ctx.arc(wx, cy + 22, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  pings(ctx, x - 140, cy, Math.PI, t, x - 140 - (cx - 172), a, 0.5);
  // beep bars: more as the car gets closer
  const n = Math.round(1 + (back / 30) * 3);
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.globalAlpha = a * (i < n ? 1 : 0.2);
    ctx.fillStyle = i < 2 ? GREEN : SIGNAL;
    ctx.fillRect(cx + 70 + i * 26, cy - 140 - i * 10, 18, 26 + i * 10);
    ctx.restore();
  }
}

function drone(ctx: Ctx, cx: number, cy: number, t: number, a: number) {
  const h = 20 * Math.sin(t * 1.4);
  const y = cy - 70 + h;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#efe6d6';
  ctx.beginPath();
  ctx.roundRect(cx - 50, y - 16, 100, 32, 12);
  ctx.fill();
  ctx.fillRect(cx - 150, y - 6, 300, 10);
  for (const px of [cx - 150, cx + 150]) {
    ctx.fillRect(px - 4, y - 24, 8, 20);
    const w = 70 * Math.abs(Math.cos(t * 30));
    ctx.fillStyle = 'rgba(239,230,214,0.6)';
    ctx.fillRect(px - w, y - 28, w * 2, 5);
    ctx.fillStyle = '#efe6d6';
  }
  ctx.fillStyle = 'rgba(239,230,214,0.25)';
  ctx.fillRect(cx - 180, cy + 120, 360, 4);
  ctx.restore();
  pings(ctx, cx, y + 18, Math.PI / 2, t, cy + 120 - y - 18, a);
  label(ctx, `${(1.2 + h / 100).toFixed(2)} m`, cx + 120, cy + 90, MONO(28, 500), BONE, a);
}

function tank(ctx: Ctx, cx: number, cy: number, t: number, a: number) {
  const lvl = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.9));
  const x0 = cx - 110;
  const y0 = cy - 120;
  const w = 220;
  const h = 250;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(79,140,255,0.55)';
  const top = y0 + h * (1 - lvl);
  ctx.beginPath();
  ctx.moveTo(x0, top);
  for (let x = 0; x <= w; x += 10) ctx.lineTo(x0 + x, top + Math.sin(x * 0.05 + t * 4) * 4);
  ctx.lineTo(x0 + w, y0 + h);
  ctx.lineTo(x0, y0 + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 10);
  ctx.lineTo(x0, y0 + h);
  ctx.lineTo(x0 + w, y0 + h);
  ctx.lineTo(x0 + w, y0 - 10);
  ctx.stroke();
  ctx.fillStyle = '#1f5fae';
  ctx.fillRect(cx - 40, y0 - 24, 80, 16);
  ctx.restore();
  pings(ctx, cx, y0 - 8, Math.PI / 2, t, top - y0 + 8, a);
  label(ctx, `${Math.round(lvl * 100)}%`, cx + 170, cy + 20, DISPLAY(44, 900), CYAN, a);
}

export default class Uses extends Scene {
  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [45, 52, 57, 61, 64] },
      ...B.cues(),
      ...CARDS.map((c, i) => ({ t: c.at, kind: 'pop', gain: 0.7, pitch: 1 + i * 0.12 })),
      { t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'IN THE REAL WORLD', 'Where they live', t, out);
    CARDS.forEach((c, i) => {
      const p = pop(t, c.at - 0.15, 0.4);
      if (p <= 0) return;
      const a = clamp(p) * out;
      fg.save();
      fg.translate(c.x + CW / 2, c.y + CH / 2);
      fg.scale(p, p);
      fg.translate(-(c.x + CW / 2), -(c.y + CH / 2));
      panel(fg, c.x, c.y, CW, CH, a);
      const cx = c.x + CW / 2;
      const cy = c.y + 190;
      const lt = t - c.at;
      if (i === 0) car(fg, cx, cy + 20, lt, a);
      if (i === 1) {
        const rs = 0.62;
        const rx = c.x + 130;
        const gy = c.y + 330;
        robot(fg, rx, gy, rs, lt, {});
        const [ex, ey] = robotEye(rx, gy, rs);
        pings(fg, ex, ey, 0, lt, c.x + CW - 30 - ex, a);
        fg.save();
        fg.globalAlpha = a;
        fg.fillStyle = '#7a3e2a';
        fg.fillRect(c.x + CW - 40, c.y + 80, 22, 250);
        fg.restore();
      }
      if (i === 2) drone(fg, cx, cy, lt, a);
      if (i === 3) tank(fg, cx - 30, cy + 20, lt, a);
      label(fg, c.name, cx, c.y + CH - 26, DISPLAY(42, 900), i % 2 ? SIGNAL : BONE, a);
      fg.restore();
    });
    label(fg, 'and many more…', 540, 1355, MONO(28, 500), DIM, range(t, B.end('uses-1') + 0.1, B.end('uses-1') + 0.4) * out);

    B.subs(fg, t, 1440);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
