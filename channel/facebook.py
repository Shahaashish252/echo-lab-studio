"""Facebook Reels on the Echo Lab 3D Page, using the Page token saved in channel/instagram.json.

    python channel/facebook.py post <meta.json>     post a video's file as a Facebook Reel
    python channel/facebook.py check                show the Page and whether posting is allowed

Needs the pages_manage_posts permission on the token (plus pages_show_list / pages_read_engagement).
"""
import json
import sys
import time

import requests

sys.path.insert(0, __import__("os").path.dirname(__file__))
import instagram  # noqa: E402

G = instagram.GRAPH_FB


def page() -> tuple[str, str]:
    cfg = instagram.load()
    token = cfg["token"]
    pid = cfg.get("pageId") or instagram._check(requests.get(f"{G}/me", params={"fields": "id", "access_token": token}, timeout=30))["id"]
    return pid, token


def caption(m: dict) -> str:
    """Facebook gets the Instagram caption (same audience style), else the YouTube description."""
    return (m.get("social", {}).get("facebook") or m.get("social", {}).get("instagram")
            or f"{m['title'].replace('#shorts', '').strip()}\n\n{m.get('description', '')}")[:2200]


def post(meta_path: str) -> str:
    m = json.loads(instagram.rel(meta_path).read_text(encoding="utf-8"))
    video = instagram.rel(m["file"])
    pid, token = page()
    # 1. start an upload session
    start = instagram._check(requests.post(f"{G}/{pid}/video_reels", data={"upload_phase": "start", "access_token": token}, timeout=60))
    vid = start["video_id"]
    # 2. send the file
    size = video.stat().st_size
    print(f"facebook: uploading {size / 1e6:.1f} MB ...", flush=True)
    with open(video, "rb") as f:
        r = requests.post(start.get("upload_url") or f"https://rupload.facebook.com/video-upload/v21.0/{vid}",
                          headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size)}, data=f, timeout=900)
    if not r.ok:
        sys.exit(f"Facebook upload failed {r.status_code}: {r.text[:300]}")
    # 3. publish
    instagram._check(requests.post(f"{G}/{pid}/video_reels", data={
        "upload_phase": "finish", "video_id": vid, "video_state": "PUBLISHED", "description": caption(m), "access_token": token}, timeout=60))
    # 4. wait until Facebook has processed it, then return its link
    for _ in range(60):
        st = instagram._check(requests.get(f"{G}/{vid}", params={"fields": "status,permalink_url", "access_token": token}, timeout=30))
        phase = (st.get("status") or {}).get("video_status")
        if phase in ("ready", "published") or (st.get("status") or {}).get("publishing_phase", {}).get("status") == "complete":
            break
        if phase == "error":
            sys.exit(f"Facebook couldn't process the video: {st.get('status')}")
        time.sleep(10)
    if m.get("cover"):
        set_cover(vid, m["cover"])
    link = st.get("permalink_url") or f"https://www.facebook.com/reel/{vid}"
    if link.startswith("/"):
        link = "https://www.facebook.com" + link
    print(f"facebook: posted {link}")
    return link


def set_cover(video_id: str, cover: str):
    """Our designed thumbnail as the Reel's cover."""
    _, token = page()
    path = instagram.rel(cover)
    try:
        with open(path, "rb") as f:
            instagram._check(requests.post(f"{G}/{video_id}/thumbnails", data={"is_preferred": "true", "access_token": token},
                                           files={"source": (path.name, f, "image/jpeg")}, timeout=120))
        print("facebook: cover set")
    except (Exception, SystemExit) as e:  # noqa: BLE001
        print(f"facebook: cover not set ({e})")


def cmd_check():
    pid, token = page()
    info = instagram._check(requests.get(f"{G}/{pid}", params={"fields": "name,link", "access_token": token}, timeout=30))
    perms = requests.get(f"{G}/debug_token", params={"input_token": token, "access_token": token}, timeout=30).json().get("data", {}).get("scopes", [])
    print(f"Page: {info.get('name')} ({info.get('link')})")
    print("can post reels:", "yes" if "pages_manage_posts" in perms else "NO (token lacks pages_manage_posts)")


COMMANDS = {"post": post, "check": cmd_check, "cover": set_cover}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
