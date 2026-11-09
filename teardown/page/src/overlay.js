// Marks layer. Act A: anchored labels + bottom-strip subtitles; then hands the canvas to Act B (bp.js) and Act C (iso.js).
import * as THREE from 'three';
import { clamp, seg, ss, eo } from '/core/lib.js';
import { W, H } from './timeline.js';

const cv = document.getElementById('ov'), g = cv.getContext('2d');
const SANS = '"Inter", sans-serif', MONO = '"JBMono", monospace';
const INK = '#f1efe9', DIM = 'rgba(241,239,233,.64)', ACC = '#ff6b3d', LINE = 'rgba(241,239,233,.78)';
const SUBF = `600 42px ${SANS}`, SUB_SAFE = 960;

let CUES = [], texts = [], SPEC, TL;
export async function initOverlay(spec, tl) {
  SPEC = spec; TL = tl;
  const ls = spec.lines;
  CUES = ls.map((v, i) => ({ id: v.id, t0: v.t - .05, t1: Math.min(ls[i + 1] ? ls[i + 1].t - .06 : tl.DUR, Math.max(v.t + v.d + .6, v.t + 1.8)), text: v.sub }));
  window.CUES = CUES;
}
export const overlayTexts = () => texts;
export const cueAt = (t) => CUES.find((c) => t >= c.t0 && t <= c.t1);

const v3 = new THREE.Vector3();
let CAM;
const proj = (v) => { v3.copy(v).project(CAM); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H, v3.z]; };
const fade = (t, a, d = .3) => ss(seg(t, a, a + d));

function label(t, o) {
  const { t0, t1, a, idx, name, spec, id } = o;
  const { lx, ly } = o; const align = o.align || (lx > a[0] ? 'left' : 'right');
  const dl = eo(seg(t, t0, t0 + .32)), tx = fade(t, t0 + .14, .26), out = 1 - fade(t, t1 - .3, .3);
  if (dl <= 0 || out <= 0 || !name) return;
  const [ax, ay] = a, dir = align === 'left' ? 1 : -1, ex = lx - dir * 30;
  g.globalAlpha = out;
  g.fillStyle = INK; g.beginPath(); g.arc(ax, ay, 4, 0, 7); g.fill();
  g.strokeStyle = 'rgba(241,239,233,.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(ax, ay, 4 + 7 * dl, 0, 7); g.stroke();
  const s1 = Math.hypot(ex - ax, ly - ay), s2 = Math.abs(lx - dir * 12 - ex), len = (s1 + s2) * dl;
  g.strokeStyle = LINE; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ax, ay);
  if (len <= s1) g.lineTo(ax + (ex - ax) * len / s1, ay + (ly - ay) * len / s1);
  else { g.lineTo(ex, ly); g.lineTo(ex + dir * (len - s1), ly); }
  g.stroke();
  if (tx <= 0) return;
  g.globalAlpha = out * tx; const dx = (1 - tx) * 10 * dir;
  g.textAlign = align; g.textBaseline = 'alphabetic';
  const nf = `600 32px ${SANS}`;
  g.font = nf; const wn = g.measureText(name).width;
  g.font = `400 20px ${MONO}`; const ws = spec ? g.measureText(spec).width : 0;
  const w = Math.max(wn, ws);
  const px0 = align === 'left' ? lx - 10 : lx - w - 10, py0 = ly - 52, ph = spec ? 92 : 62;
  g.fillStyle = 'rgba(12,13,15,.55)'; g.fillRect(px0 + dx, py0, w + 20, ph);
  if (idx) { g.fillStyle = ACC; g.font = `600 17px ${MONO}`; g.fillText(idx, lx + dx, ly - 32); }
  g.fillStyle = INK; g.font = nf; g.fillText(name, lx + dx, ly + 2);
  if (spec) { g.fillStyle = DIM; g.font = `400 20px ${MONO}`; g.fillText(spec, lx + dx, ly + 30); }
  g.textAlign = 'left';
  if (tx > .99 && out > .99) texts.push({ id, text: name + (spec ? ' ' + spec : ''), x0: clamp(px0, 0, W), y0: py0, x1: clamp(px0 + w + 20, 0, W), y1: py0 + ph });
}
function subStrip(t) {
  const c = cueAt(t); if (!c) return;
  const k = Math.min(fade(t, c.t0, .12), 1 - fade(t, c.t1 - .12, .12));
  g.globalAlpha = k; g.textAlign = 'center'; g.font = SUBF; g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 16; g.fillStyle = INK;
  const lines = wrap(g, SUBF, c.text, SUB_SAFE);
  lines.forEach((ln, i) => g.fillText(ln, W / 2, 1772 - (lines.length - 1 - i) * 54));
  g.shadowBlur = 0; g.textAlign = 'left'; g.globalAlpha = 1;
}

export function drawOverlay(t, cam, ctx) {
  CAM = cam; texts = [];
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.globalAlpha = 1;
  const { MOD, layerWorld, BP, ISO } = ctx, { T, LBL } = TL, A = SPEC.A || {};
  if (t < T.bpOnly) {
    const note = A.note || `${MOD.cfg.name} · 3D MODEL`;
    { const a = Math.min(fade(t, LBL.note[0], .4), 1 - fade(t, LBL.note[1] - .4, .4));
      if (a > 0) { g.globalAlpha = a; g.font = `500 22px ${MONO}`; g.fillStyle = DIM; g.textAlign = 'center'; g.fillText(note.toUpperCase(), W / 2, 150); g.textAlign = 'left';
        if (a > .99) texts.push({ id: 'note', text: note, x0: 200, y0: 125, x1: 880, y1: 160 }); } }
    const T1 = MOD.towers[0], T2 = MOD.towers[1];
    // 1 · the primary tower's layers, top first, right column
    const [l0, l1] = LBL.labels;
    if (t > l0 - .05 && t < l1 + .1) {
      const ids = T1.layers.map((_, i) => i).reverse().slice(0, 5);
      const pts = ids.map((i) => proj(layerWorld(T1, i, T1.r * .9, 0, 1)));
      const ys = pts.map((p) => p[1]);
      for (let it = 0; it < 5; it++) for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < 104) { const m = (ys[i] + ys[i - 1]) / 2; ys[i - 1] = m - 52; ys[i] = m + 52; }
      ids.forEach((li, k) => label(t, { id: 'L' + li, t0: l0 + k * .25, t1: l1, a: pts[k], lx: 740, ly: clamp(ys[k], 220, 1560), idx: String(k + 1).padStart(2, '0'), name: T1.layers[li].name, spec: '', align: 'left' }));
    }
    // 2 · stop 1 (the sensing layer) and its second fact
    if (t > LBL.stop1[0] - .05 && t < LBL.stop1[1] + .1) {
      const a = proj(layerWorld(T1, T1.key, T1.r * .45, .2, T1.r * .2));
      label(t, { id: 'stop1', t0: LBL.stop1[0], t1: LBL.stop1[1], a, lx: clamp(a[0] + 150, 60, W - 360), ly: clamp(a[1] - 330, 220, 1500), name: A.stop1?.name, spec: A.stop1?.spec, align: 'left' });
    }
    if (t > LBL.stop1b[0] - .05 && t < LBL.stop1b[1] + .1) {
      const a = proj(layerWorld(T1, T1.key, -T1.r * .45, .2, T1.r * .2));
      label(t, { id: 'stop1b', t0: LBL.stop1b[0], t1: LBL.stop1b[1], a, lx: clamp(a[0] - 60, 360, W - 60), ly: clamp(a[1] + 300, 300, 1560), name: A.stop1b?.name, spec: A.stop1b?.spec, align: 'right' });
    }
    // 3 · stop 2 (second tower, or the comparator / pot)
    if (t > LBL.stop2[0] - .05 && t < LBL.stop2[1] + .1) {
      const v = T2 ? layerWorld(T2, T2.key, -T2.r * .45, .2, T2.r * .2) : ctx.P(MOD.tops[0]?.obj.position.x || 0, 2, MOD.tops[0]?.obj.position.z || 0);
      const a = proj(v);
      label(t, { id: 'stop2', t0: LBL.stop2[0], t1: LBL.stop2[1], a, lx: clamp(a[0] - 80, 360, W - 60), ly: clamp(a[1] - 330, 220, 1500), name: A.stop2?.name, spec: A.stop2?.spec, align: 'right' });
    }
    // 4 · the back of the board
    if (t > LBL.back[0] - .05 && t < LBL.back[1] + .1) {
      const items = (MOD.backs.length ? MOD.backs : MOD.tops).slice(0, 3);
      items.forEach((b, i) => {
        const v = new THREE.Vector3(); b.obj.getWorldPosition(v); v.y -= MOD.backs.length ? 1.7 : -1; const a = proj(v);
        const left = a[0] < W / 2;
        label(t, { id: 'back' + i, t0: LBL.back[0] + i * .1, t1: LBL.back[1], a, lx: left ? 70 : W - 70, ly: [1180, 1330, 1480][i], name: b.name, spec: '', align: left ? 'left' : 'right' });
      });
    }
    if (t < T.bpIn + .3) subStrip(t);
  }
  g.globalAlpha = 1;
  if (t >= T.bpIn && t < T.isoOnly) BP.draw(g, t, texts, ctx.FIG1);
  if (t >= T.isoIn) ISO.draw(g, t, texts);
  g.globalAlpha = 1;
}

export function wrap(c, font, s, safe) {
  c.font = font; if (c.measureText(s).width <= safe) return [s];
  const w = s.split(' '); let best = [s];
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '); if (c.measureText(a).width <= safe && c.measureText(b).width <= safe) { best = [a, b]; if (i >= w.length / 2) break; } }
  return best;
}
