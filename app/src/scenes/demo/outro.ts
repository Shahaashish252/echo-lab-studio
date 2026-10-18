// Plate 4 — the pipeline. PROMPT -> CODE -> RENDER -> VIDEO pop in and a spark runs
// through them, then everything collapses into the sign-off and fades to ink (loops to frame 0).
import { clamp, inExpo, inOutCubic, lerp, outBack, outCubic, range, spring } from '../../engine/ease';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, INK, letters, MONO, paper, SIGNAL, slate, W, type Ctx } from '../../kit';

const STEPS = ['PROMPT', 'CODE', 'RENDER', 'VIDEO'];
const BW = 300;
const BH = 112;
const PITCH = 420;
const CY = H / 2;
const bx = (i: number) => W / 2 + (i - (STEPS.length - 1) / 2) * PITCH;

function arrow(ctx: Ctx, x0: number, x1: number, y: number, p: number) {
  if (p <= 0) return;
  const x = lerp(x0, x1, p);
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x, y);
  if (p > 0.85) {
    const h = 14 * range(p, 0.85, 1);
    ctx.moveTo(x - h, y - h);
    ctx.lineTo(x, y);
    ctx.lineTo(x - h, y + h);
  }
  ctx.stroke();
}

export default class Outro extends Scene {
  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    paper(bg, { alpha: range(t, 0, 0.4) });
    slate(fg, 'MOTION AS CODE  /  04 PIPELINE', f.t, range(t, 0, 0.3) * (1 - range(t, 1.3, 1.55)));

    const collapse = inExpo(range(t, 1.3, 1.6));
    const sparkX = lerp(bx(0), bx(STEPS.length - 1), inOutCubic(range(t, 0.75, 1.25)));
    const sparkOn = t > 0.7 && t < 1.35;

    STEPS.forEach((word, i) => {
      const pop = outBack(range(t, 0.08 + i * 0.16, 0.45 + i * 0.16), 2.2);
      const s = pop * (1 - collapse);
      if (s <= 0.001) return;
      const x = lerp(bx(i), W / 2, collapse);
      const lit = sparkOn ? clamp(1 - Math.abs(sparkX - bx(i)) / 170) : t >= 1.25 && i === STEPS.length - 1 ? 1 : 0;
      fg.save();
      fg.translate(x, CY);
      fg.scale(s, s);
      fg.fillStyle = `rgba(255,90,31,${0.9 * lit})`;
      fg.fillRect(-BW / 2, -BH / 2, BW, BH);
      fg.strokeStyle = lit > 0.5 ? SIGNAL : 'rgba(239,230,214,0.55)';
      fg.lineWidth = 2;
      fg.strokeRect(-BW / 2, -BH / 2, BW, BH);
      fg.font = DISPLAY(46, 800);
      fg.textAlign = 'center';
      fg.textBaseline = 'middle';
      fg.fillStyle = lit > 0.5 ? INK : BONE;
      fg.fillText(word, 0, 4);
      fg.font = MONO(16, 500);
      fg.fillStyle = 'rgba(239,230,214,0.5)';
      fg.fillText(`0${i + 1}`, -BW / 2 + 22, -BH / 2 - 18);
      fg.restore();
      if (i < STEPS.length - 1 && collapse === 0)
        arrow(fg, bx(i) + BW / 2 + 16, bx(i + 1) - BW / 2 - 16, CY, outCubic(range(t, 0.3 + i * 0.16, 0.55 + i * 0.16)));
    });

    if (sparkOn) {
      fg.fillStyle = BONE;
      fg.beginPath();
      fg.arc(sparkX, CY + BH / 2 + 34, 9, 0, Math.PI * 2);
      fg.fill();
    }

    // Sign-off.
    const sign = t - 1.5;
    if (sign > 0) {
      const w = letters(fg, 'motion as code', W / 2 - 24, CY + 50, DISPLAY(150), BONE, (i) => {
        const a = sign - i * 0.025;
        return { dy: (1 - spring(a, 1.8, 8)) * 80, alpha: clamp(a * 7) };
      }, 'center');
      const p = outBack(range(sign, 0.35, 0.55), 3);
      fg.fillStyle = SIGNAL;
      fg.beginPath();
      fg.arc(W / 2 - 24 + w / 2 + 34, CY + 32, 20 * p, 0, Math.PI * 2);
      fg.fill();
    }

    const fade = range(t, 2.25, 2.5);
    if (fade > 0) {
      fg.globalAlpha = fade;
      fg.fillStyle = INK;
      fg.fillRect(0, 0, W, H);
      fg.globalAlpha = 1;
    }
  }
}
