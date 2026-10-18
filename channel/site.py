"""Builds the online (read-only) dashboard for GitHub Pages: the same page as the local dashboard, fed by a
data.json snapshot of the channel state instead of the local server.

    python channel/site.py [out_dir]       (default: _site)
"""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import web  # noqa: E402  (reuses its state() so both dashboards show the same thing)

out = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "_site")
out.mkdir(parents=True, exist_ok=True)
data = web.state()
data["static"] = True
data["repo"] = "Shahaashish252/echo-lab-studio"
(out / "data.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
for f in ("index.html", "logo.png", "favicon.png", "privacy.html", "terms.html"):
    shutil.copy(HERE / "web" / f, out / f)
logs = out / "logs"
logs.mkdir(exist_ok=True)
for j in data["jobs"][:20]:
    src = HERE / "jobs" / f"{j['id']}.log"
    if src.exists():
        (logs / src.name).write_text(src.read_text(encoding="utf-8", errors="replace")[-60000:], encoding="utf-8")
(out / ".nojekyll").write_text("")
print(f"site: {out} ({len(data['videos'])} videos, {len(data['jobs'])} jobs)")
