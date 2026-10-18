// Soundtrack generator. Reads the video's cue sheet from the app (each plate's cues()),
// synthesizes every sound in code, adds reverb, loudness-normalizes to -14 LUFS, writes
// app/public/audio/<video>.wav (the preview plays it) and muxes it into out/<video>.mp4.
//
//   bun scripts/sound.ts [--video rutherford] [--no-mux]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Cue } from '../src/engine/scene';
import { appDir, openApp, outRoot } from './app';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const SR = 48000;
const TAU = Math.PI * 2;

// ---- deterministic noise ------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- filters ------------------------------------------------------------------------------
/** TPT state-variable filter (Cytomic). Call with per-sample cutoff. */
function svf() {
  let ic1 = 0;
  let ic2 = 0;
  return (x: number, fc: number, q = 0.7) => {
    const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return { low: v2, band: v1, high: x - k * v1 - v2 };
  };
}

const mono = (sec: number) => new Float32Array(Math.ceil(sec * SR));

// ---- instruments (each returns a mono buffer starting at the cue) -------------------------
type Inst = (c: Cue, r: () => number) => Float32Array;

const zap: Inst = (c) => {
  const p = c.pitch ?? 1;
  const b = mono(0.09);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = (500 + 1400 * Math.exp(-t / 0.018)) * p;
    ph += (TAU * f) / SR;
    b[i] = (Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.15) * Math.min(1, t / 0.002) * Math.exp(-t / 0.022);
  }
  return b;
};

const flash: Inst = (c) => {
  const p = c.pitch ?? 1;
  const b = mono(0.45);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.001) * Math.exp(-t / 0.09);
    b[i] = e * (Math.sin(TAU * 2600 * p * t) + 0.4 * Math.sin(TAU * 3920 * p * t) + 0.15 * Math.sin(TAU * 6100 * p * t)) * 0.5;
  }
  return b;
};

const pop: Inst = (c) => {
  const p = c.pitch ?? 1;
  const b = mono(0.14);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    ph += (TAU * (240 + 520 * Math.exp(-t / 0.02)) * p) / SR;
    b[i] = Math.sin(ph) * Math.min(1, t / 0.001) * Math.exp(-t / 0.03);
  }
  return b;
};

const tick = (r: () => number, b: Float32Array, at: number, g: number) => {
  const hp = svf();
  const n = Math.floor(0.006 * SR);
  const s0 = Math.floor(at * SR);
  for (let i = 0; i < n && s0 + i < b.length; i++) {
    const x = (r() * 2 - 1) * Math.exp(-i / (0.0012 * SR));
    b[s0 + i] += hp(x, 3500, 1.2).band * g * 2;
  }
};

const type: Inst = (c, r) => {
  const dur = c.dur ?? 0.5;
  const b = mono(dur + 0.05);
  for (let t = 0; t < dur; t += 1 / 26 + r() * 0.012) tick(r, b, t, 0.5 + r() * 0.5);
  return b;
};

const whoosh: Inst = (c, r) => {
  const dur = c.dur ?? 0.7;
  const b = mono(dur);
  const f = svf();
  for (let i = 0; i < b.length; i++) {
    const u = i / b.length;
    const env = Math.sin(Math.PI * Math.pow(u, 0.7)) ** 2;
    b[i] = f(r() * 2 - 1, 300 * Math.pow(20, Math.sin(Math.PI * u)), 1.4).band * env * 1.6;
  }
  return b;
};

const riser: Inst = (c, r) => {
  const dur = c.dur ?? 2;
  const b = mono(dur);
  const f = svf();
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const u = i / b.length;
    const env = u * u * (1 - Math.pow(u, 12));
    ph += (TAU * (180 * Math.pow(4, u))) / SR;
    b[i] = (f(r() * 2 - 1, 400 * Math.pow(15, u), 1.8).band * 1.4 + Math.sin(ph) * 0.25 + Math.sin(ph * 1.5) * 0.12) * env;
  }
  return b;
};

const boom: Inst = (c, r) => {
  const p = c.pitch ?? 1;
  const b = mono(2.2);
  const f = svf();
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    ph += (TAU * (32 + 70 * Math.exp(-t / 0.12)) * p) / SR;
    const body = Math.tanh(Math.sin(ph) * 1.8) * Math.exp(-t / 0.55);
    const crack = f(r() * 2 - 1, 1200, 0.8).low * Math.exp(-t / 0.035);
    b[i] = (body * 0.9 + crack * 1.2) * Math.min(1, t / 0.002);
  }
  return b;
};

const hit: Inst = (c, r) => {
  const p = c.pitch ?? 1;
  const b = mono(0.6);
  const f = svf();
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    ph += (TAU * (70 + 110 * Math.exp(-t / 0.04)) * p) / SR;
    b[i] = (Math.sin(ph) * Math.exp(-t / 0.14) + f(r() * 2 - 1, 2500, 0.7).low * Math.exp(-t / 0.018)) * Math.min(1, t / 0.001);
  }
  return b;
};

const chime: Inst = (c) => {
  const f0 = 880 * (c.pitch ?? 1) * 0.5;
  const partials = [
    [1, 1, 1.4],
    [2.76, 0.45, 0.6],
    [5.4, 0.22, 0.3],
    [8.93, 0.1, 0.15],
  ];
  const b = mono(2);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    let v = 0;
    for (const [m, a, d] of partials) v += Math.sin(TAU * f0 * m * t) * a * Math.exp(-t / d);
    b[i] = v * Math.min(1, t / 0.002) * 0.45;
  }
  return b;
};

const servo: Inst = (c, r) => {
  const dur = c.dur ?? 2;
  const b = mono(dur);
  const f = svf();
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const u = t / dur;
    const env = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.15);
    ph += (TAU * (95 + 30 * Math.sin(Math.PI * u) + 3 * Math.sin(TAU * 7 * t))) / SR;
    const saw = ((ph / TAU) % 1) * 2 - 1;
    b[i] = (f(saw, 900, 0.9).low * 0.8 + (r() * 2 - 1) * 0.04) * env;
  }
  return b;
};

const slowmo: Inst = (_c, r) => {
  const b = mono(1.8);
  const f = svf();
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const u = t / 1.8;
    ph += (TAU * (700 * Math.pow(0.1, u))) / SR;
    const env = Math.min(1, t / 0.03) * Math.pow(1 - u, 1.5);
    b[i] = (f(r() * 2 - 1, 6000 * Math.pow(0.04, u), 2).band * 1.5 + Math.sin(ph) * 0.35) * env;
  }
  return b;
};

/** Kick on the beat, closed hat on the off-beat. */
const pulse: Inst = (c, r) => {
  const dur = c.dur ?? 4;
  const bpm = 120;
  const beat = 60 / bpm;
  const b = mono(dur + 0.4);
  const hp = svf();
  for (let k = 0; k * beat < dur; k++) {
    const s0 = Math.floor(k * beat * SR);
    let ph = 0;
    for (let i = 0; i < 0.35 * SR && s0 + i < b.length; i++) {
      const t = i / SR;
      ph += (TAU * (45 + 90 * Math.exp(-t / 0.03))) / SR;
      b[s0 + i] += Math.sin(ph) * Math.exp(-t / 0.18) * 0.9;
    }
    const h0 = Math.floor((k + 0.5) * beat * SR);
    for (let i = 0; i < 0.05 * SR && h0 + i < b.length; i++)
      b[h0 + i] += hp(r() * 2 - 1, 8000, 0.8).high * Math.exp(-i / (0.012 * SR)) * 0.18;
  }
  return b;
};

const INSTRUMENTS: Record<string, Inst> = { zap, flash, pop, type, whoosh, riser, boom, hit, chime, servo, slowmo, pulse };

/** Warm pad: detuned saws per note through a slowly breathing low-pass. Stereo. */
function pad(c: Cue): [Float32Array, Float32Array] {
  const dur = c.dur ?? 4;
  const attack = 1.4;
  const release = 2.2;
  const n = Math.ceil((dur + release) * SR);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const notes = c.notes ?? [];
  out.forEach((buf, ch) => {
    const f = svf();
    const phases = notes.flatMap(() => [0, 0, 0]);
    const det = [-0.006, 0, 0.007].map((d) => d + (ch ? 0.002 : -0.002));
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      notes.forEach((m, k) => {
        const hz = 440 * Math.pow(2, (m - 69) / 12);
        for (let d = 0; d < 3; d++) {
          const j = k * 3 + d;
          phases[j] = (phases[j] + (hz * (1 + det[d])) / SR) % 1;
          v += phases[j] * 2 - 1;
        }
      });
      v /= Math.max(1, notes.length * 3);
      const env = Math.min(1, t / attack) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / release));
      buf[i] = f(v, 700 + 350 * Math.sin(TAU * 0.07 * t + ch), 0.8).low * env * 2.2;
    }
  });
  return out;
}

/** Reads a 16-bit PCM WAV (as written by analysis/tts.py) into mono float samples at SR. */
function readWav(file: string): Float32Array {
  const b = readFileSync(file);
  let off = 12;
  let channels = 1;
  let rate = SR;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(off + 10);
      rate = b.readUInt32LE(off + 12);
    } else if (id === 'data') {
      if (rate !== SR) throw new Error(`${file}: expected ${SR} Hz, got ${rate}`);
      const n = Math.floor(size / 2 / channels);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2 * channels) / 32768;
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

// ---- reverb (Freeverb-style) ----------------------------------------------------------------
function reverb(inL: Float32Array, inR: Float32Array, room = 0.84, damp = 0.25) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const run = (input: Float32Array, spread: number) => {
    const out = new Float32Array(input.length);
    const cb = combs.map((d) => ({ buf: new Float32Array(Math.floor((d + spread) * scale)), i: 0, lp: 0 }));
    const ab = aps.map((d) => ({ buf: new Float32Array(Math.floor((d + spread) * scale)), i: 0 }));
    for (let n = 0; n < input.length; n++) {
      const x = input[n] * 0.015;
      let y = 0;
      for (const c of cb) {
        const o = c.buf[c.i];
        c.lp = o * (1 - damp) + c.lp * damp;
        c.buf[c.i] = x + c.lp * room;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      for (const a of ab) {
        const o = a.buf[a.i];
        a.buf[a.i] = y + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o - y;
      }
      out[n] = y;
    }
    return out;
  };
  return [run(inL, 0), run(inR, 23)];
}

// ---- mix ------------------------------------------------------------------------------------
const { page, info, close } = await openApp({ video: opt('video') });
let cues: Cue[];
try {
  cues = await page.evaluate(() => (window as any).__mac.cues());
} finally {
  await close();
}
console.log(`${info.video}: ${cues.length} cues over ${info.duration}s`);

const N = Math.ceil(info.duration * SR);
const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);
const voiceBus = new Float32Array(N);

const place = (buf: Float32Array, at: number, gain: number, pan: number, send: number, ch?: 0 | 1) => {
  const s0 = Math.round(at * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let i = 0; i < buf.length; i++) {
    const n = s0 + i;
    if (n < 0) continue;
    if (n >= N) break;
    const v = buf[i];
    if (ch !== 1) {
      dryL[n] += v * gl;
      sendL[n] += v * gl * send;
    }
    if (ch !== 0) {
      dryR[n] += v * gr;
      sendR[n] += v * gr * send;
    }
  }
};

const LEVEL: Record<string, number> = {
  zap: 0.35, flash: 0.3, pop: 0.45, type: 0.25, whoosh: 0.5, riser: 0.45, boom: 0.9,
  hit: 0.7, chime: 0.35, servo: 0.3, slowmo: 0.6, pulse: 0.55,
};
const SEND: Record<string, number> = { chime: 0.6, flash: 0.5, boom: 0.4, hit: 0.35, zap: 0.2, pad: 0.45 };

// voice clips live per engine; voice.json says which one this video uses
const voiceCfg = resolve(appDir, 'src', 'scenes', info.video, 'voice.json');
const engine: string = existsSync(voiceCfg) ? JSON.parse(readFileSync(voiceCfg, 'utf8')).engine : '';
const voiceDir = resolve(appDir, 'public', 'voice', info.video, engine);
if (engine) console.log(`voice: ${engine}`);
const spans: [number, number][] = [];
cues.forEach((c, k) => {
  const r = rng(k * 7919 + 17);
  if (c.kind === 'voice') {
    const file = join(voiceDir, `${c.id}.wav`);
    if (!existsSync(file)) {
      console.warn(`! missing voice clip ${file} (run analysis/tts.py)`);
      return;
    }
    const clip = readWav(file);
    const s0 = Math.round(c.t * SR);
    for (let i = 0; i < clip.length && s0 + i < N; i++) voiceBus[s0 + i] += clip[i] * (c.gain ?? 1);
    const span: [number, number] = [c.t, c.t + clip.length / SR];
    const prev = spans[spans.length - 1];
    if (prev && span[0] < prev[1]) console.warn(`! voice "${c.id}" starts ${(prev[1] - span[0]).toFixed(2)}s before the previous line ends`);
    if (span[1] > info.duration) console.warn(`! voice "${c.id}" runs ${(span[1] - info.duration).toFixed(2)}s past the end`);
    spans.push(span);
    return;
  }
  if (c.kind === 'pad') {
    const [l, rr] = pad(c);
    place(l, c.t, 0.26 * (c.gain ?? 1), 0, SEND.pad, 0);
    place(rr, c.t, 0.26 * (c.gain ?? 1), 0, SEND.pad, 1);
    return;
  }
  const inst = INSTRUMENTS[c.kind];
  if (!inst) {
    console.warn(`! unknown cue kind "${c.kind}" at ${c.t.toFixed(2)}s`);
    return;
  }
  place(inst(c, r), c.t, (c.gain ?? 1) * (LEVEL[c.kind] ?? 0.5), c.pan ?? 0, SEND[c.kind] ?? 0.25);
});

// Duck music and effects while the narrator speaks: -8 dB, 60 ms down, 450 ms back up.
const duck = new Float32Array(N);
{
  const target = new Float32Array(N).fill(1);
  for (const [a, b] of spans) target.fill(0.4, Math.max(0, Math.round((a - 0.08) * SR)), Math.min(N, Math.round((b + 0.1) * SR)));
  const down = Math.exp(-1 / (0.06 * SR));
  const up = Math.exp(-1 / (0.45 * SR));
  let g = 1;
  for (let i = 0; i < N; i++) {
    const k = target[i] < g ? down : up;
    g = target[i] + (g - target[i]) * k;
    duck[i] = g;
  }
}
for (let i = 0; i < N; i++) {
  dryL[i] *= duck[i];
  dryR[i] *= duck[i];
  sendL[i] = sendL[i] * duck[i] + voiceBus[i] * 0.06;
  sendR[i] = sendR[i] * duck[i] + voiceBus[i] * 0.06;
}

const [wetL, wetR] = reverb(sendL, sendR);
const pcm = new Int16Array(N * 2);
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / (0.4 * SR)); // tail out at the loop point
  const v = voiceBus[i] * 0.9;
  const l = Math.tanh((dryL[i] + wetL[i] + v) * 0.9) * fade;
  const r = Math.tanh((dryR[i] + wetR[i] + v) * 0.9) * fade;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  pcm[i * 2] = l * 32767;
  pcm[i * 2 + 1] = r * 32767;
}

function wav(data: Int16Array) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.byteLength, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.byteLength, 40);
  return Buffer.concat([h, Buffer.from(data.buffer)]);
}

mkdirSync(outRoot, { recursive: true });
const raw = join(outRoot, `${info.video}.raw.wav`);
writeFileSync(raw, wav(pcm));
console.log(`mixed (peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS)`);

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};

const audioDir = resolve(appDir, 'public', 'audio');
mkdirSync(audioDir, { recursive: true });
const final = join(audioDir, `${info.video}.wav`);
ff(['-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', String(SR), '-c:a', 'pcm_s16le', final]);
console.log(`wrote ${final} (-14 LUFS)`);

const video = join(outRoot, `${info.video}.mp4`);
if (!argv.includes('--no-mux') && existsSync(video)) {
  const tmp = join(outRoot, `${info.video}.mux.mp4`);
  ff(['-i', video, '-i', final, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', tmp]);
  renameSync(tmp, video);
  console.log(`muxed into ${video}`);
}
