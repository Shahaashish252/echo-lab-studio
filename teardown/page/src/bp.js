// Act B — Blueprint, driven by spec.B. One cyanotype sheet panned by a 2D camera: Fig. 1 (top view, matched to the 3D),
// Fig. 2 (signal rows), Fig. 3 (cause → effect sketch + equations + worked example), one red stamp. Notes = subtitles.
import { clamp, lerp, seg, ss, eo, track, mulberry } from '/core/lib.js';
import { W, H } from './timeline.js';
import { cueAt, wrap } from './overlay.js';

const SH = 3960;
const LINE = '#E7F0F9', LINE2 = 'rgba(231,240,249,.62)', RED = '#d23a2a';
const HAND = '"ArchDaughter", "Inter", sans-serif', MONO = '"JBMono", monospace';
const X0 = 160, X1 = 990, ROWY = [1600, 1800, 2000], HI = 80;
let SPEC, TL, VIEW, paper, g, now, texts, vt;
const tl = (id, dt = 0) => TL.t(id) + dt;

function makePaper() {
  const c = document.createElement('canvas'); c.width = W; c.height = SH; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, W * .3, SH); gr.addColorStop(0, '#1d3d7d'); gr.addColorStop(.5, '#22488f'); gr.addColorStop(1, '#1a3772');
  x.fillStyle = gr; x.fillRect(0, 0, W, SH);
  const r = mulberry(11);
  for (let i = 0; i < 2600; i++) { const px = r() * W, py = r() * SH, s = 20 + r() * 140; x.fillStyle = r() < .5 ? `rgba(10,25,70,${.03 + r() * .05})` : `rgba(70,120,200,${.02 + r() * .04})`; x.beginPath(); x.ellipse(px, py, s, s * (.3 + r() * .7), r() * 3, 0, 7); x.fill(); }
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(90,140,215,${.025 + r() * .03})`; x.fillRect(0, r() * SH, W, 2 + r() * 6); }
  for (let i = 0; i < 1400; i++) { const px = r() * W, py = r() * SH, l = 6 + r() * 18, a = r() * 6; x.strokeStyle = `rgba(200,220,245,${.04 + r() * .06})`; x.lineWidth = .8; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  x.strokeStyle = 'rgba(231,240,249,.05)'; x.lineWidth = 1;
  for (let px = 0; px <= W; px += 40) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, SH); x.stroke(); }
  for (let py = 0; py <= SH; py += 40) { x.beginPath(); x.moveTo(0, py); x.lineTo(W, py); x.stroke(); }
  for (const fy of [1330, 2330]) { x.fillStyle = 'rgba(200,225,255,.10)'; x.fillRect(0, fy, W, 3); x.fillStyle = 'rgba(5,15,45,.25)'; x.fillRect(0, fy + 3, W, 4); }
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(230,240,255,${.15 + r() * .3})`; x.beginPath(); x.arc(r() * W, r() * SH, .6 + r() * 1.4, 0, 7); x.fill(); }
  const v = x.createLinearGradient(0, 0, W, 0); v.addColorStop(0, 'rgba(120,165,225,.18)'); v.addColorStop(.06, 'rgba(0,0,0,0)'); v.addColorStop(.94, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(120,165,225,.18)');
  x.fillStyle = v; x.fillRect(0, 0, W, SH);
  return c;
}

// ---------- primitives (sheet coords) ----------
function nib(x, y) { g.save(); const gr = g.createRadialGradient(x, y, 0, x, y, 16); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(160,210,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); g.restore(); }
function path(pts, t0, t1, w = 3.2, col = LINE, dash = null) {
  const k = seg(now, t0, t1); if (k <= 0 || pts.length < 2) return;
  const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(l); tot += l; }
  let left = tot * k, hx = pts[0][0], hy = pts[0][1];
  g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; if (dash) g.setLineDash(dash);
  g.shadowColor = 'rgba(200,225,255,.55)'; g.shadowBlur = 3; g.beginPath(); g.moveTo(hx, hy);
  for (let i = 1; i < pts.length && left > 0; i++) { const f = Math.min(1, left / (L[i - 1] || 1)); hx = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f; hy = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f; g.lineTo(hx, hy); left -= L[i - 1]; }
  g.stroke(); g.restore(); if (k < 1) nib(hx, hy);
}
function circle(cx, cy, r, t0, t1, w = 3.2) {
  const k = seg(now, t0, t1); if (k <= 0) return;
  g.save(); g.strokeStyle = LINE; g.lineWidth = w; g.shadowColor = 'rgba(200,225,255,.55)'; g.shadowBlur = 3;
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke(); g.restore();
  if (k < 1) { const a = -Math.PI / 2 + k * Math.PI * 2; nib(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
}
function letter(txt, x, y, t0, dur, size = 44, opt = {}) {
  const k = seg(now, t0, t0 + dur); if (k <= 0 || !txt) return;
  g.save(); let f = `${opt.weight || 400} ${size}px ${opt.font || HAND}`; g.font = f;
  if (opt.max && g.measureText(txt).width > opt.max) { size = Math.floor(size * opt.max / g.measureText(txt).width); f = `${opt.weight || 400} ${size}px ${opt.font || HAND}`; g.font = f; }
  g.textAlign = opt.align || 'left'; g.textBaseline = 'alphabetic';
  const w = g.measureText(txt).width, x0 = opt.align === 'center' ? x - w / 2 : opt.align === 'right' ? x - w : x;
  g.beginPath(); g.rect(x0 - 4, y - size * 1.2, (w + 8) * k, size * 1.6); g.clip();
  g.fillStyle = opt.col || LINE; g.shadowColor = 'rgba(200,225,255,.5)'; g.shadowBlur = 3; g.fillText(txt, x, y); g.restore();
  if (k < 1) nib(x0 + w * k, y - size * .3);
  else if (opt.id) { const sy = y - vt; texts.push({ id: opt.id, text: txt, x0: clamp(x0, 0, W), y0: sy - size, x1: clamp(x0 + w, 0, W), y1: sy + size * .3 }); }
}
const hasSym = (s) => /[÷µ×°Ω±≈→²³√]/.test(s || '');
const fontFor = (s) => (hasSym(s) ? { font: MONO, weight: 500 } : {});
function balloon(n, x, y, t0) { circle(x, y, 22, t0, t0 + .3, 2); letter(String(n), x, y + 10, t0 + .2, .15, 28, { align: 'center' }); }
function dim(xa, xb, y, t0, txt, id, up = true) {
  path([[xa, y], [xb, y]], t0, t0 + .35, 1.4);
  for (const x of [xa, xb]) path([[x - 8, y + 8], [x + 8, y - 8]], t0 + .2, t0 + .35, 1.4);
  for (const x of [xa, xb]) path([[x, y + (up ? 26 : -26)], [x, y - (up ? 14 : -14)]], t0, t0 + .2, 1.1);
  letter(txt, (xa + xb) / 2, y - 14, t0 + .3, .3, 28, { align: 'center', id, font: MONO, weight: 500, max: 900 });
}
function hatch(x0, y0, x1, y1, t0, t1) { for (let x = x0; x < x1 + (y1 - y0); x += 14) path([[Math.min(x, x1), y0 + Math.max(0, x - x1)], [Math.max(x0, x - (y1 - y0)), y1 - Math.max(0, x0 - (x - (y1 - y0)))]], t0, t1, 1.1, LINE2); }

// ---------- Fig. 1: the module from above, drawn over the 3D top view ----------
function fig1(F) {
  const t0 = TL.T.bpIn + .05, c = F.c;
  path([...c, c[0]], t0, t0 + .45, 3.2);
  F.towers.forEach((tw, i) => { circle(tw.p[0], tw.p[1], tw.r, t0 + .15 + i * .05, t0 + .5 + i * .05); circle(tw.p[0], tw.p[1], tw.r * .7, t0 + .3, t0 + .6, 1.4);
    if (tw.label.length <= 3) letter(tw.label, tw.p[0], tw.p[1] + tw.r + 50, t0 + .5, .2, 40, { align: 'center' }); });
  for (const p of F.tops) path([[p[0] - 30, p[1] - 30], [p[0] + 30, p[1] - 30], [p[0] + 30, p[1] + 30], [p[0] - 30, p[1] + 30], [p[0] - 30, p[1] - 30]], t0 + .3, t0 + .6, 1.6);
  F.pins.forEach(([a, b], i) => path([a, b], t0 + .35 + i * .04, t0 + .55 + i * .04, 2));
  letter(`FIG. 1 — ${SPEC.B.fig1 || SPEC.title || ''}`, W / 2, Math.min(...c.map((p) => p[1])) - 120, t0 + .2, .4, 40, { align: 'center', max: 940 });
}
// ---------- Fig. 2: signal rows ----------
function row(r, y, t0, i) {
  const xa = X0 + clamp(r.a ?? .1) * (X1 - X0), xb = X0 + clamp(r.b ?? .4) * (X1 - X0), kind = r.kind || 'pulse';
  letter((r.name || '').toUpperCase(), 30, y - 20, TL.T.bpIn + 1.2, .3, (r.name || '').length > 6 ? 22 : 30, { id: 'rn' + i, max: 125 });
  let pts;
  if (kind === 'burst') { pts = [[X0, y], [xa, y]]; const n = 8, w = (xb - xa) / n; for (let k = 0; k < n; k++) { const x = xa + k * w; pts.push([x, y - 70], [x + w / 2, y - 70], [x + w / 2, y], [x + w, y]); } pts.push([X1, y]); }
  else if (kind === 'ramp') { pts = [[X0, y], [xa, y]]; for (let k = 1; k <= 20; k++) { const u = k / 20; pts.push([xa + (xb - xa) * u, y - HI * (1 - Math.pow(1 - u, 2.2))]); } pts.push([X1, y - HI]); }
  else if (kind === 'step') pts = [[X0, y], [xa, y], [xa, y - HI], [X1, y - HI]];
  else if (kind === 'wave') { pts = [[X0, y - HI / 2], [xa, y - HI / 2]]; for (let k = 1; k <= 60; k++) { const u = k / 60; pts.push([xa + (xb - xa) * u, y - HI / 2 - Math.sin(u * Math.PI * 12) * HI / 2 * Math.sin(u * Math.PI)]); } pts.push([X1, y - HI / 2]); }
  else if (kind === 'flat') pts = [[X0, y], [X1, y]];
  else pts = [[X0, y], [xa, y], [xa, y - HI], [xb, y - HI], [xb, y], [X1, y]];   // pulse / high
  path(pts, t0, t0 + .9, kind === 'burst' ? 2.4 : 3.2);
  if (!r.label) return;
  if (kind === 'high' || kind === 'pulse' && xb - xa > 200) dim(xa, xb, y + 60, t0 + .8, r.label, 'rl' + i, false);
  else if (kind === 'pulse') dim(xa, xb, y - HI - 30, t0 + .8, r.label, 'rl' + i);
  else { balloon(i + 1, Math.min(xb + 60, X1 - 300), y - 140, t0 + .8); letter(r.label, Math.min(xb + 100, X1 - 260), y - 128, t0 + 1.0, .4, 30, { id: 'rl' + i, font: MONO, weight: 500, max: 300 }); }
}
function fig2() {
  const B = SPEC.B, tA = TL.T.bpIn + .95;
  letter(`FIG. 2 — ${(B.fig2 || 'SIGNAL').toUpperCase()}`, W / 2, 1450, tA, .4, 44, { align: 'center', id: 'f2', max: 940 });
  (B.rows || []).slice(0, 3).forEach((r, i) => row(r, ROWY[i], Math.max(tl('b' + (i + 1), .6), tA + .3), i));
  path([[X0, 2140], [X1, 2140]], tl('b3', 1.4), tl('b3', 1.8), 1.4); path([[X1 - 18, 2130], [X1, 2140], [X1 - 18, 2150]], tl('b3', 1.75), tl('b3', 1.9), 1.4);
  letter('time →  (not to scale)', X1, 2185, tl('b3', 1.6), .4, 26, { align: 'right', font: MONO, id: 'axis' });
}
// ---------- Fig. 3: cause → effect, then the maths ----------
function target(kind, x, y, t0) {
  const t1 = t0 + .4;
  if (kind === 'wall') { path([[x, y], [x, y + 250]], t0, t1); hatch(x, y, x + 40, y + 250, t0 + .15, t1 + .2); }
  else if (kind === 'light' || kind === 'sun') { circle(x + 20, y + 120, 40, t0, t1); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; path([[x + 20 + Math.cos(a) * 55, y + 120 + Math.sin(a) * 55], [x + 20 + Math.cos(a) * 85, y + 120 + Math.sin(a) * 85]], t0 + .2, t1 + .2, 2); } }
  else if (kind === 'flame') path([[x + 20, y + 30], [x + 60, y + 130], [x + 45, y + 200], [x + 20, y + 215], [x - 5, y + 200], [x - 20, y + 130], [x + 20, y + 30]], t0, t1 + .2);
  else if (kind === 'hand') { path([[x - 10, y + 250], [x - 10, y + 120], [x + 60, y + 120], [x + 60, y + 250]], t0, t1); for (let k = 0; k < 4; k++) path([[x - 2 + k * 18, y + 120], [x - 2 + k * 18, y + 40 + Math.abs(k - 1.5) * 15]], t0 + .2, t1 + .2, 2.4); }
  else if (kind === 'gas') { for (const [dx, dy, r] of [[0, 110, 40], [45, 80, 45], [70, 135, 38]]) circle(x + dx, y + dy, r, t0, t1, 2.4); }
  else if (kind === 'water') { path([[x - 30, y + 60], [x - 30, y + 250], [x + 90, y + 250], [x + 90, y + 60]], t0, t1); for (let k = 0; k < 3; k++) { const pts = []; for (let u = 0; u <= 12; u++) pts.push([x - 30 + u * 10, y + 140 + k * 30 + Math.sin(u) * 6]); path(pts, t0 + .2 + k * .05, t1 + .2, 1.6, LINE2); } }
  else if (kind === 'sound') { path([[x - 20, y + 95], [x + 10, y + 95], [x + 50, y + 55], [x + 50, y + 195], [x + 10, y + 155], [x - 20, y + 155], [x - 20, y + 95]], t0, t1); }
  else if (kind === 'heat' || kind === 'person') { circle(x + 20, y + 40, 28, t0, t1, 2.4); path([[x + 20, y + 68], [x + 20, y + 170], [x - 10, y + 250]], t0 + .1, t1 + .1, 2.4); path([[x + 20, y + 170], [x + 50, y + 250]], t0 + .1, t1 + .1, 2.4); path([[x - 20, y + 110], [x + 60, y + 110]], t0 + .2, t1 + .2, 2.4); }
  else if (kind === 'soil') { path([[x - 40, y + 120], [x + 100, y + 120], [x + 100, y + 250], [x - 40, y + 250], [x - 40, y + 120]], t0, t1); for (let k = 0; k < 14; k++) circle(x - 25 + (k * 37) % 120, y + 140 + ((k * 53) % 100), 3, t0 + .2, t1 + .1, 1.4); }
  else path([[x - 20, y + 80], [x + 60, y + 80], [x + 60, y + 200], [x - 20, y + 200], [x - 20, y + 80]], t0, t1);
}
function fig3() {
  const B = SPEC.B, s = B.sketch || {}, t0 = tl('b4', .5), y0 = 2440, tx = s.target === 'wall' ? 920 : 860;
  letter(`FIG. 3 — ${(B.fig3 || 'KAISE').toUpperCase()}`, W / 2, 2400, tl('b4', .45), .35, 44, { align: 'center', id: 'f3', max: 940 });
  path([[120, y0 + 40], [230, y0 + 40], [230, y0 + 200], [120, y0 + 200], [120, y0 + 40]], t0, t0 + .3, 3.2);
  path([[230, y0 + 70], [262, y0 + 70], [262, y0 + 110], [230, y0 + 110]], t0 + .1, t0 + .35, 2);
  path([[230, y0 + 130], [262, y0 + 130], [262, y0 + 170], [230, y0 + 170]], t0 + .15, t0 + .4, 2);
  target(s.target || 'object', tx, y0, t0 + .1);
  if (s.targetLabel) letter(s.targetLabel, tx + 20, y0 + 300, t0 + .3, .3, 30, { align: 'center', id: 'tl', max: 260 });
  const ex = tx - 20;
  if (s.out) { path([[270, y0 + 90], [ex, y0 + 90]], t0 + .3, t0 + .9, 2.4); path([[ex - 20, y0 + 78], [ex, y0 + 90], [ex - 20, y0 + 102]], t0 + .85, t0 + .95, 2.4); letter(s.out, (270 + ex) / 2, y0 + 70, t0 + .5, .3, 30, { align: 'center', id: 'so', ...fontFor(s.out), max: 560 }); }
  if (s.back) { path([[ex, y0 + 150], [270, y0 + 150]], t0 + .95, t0 + 1.55, 2.4, LINE2); path([[290, y0 + 138], [270, y0 + 150], [290, y0 + 162]], t0 + 1.5, t0 + 1.6, 2.4, LINE2); letter(s.back, (270 + ex) / 2, y0 + 210, t0 + 1.6, .45, 30, { align: 'center', id: 'sb', ...fontFor(s.back), max: 560 }); }
  if (s.dim) dim(262, ex, y0 + 290, t0 + 1.7, s.dim, 'sd', false);
  const eqs = B.eqs || [], ys = [2830, 3000, 3170];
  const at = [tl('b4', Math.min(2.6, TL.L.b4.d * .55)), tl('b5', .1), tl('b6', .1)];
  eqs.slice(0, 3).forEach((e, i) => letter(e, W / 2, ys[i], at[i], .9, 50, { align: 'center', id: 'eq' + i, font: MONO, weight: 500, max: 940 }));
  if (eqs[1]) { path([[110, 2930], [970, 2930], [970, 3030], [110, 3030], [110, 2930]], tl('b5', 1.1), tl('b5', 1.7), 2.4); path([[120, 2940], [960, 2940], [960, 3020], [120, 3020], [120, 2940]], tl('b5', 1.3), tl('b5', 1.9), 1.1); }
}
function stamp() {
  const t0 = tl('b6', Math.min(1.6, TL.L.b6.d * .6)), txt = SPEC.B.stamp; if (!txt || now < t0) return;
  const k = eo(seg(now, t0, t0 + .12)), s = lerp(1.6, 1, k);
  g.save(); g.font = `700 60px ${MONO}`; const w = Math.max(300, g.measureText(txt).width + 70);
  g.translate(770 - Math.max(0, w - 300) / 2, 3320); g.rotate(-.12); g.scale(s, s); g.globalAlpha = k * .92;
  g.strokeStyle = RED; g.fillStyle = RED; g.lineWidth = 6; g.strokeRect(-w / 2, -55, w, 110); g.lineWidth = 2; g.strokeRect(-w / 2 + 10, -45, w - 20, 90);
  g.textAlign = 'center'; g.fillText(txt, 0, 22); g.restore();
  if (k > .99) texts.push({ id: 'stamp', text: txt, x0: clamp(770 - w, 0, W), y0: 3260 - vt, x1: clamp(770 + w / 2, 0, W), y1: 3380 - vt });
}
function titleBlock() {
  const t0 = TL.T.bpIn + .7, y = 3700;
  path([[40, y], [1040, y], [1040, y + 180], [40, y + 180], [40, y]], t0, t0 + .6, 2.4);
  path([[620, y], [620, y + 180]], t0 + .3, t0 + .5, 1.4); path([[620, y + 90], [1040, y + 90]], t0 + .4, t0 + .6, 1.4);
  letter(`${SPEC.moduleName || ''} · ${(SPEC.B.sheet || 'HOW IT WORKS').toUpperCase()}`, 70, y + 75, t0 + .4, .5, 30, { font: MONO, max: 530 });
  letter('ECHO LAB 3D', 70, y + 140, t0 + .5, .4, 26, { font: MONO });
  letter('SHEET 2 / 3', 650, y + 60, t0 + .5, .3, 26, { font: MONO });
  letter('NOT TO SCALE', 650, y + 150, t0 + .6, .3, 26, { font: MONO });
}
function note(t) {
  const c = cueAt(t); if (!c || !c.id.startsWith('b')) return;
  const font = hasSym(c.text) ? `500 38px ${MONO}` : `400 46px ${HAND}`, lines = wrap(g, font, c.text, 860);
  const k = seg(t, c.t0, c.t0 + .35), out = 1 - seg(t, c.t1 - .15, c.t1);
  const bh = 70 + lines.length * 56, by = 1600 - bh / 2;
  g.save(); g.globalAlpha = out;
  g.fillStyle = 'rgba(30,64,130,.82)'; g.fillRect(70, by, 940, bh);
  g.strokeStyle = LINE; g.lineWidth = 2; g.strokeRect(70, by, 940, bh); g.lineWidth = 1; g.strokeRect(78, by + 8, 924, bh - 16);
  g.font = `500 20px ${MONO}`; g.fillStyle = LINE2; g.fillText(`NOTE / ${c.id.slice(1)}`, 96, by + 36);
  g.beginPath(); g.rect(80, by, 920 * k, bh); g.clip();
  g.font = font; g.fillStyle = LINE; g.textAlign = 'center'; lines.forEach((ln, j) => g.fillText(ln, W / 2, by + 88 + j * 56));
  g.restore();
}

export async function initBlueprint(spec, timeline) {
  SPEC = spec; TL = timeline;
  const f = new FontFace('ArchDaughter', 'url(fonts/ArchitectsDaughter-Regular.ttf)'); await f.load(); document.fonts.add(f);
  paper = makePaper();
  const T = TL.T, p1 = T.bpIn + .6, p3 = tl('b4', -.1);
  VIEW = track([[T.bpIn, [0]], [p1, [0]], [p1 + .55, [1000]], [p3, [1000]], [p3 + .7, [1980]], [T.isoOnly + .3, [2040]]]);
  const EV = [{ t: T.bpIn, type: 'sheet' }, { t: p1, type: 'pull' }, { t: p3, type: 'pull' }];
  const pen = (t, d) => EV.push({ t, type: 'pen', d });
  pen(T.bpIn + .05, .7); pen(T.bpIn + .95, .5);
  for (let i = 1; i <= 3; i++) pen(Math.max(tl('b' + i, .6), T.bpIn + 1.25), 1.0);
  pen(tl('b4', .5), 1.6); for (const id of ['b4', 'b5', 'b6']) pen(tl(id, .1), .9);
  if (spec.B.stamp) EV.push({ t: tl('b6', Math.min(1.6, TL.L.b6.d * .6)), type: 'stamp' });
  return { EV, draw };
}
function draw(ctx, t, tx, F) {
  g = ctx; now = t; texts = tx; vt = VIEW(t)[0];
  g.save(); g.globalAlpha = ss(seg(t, TL.T.bpIn, TL.T.bpOnly)); g.drawImage(paper, 0, vt, W, H, 0, 0, W, H); g.restore();
  g.save(); g.translate(0, -vt); fig1(F); fig2(); fig3(); titleBlock(); stamp(); g.restore();
  note(t);
}
