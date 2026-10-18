// Realistic 3D for generated videos. scripts/auto.ts has Claude write model.gen.js: a function that
// builds the video's main object from three.js primitives with the material presets below and names
// its parts. Every "model" scene shows that model under a studio light rig with reflections, and
// animates it from the storyboard's cues (pop, move, rotate, spin, shake, glow, fade, explode, flowing
// particles, sound/light rings, camera focus, labels). Everything is a pure function of time.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, inOutCubic, outBack, outCubic, range, spring } from '../../engine/ease';
import { DISPLAY, H, INK, SIGNAL, W, type Ctx } from '../../kit';

// ---- the toolkit the generated model is written against ------------------------------------------

/** Material presets tuned for the post pass (bright colours bloom, so bases stay mid-tone). */
export const kit = {
  THREE,
  roundedBox: (w: number, h: number, d: number, r = 0.08, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)),
  metal: (color = '#aab0b8', roughness = 0.32) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness }),
  brushed: (color = '#9aa1aa') => new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.48 }),
  gold: () => new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 1, roughness: 0.28 }),
  copper: () => new THREE.MeshStandardMaterial({ color: '#c47a4a', metalness: 1, roughness: 0.3 }),
  plastic: (color = '#3a3f47', roughness = 0.5) => new THREE.MeshStandardMaterial({ color, metalness: 0, roughness }),
  glossy: (color = '#20242a') => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }),
  rubber: (color = '#1b1d20') => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
  glass: (color = '#7f97a6', opacity = 0.16) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.04, transparent: true, opacity, clearcoat: 1, depthWrite: false }),
  pcb: (color = '#1d5c45') => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }),
  chip: () => new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.6 }),
  skin: (color = '#9c6448') => new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, sheen: 0.3, sheenColor: new THREE.Color('#d8957a') }),
  screen: (color = '#070d16', glow = '#123058') => new THREE.MeshStandardMaterial({ color, emissive: glow, emissiveIntensity: 0.35, roughness: 0.25 }),
  emissive: (color = '#ff5a1f', intensity = 1.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity }),
  /** A texture drawn with the 2D canvas API (silkscreen, screen UI, labels, mesh grilles). */
  canvasTexture: (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  },
  finger: (opts: FingerOpts = {}) => finger(opts),
};
export type Kit = typeof kit;

interface FingerOpts {
  /** cm, tip to knuckle */
  length?: number;
  /** cm */
  width?: number;
  /** curl towards the palm, 0..0.5 */
  bend?: number;
  color?: string;
}

/**
 * A realistic index finger (fingers are hard to build from primitives): a tapered, slightly flattened
 * tube with a rounded tip, a glossy nail, knuckle creases and fingerprint ridges on the pad. The tip is
 * at the origin and the finger runs up +Y to the knuckle; the pad (fingerprint side) faces -Z, the nail +Z.
 * Rotate the returned group to place it, e.g. rotation.x = Math.PI / 2 to point it at a screen lying in XZ.
 */
function finger({ length = 8, width = 1.7, bend = 0.12, color = '#9c6448' }: FingerOpts = {}) {
  const group = new THREE.Group();
  const R = width / 2;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, length * 0.35, -length * bend * 0.25),
    new THREE.Vector3(0, length * 0.7, -length * bend * 0.6),
    new THREE.Vector3(0, length, -length * bend),
  ]);
  const rings = 96;
  const seg = 40;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    // taper toward the tip, a slight swell at each joint, and a rounded cap
    // nearly even width (real fingers barely taper), slight swells at the joints, a round fingertip
    const capLen = (R * 1.1) / length;
    let r = R * (0.93 + 0.07 * s + 0.04 * Math.exp(-(((s - 0.36) / 0.05) ** 2)) + 0.05 * Math.exp(-(((s - 0.7) / 0.06) ** 2)));
    if (s < capLen) r *= Math.sqrt(Math.max(0, 1 - ((capLen - s) / capLen) ** 2));
    const p = curve.getPointAt(s);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      // flatter on the pad side, rounder on the nail side
      const rz = Math.sin(a) < 0 ? r * 0.82 : r * 0.92;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * rz;
      // cross-sections in XZ (the finger runs along +Y), so -Z is reliably the pad side
      pos.push(p.x + x, p.y, p.z + z);
      uv.push(j / seg, s);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const c = a + seg + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // skin: tone variation, joint creases, and fingerprint ridges on the pad near the tip
  const map = kit.canvasTexture(512, 1024, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a86b4d');
    g.addColorStop(1, '#93593e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60,28,16,0.45)';
    ctx.lineWidth = 3;
    for (const v of [0.36, 0.7])
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.55, h * (v + k * 0.008));
        ctx.quadraticCurveTo(w * 0.75, h * (v + k * 0.008 + 0.01), w * 0.95, h * (v + k * 0.008));
        ctx.stroke();
      }
    // knuckle wrinkles on the back
    ctx.strokeStyle = 'rgba(70,34,20,0.3)';
    for (const v of [0.38, 0.72])
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(w * 0.25, h * v, w * (0.06 + k * 0.025), h * (0.008 + k * 0.004), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    ctx.strokeStyle = 'rgba(55,25,14,0.55)';
    ctx.lineWidth = 2;
    for (let k = 1; k < 18; k++) {
      ctx.beginPath();
      ctx.ellipse(w * 0.75, h * 0.14, w * 0.012 * k, h * 0.0075 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  map.colorSpace = THREE.NoColorSpace;
  const skin = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map, roughness: 0.66, sheen: 0.15, sheenColor: new THREE.Color('#c99a88') });
  // the caller's colour sets the tone, but brightness is capped: light skin blooms to white on video
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(hsl);
  skin.color.setHSL(hsl.h, Math.min(hsl.s, 0.35) * 0.6, 0.62);
  const body = new THREE.Mesh(geo, skin);
  group.add(body);

  // the nail: a curved, glossy plate on the back of the last joint
  const tip = curve.getPointAt(0.13);
  const nail = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.86, R * 0.86, length * 0.12, 24, 1, true, -Math.PI * 0.22, Math.PI * 0.44),
    new THREE.MeshPhysicalMaterial({ color: '#9c7268', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
  );
  nail.position.set(tip.x, tip.y + length * 0.03, tip.z + R * 0.08);
  group.add(nail);
  return group;
}

export interface BuiltModel {
  root: THREE.Object3D;
  /** named parts the storyboard animates */
  parts: Record<string, THREE.Object3D>;
  /** named polylines (model space) that particles flow along */
  paths?: Record<string, [number, number, number][]>;
}
type Builder = (k: Kit) => BuiltModel;

const found = import.meta.glob<Builder>('./model.gen.js', { eager: true, import: 'default' });
export const BUILD: Builder | undefined = Object.values(found)[0];

// ---- animation ----------------------------------------------------------------------------------

export type Effect3D = 'pop' | 'move' | 'rotate' | 'spin' | 'shake' | 'glow' | 'fade' | 'explode' | 'flow' | 'waves' | 'focus' | 'label' | 'pulse';

export interface Anim3D {
  effect: Effect3D;
  target: string;
  t: number;
  dur?: number;
  dx?: number;
  dy?: number;
  dz?: number;
  deg?: number;
  axis?: 'x' | 'y' | 'z';
  zoom?: number;
  amount?: number;
  path?: string;
  text?: string;
}

export interface View {
  /** degrees around the model (0 = front), above it, and a distance multiplier */
  azimuth?: number;
  elevation?: number;
  distance?: number;
}

const DUR: Partial<Record<Effect3D, number>> = { pop: 0.5, move: 0.8, rotate: 0.9, shake: 0.8, glow: 2.4, fade: 0.6, explode: 1.0, flow: 3, waves: 2.6, label: 2.6, pulse: 1.2 };
const lenOf = (a: Anim3D) => a.dur ?? DUR[a.effect] ?? 1;
const RADIUS = 3; // models are normalised to fit this radius

interface PartState {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: THREE.Vector3;
  mats: THREE.MeshStandardMaterial[];
  base: { emissive: THREE.Color; intensity: number; opacity: number; transparent: boolean }[];
  /** part centre in the root's space, after normalising */
  centre: THREE.Vector3;
}

/** One instance of the model in one plate's scene. */
export class Model3D {
  readonly group = new THREE.Group();
  private parts = new Map<string, PartState>();
  private paths = new Map<string, THREE.Vector3[]>();
  private particles: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private centre = new THREE.Vector3();
  readonly ok: boolean;
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    let built: BuiltModel | undefined;
    try {
      built = BUILD?.(kit);
    } catch (e) {
      console.error('model.gen.js failed:', e);
    }
    this.ok = !!built?.root;
    scene.add(this.group);
    // studio rig: soft key, cool rim, warm accent from below, plus the room reflections (init3D)
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 0.5));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.3);
    key.position.set(5, 8, 9);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 1.6);
    rim.position.set(-9, 4, -6);
    const accent = new THREE.DirectionalLight(0xff7a3c, 0.35);
    accent.position.set(4, -6, 3);
    scene.add(key, rim, accent);
    if (!built?.root) return;

    // normalise: centre the model and scale it to RADIUS
    const root = built.root;
    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const s = RADIUS / Math.max(sphere.radius, 1e-3);
    root.position.sub(sphere.center);
    const holder = new THREE.Group();
    holder.add(root);
    holder.scale.setScalar(s);
    this.group.add(holder);
    this.group.updateMatrixWorld(true);

    for (const [name, obj] of Object.entries(built.parts ?? {})) {
      if (!obj) continue;
      const mats: THREE.MeshStandardMaterial[] = [];
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // own materials, so glowing or fading one part leaves the others alone
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if ('emissive' in mm) mats.push(mm as THREE.MeshStandardMaterial);
      });
      const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      this.parts.set(name, {
        obj, pos: obj.position.clone(), rot: obj.rotation.clone(), scale: obj.scale.clone(), mats,
        base: mats.map((m) => ({ emissive: m.emissive.clone(), intensity: m.emissiveIntensity, opacity: m.opacity, transparent: m.transparent })),
        centre: this.group.worldToLocal(c.clone()),
      });
    }
    for (const [name, pts] of Object.entries(built.paths ?? {})) {
      if (!Array.isArray(pts) || pts.length < 2) continue;
      // model space -> the group's space (the group itself sits at the origin, unscaled, here)
      this.paths.set(name, pts.map((p) => root.localToWorld(new THREE.Vector3(...p))));
    }
    // effect pools
    const dot = new THREE.SphereGeometry(0.07, 12, 12);
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: '#ffd2b8', transparent: true }));
      p.visible = false;
      this.particles.push(p);
      this.group.add(p);
    }
    const ring = new THREE.TorusGeometry(1, 0.025, 8, 64);
    for (let i = 0; i < 8; i++) {
      const r = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, depthWrite: false }));
      r.visible = false;
      this.rings.push(r);
      this.group.add(r);
    }
  }

  static init(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    // reflections for metal and glass, kept low: the post pass blooms anything bright
    scene.environmentIntensity = 0.38;
    pmrem.dispose();
  }

  has(name: string) {
    return this.parts.has(name) || this.paths.has(name) || name === 'all';
  }

  /** Poses the model and the camera for scene-local time t. */
  update(t: number, anims: Anim3D[], view: View, camera: THREE.PerspectiveCamera) {
    // parts back to rest
    for (const p of this.parts.values()) {
      p.obj.position.copy(p.pos);
      p.obj.rotation.copy(p.rot);
      p.obj.scale.copy(p.scale);
      p.obj.visible = true;
      p.mats.forEach((m, i) => {
        m.emissive.copy(p.base[i].emissive);
        m.emissiveIntensity = p.base[i].intensity;
        m.opacity = p.base[i].opacity;
        m.transparent = p.base[i].transparent;
      });
    }
    this.particles.forEach((p) => (p.visible = false));
    this.rings.forEach((r) => (r.visible = false));

    // the model rises into place on the first scene frames
    const intro = spring(t, 1.1, 6);
    this.group.scale.setScalar(0.88 + 0.12 * intro);

    let particle = 0;
    let ringN = 0;
    for (const a of anims) {
      const p = t - a.t;
      const part = this.parts.get(a.target);
      const u = clamp(p / lenOf(a));
      if (a.effect === 'pop' && part) {
        const s = p <= 0 ? 0 : 0.4 + 0.6 * spring(p, 1.6, 7);
        part.obj.scale.multiplyScalar(Math.max(1e-4, s));
        if (p <= 0) part.obj.visible = false;
        continue;
      }
      if (p < 0) continue;
      switch (a.effect) {
        case 'move':
          if (part) part.obj.position.add(this.v.set(a.dx ?? 0, a.dy ?? 0, a.dz ?? 0).multiplyScalar(outCubic(u) / this.group.children[0].scale.x));
          break;
        case 'explode':
          if (part) {
            const dir = part.centre.clone().sub(this.centre);
            if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
            dir.normalize().multiplyScalar(((a.amount ?? 1.2) * outCubic(u)) / this.group.children[0].scale.x);
            part.obj.position.add(dir);
          }
          break;
        case 'rotate':
        case 'spin': {
          if (!part) break;
          const ang = ((a.deg ?? (a.effect === 'spin' ? 360 : 90)) * Math.PI) / 180;
          const amt = a.effect === 'spin' ? ang * (u < 1 ? p : lenOf(a)) : ang * inOutCubic(u);
          part.obj.rotation[a.axis ?? 'y'] += amt;
          break;
        }
        case 'shake':
          if (part && u < 1) part.obj.position.x += (Math.sin(p * 70) * 0.03 * (1 - u)) / this.group.children[0].scale.x;
          break;
        case 'pulse':
          if (part && u < 1) part.obj.scale.multiplyScalar(1 + 0.1 * Math.sin(u * Math.PI * 3) * (1 - u));
          break;
        case 'glow':
          if (part) {
            const g = Math.sin(Math.min(1, u) * Math.PI) * (0.75 + 0.25 * Math.sin(p * 9));
            part.mats.forEach((m) => {
              m.emissive.lerp(new THREE.Color(SIGNAL), g);
              m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.4 * g);
            });
          }
          break;
        case 'fade':
          if (part)
            part.mats.forEach((m) => {
              m.transparent = true;
              m.opacity *= 1 - 0.85 * outCubic(u);
            });
          break;
        case 'flow': {
          const path = this.paths.get(a.path ?? a.target);
          if (!path || u >= 1) break;
          const fade = clamp(p / 0.3) * clamp((lenOf(a) - p) / 0.3);
          for (let i = 0; i < 7 && particle < this.particles.length; i++) {
            const pos = (p * 0.5 + i / 7) % 1;
            const f = pos * (path.length - 1);
            const k = Math.min(path.length - 2, Math.floor(f));
            const dot = this.particles[particle++];
            dot.position.lerpVectors(path[k], path[k + 1], f - k);
            (dot.material as THREE.MeshBasicMaterial).opacity = fade * (0.4 + 0.6 * Math.sin(pos * Math.PI));
            (dot.material as THREE.MeshBasicMaterial).color.set(i % 2 ? '#ffd2b8' : SIGNAL);
            dot.visible = true;
          }
          break;
        }
        case 'waves': {
          if (!part || u >= 1) break;
          const fade = clamp(p / 0.3) * clamp((lenOf(a) - p) / 0.3);
          for (let i = 0; i < 4 && ringN < this.rings.length; i++) {
            const ph = (p * 0.7 + i / 4) % 1;
            const r = this.rings[ringN++];
            r.position.copy(part.centre);
            r.scale.setScalar(0.3 + ph * 2.4);
            r.lookAt(camera.position);
            (r.material as THREE.MeshBasicMaterial).opacity = fade * (1 - ph) * 0.9;
            r.visible = true;
          }
          break;
        }
      }
    }

    // camera: the scene's view, slowly orbiting, gliding to focus targets
    let target = new THREE.Vector3();
    let zoom = 1;
    for (const a of anims.filter((x) => x.effect === 'focus')) {
      if (t < a.t - 0.45) break;
      const part = this.parts.get(a.target);
      const to = part && a.target !== 'all' ? part.centre.clone() : new THREE.Vector3();
      const toZoom = part && a.target !== 'all' ? Math.min(a.zoom ?? 1.6, 1.8) : 1;
      const e = inOutCubic(range(t, a.t - 0.45, a.t + 0.45));
      target = target.clone().lerp(to, e);
      zoom = zoom + (toZoom - zoom) * e;
    }
    const az = (((view.azimuth ?? 25) + t * 3.5) * Math.PI) / 180;
    const el = ((view.elevation ?? 14) * Math.PI) / 180;
    const fov = 30;
    const fitDist = (RADIUS * 1.12) / (Math.tan(((fov / 2) * Math.PI) / 180) * (W / H));
    const dist = (fitDist * (view.distance ?? 1)) / zoom;
    camera.fov = fov;
    camera.aspect = W / H;
    camera.position.set(target.x + Math.cos(el) * Math.sin(az) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(el) * Math.cos(az) * dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    // the model sits between the headline and the captions, a little above the frame centre
    camera.setViewOffset(W, H, 0, 70, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.group.updateMatrixWorld(true);
  }

  /** Screen position of a part's centre. */
  project(name: string, camera: THREE.PerspectiveCamera): [number, number] | undefined {
    const part = this.parts.get(name);
    if (!part) return undefined;
    const v = part.obj.getWorldPosition(new THREE.Vector3());
    const b = new THREE.Box3().setFromObject(part.obj);
    if (!b.isEmpty()) b.getCenter(v);
    v.project(camera);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
  }
}

/** Label pills with leader lines for the scene's "label" cues, in screen space. */
export function drawLabels3D(ctx: Ctx, model: Model3D, anims: Anim3D[], t: number, camera: THREE.PerspectiveCamera) {
  for (const a of anims) {
    if (a.effect !== 'label' || !a.text) continue;
    const p = t - a.t;
    if (p < 0 || p > lenOf(a)) continue;
    const at = model.project(a.target, camera);
    if (!at) continue;
    const [px, py] = at;
    const al = clamp(p / 0.25) * clamp((lenOf(a) - p) / 0.25);
    const ly = py > 880 ? Math.max(470, py - 230) : Math.min(1250, py + 230);
    const text = a.text.toUpperCase();
    ctx.save();
    ctx.globalAlpha = al;
    ctx.strokeStyle = SIGNAL;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (540 - px) * 0.3 * outCubic(clamp(p / 0.3)), ly);
    ctx.stroke();
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = DISPLAY(44, 900);
    const w = ctx.measureText(text).width + 56;
    const bx = Math.min(Math.max(px + (540 - px) * 0.3, 40 + w / 2), W - 40 - w / 2);
    const s = 0.6 + 0.4 * outBack(clamp(p / 0.3), 2.2);
    ctx.translate(bx, ly);
    ctx.scale(s, s);
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -38, w, 76, 38);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 3);
    ctx.restore();
  }
}

