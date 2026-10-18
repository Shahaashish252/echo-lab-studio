// Thumbnail (1280x720) and vertical cover (1080x1920) for the ultrasonic video. Few words, huge type,
// the 3D sensor with sonar rings. Bottom-right of the thumbnail stays clear for YouTube's timestamp.
import * as THREE from 'three';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, INK, MONO, paper, SIGNAL, W, type Ctx } from '../../kit';
import { lights, orbit, Sensor3D, TX } from './sensor3d';
import { CYAN, fit } from './ui';

export const LENGTH = 1;

function rings(ctx: Ctx, x: number, y: number, r0: number, step: number, n: number) {
  for (let k = 0; k < n; k++) {
    ctx.save();
    ctx.strokeStyle = CYAN;
    ctx.globalAlpha = 0.9 - k * (0.8 / n);
    ctx.lineWidth = Math.max(3, 10 - k * 2);
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(x, y, r0 + k * step, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function chip(ctx: Ctx, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = DISPLAY(size, 900);
  const w = ctx.measureText(text).width + size * 0.9;
  ctx.fillStyle = SIGNAL;
  ctx.beginPath();
  ctx.roundRect(x, y - size * 0.95, w, size * 1.35, size * 0.3);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(text, x + size * 0.45, y + size * 0.05);
  ctx.restore();
}

function outlined(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') {
  ctx.save();
  ctx.font = DISPLAY(size, 900);
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.shadowColor = color === CYAN ? CYAN : 'rgba(0,0,0,0)';
  ctx.shadowBlur = color === CYAN ? 30 : 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

abstract class Base extends Scene {
  uses3D = true;
  protected s = new Sensor3D();
  constructor() {
    super();
    this.three.add(this.s.group);
    lights(this.three);
  }
  protected glowBg(bg: Ctx, x: number, y: number, r: number) {
    paper(bg);
    const g = bg.createRadialGradient(x, y, 20, x, y, r);
    g.addColorStop(0, 'rgba(79,214,255,0.35)');
    g.addColorStop(1, 'rgba(79,214,255,0)');
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);
  }
}

/** 1280x720 */
export class Thumb extends Base {
  render(_f: Frame, { bg, fg }: Layers) {
    this.glowBg(bg, 960, 380, 520);
    this.s.group.rotation.set(0.08, -0.45, 0);
    this.s.update({ tx: 0.5, rx: 0.15 });
    orbit(this.camera, 0, 0.1, 13.5, new THREE.Vector3(-3.0, -0.35, 0));
    const [tx, ty] = this.s.project(TX, this.camera);
    rings(bg, tx, ty, 120, 55, 4);
    outlined(fg, 'IT SEES', 52, 250, fit(fg, 'IT SEES', 150, 640), BONE);
    outlined(fg, 'WITH', 52, 410, 150, BONE);
    outlined(fg, 'SOUND', 52, 570, fit(fg, 'SOUND', 170, 640), CYAN);
    chip(fg, 'HC-SR04', 60, 668, 42);
  }
}

/** 1080x1920 cover. Text stays inside the 4:5 centre crop (y 285..1635) Instagram shows on the grid. */
export class Cover extends Base {
  render(_f: Frame, { bg, fg }: Layers) {
    this.glowBg(bg, W / 2, 1120, 700);
    this.s.group.rotation.set(0.12, -0.35, 0);
    this.s.update({ tx: 0.5, rx: 0.15 });
    orbit(this.camera, 0, 0.12, 24, new THREE.Vector3(0, 0.55, 0));
    const [tx, ty] = this.s.project(TX, this.camera);
    rings(bg, tx, ty, 140, 70, 5);
    outlined(fg, 'HOW', W / 2, 470, 120, BONE, 'center');
    outlined(fg, 'ULTRASONIC', W / 2, 640, fit(fg, 'ULTRASONIC', 170, 1000), CYAN, 'center');
    outlined(fg, 'SENSORS WORK', W / 2, 790, fit(fg, 'SENSORS WORK', 150, 1000), BONE, 'center');
    fg.save();
    fg.font = MONO(40, 500);
    fg.fillStyle = SIGNAL;
    fg.textAlign = 'center';
    fg.fillText('HC-SR04  ·  EXPLAINED IN 3D', W / 2, 1480);
    fg.restore();
  }
}

export default H > W ? Cover : Thumb;
