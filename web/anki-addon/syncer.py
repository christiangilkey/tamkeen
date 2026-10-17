"""The Tamkeen decks (one per language being learned), read and written inside Anki.

Tamkeen decides what a sync should change (the rules are in the app, app/anki_sync.py). This file
only does two things for it, and guards both:

  gather()  reads the notes of a Tamkeen deck (and its sub-decks). Nothing else in the
            collection is read, except to learn whether a card Tamkeen made has been moved to
            another deck, so that it is not made a second time.
  apply()   makes the changes Tamkeen asks for, and refuses any that reach outside the decks:
            a note may be changed or deleted only if gather() found it in one of them just now.
            Only the fields Front and Back are ever rewritten; the image field is never
            touched, and an existing card layout (with its timer) is never changed.

It uses the collection it is given and imports nothing from Anki's window code, so it runs the
same in a test against a throwaway collection as inside Anki.
"""

from __future__ import annotations

FRONT, BACK, AUDIO = "Front", "Back", "TTS Input"
WRITABLE = (FRONT, BACK)
ID_TAG, GUID_PREFIX = "tamkeen-id::", "tk-"
CHUNK = 400


def _in(ids) -> str:
    return ",".join(str(int(i)) for i in ids)


def _chunks(ids):
    ids = list(ids)
    for start in range(0, len(ids), CHUNK):
        yield ids[start:start + CHUNK]


def deck_ids(col, name: str) -> list[int]:
    """The deck called ``name`` and the decks inside it, or [] when there is no such deck."""
    deck_id = col.decks.id_for_name(name)
    if not deck_id:
        return []
    try:
        return [int(d) for d in col.decks.deck_and_child_ids(deck_id)]
    except AttributeError:  # older Anki
        return [int(deck_id)] + [int(child[1]) for child in col.decks.children(deck_id)]


def collection_id(col) -> str:
    """What tells this collection from another: the moment it was created."""
    return str(col.db.scalar("select crt from col"))


def gather(col, deck_name: str) -> dict:
    """The deck's notes as Tamkeen wants them, the set of their ids, and how many notes were left
    out because some of their cards sit in another deck."""
    decks = deck_ids(col, deck_name)
    if not decks:
        return {"notes": [], "ids": set(), "outside": 0}
    inside = _in(decks)
    cards = col.db.all("select id, nid, ord, type, queue, due, odue, odid, ivl, reps, lapses from cards "
                       f"where did in ({inside}) or odid in ({inside}) order by nid, ord")
    note_ids = sorted({c[1] for c in cards})
    straddling = set()
    for part in _chunks(note_ids):
        straddling.update(col.db.list(f"select distinct nid from cards where nid in ({_in(part)}) "
                                      f"and did not in ({inside}) and odid not in ({inside})"))
    today = int(col.sched.today)
    answers: dict[int, list[int]] = {}
    for part in _chunks([c[0] for c in cards]):
        # ease 1 = "Again" (wrong), 2-4 = right; type 4 and above are manual changes, not answers
        for card_id, ease in col.db.all(f"select cid, ease from revlog where cid in ({_in(part)}) and ease > 0 and type < 4 order by id"):
            answers.setdefault(card_id, []).append(1 if ease > 1 else 0)
    first: dict[int, tuple] = {}
    reps: dict[int, int] = {}
    for c in cards:
        first.setdefault(c[1], c)
        reps[c[1]] = reps.get(c[1], 0) + int(c[9] or 0)

    names: dict[int, list[str]] = {}

    def field_names(model_id: int) -> list[str]:
        if model_id not in names:
            model = col.models.get(model_id)
            names[model_id] = [f["name"] for f in model["flds"]] if model else []
        return names[model_id]

    notes = []
    for part in _chunks([n for n in note_ids if n not in straddling]):
        for note_id, guid, model_id, mod, tags, flds in col.db.all(
                f"select id, guid, mid, mod, tags, flds from notes where id in ({_in(part)})"):
            fields = dict(zip(field_names(model_id), flds.split("\x1f")))
            _, _, _, kind, queue, due, odue, odid, interval, card_reps, lapses = first[note_id]
            due = odue if (odid and odue) else due
            if queue in (2, 3) or (queue < 0 and kind == 2):
                due_days = int(due) - today
            elif queue == 1:
                due_days = 0  # a learning card: due within the day
            else:
                due_days = None
            log = answers.get(first[note_id][0], [])
            notes.append({
                "id": note_id, "guid": guid, "mod": mod, "tags": tags.split(),
                "front": fields.get(FRONT), "back": fields.get(BACK), "reps": reps[note_id],
                "progress": {"kind": kind, "queue": queue, "due_days": due_days, "interval": interval, "reps": card_reps,
                             "lapses": lapses, "right": sum(log), "wrong": len(log) - sum(log),
                             "history": "".join(str(a) for a in log[-20:]) or None},
            })
    return {"notes": notes, "ids": {n["id"] for n in notes}, "outside": len(straddling)}


def elsewhere(col, in_deck: set) -> list[str]:
    """The words whose card Tamkeen made but which is no longer in the deck (the learner moved it).
    Only notes carrying Tamkeen's own mark are looked at, and only their ids, guids and tags."""
    uids = set()
    for note_id, guid in col.db.all(f"select id, guid from notes where guid like '{GUID_PREFIX}v%'"):
        if note_id not in in_deck:
            uids.add(guid[len(GUID_PREFIX):])
    for note_id, tags in col.db.all(f"select id, tags from notes where tags like '%{ID_TAG}%'"):
        if note_id not in in_deck:
            uids.update(t[len(ID_TAG):] for t in tags.lower().split() if t.startswith(ID_TAG))
    return sorted(uids)


def pending_deletions(col) -> list[int]:
    """Notes deleted in this Anki that it has not yet told AnkiWeb about. Anki forgets these once it
    has synced, so they are copied into the add-on's own list before that."""
    return [int(i) for i in col.db.list("select oid from graves where type = 1")]


def _save(col, note) -> None:
    try:
        col.update_note(note)
    except AttributeError:  # older Anki
        note.flush()


def _layout(col, notetype: dict):
    """The Tamkeen card layout: the one already in Anki if there is one (never changed), else a new one."""
    model = col.models.by_name(notetype["name"])
    if model is None:
        col.models.add_dict({**notetype, "id": 0})
        model = col.models.by_name(notetype["name"])
    return model


def apply(col, actions: dict, notetype: dict | None, media, allowed: set) -> dict:
    """Make Tamkeen's changes in the decks. A new card names the deck of its word's language.
    ``media(name)`` gives a file's bytes (or None); ``allowed`` is the set of note ids gather()
    found in the decks during this same sync. Returns how many cards were added, changed and
    removed, and how many changes failed."""
    done = {"added": 0, "changed": 0, "removed": 0, "tagged": 0, "failed": 0, "refused": 0}

    for name in actions.get("media") or []:
        try:
            if not col.media.have(name):
                data = media(name)
                if data:
                    col.media.write_data(name, data)
        except Exception:
            pass  # a card without its font still shows, in Anki's own font

    creates = actions.get("create") or []
    if creates and notetype:
        deck_ids_by_name: dict[str, int] = {}
        model = _layout(col, notetype)
        for item in creates:
            try:
                name = str(item.get("deck") or "Tamkeen")
                if name not in deck_ids_by_name:
                    deck_ids_by_name[name] = col.decks.id(name)  # makes the deck when it is not there yet
                deck_id = deck_ids_by_name[name]
                if col.db.scalar("select 1 from notes where guid = ?", item["guid"]):
                    continue  # this word's card exists already (in or out of the deck): never make a second
                note = col.new_note(model)
                fields = item["fields"]
                for name in WRITABLE:
                    if name in note and name in fields:
                        note[name] = fields[name]
                sounds = ""
                for name in item.get("media") or []:
                    data = media(name)
                    if data:
                        if not col.media.have(name):
                            col.media.write_data(name, data)
                        sounds += f"[sound:{name}]"
                if sounds and AUDIO in note:
                    note[AUDIO] = sounds
                note.guid = item["guid"]
                note.tags = list(item.get("tags") or [])
                col.add_note(note, deck_id)
                done["added"] += 1
            except Exception:
                done["failed"] += 1

    for item in actions.get("update") or []:
        if item["note"] not in allowed:
            done["refused"] += 1
            continue
        try:
            note = col.get_note(item["note"])
            changed = False
            for name, value in item["fields"].items():
                if name in WRITABLE and name in note and note[name] != value:
                    note[name] = value
                    changed = True
            if changed:
                _save(col, note)
                done["changed"] += 1
        except Exception:
            done["failed"] += 1

    for item in actions.get("tag") or []:
        if item["note"] not in allowed:
            done["refused"] += 1
            continue
        try:
            note = col.get_note(item["note"])
            have = {t.lower() for t in note.tags}
            new = [t for t in item["add"] if t.lower() not in have]
            if new:
                note.tags = list(note.tags) + new
                _save(col, note)
                done["tagged"] += 1
        except Exception:
            done["failed"] += 1

    # Cards moved to their language's deck, when the learner asked (each card keeps its review history).
    # A card on loan to a filtered deck is left there: Anki puts it back where it came from later.
    for item in actions.get("move") or []:
        if item["note"] not in allowed:
            done["refused"] += 1
            continue
        try:
            cards = col.db.list("select id from cards where nid = ? and odid = 0", item["note"])
            if not cards:
                done["move_skipped"] = done.get("move_skipped", 0) + 1
                continue
            col.set_deck(cards, col.decks.id(str(item["deck"])))
            done["moved"] = done.get("moved", 0) + 1
        except Exception:
            done["failed"] += 1
    if actions.get("move"):
        done.setdefault("moved", 0)  # tells Tamkeen the move it asked for was carried out

    removable = [int(n) for n in actions.get("delete") or [] if n in allowed]
    done["refused"] += len(actions.get("delete") or []) - len(removable)
    if removable:
        try:
            col.remove_notes(removable)
            done["removed"] += len(removable)
        except Exception:
            done["failed"] += len(removable)
    return done


# ----- one round of a sync, in the two halves that sit either side of the request to Tamkeen -----

def request(col, decks: list, number: int, applied, deleted: dict, profile: str = "") -> tuple[dict, set]:
    """What to send Tamkeen for round ``number``, and the ids of the decks' notes (for carry_out).
    ``decks`` is Tamkeen's list of decks, [{language, name}]; each note is sent with the language of
    the deck it is in. ``applied`` is what the round before changed; ``deleted`` is the add-on's list
    of deleted notes."""
    notes, ids, outside = [], set(), 0
    for deck in decks:
        found = gather(col, str(deck["name"]))
        outside += found["outside"]
        for note in found["notes"]:
            if note["id"] not in ids:
                notes.append({**note, "language": deck["language"]})
                ids.add(note["id"])
    body = {"col": collection_id(col), "profile": profile, "decks": decks, "round": number,
            "notes": notes, "outside": outside, "applied": applied,
            "deleted": {key: (value.get("at") or 0) for key, value in deleted.items()},
            "elsewhere": elsewhere(col, ids)}
    return body, ids


def wanted_media(reply: dict) -> list[str]:
    """The files Tamkeen's answer needs fetched before it can be carried out."""
    actions = reply.get("actions") or {}
    names = list(actions.get("media") or [])
    for item in actions.get("create") or []:
        names += item.get("media") or []
    return names


def carry_out(col, reply: dict, files: dict, ids: set) -> tuple[dict, bool]:
    """Make the changes in Tamkeen's answer. Returns what was done, and whether another round is
    needed (to confirm the changes to Tamkeen, or to fetch the next batch of new cards)."""
    done = apply(col, reply.get("actions") or {}, reply.get("notetype"), files.get, ids)
    touched = bool(done["added"] or done["changed"] or done["removed"] or done["tagged"] or "moved" in done)
    return done, touched or bool(reply.get("more"))
