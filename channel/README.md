# Echo Lab 3D: channel setup and publishing

Everything for the YouTube channel: branding, video metadata, an upload/analytics tool, and the
content plan ([PLAN.md](PLAN.md)). The videos themselves are made in [`app/`](../app/).

## Files

| Path | What it is |
|---|---|
| `../out/channel/brand-avatar_avatar_0.50s.png` | Profile picture, 800×800 (YouTube crops it to a circle) |
| `../out/channel/brand-banner_banner_0.50s.png` | Banner, 2560×1440 (text inside the all-devices safe area) |
| `../out/channel/ultrasonic-thumb_thumb_0.50s.png` | Thumbnail for the long video, 1280×720 |
| `../out/channel/ultrasonic-cover_cover_0.50s.png` | Vertical cover for Shorts / Reels / TikTok, 1080×1920 |
| `../out/ultrasonic_wide.mp4` | Long-form 16:9 upload (chapters list + key ideas around the animation) |
| `../out/ultrasonic_upload.mp4` | Vertical Short / Reel / TikTok |
| `channel.json` | Channel description, keywords, country, language |
| `videos/*.json` | Title, description (with chapters), tags, thumbnail, playlist per video |
| `youtube.py` | Upload, branding, publish, stats, analytics (official YouTube APIs) |
| `PLAN.md` | 30-day topic plan, posting schedule, growth playbook |

## Step 1: create the channel (you, about 5 min)

1. Sign in at <https://youtube.com> with the Gmail account.
2. Profile picture → **Create a channel** → name **Echo Lab 3D**, handle **@EchoLab3D**
   (if taken, try the fallbacks in `channel.json`).
3. Verify the channel at <https://www.youtube.com/verify> (SMS code). This unlocks custom
   thumbnails, videos longer than 15 minutes, and live streaming.

## Step 2: give the upload tool access (you, about 10 min, once)

1. Go to <https://console.cloud.google.com/>, create a project named `echo-lab-3d`.
2. **APIs & Services → Library**: enable **YouTube Data API v3** and **YouTube Analytics API**.
3. **OAuth consent screen**: User type *External*, app name `Echo Lab 3D uploader`, your email
   as support and developer contact. Under **Audience → Test users**, add the channel's Gmail.
4. **Credentials → Create credentials → OAuth client ID → Desktop app**. Download the JSON and
   save it as `channel/client_secret.json`.
5. From the project folder run:

   ```sh
   python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py auth
   ```

   A Google page opens. Pick the channel's account and allow access. It prints the channel name when it worked.

`client_secret.json` and `token.json` are keys to the channel. Never share or upload them. To cut
access at any time: <https://myaccount.google.com/permissions>.

## Fast path: steps 3 and 4 in one command

```sh
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py launch
```

## Step 3: brand the channel

```sh
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py branding
```

That sets the description, keywords, country, language and banner. YouTube has no API for these,
so do them in **YouTube Studio → Customization**:
- **Profile picture**: upload the avatar PNG.
- **Video watermark**: upload the avatar PNG, display "entire video".
- **Links**: add your Instagram and TikTok.
- **Layout**: set the long video as the *channel trailer* for new visitors.

## Step 4: upload

```sh
# long video first, then the Short
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py upload channel/videos/ultrasonic-long.json
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py upload channel/videos/ultrasonic-short.json
```

Videos upload as **private**. Until Google audits the API project, uploads made through the API
are always private, so watch each one and then publish it:

```sh
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py publish <videoId>
```

(or flip it to Public in YouTube Studio). To lift the private-only limit, apply for an audit:
<https://support.google.com/youtube/contact/yt_api_form>.

After uploading the Short, open it in the YouTube **phone app** → Edit → Thumbnail to pick a
frame. Custom thumbnails don't apply to Shorts. Then add the **Related video** link to the long video.

## Publishing everywhere (generated videos)

`make-video.bat` uploads to YouTube as private. After watching it, `publish-video.bat` makes it
public, posts it as an **Instagram Reel** (automatic), and hands **TikTok** to you: the caption is
copied to the clipboard and TikTok's upload page opens next to the video file (drag, Ctrl+V, Post).
TikTok has no free API that posts publicly, so that step stays manual.

### Instagram (once, about 20 minutes)

1. In the Instagram app: **Settings → Account type and tools → Switch to professional account**
   (Creator is fine). Free, and it can be switched back.
2. <https://developers.facebook.com/apps> → **Create app** → use case **Other** → type **Business**.
3. In the app: **Add product → Instagram → API setup with Instagram login**.
4. **Add account** (step "Generate access tokens"): log in with your Instagram. If Instagram shows an
   invite, accept it in the app: **Settings → Apps and websites → Tester invites**.
5. Click **Generate token** next to the account, allow the permissions, copy the token, then run
   (from this project's folder):

   ```sh
   python -m uv run --with requests python channel/instagram.py setup <token>
   ```

   It prints `connected @yourname`. The token is saved in `channel/instagram.json` (keep it private)
   and renews itself as long as you publish at least every few weeks.

Older 3D videos: post `out/ultrasonic_upload.mp4` from the phone app with the cover image and the
caption from `out/ultrasonic_upload.txt`.

## Step 5: check how it's doing

```sh
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py stats
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py analytics 7
python -m uv run --with google-api-python-client --with google-auth-oauthlib python channel/youtube.py retention <videoId>
```

`analytics` saves a JSON report in `channel/analytics/`. Open Claude Code in this folder and ask
*"read the latest analytics and tell me what to change"*. Impressions and click-through rate aren't
in the public API, so read those in YouTube Studio → Analytics → Reach.

## Making the next video

Open Claude Code in this project and say, for example:

> Make the next Echo Lab 3D video from channel/PLAN.md, the same style as ultrasonic: Short +
> long version + thumbnail + metadata JSON.

Each video takes about an hour of Claude's work plus about 35 minutes of rendering on this PC.
Watch every video before you publish it.
