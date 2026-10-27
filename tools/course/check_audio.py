"""Check a course's audio by ear, with a machine's ear: Whisper (large-v3, the model Tamkeen
downloads for transcribing) writes down what each file says, and that is compared with the word and
sentence it should say. Files where they differ are listed for a person to listen to.

    python tools/course/check_audio.py ar                         # the published course (docs/course)
    python tools/course/check_audio.py ar --dir tools/course/build/preview
    python tools/course/check_audio.py th --dir ../tamkeen-basics-th/docs/course --out check-th.json

Uses the Whisper model already downloaded by Tamkeen on this computer (read only), on the graphics
card when Tamkeen's GPU libraries are there. Thai and Bisaya, which Whisper hears poorly, use the
models Tamkeen has for them (LISTENERS below). Writes <dir>/<lang>/audio/check.json, or --out.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

MARKS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭـ]")
PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
# Written without spaces between words: compared letter by letter instead of word by word.
NO_SPACES = {"zh", "ja", "th"}
DATA = Path(os.environ.get("APPDATA", "")) / "ArabicPodcastStudio"
MODELS = DATA / "models" / "faster-whisper"
# Languages Whisper hears poorly, and the model of their own Tamkeen has for them (app/models_manager.py
# LANGUAGE_MODELS), with the language to ask it for: Bisaya's is asked for Tagalog, as Tamkeen does.
# Typhoon may also be where the 2026-10-19 Thai tests converted it (%TEMP%\tasr).
LISTENERS = {
    "th": ([MODELS / "typhoon", Path(os.environ.get("TEMP", "")) / "tasr" / "models" / "typhoon-turbo-app"], "th"),
    "ceb": ([MODELS / "bisaya"], "tl"),
}


def norm(text: str, lang: str = "ar") -> list[str]:
    """Words compared the way a listener would: no capitals, punctuation, vowel marks or alef/ya/ta
    marbuta spellings (Persian ی and ک count as ي and ك); letter by letter for zh, ja and th."""
    t = MARKS.sub("", unicodedata.normalize("NFC", text)).casefold()
    t = re.sub("[آأإٱ]", "ا", t).replace("ى", "ي").replace("ی", "ي").replace("ک", "ك").replace("ة", "ه")
    t = PUNCT.sub(" ", t.replace("ํา", "ำ"))  # Thai ำ written as two characters
    return list(t.replace(" ", "")) if lang in NO_SPACES else t.split()


def score(heard: str, expected: str, lang: str = "ar") -> float:
    a, b = norm(heard, lang), norm(expected, lang)
    return difflib.SequenceMatcher(a=a, b=b).ratio() if b else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("lang")
    ap.add_argument("--dir", default=str(ROOT / "docs" / "course"))
    ap.add_argument("--under", type=float, default=0.85, help="list files that match less than this")
    ap.add_argument("--out", default="", help="where check.json goes (default <dir>/<lang>/audio/check.json)")
    args = ap.parse_args()
    lang = args.lang
    folder = Path(args.dir) / lang
    course = json.loads((folder / "course.json").read_text(encoding="utf-8"))
    libs = DATA / "gpu-libs"
    if libs.exists():
        os.add_dll_directory(str(libs))
        os.environ["PATH"] = str(libs) + os.pathsep + os.environ.get("PATH", "")
    from faster_whisper import WhisperModel

    sys.path.insert(0, str(ROOT))
    from app import audio  # decodes the way Tamkeen does (16 kHz mono), whatever faster-whisper's own reader expects

    model_dir, asked = MODELS / "large-v3", lang
    if lang in LISTENERS:
        found = [d for d in LISTENERS[lang][0] if (d / "model.bin").exists()]
        if not found:
            raise SystemExit(f"No {lang} listening model on this computer: download it in Tamkeen (Settings -> Listening).")
        model_dir, asked = found[0], LISTENERS[lang][1]
    print(f"Listening with {model_dir.name} ({asked})")
    try:
        model = WhisperModel(str(model_dir), device="cuda", compute_type="float16")
    except Exception as exc:  # no usable graphics card: slower, but it works
        print(f"(on the CPU: {exc.__class__.__name__})")
        model = WhisperModel(str(model_dir), device="cpu", compute_type="int8")
    results, low = [], []
    hear = lambda pcm: " ".join(seg.text.strip() for seg in model.transcribe(
        pcm, language=asked, beam_size=5, vad_filter=False, condition_on_previous_text=False)[0])
    for w in course["words"]:
        pcm = audio.decode(folder / w["audio"])  # 16 kHz mono
        t = w["times"]
        cut = lambda a, b: pcm[max(0, int((a - 0.05) * 16000)): int((b + 0.1) * 16000)]
        # The sentence is what counts: a single word on its own is often misheard even when said well.
        heard_s = hear(cut(t["sent_start"], t["sent_end"]))
        heard_w = hear(cut(t["start"], t["end"]))
        sc = round(score(heard_s, w["sentence"].replace("⟦", "").replace("⟧", ""), lang), 3)
        word_ok = (lang not in NO_SPACES and bool(set(norm(w["word"], lang)) & set(norm(heard_w, lang)))) \
            or score(heard_w, w["word"], lang) >= 0.5
        results.append({"n": w["n"], "score": sc, "word_heard": word_ok, "heard": heard_s, "heard_word": heard_w,
                        "expected": MARKS.sub("", w["sentence"].replace("⟦", "").replace("⟧", "")), "word": MARKS.sub("", w["word"])})
        if sc < args.under:
            low.append(results[-1])
        print(f"{w['n']:4d} {sc:.2f} {'word ok' if word_ok else 'word?'}", flush=True)
    (Path(args.out) if args.out else folder / "audio" / "check.json").write_text(json.dumps({"under": args.under, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    mean = sum(r["score"] for r in results) / max(1, len(results))
    words_ok = sum(r["word_heard"] for r in results)
    print(f"\n{len(results)} files: the sentences match {mean:.2f} on average, {len(low)} under {args.under}; "
          f"the word heard in {words_ok} (details in check.json)")


if __name__ == "__main__":
    sys.exit(main())
