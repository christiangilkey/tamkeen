"""Check a course's audio by ear, with a machine's ear: Whisper (large-v3, the model Tamkeen
downloads for transcribing) writes down what each file says, and that is compared with the word and
sentence it should say. Files where they differ are listed for a person to listen to.

    python tools/course/check_audio.py ar                         # the published course (docs/course)
    python tools/course/check_audio.py ar --dir tools/course/build/preview

Uses the Whisper model already downloaded by Tamkeen on this computer (read only), on the graphics
card when Tamkeen's GPU libraries are there. Writes <dir>/<lang>/audio/check.json.
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


def norm(text: str) -> list[str]:
    """Words compared the way a listener would: no vowel marks, punctuation or alef/ya/ta marbuta spellings."""
    t = MARKS.sub("", unicodedata.normalize("NFC", text))
    t = re.sub("[آأإٱ]", "ا", t).replace("ى", "ي").replace("ة", "ه")
    return PUNCT.sub(" ", t).split()


def score(heard: str, expected: str) -> float:
    a, b = norm(heard), norm(expected)
    return difflib.SequenceMatcher(a=a, b=b).ratio() if b else 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("lang")
    ap.add_argument("--dir", default=str(ROOT / "docs" / "course"))
    ap.add_argument("--under", type=float, default=0.85, help="list files that match less than this")
    args = ap.parse_args()
    folder = Path(args.dir) / args.lang
    course = json.loads((folder / "course.json").read_text(encoding="utf-8"))
    data = Path(os.environ.get("APPDATA", "")) / "ArabicPodcastStudio"
    libs = data / "gpu-libs"
    if libs.exists():
        os.add_dll_directory(str(libs))
        os.environ["PATH"] = str(libs) + os.pathsep + os.environ.get("PATH", "")
    from faster_whisper import WhisperModel

    sys.path.insert(0, str(ROOT))
    from app import audio  # decodes the way Tamkeen does (16 kHz mono), whatever faster-whisper's own reader expects

    model_dir = data / "models" / "faster-whisper" / "large-v3"
    try:
        model = WhisperModel(str(model_dir), device="cuda", compute_type="float16")
    except Exception as exc:  # no usable graphics card: slower, but it works
        print(f"(on the CPU: {exc.__class__.__name__})")
        model = WhisperModel(str(model_dir), device="cpu", compute_type="int8")
    results, low = [], []
    hear = lambda pcm: " ".join(seg.text.strip() for seg in model.transcribe(
        pcm, language=args.lang, beam_size=5, vad_filter=False, condition_on_previous_text=False)[0])
    for w in course["words"]:
        pcm = audio.decode(folder / w["audio"])  # 16 kHz mono
        t = w["times"]
        cut = lambda a, b: pcm[max(0, int((a - 0.05) * 16000)): int((b + 0.1) * 16000)]
        # The sentence is what counts: a single word on its own is often misheard even when said well.
        heard_s = hear(cut(t["sent_start"], t["sent_end"]))
        heard_w = hear(cut(t["start"], t["end"]))
        sc = round(score(heard_s, w["sentence"]), 3)
        word_ok = bool(set(norm(w["word"])) & set(norm(heard_w))) or score(heard_w, w["word"]) >= 0.5
        results.append({"n": w["n"], "score": sc, "word_heard": word_ok, "heard": heard_s, "heard_word": heard_w,
                        "expected": MARKS.sub("", w["sentence"]), "word": MARKS.sub("", w["word"])})
        if sc < args.under:
            low.append(results[-1])
        print(f"{w['n']:4d} {sc:.2f} {'word ok' if word_ok else 'word?'}", flush=True)
    (folder / "audio" / "check.json").write_text(json.dumps({"under": args.under, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    mean = sum(r["score"] for r in results) / max(1, len(results))
    words_ok = sum(r["word_heard"] for r in results)
    print(f"\n{len(results)} files: the sentences match {mean:.2f} on average, {len(low)} under {args.under}; "
          f"the word heard in {words_ok} (details in check.json)")


if __name__ == "__main__":
    sys.exit(main())
