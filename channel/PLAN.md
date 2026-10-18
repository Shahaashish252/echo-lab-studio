# Echo Lab 3D: content plan and growth playbook

## Format

| | Short (9:16) | Long (16:9) |
|---|---|---|
| Length | **45–60 s** for daily posts (the 2:50 ultrasonic one is the deep-dive style) | 3–8 min |
| Cadence | 1 per day | 1 per week (the best Short of the week, expanded) |
| Job | reach: new viewers from the Shorts feed | depth: watch time, search traffic, subscribers |

A 45–60 s Short is roughly half the work of the ultrasonic video and keeps more viewers to the
end, and the share of viewers who finish a Short matters most for Shorts. Keep the full 3D
deep-dives for the weekly long video.

**Post time:** pick one fixed time and stick to it. For an India + global English audience,
6–8 pm IST is a good start. After 2–3 weeks, check *Studio → Analytics → Audience → When your
viewers are on YouTube* and move to that time.

## 30-day topic plan

Hook = the first line on screen, the first 1.5 seconds. It decides whether people swipe.

| Day | Topic | Hook |
|---|---|---|
| 1 | Ultrasonic sensor (HC-SR04) ✅ | "How does a robot see a wall, without any eyes?" |
| 2 | PIR motion sensor | "This sensor sees your body heat, in the dark." |
| 3 | IR obstacle sensor | "Why your TV remote and this robot use invisible light." |
| 4 | LDR (light sensor) | "How do street lights know it's night?" |
| 5 | Touchscreen (capacitive) | "Why your phone ignores gloves, but feels your finger." |
| 6 | Accelerometer (MEMS) | "There's a tiny moving weight inside your phone." |
| 7 | **Long:** Ultrasonic vs IR vs LiDAR: which sensor sees best? | |
| 8 | Gyroscope (MEMS) | "How your phone knows which way is up." |
| 9 | LiDAR | "How self-driving cars see in 3D with lasers." |
| 10 | Hall effect sensor | "How your laptop knows the lid is shut." |
| 11 | Fingerprint sensor | "Your fingerprint is a map of tiny capacitors." |
| 12 | DHT11 temperature & humidity | "How a sensor measures water in the air." |
| 13 | Soil moisture sensor | "This sensor knows when your plant is thirsty." |
| 14 | **Long:** How a smartphone senses the world (accelerometer, gyro, compass, proximity, light) | |
| 15 | Servo motor | "How a servo knows exactly where to stop." |
| 16 | Stepper motor | "How 3D printers move in perfect tiny steps." |
| 17 | Relay | "How a tiny 5 V signal switches a 230 V lamp." |
| 18 | Potentiometer | "The knob that turns position into voltage." |
| 19 | Microphone (MEMS) | "How your phone turns your voice into numbers." |
| 20 | Speaker | "How a magnet and a coil make every sound you hear." |
| 21 | **Long:** Arduino obstacle-avoiding robot: every part explained | |
| 22 | Infrared thermometer | "How a thermometer measures you without touching." |
| 23 | GPS | "Your phone listens to 4 satellites at once." |
| 24 | RFID / NFC | "How a card with no battery pays for your metro ride." |
| 25 | Load cell (weighing scale) | "How a metal bar feels your weight." |
| 26 | Gas sensor (MQ-2) | "How a smoke alarm smells smoke." |
| 27 | Rain sensor | "How car wipers know it's raining." |
| 28 | **Long:** How a car parking sensor system works end to end | |
| 29 | Camera sensor (CMOS) | "Every photo is millions of tiny light buckets." |
| 30 | Recap / poll Short: "Which sensor next? Comment!" | |

## What makes these videos spread (and what to check)

The YouTube algorithm mostly rewards two numbers. Here is what to do for each:

1. **Viewers who keep watching** (Shorts: "viewed vs swiped away" above 70–80% is great).
   - Put the strongest visual + question in the first 1.5 s, before any title card. Never open on a logo.
   - Something on screen changes every 1–2 s (we already do this).
   - Make the end flow back into the start, so the Short replays.
   - Check `youtube.py retention <id>`: wherever the curve drops sharply, cut or speed up that part next time.
2. **Click-through on the thumbnail and title** (long videos: above 5% is good for a new channel).
   - Thumbnail: 2–4 huge words, one object, high contrast, and it should differ from the title, not repeat it.
   - Title: put the searched phrase first ("How Ultrasonic Sensors Work"), the hook second.
   - If CTR is under 3% after 48 h, change the thumbnail. That's the cheapest fix there is.

Other habits that compound:
- **Series and playlists.** Every video goes in "Sensors Explained in 3D". Viewers binge series.
- **Link Shorts to long videos** (Related video field). That's how Shorts viewers become subscribers.
- **Pin a comment** with a question ("Which sensor should we animate next?") and reply to every
  comment in the first hour.
- **Post the same Short to Instagram Reels and TikTok** with platform hashtags. Don't post a
  TikTok-watermarked file to YouTube.
- **Be consistent.** Expect slow growth for the first 20–40 uploads while YouTube works out who
  to show you to. Judge topics by retention, not by raw views in the first week.

## Weekly review (ask Claude every Sunday)

1. Run `youtube.py analytics 7` and paste or point Claude at `channel/analytics/<date>.json`.
2. Copy Studio's Reach numbers (impressions, CTR) for the week.
3. Ask: *"Which videos held viewers best, which topics should we double down on, and what should
   change in hooks, length, thumbnails or posting time?"*
4. Update this plan: move winning topic types up, drop the ones that don't work.
