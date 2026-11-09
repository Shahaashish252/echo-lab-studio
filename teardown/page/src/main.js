// Echo Lab "teardown3" format: Act A Exploded Teardown (3D) · Act B Blueprint · Act C Isometric Infographic.
// Everything comes from job/spec.json (script + voice timings, written by teardown/make.py). render(t) is deterministic.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { makePost } from '/core/three/post.js';
import { clamp, seg, ss, eio, track } from '/core/lib.js';
import { buildModule, mats } from './modules.js';
import { initOverlay, drawOverlay, overlayTexts } from './overlay.js';
import { initBlueprint } from './bp.js';
import { initIso } from './iso.js';
import { makeTimeline, W, H } from './timeline.js';

const Q = new URLSearchParams(location.search);
const SS = +(Q.get('ss') || 2);
const SPEC = await (await fetch('job/spec.json')).json();
const TL = makeTimeline(SPEC);
const { T } = TL;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(SS); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .92;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 2, 3000);
const LITE = Q.has('lite');
const post = makePost(renderer, scene, camera, W, H, { ssaa: SS, ao: !LITE, aoRadius: 3, aoThickness: 3, aoScale: 1.5, aoAmt: .6 });
post.bloom.strength = .38; post.bloom.radius = .45; post.bloom.threshold = 1.5;
post.vig.uniforms.amt.value = .34; post.vig.uniforms.contrast.value = .08; post.vig.uniforms.warm.value = .1;
{
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createRadialGradient(W * .5, H * .44, 60, W * .5, H * .5, H * .78);
  gr.addColorStop(0, '#34363a'); gr.addColorStop(.45, '#222427'); gr.addColorStop(1, '#0d0e10'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
try {
  const hdr = await new RGBELoader().loadAsync('hdri/studio.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  scene.environmentIntensity = .42; scene.environmentRotation = new THREE.Euler(0, 1.2, 0);
} catch { scene.add(new THREE.AmbientLight('#ffffff', .35)); }
RectAreaLightUniformsLib.init();
const key = new THREE.DirectionalLight('#fff1e2', 1.6);
key.castShadow = true; key.shadow.mapSize.set(LITE ? 2048 : 4096, LITE ? 2048 : 4096);
Object.assign(key.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 20, far: 900 });
key.shadow.bias = -.0003; key.shadow.normalBias = .08; key.shadow.radius = 5; key.shadow.blurSamples = 16;
scene.add(key, key.target);
const rim = new THREE.RectAreaLight('#dfe9ff', 4.2, 200, 60); scene.add(rim);
const top = new THREE.RectAreaLight('#ffffff', .5, 200, 200); scene.add(top);
const under = new THREE.RectAreaLight('#ffe9d2', 0, 120, 80); scene.add(under);
scene.add(new THREE.HemisphereLight('#c9d3e0', '#1a1712', .16));

// ---------- model ----------
const M = mats();
const MOD = buildModule(SPEC.kind, M);
const { cfg } = MOD;
const ROOTY = 22;
const P = (x, y, z) => new THREE.Vector3(x, y + ROOTY, z);
MOD.root.position.y = ROOTY; scene.add(MOD.root);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ color: '#000000', opacity: .4 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
// each tower's key layer gets its own glowing materials (so stop 1 and stop 2 light up separately)
const glowMats = MOD.towers.map((tw) => {
  const out = []; tw.layers[tw.key].obj.traverse((o) => { if (o.isMesh && o.material.emissive) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#ff6b3d'); o.material.emissiveIntensity = 0; out.push(o.material); } });
  return out;
});
// layer centres (tower-local, unexploded) for anchors and the camera
const box = new THREE.Box3();
MOD.root.updateMatrixWorld(true);
for (const tw of MOD.towers) tw.layers.forEach((l) => { box.setFromObject(l.obj); const c = box.getCenter(new THREE.Vector3()); l.cy = c.y - ROOTY; l.top = box.max.y - ROOTY; l.home = l.obj.position.y; });
const T1 = MOD.towers[0], T2 = MOD.towers[1] || null;
const S = Math.max(cfg.bw, cfg.bd), HT = Math.max(...MOD.towers.map((t) => t.spacing.at(-1) + t.h));
const stop2 = T2 ? { x: T2.x, y: T2.layers[T2.key].cy, z: T2.z, r: T2.r, layer: true } : MOD.tops[0] ? { x: MOD.tops[0].obj.position.x, y: 2, z: MOD.tops[0].obj.position.z, r: 5 } : { x: 0, y: 0, z: 0, r: 8 };

// ---------- motion ----------
const NL = Math.max(...MOD.towers.map((t) => t.layers.length));
const upAt = (i, n) => T.open + (n - 1 - i) * .15, downAt = (i) => T.close + i * .15;
const pop = (x) => 1 - Math.pow(1 - ss(x), 3);
const layerE = (i, n, t) => pop(seg(t, upAt(i, n), upAt(i, n) + 1.5)) * (1 - eio(seg(t, downAt(i), downAt(i) + .55)));
const floatAmt = (t) => (1 - seg(t, T.dive - .6, T.dive)) * seg(t, T.open + 1.6, T.open + 2.0) + seg(t, T.under - .2, T.under + .4) * (1 - seg(t, T.close - .4, T.close));
function layerY(tw, i, t) { const e = layerE(i, tw.layers.length, t); return tw.spacing[i] * e + e * e * 1.1 * Math.sin(t * 2.2 + i * .7) * clamp(floatAmt(t)); }

// ---------- camera keys (orbit form), from the module's size and the voice timings ----------
const kc = (tw) => [tw.x, tw.layers[tw.key].cy + tw.spacing[tw.key], tw.z];
const CAM = [
  [0, 0, 82, S * 3.4, [0, 6, 0], 30, 0, 0],
  [T.open - .2, 0, 80, S * 3.0, [0, 6, 0], 30, 0, 0],
  [T.open + 2.2, 30, 20, Math.max(HT * 3.6, S * 5.4), [0, HT / 2, 0], 30, 150, 40],
  [T.dive - .3, 4, 18, Math.max(HT * 3.5, S * 5.3), [0, HT / 2, 0], 30, 150, 40],
  [T.dive + 1.0, -26, 22, T1.r * 4 + 22, kc(T1), 34, 120, 120],
  [T.stop2 - .3, -10, 20, T1.r * 3.5 + 18, kc(T1), 34, 120, 120],
  [T.stop2 + .8, 24, 22, stop2.r * 4 + 24, [stop2.x, stop2.y + (stop2.layer ? T2.spacing[T2.key] : 0), stop2.z], 34, -120, 120],
  [T.under - .4, 34, 20, stop2.r * 3.6 + 20, [stop2.x, stop2.y + (stop2.layer ? T2.spacing[T2.key] : 0), stop2.z], 34, -120, 120],
  [T.under + .6, 12, -40, S * 2.35, [-3, -1.6, 1], 30, 0, -60],
  [T.close - .1, 22, -36, S * 2.25, [-3, -1.6, 1], 30, 0, -60],
  [T.close + .55, 30, 12, S * 3.9, [0, 6, 0], 30, 0, 0],
  [T.bpIn + .05, 0, 89.5, S * 6, [0, 2, 0], 30, 0, 0],
  [TL.DUR, 0, 89.5, S * 6, [0, 2, 0], 30, 0, 0],
].sort((a, b) => a[0] - b[0]);
const camAt = track(CAM.map(([t, az, el, dist, tg, fov, sx, sy]) => {
  const A = az * Math.PI / 180, E = el * Math.PI / 180, tgt = P(...tg);
  const eye = tgt.clone().add(new THREE.Vector3(dist * Math.cos(E) * Math.sin(A), dist * Math.sin(E), dist * Math.cos(E) * Math.cos(A)));
  return [t, [eye.x, eye.y, eye.z, tgt.x, tgt.y, tgt.z, fov, sx, sy]];
}));
function setCamera(t) {
  const [ex, ey, ez, tx, ty, tz, fov, sx, sy] = camAt(t);
  camera.position.set(ex, ey, ez); camera.fov = fov; camera.up.set(0, 1, 0);
  if (Math.abs(ey - ty) / Math.hypot(ex - tx, ey - ty, ez - tz) > .985) camera.up.set(0, 0, -1);
  camera.lookAt(tx, ty, tz); camera.setViewOffset(W, H, sx, sy, W, H); camera.updateProjectionMatrix();
  const dist = Math.hypot(ex - tx, ey - ty, ez - tz);
  post.dof.focus = dist; post.dof.aper = 520; post.dof.maxCoc = LITE ? 8 : 12;
  const A = Math.atan2(ex - tx, ez - tz), la = A - .9;
  key.position.set(-140 * Math.cos(la) + 40, 300, 140 * Math.sin(la) + 140); key.target.position.set(0, 30, 0);
  rim.position.set(150 * Math.sin(A + 2.6), 110, 150 * Math.cos(A + 2.6)); rim.lookAt(0, 40, 0);
  top.position.set(0, 300, 0); top.lookAt(0, 0, 0);
}

// stop-1 rings rising off the key layer (sound, light, heat: drawn the same way)
const RINGS = [];
for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(.955, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6b3d').multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); RINGS.push(m); }

// ---------- events (act A; B and C add theirs) ----------
const BP = await initBlueprint(SPEC, TL), ISO = await initIso(SPEC, TL);
const EV = [{ t: 0.0, type: 'hookPing' }, { t: T.open - .5, type: 'suck' }, { t: T.open, type: 'openHit' }];
for (let i = 0; i < NL; i++) EV.push({ t: upAt(i, NL) + .05, type: 'lift' }, { t: downAt(i) + .55, type: 'land' });
EV.push({ t: T.dive + .2, type: 'dive' }, { t: T.stop1 + .1, type: 'buzz', d: T.stop2 - T.stop1 - .4 }, { t: T.stop2, type: 'pull' }, { t: T.stop2 + .5, type: 'echoIn' }, { t: T.under - .2, type: 'dive' });
for (const k of ['labels', 'stop1', 'stop1b', 'stop2', 'back']) EV.push({ t: TL.LBL[k][0], type: 'label' });
EV.push(...BP.EV, ...ISO.EV);
EV.sort((a, b) => a.t - b.t);
window.EV = EV; window.DUR = TL.DUR;

// ---------- top view for the blueprint's Fig. 1 ----------
let FIG1;
{
  setCamera(T.bpIn + .2); camera.updateMatrixWorld();
  const pj = (v) => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
  const { bw, bd } = cfg, sc = pj(P(bw / 2, 0, 0))[0] - pj(P(0, 0, 0))[0];
  FIG1 = { c: [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [bw / 2, bd / 2], [-bw / 2, bd / 2]].map(([x, z]) => pj(P(x, 0, z))), s: sc / (bw / 2),
    towers: MOD.towers.map((tw) => ({ p: pj(P(tw.x, tw.h, tw.z)), r: tw.r * sc / (bw / 2), label: tw.label })),
    tops: MOD.tops.map((o) => pj(P(o.obj.position.x, 2, o.obj.position.z))),
    pins: MOD.pinTips.map((v, i) => [pj(P(...(cfg.edge === 'z' ? [v.x, 1.25, cfg.bd / 2] : [cfg.bw / 2, 1.25, v.z]))), pj(P(v.x, 1.25, v.z))]) };
}

// ---------- frame ----------
const wpos = (x, y, z) => P(x, y, z);
const layerWorld = (tw, i, dx = 0, dy = 0, dz = 0) => P(tw.x + dx, tw.layers[i].cy + (tw.layers[i].obj.position.y - tw.layers[i].home) + dy, tw.z + dz);
await initOverlay(SPEC, TL);
window.render = (t) => {
  if (t < T.bpOnly) {
    for (const tw of MOD.towers) tw.layers.forEach((l, i) => { l.obj.position.y = l.home + layerY(tw, i, t); });
    const b1 = seg(t, T.stop1, T.stop1 + .3) * (1 - seg(t, T.stop2 - .5, T.stop2 - .1)), b2 = seg(t, T.stop2 + .4, T.stop2 + .8) * (1 - seg(t, T.under - .5, T.under));
    for (const m of glowMats[0] || []) m.emissiveIntensity = b1 * (.35 + .25 * Math.sin(t * 2 * Math.PI * 6));
    for (const m of glowMats[1] || []) m.emissiveIntensity = b2 * (.5 + .3 * Math.sin(t * 2 * Math.PI * 6));
    under.intensity = 2.4 * seg(t, T.under - .5, T.under + .6) * (1 - seg(t, T.close - .4, T.close + .2));
    under.position.copy(P(0, -60, 30)); under.lookAt(P(0, 0, 0));
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const t0 = T.stop1 + .2 + i * .32, k = (t - t0) / 1.1;
      if (k < 0 || k > 1 || t > T.stop2 - .2) continue;
      const c = layerWorld(T1, T1.key); const m = RINGS[n++]; m.visible = true;
      m.position.set(c.x, c.y + 2 + k * 7, c.z); m.scale.setScalar(T1.r * .7 + k * 3.2); m.material.opacity = .75 * Math.sin(Math.PI * k);
    }
    for (; n < RINGS.length; n++) RINGS[n].visible = false;
    setCamera(t);
    post.composer.render();
  }
  drawOverlay(t, camera, { MOD, layerWorld, wpos, P, FIG1, BP, ISO });
};
window.TEXTS = () => overlayTexts();
await document.fonts.ready;
window.render(Number(Q.get('t') || 0));
window.READY = true;
