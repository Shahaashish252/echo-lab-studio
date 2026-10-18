# Motion as Code

Motion graphics written as TypeScript. Every frame is a pure function of time, so the
live preview and the rendered MP4 are identical. 1920x1080 (or 1080x1920 for vertical videos, set in `app/src/format.ts`), 60 fps, three.js + Canvas 2D.

Videos:
- **rutherford** (default, 64 s): Rutherford's gold foil experiment, from the plum pudding model to the nuclear atom.
- **ultrasonic** (2:50, vertical 1080x1920): how an HC-SR04 ultrasonic sensor works, for Shorts / Reels / TikTok.
- **demo** (15 s): *"a cinematic motion graphics sequence with kinetic typography, smooth shape transitions, 3D elements and seamless camera movement."*

Pick one with `?video=demo` in the preview, or `--video demo` when rendering.

## Run

```sh
cd app
bun install
bun run dev                 # preview at http://localhost:5173 (plays the soundtrack too)
bun run sound               # synthesize the soundtrack -> app/public/audio/<video>.wav, mux into out/<video>.mp4
bun run draft               # full video, 1 sample/frame  -> out/rutherford.mp4
bun run render              # full video, 6-sample motion blur
bun scripts/render.ts stills --t 2.4,9.5 --out ../out/wip
bun scripts/render.ts video --only fire --samples 1       # one plate
```

Flags: `--video <name>`, `--samples N` (motion blur sub-frames), `--shutter 0.5`, `--scale 2` (4K), `--crf 17`, `--only <plate>`, `--out <path>`.
If `app/public/audio/<video>.wav` exists, full renders include it. Set `BROWSER_CHANNEL=msedge` to render with Edge instead of Chrome.

Preview keys: space play · ←/→ seek 1 s (shift 5 s) · `,` `.` step a frame · `[` `]` previous/next plate · `l` loop plate · `h` hide UI · `?t=9` start at 9 s.

## Layout

| Path | Role |
|---|---|
| `app/src/engine/` | Compositor (2D bg layer → 3D → 2D fg layer → glow/vignette/grain), `Scene` base class, easing |
| `app/src/kit.ts` | Palette, graph paper, per-letter kinetic type, typed code lines, slate marks |
| `app/src/scenes/<video>/*.ts` | The plates for each video |
| `app/src/timeline.ts` | `VIDEOS`: when each plate of each video plays |
| `app/scripts/render.ts` | Vite + headless Chrome → PNG frames → ffmpeg |

## Sound

All sound is synthesized in code by `app/scripts/sound.ts`; there are no audio files to supply.
Each plate can return a cue sheet from `cues(dur)`: `{ t, kind, gain?, pitch?, dur?, pan?, notes? }` in plate-local
seconds. Kinds: `pad` (chord, `notes` as MIDI), `pulse` (kick + hat), `zap`, `flash`, `pop`, `type`, `whoosh`,
`riser`, `boom`, `hit`, `chime`, `servo`, `slowmo`. Plate changes get a whoosh automatically.
Cues are computed from the same data as the visuals, so changing an animation's timing moves its sound with it.
After editing cues, run `bun run sound` (seconds) instead of re-rendering the picture.

## Voice

Lines live in `app/src/scenes/<video>/voice.json`: `text` is the subtitle (with `*highlights*`), `say` (optional)
is what is spoken (spell out numbers and symbols). `"engine"` picks the voice the video uses:

- **kokoro**: free, local draft voice ([Kokoro](https://github.com/thewh1teagle/kokoro-onnx), model in `analysis/models/`)
  `python -m uv run --python 3.12 --with kokoro-onnx --with soundfile python analysis/tts.py rutherford`
- **elevenlabs**: voice and model from the `"elevenlabs"` block. Needs `ELEVENLABS_API_KEY`
  (`setx ELEVENLABS_API_KEY "..."`, then open a new terminal).
  `cd app && bun run voice -- --dry-run` shows the credits a run would use; `bun run voice` generates.
  Only new or changed lines are sent (cache: `voice.cache.json`); `--only id,id` / `--force` regenerate lines.

Clips go to `app/public/voice/<video>/<engine>/`, lengths to `voice.gen.json`. Plates lay their lines out with
`beats()` (in `script.ts`), so every animation and each plate's length follow the clips: switch voices and the
whole video re-times itself. Then `bun run sound` remixes (it warns if a line overlaps the next).

## Writing a plate

Extend `Scene`, export it as default, and draw in `render(f, { bg, fg })` using only
`f.lt` (time since plate start), `f.t`, `f.p`. No `Math.random()` or wall-clock time; use `hash()` from
`engine/ease.ts`. For 3D, set `uses3D = true` and build `this.three` / `this.camera`.
Then add `E('name', '<video>/name', start, end)` to that video's list in `timeline.ts`.
