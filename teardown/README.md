# teardown3 format

One ~60 s vertical Short in three styles, all made in code:

1. **Exploded Teardown** (3D, three.js): the sensor module comes apart, the camera dives into its sensing part.
2. **Blueprint**: the signal step by step (Fig. 2) and the physics + formula + worked example (Fig. 3), one red stamp.
3. **Isometric Infographic**: range, three real uses, two limits, one tip, then a legend card.

`python teardown/make.py "<topic>" --kind <ir|ldr|flame|sound|gas|soil|ultrasonic|pir|dht> [--upload] [--spec file.json] [--stills]`

- Claude writes one JSON spec (prompt in `make.py`); `examples/ultrasonic-robot.json` shows the shape. A topic in
  `channel/topics.json` can carry `"spec"` to use a hand-checked spec instead.
- Voice: `analysis/tts.py` (Microsoft Madhur, Kokoro fallback). All timings come from the voice (`page/src/timeline.js`).
- Picture: `page/` (served from this folder, rendered headless). Locally `render.mjs`; in the cloud 10 parallel
  `Teardown part` runs (`.github/workflows/teardown-part.yml`). Sound: `mix.py` (synthesised score + foley, no samples).
- Sensor models: `page/src/modules.js` (models from typical datasheet sizes; the film says "3D model").

Credits: style grammar and render tools adapted from Lemo-Opuscar (github.com/lemomo-ai/lemo-opuscar, MIT, `core/LICENSE-lemo-opuscar`).
Fonts: Inter, JetBrains Mono, Architects Daughter, Jost (SIL OFL). HDRI: Poly Haven photo_studio_loft_hall (CC0, downloaded at render time).
