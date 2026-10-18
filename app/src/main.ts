import '@fontsource/archivo/500.css';
import '@fontsource/archivo/800.css';
import '@fontsource/archivo/900.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import { Engine } from './engine/engine';
import type { Cue, Frame } from './engine/scene';
import { H as BASE_H, VIDEO, W as BASE_W } from './format';
import { buildPlates, durationOf, FPS, plateIndexAt } from './timeline';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const SCALE = Number(params.get('scale') ?? 1);
const W = BASE_W * SCALE;
const H = BASE_H * SCALE;

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.style.aspectRatio = `${BASE_W} / ${BASE_H}`;
if (BASE_W !== 1920 || BASE_H !== 1080) canvas.style.width = `min(100vw, ${((100 * BASE_W) / BASE_H).toFixed(2)}vh)`;
const engine = new Engine(canvas, W, H, SCALE);
const plates = buildPlates(VIDEO);
const DURATION = durationOf(plates);
document.title = `${VIDEO} · Motion as Code`;

function frameAt(t: number, seeked: boolean): [number, Frame] {
  const i = plateIndexAt(plates, t);
  const pl = plates[i];
  const dur = pl.end - pl.start;
  return [i, { t, lt: t - pl.start, p: (t - pl.start) / dur, dur, seeked }];
}

function draw(t: number, seeked: boolean) {
  const [i, f] = frameAt(t, seeked);
  engine.render(plates[i].scene, f);
  return i;
}

/** Renderer: waits for the plate's footage before drawing, so every frame is exact. */
async function prepare(t: number) {
  const [i, f] = frameAt(t, false);
  await plates[i].scene.prepare?.(f);
}

async function fontsReady() {
  await Promise.all(
    ['500 40px Archivo', '800 40px Archivo', '900 40px Archivo', '400 20px "IBM Plex Mono"', '500 20px "IBM Plex Mono"', '400 40px Nunito', '700 40px Nunito', '800 40px Nunito'].map(
      (f) => document.fonts.load(f),
    ),
  );
  await document.fonts.ready;
}

if (RENDER) {
  document.body.classList.add('render');
  const pixels = new Uint8Array(W * H * 4);
  const acc = new Float32Array(W * H * 4);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d')!;
  let last = -1;

  (window as any).__mac = {
    video: VIDEO,
    duration: DURATION,
    fps: FPS,
    width: W,
    height: H,
    plates: plates.map(({ id, start, end }) => ({ id, start, end })),
    /** The whole video's sound cue sheet, in global time. */
    cues(): Cue[] {
      const all: Cue[] = [];
      plates.forEach((p, i) => {
        if (i > 0) all.push({ t: p.start - 0.35, kind: 'whoosh', gain: 0.5, dur: 0.7 });
        for (const c of p.scene.cues?.(p.end - p.start) ?? []) all.push({ ...c, t: c.t + p.start });
      });
      return all.filter((c) => c.t >= 0 && c.t < DURATION).sort((a, b) => a.t - b.t);
    },
    /** Renders time t and returns a PNG data URL. samples > 1 averages sub-frames over the shutter. */
    async frame(t: number, samples = 1, shutter = 0.5): Promise<string> {
      if (samples <= 1) {
        await prepare(t);
        draw(t, Math.abs(t - last) > 1.5 / FPS);
        last = t;
        return canvas.toDataURL('image/png');
      }
      acc.fill(0);
      for (let s = 0; s < samples; s++) {
        const st = Math.min(DURATION - 1e-4, t + ((s + 0.5) / samples - 0.5) * (shutter / FPS));
        await prepare(Math.max(0, st));
        draw(Math.max(0, st), s === 0 && Math.abs(t - last) > 1.5 / FPS);
        engine.readPixels(pixels);
        for (let k = 0; k < acc.length; k++) acc[k] += pixels[k];
      }
      last = t;
      const img = octx.createImageData(W, H);
      const row = W * 4;
      for (let y = 0; y < H; y++) {
        const src = (H - 1 - y) * row;
        const dst = y * row;
        for (let x = 0; x < row; x++) img.data[dst + x] = acc[src + x] / samples;
      }
      octx.putImageData(img, 0, 0);
      return out.toDataURL('image/png');
    },
  };
  fontsReady().then(() => ((window as any).__macReady = true));
} else {
  startPlayer();
}

function startPlayer() {
  const hud = document.getElementById('hud')!;
  const bar = document.getElementById('bar')!;
  const timeEl = hud.querySelector('.time')!;
  const plateEl = hud.querySelector('.plate')!;
  const stateEl = hud.querySelector('.state')!;
  const head = document.createElement('div');
  head.className = 'head';
  const segs = plates.map((p) => {
    const d = document.createElement('div');
    d.className = 'seg';
    d.style.left = `${(p.start / DURATION) * 100}%`;
    d.style.width = `${((p.end - p.start) / DURATION) * 100}%`;
    d.title = p.id;
    bar.appendChild(d);
    return d;
  });
  bar.appendChild(head);

  // ?t= wins; otherwise resume where the last hot reload left off.
  let t = Number(params.get('t') ?? sessionStorage.getItem(`mac.t.${VIDEO}`) ?? 0) || 0;
  let playing = false;
  let loop = false;
  let seeked = true;
  let prev = performance.now();

  // Soundtrack from scripts/sound.ts, if it has been made. Playback drives the clock.
  const audio = new Audio(`/audio/${VIDEO}.wav`);
  let hasAudio = false;
  audio.addEventListener('canplaythrough', () => (hasAudio = true), { once: true });
  audio.addEventListener('error', () => (hasAudio = false));
  const syncAudio = () => {
    if (!hasAudio) return;
    if (playing && !loop) {
      if (Math.abs(audio.currentTime - t) > 0.05) audio.currentTime = t;
      if (audio.paused) audio.play().catch(() => {});
    } else if (!audio.paused) audio.pause();
  };

  const seek = (to: number) => {
    t = Math.min(DURATION - 1 / FPS, Math.max(0, to));
    seeked = true;
    if (hasAudio) audio.currentTime = t;
  };
  const current = () => plates[plateIndexAt(plates, t)];

  bar.addEventListener('pointerdown', (e) => {
    const r = bar.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * DURATION);
  });

  addEventListener('keydown', (e: KeyboardEvent) => {
    const i = plateIndexAt(plates, t);
    switch (e.key) {
      case ' ': playing = !playing; e.preventDefault(); break;
      case 'ArrowLeft': seek(t - (e.shiftKey ? 5 : 1)); break;
      case 'ArrowRight': seek(t + (e.shiftKey ? 5 : 1)); break;
      case ',': playing = false; seek(Math.round(t * FPS - 1) / FPS); break;
      case '.': playing = false; seek(Math.round(t * FPS + 1) / FPS); break;
      case '[': seek(plates[Math.max(0, t - plates[i].start < 0.5 ? i - 1 : i)].start); break;
      case ']': seek(plates[Math.min(plates.length - 1, i + 1)].start); break;
      case 'l': loop = !loop; break;
      case 'h': hud.classList.toggle('hidden'); break;
    }
  });

  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    syncAudio();
    if (playing && hasAudio && !loop && !audio.paused) {
      t = audio.currentTime;
      if (audio.ended || t >= DURATION) seek(0);
    } else if (playing) {
      t += dt;
      const pl = current();
      if (loop && t >= pl.end) seek(pl.start);
      else if (t >= DURATION) seek(0);
    }
    const i = draw(t, seeked);
    seeked = false;
    sessionStorage.setItem(`mac.t.${VIDEO}`, String(t));

    timeEl.textContent = `${t.toFixed(2)}s / ${DURATION.toFixed(1)}s  ·  frame ${Math.floor(t * FPS)}`;
    plateEl.textContent = `${VIDEO} / ${plates[i].id}`;
    stateEl.textContent = (playing ? '▶' : '❚❚') + (loop ? '  loop' : '');
    segs.forEach((s, k) => s.classList.toggle('on', k === i));
    head.style.left = `${(t / DURATION) * 100}%`;
    requestAnimationFrame(tick);
  };
  fontsReady().then(() => requestAnimationFrame(tick));
}
