"""Build a language's basics course for the app: its words, sentences and audio, ready to publish.

    python tools/course/build_course.py ar --voice azure            # the real thing (Azure, the owner's key)
    python tools/course/build_course.py ar --voice piper            # a preview with the free local voice
    python tools/course/build_course.py ar --voice azure --redo     # make every audio file again

Reads tools/course/<lang>/words.json (the words, in order, each with its sentence and translation:
written and checked by hand, see tools/course/README.md) and writes, into docs/course/ (published with
the website, like docs/lexicon):
    <lang>/course.json      the course: units of 50 words, each word with its meaning, sentence,
                            translation, audio file and where the word and the sentence are in it
    <lang>/audio/NNNN.ogg   one file per word: the word, a pause, then its sentence (Ogg Opus), the
                            same shape as a card voice (app/voices.py card_audio), so a word added to
                            the learner's cards keeps its audio exactly as a voiced card does
    index.json              every course there is, with its size and checksum

Audio already made for the same text and voice is kept (a small list next to it says which), so a
second run only makes what is new or changed.

Voices
  azure  Microsoft Azure's neural voices, the most natural there are for most languages. Needs the
         owner's Azure Speech key: AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment, or the
         key saved in Tamkeen on this computer (Settings -> Card voices). Microsoft lets apps use what
         its voices say (e-learning is one of its named uses); the course notes that the voice is
         computer-made, as Microsoft's code of conduct asks.
  piper  The free voice Tamkeen can download (app/voices.py). For trying the course out on this computer
         only: Piper's Arabic voice comes with no stated licence, so its audio is never published.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / "docs" / "course"
UNIT = 50
PLANNED = 1000

# The voice per language and how its sentences are said. Arabic: Modern Standard Arabic, Saudi voice
# (the app's usual Arabic card voice, cardvoice.js AZURE_VOICES). Sentences a little slower than normal
# speech, for beginners; the word itself at the usual speed.
AZURE = {
    "ar": {"voice": "ar-SA-ZariyahNeural", "locale": "ar-SA", "name": "Zariyah (Azure, Saudi Arabia)"},
}
SENTENCE_RATE = "-10%"
PIPER = {"ar": "ar_JO-kareem-medium"}

# Silence round the parts (seconds), as a card voice has them (app/voices.py LEAD, GAP, TAIL).
LEAD, GAP, TAIL = 0.06, 0.9, 0.35


def log(*a: Any) -> None:
    print(*a, flush=True)


# ---------------------------------------------------------------- the words

MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")


def plain(text: str) -> str:
    """Arabic without its vowel marks and tatweel (what most text looks like)."""
    return MARKS.sub("", unicodedata.normalize("NFC", text))


def load_words(lang: str) -> dict[str, Any]:
    data = json.loads((HERE / lang / "words.json").read_text(encoding="utf-8"))
    words = data["words"]
    for i, w in enumerate(words, 1):
        if w["n"] != i:
            raise SystemExit(f"words.json: word {i} is numbered {w['n']}")
        for key in ("word", "meaning", "sentence", "translation"):
            if not str(w.get(key, "")).strip():
                raise SystemExit(f"words.json: word {i} ({w.get('word')}) has no {key}")
        if w["translation"].count("⟦") != 1 or w["translation"].count("⟧") != 1:
            raise SystemExit(f"words.json: word {i}'s translation needs one ⟦ ⟧ pair: {w['translation']}")
    return data


# ---------------------------------------------------------------- voices

def azure_key() -> tuple[str, str]:
    key, region = os.environ.get("AZURE_SPEECH_KEY", ""), os.environ.get("AZURE_SPEECH_REGION", "")
    if key and region:
        return key.strip(), region.strip()
    # The key saved in Tamkeen on this computer (Settings -> Card voices).
    import sqlite3

    db = Path(os.environ.get("APPDATA", "")) / "ArabicPodcastStudio" / "library.db"
    if db.exists():
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        rows = dict(con.execute("SELECT key, value FROM settings WHERE key IN ('tts_key_azure', 'tts_region_azure')").fetchall())
        con.close()
        un = lambda v: (json.loads(v) if v and v[:1] == '"' else v) or ""  # settings are stored as JSON
        key, region = str(un(rows.get("tts_key_azure"))).strip(), str(un(rows.get("tts_region_azure"))).strip()
        if key and region:
            return key, region
    raise SystemExit("No Azure Speech key: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION, or save the key in "
                     "Tamkeen on this computer (Settings -> Card voices -> Azure).")


# Azure's free tier allows about 20 requests a minute. Requests go as fast as Azure takes them; once it
# says "too many" (429), they are spaced out for the rest of the run, waiting as long as it asks.
_pace = {"gap": 0.0, "last": 0.0}


def azure_synth(text: str, lang: str, rate: str = "") -> tuple[np.ndarray, int]:
    import httpx

    key, region = azure_key()
    v = AZURE[lang]
    body = escape(text)
    if rate:
        body = f'<prosody rate="{rate}">{body}</prosody>'
    ssml = (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{v["locale"]}">'
            f'<voice name="{v["voice"]}">{body}</voice></speak>')
    for attempt in range(12):
        wait = _pace["last"] + _pace["gap"] - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _pace["last"] = time.monotonic()
        try:
            r = httpx.post(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", content=ssml.encode("utf-8"),
                           headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                                    "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm", "User-Agent": "Tamkeen-course-builder"},
                           timeout=60)
        except httpx.HTTPError as exc:  # a dropped connection: try again shortly
            log(f"  (connection problem: {exc.__class__.__name__}; trying again)")
            time.sleep(5)
            continue
        if r.status_code == 429:
            _pace["gap"] = max(_pace["gap"], 3.2)
            try:
                after = float(r.headers.get("Retry-After", "0"))
            except ValueError:
                after = 0.0
            time.sleep(max(after, 5.0 + attempt * 2))
            continue
        if r.status_code != 200:
            raise SystemExit(f"Azure answered {r.status_code}: {r.text[:200]}")
        if len(r.content) < 2000:
            raise SystemExit(f"Azure sent almost no sound for: {text}")
        return np.frombuffer(r.content[: len(r.content) // 2 * 2], dtype="<i2"), 24000
    raise SystemExit("Azure kept saying it was too busy. Try again later.")


def piper_synth(text: str, lang: str, rate: str = "") -> tuple[np.ndarray, int]:
    from app import voices

    vid = PIPER[lang]
    if not voices.runtime_installed() or not voices.voice_installed(vid):
        log(f"Downloading the Piper program and the voice {vid} (once)...")
        voices.download_blocking(vid)
    return voices.synth(text, vid)


def trim(pcm: np.ndarray, rate: int, floor: int = 300) -> np.ndarray:
    loud = np.flatnonzero(np.abs(pcm.astype(np.int32)) > floor)
    if not len(loud):
        return pcm
    pad = int(0.03 * rate)
    return pcm[max(0, loud[0] - pad): loud[-1] + pad]


def make_audio(word: str, sentence: str, lang: str, engine: str) -> tuple[bytes, dict[str, float]]:
    from app import audio

    synth = azure_synth if engine == "azure" else piper_synth
    w, rate = synth(word, lang)
    s, rate2 = synth(sentence, lang, SENTENCE_RATE if engine == "azure" else "")
    if rate2 != rate:
        raise SystemExit("The voice changed its sample rate between the word and the sentence.")
    w, s = trim(w, rate), trim(s, rate)
    z = lambda sec: np.zeros(int(sec * rate), np.int16)
    pcm = np.concatenate([z(LEAD), w, z(GAP), s, z(TAIL)])
    start, end = LEAD, LEAD + len(w) / rate
    sent_start = LEAD + (len(w) + int(GAP * rate)) / rate
    times = {"start": round(start, 3), "end": round(end, 3), "sent_start": round(sent_start, 3),
             "sent_end": round(sent_start + len(s) / rate, 3)}
    return audio.encode_pcm_opus(pcm, rate), times


# ---------------------------------------------------------------- building

def fingerprint(w: dict[str, Any], engine: str) -> str:
    return hashlib.sha1(json.dumps([w["word"], w["sentence"], engine, AZURE.get("ar", {}).get("voice"), SENTENCE_RATE],
                                   ensure_ascii=False).encode()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("lang")
    ap.add_argument("--voice", choices=("azure", "piper"), required=True)
    ap.add_argument("--redo", action="store_true", help="make every audio file again")
    ap.add_argument("--out", default="", help="where the course goes (default docs/course; a Piper preview: "
                    "tools/course/build/preview, which is never published)")
    args = ap.parse_args()
    lang, engine = args.lang, args.voice
    out = Path(args.out) if args.out else OUT if engine == "azure" else HERE / "build" / "preview"
    if engine == "piper" and out.resolve() == OUT.resolve():
        raise SystemExit("A Piper preview never goes into docs/course (it would be published).")
    sys.path.insert(0, str(ROOT))
    if engine == "piper" and "APS_DATA_DIR" not in os.environ:
        # Piper and its voice go into a folder of the builder's own, never the owner's Tamkeen library.
        os.environ["APS_DATA_DIR"] = str(HERE / "build" / "data")
    if engine == "azure" and lang not in AZURE:
        raise SystemExit(f"No Azure voice chosen for {lang} yet (AZURE in this file).")

    data = load_words(lang)
    words = data["words"]
    folder = out / lang
    (folder / "audio").mkdir(parents=True, exist_ok=True)
    made_list = folder / "audio" / "made.json"
    made: dict[str, str] = json.loads(made_list.read_text(encoding="utf-8")) if made_list.exists() else {}
    old = json.loads((folder / "course.json").read_text(encoding="utf-8")) if (folder / "course.json").exists() else {}
    old_times = {w["n"]: w.get("times") for w in old.get("words", [])}

    items = []
    for w in words:
        name = f"{w['n']:04d}.ogg"
        fp = fingerprint(w, engine)
        path = folder / "audio" / name
        times = old_times.get(w["n"])
        if args.redo or made.get(name) != fp or not path.exists() or not times:
            log(f"{w['n']:4d}  {plain(w['word'])}")
            ogg, times = make_audio(w["word"], w["sentence"], lang, engine)
            path.write_bytes(ogg)
            made[name] = fp
            made_list.write_text(json.dumps(made, indent=0), encoding="utf-8")
        items.append({"n": w["n"], "word": w["word"], "pos": w.get("pos", ""), "meaning": w["meaning"],
                      "sentence": w["sentence"], "translation": w["translation"], "audio": f"audio/{name}", "times": times})

    units = []
    for u in range((PLANNED + UNIT - 1) // UNIT):
        first, last = u * UNIT + 1, (u + 1) * UNIT
        have = sum(1 for it in items if first <= it["n"] <= last)
        units.append({"n": u + 1, "from": first, "to": last, "ready": have == UNIT})
    voice = (AZURE[lang]["name"] if engine == "azure" else f"Piper {PIPER[lang]} (preview, not for publishing)")
    course = {"format": 1, "lang": lang, "title": data["title"], "variety": data.get("variety", ""), "about": data.get("about", ""),
              "planned": PLANNED, "unit": UNIT, "voice": {"engine": engine, "name": voice, "synthetic": True},
              "built": time.strftime("%Y-%m-%d"), "units": units, "words": items}
    body = json.dumps(course, ensure_ascii=False, indent=1).encode("utf-8")
    (folder / "course.json").write_bytes(body)

    index_path = out / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"format": 1, "courses": {}}
    audio_bytes = sum((folder / "audio" / f"{it['n']:04d}.ogg").stat().st_size for it in items)
    index["courses"][lang] = {"file": f"{lang}/course.json", "title": data["title"], "variety": data.get("variety", ""),
                              "words": len(items), "planned": PLANNED, "bytes": len(body), "audio_bytes": audio_bytes,
                              "sha256": hashlib.sha256(body).hexdigest(), "voice": course["voice"], "built": course["built"]}
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"{len(items)} words, {len(units)} units ({sum(u['ready'] for u in units)} ready), "
        f"{audio_bytes / 1e6:.1f} MB of audio -> {folder}")


if __name__ == "__main__":
    main()
