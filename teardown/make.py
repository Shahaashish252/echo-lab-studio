"""teardown3 format (2026-11-09): 3D exploded teardown -> blueprint (timing + maths) -> isometric infographic (range, uses,
limits), ~60 s vertical, Hindi voice + Hinglish subtitles. Claude writes one JSON spec; everything else is code.

    python teardown/make.py "topic (open with this hook: ...)" --kind ultrasonic [--lang hi] [--upload] [--spec file.json] [--parts 8]

--kind: ir ldr flame sound gas soil ultrasonic pir dht (anything else = generic board)
--spec: skip Claude and use this content JSON (same shape the prompt asks for)
--parts N: render in N parallel GitHub runs (teardown-part.yml); default: local, or 8 parts in the cloud
Prints "== step" lines (the dashboard progress bar).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PAGE = HERE / "page"
JOB = PAGE / "job"
sys.path.insert(0, str(ROOT / "channel"))
if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
CLOUD = bool(os.environ.get("GITHUB_ACTIONS"))
KINDS = ["ir", "ldr", "flame", "sound", "gas", "soil", "ultrasonic", "pir", "dht"]
PROPS = "car tank robot lamp light fan plant door person house phone bell stove dustbin tap candle speaker sun dust rough small wall water sensor"
TARGETS = "wall light flame hand gas water sound heat soil object"
HDRI = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/photo_studio_loft_hall_2k.hdr"


def step(s):
    print(f"\n== {s}", flush=True)


def run(cmd, **kw):
    print("  $ " + " ".join(str(c) for c in cmd)[:200], flush=True)
    r = subprocess.run([str(c) for c in cmd], **kw)
    if r.returncode:
        raise RuntimeError(f"failed ({r.returncode}): {cmd[0]} {cmd[1] if len(cmd) > 1 else ''}")
    return r


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:50] or "video"


# ---------- 1. the script spec (one Claude call) ----------
PROMPT = """Write a ~55 second vertical explainer (YouTube Short / Instagram Reel) about: "{topic}"
The sensor module shown in 3D is: {module} (kind "{kind}"). Channel: Echo Lab 3D, Hindi narration for Indian students and makers.

The film has three acts in fixed visual styles; you write the words and pick from fixed options.
Act A (3D teardown of the module, lines a1-a6): a1 = the hook, a MYTH-FLIP about the module/gadget ("X doesn't see, it only hears!"),
a2 = what the module is + one headline spec, a3 = the main sensing part (camera dives into it), a4 = one surprising fact about that part,
a5 = the second part (second sensor element, or the comparator chip/pot), a6 = what is on the back / what the chip does.
Act B (blueprint drawing, lines b1-b6): b1-b3 = the signal, step by step (one row of a signal diagram per line),
b4 = the physics in one sentence (drawn as a cause -> effect sketch), b5 = the rule/formula/threshold, b6 = a worked example with a number.
Act C (isometric infographic, lines c1-c5): c1 = range / limits in numbers, c2 = three real uses, c3 = two things that break it,
c4 = one practical tip with a number, c5 = call to action ("Save karo..., comment mein batao ...").

Reply with ONLY a JSON object:
{{
 "title": "short English file title, max 28 chars",
 "moduleName": "module name as printed, e.g. HC-SR04",
 "lines": [17 objects in order a1..a6, b1..b6, c1..c5: {{"id": "a1", "say": "{say_rule}", "sub": "{sub_rule}"}}],
 "A": {{"note": "short caps note for the top of the screen, e.g. HC-SR04 · 3D MODEL", "stop1": {{"name": "label for a3 (max 18 chars)", "spec": "one number or fact, max 18 chars"}},
        "stop1b": {{"name": "label for a4 (max 18 chars)", "spec": ""}}, "stop2": {{"name": "label for a5 (max 18 chars)", "spec": "max 18 chars"}}}},
 "B": {{"fig1": "{module}, upar se", "fig2": "TIMING or SIGNAL or OUTPUT (2 words max)", "fig3": "1-2 word title for the physics sketch",
        "rows": [3 objects for b1..b3: {{"name": "pin/signal name max 6 chars", "kind": "pulse|burst|high|ramp|step|wave|flat", "a": 0.05-0.9 start, "b": 0.1-0.95 end, "label": "max 16 chars, may use µ ÷ × °"}}],
        "sketch": {{"target": "one of: {targets}", "targetLabel": "max 12 chars", "out": "label on the arrow from sensor to target, max 18 chars (or empty)", "back": "label on the arrow back, max 22 chars (or empty)", "dim": "max 14 chars or empty"}},
        "eqs": ["b4 equation or rule, max 26 chars", "b5 the key formula/threshold, max 26 chars", "b6 worked example with numbers, max 26 chars"],
        "stamp": "the answer of the example, max 10 chars", "sheet": "2-4 word sheet name"}},
 "C": {{"range": {{"min": "min value or empty", "max": "max value or empty", "beam": "cone (ultrasonic/ir) | glow (light/flame) | none", "source": "for beam none: a prop that makes the thing sensed ({props}) or empty", "angle": 15,
                  "pins": [up to 2 objects {{"text": "max 14 chars", "sub": "max 14 chars"}}]}},
        "uses": [3 objects {{"prop": "one of: {props}", "label": "max 16 chars"}}],
        "limits": [2 objects {{"prop": "one of: {props}", "label": "max 14 chars", "sub": "max 18 chars"}}],
        "iso": {{"count": 3-6, "prop": "sensor or a prop name", "label": "the tip in max 14 chars, e.g. 60 ms", "sub": "max 20 chars", "gap": true or false}},
        "card": {{"tagline": "Kholke Dekho", "lines": [3 summary lines of key numbers, max 26 chars each, e.g. "5 V · 15 mA · 40 kHz"]}}}},
 "youtube": {{"title": "Hinglish Shorts title, max 70 chars, a myth-flip, one emoji, ends with #shorts", "description": "2 lines hook + 4 lines with emojis + subscribe line + 6-8 hashtags incl. #shorts", "tags": ["10-15 search phrases"]}},
 "social": {{"instagram": "Reel caption: scroll-stopping first line with one emoji, 3-4 short lines, a save prompt, a comment question, then exactly 5 hashtags", "tiktok": "short caption with 5 hashtags"}}
}}

Rules:
- Each say line max 11 words, short and spoken; the whole voice is about 50 seconds. Hook in the first line, no slow intro.
- Every number must be true for this module (datasheet values); no invented numbers. If unsure, leave a number out.
- Labels, rows, equations and the card repeat the numbers the voice says, never new unsourced ones.
- The uses must be places the same principle is used, the limits real failure cases."""


def write_spec(topic, kind, lang):
    import manager
    hindi = lang == "hi"
    module = {"ultrasonic": "HC-SR04 ultrasonic sensor", "ir": "FC-51 IR obstacle sensor", "flame": "flame sensor module", "ldr": "LDR light sensor module",
              "sound": "KY-038 sound sensor", "gas": "MQ-2 gas sensor module", "soil": "soil moisture sensor", "pir": "HC-SR501 PIR motion sensor",
              "dht": "DHT11 temperature + humidity sensor"}.get(kind, "the sensor module in the topic")
    prompt = PROMPT.format(topic=topic, module=module, kind=kind, targets=TARGETS, props=PROPS,
                           say_rule=("natural spoken Hindi in Devanagari; English tech words as pronounced in Devanagari; numbers as words" if hindi else "spoken English, numbers as words"),
                           sub_rule=("the same line in Roman Hinglish, numbers as digits, max 44 chars" if hindi else "the same line, numbers as digits, max 44 chars"))
    for attempt in range(3):
        try:
            d = manager.ai_json(prompt, model="sonnet")
            ids = [l.get("id") for l in d.get("lines", [])]
            want = [f"a{i}" for i in range(1, 7)] + [f"b{i}" for i in range(1, 7)] + [f"c{i}" for i in range(1, 6)]
            if ids == want and all(l.get("say") and l.get("sub") for l in d["lines"]):
                return d
            print(f"  spec attempt {attempt + 1}: wrong lines {ids}")
        except Exception as e:  # noqa: BLE001
            print(f"  spec attempt {attempt + 1} failed: {e}")
    raise RuntimeError("could not get a valid spec")


# ---------- 2. voice + timings ----------
def voice(spec, lang):
    scene = ROOT / "app" / "src" / "scenes" / "teardown3"
    scene.mkdir(parents=True, exist_ok=True)
    gen = None
    for rate in ["+18%", "+26%", "+34%"]:
        cfg = {"engine": "kokoro", "kokoro": ({"voice": "hm_omega", "speed": 1.15, "lang": "hi", "edge": "hi-IN-MadhurNeural", "rate": rate} if lang == "hi"
                                              else {"voice": "am_michael", "speed": 1.1, "lang": "en-us", "edge": "en-US-AndrewNeural", "rate": rate}),
               "lines": {l["id"]: {"text": l["sub"], "say": l["say"]} for l in spec["lines"]}}
        (scene / "voice.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        run([sys.executable, "-m", "uv", "run", "--python", "3.12", "--with", "kokoro-onnx", "--with", "soundfile", "--with", "edge-tts", "python", "analysis/tts.py", "teardown3"], cwd=ROOT)
        gen = json.loads((scene / "voice.gen.json").read_text(encoding="utf-8"))["kokoro"]
        total = sum(gen.values())
        print(f"  voice {total:.1f}s at {rate}")
        if total <= 52.5:
            break
    t, out = 0.35, []
    for l in spec["lines"]:
        if l["id"] in ("b1", "c1"):
            t += 0.55
        out.append({"id": l["id"], "t": round(t, 3), "d": round(gen[l["id"]], 3), "sub": l["sub"]})
        t += gen[l["id"]] + 0.27
    vdir = JOB / "voice"
    vdir.mkdir(parents=True, exist_ok=True)
    for l in out:
        shutil.copy(ROOT / "app" / "public" / "voice" / "teardown3" / "kokoro" / f"{l['id']}.wav", vdir / f"{l['id']}.wav")
    return out


# ---------- 3. render ----------
def ensure_tools():
    if not (HERE / "node_modules" / "three").exists():
        run(["npm", "install", "--no-audit", "--no-fund", "--loglevel=error"], cwd=HERE, shell=os.name == "nt")
    run(["node", "node_modules/playwright-core/cli.js", "install", "chromium-headless-shell"], cwd=HERE)
    h = PAGE / "hdri" / "studio.hdr"
    if not h.exists():
        h.parent.mkdir(parents=True, exist_ok=True)
        run(["curl", "-sSL", "-o", h, HDRI])


def gh(args, ok=False):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, cwd=ROOT)
    if r.returncode and not ok:
        raise RuntimeError(f"gh {' '.join(args[:3])}: {(r.stderr or r.stdout)[:300]}")
    return r.stdout if r.returncode == 0 else ""


def render_cloud(parts, out):
    """Split the frames over N parallel GitHub runs (teardown-part.yml), then join them."""
    job = str(int(time.time()))
    tgz = ROOT / "out" / f"td3-{job}.tgz"
    tgz.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tgz, "w:gz") as tf:
        tf.add(JOB, arcname="job")
    if not gh(["release", "view", "renders"], ok=True):
        gh(["release", "create", "renders", "--title", "Render parts (temporary)", "--notes", "Scratch space for split cloud renders.", "--prerelease"])
    gh(["release", "upload", "renders", str(tgz), "--clobber"])
    for k in range(parts):
        gh(["workflow", "run", "teardown-part.yml", "-f", f"job={job}", "-f", f"part={k}", "-f", f"parts={parts}"])
    print(f"  dispatched {parts} parts (job {job})", flush=True)
    names = [f"td3-{job}-part-{k}.mp4" for k in range(parts)]
    t0, retried = time.time(), False
    retried_parts, crash_count = set(), {}
    while True:
        have = set(a["name"] for a in json.loads(gh(["release", "view", "renders", "--json", "assets"], ok=True) or '{"assets":[]}')["assets"])
        got = [n for n in names if n in have]
        print(f"  {len(got)}/{parts} parts ({(time.time() - t0) / 60:.0f} min)", flush=True)
        if len(got) == parts:
            break
        # a part that crashed is retried once at once; a second crash stops the video (no 3-hour wait)
        runs = json.loads(gh(["run", "list", "--workflow", "teardown-part.yml", "-L", "60", "--json", "displayTitle,conclusion"], ok=True) or "[]")
        failed = {int(m.group(1)) for r in runs if r.get("conclusion") == "failure" and f"({job})" in r["displayTitle"]
                  for m in [re.search(r"part (\d+)/", r["displayTitle"])] if m}
        failed -= {k for k, n in enumerate(names) if n in have}
        for k in failed - retried_parts:
            print(f"  part {k} crashed; retrying it once", flush=True)
            gh(["workflow", "run", "teardown-part.yml", "-f", f"job={job}", "-f", f"part={k}", "-f", f"parts={parts}"])
            retried_parts.add(k)
            crash_count[k] = crash_count.get(k, 0) + 1
        if any(sum(1 for r in runs if r.get("conclusion") == "failure" and f"({job})" in r["displayTitle"] and f"part {k}/" in r["displayTitle"]) >= 2 for k in failed):
            raise RuntimeError("a render part crashed twice (see the Teardown part runs)")
        if time.time() - t0 > 110 * 60 and not retried:
            for k, n in enumerate(names):
                if n not in have:
                    gh(["workflow", "run", "teardown-part.yml", "-f", f"job={job}", "-f", f"part={k}", "-f", f"parts={parts}"])
            retried = True
        if time.time() - t0 > 200 * 60:
            raise RuntimeError("render parts did not arrive")
        time.sleep(60)
    tmp = ROOT / "out" / f"td3-{job}"
    tmp.mkdir(parents=True, exist_ok=True)
    for n in names:
        gh(["release", "download", "renders", "-p", n, "-D", str(tmp), "--clobber"])
    (tmp / "list.txt").write_text("\n".join(f"file '{(tmp / n).as_posix()}'" for n in names), encoding="utf-8")
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", tmp / "list.txt", "-c", "copy", out])
    for n in names + [tgz.name]:
        gh(["release", "delete-asset", "renders", n, "-y"], ok=True)


def main():
    argv = sys.argv[1:]
    get = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    lang, kind = get("--lang", "hi"), get("--kind", "generic")
    parts = int(get("--parts", os.environ.get("TD3_PARTS", "10") if CLOUD else "0"))
    skip = {get(k) for k in ("--lang", "--kind", "--spec", "--parts")}
    topic = " ".join(a for a in argv if not a.startswith("--") and a not in skip).strip()
    t0 = time.time()
    shutil.rmtree(JOB, ignore_errors=True)
    JOB.mkdir(parents=True)

    step(f"research & storyboard: \"{topic}\" ({kind}, Claude)")
    spec = json.loads(Path(get("--spec")).read_text(encoding="utf-8")) if get("--spec") else write_spec(topic, kind, lang)
    spec["kind"] = kind if kind in KINDS else "generic"
    print(f"  {spec.get('youtube', {}).get('title') or spec.get('title')}")

    step("voice (Microsoft Edge neural)")
    spec["lines"] = voice(spec, lang)
    (JOB / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")

    step("3D model + drawings (render tools)")
    ensure_tools()
    run(["node", "core/render/events.mjs", "page", "--size", "1080x1920"], cwd=HERE)
    if "--stills" in argv:   # review frames only: page/stills/s_<t>.jpg
        ev = json.loads((PAGE / "events.json").read_text(encoding="utf-8"))
        L = {l["id"]: l["t"] for l in spec["lines"]}
        ts = [1.5] + [round(L[i] + 1.6, 2) for i in ("a2", "a3", "a5", "a6", "b1", "b3", "b5", "b6", "c1", "c2", "c3", "c4")] + [round(ev["dur"] - 1.2, 2)]
        run(["node", "core/render/still.mjs", "page", *map(str, ts), "--size", "1080x1920", "--prefix", "s_"], cwd=HERE)
        return
    name = slug(spec.get("title") or topic)
    out_dir = ROOT / "out" / "auto"
    out_dir.mkdir(parents=True, exist_ok=True)
    video = ROOT / "out" / f"td3-{name}.video.mp4"

    step(f"render ({'cloud, ' + str(parts) + ' parts' if parts else 'this machine'})")
    if parts:
        render_cloud(parts, video)
    else:
        run(["node", "render.mjs", "--workers", get("--workers", "3"), "--out", video], cwd=HERE)

    step("sound + master")
    run([sys.executable, "-m", "uv", "run", "--python", "3.12", "--with", "numpy", "--with", "scipy", "--with", "soundfile", "python", HERE / "mix.py"], cwd=HERE)
    final = out_dir / f"{name}.mp4"
    run(["sh", "core/render/mux.sh", video, PAGE / "out" / "mix.wav", final, "24", "1"], cwd=HERE)
    cues = [{"t0": round(l["t"] - .05, 3), "t1": round(min(spec["lines"][i + 1]["t"] - .06 if i + 1 < len(spec["lines"]) else 99, max(l["t"] + l["d"] + .6, l["t"] + 1.8)), 3), "text": l["sub"]} for i, l in enumerate(spec["lines"])]
    (PAGE / "out" / "cues.json").write_text(json.dumps(cues, ensure_ascii=False), encoding="utf-8")
    run([sys.executable, "core/render/srt.py", PAGE / "out" / "cues.json", out_dir / f"{name}.srt"], cwd=HERE)

    step("youtube upload")
    yt = spec.get("youtube") or {}
    meta = {"file": f"out/auto/{name}.mp4", "title": (yt.get("title") or spec.get("title") or topic)[:100],
            "description": yt.get("description") or "", "tags": yt.get("tags") or [topic], "categoryId": "28", "language": lang, "privacy": "private",
            "playlist": {"title": "Sensor Ki Kahani: Shorts", "description": "Quick animated explainers."},
            "coverMs": 9000, "thumbText": spec["lines"][0]["sub"], "format": "teardown3", "captions": f"out/auto/{name}.srt",
            **({"social": spec["social"]} if spec.get("social") else {})}
    mp = ROOT / "channel" / "videos" / f"td3-{name}.json"
    mp.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {meta['title']}\n  metadata: channel/videos/{mp.name}")
    if "--upload" in argv:
        import youtube
        youtube.cmd_upload(f"channel/videos/{mp.name}")
    print(f"\nDONE in {(time.time() - t0) / 60:.1f} min -> {final}")


if __name__ == "__main__":
    main()
