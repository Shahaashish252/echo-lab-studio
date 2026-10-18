// 07 — Rutherford's reaction, revealed word by word.
import { clamp, outCubic, range } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { beats, dur as voiceDur } from './script';
import { BONE, DISPLAY, fadeInk, paper, SIGNAL, slate, typed } from '../../kit';

// *word* = highlighted
const LINES = [
  'It was almost as incredible as if',
  'you fired a *15-inch* *shell* at a piece',
  'of *tissue* *paper* and it *came* *back*',
  'and *hit* *you.*',
];
const SIZE = 70;
const LEAD = 96;
const TOP = 380;
const B = beats(['quote-1'], { lead: 0.5, tail: 1.8 });
export const LENGTH = B.length;
const V0 = B.at('quote-1');
// The clip opens with "Rutherford said:" before the quote itself; each quote word appears as it
// is spoken, timed by its share of the clip's characters.
const LEAD_IN = 'Rutherford said: ';
const WORDS = LINES.join(' ').split(' ');
const SPOKEN_CHARS = LEAD_IN.length + WORDS.join(' ').replace(/\*/g, '').length;
const WORD_AT: number[] = [];
{
  let chars = LEAD_IN.length;
  for (const w of WORDS) {
    WORD_AT.push(V0 + (chars / SPOKEN_CHARS) * voiceDur('quote-1') - 0.12);
    chars += w.replace(/\*/g, '').length + 1;
  }
}
const END = V0 + voiceDur('quote-1');

export default class Quote extends Scene {
  cues(dur: number): Cue[] {
    return [
      { t: 0, kind: 'pad', dur, notes: [40, 47, 52, 57, 59] },
      { t: 0.1, kind: 'boom', gain: 0.55, pitch: 0.8 },
      ...B.cues(),
      { t: END + 0.1, kind: 'type', dur: 0.9, gain: 0.35 },
      { t: dur - 1.6, kind: 'riser', dur: 1.7, gain: 0.4 },
    ];
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const out = 1 - range(t, f.dur - 0.45, f.dur - 0.05);
    paper(bg, { alpha: 0.5 });
    slate(fg, 'RUTHERFORD  /  05 QUOTE', f.t, out);

    // big opening quote mark
    fg.save();
    fg.globalAlpha = outCubic(range(t, 0.1, 0.5)) * out;
    fg.font = DISPLAY(260, 900);
    fg.fillStyle = SIGNAL;
    fg.fillText('“', 170, TOP + 70);
    fg.restore();

    fg.font = DISPLAY(SIZE, 800);
    fg.textBaseline = 'alphabetic';
    let k = 0;
    LINES.forEach((line, li) => {
      let x = 330;
      const y = TOP + li * LEAD;
      for (const raw of line.split(' ')) {
        const hot = raw.startsWith('*');
        const word = raw.replace(/\*/g, '');
        const a = range(t, WORD_AT[k], WORD_AT[k] + 0.25);
        fg.save();
        fg.globalAlpha = clamp(a) * out;
        fg.fillStyle = hot ? SIGNAL : BONE;
        fg.fillText(word, x, y + (1 - outCubic(a)) * 24);
        fg.restore();
        x += fg.measureText(word + ' ').width;
        k++;
      }
    });

    typed(fg, '— Ernest Rutherford, on the bounce-back', 330, TOP + LINES.length * LEAD + 40, range(t, END + 0.1, END + 1.0), 24, BONE, {
      alpha: 0.75 * out,
    });
    fadeInk(fg, 1 - out);
  }
}
