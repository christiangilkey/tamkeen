"""Two copies of the creature game made into one, so that progress is never lost when they meet.

The same rules as web/js/game/merge.js (read its notes first); tests/fixtures/game-merge.json is run through both.
Until v0.68.0 the copy saved last replaced the other, so a copy that was behind (a phone not synced for days, a web
app whose browser had wiped its storage and started a new egg) wiped out the garden and the gym leaders beaten as
soon as it earned anything. Now each save counts up its device's number in `clock`: a copy that has seen everything
the other has replaces it; two copies played apart are combined (what only grows kept at its best; XP, coins and
gems added up per device from `tally`, so nothing is counted twice).
"""

from __future__ import annotations

import copy
import json
import re
from typing import Any

COUNTERS = ("xp", "coins", "gems")
UNCLAIMED = "_"


def _num(v: Any) -> float:
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf") else 0


def _obj(v: Any) -> dict[str, Any] | None:
    return v if isinstance(v, dict) else None


def _clean(n: float) -> int | float:
    """Numbers as JSON has them on the page: 3.0 is 3."""
    return int(n) if float(n).is_integer() else n


_GIFT_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def clean_gifts(v: Any) -> dict[str, Any]:
    """The game's record of the creator's gifts it has had (web/js/game/gifts.js): gift id -> the glow it added."""
    out: dict[str, Any] = {}
    for gift, glow in list((_obj(v) or {}).items())[:2000]:
        if isinstance(gift, str) and _GIFT_ID.match(gift):
            out[gift] = _clean(_num(glow))
    return out


def is_game(s: Any) -> bool:
    return isinstance(s, dict) and (isinstance(s.get("roster"), list) or isinstance(s.get("creature"), dict))


def order(a: Any, b: Any) -> str:
    """How clock `a` stands to clock `b`: "same", "after", "before" or "apart"."""
    a, b = _obj(a) or {}, _obj(b) or {}
    ahead = behind = False
    for k in set(a) | set(b):
        x, y = _num(a.get(k)), _num(b.get(k))
        if x > y:
            ahead = True
        elif x < y:
            behind = True
    return "apart" if ahead and behind else "after" if ahead else "before" if behind else "same"


def _total(t: Any) -> float:
    return sum(_num(e[0]) - _num(e[1]) for e in (_obj(t) or {}).values() if isinstance(e, list) and len(e) == 2)


def settle(state: dict[str, Any]) -> dict[str, Any]:
    """Make the tally account for every counter's value; what nobody has claimed goes under UNCLAIMED."""
    tally = state["tally"] = _obj(state.get("tally")) or {}
    for k in COUNTERS:
        t = tally[k] = _obj(tally.get(k)) or {}
        for d in [d for d, e in t.items() if not (isinstance(e, list) and len(e) == 2)]:
            del t[d]
        diff = _num(state.get(k)) - _total(t)
        if abs(diff) < 1e-9:
            continue
        e = t[UNCLAIMED] = t[UNCLAIMED] if isinstance(t.get(UNCLAIMED), list) else [0, 0]
        if diff > 0:
            e[0] = _clean(_num(e[0]) + diff)
        else:
            e[1] = _clean(_num(e[1]) - diff)
    return state


def resolve(mine: Any, theirs: Any) -> tuple[str, Any]:
    """("mine" | "theirs" | "merged", the state to keep). Neither input is changed."""
    if not is_game(theirs):
        return "mine", mine
    if not is_game(mine):
        return "theirs", theirs

    def played(s: dict[str, Any]) -> bool:
        # (a game that has had a gift from the creator counts as played: see merge.js)
        return _num(s.get("xp")) > 0 or bool(clean_gifts(s.get("gifts")))

    # An egg nobody has played (a fresh install) never replaces a game with progress, and never joins it.
    if played(theirs) != played(mine):
        return ("theirs", theirs) if played(theirs) else ("mine", mine)
    o = order(theirs.get("clock"), mine.get("clock"))

    # (A copy saved before the clocks has a history nobody knows: no other copy can be shown to have seen it all,
    # so it is combined, never replaced. A web app whose storage was wiped starts a new egg with a clock of its own.)
    def known(s: dict[str, Any]) -> bool:
        return bool(_obj(s.get("clock")))

    if o == "after" and known(mine):
        return "theirs", theirs
    if o == "before" and known(theirs):
        return "mine", mine
    if o == "same" and _num(theirs.get("updated_at")) == _num(mine.get("updated_at")):
        return "mine", mine
    return "merged", combine(mine, theirs)


def _roster(s: dict[str, Any]) -> list[dict[str, Any]]:
    r = s.get("roster") if isinstance(s.get("roster"), list) else [s["creature"]] if isinstance(s.get("creature"), dict) else []
    return [c for c in r if isinstance(c, dict)]


def _seed(c: Any) -> Any:
    v = c.get("seed") if isinstance(c, dict) else None
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _union(a: Any, b: Any) -> list[Any]:
    out = list(a) if isinstance(a, list) else []
    seen = {json.dumps(x, sort_keys=True) for x in out}
    for x in b if isinstance(b, list) else []:
        key = json.dumps(x, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out.append(x)
    return out


def _each(a: Any, b: Any, better) -> dict[str, Any]:
    out = dict(_obj(a) or {})
    for k, v in (_obj(b) or {}).items():
        out[k] = better(out[k], v) if k in out else v
    return out


def _max_numbers(a: Any, b: Any) -> dict[str, Any]:
    def better(x: Any, y: Any) -> Any:
        both = all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x, y))
        return max(x, y) if both else x
    return _each(a, b, better)


def _join_rounds(x: Any, y: Any) -> Any:
    """Fishing's round (today's turns in the pond) from two copies: the later day's; the same day's are joined, so
    a word answered right on either has had its turn, and one missed on either still waits (as merge.js joinRounds)."""
    if x is None or y is None:
        return x if x is not None else y
    dx = x.get("day") if isinstance(x.get("day"), str) else ""
    dy = y.get("day") if isinstance(y.get("day"), str) else ""
    if dx != dy:
        return y if dy > dx else x
    miss: dict[str, dict[str, Any]] = {}
    for m in (x.get("miss") if isinstance(x.get("miss"), list) else []) + (y.get("miss") if isinstance(y.get("miss"), list) else []):
        if not isinstance(m, dict) or not isinstance(m.get("u"), str):
            continue
        had = miss.get(m["u"]) or {}
        miss[m["u"]] = {"u": m["u"], "c": _clean(max(_num(had.get("c")), _num(m.get("c")))),
                        "at": _clean(max(_num(had.get("at")), _num(m.get("at"))))}
    done = [u for u in _union(x.get("done"), y.get("done")) if isinstance(u, str) and u not in miss]
    return {"day": dx, "n": _clean(max(_num(x.get("n")), _num(y.get("n")))), "done": done, "miss": list(miss.values())}


def _join_home(x: Any, y: Any) -> Any:
    """The home's layout (home.js: where the creature has put the decorations): the one changed later, whole (as
    merge.js joinHome)."""
    x, y = _obj(x), _obj(y)
    if x is None or y is None:
        return x if x is not None else y
    return y if _num(y.get("at")) > _num(x.get("at")) else x


def _join_farm(x: Any, y: Any) -> Any:
    """The farm (farm.js, prototype "farm": its field, plants, seeds and barn): the one changed later, whole (as merge.js
    joinFarm)."""
    x, y = _obj(x), _obj(y)
    if x is None or y is None:
        return x if x is not None else y
    return y if _num(y.get("at")) > _num(x.get("at")) else x


def _join_day_count(x: Any, y: Any) -> Any:
    """Today's count of something (idle.gemBuys: gems bought with glow today) from two copies: the later day's; the
    same day's, the higher (as merge.js joinDayCount)."""
    x, y = _obj(x), _obj(y)
    if x is None or y is None:
        return x if x is not None else y
    dx = x.get("day") if isinstance(x.get("day"), str) else ""
    dy = y.get("day") if isinstance(y.get("day"), str) else ""
    if dx != dy:
        return y if dy > dx else x
    return {"day": dx, "n": _clean(max(_num(x.get("n")), _num(y.get("n"))))}


def combine(mine: dict[str, Any], theirs: dict[str, Any]) -> dict[str, Any]:
    mine, theirs = settle(copy.deepcopy(mine)), settle(copy.deepcopy(theirs))
    theirs_first = _num(theirs.get("xp")) > _num(mine.get("xp")) or (
        _num(theirs.get("xp")) == _num(mine.get("xp")) and _num(theirs.get("updated_at")) > _num(mine.get("updated_at")))
    a, b = (theirs, mine) if theirs_first else (mine, theirs)
    out = a

    out["clock"] = _each(a.get("clock"), b.get("clock"), lambda x, y: max(_num(x), _num(y)))
    out["clock"][UNCLAIMED] = _clean(_num(out["clock"].get(UNCLAIMED)) + 1)
    tally: dict[str, Any] = {}
    for k in COUNTERS:
        tally[k] = _each(a["tally"][k], b["tally"][k],
                         lambda x, y: [_clean(max(_num(x[0]), _num(y[0]))), _clean(max(_num(x[1]), _num(y[1])))])
        out[k] = _clean(max(0, _total(tally[k])))
    out["tally"] = tally

    ga, gb = _obj(a.get("idle")), _obj(b.get("idle"))
    released = _union(ga and ga.get("released"), gb and gb.get("released"))
    gone = {s for s in (_seed(r) for r in released) if s is not None}
    garden_of_b = False  # whose garden (and so whose glow) the combined game keeps
    if gb is not None and ga is None:
        out["idle"] = gb
        garden_of_b = True
    elif ga is not None and gb is not None:
        ra = len(ga["released"]) if isinstance(ga.get("released"), list) else 0
        rb = len(gb["released"]) if isinstance(gb.get("released"), list) else 0
        if rb > ra:
            out["idle"] = gb
            garden_of_b = True
        elif ra == rb:
            pa = ga["plots"] if isinstance(ga.get("plots"), list) else []
            pb = gb["plots"] if isinstance(gb.get("plots"), list) else []
            plots = []
            for i in range(max(len(pa), len(pb))):
                x = _obj(pa[i]) if i < len(pa) else None
                y = _obj(pb[i]) if i < len(pb) else None
                p = y if x is None else x if y is None else y if _num(y.get("tier")) > _num(x.get("tier")) else x
                plots.append({**p, "open": bool((x and x.get("open")) or (y and y.get("open")))})
            ga["plots"] = plots
            for k in ("stardust", "badgesPaid", "raidsPaid", "leaguePaid"):
                if k in ga or k in gb:
                    ga[k] = max(_num(ga.get(k)), _num(gb.get(k)))
            for k in ("goalDay", "cardsDay"):
                if isinstance(gb.get(k), str) and not (isinstance(ga.get(k), str) and ga[k] >= gb[k]):
                    ga[k] = gb[k]
            if "bloom" in ga or "bloom" in gb:
                ga["bloom"] = bool(ga.get("bloom") or gb.get("bloom"))
        out["idle"]["released"] = released
        keyed = _union(ga.get("keyed"), gb.get("keyed"))  # (the farm: building kinds opened with a key, kept from both)
        if keyed:
            out["idle"]["keyed"] = keyed
        buys = _join_day_count(ga.get("gemBuys"), gb.get("gemBuys"))
        if buys is not None:
            out["idle"]["gemBuys"] = buys

    # Gifts from the creator: every one either copy has had; glow isn't tallied, so the glow of a gift that the
    # copy whose garden was kept had not had yet is added here (web/js/game/merge.js says why).
    gifts_a, gifts_b = clean_gifts(a.get("gifts")), clean_gifts(b.get("gifts"))
    if gifts_a or gifts_b:
        kept, other = (gifts_b, gifts_a) if garden_of_b else (gifts_a, gifts_b)
        glow = sum(_num(n) for gift, n in other.items() if gift not in kept)
        if glow and _obj(out.get("idle")) is not None:
            out["idle"]["glow"] = _clean(max(0, _num(out["idle"].get("glow")) + glow))
        out["gifts"] = {**other, **kept}

    roster: list[dict[str, Any]] = []
    at: dict[Any, int] = {}
    for c in _roster(a) + _roster(b):
        seed = _seed(c)
        if seed is None or seed in gone:
            continue
        if seed not in at:
            at[seed] = len(roster)
            roster.append(c)
        else:
            # (its last meal, web/js/game/idle.js hunger: the later of the two, whichever copy is kept)
            fed = max(_num(c.get("fedAt")), _num(roster[at[seed]].get("fedAt")))
            # (an egg's lowest talent roll, web/js/game/talents.js: the higher of the two)
            tf = max(_num(c.get("tf")), _num(roster[at[seed]].get("tf")))
            if _num(c.get("growth")) > _num(roster[at[seed]].get("growth")):
                roster[at[seed]] = c
            if fed > 0:
                roster[at[seed]] = {**roster[at[seed]], "fedAt": _clean(fed)}
            if tf > 0:
                roster[at[seed]] = {**roster[at[seed]], "tf": _clean(tf)}
    if roster:
        ra_ = _roster(a)
        i = int(_num(a.get("active")))
        was = _seed(ra_[i] if 0 <= i < len(ra_) else ra_[0] if ra_ else None)
        out["roster"] = roster
        out["active"] = next((j for j, c in enumerate(roster) if c.get("seed") == was), 0)
        out.pop("creature", None)

    gym_a, gym_b = _obj(a.get("gyms")) or {}, _obj(b.get("gyms")) or {}
    out["gyms"] = {**gym_a, "beaten": _clean(max(_num(gym_a.get("beaten")), _num(gym_b.get("beaten")))),
                   "wins": _max_numbers(gym_a.get("wins"), gym_b.get("wins"))}

    # The battle party (battle.js partySeeds): the one chosen later.
    party_a, party_b = _obj(a.get("party")), _obj(b.get("party"))
    if party_b is not None and (party_a is None or _num(party_b.get("at")) > _num(party_a.get("at"))):
        out["party"] = party_b

    for k in ("owned", "attacks", "badges", "tags"):
        out[k] = _union(a.get(k), b.get(k))
    out["stats"] = _max_numbers(a.get("stats"), b.get("stats"))
    for k in ("best_streak", "known"):
        out[k] = _clean(max(_num(a.get(k)), _num(b.get(k))))
    lb, la = b.get("last_complete"), a.get("last_complete")
    if isinstance(lb, str) and (not isinstance(la, str) or lb > la or (lb == la and _num(b.get("streak")) > _num(a.get("streak")))):
        out["last_complete"] = lb
        out["streak"] = _clean(_num(b.get("streak")))

    def answered(e: Any) -> float:
        if not isinstance(e, list):
            return -1
        return (_num(e[2]) if len(e) > 2 else 0) + (_num(e[3]) if len(e) > 3 else 0)

    def fought(r: Any) -> float:
        return _num(r.get("wins")) + _num(r.get("losses")) if isinstance(r, dict) else -1

    out["review"] = _each(a.get("review"), b.get("review"), lambda x, y: y if answered(y) > answered(x) else x)
    out["rivals"] = _each(a.get("rivals"), b.get("rivals"), lambda x, y: y if fought(y) > fought(x) else x)
    out["reading"] = _each(a.get("reading"), b.get("reading"), lambda x, y: x)
    fa, fb = _obj(a.get("finished")) or {}, _obj(b.get("finished")) or {}
    out["finished"] = {**fa, **{k: _union(fa.get(k), fb.get(k)) for k in set(fa) | set(fb)}}
    fish_a, fish_b = _obj(a.get("fishing")), _obj(b.get("fishing"))
    if fish_a is not None and fish_b is not None:
        rnd = _join_rounds(_obj(fish_a.get("round")), _obj(fish_b.get("round")))
        if rnd is not None:
            fish_a["round"] = rnd
    home = _join_home(a.get("home"), b.get("home"))
    if home is not None:
        out["home"] = home
    farm = _join_farm(a.get("farm"), b.get("farm"))
    if farm is not None:
        out["farm"] = farm
    out["updated_at"] = max(_num(a.get("updated_at")), _num(b.get("updated_at")))
    return out
