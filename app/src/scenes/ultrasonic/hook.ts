// 01 — Hook. A little robot with an HC-SR04 for eyes rolls towards a wall, pinging it; each echo
// updates its distance readout, and it stops short of the wall.
import { inCubic, inOutCubic, lerp, outCubic, range, smooth, spring } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, H, letters, MONO, paper, SIGNAL, W, zoomAbout } from '../../kit';
import { beats } from './script';
import { arcs, CYAN, label, packet, robot, robotEye, wall } from './ui';

const B = beats(['hook-1', 'hook-2'], { lead: 0.3, tail: 0.6 });
export const LENGTH = B.length;

const GROUND = 1180;
const WALL_X = 860;
const S = 1.12;
const V = 950; // wave speed, px/s
const STOP = B.at('hook-2') - 0.2;
const robotX = (t: number) => lerp(170, 380, smooth(range(t, 0, STOP)));
/** Ping emission times: steady while driving, then one big "shout". */
const PINGS = [0.35, 1.35, 2.35, B.at('hook-2') + 0.15];
const BIG = PINGS.length - 1;

function ping(t0: number) {
  const [ex, ey] = robotEye(robotX(t0), GROUND, S);
  const gap = WALL_X - ex;
  return { ex, ey, gap, back: t0 + (2 * gap) / V };
}

export default class Hook extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      { t: 0, kind: 'pad', dur, notes: [45, 52, 57, 59, 64] },
      ...B.cues(),
      { t: 0.05, kind: 'servo', dur: STOP, gain: 0.5 },
    ];
    PINGS.forEach((p, i) => {
      const { back } = ping(p);
      c.push({ t: p, kind: 'zap', gain: i === BIG ? 0.9 : 0.4, pitch: 1.6, pan: -0.3 });
      c.push({ t: back, kind: 'chime', gain: i === BIG ? 0.6 : 0.25, pitch: 2.2, pan: -0.2 });
    });
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.6 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    paper(bg);
    // dive into the robot's eyes at the end
    const dive = inCubic(range(t, L - 0.7, L));
    fg.save();
    const [eyeX, eyeY] = robotEye(robotX(t), GROUND, S);
    zoomAbout(fg, 1 + dive * 5, (eyeX - 60 - W / 2) * dive, (eyeY - H / 2) * dive);

    // floor
    const fl = fg.createLinearGradient(0, GROUND, 0, GROUND + 160);
    fl.addColorStop(0, 'rgba(239,230,214,0.1)');
    fl.addColorStop(1, 'rgba(239,230,214,0)');
    fg.fillStyle = fl;
    fg.fillRect(0, GROUND, W, 160);
    fg.fillStyle = 'rgba(239,230,214,0.35)';
    fg.fillRect(0, GROUND, W, 3);

    // sound
    fg.save();
    fg.beginPath();
    fg.rect(0, 0, WALL_X, H);
    fg.clip();
    let reading = -1;
    PINGS.forEach((p, i) => {
      if (t < p) return;
      const { ex, ey, gap, back } = ping(p);
      const big = i === BIG;
      const front = (t - p) * V;
      const n = big ? 8 : 5;
      const fade = (r: number) => (1 - r / 1400) * (big ? 1 : 0.7);
      arcs(fg, ex, ey, 0, 0.9, packet(front, n, 20).filter((r) => r < gap + 4), CYAN, (_, r) => fade(r), big ? 6 : 4);
      if (front > gap) arcs(fg, 2 * WALL_X - ex, ey, Math.PI, 0.9, packet(front, n, 20).filter((r) => r > gap), SIGNAL, (_, r) => fade(r) * (r < 2 * gap + 30 ? 1 : 0), big ? 6 : 4);
      if (t >= back) reading = Math.round(gap / 11);
    });
    fg.restore();

    const hit = PINGS.reduce((h, p) => {
      const { gap } = ping(p);
      const th = p + gap / V;
      return Math.max(h, Math.exp(-Math.max(0, t - th) * 6) * (t >= th ? 1 : 0));
    }, 0);
    wall(fg, WALL_X, 560, W + 20, GROUND, 1, hit * 0.8);

    const rx = robotX(t);
    const back = PINGS.map((p) => ping(p).back);
    const rxGlow = Math.max(...back.map((b) => (t >= b ? Math.exp(-(t - b) * 5) : 0)));
    const txGlow = Math.max(...PINGS.map((p) => (t >= p ? Math.exp(-(t - p) * 5) : 0)));
    robot(fg, rx, GROUND, S, t, { wheel: (rx - 170) / 42, tx: txGlow, rx: rxGlow });

    // distance readout above the robot, updated by each echo
    if (reading > 0) {
      const ra = range(t, back[0], back[0] + 0.2);
      fg.save();
      fg.globalAlpha = ra;
      fg.fillStyle = 'rgba(20,17,14,0.85)';
      fg.strokeStyle = reading < 30 ? SIGNAL : 'rgba(239,230,214,0.4)';
      fg.lineWidth = 3;
      const bx = rx - 20;
      const by = GROUND - 420;
      fg.beginPath();
      fg.roundRect(bx - 110, by - 50, 220, 70, 14);
      fg.fill();
      fg.stroke();
      fg.font = MONO(36, 500);
      fg.textAlign = 'center';
      fg.fillStyle = reading < 30 ? SIGNAL : BONE;
      fg.fillText(`${reading} cm`, bx, by - 2);
      fg.restore();
    }

    // "SHOUT" / "ECHO!" tags on the big ping
    const bp = ping(PINGS[BIG]);
    label(fg, 'SHOUT!', bp.ex + 150, bp.ey - 130, DISPLAY(44, 900), CYAN, range(t, PINGS[BIG], PINGS[BIG] + 0.15) * (1 - range(t, L - 0.9, L - 0.6)));
    label(fg, 'ECHO!', WALL_X - 120, bp.ey + 150, DISPLAY(44, 900), SIGNAL, range(t, bp.back - 0.35, bp.back - 0.2) * (1 - range(t, L - 0.9, L - 0.6)));
    fg.restore();

    // top kinetic type: "NO EYES?" then "JUST SOUND."
    const swap = B.at('hook-2');
    const out1 = 1 - range(t, swap - 0.25, swap);
    letters(fg, 'NO EYES?', W / 2, 470, DISPLAY(150, 900), BONE, (i) => {
      const a = t - 0.15 - i * 0.04;
      return { dy: (1 - spring(a, 1.6, 7)) * 90 - (1 - out1) * 60, alpha: Math.min(1, Math.max(0, a * 6)) * out1 };
    }, 'center');
    const out2 = 1 - range(t, L - 0.8, L - 0.5);
    letters(fg, 'JUST SOUND.', W / 2, 470, DISPLAY(124, 900), CYAN, (i) => {
      const a = t - swap - i * 0.035;
      return { dy: (1 - spring(a, 1.6, 7)) * 90, alpha: Math.min(1, Math.max(0, a * 6)) * out2, scale: 1 + 0.15 * (1 - outCubic(range(a, 0, 0.3))) };
    }, 'center');

    B.subs(fg, t);
    fadeInk(fg, 1 - range(t, 0, 0.15) + inOutCubic(range(t, L - 0.35, L)));
  }
}
