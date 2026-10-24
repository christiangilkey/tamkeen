"""The user's own AI keys (word definitions and cloud transcription), shared between their devices.

A key saved on the phone appears on the computer and the other way round. They travel in the
library file the sync keeps in the user's Google Drive, in its hidden app folder (which only
Tamkeen can read, never the user's other apps or the Drive website). Backups still leave them out
(db.SECRET_SETTINGS).

Each key carries when it was last changed; for each key, the copy changed last wins, so removing a
key on one device removes it on the others too. The phone's copy of this is web/js/aikeys.js: the
two must agree exactly, or two devices would keep rewriting each other's keys.
"""

from __future__ import annotations

from typing import Any

KEYS = ("llm_key_claude", "llm_key_gemini", "llm_key_openai", "llm_key_grok", "stt_key_groq", "stt_key_openai",
        # Card voices (web/js/cardvoice.js): the Azure key and its region, which voice source the cards use,
        # any Azure voice picked per language (JSON), and whether a word saved from something with no sound gets
        # its voice at once ("on"/"off"). They follow the learner the same way.
        "tts_key_azure", "tts_region_azure", "tts_mode", "tts_voices", "tts_on_save")
TIMES = "key_times"  # setting: {key name: when it last changed, on this device or another (whole seconds)}
MAX_LENGTH = 2000


def _record(value: Any, at: Any) -> dict[str, Any]:
    text = str(value or "").strip()[:MAX_LENGTH]
    try:
        when = max(0, int(at or 0))
    except (TypeError, ValueError):
        when = 0
    return {"value": text, "at": when}


def clean(raw: Any) -> dict[str, dict[str, Any]]:
    """Keys as {name: {value, at}}, only the known names, leaving out ones never set anywhere."""
    out: dict[str, dict[str, Any]] = {}
    for name in KEYS:
        r = raw.get(name) if isinstance(raw, dict) else None
        if isinstance(r, dict):
            rec = _record(r.get("value"), r.get("at"))
            if rec["value"] or rec["at"]:
                out[name] = rec
    return out


def from_settings(settings: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """This device's keys, as the sync file carries them."""
    times = settings.get(TIMES) if isinstance(settings.get(TIMES), dict) else {}
    return clean({name: {"value": settings.get(name), "at": times.get(name)} for name in KEYS})


def wins(theirs: dict[str, Any], mine: dict[str, Any] | None) -> bool:
    """Does the other device's copy of a key replace this one? The one changed last does; when both
    changed at the same moment (or neither was ever stamped), the longer-sorting value, so a key beats
    no key and both devices settle on the same one."""
    mine = mine or {"value": "", "at": 0}
    if theirs["at"] != mine["at"]:
        return theirs["at"] > mine["at"]
    return theirs["value"] > mine["value"]


def take(settings: dict[str, Any], theirs: Any) -> dict[str, Any]:
    """The settings to change so this device has the keys that win (empty if none do)."""
    mine = from_settings(settings)
    times = dict(settings.get(TIMES) or {}) if isinstance(settings.get(TIMES), dict) else {}
    changes: dict[str, Any] = {}
    for name, rec in clean(theirs).items():
        if wins(rec, mine.get(name)):
            changes[name] = rec["value"]
            times[name] = rec["at"]
    if changes:
        changes[TIMES] = times
    return changes


def stamp(settings: dict[str, Any], values: dict[str, Any], now: float) -> dict[str, Any]:
    """`values` about to be saved: if any key really changes, note when, so it wins on the other devices."""
    changed = [n for n in KEYS if n in values and str(values[n] or "").strip() != str(settings.get(n) or "").strip()]
    if not changed:
        return values
    times = dict(settings.get(TIMES) or {}) if isinstance(settings.get(TIMES), dict) else {}
    for name in changed:
        times[name] = int(now)
    return {**values, TIMES: times}
