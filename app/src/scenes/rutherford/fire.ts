// 06 — Observations. A deterministic stream of alpha particles hits the foil; flashes land on the
// screen, counters tally them, and time slows for the one that bounces back as the narrator says so.
import { hash, inOutCubic, lerp, range, smooth } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import {
  BONE, callout, DISPLAY, fadeInk, FLASH, glow, GOLD, heading, MONO, paper, particle, SIGNAL, slate, W,
  zoomAbout, type Ctx,
} from '../../kit';
import { beats } from './script';
import { apparatus, FOIL, MICRO_END, RING, ringAt, SRC } from './setup';

const B = beats(['fire-1', 'fire-2', ['fire-3', 0.3]], { lead: 0.6, tail: 1.6 });
export const LENGTH = B.length;

const deg = (d: number) => (d * Math.PI) / 180;
const V = 1500; // px per (sim) second
const SPAWN0 = 0.7;
const EVERY = 0.05;
const MICRO_BACK = MICRO_END;
/** Slow motion starts as "And some bounced back" begins. */
const S0 = B.at('fire-3') - 0.1;

// Time warp: plate time -> sim time, slowing to 22% around the bounce-back.
const STEP = 1 / 480;
const WARP: number[] = [0];
const speed = (t: number) => 1 - 0.78 * smooth(range(t, S0, S0 + 0.4)) * (1 - smooth(range(t, S0 + 2.0, S0 + 2.5)));
for (let i = 1; i * STEP <= LENGTH + 1; i++) WARP.push(WARP[i - 1] + speed((i - 0.5) * STEP) * STEP);
const sim = (t: number) => {
  const i = Math.min(WARP.length - 2, Math.max(0, Math.floor(t / STEP)));
  return lerp(WARP[i], WARP[i + 1], t / STEP - i);
};

const SPAWN_END = sim(LENGTH - 1.2);
const kAt = (simSpawn: number) => Math.round((simSpawn - SPAWN0) / EVERY);
const BACK_K = kAt(sim(S0 + 0.7) - (FOIL.x - 480) / V); // hits the foil in slow motion
const BACK2_K = kAt(sim(S0 + 3.0));

type Kind = 0 | 1 | 2; // straight, deflected, back
interface P {
  sp: number; // spawn (sim time)
  y0: number;
  th: number; // scattering angle
  tf: number; // reaches foil
  te: number; // reaches screen
  kind: Kind;
}

const PARTICLES: P[] = [];
for (let k = 0; SPAWN0 + k * EVERY < SPAWN_END; k++) {
  const h = hash(k * 3.1 + 1);
  const sign = hash(k * 5.7 + 2) < 0.5 ? -1 : 1;
  const u = hash(k * 1.3 + 9);
  let th: number;
  if (k === BACK_K) th = MICRO_BACK;
  else if (k === BACK2_K) th = -deg(158);
  else if (h < 0.78) th = (u - 0.5) * deg(1.6);
  else if (h < 0.95) th = sign * deg(2 + 25 * u);
  else th = sign * deg(30 + 50 * u);
  const sp = SPAWN0 + k * EVERY;
  const tf = sp + (FOIL.x - 480) / V;
  const a = Math.abs(th);
  PARTICLES.push({ sp, y0: SRC.y + (hash(k + 0.5) - 0.5) * 8, th, tf, te: tf + RING / V, kind: a < deg(1) ? 0 : a < deg(90) ? 1 : 2 });
}

/** Inverse of sim(): the plate time at which sim time reaches s. */
function realTime(s: number) {
  let lo = 0;
  let hi = WARP.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (WARP[mid] <= s) lo = mid;
    else hi = mid;
  }
  return (lo + (s - WARP[lo]) / (WARP[hi] - WARP[lo])) * STEP;
}

function pos(p: P, s: number): [number, number] {
  if (s <= p.tf) return [lerp(480, FOIL.x, (s - p.sp) / (p.tf - p.sp)), lerp(p.y0, FOIL.y + (p.y0 - SRC.y) * 0.3, (s - p.sp) / (p.tf - p.sp))];
  const d = (s - p.tf) * V;
  const fy = FOIL.y + (p.y0 - SRC.y) * 0.3;
  return [FOIL.x + Math.cos(p.th) * d, fy + Math.sin(p.th) * d];
}

export default class Fire extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [38, 45, 50, 53, 57] },
      { t: 0.4, kind: 'pulse', dur: S0 - 0.5, gain: 0.7 },
      { t: S0 + 2.5, kind: 'pulse', dur: dur - S0 - 3.2, gain: 0.7 },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: S0, kind: 'slowmo', gain: 1 },
    ];
    PARTICLES.forEach((p, k) => {
      c.push({ t: realTime(p.sp), kind: 'zap', gain: p.kind === 2 ? 0.5 : 0.16, pitch: 0.9 + hash(k + 0.3) * 0.25, pan: -0.5 });
      const g = [0.1, 0.22, 0.9][p.kind];
      c.push({ t: realTime(p.te), kind: 'flash', gain: g, pitch: [1, 1.2, 0.8][p.kind] * (0.95 + hash(k) * 0.1), pan: Math.cos(p.th) * 0.6 });
      if (p.kind === 2) {
        c.push({ t: realTime(p.tf), kind: 'boom', gain: k === BACK_K ? 1 : 0.6 });
        c.push({ t: realTime(p.te), kind: 'chime', gain: 0.45, pitch: 2 });
      }
    });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const s = sim(t);
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    const slow = 1 - speed(t);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  04 RESULT', f.t, out);

    const zoom = 1 + 0.14 * inOutCubic(range(t, S0 - 0.3, S0 + 0.6)) - 0.14 * inOutCubic(range(t, S0 + 2.3, S0 + 3.3));
    fg.save();
    zoomAbout(fg, zoom, FOIL.x - W / 2 - 60, 60);
    apparatus(fg, 5, MICRO_BACK, out, 0.35);
    this.bands(fg, t, out);

    const counts = [0, 0, 0];
    for (const p of PARTICLES) {
      if (s < p.sp) break;
      if (s >= p.te) {
        counts[p.kind]++;
        const [x, y] = ringAt(p.th);
        const age = s - p.te;
        // persistent mark + a bright flash that decays
        glow(fg, x, y, 3, FLASH, 0.35 * out);
        const fl = Math.exp(-age * 7);
        if (fl > 0.02) glow(fg, x, y, 6 + 10 * fl, FLASH, fl * out);
        continue;
      }
      const pts: [number, number][] = [];
      for (let j = 10; j >= 0; j--) pts.push(pos(p, Math.max(p.sp, s - j * 0.008)));
      particle(fg, pts, SIGNAL, p.kind === 2 ? 7 : 5, out);
    }

    // Spotlight on the backward bounce.
    const b = PARTICLES[BACK_K];
    const spot = range(s, b.tf - 0.05, b.tf + 0.05) * (1 - range(t, S0 + 2.4, S0 + 2.9)) * out;
    if (spot > 0) {
      fg.save();
      fg.strokeStyle = `rgba(255,90,31,${spot})`;
      fg.lineWidth = 2;
      fg.setLineDash([6, 6]);
      fg.beginPath();
      fg.arc(FOIL.x, FOIL.y, 36, 0, Math.PI * 2);
      fg.stroke();
      fg.restore();
      const [ex, ey] = ringAt(MICRO_BACK, RING - 20);
      callout(fg, ex, ey, ex - 120, ey + 120, 'bounced back!', range(s, b.te, b.te + 0.25), spot);
    }
    fg.restore();

    heading(fg, '05 / OBSERVATIONS', 'What they saw', t, out);
    this.counters(fg, t, counts, out);

    if (slow > 0.05) {
      fg.save();
      fg.globalAlpha = slow * out;
      fg.font = MONO(20, 500);
      fg.fillStyle = SIGNAL;
      fg.textAlign = 'center';
      fg.fillText('◉  SLOW MOTION', W / 2, 92);
      fg.restore();
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }

  /** Highlights the band of the screen each line is about: straight on, small angles, backwards. */
  private bands(ctx: Ctx, t: number, out: number) {
    const bands: [string, number, number, string][] = [
      ['fire-1', 0, 1.5, BONE],
      ['fire-2', 2, 88, GOLD],
      ['fire-3', 92, 173, SIGNAL],
    ];
    for (const [id, a0, a1, color] of bands) {
      const a = range(t, B.at(id), B.at(id) + 0.4) * (1 - range(t, B.end(id) + 0.2, B.end(id) + 0.6)) * out;
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = 26;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(FOIL.x, FOIL.y, RING + 24, sgn * deg(a0), sgn * deg(Math.max(a1, a0 + 1.5)), sgn < 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private counters(ctx: Ctx, t: number, counts: number[], out: number) {
    const rows: [string, string][] = [
      ['UNDEFLECTED  (< 1°)', BONE],
      ['DEFLECTED  (> 1°)', GOLD],
      ['BOUNCED BACK  (> 90°)', SIGNAL],
    ];
    const x = 1520;
    rows.forEach(([label, color], i) => {
      const a = range(t, 0.4 + i * 0.2, 0.8 + i * 0.2) * out;
      if (a <= 0) return;
      const y = 300 + i * 120;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(239,230,214,0.18)';
      ctx.fillRect(x, y + 22, 330, 1.5);
      ctx.font = MONO(18, 500);
      ctx.fillStyle = 'rgba(239,230,214,0.65)';
      ctx.fillText(label, x, y - 50);
      ctx.font = DISPLAY(56, 800);
      ctx.fillStyle = color;
      ctx.fillText(String(counts[i]), x, y + 6);
      ctx.restore();
    });
    ctx.save();
    ctx.globalAlpha = 0.5 * range(t, 1, 1.5) * out;
    ctx.font = MONO(15, 400);
    ctx.fillStyle = BONE;
    ctx.fillText('rare events exaggerated for clarity', x, 680);
    ctx.restore();
  }
}
