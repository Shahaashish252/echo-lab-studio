Write a JavaScript ES module that draws ONE frame of a live, narrated simulation for a vertical explainer Short,
in the style of the "Inside Electronics" servo explainer: a single clean instrument-panel diagram of the mechanism
that stays on screen the whole video, whose state is driven by the narration timing, with every number on screen
computed from that state (so values, needles, gears and graphs always agree).

The module must be exactly:

```js
export default function draw(ctx, t, s) {
  // ctx: CanvasRenderingContext2D, 1080 x 1920 px (s.W x s.H); the dark background is already filled.
  // t: seconds since the video started.
  // ...compute the simulation state for time t from s.lines timings, then draw it...
}
```

`s` provides:
- `s.lines`: the narration, `[{ text, start, end }]` in seconds. Drive the story from these: what happens during line i
  must match `s.lines[i].text` and the event plan below. `s.lineIndex(t)`, `s.lineProgress(i, t)` (0..1, clamped).
- `s.headline`: the hook question; show it at the top (y ≈ 110-200) during the first line(s), then a small persistent
  title or the current step label can take its place.
- `s.ease`: `clamp, lerp, range(t, a, b), smooth, outCubic, inCubic, inOutCubic, outBack, spring(t)`.
- `s.palette`: `bg #0c0f14, panel #1a212b, panelLine #2c3644, text #e6edf3, dim #8a96a8, teal #3fd0c0,
  orange #f2a23a, purple #a78bfa, red #ff6b6b, green #7ee787, blue #58a6ff`.
- `s.round(size, weight?)`: the soft rounded face of the reference (Nunito 400/700/800): use it for nearly all text.
  `s.mono(size, weight?)` (IBM Plex Mono) only for code; `s.sans(size, weight?)` (Archivo) only for a bold hook.
- `s.panel(ctx, x, y, w, h, r?)`: the standard rounded panel (fill + outline).
- `s.brand`: draw it small (s.mono(22), dim, letter-spaced) centred at y ≈ 1830.

Look and layout: FIRST read the two reference frames (image files) `style-ref-hook.png` and `style-ref.png` in the
current directory and copy their look closely: scale, spacing, colours, line weights, how parts and readouts are drawn.
- Portrait 1080x1920. A strip at the top (y ≈ 230-420) for a timeline / waveform / graph of the input signal, with
  dimension labels (e.g. "20 ms", "1.50 ms"); ONE main panel below (x 60..1020, y ≈ 450..1650) holding the
  mechanism as clean schematic parts (blocks, gears, shafts, needles/gauges, wires) plus live readouts.
- SIZES (it is watched on a phone; the reference is the guide): the hook question s.round(64-76, 700) in white at the
  top; labels s.round(32-40) (e.g. "SHOULD BE", "MOTOR"); big values s.round(84-110) (e.g. "90°", "2.64 V"); dimension
  labels on the signal strip s.round(40-48). Parts are BIG: gears 180-300 px across, dials/gauges 220-320 px, blocks
  220+ px wide. Fill the panel: no empty region bigger than about 220 px; nothing under 28 px.
- Readouts: label above, value below, in a colour that means something (target = orange, actual = teal, error = red,
  energy/signal = purple/blue).
- Lines 3-6 px, round caps, flat fills, generous spacing, nothing cramped or overlapping, no text under 22 px,
  everything inside x 40..1040. Labels sit next to the parts they name ("MOTOR", "GEARS", "SHAFT", "POT"...).
- Something always moves: signals travel, gears/needles ease to their targets with realistic lag, pulses repeat.
  Use story devices from the plan: "SLOW x20" tag when slowed down, "TIME FROZEN" tag when frozen, etc.
- The physics/maths must be right and the numbers consistent (e.g. angle from pulse width, voltage from angle).
- Deterministic: no Math.random, no Date, no state between calls (compute everything from t), no DOM, no imports,
  no async. Wrap risky maths so it never throws or draws NaN. Keep it fast (it runs for every frame).
- FIRST 2 SECONDS DECIDE EVERYTHING (viewers swipe in 1-2 s): the hook headline sits where the title normally sits
  (top, above the signal strip) but bigger, s.round(84-96, 800), white with its key word in orange, and from t=0 the
  main object of the mechanism is already big and moving. Do not open on an empty or loading panel. This changes only
  the headline size; keep the rest of the layout above exactly as described.
- KEEP IT SIMPLE for a general audience: at most 3-4 readouts on screen, one big main visual (the object), no tables or
  grids of small numbers. Fewer, bigger things beat many small ones on a phone.
Reply with ONLY the JavaScript module.
