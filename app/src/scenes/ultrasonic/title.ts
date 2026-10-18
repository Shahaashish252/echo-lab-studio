// 02 — Title. The 3D HC-SR04 spins in under the title while its transmitter pings sonar rings.
import * as THREE from 'three';
import { clamp, inOutCubic, lerp, outCubic, range, spring } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, letters, paper, W } from '../../kit';
import { beats } from './script';
import { lights, orbit, Sensor3D, TX } from './sensor3d';
import { CYAN, fit, ripples } from './ui';

const B = beats(['hook-3'], { lead: 0.9, tail: 0.9, min: 4.4 });
export const LENGTH = B.length;
const PINGS = [1.4, 2.4, 3.4];

export default class Title extends Scene {
  uses3D = true;
  private s = new Sensor3D();
  private target = new THREE.Vector3(0, -0.3, 0);

  constructor() {
    super();
    this.three.add(this.s.group);
    lights(this.three);
  }

  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [45, 52, 57, 61, 64] },
      ...B.cues(),
      { t: 0, kind: 'riser', dur: 0.5, gain: 0.5 },
      { t: 0.45, kind: 'boom', gain: 0.8 },
      { t: 0.55, kind: 'hit', gain: 0.8 },
      ...PINGS.map((p) => ({ t: p, kind: 'zap', gain: 0.35, pitch: 1.8 })),
      { t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.6 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    paper(bg);
    ripples(bg, W / 2, 1150, t, 1);

    // sensor: flies in spinning, settles three-quarter, drifts
    const inP = outCubic(range(t, 0, 1.2));
    const g = this.s.group;
    g.rotation.set(0.15 * (1 - inP), lerp(Math.PI * 2.2, 0, inP) + Math.sin(t * 0.8) * 0.12, 0);
    g.position.set(0, lerp(-6, 0, inP) - 0.9, 0);
    const pingGlow = Math.max(...PINGS.map((p) => (t >= p ? Math.exp(-(t - p) * 4) : 0)));
    this.s.update({ tx: pingGlow });
    orbit(this.camera, 0.35 * Math.sin(t * 0.5) - 0.25, 0.18, lerp(26, 19, inOutCubic(range(t, 0, L))), this.target);

    // sonar rings around the transmitter (on screen)
    const [tx, ty] = this.s.project(TX, this.camera);
    for (const p of PINGS) {
      if (t < p) continue;
      for (let k = 0; k < 3; k++) {
        const age = t - p - k * 0.08;
        if (age < 0) continue;
        fg.save();
        fg.globalAlpha = clamp(1 - age / 1.1) * out;
        fg.strokeStyle = CYAN;
        fg.lineWidth = 5 - k;
        fg.shadowColor = CYAN;
        fg.shadowBlur = 16;
        fg.beginPath();
        fg.arc(tx, ty, 90 + age * 520, 0, Math.PI * 2);
        fg.stroke();
        fg.restore();
      }
    }

    const word = (txt: string, y: number, size: number, color: string, t0: number) =>
      letters(fg, txt, W / 2, y, DISPLAY(fit(fg, txt, size, 980), 900), color, (i) => {
        const a = t - t0 - i * 0.03;
        return { dy: (1 - spring(a, 1.5, 7)) * 110, alpha: clamp(a * 6) * out };
      }, 'center');
    word('HOW', 400, 96, BONE, 0.35);
    word('ULTRASONIC', 540, 150, CYAN, 0.5);
    word('SENSORS WORK', 670, 118, BONE, 0.75);

    B.subs(fg, t);
    fadeInk(fg, 1 - range(t, 0, 0.25) + (1 - out));
  }
}
