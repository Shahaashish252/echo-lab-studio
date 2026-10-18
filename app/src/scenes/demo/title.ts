// Plate 1 — kinetic typography. "MOTION / AS CODE" springs up out of a mask line,
// then flies off while the orange dot travels to centre and swells into the next plate's circle.
import { clamp, inExpo, inOutCubic, lerp, outBack, outCubic, outExpo, range, smooth, spring } from '../../engine/ease';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, INK, letters, paper, SIGNAL, slate, typed, W, zoomAbout } from '../../kit';

export const HANDOFF_R = 220; // circle radius the shapes plate starts from

export default class Title extends Scene {
  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const zoom = 1 + 0.05 * smooth(range(t, 0, 4));
    paper(bg, { zoom, alpha: outCubic(range(t, 0, 1)) });
    slate(fg, 'MOTION AS CODE  /  01 TITLE', f.t, range(t, 0.2, 0.8) * (1 - range(t, 3.4, 3.8)));

    fg.save();
    zoomAbout(fg, zoom);

    // MOTION — rises from behind a mask at its baseline.
    const base1 = 505;
    fg.save();
    fg.beginPath();
    fg.rect(0, 0, W, base1 + 48);
    fg.clip();
    letters(fg, 'MOTION', W / 2, base1, DISPLAY(270), BONE, (i) => {
      const a = t - 0.15 - i * 0.06;
      const out = inExpo(range(t, 3.25 + i * 0.035, 3.7 + i * 0.035));
      return { dy: (1 - spring(a, 1.6, 7)) * 290 - out * 760, alpha: clamp(a * 8) };
    }, 'center');
    fg.restore();

    // AS CODE — slides in from the left, signal orange.
    const base2 = 760;
    const w2 = letters(fg, 'AS CODE', W / 2, base2, DISPLAY(230), SIGNAL, (i) => {
      const a = range(t, 0.85 + i * 0.05, 1.45 + i * 0.05);
      const out = inExpo(range(t, 3.3 + i * 0.03, 3.75 + i * 0.03));
      return { dx: (1 - outExpo(a)) * -120, dy: -out * 760, alpha: a > 0 ? clamp(a * 3) : 0 };
    }, 'center');

    // Rule under the type, drawn like a pen stroke.
    const rule = outCubic(range(t, 0.5, 1.4)) - inOutCubic(range(t, 3.1, 3.5));
    if (rule > 0) {
      fg.fillStyle = 'rgba(239,230,214,0.4)';
      const rw = 1100 * rule;
      fg.fillRect(W / 2 - rw / 2, base1 + 58, rw, 2);
    }

    typed(fg, '// every frame is f(t) -> pixels', W / 2, 880, range(t, 1.6, 2.6), 26, BONE, {
      alpha: 0.7 * (1 - range(t, 3.2, 3.5)),
      align: 'center',
    });
    fg.restore();

    // The dot: pops beside "AS CODE", then travels to centre and grows into the handoff circle.
    const dot0x = W / 2 + w2 / 2 + 46;
    const dot0y = base2 - 26;
    // Account for the zoom so the dot sits where the text is.
    const zx = W / 2 + (dot0x - W / 2) * zoom;
    const zy = H / 2 + (dot0y - H / 2) * zoom;
    const go = inOutCubic(range(t, 3.25, 3.95));
    const r = lerp(22 * zoom * outBack(range(t, 1.5, 1.8), 3), HANDOFF_R, inOutCubic(range(t, 3.45, 4.0)));
    if (r > 0) {
      fg.fillStyle = SIGNAL;
      fg.beginPath();
      fg.arc(lerp(zx, W / 2, go), lerp(zy, H / 2, go), Math.max(0, r), 0, Math.PI * 2);
      fg.fill();
    }

    // Fade up from ink at the very start (the video loops back to here).
    const fade = 1 - range(t, 0, 0.35);
    if (fade > 0) {
      fg.globalAlpha = fade;
      fg.fillStyle = INK;
      fg.fillRect(0, 0, W, H);
      fg.globalAlpha = 1;
    }
  }
}
