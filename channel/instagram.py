"""Instagram Reels publishing through Meta's official Instagram API (Instagram Login). Free.

    python -m uv run --with requests python channel/instagram.py <command>

Commands
    setup <access-token>                     Instagram-login token (starts with IG), from the app dashboard
    setup <access-token> <app-id> <secret>   Facebook-login token (starts with EAA), from the Graph API Explorer;
                                             swapped for a Page token that doesn't expire
    whoami                   show the connected Instagram account
    post <video.json>        upload and publish the video as a Reel (caption from the metadata)

Needs an Instagram Professional (Creator or Business) account and a Meta developer app with the
Instagram product; see channel/README.md "Instagram". The token (channel/instagram.json) lasts 60
days and is refreshed automatically when it's used. Keep the file private: it can post to your account.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

if sys.stdout:  # None under pythonw (the dashboard server)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TOKEN_FILE = HERE / "instagram.json"
GRAPH_IG = "https://graph.instagram.com/v21.0"  # Instagram-login tokens
GRAPH_FB = "https://graph.facebook.com/v21.0"  # Facebook-login (Page) tokens
GRAPH = GRAPH_IG


def rel(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else ROOT / path


def _check(r: requests.Response) -> dict:
    try:
        body = r.json()
    except ValueError:
        sys.exit(f"Instagram API error {r.status_code}: {r.text[:300]}")
    if r.status_code >= 400 or "error" in body:
        err = body.get("error", body)
        sys.exit(f"Instagram API error: {err.get('message', err) if isinstance(err, dict) else err}")
    return body


def load() -> dict:
    if not TOKEN_FILE.exists():
        sys.exit("Instagram isn't connected yet. Run: channel/instagram.py setup <access-token> (see README).")
    cfg = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    if cfg.get("mode") == "facebook":
        return cfg  # Page tokens made from a long-lived user token don't expire
    # long-lived tokens last 60 days; refresh once they're a week old so they never lapse
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(cfg["refreshedAt"])).days
    if age >= 7:
        r = requests.get("https://graph.instagram.com/refresh_access_token",
                         params={"grant_type": "ig_refresh_token", "access_token": cfg["token"]}, timeout=30)
        if r.ok and "access_token" in r.json():
            cfg["token"] = r.json()["access_token"]
            cfg["refreshedAt"] = datetime.now(timezone.utc).isoformat()
            TOKEN_FILE.write_text(json.dumps(cfg, indent=2))
    return cfg


def me(token: str) -> dict:
    return _check(requests.get(f"{GRAPH}/me", params={"fields": "user_id,username,account_type", "access_token": token}, timeout=30))


def setup_facebook(token: str, app_id: str, secret: str):
    """Short-lived user token -> long-lived user token -> the Page token of the Page linked to Instagram."""
    long = _check(requests.get(f"{GRAPH_FB}/oauth/access_token", params={
        "grant_type": "fb_exchange_token", "client_id": app_id, "client_secret": secret, "fb_exchange_token": token,
    }, timeout=30))["access_token"]
    pages = _check(requests.get(f"{GRAPH_FB}/me/accounts", params={
        "fields": "name,access_token,instagram_business_account{id,username}", "access_token": long,
    }, timeout=30)).get("data", [])
    linked = [p for p in pages if p.get("instagram_business_account")]
    if not linked:
        names = ", ".join(p["name"] for p in pages) or "none"
        sys.exit(f"No Facebook Page with a linked Instagram professional account (pages: {names}). "
                 "Link Instagram to the Page (Page settings -> Linked accounts), then make a new token.")
    page = linked[0]
    ig = page["instagram_business_account"]
    TOKEN_FILE.write_text(json.dumps({
        "mode": "facebook", "token": page["access_token"], "userId": ig["id"], "username": ig.get("username"),
        "page": page["name"], "refreshedAt": datetime.now(timezone.utc).isoformat(),
    }, indent=2))
    print(f"connected @{ig.get('username')} through the Facebook Page \"{page['name']}\"")


def cmd_setup(token: str, app_id: str = "", secret: str = ""):
    if app_id and secret:
        return setup_facebook(token.strip(), app_id.strip(), secret.strip())
    if token.strip().startswith("EAA"):
        sys.exit("That's a Facebook-login token: run setup <token> <app-id> <app-secret> (App settings -> Basic).")
    info = me(token.strip())
    TOKEN_FILE.write_text(json.dumps({
        "token": token.strip(),
        "userId": info.get("user_id") or info["id"],
        "username": info.get("username"),
        "refreshedAt": datetime.now(timezone.utc).isoformat(),
    }, indent=2))
    print(f"connected @{info.get('username')} ({info.get('account_type', '?')})")


def cmd_whoami():
    cfg = load()
    if cfg.get("mode") == "facebook":
        info = _check(requests.get(f"{GRAPH_FB}/{cfg['userId']}", params={"fields": "username", "access_token": cfg["token"]}, timeout=30))
        print(f"@{info.get('username')}  (via Facebook Page \"{cfg.get('page')}\")  id={cfg['userId']}")
        return
    info = me(cfg["token"])
    print(f"@{info.get('username')}  ({info.get('account_type', '?')})  id={cfg['userId']}")


def caption(m: dict) -> str:
    """The metadata's Instagram caption if it has one (social.instagram); else built from the YouTube text."""
    if m.get("social", {}).get("instagram"):
        return m["social"]["instagram"][:2200]
    title = m["title"].replace("#shorts", "").strip()
    lines = [ln.strip() for ln in m.get("description", "").splitlines() if ln.strip()]
    tags = [w for ln in lines for w in ln.split() if w.startswith("#") and w.lower() != "#shorts"]
    body = [ln for ln in lines if not ln.startswith("#") and "subscribe" not in ln.lower()]
    return "\n\n".join([title, "\n".join(body), "Follow for more how-it-works videos!", " ".join(tags + ["#reels", "#explore"])])[:2200]


def host_image(path: Path) -> str:
    """A public URL for a local image (Instagram's cover_url needs one): upload it to the Page as an unpublished photo."""
    cfg = load()
    pid = _check(requests.get(f"{GRAPH_FB}/me", params={"fields": "id", "access_token": cfg["token"]}, timeout=30))["id"]
    with open(path, "rb") as f:
        ph = _check(requests.post(f"{GRAPH_FB}/{pid}/photos", data={"published": "false", "access_token": cfg["token"]},
                                  files={"source": (path.name, f, "image/jpeg")}, timeout=120))
    imgs = _check(requests.get(f"{GRAPH_FB}/{ph['id']}", params={"fields": "images", "access_token": cfg["token"]}, timeout=30)).get("images", [])
    return max(imgs, key=lambda i: i.get("width", 0))["source"]


def post(meta_path: str) -> str:
    cfg = load()
    token, uid = cfg["token"], cfg["userId"]
    GRAPH = GRAPH_FB if cfg.get("mode") == "facebook" else GRAPH_IG
    m = json.loads(rel(meta_path).read_text(encoding="utf-8"))
    video = rel(m["file"])
    size = video.stat().st_size

    # 1. a Reel container that takes the file by resumable upload (no public URL needed)
    c = _check(requests.post(f"{GRAPH}/{uid}/media", data={
        "media_type": "REELS", "upload_type": "resumable", "caption": caption(m), "share_to_feed": "true", "access_token": token,
        # cover: our designed thumbnail when there is one (hosted as an unpublished Page photo), else the frame at coverMs
        **({"cover_url": host_image(rel(m["cover"]))} if m.get("cover") and rel(m["cover"]).exists() and cfg.get("mode") == "facebook"
           else {"thumb_offset": str(m["coverMs"])} if m.get("coverMs") is not None else {}),
    }, timeout=60))
    cid = c["id"]
    upload_uri = c.get("uri") or f"https://rupload.facebook.com/ig-api-upload/v21.0/{cid}"
    print(f"instagram: uploading {size / 1e6:.1f} MB ...", flush=True)
    with open(video, "rb") as f:
        r = requests.post(upload_uri, headers={"Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size)}, data=f, timeout=900)
    if not r.ok:
        sys.exit(f"Instagram upload failed {r.status_code}: {r.text[:300]}")

    # 2. wait for Instagram to process it
    for _ in range(120):
        st = _check(requests.get(f"{GRAPH}/{cid}", params={"fields": "status_code,status", "access_token": token}, timeout=30))
        code = st.get("status_code")
        if code == "FINISHED":
            break
        if code in ("ERROR", "EXPIRED"):
            sys.exit(f"Instagram couldn't process the video: {st.get('status')}")
        print(f"  processing ({code})", flush=True)
        time.sleep(10)
    else:
        sys.exit("Instagram is still processing after 20 minutes; try `post` again later.")

    # 3. publish
    pub = _check(requests.post(f"{GRAPH}/{uid}/media_publish", data={"creation_id": cid, "access_token": token}, timeout=60))
    link = _check(requests.get(f"{GRAPH}/{pub['id']}", params={"fields": "permalink", "access_token": token}, timeout=30)).get("permalink", "")
    print(f"instagram: posted {link}")
    return link


COMMANDS = {"setup": cmd_setup, "whoami": cmd_whoami, "post": post}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
