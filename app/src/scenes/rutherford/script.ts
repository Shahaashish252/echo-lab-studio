// Narration for this video. voice.json holds each line (caption text with *highlights*, plus an
// optional `say` for the voice). A voice script (analysis/tts.py for Kokoro, scripts/voice.ts for
// ElevenLabs) speaks them and writes voice.gen.json with each clip's length.
//
// Plates lay their lines out with beats(): lines play back to back, every animation is keyed to
// the line it illustrates (b.at('setup-3')), and the plate's length comes from the clips. Change
// the voice and the whole video re-times itself.
import type { Cue } from '../../engine/scene';
import { caption, type Ctx } from '../../kit';
import SCRIPT from './voice.json';

type Line = { text: string; say?: string };
const LINES = SCRIPT.lines as Record<string, Line>;

/** Which voice the video uses: "kokoro" (free, local draft) or "elevenlabs". */
export const ENGINE = SCRIPT.engine;
const gen = import.meta.glob<Record<string, Record<string, number>>>('./voice.gen.json', { eager: true, import: 'default' });
const DUR: Record<string, number> = Object.values(gen)[0]?.[ENGINE] ?? {};

const spoken = (id: string) => (LINES[id].say ?? LINES[id].text).replace(/\*|\[[^\]]*\]/g, '');

/** Length of a spoken line (s). Estimated from word count until a voice script has run. */
export function dur(id: string) {
  if (!LINES[id]) throw new Error(`No voice line "${id}"`);
  return DUR[id] ?? spoken(id).split(/\s+/).length * 0.36;
}

/** Sound cue that plays line `id` at plate time `t`. */
export const voice = (id: string, t: number): Cue => ({ t, kind: 'voice', id });

/**
 * Splits caption text into subtitle chunks of at most ~`max` characters, breaking after
 * punctuation where it can. *Highlights* that straddle a break are closed and reopened.
 */
function chunks(text: string, max = 62): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let cur: string[] = [];
  const len = (ws: string[]) => ws.join(' ').replace(/\*/g, '').length;
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const punct = /[.,:;?!]\**$/.test(w);
    if (next && (len([...cur, next]) > max || (punct && len(cur) > 26 && len(words.slice(i + 1)) > 12))) {
      out.push(cur.join(' '));
      cur = [];
    }
  });
  if (cur.length) out.push(cur.join(' '));
  // keep highlight markers balanced per chunk
  let open = false;
  return out.map((c) => {
    let s = open ? `*${c}` : c;
    const stars = (c.match(/\*/g) ?? []).length;
    if (stars % 2) open = !open;
    if (open) s += '*';
    return s;
  });
}

/**
 * Subtitle for line `id`, spoken from plate time `t0`, shown chunk by chunk in step with the
 * speech, until `end`.
 */
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
  starts[0] -= 0.15;
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const b = last ? Math.min(end, t0 + d + 0.6) : starts[i + 1];
    caption(ctx, p, starts[i], b, t, y, i ? 0.12 : 0.35, last ? 0.3 : 0.12);
  });
}

export type Beat = string | [string, number];

export interface Beats {
  /** plate time at which line `id` starts */
  at(id: string): number;
  /** plate time at which line `id` ends */
  end(id: string): number;
  /** plate length: last line's end plus the tail */
  length: number;
  /** voice cues for every line */
  cues(): Cue[];
  /** subtitles for every line */
  subs(ctx: Ctx, t: number, y?: number): void;
}

/**
 * Lays lines out back to back. A beat is a line id, or [id, extra pause before it].
 * `lead` is silence before the first line; `tail` is time after the last; `min` a floor on length.
 */
export function beats(spec: Beat[], { lead = 0.6, gap = 0.4, tail = 1.0, min = 0 } = {}): Beats {
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
      ids.forEach((id, i) => sub(ctx, id, at[id], t, i + 1 < ids.length ? at[ids[i + 1]] - 0.15 : length - 0.1, y));
    },
  };
}
