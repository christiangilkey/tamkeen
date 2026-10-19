"""SQLite storage: schema, migrations and connection helpers.

A fresh connection is opened per unit of work (cheap for SQLite) so request threads and
the background worker never share a connection. WAL mode lets readers proceed while the
worker writes a transcript.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from . import paths

SCHEMA_VERSION = 3

SCHEMA = """
CREATE TABLE IF NOT EXISTS feeds (
    id              INTEGER PRIMARY KEY,
    url             TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    image           TEXT,
    link            TEXT,
    auto_transcribe INTEGER NOT NULL DEFAULT 0,
    last_checked    REAL,
    last_error      TEXT,
    etag            TEXT,
    modified        TEXT,
    created_at      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS episodes (
    id             INTEGER PRIMARY KEY,
    feed_id        INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid           TEXT NOT NULL,
    title          TEXT NOT NULL DEFAULT '',
    description    TEXT NOT NULL DEFAULT '',
    published      REAL,
    duration       REAL,
    image          TEXT,
    audio_url      TEXT NOT NULL,
    audio_type     TEXT,
    audio_path     TEXT,
    status         TEXT NOT NULL DEFAULT 'new',
    progress       REAL NOT NULL DEFAULT 0,
    error          TEXT,
    model          TEXT,
    transcribed_at REAL,
    created_at     REAL NOT NULL,
    UNIQUE(feed_id, guid)
);
CREATE INDEX IF NOT EXISTS idx_episodes_feed ON episodes(feed_id, published DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);

CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY,
    episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    state       TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | cancelled
    error       TEXT,
    created_at  REAL NOT NULL,
    started_at  REAL,
    finished_at REAL
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state, created_at);

CREATE TABLE IF NOT EXISTS segments (
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    idx        INTEGER NOT NULL,
    start      REAL NOT NULL,
    end        REAL NOT NULL,
    text       TEXT NOT NULL,
    norm       TEXT NOT NULL,
    kind       TEXT,           -- imported web pages: h1 | h2 | h3 | p | li | q
    PRIMARY KEY (episode_id, idx)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS words (
    episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    idx        INTEGER NOT NULL,
    seg_idx    INTEGER NOT NULL,
    start      REAL NOT NULL,
    end        REAL NOT NULL,
    text       TEXT NOT NULL,
    prob       REAL,
    PRIMARY KEY (episode_id, idx)
) WITHOUT ROWID;

CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
    norm, episode_id UNINDEXED, seg_idx UNINDEXED, tokenize = 'trigram'
);

CREATE TABLE IF NOT EXISTS vocab (
    id         INTEGER PRIMARY KEY,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
    text       TEXT NOT NULL,
    norm       TEXT NOT NULL,
    sentence   TEXT NOT NULL DEFAULT '',
    start      REAL,
    end        REAL,
    sent_start REAL,
    sent_end   REAL,
    meaning    TEXT NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    episode_title TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL
    -- clip (added by migration): 1 when the word has its own audio clip (it was shared by a
    -- friend), stored as clips/<uid>.ogg; start/end/sent_start/sent_end are then times
    -- inside that clip instead of inside an episode.
    -- translation (added by migration): the sentence in the learner's own language with ⟦ ⟧
    -- around the part that renders the word, kept when a looked-up word is saved. '' for words
    -- typed in, or saved before this existed.
    -- memo (added by migration): the learner's own notes on the word (a mnemonic, say), typed on
    -- the Vocab page or on the back of its card in the reviewer.
);

-- The vocab reviewer's record: one row per answer. A word's place in the schedule is worked out
-- by replaying its answers (web/js/review/fsrs.js), so answers from two devices simply add up.
--   t       when it was answered, in milliseconds
--   rating  3 remembered, 1 not remembered, 0 taken back with Undo
--   day     the answering device's local day number
--   ms      how long the card was looked at
CREATE TABLE IF NOT EXISTS reviews (
    vocab_uid TEXT NOT NULL,
    t         INTEGER NOT NULL,
    rating    INTEGER NOT NULL,
    day       INTEGER NOT NULL,
    ms        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (vocab_uid, t)
) WITHOUT ROWID;

-- Vocab folders (schema v3). A word can be in several: vocab.folders holds a JSON list of folder uids.
CREATE TABLE IF NOT EXISTS vocab_folders (
    id         INTEGER PRIMARY KEY,
    uid        TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Words the learner has seen, kept by dictionary form (lexeme) rather than by spelling, so one
-- row covers every form of a word: وكتبوا، يكتبون and سأكتبها are all "ar|كتب|v".
-- key = language|lemma, normalized for matching|broad part of speech (see web/js/lexicon/).
-- lemma is the dictionary form as printed (كَتَب). Synced; a deleted row means "new again".
CREATE TABLE IF NOT EXISTS known_lexemes (
    key        TEXT PRIMARY KEY,
    lang       TEXT NOT NULL,
    lemma      TEXT NOT NULL DEFAULT '',
    pos        TEXT NOT NULL DEFAULT '',
    root       TEXT NOT NULL DEFAULT '',
    deleted    INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

-- AI word definitions, cached per (word, marked sentence, explanation language).
CREATE TABLE IF NOT EXISTS definitions (
    key        TEXT PRIMARY KEY,
    word       TEXT NOT NULL,
    sentence   TEXT NOT NULL,
    data       TEXT NOT NULL,
    provider   TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL
);

-- The two-way Anki sync (app/anki_sync.py). One row per word that has a card in the Anki deck:
--   note        the card's note id in Anki (NULL when only its progress is known yet)
--   tf, tb      the word's card front and back when the two sides last agreed
--   af, ab      the Anki note's front and back at that time
--   progress    the card's schedule as last read from Anki (JSON, anki_sync.progress_record plus
--               "due" and "seen" dates). Shown in Tamkeen; never written back to Anki.
-- Kept on this computer only (the phone keeps its own for AnkiDroid): it describes one Anki collection.
CREATE TABLE IF NOT EXISTS anki_links (
    uid      TEXT PRIMARY KEY,
    note     INTEGER,
    tf       TEXT NOT NULL DEFAULT '',
    tb       TEXT NOT NULL DEFAULT '',
    af       TEXT NOT NULL DEFAULT '',
    ab       TEXT NOT NULL DEFAULT '',
    progress TEXT
);
"""

_init_lock = threading.Lock()
_initialized: set[Path] = set()


def connect(path: Path | None = None) -> sqlite3.Connection:
    path = path or paths.db_path()
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def init_db(path: Path | None = None) -> None:
    path = path or paths.db_path()
    with _init_lock:
        conn = connect(path)
        try:
            conn.executescript(SCHEMA)
            _migrate(conn)
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            conn.commit()
        finally:
            conn.close()
        _initialized.add(path)


# --- migrations ----------------------------------------------------------------------------

NOW_SQL = "((julianday('now') - 2440587.5) * 86400.0)"

# Sync columns (schema v2). Added idempotently so old and new databases converge.
_SYNC_COLUMNS = {
    "feeds": [("uid", "TEXT"), ("updated_at", "REAL"), ("deleted", "INTEGER NOT NULL DEFAULT 0"),
              ("language", "TEXT")],  # the podcast's language (NULL for the built-in lists: own videos, web pages...)
    "episodes": [("uid", "TEXT"), ("updated_at", "REAL"), ("transcribe_requested_at", "REAL"),
                 ("remote_audio", "INTEGER NOT NULL DEFAULT 0"), ("synced_rev", "REAL"),
                 ("sync_audio_path", "TEXT"), ("deleted", "INTEGER NOT NULL DEFAULT 0"),
                 ("language", "TEXT"),  # what it was transcribed/imported as: ar, es, fr, ja, zh, ru
                 ("vowels", "TEXT")],  # Arabic vowel marks made for it (JSON, see app/tashkeel.py)
    "vocab": [("uid", "TEXT"), ("updated_at", "REAL"), ("deleted", "INTEGER NOT NULL DEFAULT 0"),
              ("episode_uid", "TEXT"), ("folders", "TEXT NOT NULL DEFAULT '[]'"),
              ("clip", "INTEGER NOT NULL DEFAULT 0"), ("translation", "TEXT NOT NULL DEFAULT ''"),
              ("memo", "TEXT NOT NULL DEFAULT ''"),
              ("language", "TEXT")],  # the word's language: the app shows only the language being learned
    "segments": [("kind", "TEXT")],
    # Arabic vowel marks (app/tashkeel.py): each word's vowelled copy (NULL = the word as it is).
    "words": [("vowelled", "TEXT")],
}

# updated_at is bumped automatically whenever a synced field changes locally. Sync writes
# run inside `sync_writes()`, which parks a row in sync_guard for the length of their own
# transaction so the triggers stand down (no other connection ever sees that row).
_TRIGGER_NAMES = ("feeds_ins", "feeds_upd", "episodes_ins", "episodes_upd", "vocab_ins", "vocab_upd",
                  "folders_ins", "folders_upd")
_TRIGGERS = f"""
CREATE TABLE IF NOT EXISTS sync_guard (active INTEGER);
CREATE TRIGGER IF NOT EXISTS feeds_ins AFTER INSERT ON feeds WHEN NEW.updated_at IS NULL AND NOT EXISTS (SELECT 1 FROM sync_guard)
BEGIN UPDATE feeds SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS feeds_upd AFTER UPDATE ON feeds
WHEN NEW.updated_at IS OLD.updated_at AND NOT EXISTS (SELECT 1 FROM sync_guard) AND (NEW.auto_transcribe IS NOT OLD.auto_transcribe
  OR NEW.deleted IS NOT OLD.deleted OR NEW.title IS NOT OLD.title OR NEW.image IS NOT OLD.image)
BEGIN UPDATE feeds SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS episodes_ins AFTER INSERT ON episodes WHEN NEW.updated_at IS NULL AND NOT EXISTS (SELECT 1 FROM sync_guard)
BEGIN UPDATE episodes SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS episodes_upd AFTER UPDATE ON episodes
WHEN NEW.updated_at IS OLD.updated_at AND NOT EXISTS (SELECT 1 FROM sync_guard) AND (NEW.title IS NOT OLD.title OR NEW.audio_url IS NOT OLD.audio_url
  OR NEW.duration IS NOT OLD.duration OR NEW.transcribe_requested_at IS NOT OLD.transcribe_requested_at
  OR NEW.synced_rev IS NOT OLD.synced_rev OR NEW.remote_audio IS NOT OLD.remote_audio OR NEW.deleted IS NOT OLD.deleted
  OR NEW.language IS NOT OLD.language)
BEGIN UPDATE episodes SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS vocab_ins AFTER INSERT ON vocab WHEN NEW.updated_at IS NULL AND NOT EXISTS (SELECT 1 FROM sync_guard)
BEGIN UPDATE vocab SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS vocab_upd AFTER UPDATE ON vocab
WHEN NEW.updated_at IS OLD.updated_at AND NOT EXISTS (SELECT 1 FROM sync_guard) AND (NEW.text IS NOT OLD.text OR NEW.meaning IS NOT OLD.meaning
  OR NEW.notes IS NOT OLD.notes OR NEW.deleted IS NOT OLD.deleted OR NEW.folders IS NOT OLD.folders
  OR NEW.clip IS NOT OLD.clip OR NEW.translation IS NOT OLD.translation OR NEW.memo IS NOT OLD.memo)
BEGIN UPDATE vocab SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS folders_ins AFTER INSERT ON vocab_folders WHEN NEW.updated_at IS NULL AND NOT EXISTS (SELECT 1 FROM sync_guard)
BEGIN UPDATE vocab_folders SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS folders_upd AFTER UPDATE ON vocab_folders
WHEN NEW.updated_at IS OLD.updated_at AND NOT EXISTS (SELECT 1 FROM sync_guard) AND (NEW.name IS NOT OLD.name OR NEW.deleted IS NOT OLD.deleted)
BEGIN UPDATE vocab_folders SET updated_at = {NOW_SQL} WHERE id = NEW.id; END;
"""


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def _migrate(conn: sqlite3.Connection) -> None:
    from . import ids

    # Before the app taught other languages, everything was Arabic. An install from then keeps
    # Arabic as its language and marks what it already transcribed; a new install asks the user.
    upgrading = "language" not in _columns(conn, "episodes")
    for table, cols in _SYNC_COLUMNS.items():
        have = _columns(conn, table)
        for name, decl in cols:
            if name not in have:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
    if upgrading:
        conn.execute("UPDATE episodes SET language = 'ar' WHERE status = 'done'")
        used = conn.execute("SELECT 1 FROM settings WHERE key = 'welcome_seen' AND value = 'true'").fetchone()
        if used or conn.execute("SELECT 1 FROM episodes LIMIT 1").fetchone():
            conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES('study_language', '\"ar\"')")
    for name in _TRIGGER_NAMES:  # recreate so trigger changes in new versions take effect
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")
    conn.executescript(_TRIGGERS)
    conn.execute("DELETE FROM sync_guard")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_feeds_uid ON feeds(uid)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_uid ON episodes(uid)")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_uid ON vocab(uid)")

    # Backfill global ids for rows created before sync existed.
    for row in conn.execute("SELECT id, url, created_at FROM feeds WHERE uid IS NULL").fetchall():
        conn.execute("UPDATE feeds SET uid = ?, updated_at = COALESCE(updated_at, ?) WHERE id = ?",
                     (ids.feed_uid(row[1]), row[2], row[0]))
    for row in conn.execute(
        "SELECT e.id, f.uid, e.guid, e.created_at FROM episodes e JOIN feeds f ON f.id = e.feed_id WHERE e.uid IS NULL"
    ).fetchall():
        conn.execute("UPDATE episodes SET uid = ?, updated_at = COALESCE(updated_at, ?) WHERE id = ?",
                     (ids.episode_uid(row[1], row[2]), row[3], row[0]))
    for row in conn.execute(
        "SELECT v.id, v.created_at, e.uid FROM vocab v LEFT JOIN episodes e ON e.id = v.episode_id WHERE v.uid IS NULL"
    ).fetchall():
        conn.execute("UPDATE vocab SET uid = ?, updated_at = COALESCE(updated_at, ?), episode_uid = ? WHERE id = ?",
                     (ids.new_uid(), row[1], row[2], row[0]))
    fill_languages(conn)


def fill_languages(conn: sqlite3.Connection) -> None:
    """Give podcasts, built-in-list items and words without a language one, so each shows only
    while its language is the one being learned. Podcasts: the language most of their transcribed
    episodes are in, else the one being learned. Words: their episode's, else told by their letters.
    Run with the sync triggers standing down: working a language out is not an edit to sync."""
    from . import languages

    row = conn.execute("SELECT value FROM settings WHERE key = 'study_language'").fetchone()
    study = json.loads(row[0]) if row else ""
    study = study if languages.valid(study) else languages.DEFAULT
    conn.execute("INSERT INTO sync_guard VALUES (1)")
    try:
        conn.execute("""UPDATE feeds SET language = (SELECT e.language FROM episodes e
                          WHERE e.feed_id = feeds.id AND e.language IS NOT NULL
                          GROUP BY e.language ORDER BY COUNT(*) DESC LIMIT 1)
                        WHERE language IS NULL AND url NOT LIKE 'local:%'""")
        conn.execute("UPDATE feeds SET language = ? WHERE language IS NULL AND url NOT LIKE 'local:%'", (study,))
        conn.execute("""UPDATE episodes SET language = ? WHERE language IS NULL
                        AND feed_id IN (SELECT id FROM feeds WHERE url LIKE 'local:%')""", (study,))
        conn.execute("""UPDATE vocab SET language = (SELECT COALESCE(e.language, f.language) FROM episodes e
                          JOIN feeds f ON f.id = e.feed_id WHERE e.id = vocab.episode_id
                             OR (vocab.episode_uid IS NOT NULL AND e.uid = vocab.episode_uid) LIMIT 1)
                        WHERE language IS NULL""")
        for vid, text in conn.execute("SELECT id, text FROM vocab WHERE language IS NULL").fetchall():
            found = languages.detect(text or "", study)
            conn.execute("UPDATE vocab SET language = ? WHERE id = ?", (found if languages.valid(found) else study, vid))
    finally:
        conn.execute("DELETE FROM sync_guard")


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    """Connection that commits on success and rolls back on error."""
    path = paths.db_path()
    if path not in _initialized:
        init_db(path)
    conn = connect(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def sync_writes(conn: sqlite3.Connection) -> Iterator[None]:
    """Within this block, writes keep the updated_at values they set (no trigger bumps)."""
    conn.execute("INSERT INTO sync_guard(active) VALUES(1)")
    try:
        yield
    finally:
        conn.execute("DELETE FROM sync_guard")


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


# --- settings -------------------------------------------------------------------------

DEFAULT_SETTINGS: dict[str, Any] = {
    "model_size": None,             # chosen during first-run setup
    "delete_audio_after": False,    # delete local audio once transcribed
    "stream_from_source": False,    # play from the original URL; audio is only kept temporarily
    "theme": "system",              # system | light | dark
    "font_size": 26,                # transcript font size in px (podcasts and videos)
    "page_font_size": 17,           # text size for imported web pages (set separately; smaller by default)
    "welcome_seen": False,
    "study_language": "",           # the language being learned (ar, es, fr, ja, zh, ru, it, tl, pt, ca, ceb, th, en); chosen on first run
    "learning_languages": [],       # every language being learned (the top bar's switch); study_language is the one now
    "ui_language": "",              # the language the user speaks: the app's own words are shown in it (web/js/i18n.js)
    # The first-run questions (web/js/components/onboarding.js): answered yet, and "beginner" or "started".
    "onboarded": False,
    "study_level": "",
    # Languages whose 1000 common words are still to be counted as seen: they wait for that
    # language's dictionaries (web/js/commonwords.js).
    "common_words_pending": [],
    # Seen words (see web/js/lexicon/seen.js): "no thanks" to the Arabic dictionaries download, and
    # whether words tapped or saved before seen words were kept have been counted on this device.
    "lexicon_declined": False,
    "definer_mode": "ai",
    "review_task_target": "google",  # the Review tab's button sends the day's review to "google" (Tasks) or "onyx"
    "google_scopes": "",  # what the Google sign-in allows (space-separated), e.g. whether Google Tasks is allowed
    "review_task": {},  # {"day", "id"}: today's review task in Google Tasks, updated rather than added again  # "ai", or "dictionary": No AI, the built-in dictionary (web/js/meanings.js)
    "ru_stress": True,              # Russian text shows stress marks (ла́дно) once its word table is here
    # Arabic vowel marks (app/tashkeel.py, web/js/vowels.js): shown or not, and also on dialect speech,
    # where they are a guess (the model learned Standard Arabic).
    "show_vowels": False,
    "vowels_dialect": False,
    "lexemes_backfilled": [],
    "beam_size": 5,
    # The creature game: its whole saved state (see web/js/game/rules.js), whether it makes sounds,
    # and whether it is on at all (Settings → Game features; off keeps the state for later).
    "game_state": None,
    "game_sound": True,
    "game_enabled": True,
    # Followed YouTube channels (web/js/ytfollow.js); travels between devices with the library.
    "youtube_follows": [],
    # Sites saved to the in-app browser's start page (app/pages.py, web/js/browser-sites.js); travels too.
    "browser_sites": [],
    # The Anki companion (see app/companion.py): its secret, and the daily totals it has reported.
    "anki_token": "",
    "anki_days": {},
    "anki_last_report": None,
    # The two-way sync with one Anki deck (see app/anki_sync.py and app/anki_bridge.py): on or off, the
    # deck's name, whether the learner has agreed that deleting a word also deletes its Anki card, and
    # what the last sync did and is waiting on.
    "anki_sync": False,
    "anki_deck": "Tamkeen",          # the single deck there was before each language had its own
    "anki_decks": None,              # language -> deck name (app/anki_bridge.py deck_names); None until first used
    "anki_delete_ok": False,
    "anki_sync_state": None,
    # Japanese, Chinese and Thai reading aids (web/js/lexicon/readings.js): furigana over kanji, pinyin over
    # Chinese characters, which characters Chinese is shown in ("" as written, "simplified", "traditional"),
    # and how Thai words are said, over them.
    "furigana": True,
    "pinyin": True,
    "zh_script": "",
    "thai_readings": True,
    # AI word definitions (users bring their own API key).
    "definer_provider": "claude",
    "definer_language": "English",
    "definer_model_claude": "",
    "definer_model_gemini": "",
    "definer_model_openai": "",
    "definer_model_grok": "",
    # The review card's Mnemonic maker: its own model ("" = the provider's fastest, "same" = the
    # lookups' model) and how hard it thinks ("off", "low", "medium", "high"). See definer.mnemonicConfig.
    "mnemonic_model_claude": "",
    "mnemonic_model_gemini": "",
    "mnemonic_model_openai": "",
    "mnemonic_model_grok": "",
    "mnemonic_effort": "off",
    "llm_key_claude": "",
    "llm_key_gemini": "",
    "llm_key_openai": "",
    "llm_key_grok": "",
    # Cloud transcription (app/transcriber/cloud.py): "local" = this computer writes the transcripts,
    # "cloud" = a speech-to-text provider does, with the user's own key. "" for a model = the recommended one.
    "stt_mode": "local",
    "stt_provider": "groq",
    "stt_model_groq": "",
    "stt_model_openai": "",
    "stt_key_groq": "",
    "stt_key_openai": "",
    "stt_usage": None,              # audio sent to the provider today from this computer
    # Google Drive sync.
    "google_refresh_token": "",
    "google_email": "",
    "sync_audio": True,             # upload compressed audio copies so other devices play identical audio
    "device_id": "",
}

# Settings that hold secrets: never exported in backups.
SECRET_SETTINGS = ("llm_key_claude", "llm_key_gemini", "llm_key_openai", "llm_key_grok", "stt_key_groq", "stt_key_openai",
                   "google_refresh_token", "anki_token")


def get_settings() -> dict[str, Any]:
    with session() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    out = dict(DEFAULT_SETTINGS)
    for r in rows:
        try:
            out[r["key"]] = json.loads(r["value"])
        except json.JSONDecodeError:
            continue
    return out


def get_setting(key: str) -> Any:
    return get_settings().get(key)


def set_settings(values: dict[str, Any]) -> dict[str, Any]:
    with session() as conn:
        for key, value in values.items():
            conn.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )
    return get_settings()
