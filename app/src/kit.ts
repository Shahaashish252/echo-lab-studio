// Shared drawing toolkit for plates: palette, graph paper, per-letter kinetic type.

export { W, H } from './format';
import { W, H } from './format';
export const INK = '#14110e';
export const BONE = '#efe6d6';
export const SIGNAL = '#ff5a1f';
export const SIGNAL_HEX = 0xff5a1f;

export const DISPLAY = (size: number, weight = 900) => `${weight} ${size}px Archivo, "Segoe UI", sans-serif`;
export const MONO = (size: number, weight = 400) => `${weight} ${size}px "IBM Plex Mono", Consolas, monospace`;

export type Ctx = CanvasRenderingContext2D;

/** ?clean=1 hides slates, headings and captions: for thumbnails and other clean plates. */
export const CLEAN = typeof location !== 'undefined' && new URLSearchParams(location.search).has('clean');

/** Ink background with a construction grid. zoom scales about the frame centre. */
export function paper(ctx: Ctx, { zoom = 1, alpha = 1, ox = 0, oy = 0 } = {}) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  if (alpha <= 0) return;
  const step = 48 * zoom;
  const cx = W / 2 + ox;
  const cy = H / 2 + oy;
  ctx.lineWidth = 1;
  for (const major of [false, true]) {
    ctx.strokeStyle = `rgba(239,230,214,${(major ? 0.075 : 0.035) * alpha})`;
    ctx.beginPath();
    const s = major ? step * 5 : step;
    for (let x = cx - Math.ceil(cx / s) * s; x <= W; x += s) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
    }
    for (let y = cy - Math.ceil(cy / s) * s; y <= H; y += s) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
}

/** Scale the context about the frame centre (a simple 2D camera). */
export function zoomAbout(ctx: Ctx, zoom: number, ox = 0, oy = 0) {
  ctx.translate(W / 2 + ox, H / 2 + oy);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
}

export interface Glyph {
  dx?: number;
  dy?: number;
  alpha?: number;
  scale?: number;
  rot?: number;
  color?: string;
}

/**
 * Draws text one glyph at a time so each can move on its own.
 * `each(i, ch)` returns that glyph's offset/alpha/scale; positions keep the font's kerning.
 */
export function letters(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  each: (i: number, ch: string) => Glyph,
  align: 'left' | 'center' | 'right' = 'left',
) {
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const total = ctx.measureText(text).width;
  const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const g = each(i, ch);
    const a = g.alpha ?? 1;
    if (a <= 0.001) continue;
    const gx = x0 + ctx.measureText(text.slice(0, i)).width;
    const gw = ctx.measureText(ch).width;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = g.color ?? color;
    ctx.translate(gx + gw / 2 + (g.dx ?? 0), y + (g.dy ?? 0));
    if (g.rot) ctx.rotate(g.rot);
    if (g.scale !== undefined) ctx.scale(g.scale, g.scale);
    ctx.fillText(ch, -gw / 2, 0);
    ctx.restore();
  }
  ctx.restore();
  return total;
}

/** Monospace line that types itself out; `p` 0..1, with a block cursor while typing. */
export function typed(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  p: number,
  size: number,
  color: string,
  { alpha = 1, align = 'left' as CanvasTextAlign } = {},
) {
  if (p <= 0 || alpha <= 0) return;
  const n = Math.floor(text.length * Math.min(1, p));
  ctx.save();
  ctx.font = MONO(size, 500);
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'alphabetic';
  const full = ctx.measureText(text).width;
  const x0 = align === 'center' ? x - full / 2 : align === 'right' ? x - full : x;
  const s = text.slice(0, n);
  ctx.fillText(s, x0, y);
  if (p < 1) {
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(x0 + ctx.measureText(s).width + 3, y - size * 0.78, size * 0.55, size * 0.95);
  }
  ctx.restore();
}

/** Corner registration marks and a slate label, the "construction sheet" frame. */
export function slate(ctx: Ctx, label: string, t: number, alpha = 1) {
  if (CLEAN) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(239,230,214,0.35)';
  ctx.lineWidth = 2;
  const m = 56;
  const l = 22;
  for (const [x, y, sx, sy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * l);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * l, y);
    ctx.stroke();
  }
  ctx.font = MONO(18, 500);
  ctx.fillStyle = 'rgba(239,230,214,0.55)';
  ctx.fillText(label, m + 34, m + 18);
  ctx.textAlign = 'right';
  ctx.fillText(`t = ${t.toFixed(2)}s   f ${String(Math.floor(t * 60 + 1e-6)).padStart(4, '0')}`, W - m - 34, m + 18);
  ctx.restore();
}

// ---- Explainer pieces ----------------------------------------------------------

export const GOLD = '#e8b64a';
export const FLASH = '#c8ff9a'; // zinc sulfide scintillation green

/** Section kicker + title, top left. `t` is plate-local time, `out` 1 -> 0 fades it away. */
export function heading(ctx: Ctx, kicker: string, title: string, t: number, out = 1) {
  if (CLEAN) return;
  if (out <= 0) return;
  typed(ctx, kicker, 140, 150, range01((t - 0.1) / 0.5), 20, SIGNAL, { alpha: out });
  letters(ctx, title, 136, 228, DISPLAY(64, 800), BONE, (i) => {
    const a = range01((t - 0.25 - i * 0.018) / 0.45);
    return { dy: (1 - a * (2 - a)) * 26, alpha: a * out };
  });
}

/**
 * Bottom caption, visible from t0 to t1. Wrap words in *stars* to highlight them in signal orange.
 */
export function caption(ctx: Ctx, text: string, t0: number, t1: number, t: number, y = 985, fadeIn = 0.35, fadeOut = 0.3) {
  if (CLEAN) return;
  const a = range01((t - t0) / fadeIn);
  const b = 1 - range01((t - (t1 - fadeOut)) / fadeOut);
  const alpha = Math.min(a, b);
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = DISPLAY(38, 500);
  ctx.textBaseline = 'alphabetic';
  const parts = text.split('*');
  const total = parts.reduce((w, p) => w + ctx.measureText(p).width, 0);
  let x = W / 2 - total / 2;
  const dy = (1 - a * (2 - a)) * 18;
  // soft backing so captions read over anything
  const g = ctx.createLinearGradient(0, y + 40, 0, y - 110);
  g.addColorStop(0, `rgba(20,17,14,${0.75 * alpha})`);
  g.addColorStop(1, 'rgba(20,17,14,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 110, W, 150);
  ctx.globalAlpha = alpha;
  parts.forEach((p, i) => {
    ctx.fillStyle = i % 2 ? SIGNAL : BONE;
    ctx.fillText(p, x, y + dy);
    x += ctx.measureText(p).width;
  });
  ctx.restore();
}

/**
 * Label with a pointer line: dot at the anchor (ax, ay), line to (bx, by), then text types out.
 * `p` is 0..1 progress of the whole reveal; `alpha` fades it.
 */
export function callout(
  ctx: Ctx,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  text: string,
  p: number,
  alpha = 1,
) {
  if (p <= 0 || alpha <= 0) return;
  const lp = range01(p / 0.45);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = SIGNAL;
  ctx.beginPath();
  ctx.arc(ax, ay, 5 * lp, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(239,230,214,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + (bx - ax) * lp, ay + (by - ay) * lp);
  ctx.stroke();
  ctx.restore();
  const right = bx >= ax;
  typed(ctx, text, bx + (right ? 12 : -12), by + 7, range01((p - 0.35) / 0.65), 22, BONE, {
    alpha,
    align: right ? 'left' : 'right',
  });
}

/** Glowing particle head with a fading trail along `pts` (oldest first). */
export function particle(ctx: Ctx, pts: [number, number][], color = SIGNAL, r = 7, alpha = 1) {
  if (!pts.length || alpha <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const k = i / pts.length;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * k * 0.7;
    ctx.lineWidth = r * 1.1 * k;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  const [x, y] = pts[pts.length - 1];
  ctx.globalAlpha = alpha;
  glow(ctx, x, y, r, color);
  ctx.restore();
}

/** Bright dot with a soft halo. */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
  g.addColorStop(0, color);
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.globalAlpha *= 0.45;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.45;
  ctx.fillStyle = '#fff6ec';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Full-frame ink overlay, for fades. */
export function fadeInk(ctx: Ctx, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

const range01 = (x: number) => Math.min(1, Math.max(0, x));

/** Maths text. Archivo has no Greek, so equations use Cambria Math (Windows) with serif fallbacks. */
export const EQ = (size: number, italic = false) => `${italic ? 'italic ' : ''}${size}px "Cambria Math", "Times New Roman", serif`;

/** Draws maths text; returns its width. */
export function eq(ctx: Ctx, text: string, x: number, y: number, size: number, color = BONE, align: CanvasTextAlign = 'left', alpha = 1) {
  if (alpha <= 0) return 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = EQ(size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/** A stacked fraction centred on x, with the bar at y. Returns its width. */
export function frac(ctx: Ctx, num: string, den: string, x: number, y: number, size: number, color = BONE, alpha = 1) {
  if (alpha <= 0) return 0;
  ctx.save();
  ctx.font = EQ(size);
  const w = Math.max(ctx.measureText(num).width, ctx.measureText(den).width) + size * 0.3;
  ctx.restore();
  eq(ctx, num, x, y - size * 0.25, size, color, 'center', alpha);
  eq(ctx, den, x, y + size * 0.95, size, color, 'center', alpha);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - size * 0.06, w, Math.max(2, size * 0.05));
  ctx.restore();
  return w;
}

/** Arrow from (x0, y0) to (x1, y1), drawn up to progress p. */
export function arrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, p = 1, width = 3, head = 14) {
  if (p <= 0) return;
  const x = x0 + (x1 - x0) * p;
  const y = y0 + (y1 - y0) * p;
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x - Math.cos(a) * head * 0.6, y - Math.sin(a) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(a - 0.45) * head, y - Math.sin(a - 0.45) * head);
  ctx.lineTo(x - Math.cos(a + 0.45) * head, y - Math.sin(a + 0.45) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Pulsing highlight ring, for pointing at the thing being talked about. */
export function pulseRing(ctx: Ctx, x: number, y: number, r: number, t: number, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  for (let k = 0; k < 2; k++) {
    const ph = (t * 1.2 + k * 0.5) % 1;
    ctx.globalAlpha = alpha * (1 - ph) * 0.8;
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + ph * 0.35), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Rounded info card with a title and lines of text. `a` 0..1 fades and lifts it in. */
export function card(ctx: Ctx, x: number, y: number, w: number, title: string, lines: string[], a: number, lineAlpha?: (i: number) => number) {
  if (a <= 0) return;
  const h = 86 + lines.length * 40;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - a) * 18);
  ctx.fillStyle = 'rgba(20,17,14,0.88)';
  ctx.strokeStyle = 'rgba(239,230,214,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.font = DISPLAY(30, 800);
  ctx.fillStyle = SIGNAL;
  ctx.fillText(title, x + 28, y + 52);
  ctx.font = MONO(20, 500);
  lines.forEach((l, i) => {
    ctx.globalAlpha = a * (lineAlpha ? lineAlpha(i) : 1);
    ctx.fillStyle = BONE;
    ctx.fillText(l, x + 28, y + 100 + i * 40);
  });
  ctx.restore();
}
