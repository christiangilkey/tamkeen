"""AI keys saved on one device reach the user's others (app/aikeys.py, and its phone twin web/js/aikeys.js)."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from app import aikeys, db
from tests.test_sync import world  # noqa: F401  (the two-device fixture)

ROOT = Path(__file__).resolve().parent.parent


def test_newest_copy_of_each_key_wins():
    mine = {"llm_key_claude": "sk-old", "stt_key_groq": "gsk-mine", aikeys.TIMES: {"llm_key_claude": 100, "stt_key_groq": 300}}
    theirs = {"llm_key_claude": {"value": "sk-new", "at": 200}, "stt_key_groq": {"value": "gsk-theirs", "at": 250},
              "llm_key_gemini": {"value": "AIza", "at": 0}, "not_a_key": {"value": "x", "at": 999}}
    changes = aikeys.take(mine, theirs)
    assert changes["llm_key_claude"] == "sk-new"          # theirs is newer
    assert "stt_key_groq" not in changes                   # mine is newer
    assert changes["llm_key_gemini"] == "AIza"             # a key beats no key, even unstamped
    assert "not_a_key" not in changes
    assert changes[aikeys.TIMES] == {"llm_key_claude": 200, "stt_key_groq": 300, "llm_key_gemini": 0}


def test_a_removed_key_is_removed_everywhere():
    mine = {"llm_key_openai": "sk-x", aikeys.TIMES: {"llm_key_openai": 10}}
    assert aikeys.take(mine, {"llm_key_openai": {"value": "", "at": 20}})["llm_key_openai"] == ""
    # ...but an older removal doesn't take away a key saved since.
    assert aikeys.take(mine, {"llm_key_openai": {"value": "", "at": 5}}) == {}


def test_saving_stamps_only_keys_that_change():
    now = 1_760_000_000.7
    settings = {"llm_key_claude": "sk-a"}
    assert aikeys.stamp(settings, {"llm_key_claude": "sk-a", "theme": "dark"}, now) == {"llm_key_claude": "sk-a", "theme": "dark"}
    stamped = aikeys.stamp(settings, {"llm_key_claude": " sk-b ", "stt_key_openai": ""}, now)
    assert stamped[aikeys.TIMES] == {"llm_key_claude": 1_760_000_000}


def test_key_saved_on_one_device_appears_on_the_other(world):  # noqa: F811
    drive, a, b = world
    with a:
        db.set_settings(aikeys.stamp(db.get_settings(), {"llm_key_claude": "sk-ant-123"}, 1000))
    a.sync(drive)
    b.sync(drive)
    with b:
        assert db.get_setting("llm_key_claude") == "sk-ant-123"
        db.set_settings(aikeys.stamp(db.get_settings(), {"llm_key_claude": ""}, 2000))  # removed on B
    assert b.sync(drive).library_uploaded, "a changed key alone is worth an upload"
    a.sync(drive)
    with a:
        assert db.get_setting("llm_key_claude") == ""


def test_phone_and_computer_agree():
    """The same cases through web/js/aikeys.js give the same answers."""
    cases = [
        [{"llm_key_claude": "a", "key_times": {"llm_key_claude": 5}}, {"llm_key_claude": {"value": "b", "at": 5}}],
        [{"llm_key_claude": "b"}, {"llm_key_claude": {"value": "a", "at": 0}}],
        [{}, {"stt_key_groq": {"value": " gsk ", "at": "7"}, "llm_key_grok": {"value": "", "at": 0}}],
        [{"stt_key_openai": "x", "key_times": {"stt_key_openai": 9}}, {"stt_key_openai": {"value": "", "at": 12}}],
    ]
    script = ("import('./web/js/aikeys.js').then(m => { const cases = JSON.parse(process.argv[1]);"
              " console.log(JSON.stringify(cases.map(([s, t]) => [m.takeKeys(s, t), m.keysFromSettings(s)]))); })")
    out = subprocess.run(["node", "-e", script, json.dumps(cases)], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert json.loads(out) == [[aikeys.take(s, t), aikeys.from_settings(s)] for s, t in cases]
