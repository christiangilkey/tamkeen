"""The languages being learned (Settings → Languages, and the top bar's switch): the computer's copy
of web/js/learnlist.js. tests/learning_cases.json is run against both so they stay the same.

Settings: `learning_languages` (the list; `study_language` is always on it) and `learning_times`
({code: ms}: when each language was last ticked or unticked, on any device). Two devices' lists merge
language by language, the newer change winning. Unticking never deletes a language's library."""

from __future__ import annotations

from typing import Any

from . import languages


def _whole(x: Any) -> int:
    try:
        return max(0, int(float(x)))
    except (TypeError, ValueError):
        return 0


def clean_list(raw: Any) -> list[str]:
    out: list[str] = []
    for code in raw if isinstance(raw, list) else []:
        if languages.valid(code) and code not in out:
            out.append(code)
    return out


def clean_times(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}
    return {code: _whole(t) for code, t in raw.items() if languages.valid(code) and _whole(t) > 0}


def effective_list(s: dict[str, Any]) -> list[str]:
    """The languages being learned, with the one studied now on it (first, if it wasn't there yet)."""
    out = clean_list(s.get("learning_languages"))
    study = s.get("study_language")
    if languages.valid(study) and study not in out:
        out.insert(0, study)
    return out


def stamp_times(before: list[str], after: list[str], times: Any, now: int) -> dict[str, int]:
    out = clean_times(times)
    for code in dict.fromkeys([*before, *after]):
        if (code in before) != (code in after):
            out[code] = _whole(now)
    return out


def with_learning(values: dict[str, Any], s: dict[str, Any], now: int) -> dict[str, Any]:
    """Settings about to be saved, with the list and its times filled in (learnlist.js withLearning).
    A page sends them already; this makes sure the times come from this computer's clock."""
    has_list = "learning_languages" in values
    study = values.get("study_language") if languages.valid(values.get("study_language")) else ""
    if not has_list and not study:
        return values
    before = effective_list(s)
    new = clean_list(values["learning_languages"]) if has_list else list(before)
    current = study or s.get("study_language")
    if languages.valid(current) and current not in new:
        new.append(current)
    if not new:
        return {k: v for k, v in values.items() if k not in ("learning_languages", "learning_times")}
    return {**values, "learning_languages": new, "learning_times": stamp_times(before, new, s.get("learning_times"), now)}


def payload(s: dict[str, Any]) -> dict[str, Any]:
    """What goes into the synced library file (sorted, so the same languages in another order are no change)."""
    return {"list": sorted(effective_list(s)), "times": clean_times(s.get("learning_times"))}


def clean_payload(raw: Any) -> dict[str, Any]:
    """A library file's {list, times}, as compared to decide whether to upload (none = empty)."""
    raw = raw if isinstance(raw, dict) else {}
    return {"list": sorted(clean_list(raw.get("list"))), "times": clean_times(raw.get("times"))}


def merge(mine: Any, theirs: Any) -> dict[str, Any]:
    """Two devices' {list, times} as one: per language, the side that changed it last decides."""
    mine = mine if isinstance(mine, dict) else {}
    theirs = theirs if isinstance(theirs, dict) else {}
    a_list, a_times = clean_list(mine.get("list")), clean_times(mine.get("times"))
    b_list, b_times = clean_list(theirs.get("list")), clean_times(theirs.get("times"))
    times = dict(a_times)
    on: set[str] = set()
    for code in dict.fromkeys([*a_list, *b_list, *a_times, *b_times]):
        ta, tb = a_times.get(code, 0), b_times.get(code, 0)
        if tb > ta:
            times[code] = tb
            if code in b_list:
                on.add(code)
        elif ta > tb:
            if code in a_list:
                on.add(code)
        elif code in a_list or code in b_list:
            on.add(code)
    out = [c for c in dict.fromkeys([*a_list, *b_list]) if c in on]
    if not out:
        pool = sorted(set(a_list) | set(b_list))
        if pool:
            best = pool[0]
            for c in pool:
                if times.get(c, 0) > times.get(best, 0):
                    best = c
            out = [best]
    return {"list": out, "times": times}


def take(s: dict[str, Any], remote: Any) -> dict[str, Any]:
    """Another device's {list, times} taken into these settings: the settings that change."""
    if not isinstance(remote, dict) or not isinstance(remote.get("list"), list):
        return {}
    before = effective_list(s)
    if not before:
        return {}  # no language chosen yet on this computer: the first-run screen does that
    merged = merge({"list": before, "times": s.get("learning_times")}, remote)
    if not merged["list"]:
        return {}
    out: dict[str, Any] = {}
    if merged["list"] != clean_list(s.get("learning_languages")):
        out["learning_languages"] = merged["list"]
    if merged["times"] != clean_times(s.get("learning_times")):
        out["learning_times"] = merged["times"]
    study = s.get("study_language")
    if languages.valid(study) and study not in merged["list"]:
        out["study_language"] = merged["list"][0]
    return out
