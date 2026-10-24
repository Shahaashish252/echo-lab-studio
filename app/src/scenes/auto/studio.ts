// Studio 3D format (2026-10-24): a premium 3D product explainer in the style of the reference reel the owner
// picked (schematikio, "How does a LDR sensor work?"): the real module as a photoreal 3D model on a dark stage,
// slow camera moves with a shallow depth of field, parts flying together, layers splitting apart, glass
// "inside the material" diagrams, the module wired to an Arduino on a cutting mat, and one big white word at a
// time as the caption. scripts/auto.ts --studio asks Claude only for a shot list (studio.gen.json); everything
// here is a pure function of time (seek-safe). Units: 1 = 1 cm.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, hash, inOutCubic, lerp, outCubic, range, smooth } from '../../engine/ease';
import { H, W, type Ctx } from '../../kit';
import { BOARD_H, BOARD_W, drawUno } from './arduino';

export interface Shot {
  line: number;
  shot: string;
  part?: string;
  obstacle?: boolean;
  light?: boolean;
  cross?: boolean;
  detect?: boolean;
}
export interface StudioPlan {
  module: string;
  shots: Shot[];
}
export interface StudioLine {
  text: string;
  start: number;
  end: number;
}

const found = import.meta.glob<StudioPlan>('./studio.gen.json', { eager: true, import: 'default' });
export const STUDIO_PLAN: StudioPlan | undefined = Object.values(found)[0];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lin = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();
const T = 0.16; // PCB thickness

// ---------- materials & textures ----------

function std(hex: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color: lin(hex), roughness, metalness, ...extra });
}
function phys(hex: number, extra: THREE.MeshPhysicalMaterialParameters) {
  return new THREE.MeshPhysicalMaterial({ color: lin(hex), ...extra });
}
function makeMats() {
  return {
    gold: std(0xe6bb6a, 0.25, 1),
    tin: std(0xe4e7ec, 0.28, 1),
    steel: std(0xaab0b8, 0.32, 1),
    black: phys(0x17181b, { roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
    gloss: phys(0x0b0c0f, { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }),
    potBlue: phys(0x2a6fd6, { roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    white: std(0xf0f0ec, 0.42),
    ceramic: std(0xc29266, 0.55),
    resBlack: std(0x1c1c1e, 0.45),
    edge: std(0x8f6c38, 0.5, 0.15),
    glass: phys(0xdce8ff, { transmission: 1, thickness: 0.35, roughness: 0.05, ior: 1.5 }),
    frosted: phys(0xcfe0ff, { transmission: 1, thickness: 0.6, roughness: 0.3, ior: 1.45 }),
    clearLed: phys(0xeaf2ff, { transmission: 1, thickness: 0.5, roughness: 0.03, ior: 1.52 }),
    pLayer: std(0xe46a9b, 0.4),
    nLayer: std(0x3c6fe0, 0.4),
    plastic: std(0xd9dadc, 0.6),
  };
}
let M: ReturnType<typeof makeMats>;

function canvasTex(w: number, h: number, draw: (ctx: Ctx) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let GLOW_TEX: THREE.Texture;
function glowSprite(hex: number, size: number) {
  const m = new THREE.SpriteMaterial({ map: GLOW_TEX, color: lin(hex), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
}
function emissive(hex: number, base = 0x222222) {
  return std(base, 0.35, 0, { emissive: lin(hex), emissiveIntensity: 0 });
}
function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material) {
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat);
}
function box(w: number, h: number, d: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
function cyl(r: number, h: number, mat: THREE.Material, seg = 32) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
}
function label(text: string, hex = '#ffffff', size = 0.5) {
  const tex = canvasTex(512, 128, (ctx) => {
    ctx.font = '400 64px Michroma, "IBM Plex Mono", monospace';
    ctx.fillStyle = hex;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size * 4, size, 1);
  return s;
}

// ---------- components (each sits on +Y, origin at its footprint centre) ----------

function resistor(cap = false) {
  const g = new THREE.Group();
  const body = rbox(0.13, 0.055, 0.125, 0.012, cap ? M.ceramic : M.resBlack);
  body.position.y = 0.03;
  g.add(body);
  for (const s of [-1, 1]) {
    const e = rbox(0.04, 0.06, 0.128, 0.01, M.tin);
    e.position.set(s * 0.083, 0.03, 0);
    g.add(e);
  }
  return g;
}

function soic(text: string) {
  const g = new THREE.Group();
  const body = rbox(0.49, 0.15, 0.39, 0.02, M.black);
  body.position.y = 0.105;
  g.add(body);
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(0.47, 0.37),
    new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.6,
      map: canvasTex(470, 370, (ctx) => {
        ctx.fillStyle = 'rgba(200,200,205,0.75)';
        ctx.font = '600 92px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(text, 235, 215);
        ctx.font = '500 52px "IBM Plex Mono", monospace';
        ctx.fillText('2541', 235, 300);
        ctx.beginPath();
        ctx.arc(52, 300, 22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
      }),
    }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.181;
  g.add(top);
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const x = -0.19 + i * 0.127;
      const a = box(0.04, 0.022, 0.07, M.tin);
      a.position.set(x, 0.1, s * 0.225);
      const b = box(0.04, 0.09, 0.022, M.tin);
      b.position.set(x, 0.055, s * 0.255);
      const c = box(0.04, 0.02, 0.06, M.tin);
      c.position.set(x, 0.01, s * 0.285);
      g.add(a, b, c);
    }
  return g;
}

function trimmer() {
  const g = new THREE.Group();
  const body = rbox(0.62, 0.55, 0.62, 0.04, M.potBlue);
  body.position.y = 0.275;
  g.add(body);
  const knob = new THREE.Group();
  const disc = cyl(0.21, 0.07, M.white, 40);
  knob.add(disc);
  for (const r of [0, Math.PI / 2]) {
    const slot = box(0.3, 0.03, 0.045, M.black);
    slot.position.y = 0.03;
    slot.rotation.y = r;
    knob.add(slot);
  }
  knob.position.y = 0.58;
  g.add(knob);
  return { group: g, knob };
}

function header(n: number) {
  const g = new THREE.Group();
  const block = rbox(0.25, 0.25, 0.254 * n, 0.02, M.black);
  block.position.y = 0.125;
  g.add(block);
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * 0.254;
    const pin = box(0.72, 0.064, 0.064, M.gold);
    pin.position.set(0.3, 0.125, z);
    g.add(pin);
    tips.push(V(0.66, 0.125, z));
  }
  return { group: g, tips };
}

function smdLed(hex: number) {
  const g = new THREE.Group();
  const body = rbox(0.2, 0.07, 0.125, 0.01, M.white);
  body.position.y = 0.035;
  g.add(body);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.1), emissive(hex, 0x553333));
  lens.position.y = 0.075;
  g.add(lens);
  const halo = glowSprite(hex, 0.45);
  halo.position.y = 0.12;
  g.add(halo);
  return {
    group: g,
    set(on: number) {
      (lens.material as THREE.MeshStandardMaterial).emissiveIntensity = on * 6;
      halo.material.opacity = on * 0.55;
    },
  };
}

/** A 5 mm through-hole LED (or photodiode), axis +Y, base at y = 0. Its layers can be pulled apart along the axis. */
class Led {
  readonly group = new THREE.Group();
  private layers: { obj: THREE.Object3D; home: number; out: number; grow?: number }[] = [];
  private dieMat: THREE.MeshStandardMaterial;
  private halo: THREE.Sprite;
  private inner: THREE.Sprite;
  constructor(readonly kind: 'ir' | 'pd') {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0.29, 0), new THREE.Vector2(0.29, 0.1), new THREE.Vector2(0.25, 0.11), new THREE.Vector2(0.25, 0.6)];
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, 0.25 * Math.cos(a)), 0.6 + 0.25 * Math.sin(a)));
    }
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), kind === 'ir' ? M.clearLed : M.gloss);
    this.add(shell, 0, 1.15);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.09, 32, 1, true), M.tin);
    cup.position.y = 0.27;
    this.add(cup, 0.27, 0.15);
    this.dieMat = emissive(kind === 'ir' ? 0xff3b6b : 0x6fb6ff, 0x2a2a30);
    if (kind === 'ir') {
      const die = box(0.06, 0.03, 0.06, this.dieMat);
      die.position.y = 0.31;
      this.add(die, 0.31, 0.5, 2.5);
    } else {
      const n = box(0.17, 0.05, 0.17, M.nLayer);
      n.position.y = 0.3;
      this.add(n, 0.3, 0.42, 2.6);
      const p = box(0.17, 0.022, 0.17, M.pLayer);
      p.position.y = 0.336;
      this.add(p, 0.336, 0.78, 2.6);
      const film = box(0.15, 0.006, 0.15, this.dieMat);
      film.position.y = 0.35;
      this.add(film, 0.35, 0.98, 2.6);
    }
    const legs = new THREE.Group();
    for (const x of [-0.1, 0.1]) {
      const leg = cyl(0.022, 0.42, M.tin, 12);
      leg.position.set(x, 0.06, 0);
      legs.add(leg);
    }
    const post = box(0.035, 0.18, 0.035, M.tin);
    post.position.set(0.1, 0.3, 0);
    legs.add(post);
    this.add(legs, 0, -0.45);
    this.halo = glowSprite(kind === 'ir' ? 0xff3b6b : 0x6fb6ff, 0.75);
    this.halo.position.y = 0.88;
    this.group.add(this.halo);
    this.inner = glowSprite(kind === 'ir' ? 0xff3b6b : 0x6fb6ff, 0.35);
    this.inner.position.y = 0.33;
    this.group.add(this.inner);
  }
  /** out: how far the layer travels along the axis when pulled apart; grow: how much it enlarges (tiny dies) */
  private add(obj: THREE.Object3D, _y: number, out: number, grow?: number) {
    this.group.add(obj);
    this.layers.push({ obj, home: obj.position.y, out, grow });
  }
  set(on: number, explode: number) {
    for (const l of this.layers) {
      l.obj.position.y = l.home + explode * l.out;
      if (l.grow) l.obj.scale.setScalar(1 + (l.grow - 1) * explode);
    }
    this.dieMat.emissiveIntensity = on * 8;
    this.halo.material.opacity = on * 0.45;
    this.inner.material.opacity = on * 0.6;
    this.halo.position.y = 0.88 + explode * this.layers[0].out;
  }
}

// ---------- the IR obstacle sensor (FC-51) ----------

interface Part {
  obj: THREE.Object3D;
  home: THREE.Vector3;
  homeQ: THREE.Quaternion;
  from: THREE.Vector3;
  spin: THREE.Euler;
  delay: number;
}

class IrModule {
  readonly group = new THREE.Group();
  readonly parts: Part[] = [];
  readonly emitter = new Led('ir');
  readonly receiver = new Led('pd');
  readonly knob: THREE.Group;
  readonly pwr = smdLed(0xff3030);
  readonly obs = smdLed(0x33ff66);
  readonly pinTips: THREE.Vector3[];
  readonly anchors: Record<string, THREE.Vector3>;
  readonly w = 3.1;
  readonly h = 1.45;

  constructor() {
    const { w, h } = this;
    const at = (obj: THREE.Object3D, x: number, y: number, rot = 0, lift = 0) => {
      obj.position.set(x, T + lift, -y);
      obj.rotation.y = rot;
      this.group.add(obj);
      return obj;
    };
    // board: rounded FR4 with a mounting hole, blue solder mask, gold pads, white silkscreen
    const shape = new THREE.Shape();
    const r = 0.08;
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const hole = new THREE.Path();
    hole.absarc(1.0, -0.12, 0.15, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 32 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.015, 0);
    const tex = canvasTex(1550, 725, (ctx) => drawFc51(ctx, w, h));
    tex.repeat.set(1 / w, 1 / h);
    tex.offset.set(0.5, 0.5);
    const top = phys(0xffffff, { map: tex, roughness: 0.48, clearcoat: 0.3, clearcoatRoughness: 0.35 });
    const board = new THREE.Mesh(geo, [top, M.edge]);
    this.group.add(board);
    this.part(board, V(0, -2.5, 0.5), new THREE.Euler(0.6, 0.4, 0), 0);

    const hd = header(3);
    at(hd.group, 1.33, 0);
    this.part(hd.group, V(2.5, 1.5, 0), new THREE.Euler(0, 0, 1.2), 0.18);
    this.pinTips = hd.tips.map((p) => p.clone().add(hd.group.position));

    const pot = trimmer();
    at(pot.group, -0.45, 0);
    this.knob = pot.knob;
    this.part(pot.group, V(-0.5, 3.2, -1), new THREE.Euler(0.8, 1, 0), 0.26);

    const chip = soic('LM393');
    at(chip, 0.42, 0.22);
    this.part(chip, V(0.8, 3, -1.5), new THREE.Euler(-0.7, 0.6, 0.3), 0.34);

    for (const [x, y, rot, cap, d] of [
      [-0.82, 0.5, 0, false, 0.4],
      [-0.82, -0.5, 0, false, 0.43],
      [0.12, -0.48, 0, false, 0.46],
      [1.0, 0.45, 0, false, 0.49],
      [0.75, 0.47, Math.PI / 2, true, 0.52],
      [0.02, 0.5, Math.PI / 2, true, 0.55],
    ] as const) {
      const c = resistor(cap);
      at(c, x, y, rot);
      this.part(c, V(x * 0.6, 2.6 + d, -y * 2), new THREE.Euler(1.2, d * 3, 0.4), d);
    }
    at(this.pwr.group, 0.95, -0.48);
    at(this.obs.group, 0.55, -0.48);
    this.part(this.pwr.group, V(1, 2.8, 1.4), new THREE.Euler(1, 0, 0.5), 0.5);
    this.part(this.obs.group, V(0.4, 2.9, 1.6), new THREE.Euler(1, 0.5, 0), 0.53);

    // the emitter and receiver lie along the board, pointing out of its front end (-X), legs bent into the board
    for (const [led, y, d] of [
      [this.emitter, 0.36, 0.62],
      [this.receiver, -0.36, 0.7],
    ] as const) {
      const holder = new THREE.Group();
      led.group.rotation.z = Math.PI / 2;
      holder.add(led.group);
      at(holder, -1.15, y, 0, 0.3);
      for (const dz of [-0.1, 0.1]) {
        const v = cyl(0.022, 0.3, M.tin, 12);
        v.position.set(-1.0, T + 0.15, -y + dz);
        const hz = cyl(0.022, 0.2, M.tin, 12);
        hz.rotation.z = Math.PI / 2;
        hz.position.set(-1.08, T + 0.3, -y + dz);
        this.group.add(v, hz);
      }
      this.part(holder, V(-3, 1.2, -y * 4), new THREE.Euler(0, 0, -1.4), d);
    }

    this.anchors = {
      board: V(0, T, 0),
      sensor: V(-1.75, T + 0.3, 0),
      emitter: V(-1.75, T + 0.3, -0.36),
      receiver: V(-1.75, T + 0.3, 0.36),
      emitTip: V(-2.0, T + 0.3, -0.36),
      recvTip: V(-2.0, T + 0.3, 0.36),
      pot: V(-0.45, T + 0.55, 0),
      chip: V(0.42, T + 0.12, -0.22),
      leds: V(0.75, T + 0.05, 0.48),
      pins: V(1.6, T + 0.12, 0),
    };
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  private part(obj: THREE.Object3D, from: THREE.Vector3, spin: THREE.Euler, delay: number) {
    this.parts.push({ obj, home: obj.position.clone(), homeQ: obj.quaternion.clone(), from, spin, delay });
  }

  private q = new THREE.Quaternion();
  /** a: 0 = scattered, 1 = assembled */
  assemble(a: number) {
    for (const p of this.parts) {
      const e = outCubic(clamp((a - p.delay) / 0.34));
      p.obj.visible = a >= p.delay - 0.001;
      p.obj.position.copy(p.home).addScaledVector(p.from, 1 - e);
      this.q.setFromEuler(new THREE.Euler(p.spin.x * (1 - e), p.spin.y * (1 - e), p.spin.z * (1 - e)));
      p.obj.quaternion.copy(p.homeQ).multiply(this.q);
    }
  }
}

function drawFc51(ctx: Ctx, w: number, h: number) {
  const k = ctx.canvas.width / w;
  const X = (x: number) => (x + w / 2) * k;
  const Y = (y: number) => (h / 2 - y) * k;
  ctx.fillStyle = '#143f9c';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // copper traces under the mask: a shade lighter
  ctx.strokeStyle = '#1f52bd';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.035 * k;
  const path = (pts: number[][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
  };
  path([[-1.0, 0.46], [-0.9, 0.5], [-0.82, 0.5]]);
  path([[-1.0, -0.46], [-0.9, -0.5], [-0.82, -0.5]]);
  path([[-0.7, 0.5], [-0.3, 0.55], [0.0, 0.62], [0.42, 0.62]]);
  path([[-0.7, -0.5], [-0.3, -0.42], [0.12, -0.42]]);
  path([[0.24, -0.48], [0.42, -0.2], [0.42, -0.08]]);
  path([[0.67, 0.22], [1.0, 0.3], [1.33, 0.254]]);
  path([[0.95, -0.48], [1.2, -0.3], [1.33, -0.254]]);
  path([[0.55, -0.48], [0.7, -0.62], [1.2, -0.62], [1.33, -0.254]]);
  path([[1.0, 0.45], [1.2, 0.4], [1.33, 0.254]]);
  path([[-0.45, 0.31], [-0.45, 0.62], [-0.2, 0.68], [0.75, 0.68], [0.75, 0.53]]);
  ctx.lineWidth = 0.1 * k;
  path([[1.33, 0], [1.2, 0], [0.75, -0.3], [-0.2, -0.65], [-1.3, -0.65]]);
  // vias
  for (const [x, y] of [[-0.2, 0.68], [0.75, -0.3], [-0.3, -0.42], [1.2, 0.4]]) {
    ctx.fillStyle = '#d9b25e';
    ctx.beginPath();
    ctx.arc(X(x), Y(y), 0.035 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1530';
    ctx.beginPath();
    ctx.arc(X(x), Y(y), 0.016 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  // gold rings for the LED legs and the mounting hole
  ctx.fillStyle = '#d9b25e';
  for (const y of [0.36, -0.36]) for (const dy of [-0.1, 0.1]) {
    ctx.beginPath();
    ctx.arc(X(-1.0), Y(y + dy), 0.05 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(X(1.0), Y(-0.12), 0.22 * k, 0, Math.PI * 2);
  ctx.fill();
  // silkscreen
  ctx.fillStyle = '#f3f6fb';
  ctx.strokeStyle = '#f3f6fb';
  ctx.lineWidth = 0.012 * k;
  ctx.font = `600 ${0.09 * k}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [['VCC', 0.254], ['GND', 0], ['OUT', -0.254]].forEach(([s, y]) => ctx.fillText(s as string, X(1.06), Y(y as number)));
  ctx.font = `600 ${0.075 * k}px "IBM Plex Mono", monospace`;
  ctx.fillText('PWR', X(0.95), Y(-0.62));
  ctx.fillText('OBS', X(0.55), Y(-0.62));
  ctx.fillText('IR', X(-1.3), Y(0.62));
  ctx.strokeRect(X(-0.79), Y(0.34), 0.68 * k, 0.68 * k);
  ctx.strokeRect(X(0.15), Y(0.47), 0.55 * k, 0.5 * k);
  ctx.font = `600 ${0.07 * k}px "IBM Plex Mono", monospace`;
  ctx.fillText('FC-51', X(-0.45), Y(-0.55));
}

// ---------- glass diagrams ----------

function stage(group: THREE.Group, w = 4.6, d = 3.4) {
  const base = rbox(w, 0.12, d, 0.05, M.black);
  base.position.y = -0.06;
  base.receiveShadow = true;
  const plate = rbox(w - 0.2, 0.18, d - 0.2, 0.06, M.glass);
  plate.position.y = 0.09;
  group.add(base, plate);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = cyl(0.06, 0.2, M.steel, 16);
    post.position.set(x * (w / 2 - 0.25), 0.2, z * (d / 2 - 0.25));
    group.add(post);
  }
}

/** Inside the receiver's silicon: electrons locked in a lattice; light knocks them free and a current flows. */
class Lattice {
  readonly group = new THREE.Group();
  private electrons: { mesh: THREE.Mesh; home: THREE.Vector3; h: number }[] = [];
  private photons: { mesh: THREE.Mesh; to: THREE.Vector3; ph: number }[] = [];
  private dots: THREE.Mesh[] = [];
  private bulbMat = emissive(0xffd9a0, 0xeeeeee);
  private bulbGlow = glowSprite(0xffc070, 2.4);
  private coreMat = emissive(0x4aa8ff, 0x203050);
  private meterMat = emissive(0x4aa8ff, 0x203050);
  private meterGlow = glowSprite(0x4aa8ff, 1.2);
  private eLocked = emissive(0x3a7bff, 0x2a4fb0);
  private eFree = emissive(0x5fb4ff, 0x2f6fff);
  private curve: THREE.CatmullRomCurve3;
  readonly focus = V(-0.3, 0.7, 0);

  constructor() {
    const g = this.group;
    stage(g);
    const slab = rbox(2.4, 0.25, 1.6, 0.06, M.ceramic);
    slab.position.set(-0.4, 0.305, 0);
    const cover = rbox(2.4, 0.36, 1.6, 0.08, M.frosted);
    cover.position.set(-0.4, 0.6, 0);
    g.add(slab, cover);
    const eg = new THREE.SphereGeometry(0.085, 24, 16);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(eg, this.eLocked);
        const home = V(-1.3 + i * 0.36, 0.62, -0.54 + j * 0.36);
        m.position.copy(home);
        g.add(m);
        this.electrons.push({ mesh: m, home, h: hash(i * 7 + j * 13) });
      }
    // the lamp on an arm
    const pole = cyl(0.05, 2.6, M.steel, 16);
    pole.position.set(1.6, 1.4, -1.2);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(1.6, 2.7, -1.2), V(1.4, 2.95, -0.8), V(0.3, 2.95, -0.2), V(-0.4, 2.7, 0)]), 40, 0.045, 10), M.steel);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.36, 0.36, 32, 1, true), M.steel);
    head.position.set(-0.4, 2.5, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), this.bulbMat);
    bulb.position.set(-0.4, 2.36, 0);
    this.bulbGlow.position.copy(bulb.position);
    g.add(pole, arm, head, bulb, this.bulbGlow);
    const pg = new THREE.SphereGeometry(0.05, 12, 8);
    const pm = emissive(0xffc070, 0xffffff);
    pm.emissiveIntensity = 6;
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(pg, pm);
      const s = glowSprite(0xffb050, 0.35);
      s.material.opacity = 0.9;
      m.add(s);
      g.add(m);
      this.photons.push({ mesh: m, to: V(-1.4 + hash(i * 3.1) * 2.0, 0.8, -0.6 + hash(i * 5.7) * 1.2), ph: hash(i * 1.7) });
    }
    // the wire: a glass tube with a glowing core, to a little meter
    this.curve = new THREE.CatmullRomCurve3([V(0.8, 0.6, 0), V(1.35, 0.75, 0.1), V(1.75, 0.9, 0.7), V(1.6, 0.55, 1.25), V(1.0, 0.45, 1.3)]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 64, 0.09, 16), M.glass);
    const core = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 64, 0.025, 8), this.coreMat);
    g.add(tube, core);
    const meter = cyl(0.26, 0.3, M.black, 32);
    meter.position.set(0.75, 0.33, 1.3);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), this.meterMat);
    lamp.position.set(0.75, 0.56, 1.3);
    this.meterGlow.position.copy(lamp.position);
    g.add(meter, lamp, this.meterGlow);
    const dg = new THREE.SphereGeometry(0.045, 12, 8);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(dg, this.eFree);
      g.add(m);
      this.dots.push(m);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }

  /** light: 0..1 how much light falls on the silicon */
  update(t: number, light: number) {
    this.bulbMat.emissiveIntensity = light * 9;
    this.bulbGlow.material.opacity = light * 0.9;
    this.photons.forEach((p) => {
      const u = (t * 0.9 + p.ph) % 1;
      p.mesh.visible = light > 0.05;
      p.mesh.position.lerpVectors(V(-0.4, 2.3, 0), p.to, u);
      p.mesh.scale.setScalar(light * (1 - u * 0.4));
    });
    let freed = 0;
    this.electrons.forEach((e, i) => {
      const free = clamp((light - e.h * 0.85) * 5);
      const wob = 0.018 * Math.sin(t * 9 + i * 1.3) * (1 - free);
      e.mesh.material = free > 0.5 ? this.eFree : this.eLocked;
      if (free <= 0) {
        e.mesh.position.set(e.home.x + wob, e.home.y + wob * 0.6, e.home.z);
        return;
      }
      freed++;
      const u = (t * 0.45 + e.h) % 1;
      const hop = Math.sin(u * Math.PI) * 0.35;
      e.mesh.position.set(lerp(e.home.x, 0.8, u * free), e.home.y + hop * free, e.home.z * (1 - u * free));
    });
    this.eLocked.emissiveIntensity = 1.2;
    this.eFree.emissiveIntensity = 2.2;
    const current = clamp(freed / 10) * light;
    this.coreMat.emissiveIntensity = current * 5;
    this.meterMat.emissiveIntensity = current * 7;
    this.meterGlow.material.opacity = current * 0.9;
    this.dots.forEach((d, i) => {
      d.visible = current > 0.05;
      d.position.copy(this.curve.getPointAt((t * 0.35 + i / this.dots.length) % 1));
    });
  }
}

/** The LM393 comparator as two glass tubes: the signal level against the threshold set by the pot. */
class Comparator {
  readonly group = new THREE.Group();
  private sig: THREE.Mesh;
  private sigMat = emissive(0xff8a3d, 0x803c10);
  private ring: THREE.Mesh;
  private outMat = emissive(0x33ff66, 0x203020);
  private outGlow = glowSprite(0x33ff66, 1.6);
  private knob: THREE.Group;
  readonly focus = V(0, 1.1, 0.2);

  constructor() {
    const g = this.group;
    stage(g, 4.2, 3.2);
    for (const x of [-0.7, 0.7]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 2.4, 48), M.glass);
      tube.position.set(x, 1.4, -0.2);
      const cap = cyl(0.42, 0.12, M.steel, 48);
      cap.position.set(x, 0.24, -0.2);
      const cap2 = cap.clone();
      cap2.position.y = 2.62;
      g.add(tube, cap, cap2);
    }
    this.sig = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 40), this.sigMat);
    this.sig.position.set(-0.7, 0.3, -0.2);
    g.add(this.sig);
    const setMat = emissive(0x4aa8ff, 0x203050);
    setMat.emissiveIntensity = 3;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 12, 48), setMat);
    this.ring.rotation.x = Math.PI / 2;
    g.add(this.ring);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 40), setMat);
    column.name = 'set';
    g.add(column);
    const pot = trimmer();
    pot.group.position.set(1.55, 0.18, 0.7);
    pot.group.scale.setScalar(0.9);
    this.knob = pot.knob;
    g.add(pot.group);
    const stand = cyl(0.18, 0.2, M.black, 24);
    stand.position.set(0, 0.28, 1.05);
    const out = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), this.outMat);
    out.position.set(0, 0.6, 1.05);
    this.outGlow.position.copy(out.position);
    g.add(stand, out, this.outGlow);
    const a = label('SIGNAL', '#ffb27a', 0.22);
    a.position.set(-0.7, 2.95, -0.2);
    const b = label('SET', '#8fc8ff', 0.22);
    b.position.set(0.7, 2.95, -0.2);
    const c = label('OUT', '#ffffff', 0.18);
    c.position.set(0, 0.98, 1.05);
    g.add(a, b, c);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }

  update(t: number, p: number, cross: boolean) {
    const thr = 0.55;
    const level = cross ? lerp(0.18, 0.88, smooth(range(p, 0.1, 0.75))) : 0.3 + 0.07 * Math.sin(t * 2.4);
    const hgt = Math.max(0.02, level * 2.2);
    this.sig.scale.y = hgt;
    this.sig.position.y = 0.3 + hgt / 2;
    this.sigMat.emissiveIntensity = 2.5 + level * 2;
    const set = this.group.getObjectByName('set')!;
    set.scale.y = thr * 2.2;
    set.position.set(0.7, 0.3 + (thr * 2.2) / 2, -0.2);
    this.ring.position.set(0.7, 0.3 + thr * 2.2, -0.2);
    const on = level > thr ? 1 : 0;
    this.outMat.emissiveIntensity = on * 7;
    this.outGlow.material.opacity = on * 0.9;
    this.knob.rotation.y = 0.8;
  }
}

// ---------- the bench: module wired to an Arduino Uno on a cutting mat ----------

class Bench {
  readonly group = new THREE.Group();
  readonly module = new IrModule();
  private lGlow = glowSprite(0xffa040, 0.9);
  private pulses: THREE.Mesh[] = [];
  private outCurve!: THREE.CatmullRomCurve3;
  readonly moduleFocus = V(0.9, 0.4, 3.2);
  readonly unoFocus = V(0.6, 0.5, -1.4);

  constructor() {
    const g = this.group;
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      std(0xffffff, 0.85, 0, {
        map: (() => {
          const t = canvasTex(1024, 1024, (ctx) => {
            ctx.fillStyle = '#1e6e57';
            ctx.fillRect(0, 0, 1024, 1024);
            for (let i = 0; i <= 10; i++) {
              ctx.strokeStyle = i % 5 === 0 ? 'rgba(235,245,240,0.55)' : 'rgba(235,245,240,0.25)';
              ctx.lineWidth = i % 5 === 0 ? 4 : 2;
              const q = (i / 10) * 1024;
              ctx.beginPath();
              ctx.moveTo(q, 0);
              ctx.lineTo(q, 1024);
              ctx.moveTo(0, q);
              ctx.lineTo(1024, q);
              ctx.stroke();
            }
            ctx.strokeStyle = 'rgba(235,245,240,0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 1024);
            ctx.lineTo(1024, 0);
            ctx.moveTo(0, 0);
            ctx.lineTo(1024, 1024);
            ctx.stroke();
          });
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(6, 6);
          return t;
        })(),
      }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.receiveShadow = true;
    g.add(mat);

    // Arduino Uno: the detailed 2D drawing as the board's top, with 3D connectors, headers and chip
    const uno = new THREE.Group();
    uno.position.set(0, 0, -1.5);
    const top = canvasTex(1372, 1066, (ctx) => {
      ctx.scale(1372 / BOARD_W, 1066 / BOARD_H);
      drawUno(ctx, { l: 0, tx: 0, rx: 0, on: 1, cable: 0, build: 1 });
    });
    const side = std(0x00474e, 0.5);
    const bm = phys(0xffffff, { map: top, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W / 10, T, BOARD_H / 10), [side, side, bm, side, side, side]);
    board.position.y = T / 2 + 0.02;
    uno.add(board);
    const U = (x: number, y: number) => V((x - BOARD_W / 2) / 10, T + 0.02, (y - BOARD_H / 2) / 10);
    const put = (m: THREE.Mesh, x: number, y: number, w: number, d: number, h: number) => {
      m.position.copy(U(x + w / 2, y + d / 2)).add(V(0, h / 2, 0));
      uno.add(m);
    };
    put(rbox(1.63, 1.1, 1.2, 0.03, M.tin), -6.3, 9.4, 16.3, 12, 1.1);
    put(rbox(1.4, 1.1, 0.9, 0.05, M.black), -1.9, 40.4, 14, 9, 1.1);
    put(rbox(3.56, 0.35, 0.76, 0.03, M.black), 30, 33.6, 35.6, 7.6, 0.35);
    put(rbox(2.6, 0.85, 0.25, 0.02, M.black), 16.6, 0.6, 26, 2.5, 0.85);
    put(rbox(2.06, 0.85, 0.25, 0.02, M.black), 43.2, 0.6, 20.6, 2.5, 0.85);
    put(rbox(2.06, 0.85, 0.25, 0.02, M.black), 26.6, 49.9, 20.6, 2.5, 0.85);
    put(rbox(1.55, 0.85, 0.25, 0.02, M.black), 49.5, 49.9, 15.5, 2.5, 0.85);
    this.lGlow.position.copy(U(25, 8.9)).add(V(0, 0.08, 0));
    uno.add(this.lGlow);
    g.add(uno);

    // the module lies in front of the Uno, its pins towards it
    const mod = this.module.group;
    mod.position.set(0.9, 0.02, 3.6);
    mod.rotation.y = Math.PI / 2;
    g.add(mod);
    mod.updateMatrixWorld(true);
    const tips = this.module.pinTips.map((p) => p.clone().applyMatrix4(mod.matrix));
    const hdrTop = (x: number, y: number) => U(x, y).add(uno.position).add(V(0, 0.95, 0));
    const ends = [hdrTop(38.06, 51.2), hdrTop(40.6, 51.2), hdrTop(57.2, 1.9)];
    const colors = [0xd8322a, 0x1a1a1a, 0xf2c230];
    tips.forEach((tip, i) => {
      const e = ends[i];
      const out = tip.clone().add(V(0, 0, -0.55));
      const curve = new THREE.CatmullRomCurve3([
        tip.clone().add(V(0, 0, -0.3)),
        out,
        V(lerp(out.x, e.x, 0.3), 1.6 + i * 0.35, lerp(out.z, e.z, 0.3)),
        V(lerp(out.x, e.x, 0.75), 2.0 + i * 0.3, lerp(out.z, e.z, 0.75)),
        e.clone().add(V(0, 0.9, 0)),
        e.clone().add(V(0, 0.35, 0)),
      ]);
      if (i === 2) this.outCurve = curve;
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.055, 10), phys(colors[i], { roughness: 0.4, clearcoat: 0.6 }));
      g.add(wire);
      const housing = rbox(0.25, 0.25, 0.55, 0.03, M.black);
      housing.position.copy(tip).add(V(0, 0, -0.28));
      const plug = rbox(0.25, 0.55, 0.25, 0.03, M.black);
      plug.position.copy(e).add(V(0, 0.32, 0));
      g.add(housing, plug);
    });
    const pg = new THREE.SphereGeometry(0.07, 12, 8);
    const pm = emissive(0xffe070, 0xffffff);
    pm.emissiveIntensity = 8;
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(pg, pm);
      const s = glowSprite(0xffd050, 0.6);
      s.material.opacity = 1;
      m.add(s);
      g.add(m);
      this.pulses.push(m);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== mat) o.castShadow = o.receiveShadow = true;
    });
  }

  update(t: number, detect: number) {
    const m = this.module;
    m.pwr.set(1);
    m.obs.set(detect);
    m.emitter.set(1, 0);
    m.receiver.set(detect, 0);
    this.lGlow.material.opacity = detect * 0.95;
    this.pulses.forEach((p, i) => {
      p.visible = detect > 0.5;
      p.position.copy(this.outCurve.getPointAt((t * 0.6 + i / 3) % 1));
    });
  }
}

// ---------- beams ----------

const BEAM_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */ `
uniform float time; uniform float on; uniform vec3 color;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 1.6);
  float along = vUv.y;
  float fade = (1.0 - along) * smoothstep(0.0, 0.06, along);
  float wave = 0.5 + 0.5 * sin(along * 34.0 - time * 12.0);
  float a = core * fade * (0.35 + 0.65 * wave) * on;
  gl_FragColor = vec4(color * a * 3.2, a);
}`;

function beam(len: number, r0: number, r1: number, hex: number) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, 48, 1, true);
  geo.translate(0, len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, on: { value: 0 }, color: { value: lin(hex) } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  return m;
}

// ---------- depth of field + tone mapping (into the engine's frame) ----------

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOF_FRAG = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res;
uniform float near; uniform float far; uniform float focus; uniform float scale; uniform float maxBlur; uniform float exposure;
varying vec2 vUv;
float linZ(float d) { return near * far / (far - d * (far - near)); }
float coc(float z) { return clamp(abs(1.0 / focus - 1.0 / z) * scale, 0.0, 1.0) * maxBlur; }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 bg(vec2 uv) {
  vec2 c = (uv - vec2(0.5, 0.52)) * vec2(1.0, 0.62);
  return mix(vec3(0.034, 0.037, 0.046), vec3(0.008, 0.009, 0.012), smoothstep(0.0, 0.62, length(c)));
}
vec4 samp(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d >= 0.99999) return vec4(bg(uv) + texture2D(tColor, uv).rgb, far);
  return vec4(texture2D(tColor, uv).rgb, linZ(d));
}
void main() {
  vec4 c0 = samp(vUv);
  float cs = coc(c0.w);
  vec3 acc = c0.rgb;
  float tot = 1.0;
  float radius = 0.6;
  float ang = 0.0;
  for (int i = 0; i < 180; i++) {
    if (radius >= maxBlur) break;
    ang += 2.39996323;
    vec4 s = samp(vUv + vec2(cos(ang), sin(ang)) * radius / res);
    float ss = coc(s.w);
    if (s.w > c0.w) ss = clamp(ss, 0.0, cs * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, ss);
    acc += mix(acc / tot, s.rgb, m);
    tot += 1.0;
    radius += 1.25 / radius;
  }
  vec3 col = aces(acc / tot * exposure);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

// ---------- the director ----------

const DEFAULT_SHOTS = ['assemble', 'hero', 'macro', 'beam', 'layers', 'inside', 'compare', 'pot', 'wiring', 'hero'];

export class Studio {
  private built = false;
  private set!: { module: THREE.Group; lattice: THREE.Group; compare: THREE.Group; bench: THREE.Group };
  private mod!: IrModule;
  private lattice!: Lattice;
  private comparator!: Comparator;
  private bench!: Bench;
  private beamOut!: THREE.Mesh;
  private beamBack!: THREE.Mesh;
  private wall!: THREE.Mesh;
  private key!: THREE.DirectionalLight;
  private rt!: THREE.WebGLRenderTarget;
  private dof!: THREE.ShaderMaterial;
  private dofScene = new THREE.Scene();
  private quadCam = new THREE.Camera();
  private focusDist = 10;
  private scale = 6;
  private target = V();
  private last?: [number, StudioLine[], number];
  private posed = false;

  constructor(
    private readonly three: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly plan: StudioPlan,
  ) {}

  init(r: THREE.WebGLRenderer) {
    if (this.built) return;
    this.built = true;
    M = makeMats();
    GLOW_TEX = canvasTex(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    GLOW_TEX.colorSpace = THREE.NoColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(r);
    this.three.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.three.environmentIntensity = 0.28;
    this.three.background = null;

    this.key = new THREE.DirectionalLight(lin(0xfff1e4), 2.8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 4;
    const rim = new THREE.DirectionalLight(lin(0x9cc4ff), 1.6);
    rim.position.set(-6, 4, -7);
    const fill = new THREE.DirectionalLight(lin(0xffffff), 0.35);
    fill.position.set(-4, 2, 6);
    this.three.add(this.key, this.key.target, rim, fill);

    const module = new THREE.Group();
    this.mod = new IrModule();
    module.add(this.mod.group);
    this.beamOut = beam(9, 0.12, 1.1, 0xff3b6b);
    this.beamOut.rotation.z = Math.PI / 2;
    this.beamOut.position.copy(this.mod.anchors.emitTip);
    this.beamBack = beam(1, 0.5, 0.1, 0xff3b6b);
    this.wall = rbox(0.3, 2.2, 2.6, 0.08, std(0x9a968f, 0.7));
    this.wall.castShadow = this.wall.receiveShadow = true;
    module.add(this.beamOut, this.beamBack, this.wall);
    this.lattice = new Lattice();
    this.comparator = new Comparator();
    this.bench = new Bench();
    this.set = { module, lattice: this.lattice.group, compare: this.comparator.group, bench: this.bench.group };
    for (const g of Object.values(this.set)) {
      g.visible = false;
      this.three.add(g);
    }

    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    this.dof = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        res: { value: size.clone() },
        near: { value: 0.1 },
        far: { value: 200 },
        focus: { value: 10 },
        scale: { value: 6 },
        maxBlur: { value: (22 * size.y) / 1920 },
        exposure: { value: 1.0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: DOF_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.dofScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dof));
  }

  private shotAt(i: number): Shot {
    const s = this.plan.shots.find((x) => x.line === i) ?? this.plan.shots[i];
    return s ?? { line: i, shot: DEFAULT_SHOTS[i % DEFAULT_SHOTS.length] };
  }

  private rig(target: THREE.Vector3, az: number, el: number, dist: number, fov = 26) {
    const c = this.camera;
    c.fov = fov;
    c.aspect = W / H;
    c.near = 0.1;
    c.far = 200;
    c.position.set(target.x + Math.cos(el) * Math.sin(az) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(el) * Math.cos(az) * dist);
    c.up.set(0, 1, 0);
    c.lookAt(target);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.target.copy(target);
    this.focusDist = dist;
  }

  /** Poses the whole stage for time t. */
  update(t: number, lines: StudioLine[], idx: number) {
    this.last = [t, lines, idx];
    if (!this.built) return;
    const L = lines[idx];
    const next = lines[idx + 1];
    const start = L ? L.start : 0;
    const end = next ? next.start : L ? L.end + 0.6 : 1;
    const p = clamp((t - start) / Math.max(0.5, end - start));
    const lt = Math.max(0, t - start);
    const sh = this.shotAt(idx);
    const dir = idx % 2 ? -1 : 1;
    const m = this.mod;
    const A = m.anchors;
    for (const g of Object.values(this.set)) g.visible = false;
    this.set.module.visible = true;
    m.assemble(1);
    m.pwr.set(1);
    m.obs.set(0);
    m.emitter.set(0, 0);
    m.receiver.set(0, 0);
    m.knob.rotation.y = 0.6;
    (this.beamOut.material as THREE.ShaderMaterial).uniforms.on.value = 0;
    (this.beamBack.material as THREE.ShaderMaterial).uniforms.on.value = 0;
    this.wall.visible = false;
    this.scale = 6;
    let shadowBox = 4;
    const base = V(-0.4, 0.3, 0);

    switch (sh.shot) {
      case 'assemble': {
        m.assemble(range(p, -0.3, 0.8));
        this.rig(base, 0.75 - 0.45 * inOutCubic(p), lerp(0.62, 0.42, p), lerp(16, 13, outCubic(p)));
        this.scale = 7;
        break;
      }
      case 'macro': {
        const part = sh.part && A[sh.part] ? sh.part : 'sensor';
        const front = part === 'sensor' || part === 'emitter' || part === 'receiver';
        const az = front ? -1.25 + dir * 0.35 - 0.25 * p * dir : part === 'pins' ? 1.35 - 0.3 * p : 0.4 * dir + 0.35 * p * dir;
        this.rig(A[part], az, lerp(0.42, 0.3, p), lerp(3.6, 3.0, inOutCubic(p)), 24);
        if (part === 'emitter' || part === 'sensor') m.emitter.set(1, 0);
        if (part === 'leds') m.obs.set(p > 0.5 ? 1 : 0);
        this.scale = 9;
        break;
      }
      case 'layers': {
        const led = sh.part === 'emitter' ? m.emitter : m.receiver;
        const ex = outCubic(range(p, 0.08, 0.6));
        led.set(sh.part === 'emitter' ? 0.6 : 0.3 * ex, ex);
        const anchor = (sh.part === 'emitter' ? A.emitter : A.receiver).clone().add(V(-0.25 - 0.6 * ex, 0, 0));
        this.rig(anchor, Math.PI / 2 - 0.3 * dir, 0.95, lerp(5.2, 6.4, ex), 24);
        this.scale = 8;
        break;
      }
      case 'beam': {
        const obstacle = sh.obstacle !== false;
        m.emitter.set(1, 0);
        const dist = obstacle ? lerp(8, 2.6, outCubic(range(p, 0.05, 0.55))) : 99;
        const wallX = A.emitTip.x - dist;
        const hit = obstacle && dist < 9;
        (this.beamOut.material as THREE.ShaderMaterial).uniforms.on.value = 1;
        (this.beamOut.material as THREE.ShaderMaterial).uniforms.time.value = t;
        this.beamOut.scale.y = hit ? (dist - 0.2) / 9 : 1;
        const near = obstacle ? clamp((5 - dist) / 2) : 0;
        if (obstacle) {
          this.wall.visible = true;
          this.wall.position.set(wallX - 0.15, 0.7, 0);
          const from = V(wallX, A.emitTip.y, -0.36 + 0.36);
          const to = A.recvTip.clone();
          const d = to.clone().sub(from);
          this.beamBack.position.copy(from);
          this.beamBack.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
          this.beamBack.scale.set(1, d.length(), 1);
          const bm = this.beamBack.material as THREE.ShaderMaterial;
          bm.uniforms.on.value = near;
          bm.uniforms.time.value = t;
        }
        m.receiver.set(near, 0);
        m.obs.set(near > 0.6 ? 1 : 0);
        this.rig(V(A.emitTip.x - 1.1, 0.4, 0), 1.25 + 0.12 * dir - 0.1 * p, 0.68, 10.5, 28);
        this.focusDist = this.camera.position.distanceTo(this.set.module.localToWorld(A.sensor.clone()));
        this.scale = 4;
        shadowBox = 8;
        break;
      }
      case 'inside': {
        this.set.module.visible = false;
        this.lattice.group.visible = true;
        const light = sh.light === false ? 0 : smooth(range(p, 0.12, 0.45));
        this.lattice.update(t, light);
        this.rig(this.lattice.focus, 0.7 * dir + 0.25 * p * dir, 0.62, lerp(10.5, 9.5, p), 28);
        this.scale = 5;
        shadowBox = 5;
        break;
      }
      case 'compare': {
        this.set.module.visible = false;
        this.comparator.group.visible = true;
        this.comparator.update(t, p, sh.cross !== false);
        this.rig(this.comparator.focus, 0.45 * dir - 0.2 * p * dir, 0.32, lerp(10, 9, p), 28);
        this.scale = 5;
        shadowBox = 5;
        break;
      }
      case 'pot': {
        m.knob.rotation.y = 0.6 + 2.2 * inOutCubic(range(p, 0.1, 0.9));
        this.rig(A.pot, 0.5 * dir + 0.2 * p, 0.85, lerp(3.4, 2.9, p), 24);
        this.scale = 9;
        break;
      }
      case 'wiring': {
        this.set.module.visible = false;
        this.bench.group.visible = true;
        const detect = sh.detect === false ? 0 : p > 0.35 ? 1 : 0;
        this.bench.update(t, detect);
        const target = this.bench.moduleFocus.clone().lerp(this.bench.unoFocus, inOutCubic(p));
        this.rig(target, 0.45 + 0.2 * p, 1.1, lerp(23, 21, p), 28);
        this.scale = 4;
        shadowBox = 12;
        break;
      }
      default: {
        // hero: a slow orbit around the whole module
        m.emitter.set(1, 0);
        this.rig(base, 0.55 * dir + 0.5 * p * dir, 0.4 + 0.08 * Math.sin(p * 3), 10 - p * 0.8);
        this.scale = 6;
      }
    }
    // rack focus on every cut: starts soft and pulls into focus
    this.scale += 18 * (1 - outCubic(clamp(lt / 0.45)));
    const k = this.key;
    k.position.copy(this.target).add(V(4, 9, 6));
    k.target.position.copy(this.target);
    k.shadow.camera.left = k.shadow.camera.bottom = -shadowBox;
    k.shadow.camera.right = k.shadow.camera.top = shadowBox;
    k.shadow.camera.near = 0.5;
    k.shadow.camera.far = 40;
    k.shadow.camera.updateProjectionMatrix();
  }

  /** Renders the 3D stage with depth of field into the engine's frame (target). */
  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    if (!this.built) return;
    // the first frame is posed before the stage exists (init runs just before the first 3D render): pose it now
    if (!this.posed && this.last) this.update(...this.last);
    this.posed = true;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.three, this.camera);
    const u = this.dof.uniforms;
    u.focus.value = this.focusDist;
    u.scale.value = this.scale;
    u.near.value = this.camera.near;
    u.far.value = this.camera.far;
    r.setRenderTarget(target);
    r.render(this.dofScene, this.quadCam);
  }

  /** One big white word at a time, like the reference. */
  captions(ctx: Ctx, t: number, lines: StudioLine[], idx: number) {
    const L = lines[idx];
    if (!L || t < L.start - 0.05 || t > L.end + 0.15) return;
    const words = L.text.replace(/\*/g, '').split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const wts = words.map((w) => w.length + 2.5);
    const sum = wts.reduce((a, b) => a + b, 0);
    const u = clamp((t - L.start) / Math.max(0.3, L.end - L.start)) * sum;
    let acc = 0;
    let k = 0;
    for (; k < words.length - 1; k++) {
      if (u < acc + wts[k]) break;
      acc += wts[k];
    }
    const wordStart = L.start + (acc / sum) * (L.end - L.start);
    const pop = 1 - outCubic(clamp((t - wordStart) / 0.12));
    let size = 66;
    ctx.save();
    ctx.font = `400 ${size}px Michroma, "Archivo", sans-serif`;
    const word = words[k].toUpperCase();
    while (size > 34 && ctx.measureText(word).width > W - 140) {
      size -= 4;
      ctx.font = `400 ${size}px Michroma, "Archivo", sans-serif`;
    }
    ctx.translate(W / 2, 1440);
    ctx.scale(1 + 0.1 * pop, 1 + 0.1 * pop);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }
}
