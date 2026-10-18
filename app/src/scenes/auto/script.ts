// Narration for generated ("auto") videos: the ultrasonic short's caption scheme, reading the lines
// scripts/auto.ts wrote to voice.json. analysis/tts.py speaks them and writes voice.gen.json.
import type { Cue } from '../../engine/scene';
import { outBack, range } from '../../engine/ease';
import { BONE, DISPLAY, INK, SIGNAL, W, type Ctx } from '../../kit';

type Line = { text: string; say?: string };
type Script = { engine: string; lines: Record<string, Line> };
const script = Object.values(import.meta.glob<Script>('./voice.json', { eager: true, import: 'default' }))[0];
const LINES: Record<string, Line> = script?.lines ?? {};
/** a narration line's subtitle text */
export const lineText = (id: string) => LINES[id]?.text ?? '';

export const ENGINE = script?.engine ?? 'kokoro';
const gen = import.meta.glob<Record<string, Record<string, number>>>('./voice.gen.json', { eager: true, import: 'default' });
const DUR: Record<string, number> = Object.values(gen)[0]?.[ENGINE] ?? {};

const spoken = (id: string) => (LINES[id].say ?? LINES[id].text).replace(/\*|\[[^\]]*\]/g, '');

/** Length of a spoken line (s). Estimated from word count until a voice script has run. */
export function dur(id: string) {
  if (!LINES[id]) throw new Error(`No voice line "${id}"`);
  return DUR[id] ?? spoken(id).split(/\s+/).length * 0.34;
}

export const voice = (id: string, t: number): Cue => ({ t, kind: 'voice', id });

/** Caption baseline centre. Clear of the Shorts / Reels / TikTok buttons and description. */
export const CAPTION_Y = 1400;
const SIZE = 60;
const MAX_W = 900;

/** Splits caption text into chunks of at most ~`max` characters, breaking after punctuation where it can. */
function chunks(text: string, max = 40): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let cur: string[] = [];
  const len = (ws: string[]) => ws.join(' ').replace(/\*/g, '').length;
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const punct = /[.,:;?!]\**$/.test(w);
    if (next && (len([...cur, next]) > max || (punct && len(cur) > 16 && len(words.slice(i + 1)) > 8))) {
      out.push(cur.join(' '));
      cur = [];
    }
  });
  if (cur.length) out.push(cur.join(' '));
  let open = false;
  return out.map((c) => {
    let s = open ? `*${c}` : c;
    if ((c.match(/\*/g) ?? []).length % 2) open = !open;
    if (open) s += '*';
    return s;
  });
}

interface Word {
  text: string;
  hi: boolean;
}

/** Words with their highlight state; *stars* may open and close mid-word ("*20 cm*."). */
function words(chunk: string): Word[] {
  const out: Word[] = [];
  let hi = false;
  for (const raw of chunk.split(' ')) {
    let text = '';
    let wordHi = false;
    for (const ch of raw) {
      if (ch === '*') hi = !hi;
      else {
        text += ch;
        if (hi) wordHi = true;
      }
    }
    if (text) out.push({ text, hi: wordHi });
  }
  return out;
}

/** Big centred caption, wrapped to two lines, words popping in as they're spoken. */
export function bigCaption(ctx: Ctx, chunk: string, t0: number, t1: number, t: number, y = CAPTION_Y) {
  const a = range(t, t0 - 0.05, t0 + 0.12);
  const b = 1 - range(t, t1 - 0.12, t1);
  const alpha = Math.min(a, b);
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = DISPLAY(SIZE, 800);
  ctx.textBaseline = 'alphabetic';
  const ws = words(chunk);
  const space = ctx.measureText(' ').width;
  // greedy wrap
  const lines: Word[][] = [[]];
  let lw = 0;
  for (const w of ws) {
    const ww = ctx.measureText(w.text).width;
    if (lines[lines.length - 1].length && lw + space + ww > MAX_W) {
      lines.push([]);
      lw = 0;
    }
    lw += (lines[lines.length - 1].length ? space : 0) + ww;
    lines[lines.length - 1].push(w);
  }
  const LH = SIZE * 1.18;
  const top = y - ((lines.length - 1) * LH) / 2;
  const span = Math.max(0.3, (t1 - t0) * 0.75);
  let k = 0;
  lines.forEach((line, li) => {
    const widths = line.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((s, w) => s + w, 0) + space * (line.length - 1);
    let x = W / 2 - total / 2;
    const ly = top + li * LH;
    line.forEach((w, i) => {
      const wt = t0 + (k / ws.length) * span;
      const p = range(t, wt - 0.08, wt + 0.14);
      k++;
      const s = 0.7 + 0.3 * outBack(p, 2.4);
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(1, p * 2);
        ctx.translate(x + widths[i] / 2, ly);
        ctx.scale(s, s);
        ctx.lineJoin = 'round';
        ctx.lineWidth = 12;
        ctx.strokeStyle = INK;
        ctx.strokeText(w.text, -widths[i] / 2, 0);
        ctx.fillStyle = w.hi ? SIGNAL : BONE;
        ctx.fillText(w.text, -widths[i] / 2, 0);
        ctx.restore();
      }
      x += widths[i] + space;
    });
  });
  ctx.restore();
}

/** Subtitle for line `id` spoken from `t0`, chunk by chunk in step with the speech, until `end`. */
export function sub(ctx: Ctx, id: string, t0: number, t: number, end = Infinity, y?: number) {
  const text = LINES[id]?.text;
  if (!text || t < t0 - 0.2 || t > end) return;
  const parts = chunks(text);
  const total = parts.reduce((n, p) => n + p.replace(/\*/g, '').length, 0);
  const d = dur(id);
  const starts: number[] = [];
  let chars = 0;
  for (const p of parts) {
    starts.push(t0 + (chars / total) * d);
    chars += p.replace(/\*/g, '').length;
  }
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const b = last ? Math.min(end, t0 + d + 0.5) : starts[i + 1];
    bigCaption(ctx, p, starts[i], b, t, y);
  });
}

export type Beat = string | [string, number];

export interface Beats {
  at(id: string): number;
  end(id: string): number;
  length: number;
  cues(): Cue[];
  subs(ctx: Ctx, t: number, y?: number): void;
}

/**
 * Lays lines out back to back. A beat is a line id, or [id, extra pause before it].
 * `lead` is silence before the first line; `tail` is time after the last; `min` a floor on length.
 */
export function beats(spec: Beat[], { lead = 0.4, gap = 0.3, tail = 0.7, min = 0 } = {}): Beats {
  const at: Record<string, number> = {};
  const ids: string[] = [];
  let t = lead;
  for (const s of spec) {
    const [id, extra] = typeof s === 'string' ? [s, 0] : s;
    t += extra;
    at[id] = t;
    ids.push(id);
    t += dur(id) + gap;
  }
  const length = Math.max(min, t - gap + tail);
  const need = (id: string) => {
    if (!(id in at)) throw new Error(`Line "${id}" is not in this plate's beats`);
    return at[id];
  };
  return {
    at: need,
    end: (id) => need(id) + dur(id),
    length,
    cues: () => ids.map((id) => voice(id, at[id])),
    subs(ctx, t, y) {
      ids.forEach((id, i) => sub(ctx, id, at[id], t, i + 1 < ids.length ? at[ids[i + 1]] - 0.05 : length - 0.1, y));
    },
  };
}
