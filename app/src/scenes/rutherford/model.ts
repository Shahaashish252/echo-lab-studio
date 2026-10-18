// 12 — Rutherford's nuclear model in 3D (a lithium atom: 3 protons, 4 neutrons, 3 electrons, so
// it is neutral), with the postulates appearing as they are spoken.
import * as THREE from 'three';
import { outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, eq, fadeInk, frac, GOLD, heading, MONO, paper, SIGNAL, SIGNAL_HEX, slate } from '../../kit';
import { beats } from './script';

const B = beats(['model-1', 'model-2', 'model-3', 'model-4', 'model-5'], { lead: 0.6, tail: 1.4 });
export const LENGTH = B.length;

const ORBITS = [
  { r: 2.6, tilt: new THREE.Euler(1.2, 0.2, 0), speed: 1.6, phase: 0.3 },
  { r: 3.5, tilt: new THREE.Euler(0.4, 0.9, 0.5), speed: -1.15, phase: 2.1 },
  { r: 4.3, tilt: new THREE.Euler(-0.7, -0.4, 1.1), speed: 0.85, phase: 4.0 },
];
/** [line that reveals it, heading, detail, y] */
const POINTS: [string, string, string, number][] = [
  ['model-2', 'Tiny, dense, positive nucleus', 'almost all the mass, ~10⁻¹⁵ m across', 400],
  ['model-3', 'Electrons in circular orbits', 'around the nucleus, like planets round the sun', 540],
  ['model-5', 'The atom is neutral', 'electrons = protons  (lithium: 3 = 3)', 790],
];

export default class Model extends Scene {
  uses3D = true;
  private atom = new THREE.Group();
  private nucleus = new THREE.Group();
  private electrons: THREE.Mesh[] = [];
  private orbitMats: THREE.LineBasicMaterial[] = [];

  constructor() {
    super();
    const ball = new THREE.SphereGeometry(1, 32, 16);
    const proton = new THREE.MeshStandardMaterial({ color: SIGNAL_HEX, emissive: SIGNAL_HEX, emissiveIntensity: 0.45, roughness: 0.35 });
    const neutron = new THREE.MeshStandardMaterial({ color: 0xe9dfcf, emissive: 0x3a2a20, roughness: 0.45 });
    // lithium-7: 3 protons + 4 neutrons, packed on a small Fibonacci sphere
    const n = 7;
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const rr = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      const m = new THREE.Mesh(ball, i % 2 ? proton : neutron);
      m.scale.setScalar(0.3);
      m.position.set(Math.cos(a) * rr * 0.3, y * 0.3, Math.sin(a) * rr * 0.3);
      this.nucleus.add(m);
    }
    this.atom.add(this.nucleus);

    const eMat = new THREE.MeshBasicMaterial({ color: 0xf4ecdf });
    for (const o of ORBITS) {
      const ring = new THREE.Group();
      ring.rotation.copy(o.tilt);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 128; k++) pts.push(new THREE.Vector3(Math.cos((k / 128) * Math.PI * 2) * o.r, 0, Math.sin((k / 128) * Math.PI * 2) * o.r));
      const mat = new THREE.LineBasicMaterial({ color: 0xefe6d6, transparent: true, opacity: 0.3 });
      this.orbitMats.push(mat);
      ring.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      const e = new THREE.Mesh(ball, eMat);
      e.scale.setScalar(0.12);
      ring.add(e);
      this.electrons.push(e);
      this.atom.add(ring);
    }
    this.three.add(this.atom);

    this.three.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.position.set(4, 6, 8);
    this.three.add(key);
    const rim = new THREE.PointLight(SIGNAL_HEX, 30, 12);
    rim.position.set(0, 0, 0);
    this.three.add(rim);

    // push the atom to the right third of the frame
    this.camera.setViewOffset(1920, 1080, -400, 0, 1920, 1080);
  }

  cues(dur: number): Cue[] {
    return [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [36, 43, 50, 52, 55, 60] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: B.at('model-1') - 0.4, kind: 'boom', gain: 0.45, pitch: 1.5 },
      { t: B.at('model-2') + 0.1, kind: 'chime', gain: 0.3, pitch: 1.5 },
      { t: B.at('model-3') + 0.1, kind: 'chime', gain: 0.3, pitch: 1.68 },
      { t: B.at('model-4') + 0.2, kind: 'whoosh', dur: 0.5, gain: 0.25 },
      { t: B.at('model-5') + 0.1, kind: 'chime', gain: 0.3, pitch: 2 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    paper(bg, { alpha: 0.5 });

    const s = outBack(range(t, B.at('model-1') - 0.4, B.at('model-1') + 0.6), 1.6) * (1 - range(t, L - 0.5, L));
    this.atom.scale.setScalar(Math.max(0.0001, s));
    this.nucleus.rotation.set(t * 0.3, t * 0.5, 0);
    this.electrons.forEach((e, i) => {
      const o = ORBITS[i];
      const a = o.phase + t * o.speed;
      e.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
    });
    // orbits brighten while they're being described
    const lit = range(t, B.at('model-3'), B.at('model-3') + 0.4) * (1 - range(t, B.end('model-4'), B.end('model-4') + 0.6));
    this.orbitMats.forEach((m) => (m.opacity = 0.3 + 0.45 * lit));
    const az = 0.4 + t * 0.2;
    const el = 0.32;
    const d = 19;
    this.camera.fov = 30;
    this.camera.position.set(Math.cos(el) * Math.sin(az) * d, Math.sin(el) * d, Math.cos(el) * Math.cos(az) * d);
    this.camera.lookAt(0, 0, 0);

    slate(fg, 'RUTHERFORD  /  12 MODEL', f.t, out);
    heading(fg, '10 / THE NUCLEAR MODEL', 'Rutherford, 1911', t, out);
    POINTS.forEach(([id, head, detail, y], i) => {
      const a = range(t, B.at(id), B.at(id) + 0.5) * out;
      if (a <= 0) return;
      const dy = (1 - outCubic(a)) * 24;
      fg.save();
      fg.globalAlpha = a;
      fg.font = MONO(22, 500);
      fg.fillStyle = SIGNAL;
      fg.fillText(`0${i + 1}`, 140, y + dy);
      fg.font = DISPLAY(40, 800);
      fg.fillStyle = BONE;
      fg.fillText(head, 200, y + dy);
      fg.font = MONO(19, 400);
      fg.fillStyle = 'rgba(239,230,214,0.6)';
      fg.fillText(detail, 202, y + 42 + dy);
      fg.restore();
    });

    // model-4: electrostatic attraction supplies the centripetal force.
    const fa = outCubic(range(t, B.at('model-4') + 0.2, B.at('model-4') + 0.8)) * out;
    if (fa > 0) {
      const y = 660;
      eq(fg, 'F  =', 200, y + 12, 40, GOLD, 'left', fa);
      frac(fg, 'Ze · e', '4πε₀ r²', 380, y, 38, GOLD, fa);
      eq(fg, '=', 490, y + 12, 40, GOLD, 'left', fa);
      frac(fg, 'mv²', 'r', 580, y, 38, GOLD, fa);
      fg.save();
      fg.globalAlpha = fa;
      fg.font = MONO(17, 500);
      fg.fillStyle = 'rgba(239,230,214,0.6)';
      fg.fillText('electrostatic pull  =  centripetal force', 660, y + 10);
      fg.restore();
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
