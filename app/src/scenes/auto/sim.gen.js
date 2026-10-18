export default function draw(ctx, t, s) {
  ctx.save();
  try {
    const P = (s && s.palette) || {};
    const C = {
      text: P.text || '#e6edf3', dim: P.dim || '#8a96a8', line: P.panelLine || '#2c3644', panel: P.panel || '#1a212b',
      teal: P.teal || '#3fd0c0', orange: P.orange || '#f2a23a', purple: P.purple || '#a78bfa', red: P.red || '#ff6b6b',
      green: P.green || '#7ee787', blue: P.blue || '#58a6ff', force: '#ff7a45', grey: '#8793a4', steel: '#4b5667',
      mass: '#394351', inner: '#121820', grid: '#1f2833', soft: '#b8c2d0'
    };
    const R = (z, w) => (typeof s.round === 'function' ? s.round(z, w || 400) : (w || 400) + ' ' + z + 'px sans-serif');
    const MONO = z => (typeof s.mono === 'function' ? s.mono(z) : z + 'px monospace');
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const fin = (v, d) => (Number.isFinite(v) ? v : d);
    const rng = (x, a, b) => (b <= a ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a), 0, 1));
    const sm = x => { x = clamp(fin(x, 0), 0, 1); return x * x * (3 - 2 * x); };
    const oc = x => { x = clamp(fin(x, 0), 0, 1); return 1 - Math.pow(1 - x, 3); };
    const TAU = Math.PI * 2;
    t = fin(t, 0);

    // ---------- narration timing ----------
    const N = 16;
    const src = Array.isArray(s.lines) ? s.lines : [];
    const st = [], en = [];
    for (let i = 0; i < N; i++) {
      const L = src[i];
      let a = L && Number.isFinite(+L.start) ? +L.start : (i ? en[i - 1] + 0.3 : 0);
      if (i && a < st[i - 1] + 0.05) a = st[i - 1] + 0.05;
      let b = L && Number.isFinite(+L.end) ? +L.end : a + 3;
      if (b < a + 0.1) b = a + 0.1;
      st.push(a); en.push(b);
    }
    const segS = i => (i === 0 ? Math.min(0, st[0]) : st[i]);
    const dur = i => Math.max(0.1, (i < N - 1 ? st[i + 1] : en[N - 1]) - segS(i));
    let own = 0;
    for (let i = 1; i < N; i++) if (t >= st[i]) own = i;
    let li = own;
    if (typeof s.lineIndex === 'function') {
      const k = s.lineIndex(t);
      if (Number.isFinite(k) && k >= 0) li = clamp(Math.floor(k), 0, N - 1);
    }
    const lp = i => {
      if (typeof s.lineProgress === 'function') { const v = s.lineProgress(i, t); if (Number.isFinite(v)) return clamp(v, 0, 1); }
      return clamp((t - st[i]) / (en[i] - st[i]), 0, 1);
    };
    const segP = i => clamp((t - segS(i)) / dur(i), 0, 1);

    // ---------- simulation clock ----------
    const MODE = ['LIVE', 'LIVE', 'LIVE', 'LIVE', 'LIVE', 'FROZEN', 'SLOW', 'SLOW', 'SLOW', 'SLOW', 'SLOW', 'SLOW', 'LIVE', 'LIVE', 'FAST', 'LIVE'];
    let D711 = 0; for (let i = 7; i <= 11; i++) D711 += dur(i);
    const slowF = Math.max(20, D711 / 0.85);
    const sf = i => (i === 6 ? 20 : slowF);
    let ffTarget = 50;
    const simAt = (i, e) => {
      e = Math.max(0, fin(e, 0));
      const m = MODE[i];
      if (m === 'FROZEN') return 0;
      if (m === 'SLOW') return e / sf(i);
      if (m === 'FAST') { const d = dur(i) * 0.8, p = e / d; return p < 1 ? ffTarget * sm(p) : ffTarget + (e - d); }
      return e;
    };
    const Sb = [0];
    for (let i = 0; i < N; i++) {
      if (i === 14) ffTarget = Math.max(1, 60 - (Sb[14] - Sb[12]));
      Sb.push(Sb[i] + simAt(i, dur(i)));
    }
    let el = Math.max(0, t - segS(li));
    if (li < N - 1) el = Math.min(el, dur(li));
    const S = Sb[li] + simAt(li, el);
    const md = MODE[li];

    // input rotation rate and its exact integral
    const RS = Sb[7], RP = 0.03;
    const G = u => (u <= 0 ? 0 : u < 1 ? u * u * u - u * u * u * u / 2 : u - 0.5);
    const D2 = Math.max(0.1, Sb[3] - Sb[2]);
    const omegaAt = sx => {
      let w = 0;
      if (sx > Sb[2] && sx < Sb[3]) w += 30 * Math.sin(TAU * (sx - Sb[2]) / D2);
      w += 90 * (sm((sx - RS) / RP) - sm((sx - RS - 1) / RP));
      return fin(w, 0);
    };
    const angleAt = sx => {
      let a = 0;
      if (sx > Sb[2]) { const u = Math.min(1, (sx - Sb[2]) / D2); a += 30 * D2 / TAU * (1 - Math.cos(TAU * u)); }
      a += 90 * RP * (G((sx - RS) / RP) - G((sx - RS - 1) / RP));
      return fin(a, 0);
    };

    const Wn = omegaAt(S);
    const trueAng = angleAt(S);
    const biasT = Math.max(0, S - Sb[12]);
    const biasOn = S >= Sb[12] && li >= 12;
    const rateVal = Wn + (biasOn ? 0.1 : 0);
    const gyroRaw = trueAng + (biasOn ? 0.1 * biasT : 0);
    let w15 = 0;
    if (li >= 15) { const p = rng(lp(15), 0.25, 0.9); w15 = (1 - Math.exp(-4.5 * p)) / (1 - Math.exp(-4.5)); }
    const gyroAng = gyroRaw - w15 * (gyroRaw - trueAng);
    const drift = gyroAng - trueAng;

    // visual drive phase (continuous across lines; frozen at v = +max on line 5)
    const fq = i => (i < 4 ? 0 : MODE[i] === 'FROZEN' ? 0 : MODE[i] === 'SLOW' ? 0.55 : 3);
    const Cy = [0];
    for (let i = 0; i < N; i++) Cy.push(Cy[i] + fq(i) * dur(i));
    const off = Cy[5] - Math.floor(Cy[5]);
    const phi = TAU * (Cy[li] + fq(li) * el - off);
    const driveOn = li >= 4;
    const blur = driveOn && (md === 'LIVE' || md === 'FAST');
    const AX = 16;
    const mx = driveOn ? AX * Math.sin(phi) : 0;
    const my = driveOn ? -(14 * Wn / 90) * Math.cos(phi) : 0;
    const ampNm = 0.5 * Math.abs(Wn) / 90;
    const yNm = driveOn ? 0.5 * (Wn / 90) * Math.cos(phi) : 0;

    // ---------- helpers ----------
    let GA = 1;
    const A = a => { ctx.globalAlpha = clamp(fin(a, 0), 0, 1) * GA; };
    const rr = (x, y, w, h, r) => {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    const T = (str, x, y, font, col, align, a) => {
      A(a == null ? 1 : a); ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(str, x, y);
    };
    const arrow = (x1, y1, x2, y2, col, w, h) => {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (!(L > 2)) return;
      const ux = dx / L, uy = dy / L, hh = Math.min(h, L * 0.7);
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * hh * 0.7, y2 - uy * hh * 0.7); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ux * hh - uy * hh * 0.55, y2 - uy * hh + ux * hh * 0.55);
      ctx.lineTo(x2 - ux * hh + uy * hh * 0.55, y2 - uy * hh - ux * hh * 0.55); ctx.closePath(); ctx.fill();
    };
    const panel = (x, y, w, h, r) => {
      if (typeof s.panel === 'function') s.panel(ctx, x, y, w, h, r);
      else { rr(x, y, w, h, r); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke(); }
    };
    const fv = (v, sign) => {
      v = fin(v, 0);
      const a = Math.abs(v);
      if (a < 0.005) return '0.0';
      const str = a < 1 ? a.toFixed(2) : a.toFixed(1);
      return (v < 0 ? '−' : sign ? '+' : '') + str;
    };
    const f1 = v => { v = fin(v, 0); if (Math.abs(v) < 0.05) return '0.0'; return (v < 0 ? '−' : '') + Math.abs(v).toFixed(1); };
    const wrap = (str, font, maxW) => {
      ctx.font = font; const words = String(str || '').split(/\s+/).filter(Boolean); const out = []; let cur = '';
      for (const w of words) { const tt = cur ? cur + ' ' + w : w; if (ctx.measureText(tt).width > maxW && cur) { out.push(cur); cur = w; } else cur = tt; }
      if (cur) out.push(cur); return out;
    };
    const spacing = v => { try { ctx.letterSpacing = v; } catch (e) { /* unsupported */ } };

    // ---------- header ----------
    const hookA = li <= 1 ? 1 : li === 2 ? 1 - sm(rng(t - st[2], 0, 0.5)) : 0;
    GA = 1;
    if (hookA > 0.01) {
      let fs = 68, hl = wrap(s.headline || '', R(fs, 700), 960);
      if (hl.length > 2) { fs = 58; hl = wrap(s.headline || '', R(fs, 700), 960); }
      const y0 = hl.length === 1 ? 168 : 132;
      hl.slice(0, 3).forEach((ln, k) => T(ln, 540, y0 + k * fs * 1.12, R(fs, 700), C.text, 'center', hookA));
    }
    const STEP = ['', '', 'ONLY RATE', 'INSIDE THE CHIP', 'DRIVE  20 kHz', 'TIME FROZEN', 'NO ROTATION', 'ROTATE  90 °/s',
      'CORIOLIS FORCE', 'SLOW ×20', 'SUB-NANOMETRE', 'SENSE  ΔC', 'INTEGRATE', 'BIAS ERROR', 'DRIFT', 'SENSOR FUSION'];
    if (li >= 2 && hookA < 0.99) {
      const a = 1 - hookA;
      spacing('6px'); T('MEMS GYROSCOPE', 540, 98, R(34, 800), C.dim, 'center', a); spacing('0px');
      T(STEP[li], 540, 182, R(58, 800), C.text, 'center', a * (0.3 + 0.7 * sm(rng(t - st[li], 0, 0.4))));
    }

    const panelA = sm(rng(t, 0, 0.6));
    GA = panelA;

    // ---------- top strip ----------
    {
      A(1); panel(60, 228, 960, 204, 18);
      const x0 = 190, xp = 790;
      const oy = w => 330 - (clamp(w, -30, 125) + 30) / 150 * 72;
      const yS = 386;
      const winOf = (i, e) => {
        if (MODE[i] === 'SLOW' || MODE[i] === 'FROZEN') return 0.2;
        if (i === 14) return 3 + 67 * sm(rng(e / dur(i), 0, 0.35));
        if (i === 15) return 70;
        return 3;
      };
      const wPrev = li > 0 ? winOf(li - 1, dur(li - 1)) : 3;
      const Wwin = Math.max(0.05, wPrev + (winOf(li, el) - wPrev) * sm(el / 0.6));
      const xOf = sx => xp - (S - sx) / Wwin * (xp - x0);
      // grid
      A(1); ctx.strokeStyle = C.grid; ctx.lineWidth = 2;
      for (const g of [0, 30, 60, 90, 120]) { ctx.beginPath(); ctx.moveTo(x0, oy(g)); ctx.lineTo(xp, oy(g)); ctx.stroke(); }
      const gs = 60, go = ((S / Wwin * (xp - x0)) % gs + gs) % gs;
      for (let gx = xp - go; gx > x0; gx -= gs) { ctx.beginPath(); ctx.moveTo(gx, 244); ctx.lineTo(gx, 420); ctx.stroke(); }
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, 344); ctx.lineTo(xp, 344); ctx.stroke();
      A(0.8); ctx.setLineDash([6, 8]); ctx.strokeStyle = '#2a4a4a'; ctx.beginPath(); ctx.moveTo(x0, yS); ctx.lineTo(xp, yS); ctx.stroke(); ctx.setLineDash([]);
      // labels
      T('120', 180, 268, R(32, 700), C.dim, 'right');
      T('0', 180, 327, R(32, 700), C.dim, 'right');
      T('Ω', 100, 312, R(44, 800), C.orange, 'center');
      T('SENSE', 180, 398, R(32, 800), C.teal, 'right');
      const NS = 300;
      // sense trace (own band; amplitude ∝ Ω)
      const lam = (md === 'SLOW' || md === 'FROZEN') ? 150 : 44, kx = TAU / lam;
      A(1); ctx.strokeStyle = C.teal; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      let on = false;
      for (let k = 0; k <= NS; k++) {
        const x = x0 + (xp - x0) * k / NS, sx = S - Wwin * (xp - x) / (xp - x0);
        if (sx < 0) { on = false; continue; }
        const amp = driveOn || sx >= Sb[4] ? clamp(34 * omegaAt(sx) / 90, -40, 40) : 0;
        const y = yS - amp * Math.cos(phi - kx * (xp - x));
        if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
      }
      ctx.stroke();
      // Ω trace
      A(1); ctx.strokeStyle = C.orange; ctx.lineWidth = 5;
      ctx.beginPath(); on = false;
      for (let k = 0; k <= NS; k++) {
        const x = x0 + (xp - x0) * k / NS, sx = S - Wwin * (xp - x) / (xp - x0);
        if (sx < 0) { on = false; continue; }
        const y = oy(omegaAt(sx));
        if (on) ctx.lineTo(x, y); else { ctx.moveTo(x, y); on = true; }
      }
      ctx.stroke();
      // dimension labels
      const bracket = (xa, xb, col, txt) => {
        A(0.95); ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(xa, 290); ctx.lineTo(xb, 290); ctx.moveTo(xa, 282); ctx.lineTo(xa, 298); ctx.moveTo(xb, 282); ctx.lineTo(xb, 298); ctx.stroke();
        T(txt, (xa + xb) / 2, 328, R(36, 700), col, 'center');
      };
      if (li >= 12 && li < 14 && S >= RS + 1 + RP) {
        const xa = xOf(RS + RP / 2), xb = xOf(RS + 1 + RP / 2);
        if (xa >= x0 && xb - xa > 60) bracket(xa + 3, xb - 3, C.text, '1 s');
      }
      if (li >= 14) {
        const xa = Math.max(x0, xOf(Sb[12])), xb = xp - 4;
        if (xb - xa > 120) bracket(xa, xb, C.red, Math.round(biasT) + ' s');
      }
      // playhead
      A(0.8); ctx.strokeStyle = C.text; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xp, 240); ctx.lineTo(xp, 422); ctx.stroke();
      const pa = driveOn ? clamp(34 * Wn / 90, -40, 40) : 0;
      A(1); ctx.fillStyle = C.teal; ctx.beginPath(); ctx.arc(xp, yS - pa * Math.cos(phi), 8, 0, TAU); ctx.fill();
      ctx.fillStyle = C.text; ctx.beginPath(); ctx.arc(xp, oy(Wn), 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.orange; ctx.lineWidth = 4; ctx.stroke();
      // mode tag
      const mcol = md === 'LIVE' ? C.green : md === 'FROZEN' ? C.blue : md === 'SLOW' ? C.purple : C.red;
      const mtxt = md === 'LIVE' ? '● LIVE' : md === 'FROZEN' ? 'FROZEN' : md === 'SLOW' ? 'SLOW ×' + Math.round(sf(li)) : '▶▶ FAST';
      A(0.16); rr(810, 242, 194, 50, 25); ctx.fillStyle = mcol; ctx.fill();
      A(1); ctx.strokeStyle = mcol; ctx.lineWidth = 3; ctx.stroke();
      T(mtxt, 907, 278, R(32, 800), mcol, 'center');
      T(Math.round(Wn) + ' °/s', 907, 350, R(44, 700), C.orange, 'center');
      if (li >= 12) T('t +' + (biasT < 10 ? biasT.toFixed(1) : Math.round(biasT)) + ' s', 907, 410, R(34, 700), li >= 13 ? C.red : C.soft, 'center');
      else if (Math.abs(Wn) > 1 && driveOn) T('±' + ampNm.toFixed(2) + ' nm', 907, 410, R(34, 700), C.teal, 'center');
    }

    // ---------- main panel ----------
    A(1); panel(60, 450, 960, 1340, 24);
    const zf = li < 3 ? 0.84 : li === 3 ? 0.84 + 0.16 * oc(segP(3) * 1.4) : 1;
    const K = 1.25 * zf, CY = 1010;
    const MX = rx => 540 + (rx - 540) * K;
    const MY = ry => CY + (ry - 870) * K;
    const dieA = li < 3 ? 0.6 : li === 3 ? 0.6 + 0.4 * sm(segP(3) * 1.4) : 1;
    const labA = li < 3 ? 0 : li === 3 ? sm(segP(3) * 1.6) : 1;
    const phS = li < 3 ? 1.08 : li === 3 ? 1.08 - 0.16 * sm(segP(3) * 1.4) : 0.92;
    const zoomOn = li >= 10 ? oc(lp(10) * 2) : 0;
    const BK = 270 / 210;

    // phone box (phone drawn at exactly TRUE ANGLE)
    {
      ctx.save(); ctx.translate(70, 470); ctx.scale(BK, BK); ctx.translate(-70, -470);
      const pcx = 175, pcy = 562;
      A(1); rr(70, 470, 210, 210, 14); ctx.fillStyle = C.inner; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke();
      const ang = fin(trueAng * Math.PI / 180, 0);
      const pulse = li === 0 ? 1 + 0.04 * Math.sin(t * 5) : 1;
      ctx.save(); ctx.translate(pcx, pcy); ctx.rotate(-ang); ctx.scale(phS * 0.8 * pulse, phS * 0.8 * pulse);
      A(1); rr(-45, -80, 90, 160, 16); ctx.fillStyle = '#202a36'; ctx.fill(); ctx.lineWidth = 5 / (phS * 0.8); ctx.strokeStyle = C.text; ctx.stroke();
      rr(-35, -64, 70, 122, 6); ctx.fillStyle = '#0f151d'; ctx.fill();
      ctx.fillStyle = C.orange; ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(14, -30); ctx.lineTo(-14, -30); ctx.closePath(); ctx.fill();
      ctx.fillRect(-4, -32, 8, 30);
      ctx.restore();
      A(1); ctx.strokeStyle = C.dim; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pcx, pcy, 10, 0, TAU); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.beginPath(); ctx.arc(pcx, pcy, 4, 0, TAU); ctx.fill();
      const arA = clamp(Math.abs(Wn) / 15, 0, 1);
      if (arA > 0.01) {
        A(arA); ctx.strokeStyle = C.orange; ctx.lineWidth = 5; ctx.lineCap = 'round';
        const r = 86, a1 = -0.15 * Math.PI, a2 = -0.85 * Math.PI;
        ctx.beginPath(); ctx.arc(pcx, pcy, r, a1, a2, true); ctx.stroke();
        const ccw = Wn > 0;
        const ae = ccw ? a2 : a1;
        const hx = pcx + r * Math.cos(ae), hy = pcy + r * Math.sin(ae);
        const tx = ccw ? Math.sin(ae) : -Math.sin(ae), ty = ccw ? -Math.cos(ae) : Math.cos(ae);
        arrow(hx - tx * 14, hy - ty * 14, hx + tx * 8, hy + ty * 8, C.orange, 5, 20);
      }
      T('Ω = ' + Math.round(Wn) + ' °/s', pcx, 667, R(28, 800), C.orange, 'center');
      ctx.restore();
    }

    // zoom inset (×1,000,000 on a sense finger)
    {
      ctx.save(); ctx.translate(740, 470); ctx.scale(BK, BK); ctx.translate(-800, -470);
      const cx = 905;
      A(1); rr(800, 470, 210, 210, 14); ctx.fillStyle = C.inner; ctx.fill();
      ctx.strokeStyle = zoomOn > 0.02 ? C.purple : '#4a3f6e'; ctx.lineWidth = zoomOn > 0.02 ? 4 : 3; ctx.stroke();
      T('×1,000,000', cx, 504, R(28, 800), C.purple, 'center', 0.75 + 0.25 * zoomOn);
      const yPx = clamp(yNm * 36, -20, 20);
      A(1); ctx.fillStyle = C.steel; ctx.fillRect(812, 516, 186, 12);
      ctx.fillStyle = C.grey; ctx.fillRect(836, 528, 24, 78); ctx.fillRect(950, 528, 24, 78);
      const tipY = 556 - yPx;
      A(0.25 + 0.25 * zoomOn + (li >= 11 ? 0.25 : 0)); ctx.fillStyle = C.teal; ctx.fillRect(893, 528, 24, tipY - 528);
      A(1); ctx.fillStyle = '#6f7b8c'; ctx.fillRect(812, 610 - yPx, 186, 12); ctx.fillRect(893, tipY, 24, 610 - yPx - tipY);
      A(0.7); ctx.setLineDash([6, 6]); ctx.strokeStyle = C.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(880, 556); ctx.lineTo(990, 556); ctx.stroke(); ctx.setLineDash([]);
      const yStr = (yNm >= 0.005 ? '+' : yNm <= -0.005 ? '−' : '') + Math.abs(yNm).toFixed(2);
      T(yStr + ' nm', cx, 664, R(34, 800), C.teal, 'center', li >= 6 ? 1 : 0.6);
      ctx.restore();
    }

    // mode pill + drive / force formulas (centre column between the two boxes)
    if (md !== 'LIVE') {
      const col = md === 'FROZEN' ? C.blue : md === 'SLOW' ? C.purple : C.red;
      const txt = md === 'FROZEN' ? 'TIME FROZEN' : md === 'SLOW' ? 'SLOW ×' + Math.round(sf(li)) : 'FAST-FWD +' + Math.round(biasT) + ' s';
      ctx.font = R(32, 800); const w = Math.min(370, ctx.measureText(txt).width + 48);
      const pa = sm(rng(t - st[li], 0, 0.3));
      A(0.15 * pa); rr(540 - w / 2, 478, w, 50, 25); ctx.fillStyle = col; ctx.fill();
      A(pa); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      T(txt, 540, 514, R(32, 800), col, 'center', pa);
    }
    const drA = li >= 4 ? (li === 4 ? sm(rng(t - st[4], 0, 0.3)) : 1) : 0;
    if (drA > 0.01) T('f_drive = 20 kHz', 540, 590, R(38, 800), C.purple, 'center', drA);
    if (li >= 8) T('F = 2·m·Ω×v', 540, 648, R(38, 800), C.force, 'center', li === 8 ? sm(rng(lp(8), 0.15, 0.5)) : 1);
    if (li === 4 || (li >= 5 && li <= 6)) T('v flips 40,000×/s', 540, 706, R(32, 700), C.soft, 'center', drA * (li === 4 ? 1 : 0.7));

    // ---------- die ----------
    ctx.save();
    ctx.translate(540, CY); ctx.scale(K, K); ctx.translate(-540, -870);
    GA = panelA * dieA;
    const SX = [420, 480, 540, 600, 660], MXF = [450, 510, 570, 630];
    const hl = li >= 11 ? (li === 11 ? (0.3 + 0.2 * Math.sin(t * 6)) * sm(lp(11) * 3) : 0.15) : 0;
    if (hl > 0) { A(hl); ctx.fillStyle = C.teal; ctx.fillRect(414, 714, 252, 52); ctx.fillRect(414, 974, 252, 52); }
    const anchors = [[335, 740, 353, 758, 392, 788], [745, 740, 727, 758, 688, 788], [335, 1000, 353, 982, 392, 952], [745, 1000, 727, 982, 688, 952]];
    for (const a of anchors) {
      A(1); ctx.strokeStyle = C.grey; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const x1 = a[2], y1 = a[3], x2 = a[4] + mx, y2 = a[5] + my;
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      for (let k = 1; k < 6; k++) { const f = k / 6, o = (k % 2 ? 1 : -1) * 11; ctx.lineTo(x1 + dx * f + nx * o, y1 + dy * f + ny * o); }
      ctx.lineTo(x2, y2); ctx.stroke();
      rr(a[0] - 18, a[1] - 18, 36, 36, 6); ctx.fillStyle = C.steel; ctx.fill(); ctx.strokeStyle = C.grey; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a[0] - 10, a[1] - 10); ctx.lineTo(a[0] + 10, a[1] + 10); ctx.moveTo(a[0] + 10, a[1] - 10); ctx.lineTo(a[0] - 10, a[1] + 10); ctx.stroke();
    }
    const dPulse = driveOn ? 0.7 + 0.3 * Math.abs(Math.sin(phi)) : 1;
    const fcol = driveOn ? C.purple : C.grey;
    const scol = li >= 11 ? C.teal : C.grey;
    if (driveOn) {
      ctx.save(); A(0.5); ctx.shadowColor = C.purple; ctx.shadowBlur = 22;
      for (const bx of [222, 822]) { rr(bx, 800, 36, 140, 8); ctx.strokeStyle = C.purple; ctx.lineWidth = 4; ctx.stroke(); }
      ctx.restore();
    }
    A(1);
    for (const bx of [222, 822]) { rr(bx, 800, 36, 140, 8); ctx.fillStyle = driveOn ? '#4a3f6e' : C.steel; ctx.fill(); ctx.strokeStyle = driveOn ? C.purple : C.grey; ctx.lineWidth = 3; ctx.stroke(); }
    for (const by of [686, 1032]) { rr(410, by, 260, 22, 8); ctx.fillStyle = C.steel; ctx.fill(); ctx.strokeStyle = li >= 11 ? C.teal : C.grey; ctx.lineWidth = 3; ctx.stroke(); }
    A(dPulse); ctx.fillStyle = fcol;
    for (const fy of [830, 870, 910]) { ctx.fillRect(258, fy - 4, 87, 8); ctx.fillRect(735, fy - 4, 87, 8); }
    A(1); ctx.fillStyle = scol;
    for (const x of SX) { ctx.fillRect(x - 4, 708, 8, 54); ctx.fillRect(x - 4, 978, 8, 54); }
    const massGroup = (ox, oy2, a) => {
      A(a); ctx.fillStyle = '#6f7b8c';
      for (const fy of [810, 850, 890, 930]) { ctx.fillRect(300 + ox, fy - 4 + oy2, 92, 8); ctx.fillRect(688 + ox, fy - 4 + oy2, 92, 8); }
      for (const fx of MXF) { ctx.fillRect(fx - 4 + ox, 728 + oy2, 8, 59); ctx.fillRect(fx - 4 + ox, 953 + oy2, 8, 59); }
      rr(390 + ox, 785 + oy2, 300, 170, 14); ctx.fillStyle = C.mass; ctx.fill(); ctx.strokeStyle = C.grey; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (let ix = 0; ix < 7; ix++) for (let iy = 0; iy < 4; iy++) ctx.fillRect(412 + ix * 40 + ox, 803 + iy * 38 + oy2, 12, 12);
    };
    if (blur) { for (const k of [-1, -0.5, 0.5, 1]) massGroup(AX * k, my, 0.18); }
    massGroup(mx, my, 1);
    const ccx = 540 + mx, ccy = 870 + my;
    if (li >= 9 && Wn > 1) {
      A(0.85); ctx.setLineDash([5, 6]); ctx.strokeStyle = C.teal; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(540, 870, AX, Math.max(1, 14 * Wn / 90), 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if (driveOn) {
      const vA = li === 4 ? sm(rng(t - st[4], 0.1, 0.5)) : 1;
      const vl = 115 * Math.cos(phi);
      A(vA); arrow(ccx, ccy, ccx + vl, ccy, C.text, 7, 26);
      if (Math.abs(vl) > 20) T('v', ccx + vl + (vl > 0 ? 12 : -12), ccy - 14, R(38, 800), C.text, vl > 0 ? 'left' : 'right', vA);
      if (li >= 8 && Wn > 1) {
        const fA = li === 8 ? sm(lp(8) * 3) : 1;
        const fl = 72 * Math.cos(phi) * Wn / 90;
        A(fA); arrow(ccx, ccy, ccx, ccy - fl, C.force, 7, 26);
        if (Math.abs(fl) > 14) T('F', ccx + 16, ccy - fl + (fl > 0 ? 22 : 0), R(38, 800), C.force, 'left', fA);
      }
      A(1); ctx.fillStyle = C.text; ctx.beginPath(); ctx.arc(ccx, ccy, 6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    GA = panelA;

    // lens to inset
    {
      const lx = MX(630), ly = MY(742), lr = 28 * K;
      A(0.45 + 0.55 * zoomOn); ctx.strokeStyle = C.purple; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, TAU); ctx.stroke();
      ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(lx + lr * 0.7, ly - lr * 0.7); ctx.lineTo(752, 740); ctx.stroke(); ctx.setLineDash([]);
    }

    // part labels (padded, outside the anchors)
    if (labA > 0.01) {
      const dcol = driveOn ? C.purple : C.soft;
      T('DRIVE', MX(240), MY(800) - 18, R(34, 800), dcol, 'center', labA);
      T('DRIVE', MX(840), MY(800) - 18, R(34, 800), dcol, 'center', labA);
      T('SENSE', MX(400) - 6, MY(700), R(32, 800), li >= 11 ? C.teal : C.soft, 'right', labA);
      T('SENSE', 540, MY(1054) + 44, R(32, 800), li >= 11 ? C.teal : C.soft, 'center', labA);
      T('SPRING', MX(745), MY(740) - 18 * K - 14, R(32, 800), C.soft, 'center', labA);
      T('ANCHOR', MX(745), MY(1000) + 18 * K + 40, R(32, 800), C.soft, 'center', labA);
      T('PROOF MASS', MX(540 + mx), MY(942 + my), R(32, 800), '#aab4c3', 'center', labA * (li >= 5 ? 0.6 : 1));
    }
    if (drA > 0.01) {
      const xa = MX(390 - AX), xb = MX(390 + AX), y1 = MY(960), y2 = MY(1054) + 15;
      A(drA * 0.85); ctx.setLineDash([5, 6]); ctx.strokeStyle = C.text; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(xa, y1); ctx.lineTo(xa, y2); ctx.moveTo(xb, y1); ctx.lineTo(xb, y2); ctx.stroke(); ctx.setLineDash([]);
      A(drA); arrow((xa + xb) / 2, y2 - 10, xa, y2 - 10, C.text, 3, 10); arrow((xa + xb) / 2, y2 - 10, xb, y2 - 10, C.text, 3, 10);
      T('~10 µm', xa - 12, y2, R(34, 800), C.text, 'right', drA);
    }
    if (li >= 11) {
      const dc = Math.round(Math.abs(yNm) * 500);
      const dcs = (yNm > 0 && dc ? '+' : yNm < 0 && dc ? '−' : '') + dc;
      T('ΔC ' + dcs + ' aF', 640, MY(1054) + 44, R(34, 800), C.purple, 'left', sm(lp(11) * 3));
    }

    // ---------- readouts ----------
    const RY = 1310, RH = 270;
    A(1); rr(80, RY, 920, RH, 18); ctx.fillStyle = C.inner; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(540, RY + 15); ctx.lineTo(540, RY + RH - 15); ctx.moveTo(100, RY + 135); ctx.lineTo(980, RY + 135); ctx.stroke();
    const cell = (cx, row, label, col, val, unit, unitCol, a) => {
      const ly = RY + 42 + row * 135, vy = RY + 118 + row * 135;
      T(label, cx, ly, R(34, 800), col, 'left', a);
      T(val, cx, vy, R(84, 700), col, 'left', a);
      ctx.font = R(84, 700); const w = ctx.measureText(val).width;
      if (unit) T(unit, cx + w + 10, vy, R(40, 800), unitCol || col, 'left', a);
      return w;
    };
    const angDim = li >= 1 && li < 12 ? (li === 1 ? 1 - 0.45 * sm(lp(1) * 3) : 0.55) : 1;
    let rg = 0;
    if (li === 2) rg = 0.5 + 0.5 * Math.sin(t * 9);
    else if (li === 11) rg = (0.6 + 0.4 * Math.sin(t * 6)) * sm(lp(11) * 3);
    if (rg > 0.01) {
      ctx.save(); A(rg); ctx.shadowColor = C.teal; ctx.shadowBlur = 24; rr(90, RY + 8, 440, 120, 14); ctx.strokeStyle = C.teal; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
    }
    const rStr = fv(rateVal, false);
    if (li === 2) { A(0.25 * rg + 0.1); ctx.fillStyle = C.teal; ctx.font = R(84, 700); const w = ctx.measureText(rStr).width; rr(105 + w + 4, RY + 82, 76, 48, 10); ctx.fill(); }
    cell(105, 0, 'RATE', C.teal, rStr, '°/s', li === 2 ? C.text : C.teal, 1);
    if (li >= 13) T('BIAS +0.1 °/s', 520, RY + 42, R(32, 800), C.red, 'right', sm(lp(13) * 4));
    const wT = cell(565, 0, 'TRUE ANGLE', C.orange, f1(trueAng) + '°', '', null, angDim);
    const wG = cell(105, 1, 'GYRO ANGLE', C.teal, f1(gyroAng) + '°', '', null, angDim);
    if (li === 1) {
      const sa = 0.9 * Math.sin(Math.PI * clamp(lp(1) * 1.3, 0, 1));
      if (sa > 0.01) {
        A(sa); ctx.strokeStyle = C.red; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(555, RY + 90); ctx.lineTo(575 + wT, RY + 90);
        ctx.moveTo(95, RY + 225); ctx.lineTo(115 + wG, RY + 225); ctx.stroke();
      }
    }
    {
      const dstr = fv(drift, true) + '°';
      const glow = li === 13 ? 0.5 : li === 14 ? clamp(drift / 6, 0.4, 1) : li === 15 ? clamp(drift / 6, 0, 1) * 0.6 : 0;
      ctx.save();
      if (glow > 0.01) { ctx.shadowColor = C.red; ctx.shadowBlur = 30 * glow; }
      cell(565, 1, 'DRIFT', C.red, dstr, '', null, li >= 12 ? 1 : 0.55);
      ctx.restore();
      if (li >= 13 && li <= 14) T('≈6°/min', 980, RY + 177, R(32, 800), C.red, 'right', sm(lp(13) * 4));
      else if (li >= 15) T('FIXED', 980, RY + 177, R(32, 800), C.green, 'right', sm(rng(lp(15), 0.6, 0.9)));
    }

    // ---------- integrator / fusion / accel ----------
    const sigA = li >= 12 ? sm(lp(12) * 3) : 0;
    const accA = li >= 15 ? sm(lp(15) * 3) : 0;
    const BY = 1598, BH = 176, MIDY = BY + BH / 2;
    const flow = (x1, y1, x2, y2, col, a) => {
      if (a < 0.01) return;
      A(a); arrow(x1, y1, x2, y2, col, 4, 16);
      const f = (t * 0.9) % 1; A(a); ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, 6, 0, TAU); ctx.fill();
    };
    {
      const a = 0.6 + 0.4 * sigA;
      A(a); rr(90, BY, 280, BH, 16); ctx.fillStyle = C.inner; ctx.fill(); ctx.strokeStyle = sigA > 0.5 ? C.teal : C.line; ctx.lineWidth = 3; ctx.stroke();
      T('Σ RATE·Δt', 230, MIDY - 22, R(40, 800), C.teal, 'center', a);
      T('Δt = 1 ms', 230, MIDY + 24, R(34, 700), C.soft, 'center', a);
      T('(1 kHz)', 230, MIDY + 66, R(32, 700), C.dim, 'center', a);
    }
    {
      const a = 0.6 + 0.4 * Math.max(sigA * 0.6, accA);
      A(a); rr(420, MIDY - 55, 240, 110, 16); ctx.fillStyle = C.inner; ctx.fill(); ctx.strokeStyle = accA > 0.5 ? C.purple : C.line; ctx.lineWidth = 3; ctx.stroke();
      T('FUSION', 540, MIDY + 14, R(42, 800), accA > 0.5 ? C.purple : C.soft, 'center', a);
    }
    {
      const a = 0.6 + 0.4 * accA;
      ctx.save();
      if (accA > 0.5) { ctx.shadowColor = C.blue; ctx.shadowBlur = 20 * accA; }
      A(a); rr(710, BY, 290, BH, 16); ctx.fillStyle = C.inner; ctx.fill(); ctx.strokeStyle = accA > 0.5 ? C.blue : C.line; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      T('ACCEL', 855, BY + 44, R(36, 800), C.blue, 'center', a);
      const bob = accA > 0.5 ? 4 * Math.sin(t * 4) : 0;
      A(a); arrow(770, BY + 58, 770, BY + 158 + bob, C.blue, 7, 26);
      T('g', 805, BY + 100, R(38, 800), C.blue, 'left', a);
      T('9.8 m/s²', 805, BY + 150, R(36, 700), C.text, 'left', a);
    }
    flow(370, MIDY, 420, MIDY, C.teal, sigA);
    flow(710, MIDY, 660, MIDY, C.blue, accA);
    flow(540, MIDY - 55, 540, RY + RH + 2, li >= 15 ? C.purple : C.teal, Math.max(sigA * 0.7, accA));

    // ---------- brand ----------
    GA = 1;
    if (s.brand) {
      spacing('4px'); T(String(s.brand), 540, 1840, MONO(28), C.dim, 'center', 1); spacing('0px');
    }
  } catch (e) {
    // never throw from a frame
  }
  ctx.restore();
}
