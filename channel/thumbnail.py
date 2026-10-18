"""Click-worthy covers for every video: a frame from the video, darkened, with 2-5 huge words and the
Echo Lab 3D badge. One 1080x1920 JPEG serves YouTube (Shorts thumbnail), Instagram (Reel cover) and Facebook.

    python channel/thumbnail.py <meta.json>        writes <video>.cover.jpg next to the video and prints its path

Text stays inside the centre 4:5 area so Instagram's profile grid doesn't crop it.
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LOGO = ROOT / "out" / "channel" / "brand2" / "logo-full.png"  # the owner's Echo Lab 3D logo (2026-10-17), transparent
# Impact / Arial Black on Windows; the free look-alikes shipped in channel/fonts everywhere else (the cloud runner)
FONT = "C:/Windows/Fonts/impact.ttf" if Path("C:/Windows/Fonts/impact.ttf").exists() else str(HERE / "fonts" / "Anton-Regular.ttf")
BADGE_FONT = "C:/Windows/Fonts/ariblk.ttf" if Path("C:/Windows/Fonts/ariblk.ttf").exists() else str(HERE / "fonts" / "ArchivoBlack-Regular.ttf")
YELLOW, CYAN, WHITE = (255, 214, 10), (48, 220, 255), (255, 255, 255)
W, H = 1080, 1920


def rel(p: str) -> Path:
    path = Path(p)
    return path if path.is_absolute() else ROOT / path


def headline(m: dict) -> str:
    """2-5 punchy words for the cover: from the metadata's thumbText, else Claude, else the title."""
    if m.get("thumbText"):
        return m["thumbText"]
    title = re.sub(r"#\w+", "", m["title"]).strip()
    try:
        sys.path.insert(0, str(HERE))
        import manager
        out = manager.ai(
            "Write the text for a viral YouTube Shorts / Instagram Reels cover for this video. 2 to 5 words, ALL CAPS, "
            "a curiosity gap or myth-bust (not the full title), same language/script as the title (Hinglish stays in Roman letters), "
            f"no emoji, no hashtags. Put * around the 1 word to highlight.\nTitle: {title}\nReply with ONLY the text."
        ).strip().splitlines()[0].strip().strip('"')
        if 2 <= len(out.replace("*", "").split()) <= 6:
            return out
    except Exception as e:  # noqa: BLE001
        print(f"thumbnail text: {e}")
    words = re.sub(r"[^\w\s?!']", "", title).upper().split()
    return " ".join(words[:5])


def frame(video: Path, ms: int) -> Image.Image:
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "f.png"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{ms / 1000:.2f}", "-i", str(video), "-frames:v", "1", str(out)], check=True)
        return Image.open(out).convert("RGB")


def fit(img: Image.Image) -> Image.Image:
    s = max(W / img.width, H / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (img.width - W) // 2, (img.height - H) // 2
    return img.crop((x, y, x + W, y + H))


def wrap(draw, words, font, maxw):
    lines, cur = [], []
    for w in words:
        test = " ".join(x.strip("*") for x in cur + [w])
        if cur and draw.textlength(test, font=font) > maxw:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    return lines + ([cur] if cur else [])


def make(meta_path: str) -> Path:
    m = json.loads(rel(meta_path).read_text(encoding="utf-8"))
    video = rel(m["file"])
    bg = fit(frame(video, int(m.get("coverMs") or 1500) + 400))
    # blurred and dimmed enough that busy frames don't fight the words, but the scene still shows
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(6))).enhance(0.62)
    # dark band behind the words so they read on any frame
    shade = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for y in range(H):
        d = abs(y - 760) / 620
        sd.line([(0, y), (W, y)], fill=int(170 * max(0.0, 1 - d * d)))
    bg = Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), bg, shade)
    draw = ImageDraw.Draw(bg)

    text = headline(m).upper()
    words = text.split()
    if not any("*" in w for w in words):
        words[-1] = f"*{words[-1]}*"
    size = 190
    while size > 90:
        font = ImageFont.truetype(FONT, size)
        lines = wrap(draw, words, font, W - 120)
        if len(lines) <= 3 and len(lines) * size * 1.08 < 760:
            break
        size -= 8
    lh = size * 1.08
    y = 820 - len(lines) * lh / 2
    top = y
    for line in lines:
        widths = [draw.textlength(w.strip("*") + " ", font=font) for w in line]
        x = (W - (sum(widths) - draw.textlength(" ", font=font))) / 2
        for w, wd in zip(line, widths):
            color = YELLOW if "*" in w else WHITE
            draw.text((x, y), w.strip("*"), font=font, fill=color, stroke_width=max(6, size // 22), stroke_fill=(0, 0, 0))
            x += wd
        y += lh

    # brand logo just above the words (always inside the 4:5 safe area)
    if LOGO.exists():
        lg = Image.open(LOGO).convert("RGBA")
        lg = lg.resize((340, round(lg.height * 340 / lg.width)), Image.LANCZOS)
        by = int(max(290, top - lg.height - 40))
        bg.paste(lg, ((W - lg.width) // 2, by), lg)
    else:
        bf = ImageFont.truetype(BADGE_FONT, 46)
        by = int(max(300, top - 120))
        draw.text((W // 2 - 150, by), "ECHO LAB", font=bf, fill=WHITE, stroke_width=3, stroke_fill=(0, 0, 0))
        draw.text((W // 2 - 150 + draw.textlength("ECHO LAB ", font=bf), by), "3D", font=bf, fill=CYAN, stroke_width=3, stroke_fill=(0, 0, 0))
    out = video.with_suffix(".cover.jpg")
    bg.save(out, "JPEG", quality=88, optimize=True)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    print(make(sys.argv[1]))
