"""Local Hindi voice for teardown3: Piper hi_IN "pratham" (open model, runs offline on CPU).

    python teardown/tts_piper.py <lines.json> <out_dir> [--length 1.05]

lines.json = [{"id": "a1", "say": "..."}]. Writes <id>.wav (48 kHz mono, trimmed) and durations.json {id: seconds}.
The model (~63 MB, rhasspy/piper-voices, MIT) is downloaded once into teardown/voices/.
"""
import io
import json
import sys
import urllib.request
import wave
from pathlib import Path

import numpy as np
import soundfile as sf
import soxr

HERE = Path(__file__).resolve().parent
if sys.stdout:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # Hindi in a Windows console
VOICE = "hi_IN-pratham-medium"
URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/"


def model():
    d = HERE / "voices"
    d.mkdir(exist_ok=True)
    for ext in (".onnx", ".onnx.json"):
        f = d / (VOICE + ext)
        if not f.exists() or f.stat().st_size < 1000:
            print(f"  downloading {f.name}", flush=True)
            urllib.request.urlretrieve(URL + VOICE + ext, f)
    return d / (VOICE + ".onnx")


def main():
    lines = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    length = float(sys.argv[sys.argv.index("--length") + 1]) if "--length" in sys.argv else 1.05
    from piper import PiperVoice, SynthesisConfig
    voice = PiperVoice.load(str(model()))
    cfg = SynthesisConfig(length_scale=length)
    durs = {}
    for l in lines:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            voice.synthesize_wav(l["say"], w, syn_config=cfg)
        buf.seek(0)
        x, sr = sf.read(buf, dtype="float32")
        if x.ndim > 1:
            x = x.mean(1)
        x = soxr.resample(x, sr, 48000)
        loud = np.where(np.abs(x) > .01)[0]
        if len(loud):
            x = x[max(0, loud[0] - int(.03 * 48000)): loud[-1] + int(.1 * 48000)]
        x = x / (np.abs(x).max() + 1e-9) * .9
        sf.write(out / f"{l['id']}.wav", x, 48000, subtype="PCM_16")
        durs[l["id"]] = round(len(x) / 48000, 3)
        print(f"  {l['id']:4s} {durs[l['id']]:5.2f}s  {l['say']}", flush=True)
    (out / "durations.json").write_text(json.dumps(durs), encoding="utf-8")


if __name__ == "__main__":
    main()
