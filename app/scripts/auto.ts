// Topic -> finished vertical video, combining MoneyPrinterTurbo's idea (AI script + stock footage)
// with this project's motion graphics, Kokoro voice and synthesized sound.
//
//   bun scripts/auto.ts "How black holes work" [--voice af_heart] [--speed 1.08] [--samples 1] [--out file.mp4] [--stock] [--upload] [--lang hi]
//
// 1. Claude Code (claude -p, your subscription) writes a storyboard: scenes, narration, on-screen text
// 2. analysis/tts.py speaks every line with Kokoro (local, free)
// 3. backgrounds are animated motion graphics drawn in code (backdrops.ts); with --stock, Pixabay
//    clips per scene instead, cut to each scene's length as 1080x1920 frames
// 4. scripts/sound.ts mixes voice, music pad, beat and sound effects
// 5. scripts/render.ts renders the "auto" video
// 6. YouTube metadata goes to channel/videos/auto-<slug>.json; with --upload, channel/youtube.py uploads it
//    (as private: unaudited API projects can't upload public videos, so publish it after watching)
// With --stock, the Pixabay key comes from PIXABAY_API_KEY or MoneyPrinterTurbo's config.toml.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { PARTS } from '../src/scenes/auto/arduino';
import { VISUALS } from '../src/scenes/auto/backdrops';
import type { SceneType, Storyboard, StoryScene, Timing } from '../src/scenes/auto/storyboard';
import { appDir, outRoot } from './app';

const argv = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const SWITCHES = ['--stock', '--upload', '--classic', '--flat', '--3d', '--photo', '--ai'];
const flagged = new Set(argv.flatMap((a, i) => (SWITCHES.includes(a) ? [i] : a.startsWith('--') ? [i, i + 1] : [])));
const STOCK = argv.includes('--stock');
const UPLOAD = argv.includes('--upload');
/** the older text-slide format; the default is illustrated scenes (an animated drawing per scene) */
const CLASSIC = argv.includes('--classic');
/** flat illustrated scenes (an animated SVG drawing per scene); the default is one realistic 3D model */
const FLAT = argv.includes('--flat');
/** one realistic 3D model per video (slow: ~20 min for the model); the default is real photos, animated */
const MODEL3D = argv.includes('--3d');
/** real photos, animated (fast, ~5 min); the default is a live simulation like the reference servo Short */
const PHOTO_FMT = argv.includes('--photo');
/** AI-generated clips (Hugging Face free GPUs) behind the classic layouts */
const AI = argv.includes('--ai');
const SIM = !CLASSIC && !FLAT && !MODEL3D && !PHOTO_FMT && !AI;
/** --lang hi: Hindi narration (Kokoro hm_omega) with Hinglish titles and captions; the default is English */
const HINDI = opt('lang', 'en') === 'hi';
const HINDI_NOTE = `

LANGUAGE: this video is for a Hindi-speaking audience in India.
- Every narration line ("text" and "say") is natural, conversational spoken Hindi in Devanagari script, the way a friendly
  Indian tech creator talks: short punchy sentences, everyday words, not formal/textbook Hindi. Write English technical
  words the way they are said, in Devanagari (सेंसर, सर्किट, वोल्टेज, आर्डुइनो, इन्फ्रारेड), and spell out numbers and units in
  Hindi words in "say". Keep each line about as short as the English rules ask (Hindi takes longer to speak).
- The hook "headline" and the outro "headline" are in Hinglish (Roman script, e.g. "Yeh aapko DEKHTA nahi!"), because
  the audience is Hindi-speaking and these big words are what stops the scroll. Small part labels on the diagram may
  stay short English (MOTOR, LED, IR), and the "title"/"kicker" may stay English.
- youtube.title: Hinglish in Roman script, curiosity-driven, e.g. "PIR Sensor Kaise Kaam Karta Hai? 🤔 #shorts".
- youtube.description, social.instagram and social.tiktok: Hinglish in Roman script; hashtags may mix English and #hindi.
- youtube.tags: mix English search phrases and Hinglish ones ("pir sensor kaise kaam karta hai", "motion sensor in hindi").`;
const topic = argv.filter((_, i) => !flagged.has(i)).join(' ').trim();
if (!topic) {
  console.error('usage: bun scripts/auto.ts "your topic" [--voice af_heart] [--speed 1.08]');
  process.exit(1);
}

const ROOT = resolve(appDir, '..');
const SCENES = join(appDir, 'src', 'scenes', 'auto');
const BROLL = join(appDir, 'public', 'auto', 'broll');
const VOICE = join(appDir, 'public', 'voice', 'auto');
const CACHE = join(outRoot, 'auto_cache');
const TIMING: Timing = { lead: 0.35, gap: 0.22, tail: 0.45 };
/** Arduino topics get "board" scenes: a drawn Arduino Uno, its parts pointed out, live demos */
const ARDUINO = /arduino/i.test(topic);
const TYPES: SceneType[] = CLASSIC || AI
  ? ['hook', 'title', 'stat', 'list', 'steps', 'compare', 'quote', 'fact', 'outro', ...(ARDUINO ? (['board'] as const) : [])]
  : FLAT
    ? ['diagram', 'outro', ...(ARDUINO ? (['board'] as const) : [])]
    : MODEL3D
      ? ['model', 'outro', ...(ARDUINO ? (['board'] as const) : [])]
      : PHOTO_FMT
        ? ['photo', 'outro', ...(ARDUINO ? (['board'] as const) : [])]
        : ['sim', 'outro'];

const step = (s: string) => console.log(`\n== ${s}`);

// One video at a time: every run shares the "auto" scene files. A second run (say the scheduled job while
// you're making one by hand) waits for the first; a lock older than 2 hours is treated as abandoned.
const LOCK = join(outRoot, 'auto.lock');
{
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let waited = 0; existsSync(LOCK); waited += 30) {
    const [pid, since] = readFileSync(LOCK, 'utf8').split(' ').map(Number);
    if (!alive(pid) || Date.now() - since > 2 * 3600_000) break;
    if (waited === 0) console.log('another video is being made; waiting for it to finish...');
    await Bun.sleep(30_000);
  }
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(LOCK, `${process.pid} ${Date.now()}`);
  process.on('exit', () => rmSync(LOCK, { force: true }));
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'video';

function run(cmd: string, args: string[], cwd = appDir) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed (exit ${r.status})`);
}

// ---- 1. storyboard ----------------------------------------------------------------------------

const CLASSIC_PROMPT = `Write a storyboard for a 45-70 second vertical explainer video (YouTube Shorts / Reels) about:
"${topic}"

Reply with ONLY a JSON object, no markdown fences, no commentary:
{
  "title": "short video title, max 28 characters",
  "kicker": "series label, max 22 characters, e.g. SCIENCE EXPLAINED",
  "youtube": {
    "title": "YouTube Shorts title, max 70 characters, curiosity-driven, may include one emoji, ends with #shorts",
    "description": "a 1-2 sentence hook, then 3-5 lines on what the video shows (each starting with an emoji), then a
                    line asking viewers to subscribe for more, then 5-8 hashtags on one line including #shorts",
    "tags": ["10-15 lowercase search phrases people would type to find this video"]
  },
  "social": {
    "instagram": "Reels caption written to go viral: line 1 is a scroll-stopping hook (max 10 words, one emoji, no hashtags),
                  then 1-2 short lines of context ending with 👇, then 3-4 emoji bullet lines of the key takeaways,
                  then three call-to-action lines: 💾 save it, 📤 send it to a friend who..., 💬 a question that invites
                  comments; then EXACTLY 5 hashtags (2 broad + 3 niche). Max 1500 characters, no false claims.",
    "tiktok": "TikTok caption: the hook, one line on what they'll learn, a comment question, then exactly 5 hashtags
               including #learnontiktok. Max 300 characters."
  },
  "footage": 3 safe stock VIDEO searches that fit the whole topic, 1-2 common words each (e.g. "circuit board", "electronics"),
  "scenes": [ ... 7 to 9 scenes ... ]
}

Every scene has:
  "type": one of ${TYPES.join(', ')}
  "lines": narration spoken during the scene, 1-3 sentences, each max 18 words. Objects {"text": "...", "say": "..."}:
           "text" is the subtitle; wrap 1-2 key words in *stars* to highlight them.
           "say" (optional) is how to pronounce it: spell out numbers, units, symbols and acronyms in words.
  "search": 3 stock VIDEO searches for this scene, most specific first, 1-2 common English words each, naming
            concrete filmable things that stock sites tag (e.g. ["arduino", "circuit board", "electronics"]).
            Never single ambiguous words or brand fragments (not "uno"); no abstract ideas.
  "visual": the animated background that best fits this scene, one of: circuit (electronics, chips, computers),
            network (internet, AI, connections), waves (sound, signals, energy, water), orbit (space, atoms, cycles),
            grid (future, technology, games), particles (nature, chemistry, calm or abstract), bars (data, growth,
            money, statistics), radar (sensors, detection, searching). Vary it between scenes.
Type-specific fields (on-screen text, keep it SHORT and punchy):
  hook:    "headline": 2-5 word attention grabber, may use *stars*
  title:   "headline": the topic title, 2-6 words
  fact:    "headline": 3-8 words, "label": 1-3 word tag like DID YOU KNOW?
  stat:    "value": number, "prefix": e.g. "$" or "", "suffix": e.g. "%", " km", "x", "label": what it measures, max 10 words,
           "source": the well-known organisation or study that published this figure. Use stat ONLY for a real,
           widely reported number you can attribute; never estimate or invent one.
  list:    "heading": 2-5 words, "items": 3-4 entries of max 4 words
  steps:   "heading": 2-5 words, "items": 3-4 steps of max 4 words, in order
  compare: "headline": 2-5 words, "left" and "right": {"title": 1-2 words, "points": 2-3 entries of max 5 words}
  quote:   "quote": a real, accurate quotation, max 25 words, "author": who said it
  outro:   "headline": 2-5 word wrap-up; its last line asks viewers to follow for more
${ARDUINO ? `  board:   shows a real Arduino Uno board and demonstrates it. "heading": 2-5 words.
           "focus": the board parts the narration names, in the order it names them (0-4 of: ${Object.keys(PARTS).join(', ')}).
           "demo" (optional): "upload" (USB cable plugs in, TX/RX flash, code uploads) or "blink" (the pin 13 LED
           blinks next to the Blink sketch). The narration must describe exactly what is shown.
           Use 3-4 board scenes: e.g. a tour of the main parts, the power/pins, uploading code, and a blink demo.
` : ''}Rules: first scene is hook, second is title, last is outro. Use at least four different types. Total narration
120-170 words. Never invent numbers or quotes: a stat needs a real "source", a quote must be verbatim and correctly
attributed. If unsure, use fact, list, steps or compare instead.
The narration of each scene must match what is on screen. Plain, vivid, conversational English.`;

const SOCIAL_FIELDS = `  "youtube": {
    "title": "YouTube Shorts title, max 70 characters: 'How X Actually Works 🤔' or a sharper curiosity question, ends with #shorts",
    "description": "a 1-2 sentence hook, then 3-5 lines on what the video shows (each starting with an emoji), then a
                    line asking viewers to subscribe for more, then 5-8 hashtags on one line including #shorts",
    "tags": ["10-15 lowercase search phrases people would type to find this video"]
  },
  "social": {
    "instagram": "Reels caption written to go viral: line 1 is a scroll-stopping hook (max 10 words, one emoji, no hashtags),
                  then 1-2 short lines of context ending with 👇, then 3-4 emoji bullet lines of the key takeaways,
                  then three call-to-action lines: 💾 save it, 📤 send it to a friend who..., 💬 a question that invites
                  comments; then EXACTLY 5 hashtags (2 broad + 3 niche). Max 1500 characters, no false claims.",
    "tiktok": "TikTok caption: the hook, one line on what they'll learn, a comment question, then exactly 5 hashtags
               including #learnontiktok. Max 300 characters."
  },`;

/** Illustrated format, modelled on the top "How X Works" Shorts (Zack D. Films style): 30-40 s, the real object on
 *  screen the whole time, something moving every ~2 s, a curiosity hook over the object in the first second. */
const FLAT_PROMPT = `Write a storyboard for a 30-40 second vertical explainer Short about:
"${topic}"

It must beat the top "How X Works" Shorts: the viewer SEES the real object and its hidden mechanism the whole time
(no text slides), something on screen changes every 1.5-2 seconds, and the first second is a curiosity hook shown
over the object. Explain ONE surprising mechanism clearly, step by step, then end with a satisfying payoff line.

Reply with ONLY a JSON object, no markdown fences, no commentary:
{
  "title": "short video title, max 28 characters",
  "kicker": "series label, max 22 characters, e.g. TECH EXPLAINED",
${SOCIAL_FIELDS}
  "bible": "2-3 sentences fixing the look of the main object(s) so every scene draws them the same way: shape,
            proportions, colours (realistic mid-tone colours, never large near-white areas), key parts",
  "scenes": [ ... 5 or 6 scenes ... ]
}

Every scene has:
  "type": ${ARDUINO ? '"diagram", "board" or "outro"' : '"diagram" or "outro" (only the last scene is outro)'}
  "lines": narration, 1-2 sentences per scene, each max 14 words. Objects {"text": "...", "say": "..."}:
           "text" is the subtitle; wrap 1-2 key words in *stars*. "say" (optional): how to pronounce it, with numbers,
           units, symbols and acronyms spelled out in words.
  "headline": 2-6 words on screen above the drawing (scene 1: the hook as a question, may use *stars*;
              last scene: the payoff in 2-4 words)
  "visual": background mood, one of circuit, network, waves, orbit, grid, particles, bars, radar
diagram scenes also have:
  "draw": a precise brief for an illustrator: what is shown (often a cutaway or close-up of the object), the
          composition, and each movable part. Different scenes show different views or zoom levels.
  "parts": the ids of the movable parts the drawing must have as separate layers, lowercase-with-dashes (3-7 ids),
           plus, for anything that flows (light, heat, current, air, signal), a path id ending in "-path".
  "anims": 3-6 animation cues, in time order, at least one per narration line, using only those ids:
           {"effect": one of pop | pulse | glow | move | rotate | spin | shake | fade | flow | waves | focus | label,
            "target": part id ("all" with focus = zoom back out), "line": index of the narration line (0 or 1),
            "at": 0..1 point in that line, plus for move "dx"/"dy" (viewBox units, up to 250), rotate/spin "deg",
            focus "zoom" (1.3-2.2), flow "path" (a -path id), label "text" (1-2 words)}
           pop = appears now; focus = camera zooms to the part; flow = glowing particles travel along the path;
           waves = rings ripple out of the part; fade = part becomes see-through to reveal what's behind it.
${ARDUINO ? `board:   shows a real Arduino Uno board. "focus": parts it names in order (0-4 of: ${Object.keys(PARTS).join(', ')});
         "demo" (optional): "upload" or "blink". Use 1-2 board scenes.
` : ''}Rules: 80-110 words of narration in total. Scene 1 hooks within its first line. Every claim must be accurate.
The narration must describe exactly what the animation shows at that moment. Plain, vivid, conversational English.`;

/** The art direction every scene's SVG is drawn with. */
const SVG_RULES = `Draw ONE SVG illustration for a frame of a vertical explainer Short (the drawing sits in a square
area of the frame; text and subtitles are added separately, so draw NO text except tiny part labels if essential).

Rules:
- <svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg"> with no width/height. The subject fills ~80%
  of the square and is centred; transparent background (no full-canvas rectangle).
- High-quality flat explainer style with depth: solid fills, subtle linear/radial gradients, soft shadows
  (feGaussianBlur only), rounded corners, consistent 6-8 px dark outlines (#14110e) on main shapes,
  realistic proportions (a phone is about 1:2, fingers have rounded tips, etc.).
- Colours: realistic MID-TONE colours for objects (avoid large areas lighter than #d8d0c4: they glow too much on video);
  the accent #ff5a1f for the important thing (signal, heat, the key part); #efe6d6 only for small highlights.
- Each movable part is its own TOP-LEVEL <g id="..."> (direct child of <svg>), drawn complete on its own; static
  scenery may be in a group with id "base". Paths that things flow along are <path id="...-path"> with
  fill="none" and stroke="none" (they are invisible guides), inside any group.
- No <text> unless essential, no <foreignObject>, no external images, no CSS animation, no filters except
  feGaussianBlur / feOffset / feMerge.
Reply with ONLY the SVG.`;

/** Runs Claude Code headless; async so the scene drawings can be made in parallel. */
async function claudeAsync(prompt: string, system: string, timeoutMs = 420_000, opts: { cwd?: string; tools?: string[] } = {}): Promise<string> {
  const cli = Bun.which('claude');
  if (!cli) throw new Error('claude CLI not found: install Claude Code and log in');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && !k.startsWith('CLAUDE_CODE_USE_')),
  ) as Record<string, string>;
  const tools = opts.tools?.length ? ['--allowedTools', opts.tools.join(',')] : ['--tools', ''];
  const proc = Bun.spawn([cli, '-p', '--output-format', 'text', ...tools, '--safe-mode', '--system-prompt', system], {
    cwd: opts.cwd ?? tmpdir(), env, stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe',
  });
  let timedOut = false;
  const timer = setTimeout(() => ((timedOut = true), proc.kill()), timeoutMs);
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  clearTimeout(timer);
  if ((await proc.exited) !== 0) throw new Error(timedOut ? `claude took over ${timeoutMs / 60000} min` : `claude failed: ${(err || out).slice(0, 300)}`);
  return out;
}

/** Draws one diagram scene's SVG and keeps only the animation cues whose parts were drawn. */
async function drawScene(s: StoryScene, brief: string, parts: string[], bible: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await claudeAsync(
        `${SVG_RULES}\n\nThe look of the objects (keep consistent): ${bible}\n\nThis frame: ${brief}\n\n` +
          `Required ids (top-level <g> for parts, <path> for ids ending in -path): ${parts.join(', ')}`,
        'You are a meticulous vector illustrator. You output a single valid SVG document and nothing else.',
      );
      const a = out.indexOf('<svg');
      const b = out.lastIndexOf('</svg>');
      if (a < 0 || b < a) throw new Error('no <svg> in reply');
      const svg = out.slice(a, b + 6);
      const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      const missing = parts.filter((p) => !ids.has(p));
      if (missing.length > Math.max(1, parts.length / 3)) throw new Error(`missing parts: ${missing.join(', ')}`);
      s.anims = (s.anims ?? []).filter((c) => c.target === 'all' || (ids.has(c.target) && (c.effect !== 'flow' || ids.has(c.path ?? c.target))));
      s.svg = svg;
      console.log(`  ${s.id}: drawn (${(svg.length / 1024).toFixed(0)} KB, ${parts.length - missing.length}/${parts.length} parts)`);
      return;
    } catch (e) {
      console.warn(`  ${s.id}: drawing attempt ${attempt} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  // no drawing: the scene keeps its headline as a plain text scene
  s.type = 'fact';
  s.anims = undefined;
}

/** 3D format (default): one realistic three.js model per video, built by Claude, checked by rendering it and
 *  having Claude look at the result; every scene animates that model from a different camera angle. */
const PROMPT_3D = `Write a storyboard for a 30-40 second vertical explainer Short about:
"${topic}"

It must beat the top "How X Works" Shorts (Zack D. Films style): a REALISTIC 3D model of the real object is on screen
the whole time, the camera and parts move every 1.5-2 seconds (orbit, zoom into parts, explode the object open, show
light/sound/heat/current flowing), and the first second is a curiosity hook over the object. Explain ONE surprising
mechanism step by step, then end with a satisfying payoff line.

Reply with ONLY a JSON object, no markdown fences, no commentary:
{
  "title": "short video title, max 28 characters",
  "kicker": "series label, max 22 characters, e.g. TECH EXPLAINED",
${SOCIAL_FIELDS}
  "model": {
    "brief": "a precise brief for a 3D artist: the object(s) with real dimensions in cm, materials and colours, the
              visible details that make it instantly recognisable, the internal parts in their real arrangement (they
              get revealed by fading the shell or exploding the parts apart), and exactly how objects sit together
              (e.g. 'an index finger pointing straight down, its pad pressing the screen above the sensor')",
    "parts": ["4-8 ids of separately animated parts, lowercase-with-dashes"],
    "paths": ["0-2 ids ending in -path: routes along which light/sound/heat/current/air flows"]
  },
  "scenes": [ ... 5 or 6 scenes ... ]
}

Every scene has:
  "type": ${ARDUINO ? '"model", "board" or "outro"' : '"model" or "outro" (only the last scene is outro)'}
  "lines": narration, 1-2 sentences per scene, each max 14 words. Objects {"text": "...", "say": "..."}:
           "text" is the subtitle; wrap 1-2 key words in *stars*. "say" (optional): how to pronounce it, with numbers,
           units, symbols and acronyms spelled out in words.
  "headline": 2-6 words on screen above the model (scene 1: the hook as a question, may use *stars*;
              last scene: the payoff in 2-4 words)
  "visual": background mood, one of circuit, network, waves, orbit, grid, particles, bars, radar
model scenes also have:
  "view": the camera for this scene {"azimuth": -70..70 degrees around the object (0 = front; show the back only if
          the narration is about the back), "elevation": -10..60, "distance": 0.8..1.3}; vary it between scenes
  "anims": 3-6 cues in time order, at least one per narration line, targets from model.parts / model.paths:
           {"effect": pop | move | rotate | spin | shake | pulse | glow | fade | explode | flow | waves | focus | label,
            "target": part id ("all" with focus = zoom back out), "line": narration line index (0 or 1), "at": 0..1 within it,
            move: "dx"/"dy"/"dz" (-2..2; the whole model is about 6 units across); rotate/spin: "deg" and "axis" (x|y|z);
            explode: "amount" (0.5-1.5, pushes the part outward from the centre); focus: "zoom" (1.2-1.8);
            flow: "path" (a -path id); label: "text" (1-2 words)}
           fade = the part turns see-through to reveal the inside; flow = glowing particles travel along the path;
           waves = rings ripple out of the part; glow = the part lights up orange.
           SHOW THE MECHANISM: from scene 2 on, every scene opens the object up: fade the outer shell/glass and/or
           explode the inner parts apart, then focus + label + glow the exact part the narration is explaining. Never
           show the same closed outside view twice. Internal parts must be in model.parts so they can be revealed.
${ARDUINO ? `board:   shows a real Arduino Uno board. "focus": parts it names in order (0-4 of: ${Object.keys(PARTS).join(', ')});
         "demo" (optional): "upload" or "blink". Use 1-2 board scenes.
` : ''}Rules: 80-110 words of narration in total. Scene 1 hooks within its first line. Every claim must be accurate.
The narration must describe exactly what the animation shows at that moment. Plain, vivid, conversational English.`;

const MODEL_FILE = join(SCENES, 'model.gen.js');

/** Asks Claude to write (or fix) the video's three.js model. */
async function writeModel(brief: string, parts: string[], paths: string[], fix?: { code: string; problems: string }) {
  const rules = readFileSync(join(appDir, 'scripts', 'model-prompt.md'), 'utf8');
  const ask =
    `${rules}\n\nThe object: ${brief}\n\nParts: ${parts.join(', ')}\nPaths: ${paths.join(', ') || '(none)'}\n` +
    (fix ? `\nYour previous version had these problems; fix ALL of them and return the full corrected module:\n${fix.problems}\n\nPrevious version:\n${fix.code}\n` : '');
  const system = 'You are an expert three.js 3D artist. You output a single JavaScript module and nothing else.';
  // a detailed model is a lot of code: allow 15 minutes, and try once more if the call fails
  const out = await claudeAsync(ask, system, 900_000).catch((e) => {
    console.warn(`  model writing failed (${e instanceof Error ? e.message : e}); retrying`);
    return claudeAsync(ask, system, 900_000);
  });
  const m = out.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
  const code = (m ? m[1] : out).trim();
  if (!/export\s+default\s+function/.test(code)) throw new Error('model reply has no default export');
  writeFileSync(MODEL_FILE, code + '\n');
  return code;
}

/** Renders stills of the model scenes; returns page errors and the image paths. */
function checkRender(): { errors: string; images: string[] } {
  const dir = join(CACHE, 'model-check');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ids = story!.scenes.filter((s) => s.type === 'model').slice(0, 3).map((s) => `${s.id}@0.6`);
  const r = spawnSync('bun', ['scripts/render.ts', 'stills', '--video', 'auto', '--t', ids.join(','), '--out', dir], { cwd: appDir, encoding: 'utf8' });
  const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const errors = log.split('\n').filter((l) => /page error|\[page\]|model\.gen\.js failed|Error/i.test(l)).join('\n');
  const images = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => join(dir, f)) : [];
  return { errors: r.status ? errors || log.slice(-800) : errors, images };
}

/** Claude looks at the rendered stills and judges realism; returns problems to fix, or '' when it's good. */
async function reviewModel(images: string[], brief: string): Promise<string> {
  const cli = Bun.which('claude')!;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && !k.startsWith('CLAUDE_CODE_USE_')),
  ) as Record<string, string>;
  const prompt =
    `Look at these frames from a 3D explainer video (read each image file): ${images.join(', ')}\n\n` +
    `The model should be: ${brief}\n\nJudge it like a typical viewer scrolling Shorts, fairly, not as a perfectionist: ` +
    `ok = true when the main objects are instantly recognisable and nothing is clearly broken. Only report problems a ` +
    `typical viewer would notice: an object that isn't recognisable, parts floating, poking through each other or ` +
    `pointing the wrong way, wrong proportions, blown-out white or muddy dark areas. Fingers come from a built-in ` +
    `realistic finger model: judge only their placement and angle, not their shape or detail. Ignore the text ` +
    `overlays, labels and background. Reply with ONLY JSON: {"ok": true|false, "problems": "numbered list of ` +
    `concrete fixes for the 3D code, or empty if ok"}`;
  const proc = Bun.spawn([cli, '-p', '--output-format', 'text', '--allowedTools', 'Read', '--safe-mode'], {
    cwd: resolve(images[0], '..'), env, stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe',
  });
  const timer = setTimeout(() => proc.kill(), 300_000);
  const out = await new Response(proc.stdout).text();
  clearTimeout(timer);
  await proc.exited;
  try {
    const j = parse(out);
    return j.ok ? '' : String(j.problems || 'not realistic enough');
  } catch {
    return ''; // an unreadable review shouldn't block the video
  }
}

/** Builds the model, then up to 3 rounds of render -> fix errors / visual review -> rewrite. */
async function buildModel(m: { brief: string; parts: string[]; paths: string[] }) {
  let code = await writeModel(m.brief, m.parts, m.paths);
  for (let round = 1; round <= 3; round++) {
    const { errors, images } = checkRender();
    let problems = errors ? `It crashed or logged errors when rendering:\n${errors}` : '';
    if (!problems && images.length) problems = await reviewModel(images, m.brief);
    if (!problems) {
      console.log(`  model approved (round ${round})`);
      return true;
    }
    console.log(`  round ${round}: ${problems.split('\n')[0].slice(0, 140)}`);
    if (round === 3) break;
    try {
      code = await writeModel(m.brief, m.parts, m.paths, { code, problems });
    } catch (e) {
      console.warn(`  fix round failed (${e instanceof Error ? e.message : e}); keeping the previous model`);
      writeFileSync(MODEL_FILE, `${code}\n`);
      break;
    }
  }
  // keep the last version if it at least renders without errors
  return !checkRender().errors;
}

/** Photo format (default, fastest): real photos of the object (Wikimedia Commons / Pixabay), picked and marked up
 *  by Claude looking at them, animated with a camera that glides between named points plus highlights on top. */
const PROMPT_PHOTO = `Write a storyboard for a 30-40 second vertical explainer Short about:
"${topic}"

It must beat the top "How X Works" Shorts: a REAL PHOTO of the object (or of where it's used) is on screen the
whole time, the camera glides to the exact part being talked about, and highlights (rings, labels, ripples, glowing
particles flowing between parts) show the mechanism, something changing every 1.5-2 seconds. The first second is a
curiosity hook over the object. Explain ONE surprising mechanism step by step, then a satisfying payoff line.

Reply with ONLY a JSON object, no markdown fences, no commentary:
{
  "title": "short video title, max 28 characters",
  "kicker": "series label, max 22 characters, e.g. TECH EXPLAINED",
${SOCIAL_FIELDS}
  "scenes": [ ... 5 or 6 scenes ... ]
}

Every scene has:
  "type": ${ARDUINO ? '"photo", "board" or "outro"' : '"photo" or "outro" (only the last scene is outro)'}
  "lines": narration, 1-2 sentences per scene, each max 14 words. Objects {"text": "...", "say": "..."}:
           "text" is the subtitle; wrap 1-2 key words in *stars*. "say" (optional): how to pronounce it, with numbers,
           units, symbols and acronyms spelled out in words.
  "headline": 2-6 words on screen above the photo (scene 1: the hook as a question, may use *stars*;
              last scene: the payoff in 2-4 words)
  "visual": background mood, one of circuit, network, waves, orbit, grid, particles, bars, radar
photo scenes also have:
  "image": 2-5 word search for a real PHOTO that clearly shows this scene's subject, as named on photo sites
           (e.g. "HC-SR04 ultrasonic sensor", "LDR photoresistor", "street light night"). Prefer close-up photos of
           the actual component/module for explaining parts; a photo of where it's used for the hook or payoff.
  "alt": a second, more generic search to try if the first finds nothing
  "points": 1-4 names of things that must be visible in that photo for the animation (e.g. "lens", "pins",
            "sensor window", "chip"), lowercase-with-dashes
  "anims": 2-5 cues in time order, at least one per narration line:
           {"effect": focus | label | glow | waves | flow | pulse | arrow, "target": a point ("all" with focus =
            the whole photo), "line": narration line index (0 or 1), "at": 0..1 within it,
            focus: "zoom" (1.3-2.4); label: "text" (1-2 words); flow: "path" = the point the particles travel to}
           focus = camera zooms to the point; glow = a highlight ring; waves = ripples from the point (sound, light,
           radio); flow = glowing particles travel from target to path (signal, light, current, heat)
${ARDUINO ? `board:   shows a real Arduino Uno board. "focus": parts it names in order (0-4 of: ${Object.keys(PARTS).join(', ')});
         "demo" (optional): "upload" or "blink". Use 1-2 board scenes.
` : ''}Rules: 80-110 words of narration in total. Scene 1 hooks within its first line. Every claim must be accurate.
The narration must describe exactly what the photo and highlights show at that moment. Plain, vivid, conversational English.`;

const PHOTOS = join(appDir, 'public', 'auto', 'photos');
const WIKI_UA = 'EchoLab3D-video-maker/1.0 (personal YouTube explainer channel)';
const CREDITS: string[] = [];

interface Candidate {
  file: string;
  credit?: string;
}

/** Up to `n` candidate photos for a search: Wikimedia Commons (great for components) then Pixabay. */
async function findPhotos(q: string, dir: string, n = 5): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const save = async (url: string, credit?: string) => {
    const res = await fetch(url, { headers: { 'User-Agent': WIKI_UA } });
    if (!res.ok) return;
    const file = join(dir, `c${out.length + 1}.jpg`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    out.push({ file, credit });
  };
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8` +
      `&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280`;
    const j = (await (await fetch(u, { headers: { 'User-Agent': WIKI_UA } })).json()) as { query?: { pages?: Record<string, any> } };
    const pages = Object.values(j.query?.pages ?? {}).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));
    for (const p of pages) {
      if (out.length >= Math.ceil(n / 2)) break;
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || !/jpeg|png/.test(ii.mime ?? '') || (ii.width ?? 0) < 600) continue;
      const meta = ii.extmetadata ?? {};
      const artist = String(meta.Artist?.value ?? 'unknown').replace(/<[^>]+>/g, '').trim().slice(0, 60);
      const lic = String(meta.LicenseShortName?.value ?? 'CC').trim();
      await save(ii.thumburl, `${artist} / Wikimedia Commons (${lic})`);
    }
  } catch (e) {
    console.warn(`  wikimedia: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const key = pixabayKey();
    const u = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q.slice(0, 100))}&image_type=photo&per_page=12&safesearch=true`;
    const hits = ((await (await fetch(u)).json()) as { hits?: { largeImageURL: string; tags: string }[] }).hits ?? [];
    for (const h of hits) {
      if (out.length >= n) break;
      await save(h.largeImageURL);
    }
  } catch (e) {
    console.warn(`  pixabay: ${e instanceof Error ? e.message : e}`);
  }
  return out;
}

/** Claude looks at the candidates, picks the one that shows the scene best, and locates the named points in it. */
async function pickPhoto(s: StoryScene, cands: Candidate[], points: string[], narration: string) {
  const cli = Bun.which('claude')!;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && !k.startsWith('CLAUDE_CODE_USE_')),
  ) as Record<string, string>;
  const prompt =
    `Read each of these candidate photos (image files): ${cands.map((c, i) => `${i + 1}: ${c.file}`).join(', ')}\n\n` +
    `They are for one scene of a vertical explainer video. Headline: "${s.headline ?? ''}". Narration: "${narration}".\n` +
    `The animation zooms to and highlights these points, so they must be clearly visible: ${points.join(', ') || '(none)'}.\n\n` +
    `Pick the single best photo: it must really show this subject (correct object, not a look-alike or drawing unless ` +
    `nothing else fits), sharp, well lit, no watermark, no big text. For each point give its position in THAT photo as ` +
    `[x, y] fractions of the width and height (0..1, from the top-left), pointing at the exact spot. Skip points you ` +
    `can't see. Reply with ONLY JSON: {"pick": photo number or null if none is usable, "points": {"name": [x, y]}}`;
  const proc = Bun.spawn([cli, '-p', '--output-format', 'text', '--allowedTools', 'Read', '--safe-mode'], {
    cwd: resolve(cands[0].file, '..'), env, stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe',
  });
  const timer = setTimeout(() => proc.kill(), 300_000);
  const out = await new Response(proc.stdout).text();
  clearTimeout(timer);
  await proc.exited;
  const j = parse(out);
  const pick = Number(j.pick);
  if (!pick || !cands[pick - 1]) return undefined;
  const pts: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries((j.points ?? {}) as Record<string, unknown>))
    if (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x)))) pts[k] = [clamp01(Number(v[0])), clamp01(Number(v[1]))];
  return { cand: cands[pick - 1], points: pts };
}
const clamp01 = (x: number) => Math.max(0.02, Math.min(0.98, x));

/** Finds, picks and marks up the photo for one scene; scenes without a usable photo become text scenes. */
/** each scene's chosen photo, so scenes about abstract steps can reuse a neighbour's photo */
const FOUND = new Map<string, Candidate>();

/** A scene whose own search found nothing reuses the nearest scene's photo, with its own points marked on it. */
async function borrowPhoto(s: StoryScene, q: { points: string[] }, scenes: StoryScene[], build: string) {
  const i = scenes.indexOf(s);
  const donors = scenes
    .filter((d) => FOUND.has(d.id))
    .sort((a, b) => Math.abs(scenes.indexOf(a) - i) - Math.abs(scenes.indexOf(b) - i));
  const narration = s.lines.map((id) => storyLines()[id]?.text ?? '').join(' ').replace(/\*/g, '');
  for (const d of donors.slice(0, 2)) {
    try {
      const got = await pickPhoto(s, [FOUND.get(d.id)!], q.points, narration);
      if (!got) continue;
      s.photo = { src: `/auto/photos/${d.id}.jpg?b=${build}`, points: got.points, credit: got.cand.credit };
      s.anims = (s.anims ?? []).filter((c) => c.target === 'all' || (got.points[c.target] && (c.effect !== 'flow' || got.points[c.path ?? ''])));
      console.log(`  ${s.id}: reusing ${d.id}'s photo -> ${Object.keys(got.points).length}/${q.points.length} points`);
      return;
    } catch (e) {
      console.warn(`  ${s.id}: reusing ${d.id}'s photo failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.warn(`  ${s.id}: no usable photo; showing it as a text scene`);
  s.type = 'fact';
  s.anims = undefined;
}

async function photoScene(s: StoryScene, q: { image: string; alt: string; points: string[] }, build: string): Promise<boolean> {
  const narration = s.lines.map((id) => storyLines()[id]?.text ?? '').join(' ').replace(/\*/g, '');
  for (const query of [q.image, q.alt, topic].filter(Boolean)) {
    const dir = join(CACHE, 'photos', s.id, query.replace(/[^a-z0-9]+/gi, '-').slice(0, 40));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const cands = await findPhotos(query, dir);
    if (!cands.length) continue;
    try {
      const got = await pickPhoto(s, cands, q.points, narration);
      if (!got) continue;
      mkdirSync(PHOTOS, { recursive: true });
      cpSync(got.cand.file, join(PHOTOS, `${s.id}.jpg`));
      s.photo = { src: `/auto/photos/${s.id}.jpg?b=${build}`, points: got.points, credit: got.cand.credit };
      // only cues whose points were found
      s.anims = (s.anims ?? []).filter((c) => c.target === 'all' || (got.points[c.target] && (c.effect !== 'flow' || got.points[c.path ?? ''])));
      if (got.cand.credit) CREDITS.push(got.cand.credit);
      FOUND.set(s.id, got.cand);
      console.log(`  ${s.id}: "${query}" -> ${Object.keys(got.points).length}/${q.points.length} points${got.cand.credit ? ` (${got.cand.credit})` : ''}`);
      return true;
    } catch (e) {
      console.warn(`  ${s.id}: picking failed for "${query}": ${e instanceof Error ? e.message : e}`);
    }
  }
  console.warn(`  ${s.id}: no photo found for its own search`);
  return false;
}

const storyLines = () => story!.lines;
const PHOTO_Q = new Map<string, { image: string; alt: string; points: string[] }>();
const BUILD = Date.now().toString(36);

/** Simulation format (default): one live instrument-panel simulation of the mechanism for the whole video, in the
 *  style of the "Inside Electronics" servo Short the user picked as the reference. */
const PROMPT_SIM = `Write the script for a 30-40 second vertical explainer Short about:
"${topic}"

Style reference (copy it): "How Does a Servo Know Where to Turn?" by Inside Electronics. ONE clean instrument-panel
simulation of the mechanism stays on screen the whole time (schematic parts, live readouts like SHOULD BE / IS /
ERROR, a timeline of the input signal), and the narration walks through it step by step with concrete numbers. It
uses devices like "freeze time", "slow it down x20", "press play", "push it and watch it fight back". Its script:
"How does a servo know where to turn? It never sees an angle. It sees a pulse. Every 20 milliseconds, 50 times a
second, a pulse arrives. Its width is the target. One millisecond means zero degrees. ... A circuit compares where
it should be and where it is. The difference is the error. ... That's a closed feedback loop. Do you know how PID
controls the servo's angle?"

Reply with ONLY a JSON object, no markdown fences, no commentary:
{
  "title": "short video title, max 28 characters",
  "kicker": "series label, max 22 characters, e.g. INSIDE ELECTRONICS",
${SOCIAL_FIELDS}
  "stage": "a precise brief for the simulation: which schematic parts are on the panel and where (top strip: the input
            signal/timeline; main panel: the mechanism), which live readouts exist and how they are computed, the
            real numbers and formulas involved, and the colour meaning (target orange, actual teal, error red)",
  "scenes": [
    { "type": "sim", "headline": "the hook question, 4-9 words",
      "lines": [ 8-11 objects {"text": "...", "say": "...", "event": "what the simulation does during this line"} ] },
    { "type": "outro", "headline": "2-4 word payoff", "lines": [ {"text": "a question that invites comments, about the
      next level of this topic"} ] }
  ]
}

Narration rules: 70-95 words in total (the video must stay UNDER 40 seconds: our data shows 44 s videos get
10x the views of 65 s ones), each line max 10 words, short punchy sentences. "text" is the subtitle (wrap 1 key word
in *stars*); "say" (optional) spells out numbers, units, symbols and acronyms for the voice.
Line 1 is a MYTH-BUST hook that stops the scroll, a bold surprising claim about something the viewer uses daily
("It can't see you." / "Your phone never sees your finger."), not a slow question; line 2 names the real mechanism in
plain words. Keep it for a general audience: at most 2 numbers in the whole script, no jargon without an everyday
comparison. The last line is a punchy one-line payoff plus a comment question. Every claim must be accurate. Each "event" says exactly what
moves or changes on screen during that line (values, needles, signals, freeze/slow-mo/play), consistent with the
numbers in the narration.`;

const SIM_FILE = join(SCENES, 'sim.gen.js');
/** each sim line's planned on-screen event */
const SIM_EVENTS = new Map<string, string>();

function simPlan(s: StoryScene) {
  return s.lines.map((id, i) => `${i}: "${storyLines()[id]?.text.replace(/\*/g, '')}" -> ${SIM_EVENTS.get(id) || '(continue)'}`).join('\n');
}

/** Asks Claude to write (or fix) the simulation's draw function. */
async function writeSim(stage: string, plan: string, fix?: { code: string; problems: string }) {
  const rules = readFileSync(join(appDir, 'scripts', 'sim-prompt.md'), 'utf8');
  const ask =
    `${rules}\n\nThe stage: ${stage}\n\nNarration and event plan (line index: text -> what the simulation does then):\n${plan}\n` +
    (fix ? `\nYour previous version had these problems; fix ALL of them and return the full corrected module:\n${fix.problems}\n\nPrevious version:\n${fix.code}\n` : '');
  const system = 'You are an expert canvas-2D motion designer and engineer. You output a single JavaScript module and nothing else.';
  // it may look at the reference frames (scripts/style-ref*.png), so it runs in that folder with the Read tool
  const opts = { cwd: join(appDir, 'scripts'), tools: ['Read'] };
  const out = await claudeAsync(ask, system, 1_500_000, opts).catch((e) => {
    console.warn(`  simulation writing failed (${e instanceof Error ? e.message : e}); retrying`);
    return claudeAsync(ask, system, 1_500_000, opts);
  });
  const m = out.match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
  const code = (m ? m[1] : out).trim();
  if (!/export\s+default\s+function/.test(code)) throw new Error('simulation reply has no default export');
  writeFileSync(SIM_FILE, `${code}\n`);
  return code;
}

/** Renders stills through the simulation; returns errors, image paths, and what's being said at each. */
function checkSim(s: StoryScene) {
  const dir = join(CACHE, 'sim-check');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fracs = [0.05, 0.3, 0.55, 0.8];
  const r = spawnSync('bun', ['scripts/render.ts', 'stills', '--video', 'auto', '--t', fracs.map((f) => `${s.id}@${f}`).join(','), '--out', dir], { cwd: appDir, encoding: 'utf8' });
  const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const errors = log.split('\n').filter((l) => /page error|\[page\]|sim\.gen\.js failed|Error/i.test(l)).join('\n');
  const images = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f)) : [];
  // which line is spoken at each still: the same layout as beats() with the provisional per-word timing
  const starts: number[] = [];
  let at = TIMING.lead;
  for (const id of s.lines) {
    starts.push(at);
    at += (storyLines()[id]?.text ?? '').split(/\s+/).length * 0.34 + TIMING.gap;
  }
  const said = fracs.map((f) => {
    const t = f * s.length;
    let i = 0;
    starts.forEach((st, k) => {
      if (t >= st) i = k;
    });
    return `line ${i}: "${(storyLines()[s.lines[i]]?.text ?? '').replace(/\*/g, '')}"`;
  });
  return { errors: r.status ? errors || log.slice(-800) : errors, images, said };
}

async function reviewSim(images: string[], said: string[], stage: string): Promise<string> {
  const cli = Bun.which('claude')!;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && !k.startsWith('CLAUDE_CODE_USE_')),
  ) as Record<string, string>;
  const prompt =
    `Read these frames of a narrated simulation Short, in time order: ${images.map((f, i) => `${f} (while saying ${said[i]})`).join('; ')}\n\n` +
    `The simulation should show: ${stage}\n\nJudge it fairly, like a viewer of the "Inside Electronics" style: ok = true when it ` +
    `is a clean, readable instrument-panel diagram whose parts are recognisable, the numbers/needles/signals are ` +
    `plausible and match what is being said in each frame, and nothing is broken. Only report problems a viewer would ` +
    `notice: overlapping or clipped text, text too small to read on a phone (labels should be ~32-40 px, values ~84-110 px ` +
    `on this 1080-wide frame), parts drawn small with big empty areas (parts should fill the panel), values that contradict the ` +
    `narration, a part that doesn't look like what it is, nothing happening. Reply with ONLY JSON: {"ok": true|false, ` +
    `"problems": "numbered list of concrete fixes for the drawing code, or empty if ok"}`;
  const proc = Bun.spawn([cli, '-p', '--output-format', 'text', '--allowedTools', 'Read', '--safe-mode'], {
    cwd: resolve(images[0], '..'), env, stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe',
  });
  const timer = setTimeout(() => proc.kill(), 300_000);
  const out = await new Response(proc.stdout).text();
  clearTimeout(timer);
  await proc.exited;
  try {
    const j = parse(out);
    return j.ok ? '' : String(j.problems || 'needs polish');
  } catch {
    return '';
  }
}

/** Writes the simulation, then up to 3 rounds of render -> fix errors / visual review -> rewrite. */
async function buildSim(s: StoryScene, stage: string) {
  const plan = simPlan(s);
  let code = await writeSim(stage, plan);
  for (let round = 1; round <= 3; round++) {
    const { errors, images, said } = checkSim(s);
    let problems = errors ? `It crashed or logged errors when rendering:\n${errors}` : '';
    if (!problems && images.length) problems = await reviewSim(images, said, stage);
    if (!problems) {
      console.log(`  simulation approved (round ${round})`);
      return true;
    }
    console.log(`  round ${round}: ${problems.split('\n')[0].slice(0, 140)}`);
    if (round === 3) break;
    try {
      code = await writeSim(stage, plan, { code, problems });
    } catch (e) {
      console.warn(`  fix round failed (${e instanceof Error ? e.message : e}); keeping the previous version`);
      writeFileSync(SIM_FILE, `${code}\n`);
      break;
    }
  }
  return !checkSim(s).errors;
}

/** AI format: the classic layouts, each scene with a cinematic clip prompt for the video model */
const PROMPT_AI = `${CLASSIC_PROMPT}

Every scene ALSO has "clip": a prompt for an AI text-to-video model that makes this scene's 3-8 second vertical
background clip: one concrete, filmable, photorealistic shot (subject, action, camera move, lighting, lens), e.g.
"Cinematic macro close-up of a finger touching a glowing smartphone screen, slow push in, shallow depth of field,
dark studio". Real-world scenes only: no text, logos, diagrams, UI with readable words, or detailed circuit internals.`;

const PROMPT = AI ? PROMPT_AI : CLASSIC ? CLASSIC_PROMPT : FLAT ? FLAT_PROMPT : MODEL3D ? PROMPT_3D : PHOTO_FMT ? PROMPT_PHOTO : PROMPT_SIM;

function claude(prompt: string): string {
  const cli = Bun.which('claude');
  if (!cli) throw new Error('claude CLI not found: install Claude Code and log in');
  // use the subscription login, not stray API settings
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('ANTHROPIC_') && !k.startsWith('CLAUDE_CODE_USE_')),
  );
  const r = spawnSync(
    cli,
    ['-p', '--output-format', 'text', '--tools', '', '--safe-mode', '--system-prompt', 'You write video storyboards as strict JSON.'],
    { input: prompt, cwd: tmpdir(), env, encoding: 'utf8', timeout: 300_000, maxBuffer: 16 << 20 },
  );
  if (r.status !== 0) throw new Error(`claude failed: ${(r.stderr || r.stdout || '').slice(0, 400)}`);
  return r.stdout;
}

/** each diagram scene's drawing brief and part ids */
const DRAWS = new Map<string, { brief: string; parts: string[] }>();

/** each scene's AI clip prompt (--ai) */
const CLIPS = new Map<string, string>();

/** each scene's footage searches, most specific first */
const SEARCHES = new Map<string, string[]>();

type RawLine = string | { text?: string; say?: string };
type Raw = Record<string, any>;

const str = (x: unknown, max = 200) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const strs = (x: unknown, n: number, max = 60) => (Array.isArray(x) ? x.map((s) => str(s, max)).filter(Boolean).slice(0, n) : []);

function parse(text: string): Raw {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON in reply');
  return JSON.parse(text.slice(a, b + 1));
}

/** Cleans the model's storyboard; anything malformed becomes a plain fact scene or is dropped. */
function normalize(raw: Raw) {
  const lines: Record<string, { text: string; say?: string }> = {};
  const scenes: StoryScene[] = [];
  for (const r of (raw.scenes ?? []) as Raw[]) {
    const id = `s${scenes.length + 1}`;
    const ls = ((r.lines ?? []) as RawLine[])
      .map((l) => (typeof l === 'string' ? { text: l } : { text: str(l?.text, 300), say: str(l?.say, 400) || undefined }))
      .filter((l) => l.text);
    if (!ls.length) continue;
    let type: SceneType = TYPES.includes(r.type) ? r.type : 'fact';
    const searches = (Array.isArray(r.search) ? strs(r.search, 4, 40) : [str(r.search, 40)]).filter(Boolean);
    const visual = VISUALS.includes(r.visual) ? r.visual : VISUALS[scenes.length % VISUALS.length];
    const s: StoryScene = { id, type, lines: [], visual, search: searches[0] || topic, length: 0, frames: 0 };
    SEARCHES.set(id, searches);
    if (str(r.clip)) CLIPS.set(id, str(r.clip, 500));
    s.headline = str(r.headline, 90) || undefined;
    s.heading = str(r.heading, 60) || undefined;
    s.label = str(r.label, 90) || undefined;
    if (type === 'stat') {
      // an unattributed number is likely made up: show it as a plain fact instead
      const v = Number(r.value);
      if (Number.isFinite(v) && str(r.source)) Object.assign(s, { value: v, prefix: str(r.prefix, 4), suffix: str(r.suffix, 8), source: str(r.source, 60) });
      else {
        type = 'fact';
        s.headline ??= s.label;
        s.label = undefined;
      }
    }
    if (type === 'list' || type === 'steps') {
      s.items = strs(r.items, 4, 40);
      if (s.items.length < 2) type = 'fact';
    }
    if (type === 'compare') {
      const side = (x: Raw) => (x && str(x.title) ? { title: str(x.title, 24), points: strs(x.points, 3, 50) } : undefined);
      s.left = side(r.left);
      s.right = side(r.right);
      if (!s.left || !s.right) type = 'fact';
    }
    if (type === 'diagram' || type === 'model' || type === 'photo') {
      const parts = strs(r.parts, 9, 40).map((p) => p.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
      const effects = ['pop', 'pulse', 'glow', 'move', 'rotate', 'spin', 'shake', 'fade', 'flow', 'waves', 'focus', 'label', 'explode', 'arrow'];
      const num = (x: unknown, lo: number, hi: number, def: number) => Math.max(lo, Math.min(hi, Number(x) || def));
      s.anims = ((r.anims ?? []) as Raw[])
        .filter((a) => effects.includes(a?.effect) && typeof a.target === 'string')
        .slice(0, 8)
        .map((a) => ({
          effect: a.effect, target: String(a.target), line: num(a.line, 0, ls.length - 1, 0), at: num(a.at, 0, 1, 0),
          ...(a.dur ? { dur: num(a.dur, 0.2, 4, 1) } : {}),
          ...(a.dx != null ? { dx: num(a.dx, -300, 300, 0) } : {}),
          ...(a.dy != null ? { dy: num(a.dy, -300, 300, 0) } : {}),
          ...(a.dz != null ? { dz: num(a.dz, -300, 300, 0) } : {}),
          ...(['x', 'y', 'z'].includes(a.axis) ? { axis: a.axis } : {}),
          ...(a.amount != null ? { amount: num(a.amount, 0.2, 2, 1) } : {}),
          ...(a.deg != null ? { deg: Number(a.deg) || 0 } : {}),
          ...(a.zoom != null ? { zoom: num(a.zoom, 1, 2.4, 1.5) } : {}),
          ...(a.path ? { path: String(a.path) } : {}),
          ...(a.text ? { text: str(a.text, 18) } : {}),
        }));
      if (type === 'photo') {
        PHOTO_Q.set(id, { image: str(r.image, 60), alt: str(r.alt, 60), points: strs(r.points, 4, 30).map((x) => x.toLowerCase().replace(/[^a-z0-9-]/g, '-')) });
        if (!PHOTO_Q.get(id)!.image) type = 'fact';
      } else if (type === 'diagram') {
        DRAWS.set(id, { brief: str(r.draw, 1500), parts });
        if (!DRAWS.get(id)!.brief || !parts.length) type = 'fact';
      } else {
        const v = (r.view ?? {}) as Raw;
        s.view = { azimuth: num(v.azimuth, -180, 180, 25), elevation: num(v.elevation, -10, 60, 14), distance: num(v.distance, 0.8, 1.3, 1) };
      }
    }
    if (type === 'board') {
      s.focus = strs(r.focus, 4, 20).filter((id) => PARTS[id]);
      s.demo = r.demo === 'upload' || r.demo === 'blink' ? r.demo : undefined;
      if (!s.focus.length && !s.demo) type = 'fact';
    }
    if (type === 'quote') {
      s.quote = str(r.quote, 220);
      s.author = str(r.author, 50) || undefined;
      if (!s.quote) type = 'fact';
    }
    s.type = type;
    // a scene with no on-screen text shows the first narration line as its headline
    if (!s.headline && ['hook', 'title', 'fact', 'outro', 'diagram'].includes(type)) s.headline = ls[0].text.split(/[.!?]/)[0].slice(0, 60);
    const events = ((r.lines ?? []) as RawLine[]).map((l) => (typeof l === 'object' ? str((l as Raw)?.event, 300) : ''));
    ls.forEach((l, k) => {
      const lid = `${id}-${k + 1}`;
      if (events[k]) SIM_EVENTS.set(lid, events[k]);
      lines[lid] = l;
      s.lines.push(lid);
    });
    scenes.push(s);
  }
  // a simulation is one continuous scene (plus the ending); the other formats need several
  if (scenes.length < (SIM ? 1 : 3) || (SIM && !scenes.some((x) => x.type === 'sim'))) throw new Error('storyboard has too few usable scenes');
  const footage = strs(raw.footage, 4, 40);
  const yt = (raw.youtube ?? {}) as Raw;
  const youtube = { title: str(yt.title, 100), description: str(yt.description, 4800), tags: strs(yt.tags, 20, 60) };
  const so = (raw.social ?? {}) as Raw;
  const social = { instagram: str(so.instagram, 2200), tiktok: str(so.tiktok, 2200) };
  const mo = (raw.model ?? {}) as Raw;
  const model = { brief: str(mo.brief, 2500), parts: strs(mo.parts, 10, 40), paths: strs(mo.paths, 3, 40) };
  return { title: str(raw.title, 40) || topic, kicker: str(raw.kicker, 26) || 'EXPLAINED', scenes, lines, footage, youtube, social, bible: str(raw.bible, 800), model, stage: str(raw.stage, 3000) };
}

// ---- 3. footage -------------------------------------------------------------------------------

function pixabayKey(): string {
  if (process.env.PIXABAY_API_KEY) return process.env.PIXABAY_API_KEY;
  const cfg = resolve(ROOT, '..', 'MoneyPrinterTurbo-main', 'config.toml');
  if (existsSync(cfg)) {
    const m = readFileSync(cfg, 'utf8').match(/^pixabay_api_keys\s*=\s*\[\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  throw new Error('no Pixabay key: set PIXABAY_API_KEY or add it in MoneyPrinterTurbo');
}

interface Hit {
  id: number;
  duration: number;
  tags: string;
  videos: Record<string, { url: string; width: number; height: number }>;
}

const used = new Set<number>();

async function findClip(key: string, terms: string[], reuse = false): Promise<{ id: number; url: string } | undefined> {
  for (const q of terms) {
    if (!q) continue;
    const u = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(q.slice(0, 100))}&per_page=30&safesearch=true`;
    const res = await fetch(u);
    if (!res.ok) {
      console.warn(`  pixabay ${res.status} for "${q}"`);
      continue;
    }
    const hits = ((await res.json()) as { hits: Hit[] }).hits ?? [];
    // smallest rendition that still covers a 1080x1920 crop (no 4K downloads), else the largest
    const pick = (h: Hit) => {
      const vs = ['medium', 'large', 'small'].map((k) => h.videos[k]).filter((v) => v?.url);
      return vs.find((v) => Math.min(v.width, v.height) >= 1080) ?? vs.sort((a, b) => b.width - a.width)[0];
    };
    // Pixabay's search is loose: only accept clips tagged with the search words, best match first,
    // and among equally good matches prefer portrait, which fills a vertical frame uncropped
    const want = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const score = (h: Hit) => {
      const tags = (h.tags ?? '').toLowerCase().split(/[,\s]+/).filter(Boolean);
      return want.filter((w) => tags.some((t) => t.startsWith(w) || (t.length > 3 && w.startsWith(t)))).length;
    };
    const top = hits
      .filter((h) => (reuse || !used.has(h.id)) && h.duration >= 3 && pick(h) && score(h) >= Math.min(2, want.length))
      .slice(0, 12)
      .sort((a, b) => score(b) - score(a));
    if (top.length) {
      const bestScore = score(top[0]);
      const best = top.find((h) => score(h) === bestScore && pick(h)!.height > pick(h)!.width) ?? top[0];
      used.add(best.id);
      console.log(`  "${q}" -> pixabay #${best.id} (${pick(best)!.width}x${pick(best)!.height})`);
      return { id: best.id, url: pick(best)!.url };
    }
  }
  return undefined;
}

async function download(id: number, url: string) {
  const file = join(CACHE, `pixabay-${id}.mp4`);
  if (existsSync(file)) return file;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function extract(clip: string, sceneId: string, length: number) {
  const dir = join(BROLL, sceneId);
  mkdirSync(dir, { recursive: true });
  run('ffmpeg', [
    '-y', '-loglevel', 'error', '-stream_loop', '-1', '-i', clip, '-t', (length + 0.2).toFixed(2), '-an',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
    '-q:v', '4', '-start_number', '0', join(dir, '%04d.jpg'),
  ]);
  return readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
}

// ---- main -------------------------------------------------------------------------------------

const MIN: Partial<Record<SceneType, number>> = { hook: 2.5, title: 2.5, stat: 3.6, compare: 5.5, outro: 3.2, quote: 3.5, board: 4, diagram: 2.4, model: 2.6, photo: 2.4 };

const t0 = performance.now();
step(`storyboard: "${topic}" (Claude Code)`);
let story: ReturnType<typeof normalize> | undefined;
for (let attempt = 1; attempt <= 2 && !story; attempt++) {
  try {
    story = normalize(parse(claude(PROMPT + (HINDI ? HINDI_NOTE : ''))));
  } catch (e) {
    console.warn(`  attempt ${attempt}: ${e instanceof Error ? e.message : e}`);
  }
}
if (!story) throw new Error('could not get a storyboard from Claude');
for (const s of story.scenes) console.log(`  ${s.id} ${s.type.padEnd(7)} ${s.headline ?? s.heading ?? s.quote ?? ''}`);

// every diagram scene is drawn at once (each is its own Claude call)
const toDraw = story.scenes.filter((s) => s.type === 'diagram');
if (toDraw.length) {
  step(`drawing ${toDraw.length} scenes (Claude Code)`);
  await Promise.all(toDraw.map((s) => drawScene(s, DRAWS.get(s.id)!.brief, DRAWS.get(s.id)!.parts, story!.bible)));
}

// the 3D model: written, rendered, looked at and fixed before anything else is made
if (story.scenes.some((s) => s.type === 'model')) {
  step('3D model (Claude Code builds it, renders it, reviews it)');
  if (!story.model.brief || !story.model.parts.length) throw new Error('storyboard has model scenes but no model brief');
  // a provisional storyboard and script so the model can be test-rendered in its scenes
  mkdirSync(SCENES, { recursive: true });
  rmSync(join(SCENES, 'voice.gen.json'), { force: true });
  for (const s of story.scenes) s.length = Math.max(MIN[s.type] ?? 2.5, 0.8 + s.lines.length * 2.6);
  writeFileSync(join(SCENES, 'voice.json'), JSON.stringify({ engine: 'kokoro', lines: story.lines }, null, 2));
  writeFileSync(join(SCENES, 'storyboard.json'), JSON.stringify({ topic, title: story.title, kicker: story.kicker, timing: TIMING, scenes: story.scenes }, null, 2));
  if (!(await buildModel(story.model))) throw new Error('could not build a working 3D model');
}

// real photos: found, picked and marked up for every photo scene at once
const toPhoto = story.scenes.filter((s) => s.type === 'photo');
if (toPhoto.length) {
  step(`photos for ${toPhoto.length} scenes (Wikimedia Commons / Pixabay, picked by Claude)`);
  rmSync(PHOTOS, { recursive: true, force: true });
  const found = await Promise.all(toPhoto.map((s) => photoScene(s, PHOTO_Q.get(s.id)!, BUILD)));
  const missing = toPhoto.filter((_, i) => !found[i]);
  await Promise.all(missing.map((s) => borrowPhoto(s, PHOTO_Q.get(s.id)!, toPhoto, BUILD)));
}

// the live simulation: written, rendered, looked at and fixed before the voice is made
const simScene = story.scenes.find((s) => s.type === 'sim');
if (simScene) {
  step('simulation (Claude Code writes it, renders it, reviews it)');
  mkdirSync(SCENES, { recursive: true });
  rmSync(join(SCENES, 'voice.gen.json'), { force: true });
  // provisional timing from word counts, the same estimate the narration layout uses until the voice exists
  for (const s of story.scenes)
    s.length = Math.max(MIN[s.type] ?? 2.5, TIMING.lead + s.lines.reduce((n, id) => n + story!.lines[id].text.split(/\s+/).length * 0.34 + TIMING.gap, 0) + TIMING.tail);
  writeFileSync(join(SCENES, 'voice.json'), JSON.stringify({ engine: 'kokoro', lines: story.lines }, null, 2));
  writeFileSync(join(SCENES, 'storyboard.json'), JSON.stringify({ topic, title: story.title, kicker: story.kicker, timing: TIMING, scenes: story.scenes }, null, 2));
  if (!(await buildSim(simScene, story.stage || topic))) throw new Error('could not build a working simulation');
}

step('voice (Kokoro)');
mkdirSync(SCENES, { recursive: true });
rmSync(VOICE, { recursive: true, force: true });
rmSync(join(SCENES, 'voice.gen.json'), { force: true });
const voiceCfg = {
  engine: 'kokoro',
  kokoro: HINDI
    ? { voice: opt('voice', 'hm_omega'), speed: Number(opt('speed', '1.1')), lang: 'hi' }
    : { voice: opt('voice', SIM ? 'am_michael' : 'af_heart'), speed: Number(opt('speed', CLASSIC ? '1.08' : '1.12')), lang: 'en-us' },
  lines: story.lines,
};
writeFileSync(join(SCENES, 'voice.json'), JSON.stringify(voiceCfg, null, 2) + '\n');
run('python', ['-m', 'uv', 'run', '--python', '3.12', '--with', 'kokoro-onnx', '--with', 'soundfile', 'python', 'analysis/tts.py', 'auto'], ROOT);
const durs: Record<string, number> = JSON.parse(readFileSync(join(SCENES, 'voice.gen.json'), 'utf8')).kokoro;

// scene lengths: the same layout as beats() in script.ts
for (const s of story.scenes) {
  const speech = s.lines.reduce((n, id) => n + (durs[id] ?? 2) + TIMING.gap, 0) - TIMING.gap;
  let min = MIN[s.type] ?? 2.5;
  if (s.type === 'list' || s.type === 'steps') min = 1.6 + (s.items?.length ?? 3) * 0.9;
  // a board scene needs time per part, plus about 3 s for a demo
  if (s.type === 'board') min = 1.6 + (s.focus?.length ?? 0) * 1.6 + (s.demo ? 3.4 : 0);
  s.length = Math.round(Math.max(min, TIMING.lead + speech + TIMING.tail) * 30) / 30;
}

rmSync(BROLL, { recursive: true, force: true });
if (STOCK) step('footage (Pixabay)');
else step(`backgrounds (motion graphics): ${story.scenes.map((s) => s.visual).join(', ')}`);
const key = STOCK ? pixabayKey() : '';
mkdirSync(CACHE, { recursive: true });
for (const s of STOCK ? story.scenes : []) {
  const terms = [...(SEARCHES.get(s.id) ?? []), ...story.footage];
  // a fresh clip if one matches; else one already used in another scene, rather than an off-topic one
  const clip = (await findClip(key, terms)) ?? (await findClip(key, terms, true));
  if (!clip) {
    console.warn(`  ${s.id}: no footage, using the grid background`);
    continue;
  }
  try {
    s.frames = extract(await download(clip.id, clip.url), s.id, s.length);
  } catch (e) {
    console.warn(`  ${s.id}: ${e instanceof Error ? e.message : e}`);
  }
}

// AI clips (--ai): every scene's background is generated from its clip prompt on Hugging Face's free GPUs
if (AI) {
  step('AI clips (LTX-Video on Hugging Face, free quota)');
  let quotaLeft = true;
  for (const s of story.scenes) {
    const prompt = CLIPS.get(s.id);
    if (!prompt || !quotaLeft) continue;
    const file = join(CACHE, `ai-${BUILD}-${s.id}.mp4`);
    const r = spawnSync('python', ['-m', 'uv', 'run', '--with', 'gradio_client', 'python', 'scripts/aiclip.py', file, String(Math.min(8, s.length)), prompt], { cwd: appDir, encoding: 'utf8' });
    if (r.status === 2) {
      console.warn('  free daily GPU quota used up: remaining scenes keep their motion-graphics backgrounds');
      quotaLeft = false;
      continue;
    }
    if (r.status !== 0 || !existsSync(file)) {
      console.warn(`  ${s.id}: clip failed (${(r.stdout || r.stderr || '').trim().slice(-200)})`);
      continue;
    }
    s.frames = extract(file, s.id, s.length);
    console.log(`  ${s.id}: clip ready (${s.frames} frames)`);
  }
}

const board: Storyboard & { build: string } = {
  topic,
  title: story.title,
  kicker: story.kicker,
  timing: TIMING,
  scenes: story.scenes,
  build: BUILD,
};
writeFileSync(join(SCENES, 'storyboard.json'), JSON.stringify(board, null, 2) + '\n');
const total = story.scenes.reduce((n, s) => n + s.length, 0);
console.log(`  ${story.scenes.length} scenes, ${total.toFixed(1)}s`);

step('sound');
run('bun', ['scripts/sound.ts', '--video', 'auto', '--no-mux']);

step('render');
const out = resolve(opt('out', join(outRoot, 'auto', `${slug(story.title)}.mp4`))!);
mkdirSync(resolve(out, '..'), { recursive: true });
run('bun', ['scripts/render.ts', 'video', '--video', 'auto', '--samples', opt('samples', '1')!, '--crf', '23', '--out', out]);
writeFileSync(out.replace(/\.mp4$/, '.txt'), `${story.title}\n\n${Object.values(story.lines).map((l) => l.text.replace(/\*/g, '')).join(' ')}\n`);

// keep everything this video was made from, so it can be re-rendered later (scripts/rerender.ts)
{
  const bundle = out.replace(/\.mp4$/, '.bundle');
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(bundle, { recursive: true });
  for (const f of ['storyboard.json', 'voice.json', 'voice.gen.json', 'model.gen.js', 'sim.gen.js'])
    if (existsSync(join(SCENES, f))) cpSync(join(SCENES, f), join(bundle, f));
  cpSync(VOICE, join(bundle, 'voice'), { recursive: true });
  cpSync(join(appDir, 'public', 'audio', 'auto.wav'), join(bundle, 'auto.wav'));
  if (existsSync(BROLL)) cpSync(BROLL, join(bundle, 'broll'), { recursive: true });
  if (existsSync(PHOTOS)) cpSync(PHOTOS, join(bundle, 'photos'), { recursive: true });
}

// YouTube metadata in channel/youtube.py's format, then (with --upload) the upload itself
step('youtube');
const spoken = Object.values(story.lines).map((l) => l.text.replace(/\*/g, '')).join(' ');
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const meta = {
  file: relative(ROOT, out).split('\\').join('/'),
  title: (story.youtube.title || `${story.title} #shorts`).slice(0, 100),
  description: (story.youtube.description || `${story.title}\n\n${spoken}\n\n#shorts`) +
    (CREDITS.length ? `\n\nPhotos: ${[...new Set(CREDITS)].join('; ')}` : ''),
  tags: story.youtube.tags.length ? story.youtube.tags : [topic.toLowerCase(), 'shorts', 'explained'],
  categoryId: '28',
  language: HINDI ? 'hi' : 'en',
  privacy: 'private',
  playlist: { title: `${titleCase(story.kicker)}: Shorts`, description: 'Quick animated explainers.' },
  // Instagram cover: a frame of the hook, whose big words read best in the grid
  coverMs: Math.round(Math.min(1.5, story.scenes[0].length * 0.6) * 1000),
  ...(story.social.instagram || story.social.tiktok ? { social: story.social } : {}),
};
const metaFile = join(ROOT, 'channel', 'videos', `auto-${slug(story.title)}.json`);
mkdirSync(resolve(metaFile, '..'), { recursive: true });
writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
console.log(`  ${meta.title}\n  metadata: ${relative(ROOT, metaFile)}`);
if (UPLOAD) run('python', ['-m', 'uv', 'run', '--with', 'google-api-python-client', '--with', 'google-auth-oauthlib', 'python', 'channel/youtube.py', 'upload', relative(ROOT, metaFile)], ROOT);

console.log(`\nDONE in ${((performance.now() - t0) / 60000).toFixed(1)} min -> ${out}`);
