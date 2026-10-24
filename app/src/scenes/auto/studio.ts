// Studio 3D format (2026-10-24): a premium 3D product explainer in the style of the reference reel the owner
// picked (schematikio, "How does a LDR sensor work?"): the real module as a photoreal 3D model on a dark stage,
// slow camera moves with a shallow depth of field, parts flying together, layers splitting apart, glass
// "inside the material" diagrams, the module wired to an Arduino on a cutting mat. Real component models come from
// the KiCad 3D library (kicad.ts); captions are the channel's story style (big headline words, *key* word in
// orange, plus the subtitle line). scripts/auto.ts --studio asks Claude only for a shot list (studio.gen.json);
// everything here is a pure function of time (seek-safe). Units: 1 = 1 cm.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, hash, inOutCubic, lerp, outCubic, range, smooth } from '../../engine/ease';
import { H, W, type Ctx } from '../../kit';
import { BOARD_H, BOARD_W, drawUno } from './arduino';
import { kicad, loadKicad, type KicadSurface } from './kicad';

export interface Shot {
  line: number;
  shot: string;
  part?: string;
  obstacle?: boolean;
  light?: boolean;
  cross?: boolean;
  detect?: boolean;
  /** the big headline words for this shot (2-5 words, *key* word) */
  text?: string;
  /** a part-name callout (macro / layers shots) */
  label?: string;
  /** scene shots: the everyday use to show (robot | tap | door | lamp | alarm | clap) */
  use?: string;
  /** uno shots: the Arduino pin to show (D2 | 5V | GND | A0) */
  pin?: string;
  /** code shots: up to 6 short lines of Arduino code */
  code?: string[];
  fire?: boolean;
  loud?: boolean;
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

/** the KiCad models the stage uses; loaded before the first frame (AutoPlate.prepare) */
const MODELS = [
  'SOIC-8_3.9x4.9mm_P1.27mm', 'R_0805_2012Metric', 'C_0805_2012Metric', 'LED_0805_2012Metric',
  'LED_D5.0mm_Horizontal_O1.27mm_Z3.0mm_Clear', 'LED_D5.0mm_Horizontal_O1.27mm_Z3.0mm_IRBlack', 'PinHeader_1x03_P2.54mm_Horizontal', 'PinHeader_1x04_P2.54mm_Horizontal',
  'DIP-28_W7.62mm_Socket', 'DIP-28_W7.62mm', 'PinSocket_1x08_P2.54mm_Vertical', 'PinSocket_1x10_P2.54mm_Vertical',
  'PinSocket_1x06_P2.54mm_Vertical', 'Crystal_HC49-4H_Vertical', 'SW_PUSH_6mm', 'CP_Radial_D6.3mm_P2.50mm', 'SOT-223', 'TQFP-32_7x7mm_P0.8mm',
];
let modelsReady: Promise<unknown> | undefined;
export function loadStudioModels() {
  modelsReady ??= Promise.all(MODELS.map((m) => loadKicad(m).catch((e) => console.warn('kicad model missing:', e))));
  return modelsReady;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lin = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();
const T = 0.16; // PCB thickness
/** ?lite=1 (render.ts --lite, the GPU-less cloud): fewer blur taps, 2x MSAA, smaller shadow map */
const LITE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('lite');

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
    clearLed: phys(0xdfe8ff, { transmission: 1, thickness: 0.9, roughness: 0.16, ior: 1.52 }),
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
// KiCad material names -> physically based materials
const PBR = new Map<string, THREE.Material>();
function pbrFor(s: KicadSurface): THREE.Material {
  let m = PBR.get(s.mat);
  if (m) return m;
  const n = s.mat;
  if (n === 'PIN-01') m = M.tin;
  else if (n === 'PIN-02') m = M.gold;
  else if (n.startsWith('MET') || n === 'C717171') m = M.steel;
  else if (n.startsWith('IC-BODY-EPOXY') || n === 'RES-SMD-01') m = M.black;
  else if (n === 'LED-WHITE') m = M.clearLed;
  else if (n === 'LED-BLACK') m = M.gloss;
  else if (n === 'IC-LABEL-01') m = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.85 });
  else if (n.startsWith('CAP-CERAMIC')) m = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.6 });
  else m = new THREE.MeshPhysicalMaterial({ color: s.color, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  PBR.set(n, m);
  return m;
}
/** A KiCad part as a group of meshes (undefined if its model didn't load); `over` swaps materials by KiCad name. */
function kmesh(name: string, over: Record<string, THREE.Material> = {}) {
  const k = kicad(name);
  if (!k) return undefined;
  const g = new THREE.Group();
  for (const s of k.surfaces) {
    const mesh = new THREE.Mesh(s.geo, over[s.mat] ?? pbrFor(s));
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

let SHADOW_TEX: THREE.Texture;
/** A soft dark patch under a part: the ambient-occlusion look that seats it on the board. */
function contact(w: number, d: number, strength = 0.55) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.5, d * 1.5),
    new THREE.MeshBasicMaterial({ map: SHADOW_TEX, color: 0x000000, transparent: true, opacity: strength, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}
/** a solder joint where a leg goes through the board */
function fillet() {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.035, 20, 1, true), M.tin);
  m.position.y = 0.0175;
  return m;
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
  const k = kmesh(cap ? 'C_0805_2012Metric' : 'R_0805_2012Metric');
  if (k) {
    k.add(contact(0.2, 0.125, 0.45));
    return k;
  }
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
  const k = kmesh('SOIC-8_3.9x4.9mm_P1.27mm');
  if (k) {
    // KiCad has its pins on the +-x sides; this layout wants them on +-z
    k.rotation.y = Math.PI / 2;
    g.add(k);
  } else {
    const body = rbox(0.49, 0.15, 0.39, 0.02, M.black);
    body.position.y = 0.105;
    g.add(body);
  }
  g.add(contact(0.55, 0.6, 0.6));
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
  top.position.y = k ? 0.177 : 0.181;
  g.add(top);
  if (k) return g;
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
  const k = kmesh(`PinHeader_1x0${n}_P2.54mm_Horizontal`);
  if (k) {
    // KiCad: pin 1 at the origin, pins along +z, bent pins pointing +x; centre the row on z
    const z0 = ((n - 1) / 2) * 0.254;
    k.position.set(-0.08, 0, -z0);
    const g = new THREE.Group();
    g.add(k, contact(0.4, 0.3 * n, 0.55));
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const f = fillet();
      f.position.set(-0.08, 0, i * 0.254 - z0);
      g.add(f);
      tips.push(V(0.9, 0.127, i * 0.254 - z0));
    }
    return { group: g, tips };
  }
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
  const lensMat = emissive(hex, 0x553333);
  const k = kmesh('LED_0805_2012Metric', { 'PLASTIC-GREEN-01': lensMat });
  if (k) g.add(k, contact(0.2, 0.125, 0.45));
  else {
    const body = rbox(0.2, 0.07, 0.125, 0.01, M.white);
    body.position.y = 0.035;
    g.add(body);
  }
  const lens = k ? new THREE.Mesh() : new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.1), lensMat);
  lens.material = lensMat;
  lens.position.y = 0.075;
  g.add(lens);
  const halo = glowSprite(hex, 0.6);
  const light = new THREE.PointLight(lin(hex), 0, 1.4, 2);
  light.position.y = 0.2;
  g.add(light);
  halo.position.y = 0.12;
  g.add(halo);
  return {
    group: g,
    set(on: number) {
      lensMat.emissiveIntensity = on * 10;
      halo.material.opacity = on * 0.9;
      light.intensity = on * 0.25;
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
  on = 0;
  set(on: number, explode: number, _t = 0) {
    this.on = on;
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

/** What the "layers" shot can pull apart: the IR LEDs (Led), the LDR and the microphone capsule. */
interface Layered {
  readonly group: THREE.Group;
  on: number;
  set(on: number, explode: number, t?: number): void;
}

/** Layer bookkeeping shared by the hand-built parts: each layer slides along the part's axis (+Y) when pulled apart. */
class Stack {
  readonly group = new THREE.Group();
  on = 0;
  protected layers: { obj: THREE.Object3D; home: number; out: number; grow?: number }[] = [];
  protected add(obj: THREE.Object3D, out: number, grow?: number) {
    this.group.add(obj);
    this.layers.push({ obj, home: obj.position.y, out, grow });
  }
  protected spread(explode: number) {
    for (const l of this.layers) {
      l.obj.position.y = l.home + explode * l.out;
      if (l.grow) l.obj.scale.setScalar(1 + (l.grow - 1) * explode);
    }
  }
}

/** An LDR (CdS photoresistor): white ceramic disc, orange cadmium-sulphide zigzag between two silver combs, clear
 *  coat, maroon rim, two long legs. Axis +Y = the light-facing side (the holder turns it to face forward). */
class Ldr extends Stack implements Layered {
  private trackMat: THREE.MeshStandardMaterial;
  constructor() {
    super();
    const tex = canvasTex(256, 256, (ctx) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(128, 128, 124, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#ece6d6';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#c9ccd1';
      ctx.fillRect(0, 0, 40, 256);
      ctx.fillRect(216, 0, 40, 256);
      ctx.strokeStyle = '#c8451f';
      ctx.lineWidth = 15;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = 28 + i * 25;
        ctx.moveTo(i % 2 ? 214 : 42, y);
        ctx.lineTo(i % 2 ? 42 : 214, y);
        if (i < 8) ctx.lineTo(i % 2 ? 42 : 214, y + 25);
      }
      ctx.stroke();
      ctx.restore();
    });
    this.trackMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: lin(0xff8a3a), emissiveMap: tex, emissiveIntensity: 0 });
    const base = new THREE.Group();
    const ceramic = cyl(0.26, 0.07, std(0xe9e4d6, 0.6), 48);
    ceramic.position.y = 0.035;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.02, 12, 48), std(0x7a2a1e, 0.45));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    base.add(ceramic, rim);
    this.add(base, 0.15);
    const track = new THREE.Mesh(new THREE.CircleGeometry(0.235, 48), this.trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.073;
    this.add(track, 0.55, 1.5);
    const coat = cyl(0.25, 0.03, M.glass, 48);
    coat.position.y = 0.09;
    this.add(coat, 0.95);
    // the legs run "down" the board: local -x is world -y once the holder turns the disc to face forward
    const legs = new THREE.Group();
    for (const z of [-0.1, 0.1]) {
      const leg = cyl(0.02, 0.32, M.tin, 12);
      leg.rotation.z = Math.PI / 2;
      leg.position.set(-0.26 - 0.16, 0.03, z);
      legs.add(leg);
    }
    this.add(legs, -0.25);
  }
  set(on: number, explode: number) {
    this.on = on;
    this.spread(explode);
    this.trackMat.emissiveIntensity = on * 0.5;
  }
}

/** An electret condenser microphone capsule: felt cover, metal can, gold diaphragm, perforated backplate, FET. */
class Mic extends Stack implements Layered {
  private diaphragm: THREE.Mesh;
  private dHome = 0;
  constructor() {
    super();
    const plate = canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#b9bec5';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#1a1c20';
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < 7; j++) {
          const x = 32 + i * 32;
          const y = 32 + j * 32;
          if ((x - 128) ** 2 + (y - 128) ** 2 < 110 ** 2) {
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
    });
    const fet = box(0.14, 0.07, 0.12, M.black);
    fet.position.y = 0.1;
    this.add(fet, -0.35);
    const back = cyl(0.42, 0.035, new THREE.MeshStandardMaterial({ map: plate, metalness: 0.9, roughness: 0.35 }), 48);
    back.position.y = 0.26;
    this.add(back, 0.25);
    this.diaphragm = cyl(0.41, 0.008, std(0xd9b25e, 0.3, 0.85), 48);
    this.diaphragm.position.y = 0.32;
    this.dHome = 0.32;
    this.add(this.diaphragm, 0.5, 1.0);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.42, 56, 1, true), M.tin);
    can.position.y = 0.21;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.45, 56), M.tin);
    cap.rotation.x = Math.PI / 2;
    const shell = new THREE.Group();
    shell.add(can, cap);
    this.add(shell, 0.75);
    const weave = canvasTex(128, 128, (ctx) => {
      ctx.fillStyle = '#121316';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = 'rgba(90,94,102,0.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 128; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 128);
        ctx.moveTo(0, i);
        ctx.lineTo(128, i);
        ctx.stroke();
      }
    });
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.set(4, 4);
    const felt = cyl(0.44, 0.03, new THREE.MeshStandardMaterial({ map: weave, roughness: 0.95 }), 56);
    felt.position.y = 0.435;
    this.add(felt, 1.15);
    const legs = new THREE.Group();
    for (const z of [-0.12, 0.12]) {
      const leg = cyl(0.025, 0.12, M.tin, 12);
      leg.rotation.z = Math.PI / 2;
      leg.position.set(-0.45 - 0.06, 0.12, z);
      legs.add(leg);
    }
    this.add(legs, 0);
  }
  set(on: number, explode: number, t = 0) {
    this.on = on;
    this.spread(explode);
    // sound moves the diaphragm
    this.diaphragm.position.y = this.dHome + explode * 0.5 + on * 0.012 * Math.sin(t * 40);
  }
}

// ---------- the sensor modules (FC-51 IR; LDR, flame and sound modules on the same LM393 board) ----------

interface Part {
  obj: THREE.Object3D;
  home: THREE.Vector3;
  homeQ: THREE.Quaternion;
  from: THREE.Vector3;
  spin: THREE.Euler;
  delay: number;
}

export const MODULE_KINDS = ['ir', 'ldr', 'flame', 'sound'];

class SensorModule {
  readonly group = new THREE.Group();
  readonly parts: Part[] = [];
  readonly emitter = new Led('ir');
  /** the sensing part: the IR receiver (ir, flame), the LDR or the microphone */
  readonly receiver: Layered;
  readonly knob: THREE.Group;
  readonly pwr = smdLed(0xff3030);
  readonly obs = smdLed(0x33ff66);
  readonly pinTips: THREE.Vector3[];
  readonly anchors: Record<string, THREE.Vector3>;
  readonly w = 3.1;
  readonly h = 1.45;

  constructor(readonly kind = 'ir') {
    this.receiver = kind === 'ldr' ? new Ldr() : kind === 'sound' ? new Mic() : new Led('pd');
    const pins = kind === 'ir' ? 3 : 4;
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
    if (pins === 3) {
      const hole = new THREE.Path();
      hole.absarc(1.0, -0.12, 0.15, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 32 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.015, 0);
    const tex = canvasTex(1550, 725, (ctx) => drawBoard(ctx, w, h, kind));
    tex.repeat.set(1 / w, 1 / h);
    tex.offset.set(0.5, 0.5);
    const top = phys(0xffffff, { map: tex, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.45, envMapIntensity: 0.45 });
    const board = new THREE.Mesh(geo, [top, M.edge]);
    this.group.add(board);
    this.part(board, V(0, -2.5, 0.5), new THREE.Euler(0.6, 0.4, 0), 0);

    const hd = header(pins);
    at(hd.group, 1.33, 0);
    this.named.pins = hd.group;
    this.part(hd.group, V(2.5, 1.5, 0), new THREE.Euler(0, 0, 1.2), 0.18);
    this.pinTips = hd.tips.map((p) => p.clone().add(hd.group.position));

    const pot = trimmer();
    pot.group.add(contact(0.62, 0.62, 0.6));
    at(pot.group, -0.45, 0);
    this.named.pot = pot.group;
    this.knob = pot.knob;
    this.part(pot.group, V(-0.5, 3.2, -1), new THREE.Euler(0.8, 1, 0), 0.26);

    const chip = soic('LM393');
    at(chip, 0.42, 0.22);
    this.named.chip = chip;
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
    const leds: [Led, number, number][] =
      kind === 'ir' ? [[this.emitter, 0.36, 0.62], [this.receiver as Led, -0.36, 0.7]] : kind === 'flame' ? [[this.receiver as Led, 0, 0.62]] : [];
    for (const [led, y, d] of leds) {
      const holder = new THREE.Group();
      led.group.rotation.z = Math.PI / 2;
      led.group.position.y = 0.3;
      holder.add(led.group);
      // the real part (KiCad's horizontal 5 mm LED: clear for the emitter, IR-black for the receiver); the layered
      // model above stands in for it only in the "layers" shot
      const real = kmesh(led === this.emitter ? 'LED_D5.0mm_Horizontal_O1.27mm_Z3.0mm_Clear' : 'LED_D5.0mm_Horizontal_O1.27mm_Z3.0mm_IRBlack');
      if (real) {
        real.rotation.y = -Math.PI / 2;
        real.position.set(0.15, 0, -0.127);
        holder.add(real);
        if (led === this.emitter) {
          // what you see through the clear epoxy: the reflector cup and the glowing die on the cathode post
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.05, 0.1, 32, 1, true), M.tin);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(-0.36, 0.3, 0);
          const die = box(0.03, 0.05, 0.05, this.emitDie);
          die.position.set(-0.4, 0.3, 0);
          real.parent!.add(cup, die);
        }
        const glow = glowSprite(led === this.emitter ? 0xff3b6b : 0x6fb6ff, 0.7);
        glow.position.set(-0.8, 0.3, 0);
        holder.add(glow);
        this.realGlow.push({ led: led as Layered, glow });
        led.group.visible = false;
        (led === this.emitter ? this.realLeds : this.realLeds).push({ real, layered: led.group });
        for (const dz of [-0.127, 0.127]) {
          const f = fillet();
          f.position.set(0.15, 0, dz);
          holder.add(f);
        }
      } else
        for (const dz of [-0.1, 0.1]) {
          const v = cyl(0.022, 0.3, M.tin, 12);
          v.position.set(0.15, 0.15, dz);
          const hz = cyl(0.022, 0.2, M.tin, 12);
          hz.rotation.z = Math.PI / 2;
          hz.position.set(0.07, 0.3, dz);
          holder.add(v, hz);
        }
      at(holder, -1.15, y);
      this.named[led === this.emitter ? 'emitter' : 'receiver'] = holder;
      this.part(holder, V(-3, 1.2, -y * 4), new THREE.Euler(0, 0, -1.4), d);
    }
    // the LDR stands on its legs facing forward; the microphone sits at the front end, facing forward
    if (kind === 'ldr' || kind === 'sound') {
      const holder = new THREE.Group();
      const part = this.receiver.group;
      part.rotation.z = Math.PI / 2;
      part.position.set(kind === 'ldr' ? -0.32 : -0.2, kind === 'ldr' ? 0.6 : 0.47, 0);
      holder.add(part);
      for (const dz of [-0.11, 0.11]) {
        const f = fillet();
        f.position.set(kind === 'ldr' ? -0.35 : -0.32, 0, dz);
        holder.add(f);
      }
      at(holder, -1.05, 0);
      this.named.receiver = holder;
      this.part(holder, V(-3, 1.2, 0), new THREE.Euler(0, 0, -1.4), 0.62);
    }

    const front = kind === 'ldr' ? V(-1.45, T + 0.6, 0) : kind === 'sound' ? V(-1.55, T + 0.47, 0) : V(-1.75, T + 0.3, 0);
    const single = kind !== 'ir';
    this.anchors = {
      board: V(0, T, 0),
      sensor: front,
      emitter: single ? front : V(-1.75, T + 0.3, -0.36),
      receiver: single ? front : V(-1.75, T + 0.3, 0.36),
      emitTip: single ? front.clone().add(V(-0.25, 0, 0)) : V(-2.0, T + 0.3, -0.36),
      recvTip: single ? front.clone().add(V(-0.25, 0, 0)) : V(-2.0, T + 0.3, 0.36),
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

  private realLeds: { real: THREE.Object3D; layered: THREE.Object3D }[] = [];
  /** the time, for parts that move with it (the microphone's diaphragm) */
  t = 0;
  readonly named: Record<string, THREE.Object3D> = {};
  readonly emitDie = emissive(0xff3b6b, 0x2a2a30);
  private realGlow: { led: Layered; glow: THREE.Sprite }[] = [];
  /** mirrors the layered LEDs' state onto the real ones (call after posing) */
  sync() {
    this.emitDie.emissiveIntensity = this.emitter.on * 8;
    for (const r of this.realGlow) r.glow.material.opacity = r.glow.parent!.visible && !r.led.group.visible ? r.led.on * 0.5 : 0;
  }
  /** the layered LED models replace the real ones (for the "layers" shot) */
  layers(on: boolean) {
    for (const l of this.realLeds) {
      l.real.visible = !on;
      l.layered.visible = on;
    }
  }

  /** e: 0..1 the exploded view: every part lifts straight up off the board, higher the later it was fitted */
  lift(e: number) {
    this.assemble(1);
    this.parts.forEach((p, i) => {
      if (i === 0) return;
      p.obj.position.set(p.home.x * (1 + 0.3 * e), p.home.y + e * (0.55 + p.delay * 1.6), p.home.z * (1 + 0.9 * e));
    });
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

function drawBoard(ctx: Ctx, w: number, h: number, kind: string) {
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
  // gold rings for the sensor legs and the mounting hole
  ctx.fillStyle = '#d9b25e';
  for (const y of kind === 'ir' ? [0.36, -0.36] : [0]) for (const dy of [-0.11, 0.11]) {
    ctx.beginPath();
    ctx.arc(X(kind === 'ldr' ? -1.4 : kind === 'sound' ? -1.37 : -1.0), Y(y + dy), 0.05 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === 'ir') {
    ctx.beginPath();
    ctx.arc(X(1.0), Y(-0.12), 0.22 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  // silkscreen
  ctx.fillStyle = '#f3f6fb';
  ctx.strokeStyle = '#f3f6fb';
  ctx.lineWidth = 0.012 * k;
  ctx.font = `600 ${0.09 * k}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels: [string, number][] = kind === 'ir' ? [['VCC', 0.254], ['GND', 0], ['OUT', -0.254]] : [['VCC', 0.381], ['GND', 0.127], ['DO', -0.127], ['AO', -0.381]];
  labels.forEach(([s, y]) => ctx.fillText(s, X(1.06), Y(y)));
  ctx.font = `600 ${0.075 * k}px "IBM Plex Mono", monospace`;
  ctx.fillText('PWR', X(0.95), Y(-0.62));
  ctx.fillText(kind === 'ir' ? 'OBS' : 'DO', X(0.55), Y(-0.62));
  ctx.fillText({ ir: 'IR', ldr: 'LDR', flame: 'FLAME', sound: 'MIC' }[kind] ?? 'IR', X(-1.25), Y(0.62));
  ctx.strokeRect(X(-0.79), Y(0.34), 0.68 * k, 0.68 * k);
  ctx.strokeRect(X(0.15), Y(0.47), 0.55 * k, 0.5 * k);
  ctx.font = `600 ${0.07 * k}px "IBM Plex Mono", monospace`;
  ctx.fillText({ ir: 'FC-51', ldr: 'LM393 LDR', flame: 'FLAME SENSOR', sound: 'KY-038' }[kind] ?? 'FC-51', X(-0.45), Y(-0.55));
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

/** Inside the microphone: a gold diaphragm in front of a perforated backplate; sound makes it vibrate and a
 *  signal current flows. */
class Membrane {
  readonly group = new THREE.Group();
  private disc: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private ringMat = new THREE.MeshBasicMaterial({ color: lin(0x9fdcff), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  private dots: THREE.Mesh[] = [];
  private curve: THREE.CatmullRomCurve3;
  private coreMat = emissive(0x4aa8ff, 0x203050);
  readonly focus = V(0, 1.2, 0);
  constructor() {
    const g = this.group;
    stage(g, 4.4, 3.0);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.06, 16, 64), M.steel);
    frame.rotation.y = Math.PI / 2;
    frame.position.set(-0.3, 1.3, 0);
    this.disc = cyl(0.98, 0.012, phys(0xe2bd63, { metalness: 0.85, roughness: 0.25, transmission: 0.3, thickness: 0.05 }), 64);
    this.disc.rotation.z = Math.PI / 2;
    this.disc.position.set(-0.3, 1.3, 0);
    const plateTex = canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#b9bec5';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#15171a';
      for (let i = 0; i < 9; i++)
        for (let j = 0; j < 9; j++) {
          ctx.beginPath();
          ctx.arc(16 + i * 28, 16 + j * 28, 7, 0, Math.PI * 2);
          ctx.fill();
        }
    });
    const back = cyl(0.95, 0.06, new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.9, roughness: 0.35 }), 64);
    back.rotation.z = Math.PI / 2;
    back.position.set(0.25, 1.3, 0);
    for (const x of [-0.3, 0.25]) {
      const post = cyl(0.05, 0.3, M.steel, 16);
      post.position.set(x, 0.3, 0);
      g.add(post);
    }
    g.add(frame, this.disc, back);
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 8, 64), this.ringMat.clone());
      r.rotation.y = Math.PI / 2;
      g.add(r);
      this.rings.push(r);
    }
    this.curve = new THREE.CatmullRomCurve3([V(0.3, 0.4, 0), V(0.9, 0.35, 0.3), V(1.4, 0.4, 0.9), V(1.0, 0.45, 1.2)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, 48, 0.08, 12), M.glass), new THREE.Mesh(new THREE.TubeGeometry(this.curve, 48, 0.025, 8), this.coreMat));
    const dg = new THREE.SphereGeometry(0.045, 12, 8);
    const dm = emissive(0x8fd0ff, 0x4f8fff);
    dm.emissiveIntensity = 3;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(dg, dm);
      g.add(m);
      this.dots.push(m);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }
  update(t: number, on: number) {
    this.disc.position.x = -0.3 + on * 0.07 * Math.sin(t * 22);
    this.rings.forEach((r, i) => {
      const u = (t * 0.7 + i / this.rings.length) % 1;
      r.position.set(-2.2 + u * 1.85, 1.3, 0);
      r.scale.setScalar(0.6 + u * 0.6);
      (r.material as THREE.MeshBasicMaterial).opacity = on * (1 - u) * 0.9;
    });
    this.coreMat.emissiveIntensity = on * 5;
    this.dots.forEach((d, i) => {
      d.visible = on > 0.05;
      d.position.copy(this.curve.getPointAt((t * 0.4 + i / this.dots.length) % 1));
    });
  }
}

/** The things that act on the module in the "beam" shot: a desk lamp (LDR), a candle (flame), a speaker (sound). */
class Props {
  readonly lamp = new THREE.Group();
  readonly candle = new THREE.Group();
  readonly speaker = new THREE.Group();
  private bulbMat = emissive(0xffe2a8, 0xffffff);
  private bulbGlow = glowSprite(0xffd27a, 2.2);
  readonly lampLight = new THREE.SpotLight(lin(0xffd9a0), 0, 12, 0.55, 0.6, 1.5);
  readonly lampBeam = beam(1, 0.12, 0.9, 0xffd27a);
  private flame: THREE.Mesh;
  private flameGlow = glowSprite(0xff9a3a, 1.8);
  readonly flameLight = new THREE.PointLight(lin(0xff9a3a), 0, 7, 1.5);
  readonly irBeam = beam(1, 0.25, 0.25, 0xff3020);
  private rings: THREE.Mesh[] = [];
  readonly target = new THREE.Object3D();
  constructor(readonly at: THREE.Vector3) {
    // desk lamp head above and in front of the sensor, aimed at it
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 0.55, 40, 1, true), M.steel);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), this.bulbMat);
    bulb.position.y = -0.18;
    this.bulbGlow.position.y = -0.2;
    const arm = cyl(0.05, 1.6, M.steel, 12);
    arm.position.set(0, 0.95, 0);
    const lampHead = new THREE.Group();
    lampHead.add(head, bulb, this.bulbGlow, arm);
    lampHead.position.copy(at).add(V(-2.1, 2.3, 0));
    lampHead.lookAt(at);
    lampHead.rotateX(-Math.PI / 2);
    this.lamp.add(lampHead, this.lampLight, this.target);
    this.lampLight.position.copy(lampHead.position);
    this.target.position.copy(at);
    this.lampLight.target = this.target;
    this.lampLight.castShadow = true;
    this.lampBeam.position.copy(lampHead.position);
    const d = at.clone().sub(lampHead.position);
    this.lampBeam.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    this.lampBeam.scale.set(1, d.length(), 1);
    this.lamp.add(this.lampBeam);
    // candle in front of the sensor
    const wax = cyl(0.32, 1.3, std(0xf1e8d6, 0.75), 40);
    wax.position.y = 0.65;
    const wick = cyl(0.015, 0.12, std(0x222222, 0.8), 8);
    wick.position.y = 1.36;
    this.flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), emissive(0xffb050, 0xffffff));
    (this.flame.material as THREE.MeshStandardMaterial).emissiveIntensity = 6;
    this.flame.position.y = 1.55;
    this.flameGlow.position.y = 1.55;
    this.flameLight.position.y = 1.6;
    this.candle.add(wax, wick, this.flame, this.flameGlow, this.flameLight);
    this.candle.position.copy(at).add(V(-3.2, -at.y, 0));
    const from = this.candle.position.clone().add(V(0, 1.55, 0));
    const dir = at.clone().sub(from);
    this.irBeam.position.copy(from);
    this.irBeam.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    this.irBeam.scale.set(1, dir.length(), 1);
    this.candle.add(this.irBeam);
    this.irBeam.position.sub(this.candle.position);
    // speaker in front of the sensor, sound rings rolling towards it
    const body = cyl(0.7, 0.45, M.black, 48);
    body.rotation.z = Math.PI / 2;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.2, 0.22, 48, 1, true), std(0x3a3d42, 0.7));
    cone.rotation.z = -Math.PI / 2;
    cone.position.x = 0.3;
    this.speaker.add(body, cone);
    this.speaker.position.copy(at).add(V(-4.2, 0.3, 0));
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.025, 8, 64),
        new THREE.MeshBasicMaterial({ color: lin(0x9fdcff), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      r.rotation.y = Math.PI / 2;
      this.speaker.add(r);
      this.rings.push(r);
    }
    for (const g of [this.lamp, this.candle, this.speaker])
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
  }
  hide() {
    this.lamp.visible = this.candle.visible = this.speaker.visible = false;
    this.lampLight.intensity = this.flameLight.intensity = 0;
  }
  light(t: number, on: number) {
    this.lamp.visible = true;
    this.bulbMat.emissiveIntensity = on * 8;
    this.bulbGlow.material.opacity = on * 0.9;
    this.lampLight.intensity = on * 6;
    const m = this.lampBeam.material as THREE.ShaderMaterial;
    m.uniforms.on.value = on * 0.7;
    m.uniforms.time.value = t;
  }
  fire(t: number, on: number) {
    this.candle.visible = true;
    this.flame.visible = on > 0.02;
    const f = 1 + 0.12 * Math.sin(t * 13) + 0.07 * Math.sin(t * 29 + 1);
    this.flame.scale.set(1, 2.4 * f, 1);
    this.flameGlow.material.opacity = on * 0.85 * f;
    this.flameLight.intensity = on * 1.6 * f;
    const m = this.irBeam.material as THREE.ShaderMaterial;
    m.uniforms.on.value = on;
    m.uniforms.time.value = t;
  }
  sound(t: number, on: number) {
    this.speaker.visible = true;
    const dist = this.at.x - this.speaker.position.x - 0.4;
    this.rings.forEach((r, i) => {
      const u = (t * 0.75 + i / this.rings.length) % 1;
      r.position.set(0.4 + u * dist, -0.3 + (this.at.y - 0.3) * u, 0);
      r.scale.setScalar(0.5 + u * 0.8);
      (r.material as THREE.MeshBasicMaterial).opacity = on * (1 - u) * 0.9;
    });
  }
}

/** A simple stylised hand (palm, four fingers, thumb), fingers along -x. */
function makeHand(scale = 1) {
  const skin = std(0xd9a37e, 0.6);
  const g = new THREE.Group();
  const palm = rbox(1.6, 0.55, 1.5, 0.25, skin);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.85 - Math.abs(i - 1.5) * 0.12, 6, 12), skin);
    f.rotation.z = Math.PI / 2;
    f.position.set(-1.25, 0, -0.55 + i * 0.37);
    g.add(f);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.6, 6, 12), skin);
  th.rotation.set(0, 0.7, Math.PI / 2);
  th.position.set(-0.5, 0, 0.95);
  g.add(th);
  g.scale.setScalar(scale);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

/** The everyday uses the script talks about, each a small 3D scene with the real module in it. */
class Uses {
  readonly group = new THREE.Group();
  readonly scenes: Record<string, THREE.Group> = {};
  private mods: Record<string, SensorModule> = {};
  private parts: Record<string, Record<string, THREE.Object3D>> = {};
  private beams: Record<string, THREE.Mesh> = {};
  private mats: Record<string, THREE.MeshStandardMaterial> = {};
  private glows: Record<string, THREE.Sprite> = {};
  private lights: Record<string, THREE.PointLight> = {};
  readonly focus: Record<string, THREE.Vector3> = {};

  constructor(readonly kind: string) {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), std(0x15171c, 0.85));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    const mk = (name: string) => {
      const g = new THREE.Group();
      g.visible = false;
      this.group.add(g);
      this.scenes[name] = g;
      this.parts[name] = {};
      return g;
    };
    const mod = (name: string, k: string, at: THREE.Vector3, rotY = 0, scale = 1) => {
      const m = new SensorModule(k);
      m.group.position.copy(at);
      m.group.rotation.y = rotY;
      m.group.scale.setScalar(scale);
      this.scenes[name].add(m.group);
      this.mods[name] = m;
      return m;
    };
    if (this.kind === 'ir') {
      // robot car driving at a wall
      const robot = mk('robot');
      const car = new THREE.Group();
      const deck = rbox(7, 0.25, 4.6, 0.3, phys(0x1c2a3a, { roughness: 0.3, clearcoat: 0.8, transmission: 0.2, thickness: 0.2 }));
      deck.position.y = 1.5;
      car.add(deck);
      for (const z of [-2.6, 2.6]) {
        const wheel = cyl(1.3, 0.7, std(0x18191c, 0.8), 40);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(1.2, 1.3, z);
        const hub = cyl(0.55, 0.75, std(0xf2c230, 0.5), 24);
        hub.rotation.x = Math.PI / 2;
        hub.position.copy(wheel.position);
        const motor = rbox(1.8, 0.9, 0.9, 0.1, std(0xf2c230, 0.5));
        motor.position.set(1.2, 1.0, z * 0.62);
        car.add(wheel, hub, motor);
      }
      const caster = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), M.steel);
      caster.position.set(-2.6, 0.45, 0);
      const battery = rbox(2.4, 0.9, 1.4, 0.15, std(0x2b6ad8, 0.45));
      battery.position.set(0.2, 2.1, 0);
      const brain = rbox(2.2, 0.15, 1.7, 0.05, std(0x006570, 0.45));
      brain.position.set(1.9, 1.75, 0);
      car.add(caster, battery, brain);
      robot.add(car);
      this.parts.robot.car = car;
      const m = mod('robot', 'ir', V(-3.6, 1.62, 0), 0, 0.9);
      car.add(m.group);
      const wall = rbox(0.6, 6, 14, 0.1, std(0x8d8a84, 0.75));
      wall.position.set(-14, 3, 0);
      wall.receiveShadow = true;
      robot.add(wall);
      const b = beam(1, 0.12, 1.3, 0xff3b6b);
      b.rotation.z = Math.PI / 2;
      car.add(b);
      this.beams.robot = b;
      this.focus.robot = V(-4, 2.2, 0);
      // automatic tap: faucet over a basin, a hand comes under, water flows
      const tap = mk('tap');
      const basin = rbox(9, 2.2, 7, 0.9, std(0xf1f1ee, 0.25));
      basin.position.set(0, 1.1, 0);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.4, 0.3, 48), std(0xdcdcd8, 0.2));
      bowl.position.set(0, 2.1, 0);
      const spout = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(3.2, 2.2, 0), V(3.2, 6.2, 0), V(2.6, 7.0, 0), V(1.0, 7.0, 0), V(0.6, 6.4, 0)]), 64, 0.38, 24), M.steel);
      tap.add(basin, bowl, spout);
      const tm = mod('tap', 'ir', V(1.25, 6.55, 0), Math.PI, 0.32);
      tm.group.rotation.set(0, 0, Math.PI / 2);
      const water = beam(1, 0.22, 0.32, 0x6fc4ff);
      water.position.set(0.6, 6.2, 0);
      water.rotation.z = Math.PI;
      water.scale.y = 4;
      tap.add(water);
      this.beams.tap = water;
      const hand = makeHand(1);
      tap.add(hand);
      this.parts.tap.hand = hand;
      this.focus.tap = V(0.8, 4.5, 0);
      // lift doors closing; a hand between them makes them open again
      const door = mk('door');
      const frame = rbox(0.6, 9, 9.6, 0.05, M.steel);
      frame.position.set(-0.5, 4.5, 0);
      const inside = rbox(0.2, 8.4, 8.4, 0.05, std(0x2a2d33, 0.6));
      inside.position.set(-0.9, 4.2, 0);
      const left = rbox(0.3, 8.2, 4.1, 0.05, phys(0xb9bec5, { metalness: 0.9, roughness: 0.25 }));
      const right = left.clone();
      door.add(frame, inside, left, right);
      this.parts.door.left = left;
      this.parts.door.right = right;
      const dm = mod('door', 'ir', V(0.2, 4.4, 0), 0, 0.55);
      dm.group.rotation.set(0, Math.PI / 2, Math.PI / 2);
      const dhand = makeHand(0.9);
      door.add(dhand);
      this.parts.door.hand = dhand;
      this.focus.door = V(0.5, 4.3, 0);
    }
    if (this.kind === 'ldr') {
      // street light on a pole; the sky darkens and the lamp switches itself on
      const lamp = mk('lamp');
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ color: lin(0x6aa6e6) }));
      sky.position.set(-20, 12, 0);
      sky.rotation.y = Math.PI / 2;
      this.parts.lamp.sky = sky;
      const pole = cyl(0.3, 14, M.steel, 24);
      pole.position.set(0, 7, 0);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 13.6, 0), V(-1, 14.4, 0), V(-4, 14.4, 0)]), 32, 0.2, 12), M.steel);
      const head = rbox(2.6, 0.5, 1.4, 0.2, std(0x30343a, 0.5));
      head.position.set(-4.4, 14.1, 0);
      this.mats.lamp = emissive(0xffe0a0, 0xdddddd);
      const lens = rbox(2.2, 0.1, 1.0, 0.05, this.mats.lamp);
      lens.position.set(-4.4, 13.83, 0);
      const glow = glowSprite(0xffd890, 2.6);
      glow.position.set(-4.4, 13.5, 0);
      this.glows.lamp = glow;
      const pool = new THREE.PointLight(lin(0xffd890), 0, 30, 1.2);
      pool.position.set(-4.4, 13, 0);
      this.lights.lamp = pool;
      const cone = beam(13, 0.6, 4.5, 0xffd890);
      cone.position.set(-4.4, 13.7, 0);
      cone.rotation.z = Math.PI;
      this.beams.lamp = cone;
      lamp.add(sky, pole, arm, head, lens, glow, pool, cone);
      const lm = mod('lamp', 'ldr', V(0.55, 11.2, 0), 0, 0.9);
      lm.group.rotation.set(0, 0, -Math.PI / 2);
      this.focus.lamp = V(-1.5, 9.5, 0);
    }
    if (this.kind === 'flame') {
      // fire alarm: a candle catches, the module sees it, the buzzer and the red light go off
      const alarm = mk('alarm');
      const table = rbox(16, 0.6, 10, 0.1, std(0x5a3e2b, 0.6));
      table.position.y = 0.3;
      alarm.add(table);
      const am = mod('alarm', 'flame', V(1.5, 0.6, 0), 0, 1.4);
      void am;
      const wax = cyl(0.5, 2.6, std(0xf1e8d6, 0.75), 40);
      wax.position.set(-4, 1.9, 0);
      this.mats.flame = emissive(0xffb050, 0xffffff);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), this.mats.flame);
      flame.position.set(-4, 3.55, 0);
      this.parts.alarm.flame = flame;
      const fg = glowSprite(0xff9a3a, 2.4);
      fg.position.copy(flame.position);
      this.glows.flame = fg;
      const fl = new THREE.PointLight(lin(0xff9a3a), 0, 9, 1.5);
      fl.position.copy(flame.position);
      this.lights.flame = fl;
      const buzzer = cyl(0.7, 0.7, M.black, 32);
      buzzer.position.set(5.5, 0.95, -1.5);
      this.mats.siren = emissive(0xff2020, 0x401010);
      const siren = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.siren);
      siren.position.set(5.5, 0.6, 1.8);
      const sg = glowSprite(0xff2020, 3);
      sg.position.set(5.5, 1.1, 1.8);
      this.glows.siren = sg;
      const ir = beam(1, 0.3, 0.3, 0xff3020);
      const from = flame.position.clone();
      const to = V(1.5 - 1.75 * 1.4, 0.6 + 0.46 * 1.4, 0);
      ir.position.copy(from);
      ir.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize());
      ir.scale.set(1, to.distanceTo(from), 1);
      this.beams.alarm = ir;
      alarm.add(wax, flame, fg, fl, buzzer, siren, sg, ir);
      this.focus.alarm = V(-0.8, 1.8, 0);
    }
    if (this.kind === 'sound') {
      // clap switch: a clap rolls in, the module hears it, the bulb comes on
      const clap = mk('clap');
      const table = rbox(16, 0.6, 10, 0.1, std(0x5a3e2b, 0.6));
      table.position.y = 0.3;
      clap.add(table);
      mod('clap', 'sound', V(0, 0.6, 1.5), 0, 1.4);
      const stand = cyl(0.12, 3.2, M.steel, 16);
      stand.position.set(4, 2.2, -1.5);
      const base = cyl(1.0, 0.25, M.black, 32);
      base.position.set(4, 0.72, -1.5);
      this.mats.bulb = emissive(0xffe6a8, 0xf4f4f4);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), phys(0xffffff, { transmission: 0.6, roughness: 0.1, thickness: 0.5, emissive: lin(0xffe6a8), emissiveIntensity: 0 }));
      bulb.position.set(4, 4.4, -1.5);
      this.parts.clap.bulb = bulb;
      const bg = glowSprite(0xffd890, 5);
      bg.position.copy(bulb.position);
      this.glows.bulb = bg;
      const bl = new THREE.PointLight(lin(0xffd890), 0, 14, 1.4);
      bl.position.copy(bulb.position);
      this.lights.bulb = bl;
      const hands = [makeHand(0.8), makeHand(0.8)];
      hands[0].position.set(-6, 3, 0.4);
      hands[1].position.set(-6, 3, -0.4);
      hands[0].rotation.x = Math.PI / 2;
      hands[1].rotation.x = -Math.PI / 2;
      this.parts.clap.h0 = hands[0];
      this.parts.clap.h1 = hands[1];
      const rings: THREE.Mesh[] = [];
      for (let i = 0; i < 5; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 8, 64), new THREE.MeshBasicMaterial({ color: lin(0x9fdcff), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        r.rotation.y = Math.PI / 2;
        clap.add(r);
        rings.push(r);
        this.parts.clap[`r${i}`] = r;
      }
      clap.add(stand, base, bulb, bg, bl, ...hands);
      this.focus.clap = V(-1.2, 2.6, 0);
    }
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== floor) o.castShadow = o.receiveShadow = true;
    });
  }

  /** Which scenes exist for this module (the ones Claude may ask for). */
  get names() {
    return Object.keys(this.scenes);
  }

  update(name: string, t: number, p: number) {
    for (const [n, g] of Object.entries(this.scenes)) g.visible = n === name;
    const P = this.parts[name];
    const m = this.mods[name];
    if (m) {
      m.pwr.set(1);
      m.t = t;
    }
    const setBeam = (b: THREE.Mesh | undefined, on: number) => {
      if (!b) return;
      const u = (b.material as THREE.ShaderMaterial).uniforms;
      u.on.value = on;
      u.time.value = t;
    };
    if (name === 'robot') {
      const x = lerp(7, -2, outCubic(range(p, 0, 0.6)));
      P.car.position.x = x;
      P.car.rotation.y = 0.9 * smooth(range(p, 0.72, 1));
      const near = clamp(range(p, 0.45, 0.6));
      m.emitter.set(1, 0);
      m.receiver.set(near, 0);
      m.obs.set(near > 0.6 ? 1 : 0);
      const b = this.beams.robot;
      b.position.set(-3.6 - 2.0 * 0.9, 1.62 + 0.46 * 0.9, -0.32);
      b.scale.y = Math.max(0.5, -14 + 0.3 - (x - 5.4));
      setBeam(b, 1);
      m.sync();
    } else if (name === 'tap') {
      const h = outCubic(range(p, 0.05, 0.4));
      P.hand.position.set(lerp(-9, 0.4, h), 4.0, 0.2);
      const on = clamp(range(p, 0.35, 0.45));
      setBeam(this.beams.tap, on);
      m.receiver.set(on, 0);
      m.obs.set(on > 0.5 ? 1 : 0);
      m.sync();
    } else if (name === 'door') {
      const close = smooth(range(p, 0.0, 0.35)) * (1 - smooth(range(p, 0.5, 0.75)));
      const gap = lerp(4.1, 0.35, close);
      P.left.position.set(-0.2, 4.2, -gap / 2 - 2.05);
      P.right.position.set(-0.2, 4.2, gap / 2 + 2.05);
      const hin = outCubic(range(p, 0.3, 0.45));
      P.hand.position.set(lerp(9, 1.2, hin), 4.6, 0);
      m.receiver.set(hin, 0);
      m.obs.set(hin > 0.7 ? 1 : 0);
      m.sync();
    } else if (name === 'lamp') {
      const dark = smooth(range(p, 0.1, 0.55));
      ((P.sky as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(lin(0x6aa6e6)).lerp(lin(0x0b1024), dark);
      const on = dark > 0.6 ? clamp((dark - 0.6) * 5) : 0;
      this.mats.lamp.emissiveIntensity = on * 8;
      this.glows.lamp.material.opacity = on * 0.9;
      this.lights.lamp.intensity = on * 30;
      setBeam(this.beams.lamp, on * 0.22);
      m.receiver.set(1 - dark, 0);
      m.obs.set(on > 0.5 ? 1 : 0);
    } else if (name === 'alarm') {
      const fire = smooth(range(p, 0.08, 0.3));
      const f = 1 + 0.12 * Math.sin(t * 13) + 0.07 * Math.sin(t * 29 + 1);
      P.flame.visible = fire > 0.02;
      P.flame.scale.set(fire, 2.4 * f * fire, fire);
      this.mats.flame.emissiveIntensity = 6;
      this.glows.flame.material.opacity = fire * 0.85 * f;
      this.lights.flame.intensity = fire * 2.2 * f;
      setBeam(this.beams.alarm, fire);
      const alarmOn = fire > 0.7 ? (Math.sin(t * 10) > 0 ? 1 : 0.15) : 0;
      this.mats.siren.emissiveIntensity = alarmOn * 9;
      this.glows.siren.material.opacity = alarmOn * 0.9;
      m.receiver.set(fire, 0);
      m.obs.set(fire > 0.7 ? 1 : 0);
      m.sync();
    } else if (name === 'clap') {
      const c = range(p, 0.1, 0.3);
      const apart = 0.4 + 0.5 * Math.abs(Math.cos(c * Math.PI * 3));
      (P.h0 as THREE.Object3D).position.z = apart;
      (P.h1 as THREE.Object3D).position.z = -apart;
      const loud = c > 0.15 ? 1 : 0;
      for (let i = 0; i < 5; i++) {
        const r = P[`r${i}`] as THREE.Mesh;
        const u = (t * 0.8 + i / 5) % 1;
        r.position.set(-5.5 + u * 5.2, 2.6 - u * 1.4, 0.8);
        r.scale.setScalar(0.5 + u);
        (r.material as THREE.MeshBasicMaterial).opacity = loud * (1 - u) * 0.9 * (p < 0.7 ? 1 : 0);
      }
      const on = p > 0.35 ? 1 : 0;
      ((P.bulb as THREE.Mesh).material as THREE.MeshPhysicalMaterial).emissiveIntensity = on * 6;
      this.glows.bulb.material.opacity = on * 0.9;
      this.lights.bulb.intensity = on * 12;
      m.receiver.set(loud, 0, t);
      m.obs.set(on);
    }
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
  readonly module: SensorModule;
  private lGlow = glowSprite(0xffa040, 0.9);
  private pulses: THREE.Mesh[] = [];
  private outCurve!: THREE.CatmullRomCurve3;
  readonly moduleFocus = V(0.9, 0.4, 3.2);
  readonly unoFocus = V(0.6, 0.5, -1.4);

  constructor(kind: string) {
    this.module = new SensorModule(kind);
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
    // real parts from the KiCad library where they loaded: pin 1 at (x, y) mm on the board, rotated about Y
    const real = (name: string, x: number, y: number, rot = 0, over: Record<string, THREE.Material> = {}) => {
      const k = kmesh(name, over);
      if (!k) return false;
      k.position.copy(U(x, y));
      k.rotation.y = rot;
      uno.add(k);
      return true;
    };
    // ATmega328P in its socket (the row runs along +x)
    if (!(real('DIP-28_W7.62mm_Socket', 31.5, 41.2, Math.PI / 2) && real('DIP-28_W7.62mm', 31.5, 41.2, Math.PI / 2)))
      put(rbox(3.56, 0.35, 0.76, 0.03, M.black), 30, 33.6, 35.6, 7.6, 0.35);
    // female headers: digital 10 + 8 on the top edge, power 8 + analog 6 on the bottom edge
    const sockets: [string, number, number, number, number, number][] = [
      ['PinSocket_1x10_P2.54mm_Vertical', 17.9, 2.05, 16.6, 26, 0.6],
      ['PinSocket_1x08_P2.54mm_Vertical', 44.5, 2.05, 43.2, 20.6, 0.6],
      ['PinSocket_1x08_P2.54mm_Vertical', 27.9, 51.35, 26.6, 20.6, 49.9],
      ['PinSocket_1x06_P2.54mm_Vertical', 50.8, 51.35, 49.5, 15.5, 49.9],
    ];
    for (const [name, x, y, bx, bw, by] of sockets)
      if (!real(name, x, y, Math.PI / 2)) put(rbox(bw / 10, 0.85, 0.25, 0.02, M.black), bx, by, bw, 2.5, 0.85);
    real('Crystal_HC49-4H_Vertical', 20.5, 26.9);
    real('SW_PUSH_6mm', 1.8, 1.8);
    real('CP_Radial_D6.3mm_P2.50mm', 15.0, 44.0);
    real('CP_Radial_D6.3mm_P2.50mm', 21.5, 44.0);
    real('SOT-223', 10.7, 34.2);
    real('TQFP-32_7x7mm_P0.8mm', 16.2, 13.8, Math.PI / 4);
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
    // VCC -> 5V, GND -> GND, OUT/DO -> D2, AO -> A0
    const ends = [hdrTop(38.06, 51.2), hdrTop(40.6, 51.2), hdrTop(57.2, 1.9), hdrTop(50.8, 51.2)];
    const colors = [0xd8322a, 0x1a1a1a, 0xf2c230, 0x2fae5a];
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
uniform float near; uniform float far; uniform float focus; uniform float scale; uniform float maxBlur; uniform float exposure; uniform float radStep;
varying vec2 vUv;
float linZ(float d) { return near * far / (far - d * (far - near)); }
float coc(float z) { return clamp(abs(1.0 / focus - 1.0 / z) * scale, 0.0, 1.0) * maxBlur; }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
uniform vec3 bgA; uniform vec3 bgB;
vec3 bg(vec2 uv) {
  vec2 c = (uv - vec2(0.5, 0.52)) * vec2(1.0, 0.62);
  return mix(bgA, bgB, smoothstep(0.0, 0.62, length(c)));
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
    radius += radStep / radius;
  }
  vec3 col = aces(acc / tot * exposure);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

// ---------- the director ----------

const PART_LABEL: Record<string, string> = {
  sensor: 'IR pair',
  emitter: 'IR LED 940 nm',
  receiver: 'IR photodiode',
  chip: 'LM393 comparator',
  pot: 'Sensitivity pot',
  pins: 'VCC GND OUT',
  leds: 'PWR + OBS LEDs',
};

function partLabel(kind: string, part: string) {
  if (part === 'sensor' || (part === 'receiver' && kind !== 'ir'))
    return ({ ir: 'IR pair', ldr: 'LDR  CdS cell', flame: 'IR flame sensor', sound: 'Electret mic' } as Record<string, string>)[kind] ?? PART_LABEL.sensor;
  if (part === 'pins') return kind === 'ir' ? 'VCC GND OUT' : 'VCC GND DO AO';
  if (part === 'leds') return kind === 'ir' ? 'PWR + OBS LEDs' : 'PWR + DO LEDs';
  return PART_LABEL[part] ?? part;
}

/** a look per video, picked from the plan: background tone, rim light and the headline's key colour */
const THEMES = [
  { a: [0.034, 0.037, 0.046], b: [0.008, 0.009, 0.012], rim: 0x9cc4ff, hot: '#ff6a2b' },
  { a: [0.02, 0.045, 0.05], b: [0.004, 0.012, 0.014], rim: 0x7fffe0, hot: '#ffd23f' },
  { a: [0.05, 0.035, 0.03], b: [0.012, 0.008, 0.007], rim: 0xffc48a, hot: '#3fd0ff' },
  { a: [0.04, 0.028, 0.055], b: [0.01, 0.006, 0.016], rim: 0xd4a8ff, hot: '#ff4fa3' },
  { a: [0.028, 0.04, 0.03], b: [0.006, 0.01, 0.007], rim: 0xb8ffb0, hot: '#ff8a3d' },
];

const DEFAULT_SHOTS = ['assemble', 'hero', 'macro', 'beam', 'layers', 'inside', 'compare', 'pot', 'wiring', 'hero'];

export class Studio {
  private built = false;
  private set!: { module: THREE.Group; lattice: THREE.Group; compare: THREE.Group; bench: THREE.Group; membrane: THREE.Group; uses: THREE.Group };
  private mod!: SensorModule;
  private kind = 'ir';
  private props!: Props;
  private membrane!: Membrane;
  private uses!: Uses;
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
  private callouts: { at: THREE.Vector3; text: string; side: number }[] = [];
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
    SHADOW_TEX = canvasTex(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
    SHADOW_TEX.colorSpace = THREE.NoColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(r);
    this.three.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.three.environmentIntensity = 0.28;
    this.three.background = null;

    this.key = new THREE.DirectionalLight(lin(0xfff1e4), 2.8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 4;
    // one look per video (the same plan always gets the same look)
    const seed = [...JSON.stringify(this.plan.shots.map((x) => x.text ?? ''))].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const theme = THEMES[seed % THEMES.length];
    HOT = theme.hot;
    const rim = new THREE.DirectionalLight(lin(theme.rim), 1.6);
    rim.position.set(-6, 4, -7);
    const fill = new THREE.DirectionalLight(lin(0xffffff), 0.35);
    fill.position.set(-4, 2, 6);
    this.three.add(this.key, this.key.target, rim, fill);

    const module = new THREE.Group();
    this.kind = MODULE_KINDS.includes(this.plan.module) ? this.plan.module : 'ir';
    this.mod = new SensorModule(this.kind);
    module.add(this.mod.group);
    this.props = new Props(this.mod.anchors.sensor.clone());
    module.add(this.props.lamp, this.props.candle, this.props.speaker);
    this.beamOut = beam(9, 0.12, 1.1, 0xff3b6b);
    this.beamOut.rotation.z = Math.PI / 2;
    this.beamOut.position.copy(this.mod.anchors.emitTip);
    this.beamBack = beam(1, 0.5, 0.1, 0xff3b6b);
    this.wall = rbox(0.3, 2.2, 2.6, 0.08, std(0x9a968f, 0.7));
    this.wall.castShadow = this.wall.receiveShadow = true;
    module.add(this.beamOut, this.beamBack, this.wall);
    this.lattice = new Lattice();
    this.comparator = new Comparator();
    this.bench = new Bench(this.kind);
    this.membrane = new Membrane();
    this.uses = new Uses(this.kind);
    this.set = { module, lattice: this.lattice.group, compare: this.comparator.group, bench: this.bench.group, membrane: this.membrane.group, uses: this.uses.group };
    for (const g of Object.values(this.set)) {
      g.visible = false;
      this.three.add(g);
    }

    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: LITE ? 2 : 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
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
        radStep: { value: LITE ? 3.2 : 1.25 },
        bgA: { value: new THREE.Vector3(...theme.a) },
        bgB: { value: new THREE.Vector3(...theme.b) },
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
    m.layers(false);
    m.t = t;
    this.props.hide();
    this.callouts = [];
    const callout = (part: string, text?: string, side = 1) => {
      const at = part === 'chip' ? A.chip : part === 'pot' ? A.pot.clone().add(V(0, 0.05, 0)) : A[part] ?? A.board;
      this.callouts.push({ at: at.clone(), text: (text || partLabel(this.kind, part)).toUpperCase(), side });
    };
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
        const close = this.kind === 'sound' && (part === 'sensor' || part === 'receiver') ? 2.1 : part === 'emitter' || part === 'receiver' ? 1.35 : 1;
        this.rig(A[part], az, lerp(0.42, 0.3, p), lerp(3.6, 3.0, inOutCubic(p)) * close, 24);
        if (part === 'emitter' || part === 'sensor') m.emitter.set(1, 0);
        if (part === 'sensor') {
          if (this.kind === 'ir') {
            callout('emitter', 'IR LED', -1);
            callout('receiver', sh.label || PART_LABEL.receiver, 1);
          } else callout('sensor', sh.label, dir);
        } else callout(part, sh.label, dir);
        if (part === 'leds') m.obs.set(p > 0.5 ? 1 : 0);
        this.scale = 9;
        break;
      }
      case 'layers': {
        const led = sh.part === 'emitter' ? m.emitter : m.receiver;
        const ex = outCubic(range(p, 0.08, 0.6));
        m.layers(true);
        led.set(sh.part === 'emitter' ? 0.6 : 0.3 * ex, ex);
        const anchor = (sh.part === 'emitter' ? A.emitter : A.receiver).clone().add(V(-0.25 - 0.6 * ex, 0, 0));
        if (this.kind === 'ldr' || this.kind === 'sound') this.rig(anchor, -Math.PI / 2 + 1.0 * dir, 0.3, lerp(4.6, 6.2, ex) * (this.kind === 'sound' ? 1.3 : 1), 24);
        else this.rig(anchor, Math.PI / 2 - 0.3 * dir, 0.95, lerp(5.2, 6.4, ex), 24);
        this.scale = 8;
        break;
      }
      case 'explode': {
        // exploded view: every part floats above the board, each one named
        const e = smooth(range(p, 0.05, 0.45));
        m.lift(e);
        m.emitter.set(0, 0);
        this.rig(V(-0.2, 0.9 * e + 0.3, 0), 0.5 * dir + 0.35 * p * dir, 0.5, lerp(11, 12.5, e), 28);
        this.set.module.updateMatrixWorld(true);
        const named = (k: string, side: number) => {
          const o = m.named[k];
          if (o) this.callouts.push({ at: o.getWorldPosition(V()).add(V(0, 0.3, 0)), text: partLabel(this.kind, k).toUpperCase(), side });
        };
        if (e > 0.6) {
          named('emitter', -1);
          named('receiver', -1);
          named('chip', 1);
          named('pot', 1);
          named('pins', 1);
        }
        this.scale = 4;
        break;
      }
      case 'beam': {
        if (this.kind !== 'ir') {
          const want = this.kind === 'ldr' ? sh.light : this.kind === 'flame' ? (sh as Shot & { fire?: boolean }).fire : (sh as Shot & { loud?: boolean }).loud;
          const on = want === false ? 0 : smooth(range(p, 0.08, 0.35));
          if (this.kind === 'ldr') this.props.light(t, on);
          else if (this.kind === 'flame') this.props.fire(t, on);
          else this.props.sound(t, on);
          const hit = this.kind === 'sound' ? on * (Math.sin(t * 9) > 0 ? 1 : 0) : on;
          m.receiver.set(on, 0, t);
          m.obs.set(hit > 0.5 ? 1 : 0);
          // from the side, so the lamp / candle / speaker and the module share the frame
          const prop = this.kind === 'ldr' ? V(-2.1, 2.3, 0) : this.kind === 'flame' ? V(-3.2, 1.55 - A.sensor.y, 0) : V(-4.2, 0.3, 0);
          const mid = A.sensor.clone().addScaledVector(prop, 0.5);
          this.rig(mid, 0.6 * dir + 0.1 * p, 0.22, this.kind === 'sound' ? 14 : 12.5, 28);
          this.focusDist = this.camera.position.distanceTo(A.sensor);
          this.scale = 4;
          shadowBox = 8;
          break;
        }
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
        if (this.kind === 'sound') {
          this.membrane.group.visible = true;
          this.membrane.update(t, sh.light === false ? 0 : smooth(range(p, 0.12, 0.4)));
          this.rig(this.membrane.focus, 0.75 * dir + 0.25 * p * dir, 0.35, lerp(9.5, 8.6, p), 28);
          this.scale = 5;
          shadowBox = 5;
          break;
        }
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
      case 'scene': {
        // the everyday use the line talks about
        const names = this.uses.names;
        const name = names.includes(sh.use ?? '') ? sh.use! : names[idx % names.length];
        this.set.module.visible = false;
        this.uses.group.visible = true;
        this.uses.update(name, t, p);
        const f = this.uses.focus[name];
        const wide = ({ lamp: 28, robot: 34, tap: 20, door: 26, alarm: 25, clap: 25 } as Record<string, number>)[name] ?? 22;
        this.rig(f, 0.75 * dir + 0.25 * p * dir, name === 'lamp' ? 0.12 : 0.3, lerp(wide, wide * 0.9, p), 30);
        this.scale = 3;
        shadowBox = 16;
        break;
      }
      case 'uno':
      case 'code': {
        // close on the Arduino: the pin the module is wired to (uno), or the code running on it (code, drawn in 2D)
        this.set.module.visible = false;
        this.bench.group.visible = true;
        this.bench.update(t, sh.detect === false ? 0 : p > 0.4 ? 1 : 0);
        const pins: Record<string, [number, number]> = { D2: [57.2, 2.05], '5V': [38.06, 51.35], GND: [40.6, 51.35], A0: [50.8, 51.35] };
        const [px, py] = pins[(sh.pin || 'D2').toUpperCase()] ?? pins.D2;
        const at = V((px - BOARD_W / 2) / 10, 1.0, (py - BOARD_H / 2) / 10 - 1.5);
        if (sh.shot === 'uno') {
          this.rig(at, 0.6 * dir + 0.2 * p, 0.75, lerp(5.5, 4.6, p), 24);
          this.callouts.push({ at: at.clone(), text: `PIN ${(sh.pin || 'D2').toUpperCase()}`, side: dir });
          this.scale = 8;
        } else {
          this.rig(V(0, 0.6, -1.5), 0.3 + 0.15 * p, 1.0, 13, 28);
          this.scale = 4;
        }
        shadowBox = 10;
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
    m.sync();
    this.bench.module.sync();
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

  /** The channel's story captions: big headline words for the shot, the *key* word in orange (the subtitle line
   *  is drawn by the plate), plus part-name callouts. */
  captions(ctx: Ctx, t: number, lines: StudioLine[], idx: number) {
    const L = lines[idx];
    if (!L) return;
    const next = lines[idx + 1];
    const p = clamp((t - L.start) / Math.max(0.6, (next ? next.start : L.end + 0.6) - L.start));
    const sh = this.shotAt(idx);
    const text = sh.text || L.text.replace(/\*/g, '').split(/\s+/).slice(0, 3).join(' ');
    headline(ctx, text, p);
    if (sh.shot === 'code') codePanel(ctx, sh.code?.length ? sh.code : DEFAULT_CODE[this.kind] ?? DEFAULT_CODE.ir, p);
    // lay the labels out per side, top to bottom, at least 84 px apart so they never overlap
    const placed = this.callouts.map((c) => {
      const v = c.at.clone().project(this.camera);
      return { ...c, x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, ly: 0 };
    });
    for (const side of [-1, 1]) {
      const col = placed.filter((c) => c.side === side).sort((a, b) => a.y - b.y);
      let prev = 420 - 84;
      for (const c of col) prev = c.ly = Math.max(clamp(c.y - 170, 420, H - 420), prev + 84);
    }
    for (const c of placed) this.callout(ctx, c.x, c.y, c.ly, c.text, c.side, p);
  }

  private callout(ctx: Ctx, x: number, y: number, ly: number, text: string, side: number, p: number) {
    const a = outCubic(clamp((p - 0.12) * 4));
    if (a <= 0) return;
    const lx = clamp(x + side * 230, 150, W - 150);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.moveTo(x + Math.sign(lx - x) * 9, y);
    ctx.lineTo(lerp(x, lx, a), lerp(y, ly, a));
    ctx.stroke();
    ctx.font = '600 32px "IBM Plex Mono", Consolas, monospace';
    const w = ctx.measureText(text).width + 36;
    const bx = clamp(side > 0 ? lx : lx - w, 24, W - w - 24);
    ctx.fillStyle = 'rgba(10,12,16,0.78)';
    ctx.beginPath();
    ctx.roundRect(bx, ly - 30, w, 60, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 18, ly + 2);
    ctx.restore();
  }
}

const DEFAULT_CODE: Record<string, string[]> = {
  ir: ['void loop() {', '  int obstacle = digitalRead(2);', '  if (obstacle == LOW)', '    stopMotors();', '}'],
  ldr: ['void loop() {', '  int dark = digitalRead(2);', '  digitalWrite(13, dark);', '  int light = analogRead(A0);', '}'],
  flame: ['void loop() {', '  if (digitalRead(2) == LOW)', '    digitalWrite(BUZZER, HIGH);', '}'],
  sound: ['bool on = false;', 'void loop() {', '  if (digitalRead(2) == HIGH)', '    on = !on;  // clap!', '  digitalWrite(13, on);', '}'],
};

/** An Arduino IDE-style code panel; the running line is highlighted. */
function codePanel(ctx: Ctx, code: string[], p: number) {
  const lines = code.slice(0, 7);
  const a = outCubic(clamp(p * 4));
  const x = 70;
  const y = 560;
  const w = W - 140;
  const lh = 58;
  const h = 90 + lines.length * lh;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - a) * 40);
  ctx.fillStyle = 'rgba(12,16,22,0.9)';
  ctx.strokeStyle = 'rgba(0,151,156,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#00979c';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 52, [22, 22, 0, 0]);
  ctx.fill();
  ctx.font = '600 28px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('sketch.ino', x + 28, y + 35);
  const cur = Math.min(lines.length - 1, Math.floor(p * lines.length * 1.1));
  ctx.font = '500 34px "IBM Plex Mono", monospace';
  lines.forEach((l, i) => {
    const ly = y + 100 + i * lh;
    if (i === cur) {
      ctx.fillStyle = 'rgba(255,106,43,0.18)';
      ctx.fillRect(x + 8, ly - 40, w - 16, lh - 4);
    }
    ctx.fillStyle = '#5c6370';
    ctx.fillText(String(i + 1).padStart(2), x + 22, ly);
    // a light touch of syntax colour
    let cx = x + 90;
    for (const tok of l.split(/(\b(?:void|int|bool|if|else|return|true|false|HIGH|LOW)\b|\/\/.*$|\d+)/)) {
      if (!tok) continue;
      ctx.fillStyle = /^\/\//.test(tok) ? '#7f8c98' : /^(void|int|bool|if|else|return)$/.test(tok) ? '#00b5bb' : /^(true|false|HIGH|LOW)$/.test(tok) ? '#ffb347' : /^\d+$/.test(tok) ? '#f07178' : '#e6edf3';
      ctx.fillText(tok, cx, ly);
      cx += ctx.measureText(tok).width;
    }
  });
  ctx.restore();
}

let HOT = '#ff6a2b';
const LINE = '#f1ece2';
/** Big kinetic headline words, word by word, the *key* word in orange with a glow (story-lib.js style). */
function headline(ctx: Ctx, text: string, p: number, y = 300, size = 104, maxW = 960) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const font = (s: number) => `900 ${s}px Archivo, "Segoe UI", sans-serif`;
  ctx.save();
  ctx.font = font(size);
  while (size > 48 && Math.max(...words.map((w) => ctx.measureText(w.replace(/\*/g, '')).width)) > maxW) ctx.font = font((size -= 6));
  let rows: string[][];
  for (;;) {
    rows = [];
    let cur: string[] = [];
    for (const w of words) {
      const test = [...cur, w].join(' ').replace(/\*/g, '');
      if (cur.length && ctx.measureText(test).width > maxW) {
        rows.push(cur);
        cur = [w];
      } else cur.push(w);
    }
    if (cur.length) rows.push(cur);
    if (rows.length <= 2 || size <= 60) break;
    ctx.font = font((size -= 6));
  }
  // a soft dark band behind the words so they read over any shot
  const g = ctx.createLinearGradient(0, y - size * 1.6, 0, y + rows.length * size * 1.1 + size * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y - size * 1.6, W, rows.length * size * 1.1 + size * 2.2);
  let k = 0;
  rows.forEach((row, ri) => {
    const plain = row.map((w) => w.replace(/\*/g, ''));
    const widths = plain.map((w) => ctx.measureText(w + ' ').width);
    let x = W / 2 - (widths.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width) / 2;
    const yy = y + ri * size * 1.08;
    row.forEach((w, wi) => {
      const a = outCubic(clamp((p - k * 0.06) * 4));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(0, (1 - a) * 40);
      const key = w.includes('*');
      ctx.fillStyle = key ? HOT : LINE;
      ctx.shadowColor = key ? HOT : 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = key ? 28 : 16;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(plain[wi], x, yy);
      ctx.restore();
      x += widths[wi];
      k++;
    });
  });
  ctx.restore();
}
