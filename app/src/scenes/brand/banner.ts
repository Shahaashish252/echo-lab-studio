// Channel banner, 2560x1440. Everything that matters sits in YouTube's all-devices safe area
// (the centre 1546x423); the rest is sonar decoration that only TVs and desktops show.
import * as THREE from 'three';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, MONO, paper, SIGNAL, W } from '../../kit';
import { lights, orbit, Sensor3D } from '../ultrasonic/sensor3d';
import { CYAN, DIM, fit } from '../ultrasonic/ui';

export const LENGTH = 1;
const SAFE = { x: (W - 1546) / 2, y: (H - 423) / 2, w: 1546, h: 423 };

export default class Banner extends Scene {
  uses3D = true;
  private s = new Sensor3D();

  constructor() {
    super();
    this.three.add(this.s.group);
    lights(this.three);
  }

  render(_f: Frame, { bg, fg }: Layers) {
    paper(bg);
    // sonar decoration
    for (let k = 0; k < 9; k++) {
      bg.save();
      bg.strokeStyle = k % 3 === 2 ? SIGNAL : CYAN;
      bg.globalAlpha = 0.22 - k * 0.018;
      bg.lineWidth = 4;
      bg.beginPath();
      bg.arc(SAFE.x + 230, H / 2, 260 + k * 150, -0.9, 0.9);
      bg.stroke();
      bg.restore();
    }
    // 3D sensor on the left of the safe area
    const g = this.s.group;
    g.rotation.set(0.05, 0.55, 0);
    this.s.update({ tx: 0.3, rx: 0.2 });
    // place the model: camera looks at a target offset so the board lands at the left of the safe area
    orbit(this.camera, 0, 0.12, 26, new THREE.Vector3(5.3, -0.2, 0), 30);

    // title
    const x = SAFE.x + 560;
    const size = fit(fg, 'ECHO LAB 3D', 190, SAFE.w - 600, 900);
    fg.save();
    fg.font = DISPLAY(size, 900);
    fg.textBaseline = 'alphabetic';
    fg.fillStyle = BONE;
    fg.fillText('ECHO LAB', x, H / 2 + 40);
    const w = fg.measureText('ECHO LAB ').width;
    fg.fillStyle = CYAN;
    fg.fillText('3D', x + w, H / 2 + 40);
    fg.restore();
    fg.save();
    fg.font = MONO(44, 500);
    fg.fillStyle = SIGNAL;
    fg.fillText('HOW THINGS WORK  ·  IN 3D ANIMATION', x + 6, H / 2 - 120);
    fg.font = DISPLAY(48, 500);
    fg.fillStyle = DIM;
    fg.fillText('Sensors, circuits & tech, explained simply', x + 6, H / 2 + 130);
    fg.restore();
  }
}
