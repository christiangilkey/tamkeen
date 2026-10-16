"""Two-way sync between the saved words and one Anki deck: the rules, and nothing else.

This file talks to neither Anki nor the database. It is handed what both sides hold right now
(the words, the deck's notes, and what was agreed last time) and answers with what each side
should change. The computer runs it from app/api/anki.py for the add-on inside Anki; the phone
runs the same rules in mobile/src/js/anki-sync.js for AnkiDroid. The two files must give the
same answers: tests/fixtures/anki_sync_parity.json is written from this one and checked
against the other.

The rules:

  Scope       Each language being learned has a deck of its own ("Tamkeen – Spanish"; an older
              single "Tamkeen" deck stays the deck of the language most of its words were in).
              Only notes of those decks are ever passed in, so nothing else in a person's Anki can
              be read, changed or removed from here. (The add-on and the phone's plugin each
              refuse to touch a note they did not find in one of them.) A new word's card goes to
              the deck of the word's language; a card already in one of the decks stays where it
              is, whatever the deck's language, so nothing moves and nothing is doubled.

  Identity    A word is the same word everywhere by its uid. A note carries it as its guid
              (``tk-<uid>``: cards made by the add-on or by "Export for Anki") or as a tag
              (``tamkeen-id::<uid>``: cards made through AnkiDroid, which cannot set a guid, and
              hand-made cards once they are linked). Both travel with the note through Anki's
              own sync. A note with neither is hand-made: it is linked to the word in the deck's
              language with the same front text or the same word, and only when no word matches
              does it become a new word, in the deck's language, with a uid worked out from the
              note's own guid, so two devices that meet the same hand-made note agree on its uid
              without talking to each other.

  Edits       Front and back are merged separately. The side that changed since the last sync
              wins; when both changed, the newer edit wins. From Anki only the meaning (or the
              translated sentence), the notes and the learner's own notes come back; the word
              itself and its sentence are left as Tamkeen has them.

  Deletions   Only a recorded deletion travels: a word deleted in Tamkeen (it leaves a
              tombstone), or a linked note that Anki itself reports as deleted. A note that is
              merely absent is "missing" and nothing is done until the learner decides. So an
              empty or freshly installed side can never wipe the other. Removing a card also
              removes its review history in Anki, so it waits until the learner has agreed once.

  Progress    Each word's due date, interval and right/wrong counts are copied from Anki for
              display. Nothing here ever writes a schedule.

Only a note's Front, Back and tags are ever written. Its image field is never written, and
the card layout (which holds the timer) is never changed.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from typing import Any

from . import arabic

TAG = "tamkeen"                        # on every card Tamkeen makes (exporters.ANKI_TAG)
ID_TAG = "tamkeen-id::"                # + the word's uid
DUPLICATE_TAG = "tamkeen-duplicate"    # a second card of one word, left for the learner to look at
GUID_PREFIX = "tk-"                    # + the word's uid (exporters.anki_guid)
DEFAULT_DECK = "Tamkeen"  # the single deck there was before each language had its own

_UID = re.compile(r"^v[0-9a-f]{1,40}$")
_DROP = re.compile(r"<(script|style)\b[^>]*>.*?</\1\s*>", re.I | re.S)
_BREAK = re.compile(r"<\s*br\s*/?\s*>|</?\s*(?:div|p|li|ul|ol)\b[^>]*>", re.I)
_MARKUP = re.compile(r"<[^>]*>")
_SOUND = re.compile(r"\[sound:[^\]]*\]")
_ENTITY = re.compile(r"&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});")
_SPACES = re.compile("[ \t\r\f\v ]+")
_NAMED = {"amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": " "}
_GRAMMAR = re.compile(r"^<i>\s*\((.*)\)\s*</i>$", re.I | re.S)
_BRACKETED = re.compile(r"[^\[\]]*(?:\[[^\[\]]+\][^\[\]]*)+")
_IN_BRACKETS = re.compile(r"\[([^\[\]]+)\]")
_MARKED = re.compile(r"[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+")
_NOTE = re.compile(r"^note:", re.I)
# What the letters of a study language look like, to tell which side of a hand-made card is the word.
_SCRIPTS = {"ar": re.compile("[؀-ۿݐ-ݿ]"), "ru": re.compile("[Ѐ-ӿ]"),
            "ja": re.compile("[぀-ヿ一-鿿]"), "zh": re.compile("[一-鿿]")}


# ----- identity -----

def id_tag(uid: str) -> str:
    return ID_TAG + uid


def guid_for(uid: str) -> str:
    return GUID_PREFIX + uid


def note_uid(note: Mapping[str, Any]) -> str:
    """The word a note says it belongs to (from its guid, else its tag), or "" for a hand-made note."""
    guid = str(note.get("guid") or "")
    if guid.startswith(GUID_PREFIX) and _UID.match(guid[len(GUID_PREFIX):]):
        return guid[len(GUID_PREFIX):]
    for tag in note.get("tags") or []:
        tag = str(tag).lower()
        if tag.startswith(ID_TAG) and _UID.match(tag[len(ID_TAG):]):
            return tag[len(ID_TAG):]
    return ""


def _mix(text: str, seed: int) -> int:
    h = (0x811C9DC5 ^ seed) & 0xFFFFFFFF
    for byte in text.encode("utf-8"):
        h = ((h ^ byte) * 0x01000193) & 0xFFFFFFFF
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    return h ^ (h >> 16)


def uid_from_guid(guid: str) -> str:
    """The uid a hand-made note's word gets. It depends only on the note's guid, which Anki keeps
    the same on every device, so the computer and the phone make the same word, not two."""
    return "v" + "".join(f"{_mix(guid, seed):08x}" for seed in (0x1F3D5B79, 0x2545F491, 0x9E3779B9))[:20]


# ----- one deck per language -----

def default_deck(code: str, names: Mapping[str, str]) -> str:
    """The deck a language's words go to unless the learner named it: "Tamkeen – Spanish"."""
    return f"{DEFAULT_DECK} – {names.get(code, code)}"


def first_decks(old_name: str, counts: Mapping[str, int]) -> dict[str, str]:
    """The deck names stored when languages first get a deck each. The one deck there was until
    then ("Tamkeen", or whatever it was renamed to) stays the deck of the language most words are
    in, so its cards neither move nor get made a second time. Other languages get their own."""
    if not counts:
        return {}
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    return {top: (old_name or "").strip()[:100] or DEFAULT_DECK}


def deck_map(stored: Mapping[str, Any] | None, codes: Iterable[str], names: Mapping[str, str]) -> dict[str, str]:
    """Each language's deck: the name stored for it, else its default name."""
    out = {code: name.strip()[:100] for code, name in (stored or {}).items() if isinstance(name, str) and name.strip()}
    for code in codes:
        out.setdefault(code, default_deck(code, names))
    return dict(sorted(out.items()))


def deck_problem(decks: Mapping[str, str]) -> str:
    """Why these deck names cannot be used together ("" when they can): two languages may not
    share a deck, and one deck may not sit inside another's."""
    seen: dict[str, str] = {}
    for code, name in sorted(decks.items()):
        key = name.strip().lower()
        if key in seen:
            return f"Two languages cannot share the deck “{name}”."
        for other in seen:
            if key.startswith(other + "::") or other.startswith(key + "::"):
                return f"“{name}” and “{seen[other]}” are one inside the other: give each language a deck of its own."
        seen[key] = name
    return ""


# ----- reading a card back -----

def _entity(match: re.Match[str]) -> str:
    name = match.group(1)
    if name[0] == "#":
        code = int(name[2:], 16) if name[1] in "xX" else int(name[1:])
        if 0 < code <= 0x10FFFF and not 0xD800 <= code <= 0xDFFF:
            return chr(code)
        return match.group(0)
    return _NAMED.get(name.lower(), match.group(0))


def card_lines(markup: str) -> list[tuple[str, str]]:
    """A field as its lines: (the line as written, its plain text), empty lines left out."""
    out = []
    for raw in _BREAK.sub("\n", _SOUND.sub("", _DROP.sub("", markup or ""))).split("\n"):
        text = _SPACES.sub(" ", _ENTITY.sub(_entity, _MARKUP.sub("", raw))).strip(" ")
        if text:
            out.append((raw.strip(" "), text))
    return out


def parse_card(front: str, back: str) -> dict[str, Any]:
    """What a card says, taken apart the way exporters.anki_fields put it together.

    ``front``        the front as plain text
    ``translation``  that text with ⟦ ⟧ where the card has [brackets]; "" when it has none
    ``meaning``      the bracketed part(s), or the whole front when there are no brackets
    ``text``         the word (the back's first line)
    ``sentence``     the back's second line, without its brackets
    ``grammar``      the line in (parentheses and italics)
    ``notes``        the lines of the first "Note:", and any loose lines before it
    ``memo``         the lines of a second "Note:" (the learner's own notes)
    """
    plain = "\n".join(text for _, text in card_lines(front))
    bracketed = bool(_BRACKETED.fullmatch(plain))
    rows = card_lines(back)
    sentence, grammar = "", ""
    loose: list[str] = []
    groups: list[list[str]] = []
    for n, (raw, text) in enumerate(rows[1:], 1):
        found = _GRAMMAR.match(raw)
        if found and not grammar and not groups:
            grammar = text[1:-1].strip(" ")
        elif _NOTE.match(text):
            rest = text[5:].strip(" ")
            groups.append([rest] if rest else [])
        elif groups:
            groups[-1].append(text)
        elif n == 1 and not grammar:
            sentence = _IN_BRACKETS.sub(r"\1", text, count=1)
        else:
            loose.append(text)
    return {
        "front": plain,
        "translation": plain.replace("[", "⟦").replace("]", "⟧") if bracketed else "",
        "meaning": ", ".join(_IN_BRACKETS.findall(plain)) if bracketed else plain,
        "text": rows[0][1] if rows else "",
        "sentence": sentence,
        "grammar": grammar,
        "notes": loose + (groups[0] if groups else []),
        "memo": [line for group in groups[1:] for line in group],
    }


def notes_text(card: Mapping[str, Any]) -> str:
    """A card's grammar line and notes as the one notes text a word keeps."""
    return " · ".join([p.strip(" ") for p in card["grammar"].split(" • ") if p.strip(" ")] + list(card["notes"]))


def word_from_note(note: Mapping[str, Any], language: str = "") -> dict[str, str] | None:
    """The word a hand-made note stands for, or None when the note has no text to go on."""
    card = parse_card(note.get("front") or "", note.get("back") or "")
    text, meaning, translation = card["text"], card["meaning"], card["translation"]
    script = _SCRIPTS.get(language)
    first = card["front"].split("\n")[0]
    if not text or (script and not script.search(text) and script.search(first)):
        # The word is on the front (a card made the other way round, or with nothing on its back).
        text, meaning, translation = first, card["text"], ""
    if not text:
        return None
    return {"text": text, "meaning": meaning, "translation": translation, "sentence": card["sentence"],
            "notes": notes_text(card)}


def _pull(word: Mapping[str, Any], old: Mapping[str, Any], new: Mapping[str, Any], front: bool, back: bool,
          has_base: bool) -> dict[str, str]:
    """What an edit made in Anki changes in the word: only the parts that differ from ``old``."""
    out: dict[str, str] = {}
    if front and new["front"] != old["front"] and new["front"]:
        if new["translation"]:
            out["translation"] = new["translation"]
        elif not _MARKED.fullmatch(word.get("translation") or ""):
            out["meaning"] = new["front"]
        elif has_base:  # the learner replaced the sentence on the front with a plain meaning
            out["meaning"], out["translation"] = new["front"], ""
    if back:
        if (new["grammar"], new["notes"]) != (old["grammar"], old["notes"]):
            out["notes"] = notes_text(new)
        if new["memo"] != old["memo"] and "memo" in word:
            out["memo"] = "\n".join(new["memo"])
    return {k: v for k, v in out.items() if v != (word.get(k) or "")}


# ----- the plan -----

def _key(text: str) -> str:
    return arabic.normalize(text)


def _note_order(note: Mapping[str, Any]) -> tuple[int, int, int]:
    """Which of several cards of one word is the one to keep: most reviewed, then Tamkeen's own
    guid, then the oldest."""
    return (-(note.get("reps") or 0), 0 if str(note.get("guid") or "").startswith(GUID_PREFIX) else 1, note["id"])


def plan(words: Sequence[Mapping[str, Any]], notes: Sequence[Mapping[str, Any]],
         links: Mapping[str, Mapping[str, Any]], render: Callable[[Mapping[str, Any]], tuple[str, str]], *,
         now: float, deleted_notes: Mapping[str, float] | None = None, elsewhere: Iterable[str] = (),
         delete_ok: bool = False, language: str = "") -> dict[str, Any]:
    """What a sync should do.

    ``words``          every saved word, tombstones included: uid, text, meaning, notes,
                       translation, sentence, deleted, created_at, updated_at (and memo, if kept)
    ``notes``          every note of the decks: id, guid, mod (seconds), tags (a list), front and
                       back (None when the note has no such fields), reps (None when unknown),
                       progress (anything; stored as given), language (its deck's language)
    ``links``          what the last sync agreed, by uid: note, tf, tb (the word's front and back
                       then), af, ab (the note's)
    ``render``         a word's (front, back): exporters.anki_fields
    ``deleted_notes``  notes Anki reports as deleted, by id as text: when (0 if unknown)
    ``elsewhere``      uids whose card exists in Anki outside the deck (moved out by the learner)
    ``delete_ok``      the learner has agreed that deleting a word removes its card
    ``language``       the language of a word or note that does not say (the one being learned)

    Returns the changes for each side, the new links, and what is waiting on the learner.
    Writes to Anki are not assumed to have worked: a link moves on only once the next sync sees
    both sides agree, so a write that failed is simply tried again.
    """
    deleted_notes = deleted_notes or {}
    elsewhere = set(elsewhere)
    by_uid = {w["uid"]: w for w in words}
    anki: dict[str, list[dict[str, Any]]] = {"create": [], "update": [], "delete": [], "tag": []}
    tamkeen: dict[str, list[Any]] = {"add": [], "update": [], "remove": [], "restore": []}
    new_links: dict[str, dict[str, Any]] = {}
    progress: dict[str, Any] = {}
    held: list[str] = []
    missing: list[str] = []
    moved: list[str] = []
    skipped = duplicates = 0

    # 1. Which word is each note? By its own mark first, then by the link made last time.
    linked_note = {link["note"]: uid for uid, link in sorted(links.items()) if link.get("note")}
    groups: dict[str, list[Mapping[str, Any]]] = {}
    untagged: set[int] = set()
    loose: list[Mapping[str, Any]] = []
    for note in sorted(notes, key=lambda n: n["id"]):
        if note.get("front") is None or note.get("back") is None:
            skipped += 1
        elif DUPLICATE_TAG in [str(t).lower() for t in note.get("tags") or []]:
            duplicates += 1
        else:
            uid = note_uid(note)
            if not uid and note["id"] in linked_note:
                uid = linked_note[note["id"]]
                untagged.add(note["id"])
            if uid:
                groups.setdefault(uid, []).append(note)
            else:
                loose.append(note)

    # 2. Two cards of one word (made on two devices before Anki's own sync brought them together):
    #    keep one. A never-studied exact copy is removed; anything else is tagged and left alone.
    #    Which one is kept depends only on the cards themselves, never on this device's links, so
    #    the computer and the phone keep the same card instead of each removing the other's.
    resolved: dict[str, Mapping[str, Any]] = {}
    for uid in sorted(groups):
        group = groups[uid]
        keep = sorted(group, key=_note_order)[0]
        resolved[uid] = keep
        for extra in group:
            if extra is keep:
                continue
            if extra.get("reps") == 0 and (extra["front"], extra["back"]) == (keep["front"], keep["back"]):
                anki["delete"].append({"note": extra["id"], "uid": uid, "why": "duplicate"})
            else:
                anki["tag"].append({"note": extra["id"], "add": [DUPLICATE_TAG]})
                duplicates += 1

    # 3. Hand-made notes: the same front as a word's card, or the same word, means that word
    #    (a word in the language of the note's deck).
    def lang(item: Mapping[str, Any]) -> str:
        return str(item.get("language") or language)

    fronts: dict[tuple[str, str], list[str]] = {}
    texts: dict[tuple[str, str], list[str]] = {}
    rendered: dict[str, tuple[str, str]] = {}
    for w in sorted(words, key=lambda w: (w.get("created_at") or 0, w["uid"])):
        if w.get("deleted") or w["uid"] in resolved:
            continue
        rendered[w["uid"]] = render(w)
        fronts.setdefault((lang(w), _key(parse_card(rendered[w["uid"]][0], "")["front"])), []).append(w["uid"])
        texts.setdefault((lang(w), _key(w.get("text") or "")), []).append(w["uid"])
    fresh: dict[str, dict[str, Any]] = {}

    def take(index: dict[tuple[str, str], list[str]], key: tuple[str, str]) -> str:
        return next((u for u in index.get(key, []) if key[1] and u not in resolved), "")

    for note in loose:
        card = parse_card(note["front"], note["back"])
        here = lang(note)
        uid = (take(fronts, (here, _key(card["front"]))) or take(texts, (here, _key(card["text"])))
               or take(texts, (here, _key(card["front"]))))
        if not uid:
            uid = uid_from_guid(str(note.get("guid") or note["id"]))
            if uid in resolved:  # (cannot happen with real guids; never give one word two cards)
                skipped += 1
                continue
        resolved[uid] = note
        untagged.add(note["id"])

    # 4. A card whose word Tamkeen does not have (hand-made, or Tamkeen was reinstalled): a new word.
    for uid in sorted(resolved):
        if uid in by_uid:
            continue
        note = resolved[uid]
        made = word_from_note(note, lang(note))
        if made is None:
            skipped += 1
            del resolved[uid]
            untagged.discard(note["id"])
            continue
        created = note["id"] / 1000 if 1e12 < note["id"] < now * 1000 else now
        word = {"uid": uid, **made, "language": lang(note), "deleted": 0, "created_at": created, "updated_at": now}
        tamkeen["add"].append({**word, "note": note["id"]})
        fresh[uid] = word

    for uid in sorted(resolved):
        if resolved[uid]["id"] in untagged and note_uid(resolved[uid]) != uid:
            anki["tag"].append({"note": resolved[uid]["id"], "add": [id_tag(uid)]})

    # 5. Word by word.
    def create(word: Mapping[str, Any]) -> None:
        front, back = rendered.get(word["uid"]) or render(word)
        anki["create"].append({"uid": word["uid"], "guid": guid_for(word["uid"]), "front": front, "back": back,
                               "tags": [TAG, id_tag(word["uid"])], "language": lang(word)})

    def merge(word: Mapping[str, Any], note: Mapping[str, Any], link: Mapping[str, Any] | None) -> None:
        uid = word["uid"]
        tf, tb = rendered.get(uid) or render(word)
        nf, nb = note["front"], note["back"]
        anki_newer = (note.get("mod") or 0) > (word.get("updated_at") or 0)
        if link is None:
            # A card that is not in Tamkeen's own wording (hand-made, or made on another device) is
            # only linked: its text and the word's are both kept as they are until one is edited.
            own = str(note.get("guid") or "").startswith(GUID_PREFIX) and uid not in fresh
            if not own or (tf, tb) == (nf, nb):
                new_links[uid] = {"note": note["id"], "tf": tf, "tb": tb, "af": nf, "ab": nb}
                return
            # Tamkeen's own card from before there was a link (an imported deck, say): the newer side wins.
            base_f, base_b, has_base = tf, tb, False
            pull_f = pull_b = anki_newer
            push_f, push_b = (not anki_newer and tf != nf), (not anki_newer and tb != nb)
        else:
            base_f, base_b, has_base = link["af"], link["ab"], True

            def side(mine: str, theirs: str, was_mine: str, was_theirs: str) -> str:
                if mine == theirs:
                    return ""
                changed_here, changed_there = mine != was_mine, theirs != was_theirs
                if changed_here and changed_there:
                    return "pull" if anki_newer else "push"
                return "push" if changed_here else "pull" if changed_there else ""

            f, b = side(tf, nf, link["tf"], link["af"]), side(tb, nb, link["tb"], link["ab"])
            pull_f, pull_b, push_f, push_b = f == "pull", b == "pull", f == "push", b == "push"
        changes = _pull(word, parse_card(base_f, base_b), parse_card(nf, nb), pull_f, pull_b, has_base)
        if changes:
            tamkeen["update"].append({"uid": uid, "set": changes})
            tf, tb = render({**word, **changes})
        if push_f or push_b:
            anki["update"].append({"note": note["id"], "uid": uid, **({"front": tf} if push_f else {}),
                                   **({"back": tb} if push_b else {})})
        if link is None and (push_f or push_b):
            return  # linked by the next sync, once the card is seen to hold what was sent
        old = link or {}
        new_links[uid] = {"note": note["id"], "tf": old["tf"] if push_f else tf, "af": old["af"] if push_f else nf,
                          "tb": old["tb"] if push_b else tb, "ab": old["ab"] if push_b else nb}

    for uid in sorted(set(by_uid) | set(fresh)):
        word = by_uid.get(uid) or fresh[uid]
        note = resolved.get(uid)
        link = links.get(uid)
        if note is not None and note.get("progress") is not None:
            progress[uid] = note["progress"]
        if word.get("deleted"):
            if note is None:
                continue
            if (note.get("mod") or 0) > (word.get("updated_at") or 0):
                tamkeen["restore"].append(uid)  # the card was edited after the word was deleted: the edit wins
                word = {**word, "deleted": 0}
            else:
                if delete_ok:
                    anki["delete"].append({"note": note["id"], "uid": uid, "why": "word"})
                else:
                    held.append(uid)
                    if link:
                        new_links[uid] = dict(link)
                progress.pop(uid, None)
                continue
        if note is not None:
            merge(word, note, link if link and link.get("note") == note["id"] else None)
        elif link and link.get("note"):
            when = deleted_notes.get(str(link["note"]))
            if when is not None:
                if when and (word.get("updated_at") or 0) > when:
                    create(word)  # the word was edited after its card was deleted: the card comes back
                else:
                    tamkeen["remove"].append(uid)
            else:
                (moved if uid in elsewhere else missing).append(uid)
                new_links[uid] = dict(link)
        elif uid in elsewhere:
            moved.append(uid)
        else:
            create(word)

    removed_cards = sum(1 for d in anki["delete"] if d["why"] == "word")
    return {
        "anki": anki, "tamkeen": tamkeen, "links": new_links, "progress": progress,
        "held": held, "missing": missing, "moved": moved, "duplicates": duplicates, "skipped": skipped,
        "counts": {"to_anki": {"added": len(anki["create"]), "changed": len(anki["update"]), "removed": removed_cards},
                   "to_tamkeen": {"added": len(tamkeen["add"]), "changed": len(tamkeen["update"]) + len(tamkeen["restore"]),
                                  "removed": len(tamkeen["remove"])}},
    }


# ----- progress, as shown in Tamkeen -----

def progress_record(kind: int, queue: int, due_days: int | None, interval: int, reps: int, lapses: int,
                    right: int | None = None, wrong: int | None = None, history: str | None = None) -> dict[str, Any]:
    """One word's progress in the shape both the computer and the phone store.

    ``kind`` and ``queue`` are Anki's own codes. ``due_days`` is how many days from today the
    card is due (negative = overdue), or None when that is not known. ``right`` and ``wrong``
    count answers; where Anki's log of answers cannot be read (AnkiDroid), every lapse counts
    as a wrong answer and the rest as right. ``history`` is the latest answers, oldest first:
    "1" right, "0" wrong.
    """
    if queue == -1:
        state = "suspended"
    elif kind == 0:
        state = "new"
    elif kind == 2:
        state = "review"
    elif kind == 3:
        state = "relearning"
    else:
        state = "learning"
    if wrong is None:
        wrong = max(0, lapses)
    if right is None:
        right = max(0, reps - wrong)
    return {"state": state, "due_days": due_days if state not in ("new", "suspended") else None,
            "interval": max(0, interval), "reps": max(0, reps), "lapses": max(0, lapses),
            "right": right, "wrong": wrong, "history": history}
