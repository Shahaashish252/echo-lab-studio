// Channel avatar, 800x800 (YouTube crops it to a circle): the HC-SR04 "face" mascot with echo rings.
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { H, INK, W } from '../../kit';
import { CYAN, sensorFront } from '../ultrasonic/ui';

export const LENGTH = 1;

export default class Avatar extends Scene {
  render(_f: Frame, { bg, fg }: Layers) {
    bg.fillStyle = INK;
    bg.fillRect(0, 0, W, H);
    const g = bg.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 420);
    g.addColorStop(0, 'rgba(79,214,255,0.28)');
    g.addColorStop(1, 'rgba(79,214,255,0)');
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);
    // echo rings
    for (let k = 0; k < 3; k++) {
      fg.save();
      fg.strokeStyle = CYAN;
      fg.globalAlpha = 0.55 - k * 0.15;
      fg.lineWidth = 12 - k * 3;
      fg.shadowColor = CYAN;
      fg.shadowBlur = 20;
      fg.beginPath();
      fg.arc(W / 2, H / 2 - 10, 300 + k * 38, -Math.PI * 0.85, -Math.PI * 0.15);
      fg.stroke();
      fg.beginPath();
      fg.arc(W / 2, H / 2 - 10, 300 + k * 38, Math.PI * 0.15, Math.PI * 0.85);
      fg.stroke();
      fg.restore();
    }
    sensorFront(fg, W / 2, H / 2 - 40, 1.25, { tx: 0.35, rx: 0.25 });
  }
}
