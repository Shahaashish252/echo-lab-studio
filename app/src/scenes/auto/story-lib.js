// Story format (2026-10-21): hand-made, reusable animated scenes in the style of the PIR short that did best
// (dark ground, cream line-art, one hot accent, big kinetic words). Claude does NOT write code for these videos:
// scripts/auto.ts --story asks it only for a small JSON plan (which scene for each narration line + words/icons),
// and sim.gen.js becomes `export default makeDraw(plan)`. Everything is a pure function of time (seek-safe).
//
// Scene types (one per narration line, "line" = its index):
//   title   {text}                         big kinetic words, *key* word in the accent colour
//   person  {action, prop, light, text}    a figure: walk | stand | sleep | phone | point; prop icon beside it
//   object  {icon, state, label, glow, text}  one big gadget icon (see ICONS); state = on/off/0-100 level
//   zoom    {icon, inside, label, text}    magnifier dives into the object -> inside: chip | battery | coil | lens | wire | sensor
//   flow    {nodes:[icon,...], labels, text}   2-4 icons in a chain, energy/signal flowing along the arrows
//   waves   {from, to, kind, echo, text}   from-icon sends waves (sound | ir | radio | light | heat) to to-icon; echo = bounce back
//   compare {left:{icon,label}, right:{icon,label}, text}   myth (cross) vs truth (tick)
//   meter   {label, from, to, unit, text}  big gauge animating from -> to
//   tip     {icon, points:[..], text}      tip card, points tick in one by one
//   question{text}                          the closing question, pulsing
//   module  {name, action, label, text}    a REAL hobby module drawn realistically (modules.js): hcsr04 | pir | ir | ldr |
//                                          dht11 | servo | relay | soil | mq | uno | cell; action = on | off | detect | dark | light
import { drawModule } from './modules.js';

export function makeDraw(plan) {
  const beats = (plan && plan.beats) || [];
  const C = { bg: '#0d0f13', bg2: '#161a21', line: '#e9e4d8', dim: '#8b8f98', faint: '#3a3f4a', hot: plan.accent || '#ff6a2b', cool: '#3fd0c0', good: '#5be38d', bad: '#ff5a5f', gold: '#ffc23d' };

  // ---------- helpers ----------
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const font = (s, w = 900) => `${w} ${s}px Archivo, "Segoe UI", sans-serif`;
  const round = (s, w = 800) => `${w} ${s}px Nunito, "Segoe UI", sans-serif`;
  const mono = (s) => `600 ${s}px "IBM Plex Mono", Consolas, monospace`;
  function glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow(ctx) { ctx.shadowBlur = 0; }
  function stroke(ctx, color = C.line, w = 6) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  // big kinetic headline: words rise in one by one, *key* in the accent
  function headline(ctx, text, p, y = 330, size = 108, maxW = 980) {
    if (!text) return;
    const words = String(text).split(/\s+/).filter(Boolean);
    ctx.font = font(size);
    // a single long word (e.g. OVERCHARGE) must fit the width: shrink until the widest word does
    while (size > 48 && Math.max(...words.map((w) => ctx.measureText(w.replace(/\*/g, '')).width)) > maxW) {
      size -= 6;
      ctx.font = font(size);
    }
    let rows;
    // at most 2 rows, so the words never run into the picture below: shrink until they fit
    for (;;) {
      rows = []; let cur = [];
      for (const w of words) {
        const test = [...cur, w].join(' ').replace(/\*/g, '');
        if (cur.length && ctx.measureText(test).width > maxW) { rows.push(cur); cur = [w]; } else cur.push(w);
      }
      if (cur.length) rows.push(cur);
      if (rows.length <= 2 || size <= 60) break;
      size -= 6;
      ctx.font = font(size);
    }
    let k = 0;
    rows.forEach((row, ri) => {
      const plain = row.map((w) => w.replace(/\*/g, ''));
      const widths = plain.map((w) => ctx.measureText(w + ' ').width);
      let x = 540 - (widths.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width) / 2;
      const yy = y + ri * size * 1.08;
      row.forEach((w, wi) => {
        const a = ease((p - k * 0.06) * 4);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(0, (1 - a) * 40);
        const key = w.includes('*');
        ctx.fillStyle = key ? C.hot : C.line;
        if (key) glow(ctx, C.hot, 28);
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(plain[wi], x, yy);
        ctx.restore();
        x += widths[wi];
        k++;
      });
    });
  }

  // ---------- icon library (centred at 0,0, roughly 400px tall) ----------
  const ICONS = {
    phone(ctx, s) { stroke(ctx); rr(ctx, -110, -200, 220, 400, 34); ctx.stroke(); rr(ctx, -90, -170, 180, 320, 12); ctx.fillStyle = s.on === false ? '#111' : 'rgba(63,208,192,0.12)'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 175, 10, 0, 7); ctx.stroke(); },
    charger(ctx) { stroke(ctx); rr(ctx, -90, -120, 180, 170, 22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-40, -120); ctx.lineTo(-40, -190); ctx.moveTo(40, -120); ctx.lineTo(40, -190); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 50); ctx.bezierCurveTo(0, 150, 120, 120, 120, 210); ctx.stroke(); },
    battery(ctx, s) { stroke(ctx); rr(ctx, -95, -170, 190, 330, 26); ctx.stroke(); rr(ctx, -35, -200, 70, 30, 8); ctx.stroke(); const lvl = clamp((s.level ?? 60) / 100); const col = lvl < 0.25 ? C.bad : lvl < 0.6 ? C.gold : C.good; ctx.fillStyle = col; glow(ctx, col, 20); rr(ctx, -72, 140 - 290 * lvl, 144, 290 * lvl, 14); ctx.fill(); noGlow(ctx); },
    chip(ctx) { stroke(ctx); rr(ctx, -120, -120, 240, 240, 18); ctx.stroke(); for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 30, -120); ctx.lineTo(i * 30, -160); ctx.moveTo(i * 30, 120); ctx.lineTo(i * 30, 160); ctx.moveTo(-120, i * 30); ctx.lineTo(-160, i * 30); ctx.moveTo(120, i * 30); ctx.lineTo(160, i * 30); ctx.stroke(); } rr(ctx, -55, -55, 110, 110, 10); ctx.strokeStyle = C.cool; ctx.stroke(); },
    sensor(ctx) { stroke(ctx); rr(ctx, -150, 20, 300, 140, 18); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 20, 110, Math.PI, 0); ctx.stroke(); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 40, -80); ctx.lineTo(i * 44, 20); ctx.strokeStyle = C.faint; ctx.stroke(); } },
    bulb(ctx, s) { const on = s.on !== false; if (on) { ctx.fillStyle = 'rgba(255,194,61,0.25)'; glow(ctx, C.gold, 60); ctx.beginPath(); ctx.arc(0, -60, 120, 0, 7); ctx.fill(); noGlow(ctx); } stroke(ctx, on ? C.gold : C.line); ctx.beginPath(); ctx.arc(0, -60, 120, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(50, 90); ctx.lineTo(-50, 90); ctx.closePath(); ctx.stroke(); stroke(ctx); ctx.beginPath(); ctx.moveTo(-45, 120); ctx.lineTo(45, 120); ctx.moveTo(-35, 150); ctx.lineTo(35, 150); ctx.stroke(); },
    remote(ctx) { stroke(ctx); rr(ctx, -70, -200, 140, 400, 40); ctx.stroke(); ctx.fillStyle = C.bad; ctx.beginPath(); ctx.arc(0, -140, 18, 0, 7); ctx.fill(); for (let r = 0; r < 4; r++) for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.arc(c * 38, -60 + r * 55, 12, 0, 7); ctx.stroke(); } },
    tv(ctx, s) { stroke(ctx); rr(ctx, -200, -140, 400, 250, 16); ctx.stroke(); if (s.on !== false) { ctx.fillStyle = 'rgba(63,208,192,0.18)'; rr(ctx, -180, -120, 360, 210, 8); ctx.fill(); } ctx.beginPath(); ctx.moveTo(-60, 170); ctx.lineTo(60, 170); ctx.moveTo(0, 110); ctx.lineTo(0, 170); ctx.stroke(); },
    laptop(ctx) { stroke(ctx); rr(ctx, -170, -150, 340, 220, 14); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-220, 110); ctx.lineTo(220, 110); ctx.lineTo(190, 70); ctx.lineTo(-190, 70); ctx.closePath(); ctx.stroke(); },
    router(ctx) { stroke(ctx); rr(ctx, -170, 20, 340, 110, 18); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-110, 20); ctx.lineTo(-140, -150); ctx.moveTo(110, 20); ctx.lineTo(140, -150); ctx.stroke(); for (let i = 0; i < 4; i++) { ctx.fillStyle = i < 3 ? C.good : C.faint; ctx.beginPath(); ctx.arc(-90 + i * 50, 75, 9, 0, 7); ctx.fill(); } },
    speaker(ctx) { stroke(ctx); rr(ctx, -110, -180, 220, 360, 26); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 50, 70, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -100, 30, 0, 7); ctx.stroke(); },
    fan(ctx, s) { const a = (s.t || 0) * 8; stroke(ctx); ctx.beginPath(); ctx.arc(0, 0, 170, 0, 7); ctx.stroke(); for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(a + (i * Math.PI * 2) / 3); ctx.beginPath(); ctx.ellipse(0, -80, 38, 80, 0, 0, 7); ctx.stroke(); ctx.restore(); } },
    door(ctx, s) { stroke(ctx); rr(ctx, -150, -220, 300, 440, 6); ctx.stroke(); const o = clamp(s.open ?? 0); ctx.fillStyle = C.bg2; rr(ctx, -140, -210, 280 * (1 - o * 0.85), 420, 4); ctx.fill(); ctx.stroke(); },
    thermometer(ctx, s) { stroke(ctx); rr(ctx, -30, -200, 60, 300, 30); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 140, 55, 0, 7); ctx.stroke(); const lvl = clamp((s.level ?? 70) / 100); ctx.fillStyle = C.hot; glow(ctx, C.hot, 24); ctx.beginPath(); ctx.arc(0, 140, 38, 0, 7); ctx.fill(); rr(ctx, -14, 100 - 280 * lvl, 28, 280 * lvl + 10, 14); ctx.fill(); noGlow(ctx); },
    sun(ctx) { ctx.fillStyle = C.gold; glow(ctx, C.gold, 50); ctx.beginPath(); ctx.arc(0, 0, 90, 0, 7); ctx.fill(); noGlow(ctx); stroke(ctx, C.gold); for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 125, Math.sin(a) * 125); ctx.lineTo(Math.cos(a) * 175, Math.sin(a) * 175); ctx.stroke(); } },
    moon(ctx) { ctx.fillStyle = C.line; ctx.beginPath(); ctx.arc(0, 0, 130, 0, 7); ctx.fill(); ctx.fillStyle = C.bg; ctx.beginPath(); ctx.arc(55, -40, 115, 0, 7); ctx.fill(); },
    eye(ctx, s) { stroke(ctx); ctx.beginPath(); ctx.moveTo(-190, 0); ctx.quadraticCurveTo(0, -150, 190, 0); ctx.quadraticCurveTo(0, 150, -190, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 60, 0, 7); ctx.stroke(); ctx.fillStyle = C.line; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill(); if (s.off) { stroke(ctx, C.bad, 10); ctx.beginPath(); ctx.moveTo(-170, -130); ctx.lineTo(170, 130); ctx.stroke(); } },
    ear(ctx) { stroke(ctx); ctx.beginPath(); ctx.moveTo(-60, 150); ctx.bezierCurveTo(-140, 60, -130, -170, 20, -180); ctx.bezierCurveTo(150, -180, 150, -30, 60, 20); ctx.bezierCurveTo(10, 60, 20, 140, -60, 150); ctx.stroke(); },
    wifi(ctx) { stroke(ctx, C.cool); for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, 90, i * 70, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke(); } ctx.fillStyle = C.cool; ctx.beginPath(); ctx.arc(0, 90, 18, 0, 7); ctx.fill(); },
    car(ctx) { stroke(ctx); ctx.beginPath(); ctx.moveTo(-220, 60); ctx.lineTo(-200, -10); ctx.lineTo(-110, -20); ctx.lineTo(-60, -100); ctx.lineTo(90, -100); ctx.lineTo(150, -20); ctx.lineTo(220, 0); ctx.lineTo(220, 60); ctx.closePath(); ctx.stroke(); for (const x of [-130, 130]) { ctx.beginPath(); ctx.arc(x, 70, 45, 0, 7); ctx.stroke(); } },
    camera(ctx) { stroke(ctx); rr(ctx, -190, -110, 380, 240, 26); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 10, 85, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 10, 40, 0, 7); ctx.strokeStyle = C.cool; ctx.stroke(); },
    lock(ctx) { stroke(ctx); rr(ctx, -120, -20, 240, 200, 24); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -20, 80, Math.PI, 0); ctx.stroke(); },
    hand(ctx) { stroke(ctx); ctx.beginPath(); ctx.moveTo(-60, 200); ctx.lineTo(-60, 0); ctx.lineTo(-30, -160); ctx.quadraticCurveTo(-10, -200, 10, -160); ctx.lineTo(10, -40); ctx.lineTo(60, -50); ctx.quadraticCurveTo(110, -40, 100, 20); ctx.lineTo(80, 200); ctx.stroke(); },
    plug(ctx) { stroke(ctx); rr(ctx, -80, -80, 160, 150, 20); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-35, -80); ctx.lineTo(-35, -160); ctx.moveTo(35, -80); ctx.lineTo(35, -160); ctx.moveTo(0, 70); ctx.lineTo(0, 200); ctx.stroke(); },
    bolt(ctx) { ctx.fillStyle = C.gold; glow(ctx, C.gold, 40); ctx.beginPath(); ctx.moveTo(30, -200); ctx.lineTo(-90, 20); ctx.lineTo(-10, 20); ctx.lineTo(-40, 200); ctx.lineTo(90, -30); ctx.lineTo(10, -30); ctx.closePath(); ctx.fill(); noGlow(ctx); },
    house(ctx) { stroke(ctx); ctx.beginPath(); ctx.moveTo(-200, -20); ctx.lineTo(0, -190); ctx.lineTo(200, -20); ctx.moveTo(-160, -50); ctx.lineTo(-160, 170); ctx.lineTo(160, 170); ctx.lineTo(160, -50); ctx.stroke(); rr(ctx, -40, 60, 80, 110, 6); ctx.stroke(); },
  };
  function icon(ctx, name, x, y, scale = 1, state = {}, hot = false) {
    const f = ICONS[name] || ICONS.chip;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (hot) glow(ctx, C.hot, 26);
    f(ctx, state);
    ctx.restore();
  }

  // ---------- person ----------
  function person(ctx, x, y, s, action, t, p, color = C.hot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    glow(ctx, color, 30);
    const bob = action === 'walk' ? Math.abs(Math.sin(t * 6)) * 10 : 0;
    if (action === 'sleep') {
      ctx.beginPath(); ctx.arc(-170, -20, 50, 0, 7); ctx.fill();
      rr(ctx, -120, -55, 300, 90, 45); ctx.fill();
      noGlow(ctx);
      ctx.fillStyle = C.dim; ctx.font = font(48);
      for (let i = 0; i < 3; i++) { const a = (t * 0.8 + i * 0.33) % 1; ctx.globalAlpha = 1 - a; ctx.fillText('z', -150 + i * 30, -100 - a * 120); }
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath(); ctx.arc(0, -250 - bob, 55, 0, 7); ctx.fill();
      rr(ctx, -62, -185 - bob, 124, 250, 60); ctx.fill();
      noGlow(ctx);
      stroke(ctx, color, 22);
      const sw = action === 'walk' ? Math.sin(t * 6) * 0.5 : 0;
      ctx.beginPath(); ctx.moveTo(-30, 50 - bob); ctx.lineTo(-30 - Math.sin(sw) * 70, 200); ctx.moveTo(30, 50 - bob); ctx.lineTo(30 + Math.sin(sw) * 70, 200); ctx.stroke();
      if (action === 'phone') { ctx.beginPath(); ctx.moveTo(55, -120); ctx.lineTo(110, -150); ctx.stroke(); icon(ctx, 'phone', 130, -190, 0.28); }
      if (action === 'point') { ctx.beginPath(); ctx.moveTo(55, -130); ctx.lineTo(180, -210); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- particles along a path (deterministic) ----------
  function flowDots(ctx, x1, y1, x2, y2, t, color = C.hot, n = 6) {
    for (let i = 0; i < n; i++) {
      const u = (t * 0.6 + i / n) % 1;
      ctx.fillStyle = color;
      glow(ctx, color, 18);
      ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 9, 0, 7); ctx.fill();
    }
    noGlow(ctx);
  }

  // ---------- scenes ----------
  const SCENES = {
    title(ctx, b, t, p) { const g = ctx.createRadialGradient(540, 900, 20, 540, 900, 600); g.addColorStop(0, 'rgba(255,106,43,' + (0.10 + 0.06 * Math.sin(t * 3)) + ')'); g.addColorStop(1, 'rgba(255,106,43,0)'); ctx.fillStyle = g; ctx.fillRect(0, 300, 1080, 1200); headline(ctx, b.text, p, 820, 150, 960); },
    person(ctx, b, t, p) {
      headline(ctx, b.text, p);
      if (b.light !== undefined) {
        const on = b.light === 'on' || (b.light === 'switch' && p > 0.4);
        if (on) { const g = ctx.createLinearGradient(0, 520, 0, 1400); g.addColorStop(0, 'rgba(255,230,170,0.35)'); g.addColorStop(1, 'rgba(255,230,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(470, 540); ctx.lineTo(610, 540); ctx.lineTo(820, 1400); ctx.lineTo(260, 1400); ctx.fill(); }
        stroke(ctx); ctx.beginPath(); ctx.moveTo(540, 470); ctx.lineTo(540, 520); ctx.stroke(); rr(ctx, 470, 520, 140, 30, 12); ctx.stroke();
      }
      const walkIn = b.action === 'walk' ? -300 + 840 * ease(p * 1.3) : 540;
      person(ctx, b.prop ? walkIn - 130 : walkIn, 1210, 1.55, b.action || 'stand', t, p);
      if (b.prop) icon(ctx, b.prop, 810, 1120 + Math.sin(t * 1.6) * 10, 0.75, { on: true, t }, true);
      stroke(ctx, C.faint, 3); ctx.beginPath(); ctx.moveTo(60, 1440); ctx.lineTo(1020, 1440); ctx.stroke();
    },
    object(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const sc = 1.75 * (0.85 + 0.15 * ease(p * 3)) * (1 + Math.sin(t * 2.2) * 0.02);
      const st = { t, on: b.state !== 'off', level: typeof b.state === 'number' ? b.state * ease(p * 1.5) : undefined, open: b.state === 'open' ? ease(p * 2) : 0, off: b.state === 'off' };
      ctx.save(); ctx.globalAlpha = ease(p * 4);
      if (b.glow) { const g = ctx.createRadialGradient(540, 1000, 20, 540, 1000, 480); g.addColorStop(0, 'rgba(255,106,43,0.28)'); g.addColorStop(1, 'rgba(255,106,43,0)'); ctx.fillStyle = g; ctx.fillRect(0, 500, 1080, 1000); }
      icon(ctx, b.icon, 540, 1010 + Math.sin(t * 1.6) * 14, sc, st, !!b.glow);
      ctx.restore();
      if (b.label) { ctx.font = mono(40); ctx.fillStyle = C.dim; ctx.textAlign = 'center'; ctx.fillText(String(b.label).toUpperCase(), 540, 1430); ctx.textAlign = 'left'; }
    },
    zoom(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const z = ease((p - 0.15) * 2.2);
      ctx.save(); ctx.globalAlpha = 1 - z * 0.85; icon(ctx, b.icon || 'phone', 540 - z * 160, 1000, 1.15 * (1 + z * 0.4)); ctx.restore();
      const r = 60 + z * 430;
      ctx.save(); ctx.beginPath(); ctx.arc(540, 1000, r, 0, 7); ctx.fillStyle = C.bg2; ctx.fill(); stroke(ctx, C.hot, 8); glow(ctx, C.hot, 30); ctx.stroke(); noGlow(ctx); ctx.clip();
      INSIDE[b.inside || 'chip']?.(ctx, t, z);
      ctx.restore();
      if (b.label && z > 0.6) { ctx.font = mono(40); ctx.fillStyle = C.hot; ctx.textAlign = 'center'; ctx.fillText(String(b.label).toUpperCase(), 540, 1450); ctx.textAlign = 'left'; }
    },
    flow(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const nodes = (b.nodes || ['plug', 'charger', 'battery']).slice(0, 4);
      const n = nodes.length;
      const ys = nodes.map((_, i) => 640 + (i * 820) / Math.max(1, n - 1));
      nodes.forEach((nm, i) => {
        const a = ease(p * 3 - i * 0.35);
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha = a; icon(ctx, nm, 470, ys[i], 0.6, { on: true, t }, i === n - 1); ctx.restore();
        if (b.labels && b.labels[i]) { ctx.globalAlpha = a; ctx.font = mono(34); ctx.fillStyle = C.dim; ctx.font = mono(40); ctx.fillText(String(b.labels[i]).toUpperCase(), 640, ys[i] + 14); ctx.globalAlpha = 1; }
        if (i < n - 1 && ease(p * 3 - i * 0.35 - 0.3) > 0) {
          stroke(ctx, C.faint, 4); ctx.setLineDash([12, 14]); ctx.beginPath(); ctx.moveTo(470, ys[i] + 140); ctx.lineTo(470, ys[i + 1] - 140); ctx.stroke(); ctx.setLineDash([]);
          flowDots(ctx, 470, ys[i] + 140, 470, ys[i + 1] - 140, t + i * 0.2);
        }
      });
    },
    waves(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const colors = { sound: C.line, ir: C.hot, radio: C.cool, light: C.gold, heat: C.hot };
      const col = colors[b.kind] || C.cool;
      icon(ctx, b.from || 'remote', 260, 1050, 0.8);
      icon(ctx, b.to || 'tv', 840, 1050, 0.8, { on: p > 0.6 });
      for (let i = 0; i < 5; i++) {
        const u = (t * 0.7 + i / 5) % 1;
        const x = 380 + u * 340;
        ctx.save(); ctx.globalAlpha = (1 - u) * ease(p * 3); stroke(ctx, col, 7); glow(ctx, col, 20);
        ctx.beginPath(); ctx.arc(x - 40, 1050, 50 + u * 30, -0.7, 0.7); ctx.stroke();
        if (b.echo && u > 0.5) { ctx.beginPath(); ctx.arc(720 - (u - 0.5) * 600, 1050, 40, Math.PI - 0.6, Math.PI + 0.6); ctx.strokeStyle = C.cool; ctx.stroke(); }
        ctx.restore();
      }
      if (b.kind) { ctx.font = mono(36); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(String(b.kind).toUpperCase(), 540, 1350); ctx.textAlign = 'left'; }
    },
    compare(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const L = b.left || {}, R = b.right || {};
      [[L, 330, C.bad, false], [R, 1060, C.good, true]].forEach(([side, y, col, ok], i) => {
        const a = ease(p * 3 - i * 0.6);
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - a) * (i ? 200 : -200), 0);
        ctx.fillStyle = C.bg2; rr(ctx, 80, y + 160, 920, 380, 28); ctx.fill(); stroke(ctx, col, 4); ctx.stroke();
        icon(ctx, side.icon || 'phone', 250, y + 350, 0.62);
        ctx.font = font(64); ctx.fillStyle = C.line; wrapText(ctx, side.label || '', 430, y + 330, 520, 72);
        stroke(ctx, col, 14); ctx.beginPath();
        if (ok) { ctx.moveTo(880, y + 250); ctx.lineTo(910, y + 285); ctx.lineTo(960, y + 215); } else { ctx.moveTo(885, y + 215); ctx.lineTo(955, y + 285); ctx.moveTo(955, y + 215); ctx.lineTo(885, y + 285); }
        ctx.stroke();
        ctx.restore();
      });
    },
    meter(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const v = (b.from ?? 0) + ((b.to ?? 100) - (b.from ?? 0)) * ease(p * 1.4);
      const frac = clamp((v - Math.min(b.from ?? 0, b.to ?? 100)) / Math.max(1, Math.abs((b.to ?? 100) - (b.from ?? 0))));
      stroke(ctx, C.faint, 48); ctx.beginPath(); ctx.arc(540, 1080, 400, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      const col = b.danger ? C.bad : C.hot;
      stroke(ctx, col, 48); glow(ctx, col, 30); ctx.beginPath(); ctx.arc(540, 1080, 400, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * frac)); ctx.stroke(); noGlow(ctx);
      ctx.font = font(210); ctx.fillStyle = C.line; ctx.textAlign = 'center'; ctx.fillText(`${Math.round(v)}${b.unit || ''}`, 540, 1150);
      ctx.font = mono(42); ctx.fillStyle = C.dim; ctx.fillText(String(b.label || '').toUpperCase(), 540, 1230); ctx.textAlign = 'left';
    },
    tip(ctx, b, t, p) {
      headline(ctx, b.text, p);
      ctx.fillStyle = C.bg2; rr(ctx, 70, 560, 940, 860, 34); ctx.fill(); stroke(ctx, C.good, 4); ctx.stroke();
      ctx.font = font(52); ctx.fillStyle = C.good; ctx.fillText('TIP', 130, 650);
      icon(ctx, b.icon || 'phone', 860, 680, 0.3);
      (b.points || []).slice(0, 3).forEach((pt, i) => {
        const a = ease(p * 3 - i * 0.5);
        if (a <= 0) return;
        ctx.save(); ctx.globalAlpha = a;
        stroke(ctx, C.good, 10); ctx.beginPath(); ctx.moveTo(130, 800 + i * 210); ctx.lineTo(160, 830 + i * 210); ctx.lineTo(210, 770 + i * 210); ctx.stroke();
        ctx.font = round(56); ctx.fillStyle = C.line; wrapText(ctx, pt, 250, 815 + i * 210, 720, 62);
        ctx.restore();
      });
    },
    module(ctx, b, t, p) {
      headline(ctx, b.text, p);
      const a = ease(p * 3);
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(540, 1020, 20, 540, 1020, 560); g.addColorStop(0, 'rgba(63,208,192,0.14)'); g.addColorStop(1, 'rgba(63,208,192,0)'); ctx.fillStyle = g; ctx.fillRect(0, 460, 1080, 1100);
      const sc = 0.95 * (0.88 + 0.12 * a);
      ctx.translate(540, 1030 + Math.sin(t * 1.4) * 10); ctx.rotate(Math.sin(t * 0.9) * 0.025); ctx.scale(sc, sc);
      drawModule(ctx, b.name || 'hcsr04', t, b);
      ctx.restore();
      if (b.label) { ctx.font = mono(40); ctx.fillStyle = C.dim; ctx.textAlign = 'center'; ctx.fillText(String(b.label).toUpperCase(), 540, 1600); ctx.textAlign = 'left'; }
    },
    question(ctx, b, t, p) {
      const s = 1 + Math.sin(t * 4) * 0.04;
      ctx.save(); ctx.translate(540, 760); ctx.scale(s, s); ctx.font = font(320); ctx.fillStyle = C.hot; glow(ctx, C.hot, 50); ctx.textAlign = 'center'; ctx.fillText('?', 0, 0); ctx.restore(); noGlow(ctx);
      headline(ctx, b.text, p, 1000, 88, 940);
    },
  };

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(/\s+/); let line = '', yy = y;
    for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = test; }
    if (line) ctx.fillText(line, x, yy);
  }

  // what we see after zooming inside an object
  const INSIDE = {
    chip(ctx, t, z) { stroke(ctx, C.faint, 3); for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(200, 1000 + i * 50); ctx.lineTo(880, 1000 + i * 50); ctx.stroke(); ctx.beginPath(); ctx.moveTo(540 + i * 50, 600); ctx.lineTo(540 + i * 50, 1400); ctx.stroke(); } for (let k = 0; k < 4; k++) flowDots(ctx, 250, 900 + k * 70, 830, 900 + k * 70, t + k * 0.3, k % 2 ? C.cool : C.hot, 5); },
    battery(ctx, t) { const cols = [C.dim, C.faint, C.cool]; for (let i = 0; i < 3; i++) { ctx.fillStyle = cols[i]; ctx.globalAlpha = 0.5; ctx.fillRect(250 + i * 200, 700, 160, 600); } ctx.globalAlpha = 1; for (let k = 0; k < 8; k++) { const u = (t * 0.4 + k / 8) % 1; ctx.fillStyle = C.gold; glow(ctx, C.gold, 16); ctx.beginPath(); ctx.arc(300 + u * 480, 760 + ((k * 73) % 480), 14, 0, 7); ctx.fill(); } noGlow(ctx); },
    coil(ctx, t) { stroke(ctx, C.gold, 10); for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.ellipse(540, 760 + i * 60, 170, 34, 0, 0, 7); ctx.stroke(); } stroke(ctx, C.cool, 4); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(540, 1000, 240 + k * 40 + Math.sin(t * 3) * 10, 420, 0, 0, 7); ctx.stroke(); } },
    lens(ctx, t) { stroke(ctx, C.line, 6); ctx.beginPath(); ctx.ellipse(540, 900, 230, 50, 0, 0, 7); ctx.stroke(); for (let i = -3; i <= 3; i++) { const u = (t * 0.5) % 1; stroke(ctx, C.hot, 5); glow(ctx, C.hot, 14); ctx.beginPath(); ctx.moveTo(540 + i * 70, 640); ctx.lineTo(540 + i * 60, 900); ctx.lineTo(540, 1250); ctx.stroke(); noGlow(ctx); ctx.fillStyle = C.hot; ctx.beginPath(); ctx.arc(540 + i * 60 * (1 - u), 900 + 350 * u, 8, 0, 7); ctx.fill(); } },
    wire(ctx, t) { stroke(ctx, C.gold, 60); ctx.beginPath(); ctx.moveTo(180, 1000); ctx.lineTo(900, 1000); ctx.stroke(); for (let k = 0; k < 12; k++) { const u = (t * 0.5 + k / 12) % 1; ctx.fillStyle = C.cool; glow(ctx, C.cool, 14); ctx.beginPath(); ctx.arc(200 + u * 680, 985 + ((k * 37) % 30), 9, 0, 7); ctx.fill(); } noGlow(ctx); },
    sensor(ctx, t) { stroke(ctx, C.line, 5); rr(ctx, 330, 860, 180, 260, 10); ctx.stroke(); rr(ctx, 570, 860, 180, 260, 10); ctx.stroke(); const u = (Math.sin(t * 2) + 1) / 2; ctx.fillStyle = `rgba(255,106,43,${u})`; rr(ctx, 340, 870, 160, 240, 8); ctx.fill(); ctx.fillStyle = `rgba(255,106,43,${1 - u})`; rr(ctx, 580, 870, 160, 240, 8); ctx.fill(); ctx.font = mono(48); ctx.fillStyle = C.line; ctx.fillText('A', 405, 1180); ctx.fillText('B', 645, 1180); },
  };

  // ---------- the draw function ----------
  return function draw(ctx, t, s) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, s.W, s.H);
    // faint grid for depth
    stroke(ctx, 'rgba(255,255,255,0.035)', 2);
    for (let x = 0; x <= 1080; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1920); ctx.stroke(); }
    for (let y = 0; y <= 1920; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }
    if (!beats.length) return;
    const i = Math.min(s.lineIndex(t), s.lines.length - 1);
    const b = beats.find((x) => x.line === i) || beats[Math.min(i, beats.length - 1)];
    const line = s.lines[i];
    const p = line ? clamp((t - line.start) / Math.max(0.6, line.end - line.start)) : 1;
    // scene change: quick push-in from the next scene
    const enter = line ? ease((t - line.start + 0.25) / 0.35) : 1;
    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(540, 960); ctx.scale(0.94 + 0.06 * enter, 0.94 + 0.06 * enter); ctx.translate(-540, -960);
    (SCENES[b.scene] || SCENES.title)(ctx, b, t, p);
    ctx.restore();
  };
}
