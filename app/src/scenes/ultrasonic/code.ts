// 09 — In code. The Arduino lines type out with syntax colours, then readings scroll in a serial
// monitor.
import { range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, fadeInk, GOLD, MONO, paper, SIGNAL, type Ctx } from '../../kit';
import { beats, dur } from './script';
import { CYAN, DIM, GREEN, headingV, label, panel } from './ui';

const B = beats(['code-1'], { lead: 0.4, tail: 2.2 });
export const LENGTH = B.length;

const CODE = [
  '// 1. send a 10 µs trigger',
  'digitalWrite(TRIG, HIGH);',
  'delayMicroseconds(10);',
  'digitalWrite(TRIG, LOW);',
  '',
  '// 2. time the echo pulse',
  'long t = pulseIn(ECHO, HIGH);',
  '',
  '// 3. convert to centimetres',
  'float cm = t / 58.0;',
];
const TOTAL = CODE.reduce((n, l) => n + l.length, 0);
const T0 = B.at('code-1') + 0.3;
const T1 = B.at('code-1') + dur('code-1') * 0.95;
const READINGS = ['20.1', '20.0', '19.8', '15.2', '9.7', '9.6'];
const R0 = T1 + 0.2;
const RSTEP = 0.32;

const KEYWORDS = new Set(['long', 'float']);
const CONSTS = new Set(['TRIG', 'ECHO', 'HIGH', 'LOW']);

/** Draws one line of code, the first `n` characters, coloured by token. */
function codeLine(ctx: Ctx, text: string, x: number, y: number, n: number) {
  ctx.save();
  ctx.font = MONO(32, 500);
  if (text.startsWith('//')) {
    ctx.fillStyle = DIM;
    ctx.fillText(text.slice(0, n), x, y);
    ctx.restore();
    return;
  }
  const tokens = text.match(/[A-Za-z_]\w*|\d+(\.\d+)?|\s+|./g) ?? [];
  let used = 0;
  let cx = x;
  for (let i = 0; i < tokens.length && used < n; i++) {
    const tok = tokens[i];
    const s = tok.slice(0, n - used);
    used += tok.length;
    const next = tokens[i + 1];
    ctx.fillStyle = KEYWORDS.has(tok) ? SIGNAL : CONSTS.has(tok) ? GOLD : /^\d/.test(tok) ? GREEN : next === '(' ? CYAN : BONE;
    ctx.fillText(s, cx, y);
    cx += ctx.measureText(tok).width;
  }
  ctx.restore();
}

export default class Code extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'pad', dur, notes: [45, 52, 57, 59, 64] }, ...B.cues()];
    c.push({ t: T0, kind: 'type', dur: T1 - T0, gain: 0.5 });
    READINGS.forEach((_, i) => c.push({ t: R0 + i * RSTEP, kind: 'pop', gain: 0.25, pitch: 1.5 }));
    c.push({ t: dur - 0.6, kind: 'whoosh', dur: 0.6, gain: 0.5 });
    return c;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.4, L - 0.05);
    paper(bg);
    headingV(fg, 'ARDUINO', 'In just a few lines', t, out);

    const pa = range(t, 0.2, 0.6) * out;
    panel(fg, 60, 420, 960, 560, pa);
    // window dots
    fg.save();
    fg.globalAlpha = pa;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      fg.fillStyle = c;
      fg.beginPath();
      fg.arc(100 + i * 32, 458, 9, 0, Math.PI * 2);
      fg.fill();
    });
    fg.restore();
    label(fg, 'sonar.ino', 990, 468, MONO(22, 500), DIM, pa, 'right');

    let chars = Math.floor(TOTAL * range(t, T0, T1));
    fg.save();
    fg.globalAlpha = out;
    CODE.forEach((l, i) => {
      const n = Math.min(l.length, chars);
      chars -= l.length;
      if (n > 0) codeLine(fg, l, 100, 540 + i * 44, n);
      if (n > 0 && n < l.length) {
        fg.font = MONO(32, 500);
        fg.fillStyle = SIGNAL;
        fg.fillRect(100 + fg.measureText(l.slice(0, n)).width + 2, 540 + i * 44 - 26, 16, 32);
      }
    });
    fg.restore();

    // serial monitor
    const sa = range(t, T1 - 0.2, T1 + 0.2) * out;
    panel(fg, 60, 1010, 960, 290, sa, GREEN);
    label(fg, 'SERIAL MONITOR', 100, 1052, MONO(22, 500), GREEN, sa, 'left');
    READINGS.forEach((r, i) => {
      const at = R0 + i * RSTEP;
      if (t < at) return;
      const shown = READINGS.slice(0, Math.min(READINGS.length, Math.floor((t - R0) / RSTEP) + 1));
      const row = shown.length - 1 - i;
      if (row > 3) return;
      label(fg, `Distance: ${r} cm`, 100, 1270 - row * 48, MONO(34, 500), row === 0 ? BONE : DIM, sa * range(t, at, at + 0.1), 'left');
    });

    B.subs(fg, t, 1430);
    fadeInk(fg, 1 - range(t, 0, 0.2) + (1 - out));
  }
}
