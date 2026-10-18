// Animated backgrounds drawn in code, used instead of stock footage. The storyboard picks one per
// scene ("visual"). Every one is a pure function of time and a seed (no Math.random), kept dim so the
// graphics and captions on top stay readable.
import { clamp, hash, outCubic, range } from '../../engine/ease';
import { H, paper, SIGNAL, W, type Ctx } from '../../kit';

export const VISUALS = ['circuit', 'network', 'waves', 'orbit', 'grid', 'particles', 'bars', 'radar'] as const;
export type Visual = (typeof VISUALS)[number];

const bone = (a: number) => `rgba(239,230,214,${a})`;
const signal = (a: number) => `rgba(255,90,31,${a})`;

/** Seeded pseudo-random stream. */
const rnd = (seed: number) => {
  let k = 0;
  return () => hash(seed * 997 + k++ * 13.37);
};

/** The scene's background: ink, a slow colour bloom, faint grid, then the motif. Punches in on the cut. */
export function backdrop(ctx: Ctx, visual: string, t: number, seed: number) {
  paper(ctx, { alpha: 0.6 });
  ctx.save();
  const punch = 1 + 0.1 * (1 - outCubic(range(t, 0, 0.5)));
  ctx.translate(W / 2, H / 2);
  ctx.scale(punch, punch);
  ctx.translate(-W / 2, -H / 2);
  bloom(ctx, t, seed);
  (DRAW[visual as Visual] ?? DRAW[VISUALS[seed % VISUALS.length]])(ctx, t, seed);
  ctx.restore();
  // keep the caption area calm
  const bot = ctx.createLinearGradient(0, 1150, 0, H);
  bot.addColorStop(0, 'rgba(20,17,14,0)');
  bot.addColorStop(0.4, 'rgba(20,17,14,0.7)');
  bot.addColorStop(1, 'rgba(20,17,14,0.9)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, 1150, W, H - 1150);
}

/** Two big soft glows drifting, one signal orange, one warm bone. */
function bloom(ctx: Ctx, t: number, seed: number) {
  const r = rnd(seed + 7);
  for (const [color, a] of [[signal, 0.22], [bone, 0.06]] as const) {
    const x = W * (0.2 + 0.6 * r()) + Math.sin(t * 0.35 + r() * 6) * 120;
    const y = H * (0.2 + 0.5 * r()) + Math.cos(t * 0.3 + r() * 6) * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 760);
    g.addColorStop(0, color(a));
    g.addColorStop(1, color(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function halo(ctx: Ctx, x: number, y: number, r: number, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, signal(a));
  g.addColorStop(1, signal(0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

type Draw = (ctx: Ctx, t: number, seed: number) => void;

const DRAW: Record<Visual, Draw> = {
  /** PCB traces with signals racing along them. */
  circuit(ctx, t, seed) {
    const r = rnd(seed);
    const step = 60;
    for (let k = 0; k < 18; k++) {
      // a Manhattan path from a random grid point
      const pts: [number, number][] = [[Math.round((r() * W) / step) * step, Math.round((r() * H) / step) * step]];
      let horiz = r() > 0.5;
      for (let s = 0; s < 4; s++) {
        const [x, y] = pts[pts.length - 1];
        const d = (Math.round(r() * 6) + 2) * step * (r() > 0.5 ? 1 : -1);
        pts.push(horiz ? [x + d, y] : [x, y + d]);
        horiz = !horiz;
      }
      ctx.strokeStyle = bone(0.11);
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
        ctx.strokeStyle = bone(0.2);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      // signal pulse travelling the path
      const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
      const total = lens.reduce((a, b) => a + b, 0);
      let d = ((t * 420 + r() * total) % (total + 400)) - 200;
      if (d < 0 || d > total) continue;
      let i = 0;
      while (d > lens[i]) d -= lens[i++];
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const x = ax + ((bx - ax) * d) / lens[i];
      const y = ay + ((by - ay) * d) / lens[i];
      halo(ctx, x, y, 46, 0.55);
      dot(ctx, x, y, 6, '#fff3e6');
    }
  },

  /** Drifting nodes, linked when close, with a few lit up. */
  network(ctx, t, seed) {
    const r = rnd(seed);
    const nodes = Array.from({ length: 42 }, () => {
      const bx = r() * W;
      const by = r() * H;
      const ph = r() * 6.28;
      const sp = 0.2 + r() * 0.4;
      return [bx + Math.sin(t * sp + ph) * 50, by + Math.cos(t * sp * 0.8 + ph) * 50, r()] as const;
    });
    ctx.lineWidth = 2;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
        if (d > 300) continue;
        ctx.strokeStyle = bone(0.16 * (1 - d / 300));
        ctx.beginPath();
        ctx.moveTo(nodes[i][0], nodes[i][1]);
        ctx.lineTo(nodes[j][0], nodes[j][1]);
        ctx.stroke();
      }
    nodes.forEach(([x, y, k], i) => {
      const lit = clamp(Math.sin(t * 1.4 + i * 1.7) * 2 - 1.2);
      if (k > 0.75 && lit > 0) halo(ctx, x, y, 60, 0.5 * lit);
      dot(ctx, x, y, k > 0.75 ? 7 : 4, k > 0.75 && lit > 0 ? SIGNAL : bone(0.45));
    });
  },

  /** Layered sine waves rolling across, like sound or signals. */
  waves(ctx, t, seed) {
    const r = rnd(seed);
    for (let k = 0; k < 9; k++) {
      const y0 = 300 + k * 150 + r() * 40;
      const amp = 40 + r() * 70;
      const fr = 0.004 + r() * 0.005;
      const sp = 1 + r() * 1.5;
      const hot = k === 4;
      ctx.strokeStyle = hot ? signal(0.55) : bone(0.1);
      ctx.lineWidth = hot ? 5 : 3;
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 12) {
        const y = y0 + Math.sin(x * fr + t * sp + k) * amp * (0.6 + 0.4 * Math.sin(t * 0.7 + k));
        x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },

  /** Concentric orbits with bodies circling a glowing core. */
  orbit(ctx, t, seed) {
    const r = rnd(seed);
    const cx = W / 2;
    const cy = 760;
    halo(ctx, cx, cy, 260, 0.35);
    dot(ctx, cx, cy, 26, signal(0.8));
    for (let k = 1; k <= 7; k++) {
      const rad = 90 + k * 115;
      const tilt = 0.55;
      ctx.strokeStyle = bone(0.1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad, rad * tilt, -0.25, 0, Math.PI * 2);
      ctx.stroke();
      const a = t * (1.6 / Math.sqrt(k)) + r() * 6.28;
      const x = cx + Math.cos(a) * rad * Math.cos(-0.25) - Math.sin(a) * rad * tilt * Math.sin(-0.25);
      const y = cy + Math.cos(a) * rad * Math.sin(-0.25) + Math.sin(a) * rad * tilt * Math.cos(-0.25);
      const hot = k % 3 === 1;
      if (hot) halo(ctx, x, y, 40, 0.5);
      dot(ctx, x, y, hot ? 9 : 6, hot ? SIGNAL : bone(0.6));
    }
  },

  /** Retro perspective floor scrolling toward the viewer under a glowing horizon. */
  grid(ctx, t) {
    const hy = 1050;
    const vx = W / 2;
    const g = ctx.createLinearGradient(0, hy - 200, 0, hy + 40);
    g.addColorStop(0, signal(0));
    g.addColorStop(1, signal(0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, hy - 200, W, 240);
    ctx.strokeStyle = signal(0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(W, hy);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = -12; k <= 12; k++) {
      ctx.strokeStyle = bone(0.13);
      ctx.beginPath();
      ctx.moveTo(vx + k * 18, hy);
      ctx.lineTo(vx + k * 260, H);
      ctx.stroke();
    }
    for (let k = 0; k < 14; k++) {
      const z = (k + ((t * 0.9) % 1)) / 14; // 0 far .. 1 near
      const y = hy + (H - hy) * z * z;
      ctx.strokeStyle = bone(0.04 + 0.16 * z);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // a sun of stripes above the horizon
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = signal(0.16 - k * 0.02);
      ctx.beginPath();
      ctx.arc(vx, hy, 300 - k * 4, Math.PI + k * 0.05, -k * 0.05);
      ctx.fill();
    }
  },

  /** Soft bokeh drifting upward. */
  particles(ctx, t, seed) {
    const r = rnd(seed);
    for (let k = 0; k < 80; k++) {
      const x0 = r() * W;
      const sp = 40 + r() * 110;
      const size = 2 + r() * r() * 22;
      const y = H + 60 - ((r() * (H + 120) + t * sp) % (H + 120));
      const x = x0 + Math.sin(t * 0.8 + k) * 30;
      const hot = r() > 0.82;
      if (size > 10) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
        g.addColorStop(0, hot ? signal(0.35) : bone(0.12));
        g.addColorStop(1, hot ? signal(0) : bone(0));
        ctx.fillStyle = g;
        ctx.fillRect(x - size * 2, y - size * 2, size * 4, size * 4);
      } else dot(ctx, x, y, size, hot ? signal(0.7) : bone(0.3));
    }
  },

  /** Data columns rising and falling, one in signal. */
  bars(ctx, t, seed) {
    const r = rnd(seed);
    const n = 14;
    const gap = 14;
    const bw = (W - 80 - gap * (n - 1)) / n;
    const base = 1250;
    for (let k = 0; k < n; k++) {
      const h = 160 + 520 * (0.5 + 0.5 * Math.sin(t * (0.8 + r()) + k * 0.7 + r() * 6)) * (0.5 + r() * 0.5);
      const hot = k === 9;
      const x = 40 + k * (bw + gap);
      const g = ctx.createLinearGradient(0, base - h, 0, base);
      g.addColorStop(0, hot ? signal(0.6) : bone(0.16));
      g.addColorStop(1, hot ? signal(0.05) : bone(0.02));
      ctx.fillStyle = g;
      ctx.fillRect(x, base - h, bw, h);
      ctx.fillStyle = hot ? SIGNAL : bone(0.4);
      ctx.fillRect(x, base - h, bw, 4);
    }
    // trend line over the tops
    ctx.strokeStyle = signal(0.4);
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(40, 1050);
    ctx.lineTo(W - 40, 560 + Math.sin(t * 0.6) * 40);
    ctx.stroke();
    ctx.setLineDash([]);
  },

  /** Radar: rings and a rotating sweep that lights up blips. */
  radar(ctx, t, seed) {
    const r = rnd(seed);
    const cx = W / 2;
    const cy = 760;
    ctx.strokeStyle = bone(0.12);
    ctx.lineWidth = 2;
    for (let k = 1; k <= 6; k++) {
      ctx.beginPath();
      ctx.arc(cx, cy, k * 130, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 800, cy);
    ctx.lineTo(cx + 800, cy);
    ctx.moveTo(cx, cy - 800);
    ctx.lineTo(cx, cy + 800);
    ctx.stroke();
    const a = (t * 1.3) % (Math.PI * 2);
    for (let k = 0; k < 24; k++) {
      const w = (k / 24) * 0.9;
      ctx.fillStyle = signal(0.12 * (1 - k / 24));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 800, a - w - 0.04, a - w);
      ctx.closePath();
      ctx.fill();
    }
    for (let k = 0; k < 9; k++) {
      const ba = r() * Math.PI * 2;
      const br = 120 + r() * 640;
      const since = (((a - ba) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const lit = Math.exp(-since * 1.5);
      const x = cx + Math.cos(ba) * br;
      const y = cy + Math.sin(ba) * br;
      halo(ctx, x, y, 40, 0.6 * lit);
      dot(ctx, x, y, 6, signal(0.25 + 0.75 * lit));
    }
  },
};

