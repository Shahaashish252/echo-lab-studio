// 14 — Summary checklist, the Bohr teaser and credits. Fades to ink (the video loops to frame 0).
import { clamp, outBack, outCubic, range, spring } from '../../engine/ease';
import { Scene, type Cue, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, fadeInk, GOLD, heading, letters, MONO, paper, SIGNAL, slate, W } from '../../kit';
import { beats } from './script';
import VOICE from './voice.json';

const B = beats(['outro-1', ['outro-2', 0.3]], { lead: 0.6, tail: 3.0 });
export const LENGTH = B.length;
const [O1, O2] = ['outro-1', 'outro-2'].map(B.at);

const POINTS: [boolean, string][] = [
  [true, 'Most of the atom is empty space'],
  [true, 'A tiny, dense, positive nucleus  (~10⁻¹⁵ m)'],
  [true, 'Electrons orbit the nucleus'],
  [false, 'But: orbiting electrons should spiral in, and no line spectra'],
];

const CREDIT =
  VOICE.engine === 'elevenlabs'
    ? `Narration: ElevenLabs (${VOICE.elevenlabs.voiceName})`
    : 'Narration: Kokoro TTS';

export default class Outro extends Scene {
  cues(dur: number): Cue[] {
    const c: Cue[] = [
      ...B.cues(),
      { t: 0, kind: 'pad', dur, notes: [36, 43, 48, 52, 55, 59, 64] },
      { t: 0.1, kind: 'type', dur: 0.5, gain: 0.4 },
      { t: O2 + 0.1, kind: 'riser', dur: 1.2, gain: 0.3 },
      { t: O2 + 1.3, kind: 'boom', gain: 0.5, pitch: 1.2 },
    ];
    POINTS.forEach((_, i) => c.push({ t: this.pointAt(i), kind: i < 3 ? 'chime' : 'hit', gain: 0.3, pitch: [1.5, 1.68, 2, 1.3][i] }));
    return c;
  }

  private pointAt(i: number) {
    return O1 + 0.2 + i * ((B.end('outro-1') - O1) / POINTS.length);
  }

  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    const L = f.dur;
    paper(bg, { alpha: 1 - range(t, L - 1.2, L - 0.4) });
    slate(fg, 'RUTHERFORD  /  14 SUMMARY', f.t, 1 - range(t, L - 1.2, L - 0.6));
    const listOut = 1 - range(t, O2 - 0.2, O2 + 0.3);
    heading(fg, '12 / SUMMARY', 'Key takeaways', t, listOut);

    POINTS.forEach(([ok, text], i) => {
      const a = range(t, this.pointAt(i), this.pointAt(i) + 0.4) * listOut;
      if (a <= 0) return;
      const y = 380 + i * 110;
      const pop = outBack(range(t, this.pointAt(i), this.pointAt(i) + 0.35), 2.5);
      fg.save();
      fg.globalAlpha = a;
      fg.fillStyle = ok ? 'rgba(126,224,122,0.15)' : 'rgba(255,90,31,0.15)';
      fg.beginPath();
      fg.arc(180, y - 14, 30 * pop, 0, Math.PI * 2);
      fg.fill();
      fg.font = DISPLAY(36, 900);
      fg.textAlign = 'center';
      fg.fillStyle = ok ? '#7ee07a' : SIGNAL;
      fg.fillText(ok ? '✓' : '✗', 180, y - 1);
      fg.textAlign = 'left';
      fg.font = DISPLAY(40, 800);
      fg.fillStyle = ok ? BONE : SIGNAL;
      fg.fillText(text, 240 + (1 - outCubic(a)) * 30, y);
      fg.restore();
    });

    // Next: Bohr.
    const n = t - (O2 + 1.0);
    if (n > 0) {
      const fade = 1 - range(t, L - 1.2, L - 0.6);
      letters(fg, 'NEXT', W / 2, 420, DISPLAY(34, 800), SIGNAL, (i) => ({ alpha: clamp(n * 4 - i * 0.2) * fade }), 'center');
      letters(fg, "Bohr's model", W / 2, 560, DISPLAY(150, 900), BONE, (i) => {
        const a = n - 0.2 - i * 0.03;
        return { dy: (1 - spring(a, 1.6, 7)) * 90, alpha: clamp(a * 6) * fade };
      }, 'center');
      letters(fg, '1913', W / 2, 660, DISPLAY(64, 800), GOLD, (i) => ({ alpha: clamp((n - 0.8) * 4 - i * 0.2) * fade }), 'center');
      fg.save();
      fg.globalAlpha = range(t, O2 + 2.2, O2 + 2.8) * fade * 0.6;
      fg.font = MONO(18, 500);
      fg.fillStyle = BONE;
      fg.textAlign = 'center';
      fg.fillText(`${CREDIT}   ·   Music & effects: synthesized in code   ·   Made with Motion as Code`, W / 2, 1038);
      fg.restore();
    }

    B.subs(fg, t);
    fadeInk(fg, range(t, L - 0.6, L - 0.05));
  }
}
