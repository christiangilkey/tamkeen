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

A word said alone can come out in the wrong reading (Chinese 的 as "dí", Japanese は as "ha", Portuguese
"o" as the letter's name). Such a word carries `say`: the text to voice for the word part instead
(kana: "わ"), or its exact sound, {"alphabet": "sapi", "ph": "de 5"} (Azure's pinyin for zh-CN) or
{"alphabet": "ipa", "ph": "u"}. The sentence is always voiced as written.

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
# The other languages use the same voices as the app's card voices (web/js/cardvoice.js AZURE_VOICES).
AZURE = {
    "ar": {"voice": "ar-SA-ZariyahNeural", "locale": "ar-SA", "name": "Zariyah (Azure, Saudi Arabia)"},
    "es": {"voice": "es-MX-DaliaNeural", "locale": "es-MX", "name": "Dalia (Azure, Mexico)"},
    "fr": {"voice": "fr-FR-DeniseNeural", "locale": "fr-FR", "name": "Denise (Azure, France)"},
    "ja": {"voice": "ja-JP-NanamiNeural", "locale": "ja-JP", "name": "Nanami (Azure, Japan)"},
    "zh": {"voice": "zh-CN-XiaoxiaoNeural", "locale": "zh-CN", "name": "Xiaoxiao (Azure, mainland China)"},
    "ru": {"voice": "ru-RU-SvetlanaNeural", "locale": "ru-RU", "name": "Svetlana (Azure, Russia)"},
    "it": {"voice": "it-IT-ElsaNeural", "locale": "it-IT", "name": "Elsa (Azure, Italy)"},
    "tl": {"voice": "fil-PH-BlessicaNeural", "locale": "fil-PH", "name": "Blessica (Azure, Philippines)"},
    "pt": {"voice": "pt-BR-FranciscaNeural", "locale": "pt-BR", "name": "Francisca (Azure, Brazil)"},
    "ca": {"voice": "ca-ES-JoanaNeural", "locale": "ca-ES", "name": "Joana (Azure, Catalonia)"},
    "th": {"voice": "th-TH-PremwadeeNeural", "locale": "th-TH", "name": "Premwadee (Azure, Thailand)"},
    "de": {"voice": "de-DE-KatjaNeural", "locale": "de-DE", "name": "Katja (Azure, Germany)"},
    "fa": {"voice": "fa-IR-DilaraNeural", "locale": "fa-IR", "name": "Dilara (Azure, Iran)"},
    "hi": {"voice": "hi-IN-SwaraNeural", "locale": "hi-IN", "name": "Swara (Azure, India)"},
    "ko": {"voice": "ko-KR-SunHiNeural", "locale": "ko-KR", "name": "SunHi (Azure, South Korea)"},
    "en": {"voice": "en-US-JennyNeural", "locale": "en-US", "name": "Jenny (Azure, United States)"},
}
SENTENCE_RATE = "-10%"
PIPER = {"ar": "ar_JO-kareem-medium"}
# Languages Azure has no voice for: Meta's MMS voices (facebook/mms-tts-<code>, CC BY-NC 4.0: free, not
# for commercial use), run on this computer from their own Python (they need PyTorch, which the app
# doesn't): the owner's Documents/arabic-tts/local-tts (venv + mms_say.py), or MMS_DIR.
MMS = {"ceb": "ceb"}
MMS_DIR = Path(os.environ.get("MMS_DIR", str(Path.home() / "Documents" / "arabic-tts" / "local-tts")))
_mms: dict[str, tuple[np.ndarray, int]] = {}  # text -> what MMS said, made beforehand in one batch

# Silence round the parts (seconds), as a card voice has them (app/voices.py LEAD, GAP, TAIL).
LEAD, GAP, TAIL = 0.06, 0.9, 0.35


def log(*a: Any) -> None:
    print(*a, flush=True)


# Logs often go to a file, which Windows would write in its old code page (no Arabic letters).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


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


_lock: dict[str, Any] = {}


def azure_turn() -> None:
    """Wait until no other course build on this computer is talking to Azure, then hold the turn
    until this build ends. Several languages are built side by side (one checkout each), and Azure's
    free tier allows about 20 requests a minute for the whole key: taking turns is faster than all of
    them being told "too many" at once."""
    if _lock:
        return
    import tempfile

    f = open(Path(tempfile.gettempdir()) / "tamkeen-course-azure.lock", "a+")
    said = False
    while True:
        try:
            if os.name == "nt":
                import msvcrt

                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except OSError:
            if not said:
                log("  (another course is being voiced on this computer; waiting for its turn to end)")
                said = True
            time.sleep(10)
    _lock["file"] = f  # held until this program ends


def azure_synth(text: str, lang: str, rate: str = "", ph: dict[str, str] | None = None) -> tuple[np.ndarray, int]:
    import httpx

    azure_turn()
    key, region = azure_key()
    v = AZURE[lang]
    body = escape(text)
    if ph:  # the exact sound: <phoneme alphabet="sapi" ph="de 5">的</phoneme>
        body = f'<phoneme alphabet="{escape(ph.get("alphabet", "ipa"), {chr(34): "&quot;"})}" ph="{escape(ph["ph"], {chr(34): "&quot;"})}">{body}</phoneme>'
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
        if r.status_code in (401, 403):
            raise SystemExit(f"Azure refused ({r.status_code}): the key is wrong, or this month's free allowance is used "
                             "up. The audio made so far is kept; run again later and only the rest is made.")
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


def mms_prepare(texts: list[str], lang: str) -> None:
    """Have MMS say every text in one run (it takes a few seconds to load), kept for mms_synth."""
    import subprocess
    import tempfile
    import wave

    todo = sorted({t for t in texts if t not in _mms})
    if not todo:
        return
    py, script = MMS_DIR / "venv" / "Scripts" / "python.exe", MMS_DIR / "mms_say.py"
    if not py.exists():
        py = MMS_DIR / "venv" / "bin" / "python"
    if not py.exists() or not script.exists():
        raise SystemExit(f"The MMS voice isn't set up in {MMS_DIR} (venv with torch and transformers, and mms_say.py).")
    with tempfile.TemporaryDirectory() as tmp:
        items = [{"key": f"t{i:05d}", "text": t} for i, t in enumerate(todo)]
        (Path(tmp) / "items.json").write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
        log(f"MMS: saying {len(items)} texts...")
        subprocess.run([str(py), str(script), "--batch", MMS[lang], str(Path(tmp) / "items.json"), str(Path(tmp) / "out")],
                       check=True, cwd=str(MMS_DIR))
        for it in items:
            with wave.open(str(Path(tmp) / "out" / f"{it['key']}.wav"), "rb") as wav:  # 16-bit mono
                pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").copy()
                _mms[it["text"]] = (pcm, wav.getframerate())


def mms_synth(text: str, lang: str, rate: str = "") -> tuple[np.ndarray, int]:
    if text not in _mms:
        mms_prepare([text], lang)
    return _mms[text]


def trim(pcm: np.ndarray, rate: int, floor: int = 300) -> np.ndarray:
    loud = np.flatnonzero(np.abs(pcm.astype(np.int32)) > floor)
    if not len(loud):
        return pcm
    pad = int(0.03 * rate)
    return pcm[max(0, loud[0] - pad): loud[-1] + pad]


def spoken(w: dict[str, Any]) -> str:
    """The text voiced for the word part: its `say` when that is text, else the word as written."""
    return w["say"] if isinstance(w.get("say"), str) and w["say"].strip() else w["word"]


def make_audio(word: str, sentence: str, lang: str, engine: str, say: Any = None) -> tuple[bytes, dict[str, float]]:
    from app import audio

    synth = {"azure": azure_synth, "piper": piper_synth, "mms": mms_synth}[engine]
    if isinstance(say, dict) and say.get("ph") and engine == "azure":
        w, rate = azure_synth(word, lang, ph=say)
    else:  # other voices can't take a sound spelling: they say the text
        w, rate = synth(say if isinstance(say, str) and say.strip() else word, lang)
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

def fingerprint(w: dict[str, Any], engine: str, lang: str) -> str:
    # `say` only counts when it is there, so words without one keep the audio they have.
    parts = [w["word"], w["sentence"], engine, AZURE.get(lang, {}).get("voice") if engine == "azure" else engine, SENTENCE_RATE]
    if w.get("say"):
        parts.append(w["say"])
    return hashlib.sha1(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("lang")
    ap.add_argument("--voice", choices=("azure", "piper", "mms"), required=True)
    ap.add_argument("--redo", action="store_true", help="make every audio file again")
    ap.add_argument("--out", default="", help="where the course goes (default docs/course; a Piper preview: "
                    "tools/course/build/preview, which is never published)")
    args = ap.parse_args()
    lang, engine = args.lang, args.voice
    out = Path(args.out) if args.out else OUT if engine in ("azure", "mms") else HERE / "build" / "preview"
    if engine == "piper" and out.resolve() == OUT.resolve():
        raise SystemExit("A Piper preview never goes into docs/course (it would be published).")
    sys.path.insert(0, str(ROOT))
    if engine == "piper" and "APS_DATA_DIR" not in os.environ:
        # Piper and its voice go into a folder of the builder's own, never the owner's Tamkeen library.
        os.environ["APS_DATA_DIR"] = str(HERE / "build" / "data")
    if engine == "azure" and lang not in AZURE:
        raise SystemExit(f"No Azure voice chosen for {lang} yet (AZURE in this file).")
    if engine == "mms" and lang not in MMS:
        raise SystemExit(f"{lang} has an Azure voice: use --voice azure (MMS is only for languages Azure lacks).")

    data = load_words(lang)
    words = data["words"]
    folder = out / lang
    (folder / "audio").mkdir(parents=True, exist_ok=True)
    made_list = folder / "audio" / "made.json"
    made: dict[str, str] = json.loads(made_list.read_text(encoding="utf-8")) if made_list.exists() else {}
    old = json.loads((folder / "course.json").read_text(encoding="utf-8")) if (folder / "course.json").exists() else {}
    old_times = {w["n"]: w.get("times") for w in old.get("words", [])}

    if engine == "mms":  # everything still to make, said in one run
        todo = [w for w in words if args.redo or made.get(f"{w['n']:04d}.ogg") != fingerprint(w, engine, lang)
                or not (folder / "audio" / f"{w['n']:04d}.ogg").exists() or not old_times.get(w["n"])]
        mms_prepare([t for w in todo for t in (spoken(w), w["sentence"])], lang)
    items = []
    for w in words:
        name = f"{w['n']:04d}.ogg"
        fp = fingerprint(w, engine, lang)
        path = folder / "audio" / name
        times = old_times.get(w["n"])
        if args.redo or made.get(name) != fp or not path.exists() or not times:
            log(f"{w['n']:4d}  {plain(w['word'])}")
            ogg, times = make_audio(w["word"], w["sentence"], lang, engine, w.get("say"))
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
    voice = (AZURE[lang]["name"] if engine == "azure" else f"Meta MMS ({MMS[lang]}, CC BY-NC 4.0)" if engine == "mms"
             else f"Piper {PIPER[lang]} (preview, not for publishing)")
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
