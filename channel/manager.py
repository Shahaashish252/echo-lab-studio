"""Echo Lab 3D channel manager: runs the channel day to day.

With "autopilot": true in schedule.json (set 2026-10-17, the owner handed the channel over) new videos are
scheduled straight into the postAt slots and comment replies are sent automatically; comments about money,
deals, legal issues or complaints are flagged for the owner instead. Set it to false to approve everything again.

    python -m uv run --with google-api-python-client --with google-auth-oauthlib --with requests python channel/manager.py <command>

Commands
    daily        (scheduled, every morning) make the next topic's video and upload it to YouTube as private,
                 draft replies to new comments, refresh the dashboard, then notify you
    review       (you) approve / publish now / reject new videos, and send / edit / skip reply drafts
    post-due     (scheduled, every 30 min) publish approved videos whose time has come: YouTube public + Instagram Reel
    comments     fetch new YouTube + Instagram comments and draft replies
    dashboard    refresh channel/dashboard.html (YouTube + Instagram numbers) and open it
    topics       show the topic queue

Files: topics.json (queue), schedule.json (times), uploads.json (videos and their status),
manager.json (comment drafts, seen comments), analytics/history.json (daily totals), logs/.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

if sys.stdout:  # None when imported by the windowless dashboard server (pythonw)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import instagram  # noqa: E402
import youtube  # noqa: E402

HERE = youtube.HERE
ROOT = youtube.ROOT
APP = ROOT / "app"
UPLOADS = HERE / "uploads.json"
TOPICS = HERE / "topics.json"
SCHEDULE = HERE / "schedule.json"
STATE = HERE / "manager.json"
HISTORY = HERE / "analytics" / "history.json"
DASHBOARD = HERE / "dashboard.html"


def read(p: Path, default):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def write(p: Path, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def toast(title: str, text: str):
    """Windows notification, so the scheduled jobs can tell you something is waiting (just printed in the cloud)."""
    if os.name != "nt":
        print(f"[notify] {title}: {text}")
        return
    ps = (
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;"
        "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);"
        "$x = $t.GetElementsByTagName('text');"
        f"$x.Item(0).AppendChild($t.CreateTextNode({json.dumps(title)})) > $null;"
        f"$x.Item(1).AppendChild($t.CreateTextNode({json.dumps(text)})) > $null;"
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("
        "'{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True)
    print(f"[notify] {title}: {text}")


def ai(prompt: str) -> str:
    """One answer from Claude Code (your subscription), the same way the video maker writes scripts."""
    cli = shutil.which("claude")
    if not cli:
        raise RuntimeError("claude CLI not found")
    env = {k: v for k, v in os.environ.items() if not k.startswith("ANTHROPIC_") and not k.startswith("CLAUDE_CODE_USE_")}
    r = subprocess.run([cli, "-p", "--output-format", "text", "--tools", "", "--safe-mode"], input=prompt, text=True,
                       encoding="utf-8", capture_output=True, cwd=tempfile.gettempdir(), env=env, timeout=300)
    if r.returncode:
        raise RuntimeError(f"claude failed: {(r.stderr or r.stdout)[:300]}")
    return r.stdout


def ai_json(prompt: str):
    out = ai(prompt)
    a, b = min((i for i in (out.find("{"), out.find("[")) if i >= 0), default=-1), max(out.rfind("}"), out.rfind("]"))
    return json.loads(out[a:b + 1])


def schedule() -> dict:
    return read(SCHEDULE, {"makeAt": "09:00", "postAt": "18:00", "niche": "how everyday tech works"})


# ---- topics -------------------------------------------------------------------------------------

def next_topic() -> dict:
    t = read(TOPICS, {"queue": [], "done": []})
    if len(t["queue"]) < 3:
        # top up the queue with fresh ideas that fit the channel and haven't been done,
        # steered by what has actually performed (saved by the dashboard)
        perf = read(HERE / "analytics" / "videos.json", [])
        perf_txt = ""
        if perf:
            ranked = sorted(perf, key=lambda v: v.get("views", 0), reverse=True)
            perf_txt = ("Our videos so far, best first (title / views / likes / comments): "
                        + json.dumps([[v["title"], v.get("views", 0), v.get("likes", 0), v.get("comments", 0)] for v in ranked[:25]], ensure_ascii=False)
                        + "\nThink like a top Shorts creator: lean into the subjects and hook styles of the winners, drop what flopped, "
                          "and mix in a few broader everyday-tech topics with big search demand to reach new viewers.\n")
        ideas = ai_json(
            f"Suggest 10 new topics for 30-45 second vertical explainer videos on a channel where {schedule()['niche']}. "
            + ("The videos are narrated in Hindi for viewers in India: favour gadgets, appliances and electronics Indian students "
               "and makers use and search for. Write the topic and hook in simple English.\n" if video_language() == "hi"
               else "The videos are in English for a global audience.\n") +
            f"{perf_txt}"
            f"Already done or queued (don't repeat): {json.dumps(t['done'] + [q['topic'] for q in t['queue']])}\n"
            'Reply with ONLY a JSON array of {"topic": "short topic", "hook": "the first line on screen, max 12 words, '
            'a curiosity hook"}. Concrete, visual, popular search topics.'
        )
        t["queue"] += [{"topic": str(i["topic"])[:80], "hook": str(i.get("hook", ""))[:120]} for i in ideas if i.get("topic")]
        write(TOPICS, t)
    return t["queue"][0]


def finish_topic(topic: str):
    t = read(TOPICS, {"queue": [], "done": []})
    t["queue"] = [q for q in t["queue"] if q["topic"] != topic]
    t["done"].append(topic)
    write(TOPICS, t)


def cmd_topics():
    t = read(TOPICS, {"queue": [], "done": []})
    for i, q in enumerate(t["queue"], 1):
        print(f"{i:3d}. {q['topic']}  ({q['hook']})")
    print(f"\n{len(t['done'])} done")


# ---- videos -------------------------------------------------------------------------------------

def uploads() -> list:
    return read(UPLOADS, [])


def meta(entry: dict) -> dict:
    return json.loads(youtube.rel(entry["meta"]).read_text(encoding="utf-8"))


def post_times() -> list:
    """schedule.json postAt: one "HH:MM" or a list of them (one video per time per day)."""
    at = schedule()["postAt"]
    return sorted(at if isinstance(at, list) else [at])


def next_slot(taken: list) -> str:
    """The earliest upcoming post time that no other approved video has."""
    soon = datetime.now() + timedelta(minutes=10)
    day = datetime.now().replace(second=0, microsecond=0)
    for d in range(60):
        for hm in post_times():
            hh, mm = map(int, hm.split(":"))
            slot = (day + timedelta(days=d)).replace(hour=hh, minute=mm)
            if slot > soon and slot.isoformat(timespec="minutes") not in taken:
                return slot.isoformat(timespec="minutes")
    raise RuntimeError("no free post slot in the next 60 days")


def followers() -> int:
    """The bigger of YouTube subscribers and Instagram followers, from the latest dashboard refresh."""
    hist = read(HISTORY, [])
    last = hist[-1] if hist else {}
    return max(last.get("ytSubs") or 0, last.get("igFollowers") or 0)


def video_language() -> str:
    """schedule.json language: "hi", "en", or "auto" = Hindi until switchToEnglishAt followers (owner's plan, 2026-10-17)."""
    s = schedule()
    lang = s.get("language", "en")
    if lang == "auto":
        lang = "en" if followers() >= int(s.get("switchToEnglishAt", 10000)) else "hi"
    return lang


def taken_slots() -> list:
    return [u.get("postAt") for u in uploads() if u.get("status") == "approved"]


JOBS = HERE / "jobs"


def save_job(job: dict):
    write(JOBS / f"{job['id']}.json", job)


def run_tracked(cmd: list, job: dict) -> int:
    """Runs the video maker, mirroring its output to jobs/<id>.log and its "== step" lines to the job's stages,
    so the web dashboard can show the making live."""
    JOBS.mkdir(parents=True, exist_ok=True)
    log = open(JOBS / f"{job['id']}.log", "a", encoding="utf-8")
    p = subprocess.Popen(cmd, cwd=APP, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    for line in p.stdout:
        print(line, end="")
        log.write(line)
        log.flush()
        if line.startswith("== "):
            now = datetime.now().isoformat(timespec="seconds")
            job["stages"].append({"name": line[3:].strip(), "at": now})
            save_job(job)
            if os.environ.get("GITHUB_ACTIONS"):
                # show the step on the online dashboard: save state and rebuild the page (in the background)
                subprocess.Popen(["bash", "-c", 'bash .github/scripts/save-state.sh "making: step" && gh workflow run pages.yml'],
                                 cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log.close()
    return p.wait()


def make_video(topic: dict | None = None) -> dict | None:
    topic = topic or next_topic()
    before = len(uploads())
    prompt = f"{topic['topic']}" + (f' (open with this hook: "{topic["hook"]}")' if topic.get("hook") else "")
    lang = video_language()
    print(f"making ({lang}): {prompt}")
    job = {"id": datetime.now().strftime("%Y%m%d-%H%M%S"), "topic": topic["topic"], "hook": topic.get("hook", ""), "lang": lang,
           "started": datetime.now().isoformat(timespec="seconds"), "status": "running", "stages": []}
    save_job(job)
    code = run_tracked(["bun", "scripts/auto.ts", prompt, "--upload", "--lang", lang], job)
    ups = uploads()
    job["finished"] = datetime.now().isoformat(timespec="seconds")
    if code or len(ups) <= before:
        job["status"] = "failed"
        save_job(job)
        toast("Echo Lab: video failed", f"Couldn't make \"{topic['topic']}\". See the dashboard.")
        return None
    job.update({"status": "done", "uploadId": ups[-1]["id"]})
    save_job(job)
    store_video(ups[-1])
    ups[-1].update({"status": "pending", "topic": topic["topic"], "job": job["id"]})
    if schedule().get("autopilot"):
        # the owner handed the channel over (2026-10-17): schedule straight into the next free slot
        ups[-1].update({"status": "approved", "postAt": next_slot([u.get("postAt") for u in ups if u.get("status") == "approved"])})
        print(f"autopilot: scheduled for {ups[-1]['postAt'].replace('T', ' ')}")
    write(UPLOADS, ups)
    finish_topic(topic["topic"])
    return ups[-1]


CLOUD = bool(os.environ.get("GITHUB_ACTIONS"))
RELEASE = "videos"  # GitHub release that holds the cloud-made video files between making and posting


def store_video(entry: dict):
    """Cloud runs forget their files: keep the finished video in the repo's 'videos' release."""
    if not CLOUD:
        return
    f = youtube.rel(meta(entry)["file"])
    if subprocess.run(["gh", "release", "view", RELEASE], capture_output=True).returncode:
        subprocess.run(["gh", "release", "create", RELEASE, "--title", "Video files", "--notes",
                        "Finished videos waiting to be posted (kept by the cloud jobs)."], check=False)
    r = subprocess.run(["gh", "release", "upload", RELEASE, str(f), "--clobber"], capture_output=True, text=True)
    print(f"stored {f.name} in release '{RELEASE}'" if r.returncode == 0 else f"store failed: {r.stderr[:200]}")


def ensure_video(entry: dict) -> bool:
    """Make sure the video file is on this machine, fetching it from the 'videos' release in the cloud."""
    f = youtube.rel(meta(entry)["file"])
    if f.exists():
        return True
    if CLOUD:
        f.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["gh", "release", "download", RELEASE, "-p", f.name, "-D", str(f.parent), "--clobber"], check=False)
    return f.exists()


def add_cover(entry: dict):
    """Make the video's click-worthy cover (thumbnail.py), note it in the metadata, and set it as the YouTube thumbnail."""
    mp = youtube.rel(entry["meta"])
    m = json.loads(mp.read_text(encoding="utf-8"))
    if m.get("cover") and youtube.rel(m["cover"]).exists():
        return
    try:
        import thumbnail
        cover = thumbnail.make(entry["meta"])
        m["cover"] = str(cover)
        mp.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"cover: {cover}")
    except Exception as e:  # noqa: BLE001
        print(f"cover not made: {e}")
        return
    try:
        from googleapiclient.http import MediaFileUpload
        youtube.yt().thumbnails().set(videoId=entry["id"], media_body=MediaFileUpload(str(cover), mimetype="image/jpeg")).execute()
        print("youtube: thumbnail set")
    except Exception as e:  # noqa: BLE001
        print(f"youtube: thumbnail not set ({str(e)[:160]})")


def publish_entry(entry: dict):
    """YouTube public + Instagram Reel + Facebook Reel, each with our designed cover, recorded on the entry."""
    pub = entry.setdefault("published", {})
    if not ensure_video(entry):
        print(f"video file missing for {entry['id']}: posting YouTube only")
    add_cover(entry)
    if "youtube" not in pub:
        youtube.cmd_publish(entry["id"])
        pub["youtube"] = date.today().isoformat()
    if "instagram" not in pub and instagram.TOKEN_FILE.exists():
        try:
            pub["instagram"] = instagram.post(entry["meta"]) or date.today().isoformat()
        except (Exception, SystemExit) as e:  # noqa: BLE001  one platform failing must not stop the others
            print(f"instagram: {e}")
    if "facebook" not in pub and instagram.TOKEN_FILE.exists():
        try:
            import facebook
            pub["facebook"] = facebook.post(entry["meta"])
        except (Exception, SystemExit) as e:  # noqa: BLE001
            print(f"facebook: {e}")
    entry["status"] = "published"
    entry.setdefault("postedAt", datetime.now().isoformat(timespec="minutes"))  # first post time; retries keep it
    if CLOUD and all(k in pub for k in ("youtube", "instagram", "facebook")):
        # posted everywhere: YouTube keeps the original, so free the GitHub storage copy
        name = youtube.rel(meta(entry)["file"]).name
        subprocess.run(["gh", "release", "delete-asset", RELEASE, name, "-y"], capture_output=True)
        print(f"removed {name} from release storage (posted everywhere)")


def cmd_post_due():
    ups = uploads()
    now = datetime.now().isoformat(timespec="minutes")
    due = sorted((u for u in ups if u.get("status") == "approved" and u.get("postAt", "9") <= now), key=lambda u: u["postAt"])
    # the PC isn't on every day: after a gap, catch up one video at a time, at least 3 hours apart, instead of dumping them all
    last = max((u.get("postedAt", "") for u in ups), default="")
    if due and last and datetime.fromisoformat(last) > datetime.now() - timedelta(hours=3):
        print(f"{len(due)} due, but the last post was at {last}; waiting so posts stay 3 h apart")
        due = []
    if not due:
        # catch-up: a platform that failed (Instagram throttling, a dropped connection) is retried for 2 days
        cutoff = (datetime.now() - timedelta(days=2)).isoformat(timespec="minutes")
        missed = [u for u in ups if u.get("status") == "published" and u.get("postedAt", "") >= cutoff
                  and not all(k in u.get("published", {}) for k in ("youtube", "instagram", "facebook"))
                  and u.get("retryAfter", "") <= now]
        for u in missed[:1]:
            have = sorted(u.get("published", {}))
            print(f"retrying missing platforms for {meta(u)['title']} (has {have})")
            publish_entry(u)
            if not all(k in u["published"] for k in ("youtube", "instagram", "facebook")):
                u["retryAfter"] = (datetime.now() + timedelta(hours=1)).isoformat(timespec="minutes")
            write(UPLOADS, ups)
    for u in due[:1]:
        m = meta(u)
        print(f"publishing {m['title']}")
        publish_entry(u)
        write(UPLOADS, ups)
        # TikTok has no free posting API: leave the caption ready and say so
        m_file = youtube.rel(m["file"])
        sys.path.insert(0, str(HERE))
        import publish
        m_file.with_suffix(".tiktok.txt").write_text(publish.tiktok_caption(m), encoding="utf-8")
        toast("Echo Lab: posted", f"\"{m['title'][:60]}\" is live on YouTube + Instagram. Run tiktok.bat to post it on TikTok.")


# ---- comments -----------------------------------------------------------------------------------

def yt_comments(state: dict) -> list:
    y = youtube.yt()
    ch = youtube.my_channel(y)
    seen = set(state.setdefault("seen", []))
    since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
    out = []
    res = y.commentThreads().list(part="snippet,replies", allThreadsRelatedToChannelId=ch["id"], maxResults=50,
                                  order="time", textFormat="plainText").execute()
    titles = {}
    for th in res.get("items", []):
        top = th["snippet"]["topLevelComment"]
        s = top["snippet"]
        replied = any(r["snippet"].get("authorChannelId", {}).get("value") == ch["id"] for r in th.get("replies", {}).get("comments", []))
        if top["id"] in seen or replied or s.get("authorChannelId", {}).get("value") == ch["id"] or s["publishedAt"] < since:
            continue
        vid = th["snippet"].get("videoId", "")
        if vid not in titles:
            items = y.videos().list(part="snippet", id=vid).execute().get("items", [])
            titles[vid] = items[0]["snippet"]["title"] if items else ""
        out.append({"key": f"yt:{top['id']}", "platform": "youtube", "id": top["id"], "video": titles[vid],
                    "author": s["authorDisplayName"], "text": s["textDisplay"]})
    return out


def ig_comments(state: dict) -> list:
    cfg = instagram.load()
    g = instagram.GRAPH_FB if cfg.get("mode") == "facebook" else instagram.GRAPH_IG
    seen = set(state.setdefault("seen", []))
    media = instagram._check(requests.get(f"{g}/{cfg['userId']}/media", params={
        "fields": "id,caption,comments_count", "limit": 20, "access_token": cfg["token"]}, timeout=30)).get("data", [])
    out = []
    for md in media:
        if not md.get("comments_count"):
            continue
        cs = instagram._check(requests.get(f"{g}/{md['id']}/comments", params={
            "fields": "id,text,username,replies{username}", "limit": 50, "access_token": cfg["token"]}, timeout=30)).get("data", [])
        for c in cs:
            replied = any(r.get("username") == cfg.get("username") for r in c.get("replies", {}).get("data", []))
            if c["id"] in seen or replied or c.get("username") == cfg.get("username"):
                continue
            out.append({"key": f"ig:{c['id']}", "platform": "instagram", "id": c["id"],
                        "video": (md.get("caption") or "").split("\n")[0][:80], "author": c.get("username", ""), "text": c.get("text", "")})
    return out


def fb_comments(state: dict) -> list:
    """New comments on the Page's Facebook Reels."""
    cfg = instagram.load()
    g, t = instagram.GRAPH_FB, cfg["token"]
    seen = set(state.setdefault("seen", []))
    pid = instagram._check(requests.get(f"{g}/me", params={"fields": "id", "access_token": t}, timeout=30))["id"]
    reels = instagram._check(requests.get(f"{g}/{pid}/video_reels", params={"fields": "id,description", "limit": 20, "access_token": t}, timeout=30)).get("data", [])
    out = []
    for rl in reels:
        cs = instagram._check(requests.get(f"{g}/{rl['id']}/comments", params={
            "fields": "id,message,from,comments{from}", "limit": 50, "access_token": t}, timeout=30)).get("data", [])
        for c in cs:
            mine = (c.get("from") or {}).get("id") == pid
            replied = any((r.get("from") or {}).get("id") == pid for r in (c.get("comments") or {}).get("data", []))
            if c["id"] in seen or mine or replied:
                continue
            out.append({"key": f"fb:{c['id']}", "platform": "facebook", "id": c["id"],
                        "video": (rl.get("description") or "").split("\n")[0][:80], "author": (c.get("from") or {}).get("name", ""),
                        "text": c.get("message", "")})
    return out


def cmd_comments():
    state = read(STATE, {"drafts": [], "seen": []})
    new = []
    for name, fetch in (("youtube", yt_comments), ("instagram", ig_comments), ("facebook", fb_comments)):
        try:
            got = fetch(state)
            print(f"{name}: {len(got)} new comments")
            new += got
        except (Exception, SystemExit) as e:
            print(f"{name} comments skipped: {e}")
    queued = {d["key"] for d in state["drafts"]}
    new = [c for c in new if c["key"] not in queued]
    auto = bool(schedule().get("autopilot"))
    flagged = []
    if new:
        replies = ai_json(
            "You run the Echo Lab 3D channel (short animated explainers of sensors, circuits and everyday tech). "
            "Draft a reply to each comment below: friendly, natural, like a real creator, max 200 characters, "
            "reply in the commenter's language, answer questions correctly and simply, thank compliments in a varied way, "
            "invite a follow-up question now and then, at most one emoji, no links, no hashtags. Use SKIP for spam, scams, "
            "abuse or self-promo. Use FLAG (no reply) for anything the owner should handle personally: money, payments, "
            "sponsorships, collaborations or business offers, legal or copyright claims, serious complaints, safety or "
            "medical risk, personal information, or anything you are unsure is correct.\n"
            f"Comments: {json.dumps([{k: c[k] for k in ('key', 'video', 'author', 'text')} for c in new], ensure_ascii=False)}\n"
            'Reply with ONLY a JSON object {"<key>": "<reply, SKIP or FLAG>"}.'
        )
        sent = 0
        for c in new:
            draft = str(replies.get(c["key"], "")).strip()
            state["seen"].append(c["id"])
            if not draft or draft.upper() == "SKIP":
                continue
            if draft.upper() == "FLAG":
                flagged.append(c)
                continue
            if auto:
                try:
                    send_reply(c, draft)
                    sent += 1
                    continue
                except (Exception, SystemExit) as e:
                    print(f"  auto-reply failed ({e}); kept as a draft")
            state["drafts"].append({**c, "draft": draft})
        if auto:
            print(f"autopilot: sent {sent} replies")
    if flagged:
        state.setdefault("flagged", []).extend(flagged)
        toast("Echo Lab: comments for you", f"{len(flagged)} comment(s) need you personally (deals, money or complaints). "
              "See flagged in channel/manager.json.")
    state["seen"] = state["seen"][-2000:]
    write(STATE, state)
    print(f"{len(state['drafts'])} reply drafts waiting, {len(flagged)} flagged for you")
    return len(state["drafts"])


def send_reply(d: dict, text: str):
    if d["platform"] == "youtube":
        youtube.yt().comments().insert(part="snippet", body={"snippet": {"parentId": d["id"], "textOriginal": text}}).execute()
    elif d["platform"] == "facebook":
        cfg = instagram.load()
        instagram._check(requests.post(f"{instagram.GRAPH_FB}/{d['id']}/comments", data={"message": text, "access_token": cfg["token"]}, timeout=30))
    else:
        cfg = instagram.load()
        g = instagram.GRAPH_FB if cfg.get("mode") == "facebook" else instagram.GRAPH_IG
        instagram._check(requests.post(f"{g}/{d['id']}/replies", data={"message": text, "access_token": cfg["token"]}, timeout=30))


# ---- review -------------------------------------------------------------------------------------

def ask(q: str) -> str:
    try:
        return input(q).strip()
    except EOFError:
        return ""


def cmd_review():
    ups = uploads()
    pending = [u for u in ups if u.get("status") == "pending"]
    print(f"== {len(pending)} video(s) waiting for your OK\n")
    for u in pending:
        m = meta(u)
        print(f"{m['title']}\n  watch: https://youtu.be/{u['id']}  (private: open it while signed in)")
        while True:
            a = ask("  [w]atch  [a]pprove for next post time  [n]ow  [r]eject  [Enter] later: ").lower()
            if a == "w":
                subprocess.run(["cmd", "/c", "start", "", f"https://youtu.be/{u['id']}"])
                continue
            break
        if a == "a":
            u["postAt"] = next_slot([x.get("postAt") for x in ups if x.get("status") == "approved"])
            u["status"] = "approved"
            print(f"  scheduled for {u['postAt'].replace('T', ' ')}")
        elif a == "n":
            publish_entry(u)
            print("  published")
        elif a == "r":
            u["status"] = "rejected"
            print("  rejected (stays private)")
        write(UPLOADS, ups)

    state = read(STATE, {"drafts": [], "seen": []})
    drafts = state["drafts"]
    print(f"\n== {len(drafts)} comment repl{'y' if len(drafts) == 1 else 'ies'} drafted\n")
    keep = []
    for d in drafts:
        print(f"[{d['platform']}] {d['video'][:50]}\n  {d['author']}: {d['text']}\n  reply: {d['draft']}")
        a = ask("  [y] send  [e]dit  [n] discard  [Enter] later: ").lower()
        if a in ("y", "e"):
            text = d["draft"] if a == "y" else ask("  your reply: ") or d["draft"]
            try:
                send_reply(d, text)
                print("  sent")
            except (Exception, SystemExit) as e:
                print(f"  not sent: {e}")
                keep.append(d)
        elif a != "n":
            keep.append(d)
        print()
    state["drafts"] = keep
    write(STATE, state)
    cmd_dashboard()


# ---- dashboard ----------------------------------------------------------------------------------

def yt_numbers() -> dict:
    y = youtube.yt()
    ch = youtube.my_channel(y)
    ids = youtube.uploads(y)
    vids = []
    for i in range(0, len(ids), 50):
        for v in y.videos().list(part="snippet,statistics,status", id=",".join(ids[i:i + 50])).execute()["items"]:
            s = v["statistics"]
            vids.append({"title": v["snippet"]["title"], "id": v["id"], "status": v["status"]["privacyStatus"],
                         "published": v["snippet"]["publishedAt"][:10], "views": int(s.get("viewCount", 0)),
                         "likes": int(s.get("likeCount", 0)), "comments": int(s.get("commentCount", 0))})
    daily = []
    try:
        end = date.today()
        r = youtube.yta().reports().query(ids="channel==MINE", startDate=(end - timedelta(days=28)).isoformat(), endDate=end.isoformat(),
                                          dimensions="day", metrics="views,estimatedMinutesWatched,subscribersGained", sort="day").execute()
        daily = [{"day": d, "views": v, "minutes": m, "subs": s} for d, v, m, s in r.get("rows", [])]
    except Exception as e:
        print(f"youtube analytics: {e}")
    s = ch["statistics"]
    return {"subs": int(s.get("subscriberCount", 0)), "views": int(s.get("viewCount", 0)), "videos": vids, "daily": daily}


def ig_numbers() -> dict:
    cfg = instagram.load()
    g = instagram.GRAPH_FB if cfg.get("mode") == "facebook" else instagram.GRAPH_IG
    acct = instagram._check(requests.get(f"{g}/{cfg['userId']}", params={"fields": "username,followers_count,media_count", "access_token": cfg["token"]}, timeout=30))
    media = instagram._check(requests.get(f"{g}/{cfg['userId']}/media", params={
        "fields": "id,caption,permalink,timestamp,like_count,comments_count", "limit": 25, "access_token": cfg["token"]}, timeout=30)).get("data", [])
    posts = []
    for md in media:
        p = {"title": (md.get("caption") or "").split("\n")[0][:70], "url": md.get("permalink"), "published": md.get("timestamp", "")[:10],
             "likes": md.get("like_count", 0), "comments": md.get("comments_count", 0)}
        # reach / views / saves / shares need instagram_manage_insights; skipped without it
        r = requests.get(f"{g}/{md['id']}/insights", params={"metric": "reach,views,saved,shares", "access_token": cfg["token"]}, timeout=30)
        if r.ok:
            for item in r.json().get("data", []):
                p[item["name"]] = item["values"][0]["value"]
        posts.append(p)
    return {"username": acct.get("username"), "followers": acct.get("followers_count", 0), "posts": posts}


def cmd_dashboard(open_it: bool = True):
    data = {"updated": datetime.now().strftime("%d %b %Y, %H:%M")}
    previous = read(LATEST, {})
    fresh = 0
    for name, fn in (("youtube", yt_numbers), ("instagram", ig_numbers)):
        try:
            data[name] = fn()
            fresh += 1
        except (Exception, SystemExit) as e:
            # no internet / API hiccup: keep the last good numbers instead of wiping them
            print(f"{name} numbers skipped: {str(e)[:160]}")
            data[name] = previous.get(name)
    if not fresh:
        data["updated"] = previous.get("updated", data["updated"])
    hist = read(HISTORY, [])
    today = date.today().isoformat()
    hist = [h for h in hist if h["day"] != today] + [{
        "day": today,
        "ytSubs": (data["youtube"] or {}).get("subs"), "ytViews": (data["youtube"] or {}).get("views"),
        "igFollowers": (data["instagram"] or {}).get("followers"),
    }]
    write(HISTORY, hist)
    if data["youtube"]:
        write(HERE / "analytics" / "videos.json", [v for v in data["youtube"]["videos"] if v["status"] == "public"])
    write(LATEST, data)
    data["history"] = hist
    data["queue"] = {
        "pending": [meta(u)["title"] for u in uploads() if u.get("status") == "pending"],
        "approved": [[meta(u)["title"], u["postAt"]] for u in uploads() if u.get("status") == "approved"],
        "drafts": len(read(STATE, {"drafts": []})["drafts"]),
        "next": [q["topic"] for q in read(TOPICS, {"queue": []})["queue"][:5]],
    }
    html = (HERE / "dashboard.template.html").read_text(encoding="utf-8")
    DASHBOARD.write_text(html.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    print(f"dashboard: {DASHBOARD}")
    if open_it:
        os.startfile(DASHBOARD)  # noqa: S606 (Windows)


# ---- daily --------------------------------------------------------------------------------------

def cmd_daily():
    print(f"== Echo Lab daily run {datetime.now():%Y-%m-%d %H:%M}")
    waiting = [u for u in uploads() if u.get("status") == "pending"]
    made = None
    if schedule().get("autopilot"):
        try:
            cmd_analyze()  # learn from the latest numbers before choosing what to make
        except (Exception, SystemExit) as e:
            print(f"analyze: {e}")
        # one new video per daily post time, unless two days of posts are already queued
        queued = [u for u in uploads() if u.get("status") == "approved"]
        want = max(0, min(len(post_times()), 2 * len(post_times()) - len(queued)))
        print(f"autopilot: {len(queued)} queued, making {want}")
        for _ in range(want):
            made = make_video() or made
    # don't pile up videos nobody has reviewed
    elif len(waiting) >= 3:
        print(f"{len(waiting)} videos already waiting for review; not making another today")
    else:
        made = make_video()
    drafts = 0
    try:
        if not CLOUD:  # in the cloud the comments job runs on its own every few minutes
            drafts = cmd_comments()
    except (Exception, SystemExit) as e:
        print(f"comments: {e}")
    try:
        cmd_dashboard(open_it=False)
    except (Exception, SystemExit) as e:
        print(f"dashboard: {e}")
    pending = len([u for u in uploads() if u.get("status") == "pending"])
    if schedule().get("autopilot"):
        ahead = sorted(u["postAt"] for u in uploads() if u.get("status") == "approved")
        toast("Echo Lab autopilot", f"{len(ahead)} video(s) scheduled" + (f", next at {ahead[0].replace('T', ' ')}" if ahead else "")
              + ". Comments answered. Dashboard updated.")
    elif pending or drafts:
        what = []
        if made:
            what.append(f"new video \"{meta(made)['title'][:40]}\"")
        if pending:
            what.append(f"{pending} video(s) to approve")
        if drafts:
            what.append(f"{drafts} reply drafts")
        toast("Echo Lab: ready for you", ", ".join(what) + ". Run review.bat")


# ---- analysis: what goes viral, and when to post ----------------------------------------------------

INSIGHTS = HERE / "analytics" / "insights.json"
LATEST = HERE / "analytics" / "latest.json"


def local_from_ist(hm: str) -> str:
    """'HH:MM' India time -> this PC's clock (it may be set to another zone, e.g. Nepal)."""
    import time
    hh, mm = map(int, hm.split(":"))
    shift = time.localtime().tm_gmtoff // 60 - 330  # minutes this PC is ahead of IST
    t = (hh * 60 + mm + shift) % 1440
    return f"{t // 60:02d}:{t % 60:02d}"


def video_table() -> list:
    """Every published video with its YouTube and Instagram numbers joined by title, from the last refresh."""
    data = read(LATEST, {})
    yt = {v["title"]: v for v in (data.get("youtube") or {}).get("videos", [])}
    ig = (data.get("instagram") or {}).get("posts", [])
    posted = {meta(u)["title"]: u for u in uploads() if u.get("status") == "published"}
    rows = []
    for title, v in yt.items():
        if v.get("status") != "public":
            continue
        m = posted.get(title)
        cap = (m and (meta(m).get("social", {}).get("instagram") or "").split("\n")[0][:40]) or ""
        p = next((x for x in ig if cap and x.get("title", "").startswith(cap[:25])), None)
        rows.append({"title": title, "ytId": v["id"], "ytViews": v.get("views", 0), "ytLikes": v.get("likes", 0),
                     "ytComments": v.get("comments", 0), "published": v.get("published"),
                     "igUrl": p and p.get("url"), "igViews": (p or {}).get("views", 0), "igReach": (p or {}).get("reach", 0),
                     "igLikes": (p or {}).get("likes", 0), "igShares": (p or {}).get("shares", 0), "igSaves": (p or {}).get("saved", 0),
                     "postedAt": m and m.get("postedAt"), "language": (m and meta(m).get("language")) or "en"})
    for r in rows:
        r["score"] = r["ytViews"] + r["igViews"] + 20 * (r["ytLikes"] + r["igLikes"] + r["igShares"] * 3 + r["igSaves"] * 3)
    return sorted(rows, key=lambda r: -r["score"])


def best_times(rows: list) -> dict:
    """Two daily post times: Instagram's 'when your followers are online' if it has enough data, else the hours
    our own posts did best at, else proven prime times for the audience (India for Hindi)."""
    reason = ""
    try:
        cfg = instagram.load()
        g = instagram.GRAPH_FB if cfg.get("mode") == "facebook" else instagram.GRAPH_IG
        r = requests.get(f"{g}/{cfg['userId']}/insights", params={"metric": "online_followers", "period": "lifetime",
                                                                  "access_token": cfg["token"]}, timeout=30).json()
        vals = (r.get("data") or [{}])[0].get("values", [{}])[-1].get("value") or {}
        if sum(vals.values()) >= 50:
            # Instagram reports hours in Pacific time; convert to UTC then to this PC's clock
            import time
            off = time.localtime().tm_gmtoff // 3600
            ranked = sorted(vals.items(), key=lambda kv: -kv[1])
            hours = sorted({(int(h) + 7 + off) % 24 for h, _ in ranked[:6]})
            pick = [hours[0], hours[-1]] if len(hours) > 1 else hours * 2
            reason = "from Instagram: the hours most of your followers are online"
            return {"times": [f"{h:02d}:00" for h in pick], "reason": reason}
    except Exception as e:  # noqa: BLE001
        reason = f"(Instagram online-followers unavailable: {str(e)[:60]})"
    timed = [r for r in rows if r.get("postedAt")]
    if len(timed) >= 8:
        by_hour = {}
        for r in timed:
            by_hour.setdefault(int(r["postedAt"][11:13]), []).append(r["score"])
        ranked = sorted(by_hour, key=lambda h: -sum(by_hour[h]) / len(by_hour[h]))
        pick = sorted(ranked[:2]) if len(ranked) > 1 else ranked * 2
        return {"times": [f"{h:02d}:00" for h in pick], "reason": f"from our own posts: these hours averaged the most views ({len(timed)} posts)"}
    if video_language() == "hi":
        return {"times": [local_from_ist("12:30"), local_from_ist("19:30")],
                "reason": "Indian Shorts/Reels prime time (lunch 12:30 and evening 19:30 IST) until we have enough of our own data"}
    return {"times": [local_from_ist("07:30"), local_from_ist("19:30")],
            "reason": "US evening (07:30 IST) and India/Europe evening (19:30 IST) until we have enough of our own data"}


def cmd_analyze():
    """Fresh numbers -> what is working and why -> new topics in the winning pattern -> best post times."""
    print("== analysing the channel")
    cmd_dashboard(open_it=False)
    rows = video_table()
    print(f"{len(rows)} published videos")
    insights = {"updated": datetime.now().isoformat(timespec="minutes"), "videos": len(rows)}
    if rows:
        out = ai_json(
            "You are the strategist for a faceless Shorts/Reels channel where " + schedule()["niche"] + ". "
            f"Current narration language: {'Hindi' if video_language() == 'hi' else 'English'}.\n"
            "Here is every video with its numbers (score weights views, likes, shares and saves):\n"
            + json.dumps([{k: r[k] for k in ("title", "ytViews", "igViews", "igReach", "ytLikes", "igLikes", "igShares", "igSaves", "language", "published")}
                          for r in rows], ensure_ascii=False)
            + "\nThink like a top creator. Reply with ONLY JSON: {"
              '"summary": "2-3 plain sentences a non-expert understands: what is working and what is not", '
              '"winningPattern": "the repeatable formula of the best videos: subject type, hook style, title style, platform", '
              '"doMore": ["3-5 short concrete actions"], "stopDoing": ["1-3 short items"], '
              '"nextTopics": [{"topic": "short topic", "hook": "first line on screen, max 12 words"} x5 that follow the winning pattern]}'
        )
        insights.update({k: out.get(k) for k in ("summary", "winningPattern", "doMore", "stopDoing")})
        new = [{"topic": str(t["topic"])[:80], "hook": str(t.get("hook", ""))[:120]} for t in out.get("nextTopics", []) if t.get("topic")]
        t = read(TOPICS, {"queue": [], "done": []})
        have = {q["topic"].lower() for q in t["queue"]} | {d.lower() for d in t["done"]}
        t["queue"] = [n for n in new if n["topic"].lower() not in have] + t["queue"]
        write(TOPICS, t)
        insights["nextTopics"] = [n["topic"] for n in new]
        print("pattern:", insights.get("winningPattern"))
    bt = best_times(rows)
    insights["bestTimes"] = bt
    s = read(SCHEDULE, {})
    if s.get("autoTimes", True) and bt["times"] != post_times():
        s["postAt"] = bt["times"]
        write(SCHEDULE, s)
        # move videos that are waiting to the new times
        ups = uploads()
        waiting = sorted((u for u in ups if u.get("status") == "approved"), key=lambda u: u["postAt"])
        for u in waiting:
            u.pop("postAt")
        for u in waiting:
            u["postAt"] = next_slot([x.get("postAt") for x in ups if x.get("postAt") and x.get("status") == "approved"])
        write(UPLOADS, ups)
    print("post times:", bt["times"], "-", bt["reason"])
    write(INSIGHTS, insights)
    return insights


def cmd_make(*words):
    """Dashboard 'make a video': analyse first, then make one in the winning pattern (or on the given topic)."""
    cmd_analyze()
    topic = " ".join(words).strip()
    made = make_video({"topic": topic, "hook": ""} if topic else None)
    print("made" if made else "failed")


def cmd_post_now():
    """Publish the next scheduled video right away."""
    ups = uploads()
    nxt = sorted((u for u in ups if u.get("status") == "approved"), key=lambda u: u["postAt"])
    if not nxt:
        print("nothing scheduled")
        return
    publish_entry(nxt[0])
    write(UPLOADS, ups)
    print(f"published {meta(nxt[0])['title']}")


COMMANDS = {"daily": cmd_daily, "review": cmd_review, "post-due": cmd_post_due, "comments": cmd_comments,
            "dashboard": cmd_dashboard, "topics": cmd_topics, "analyze": cmd_analyze, "make": cmd_make,
            "post-now": cmd_post_now}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
