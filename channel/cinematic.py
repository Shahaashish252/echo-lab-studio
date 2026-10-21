"""Cinematic format (2026-10-21), modelled on the viral reference Reels (speedy_devv, uniquenexus, scroll.engineer):
a new photorealistic close-up shot every 2-4 s (free FLUX images from Cloudflare Workers AI, slow camera moves),
word-by-word captions at the top with the spoken word highlighted, a real-life myth-bust hook, a practical tip and
a comment question. Much cheaper in Claude than the simulation format: one script call, no code writing.

    python channel/cinematic.py "topic (open with this hook: ...)" [--lang hi|en] [--upload]

Prints "== step" lines (the dashboard turns them into the progress bar).
"""
import base64
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

W, H, FPS = 1080, 1920, 30
WORK = ROOT / "out" / "cine"
FONT_BIG = str(HERE / "fonts" / "Anton-Regular.ttf")
FONT_UI = str(HERE / "fonts" / "ArchivoBlack-Regular.ttf")
ACCENT = (255, 196, 0)
SHOT_STYLE = ("cinematic photorealistic close-up, dramatic moody studio lighting, dark background, subtle glowing "
              "cyan and orange light accents, shallow depth of field, ultra detailed, 35mm film look, no text, no "
              "letters, no logos, no watermark")


def step(s: str):
    print(f"\n== {s}", flush=True)


def secret(name: str) -> str:
    v = os.environ.get(name, "")
    if not v and os.name == "nt":  # saved by connect-cloudflare-images.bat into the Windows user settings
        v = subprocess.run(["powershell", "-NoProfile", "-Command", f"[Environment]::GetEnvironmentVariable('{name}','User')"],
                           capture_output=True, text=True).stdout.strip()
    return v


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:50] or "video"


# ---- 1. script --------------------------------------------------------------------------------------

def write_script(topic: str, lang: str) -> dict:
    import manager
    hindi = lang == "hi"
    prompt = f"""Write the script for a viral vertical explainer Reel/Short (about 45-60 seconds) on: "{topic}"

It must feel like the most viral tech-explainer Reels: a real-life hook, then the camera "zooms" from the everyday
object into its hidden inside, one new photorealistic shot every line, ending with a practical tip and a question.

Reply with ONLY a JSON object, no markdown:
{{
  "title": "short English title for the file name, max 28 characters",
  "hook": "the big words on screen for the first 2 seconds: 3-6 words in {'Roman Hinglish (e.g. Yeh sensor DEKHTA nahi!)' if hindi else 'English'}, wrap the ONE key word in *stars*",
  "lines": [ 16-20 objects {{
      "say": "{'what the narrator says: natural spoken Hindi in Devanagari, English tech words written as pronounced in Devanagari' if hindi else 'what the narrator says, English'}, max 9 words",
      "caption": "{'the same sentence in Roman Hinglish (Latin letters), as Indian creators write captions' if hindi else 'the same sentence'}",
      "key": "the one most important word of caption (copied exactly from caption)",
      "shot": "an English prompt for ONE photorealistic still image for this line: concrete subject, angle, close-up/macro, what glows. Real objects only (phone, finger, chip, wire, room, person's hand...). No text, diagrams or UI in the image."
  }} ],
  "outro": "2-4 word payoff on screen at the end, {'Roman Hinglish' if hindi else 'English'}, ALL CAPS",
  "youtube": {{"title": "{'Hinglish' if hindi else 'English'} Shorts title, max 70 chars, curiosity, one emoji, ends with #shorts",
               "description": "2 lines of hook + 3-4 lines with emojis on what it shows + subscribe line + 6-8 hashtags incl. #shorts",
               "tags": ["10-15 search phrases people type"]}},
  "social": {{"instagram": "Reel caption: scroll-stopping first line with one emoji, 3-4 short lines, a comment question, then exactly 5 hashtags"}}
}}

Rules:
- Line 1 is a MYTH-BUST about something the viewer uses daily ("Aapka phone aapki ungli nahi dekhta!"), not a slow question.
- Shots tell a visual story: start with the everyday scene (a person using the thing), then move closer and closer
  inside it (macro of the part, then the tiny mechanism glowing), then back out to everyday life for the tip.
- Each line is one idea, max 9 words. At most 3 numbers in the whole script. Plain words for a general audience.
- Near the end: one practical, useful tip about using the thing. The last line is a question that invites comments.
- Every claim must be accurate."""
    for attempt in range(2):
        try:
            data = manager.ai_json(prompt, model="sonnet")
            lines = [l for l in data.get("lines", []) if l.get("say") and l.get("shot")]
            if len(lines) >= 8:
                data["lines"] = lines[:22]
                return data
        except Exception as e:  # noqa: BLE001
            print(f"  script attempt {attempt + 1} failed: {e}")
    raise RuntimeError("could not get a script")


# ---- 2. images (Cloudflare Workers AI, FLUX.1 schnell, free daily quota) ---------------------------------

def make_image(prompt: str, path: Path, seed: int):
    acc, tok = secret("CF_ACCOUNT_ID"), secret("CF_API_TOKEN")
    if not (acc and tok):
        raise RuntimeError("Cloudflare is not connected (CF_ACCOUNT_ID / CF_API_TOKEN missing)")
    url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/@cf/black-forest-labs/flux-1-schnell"
    last = ""
    for attempt in range(4):
        try:
            r = requests.post(url, headers={"Authorization": f"Bearer {tok}"},
                              json={"prompt": f"{prompt}. {SHOT_STYLE}", "steps": 8}, timeout=120)
            j = r.json()
            if j.get("success"):
                path.write_bytes(base64.b64decode(j["result"]["image"]))
                return
            last = str(j.get("errors"))[:200]
        except Exception as e:  # noqa: BLE001
            last = str(e)[:200]
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"image failed: {last}")


# ---- 3. voice (Kokoro, the same engine as the other formats) -------------------------------------------

def make_voice(lines: list, lang: str) -> list:
    scene = ROOT / "app" / "src" / "scenes" / "cine"
    scene.mkdir(parents=True, exist_ok=True)
    cfg = {"engine": "kokoro",
           "kokoro": {"voice": "hm_omega", "speed": 1.1, "lang": "hi"} if lang == "hi" else {"voice": "am_michael", "speed": 1.1, "lang": "en-us"},
           "lines": {f"l{i:02d}": {"text": l["say"]} for i, l in enumerate(lines)}}
    (scene / "voice.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    r = subprocess.run([sys.executable, "-m", "uv", "run", "--python", "3.12", "--with", "kokoro-onnx", "--with", "soundfile",
                        "python", "analysis/tts.py", "cine"], cwd=ROOT)
    if r.returncode:
        raise RuntimeError("voice failed")
    gen = json.loads((scene / "voice.gen.json").read_text(encoding="utf-8"))["kokoro"]
    vdir = ROOT / "app" / "public" / "voice" / "cine" / "kokoro"
    return [(vdir / f"l{i:02d}.wav", gen[f"l{i:02d}"]) for i in range(len(lines))]


# ---- 4. captions (transparent PNG states, one per spoken word) ---------------------------------------

def wrap(draw, words, font, maxw):
    rows, cur = [], []
    for w in words:
        if cur and draw.textlength(" ".join(cur + [w]), font=font) > maxw:
            rows.append(cur)
            cur = [w]
        else:
            cur.append(w)
    return rows + ([cur] if cur else [])


def caption_png(words: list, active: int, path: Path, size=86):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_BIG, size)
    rows = wrap(d, words, font, W - 140)
    y = 300
    idx = 0
    for row in rows:
        widths = [d.textlength(w, font=font) for w in row]
        gap = d.textlength(" ", font=font)
        x = (W - (sum(widths) + gap * (len(row) - 1))) / 2
        for w, wd in zip(row, widths):
            if idx == active:
                bx = d.textbbox((x, y), w, font=font)  # fit the highlight box to the word's real ink
                d.rounded_rectangle((bx[0] - 16, bx[1] - 12, bx[2] + 16, bx[3] + 12), radius=12, fill=ACCENT + (255,))
                d.text((x, y), w, font=font, fill=(15, 15, 15))
            else:
                d.text((x, y), w, font=font, fill=(255, 255, 255, 255 if idx < active else 215),
                       stroke_width=6, stroke_fill=(0, 0, 0, 230))
            x += wd + gap
            idx += 1
        y += size * 1.25
    img.save(path)


def big_text_png(text: str, path: Path, sub: str | None = None):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shade = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for yy in range(H):
        dd = abs(yy - 760) / 700
        sd.line([(0, yy), (W, yy)], fill=int(150 * max(0.0, 1 - dd * dd)))
    img.paste((0, 0, 0, 255), (0, 0, W, H), shade)
    d = ImageDraw.Draw(img)
    words = text.split()
    size = 150
    while size > 80:
        font = ImageFont.truetype(FONT_BIG, size)
        rows = wrap(d, [w.replace("*", "") for w in words], font, W - 120)
        if len(rows) <= 3:
            break
        size -= 10
    keys = {w.replace("*", "").upper() for w in words if "*" in w}  # *word* or *word*? marks the highlighted word
    y = 760 - len(rows) * size * 1.1 / 2
    for row in rows:
        widths = [d.textlength(w, font=font) for w in row]
        gap = d.textlength(" ", font=font)
        x = (W - (sum(widths) + gap * (len(row) - 1))) / 2
        for w, wd in zip(row, widths):
            d.text((x, y), w, font=font, fill=ACCENT if w.upper() in keys else (255, 255, 255),
                   stroke_width=8, stroke_fill=(0, 0, 0))
            x += wd + gap
        y += size * 1.1
    if sub:
        f2 = ImageFont.truetype(FONT_UI, 46)
        tw = d.textlength(sub, font=f2)
        d.rounded_rectangle(((W - tw) / 2 - 40, y + 50, (W + tw) / 2 + 40, y + 140), radius=45, fill=(255, 77, 46, 255))
        d.text(((W - tw) / 2, y + 66), sub, font=f2, fill=(255, 255, 255))
    img.save(path)


# ---- 5. render ----------------------------------------------------------------------------------------

def run(cmd: list):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"{cmd[0]} failed: {r.stderr[-400:]}")


def shot_clip(img: Path, dur: float, out: Path, i: int):
    frames = max(2, round(dur * FPS))
    move = i % 4  # vary the camera: push in, pull out, pan left, pan right
    z = {0: "1+0.0016*on", 1: "1.22-0.0016*on", 2: "1.15", 3: "1.15"}[move]
    x = {0: "iw/2-(iw/zoom/2)", 1: "iw/2-(iw/zoom/2)", 2: f"(iw-iw/zoom)*(1-on/{frames})", 3: f"(iw-iw/zoom)*(on/{frames})"}[move]
    vf = (f"crop=ih*9/16:ih,scale=1215:2160,zoompan=z='{z}':x='{x}':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},"
          f"eq=contrast=1.06:saturation=1.08,vignette=PI/5,format=yuv420p")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(img), "-vf", vf, "-frames:v", str(frames),
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-r", str(FPS), str(out)])


def render(script: dict, images: list, voices: list, out_mp4: Path):
    lines = script["lines"]
    WORK.joinpath("cap").mkdir(parents=True, exist_ok=True)
    gap = 0.12
    durs = [v[1] + gap for v in voices]
    hook_d = 1.6  # the hook card rides on top of shot 1 (shot 1 is lengthened so the voice starts after it)
    durs[0] += hook_d
    outro_d = 2.4
    # shots
    clips = []
    for i, (img, d) in enumerate(zip(images, durs)):
        c = WORK / f"shot{i:02d}.mp4"
        shot_clip(img, d, c, i)
        clips.append(c)
    oc = WORK / "shot_outro.mp4"
    shot_clip(images[-1], outro_d, oc, 1)
    clips.append(oc)
    (WORK / "shots.txt").write_text("".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")
    base = WORK / "base.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(WORK / "shots.txt"), "-c", "copy", str(base)])
    # caption states (word timing spread over each line's voice by word length)
    states = []  # (png, duration)
    hook = WORK / "cap" / "hook.png"
    big_text_png(script.get("hook") or lines[0]["caption"], hook)
    states.append((hook, hook_d))
    blank = WORK / "cap" / "blank.png"
    Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(blank)
    for i, (line, (wav, vd)) in enumerate(zip(lines, voices)):
        words = (line.get("caption") or line["say"]).split()
        key = (line.get("key") or "").strip("*").lower()
        weights = [max(1, len(re.sub(r"\W", "", w))) + 1.5 for w in words]
        tot = sum(weights)
        for k, w in enumerate(words):
            png = WORK / "cap" / f"c{i:02d}_{k:02d}.png"
            caption_png(words, k, png)
            states.append((png, vd * weights[k] / tot))
        states.append((blank, gap))
    outro = WORK / "cap" / "outro.png"
    big_text_png(script.get("outro") or "FOLLOW FOR MORE", outro, sub="FOLLOW FOR MORE")
    states.append((outro, outro_d))
    lst = "".join(f"file '{p.as_posix()}'\nduration {d:.3f}\n" for p, d in states) + f"file '{states[-1][0].as_posix()}'\n"
    (WORK / "caps.txt").write_text(lst, encoding="utf-8")
    capv = WORK / "caps.mov"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(WORK / "caps.txt"),
         "-vf", f"fps={FPS},format=rgba", "-c:v", "png", str(capv)])
    # voice track: each line starts at its shot's start (+ hook delay on line 1)
    starts, t = [], 0.0
    for i, d in enumerate(durs):
        starts.append(t + (hook_d if i == 0 else 0))
        t += d
    total = t + outro_d
    inputs, filt = [], []
    for i, (wav, _) in enumerate(voices):
        inputs += ["-i", str(wav)]
        filt.append(f"[{i}:a]adelay={int(starts[i] * 1000)}|{int(starts[i] * 1000)}[v{i}]")
    n = len(voices)
    sfx = HERE / "assets"
    inputs += ["-stream_loop", "-1", "-i", str(sfx / "bgm.mp3"), "-i", str(sfx / "impact-bass-1.mp3")]
    filt.append(f"[{n}:a]volume=0.07,atrim=0:{total:.2f}[bg]")
    filt.append(f"[{n + 1}:a]volume=0.5[hit]")
    # a soft whoosh on every cut
    cuts = []
    for k, st in enumerate([sum(durs[:i]) for i in range(1, len(durs) + 1)]):
        inputs += ["-i", str(sfx / "whoosh-short.mp3")]
        idx = n + 2 + k
        filt.append(f"[{idx}:a]volume=0.22,adelay={int(max(0, st - 0.15) * 1000)}|{int(max(0, st - 0.15) * 1000)}[w{k}]")
        cuts.append(f"[w{k}]")
    mix = "".join(f"[v{i}]" for i in range(n)) + "[bg][hit]" + "".join(cuts)
    filt.append(f"{mix}amix=inputs={n + 2 + len(cuts)}:normalize=0,alimiter=limit=0.95,atrim=0:{total:.2f}[a]")
    audio = WORK / "audio.m4a"
    run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filt), "-map", "[a]",
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(audio)])
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(base), "-i", str(capv), "-i", str(audio),
         "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]", "-map", "[v]", "-map", "2:a",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(out_mp4)])
    return total


# ---- main ---------------------------------------------------------------------------------------------

def main():
    argv = sys.argv[1:]
    lang = argv[argv.index("--lang") + 1] if "--lang" in argv else "hi"
    upload = "--upload" in argv
    topic = " ".join(a for i, a in enumerate(argv) if not a.startswith("--") and (i == 0 or argv[i - 1] != "--lang")).strip()
    t0 = time.time()
    cache = WORK / "script.json"
    old = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    shutil.rmtree(WORK, ignore_errors=True)
    WORK.mkdir(parents=True, exist_ok=True)

    step(f"script: \"{topic}\" (Claude Sonnet)")
    if old.get("topic") == topic and old.get("script"):  # a retry of the same topic reuses the script (saves Claude)
        script = old["script"]
        print("  reusing the script from the previous try")
    else:
        script = write_script(topic, lang)
    cache.write_text(json.dumps({"topic": topic, "script": script}, ensure_ascii=False), encoding="utf-8")
    lines = script["lines"]
    print(f"  {len(lines)} lines | hook: {script.get('hook')}")

    step(f"images for {len(lines)} shots (Cloudflare FLUX, free)")
    seed = random.Random(topic).randint(1, 10**6)
    images = []
    for i, l in enumerate(lines):
        p = WORK / f"img{i:02d}.jpg"
        make_image(l["shot"], p, seed + i * 7)
        images.append(p)
        print(f"  shot {i + 1}/{len(lines)}", flush=True)

    step("voice (Kokoro)")
    voices = make_voice(lines, lang)

    step("render")
    name = slug(script.get("title") or topic)
    out = ROOT / "out" / "auto" / f"{name}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    total = render(script, images, voices, out)
    print(f"  {total:.1f}s -> {out}")

    step("youtube")
    yt = script.get("youtube") or {}
    meta = {"file": f"out/auto/{name}.mp4", "title": (yt.get("title") or script.get("title") or topic)[:100],
            "description": yt.get("description") or "", "tags": yt.get("tags") or [topic],
            "categoryId": "28", "language": lang, "privacy": "private",
            "playlist": {"title": "Inside Electronics: Shorts", "description": "Quick animated explainers."},
            "coverMs": 600, "thumbText": script.get("hook"), "format": "cinematic",
            **({"social": script["social"]} if script.get("social") else {})}
    mp = HERE / "videos" / f"cine-{name}.json"
    mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {meta['title']}\n  metadata: channel/videos/{mp.name}")
    if upload:
        import youtube
        youtube.cmd_upload(f"channel/videos/{mp.name}")
    print(f"\nDONE in {(time.time() - t0) / 60:.1f} min -> {out}")


if __name__ == "__main__":
    main()
