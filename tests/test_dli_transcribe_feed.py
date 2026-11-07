"""tools/dli/transcribe_feed.py: it never works in a library signed in to Google, the real data folder or
a folder it didn't make, and its file names are safe."""

from __future__ import annotations

import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("transcribe_feed", ROOT / "tools" / "dli" / "transcribe_feed.py")
tf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tf)  # type: ignore[union-attr]


def _library(folder: Path, **settings: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    (folder / tf.MARKER).write_text("made by the script")
    conn = sqlite3.connect(folder / "library.db")
    conn.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
    conn.executemany("INSERT INTO settings VALUES (?, ?)", [(k, json.dumps(v)) for k, v in settings.items()])
    conn.commit()
    conn.close()


@pytest.fixture()
def real(tmp_path, monkeypatch):
    real = tmp_path / "real" / "ArabicPodcastStudio"
    monkeypatch.setattr(tf, "real_data_dir", lambda: real)
    return real


def test_a_new_folder_or_its_own_signed_out_library_is_used(tmp_path, real):
    tf.check_data_folder(tmp_path / "new")
    _library(tmp_path / "mine", google_refresh_token="", google_email="")
    tf.check_data_folder(tmp_path / "mine")


@pytest.mark.parametrize("key", ["google_refresh_token", "google_email"])
def test_a_signed_in_library_is_refused(tmp_path, real, key):
    _library(tmp_path / "lib", **{key: "something"})
    with pytest.raises(tf.Refused, match="signed in"):
        tf.check_data_folder(tmp_path / "lib")


def test_the_real_data_folder_the_repository_and_strange_folders_are_refused(tmp_path, real):
    real.mkdir(parents=True)
    for folder in (real, real / "sub", real.parent, ROOT / "dli-test", ROOT):
        with pytest.raises(tf.Refused):
            tf.check_data_folder(folder)
    other = tmp_path / "someone-elses"
    other.mkdir()
    (other / "library.db").write_bytes(b"")
    with pytest.raises(tf.Refused, match="wasn't made by this script"):
        tf.check_data_folder(other)
    with pytest.raises(tf.Refused):
        tf.check_out_folder(ROOT / "transcripts")


def test_file_names_from_guids_are_safe_and_distinct():
    taken: set[str] = set()
    a = tf.safe_name("arabic101.podbean.com/8f175a7a-829b-3c6e-b58b-9e22b05c3ca4", taken)
    assert a == "arabic101.podbean.com_8f175a7a-829b-3c6e-b58b-9e22b05c3ca4.json"
    b = tf.safe_name("arabic101.podbean.com?8f175a7a-829b-3c6e-b58b-9e22b05c3ca4", taken)  # same once made safe
    assert b != a and b.endswith(".json")
    assert tf.safe_name("../../CON", taken) == "_CON.json"
    assert tf.safe_name("حلقة", taken) == "episode.json"
    assert all(set(n) <= set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-") for n in (a, b))
