// Real photos, animated: "photo" scenes show a real photograph of the thing being explained (found and
// marked up by scripts/auto.ts: Claude looks at the photo and gives the position of each named point), with
// a camera that glides to the point being talked about, and highlight rings, labels, ripples and flowing
// particles drawn on top. Pure function of time; the renderer awaits the image (prepare).
import { clamp, inOutCubic, outBack, outCubic, range } from '../../engine/ease';
import { DISPLAY, INK, SIGNAL, W, type Ctx } from '../../kit';

export interface PhotoCue {
  effect: 'focus' | 'label' | 'glow' | 'waves' | 'flow' | 'pulse' | 'arrow';
  /** a point name (or "all" with focus = the whole photo) */
  target: string;
  t: number;
  dur?: number;
  zoom?: number;
  text?: string;
  /** flow: the point the particles travel to */
  path?: string;
}

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

export function ensurePhoto(src: string): Promise<void> {
  if (cache.has(src)) return Promise.resolve();
  if (!pending.has(src))
    pending.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => (cache.set(src, img), resolve());
        img.onerror = () => resolve();
        img.src = src;
      }),
    );
  return pending.get(src)!;
}

const DUR: Partial<Record<PhotoCue['effect'], number>> = { label: 2.6, glow: 2.4, waves: 2.6, flow: 2.6, pulse: 1.2, arrow: 2.4 };
const lenOf = (a: PhotoCue) => a.dur ?? DUR[a.effect] ?? 1;

/** The photo card: where it sits on screen. */
export const CARD = { x: 40, y: 430, w: W - 80, h: 900, r: 28 };

/**
 * Draws the photo for scene-local time t with its cues. `points` are 0..1 positions in the image.
 * Returns false while the image is still loading (preview).
 */
export function drawPhoto(ctx: Ctx, src: string, points: Record<string, [number, number]>, cues: PhotoCue[], t: number, L: number, seed: number): boolean {
  void ensurePhoto(src);
  const img = cache.get(src);
  if (!img) return false;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // cover-fit the card, then the camera: focus cues glide to their point; a slow drift otherwise
  const base = Math.max(CARD.w / iw, CARD.h / ih);
  let cam = { x: 0.5, y: 0.5, z: 1 };
  for (const a of cues.filter((c) => c.effect === 'focus')) {
    if (t < a.t - 0.45) break;
    const p = points[a.target];
    const to = p && a.target !== 'all' ? { x: p[0], y: p[1], z: clamp(a.zoom ?? 1.8, 1.2, 2.6) } : { x: 0.5, y: 0.5, z: 1 };
    const e = inOutCubic(range(t, a.t - 0.45, a.t + 0.45));
    cam = { x: cam.x + (to.x - cam.x) * e, y: cam.y + (to.y - cam.y) * e, z: cam.z + (to.z - cam.z) * e };
  }
  const dir = seed % 2 ? 1 : -1;
  const drift = 1.04 + 0.05 * (t / Math.max(L, 1)) + 0.1 * (1 - outCubic(range(t, 0, 0.5)));
  const k = base * cam.z * drift;
  // keep the image covering the card while panning to the point
  const halfW = CARD.w / 2 / k;
  const halfH = CARD.h / 2 / k;
  const cx = clamp(cam.x * iw + dir * 12 * (t / Math.max(L, 1) - 0.5) / k, halfW, iw - halfW);
  const cy = clamp(cam.y * ih, halfH, ih - halfH);
  const toScreen = (p: [number, number]): [number, number] => [CARD.x + CARD.w / 2 + (p[0] * iw - cx) * k, CARD.y + CARD.h / 2 + (p[1] * ih - cy) * k];

  ctx.save();
  // card: soft shadow, rounded clip, the photo
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  ctx.drawImage(img, CARD.x + CARD.w / 2 - cx * k, CARD.y + CARD.h / 2 - cy * k, iw * k, ih * k);
  // gentle grade so overlays read
  const g = ctx.createLinearGradient(0, CARD.y, 0, CARD.y + CARD.h);
  g.addColorStop(0, 'rgba(20,17,14,0.15)');
  g.addColorStop(1, 'rgba(20,17,14,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(CARD.x, CARD.y, CARD.w, CARD.h);

  for (const a of cues) {
    const p = t - a.t;
    if (p < 0 || p > lenOf(a) || a.effect === 'focus') continue;
    const pt = points[a.target];
    if (!pt) continue;
    const [x, y] = toScreen(pt);
    const fade = clamp(p / 0.25) * clamp((lenOf(a) - p) / 0.3);
    ctx.save();
    ctx.globalAlpha = fade;
    if (a.effect === 'glow' || a.effect === 'pulse') {
      // a highlight ring, breathing
      const r = 70 + 10 * Math.sin(p * 6);
      ctx.strokeStyle = SIGNAL;
      ctx.lineWidth = 7;
      ctx.shadowColor = SIGNAL;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(x, y, r * outBack(clamp(p / 0.3), 2), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (a.effect === 'waves') {
      for (let i = 0; i < 4; i++) {
        const ph = (p * 0.8 + i / 4) % 1;
        ctx.globalAlpha = fade * (1 - ph) * 0.9;
        ctx.strokeStyle = SIGNAL;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x, y, 30 + ph * 300, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (a.effect === 'flow') {
      const to = points[a.path ?? ''];
      if (to) {
        const [x2, y2] = toScreen(to);
        const mx = (x + x2) / 2;
        const my = Math.min(y, y2) - 120;
        for (let i = 0; i < 9; i++) {
          const u = (p * 0.6 + i / 9) % 1;
          const qx = (1 - u) * (1 - u) * x + 2 * (1 - u) * u * mx + u * u * x2;
          const qy = (1 - u) * (1 - u) * y + 2 * (1 - u) * u * my + u * u * y2;
          const gr = ctx.createRadialGradient(qx, qy, 0, qx, qy, 26);
          gr.addColorStop(0, SIGNAL);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = fade * (0.4 + 0.6 * Math.sin(u * Math.PI));
          ctx.fillStyle = gr;
          ctx.fillRect(qx - 26, qy - 26, 52, 52);
          ctx.fillStyle = '#fff6ec';
          ctx.beginPath();
          ctx.arc(qx, qy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // labels and arrows sit above the card edge so they never get clipped
  for (const a of cues) {
    if (a.effect !== 'label' && a.effect !== 'arrow') continue;
    const p = t - a.t;
    if (p < 0 || p > lenOf(a)) continue;
    const pt = points[a.target];
    if (!pt) continue;
    const [px, py] = toScreen(pt);
    if (px < CARD.x || px > CARD.x + CARD.w || py < CARD.y || py > CARD.y + CARD.h) continue;
    const al = clamp(p / 0.25) * clamp((lenOf(a) - p) / 0.25);
    const ly = py > CARD.y + CARD.h / 2 ? py - 200 : py + 200;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (W / 2 - px) * 0.25 * outCubic(clamp(p / 0.3)), ly);
    ctx.stroke();
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    if (a.text) {
      const text = a.text.toUpperCase();
      ctx.font = DISPLAY(46, 900);
      const w = ctx.measureText(text).width + 60;
      const bx = Math.min(Math.max(px + (W / 2 - px) * 0.25, 40 + w / 2), W - 40 - w / 2);
      const s = 0.6 + 0.4 * outBack(clamp(p / 0.3), 2.2);
      ctx.translate(bx, ly);
      ctx.scale(s, s);
      ctx.fillStyle = SIGNAL;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -40, w, 80, 40);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 3);
    }
    ctx.restore();
  }
  return true;
}
