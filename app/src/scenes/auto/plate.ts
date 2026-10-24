// One plate of a generated ("auto") video: stock footage graded behind, a motion-graphics layout on
// top (picked by the scene's type), word-by-word captions, and a story-style progress bar. Every
// scene of the storyboard is an instance of this plate; scripts/auto.ts writes the storyboard.
import { clamp, hash, inOutCubic, lerp, outBack, outCubic, outExpo, range, smooth, spring } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, H, INK, MONO, paper, SIGNAL, typed, W, type Ctx } from '../../kit';
import { BOARD_H, BOARD_W, center, drawUno, PARTS } from './arduino';
import { backdrop } from './backdrops';
import { ensure, frame, frameIndex } from './footage';
import type * as THREE from 'three';
import { type Anim, drawDiagram, ensureDiagram } from './diagram';
import { type Anim3D, drawLabels3D, Model3D } from './model3d';
import { drawPhoto, ensurePhoto, type PhotoCue } from './photo';
import { drawSim, PALETTE } from './sim';
import { Studio, STUDIO_PLAN } from './studio';
import { beats, dur as lineDur, lineText, type Beats } from './script';
import { STORY, type PlateData, type StoryScene } from './storyboard';

// ---- rich text: *stars* highlight, words wrap, size shrinks to fit -----------------------------

interface Word {
  text: string;
  hi: boolean;
  w: number;
}

function rich(text: string): { text: string; hi: boolean }[] {
  const out: { text: string; hi: boolean }[] = [];
  let hi = false;
  for (const raw of text.split(/\s+/)) {
    let t = '';
    let wordHi = false;
    for (const ch of raw) {
      if (ch === '*') hi = !hi;
      else {
        t += ch;
        if (hi) wordHi = true;
      }
    }
    if (t) out.push({ text: t, hi: wordHi });
  }
  return out;
}

function wrap(ctx: Ctx, text: string, font: string, maxW: number): Word[][] {
  ctx.font = font;
  const space = ctx.measureText(' ').width;
  const lines: Word[][] = [[]];
  let lw = 0;
  for (const r of rich(text)) {
    const w = ctx.measureText(r.text).width;
    const line = lines[lines.length - 1];
    if (line.length && lw + space + w > maxW) {
      lines.push([]);
      lw = 0;
    }
    lw += (lines[lines.length - 1].length ? space : 0) + w;
    lines[lines.length - 1].push({ ...r, w });
  }
  return lines;
}

/** Largest size <= `size` whose wrapped lines fit `maxLines` and `maxW`. */
function fit(ctx: Ctx, text: string, size: number, weight: number, maxW: number, maxLines: number) {
  let s = size;
  for (;;) {
    const lines = wrap(ctx, text, DISPLAY(s, weight), maxW);
    const widest = Math.max(...lines.flat().map((w) => w.w), 0);
    if ((lines.length <= maxLines && widest <= maxW) || s < 30) return { size: s, lines };
    s *= 0.92;
  }
}

interface KineticOpts {
  size: number;
  weight?: number;
  maxW?: number;
  maxLines?: number;
  /** plate-local time the first word lands */
  t0: number;
  stagger?: number;
  color?: string;
  hi?: string;
  alpha?: number;
  upper?: boolean;
  lh?: number;
}

/** Kinetic headline centred on (cx, cy): words spring up one after another. Returns its top and bottom. */
function kinetic(ctx: Ctx, text: string, cx: number, cy: number, t: number, o: KineticOpts) {
  const weight = o.weight ?? 900;
  const src = o.upper === false ? text : text.toUpperCase();
  const { size, lines } = fit(ctx, src, o.size, weight, o.maxW ?? 960, o.maxLines ?? 3);
  const LH = size * (o.lh ?? 1.04);
  const top = cy - ((lines.length - 1) * LH) / 2;
  const alpha = o.alpha ?? 1;
  ctx.save();
  ctx.font = DISPLAY(size, weight);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const space = ctx.measureText(' ').width;
  let k = 0;
  lines.forEach((line, li) => {
    const total = line.reduce((s, w) => s + w.w, 0) + space * (line.length - 1);
    let x = cx - total / 2;
    for (const w of line) {
      const a = t - o.t0 - k++ * (o.stagger ?? 0.07);
      const s = spring(a, 1.3, 7);
      const al = clamp(a * 5) * alpha;
      if (al > 0.001) {
        ctx.save();
        ctx.globalAlpha = al;
        ctx.translate(x + w.w / 2, top + li * LH + (1 - s) * size * 0.55);
        const sc = 1 + 0.22 * (1 - outCubic(range(a, 0, 0.35)));
        ctx.scale(sc, sc);
        ctx.lineWidth = Math.max(6, size * 0.12);
        ctx.strokeStyle = INK;
        ctx.strokeText(w.text, -w.w / 2, 0);
        ctx.fillStyle = w.hi ? (o.hi ?? SIGNAL) : (o.color ?? BONE);
        ctx.fillText(w.text, -w.w / 2, 0);
        ctx.restore();
      }
      x += w.w + space;
    }
  });
  ctx.restore();
  return { top: top - LH / 2, bottom: top + (lines.length - 0.5) * LH, size };
}

/** One line of text, shrunk to fit maxW. */
function fitLine(ctx: Ctx, text: string, size: number, weight: number, maxW: number) {
  let s = size;
  ctx.font = DISPLAY(s, weight);
  while (ctx.measureText(text).width > maxW && s > 24) {
    s *= 0.94;
    ctx.font = DISPLAY(s, weight);
  }
  return s;
}

// ---- pieces ---------------------------------------------------------------------------------

const PADS = [
  [45, 52, 57, 59, 64],
  [41, 48, 53, 56, 60],
  [43, 50, 55, 58, 62],
  [38, 45, 50, 53, 57],
];

/** Pill label: signal fill, ink text. `a` 0..1 pops it in. */
function pill(ctx: Ctx, text: string, cx: number, cy: number, size: number, a: number) {
  if (a <= 0) return;
  ctx.save();
  ctx.font = DISPLAY(size, 900);
  const w = ctx.measureText(text).width + size * 1.4;
  const h = size * 1.7;
  ctx.translate(cx, cy);
  const s = 0.6 + 0.4 * outBack(clamp(a), 2.2);
  ctx.scale(s, s);
  ctx.globalAlpha = clamp(a * 2);
  ctx.fillStyle = SIGNAL;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
}

/** Signal underline that grows from the centre. */
function underline(ctx: Ctx, cx: number, y: number, w: number, p: number, alpha = 1) {
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = SIGNAL;
  const ww = w * outExpo(clamp(p));
  ctx.fillRect(cx - ww / 2, y - 5, ww, 10);
  ctx.restore();
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number, alpha: number, accent = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(20,17,14,0.84)';
  ctx.strokeStyle = accent ? SIGNAL : 'rgba(239,230,214,0.22)';
  ctx.lineWidth = accent ? 3 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ---- the plate ------------------------------------------------------------------------------

const CENTER = 760;
/** simulation videos keep one calm, dark look to the end (no wipes, progress bar or colourful backgrounds) */
const SIM_VIDEO = !!STORY?.scenes.some((x) => x.type === 'sim'); // middle of the graphics zone, between the top bar and the captions

export default class AutoPlate extends Scene {
  private readonly d?: PlateData;
  private readonly s?: StoryScene;
  private readonly B?: Beats;

  constructor(data?: unknown) {
    super();
    this.d = data as PlateData | undefined;
    this.s = this.d?.scene;
    if (this.s && STORY) this.B = beats(this.s.lines, { ...STORY.timing, min: this.s.length });
    this.anims = this.resolveAnims();
    if (this.s?.type === 'model') {
      this.uses3D = true;
      this.model = new Model3D(this.three);
    }
    // studio videos: the narration plate is a 3D stage (studio.ts) instead of the 2D simulation
    if (this.s?.type === 'sim' && STUDIO_PLAN) {
      this.uses3D = true;
      const studio = new Studio(this.three, this.camera, STUDIO_PLAN);
      this.studio = studio;
      this.render3D = (r, target) => studio.render(r, target);
    }
  }

  private readonly model?: Model3D;
  private readonly studio?: Studio;

  init3D(renderer: THREE.WebGLRenderer) {
    if (this.studio) this.studio.init(renderer);
    else Model3D.init(renderer, this.three);
  }

  /** Diagram cues are timed by narration line; turn them into scene seconds, in order. */
  private readonly anims: Anim[];
  private resolveAnims(): Anim[] {
    const s = this.s;
    if (!s?.anims || !this.B) return [];
    const B = this.B;
    return s.anims
      .map((c) => {
        const id = s.lines[clamp(Math.round(c.line ?? 0), 0, s.lines.length - 1)];
        return { ...c, effect: c.effect as Anim['effect'], t: B.at(id) + clamp(c.at ?? 0) * lineDur(id) };
      })
      .sort((a, b) => a.t - b.t);
  }

  async prepare(f: Frame) {
    const s = this.s;
    if (s?.frames) await ensure(s.id, frameIndex(f.lt, s.frames));
    if (s?.type === 'diagram' && s.svg) await ensureDiagram(s.id, s.svg);
    if (s?.type === 'photo' && s.photo) await ensurePhoto(s.photo.src);
  }

  cues(dur: number): Cue[] {
    const s = this.s;
    const d = this.d;
    if (!s || !d || !this.B) return [];
    const c: Cue[] = [
      { t: 0, kind: 'pad', dur: dur + 0.4, notes: PADS[d.index % PADS.length], gain: 0.8 },
      // a calm bed under simulations; a light beat under the other formats
      ...(s.type === 'sim' ? [] : [{ t: 0, kind: 'pulse', dur, gain: d.index === 0 ? 0.12 : 0.2 }]),
      ...this.B.cues(),
    ];
    // studio videos: a soft whoosh on every camera cut
    if (this.studio) c.push(...s.lines.slice(1).map((id) => ({ t: this.B!.at(id) - 0.08, kind: 'whoosh', gain: 0.22 })));
    const items = s.items?.length ?? 0;
    switch (s.type) {
      case 'hook':
        c.push({ t: 0.12, kind: 'boom', gain: 0.7 }, { t: 0.15, kind: 'hit', gain: 0.5 });
        break;
      case 'title':
        c.push({ t: 0.1, kind: 'type', dur: 0.5, gain: 0.5 }, { t: 0.45, kind: 'hit', gain: 0.55 });
        break;
      case 'fact':
        c.push({ t: 0.2, kind: 'pop', gain: 0.6, pitch: 1.3 }, { t: 0.45, kind: 'hit', gain: 0.4 });
        break;
      case 'stat':
        c.push({ t: 0.25, kind: 'riser', dur: 1.3, gain: 0.45 }, { t: 1.6, kind: 'hit', gain: 0.7 }, { t: 1.6, kind: 'flash', gain: 0.25 });
        break;
      case 'list':
      case 'steps':
        for (let i = 0; i < items; i++) c.push({ t: this.itemAt(i, dur), kind: 'pop', gain: 0.6, pitch: 1 + i * 0.12 });
        break;
      case 'compare':
        c.push({ t: 0.5, kind: 'hit', gain: 0.6 });
        this.comparePoints(dur).forEach(([t]) => c.push({ t, kind: 'pop', gain: 0.45, pitch: 1.2 }));
        break;
      case 'quote':
        c.push({ t: 0.2, kind: 'whoosh', dur: 0.5, gain: 0.4 }, { t: dur - 1.6, kind: 'type', dur: 0.6, gain: 0.4 });
        break;
      case 'outro':
        c.push({ t: 0.6, kind: 'chime', gain: 0.6 }, { t: 0.6, kind: 'pop', gain: 0.6 });
        break;
      case 'photo':
      case 'model':
      case 'diagram': {
        if (d.index === 0) c.push({ t: 0.05, kind: 'boom', gain: 0.55 });
        const kinds: Partial<Record<Anim['effect'], Cue>> = {
          pop: { t: 0, kind: 'pop', gain: 0.5, pitch: 1.3 },
          focus: { t: -0.35, kind: 'whoosh', dur: 0.5, gain: 0.35 },
          glow: { t: 0, kind: 'chime', gain: 0.3, pitch: 1.5 },
          flow: { t: 0, kind: 'zap', gain: 0.3, pitch: 1.2 },
          waves: { t: 0, kind: 'flash', gain: 0.25 },
          label: { t: 0, kind: 'pop', gain: 0.45, pitch: 1.6 },
          move: { t: 0, kind: 'servo', dur: 0.5, gain: 0.25 },
          shake: { t: 0, kind: 'hit', gain: 0.35 },
        };
        for (const a of this.anims) {
          const k = kinds[a.effect];
          if (k) c.push({ ...k, t: Math.max(0, a.t + k.t) });
        }
        break;
      }
      case 'board': {
        c.push({ t: 0.1, kind: 'riser', dur: 0.7, gain: 0.35 }, { t: 0.8, kind: 'hit', gain: 0.45 });
        for (const ft of this.focusTimes(dur))
          c.push({ t: ft - 0.15, kind: 'whoosh', dur: 0.4, gain: 0.35 }, { t: ft + 0.25, kind: 'pop', gain: 0.55, pitch: 1.4 });
        const demo = this.demoTimes(dur);
        if (s.demo === 'upload') {
          c.push({ t: demo.plug, kind: 'servo', dur: 0.5, gain: 0.35 }, { t: demo.plug + 0.5, kind: 'hit', gain: 0.4 });
          for (let k = demo.plug + 0.7; k < demo.plug + 2.4; k += 0.18) c.push({ t: k, kind: 'zap', gain: 0.15, pitch: 2 });
          c.push({ t: demo.plug + 2.5, kind: 'chime', gain: 0.5 });
        }
        if (s.demo === 'blink') for (let k = demo.blink; k < dur - 0.3; k += 2) c.push({ t: k, kind: 'pop', gain: 0.3, pitch: 1.8 });
        break;
      }
    }
    return c;
  }

  /** When list item i appears: spread across the narration. */
  private itemAt(i: number, L: number) {
    const n = this.s?.items?.length ?? 1;
    return 0.55 + (i * Math.max(0.6, L - 2.2)) / Math.max(1, n);
  }

  private comparePoints(L: number): [number, 'left' | 'right', number][] {
    const s = this.s!;
    const lp = s.left?.points ?? [];
    const rp = s.right?.points ?? [];
    const out: [number, 'left' | 'right', number][] = [];
    const half = Math.max(1, (L - 1.6) / 2);
    lp.forEach((_, i) => out.push([0.9 + (i * half) / Math.max(1, lp.length), 'left', i]));
    rp.forEach((_, i) => out.push([0.9 + half + (i * half) / Math.max(1, rp.length), 'right', i]));
    return out;
  }

  render(f: Frame, { bg, fg }: Layers) {
    const s = this.s;
    const d = this.d;
    const t = f.lt;
    const L = f.dur;
    if (!s || !d) {
      paper(bg);
      fg.save();
      fg.font = DISPLAY(56, 900);
      fg.fillStyle = BONE;
      fg.textAlign = 'center';
      fg.fillText('NO VIDEO YET', W / 2, H / 2 - 30);
      fg.font = MONO(28, 500);
      fg.fillStyle = SIGNAL;
      fg.fillText('bun run auto "your topic"', W / 2, H / 2 + 40);
      fg.restore();
      return;
    }

    this.background(bg, s, d.index, t, L);
    // the simulation is its own clean stage: no progress bar or series label over it
    if (s.type !== 'sim' && !SIM_VIDEO) this.chrome(fg, d, f.t);

    switch (s.type) {
      case 'hook':
        this.hook(fg, s, t, L);
        break;
      case 'title':
        this.title(fg, s, t);
        break;
      case 'stat':
        this.stat(fg, s, t);
        break;
      case 'list':
      case 'steps':
        this.list(fg, s, t, L);
        break;
      case 'compare':
        this.compare(fg, s, t, L);
        break;
      case 'quote':
        this.quote(fg, s, t, L);
        break;
      case 'outro':
        this.outro(fg, s, t);
        break;
      case 'board':
        this.board(bg, fg, s, t, L);
        break;
      case 'diagram':
        this.diagram(fg, s, t, L);
        break;
      case 'model':
        this.model3d(fg, s, t, L);
        break;
      case 'photo':
        this.photo(fg, s, t, L);
        break;
      case 'sim': {
        // one continuous instrument panel; the narration's timings drive it
        const B = this.B!;
        const lines = s.lines.map((id) => ({ text: lineText(id).replace(/\*/g, ''), start: B.at(id), end: B.end(id) }));
        if (this.studio) {
          const idx = lines.reduce((k, l, i) => (t >= l.start - 0.05 ? i : k), 0);
          this.studio.update(t, lines, idx);
          this.studio.captions(fg, t, lines, idx);
        } else drawSim(fg, t, L, s.headline ?? '', lines);
        break;
      }
      default:
        this.fact(fg, s, t);
    }

    if (s.type !== 'sim') this.B?.subs(fg, t);

    // transitions: a signal band sweeps across each cut; the video fades in and out of ink
    if (d.index > 0 && !SIM_VIDEO) this.wipe(fg, t);
    const last = d.index === d.count - 1;
    fadeInk(fg, (d.index === 0 ? 1 - range(t, 0, 0.35) : 0) + (last ? inOutCubic(range(t, L - 0.6, L)) : 0));
  }

  // ---- background ----

  private background(ctx: Ctx, s: StoryScene, index: number, t: number, L: number) {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    const img = s.frames ? frame(s.id, frameIndex(t, s.frames), s.frames) : undefined;
    if (!img) {
      // no stock footage: the scene's own animated background
      if (s.type === 'sim' || SIM_VIDEO) {
        ctx.fillStyle = PALETTE.bg;
        ctx.fillRect(0, 0, W, H);
        return;
      }
      backdrop(ctx, s.visual ?? '', t, index + 1);
      // illustrated scenes: calm the background so the drawing is the star
      if (s.type === 'diagram' || s.type === 'model' || s.type === 'photo') {
        ctx.fillStyle = 'rgba(20,17,14,0.5)';
        ctx.fillRect(0, 0, W, H);
      }
      // 3D: a soft studio backdrop glow behind the object, so dark objects separate from the background
      if (s.type === 'model') {
        const g = ctx.createRadialGradient(W / 2, 880, 40, W / 2, 880, 720);
        g.addColorStop(0, 'rgba(120,128,140,0.30)');
        g.addColorStop(0.5, 'rgba(90,80,74,0.12)');
        g.addColorStop(1, 'rgba(20,17,14,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      return;
    }
    // slow push-in (Ken Burns) drifting sideways, with a punch-in on the cut
    const dir = index % 2 ? 1 : -1;
    const z = 1.05 + 0.07 * smooth(clamp(t / L)) + 0.12 * (1 - outCubic(range(t, 0, 0.45)));
    const iw = W * z;
    const ih = (img.naturalHeight / img.naturalWidth) * iw;
    const ox = dir * 26 * (clamp(t / L) - 0.5);
    ctx.drawImage(img, (W - iw) / 2 + ox, (H - ih) / 2, iw, ih);

    // grade: darker for text-heavy layouts, deep at the top (bar) and bottom (captions)
    const heavy = { title: 0.62, quote: 0.66, compare: 0.6, list: 0.55, steps: 0.55, stat: 0.5, fact: 0.45, hook: 0.38, outro: 0.5, board: 0.5, diagram: 0.55, model: 0.55, photo: 0.55, sim: 0 }[s.type] ?? 0.5;
    ctx.fillStyle = `rgba(20,17,14,${heavy})`;
    ctx.fillRect(0, 0, W, H);
    const top = ctx.createLinearGradient(0, 0, 0, 380);
    top.addColorStop(0, 'rgba(20,17,14,0.8)');
    top.addColorStop(1, 'rgba(20,17,14,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 380);
    const bot = ctx.createLinearGradient(0, 1180, 0, H);
    bot.addColorStop(0, 'rgba(20,17,14,0)');
    bot.addColorStop(0.35, 'rgba(20,17,14,0.72)');
    bot.addColorStop(1, 'rgba(20,17,14,0.92)');
    ctx.fillStyle = bot;
    ctx.fillRect(0, 1180, W, H - 1180);
  }

  /** Story-style progress segments and the series kicker, top of frame. */
  private chrome(ctx: Ctx, d: PlateData, gt: number) {
    const x0 = 60;
    const x1 = W - 60;
    const gap = 10;
    const n = d.count;
    const sw = (x1 - x0 - gap * (n - 1)) / n;
    const y = 104;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const a = d.starts[i];
      const b = i + 1 < n ? d.starts[i + 1] : d.total;
      const p = clamp((gt - a) / (b - a));
      const x = x0 + i * (sw + gap);
      ctx.fillStyle = 'rgba(239,230,214,0.22)';
      ctx.beginPath();
      ctx.roundRect(x, y, sw, 7, 3.5);
      ctx.fill();
      if (p > 0) {
        ctx.fillStyle = i === d.index ? SIGNAL : BONE;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(7, sw * p), 7, 3.5);
        ctx.fill();
      }
    }
    if (STORY?.kicker) {
      ctx.fillStyle = SIGNAL;
      ctx.fillRect(x0, 152, 16, 16);
      ctx.font = MONO(26, 500);
      ctx.fillStyle = 'rgba(239,230,214,0.85)';
      ctx.textBaseline = 'middle';
      ctx.fillText(STORY.kicker.toUpperCase(), x0 + 30, 161);
    }
    ctx.restore();
  }

  private wipe(ctx: Ctx, t: number) {
    const p = range(t, 0, 0.32);
    if (p <= 0 || p >= 1) return;
    const x = -500 + inOutCubic(p) * (W + 1000);
    ctx.save();
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.moveTo(x - 160, 0);
    ctx.lineTo(x + 160, 0);
    ctx.lineTo(x - 140, H);
    ctx.lineTo(x - 460, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- layouts ----

  private hook(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const out = 1 - range(t, L - 0.35, L - 0.05);
    const b = kinetic(ctx, s.headline ?? '', W / 2, CENTER - 40, t, { size: 150, maxLines: 3, t0: 0.12, stagger: 0.09, alpha: out });
    underline(ctx, W / 2, b.bottom + 40, 260, range(t, 0.5, 1.1), out);
  }

  private title(ctx: Ctx, s: StoryScene, t: number) {
    const kick = `// ${STORY?.kicker ?? ''}`.toUpperCase();
    typed(ctx, kick, W / 2, CENTER - 230, range(t, 0.05, 0.55), 34, SIGNAL, { align: 'center' });
    const b = kinetic(ctx, s.headline ?? STORY?.title ?? '', W / 2, CENTER, t, { size: 128, maxLines: 3, t0: 0.4, stagger: 0.08 });
    underline(ctx, W / 2, b.bottom + 46, 420, range(t, 0.8, 1.4));
  }

  private fact(ctx: Ctx, s: StoryScene, t: number) {
    pill(ctx, (s.label || 'DID YOU KNOW?').toUpperCase(), W / 2, CENTER - 260, 34, range(t, 0.15, 0.45));
    kinetic(ctx, s.headline ?? '', W / 2, CENTER + 10, t, { size: 104, maxLines: 4, t0: 0.4, stagger: 0.06 });
  }

  private stat(ctx: Ctx, s: StoryScene, t: number) {
    const v = s.value ?? 0;
    const p = outExpo(range(t, 0.3, 1.6));
    const dec = s.decimals ?? (Number.isInteger(v) ? 0 : 1);
    const num = (v * p).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const text = `${s.prefix ?? ''}${num}${s.suffix ?? ''}`;
    // size from the final value so the number doesn't grow while counting
    const size = fitLine(ctx, `${s.prefix ?? ''}${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${s.suffix ?? ''}`, 250, 900, 940);
    const a = range(t, 0.2, 0.4);
    const land = 1 - outCubic(range(t, 1.6, 1.95));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = DISPLAY(size, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(W / 2, CENTER - 110);
    const sc = 1 + 0.08 * land * (t > 1.6 ? 1 : 0);
    ctx.scale(sc, sc);
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = SIGNAL;
    ctx.fillText(text, 0, 0);
    ctx.restore();
    // meter: fills to the percentage, or all the way
    const pct = s.suffix?.trim() === '%' ? clamp(v / 100) : 1;
    const mw = 820;
    const my = CENTER + 60;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(239,230,214,0.2)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - mw / 2, my, mw, 16, 8);
    ctx.fill();
    ctx.fillStyle = SIGNAL;
    ctx.beginPath();
    ctx.roundRect(W / 2 - mw / 2, my, Math.max(16, mw * pct * p), 16, 8);
    ctx.fill();
    ctx.restore();
    const lb = kinetic(ctx, s.label ?? '', W / 2, my + 150, t, { size: 60, weight: 800, maxLines: 3, t0: 1.2, stagger: 0.05, maxW: 900 });
    if (s.source) typed(ctx, `SOURCE: ${s.source.toUpperCase()}`, W / 2, lb.bottom + 70, range(t, 1.8, 2.4), 26, 'rgba(239,230,214,0.7)', { align: 'center' });
  }

  private list(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const items = (s.items ?? []).slice(0, 5);
    const steps = s.type === 'steps';
    const head = kinetic(ctx, s.heading ?? s.headline ?? '', W / 2, 400, t, { size: 78, maxLines: 2, t0: 0.1, stagger: 0.05 });
    const y0 = Math.max(head.bottom + 50, 520);
    const room = 1240 - y0;
    const rowH = Math.min(160, room / Math.max(1, items.length));
    const x = 70;
    const w = W - 140;
    let current = -1;
    items.forEach((_, i) => {
      if (t >= this.itemAt(i, L)) current = i;
    });
    if (steps && items.length > 1) {
      // spine joining the step numbers, drawn as the steps arrive
      const cy0 = y0 + (rowH - 22) / 2;
      // grows down to each new step as it arrives
      const reach = current < 1 ? 0 : current - 1 + outCubic(range(t, this.itemAt(current, L), this.itemAt(current, L) + 0.35));
      ctx.save();
      ctx.strokeStyle = 'rgba(255,90,31,0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 58, cy0);
      ctx.lineTo(x + 58, cy0 + reach * rowH);
      ctx.stroke();
      ctx.restore();
    }
    items.forEach((item, i) => {
      const ti = this.itemAt(i, L);
      const a = range(t, ti, ti + 0.35);
      if (a <= 0) return;
      const y = y0 + i * rowH;
      const h = rowH - 22;
      const e = outCubic(a);
      ctx.save();
      ctx.translate((1 - e) * -80, 0);
      const active = i === current;
      panel(ctx, x, y, w, h, a * (active ? 1 : 0.85), active);
      ctx.globalAlpha = a;
      const cy = y + h / 2;
      if (steps) {
        ctx.fillStyle = SIGNAL;
        ctx.beginPath();
        ctx.arc(x + 58, cy, Math.min(34, h * 0.36), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = DISPLAY(Math.min(38, h * 0.4), 900);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), x + 58, cy + 2);
      } else {
        ctx.fillStyle = SIGNAL;
        ctx.fillRect(x + 46, cy - 12, 24, 24);
      }
      const tx = x + 112;
      const size = fitLine(ctx, item, Math.min(48, h * 0.42), 800, w - 140);
      ctx.font = DISPLAY(size, 800);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active ? BONE : 'rgba(239,230,214,0.78)';
      ctx.fillText(item, tx, cy + 2);
      ctx.restore();
    });
  }

  private compare(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const head = s.headline ?? s.heading;
    if (head) kinetic(ctx, head, W / 2, 360, t, { size: 72, maxLines: 2, t0: 0.05, stagger: 0.05 });
    const y = 520;
    const cw = 455;
    // card height fits the taller side's points
    ctx.font = DISPLAY(36, 700);
    const used = (pts: string[]) => pts.slice(0, 4).reduce((n, pt) => n + Math.min(3, wrap(ctx, pt, DISPLAY(36, 700), cw - 90).length) * 44 + 36, 0);
    const h = Math.max(380, 175 + Math.max(used(s.left?.points ?? []), used(s.right?.points ?? [])) + 10);
    const sides: ['left' | 'right', number, string][] = [
      ['left', 55, BONE],
      ['right', W - 55 - cw, SIGNAL],
    ];
    const pts = this.comparePoints(L);
    for (const [side, x, color] of sides) {
      const data = s[side];
      if (!data) continue;
      const a = range(t, side === 'left' ? 0.2 : 0.35, (side === 'left' ? 0.2 : 0.35) + 0.4);
      if (a <= 0) continue;
      ctx.save();
      ctx.translate(0, (1 - outCubic(a)) * 60);
      panel(ctx, x, y, cw, h, a, side === 'right');
      ctx.globalAlpha = a;
      const ts = fitLine(ctx, data.title.toUpperCase(), 54, 900, cw - 60);
      ctx.font = DISPLAY(ts, 900);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.title.toUpperCase(), x + cw / 2, y + 70);
      ctx.fillStyle = 'rgba(239,230,214,0.25)';
      ctx.fillRect(x + 40, y + 120, cw - 80, 2);
      let py = y + 175;
      data.points.slice(0, 4).forEach((pt, i) => {
        const at = pts.find(([, sd, k]) => sd === side && k === i)?.[0] ?? 0;
        const pa = range(t, at, at + 0.3);
        const lines = wrap(ctx, pt, DISPLAY(36, 700), cw - 90);
        if (pa > 0) {
          ctx.globalAlpha = a * pa;
          ctx.fillStyle = color;
          ctx.fillRect(x + 34, py - 8, 12, 12);
          ctx.font = DISPLAY(36, 700);
          ctx.textAlign = 'left';
          ctx.fillStyle = BONE;
          lines.slice(0, 3).forEach((ln, li) => ctx.fillText(ln.map((w) => w.text).join(' '), x + 62 + (1 - outCubic(pa)) * 20, py + li * 44));
        }
        py += Math.min(3, lines.length) * 44 + 36;
      });
      ctx.restore();
    }
    // VS badge
    const va = range(t, 0.5, 0.85);
    if (va > 0) {
      ctx.save();
      ctx.translate(W / 2, y + h / 2);
      const sc = outBack(va, 2.5);
      ctx.scale(sc, sc);
      ctx.fillStyle = SIGNAL;
      ctx.beginPath();
      ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = DISPLAY(44, 900);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VS', 0, 3);
      ctx.restore();
    }
  }

  private quote(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const a = range(t, 0.1, 0.5);
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.font = DISPLAY(380, 900);
    ctx.fillStyle = SIGNAL;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('“', 70, 610 + (1 - outCubic(a)) * 40);
    ctx.restore();
    const b = kinetic(ctx, s.quote ?? s.headline ?? '', W / 2, CENTER + 40, t, {
      size: 76, weight: 800, maxLines: 6, t0: 0.35, stagger: 0.045, upper: false, lh: 1.15, maxW: 900,
    });
    if (s.author) typed(ctx, `— ${s.author}`, W / 2, b.bottom + 90, range(t, L - 1.6, L - 1.0), 34, SIGNAL, { align: 'center' });
  }

  // ---- illustrated scenes ----

  /** The scene's drawing, animated in step with the narration, with its headline above. */
  private diagram(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const out = 1 - range(t, L - 0.3, L);
    if (s.svg) {
      ctx.save();
      ctx.globalAlpha = out;
      // the drawing lives between the headline and the captions, even when the camera zooms in
      ctx.beginPath();
      ctx.rect(0, 430, W, 900);
      ctx.clip();
      const ok = drawDiagram(ctx, s.id, s.svg, this.anims, t, { cx: W / 2, cy: 880, size: 860 });
      ctx.restore();
      if (!ok) {
        ctx.font = MONO(28, 500);
        ctx.fillStyle = 'rgba(239,230,214,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('loading…', W / 2, 860);
      }
    }
    if (s.headline) kinetic(ctx, s.headline, W / 2, 330, t, { size: this.d?.index === 0 ? 104 : 80, maxLines: 2, t0: 0.05, stagger: 0.06, alpha: out });
  }

  /** A real photo of the subject, the camera gliding to the parts the narration names, headline above. */
  private photo(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const out = 1 - range(t, L - 0.3, L);
    if (s.photo) {
      ctx.save();
      ctx.globalAlpha = out;
      const ok = drawPhoto(ctx, s.photo.src, s.photo.points, this.anims as unknown as PhotoCue[], t, L, this.d?.index ?? 0);
      ctx.restore();
      if (!ok) {
        ctx.font = MONO(28, 500);
        ctx.fillStyle = 'rgba(239,230,214,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('loading…', W / 2, 880);
      }
    }
    if (s.headline) kinetic(ctx, s.headline, W / 2, 330, t, { size: this.d?.index === 0 ? 104 : 80, maxLines: 2, t0: 0.05, stagger: 0.06, alpha: out });
  }

  /** The video's 3D model from this scene's camera angle, animated by its cues, headline above. */
  private model3d(ctx: Ctx, s: StoryScene, t: number, L: number) {
    const out = 1 - range(t, L - 0.3, L);
    if (this.model?.ok) {
      this.model.update(t, this.anims as unknown as Anim3D[], s.view ?? {}, this.camera);
      drawLabels3D(ctx, this.model, this.anims as unknown as Anim3D[], t, this.camera);
    }
    if (s.headline) kinetic(ctx, s.headline, W / 2, 330, t, { size: this.d?.index === 0 ? 104 : 80, maxLines: 2, t0: 0.05, stagger: 0.06, alpha: out });
  }

  // ---- the Arduino Uno, demonstrated ----

  private focusParts() {
    return (this.s?.focus ?? []).filter((id) => PARTS[id]);
  }

  /** When each focused part is pointed at: spread across the narration, leaving room for a demo. */
  private focusTimes(L: number) {
    const n = this.focusParts().length;
    const span = Math.max(0.8, L - 1.1 - (this.s?.demo ? 3.0 : 0.6));
    return Array.from({ length: n }, (_, i) => 1.1 + (i * span) / Math.max(1, n));
  }

  /** Demo start: after the parts tour, or soon after the board appears without one. */
  private demoTimes(L: number) {
    const start = this.focusParts().length ? Math.max(1.4, L - 3.2) : 1.0;
    return { plug: start, blink: start + 0.4 };
  }

  private board(bg: Ctx, fg: Ctx, s: StoryScene, t: number, L: number) {
    const focus = this.focusParts();
    const times = this.focusTimes(L);
    const demo = this.demoTimes(L);
    const demoAt = s.demo ? demo.plug - 0.3 : Infinity;
    let cur = -1;
    times.forEach((ft, i) => {
      if (t >= ft) cur = i;
    });
    if (t >= demoAt) cur = -1;

    // camera [x mm, y mm, zoom]: overview, glide to each part in turn, then to the demo
    type Cam = [number, number, number];
    const base: Cam = [(BOARD_W - 6.3) / 2, BOARD_H / 2, 1];
    const camOf = (i: number): Cam => {
      if (i < 0) return base;
      const p = PARTS[focus[i]];
      const [cx, cy] = center(focus[i]);
      const z = clamp(26 / Math.max(p.w, p.h * 1.6), 1.45, 2.3);
      // parts on the bottom edge: zoom less and keep the board below the top bar
      if (cy > 40) return [cx, Math.min(cy, 34), 1.4];
      return [cx, cy, z];
    };
    const mix = (a: Cam, b: Cam, e: number): Cam => [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];
    let cam = base;
    if (t >= demoAt) {
      const demoCam: Cam = s.demo === 'blink' ? [25, 6, 2.0] : [10, 18, 1.5];
      cam = mix(focus.length ? camOf(focus.length - 1) : base, demoCam, inOutCubic(range(t, demoAt, demoAt + 0.6)));
    } else if (cur >= 0) cam = mix(cur > 0 ? camOf(cur - 1) : base, camOf(cur), inOutCubic(range(t, times[cur] - 0.35, times[cur] + 0.25)));

    const SY = 830;
    const k = ((920 / (BOARD_W + 7)) * cam[2]) * (0.85 + 0.15 * spring(t - 0.05, 1.1, 6));
    const tilt = Math.sin(t * 0.6) * 0.012;
    const toScreen = (x: number, y: number): [number, number] => [W / 2 + (x - cam[0]) * k, SY + (y - cam[1]) * k];

    // what the board is doing
    const uploading = s.demo === 'upload' && t > demo.plug + 0.7 && t < demo.plug + 2.4;
    const flick = (seed: number) => (uploading && hash(Math.floor(t * 14) * 7 + seed) > 0.45 ? 1 : 0);
    const blinkOn = s.demo === 'blink' && t >= demo.blink && Math.floor(t - demo.blink) % 2 === 0;
    const afterUpload = s.demo === 'upload' && t > demo.plug + 2.5;
    const state = {
      build: range(t, 0, 0.9),
      on: range(t, 0.7, 0.9),
      tx: flick(1),
      rx: flick(2),
      l: blinkOn || (afterUpload && Math.floor(t * 2) % 2 === 0) ? 1 : 0.04,
      cable: s.demo === 'upload' ? outCubic(range(t, demo.plug, demo.plug + 0.6)) : 0,
    };

    bg.save();
    bg.translate(W / 2, SY);
    bg.rotate(tilt);
    bg.translate(-cam[0] * k, -cam[1] * k);
    bg.scale(k, k);
    bg.globalAlpha = clamp(t / 0.25);
    drawUno(bg, state);
    bg.restore();

    // spotlight on the current part, with its name and what it does
    if (cur >= 0) {
      const p = PARTS[focus[cur]];
      const end = times[cur + 1] ?? Math.min(L, demoAt);
      const a = range(t, times[cur] + 0.05, times[cur] + 0.35) * (1 - range(t, end - 0.3, end));
      if (a > 0) {
        const pad = 1.2;
        const [x0, y0] = toScreen(p.x - pad, p.y - pad);
        const [x1, y1] = toScreen(p.x + p.w + pad, p.y + p.h + pad);
        fg.save();
        fg.globalAlpha = a;
        fg.fillStyle = 'rgba(20,17,14,0.6)';
        fg.beginPath();
        fg.rect(0, 0, W, H);
        fg.roundRect(x0, y0, x1 - x0, y1 - y0, 14);
        fg.fill('evenodd');
        fg.strokeStyle = SIGNAL;
        fg.lineWidth = 4 + 2 * (0.5 + 0.5 * Math.sin((t - times[cur]) * 6));
        fg.beginPath();
        fg.roundRect(x0, y0, x1 - x0, y1 - y0, 14);
        fg.stroke();
        // leader line up to the label
        const lx = clamp((x0 + x1) / 2, 60, W - 60);
        fg.lineWidth = 3;
        fg.beginPath();
        fg.moveTo(lx, Math.max(y0, 600));
        fg.lineTo(lx, 600);
        fg.lineTo(W / 2, 560);
        fg.stroke();
        fg.restore();
        pill(fg, p.label, W / 2, 440, 46, a);
        fg.save();
        fg.globalAlpha = a;
        fg.font = MONO(30, 500);
        fg.textAlign = 'center';
        fg.lineJoin = 'round';
        fg.lineWidth = 8;
        fg.strokeStyle = INK;
        fg.strokeText(p.note, W / 2, 525);
        fg.fillStyle = BONE;
        fg.fillText(p.note, W / 2, 525);
        fg.restore();
      }
    } else if (t < Math.min(times[0] ?? Infinity, demoAt) && (s.heading || s.headline)) {
      const until = Math.min(times[0] ?? L, demoAt);
      kinetic(fg, s.heading ?? s.headline ?? '', W / 2, 400, t, { size: 76, maxLines: 2, t0: 0.15, stagger: 0.05, alpha: 1 - range(t, until - 0.4, until - 0.1) });
    }

    if (s.demo === 'upload' && t > demo.plug + 0.5) {
      const p = range(t, demo.plug + 0.7, demo.plug + 2.4);
      pill(fg, p >= 1 ? 'UPLOAD DONE' : 'UPLOADING...', W / 2, 440, 46, range(t, demo.plug + 0.5, demo.plug + 0.8));
      fg.save();
      fg.globalAlpha = range(t, demo.plug + 0.6, demo.plug + 0.9);
      fg.fillStyle = 'rgba(239,230,214,0.2)';
      fg.beginPath();
      fg.roundRect(W / 2 - 300, 520, 600, 14, 7);
      fg.fill();
      fg.fillStyle = SIGNAL;
      fg.beginPath();
      fg.roundRect(W / 2 - 300, 520, Math.max(14, 600 * p), 14, 7);
      fg.fill();
      fg.restore();
    }

    if (s.demo === 'blink' && t > demo.blink - 0.5) {
      // the Blink sketch, its current line lit in step with the LED
      const a = range(t, demo.blink - 0.5, demo.blink - 0.1);
      const code = ['void loop() {', '  digitalWrite(13, HIGH);', '  delay(1000);', '  digitalWrite(13, LOW);', '  delay(1000);', '}'];
      const active = blinkOn ? 1 : 3;
      const x = 120;
      const y = 290;
      panel(fg, x - 30, y - 50, W - 2 * (x - 30), code.length * 50 + 50, a, true);
      fg.save();
      fg.globalAlpha = a;
      fg.font = MONO(34, 500);
      fg.textBaseline = 'middle';
      fg.fillStyle = 'rgba(255,90,31,0.18)';
      fg.fillRect(x - 20, y - 25 + active * 50, W - 2 * (x - 20), 100);
      code.forEach((ln, i) => {
        fg.fillStyle = i === active || i === active + 1 ? SIGNAL : BONE;
        fg.fillText(ln, x, y + i * 50);
      });
      fg.restore();
      const [lx, ly] = toScreen(24.9, 8.9);
      fg.save();
      fg.globalAlpha = a;
      fg.lineJoin = 'round';
      fg.strokeStyle = blinkOn ? SIGNAL : BONE;
      fg.lineWidth = 3;
      fg.beginPath();
      fg.moveTo(lx + 10, ly + 20);
      fg.lineTo(lx + 80, ly + 100);
      fg.stroke();
      const label = blinkOn ? 'PIN 13: ON' : 'PIN 13: OFF';
      fg.font = DISPLAY(40, 900);
      fg.lineWidth = 8;
      fg.strokeStyle = INK;
      fg.strokeText(label, lx + 90, ly + 120);
      fg.fillStyle = blinkOn ? SIGNAL : BONE;
      fg.fillText(label, lx + 90, ly + 120);
      fg.restore();
    }
  }

  private outro(ctx: Ctx, s: StoryScene, t: number) {
    const b = kinetic(ctx, s.headline ?? 'THANKS FOR WATCHING', W / 2, CENTER - 90, t, { size: 120, maxLines: 3, t0: 0.1, stagger: 0.08 });
    const py = b.bottom + 170;
    const a = range(t, 0.6, 1.0);
    // pulse rings around the button
    if (a >= 1) {
      for (let k = 0; k < 2; k++) {
        const ph = ((t - 1) * 0.9 + k * 0.5) % 1;
        ctx.save();
        ctx.globalAlpha = (1 - ph) * 0.7;
        ctx.strokeStyle = SIGNAL;
        ctx.lineWidth = 4;
        const gw = 640 + ph * 120;
        const gh = 120 + ph * 60;
        ctx.beginPath();
        ctx.roundRect(W / 2 - gw / 2, py - gh / 2, gw, gh, gh / 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    pill(ctx, 'FOLLOW FOR MORE', W / 2, py, 50, a);
  }
}
