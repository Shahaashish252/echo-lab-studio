// 05 — The Geiger–Marsden apparatus, each part highlighted and labelled as it is named.
// apparatus() is reused by the fire plate.
import { hash, inOutCubic, lerp, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import {
  BONE, callout, card, fadeInk, glow, GOLD, heading, MONO, paper, pulseRing, SIGNAL, slate, type Ctx,
} from '../../kit';
import { beats } from './script';

const B = beats(['setup-1', 'setup-2', 'setup-3', 'setup-4', 'setup-5', 'setup-6', 'setup-7'], { lead: 0.5, tail: 1.0 });
export const LENGTH = B.length;

export const SRC = { x: 400, y: 530 };
export const FOIL = { x: 1060, y: 530 };
export const RING = 300;
const GAP = (7 * Math.PI) / 180; // opening in the screen where the beam enters
const deg = (d: number) => (d * Math.PI) / 180;
/** Microscope angle (measured from the beam direction) where the setup plate leaves it. */
export const MICRO_END = deg(150);

/** Point on the screen ring at scattering angle `th` (0 = straight on, +down / -up). */
export const ringAt = (th: number, r = RING): [number, number] => [FOIL.x + Math.cos(th) * r, FOIL.y + Math.sin(th) * r];

/**
 * The apparatus. `reveal` 0..5 draws its parts in order (lead box, beam, foil, screen, microscope).
 * `micro` is the microscope's angle.
 */
export function apparatus(ctx: Ctx, reveal: number, micro: number, alpha = 1, beam = 1) {
  if (alpha <= 0) return;
  const part = (k: number) => outCubic(Math.min(1, Math.max(0, reveal - k)));
  ctx.save();
  ctx.globalAlpha = alpha;

  // lead block with a slit, radium inside
  const lb = part(0);
  if (lb > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * lb;
    ctx.fillStyle = '#3b3631';
    ctx.strokeStyle = 'rgba(239,230,214,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(320, SRC.y - 90, 160, 80);
    ctx.rect(320, SRC.y + 10, 160, 80);
    ctx.rect(320, SRC.y - 10, 40, 20);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    glow(ctx, SRC.x - 12, SRC.y, 9, SIGNAL, lb);
    ctx.font = MONO(16, 500);
    ctx.fillStyle = `rgba(239,230,214,${0.7 * lb})`;
    ctx.fillText('Pb', 330, SRC.y - 65);
  }

  // beam path
  const bm = part(1) * beam;
  if (bm > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,90,31,${0.45 * bm})`;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(480, SRC.y);
    ctx.lineTo(lerp(480, FOIL.x, bm), SRC.y);
    ctx.stroke();
    ctx.restore();
  }

  // gold foil
  const fo = part(2);
  if (fo > 0) {
    ctx.fillStyle = GOLD;
    const h = 220 * fo;
    ctx.fillRect(FOIL.x - 4, FOIL.y - h / 2, 8, h);
  }

  // zinc sulfide screen, a ring around the foil with an opening for the beam
  const sc = part(3);
  if (sc > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,255,154,0.28)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    const a0 = Math.PI + GAP;
    ctx.arc(FOIL.x, FOIL.y, RING, a0, a0 + (Math.PI * 2 - GAP * 2) * sc);
    ctx.stroke();
    ctx.restore();
  }

  // microscope on the ring, pointing at the foil
  const mi = outBack(Math.min(1, Math.max(0, reveal - 4)), 2);
  if (mi > 0) {
    ctx.save();
    ctx.translate(...ringAt(micro));
    ctx.rotate(micro);
    ctx.scale(mi, mi);
    ctx.fillStyle = '#2a2622';
    ctx.strokeStyle = BONE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(10, -16, 90, 32);
    ctx.rect(100, -24, 26, 48);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = SIGNAL;
    ctx.fillRect(4, -10, 8, 20);
    ctx.restore();
  }
  ctx.restore();
}

/** Faint air molecules inside the chamber, pumped out when the vacuum is mentioned. */
function air(ctx: Ctx, a: number, t: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.fillStyle = BONE;
  for (let k = 0; k < 70; k++) {
    ctx.globalAlpha = a * 0.35;
    const x = 280 + hash(k) * 1150 + Math.sin(t * 1.3 + k) * 8;
    const y = 270 + hash(k + 91) * 620 + Math.cos(t * 1.1 + k * 2) * 8;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export default class Setup extends Scene {
  cues(dur: number): Cue[] {
    const at = (id: string) => B.at(id);
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur: dur / 2, notes: [48, 55, 60, 64, 67] },
      { t: dur / 2, kind: 'pad', dur: dur / 2, notes: [43, 50, 55, 59, 62, 67] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: at('setup-4') + 0.3, kind: 'whoosh', dur: 0.5, gain: 0.35 },
      { t: at('setup-6') + 0.4, kind: 'servo', dur: 2.6, gain: 0.5 },
      { t: at('setup-7') + 0.5, kind: 'riser', dur: 1.4, gain: 0.25 },
    ];
    for (let k = 0; k < 5; k++) c.push({ t: at('setup-1') + 0.3 + k * 0.55, kind: 'pop', gain: 0.4, pitch: 0.7 + k * 0.12 });
    ['setup-2', 'setup-3', 'setup-5', 'setup-6'].forEach((id, k) => {
      c.push({ t: at(id) + 0.3, kind: 'chime', gain: 0.18, pitch: [1.5, 1.68, 2, 2.24][k] });
      c.push({ t: at(id) + 0.65, kind: 'type', dur: 0.65, gain: 0.3 });
    });
    for (let k = 0; k < 3; k++) {
      c.push({ t: at('setup-5') + 1.2 + k * 0.5, kind: 'zap', gain: 0.3, pan: -0.5 });
      c.push({ t: at('setup-5') + 1.2 + k * 0.5 + 0.6, kind: 'flash', gain: 0.5, pan: 0.6 });
    }
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    const at = (id: string) => B.at(id);
    paper(bg);
    slate(fg, 'RUTHERFORD  /  05 SETUP', f.t, out);
    heading(fg, '04 / THE EXPERIMENT', 'Geiger–Marsden apparatus', t, out * (1 - range(t, at('setup-2'), at('setup-2') + 0.4)));

    // Vacuum chamber (named last) and the air it removes.
    const vac = range(t, at('setup-7') + 0.2, at('setup-7') + 0.8);
    air(bg, (1 - range(t, at('setup-7') + 0.6, at('setup-7') + 2.4)) * range(t, at('setup-1'), at('setup-1') + 1), t);
    if (vac > 0) {
      fg.save();
      fg.globalAlpha = vac * out;
      fg.strokeStyle = 'rgba(239,230,214,0.5)';
      fg.lineWidth = 2;
      fg.setLineDash([6, 10]);
      fg.beginPath();
      fg.roundRect(270, 205, 1170, 715, 40);
      fg.stroke();
      fg.setLineDash([]);
      fg.font = MONO(22, 500);
      fg.fillStyle = BONE;
      fg.fillText('VACUUM CHAMBER  ·  air pumped out', 300, 900);
      fg.restore();
    }

    const sweep = inOutCubic(range(t, at('setup-6') + 0.4, at('setup-6') + 3.0));
    const micro = lerp(deg(35), MICRO_END, sweep);
    apparatus(fg, range(t, at('setup-1') + 0.2, at('setup-1') + 3.0) * 5, micro, out);

    // A trickle down the beam once the lead block is explained.
    if (t > at('setup-2') + 1.0) {
      for (let k = 0; k < 8; k++) {
        const ph = t - at('setup-2') - 1.0 - k * 0.42;
        if (ph < 0) continue;
        const x = 480 + ((ph * 900) % 900) * (580 / 900);
        if (x < FOIL.x) glow(fg, x, SRC.y, 5, SIGNAL, 0.8 * out);
      }
    }

    // Highlight the part being talked about.
    const hl = (id: string, x: number, y: number, r: number) => {
      const a = range(t, at(id), at(id) + 0.3) * (1 - range(t, B.end(id), B.end(id) + 0.4));
      pulseRing(fg, x, y, r, t, a * out);
    };
    hl('setup-2', 400, SRC.y, 110);
    hl('setup-3', FOIL.x, FOIL.y, 130);
    const scr = ringAt(deg(-40));
    hl('setup-5', scr[0], scr[1], 50);
    const m = ringAt(micro, RING + 70);
    hl('setup-6', m[0], m[1], 80);

    // Labels accumulate, earlier ones dimmed, so the end is a fully labelled diagram.
    const lab = (id: string) => range(t, at(id) + 0.3, at(id) + 1.3);
    const dimAfter = (id: string) => (t > B.end(id) + 0.3 ? 0.55 : 1) * out;
    callout(fg, SRC.x - 12, SRC.y, 430, 840, 'radioactive source · emits α', lab('setup-2'), dimAfter('setup-2'));
    callout(fg, 480, SRC.y - 50, 560, 370, 'lead block · absorbs the rest', range(t, at('setup-2') + 1.6, at('setup-2') + 2.6), dimAfter('setup-2'));
    callout(fg, FOIL.x, FOIL.y - 110, 1180, 190, 'gold foil · ~100 nm thick', lab('setup-3'), dimAfter('setup-3'));
    callout(fg, scr[0], scr[1], 1430, 330, 'ZnS screen · flashes when hit', lab('setup-5'), dimAfter('setup-5'));
    const ml = ringAt(deg(35), RING + 110);
    callout(fg, ml[0], ml[1], 1450, 880, 'microscope · rotates to count', lab('setup-6'), dimAfter('setup-6'));

    // Why gold: hammered into leaf.
    card(fg, 1490, 430, 380, 'why gold?', ['most malleable metal', 'beaten to ~100 nm', '≈ 1/1000 of a hair', 'heavy nucleus, Z = 79'],
      outCubic(range(t, at('setup-4') + 0.1, at('setup-4') + 0.6)) * (1 - range(t, at('setup-5'), at('setup-5') + 0.4)) * out,
      (i) => range(t, at('setup-4') + 0.4 + i * 0.4, at('setup-4') + 0.7 + i * 0.4));

    // Demo flashes when the screen is explained.
    for (let k = 0; k < 3; k++) {
      const t0 = at('setup-5') + 1.2 + k * 0.5;
      const x = 480 + (t - t0) * 1100;
      if (t < t0) continue;
      if (x < FOIL.x + RING) glow(fg, Math.min(x, FOIL.x + RING), SRC.y + (k - 1) * 4, 6, SIGNAL, out);
      else {
        const age = (x - FOIL.x - RING) / 1100;
        glow(fg, FOIL.x + RING, SRC.y + (k - 1) * 4, 6 + 12 * Math.exp(-age * 6), '#c8ff9a', Math.exp(-age * 4) * out);
      }
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
