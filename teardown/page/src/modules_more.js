// 91 more sensor modules for the teardown act: new layered part types (MORE_TOWERS), board extras (moreExtra) and the
// module definitions (MORE_KINDS). Shapes are models from typical datasheet sizes (mm); the film says "3D model" on screen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = sh(new THREE.Mesh(g, m)); o.position.set(x, y, z); return o; };
const box = (w, h, d, m, x = 0, y = 0, z = 0, r = 0) => mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const cyl = (r, h, m, x = 0, y = 0, z = 0, seg = 40) => mesh(new THREE.CylinderGeometry(r, r, h, seg), m, x, y + h / 2, z);
const lathe = (pts, m, y = 0, seg = 64) => mesh(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg), m, 0, y, 0);
const mat = (o) => new THREE.MeshPhysicalMaterial(o);
const C = {
  copper: () => mat({ color: '#d0864f', roughness: .3, metalness: 1 }),
  green: () => mat({ color: '#1f6b3c', roughness: .5, clearcoat: .2 }),
  red: () => mat({ color: '#b0282a', roughness: .5, clearcoat: .2 }),
  purple: () => mat({ color: '#4b2a7a', roughness: .5, clearcoat: .2 }),
  yellow: () => mat({ color: '#e0b43a', roughness: .5 }),
  white: () => mat({ color: '#efefea', roughness: .45 }),
  grey: () => mat({ color: '#8a8f97', roughness: .45, metalness: .3 }),
  rubber: () => mat({ color: '#18191b', roughness: .9 }),
  terminal: () => mat({ color: '#2f8f4a', roughness: .55 }),
  film: () => mat({ color: '#d9c88a', roughness: .35, transmission: .4, thickness: .3, transparent: true, opacity: .85 }),
  ferrite: () => mat({ color: '#3b3d42', roughness: .7 }),
  orange: () => mat({ color: '#e07a2c', roughness: .5 }),
};
const L = () => { const layers = []; const add = (name, ...objs) => { const g = new THREE.Group(); objs.forEach((o) => g.add(o)); layers.push({ name, obj: g }); return g; }; return { layers, add }; };

// ---------- part types: each returns { layers, key, h, r, spacing } ----------
export const MORE_TOWERS = {
  ic(M, o = {}) {   // a sensor IC: lead frame, the silicon die (the actual sensor), the package
    const s = o.s || 4, { layers, add } = L();
    add('Lead frame', box(s + 1.2, .1, s + 1.2, M.gold));
    add(o.die || 'Silicon die', box(s * .5, .3, s * .5, M.die, 0, .3));
    add(o.pkg || 'Package', box(s, 1, s, M.mold, 0, .2, 0, .1), ...(o.window ? [box(s * .4, .05, s * .4, M.clear, 0, 1.22)] : []));
    return { layers, key: 1, h: 1.4, r: s * .8, spacing: [3, 9, 17] };
  },
  tof(M, o = {}) {   // laser / optical window package (VL53L0X, APDS-9960, MAX30102, AMG8833)
    const { layers, add } = L(), w = o.w || 4.4;
    add('Base', box(w, .6, 2.4, M.mold));
    const em = box(.6, .2, .6, M.die, -w * .22, .6), rx = box(1.1, .2, 1.1, M.die, w * .2, .6);
    add(o.die || 'Emitter + sensor', em, rx);
    add(o.lens || 'Glass window', box(w, .4, 2.4, M.clear, 0, .9), cyl(.5, .25, M.blackEpoxy, -w * .22, 1.3), cyl(.7, .25, M.blackEpoxy, w * .2, 1.3));
    return { layers, key: 1, h: 1.6, r: w * .6, spacing: [3, 9, 17] };
  },
  color(M) {   // colour sensor: photodiode grid with RGB filters + lens, white LEDs on the board
    const { layers, add } = L();
    add('Base', box(4, .6, 4, M.mold));
    const g = new THREE.Group(); const cols = ['#e04040', '#40c060', '#4070e0', '#dddddd'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.add(box(.7, .15, .7, mat({ color: cols[(i + j) % 4], roughness: .3, emissive: cols[(i + j) % 4], emissiveIntensity: .25 }), -1.1 + i * .75, .6, -1.1 + j * .75));
    add('RGB photodiodes', g);
    add('Lens', cyl(1.8, .8, M.clear, 0, .9));
    return { layers, key: 1, h: 1.8, r: 2.5, spacing: [3, 9, 17] };
  },
  antenna(M) {   // microwave radar: RF chip + copper patch / loop antenna etched on a board layer
    const { layers, add } = L(), cu = C.copper(), g = new THREE.Group();
    add('RF chip', box(3, .9, 3, M.mold, 0, 0));
    for (let i = 0; i < 6; i++) g.add(box(.4, .05, 8, cu, -3 + i * 1.2, 1.6), box(1.2, .05, .4, cu, -2.4 + i * 1.2, 1.6, i % 2 ? 4 : -4));
    add('Antenna (copper)', g);
    return { layers, key: 1, h: 2, r: 5, spacing: [3, 12] };
  },
  probe(M, o = {}) {   // waterproof steel probe: sensor chip inside a sleeve, cable on top
    const { layers, add } = L();
    add(o.die || 'Sensor chip', box(1.2, 2, .8, M.mold, 0, 0), ...[-.4, 0, .4].map((x) => box(.15, 1.5, .15, M.tin, x, -1.4)));
    add(o.pkg || 'Steel sleeve', lathe([[0, 0], [3, 0], [3, 22], [0, 22]], o.glass ? M.clear : M.alu));
    add('Cable', cyl(1.6, 6, M.rubber || C.rubber(), 0, 22));
    return { layers, key: 0, h: 28, r: 3, spacing: [6, 14, 44] };
  },
  to92(M, o = {}) {   // TO-92 sensor (LM35, Hall A3144, SS49E, NTC bead)
    const { layers, add } = L();
    add('Legs', ...[-1.27, 0, 1.27].map((x) => box(.4, 3.5, .4, M.tin, x, 0)));
    add(o.die || 'Sensor die', box(1.2, .3, 1.2, M.die, 0, 4.4));
    add(o.pkg || 'Plastic body', mesh(new THREE.CylinderGeometry(2.4, 2.4, 4.6, 32, 1, false, 0, Math.PI), M.mold, 0, 5.8, 0));
    return { layers, key: 1, h: 8.2, r: 2.4, spacing: [3, 10, 20] };
  },
  tilt(M, o = {}) {   // tilt / vibration switch can with metal balls or a spring
    const { layers, add } = L();
    add('Pins', box(.5, 3, .5, M.tin, -1, 0), box(.5, 3, .5, M.tin, 1, 0));
    const b = new THREE.Group(); if (o.spring) for (let i = 0; i < 8; i++) b.add(mesh(new THREE.TorusGeometry(1.2, .15, 8, 24), M.tin, 0, 4 + i * .5, 0).rotateX(Math.PI / 2));
    else b.add(mesh(new THREE.SphereGeometry(1, 20, 14), M.tin, 0, 4.2, .1), mesh(new THREE.SphereGeometry(1, 20, 14), M.tin, 0, 6.2, -.1));
    add(o.spring ? 'Spring contact' : 'Metal balls', b);
    add('Can', lathe([[2.4, 0], [2.6, 0], [2.6, 8], [0, 8]], M.alu, 3));
    return { layers, key: 1, h: 11, r: 2.6, spacing: [3, 12, 24] };
  },
  reed(M) {   // reed switch: two blades in a glass tube, lying down
    const { layers, add } = L(), g = new THREE.Group();
    g.add(box(9, .2, .6, M.tin, -3, 1.9), box(9, .2, .6, M.tin, 3, 2.1));
    add('Reed blades', g);
    const t = mesh(new THREE.CylinderGeometry(1.4, 1.4, 16, 24), M.clear, 0, 2, 0); t.rotation.z = Math.PI / 2; add('Glass tube', t);
    return { layers, key: 0, h: 4, r: 8, spacing: [6, 14] };
  },
  loadcell(M) {   // bar load cell: aluminium bar, strain gauges glued on top, silicone cover
    const { layers, add } = L(), alu = M.alu;
    add('Aluminium bar', box(60, 12.7, 12.7, alu, -18, 0));
    add('Strain gauge', box(6, .1, 5, C.copper(), -18, 12.8), box(6, .1, 5, C.copper(), -12, 12.8));
    add('Silicone cover', box(16, 1.6, 9, C.white(), -15, 12.9, 0, .6));
    return { layers, key: 1, h: 14, r: 10, spacing: [4, 16, 28] };
  },
  film(M, o = {}) {   // force / flex / thin-film / membrane: layered films with printed contacts
    const { layers, add } = L(), w = o.w || 14, d = o.d || 14, g = new THREE.Group();
    add('Bottom film', box(w, .15, d, C.film(), 0, 0));
    for (let i = 0; i < 9; i++) g.add(box(w * .8, .05, .25, M.gold, 0, .2, -d * .35 + i * d * .7 / 8));
    if (o.ink) g.add(box(w * .85, .06, d * .85, mat({ color: '#2a2a2a', roughness: .8 }), 0, .26));
    add(o.die || 'Printed contacts', g);
    add('Top film', box(w, .15, d, C.film(), 0, .4));
    return { layers, key: 1, h: 1, r: Math.max(w, d) * .55, spacing: [3, 10, 18] };
  },
  knob(M, o = {}) {   // rotary encoder / joystick: contacts, metal body + shaft, cap
    const { layers, add } = L();
    add(o.die || 'Contacts', box(8, 1, 8, M.mold, 0, 0), ...[-2.5, 0, 2.5].map((x) => box(.5, .2, 2, M.gold, x, 1)));
    add('Body + shaft', box(10, 5, 10, M.alu, 0, 1.2, 0, .3), cyl(1.6, 8, M.alu, 0, 6.2));
    add('Cap', cyl(o.joy ? 6 : 3.2, o.joy ? 3 : 6, o.joy ? M.mold : M.mold, 0, 12));
    return { layers, key: 0, h: 16, r: o.joy ? 6 : 5, spacing: [3, 12, 26] };
  },
  keypad(M) {   // membrane keypad: bottom traces, spacer, printed key film
    const { layers, add } = L(), g = new THREE.Group();
    add('Bottom traces', box(40, .2, 44, C.film()), ...[-12, -4, 4, 12].map((x) => box(.6, .05, 40, M.gold, x, .2)));
    add('Spacer', box(40, .2, 44, C.white(), 0, .5));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.add(box(7, .4, 7, C.grey(), -15 + i * 10, .9, -15 + j * 10, .3));
    add('Key film', box(40, .2, 44, M.mold, 0, .7), g);
    return { layers, key: 0, h: 1.4, r: 22, spacing: [4, 12, 22] };
  },
  turbine(M) {   // water flow sensor: hall chip, rotor with a magnet, pipe housing
    const { layers, add } = L(), g = new THREE.Group();
    add('Hall chip', box(3, 1.2, 2, M.mold, 0, 0));
    for (let i = 0; i < 6; i++) { const b = box(.6, 7, 9, C.white(), 0, 6); b.rotation.y = i * Math.PI / 6; g.add(b); }
    g.add(cyl(1.5, 9, C.red(), 0, 5));
    add('Rotor + magnet', g);
    const p = mesh(new THREE.CylinderGeometry(7, 7, 30, 32, 1, true), mat({ color: '#222326', roughness: .5, transparent: true, opacity: .55, side: THREE.DoubleSide }), 0, 9.5, 0); p.rotation.z = Math.PI / 2;
    add('Pipe housing', p);
    return { layers, key: 1, h: 17, r: 9, spacing: [4, 16, 34] };
  },
  float(M) {   // float switch: reed stem, float ring with a magnet
    const { layers, add } = L();
    add('Reed stem', cyl(1.6, 26, M.alu, 0, 0));
    add('Float + magnet', mesh(new THREE.TorusGeometry(6, 3, 16, 32), C.white(), 0, 14, 0).rotateX(Math.PI / 2));
    return { layers, key: 1, h: 26, r: 9, spacing: [6, 20] };
  },
  camera(M) {   // camera: image sensor, lens holder, lens
    const { layers, add } = L();
    add('Image sensor', box(6, .6, 6, M.mold), box(3.5, .1, 3.5, mat({ color: '#6a4bb0', roughness: .2, metalness: .6 }), 0, .6));
    add('Lens holder', box(8, 5, 8, M.mold, 0, .8, 0, .4));
    add('Lens', cyl(3, 4, M.mold, 0, 5.8), cyl(2.2, .1, M.clear, 0, 9.8));
    return { layers, key: 0, h: 10, r: 5, spacing: [3, 12, 24] };
  },
  patch(M) {   // GPS ceramic patch antenna + shield can
    const { layers, add } = L();
    add('Shield can', box(12, 2.2, 12, M.alu, 0, 0, 0, .2));
    add('Ceramic patch', box(25, 4, 25, mat({ color: '#c9a173', roughness: .6 }), 0, 0), box(18, .1, 18, M.tin, 0, 4), cyl(.8, .4, M.tin, 2, 4.1, 2));
    return { layers, key: 1, h: 4.5, r: 14, spacing: [4, 14] };
  },
  coil(M, o = {}) {   // RFID / NFC / metal detector / energy meter coil: copper loop on ferrite
    const { layers, add } = L(), cu = C.copper(), g = new THREE.Group(), w = o.w || 30, d = o.d || 22;
    add('Ferrite / board', box(w + 4, .6, d + 4, C.ferrite()));
    for (let k = 0; k < 4; k++) { const ww = w - k * 2.4, dd = d - k * 2.4; g.add(box(ww, .08, .5, cu, 0, .7, -dd / 2), box(ww, .08, .5, cu, 0, .7, dd / 2), box(.5, .08, dd, cu, -ww / 2, .7), box(.5, .08, dd, cu, ww / 2, .7)); }
    add(o.die || 'Copper coil', g);
    return { layers, key: 1, h: 1, r: Math.max(w, d) * .6, spacing: [4, 14] };
  },
  fingerprint(M) {   // optical fingerprint: image sensor, glass prism, housing
    const { layers, add } = L();
    add('Image sensor', box(8, .6, 8, M.mold), box(4, .1, 4, mat({ color: '#6a4bb0', roughness: .2, metalness: .6 }), 0, .6));
    add('Glass prism', box(14, 6, 18, M.clear, 0, 1));
    add('Housing', box(20, 4, 24, M.mold, 0, 7, 0, .8));
    return { layers, key: 1, h: 11, r: 12, spacing: [3, 12, 26] };
  },
  plate(M, o = {}) {   // rain / water level plate: interleaved traces on a separate board, lying flat beside the comparator
    const { layers, add } = L(), cu = M.tin, g = new THREE.Group(), w = o.w || 40, d = o.d || 30;
    g.add(box(w, 1.6, d, C.green(), -w / 2 - 16, -1.6, 0));
    for (let i = 0; i < 10; i++) g.add(box(w * .85, .06, .9, cu, -w / 2 - 16 + (i % 2 ? 1.5 : -1.5), .02, -d * .4 + i * d * .8 / 9));
    add(o.die || 'Sensing plate', g);
    return { layers, key: 0, h: 2, r: 16, spacing: [10] };
  },
  piezo(M) {   // bare piezo disc: brass + ceramic
    const { layers, add } = L();
    add('Brass disc', cyl(10, .3, M.brass, 0, 0, 0, 64));
    add('Ceramic (piezo)', cyl(7, .3, M.ceramic, 0, .3, 0, 64));
    return { layers, key: 1, h: .6, r: 10, spacing: [4, 12] };
  },
  solar(M) {   // small solar panel: back sheet, cells, glass
    const { layers, add } = L(), g = new THREE.Group();
    add('Back sheet', box(40, .5, 30, C.white()));
    for (let i = 0; i < 4; i++) g.add(box(9, .2, 26, mat({ color: '#1d2b5a', roughness: .3, metalness: .5 }), -14.5 + i * 9.7, .6), box(.3, .22, 26, M.tin, -14.5 + i * 9.7, .62));
    add('Solar cells', g);
    add('Glass', box(40, .4, 30, M.clear, 0, 1));
    return { layers, key: 1, h: 1.6, r: 22, spacing: [4, 12, 20] };
  },
  fanbox(M, o = {}) {   // dust sensor box: laser + sensor, fan, lid
    const { layers, add } = L(), g = new THREE.Group();
    add(o.die || 'Laser + sensor', box(8, 3, 4, M.mold, -8, 0), cyl(.8, 2, M.die, -3, 1, 0));
    for (let i = 0; i < 7; i++) { const b = box(.5, 1, 8, C.grey(), 9, 4); b.rotation.y = i * Math.PI / 7; g.add(b); }
    g.add(cyl(2.5, 1.4, M.mold, 9, 3.8));
    add('Fan', g);
    add('Lid', box(36, 10, 24, o.lid ? C[o.lid]() : C.grey(), 0, 6, 0, .8));
    return { layers, key: 0, h: 16, r: 18, spacing: [4, 16, 30] };
  },
  ndir(M) {   // NDIR CO2: IR lamp + gas chamber, gold cover
    const { layers, add } = L();
    add('Board', box(30, .8, 18, C.green()));
    add('IR lamp + chamber', cyl(1.2, 3, M.die, -9, .8), box(20, 4, 6, C.white(), 2, .8));
    add('Gold cover', box(32, 6, 20, M.gold, 0, 1, 0, .4));
    return { layers, key: 1, h: 7, r: 16, spacing: [3, 12, 24] };
  },
  xfmr(M) {   // voltage-sensing transformer: core, coils, case
    const { layers, add } = L();
    add('Iron core', box(12, 10, 4, C.grey(), 0, 0));
    add('Copper coils', cyl(4, 8, C.copper(), -3, 1), cyl(4, 8, C.copper(), 3, 1));
    add('Case', box(16, 12, 14, M.mold, 0, 0, 0, .6));
    return { layers, key: 1, h: 12, r: 9, spacing: [3, 14, 30] };
  },
  geophone(M) {   // geophone: spike, coil + magnet, case
    const { layers, add } = L();
    add('Spike', mesh(new THREE.ConeGeometry(2, 10, 24), M.alu, 0, 5, 0).rotateX(Math.PI));
    add('Coil + magnet', cyl(5, 10, C.copper(), 0, 1), cyl(2.5, 12, C.grey(), 0, 0));
    add('Case', lathe([[7, 0], [7.4, 0], [7.4, 14], [0, 14]], M.alu, 0));
    return { layers, key: 1, h: 14, r: 7.4, spacing: [4, 14, 30] };
  },
};

// ---------- board extras ----------
export function moreExtra(type, x, z, a, M, pcb) {
  if (type === 'terminal') { const g = new THREE.Group(); const n = a || 2; g.add(box(n * 5, 8, 7, C.terminal(), 0, 0, 0, .3)); for (let i = 0; i < n; i++) g.add(cyl(1.4, .4, M.tin, -(n - 1) * 2.5 + i * 5, 8)); g.position.set(x, 0, z); pcb.add(g); return { name: 'Screw terminal', obj: g, h: 8 }; }
  if (type === 'jack') { const g = new THREE.Group(); g.add(box(6, 5, 12, M.mold, 0, 0, 0, .3), cyl(1.8, 2, M.alu, 0, 1.6, 6.5)); g.position.set(x, 0, z); pcb.add(g); return { name: '3.5 mm jack', obj: g, h: 5 }; }
  if (type === 'wled') { pcb.add(box(2, .7, 2, M.glow('#fff6e0'), x, 0, z)); return null; }
  if (type === 'electrode') { const g = new THREE.Group(); g.add(cyl(4, .5, M.tin, 0, 0), cyl(1.5, 2, M.tin, 0, .5)); g.position.set(x, 0, z); pcb.add(g); return { name: 'Electrode', obj: g, h: 2.5 }; }
  if (type === 'buzz') { pcb.add(cyl(6, 8, M.mold, x, 0, z)); return null; }
  return null;
}

// ---------- the modules ----------
const B = '#1d58ad', G = '#1f6b3c', P = '#4b2a7a', K = '#1b1d22', R = '#a8282a';
const cmp = (extra = []) => [['pot', 2, -3], ['chip', 6, 3.2, 8], ['smd', 10.5, -5, '#ff4040'], ['smd', 10.5, -3, '#40ff70'], ...extra];   // LM393 comparator board
const ic = (name, bw, bd, color, s, pins, o = {}) => ({ name, bw, bd, color, towers: [['ic', o.x ?? -2, o.z ?? 0, o.label || 'Chip', { s, die: o.die, pkg: o.pkg, window: o.window }]], extras: o.extras || [['smd', bw / 2 - 4, -bd / 2 + 2, '#ff4040']], pins, edge: o.edge || 'x', back: [], backNames: [] });
const mq = (name) => ({ name, bw: 32, bd: 22, color: B, towers: [['mq', -4, 0, name]], extras: [['pot', 9, -6], ['chip', 10, 5.5, 8], ['smd', 13, -1.5, '#ff4040'], ['smd', 13, 1.5, '#40ff70']], pins: ['VCC', 'GND', 'DO', 'AO'], edge: 'x', back: [], backNames: [] });
const one = (name, bw, bd, color, tower, opts, pins, extras = [], x = -8, edge = 'x', label) => ({ name, bw, bd, color, towers: [[tower, x, 0, label || name, opts || {}]], extras, pins, edge, back: [], backNames: [] });

export const MORE_KINDS = {
  // distance & presence
  rcwl0516: one('RCWL-0516', 36, 17, B, 'antenna', {}, ['3V3', 'GND', 'OUT', 'VIN', 'CDS'], [['chip', 8, 3, 14]], -6),
  vl53l0x: ic('VL53L0X', 25, 13, P, 4.4, ['VIN', 'GND', 'SCL', 'SDA', 'XSHUT'], { label: 'ToF sensor' }),
  sharp_ir: one('Sharp GP2Y0A21', 44, 13, K, 'tof', { w: 30, die: 'IR LED + PSD', lens: 'Lenses' }, ['VO', 'GND', 'VCC'], [], 0),
  jsn_sr04t: one('JSN-SR04T', 41, 28, G, 'probe', { pkg: 'Waterproof transducer', die: 'Transducer' }, ['5V', 'TRIG', 'ECHO', 'GND'], [['chip', 6, 4, 14], ['xtal', 10, -6]], -10),
  tcrt5000: one('TCRT5000', 32, 14, B, 'led', { col: 'black' }, ['VCC', 'GND', 'DO', 'AO'], cmp(), -11, 'x', 'IR pair'),
  line_array: { name: '5-ch line sensor', bw: 60, bd: 16, color: B, towers: [-20, -10, 0, 10, 20].map((x, i) => ['led', x, -3, i ? 'IR pair ' + (i + 1) : 'IR pair 1', { col: i % 2 ? 'black' : 'clear' }]), extras: [['chip', 0, 4, 14]], pins: ['VCC', 'GND', 'S1', 'S2', 'S3', 'S4', 'S5'], edge: 'z', back: [], backNames: [] },
  mmwave: one('LD2410', 35, 7, K, 'antenna', {}, ['VCC', 'GND', 'TX', 'RX', 'OUT'], [], -6),
  pir_mini: one('HC-SR505', 24, 10, G, 'pir', {}, ['VCC', 'OUT', 'GND'], [], 0),
  laser_trip: one('Laser tripwire', 30, 14, B, 'ldr', {}, ['VCC', 'GND', 'DO'], cmp([['smd', -2, -5, '#ff2020']]), -11, 'x', 'LDR'),
  // light & colour
  bh1750: ic('BH1750', 19, 14, B, 3, ['VCC', 'GND', 'SCL', 'SDA', 'ADDR'], { label: 'Light sensor', window: true }),
  temt6000: ic('TEMT6000', 20, 12, P, 2.5, ['VCC', 'GND', 'OUT'], { label: 'Phototransistor', window: true }),
  tcs3200: { name: 'TCS3200', bw: 28, bd: 28, color: B, towers: [['color', 0, 0, 'Colour sensor']], extras: [['wled', -8, -8], ['wled', 8, -8], ['wled', -8, 8], ['wled', 8, 8]], pins: ['S0', 'S1', 'S2', 'S3', 'OUT', 'VCC', 'GND', 'OE'], edge: 'z', back: [], backNames: [] },
  tcs34725: { name: 'TCS34725', bw: 20, bd: 20, color: B, towers: [['color', -2, 0, 'RGB sensor']], extras: [['wled', 5, -5]], pins: ['VIN', 'GND', 'SCL', 'SDA', 'INT', 'LED'], edge: 'x', back: [], backNames: [] },
  uv_guva: ic('GUVA-S12SD', 20, 12, B, 2.5, ['VCC', 'GND', 'OUT'], { label: 'UV photodiode', window: true }),
  uv_ml8511: ic('ML8511', 18, 12, P, 3, ['3V3', 'GND', 'OUT', 'EN'], { label: 'UV sensor', window: true }),
  apds9960: ic('APDS-9960', 20, 15, P, 3.9, ['VIN', 'GND', 'SCL', 'SDA', 'INT'], { label: 'Gesture sensor', window: true }),
  photodiode: one('Photodiode module', 32, 14, B, 'led', { col: 'black' }, ['VCC', 'GND', 'DO', 'AO'], cmp(), -11, 'x', 'Photodiode'),
  solar: one('Mini solar panel', 44, 34, K, 'solar', {}, ['+', '-'], [], 0, 'z', 'Solar panel'),
  // sound & vibration
  max9814: one('MAX9814', 28, 14, P, 'mic', {}, ['GND', 'VDD', 'GAIN', 'OUT', 'AR'], [['chip', 6, 0, 14]], -9, 'x', 'Mic'),
  max4466: one('MAX4466', 22, 14, P, 'mic', {}, ['OUT', 'GND', 'VCC'], [['chip', 5, 3, 8], ['trim', 5, -3]], -6, 'x', 'Mic'),
  inmp441: ic('INMP441', 15, 15, B, 3.5, ['L/R', 'WS', 'SCK', 'SD', 'VDD', 'GND'], { label: 'MEMS mic', die: 'MEMS diaphragm', window: true }),
  sw420: one('SW-420', 32, 14, B, 'tilt', { spring: true }, ['VCC', 'GND', 'DO'], cmp(), -11, 'x', 'Vibration switch'),
  piezo: one('Piezo sensor', 30, 26, K, 'piezo', {}, ['+', '-', 'S'], [], -2, 'z', 'Piezo disc'),
  knock_ky031: one('KY-031', 18, 15, K, 'tilt', { spring: true }, ['S', 'VCC', 'GND'], [], -3, 'x', 'Knock spring'),
  geophone: one('Geophone', 30, 20, K, 'geophone', {}, ['+', '-'], [['terminal', 9, 0, 2]], -6, 'x', 'Geophone'),
  // temperature & humidity
  dht22: { name: 'DHT22', bw: 30, bd: 16, color: B, towers: [['dht', -5, 0, 'DHT22']], extras: [['smd', 10, -5, '#ff4040']], pins: ['VCC', 'DATA', 'GND'], edge: 'x', back: [], backNames: [] },
  ds18b20: one('DS18B20 probe', 24, 14, B, 'probe', {}, ['VCC', 'DATA', 'GND'], [['terminal', 5, 0, 3]], -6, 'x', 'DS18B20'),
  lm35: one('LM35', 18, 12, B, 'to92', { die: 'Temp sensor die' }, ['VCC', 'OUT', 'GND'], [], -3, 'x', 'LM35'),
  ntc: one('NTC thermistor', 32, 14, B, 'to92', { die: 'NTC bead', pkg: 'Epoxy' }, ['VCC', 'GND', 'DO', 'AO'], cmp(), -11, 'x', 'Thermistor'),
  mlx90614: ic('MLX90614', 18, 12, P, 5, ['VIN', 'GND', 'SCL', 'SDA'], { label: 'IR thermometer', die: 'Thermopile', pkg: 'TO-39 can', window: true }),
  max6675: ic('MAX6675', 26, 15, R, 3.9, ['GND', 'VCC', 'SCK', 'CS', 'SO'], { label: 'Thermocouple chip', extras: [['terminal', -8, 0, 2]], x: 3 }),
  bme280: ic('BME280', 13, 10, P, 2.5, ['VIN', 'GND', 'SCL', 'SDA'], { label: 'BME280', die: 'MEMS membrane', window: true }),
  sht31: ic('SHT31', 18, 13, B, 2.5, ['VIN', 'GND', 'SCL', 'SDA'], { label: 'Humidity sensor', die: 'Polymer + heater', window: true }),
  amg8833: one('AMG8833', 26, 26, P, 'tof', { w: 8, die: '8×8 thermopiles', lens: 'Silicon lens' }, ['3V3', 'GND', 'SDA', 'SCL', 'INT'], [], 0, 'z', 'Thermal camera'),
  // gas & air
  mq3: mq('MQ-3'), mq4: mq('MQ-4'), mq5: mq('MQ-5'), mq7: mq('MQ-7'), mq135: mq('MQ-135'), mq9: mq('MQ-9'),
  ccs811: ic('CCS811', 18, 14, P, 2.7, ['VCC', 'GND', 'SCL', 'SDA', 'WAK'], { label: 'Gas sensor', die: 'MOX hotplate', window: true }),
  mhz19: one('MH-Z19', 36, 22, G, 'ndir', {}, ['VIN', 'GND', 'TX', 'RX', 'PWM'], [], 0, 'z', 'NDIR CO₂'),
  sds011: one('SDS011', 40, 32, K, 'fanbox', { lid: 'grey' }, ['5V', 'GND', 'TX', 'RX'], [], 0, 'z', 'Dust sensor'),
  gp2y1010: one('GP2Y1010', 46, 30, K, 'fanbox', { lid: 'white', die: 'IR LED + photodiode' }, ['V-LED', 'LED-GND', 'LED', 'S-GND', 'Vo', 'Vcc'], [], 0, 'z', 'Dust sensor'),
  bmp280: ic('BMP280', 15, 12, P, 2.2, ['VCC', 'GND', 'SCL', 'SDA', 'CSB', 'SDO'], { label: 'Pressure sensor', die: 'MEMS membrane', window: true }),
  // water, soil & liquid
  soil_cap: one('Capacitive soil v1.2', 23, 98, K, 'film', { w: 20, d: 70, die: 'Capacitor plates' }, ['GND', 'VCC', 'AOUT'], [['chip', 0, -36, 8]], 0, 'z', 'Probe'),
  rain: one('Rain sensor', 30, 16, B, 'plate', { w: 50, d: 40, die: 'Rain plate' }, ['VCC', 'GND', 'DO', 'AO'], cmp(), -10, 'x', 'Rain plate'),
  water_level: one('Water level sensor', 22, 62, R, 'film', { w: 16, d: 40, die: 'Exposed traces' }, ['S', '+', '-'], [], 0, 'z', 'Sensing strip'),
  float: one('Float switch', 28, 20, K, 'float', {}, ['+', '-'], [['terminal', 8, 0, 2]], -5, 'x', 'Float'),
  flow: one('YF-S201', 30, 20, K, 'turbine', {}, ['VCC', 'GND', 'SIG'], [], 0, 'x', 'Flow sensor'),
  tds: one('TDS sensor', 42, 32, B, 'probe', { glass: false, die: 'Two electrodes', pkg: 'Probe body' }, ['A', '+', '-'], [['chip', 8, 4, 14], ['jack', 14, -6]], -10, 'x', 'TDS probe'),
  ph: one('pH sensor', 42, 32, B, 'probe', { glass: true, die: 'Glass bulb', pkg: 'Glass electrode' }, ['To', 'Do', 'Po', 'G', 'V+'], [['chip', 8, 4, 8], ['pot', 8, -6], ['jack', 14, 8]], -10, 'x', 'pH probe'),
  turbidity: one('Turbidity sensor', 38, 28, B, 'probe', { glass: true, die: 'IR LED + receiver', pkg: 'Clear tube' }, ['VCC', 'GND', 'OUT'], [['chip', 8, 4, 8], ['pot', 8, -6]], -10, 'x', 'Turbidity probe'),
  xkc_y25: ic('XKC-Y25', 28, 28, K, 8, ['VCC', 'OUT', 'GND', 'MODE'], { label: 'Capacitive sensor', die: 'Sense pad', x: 0 }),
  // motion, tilt & orientation
  mpu6050: ic('MPU6050', 21, 16, B, 4, ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'], { label: 'MPU6050', die: 'MEMS gyro + accel', edge: 'z', z: -2, x: 0 }),
  adxl345: ic('ADXL345', 20, 15, P, 3, ['GND', 'VCC', 'CS', 'INT1', 'INT2', 'SDO', 'SDA', 'SCL'], { label: 'ADXL345', die: 'MEMS proof mass', edge: 'z', z: -2, x: 0 }),
  mpu9250: ic('MPU9250', 25, 15, P, 3, ['VCC', 'GND', 'SCL', 'SDA', 'EDA', 'ECL', 'AD0', 'INT'], { label: 'MPU9250', die: 'Gyro + accel + compass', edge: 'z', z: -2, x: 0 }),
  hmc5883l: ic('HMC5883L', 18, 14, B, 3, ['VCC', 'GND', 'SCL', 'SDA', 'DRDY'], { label: 'Compass chip', die: 'Magnetoresistors' }),
  sw520d: one('SW-520D tilt', 30, 14, B, 'tilt', {}, ['VCC', 'GND', 'DO'], cmp(), -11, 'x', 'Tilt switch'),
  ball_tilt: one('Ball tilt switch', 18, 14, K, 'tilt', {}, ['S', 'VCC', 'GND'], [], -3, 'x', 'Ball switch'),
  encoder: one('KY-040 encoder', 30, 18, B, 'knob', {}, ['CLK', 'DT', 'SW', '+', 'GND'], [], -4, 'x', 'Encoder'),
  optical_encoder: one('Optical encoder', 32, 14, B, 'tof', { w: 10, die: 'Slot: LED + sensor', lens: 'U-slot housing' }, ['VCC', 'GND', 'DO', 'AO'], cmp(), -10, 'x', 'Slot sensor'),
  hall: one('A3144 Hall', 24, 14, K, 'to92', { die: 'Hall plate' }, ['VCC', 'GND', 'DO'], [['smd', 6, -4, '#ff4040']], -6, 'x', 'A3144'),
  reed: one('Reed switch', 34, 14, B, 'reed', {}, ['VCC', 'GND', 'DO'], cmp(), -8, 'x', 'Reed switch'),
  // touch, force & weight
  touch: ic('TTP223', 15, 11, R, 2.5, ['GND', 'VCC', 'I/O'], { label: 'Touch pad', die: 'Copper pad', x: -1, extras: [['smd', 4, -3, '#ff4040']] }),
  mpr121: ic('MPR121', 30, 20, B, 3, ['3V3', 'GND', 'SCL', 'SDA', 'IRQ', 'ADD'], { label: 'Touch controller', die: '12 electrodes' }),
  fsr: one('FSR 402', 20, 60, K, 'film', { w: 18, d: 18, ink: true, die: 'Carbon ink + fingers' }, ['+', '-'], [], 0, 'z', 'Force pad'),
  flex: one('Flex sensor', 12, 80, K, 'film', { w: 7, d: 55, ink: true, die: 'Carbon ink strip' }, ['+', '-'], [], 0, 'z', 'Flex strip'),
  hx711: { name: 'HX711 + load cell', bw: 30, bd: 20, color: G, towers: [['loadcell', -20, 0, 'Load cell']], extras: [['chip', 6, 2, 16]], pins: ['GND', 'DT', 'SCK', 'VCC'], edge: 'x', back: [], backNames: [] },
  joystick: one('Joystick module', 34, 26, K, 'knob', { joy: true, die: '2 pots + switch' }, ['GND', '+5V', 'VRx', 'VRy', 'SW'], [], -4, 'x', 'Joystick'),
  keypad: one('4×4 keypad', 50, 56, K, 'keypad', {}, ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'], [], 0, 'z', 'Keypad'),
  thinfilm: one('Thin-film pressure', 20, 50, K, 'film', { w: 16, d: 16, ink: true, die: 'Pressure-sensitive ink' }, ['+', '-'], [], 0, 'z', 'Pressure pad'),
  // electrical & magnetic
  acs712: ic('ACS712', 31, 13, R, 3.9, ['VCC', 'OUT', 'GND'], { label: 'Hall current chip', die: 'Hall + copper path', extras: [['terminal', -10, 0, 2]], x: 4 }),
  ina219: ic('INA219', 25, 20, P, 3, ['VCC', 'GND', 'SCL', 'SDA', 'V-', 'V+'], { label: 'INA219', die: 'Shunt + ADC', extras: [['terminal', -8, 0, 2]], x: 4 }),
  zmpt101b: one('ZMPT101B', 49, 19, B, 'xfmr', {}, ['VCC', 'OUT', 'GND'], [['chip', 10, 3, 8], ['pot', 16, -4], ['terminal', -18, 0, 2]], -4, 'x', 'Transformer'),
  voltage_div: ic('Voltage sensor', 27, 13, R, 3, ['-', '+', 'S'], { label: 'Resistor divider', die: '30k + 7.5k', pkg: 'Resistors', extras: [['terminal', -8, 0, 2]], x: 4 }),
  hall_linear: one('SS49E', 24, 14, B, 'to92', { die: 'Linear Hall plate' }, ['VCC', 'GND', 'AO'], [], -6, 'x', 'SS49E'),
  door_mc38: one('MC-38 door sensor', 30, 16, K, 'reed', {}, ['+', '-'], [], 0, 'x', 'Reed (door)'),
  pzem004t: one('PZEM-004T', 70, 30, G, 'coil', { w: 22, d: 22, die: 'Current transformer' }, ['5V', 'RX', 'TX', 'GND'], [['chip', 20, 5, 16], ['terminal', -25, 0, 4]], -6, 'z', 'CT coil'),
  metal_detector: one('Metal detector', 40, 30, G, 'coil', { w: 30, d: 30, die: 'Search coil' }, ['VCC', 'GND', 'OUT'], [['buzz', 12, 8]], -4, 'z', 'Search coil'),
  // body & health
  max30102: ic('MAX30102', 14, 14, P, 5.6, ['VIN', 'SDA', 'SCL', 'INT', 'GND'], { label: 'MAX30102', die: 'Red + IR LEDs + photodiode', window: true, x: 0 }),
  pulse: one('Pulse sensor', 16, 16, '#2a6b3a', 'led', { col: 'clear' }, ['S', '+', '-'], [['smd', 4, 0, '#40ff70']], -3, 'x', 'Green LED + sensor'),
  ad8232: ic('AD8232', 36, 28, R, 4, ['GND', '3V3', 'OUT', 'LO-', 'LO+', 'SDN'], { label: 'ECG amplifier', die: 'Instrumentation amp', extras: [['jack', -12, 6]], x: 4 }),
  gsr: one('GSR sensor', 30, 20, B, 'film', { w: 12, d: 12, die: 'Finger electrodes' }, ['SIG', 'NC', 'VCC', 'GND'], [['chip', 8, 3, 8], ['electrode', -8, -7], ['electrode', -8, 7]], -6, 'x', 'Electrodes'),
  emg: ic('EMG sensor', 40, 25, K, 4, ['+Vs', 'GND', '-Vs', 'SIG'], { label: 'EMG amplifier', die: 'Instrumentation amp', extras: [['electrode', -14, -8], ['electrode', -14, 0], ['electrode', -14, 8]], x: 6 }),
  fingerprint: one('R307 fingerprint', 34, 28, K, 'fingerprint', {}, ['5V', 'GND', 'TX', 'RX', 'TOUCH', '3V3'], [], 0, 'z', 'Optical sensor'),
  // identity, position & communication
  rc522: one('RC522 RFID', 60, 40, B, 'coil', { w: 30, d: 30, die: 'Antenna coil' }, ['SDA', 'SCK', 'MOSI', 'MISO', 'IRQ', 'GND', 'RST', '3V3'], [['chip', 18, 0, 32], ['xtal', 24, 10]], -8, 'z', 'Antenna'),
  gps: one('NEO-6M GPS', 36, 26, B, 'patch', {}, ['VCC', 'RX', 'TX', 'GND'], [], 0, 'z', 'Patch antenna'),
  pn532: one('PN532 NFC', 42, 40, R, 'coil', { w: 28, d: 28, die: 'NFC antenna' }, ['GND', 'VCC', 'SDA', 'SCL'], [['chip', 14, 8, 40]], -6, 'z', 'NFC coil'),
  barcode: one('Barcode scanner', 40, 30, K, 'camera', {}, ['VCC', 'GND', 'TX', 'RX'], [['wled', 10, -8], ['smd', 10, 8, '#ff2020']], -6, 'z', 'Camera'),
  esp32cam: one('ESP32-CAM', 27, 40, K, 'camera', {}, ['5V', 'GND', 'IO12', 'IO13', 'IO15', 'IO14', 'IO2', 'IO4'], [['chip', 0, 10, 48], ['wled', 8, -14]], 0, 'z', 'Camera'),
  hc05: ic('HC-05 Bluetooth', 37, 16, B, 6, ['EN', 'VCC', 'GND', 'TXD', 'RXD', 'STATE'], { label: 'BT chip', die: 'Radio + antenna', x: -4, extras: [['smd', 12, -5, '#ff4040']] }),
};
