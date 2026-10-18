"""Generates one AI video clip on Hugging Face's free GPUs (ZeroGPU), with the channel's token
(channel/huggingface.json) so it uses the account's daily free quota.

    python -m uv run --with gradio_client python scripts/aiclip.py <out.mp4> <seconds> "<prompt>" [image.jpg]

Text only: LTX-Video (fast, ~15 s). With an image: Wan 2.2 brings that photo to life (~50 s).
Prints the output path; exits 2 when the free quota is used up.
"""
import json
import shutil
import sys
from pathlib import Path

from gradio_client import Client, handle_file

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
out, seconds, prompt = sys.argv[1], float(sys.argv[2]), sys.argv[3]
image = sys.argv[4] if len(sys.argv) > 4 else None
token = json.loads((Path(__file__).resolve().parents[2] / "channel" / "huggingface.json").read_text())["token"]
NEG = "worst quality, inconsistent motion, blurry, jittery, distorted, text, watermark, logo, subtitles, deformed hands"

try:
    if image:
        c = Client("zerogpu-aoti/wan2-2-fp8da-aoti-faster", token=token, verbose=False)
        r = c.predict(input_image=handle_file(image), prompt=prompt, steps=6, duration_seconds=min(5.0, max(2.0, seconds)),
                      guidance_scale=1, guidance_scale_2=1, seed=7, randomize_seed=False, api_name="/generate_video")
    else:
        c = Client("Lightricks/ltx-video-distilled", token=token, verbose=False)
        r = c.predict(prompt=prompt, negative_prompt=NEG, input_image_filepath=None, input_video_filepath=None,
                      height_ui=896, width_ui=512, mode="text-to-video", duration_ui=min(8.0, max(2.0, seconds)),
                      ui_frames_to_use=9, seed_ui=7, randomize_seed=False, ui_guidance_scale=1,
                      improve_texture_flag=True, api_name="/text_to_video")
except Exception as e:  # noqa: BLE001
    msg = str(e)
    print(f"failed: {msg[:300]}")
    sys.exit(2 if "quota" in msg.lower() else 1)
video = r[0]["video"] if isinstance(r[0], dict) else r[0]
shutil.copy(video, out)
print(out)
