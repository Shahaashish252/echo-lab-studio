"""Echo Lab web dashboard: the channel at a glance, every video's journey from idea to posted, and buttons/commands
that run channel/manager.py. Local only (http://localhost:8765), standard library only.

    python channel/web.py            (dashboard.bat starts it and opens the browser)
"""
import json
import subprocess
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PORT = 8765
LOGS = HERE / "logs"
sys.path.insert(0, str(HERE))
import manager  # noqa: E402

lock = threading.Lock()
current = {"proc": None, "action": None, "log": None, "started": None}


def read(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return default


def busy() -> bool:
    p = current["proc"]
    return bool(p and p.poll() is None) or (ROOT / "out" / "auto.lock").exists()


def run(action: str, args: list):
    with lock:
        if current["proc"] and current["proc"].poll() is None:
            return False, f"Busy with “{current['action']}”. Try again when it finishes."
        LOGS.mkdir(exist_ok=True)
        log = LOGS / f"web-{datetime.now():%Y%m%d-%H%M%S}-{action}.log"
        f = open(log, "w", encoding="utf-8")
        current.update(proc=subprocess.Popen([sys.executable, "-u", str(HERE / "manager.py"), action, *args], cwd=ROOT,
                                             stdout=f, stderr=subprocess.STDOUT, env={**__import__("os").environ, "PYTHONIOENCODING": "utf-8"},
                                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)),
                       action=action, log=log, started=datetime.now().isoformat(timespec="seconds"))
        return True, "started"


def tail(p: Path | None, n: int = 60000) -> str:
    if not p or not p.exists():
        return ""
    b = p.read_bytes()[-n:]
    return b.decode("utf-8", errors="replace")


def state() -> dict:
    s = manager.schedule()
    ups = manager.uploads()
    jobs = sorted((read(j, None) for j in (HERE / "jobs").glob("*.json")), key=lambda j: (j or {}).get("started", ""), reverse=True)
    jobs = [j for j in jobs if j][:40]
    videos = []
    for u in reversed(ups):
        try:
            m = manager.meta(u)
        except Exception:  # noqa: BLE001
            continue
        videos.append({"id": u["id"], "title": m.get("title", ""), "status": u.get("status") or "uploaded", "postAt": u.get("postAt"),
                       "postedAt": u.get("postedAt"), "date": u.get("date"), "language": m.get("language", "en"),
                       "published": u.get("published", {}), "job": u.get("job"), "topic": u.get("topic"),
                       # the file in the "videos" release (kept there until it is posted everywhere): the dashboard's preview
                       "file": str(m.get("file", "")).replace("\\", "/").rsplit("/", 1)[-1]})
    try:
        table = manager.video_table()
    except Exception:  # noqa: BLE001
        table = []
    latest = read(HERE / "analytics" / "latest.json", {})
    p = current["proc"]
    return {
        "now": datetime.now().isoformat(timespec="seconds"),
        "schedule": s, "postTimes": manager.post_times(), "language": manager.video_language(), "followers": manager.followers(),
        "history": read(HERE / "analytics" / "history.json", []),
        "youtube": {k: v for k, v in (latest.get("youtube") or {}).items() if k != "videos"},
        "instagram": {k: v for k, v in (latest.get("instagram") or {}).items() if k != "posts"},
        "updated": latest.get("updated"),
        "table": table, "videos": videos, "jobs": jobs,
        "topics": read(HERE / "topics.json", {"queue": []})["queue"][:12],
        "insights": read(HERE / "analytics" / "insights.json", {}),
        "claude": read(HERE / "analytics" / "claude_usage.json", {}),
        "flagged": read(HERE / "manager.json", {}).get("flagged", [])[-20:],
        "running": {"action": current["action"], "started": current["started"], "alive": bool(p and p.poll() is None),
                    "exit": None if not p else p.poll()},
        "makingNow": (ROOT / "out" / "auto.lock").exists(),
    }


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code: int, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else (json.dumps(body, ensure_ascii=False) if ctype == "application/json" else body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        path, _, q = self.path.partition("?")
        params = dict(kv.split("=", 1) for kv in q.split("&") if "=" in kv)
        if path in ("/", "/index.html"):
            return self.send(200, (HERE / "web" / "index.html").read_bytes(), "text/html")
        if path in ("/logo.png", "/favicon.png"):
            f = HERE / "web" / path.lstrip("/")
            return self.send(200, f.read_bytes(), "image/png") if f.exists() else self.send(404, "no logo", "text/plain")
        if path == "/api/state":
            return self.send(200, state())
        if path == "/api/log":
            job = params.get("job", "")
            if job == "command":
                return self.send(200, tail(current["log"]), "text/plain")
            if job and all(c.isalnum() or c == "-" for c in job):
                return self.send(200, tail(HERE / "jobs" / f"{job}.log"), "text/plain")
            return self.send(404, "no log", "text/plain")
        self.send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if self.path != "/api/command":
            return self.send(404, {"error": "not found"})
        if self.headers.get("Origin") not in (None, f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"):
            return self.send(403, {"error": "forbidden"})
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0) or b"{}")
        a = body.get("action")
        if a in ("autopilot", "autotimes"):
            s = read(manager.SCHEDULE, {})
            s["autopilot" if a == "autopilot" else "autoTimes"] = bool(body.get("on"))
            manager.write(manager.SCHEDULE, s)
            return self.send(200, {"ok": True, "message": f"{a} {'on' if body.get('on') else 'off'}"})
        if a == "language" and body.get("value") in ("auto", "hi", "en"):
            s = read(manager.SCHEDULE, {})
            s["language"] = body["value"]
            manager.write(manager.SCHEDULE, s)
            return self.send(200, {"ok": True, "message": f"language: {body['value']}"})
        cmds = {"make": "make", "analyze": "analyze", "refresh": "dashboard", "post-now": "post-now", "comments": "comments"}
        if a not in cmds:
            return self.send(400, {"ok": False, "message": "unknown command"})
        args = [str(body.get("topic", ""))[:200]] if a == "make" and body.get("topic") else ([""] if a == "refresh" else [])
        if a == "make" and (ROOT / "out" / "auto.lock").exists():
            return self.send(409, {"ok": False, "message": "A video is being made right now. Wait for it to finish."})
        ok, msg = run(cmds[a], args)
        self.send(200 if ok else 409, {"ok": ok, "message": msg})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print(f"Echo Lab dashboard: http://localhost:{PORT}")
    srv.serve_forever()
