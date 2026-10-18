// A 3D HC-SR04 built from primitives. Units: 1 = 10 mm. Board in the XY plane, transducers along +Z,
// header pins pointing down (-Y). The silkscreen and mesh are drawn into canvas textures the first
// time the model renders (after the fonts have loaded).
import * as THREE from 'three';
import { H, W } from '../../kit';

const PIN_PITCH = 0.254;
export const TX = new THREE.Vector3(-1.3, 0, 1.36);
export const RX = new THREE.Vector3(1.3, 0, 1.36);
/** Tip of pin i (VCC, TRIG, ECHO, GND). */
export const pinTip = (i: number) => new THREE.Vector3((i - 1.5) * PIN_PITCH, -1.75, 0);

function drawSilk(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  const u = (x: number) => ((x + 2.25) / 4.5) * w;
  const v = (y: number) => (1 - (y + 1) / 2) * h;
  ctx.fillStyle = '#1f5fae';
  ctx.fillRect(0, 0, w, h);
  // traces
  ctx.strokeStyle = 'rgba(120,170,235,0.35)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(u(-0.3), v(-0.95));
  ctx.lineTo(u(-0.3), v(-0.6));
  ctx.lineTo(u(-0.45), v(-0.45));
  ctx.moveTo(u(0.3), v(-0.95));
  ctx.lineTo(u(0.3), v(-0.6));
  ctx.lineTo(u(0.45), v(-0.45));
  ctx.stroke();
  ctx.fillStyle = '#f2f6fb';
  ctx.textAlign = 'center';
  ctx.font = '600 44px "IBM Plex Mono", monospace';
  ctx.fillText('HC-SR04', u(0), v(0.08));
  ctx.font = '600 52px "IBM Plex Mono", monospace';
  ctx.fillText('T', u(-1.3), v(0.82));
  ctx.fillText('R', u(1.3), v(0.82));
  ctx.font = '600 26px "IBM Plex Mono", monospace';
  ['Vcc', 'Trig', 'Echo', 'Gnd'].forEach((l, i) => {
    ctx.save();
    ctx.translate(u((i - 1.5) * PIN_PITCH) + 9, v(-0.88));
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.fillText(l, 0, 0);
    ctx.restore();
  });
  // mounting holes
  for (const x of [-2.05, 2.05])
    for (const y of [-0.8, 0.8]) {
      ctx.fillStyle = '#d7dbe0';
      ctx.beginPath();
      ctx.arc(u(x), v(y), 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d0b09';
      ctx.beginPath();
      ctx.arc(u(x), v(y), 11, 0, Math.PI * 2);
      ctx.fill();
    }
}

function drawMesh(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  const s = c.width;
  ctx.fillStyle = '#25272b';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(205,210,216,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = -s; k <= 2 * s; k += 14) {
    ctx.moveTo(k, 0);
    ctx.lineTo(k - s, s);
    ctx.moveTo(k - s, 0);
    ctx.lineTo(k, s);
  }
  ctx.stroke();
}

export class Sensor3D {
  readonly group = new THREE.Group();
  private silk = document.createElement('canvas');
  private mesh = document.createElement('canvas');
  private silkTex: THREE.CanvasTexture;
  private meshTex: THREE.CanvasTexture;
  private drawn = false;
  readonly txMat: THREE.MeshPhongMaterial;
  readonly rxMat: THREE.MeshPhongMaterial;
  private pinMats: THREE.MeshPhongMaterial[] = [];
  private v = new THREE.Vector3();

  constructor() {
    this.silk.width = 1024;
    this.silk.height = 456;
    this.mesh.width = this.mesh.height = 256;
    this.silkTex = new THREE.CanvasTexture(this.silk);
    this.meshTex = new THREE.CanvasTexture(this.mesh);
    this.silkTex.anisotropy = 8;

    const g = this.group;
    const blue = new THREE.MeshPhongMaterial({ color: 0x1f5fae, shininess: 30 });
    const front = new THREE.MeshPhongMaterial({ map: this.silkTex, shininess: 40 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 0.16), [blue, blue, blue, blue, front, blue]));

    const silver = new THREE.MeshPhongMaterial({ color: 0xc9ccd1, specular: 0xffffff, shininess: 90 });
    this.txMat = new THREE.MeshPhongMaterial({ map: this.meshTex, emissive: 0x000000 });
    this.rxMat = new THREE.MeshPhongMaterial({ map: this.meshTex, emissive: 0x000000 });
    for (const [x, mat] of [
      [-1.3, this.txMat],
      [1.3, this.rxMat],
    ] as const) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 64, 1, true), silver);
      can.rotation.x = Math.PI / 2;
      can.position.set(x, 0, 0.08 + 0.6);
      g.add(can);
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.8, 64), silver);
      rim.position.set(x, 0, 1.28);
      g.add(rim);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.66, 64), mat);
      cap.position.set(x, 0, 1.275);
      g.add(cap);
    }
    const crystal = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.55, 6, 16), silver);
    crystal.rotation.z = Math.PI / 2;
    crystal.position.set(0, 0.72, 0.22);
    g.add(crystal);

    const black = new THREE.MeshPhongMaterial({ color: 0x18181a, shininess: 20 });
    const header = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.25), black);
    header.position.set(0, -1.12, 0);
    g.add(header);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshPhongMaterial({ color: 0xd9b25a, specular: 0xffffff, shininess: 80, emissive: 0x000000 });
      this.pinMats.push(m);
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.06), m);
      pin.position.set((i - 1.5) * PIN_PITCH, -1.45, 0);
      g.add(pin);
    }
    // chips on the back
    for (const [x, y, w, h] of [
      [-1.2, 0.1, 0.9, 0.55],
      [0.1, -0.2, 0.75, 0.45],
      [1.2, 0.15, 0.9, 0.55],
    ]) {
      const chip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), black);
      chip.position.set(x, y, -0.13);
      g.add(chip);
    }
  }

  /** Call once per frame before rendering: draws textures on first use, sets glows. */
  update({ tx = 0, rx = 0, pins = [0, 0, 0, 0] }: { tx?: number; rx?: number; pins?: number[] }) {
    if (!this.drawn) {
      drawSilk(this.silk);
      drawMesh(this.mesh);
      this.silkTex.needsUpdate = true;
      this.meshTex.needsUpdate = true;
      this.drawn = true;
    }
    this.txMat.emissive.setRGB(0.12 * tx, 0.34 * tx, 0.42 * tx);
    this.rxMat.emissive.setRGB(0.42 * rx, 0.14 * rx, 0.05 * rx);
    pins.forEach((p, i) => this.pinMats[i].emissive.setRGB(1.0 * p, 0.3 * p, 0.05 * p));
  }

  /** Screen position (frame px) of a point in the model's local space. */
  project(local: THREE.Vector3, camera: THREE.PerspectiveCamera): [number, number] {
    this.group.updateMatrixWorld();
    const v = this.v.copy(local).applyMatrix4(this.group.matrixWorld).project(camera);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
  }
}

/** Standard lights for the sensor. */
export function lights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.6);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4fd6ff, 1.1);
  rim.position.set(-8, 3, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xff5a1f, 0.6);
  fill.position.set(6, -4, 2);
  scene.add(fill);
}

/** Points the camera at `target` from spherical (az, el, dist), with the frame's aspect set now. */
export function orbit(cam: THREE.PerspectiveCamera, az: number, el: number, dist: number, target: THREE.Vector3, fov = 30) {
  cam.fov = fov;
  cam.aspect = W / H;
  cam.position.set(target.x + Math.cos(el) * Math.sin(az) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(el) * Math.cos(az) * dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
