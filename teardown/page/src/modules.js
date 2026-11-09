// Parametric hobby-sensor modules for the teardown act (mm; board top at y = 0, x along the board, header on +x or +z).
// A module = a painted board + "towers" (stacks of layered parts that lift apart) + top extras + back chips + a pin header.
// Shapes are models built from typical datasheet sizes; the film says "3D model" on screen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BLUE = '#1d58ad', GREEN = '#1f6b3c';
// kind → board + towers. Tower: [type, x, z, label, opts]. Extras: pot / chip / smd. Header: names + edge.
export const KINDS = {
  ultrasonic: { name: 'HC-SR04', bw: 45, bd: 20, color: BLUE, towers: [['can', -13.2, -1.5, 'T'], ['can', 13.2, -1.5, 'R']], extras: [['xtal', 0, -3]],
    pins: ['VCC', 'TRIG', 'ECHO', 'GND'], edge: 'z', back: [['IC', -12, 5, 9.9, 3.9, 16], ['IC', 12, 5, 8.65, 3.9, 14], ['IC', 0, -1, 4.9, 3.9, 8]], backNames: ['Driver', 'Op-amp', 'Controller'] },
  ir: { name: 'FC-51', bw: 31, bd: 14, color: BLUE, towers: [['led', -11, -3, 'IR LED', { col: 'clear' }], ['led', -11, 3, 'Photodiode', { col: 'black' }]],
    extras: [['pot', 1, -2.5], ['chip', 5, 3, 8], ['smd', 9, -4.6, '#ff4040'], ['smd', 9, -2.6, '#40ff70']], pins: ['VCC', 'GND', 'OUT'], edge: 'x', back: [], backNames: [] },
  flame: { name: 'Flame sensor', bw: 32, bd: 14, color: BLUE, towers: [['led', -11.5, 0, 'IR receiver', { col: 'black' }]],
    extras: [['pot', 0, -2.8], ['chip', 4.5, 3.2, 8], ['smd', 9.5, -4.6, '#ff4040'], ['smd', 9.5, -2.6, '#40ff70']], pins: ['VCC', 'GND', 'DO', 'AO'], edge: 'x', back: [], backNames: [] },
  ldr: { name: 'LDR module', bw: 32, bd: 14, color: BLUE, towers: [['ldr', -11.5, 0, 'LDR']],
    extras: [['pot', 0, -2.8], ['chip', 4.5, 3.2, 8], ['smd', 9.5, -4.6, '#ff4040'], ['smd', 9.5, -2.6, '#40ff70']], pins: ['VCC', 'GND', 'DO', 'AO'], edge: 'x', back: [], backNames: [] },
  sound: { name: 'Sound sensor', bw: 34, bd: 15, color: BLUE, towers: [['mic', -11.5, 0, 'Mic']],
    extras: [['trim', 0.5, -2.6], ['chip', 6, 3.4, 8], ['smd', 10.5, -5, '#ff4040'], ['smd', 10.5, -3, '#40ff70']], pins: ['AO', 'GND', 'VCC', 'DO'], edge: 'x', back: [], backNames: [] },
  gas: { name: 'MQ-2', bw: 32, bd: 22, color: BLUE, towers: [['mq', -4, 0, 'MQ-2']],
    extras: [['pot', 9, -6], ['chip', 10, 5.5, 8], ['smd', 13, -1.5, '#ff4040'], ['smd', 13, 1.5, '#40ff70']], pins: ['VCC', 'GND', 'DO', 'AO'], edge: 'x', back: [], backNames: [] },
  soil: { name: 'Soil sensor', bw: 30, bd: 16, color: BLUE, towers: [['fork', -10, 0, 'Probe']],
    extras: [['pot', 3, -3.5], ['chip', 6, 3.6, 8], ['smd', 10.5, -5.5, '#ff4040'], ['smd', 10.5, -3.5, '#40ff70']], pins: ['VCC', 'GND', 'DO', 'AO'], edge: 'x', back: [], backNames: [] },
  pir: { name: 'HC-SR501', bw: 32, bd: 24, color: GREEN, towers: [['pir', 0, 0, 'PIR']], extras: [],
    pins: ['VCC', 'OUT', 'GND'], edge: 'z', back: [['IC', -6, 5, 8.65, 3.9, 14], ['POT', 10, -7], ['POT', -10, -7]], backNames: ['Controller', 'Delay pot', 'Range pot'] },
  dht: { name: 'DHT11', bw: 28, bd: 14, color: BLUE, towers: [['dht', -5, 0, 'DHT11']], extras: [['smd', 9, -4, '#ff4040']], pins: ['VCC', 'DATA', 'GND'], edge: 'x', back: [], backNames: [] },
  generic: { name: 'Module', bw: 32, bd: 16, color: BLUE, towers: [['led', -10, 0, 'Sensor', { col: 'black' }]], extras: [['chip', 4, 0, 8]], pins: ['VCC', 'GND', 'OUT'], edge: 'x', back: [], backNames: [] },
};

// ---------- materials ----------
export function mats() {
  const P = (o) => new THREE.MeshPhysicalMaterial(o), S = (o) => new THREE.MeshStandardMaterial(o);
  return {
    alu: P({ color: '#c9ccd1', roughness: .3, metalness: 1, clearcoat: .1 }),
    aluCone: P({ color: '#d6d8dc', roughness: .22, metalness: 1, side: THREE.DoubleSide }),
    baseP: P({ color: '#3a3c40', roughness: .6, sheen: .2 }),
    brass: S({ color: '#cfa55a', roughness: .32, metalness: 1 }),
    ceramic: S({ color: '#d9d8d2', roughness: .42, metalness: .35, emissive: '#ff6b3d', emissiveIntensity: 0 }),
    tan: S({ color: '#c9a173', roughness: .6, emissive: '#ff6b3d', emissiveIntensity: 0 }),
    mesh: S({ color: '#1a1b1d', roughness: .8, alphaMap: weave(9), alphaTest: .5, side: THREE.DoubleSide }),
    steelMesh: S({ color: '#b8bcc2', roughness: .35, metalness: 1, alphaMap: weave(7), alphaTest: .5, side: THREE.DoubleSide }),
    header: P({ color: '#202124', roughness: .55, clearcoat: .1 }),
    tin: S({ color: '#cfd2d6', roughness: .26, metalness: 1 }),
    gold: S({ color: '#d9b46a', roughness: .28, metalness: 1 }),
    mold: P({ color: '#232427', roughness: .62, clearcoat: .05 }),
    capC: S({ color: '#a8875e', roughness: .55 }),
    resB: S({ color: '#1c1c1d', roughness: .5 }),
    fr4: S({ color: '#8f8460', roughness: .8 }),
    xtal: S({ color: '#d4d6da', roughness: .2, metalness: 1 }),
    clear: P({ color: '#e8f0ff', roughness: .06, transmission: .9, thickness: 3, ior: 1.5, transparent: true, opacity: .95 }),
    blackEpoxy: P({ color: '#141416', roughness: .12, clearcoat: 1, clearcoatRoughness: .08 }),
    die: S({ color: '#9aa3ad', roughness: .3, metalness: .8, emissive: '#ff6b3d', emissiveIntensity: 0 }),
    potBlue: P({ color: '#2a6fd6', roughness: .38, clearcoat: .5 }),
    potWhite: S({ color: '#ececea', roughness: .5 }),
    bakelite: P({ color: '#5a3a26', roughness: .5, clearcoat: .2 }),
    coil: S({ color: '#d0a070', roughness: .35, metalness: .9, emissive: '#ff6b3d', emissiveIntensity: 0 }),
    white: P({ color: '#f3f3ef', roughness: .45, transmission: .25, thickness: 2 }),
    dhtBlue: P({ color: '#3a7ad8', roughness: .55, alphaMap: grid(), alphaTest: .5, side: THREE.DoubleSide }),
    felt: S({ color: '#121214', roughness: .95 }),
    glow: (c) => S({ color: '#222', emissive: c, emissiveIntensity: 1.5, roughness: .3 }),
  };
}
function weave(step) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#fff'; g.lineWidth = 3.2;
  for (let i = 0; i <= 512; i += step) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
function grid() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#000';
  for (let y = 12; y < 256; y += 30) for (let x = 12; x < 256; x += 30) g.fillRect(x, y, 16, 16);
  const t = new THREE.CanvasTexture(c); return t;
}
const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = sh(new THREE.Mesh(g, m)); o.position.set(x, y, z); return o; };

// ---------- towers: each returns { layers: [{ name, obj, y0 }], key (layer index for the macro stop), h (height), r } ----------
function tower(type, M, opts = {}) {
  const L = [], add = (name, ...objs) => { const g = new THREE.Group(); objs.forEach((o) => g.add(o)); L.push({ name, obj: g }); return g; };
  if (type === 'can') {
    add('Base', mesh(lathe([[0, 0], [7.9, 0], [7.9, 1.4], [6.6, 1.4], [6.2, 1], [0, 1]]), M.baseP));
    const pz = new THREE.Group(); pz.add(mesh(new THREE.CylinderGeometry(6.2, 6.2, .25, 72), M.brass)); pz.add(mesh(new THREE.CylinderGeometry(4.4, 4.4, .3, 72), M.ceramic, 0, .27, 0)); pz.position.y = 2.2;
    add('Piezo disc', pz);
    add('Cone', mesh(lathe([[.55, 0], [5.4, 2.6], [5.3, 2.72], [.45, .12]]), M.aluCone, 0, 2.75, 0));
    add('Aluminium can', mesh(lathe([[7.62, .2], [8, 0], [8, 12], [7.45, 12], [7.45, 11.5], [7.62, 11.5], [7.62, .2]]), M.alu, 0, 1.4, 0));
    const ms = mesh(new THREE.CircleGeometry(7.45, 72), M.mesh, 0, 13.05, 0); ms.rotation.x = -Math.PI / 2; add('Jaali', ms);
    return { layers: L, key: 1, h: 13.4, r: 8, spacing: [8, 20, 30, 44, 62] };
  }
  if (type === 'led') {
    const leg = new THREE.BoxGeometry(.5, 3.2, .5);
    add('Leads', mesh(leg, M.tin, -1.27, 1.6, 0), mesh(leg, M.tin, 1.27, 1.6, 0), mesh(new THREE.CylinderGeometry(2.9, 2.9, .9, 48), opts.col === 'black' ? M.blackEpoxy : M.clear, 0, 3.6, 0));
    add('Chip (die)', mesh(new THREE.BoxGeometry(1.1, .4, 1.1), M.die, 0, 4.4, 0), mesh(lathe([[0, 0], [1.6, .2], [1.8, 1.2], [1.6, 1.2], [1.4, .35], [0, .2]]), M.tin, 0, 3.9, 0));
    add('Epoxy lens', mesh(lathe([[0, 0], [2.5, 0], [2.5, 5.6], [2.4, 6.4], [2.0, 7.3], [1.2, 7.9], [0, 8.1]]), opts.col === 'black' ? M.blackEpoxy : M.clear, 0, 4.0, 0));
    return { layers: L, key: 1, h: 12, r: 2.9, spacing: [5, 13, 24] };
  }
  if (type === 'ldr') {
    const leg = new THREE.BoxGeometry(.5, 3, .5);
    add('Leads', mesh(leg, M.tin, -1.7, 1.5, 0), mesh(leg, M.tin, 1.7, 1.5, 0));
    const disc = mesh(new THREE.CylinderGeometry(2.6, 2.6, .9, 48), M.tan, 0, 3.4, 0); disc.material = M.tan; add('CdS track', disc, serp(M, 2.2, 3.9));
    add('Clear coat', mesh(new THREE.CylinderGeometry(2.65, 2.65, .5, 48), M.clear, 0, 4.2, 0));
    return { layers: L, key: 1, h: 4.5, r: 2.7, spacing: [3, 9, 16] };
  }
  if (type === 'mic') {
    add('Pins', mesh(new THREE.BoxGeometry(.6, 2.6, .6), M.tin, -1.2, 1.3, 0), mesh(new THREE.BoxGeometry(.6, 2.6, .6), M.tin, 1.2, 1.3, 0));
    add('Backplate', mesh(new THREE.CylinderGeometry(4.3, 4.3, .5, 48), M.brass, 0, 3.2, 0));
    add('Diaphragm', mesh(new THREE.CylinderGeometry(4.3, 4.3, .08, 48), M.ceramic, 0, 4.4, 0));
    add('Capsule', mesh(lathe([[4.6, 0], [4.9, 0], [4.9, 6.7], [0, 6.7], [0, 6.5], [4.6, 6.5]]), M.alu, 0, 2.6, 0), mesh(new THREE.CircleGeometry(3.9, 48), M.felt, 0, 9.33, 0).rotateX(-Math.PI / 2));
    return { layers: L, key: 2, h: 9.4, r: 4.9, spacing: [4, 12, 20, 32] };
  }
  if (type === 'mq') {
    add('Base', mesh(new THREE.CylinderGeometry(9.5, 9.5, 3, 64), M.bakelite, 0, 1.5, 0));
    add('Heater coil', mesh(new THREE.TorusGeometry(1.5, .25, 12, 48), M.coil, 0, 6, 0).rotateY(0), mesh(new THREE.CylinderGeometry(.15, .15, 4, 8), M.tin, -1.5, 4.5, 0), mesh(new THREE.CylinderGeometry(.15, .15, 4, 8), M.tin, 1.5, 4.5, 0));
    add('SnO₂ tube', mesh(new THREE.CylinderGeometry(1.1, 1.1, 4, 32), M.tan, 0, 6, 0));
    add('Steel mesh', mesh(lathe([[8, 0], [8, 7], [7.8, 7.6], [0, 7.6]]), M.steelMesh, 0, 3, 0));
    return { layers: L, key: 2, h: 10.6, r: 9.5, spacing: [5, 14, 24, 38] };
  }
  if (type === 'fork') {
    const f = new THREE.Group();
    f.add(mesh(new THREE.BoxGeometry(14, 1.6, 20), M.fr4, -6, -.8, 0));
    for (const z of [-6, 6]) f.add(mesh(new THREE.BoxGeometry(26, 1.6, 4), M.fr4, -26, -.8, z), mesh(new THREE.BoxGeometry(24, .1, 2.6), M.gold, -25, .02, z));
    add('Probe fork', f);
    return { layers: L, key: 0, h: 2, r: 10, spacing: [10] };
  }
  if (type === 'pir') {
    add('Pyro sensor', mesh(new THREE.CylinderGeometry(4.6, 4.6, 3.6, 48), M.alu, 0, 1.8, 0), mesh(new THREE.BoxGeometry(3, .2, 2), M.blackEpoxy, 0, 3.65, 0));
    add('2 elements', mesh(new THREE.BoxGeometry(1, .15, 1.8), M.die, -.8, 3.85, 0), mesh(new THREE.BoxGeometry(1, .15, 1.8), M.die, .8, 3.85, 0));
    const d = new THREE.SphereGeometry(11.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2); d.computeVertexNormals();
    const dm = mesh(d, M.white, 0, 1.5, 0); dm.material = M.white; dm.material.flatShading = true; add('Fresnel lens', dm);
    return { layers: L, key: 1, h: 13, r: 11.5, spacing: [6, 16, 30] };
  }
  if (type === 'dht') {
    add('Pins', ...[-2.54, 0, 2.54, 5.08].map((x) => mesh(new THREE.BoxGeometry(.5, 3, .5), M.tin, x - 1.27, 1.5, 0)));
    add('Sensing parts', mesh(new THREE.BoxGeometry(8, .8, 9), M.tan, 0, 4, 0), mesh(new THREE.SphereGeometry(.9, 16, 12), M.blackEpoxy, 2.5, 5.2, 3));
    add('Case', mesh(new RoundedBoxGeometry(12, 5.5, 15.5, 2, .5), M.dhtBlue, 0, 6, 0));
    return { layers: L, key: 1, h: 9, r: 8, spacing: [3, 12, 24] };
  }
  return tower('led', M, { col: 'black' });
}
function serp(M, r, y) {   // the LDR's zig-zag CdS track
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#d8d0b8', roughness: .4, metalness: .6 });
  for (let i = -3; i <= 3; i++) g.add(mesh(new THREE.BoxGeometry(r * 1.5, .06, .28), m, i % 2 ? .25 : -.25, y, i * .55));
  return g;
}

// ---------- board painter ----------
function paint(cfg, side, ppm = 20) {
  const { bw, bd } = cfg, cw = Math.round(bw * ppm), ch = Math.round(bd * ppm);
  const mk = () => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return [c, c.getContext('2d')]; };
  const [cC, g] = mk(), [cO, o] = mk(), [cB, b] = mk();
  const X = (x) => (x + bw / 2) * ppm, Z = (z) => (side === 'F' ? z + bd / 2 : bd / 2 - z) * ppm;
  g.fillStyle = cfg.color; g.fillRect(0, 0, cw, ch); o.fillStyle = 'rgb(0,112,0)'; o.fillRect(0, 0, cw, ch); b.fillStyle = '#707070'; b.fillRect(0, 0, cw, ch);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(10,30,60,${.04 + .05 * rnd()})`; g.beginPath(); g.arc(rnd() * cw, rnd() * ch, 4 + 10 * rnd(), 0, 7); g.fill(); }
  const light = cfg.color === GREEN ? '#2f8a52' : '#3b80d6';
  const pads = padsOf(cfg);
  // traces: each pad routes to a neighbour with an L-shaped track
  for (let i = 0; i < pads.length; i++) {
    const [x1, z1] = pads[i], [x2, z2] = pads[(i * 3 + 1) % pads.length]; const mid = side === 'F' ? [x1, z2] : [x2, z1];
    for (const [ctx, col] of [[g, light], [b, '#b8b8b8'], [o, 'rgb(0,96,0)']]) { ctx.strokeStyle = col; ctx.lineWidth = .36 * ppm; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(X(x1), Z(z1)); ctx.lineTo(X(mid[0]), Z(mid[1])); ctx.lineTo(X(x2), Z(z2)); ctx.stroke(); }
  }
  for (const [x, z, r] of pads) {
    g.fillStyle = '#c8cbcf'; g.beginPath(); g.arc(X(x), Z(z), r * 2 * ppm, 0, 7); g.fill(); g.fillStyle = '#4d4f52'; g.beginPath(); g.arc(X(x), Z(z), r * .9 * ppm, 0, 7); g.fill();
    o.fillStyle = 'rgb(0,70,255)'; o.beginPath(); o.arc(X(x), Z(z), r * 2 * ppm, 0, 7); o.fill(); b.fillStyle = '#e8e8e8'; b.beginPath(); b.arc(X(x), Z(z), r * 2 * ppm, 0, 7); b.fill();
  }
  const silk = (txt, x, z, size) => { for (const [ctx, col] of [[g, '#f2f2ee'], [o, 'rgb(0,190,0)'], [b, '#d0d0d0']]) { ctx.font = `600 ${size * ppm}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(txt, X(x), Z(z)); } };
  if (side === 'F') {
    cfg.towers.forEach(([, x, z, label]) => { if (label.length <= 2) silk(label, x < 0 ? -bw / 2 + 2.2 : bw / 2 - 2.2, bd / 2 - 2.4, 2.2); });
    headerPins(cfg).forEach((p, i) => silk(cfg.pins[i], cfg.edge === 'z' ? p.x : p.x - 3.4, cfg.edge === 'z' ? p.z - 2.2 : p.z, .75));
    silk(cfg.name, cfg.edge === 'z' ? -bw / 2 + 9 : 0, cfg.edge === 'z' ? bd / 2 - 1.6 : -bd / 2 + 1.5, 1.3);
  }
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(cC, true), orm: tex(cO, false), bump: tex(cB, false) };
}
export function headerPins(cfg) {
  const n = cfg.pins.length, p = 2.54;
  return cfg.pins.map((name, i) => cfg.edge === 'z' ? { name, x: (i - (n - 1) / 2) * p, z: cfg.bd / 2 - 2.1 } : { name, x: cfg.bw / 2 - 2.1, z: (i - (n - 1) / 2) * p });
}
function padsOf(cfg) {
  const out = headerPins(cfg).map((p) => [p.x, p.z, .55]);
  for (const [, x, z] of cfg.towers) out.push([x - 2.5, z, .45], [x + 2.5, z, .45]);
  return out;
}

// ---------- build ----------
export function buildModule(kind, M) {
  const cfg = KINDS[kind] || KINDS.generic;
  const root = new THREE.Group(), pcb = new THREE.Group(); root.add(pcb);
  const T = 1.6, F = paint(cfg, 'F'), B = paint(cfg, 'B');
  const face = (t) => new THREE.MeshPhysicalMaterial({ map: t.map, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, bumpMap: t.bump, bumpScale: .6, clearcoat: .25, clearcoatRoughness: .35 });
  pcb.add(mesh(new THREE.BoxGeometry(cfg.bw, T, cfg.bd), [M.fr4, M.fr4, face(F), face(B), M.fr4, M.fr4], 0, -T / 2, 0));
  // header: right-angle pins out of the edge
  const pins = headerPins(cfg), pinMats = [], pinTips = [];
  const along = cfg.edge === 'z' ? 'x' : 'z';
  const blk = mesh(new RoundedBoxGeometry(cfg.edge === 'z' ? pins.length * 2.54 : 2.5, 2.5, cfg.edge === 'z' ? 2.5 : pins.length * 2.54, 2, .2), M.header);
  blk.position.set(cfg.edge === 'z' ? 0 : pins[0].x + .4, 1.25, cfg.edge === 'z' ? pins[0].z + .4 : 0); pcb.add(blk);
  for (const p of pins) {
    const m = M.gold.clone(); m.emissive = new THREE.Color('#ff6b3d'); m.emissiveIntensity = 0; pinMats.push(m);
    const hz = cfg.edge === 'z' ? new THREE.BoxGeometry(.64, .64, 8.6) : new THREE.BoxGeometry(8.6, .64, .64);
    pcb.add(mesh(hz, m, cfg.edge === 'z' ? p.x : p.x + 3.6, 1.25, cfg.edge === 'z' ? p.z + 3.6 : p.z));
    pcb.add(mesh(new THREE.BoxGeometry(.64, 3.6, .64), m, p.x, -.35, p.z));
    pinTips.push(new THREE.Vector3(cfg.edge === 'z' ? p.x : p.x + 7.8, 1.25, cfg.edge === 'z' ? p.z + 7.8 : p.z));
  }
  const jg = new THREE.ConeGeometry(.95, .9, 20); jg.rotateX(Math.PI); jg.translate(0, -T - .45, 0);
  for (const [x, z] of padsOf(cfg)) pcb.add(mesh(jg, M.tin, x, 0, z));
  // top extras
  const tops = [];
  for (const [type, x, z, a] of cfg.extras) {
    if (type === 'pot') { const g = new THREE.Group(); g.add(mesh(new RoundedBoxGeometry(6.6, 4.6, 6.6, 2, .4), M.potBlue, 0, 2.3, 0), mesh(new THREE.CylinderGeometry(1.7, 1.7, .6, 24), M.potWhite, 0, 4.8, 0)); g.position.set(x, 0, z); pcb.add(g); tops.push({ name: 'Pot', obj: g, h: 5 }); }
    if (type === 'trim') { const g = new THREE.Group(); g.add(mesh(new RoundedBoxGeometry(9.5, 10, 4.8, 2, .4), M.potBlue, 0, 5, 0), mesh(new THREE.CylinderGeometry(1, 1, .8, 16), M.xtal, 2.5, 10.3, 0)); g.position.set(x, 0, z); pcb.add(g); tops.push({ name: 'Trimmer', obj: g, h: 10.5 }); }
    if (type === 'chip') { const g = soic(a || 8, M); g.position.set(x, 0, z); g.rotation.x = Math.PI; g.position.y = 0; pcb.add(g); tops.push({ name: 'Comparator', obj: g, h: 1.6 }); }
    if (type === 'smd') { const m = mesh(new THREE.BoxGeometry(1.6, .6, .9), M.glow(a), x, .3, z); pcb.add(m); }
    if (type === 'xtal') { pcb.add(mesh(new RoundedBoxGeometry(4.6, 3.6, 10.6, 3, 1.6), M.xtal, x, 1.85, z)); }
  }
  // back packages
  const backs = [];
  cfg.back.forEach((b, i) => {
    let g;
    if (b[0] === 'IC') { g = soic(b[5], M, b[3], b[4]); g.position.set(b[1], -T, b[2]); }
    else { g = new THREE.Group(); g.add(mesh(new RoundedBoxGeometry(6.6, 4.6, 6.6, 2, .4), M.potBlue, 0, -2.3, 0)); g.position.set(b[1], -T, b[2]); }
    pcb.add(g); backs.push({ name: cfg.backNames[i] || 'IC', obj: g });
  });
  // towers: every layer in a shared explode set
  const towers = cfg.towers.map(([type, x, z, label, opts]) => {
    const tw = tower(type, M, opts); const grp = new THREE.Group(); grp.position.set(x, 0, z); root.add(grp);
    tw.layers.forEach((l) => grp.add(l.obj));
    return { ...tw, x, z, label, type, grp };
  });
  return { cfg, root, pcb, towers, pinMats, pinTips, backs, tops, T };
}
function soic(n, M, l, w) {
  const g = new THREE.Group(), k = n / 2; l = l || (k * 1.27 + .5); w = w || 3.9;
  g.add(mesh(new RoundedBoxGeometry(l, 1.5, w, 2, .12), M.mold, 0, -.95, 0));
  const lg = new THREE.BoxGeometry(.42, .2, 1.3);
  for (let i = 0; i < k; i++) for (const s of [-1, 1]) g.add(mesh(lg, M.tin, -(k - 1) * 1.27 / 2 + i * 1.27, -.18, s * (w / 2 + .55)));
  return g;
}
