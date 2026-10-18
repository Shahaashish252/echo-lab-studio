// Animated illustrations for "diagram" scenes. scripts/auto.ts has Claude draw each scene as an SVG
// whose movable parts are top-level <g id="..."> groups; here every group is rasterized to its own
// layer once, measured, and then animated per frame (pop, pulse, glow, move, rotate, spin, shake,
// fade, flowing particles along a path, emitted waves, labels, and a camera that zooms to parts).
// Rendering is a pure function of time, so the preview and the final video match.
import { clamp, inOutCubic, outBack, outCubic, range, spring } from '../../engine/ease';
import { DISPLAY, INK, SIGNAL, type Ctx } from '../../kit';

export type Effect = 'pop' | 'pulse' | 'glow' | 'move' | 'rotate' | 'spin' | 'shake' | 'fade' | 'flow' | 'waves' | 'focus' | 'label';

export interface Anim {
  effect: Effect;
  /** group id (or "all" for focus, to zoom back out) */
  target: string;
  /** seconds from the scene start (resolved from the narration by plate.ts) */
  t: number;
  /** seconds; defaults per effect */
  dur?: number;
  dx?: number;
  dy?: number;
  deg?: number;
  zoom?: number;
  /** flow: the <path id> particles travel along */
  path?: string;
  color?: string;
  text?: string;
}

interface Layer {
  id: string;
  img: HTMLImageElement;
  /** bounding box in viewBox units */
  box: { x: number; y: number; w: number; h: number };
}

interface Loaded {
  vw: number;
  vh: number;
  layers: Layer[];
  paths: Map<string, { len: number; at: (d: number) => [number, number] }>;
}

const RASTER = 2; // layers are drawn at 2x the viewBox so zoom stays sharp
const cache = new Map<string, Promise<Loaded>>();
const ready = new Map<string, Loaded>();

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg layer failed to load'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function build(key: string, src: string): Promise<Loaded> {
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') throw new Error('not an svg');
  const vb = (root.getAttribute('viewBox') ?? '0 0 1000 1000').split(/[\s,]+/).map(Number);
  const [vw, vh] = [vb[2] || 1000, vb[3] || 1000];

  // measure in a live, hidden copy at 1 px per viewBox unit
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden';
  const live = document.importNode(root, true) as unknown as SVGSVGElement;
  live.setAttribute('width', String(vw));
  live.setAttribute('height', String(vh));
  host.appendChild(live);
  document.body.appendChild(host);
  const origin = live.getBoundingClientRect();

  const keep = (el: Element) => ['defs', 'style'].includes(el.nodeName);
  const children = Array.from(root.children);
  const groups = children.filter((el) => el.nodeName === 'g' && el.id);
  const loose = children.filter((el) => !keep(el) && !(el.nodeName === 'g' && el.id));

  const layerSvg = (only: Element[]) => {
    const copy = root.cloneNode(false) as Element;
    copy.setAttribute('width', String(vw * RASTER));
    copy.setAttribute('height', String(vh * RASTER));
    for (const el of children) if (keep(el) || only.includes(el)) copy.appendChild(el.cloneNode(true));
    return new XMLSerializer().serializeToString(copy);
  };

  const layers: Layer[] = [];
  // ungrouped drawing goes in one base layer, kept in document order before the groups
  const parts: [string, Element[]][] = [...(loose.length ? [['_base', loose] as [string, Element[]]] : []), ...groups.map((g) => [g.id, [g]] as [string, Element[]])];
  for (const [id, els] of parts) {
    let box = { x: 0, y: 0, w: vw, h: vh };
    if (id !== '_base') {
      const r = (live.querySelector(`#${CSS.escape(id)}`) as SVGGraphicsElement | null)?.getBoundingClientRect();
      if (r && r.width + r.height > 0) box = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    }
    layers.push({ id, img: await loadImage(layerSvg(els)), box });
  }

  // flow paths, sampled in viewBox units
  const paths = new Map<string, { len: number; at: (d: number) => [number, number] }>();
  live.querySelectorAll('path[id]').forEach((p) => {
    const path = p as SVGPathElement;
    const m = path.getCTM();
    const len = path.getTotalLength();
    if (!m || !len) return;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const q = path.getPointAtLength((i / 64) * len);
      pts.push([m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]);
    }
    paths.set(path.id, {
      len,
      at: (d) => {
        const f = clamp(d) * 64;
        const i = Math.min(63, Math.floor(f));
        const k = f - i;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
      },
    });
  });
  host.remove();
  const out = { vw, vh, layers, paths };
  ready.set(key, out);
  return out;
}

/** Renderer: loads (once) and measures the diagram. */
export function ensureDiagram(key: string, svg: string): Promise<unknown> {
  if (!cache.has(key)) cache.set(key, build(key, svg).catch((e) => (console.error(`diagram ${key}:`, e), undefined as unknown as Loaded)));
  return cache.get(key)!;
}

const center = (b: Layer['box']): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];
const DUR: Partial<Record<Effect, number>> = { pop: 0.5, pulse: 1.2, glow: 2.2, move: 0.8, rotate: 0.8, shake: 0.8, fade: 0.5, flow: 3, waves: 2.5, label: 2.4 };
const lenOf = (a: Anim) => a.dur ?? DUR[a.effect] ?? 1;

export interface Placement {
  /** centre of the diagram on screen and its size in px */
  cx: number;
  cy: number;
  size: number;
}

/**
 * Draws the diagram for scene-local time t. Returns false while it's still loading (preview).
 * `anims` must be sorted by t.
 */
export function drawDiagram(ctx: Ctx, key: string, svg: string, anims: Anim[], t: number, place: Placement): boolean {
  void ensureDiagram(key, svg);
  const d = ready.get(key);
  if (!d) return false;
  const byId = new Map(d.layers.map((l) => [l.id, l]));

  // frame the drawing itself, not its empty margins: fit the parts' combined bounds to the area
  const parts = d.layers.filter((l) => l.id !== '_base' || d.layers.length === 1);
  const x0 = Math.min(...parts.map((l) => l.box.x));
  const y0 = Math.min(...parts.map((l) => l.box.y));
  const x1 = Math.max(...parts.map((l) => l.box.x + l.box.w));
  const y1 = Math.max(...parts.map((l) => l.box.y + l.box.h));
  const home = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const fit = Math.min(place.size / Math.max(d.vw, d.vh) * 1.9, (place.size * 0.94) / Math.max(x1 - x0, y1 - y0, 1));

  // camera: glide to each focus target, "all" goes back to the whole diagram
  let cam = { x: home.x, y: home.y, z: 1 };
  let from = cam;
  for (const a of anims.filter((x) => x.effect === 'focus')) {
    if (t < a.t - 0.4) break;
    const l = byId.get(a.target);
    const to = l && a.target !== 'all'
      ? { x: center(l.box)[0], y: center(l.box)[1], z: a.zoom ?? clamp((Math.max(x1 - x0, y1 - y0) * 0.55) / Math.max(l.box.w, l.box.h, 1), 1.2, 2.2) }
      : { x: home.x, y: home.y, z: 1 };
    const e = inOutCubic(range(t, a.t - 0.4, a.t + 0.4));
    from = cam;
    cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e };
  }
  // a gentle drift so the frame is never still
  const drift = 1 + 0.025 * Math.sin(t * 0.7);
  const k = fit * cam.z * drift;
  const toScreen = (x: number, y: number): [number, number] => [place.cx + (x - cam.x) * k, place.cy + (y - cam.y) * k];

  ctx.save();
  ctx.translate(place.cx, place.cy);
  ctx.scale(k, k);
  ctx.translate(-cam.x, -cam.y);

  d.layers.forEach((l, li) => {
    const mine = anims.filter((a) => a.target === l.id);
    // the scene builds itself: parts pop in one after another
    let alpha = clamp((t - li * 0.06) / 0.3);
    let scale = 0.92 + 0.08 * outBack(clamp((t - li * 0.06) / 0.45), 2);
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let glow = 0;
    const pop = mine.find((a) => a.effect === 'pop');
    if (pop) {
      const p = t - pop.t;
      alpha = clamp(p / 0.15);
      scale = p <= 0 ? 0 : 0.5 + 0.5 * spring(p, 1.6, 7);
    }
    for (const a of mine) {
      const p = t - a.t;
      if (p < 0) continue;
      const u = clamp(p / lenOf(a));
      switch (a.effect) {
        case 'pulse':
          scale *= 1 + 0.12 * Math.sin(u * Math.PI * 3) * (1 - u);
          break;
        case 'glow':
          glow = Math.max(glow, Math.sin(Math.min(1, u) * Math.PI) * (0.6 + 0.4 * Math.sin(p * 8)));
          break;
        case 'move':
          dx += (a.dx ?? 0) * outCubic(u);
          dy += (a.dy ?? 0) * outCubic(u);
          break;
        case 'rotate':
          rot += ((a.deg ?? 90) * Math.PI / 180) * inOutCubic(u);
          break;
        case 'spin':
          rot += (u < 1 ? p : lenOf(a)) * ((a.deg ?? 180) * Math.PI / 180);
          break;
        case 'shake':
          if (u < 1) dx += Math.sin(p * 60) * 6 * (1 - u);
          break;
        case 'fade':
          alpha *= 1 - 0.85 * outCubic(u);
          break;
      }
    }
    if (alpha <= 0.001 || scale <= 0.001) return;
    const [cx, cy] = center(l.box);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx + dx, cy + dy);
    if (rot) ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    if (glow > 0) {
      ctx.save();
      ctx.shadowColor = SIGNAL;
      ctx.shadowBlur = 40 * glow * k;
      ctx.globalAlpha = alpha * glow;
      ctx.drawImage(l.img, 0, 0, d.vw, d.vh);
      ctx.restore();
    }
    ctx.drawImage(l.img, 0, 0, d.vw, d.vh);
    ctx.restore();
  });

  // particles flowing along a path, and waves rippling out of a part
  for (const a of anims) {
    const p = t - a.t;
    if (p < 0 || p > lenOf(a)) continue;
    const fadeIO = clamp(p / 0.3) * clamp((lenOf(a) - p) / 0.3);
    const color = a.color ?? SIGNAL;
    if (a.effect === 'flow') {
      const path = d.paths.get(a.path ?? a.target);
      if (!path) continue;
      for (let i = 0; i < 9; i++) {
        const pos = (p * 0.55 + i / 9) % 1;
        const [x, y] = path.at(pos);
        ctx.save();
        ctx.globalAlpha = fadeIO * (0.35 + 0.65 * Math.sin(pos * Math.PI));
        const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 22, y - 22, 44, 44);
        ctx.fillStyle = '#fff6ec';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (a.effect === 'waves') {
      const l = byId.get(a.target);
      if (!l) continue;
      const [x, y] = center(l.box);
      const r0 = Math.max(l.box.w, l.box.h) / 2;
      for (let i = 0; i < 4; i++) {
        const ph = (p * 0.8 + i / 4) % 1;
        ctx.save();
        ctx.globalAlpha = fadeIO * (1 - ph) * 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x, y, r0 + ph * 260, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  ctx.restore();

  // labels: pill + leader line, in screen space so they stay readable when zoomed
  for (const a of anims) {
    if (a.effect !== 'label' || !a.text) continue;
    const p = t - a.t;
    if (p < 0 || p > lenOf(a)) continue;
    const l = byId.get(a.target);
    if (!l) continue;
    const al = clamp(p / 0.25) * clamp((lenOf(a) - p) / 0.25);
    const [px, py] = toScreen(...center(l.box));
    const above = py > place.cy;
    const ly = above ? Math.max(place.cy - place.size / 2 + 40, py - 220) : Math.min(place.cy + place.size / 2 - 40, py + 220);
    ctx.save();
    ctx.globalAlpha = al;
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (place.cx - px) * 0.3 * outCubic(clamp(p / 0.3)), ly);
    ctx.stroke();
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    const text = a.text.toUpperCase();
    ctx.font = DISPLAY(44, 900);
    const w = ctx.measureText(text).width + 56;
    const bx = Math.min(Math.max(px + (place.cx - px) * 0.3, 40 + w / 2), 1040 - w / 2);
    const s = 0.6 + 0.4 * outBack(clamp(p / 0.3), 2.2);
    ctx.translate(bx, ly);
    ctx.scale(s, s);
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -38, w, 76, 38);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 3);
    ctx.restore();
  }
  return true;
}
