// 02 — 1897: Thomson's cathode ray tube. A beam bends toward the + plate (it's negative);
// then the puzzle: atoms are neutral, so where is the positive charge?
import { clamp, inOutCubic, lerp, outBack, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, card, DISPLAY, fadeInk, glow, heading, INK, MONO, paper, SIGNAL, slate, typed, W, type Ctx } from '../../kit';
import { beats } from './script';

const B = beats(['electron-1', 'electron-2'], { lead: 0.5, tail: 1.0 });
export const LENGTH = B.length;

const BEAM = '#9fd8ff';
const TUBE = { x0: 380, x1: 1480, y: 540 };
const CATHODE_X = 470;
const ANODE_X = 650;
const PLATES = { x0: 820, x1: 1080 };
const SCREEN_X = 1430;

/** Beam y at x, for deflection amount k (0 = straight). The beam curves between the plates, then runs straight. */
function beamY(x: number, k: number) {
  const L = PLATES.x1 - PLATES.x0;
  if (x <= PLATES.x0) return TUBE.y;
  if (x <= PLATES.x1) return TUBE.y - k * ((x - PLATES.x0) / L) ** 2 * 60;
  return TUBE.y - k * (60 + (x - PLATES.x1) * (120 / L));
}

function tube(ctx: Ctx, p: number, field: number, t: number) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = p;
  // glass
  ctx.strokeStyle = 'rgba(239,230,214,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(TUBE.x0, TUBE.y - 120, (TUBE.x1 - TUBE.x0) * outCubic(p), 240, 120);
  ctx.stroke();
  // cathode (−) and anode (+) with slit
  ctx.fillStyle = '#3b3631';
  ctx.strokeStyle = BONE;
  ctx.fillRect(CATHODE_X - 8, TUBE.y - 70, 16, 140);
  ctx.strokeRect(CATHODE_X - 8, TUBE.y - 70, 16, 140);
  for (const [y0, y1] of [[TUBE.y - 80, TUBE.y - 8], [TUBE.y + 8, TUBE.y + 80]]) {
    ctx.fillRect(ANODE_X - 6, y0, 12, y1 - y0);
    ctx.strokeRect(ANODE_X - 6, y0, 12, y1 - y0);
  }
  ctx.font = MONO(22, 500);
  ctx.fillStyle = BONE;
  ctx.textAlign = 'center';
  ctx.fillText('−', CATHODE_X, TUBE.y - 86);
  ctx.fillText('+', ANODE_X, TUBE.y - 92);
  // deflection plates: top +, bottom −
  ctx.fillStyle = field > 0 ? `rgba(255,90,31,${0.35 + 0.5 * field})` : '#3b3631';
  ctx.fillRect(PLATES.x0, TUBE.y - 92, PLATES.x1 - PLATES.x0, 10);
  ctx.fillStyle = field > 0 ? `rgba(159,216,255,${0.25 + 0.4 * field})` : '#3b3631';
  ctx.fillRect(PLATES.x0, TUBE.y + 82, PLATES.x1 - PLATES.x0, 10);
  if (field > 0) {
    ctx.globalAlpha = p * field;
    ctx.fillStyle = SIGNAL;
    ctx.fillText('+  +  +  +  +', (PLATES.x0 + PLATES.x1) / 2, TUBE.y - 102);
    ctx.fillStyle = BEAM;
    ctx.fillText('−  −  −  −  −', (PLATES.x0 + PLATES.x1) / 2, TUBE.y + 122);
    // field lines, drifting down
    ctx.strokeStyle = 'rgba(239,230,214,0.18)';
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -t * 30;
    for (let x = PLATES.x0 + 20; x < PLATES.x1; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, TUBE.y - 80);
      ctx.lineTo(x, TUBE.y + 80);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // fluorescent screen
  ctx.globalAlpha = p;
  ctx.fillStyle = 'rgba(200,255,154,0.25)';
  ctx.fillRect(SCREEN_X - 4, TUBE.y - 100, 8, 200);
  ctx.restore();
}

export default class Electron extends Scene {
  cues(dur: number): Cue[] {
    const a1 = B.at('electron-1');
    return [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [45, 52, 57, 60, 64] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: 0.3, kind: 'whoosh', dur: 0.8, gain: 0.35 },
      { t: a1 + 1.2, kind: 'servo', dur: 2.5, gain: 0.35 },
      { t: a1 + 3.6, kind: 'riser', dur: 1.2, gain: 0.25 },
      { t: B.end('electron-1') - 1.4, kind: 'chime', gain: 0.25, pitch: 1.5 },
      { t: B.at('electron-2') + 0.2, kind: 'pop', gain: 0.6, pitch: 0.6 },
      { t: B.at('electron-2') + 2.2, kind: 'hit', gain: 0.6, pitch: 1.3 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    const out = 1 - range(t, L - 0.45, L - 0.05);
    const a1 = B.at('electron-1');
    const a2 = B.at('electron-2');
    paper(bg);
    slate(fg, 'RUTHERFORD  /  02 ELECTRON', f.t, out);
    heading(fg, '01 / 1897', 'Discovery of the electron', t, out * (1 - range(t, a2 - 0.3, a2)));

    // Part 1: the tube. It slides left and shrinks when the puzzle starts.
    const away = inOutCubic(range(t, a2 - 0.2, a2 + 0.6));
    fg.save();
    fg.globalAlpha = out * (1 - away * 0.75);
    fg.translate(lerp(0, -260, away), lerp(0, 120, away));
    fg.translate(W / 2, 540);
    fg.scale(lerp(1, 0.55, away), lerp(1, 0.55, away));
    fg.translate(-W / 2, -540);
    const field = range(t, a1 + 3.4, a1 + 4.2);
    tube(fg, range(t, 0.2, 1.4), field, t);
    // the beam: dots streaming from cathode to screen, bending once the plates are charged
    const beamOn = range(t, a1 + 1.0, a1 + 1.4);
    if (beamOn > 0) {
      for (let k = 0; k < 26; k++) {
        const x = CATHODE_X + 10 + ((t * 700 + k * 38) % (SCREEN_X - CATHODE_X - 10));
        glow(fg, x, beamY(x, field), 3, BEAM, beamOn * 0.9);
      }
      glow(fg, SCREEN_X, beamY(SCREEN_X, field), 12, '#c8ff9a', beamOn);
      fg.font = MONO(20, 500);
      fg.fillStyle = `rgba(239,230,214,${0.7 * beamOn})`;
      fg.fillText('cathode rays', CATHODE_X + 40, TUBE.y + 170);
      if (field > 0) {
        fg.fillStyle = `rgba(255,90,31,${field})`;
        fg.fillText('bends toward + : the rays are negative', 900, TUBE.y - 160);
      }
    }
    fg.restore();

    card(fg, 1490, 250, 380, 'electron, e⁻', ['charge  −1.6 × 10⁻¹⁹ C', 'mass    9.1 × 10⁻³¹ kg', '~1/1840 of a hydrogen atom'],
      outCubic(range(t, B.end('electron-1') - 1.6, B.end('electron-1') - 1.0)) * out * (1 - away));

    // Part 2: a neutral atom with electrons in it... and a question mark for the positive charge.
    const q = range(t, a2, a2 + 0.6);
    if (q > 0) {
      const cx = 1230;
      const cy = 500;
      const r = 230 * outBack(q, 1.4);
      fg.save();
      fg.globalAlpha = out;
      fg.strokeStyle = 'rgba(239,230,214,0.45)';
      fg.setLineDash([5, 9]);
      fg.lineWidth = 2;
      fg.beginPath();
      fg.arc(cx, cy, r, 0, Math.PI * 2);
      fg.stroke();
      fg.setLineDash([]);
      const es: [number, number][] = [[-90, -80], [70, -110], [110, 60], [-60, 100], [0, 10], [-140, 20]];
      es.forEach(([x, y], i) => {
        const a = outBack(range(t, a2 + 0.3 + i * 0.08, a2 + 0.6 + i * 0.08), 2);
        if (a <= 0) return;
        fg.fillStyle = BEAM;
        fg.beginPath();
        fg.arc(cx + x * (r / 230), cy + y * (r / 230), 15 * a, 0, Math.PI * 2);
        fg.fill();
        fg.fillStyle = INK;
        fg.fillRect(cx + x * (r / 230) - 7 * a, cy + y * (r / 230) - 2, 14 * a, 4);
      });
      const qm = range(t, a2 + 2.0, a2 + 2.5);
      if (qm > 0) {
        fg.font = DISPLAY(150, 900);
        fg.textAlign = 'center';
        fg.fillStyle = SIGNAL;
        fg.globalAlpha = out * qm * (0.75 + 0.25 * Math.sin(t * 5));
        fg.fillText('+?', cx + 10, cy + 55);
      }
      fg.restore();
      typed(fg, 'atom:  (−) electrons  +  ( ? )  =  0  neutral', cx, cy + 320, range(t, a2 + 0.8, a2 + 2.2), 26, BONE, {
        align: 'center',
        alpha: out * clamp(q * 2),
      });
    }

    B.subs(fg, t);
    fadeInk(fg, 1 - out);
  }
}
