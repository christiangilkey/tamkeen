"""Make the audio of a DLI deck's words: each word, a pause, then its sentence, as one Ogg Opus file.

    .venv/Scripts/python tools/dli/voice_deck.py ar                       every finished chapter, in order
    .venv/Scripts/python tools/dli/voice_deck.py ar --chapters c001-c020
    .venv/Scripts/python tools/dli/voice_deck.py ar --budget 250000       stop before using more characters
    .venv/Scripts/python tools/dli/voice_deck.py ar --dry                 only count what is still to make

Reads dli-content/<lang>/<deck>/deck.json and sentences/*.json (tools/dli/DECKS.md) and writes
audio/<n>.ogg and audio/made.json beside them: the same shape as a basics course word's audio
(tools/course/build_course.py, whose Azure voice and settings it uses), so a DLI word in the learner's
cards keeps it as its voice. Only chapters whose sentences are all written are voiced; audio already made
for the same text and voice is kept, so a run makes only what is new or changed.

Azure, with the owner's key (Settings -> Card voices, read only, or AZURE_SPEECH_KEY/REGION). The owner
keeps to the free tier (about 500,000 characters a month), so --budget stops a run before it uses more,
and audio/usage.json keeps what each month used. To ask Azure less often (its free tier takes about 20
requests a minute), several words go in one request, with long silences between them, and the answer is
cut at those silences. A cut that doesn't come out as expected (the wrong number of pieces) is made again
the plain way, two requests per word, so nothing is ever cut in the wrong place.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools" / "course"))

import build_course as bc  # noqa: E402  (the basics courses' voices, pauses and Azure calls)

CONTENT = ROOT.parent / "dli-content"
BATCH = 6               # words per Azure request
ITEM_BREAK = 2.5        # seconds of silence between two words in one request
PART_BREAK = 1.3        # between a word and its sentence
ITEM_MIN, PART_MIN = 1.9, 1.0  # the shortest silence counted as each kind of break when cutting
FRAME = 0.01
QUIET = 200             # a sample below this is silence (Azure's breaks are near-exact zeros)
# 18 kb/s Opus is clear for one voice and keeps a word with its sentence near 11 KB (32 kb/s, the card
# voices' rate, makes 19 KB): the decks' 23,000 words have to fit on the website beside everything else.
BITRATE = 18_000


def unmarked(text: str) -> str:
    return str(text).replace("⟦", "").replace("⟧", "")


def billed(text: str) -> int:
    """What Azure counts: a character each, Chinese, Japanese and Korean characters two."""
    return sum(2 if re.match(r"[ᄀ-ᇿ぀-ヿ㄰-㆏㐀-鿿가-힯豈-﫿]", c) else 1 for c in text)


def load(lang: str, content: Path) -> tuple[Path, dict, dict[int, dict]]:
    base = content / lang
    folder = next((d for d in sorted(base.iterdir()) if (d / "deck.json").exists()), None) if base.exists() else None
    if folder is None:
        raise SystemExit(f"No deck for {lang} in {base}.")
    deck = json.loads((folder / "deck.json").read_text(encoding="utf-8"))
    written: dict[int, dict] = {}
    for f in sorted(p for p in (folder / "sentences").glob("c*.json") if re.fullmatch(r"c\d{3}\.json", p.name)):
        for e in json.loads(f.read_text(encoding="utf-8")).get("words", []):
            written[e["n"]] = e
    return folder, deck, written


def finished(deck: dict, written: dict[int, dict]) -> list[dict]:
    """The chapters whose every word first met there has its sentence and translation."""
    out = []
    for c in deck["chapters"]:
        due = [n for n in c["words"] if deck["words"][n - 1]["chapters"][0] == c["id"]]
        if all(n in written and unmarked(written[n].get("sentence", "")).strip() and written[n].get("translation") for n in due):
            out.append({**c, "due": due})
    return out


def item(deck: dict, e: dict) -> dict:
    w = deck["words"][e["n"] - 1]
    word = (e.get("fix") or {}).get("word") or w["word"]
    return {"n": e["n"], "word": word, "say": e.get("say"), "sentence": unmarked(e["sentence"]).strip()}


def fingerprint(it: dict, lang: str) -> str:
    parts = [it["word"], it["sentence"], bc.AZURE[lang]["voice"], bc.SENTENCE_RATE, it["say"] or "", BITRATE]
    return hashlib.sha1(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]


def word_ssml(it: dict) -> str:
    say = it["say"]
    if isinstance(say, dict) and say.get("ph"):
        q = {'"': "&quot;"}
        return f'<phoneme alphabet="{escape(say.get("alphabet", "ipa"), q)}" ph="{escape(say["ph"], q)}">{escape(it["word"])}</phoneme>'
    return escape(say if isinstance(say, str) and say.strip() else it["word"])


def batch_ssml(items: list[dict], lang: str) -> str:
    v = bc.AZURE[lang]
    body = f'<break time="{int(ITEM_BREAK * 1000)}ms"/>'.join(
        f'{word_ssml(it)}<break time="{int(PART_BREAK * 1000)}ms"/><prosody rate="{bc.SENTENCE_RATE}">{escape(it["sentence"])}</prosody>'
        for it in items)
    return (f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{v["locale"]}">'
            f'<voice name="{v["voice"]}">{body}</voice></speak>')


class BadText(Exception):
    """Azure refused the text itself (400: an exact sound it can't read, say): this word is left out."""


def azure_ssml(ssml: str) -> np.ndarray:
    """One request of our own SSML (bc.azure_synth builds its own): the same key, pacing and refusals."""
    import httpx

    bc.azure_turn()
    key, region = bc.azure_key()
    for attempt in range(12):
        wait = bc._pace["last"] + bc._pace["gap"] - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        bc._pace["last"] = time.monotonic()
        try:
            r = httpx.post(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", content=ssml.encode("utf-8"),
                           headers={"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
                                    "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm", "User-Agent": "Tamkeen-dli-builder"},
                           timeout=120)
        except httpx.HTTPError as exc:
            bc.log(f"  (connection problem: {exc.__class__.__name__}; trying again)")
            time.sleep(5)
            continue
        if r.status_code == 429:
            bc._pace["gap"] = max(bc._pace["gap"], 3.2)
            try:
                after = float(r.headers.get("Retry-After", "0"))
            except ValueError:
                after = 0.0
            time.sleep(max(after, 5.0 + attempt * 2))
            continue
        if r.status_code in (401, 403):
            raise SystemExit(f"Azure refused ({r.status_code}): the key is wrong, or this month's free allowance is used up. "
                             "The audio made so far is kept; run again next month and only the rest is made.")
        if r.status_code == 400:
            raise BadText(r.text[:200])
        if r.status_code != 200:
            raise SystemExit(f"Azure answered {r.status_code}: {r.text[:200]}")
        return np.frombuffer(r.content[: len(r.content) // 2 * 2], dtype="<i2")
    raise SystemExit("Azure kept saying it was too busy. Try again later.")


def silences(pcm: np.ndarray, rate: int) -> list[tuple[int, int]]:
    """Runs of silence as (first sample, end sample), at FRAME resolution."""
    step = int(FRAME * rate)
    n = len(pcm) // step
    if not n:
        return []
    loud = np.abs(pcm[: n * step].astype(np.int32)).reshape(n, step).max(axis=1) >= QUIET
    runs, start = [], None
    for i, on in enumerate(loud):
        if not on and start is None:
            start = i
        elif on and start is not None:
            runs.append((start * step, i * step))
            start = None
    if start is not None:
        runs.append((start * step, n * step))
    return runs


def cut(pcm: np.ndarray, rate: int, count: int) -> list[tuple[np.ndarray, np.ndarray]] | None:
    """The batch's answer as [(word, sentence)] per item, or None when it doesn't cut into `count` items of
    exactly two parts each."""
    runs = silences(pcm, rate)
    loud = np.flatnonzero(np.abs(pcm.astype(np.int32)) >= QUIET)
    if not len(loud):
        return None
    first, last = loud[0], loud[-1]
    inner = [(a, b) for a, b in runs if a > first and b < last]
    items_at = [(a, b) for a, b in inner if (b - a) / rate >= ITEM_MIN]
    if len(items_at) != count - 1:
        return None
    bounds = [first] + [x for a, b in items_at for x in (a, b)] + [last + 1]
    out = []
    for k in range(count):
        lo, hi = bounds[2 * k], bounds[2 * k + 1]
        parts_at = [(a, b) for a, b in inner if lo < a and b < hi and PART_MIN <= (b - a) / rate < ITEM_MIN]
        if len(parts_at) != 1:
            return None
        a, b = parts_at[0]
        word, sentence = pcm[lo:a], pcm[b:hi]
        if len(word) < 0.12 * rate or len(sentence) < 0.3 * rate:
            return None
        out.append((word, sentence))
    return out


def assemble(word: np.ndarray, sentence: np.ndarray, rate: int) -> tuple[bytes, dict[str, float]]:
    """The card-voice shape: lead, word, gap, sentence, tail (build_course.make_audio does the same)."""
    from app import audio

    w, s = bc.trim(word, rate), bc.trim(sentence, rate)
    z = lambda sec: np.zeros(int(sec * rate), np.int16)
    pcm = np.concatenate([z(bc.LEAD), w, z(bc.GAP), s, z(bc.TAIL)])
    sent_start = bc.LEAD + (len(w) + int(bc.GAP * rate)) / rate
    times = {"start": round(bc.LEAD, 3), "end": round(bc.LEAD + len(w) / rate, 3), "sent_start": round(sent_start, 3),
             "sent_end": round(sent_start + len(s) / rate, 3)}
    return audio.encode_pcm_opus(pcm, rate, bitrate=BITRATE), times


def one_by_one(it: dict, lang: str) -> tuple[bytes, dict[str, float]]:
    """The plain way, two requests: the word (or its exact sound), then the sentence a little slower."""
    say = it["say"]
    if isinstance(say, dict) and say.get("ph"):
        w, rate = bc.azure_synth(it["word"], lang, ph=say)
    else:
        w, rate = bc.azure_synth(say if isinstance(say, str) and say.strip() else it["word"], lang)
    s, _ = bc.azure_synth(it["sentence"], lang, bc.SENTENCE_RATE)
    return assemble(w, s, rate)


def chapter_range(spec: str, deck: dict) -> set[str]:
    ids = [c["id"] for c in deck["chapters"]]
    out: set[str] = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.update(ids[ids.index(a): ids.index(b or a) + 1])
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("lang")
    ap.add_argument("--chapters", default="", help="e.g. c001-c020 or c003,c005")
    ap.add_argument("--budget", type=int, default=0, help="stop before this run uses more Azure characters")
    ap.add_argument("--batch", type=int, default=BATCH)
    ap.add_argument("--dry", action="store_true", help="only count what is still to make")
    ap.add_argument("--content", type=Path, default=CONTENT)
    a = ap.parse_args()
    if a.lang not in bc.AZURE:
        raise SystemExit(f"No Azure voice for {a.lang}.")
    folder, deck, written = load(a.lang, a.content)
    chapters = finished(deck, written)
    if a.chapters:
        keep = chapter_range(a.chapters, deck)
        chapters = [c for c in chapters if c["id"] in keep]
    out = folder / "audio"
    out.mkdir(exist_ok=True)
    made_file, usage_file = out / "made.json", out / "usage.json"
    made: dict[str, Any] = json.loads(made_file.read_text(encoding="utf-8")) if made_file.exists() else {}
    usage: dict[str, int] = json.loads(usage_file.read_text(encoding="utf-8")) if usage_file.exists() else {}
    month = time.strftime("%Y-%m")

    todo = []
    for c in chapters:
        for n in c["due"]:
            it = item(deck, written[n])
            fp = fingerprint(it, a.lang)
            m = made.get(str(n))
            if not (m and m.get("fp") == fp and (out / f"{n}.ogg").exists()):
                todo.append({**it, "fp": fp, "chars": billed(bc.spoken({"word": it["word"], "say": it["say"]}) if not isinstance(it["say"], dict) else it["word"]) + billed(it["sentence"])})
    need = sum(t["chars"] for t in todo)
    bc.log(f"{deck['title']}: {len(chapters)} finished chapters; {len(todo)} words to voice, about {need:,} Azure characters"
           f" (this month so far: {usage.get(month, 0):,}).")
    if a.dry or not todo:
        return

    used = 0
    rate = 24000

    def keep(it: dict, ogg: bytes, times: dict) -> None:
        (out / f"{it['n']}.ogg").write_bytes(ogg)
        # (what was said, so the packaging tool only ships audio that still matches its card)
        made[str(it["n"])] = {"fp": it["fp"], "times": times, "word": it["word"], "sentence": it["sentence"]}
        usage[month] = usage.get(month, 0) + it["chars"]

    def save() -> None:
        made_file.write_text(json.dumps(made, indent=0), encoding="utf-8")
        usage_file.write_text(json.dumps(usage, indent=0), encoding="utf-8")

    i = 0
    cuts = plain = 0
    refused: list[int] = []
    try:
        while i < len(todo):
            group = todo[i: i + a.batch]
            cost = sum(t["chars"] for t in group)
            if a.budget and used + cost > a.budget:
                bc.log(f"Stopping before the budget ({a.budget:,} characters): {len(todo) - i} words left for another run.")
                break
            try:
                pieces = cut(azure_ssml(batch_ssml(group, a.lang)), rate, len(group)) if len(group) > 1 else None
            except BadText:  # one of them Azure can't read: each on its own, to find which
                pieces = None
            if pieces is None:  # made the plain way: two requests a word
                for it in group:
                    try:
                        keep(it, *one_by_one(it, a.lang))
                    except SystemExit as exc:  # (build_course says "Azure answered 400" for a text it refused)
                        if not str(exc).startswith("Azure answered 400"):
                            raise
                        refused.append(it["n"])
                        bc.log(f"  word {it['n']} ({it['word']}): Azure refused its text, left without audio: {str(exc)[:120]}")
                plain += len(group)
                used += cost * (2 if len(group) > 1 else 1)  # (the batch that didn't cut was paid for too)
            else:
                for it, (w, s) in zip(group, pieces):
                    keep(it, *assemble(w, s, rate))
                cuts += len(group)
                used += cost
            save()
            i += len(group)
            if i % 60 < a.batch:
                bc.log(f"  {i}/{len(todo)} words ({used:,} characters this run)")
    finally:
        save()
    bc.log(f"Done: {cuts + plain - len(refused)} words voiced ({cuts} cut from batches, {plain - len(refused)} one by one), "
           f"{used:,} characters; this month: {usage.get(month, 0):,}."
           + (f" Refused by Azure (fix their say): {refused}" if refused else ""))


if __name__ == "__main__":
    main()
