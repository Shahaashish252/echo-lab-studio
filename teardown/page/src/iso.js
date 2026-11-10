// Act C — Isometric Infographic, driven by spec.C. True isometric, three tones per face, ink only for infographic furniture.
// Stations: range (c1) · uses (c2) · limits (c3) · isotype count (c4) · legend card (c5).
import { clamp, lerp, seg, ss, eo, back, track } from '/core/lib.js';
import { W, H } from './timeline.js';
import { cueAt, wrap } from './overlay.js';

const C30 = Math.cos(Math.PI / 6);
const GROUND = '#EFE9DD', INK = '#2B2A33', HALO = 'rgba(239,233,221,.92)', GREY = '#8a8794';
const COL = { plinth: '#CDBFA6', soil: '#A88F6E', sensor: '#2E6FD8', can: '#B9BFC8', wall: '#7A7F8C', coral: '#E8664A', teal: '#3AA6A0', water: '#5DA9E9', mustard: '#E2B13C', lav: '#9C8CC9', dark: '#3a3d46', green: '#5BA86A', white: '#F4F1EA', wood: '#B98A5E', red: '#D9483B' };
const SANS = '"Jost", "Inter", sans-serif', MONO = '"JBMono", monospace';
const ST = [[0, 0], [10, 10], [20, 20], [30, 30]];
let SPEC, TL, CAMK, g, now, texts, cx, cy, k, TT;
const tl = (id, dt = 0) => TL.t(id) + dt;
const hex6 = (s) => (/^#[0-9a-f]{3}$/i.test(s) ? '#' + [...s.slice(1)].map((c) => c + c).join('') : s);
const mix = (a, b, f) => { const p = (s) => [1, 3, 5].map((i) => parseInt(hex6(s).slice(i, i + 2), 16)); const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * f)).join(',')})`; };
const tones = (c) => [mix(c, '#FFF8EC', .22), c, mix(c, '#231A2C', .24)];
const P = (x, y, z) => [W / 2 + ((x - cx) - (y - cy)) * C30 * k, H * .46 + (((x - cx) + (y - cy)) * .5 - z) * k];
function poly(pts, fill) { g.beginPath(); pts.forEach((p, i) => { const [sx, sy] = P(...p); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); }); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = fill; g.lineWidth = 1; g.stroke(); }
function box(x, y, z, w, d, h, c) {
  const [tp, lf, rt] = tones(c);
  poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], rt);
  poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], lf);
  poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], tp);
}
function cyl(x, y, z, r, h, c, topCol) {
  const [tp, lf, rt] = tones(c), rx = r * C30 * 1.4142 * k * .8165, ry = rx * .57735;
  const [bx, by] = P(x, y, z), [tx, ty] = P(x, y, z + h);
  const gr = g.createLinearGradient(bx - rx, 0, bx + rx, 0); gr.addColorStop(0, lf); gr.addColorStop(.55, lf); gr.addColorStop(.56, rt); gr.addColorStop(1, rt);
  g.fillStyle = gr; g.beginPath(); g.ellipse(bx, by, rx, ry, 0, 0, Math.PI); g.lineTo(tx - rx, ty); g.ellipse(tx, ty, rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
  g.fillStyle = topCol || tp; g.beginPath(); g.ellipse(tx, ty, rx, ry, 0, 0, 7); g.fill();
}
function dome(x, y, z, r, c) { const [tp, , rt] = tones(c), [sx, sy] = P(x, y, z), rx = r * C30 * 1.4142 * k * .8165; const gr = g.createLinearGradient(sx - rx, sy - rx, sx + rx, sy); gr.addColorStop(0, tp); gr.addColorStop(1, rt); g.fillStyle = gr; g.beginPath(); g.ellipse(sx, sy, rx, rx * .57735, 0, 0, Math.PI); g.ellipse(sx, sy, rx, rx * .9, 0, Math.PI, 0); g.fill(); }
function plinth(i, t0) {
  const e = back(seg(now, t0, t0 + .5), 1.4); if (e <= 0) return 0;
  const [x, y] = ST[i], z = -1.2 - (1 - e) * 6;
  g.save(); g.globalAlpha = clamp(e * 3);
  const [sx, sy] = P(x, y, -2.6); g.fillStyle = 'rgba(60,50,40,.12)'; g.beginPath(); g.ellipse(sx, sy + 30, 6.2 * C30 * k, 3.1 * C30 * k, 0, 0, 7); g.fill();
  box(x - 4.5, y - 4.5, z - .9, 9, 9, .9, COL.soil); box(x - 4.5, y - 4.5, z, 9, 9, 1.2, COL.plinth);
  g.restore(); return e;
}
function drop(t0) { const e = seg(now, t0, t0 + .35); if (e <= 0) return null; const land = seg(now, t0 + .35, t0 + .6); return (1 - eo(e)) * 5 * (1 - .18 * Math.sin(Math.PI * land)); }
// the module as an iso icon: a blue slab with its sensing parts
function sensor(x, y, z, s = 1) {
  const kind = SPEC.kind;
  box(x - 2.25 * s, y - 1 * s, z, 4.5 * s, 2 * s, .2 * s, COL.sensor);
  if (kind === 'ultrasonic') { cyl(x - 1.3 * s, y, z + .2 * s, .8 * s, 1.2 * s, COL.can, '#4b4f57'); cyl(x + 1.3 * s, y, z + .2 * s, .8 * s, 1.2 * s, COL.can, '#4b4f57'); }
  else if (kind === 'pir') dome(x, y, z + .2 * s, 1.1 * s, COL.white);
  else if (kind === 'gas') cyl(x - .6 * s, y, z + .2 * s, .9 * s, 1 * s, '#C9CDD3', '#9aa0a8');
  else if (kind === 'dht') box(x - 1.4 * s, y - .6 * s, z + .2 * s, 1.2 * s, 1.2 * s, 1.4 * s, '#3a7ad8');
  else if (kind === 'sound') cyl(x - 1.3 * s, y, z + .2 * s, .5 * s, .7 * s, COL.can, '#151517');
  else if (kind === 'soil') { box(x - 4.6 * s, y - .8 * s, z, 2.4 * s, .4 * s, .15 * s, '#d9b46a'); box(x - 4.6 * s, y + .4 * s, z, 2.4 * s, .4 * s, .15 * s, '#d9b46a'); }
  else if (kind === 'ldr') cyl(x - 1.3 * s, y, z + .2 * s, .3 * s, .3 * s, '#c9a173');
  else { cyl(x - 1.3 * s, y - .4 * s, z + .2 * s, .28 * s, .8 * s, '#dfe8ff'); cyl(x - 1.3 * s, y + .4 * s, z + .2 * s, .28 * s, .8 * s, '#222'); }
}
// ---------- props ----------
const PROPS = {
  car: (x, y, z) => { box(x - 1.5, y - .8, z + .3, 3, 1.6, .7, COL.coral); box(x - .6, y - .7, z + 1, 1.4, 1.4, .55, COL.coral); for (const [a, b] of [[-1, -.85], [1, -.85], [-1, .65], [1, .65]]) box(x + a - .3, y + b, z, .6, .2, .5, COL.dark); },
  tank: (x, y, z) => { cyl(x, y, z, 1.4, 2.6, COL.teal, '#5ec0ba'); },
  robot: (x, y, z) => { box(x - .9, y - .9, z + .3, 1.8, 1.8, 1.2, COL.mustard); box(x - .9, y - 1.1, z, .5, .2, .6, COL.dark); box(x + .4, y - 1.1, z, .5, .2, .6, COL.dark); box(x - .5, y + .9, z + .9, 1, .15, .35, COL.sensor); },
  lamp: (x, y, z) => { box(x - .15, y - .15, z, .3, .3, 3.6, COL.dark); box(x - .15, y - .15, z + 3.4, 1.4, .3, .2, COL.dark); box(x + .7, y - .3, z + 3.1, .7, .6, .3, COL.mustard); },
  light: (x, y, z) => { cyl(x, y, z, .35, .6, COL.dark); dome(x, y, z + .6, .8, '#FFE48A'); },
  fan: (x, y, z) => { cyl(x, y, z, .9, .25, COL.dark); box(x - .1, y - .1, z + .25, .2, .2, 1.8, COL.dark); cyl(x, y, z + 2.05, 1.3, .15, '#9fb8d8'); },
  plant: (x, y, z) => { cyl(x, y, z, .8, .9, COL.wood); dome(x, y, z + .9, 1.0, COL.green); },
  door: (x, y, z) => { box(x - .2, y - 1.2, z, .4, 2.4, 3.2, COL.wood); box(x + .2, y + .6, z + 1.5, .1, .3, .3, COL.dark); },
  person: (x, y, z) => { box(x - .35, y - .3, z, .7, .6, 1.5, COL.lav); cyl(x, y, z + 1.5, .38, .55, '#E6B996'); },
  house: (x, y, z) => { box(x - 1.4, y - 1.2, z, 2.8, 2.4, 1.8, COL.white); box(x - 1.5, y - 1.3, z + 1.8, 3, 2.6, .35, COL.red); },
  phone: (x, y, z) => { box(x - .5, y - .9, z, 1, 1.8, .15, COL.dark); box(x - .42, y - .8, z + .15, .84, 1.6, .02, '#7fb5ff'); },
  bell: (x, y, z) => { box(x - .1, y - .1, z, .2, .2, 1.4, COL.dark); dome(x, y, z + 1.4, .7, COL.red); },
  stove: (x, y, z) => { box(x - 1.4, y - .9, z, 2.8, 1.8, .5, COL.dark); cyl(x - .6, y, z + .5, .45, .08, '#555'); cyl(x + .6, y, z + .5, .45, .08, '#555'); },
  dustbin: (x, y, z) => { cyl(x, y, z, .8, 1.6, COL.green); cyl(x, y, z + 1.6, .85, .15, COL.dark); },
  tap: (x, y, z) => { box(x - .2, y - .2, z, .4, .4, 1.6, '#c9ccd1'); box(x - .2, y - .2, z + 1.4, 1.1, .4, .25, '#c9ccd1'); },
  candle: (x, y, z) => { cyl(x, y, z, .35, 1.1, COL.white); dome(x, y, z + 1.2, .25, '#FF9A3D'); },
  speaker: (x, y, z) => { box(x - .8, y - .6, z, 1.6, 1.2, 1.8, COL.dark); cyl(x, y + .6, z + .9, .45, .05, '#666'); },
  sun: (x, y, z) => { dome(x, y, z + 3.5, .9, '#FFD24A'); },
  dust: (x, y, z) => { for (const [a, b, c] of [[0, 0, 1.8], [.6, .3, 2.2], [-.5, .4, 2.4]]) dome(x + a, y + b, z + c, .6, '#c8c2b6'); },
  rough: (x, y, z) => { box(x - 1.3, y - .7, z, 2.6, 1.4, .5, COL.lav); for (let i = 0; i < 5; i++) box(x - 1.2 + i * .5, y - .6, z + .5, .3, 1.2, .25 + .25 * ((i * 7) % 3) / 2, COL.lav); },
  small: (x, y, z) => { box(x - .3, y - .3, z, .6, .6, .6, COL.lav); },
  wall: (x, y, z) => { box(x - .25, y - 1.2, z, .5, 2.4, 1.4, COL.wall); },
  water: (x, y, z) => { box(x - 1.2, y - 1.2, z, 2.4, 2.4, .25, COL.water); },
  sensor: (x, y, z) => sensor(x, y, z, .4),
};
const prop = (name, x, y, z) => (PROPS[name] || PROPS.small)(x, y, z);
const propH = { car: 1.6, tank: 2.8, robot: 1.6, lamp: 3.7, light: 1.6, fan: 2.2, plant: 1.9, door: 3.2, person: 2.1, house: 2.2, phone: .3, bell: 2.1, stove: .6, dustbin: 1.8, tap: 1.7, candle: 1.4, speaker: 1.8, sun: 4.3, dust: 2.8, rough: .9, small: .6, wall: 1.4, water: .3, sensor: .6 };

function pin(id, x, y, z, t0, t1, text, sub, dx = 1, dy = -1, len = 120) {
  if (!text) return;
  const a = seg(now, t0, t0 + .3), out = 1 - seg(now, t1 - .25, t1); if (a <= 0 || out <= 0) return;
  const [px, py] = P(x, y, z), ey = py + dy * len * eo(a), rx = px + dx * 46 * eo(a);
  g.save(); g.globalAlpha = out; g.strokeStyle = INK; g.lineWidth = 2;
  g.fillStyle = GROUND; g.beginPath(); g.arc(px, py, 6, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(px, py + dy * 6); g.lineTo(px, ey); g.lineTo(rx, ey); g.stroke();
  const tk = seg(now, t0 + .2, t0 + .45);
  if (tk > 0) {
    g.globalAlpha = out * tk; g.lineJoin = 'round'; g.font = `600 36px ${SANS}`;
    let w = g.measureText(text).width; if (sub) { g.font = `400 24px ${MONO}`; w = Math.max(w, g.measureText(sub).width); }
    let tx = dx > 0 ? rx + 10 : rx - 10 - w; tx = clamp(tx, 20, W - 20 - w);   // never off the frame
    g.textAlign = 'left'; g.font = `600 36px ${SANS}`; g.strokeStyle = HALO; g.lineWidth = 9; g.strokeText(text, tx, ey + 12); g.fillStyle = INK; g.fillText(text, tx, ey + 12);
    if (sub) { g.font = `400 24px ${MONO}`; g.strokeText(sub, tx, ey + 44); g.fillStyle = '#5a5866'; g.fillText(sub, tx, ey + 44); }
    if (tk > .99 && out > .99) texts.push({ id, text: text + (sub ? ' ' + sub : ''), x0: tx, y0: ey - 26, x1: tx + w, y1: ey + (sub ? 52 : 20) });
  }
  g.restore();
}
function inkLine(pts, t0, t1, dash, w = 2.4, col = INK) {
  const e = seg(now, t0, t1); if (e <= 0) return; const sp = pts.map((p) => P(...p));
  let L = 0; const sl = []; for (let i = 1; i < sp.length; i++) { const l = Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]); sl.push(l); L += l; }
  let left = L * e; g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; if (dash) g.setLineDash(dash);
  g.beginPath(); g.moveTo(...sp[0]); for (let i = 1; i < sp.length && left > 0; i++) { const f = Math.min(1, left / sl[i - 1]); g.lineTo(sp[i - 1][0] + (sp[i][0] - sp[i - 1][0]) * f, sp[i - 1][1] + (sp[i][1] - sp[i - 1][1]) * f); left -= sl[i - 1]; }
  g.stroke(); g.restore();
}
function arcs(x, y, z, t0, t1, n = 3, strong = 1) {
  if (now < t0 || now > t1) return;
  for (let i = 0; i < n; i++) { const ph = ((now - t0) * 1.4 + i / n) % 1, [sx, sy] = P(x, y, z + ph * 2.4); g.save(); g.globalAlpha = (1 - ph) * .9 * strong; g.strokeStyle = COL.sensor; g.lineWidth = 3; g.beginPath(); g.ellipse(sx, sy, (12 + ph * 40) * k / 70, (6 + ph * 20) * k / 70, 0, Math.PI, 0); g.stroke(); g.restore(); }
}

// ---------- stations ----------
function sRange() {
  const R = SPEC.C.range || {}, t0 = tl('c1', -.25), tEnd = tl('c2', .7);
  if (plinth(0, t0) <= 0) return;
  const d = drop(t0 + .3); if (d === null) return;
  const beam = R.beam || 'cone', tx = -1.3;
  if (beam === 'cone') {
    const ce = seg(now, t0 + .75, t0 + 1.55), top = 1.4 + 8.6 * eo(ce), r = Math.tan((R.angle || 15) / 2 * Math.PI / 180) * (top - 1.4) + .8;
    if (ce > 0) { g.save(); g.globalAlpha = .28; poly([[tx - .8, 0, 1.4], [tx + .8, 0, 1.4], [tx + r, 0, top], [tx - r, 0, top]], COL.sensor); g.restore();
      inkLine([[tx - .8, 0, 1.4], [tx - r, 0, top]], t0 + .75, t0 + 1.55, [8, 6], 1.6); inkLine([[tx + .8, 0, 1.4], [tx + r, 0, top]], t0 + .75, t0 + 1.55, [8, 6], 1.6); }
    const cl = drop(t0 + 1.35); if (cl !== null) box(-3.5, -2, 10 + cl, 7, 4, .6, COL.wall);
  } else if (beam === 'glow') {
    const sd = drop(t0 + .8); if (sd !== null) dome(-1.5, -1, 9 + sd, 1.1, R.source === 'flame' ? '#FF9A3D' : '#FFD24A');
    for (let i = 0; i < 5; i++) inkLine([[-1.5 + (i - 2) * .4, -1, 8.6], [-1.3 + (i - 2) * .15, 0, 1.5]], t0 + 1.1 + i * .06, t0 + 1.6 + i * .06, [6, 8], 1.6, '#c99a2e');
  } else if (R.source && PROPS[R.source]) { const sd = drop(t0 + .8); if (sd !== null) prop(R.source, -2.6, 1.6, sd); }
  sensor(0, 0, d);
  const rx = 3.4;
  if (R.min || R.max) {
    inkLine([[rx, 0, 1.6], [rx, 0, 10]], t0 + 1.7, t0 + 2.3, null, 2.4);
    for (let i = 0; i <= 8; i++) inkLine([[rx, 0, 1.6 + i * 1.05], [rx + .5, 0, 1.6 + i * 1.05]], t0 + 1.8 + i * .05, t0 + 1.9 + i * .05, null, 2);
    pin('rmin', rx + .5, 0, 1.6, t0 + 2.0, tEnd, R.min, 'minimum', 1, 1, 70);
    pin('rmax', rx + .5, 0, 10, t0 + 2.2, tEnd, R.max, 'maximum', 1, -1, 60);
  }
  const ex = R.pins || [];
  if (ex[0]) pin('ex0', tx - .9, 0, 6.5, t0 + 2.4, tEnd, ex[0].text, ex[0].sub, -1, -1, 90);
  if (ex[1]) pin('ex1', -.6, .9, .1, t0 + 2.7, tEnd, ex[1].text, ex[1].sub, 1, 1, 230);
  if (beam === 'cone') arcs(tx, 0, 1.4, t0 + .75, tl('c2', -.3), 3);
}
const USE_SLOTS = [[-1.8, 2.8, -1, -1, 200], [2.4, -2.4, 1, -1, 120], [2.1, 2.1, 1, 1, 150]];
function sUses() {
  const t0 = tl('c2', -.1), tEnd = tl('c3', .7), X = ST[1][0], Y = ST[1][1];
  if (plinth(1, t0) <= 0) return;
  (SPEC.C.uses || []).slice(0, 3).forEach((u, i) => {
    const [dx, dy, px, py, len] = USE_SLOTS[i], d = drop(t0 + .2 + i * .8); if (d === null) return;
    prop(u.prop, X + dx, Y + dy, d); sensor(X + dx + .2, Y + dy + .2, d + (propH[u.prop] || 1), .22);
    arcs(X + dx, Y + dy, (propH[u.prop] || 1) + .2, t0 + .6 + i * .8, tEnd - .4, 2, .8);
    pin('use' + i, X + dx, Y + dy, (propH[u.prop] || 1) * .6, t0 + .5 + i * .8, tEnd, u.label, null, i === 0 ? 1 : px, py, len);
  });
}
function sLimits() {
  const t0 = tl('c3', -.1), tEnd = tl('c4', .8), X = ST[2][0], Y = ST[2][1];
  if (plinth(2, t0) <= 0) return;
  const s = drop(t0 + .15); if (s === null) return;
  const items = (SPEC.C.limits || []).slice(0, 2);
  items.forEach((it, i) => {
    const sx = i ? X + 2.8 : X - 1.5, d = drop(t0 + .45 + i * .5);
    sensor(sx, Y - 2.6, s, .55);
    if (d !== null) prop(it.prop, sx - (i ? 0 : .3), Y + 1.8, d);
    inkLine([[sx, Y - 2.3, .4], [sx, Y + 1.2, .4]], t0 + .55 + i * .5, t0 + 1.1 + i * .5, [10, 7]);
    if (i === 0) inkLine([[sx, Y + 1.2, .4], [sx, Y - 1.9, .4]], t0 + 1.1, t0 + 1.7, [3, 9], 1.6, GREY);
    else for (const [dx, dy] of [[-1.6, -1.4], [1.8, -1.0], [.2, -2.4]]) inkLine([[sx, Y + 1.2, .9], [sx + dx, Y + 1.2 + dy, .9 + Math.abs(dx) * .3]], t0 + 1.6, t0 + 2.1, [3, 9], 1.6, GREY);
    pin('lim' + i, sx, Y + 2.1, (propH[it.prop] || .6) * .8, t0 + .7 + i * .5, tEnd, it.label, it.sub, i ? 1 : -1, i ? 1 : -1, i ? 150 : 160);
  });
}
function sIso() {
  const t0 = tl('c4', -.1), tEnd = TL.T.card + .2, X = ST[3][0], Y = ST[3][1], I = SPEC.C.iso || {};
  if (plinth(3, t0) <= 0) return;
  const n = clamp(I.count || 4, 2, 6), step = 7.2 / (n - 1);
  for (let i = 0; i < n; i++) {
    const e = back(seg(now, t0 + .25 + i * .31, t0 + .55 + i * .31), 1.6); if (e <= 0) continue;
    const x = X - 3.6 + i * step; if (I.prop && I.prop !== 'sensor') prop(I.prop, x, Y, (1 - e) * 2); else sensor(x, Y, (1 - e) * 2, .34 * clamp(e, .3, 1.2));
    arcs(x - .4, Y, .5, t0 + .55 + i * .31, t0 + 1.25 + i * .31, 2);
  }
  if (I.gap) for (let i = 0; i < n - 1; i++) { const x = X - 3.6 + i * step; inkLine([[x + .3, Y + 1.6, 0], [x + step - .3, Y + 1.6, 0]], t0 + 1.4 + i * .15, t0 + 1.6 + i * .15, null, 2); }
  pin('iso', X, Y + 1.6, 0, t0 + 1.4, tEnd, I.label, I.sub, 1, 1, 160);
}
function card(t) {
  const a = ss(seg(t, TT.card, TT.card + .5)); if (a <= 0) return;
  const C = SPEC.C.card || {}, lines = (C.lines || []).slice(0, 3);
  g.save(); g.globalAlpha = a;
  const y0 = 150, h = 400 + lines.length * 50; g.fillStyle = 'rgba(250,246,238,.94)'; g.strokeStyle = INK; g.lineWidth = 2.4;
  g.fillRect(70, y0, 940, h); g.strokeRect(70, y0, 940, h);
  g.textAlign = 'center'; g.fillStyle = INK;
  const items = [[`600 92px ${SANS}`, SPEC.moduleName || SPEC.title, y0 + 120], [`400 44px ${SANS}`, C.tagline || 'Kholke Dekho', y0 + 180],
    ...lines.map((l, i) => [`500 30px ${MONO}`, l, y0 + 270 + i * 50]), [`600 26px ${SANS}`, 'ECHO LAB 3D', y0 + h - 50]];
  items.forEach(([f, s, y], i) => { const e = seg(t, TT.card + .05 + i * .07, TT.card + .3 + i * .07); g.globalAlpha = a * e; g.font = f;
    let fs = f; if (g.measureText(s).width > 880) { fs = f.replace(/\d+px/, (m) => Math.floor(parseInt(m) * 880 / g.measureText(s).width) + 'px'); g.font = fs; }
    g.fillText(s, W / 2, y + (1 - e) * 8); if (e > .99) { const w = g.measureText(s).width; texts.push({ id: 'card' + i, text: s, x0: W / 2 - w / 2, y0: y - 60, x1: W / 2 + w / 2, y1: y + 10 }); } });
  g.fillStyle = COL.sensor; g.globalAlpha = a; g.fillRect(W / 2 - 30, y0 + 210, 60, 5);
  g.restore();
}
function sub(t) {
  const c = cueAt(t); if (!c || !c.id.startsWith('c')) return;
  const font = `500 40px ${SANS}`, lines = wrap(g, font, c.text, 860);
  const kk = seg(t, c.t0, c.t0 + .3), out = 1 - seg(t, c.t1 - .15, c.t1);
  const bh = 40 + lines.length * 50, by = 1795 - bh;
  g.save(); g.globalAlpha = out; g.font = font;
  const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 120, bx = W / 2 - bw / 2;
  g.fillStyle = 'rgba(250,246,238,.96)'; g.strokeStyle = INK; g.lineWidth = 2.4;
  g.beginPath(); g.roundRect(bx, by, bw * eo(kk), bh, 14); g.fill(); g.stroke();
  const q = 14, qx = bx + 34, qy = by + bh / 2;
  if (kk > .3) { const [tp, lf, rt] = tones(COL.sensor);
    g.fillStyle = tp; g.beginPath(); g.moveTo(qx, qy - q); g.lineTo(qx + q, qy - q / 2); g.lineTo(qx, qy); g.lineTo(qx - q, qy - q / 2); g.fill();
    g.fillStyle = lf; g.beginPath(); g.moveTo(qx - q, qy - q / 2); g.lineTo(qx, qy); g.lineTo(qx, qy + q); g.lineTo(qx - q, qy + q / 2); g.fill();
    g.fillStyle = rt; g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + q, qy - q / 2); g.lineTo(qx + q, qy + q / 2); g.lineTo(qx, qy + q); g.fill(); }
  g.beginPath(); g.rect(bx, by, bw * seg(t, c.t0 + .1, c.t0 + .45), bh); g.clip();
  g.fillStyle = INK; g.textAlign = 'center'; lines.forEach((ln, j) => g.fillText(ln, W / 2 + 24, by + 54 + j * 50));
  g.restore();
}

export async function initIso(spec, timeline) {
  SPEC = spec; TL = timeline; TT = TL.T;
  const f = new FontFace('Jost', 'url(fonts/Jost.ttf)', { weight: '100 900' }); await f.load(); document.fonts.add(f);
  const c2 = tl('c2', -.4), c3 = tl('c3', -.4), c4 = tl('c4', -.4);
  CAMK = track([[TT.isoIn, [-3.4, -3.4, Math.log(74)]], [c2 - .1, [-3.0, -3.0, Math.log(72)]], [c2 + .55, [10, 10, Math.log(70)]], [c3 - .1, [10.3, 10.3, Math.log(70)]],
    [c3 + .55, [20, 20, Math.log(72)]], [c4 - .1, [20.2, 20.2, Math.log(72)]], [c4 + .55, [30, 30, Math.log(74)]], [TT.card - 1.6, [30, 30, Math.log(74)]],
    [TT.card + .2, [15.5, 15.5, Math.log(24)]], [TL.DUR, [15.5, 15.5, Math.log(23)]]]);
  const EV = [{ t: TT.isoIn, type: 'wipe' }, { t: c2 - .1, type: 'pull' }, { t: c3 - .1, type: 'pull' }, { t: c4 - .1, type: 'pull' }, { t: TT.card - 1.6, type: 'pull' }, { t: TT.card, type: 'card' }];
  for (const [i, t0] of [[0, tl('c1', -.25)], [1, tl('c2', -.1)], [2, tl('c3', -.1)], [3, tl('c4', -.1)]]) EV.push({ t: t0 + .3, type: 'plinth' });
  for (let i = 0; i < 3; i++) EV.push({ t: tl('c2', .1 + i * .8), type: 'pop' }, { t: tl('c2', .4 + i * .8), type: 'label' });
  for (let i = 0; i < 2; i++) EV.push({ t: tl('c3', .35 + i * .5), type: 'pop' }, { t: tl('c3', .6 + i * .5), type: 'label' });
  const n = clamp(spec.C.iso?.count || 4, 2, 6); for (let i = 0; i < n; i++) EV.push({ t: tl('c4', .15 + i * .31), type: 'pop' }, { t: tl('c4', .45 + i * .31), type: 'ping' });
  EV.push({ t: tl('c1', .05), type: 'pop' }, { t: tl('c1', .5), type: 'zip' }, { t: tl('c1', 1.8), type: 'label' }, { t: tl('c1', 2.2), type: 'label' });
  return { EV, draw };
}
function draw(ctx, t, tx) {
  g = ctx; now = t; texts = tx;
  [cx, cy, k] = CAMK(t); k = Math.exp(k);
  const w = eo(seg(t, TT.isoIn, TT.isoOnly)), yw = H * (1 - w);
  g.save(); g.beginPath(); g.rect(0, yw, W, H - yw); g.clip();
  g.fillStyle = GROUND; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(43,42,51,.10)'; for (let j = -2; j < 80; j++) for (let i = -2; i < 26; i++) g.fillRect(i * 44 + (j % 2) * 22, j * 25.4, 2.4, 2.4);
  sRange(); sUses(); sLimits(); sIso(); card(t);
  g.restore();
  if (w < 1) { g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(0, yw); g.lineTo(W, yw); g.stroke(); }
  sub(t);
}
