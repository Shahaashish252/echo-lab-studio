"""Publish a video everywhere once you've watched it:
YouTube private -> public, Instagram Reel posted automatically (official API, channel/instagram.py),
and TikTok handed to you: caption copied to the clipboard, TikTok's upload page and the video file opened.

    python -m uv run --with google-api-python-client --with google-auth-oauthlib --with requests python channel/publish.py <command>

Commands
    list                       recent uploads, newest first, with their numbers
    publish [n|videoId]        publish upload n from `list` (default 1, the newest) everywhere
    tiktok [n|videoId]         just the TikTok hand-off again
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # titles have emoji; the Windows console doesn't
sys.path.insert(0, str(Path(__file__).resolve().parent))
import instagram  # noqa: E402  (same folder)
import youtube  # noqa: E402

HERE = youtube.HERE
LOG = HERE / "uploads.json"
TIKTOK_UPLOAD = "https://www.tiktok.com/tiktokstudio/upload"


def history() -> list:
    return json.loads(LOG.read_text(encoding="utf-8")) if LOG.exists() else []


def pick(which: str) -> dict:
    hist = list(reversed(history()))
    if not hist:
        sys.exit("No uploads yet: make a video with make-video.bat and answer y to upload.")
    h = hist[int(which) - 1] if which.isdigit() and 0 < int(which) <= len(hist) else next((x for x in hist if x["id"] == which), None)
    if not h:
        sys.exit(f"No upload {which}. Run `list`.")
    return h


def meta(h: dict) -> dict:
    return json.loads(youtube.rel(h["meta"]).read_text(encoding="utf-8"))


def tiktok_caption(m: dict) -> str:
    if m.get("social", {}).get("tiktok"):
        return m["social"]["tiktok"][:2200]
    title = m["title"].replace("#shorts", "").strip()
    tags = [w for ln in m.get("description", "").splitlines() for w in ln.split() if w.startswith("#") and w.lower() != "#shorts"]
    return f"{title} Follow for more!\n\n{' '.join(tags + ['#fyp', '#learnontiktok', '#techtok'])}"[:2200]


def cmd_tiktok(which: str = "1"):
    """Caption to the clipboard + a .txt beside the video, then TikTok's upload page and the file in Explorer."""
    m = meta(pick(which))
    video = youtube.rel(m["file"])
    text = tiktok_caption(m)
    video.with_suffix(".tiktok.txt").write_text(text, encoding="utf-8")
    # Set-Clipboard keeps emoji (clip.exe mangles them)
    subprocess.run(["powershell", "-NoProfile", "-Command", "$input | Set-Clipboard"], input=text, text=True, encoding="utf-8")
    subprocess.run(["cmd", "/c", "start", "", TIKTOK_UPLOAD])
    subprocess.run(["explorer", "/select,", str(video)])
    print("tiktok: caption copied. In the TikTok page that opened: drag in the highlighted video, paste the caption (Ctrl+V), Post.")
    print(f"        (also saved in {video.with_suffix('.tiktok.txt').name}; on the phone, send yourself the video and use that text)")


def cmd_list():
    for i, h in enumerate(reversed(history()), 1):
        done = ", ".join(h.get("published", {})) or "private"
        print(f"{i:3d}. {h['date']}  https://youtu.be/{h['id']}  [{done}]  {meta(h)['title']}")


def cmd_publish(which: str = "1"):
    h = pick(which)
    m = meta(h)
    print(f"Publishing: {m['title']}\n")
    hist = history()
    entry = next(x for x in hist if x["id"] == h["id"])
    published = entry.setdefault("published", {})

    youtube.cmd_publish(h["id"])
    published["youtube"] = date.today().isoformat()

    if published.get("instagram"):
        print(f"instagram: already posted {published['instagram']}")
    elif instagram.TOKEN_FILE.exists():
        published["instagram"] = instagram.post(h["meta"]) or date.today().isoformat()
    else:
        print("instagram: not connected yet, skipped (see channel/README.md, Instagram)")
    LOG.write_text(json.dumps(hist, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    cmd_tiktok(which)


COMMANDS = {"list": cmd_list, "publish": cmd_publish, "tiktok": cmd_tiktok}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
