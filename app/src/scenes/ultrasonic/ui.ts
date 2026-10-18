// Shared drawing pieces for the ultrasonic short (9:16): headings, the HC-SR04 in 2D, sound
// wavefronts, walls and the little robot.
import { clamp, outBack, outCubic, range } from '../../engine/ease';
import { BONE, DISPLAY, INK, letters, MONO, SIGNAL, typed, W, type Ctx } from '../../kit';

export const CYAN = '#4fd6ff';
export const PCB = '#1f5fae';
export const PCB_DARK = '#163f78';
export const SILVER = '#c9ccd1';
export const GREEN = '#9be564';
export const DIM = 'rgba(239,230,214,0.45)';

/** Largest font size (≤ size) at which `text` fits in maxW. */
export function fit(ctx: Ctx, text: string, size: number, maxW: number, weight = 900) {
  ctx.save();
  ctx.font = DISPLAY(size, weight);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}

/** Section kicker + title, centred at the top. `t` is plate-local time, `out` 1 -> 0 fades it. */
export function headingV(ctx: Ctx, kicker: string, title: string, t: number, out = 1, color = BONE) {
  if (out <= 0) return;
  typed(ctx, kicker, W / 2, 238, range(t, 0.1, 0.55), 30, SIGNAL, { alpha: out, align: 'center' });
  const size = fit(ctx, title, 84, 960, 800);
  letters(ctx, title, W / 2, 330, DISPLAY(size, 800), color, (i) => {
    const a = range(t, 0.2 + i * 0.02, 0.62 + i * 0.02);
    return { dy: (1 - outCubic(a)) * 30, alpha: a * out };
  }, 'center');
}

/** Wire-mesh disc: the face of a transducer, seen head on. */
function meshDisc(ctx: Ctx, x: number, y: number, r: number, glow: number, color: string) {
  ctx.save();
  // can
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#f2f3f5');
  g.addColorStop(1, '#8d9096');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // mesh
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = '#2b2d31';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(200,204,210,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.025);
  const step = r * 0.12;
  ctx.beginPath();
  for (let k = -r; k <= r; k += step) {
    ctx.moveTo(x + k - r, y - r);
    ctx.lineTo(x + k + r, y + r);
    ctx.moveTo(x + k + r, y - r);
    ctx.lineTo(x + k - r, y + r);
  }
  ctx.stroke();
  if (glow > 0) {
    ctx.globalAlpha = glow * 0.75;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
    gg.addColorStop(0, color);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

export interface SensorOpts {
  /** 0..1 glow on the transmitter / receiver */
  tx?: number;
  rx?: number;
  /** 0..1 highlight per pin: VCC, TRIG, ECHO, GND */
  pins?: number[];
  alpha?: number;
}

/** HC-SR04 seen from the front, centred at (x, y); `s` = 1 is 450 px wide. */
export function sensorFront(ctx: Ctx, x: number, y: number, s: number, o: SensorOpts = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.scale(s, s);
  // header pins
  const labels = ['VCC', 'TRIG', 'ECHO', 'GND'];
  for (let i = 0; i < 4; i++) {
    const px = (i - 1.5) * 26;
    const hi = o.pins?.[i] ?? 0;
    ctx.fillStyle = hi > 0 ? mix('#d9b25a', SIGNAL, hi) : '#d9b25a';
    ctx.fillRect(px - 3.5, 92, 7, 62);
  }
  ctx.fillStyle = '#1b1b1d';
  ctx.fillRect(-56, 92, 112, 16);
  // board
  ctx.fillStyle = PCB;
  ctx.strokeStyle = PCB_DARK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(-225, -100, 450, 200, 10);
  ctx.fill();
  ctx.stroke();
  for (const hx of [-205, 205])
    for (const hy of [-80, 80]) {
      ctx.fillStyle = '#d7dbe0';
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  // crystal
  ctx.fillStyle = '#d9dce1';
  ctx.beginPath();
  ctx.roundRect(-34, -88, 68, 26, 13);
  ctx.fill();
  ctx.font = MONO(15, 500);
  ctx.fillStyle = '#e9eef6';
  ctx.textAlign = 'center';
  ctx.fillText('HC-SR04', 0, 8);
  ctx.font = MONO(13, 500);
  labels.forEach((l, i) => {
    ctx.save();
    ctx.translate((i - 1.5) * 26 + 4, 84);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.fillText(l, 0, 0);
    ctx.restore();
  });
  ctx.font = MONO(18, 500);
  ctx.fillText('T', -128, -84);
  ctx.fillText('R', 128, -84);
  meshDisc(ctx, -128, 0, 78, o.tx ?? 0, CYAN);
  meshDisc(ctx, 128, 0, 78, o.rx ?? 0, SIGNAL);
  ctx.restore();
}

/**
 * HC-SR04 seen from above, facing right: board edge on at x, transmitter above and receiver
 * below y. Returns the centres of the two transducer faces.
 */
export function sensorSide(ctx: Ctx, x: number, y: number, s: number, o: SensorOpts & { angle?: number } = {}) {
  const a = o.alpha ?? 1;
  const ang = o.angle ?? 0;
  const at = (dx: number, dy: number): [number, number] => [
    x + (dx * Math.cos(ang) - dy * Math.sin(ang)) * s,
    y + (dx * Math.sin(ang) + dy * Math.cos(ang)) * s,
  ];
  if (a > 0) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(s, s);
    // board, edge on
    ctx.fillStyle = PCB;
    ctx.fillRect(-10, -150, 12, 300);
    // header pins sticking out the back
    ctx.fillStyle = '#1b1b1d';
    ctx.fillRect(-26, -30, 16, 60);
    for (let i = 0; i < 4; i++) {
      const hi = o.pins?.[i] ?? 0;
      ctx.fillStyle = hi > 0 ? mix('#d9b25a', SIGNAL, hi) : '#d9b25a';
      ctx.fillRect(-58, -24 + i * 14, 34, 5);
    }
    for (const [cy, g, col] of [
      [-87, o.tx ?? 0, CYAN],
      [87, o.rx ?? 0, SIGNAL],
    ] as const) {
      const grad = ctx.createLinearGradient(0, cy - 54, 0, cy + 54);
      grad.addColorStop(0, '#7d8086');
      grad.addColorStop(0.35, '#eef0f2');
      grad.addColorStop(1, '#6d7076');
      ctx.fillStyle = grad;
      ctx.fillRect(2, cy - 54, 80, 108);
      ctx.fillStyle = '#2b2d31';
      ctx.fillRect(78, cy - 46, 8, 92);
      if (g > 0) {
        ctx.globalAlpha = a * g;
        ctx.fillStyle = col;
        ctx.fillRect(78, cy - 46, 8, 92);
        ctx.globalAlpha = a;
      }
    }
    ctx.font = MONO(22, 500);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText('T', 40, -79);
    ctx.fillText('R', 40, 95);
    ctx.restore();
  }
  return { tx: at(86, -87), rx: at(86, 87) };
}

/**
 * Wavefronts: arcs of radius r[i] about (x, y), pointing along `dir` (radians) and `spread` wide.
 * `alpha(i)` per arc.
 */
export function arcs(ctx: Ctx, x: number, y: number, dir: number, spread: number, radii: number[], color: string, alpha: (i: number, r: number) => number, width = 5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  radii.forEach((r, i) => {
    const al = alpha(i, r);
    if (al <= 0 || r <= 0) return;
    ctx.globalAlpha = clamp(al);
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, r, dir - spread / 2, dir + spread / 2);
    ctx.stroke();
  });
  ctx.restore();
}

/** A packet of `n` wavefronts whose leading front is at radius `front`, spaced `gap` apart. */
export function packet(front: number, n = 6, gap = 22) {
  return Array.from({ length: n }, (_, i) => front - i * gap);
}

/** Brick wall, x0..x1 by y0..y1. */
export function wall(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, alpha = 1, hit = 0) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = '#7a3e2a';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const bh = 34;
  const bw = 78;
  ctx.strokeStyle = '#3d2017';
  ctx.lineWidth = 4;
  for (let r = 0, yy = y0; yy < y1; r++, yy += bh) {
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(x1, yy);
    for (let xx = x0 - (r % 2 ? bw / 2 : 0); xx < x1; xx += bw) {
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx, yy + bh);
    }
    ctx.stroke();
  }
  // lit edge facing the sensor
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x0, y0, 6, y1 - y0);
  if (hit > 0) {
    ctx.globalAlpha = alpha * hit;
    const g = ctx.createLinearGradient(x0, 0, x0 + 90, 0);
    g.addColorStop(0, SIGNAL);
    g.addColorStop(1, 'rgba(255,90,31,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, 90, y1 - y0);
  }
  ctx.restore();
}

/** Little wheeled robot whose eyes are an HC-SR04. (x, y) is its ground contact point, facing right. */
export function robot(ctx: Ctx, x: number, y: number, s: number, t: number, opts: { tx?: number; rx?: number; wheel?: number } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bob = Math.sin(t * 9) * 2 * (opts.wheel ? 1 : 0);
  // wheels
  for (const wx of [-70, 70]) {
    ctx.save();
    ctx.translate(wx, -38);
    ctx.fillStyle = '#26221e';
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5a534b';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.rotate(opts.wheel ?? 0);
    ctx.strokeStyle = BONE;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.translate(0, bob);
  // body
  ctx.fillStyle = '#e8dfcf';
  ctx.strokeStyle = '#9d9282';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-115, -205, 230, 140, 24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = SIGNAL;
  ctx.beginPath();
  ctx.roundRect(-80, -160, 70, 16, 8);
  ctx.fill();
  ctx.fillStyle = '#bfb5a5';
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(40 + k * 22, -150, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // neck + head (the sensor)
  ctx.fillStyle = '#9d9282';
  ctx.fillRect(-12, -232, 24, 30);
  ctx.restore();
  // head drawn unscaled-rotated: the HC-SR04 board facing right means we see it edge on. For
  // charm, show it three-quarter: a front view squashed horizontally.
  ctx.save();
  ctx.translate(x + 20 * s, y + (-300 + bob) * s);
  ctx.scale(0.62 * s, 0.62 * s);
  ctx.transform(0.55, -0.08, 0, 1, 0, 0);
  sensorFront(ctx, 0, 0, 1, { tx: opts.tx, rx: opts.rx });
  ctx.restore();
}

/** Head-of-sensor position for robot() (where its waves start). */
export const robotEye = (x: number, y: number, s: number): [number, number] => [x + 90 * s, y - 300 * s];

/** Rounded panel. */
export function panel(ctx: Ctx, x: number, y: number, w: number, h: number, a: number, border = 'rgba(239,230,214,0.22)') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(35,30,26,0.92)';
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Text with an ink outline so it reads over anything. */
export function label(ctx: Ctx, text: string, x: number, y: number, font: string, color: string, alpha = 1, align: CanvasTextAlign = 'center') {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Pops a value 0..1 with overshoot, for things that appear. */
export const pop = (t: number, a: number, d = 0.35) => Math.max(0, outBack(range(t, a, a + d), 2));

export function mix(c1: string, c2: string, k: number) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1);
  const b = p(c2);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * clamp(k))).join(',')})`;
}

/** Flat sonar-style background ripples, for empty space. */
export function ripples(ctx: Ctx, x: number, y: number, t: number, alpha: number, color = CYAN, max = 900) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) {
    const ph = (t * 0.35 + k / 5) % 1;
    ctx.globalAlpha = alpha * (1 - ph) * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, ph * max, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
