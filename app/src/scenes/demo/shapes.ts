// Plate 2 — smooth shape transitions. One closed path of N points morphs
// circle -> square -> triangle -> hexagon, and the hexagon becomes an isometric cube
// that the 3D plate picks up.
import { inOutCubic, lerp, outCubic, range, smooth } from '../../engine/ease';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, letters, paper, SIGNAL, slate, typed, W, type Ctx } from '../../kit';
import { HANDOFF_R } from './title';

const N = 240;
const CX = W / 2;
const CY = H / 2;
export const HEX_R = 240; // vertex radius of the final hexagon / cube silhouette

type Pts = Float32Array; // x0,y0,x1,y1,...

function circle(r: number): Pts {
  const p = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    p[i * 2] = Math.cos(a) * r;
    p[i * 2 + 1] = Math.sin(a) * r;
  }
  return p;
}

/** Regular n-gon resampled to N points by arc length, starting at the top vertex. */
function ngon(n: number, r: number, rot = -Math.PI / 2): Pts {
  const v: [number, number][] = [];
  for (let k = 0; k < n; k++) v.push([Math.cos(rot + (k / n) * Math.PI * 2) * r, Math.sin(rot + (k / n) * Math.PI * 2) * r]);
  const p = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const s = (i / N) * n;
    const k = Math.floor(s);
    const u = s - k;
    const a = v[k % n];
    const b = v[(k + 1) % n];
    p[i * 2] = lerp(a[0], b[0], u);
    p[i * 2 + 1] = lerp(a[1], b[1], u);
  }
  return p;
}

const SHAPES = [circle(HANDOFF_R), ngon(4, 250, -Math.PI / 2), ngon(3, 280, -Math.PI / 2), ngon(6, HEX_R, -Math.PI / 2)];
// [start, end] of each morph, in plate-local seconds
const MORPHS: [number, number][] = [
  [0.45, 1.15],
  [1.35, 2.05],
  [2.25, 2.95],
];
const LABELS: [number, string][] = [
  [0.0, 'shape = circle(r)'],
  [0.45, 'shape = lerp(circle, square, ease(t))'],
  [1.35, 'shape = lerp(square, triangle, ease(t))'],
  [2.25, 'shape = lerp(triangle, hexagon, ease(t))'],
  [3.0, 'hexagon + 3 edges = cube'],
];

function shapeAt(t: number): { pts: Pts; rot: number } {
  let pts = SHAPES[0];
  let rot = 0;
  for (let k = 0; k < MORPHS.length; k++) {
    const [a, b] = MORPHS[k];
    if (t < a) break;
    const e = inOutCubic(range(t, a, b));
    const from = pts;
    const to = SHAPES[k + 1];
    const out = new Float32Array(N * 2);
    for (let i = 0; i < N * 2; i++) out[i] = lerp(from[i], to[i], e);
    pts = out;
    rot = Math.sin(Math.PI * e) * 0.5 * (k % 2 ? -1 : 1);
  }
  return { pts, rot };
}

function path(ctx: Ctx, pts: Pts, rot: number, scale = 1) {
  const c = Math.cos(rot) * scale;
  const s = Math.sin(rot) * scale;
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const px = CX + x * c - y * s;
    const py = CY + x * s + y * c;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

export default class Shapes extends Scene {
  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    paper(bg);
    const keep = 1 - range(t, 3.45, 3.9); // construction marks clear before the 3D handoff
    slate(fg, 'MOTION AS CODE  /  02 SHAPES', f.t, 1 - range(t, 3.6, 3.95));

    // Huge outlined word drifting behind the shape.
    bg.save();
    bg.font = DISPLAY(300);
    bg.strokeStyle = `rgba(239,230,214,${0.07 * keep})`;
    bg.lineWidth = 2;
    bg.textAlign = 'center';
    bg.strokeText('TRANSITIONS', W / 2 + 160 - t * 80, H / 2 + 105);
    bg.restore();

    // Construction circle and crosshair.
    fg.save();
    fg.strokeStyle = `rgba(239,230,214,${0.16 * keep})`;
    fg.lineWidth = 1.5;
    fg.setLineDash([6, 10]);
    fg.beginPath();
    fg.arc(CX, CY, 300 * outCubic(range(t, 0.1, 0.8)), 0, Math.PI * 2);
    fg.stroke();
    fg.setLineDash([]);
    const ch = 340 * outCubic(range(t, 0.2, 0.9));
    fg.beginPath();
    fg.moveTo(CX - ch, CY);
    fg.lineTo(CX + ch, CY);
    fg.moveTo(CX, CY - ch);
    fg.lineTo(CX, CY + ch);
    fg.stroke();
    fg.restore();

    // Motion ghosts: the same function sampled slightly in the past.
    for (let k = 4; k >= 1; k--) {
      const g = shapeAt(t - k * 0.035);
      path(fg, g.pts, g.rot);
      fg.strokeStyle = `rgba(239,230,214,${0.12 / k})`;
      fg.lineWidth = 3;
      fg.stroke();
    }

    const { pts, rot } = shapeAt(t);
    const fill = 1 - outCubic(range(t, 0.0, 0.5));
    path(fg, pts, rot);
    if (fill > 0) {
      fg.fillStyle = `rgba(255,90,31,${fill})`;
      fg.fill();
    }
    fg.strokeStyle = SIGNAL;
    fg.lineWidth = 6;
    fg.lineJoin = 'round';
    fg.stroke();

    // Vertex dots on the active polygon.
    fg.fillStyle = `rgba(239,230,214,${keep})`;
    const rc = Math.cos(rot);
    const rs = Math.sin(rot);
    for (let i = 0; i < N; i += N / 12) {
      const x = pts[i * 2];
      const y = pts[i * 2 + 1];
      fg.beginPath();
      fg.arc(CX + x * rc - y * rs, CY + x * rs + y * rc, 4, 0, Math.PI * 2);
      fg.fill();
    }

    isoCube(fg, smooth(range(t, 3.0, 3.45)), smooth(range(t, 3.35, 3.8)));

    // Label: types out whenever the formula changes.
    let label = LABELS[0];
    for (const l of LABELS) if (t >= l[0]) label = l;
    typed(fg, label[1], W / 2, 930, (t - label[0]) / 0.45, 28, BONE, {
      alpha: 0.85 * (1 - range(t, 3.55, 3.85)),
      align: 'center',
    });

    letters(fg, 'SHAPE', 140, 260, DISPLAY(64, 800), BONE, (i) => {
      const a = range(t, 0.2 + i * 0.04, 0.7 + i * 0.04);
      return { dy: (1 - outCubic(a)) * 30, alpha: a * (1 - range(t, 3.4, 3.7)) };
    });
    letters(fg, 'MORPH', 140, 330, DISPLAY(64, 800), SIGNAL, (i) => {
      const a = range(t, 0.35 + i * 0.04, 0.85 + i * 0.04);
      return { dy: (1 - outCubic(a)) * 30, alpha: a * (1 - range(t, 3.4, 3.7)) };
    });
  }
}

/**
 * Flat isometric cube on the hexagon: `edges` 0..1 grows the three inner edges,
 * `faces` 0..1 fades in the shaded faces. Exported so the 3D plate can hand off from it.
 */
export function isoCube(ctx: Ctx, edges: number, faces: number, outline = 0) {
  const v = (k: number) => {
    const a = -Math.PI / 2 + (k / 6) * Math.PI * 2;
    return [CX + Math.cos(a) * HEX_R, CY + Math.sin(a) * HEX_R];
  };
  const [T, UR, LR, B, LL, UL] = [0, 1, 2, 3, 4, 5].map(v);
  const C = [CX, CY];
  const shaded: [number[][], string][] = [
    [[T, UR, C, UL], '255,140,90'],
    [[UL, C, B, LL], '200,62,18'],
    [[C, UR, LR, B], '235,80,25'],
  ];
  if (faces > 0)
    for (const [poly, rgb] of shaded) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = `rgba(${rgb},${faces})`;
      ctx.fill();
    }
  ctx.save();
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const end of [UL, UR, B]) {
    ctx.moveTo(C[0], C[1]);
    ctx.lineTo(lerp(C[0], end[0], edges), lerp(C[1], end[1], edges));
  }
  if (outline > 0) {
    ctx.globalAlpha = outline;
    [T, UR, LR, B, LL, UL].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}
