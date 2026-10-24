"""Speak a video's narration with Kokoro (local neural TTS).

Kokoro is the free local draft voice; scripts/voice.ts does the same with ElevenLabs.
Reads app/src/scenes/<video>/voice.json, writes one 48 kHz mono clip per line to
app/public/voice/<video>/kokoro/<id>.wav, and each clip's length to the "kokoro" entry of
app/src/scenes/<video>/voice.gen.json. Set "engine": "kokoro" in voice.json to use these clips.

    python -m uv run --python 3.12 --with kokoro-onnx --with soundfile python analysis/tts.py rutherford
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Hindi text in the log on a Windows console

ROOT = Path(__file__).resolve().parent.parent
video = sys.argv[1] if len(sys.argv) > 1 else "rutherford"
scene_dir = ROOT / "app" / "src" / "scenes" / video
cfg = json.loads((scene_dir / "voice.json").read_text(encoding="utf-8"))
kcfg = cfg.get("kokoro", {})
models = ROOT / "analysis" / "models"
_kokoro = None


def kokoro():
    global _kokoro
    if _kokoro is None:
        _kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    return _kokoro


def edge(text, voice):
    """Microsoft Edge neural voice (e.g. hi-IN-MadhurNeural): far more natural Hindi than Kokoro; None if unavailable."""
    try:
        import asyncio
        import tempfile

        import edge_tts
        fd, name = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)  # Windows: the open handle would block edge-tts from writing the file
        mp3 = Path(name)
        asyncio.run(edge_tts.Communicate(text, voice, rate=kcfg.get("rate", "+12%")).save(str(mp3)))
        wav = mp3.with_suffix(".wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", "24000", "-ac", "1", str(wav)], check=True)
        samples, sr = sf.read(str(wav), dtype="float32")
        mp3.unlink(missing_ok=True)
        wav.unlink(missing_ok=True)
        return samples, sr
    except Exception as e:  # noqa: BLE001
        print(f"  edge voice failed ({str(e)[:100]}); falling back to Kokoro")
        return None

out = ROOT / "app" / "public" / "voice" / video / "kokoro"
out.mkdir(parents=True, exist_ok=True)
durations = {}
for line_id, line in cfg["lines"].items():
    # [audio tags] are for ElevenLabs; Kokoro would read them aloud
    text = re.sub(r"\[[^\]]*\]\s*", "", line.get("say") or line["text"]).replace("*", "")
    got = edge(text, kcfg["edge"]) if kcfg.get("edge") else None
    if got is not None:
        samples, sr = got
    else:
        samples, sr = kokoro().create(
            text, voice=kcfg.get("voice", "af_heart"), speed=kcfg.get("speed", 1.0), lang=kcfg.get("lang", "en-us")
        )
    # trim leading/trailing silence, keeping a short breath either side
    loud = np.where(np.abs(samples) > 0.01)[0]
    samples = samples[max(0, loud[0] - int(0.03 * sr)) : loud[-1] + int(0.1 * sr)]
    tmp = out / f"{line_id}.tmp.wav"
    sf.write(tmp, samples, sr)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(out / f"{line_id}.wav")],
        check=True,
    )
    tmp.unlink()
    durations[line_id] = round(len(samples) / sr, 3)
    print(f"{line_id:10s} {durations[line_id]:5.2f}s  {text}")

gen_path = scene_dir / "voice.gen.json"
gen = json.loads(gen_path.read_text(encoding="utf-8")) if gen_path.exists() else {}
gen["kokoro"] = durations
gen_path.write_text(json.dumps(gen, indent=2) + "\n", encoding="utf-8")
print(f"wrote {len(durations)} clips to {out}")
