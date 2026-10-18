// Plate 3 — 3D elements and a continuous camera move. Starts on the exact isometric
// cube the shapes plate ended on, dollies back to reveal a rippling field of cubes,
// orbits, then cranes up and fades for the outro.
import * as THREE from 'three';
import { clamp, hash, inOutCubic, lerp, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, INK, letters, paper, SIGNAL, SIGNAL_HEX, slate, typed, W } from '../../kit';
import { HEX_R, isoCube } from './shapes';

const G = 17; // grid is G x G
const GAP = 1.5;
const FOV0 = 20;
const ISO_EL = Math.atan(1 / Math.SQRT2); // 35.26 deg: true isometric
// Distance at which a unit cube's silhouette has vertex radius HEX_R px at FOV0.
// The silhouette radius of a unit cube seen along (1,1,1) is sqrt(2/3).
const D0 = (Math.sqrt(2 / 3) * (H / 2)) / (Math.tan(THREE.MathUtils.degToRad(FOV0 / 2)) * HEX_R);

export default class Cubes extends Scene {
  uses3D = true;
  private field: THREE.InstancedMesh;
  private hero: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private target = new THREE.Vector3();

  constructor() {
    super();
    this.three.fog = new THREE.Fog(INK, 22, 60);

    const box = new THREE.BoxGeometry(1, 1, 1);
    // Flat face colours that match the 2D iso cube exactly: +x right, +y top, +z left.
    const face = (c: number) => new THREE.MeshBasicMaterial({ color: c, fog: false });
    this.hero = new THREE.Mesh(box, [
      face(0xeb5019), face(0xeb5019), face(0xff8c5a), face(0xc83e12), face(0xc83e12), face(0xc83e12),
    ]);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: SIGNAL_HEX }));
    edges.scale.setScalar(1.002);
    this.hero.add(edges);
    this.three.add(this.hero);

    this.field = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }), G * G);
    const c = new THREE.Color();
    for (let i = 0; i < G * G; i++) {
      const h = hash(i);
      this.field.setColorAt(i, c.setHex(h < 0.1 ? 0xd9cfbf : h < 0.16 ? SIGNAL_HEX : 0x3a332c));
    }
    this.three.add(this.field);

    this.three.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
    key.position.set(6, 12, 4);
    this.three.add(key);
    const rim = new THREE.DirectionalLight(SIGNAL_HEX, 1.4);
    rim.position.set(-8, 3, -6);
    this.three.add(rim);
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    paper(bg, { alpha: 1 - range(t, 0.3, 1.2) });

    // Camera: dolly back + widen (a dolly-zoom), orbit, then crane up.
    const pull = inOutCubic(range(t, 0.35, 2.7));
    const crane = inOutCubic(range(t, 3.6, 4.5));
    const dist = lerp(D0, 31, pull) - crane * 6;
    const az = Math.PI / 4 + 0.95 * inOutCubic(range(t, 0.35, 4.5));
    const el = lerp(lerp(ISO_EL, THREE.MathUtils.degToRad(24), pull), THREE.MathUtils.degToRad(78), crane);
    const cam = this.camera;
    cam.fov = lerp(FOV0, 34, pull);
    cam.position.set(Math.cos(el) * Math.sin(az) * dist, Math.sin(el) * dist, Math.cos(el) * Math.cos(az) * dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target.set(0, 0, 0));

    // Field: cubes pop in from the centre outward, then ride a radial wave.
    const mid = (G - 1) / 2;
    const amp = range(t, 1.1, 2.4);
    for (let i = 0; i < G; i++)
      for (let j = 0; j < G; j++) {
        const k = i * G + j;
        const x = (i - mid) * GAP;
        const z = (j - mid) * GAP;
        const d = Math.hypot(x, z);
        const isHero = i === mid && j === mid;
        const s = isHero ? 0 : Math.max(0, outBack(range(t, 0.45 + d * 0.045, 0.95 + d * 0.045), 2));
        const wave = Math.sin(d * 0.55 - t * 3.4) * 0.9 * amp * clamp(d / 3);
        this.dummy.position.set(x, wave, z);
        this.dummy.scale.set(s, s * (1 + 0.6 * amp * (0.5 + 0.5 * Math.sin(d * 0.55 - t * 3.4))), s);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.field.setMatrixAt(k, this.dummy.matrix);
      }
    this.field.instanceMatrix.needsUpdate = true;
    this.hero.rotation.y = 0;

    // Handoff: the 2D cube from the shapes plate sits on top, then dissolves into the 3D one.
    const hand = 1 - range(t, 0.05, 0.35);
    if (hand > 0) {
      fg.save();
      fg.globalAlpha = hand;
      isoCube(fg, 1, 1, 1);
      fg.restore();
    }

    slate(fg, 'MOTION AS CODE  /  03 DEPTH', f.t, range(t, 0.2, 0.6) * (1 - range(t, 3.8, 4.2)));
    const textOut = 1 - range(t, 3.5, 3.9);
    const scrim = range(t, 0.9, 1.5) * textOut;
    if (scrim > 0) {
      const g = fg.createLinearGradient(0, H, 0, H - 420);
      g.addColorStop(0, `rgba(20,17,14,${0.85 * scrim})`);
      g.addColorStop(1, 'rgba(20,17,14,0)');
      fg.fillStyle = g;
      fg.fillRect(0, H - 420, W, 420);
    }
    typed(fg, `scene.add(new InstancedMesh(box, mat, ${G * G}))`, 140, 840, range(t, 1.0, 1.9), 26, BONE, {
      alpha: 0.8 * textOut,
    });
    letters(fg, '3D ELEMENTS', 132, 960, DISPLAY(118), BONE, (i) => {
      const a = range(t, 1.3 + i * 0.04, 1.85 + i * 0.04);
      return { dy: (1 - outCubic(a)) * 60, alpha: a * textOut, color: i < 2 ? SIGNAL : undefined };
    });

    // Fade to ink for the outro.
    const fade = range(t, 4.05, 4.5);
    if (fade > 0) {
      fg.globalAlpha = fade;
      fg.fillStyle = INK;
      fg.fillRect(0, 0, W, H);
      fg.globalAlpha = 1;
    }
  }
}
