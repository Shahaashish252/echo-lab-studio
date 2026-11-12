"""teardown3 sound: score per act (marimba groove · sparse blueprint mallets · bouncy iso groove · resolve on the card) played on
real sampled mallets (VCSL, CC0; synthesised fallback), procedural foley from page/events.json, and the voice on top with a
clarity chain (rumble/boom cut, presence + air, exciter for the 24 kHz TTS), ducking the music. -> page/out/mix.wav"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import maximum_filter1d, uniform_filter1d
from scipy.signal import resample_poly, sosfilt

HERE = Path(__file__).resolve().parent
PAGE = HERE / "page"
sys.path.insert(0, str(HERE / "core" / "audio"))
import sfx  # noqa: E402
from sfx import SR, t_, env_exp, noise, lp, hp, bp, add, compress, limit  # noqa: E402

ev = json.loads((PAGE / "events.json").read_text(encoding="utf-8"))
spec = json.loads((PAGE / "job" / "spec.json").read_text(encoding="utf-8"))
DUR, EV = ev["dur"], ev["ev"]
LT = {l["id"]: l["t"] for l in spec["lines"]}
B1, C1, C5 = LT["b1"] - .3, LT["c1"] - .55, LT["c5"] + 1.4
OPEN = LT["a2"] - .05
N = int((DUR + 1.5) * SR)
BEAT = .625
mid = lambda m: 440 * 2 ** ((m - 69) / 12)


try:   # real mallet samples (teardown/core/audio/instruments, fetched by make.py); synthesis if they are missing
    import sampler as S
    S.load("marimba"); S.load("vibraphone"); S.load("glockenspiel")
    SAMPLED = True
except Exception as e:  # noqa: BLE001
    print("  mallet samples unavailable, synthesising:", str(e)[:120])
    SAMPLED = False


def _syn_marimba(m, v=.6, d=1.2):
    f = mid(m); tt = t_(d)
    x = np.sin(2 * np.pi * f * tt) * env_exp(d, .35 if f < 300 else .22) + .35 * np.sin(2 * np.pi * f * 3.93 * tt) * env_exp(d, .03) + .12 * np.sin(2 * np.pi * f * 9.2 * tt) * env_exp(d, .008)
    x[:96] *= np.linspace(0, 1, 96); return x * v
def _syn_vibes(m, v=.4, d=3.0):
    f = mid(m); tt = t_(d)
    x = (np.sin(2 * np.pi * f * tt) + .25 * np.sin(2 * np.pi * f * 4 * tt) * env_exp(d, .25)) * env_exp(d, 1.1) * (1 + .25 * np.sin(2 * np.pi * 5.2 * tt))
    x[:240] *= np.linspace(0, 1, 240); return x * v
def _syn_glock(m, v=.25, d=1.4):
    f = mid(m); tt = t_(d); return (np.sin(2 * np.pi * f * tt) + .4 * np.sin(2 * np.pi * f * 2.76 * tt) * env_exp(d, .1)) * env_exp(d, .45) * v
def _smp(inst, m, v, d, gain):
    return S.note(inst, m, d, vel=min(1.0, .35 + v)) * gain * v
def marimba(m, v=.6, d=1.2): return _smp("marimba", m, v, d, .9) if SAMPLED else _syn_marimba(m, v, d)
def vibes(m, v=.4, d=3.0): return _smp("vibraphone", m, v, d, 1.0) if SAMPLED else _syn_vibes(m, v, d)
def glock(m, v=.25, d=1.4): return _smp("glockenspiel", m, v, d, .7) if SAMPLED else _syn_glock(m, v, d)


def bass(m, v=.5, d=1.0):
    f = mid(m); tt = t_(d); x = np.sin(2 * np.pi * f * tt) + .3 * np.sin(2 * np.pi * 2 * f * tt) + .15 * np.sin(2 * np.pi * 3 * f * tt)
    e = np.minimum(1, tt / .01) * np.exp(-tt / .5); e[-480:] *= np.linspace(1, 0, 480); return x * e * v
def kick(v=.7):
    d = .32; tt = t_(d); f = 48 + 90 * np.exp(-tt / .03); return (np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .09) + hp(noise(d), 3000) * env_exp(d, .004) * .25) * v
def shaker(v=.12):
    d = .07; return hp(noise(d), 6000) * env_exp(d, .015) * v
def pad(ms, d, v=.12):
    tt = t_(d); x = sum(np.sin(2 * np.pi * mid(m) * tt + i) + .2 * np.sin(2 * np.pi * mid(m) * 2.003 * tt) for i, m in enumerate(ms))
    e = np.minimum(1, tt / .8) * np.minimum(1, (d - tt) / 1.0); return lp(x, 2400) * e * v

mus = np.zeros((N, 2))
def put(x, at, gain=1., pan=0.): add(mus, x, at, gain, pan)
CH = {'Am': [57, 60, 64], 'F': [53, 57, 60], 'C': [55, 60, 64], 'G': [55, 59, 62]}
ROOTN = {'Am': 45, 'F': 41, 'C': 48, 'G': 43}
prog = ['Am', 'F', 'C', 'G']
def groove(t0, t1, kicks=True, glk=False):
    b = t0
    while b < t1 - 1e-6:
        c = prog[int(b // 2.5) % 4]; notes = CH[c] + [CH[c][0] + 12]
        for k in range(8):
            tt = b + k * BEAT / 2
            if tt >= t1: break
            put(marimba(notes[(k * 3) % 4] + 12, .32 if k % 2 else .42), tt, 1, -.25 + .5 * (k % 2))
        put(bass(ROOTN[c], .55, 1.1), b); put(bass(ROOTN[c], .4, .6), b + 3 * BEAT)
        if kicks: put(kick(.65), b); put(kick(.5), b + 2 * BEAT)
        for k in range(4): put(shaker(), b + k * BEAT + BEAT / 2, 1, .3)
        if glk: put(glock(CH[c][2] + 24, .16), b + BEAT * 1.5, 1, .4)
        b += 2.5

put(glock(88, .3, 2.5), 0.02); put(pad([57, 64], OPEN, .05), .3)
dive = LT["a3"] - .35
groove(OPEN, dive)
for k, tt in enumerate(np.arange(dive, LT["a5"], BEAT * 2)): put(vibes([69, 72, 76, 74][k % 4], .18, 2.4), tt, 1, .2)
put(pad([57, 60, 64, 69], LT["a5"] - dive, .08), dive)
groove(LT["a5"], B1, glk=True)
put(pad([53, 57, 60, 64], 5.0, .07), B1)
for k, tt in enumerate(np.arange(B1, C1, BEAT)):
    c = prog[int(tt // 2.5) % 4]
    put(marimba(CH[c][k % 3] + 12, .18, 1.0), tt, 1, -.3 + .6 * (k % 2))
    if k % 4 == 0: put(bass(ROOTN[c], .35, 1.4), tt)
    if k % 8 == 6: put(glock(CH[c][2] + 24, .12), tt, 1, .4)
put(pad([55, 59, 62, 67], (C1 - B1) / 2, .06), B1 + (C1 - B1) / 2)
groove(C1, C5, glk=True)
put(pad([57, 61, 64, 69], DUR - C5 + 1.2, .1), C5)
for k, m in enumerate([69, 73, 76, 81]): put(marimba(m, .4, 2.5), C5 + k * .16, 1, -.3 + .2 * k)
put(bass(45, .6, 2.5), C5); put(kick(.6), C5); put(glock(93, .25, 2.5), C5 + 1.2, 1, .3)
mus[:, 0] = hp(mus[:, 0], 44); mus[:, 1] = hp(mus[:, 1], 44)

fol = np.zeros((N, 2))
def F(x, at, g=1., pan=0.): add(fol, x, at, g, pan)
def tick(v=.3): d = .03; return (hp(noise(d), 3500) * env_exp(d, .003) + np.sin(2 * np.pi * 3200 * t_(d)) * env_exp(d, .004) * .4) * v
def ring(f=2600, v=.3, d=.6): tt = t_(d); return sum(a * np.sin(2 * np.pi * f * r * tt) * env_exp(d, tau) for r, a, tau in [(1, 1, .2), (2.41, .5, .1), (3.87, .3, .06)]) * v
def zip_(d=.6, v=.3): tt = t_(d); f = 900 + 2600 * tt / d; return bp(noise(d), 2500, 7000) * .3 * np.sin(np.pi * tt / d) * v + np.sin(2 * np.pi * np.cumsum(f) / SR) * .08 * np.sin(np.pi * tt / d) * v
def ping(v=.35): d = .22; return np.sin(2 * np.pi * 3600 * t_(d)) * env_exp(d, .05) * v
def suck(d=.55): tt = t_(d); return lp(noise(d), 1800) * (tt / d) ** 2 * .5
room = lp(sfx.brown(DUR + 1.5), 900) * .02
fol[:len(room), 0] += room; fol[:len(room), 1] += room
for e in EV:
    t, ty = e["t"], e["type"]
    if ty == "hookPing": pass
    elif ty == "suck": F(suck(), t, .9)
    elif ty == "openHit": F(sfx.thump(.8, 62), t); F(ring(1800, .25), t, 1, -.2); F(sfx.clack(1.0, .5), t)
    elif ty == "lift": F(sfx.whoosh(.45, .3), t, 1, .2); F(ring(2600, .08, .4), t + .05, 1, .3)
    elif ty == "land": F(sfx.clack(.8, .35), t); F(sfx.thump(.3, 90), t)
    elif ty == "label": F(tick(.22), t, 1, .5)
    elif ty == "dive": F(sfx.whoosh(.8, .45), t)
    elif ty == "buzz":
        d = max(.5, e.get("d", 2)); tt = t_(d); F(np.sin(2 * np.pi * 620 * tt) * (1 + np.sin(2 * np.pi * 6 * tt)) * .5 * np.minimum(1, tt / .2) * np.minimum(1, (d - tt) / .3) * .06, t, 1, -.3)
    elif ty == "pull": F(sfx.whoosh(.6, .35), t)
    elif ty == "echoIn":
        for i in range(6): F(ping(.12 * (1 - i * .08)), t + i * .09, 1, .5)
    elif ty == "zip": F(zip_(.7, .4), t)
    elif ty == "tick": F(ping(.22), t, 1, -.4); F(tick(.15), t, 1, -.4)
    elif ty == "ping": F(ping(.3), t, 1, -.3)
    elif ty == "sheet": F(lp(noise(.25), 2500) * env_exp(.25, .05) * .5, t); F(sfx.thump(.3, 80), t)
    elif ty == "pen":
        d = e.get("d", .6); x = bp(noise(d), 3000, 9000) * (.6 + .4 * np.abs(np.sin(2 * np.pi * 7 * t_(d)))) * np.minimum(1, t_(d) / .05) * np.minimum(1, (d - t_(d)) / .08) * .06; F(x, t, 1, .15)
    elif ty == "stamp": F(sfx.thump(.9, 70), t); F(sfx.clack(.6, .6), t)
    elif ty == "wipe": F(sfx.whoosh(.6, .4), t)
    elif ty == "plinth": F(sfx.thump(.5, 95), t); F(sfx.clack(.7, .3), t)
    elif ty == "pop": F(sfx.pop(.35), t); F(sfx.clack(1.2, .25), t + .35)
    elif ty == "card": F(glock(81, .2, 2), t + .1, 1, .2)
fol[:, 0] = hp(fol[:, 0], 36); fol[:, 1] = hp(fol[:, 1], 36)

vo = np.zeros(N)
for l in spec["lines"]:
    x, sr = sf.read(PAGE / "job" / "voice" / f"{l['id']}.wav", dtype="float32")
    if x.ndim > 1: x = x.mean(1)
    if sr != SR: x = resample_poly(x, SR, sr).astype(np.float32)
    s = int(l["t"] * SR); vo[s:s + len(x)] += x[:N - s]
def biquad(kind, f0, gain_db=0.0, q=.8):
    """RBJ cookbook peaking / high-shelf / low-shelf as a second-order section."""
    A, w = 10 ** (gain_db / 40), 2 * np.pi * f0 / SR
    al, c = np.sin(w) / (2 * q), np.cos(w)
    if kind == "peak":
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    else:
        sq = 2 * np.sqrt(A) * al; sg = 1 if kind == "high" else -1
        b = [A * ((A + 1) + sg * (A - 1) * c + sq), -2 * sg * A * ((A - 1) + sg * (A + 1) * c), A * ((A + 1) + sg * (A - 1) * c - sq)]
        a = [(A + 1) - sg * (A - 1) * c + sq, 2 * sg * ((A - 1) - sg * (A + 1) * c), (A + 1) - sg * (A - 1) * c - sq]
    b, a = np.array(b) / a[0], np.array(a) / a[0]
    return np.array([[*b, *a]])


def eq(x, *bands):
    for bd in bands:
        x = sosfilt(biquad(*bd), x)
    return x


# voice clarity chain: rumble out, boom down, presence + brightness up, then an exciter that rebuilds the >12 kHz air
vo = hp(hp(vo, 110), 110)   # 4th order: the local voice carries rumble under 110 Hz
vo = eq(vo, ("low", 200, -3.0, .7), ("peak", 250, -3.0, .9), ("peak", 3300, 6.0, 1.0), ("high", 5500, 4.0, .7))
air = hp(np.tanh(bp(vo, 3500, 11500) * 14) / 14, 11000)
vo = vo + air * 1.6
vo = compress(vo, thr=.18, ratio=3.0)
vo = vo / (np.sqrt(np.mean(vo[np.abs(vo) > .01] ** 2)) + 1e-9) * .2
# music bus: a fixed level well under the voice, and a gentle dip where the voice's consonants live
for c in range(2):   # music: lean low end (bass/kick were masking the mallets), a dip where the voice consonants live
    mus[:, c] = eq(hp(mus[:, c], 60), ("low", 140, -7.0, .7), ("peak", 3000, -4.0, .8), ("high", 6000, 2.0, .7))
    fol[:, c] = eq(hp(fol[:, c], 70), ("low", 160, -6.0, .7))
mrms = np.sqrt(np.mean(mus[np.abs(mus).max(1) > 1e-4] ** 2)) + 1e-9
mus *= .05 / mrms
k = int(.25 * SR); envv = uniform_filter1d(maximum_filter1d(np.abs(vo), k), k)
mus *= (1 - .6 * np.clip(envv / .05, 0, 1))[:, None]
mix = mus + fol * .8 + np.stack([vo, vo], 1)
for c in range(2): mix[:, c] = limit(mix[:, c], .95)
mix = mix[:int(DUR * SR) + int(.5 * SR)]
(PAGE / "out").mkdir(exist_ok=True)
sf.write(PAGE / "out" / "mix.wav", mix.astype(np.float32), SR)
if os.environ.get("STEMS"):   # separate tracks for checking the balance
    for nm, x in (("voice", vo), ("music", mus.mean(1)), ("foley", fol.mean(1))):
        sf.write(PAGE / "out" / f"stem_{nm}.wav", x[:len(mix)].astype(np.float32), SR)
print("mix", round(mix.shape[0] / SR, 1), "s")
