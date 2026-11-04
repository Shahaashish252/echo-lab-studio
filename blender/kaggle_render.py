# Kaggle notebook (2 x Tesla T4, internet on): downloads Blender, renders the studio stage from the attached dataset
# (scene.glb, anim.json, render_studio.py) on both GPUs at once, and leaves blender.mp4 in /kaggle/working.
# Pushed by app/scripts/kaggle-render.ts.
import glob
import json
import os
import subprocess
import time

BL = "/kaggle/temp/blender-4.2.3-linux-x64"  # outside /kaggle/working, so the notebook's output stays small
t0 = time.time()
subprocess.run("apt-get -qq install -y libxi6 libxkbcommon0 libsm6 libxxf86vm1 libxfixes3 libxrender1 libgl1 > /dev/null 2>&1", shell=True)
if not os.path.exists(BL):
    subprocess.run("cd /kaggle/temp && wget -q https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz && tar xf blender-4.2.3-linux-x64.tar.xz && rm blender-4.2.3-linux-x64.tar.xz", shell=True, check=True)
print(subprocess.run([f"{BL}/blender", "-b", "--version"], capture_output=True, text=True).stdout[:200], flush=True)
inp = os.path.dirname(glob.glob("/kaggle/input/**/anim.json", recursive=True)[0])
A = json.load(open(f"{inp}/anim.json"))
frames = A["frames"]
job = json.load(open(f"{inp}/job.json")) if os.path.exists(f"{inp}/job.json") else {}
samples = int(job.get("samples", 64))
step = int(job.get("step", 1))  # >1: a preview of every n-th frame (stills, no video)
out = "/kaggle/temp/frames"
os.makedirs(out, exist_ok=True)
half = frames // 2
procs = []
for gpu, (a, b) in enumerate([(0, half - 1), (half, frames - 1)]):
    env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(gpu))
    log = open(f"/kaggle/working/blender_gpu{gpu}.log", "w")
    procs.append(subprocess.Popen([f"{BL}/blender", "-b", "-P", f"{inp}/render_studio.py", "--", f"{inp}/scene.glb", f"{inp}/anim.json", out, str(a), str(b), str(samples), str(step)],
                                  env=env, stdout=log, stderr=subprocess.STDOUT))
for p in procs:
    p.wait()
pngs = sorted(glob.glob(f"{out}/*.png"))
print(f"{len(pngs)}/{frames} frames in {(time.time() - t0) / 60:.1f} min", flush=True)
# Blender's own messages, in the notebook log (the files are hard to fetch on slow links)
for gpu in (0, 1):
    lines = open(f"/kaggle/working/blender_gpu{gpu}.log", errors="replace").read().splitlines()
    print(f"---- blender gpu{gpu} log (last 40 lines) ----", *lines[-40:], sep="\n", flush=True)
if not pngs:
    raise SystemExit("Blender rendered no frames")
if step > 1:
    for p in pngs:
        subprocess.run(["cp", p, "/kaggle/working/"])
    raise SystemExit(0)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(A["fps"]), "-start_number", "0", "-i", f"{out}/%04d.png",
                "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "/kaggle/working/blender.mp4"], check=True)
print("done", round((time.time() - t0) / 60, 1), "min")
