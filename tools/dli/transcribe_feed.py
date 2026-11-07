"""Transcribe a whole podcast feed with Tamkeen's own desktop pipeline, for ready-made transcripts.

Made for the DLI student feature (2026-11-06): a podcast is transcribed once, on this computer, and its
transcripts are installed in the app, so learners get them without transcribing anything themselves.

    .venv/Scripts/python tools/dli/transcribe_feed.py FEED_URL OUT_FOLDER --data DATA_FOLDER

    for example:
    .venv/Scripts/python tools/dli/transcribe_feed.py https://feed.podbean.com/arabic101/feed.xml
        ../dli-content/arabic101 --data ../dli-work/arabic101-data

What it does, in order. Everything goes through the app's own modules in app/; nothing is re-made by hand.

1. DATA_FOLDER becomes the app's data folder (APS_DATA_DIR). It must be new, or one this script made
   before (it leaves a marker file there). A library signed in to Google is refused, before the run and
   all through it: the script never signs in and never starts Drive sync, so nothing reaches anyone's
   Google Drive. The real data folder (%APPDATA%/ArabicPodcastStudio) and folders inside this repository
   are refused too. Never give it a copy of a real library.
2. It borrows the models Tamkeen already downloaded on this computer: DATA_FOLDER/models/faster-whisper
   and DATA_FOLDER/gpu-libs become links (Windows junctions) to the ones in the real data folder. They
   are removed again at the end with "rmdir", which removes the link only, never the models behind it.
   While they exist, don't delete DATA_FOLDER with a delete-everything-inside command (--unlink first).
3. Settings as a new desktop install picks them on this computer: the language (Arabic unless
   --language), the recommended model (app/hardware.py recommend_model: large-v3 with an NVIDIA card of
   6 GB or more), beam size 5, transcription on this computer (not the cloud). The app's speech scan
   (faster-whisper's voice detector, app/transcriber/faster.py) comes with the engine.
4. It subscribes to the feed (feeds.add_feed) and queues every episode in the feed's order (jobs.enqueue). The
   app's own worker (jobs.worker) downloads each one, scans it for speech and writes it with
   faster-whisper on the graphics card; when CUDA can't load, the engine falls back to the processor,
   as in the app. An episode that fails is tried once more.
5. Arabic: the vowel model (CATT, 22 MB, pinned and checksum-checked: app/tashkeel.py) is downloaded into
   DATA_FOLDER if it isn't there yet, and the app's vowel worker gives every transcript its vowelled copy,
   as on a desktop where "Show vowels" was turned on (--no-vowels leaves this out).
6. It writes OUT_FOLDER/<guid, made safe for a file name>.json for each episode: exactly
   app/sync/engine.py transcript_payload(episode_id), the transcript format sync uses, so the app can
   install it with store_transcript. And OUT_FOLDER/index.json: the feed's address and, for each episode,
   its guid, title, audio address, publication date, length and transcript file name.

Run it again with the same folders to finish what an interrupted run left: finished episodes are kept.
The audio stays in DATA_FOLDER/audio (never in the repository). Other options: --limit N (the first N
episodes only), --model SIZE, --language CODE, --unlink (only remove the model links, then stop).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent  # the repository
APP_ID = "ArabicPodcastStudio"  # the app's data folder name (app/version.py)
MARKER = ".tamkeen-transcribe-feed"  # left in a data folder this script made
LINKS = (Path("models") / "faster-whisper", Path("gpu-libs"))  # borrowed from the real data folder
RETRIES = 1  # extra tries for an episode that failed
POLL = 15  # seconds between progress lines
INDEX_FORMAT = 1
_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(10)), *(f"LPT{i}" for i in range(10))}

log = logging.getLogger("transcribe_feed")


class Refused(SystemExit):
    """A folder this script must not use (the message says why)."""

    def __init__(self, message: str) -> None:
        super().__init__(f"Refused: {message}")


# ---------------------------------------------------------------------------------- safety checks

def real_data_dir() -> Path:
    """The real library's folder, as app/paths.py finds it without APS_DATA_DIR."""
    from platformdirs import user_data_dir

    return Path(user_data_dir(APP_ID, appauthor=False, roaming=True))


def _within(path: Path, folder: Path) -> bool:
    path, folder = path.resolve(), folder.resolve()
    return path == folder or folder in path.parents


def signed_in_rows(db_path: Path) -> list[str]:
    """The Google sign-in settings that hold a value in this library ([] = signed out). Read only."""
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(db_path.resolve().as_uri() + "?mode=ro", uri=True)
    except sqlite3.Error as exc:
        raise Refused(f"couldn't read {db_path} to check its Google sign-in ({exc})") from exc
    try:
        rows = conn.execute("SELECT key, value FROM settings WHERE key IN ('google_refresh_token', 'google_email')").fetchall()
    except sqlite3.Error as exc:
        if "no such table" in str(exc):
            return []  # a library not set up yet
        raise Refused(f"couldn't read {db_path} to check its Google sign-in ({exc})") from exc
    finally:
        conn.close()
    held = []
    for key, value in rows:
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            pass
        if value:
            held.append(key)
    return held


def check_data_folder(data: Path) -> None:
    """Refuse any folder but a new one or one this script made, and any library signed in to Google."""
    real = real_data_dir()
    if _within(data, real) or _within(real, data):
        raise Refused(f"{data} is (or holds) the real Tamkeen data folder {real}.")
    if _within(data, ROOT):
        raise Refused(f"{data} is inside the repository; use a folder outside it.")
    if not data.exists():
        return
    if not data.is_dir():
        raise Refused(f"{data} is not a folder.")
    held = signed_in_rows(data / "library.db")
    if held:
        raise Refused(f"the library in {data} is signed in to Google ({', '.join(held)} set). Use a new folder.")
    if not (data / MARKER).exists() and any(data.iterdir()):
        raise Refused(f"{data} isn't empty and wasn't made by this script. Use a new folder.")


def check_out_folder(out: Path) -> None:
    if _within(out, ROOT):
        raise Refused(f"{out} is inside the repository: transcripts don't belong there.")
    if _within(out, real_data_dir()):
        raise Refused(f"{out} is inside the real Tamkeen data folder.")


# ---------------------------------------------------------------------------------- borrowed models

def _is_link(path: Path) -> bool:
    return os.path.isjunction(path) or path.is_symlink()


def make_links(data: Path) -> list[Path]:
    """Links in DATA_FOLDER to the real data folder's models and GPU libraries (those that exist there)."""
    made = []
    real = real_data_dir()
    for rel in LINKS:
        link, target = data / rel, real / rel
        if _is_link(link):
            made.append(link)  # left by an earlier run that was stopped: used, and removed at the end
            continue
        if link.exists() or not target.is_dir():
            continue  # the folder's own copy, or nothing to borrow (no GPU libraries: the processor is used)
        link.parent.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], check=True, capture_output=True)
        else:
            os.symlink(target, link, target_is_directory=True)
        log.info("Linked %s -> %s", link, target)
        made.append(link)
    return made


def remove_links(data: Path) -> None:
    """Remove the links only ("rmdir" on a junction removes the link, never what it points to)."""
    for rel in LINKS:
        link = data / rel
        if not _is_link(link):
            continue
        if sys.platform == "win32":
            subprocess.run(["cmd", "/c", "rmdir", str(link)], check=False, capture_output=True)
        else:
            os.unlink(link)
        if _is_link(link) or link.exists():
            log.warning("Couldn't remove the link %s: remove it with  cmd /c rmdir \"%s\"", link, link)
        else:
            log.info("Removed the link %s", link)


# ---------------------------------------------------------------------------------- output

def safe_name(guid: str, taken: set[str]) -> str:
    """A file name made from an episode's guid: letters, digits, dot, dash and underscore only."""
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", guid).strip("._")[:100] or "episode"
    if base.split(".")[0].upper() in _RESERVED:
        base = "_" + base
    if base.lower() in taken:
        base = f"{base}-{hashlib.sha1(guid.encode('utf-8')).hexdigest()[:8]}"
    taken.add(base.lower())
    return base + ".json"


def _iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def _write(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _git_version() -> str | None:
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "describe", "--tags", "--always", "--dirty"],
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or None
    except Exception:
        return None


# ---------------------------------------------------------------------------------- the run

def _setup_logging(data: Path) -> None:
    (data / "logs").mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    for handler in (logging.FileHandler(data / "logs" / "transcribe_feed.log", encoding="utf-8"),
                    logging.StreamHandler(sys.stdout)):
        handler.setFormatter(fmt)
        root.addHandler(handler)
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per request, with long signed addresses


def _feed_row(conn: Any, url: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM feeds WHERE deleted = 0 AND url = ?", (url,)).fetchone()
    if row is None:  # the feed's address after redirects is what was stored
        rows = conn.execute("SELECT * FROM feeds WHERE deleted = 0 AND url NOT LIKE 'local:%'").fetchall()
        row = rows[0] if len(rows) == 1 else None
    return dict(row) if row else None


def run(args: argparse.Namespace, data: Path, out: Path) -> int:
    os.environ["APS_DATA_DIR"] = str(data)
    sys.path.insert(0, str(ROOT))
    # Not app.main.startup_checks: it can delete gpu-libs (a pending removal), here a link to the real one.
    from app import db, feeds, hardware, jobs, languages, models_manager, tashkeel
    from app.sync import engine, oauth

    db.init_db()
    if oauth.signed_in():
        raise Refused(f"the library in {data} is signed in to Google.")
    lang = args.language
    if not languages.valid(lang):
        raise SystemExit(f"Unknown language code: {lang}")
    hw = hardware.detect()
    size = args.model or hardware.recommend_model(hw)
    own = models_manager.for_language(lang, hw.engine)  # a model made for the language wins, as in the app
    if not own and not models_manager.is_installed(size, hw.engine):
        raise SystemExit(f"The {size} model isn't downloaded in Tamkeen on this computer "
                         f"({models_manager.model_dir(size, hw.engine)}).")
    db.set_settings({"study_language": lang, "model_size": size, "stt_mode": "local"})
    log.info("Hardware: %s, GPU %s (%s GB), CUDA libraries %s -> engine %s on %s; model %s, beam %s",
             hw.cpu, hw.nvidia_gpu, hw.nvidia_vram_gb, "ready" if hw.cuda_libs_ready else "missing",
             hw.engine, hw.device, own or size, db.get_setting("beam_size"))

    # Subscribe (or, on a second run, look for new episodes).
    url = feeds.normalize_url(args.feed)
    with db.session() as conn:
        feed = _feed_row(conn, url)
    if feed is None:
        feed = feeds.add_feed(url)
        log.info("Subscribed to %s (%s)", feed["title"], feed["url"])
    else:
        feeds.refresh_feed(feed["id"])
        log.info("Already subscribed to %s; checked it for new episodes", feed["title"])
    with db.session() as conn:
        # In the feed's own order (the order the episodes were added in): Arabic101 lists Unit 01 first
        # though it was published last.
        eps = [dict(r) for r in conn.execute(
            "SELECT id, uid, guid, title, status FROM episodes WHERE feed_id = ? AND deleted = 0 ORDER BY id",
            (feed["id"],)).fetchall()]
    if args.limit:
        eps = eps[:args.limit]
    ids = [e["id"] for e in eps]

    vowels = lang == "ar" and not args.no_vowels
    if vowels and not tashkeel.installed():
        log.info("Downloading the vowel model (%s, %.1f MB)", tashkeel.MODEL_ID, tashkeel.MODEL_BYTES / 1e6)
        tashkeel.start_download()
        while tashkeel.status()["state"] == "downloading":
            time.sleep(1)
        if not tashkeel.installed():
            log.warning("No vowel model (%s): transcripts are written without vowels.", tashkeel.status()["error"])
            vowels = False

    todo = [e["id"] for e in eps if e["status"] != "done"]
    log.info("%d episodes, %d to transcribe", len(eps), len(todo))
    started = time.monotonic()
    jobs.enqueue(todo)
    jobs.worker.start()
    tries: dict[int, int] = {}
    failed_told: dict[int, int] = {}  # episode -> the try its failure was logged for
    seen_done: set[int] = {e["id"] for e in eps if e["status"] == "done"}
    while True:
        time.sleep(POLL)
        if oauth.signed_in():  # someone signed this library in while it ran: stop at once
            jobs.worker.stop()
            raise Refused(f"the library in {data} was signed in to Google during the run.")
        with db.session() as conn:
            rows = {r["id"]: dict(r) for r in conn.execute(
                f"SELECT id, title, status, progress, error, model, duration FROM episodes WHERE id IN ({','.join('?' * len(ids))})",
                ids).fetchall()} if ids else {}
        for i in ids:
            r = rows[i]
            if r["status"] == "done" and i not in seen_done:
                seen_done.add(i)
                log.info("Done: %s (%s)", r["title"], r["model"])
            elif r["status"] == "failed" and failed_told.get(i) != tries.get(i, 0):
                failed_told[i] = tries.get(i, 0)
                log.warning("Failed: %s: %s", r["title"], r["error"])
        current = [r for r in rows.values() if r["status"] in ("downloading", "transcribing")]
        minutes = (time.monotonic() - started) / 60
        log.info("Progress: %d of %d done, %.1f min%s", len(seen_done & set(ids)), len(ids), minutes,
                 "".join(f"; now {r['title']} ({r['status']} {r['progress']:.0f}%)" for r in current))
        if any(r["status"] in jobs.ACTIVE_STATUSES for r in rows.values()):
            continue
        again = [i for i in ids if rows[i]["status"] == "failed" and tries.get(i, 0) < RETRIES]
        if not again:
            break
        for i in again:
            tries[i] = tries.get(i, 0) + 1
        log.info("Trying %d failed episode(s) once more", len(again))
        jobs.enqueue(again)
    log.info("Transcription finished in %.1f minutes", (time.monotonic() - started) / 60)
    jobs.worker.stop()

    if vowels:  # the vowel worker runs after each transcription (jobs._process); wait for it to finish
        kicks = 0
        while True:
            with db.session() as conn:
                left = [i for i in tashkeel.pending(conn) if i in set(ids)]
            busy = tashkeel.status()["working"]
            if not left and not busy:
                break
            if not busy:
                if kicks >= 3:
                    log.warning("%d episode(s) got no vowels (see the log above)", len(left))
                    break
                kicks += 1
                tashkeel.kick()
            time.sleep(2)
        log.info("Vowels added (%.1f minutes in all)", (time.monotonic() - started) / 60)

    # Export: the app's sync format for each transcript, and the index.
    out.mkdir(parents=True, exist_ok=True)
    taken: set[str] = set()
    listed, missing, models = [], [], set()
    with db.session() as conn:
        rows = {r["id"]: dict(r) for r in conn.execute(
            "SELECT id, uid, guid, title, audio_url, audio_type, published, duration, status, model "
            "FROM episodes WHERE feed_id = ?", (feed["id"],)).fetchall()}
    for i in ids:
        ep = rows[i]
        if ep["status"] != "done":
            missing.append(ep["title"])
            continue
        payload = engine.transcript_payload(i)
        name = safe_name(ep["guid"], taken)
        _write(out / name, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        models.add(ep["model"])
        listed.append({"guid": ep["guid"], "uid": ep["uid"], "title": ep["title"], "audio_url": ep["audio_url"],
                       "audio_type": ep["audio_type"], "pub_date": _iso(ep["published"]), "published": ep["published"],
                       "duration": ep["duration"], "transcript": name, "words": len(payload["words"]["text"]),
                       "vowels": "vowels" in payload})
    index = {
        "format": INDEX_FORMAT,
        "feed_url": feed["url"], "feed_uid": feed["uid"], "feed_title": feed["title"], "language": lang,
        "made_at": _iso(time.time()), "made_with": {"app": "Tamkeen", "version": _git_version(),
                                                     "models": sorted(m for m in models if m),
                                                     "vowels": tashkeel.MODEL_ID if vowels else None},
        "episodes": listed,
    }
    _write(out / "index.json", json.dumps(index, ensure_ascii=False, indent=1))
    log.info("Wrote %d transcripts and index.json to %s (%.1f minutes in all; %s)", len(listed), out,
             (time.monotonic() - started) / 60, ", ".join(sorted(m for m in models if m)) or "no model")
    for title in missing:
        log.warning("Not transcribed: %s", title)
    return 1 if missing else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("feed", nargs="?", help="the podcast's RSS feed address")
    ap.add_argument("out", nargs="?", help="folder for the transcripts and index.json")
    ap.add_argument("--data", required=True, help="the data folder to work in: new, or one this script made")
    ap.add_argument("--language", default="ar", help="the language spoken (app/languages.py code; default ar)")
    ap.add_argument("--model", help="the model size (default: the one the app recommends on this computer)")
    ap.add_argument("--limit", type=int, help="only the first N episodes, in the feed's order")
    ap.add_argument("--no-vowels", action="store_true", help="Arabic: leave out the vowelled copy")
    ap.add_argument("--unlink", action="store_true", help="only remove the model links from --data, then stop")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # titles in any script
    data = Path(args.data).resolve()
    if args.unlink:
        logging.basicConfig(level=logging.INFO)
        remove_links(data)
        return 0
    if not args.feed or not args.out:
        ap.error("give the feed address and the output folder")
    out = Path(args.out).resolve()
    check_data_folder(data)
    check_out_folder(out)
    data.mkdir(parents=True, exist_ok=True)
    (data / MARKER).write_text("Made by tools/dli/transcribe_feed.py; never signed in to Google.\n", encoding="utf-8")
    _setup_logging(data)
    make_links(data)
    try:
        return run(args, data, out)
    finally:
        jobs = sys.modules.get("app.jobs")  # only if run() got as far as loading the app
        if jobs is not None:
            try:
                jobs.worker.stop()  # an unfinished episode goes back in the queue for the next run
                thread = getattr(jobs.worker, "_thread", None)
                if thread is not None:
                    thread.join(timeout=60)
            except Exception:
                log.exception("Couldn't stop the transcription worker")
        remove_links(data)


if __name__ == "__main__":
    sys.exit(main())
