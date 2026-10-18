// 16:9 frame for the long-form upload. The vertical video is composited into the empty centre
// column by ffmpeg (see channel/README.md); this plate draws the chapter list on the left and a
// key-idea card on the right, both following the vertical video's plate timings.
import { clamp, outCubic, range } from '../../engine/ease';
import { Scene, type Frame, type Layers } from '../../engine/scene';
import { BONE, DISPLAY, H, MONO, paper, SIGNAL, W } from '../../kit';
import { LENGTH as bat } from './bat';
import { LENGTH as code } from './code';
import { LENGTH as hook } from './hook';
import { LENGTH as limits } from './limits';
import { LENGTH as math } from './math';
import { LENGTH as outro } from './outro';
import { LENGTH as parts } from './parts';
import { LENGTH as piezo } from './piezo';
import { LENGTH as sound } from './sound';
import { LENGTH as spec } from './spec';
import { LENGTH as steps } from './steps';
import { LENGTH as title } from './title';
import { LENGTH as uses } from './uses';
import { CYAN, DIM, GREEN } from './ui';

const CHAPTERS: [string, number, string, string[]][] = [
  ['Intro', hook + title, 'THE IDEA', ['Measure distance', 'with sound']],
  ['Echolocation', bat, 'LIKE A BAT', ['call  →  echo', '→  distance']],
  ['What is ultrasound?', sound, 'ULTRASOUND', ['> 20 kHz', 'HC-SR04: 40 kHz']],
  ['Anatomy', parts, 'THE PARTS', ['T: transmitter', 'R: receiver', 'VCC TRIG ECHO GND']],
  ['The piezo disc', piezo, 'PIEZO', ['voltage → motion', 'motion → voltage']],
  ['How it measures', steps, '4 STEPS', ['1  TRIG 10 µs', '2  BURST 8 × 40 kHz', '3  ECHO goes HIGH', '4  ECHO goes LOW']],
  ['The maths', math, 'FORMULA', ['d = v × t ÷ 2', 'cm = µs ÷ 58']],
  ['Arduino code', code, 'CODE', ['pulseIn(ECHO, HIGH)', 't / 58.0']],
  ['Range & beam', spec, 'SPECS', ['2 cm – 4 m', '≈ 15° beam']],
  ['Blind spots', limits, 'WATCH OUT', ['soft surfaces', 'angled surfaces', 'temperature']],
  ['Real-world uses', uses, 'USES', ['parking sensors', 'robots · drones', 'water tanks']],
  ['Recap', outro, 'RECAP', ['SEND', 'TIME', 'HALVE']],
];
const STARTS: number[] = [];
{
  let t = 0;
  for (const c of CHAPTERS) {
    STARTS.push(t);
    t += c[1];
  }
}
export const LENGTH = CHAPTERS.reduce((s, c) => s + c[1], 0);
/** Chapter start times, for the YouTube description. */
export const CHAPTER_TIMES = CHAPTERS.map((c, i) => ({ name: c[0], start: STARTS[i] }));

/** The empty centre column the vertical video is overlaid into. */
export const HOLE = { x: (W - (H * 9) / 16) / 2, w: (H * 9) / 16 };

export default class Wide extends Scene {
  render(f: Frame, { bg, fg }: Layers) {
    const t = f.lt;
    paper(bg);
    let ci = 0;
    for (let i = 0; i < STARTS.length; i++) if (t >= STARTS[i]) ci = i;
    const [, len, kicker, lines] = CHAPTERS[ci];
    const lt = t - STARTS[ci];

    // brand
    fg.save();
    fg.font = DISPLAY(44, 900);
    fg.fillStyle = BONE;
    fg.fillText('ECHO LAB', 70, 110);
    fg.fillStyle = CYAN;
    fg.fillText('3D', 70 + fg.measureText('ECHO LAB ').width, 110);
    fg.font = MONO(20, 500);
    fg.fillStyle = SIGNAL;
    fg.fillText('HOW ULTRASONIC SENSORS WORK', 72, 148);
    fg.restore();

    // chapter list
    CHAPTERS.forEach(([name], i) => {
      const y = 230 + i * 64;
      const on = i === ci;
      const done = i < ci;
      fg.save();
      fg.font = MONO(20, 500);
      fg.fillStyle = on ? SIGNAL : DIM;
      fg.fillText(String(i + 1).padStart(2, '0'), 70, y);
      fg.font = DISPLAY(on ? 32 : 28, on ? 800 : 500);
      fg.fillStyle = on ? BONE : done ? 'rgba(239,230,214,0.6)' : 'rgba(239,230,214,0.35)';
      fg.fillText(name, 120, y);
      if (on) {
        fg.fillStyle = 'rgba(239,230,214,0.12)';
        fg.fillRect(120, y + 14, 440, 4);
        fg.fillStyle = SIGNAL;
        fg.fillRect(120, y + 14, 440 * clamp(lt / len), 4);
      }
      fg.restore();
    });

    // frame around the video column
    fg.save();
    fg.strokeStyle = 'rgba(239,230,214,0.18)';
    fg.lineWidth = 2;
    fg.strokeRect(HOLE.x - 1, -2, HOLE.w + 2, H + 4);
    fg.restore();

    // key idea card
    const a = outCubic(range(lt, 0.15, 0.6));
    const x = HOLE.x + HOLE.w + 70;
    fg.save();
    fg.globalAlpha = a;
    fg.translate(0, (1 - a) * 20);
    fg.font = MONO(24, 500);
    fg.fillStyle = SIGNAL;
    fg.fillText(kicker, x, 300);
    lines.forEach((l, i) => {
      const la = range(lt, 0.3 + i * 0.25, 0.7 + i * 0.25);
      fg.globalAlpha = a * la;
      fg.font = DISPLAY(l.length > 16 ? 40 : 52, 800);
      fg.fillStyle = i === 0 ? CYAN : BONE;
      fg.fillText(l, x, 380 + i * 78);
    });
    fg.restore();

    // subscribe nudge
    fg.save();
    fg.font = MONO(22, 500);
    fg.fillStyle = GREEN;
    fg.fillText('▶  SUBSCRIBE FOR MORE', x, 960);
    fg.fillText('   HOW-IT-WORKS IN 3D', x, 994);
    fg.restore();
  }
}
