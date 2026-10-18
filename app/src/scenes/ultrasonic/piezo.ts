// 06 — The piezo disc. A cut-away transducer: voltage in flexes the disc and pushes out sound
// (cyan); then an echo comes in, flexes the disc and makes a voltage (orange) on the scope.
import { clamp, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, MONO, paper, SIGNAL, W, type Ctx } from '../../kit';
import { beats } from './script';
import { arcs, CYAN, DIM, headingV, label, panel } from './ui';

const B = beats(['piezo-1', 'piezo-2', 'piezo-3'], { lead: 0.4, tail: 1.0 });
export const LENGTH = B.length;

const CX = W / 2;
const DISC_Y = 800;
const DISC_W = 440;
const F = 5; // on-screen flex rate, Hz (stand-in for 40 kHz)
const DRIVE0 = B.at('piezo-2') + 0.8;
const DRIVE1 = B.at('piezo-3') - 0.1;
const ECHO0 = B.at('piezo-3') + 0.3; // incoming waves start
const ECHO_HIT = ECHO0 + 0.75;
const ECHO1 = ECHO_HIT + 1.6;
const V = 520;

/** 0..1 drive amplitude envelope and 0..1 echo envelope. */
const drive = (t: number) => range(t, DRIVE0, DRIVE0 + 0.2) * (1 - range(t, DRIVE1 - 0.2, DRIVE1));
const echo = (t: number) => range(t, ECHO_HIT, ECHO_HIT + 0.15) * (1 - range(t, ECHO1 - 0.6, ECHO1));

function disc(ctx: Ctx, bend: number, a: number, glow: string | null) {
  ctx.save();
  ctx.globalAlpha = a;
  const x0 = CX - DISC_W / 2;
  const x1 = CX + DISC_W / 2;
  const layer = (dy: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, DISC_Y + dy);
    ctx.quadraticCurveTo(CX, DISC_Y + dy - bend * 2, x1, DISC_Y + dy);
    ctx.lineTo(x1, DISC_Y + dy + h);
    ctx.quadraticCurveTo(CX, DISC_Y + dy + h - bend * 2, x0, DISC_Y + dy + h);
    ctx.closePath();
    ctx.fill();
  };
  layer(0, 12, '#d9b25a'); // brass
  ctx.save();
  ctx.beginPath();
  ctx.rect(CX - 150, 0, 300, 2000);
  ctx.clip();
  layer(12, 16, glow ?? '#ece6da'); // ceramic
  ctx.restore();
  // resonator cone
  ctx.fillStyle = '#b9bcc2';
  ctx.beginPath();
  ctx.moveTo(CX - 18, DISC_Y - bend + 2);
  ctx.lineTo(CX - 120, DISC_Y - 120 - bend * 1.4);
  ctx.lineTo(CX + 120, DISC_Y - 120 - bend * 1.4);
  ctx.lineTo(CX + 18, DISC_Y - bend + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default class Piezo extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'pad', dur, notes: [40, 47, 52, 55, 59] }, ...B.cues()];
    c.push({ t: 0.5, kind: 'whoosh', dur: 0.8, gain: 0.3 });
    for (let t = DRIVE0; t < DRIVE1 - 0.2; t += 1 / F) c.push({ t, kind: 'zap', gain: 0.18, pitch: 2 });
    c.push({ t: ECHO_HIT, kind: 'hit', gain: 0.6, pitch: 1.3 });
    c.push({ t: ECHO_HIT + 0.05, kind: 'chime', gain: 0.4, pitch: 1.8 });
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'THE SECRET INGREDIENT', 'The piezo disc', t, out);

    const d = drive(t);
    const e = echo(t);
    const osc = Math.sin(2 * Math.PI * F * t);
    const bend = 16 * osc * d + 14 * Math.sin(2 * Math.PI * F * (t - ECHO_HIT)) * e * Math.exp(-(t - ECHO_HIT) * 1.2);
    const draw = outCubic(range(t, 0.2, 1.2));

    // can (cut-away)
    fg.save();
    fg.globalAlpha = out;
    fg.strokeStyle = '#c9ccd1';
    fg.lineWidth = 14;
    fg.lineJoin = 'round';
    const top = 560;
    const bot = 940;
    const hw = 270;
    fg.setLineDash([2000]);
    fg.lineDashOffset = 2000 * (1 - draw);
    fg.beginPath();
    fg.moveTo(CX - hw, top);
    fg.lineTo(CX - hw, bot);
    fg.lineTo(CX + hw, bot);
    fg.lineTo(CX + hw, top);
    fg.stroke();
    fg.setLineDash([]);
    // mesh across the top
    fg.globalAlpha = out * range(t, 0.8, 1.2);
    fg.strokeStyle = 'rgba(239,230,214,0.5)';
    fg.lineWidth = 4;
    fg.setLineDash([10, 8]);
    fg.beginPath();
    fg.moveTo(CX - hw, top);
    fg.lineTo(CX + hw, top);
    fg.stroke();
    fg.setLineDash([]);
    // supports
    fg.fillStyle = '#6d7076';
    fg.fillRect(CX - DISC_W / 2 - 4, DISC_Y - 6, 26, 50);
    fg.fillRect(CX + DISC_W / 2 - 22, DISC_Y - 6, 26, 50);
    fg.restore();

    const glowCol = e > 0.05 ? SIGNAL : d > 0.05 ? CYAN : null;
    disc(fg, bend, out * range(t, 0.6, 1.0), glowCol);

    // wires to terminals
    const wa = range(t, 1.0, 1.4) * out;
    const live = Math.max(d, e);
    const wireCol = e > 0.05 ? SIGNAL : d > 0.05 ? CYAN : '#8a8178';
    fg.save();
    fg.globalAlpha = wa;
    fg.strokeStyle = wireCol;
    fg.lineWidth = 5;
    if (live > 0) {
      fg.shadowColor = wireCol;
      fg.shadowBlur = 14 * live;
    }
    fg.beginPath();
    fg.moveTo(CX - 60, DISC_Y + 28);
    fg.lineTo(CX - 60, 1010);
    fg.moveTo(CX + 60, DISC_Y + 12);
    fg.lineTo(CX + 110, DISC_Y + 40);
    fg.lineTo(CX + 110, 1010);
    fg.stroke();
    fg.restore();
    label(fg, '+', CX - 60, 1050, DISPLAY(40, 900), wireCol, wa);
    label(fg, '−', CX + 110, 1050, DISPLAY(40, 900), wireCol, wa);

    // callouts
    const ca = range(t, 0.9, 1.4) * (1 - range(t, B.at('piezo-2') - 0.2, B.at('piezo-2') + 0.2)) * out;
    label(fg, 'PIEZO CERAMIC', CX, 470, DISPLAY(40, 800), BONE, ca);
    label(fg, 'on a brass disc', CX, 510, MONO(26, 500), DIM, ca);
    label(fg, 'piezo = "squeeze" in Greek', CX, 1140, MONO(28, 500), DIM, range(t, 1.4, 1.8) * (1 - range(t, B.at('piezo-2') - 0.2, B.at('piezo-2') + 0.2)) * out);

    // sound out
    fg.save();
    fg.beginPath();
    fg.rect(0, 380, W, DISC_Y - 510);
    fg.clip();
    const fronts: number[] = [];
    for (let s = DRIVE0; s < DRIVE1 - 0.2; s += 1 / F) if (t > s) fronts.push((t - s) * V);
    arcs(fg, CX, DISC_Y - 120, -Math.PI / 2, 1.2, fronts, CYAN, (_, r) => clamp(1 - r / 700) * out, 6);
    // echo in
    const ins: number[] = [];
    for (let k = 0; k < 6; k++) {
      const s = ECHO0 + k / F;
      const r = 700 - (t - s) * V;
      if (t > s && r > 120) ins.push(r);
    }
    arcs(fg, CX, DISC_Y - 120, -Math.PI / 2, 1.0, ins, SIGNAL, (_, r) => clamp((700 - r) / 200) * out, 6);
    fg.restore();
    label(fg, 'SOUND OUT', CX, 440, DISPLAY(46, 900), CYAN, range(t, DRIVE0 + 0.4, DRIVE0 + 0.7) * (1 - range(t, DRIVE1, DRIVE1 + 0.3)) * out);
    label(fg, 'ECHO IN', CX, 440, DISPLAY(46, 900), SIGNAL, range(t, ECHO0, ECHO0 + 0.3) * (1 - range(t, ECHO1, ECHO1 + 0.3)) * out);

    // scope
    const sa = range(t, B.at('piezo-2'), B.at('piezo-2') + 0.4) * out;
    if (sa > 0) {
      const x0 = 110;
      const x1 = 970;
      const y0 = 1090;
      const h = 190;
      panel(fg, x0, y0, x1 - x0, h, sa);
      const mid = y0 + h / 2;
      fg.save();
      fg.globalAlpha = sa;
      fg.beginPath();
      fg.rect(x0, y0, x1 - x0, h);
      fg.clip();
      fg.strokeStyle = 'rgba(239,230,214,0.08)';
      fg.lineWidth = 1;
      for (let x = x0; x < x1; x += 43) {
        fg.beginPath();
        fg.moveTo(x, y0);
        fg.lineTo(x, y0 + h);
        fg.stroke();
      }
      // scrolling trace: newest sample at the right edge
      fg.lineWidth = 4;
      const span = 2.2;
      let prev: [number, number] | null = null;
      for (let x = x0; x <= x1; x += 3) {
        const st = t - span * ((x1 - x) / (x1 - x0));
        const dv = drive(st) * Math.sin(2 * Math.PI * F * 2 * st);
        const ev = echo(st) * Math.exp(-Math.max(0, st - ECHO_HIT) * 1.2) * Math.sin(2 * Math.PI * F * 2 * (st - ECHO_HIT));
        const y = mid - (dv + ev) * 70;
        if (prev) {
          fg.strokeStyle = Math.abs(ev) > Math.abs(dv) ? SIGNAL : Math.abs(dv) > 1e-3 ? CYAN : DIM;
          fg.beginPath();
          fg.moveTo(prev[0], prev[1]);
          fg.lineTo(x, y);
          fg.stroke();
        }
        prev = [x, y];
      }
      fg.restore();
      const inA = range(t, DRIVE0, DRIVE0 + 0.3) * (1 - range(t, ECHO0, ECHO0 + 0.3));
      const outA = range(t, ECHO_HIT, ECHO_HIT + 0.3);
      label(fg, 'VOLTAGE IN  →  MOTION', x0 + 20, y0 + 36, MONO(24, 500), CYAN, sa * inA, 'left');
      label(fg, 'MOTION  →  VOLTAGE OUT', x0 + 20, y0 + 36, MONO(24, 500), SIGNAL, sa * outA, 'left');
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
