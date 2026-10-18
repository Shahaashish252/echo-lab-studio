// 05 — Anatomy. The 3D HC-SR04 turns to face us; the transmitter and receiver light up with labels,
// then the camera drops to the four header pins.
import * as THREE from 'three';
import { clamp, inOutCubic, lerp, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, MONO, paper, SIGNAL, W, type Ctx } from '../../kit';
import { beats } from './script';
import { lights, orbit, pinTip, RX, Sensor3D, TX } from './sensor3d';
import { CYAN, DIM, headingV, label, pop } from './ui';

const B = beats(['parts-1', 'parts-2', 'parts-3', 'parts-4'], { lead: 0.4, tail: 1.0 });
export const LENGTH = B.length;

const P2 = B.at('parts-2');
const P3 = B.at('parts-3');
const P4 = B.at('parts-4');
const POWER = P4 + 1.2;
const SIGNALS = P4 + dur4(0.55);
function dur4(k: number) {
  return (B.end('parts-4') - P4) * k;
}

function callout(ctx: Ctx, ax: number, ay: number, bx: number, by: number, title: string, sub: string, color: string, p: number, align: CanvasTextAlign) {
  if (p <= 0) return;
  const lp = clamp(p / 0.4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ax, ay, 8 * lp, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + (bx - ax) * lp, ay + (by - ay) * lp);
  ctx.stroke();
  ctx.restore();
  const tp = clamp((p - 0.3) / 0.4);
  label(ctx, title, bx, by - 22, DISPLAY(50, 900), color, tp, align);
  label(ctx, sub, bx, by + 20, MONO(26, 500), BONE, tp, align);
}

export default class Parts extends Scene {
  uses3D = true;
  private s = new Sensor3D();
  private target = new THREE.Vector3();

  constructor() {
    super();
    this.three.add(this.s.group);
    lights(this.three);
  }

  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [45, 52, 57, 60, 64] },
      ...B.cues(),
      { t: 0.5, kind: 'servo', dur: 1.2, gain: 0.3 },
      { t: P2 + 0.3, kind: 'pop', gain: 0.6 },
      { t: P2 + 0.8, kind: 'zap', gain: 0.4, pitch: 1.8 },
      { t: P2 + 1.8, kind: 'zap', gain: 0.4, pitch: 1.8 },
      { t: P3 + 0.3, kind: 'pop', gain: 0.6, pitch: 0.9 },
      { t: P3 + 1.4, kind: 'chime', gain: 0.3, pitch: 2 },
      { t: P4, kind: 'whoosh', dur: 0.6, gain: 0.4 },
      { t: POWER, kind: 'pop', gain: 0.5 },
      { t: SIGNALS, kind: 'pop', gain: 0.5, pitch: 1.2 },
      { t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);

    const face = inOutCubic(range(t, P2 - 0.6, P2 + 0.4));
    const down = inOutCubic(range(t, P4 - 0.2, P4 + 1.0));
    const spin = lerp(-1.1 + t * 0.25, 0, face);
    const g = this.s.group;
    g.rotation.set(0, 0, 0);
    g.position.set(0, 0, 0);
    this.target.set(0, lerp(lerp(-0.5, -0.2, face), -1.4, down), 0);
    orbit(this.camera, spin, lerp(lerp(0.25, 0.05, face), 0.3, down), lerp(lerp(24, 21, face), 13.5, down), this.target);

    const txOn = range(t, P2 + 0.2, P2 + 0.5) * (1 - range(t, P3, P3 + 0.3));
    const rxOn = range(t, P3 + 0.2, P3 + 0.5) * (1 - range(t, P4, P4 + 0.3));
    const pw = range(t, POWER, POWER + 0.3);
    const sg = range(t, SIGNALS, SIGNALS + 0.3);
    this.s.update({ tx: txOn * (0.6 + 0.4 * Math.sin(t * 12)), rx: rxOn * (0.6 + 0.4 * Math.sin(t * 12)), pins: [pw * 0.4, sg, sg, pw * 0.4] });

    headingV(fg, 'ANATOMY', 'Inside the HC-SR04', t, out * (1 - down));

    // parts-1: name + key specs
    const nameA = range(t, 0.6, 1.0) * (1 - range(t, P2 - 0.4, P2)) * out;
    label(fg, 'HC-SR04', W / 2, 1180, DISPLAY(96, 900), BONE, nameA);
    ['5 V', '15 mA', '40 kHz'].forEach((s, i) => {
      const p = pop(t, 1.4 + i * 0.25) * (1 - range(t, P2 - 0.4, P2)) * out;
      if (p <= 0) return;
      fg.save();
      fg.translate(W / 2 + (i - 1) * 250, 1255);
      fg.scale(p, p);
      fg.fillStyle = 'rgba(79,214,255,0.14)';
      fg.strokeStyle = CYAN;
      fg.lineWidth = 2;
      fg.beginPath();
      fg.roundRect(-105, -38, 210, 64, 32);
      fg.fill();
      fg.stroke();
      fg.font = MONO(30, 500);
      fg.fillStyle = CYAN;
      fg.textAlign = 'center';
      fg.fillText(s, 0, 6);
      fg.restore();
    });

    // transmitter / receiver
    const [tx, ty] = this.s.project(TX, this.camera);
    const [rx, ry] = this.s.project(RX, this.camera);
    const tA = range(t, P2, P2 + 0.8) * (1 - down) * out;
    const rA = range(t, P3, P3 + 0.8) * (1 - down) * out;
    callout(fg, tx, ty - 60, 120, 560, 'TRANSMITTER', 'speaker · sends sound', CYAN, tA, 'left');
    callout(fg, rx, ry + 60, W - 120, 1230, 'RECEIVER', 'microphone · hears echo', SIGNAL, rA, 'right');
    // outgoing rings from T, incoming rings into R
    for (let k = 0; k < 4; k++) {
      const ph = (t * 1.1 + k / 4) % 1;
      if (txOn > 0) {
        fg.save();
        fg.globalAlpha = txOn * (1 - ph) * out;
        fg.strokeStyle = CYAN;
        fg.lineWidth = 4;
        fg.beginPath();
        fg.arc(tx, ty, 80 + ph * 260, 0, Math.PI * 2);
        fg.stroke();
        fg.restore();
      }
      if (rxOn > 0) {
        fg.save();
        fg.globalAlpha = rxOn * ph * out;
        fg.strokeStyle = SIGNAL;
        fg.lineWidth = 4;
        fg.beginPath();
        fg.arc(rx, ry, 80 + (1 - ph) * 260, 0, Math.PI * 2);
        fg.stroke();
        fg.restore();
      }
    }

    // pins
    const names = ['VCC', 'TRIG', 'ECHO', 'GND'];
    const roles = ['+5 V', 'IN', 'OUT', '0 V'];
    names.forEach((n, i) => {
      const isSig = i === 1 || i === 2;
      const p = isSig ? range(t, SIGNALS, SIGNALS + 0.5) : range(t, POWER, POWER + 0.5);
      const a = p * out;
      if (a <= 0) return;
      const [px, py] = this.s.project(pinTip(i), this.camera);
      const lx = W / 2 + (i - 1.5) * 235;
      const ly = py + 210;
      const col = isSig ? SIGNAL : BONE;
      fg.save();
      fg.globalAlpha = a;
      fg.strokeStyle = col;
      fg.lineWidth = 3;
      fg.beginPath();
      fg.moveTo(px, py + 8);
      fg.lineTo(px, py + 50);
      fg.lineTo(lx, ly - 90);
      fg.lineTo(lx, ly - 62);
      fg.stroke();
      fg.restore();
      label(fg, n, lx, ly, DISPLAY(50, 900), col, a);
      label(fg, roles[i], lx, ly + 44, MONO(26, 500), DIM, a);
    });

    B.subs(fg, t);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
