"""Echo Lab 3D: YouTube channel tool (official YouTube Data API v3 + YouTube Analytics API).

Run with uv (no install needed):
    python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py <command>

Commands
    launch                    auth + branding + upload both ultrasonic videos (first run)
    auth                      sign in once in the browser; saves channel/token.json
    whoami                    show the channel this token can manage
    branding                  apply channel/channel.json (description, keywords, country) + banner
    upload <video.json>       upload a video with its title, description, tags, thumbnail, playlist
    publish <videoId>         set a video public (after you've watched it)
    stats                     views / likes / comments for every upload
    analytics [days]          per-video watch time, retention, subs gained, traffic sources (default 28 days)
    retention <videoId>       audience-retention curve for one video

Your Google password never touches this script: `auth` opens Google's own sign-in page and stores
an OAuth token you can revoke at https://myaccount.google.com/permissions.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SECRET = HERE / "client_secret.json"
TOKEN = HERE / "token.json"
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    # replying to comments
    "https://www.googleapis.com/auth/youtube.force-ssl",
]


def creds() -> Credentials:
    c = Credentials.from_authorized_user_file(str(TOKEN), SCOPES) if TOKEN.exists() else None
    # a token from before a scope was added must sign in again to grant it
    if c and not set(SCOPES) <= set(json.loads(TOKEN.read_text()).get("scopes", [])):
        c = None
    if c and c.valid:
        return c
    if c and c.expired and c.refresh_token:
        c.refresh(Request())
    else:
        if not SECRET.exists():
            sys.exit(f"Missing {SECRET}. Follow channel/README.md step 2 to create it.")
        c = InstalledAppFlow.from_client_secrets_file(str(SECRET), SCOPES).run_local_server(port=0)
    TOKEN.write_text(c.to_json())
    return c


def yt():
    return build("youtube", "v3", credentials=creds())


def yta():
    return build("youtubeAnalytics", "v2", credentials=creds())


def my_channel(y):
    items = y.channels().list(part="id,snippet,statistics,brandingSettings", mine=True).execute().get("items", [])
    if not items:
        sys.exit("This Google account has no YouTube channel yet. Create it first (README step 1).")
    return items[0]


def rel(p: str) -> Path:
    path = Path(str(p).replace("\\", "/"))  # paths written on Windows (backslashes) work in the cloud too
    return path if path.is_absolute() else ROOT / path


# ---- commands -------------------------------------------------------------------------------

def cmd_auth():
    creds()
    cmd_whoami()


def cmd_whoami():
    ch = my_channel(yt())
    s = ch["statistics"]
    print(f'{ch["snippet"]["title"]}  ({ch["id"]})  subs={s.get("subscriberCount")}  videos={s.get("videoCount")}  views={s.get("viewCount")}')


def cmd_branding():
    y = yt()
    cfg = json.loads((HERE / "channel.json").read_text(encoding="utf-8"))
    ch = my_channel(y)
    branding = {"channel": {
        "description": cfg["description"],
        "keywords": " ".join(f'"{k}"' if " " in k else k for k in cfg["keywords"]),
        "country": cfg["country"],
        "defaultLanguage": cfg["language"],
    }}
    banner = rel(cfg["banner"])
    if banner.exists():
        res = y.channelBanners().insert(media_body=MediaFileUpload(str(banner), mimetype="image/png")).execute()
        branding["image"] = {"bannerExternalUrl": res["url"]}
        print("banner uploaded")
    y.channels().update(part="brandingSettings", body={"id": ch["id"], "brandingSettings": branding}).execute()
    print("description, keywords, country and language set")
    print("Still manual (no API): channel name/handle, profile picture, watermark, links. See README step 3.")


def playlist_id(y, title: str, description: str) -> str:
    req = y.playlists().list(part="snippet", mine=True, maxResults=50)
    while req:
        res = req.execute()
        for p in res.get("items", []):
            if p["snippet"]["title"] == title:
                return p["id"]
        req = y.playlists().list_next(req, res)
    p = y.playlists().insert(part="snippet,status", body={
        "snippet": {"title": title, "description": description},
        "status": {"privacyStatus": "public"},
    }).execute()
    print(f"created playlist {title}")
    return p["id"]


def check_channel(y):
    """Stops if the signed-in account isn't the channel in channel.json (channelId)."""
    want = json.loads((HERE / "channel.json").read_text(encoding="utf-8")).get("channelId")
    ch = my_channel(y)
    if want and ch["id"] != want:
        sys.exit(f'Signed in as "{ch["snippet"]["title"]}" ({ch["id"]}), not channel {want}. '
                 f"Delete channel/token.json and run `auth` with the right account.")


def cmd_upload(meta_path: str):
    y = yt()
    check_channel(y)
    m = json.loads(rel(meta_path).read_text(encoding="utf-8"))
    body = {
        "snippet": {
            "title": m["title"],
            "description": m["description"],
            "tags": m["tags"],
            "categoryId": m.get("categoryId", "28"),
            "defaultLanguage": m.get("language", "en"),
            "defaultAudioLanguage": m.get("language", "en"),
        },
        "status": {
            # Uploads from unaudited API projects are forced to private anyway; publish after review.
            "privacyStatus": m.get("privacy", "private"),
            "selfDeclaredMadeForKids": False,
            "embeddable": True,
            "license": "youtube",
        },
    }
    if m.get("publishAt"):
        body["status"]["privacyStatus"] = "private"
        body["status"]["publishAt"] = m["publishAt"]
    media = MediaFileUpload(str(rel(m["file"])), chunksize=8 * 1024 * 1024, resumable=True)
    req = y.videos().insert(part="snippet,status", body=body, media_body=media)
    res = None
    drops = 0
    while res is None:
        try:
            status, res = req.next_chunk()
        except (ConnectionError, OSError) as e:  # a dropped connection resumes the upload where it stopped
            drops += 1
            if drops > 8:
                raise
            print(f"\n  connection dropped ({e.__class__.__name__}), resuming in {10 * drops}s", flush=True)
            import time
            time.sleep(10 * drops)
            continue
        if status:
            print(f"\r  uploading {status.progress() * 100:5.1f}%", end="", flush=True)
    vid = res["id"]
    print(f"\nuploaded https://youtu.be/{vid}  ({res['status']['privacyStatus']})")
    if m.get("thumbnail"):
        try:
            y.thumbnails().set(videoId=vid, media_body=MediaFileUpload(str(rel(m["thumbnail"])))).execute()
            print("thumbnail set")
        except Exception as e:  # unverified channels and Shorts can't take custom thumbnails
            print(f"! thumbnail not set ({e}). Verify the channel at youtube.com/verify, or pick a frame in the app for Shorts.")
    if m.get("playlist"):
        # a playlist hiccup (YouTube sometimes answers 409 "operation aborted") must not lose the uploaded video
        try:
            pid = playlist_id(y, m["playlist"]["title"], m["playlist"].get("description", ""))
            y.playlistItems().insert(part="snippet", body={"snippet": {"playlistId": pid, "resourceId": {"kind": "youtube#video", "videoId": vid}}}).execute()
            print(f'added to playlist {m["playlist"]["title"]}')
        except Exception as e:  # noqa: BLE001
            print(f"! not added to the playlist ({str(e)[:120]})")
    log = HERE / "uploads.json"
    hist = json.loads(log.read_text(encoding="utf-8")) if log.exists() else []
    hist.append({"id": vid, "meta": meta_path, "date": date.today().isoformat()})
    log.write_text(json.dumps(hist, indent=2, ensure_ascii=False), encoding="utf-8")


def cmd_publish(vid: str):
    y = yt()
    y.videos().update(part="status", body={"id": vid, "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False}}).execute()
    print(f"https://youtu.be/{vid} is public")


def uploads(y):
    ch = my_channel(y)
    pl = ch.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
    if not pl:
        pl = y.channels().list(part="contentDetails", id=ch["id"]).execute()["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    ids = []
    req = y.playlistItems().list(part="contentDetails", playlistId=pl, maxResults=50)
    while req:
        res = req.execute()
        ids += [i["contentDetails"]["videoId"] for i in res.get("items", [])]
        req = y.playlistItems().list_next(req, res)
    return ids


def cmd_stats():
    y = yt()
    ids = uploads(y)
    for i in range(0, len(ids), 50):
        for v in y.videos().list(part="snippet,statistics,status", id=",".join(ids[i:i + 50])).execute()["items"]:
            s = v["statistics"]
            print(f'{v["id"]}  {v["status"]["privacyStatus"]:8s} views={s.get("viewCount", 0):>7} likes={s.get("likeCount", 0):>5} comments={s.get("commentCount", 0):>4}  {v["snippet"]["title"][:60]}')


def cmd_analytics(days: str = "28"):
    a = yta()
    end = date.today()
    start = end - timedelta(days=int(days))
    common = dict(ids="channel==MINE", startDate=start.isoformat(), endDate=end.isoformat())
    r = a.reports().query(**common, dimensions="video", sort="-views", maxResults=50,
                          metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,shares,comments,subscribersGained").execute()
    titles = {}
    ids = [row[0] for row in r.get("rows", [])]
    if ids:
        for v in yt().videos().list(part="snippet", id=",".join(ids[:50])).execute()["items"]:
            titles[v["id"]] = v["snippet"]["title"]
    print(f"Last {days} days, by video")
    print(f'{"video":12s} {"views":>7} {"min":>7} {"avgDur":>6} {"avg%":>5} {"likes":>5} {"shares":>6} {"subs+":>5}  title')
    for row in r.get("rows", []):
        vid, views, mins, avd, avp, likes, shares, _comments, subs = row
        print(f"{vid:12s} {views:>7} {mins:>7.0f} {avd:>5}s {avp:>4.0f}% {likes:>5} {shares:>6} {subs:>5}  {titles.get(vid, '')[:50]}")
    t = a.reports().query(**common, dimensions="insightTrafficSourceType", metrics="views", sort="-views").execute()
    print("\nWhere views come from")
    for src, views in t.get("rows", []):
        print(f"  {src:28s} {views}")
    out = HERE / "analytics" / f"{end.isoformat()}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"byVideo": r, "traffic": t}, indent=2))
    print(f"\nsaved {out.relative_to(ROOT)} (ask Claude to read it and suggest changes)")


def cmd_retention(vid: str):
    a = yta()
    end = date.today()
    r = a.reports().query(ids="channel==MINE", startDate=(end - timedelta(days=365)).isoformat(), endDate=end.isoformat(),
                          dimensions="elapsedVideoTimeRatio", metrics="audienceWatchRatio,relativeRetentionPerformance",
                          filters=f"video=={vid}").execute()
    for ratio, watch, rel_perf in r.get("rows", []):
        bar = "█" * int(watch * 40)
        print(f"{ratio * 100:5.1f}%  {watch:4.2f}  {rel_perf:4.2f}  {bar}")


def cmd_launch():
    """Everything after sign-in, in one go: branding, then the long video and the Short."""
    cmd_auth()
    cmd_branding()
    for meta in ["channel/videos/ultrasonic-long.json", "channel/videos/ultrasonic-short.json"]:
        cmd_upload(meta)
    print("\nDone. Watch both videos in YouTube Studio, then run `publish <videoId>` for each (or flip them to Public).")


COMMANDS = {
    "launch": cmd_launch,
    "auth": cmd_auth, "whoami": cmd_whoami, "branding": cmd_branding, "upload": cmd_upload,
    "publish": cmd_publish, "stats": cmd_stats, "analytics": cmd_analytics, "retention": cmd_retention,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
