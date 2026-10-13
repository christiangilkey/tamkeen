"""The rules of the two-way Anki sync (app/anki_sync.py).

Every case here is also written to tests/fixtures/anki_sync_parity.json, which
tests/js/anki-sync.test.mjs replays through the phone's copy of the rules, so the two cannot
drift apart. After changing a rule on purpose, rewrite the fixture:

    TAMKEEN_WRITE_FIXTURES=1 .venv/Scripts/python -m pytest tests/test_anki_sync.py -q
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from app import anki_sync, exporters

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "anki_sync_parity.json"
NOW = 1_800_000_000.0
A, B, C = "v" + "a" * 20, "v" + "b" * 20, "v" + "c" * 20


def word(uid: str, text: str = "كتاب", meaning: str = "book", **more: Any) -> dict[str, Any]:
    return {"uid": uid, "text": text, "meaning": meaning, "notes": "", "translation": "", "sentence": "",
            "deleted": 0, "created_at": 1000.0, "updated_at": 2000.0, **more}


def card(w: dict[str, Any]) -> tuple[str, str]:
    return exporters.anki_fields(w)


def note(note_id: int, w: dict[str, Any] | None = None, *, guid: str | None = None, tags: list[str] | None = None,
         front: str | None = None, back: str | None = None, mod: int = 1500, reps: int | None = 0,
         progress: Any = None, fields: bool = True) -> dict[str, Any]:
    """A note as the add-on or the phone reports it. Given a word, it holds that word's card."""
    f, b = card(w) if w else ("", "")
    return {"id": note_id, "guid": guid if guid is not None else f"hand{note_id}", "mod": mod, "tags": tags or [],
            "front": (front if front is not None else f) if fields else None,
            "back": (back if back is not None else b) if fields else None, "reps": reps, "progress": progress}


def own(note_id: int, w: dict[str, Any], **more: Any) -> dict[str, Any]:
    """The card the add-on (or an imported deck) made for a word: it carries the word's guid."""
    return note(note_id, w, guid=f"tk-{w['uid']}", tags=more.pop("tags", ["tamkeen", f"tamkeen-id::{w['uid']}"]), **more)


def link(note_id: int, w: dict[str, Any], af: str | None = None, ab: str | None = None) -> dict[str, Any]:
    tf, tb = card(w)
    return {"note": note_id, "tf": tf, "tb": tb, "af": tf if af is None else af, "ab": tb if ab is None else ab}


def run(words: list[dict], notes: list[dict], links: dict[str, dict] | None = None, **options: Any) -> dict[str, Any]:
    options = {"now": NOW, "deleted_notes": {}, "elsewhere": [], "delete_ok": False, "language": "ar", **options}
    return anki_sync.plan(words, notes, links or {}, exporters.anki_fields, **options)


# ----- the cases (name -> words, notes, links, options) -----

def cases() -> dict[str, tuple[list[dict], list[dict], dict[str, dict], dict[str, Any]]]:
    w = word(A)
    looked_up = word(B, "مُرْتَبِكَة", "confused", sentence="كانت البنت مرتبكة من السؤال.",
                     notes="Dictionary form: اِرْتَبَكَ · Root: ر ب ك · adjective · Common in everyday speech.",
                     translation="The girl was ⟦confused⟧ by the question.")
    edited = {**w, "meaning": "a book", "updated_at": 5000.0}
    noted = {**w, "notes": "my remark", "updated_at": 5000.0}
    gone = {**w, "deleted": 1, "updated_at": 5000.0}
    hand = note(1_700_000_000_001, guid="Hx7$a", front="pen", back="قلم<br>هذا قلم جديد<br>a loose line")
    out: dict[str, tuple] = {
        # Tamkeen -> Anki
        "new word goes to anki": ([w, looked_up], [], {}, {}),
        "nothing to do": ([w], [own(10, w)], {A: link(10, w)}, {}),
        # the four routes a card can arrive by
        "route add-on: linked by guid": ([w], [own(10, w, tags=[])], {}, {}),
        "route phone: linked by tag": ([w], [note(10, w, guid="Zq3&f", tags=["tamkeen", f"Tamkeen-ID::{A}"])], {}, {}),
        "route import: tamkeen newer wins": ([edited], [own(10, w, tags=["tamkeen"], mod=1000)], {}, {}),
        "route import: anki newer wins": ([w], [own(10, w, tags=["tamkeen"], mod=9000, front="volume",
                                               back="<b>كتاب</b><br>Note: seen in a shop")], {}, {}),
        "route ankiweb: unstudied copy removed": ([w], [own(10, w, reps=4), note(11, w, guid="Zq3&f", tags=[f"tamkeen-id::{A}"])], {}, {}),
        "route ankiweb: studied copy kept and tagged": ([w], [own(10, w, reps=0), note(11, w, guid="Zq3&f", tags=[f"tamkeen-id::{A}"], reps=7)], {}, {}),
        "route ankiweb: edited copy kept and tagged": ([w], [own(10, w), note(11, w, guid="Zq3&f", tags=[f"tamkeen-id::{A}"], back="<b>كتاب</b><br>mine")], {A: link(10, w)}, {}),
        "route ankiweb: both devices keep the same card": (
            [w], [own(10, w), note(11, w, guid="Zq3&f", tags=[f"tamkeen-id::{A}"])], {A: link(11, w)}, {}),
        "tagged duplicate is ignored": ([w], [own(10, w), note(11, w, guid="Zq3&f", tags=[f"tamkeen-id::{A}", "Tamkeen-Duplicate"])], {A: link(10, w)}, {}),
        # hand-made cards
        "hand-made card of an existing word": ([w], [note(20, guid="Hx7$a", front="a book (thing)", back="كِتَاب")], {}, {}),
        "hand-made card with the same front": ([looked_up], [note(20, guid="Hx7$a", front="The girl was [confused] by the question.", back="x")], {}, {}),
        "hand-made card, word on the front": ([w], [note(20, guid="Hx7$a", front="كتاب", back="book")], {}, {}),
        "hand-made card becomes a word": ([w], [own(10, w), hand], {A: link(10, w)}, {}),
        "hand-made card the other way round": ([], [note(1_700_000_000_002, guid="Hx7$b", front="<div>قلم</div>", back="pen")], {}, {}),
        "hand-made card with only a front": ([], [note(30, guid="Hx7$c", front="قلم", back="")], {}, {}),
        "hand-made card already a word elsewhere": (
            [word(anki_sync.uid_from_guid("Hx7$a"), "قلم", "pen", notes="changed since", updated_at=9000.0)], [hand], {}, {}),
        "two words, one hand-made card": ([word(A, created_at=5.0), word(B, created_at=4.0)], [note(20, guid="Hx7$a", front="book", back="كتاب")], {}, {}),
        "empty note is skipped": ([], [note(20, guid="Hx7$a", front="", back=""), note(21, fields=False)], {}, {}),
        # edits
        "meaning edited in tamkeen": ([edited], [own(10, w)], {A: link(10, w)}, {}),
        "notes edited in tamkeen": ([noted], [own(10, w)], {A: link(10, w)}, {}),
        "write not yet done is sent again": ([edited], [own(10, w)], {A: link(10, w)}, {}),
        "write seen to have worked": ([edited], [own(10, edited, mod=6000)], {A: link(10, w)}, {}),
        "meaning edited in anki": ([w], [own(10, w, front="volume", mod=6000)], {A: link(10, w)}, {}),
        "notes edited in anki": ([looked_up], [own(10, looked_up, mod=6000, back=card(looked_up)[1].replace(
            "Common in everyday speech.", "Common.<br>Heard twice"))], {B: link(10, looked_up)}, {}),
        "sentence front edited in anki": ([looked_up], [own(10, looked_up, mod=6000, front="She was [puzzled] by it.")], {B: link(10, looked_up)}, {}),
        "sentence front replaced by a meaning": ([looked_up], [own(10, looked_up, mod=6000, front="puzzled")], {B: link(10, looked_up)}, {}),
        "own notes edited in anki": ([{**w, "memo": "old"}], [own(10, w, mod=6000, back="<b>كتاب</b><br>Note: n<br>Note: mine<br>second")],
                                     {A: link(10, w)}, {}),
        "both edited, anki newer": ([edited], [own(10, w, front="volume", mod=6000)], {A: link(10, w)}, {}),
        "both edited, tamkeen newer": ([edited], [own(10, w, front="volume", mod=4000)], {A: link(10, w)}, {}),
        "front edited there, back edited here": ([noted], [own(10, w, front="volume", mod=4000)], {A: link(10, w)}, {}),
        "word and sentence edited in anki stay as tamkeen has them": (
            [w], [own(10, w, mod=6000, back="<b>كتب</b><br>new sentence")], {A: link(10, w)}, {}),
        # deletions
        "deleted in tamkeen, not yet agreed": ([gone], [own(10, w)], {A: link(10, w)}, {}),
        "deleted in tamkeen, agreed": ([gone], [own(10, w)], {A: link(10, w)}, {"delete_ok": True}),
        "deleted in tamkeen, card edited later": ([gone], [own(10, w, front="volume", mod=6000)], {A: link(10, w)}, {"delete_ok": True}),
        "deleted in tamkeen, card already gone": ([gone], [], {A: link(10, w)}, {"delete_ok": True}),
        "deleted in anki, recorded": ([w], [], {A: link(10, w)}, {"deleted_notes": {"10": 3000.0}}),
        "deleted in anki, recorded without a time": ([w], [], {A: link(10, w)}, {"deleted_notes": {"10": 0}}),
        "deleted in anki, word edited later": ([edited], [], {A: link(10, w)}, {"deleted_notes": {"10": 3000.0}}),
        "recorded deletion of an unlinked note": ([w], [], {}, {"deleted_notes": {"10": 3000.0}}),
        # deletion safety: absence is never a deletion
        "card missing without a record": ([w, looked_up], [own(11, looked_up)], {A: link(10, w), B: link(11, looked_up)}, {}),
        "whole deck missing": ([w, looked_up], [], {A: link(10, w), B: link(11, looked_up)}, {"delete_ok": True}),
        "fresh anki is filled": ([w, looked_up, {**word(C), "deleted": 1}], [], {}, {"delete_ok": True}),
        "fresh tamkeen is filled": ([], [own(10, w, progress={"state": "review"}), own(11, looked_up)], {}, {"delete_ok": True}),
        "card moved out of the deck": ([w, looked_up], [], {A: link(10, w)}, {"elsewhere": [A, B]}),
        # progress
        "progress is copied": ([w], [own(10, w, progress=anki_sync.progress_record(2, 2, 3, 12, 9, 2, 7, 2, "1101"))], {A: link(10, w)}, {}),
    }
    return {name: (words, notes, links, {"now": NOW, "deleted_notes": {}, "elsewhere": [], "delete_ok": False,
                                         "language": "ar", **options})
            for name, (words, notes, links, options) in out.items()}


PARSE = [
    ("book", "<b>كتاب</b><br>هذا [كتاب] جميل<br><i>(noun • Root: ك ت ب)</i><br>Note: a remark<br>another"),
    ("The girl (Sara) was [confused] by the &lt;question&gt;.", "<b>مُرْتَبِكَة</b>"),
    ("<div>two</div><div>lines</div>", "<div>قلم</div><div>هذا قلم</div><div>Note: one</div><div>Note: mine</div>"),
    ("a &amp; b&nbsp;&#x27;c&#39; &#128512; &bogus; [sound:x.mp3]", "word<br/>[sound:tk-v1-w.mp3]<br />sentence<br><i>not grammar</i><br>NOTE:<br>later"),
    ("", ""),
    ("<style>.a{}</style>x<script>1<2</script>", "<p>w</p><ul><li>one</li><li>two</li></ul>"),
    ("[a] and [b]", "w<br><i>(verb)</i><br>loose"),
]
GUIDS = ["Hx7$a", "b", "", "tk-v123", "ß→字", "NBpR,!w~8("]
PROGRESS = [(0, 0, 5, 0, 0, 0), (2, 2, -3, 40, 12, 3), (2, -1, 4, 40, 12, 3), (1, 1, 0, 0, 2, 0), (3, 3, 1, 9, 20, 5),
            (2, 2, 7, 21, 10, 1, 8, 2, "1111011111"), (2, 2, 7, 21, 1, 4)]


def fixture() -> dict[str, Any]:
    made = {"cases": [], "parse": [], "uids": [], "progress": []}
    for name, (words, notes, links, options) in cases().items():
        made["cases"].append({"name": name, "words": words, "notes": notes, "links": links, "options": options,
                              "plan": anki_sync.plan(words, notes, links, exporters.anki_fields, **options)})
    for front, back in PARSE:
        w = anki_sync.word_from_note({"front": front, "back": back}, "ar")
        made["parse"].append({"front": front, "back": back, "card": anki_sync.parse_card(front, back), "word": w})
    made["uids"] = [[g, anki_sync.uid_from_guid(g)] for g in GUIDS]
    made["progress"] = [[list(args), anki_sync.progress_record(*args)] for args in PROGRESS]
    return json.loads(json.dumps(made, ensure_ascii=False))


def test_fixture_for_the_phone_is_current():
    made = fixture()
    if os.environ.get("TAMKEEN_WRITE_FIXTURES"):
        FIXTURE.write_text(json.dumps(made, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    assert json.loads(FIXTURE.read_text("utf-8")) == made, "rewrite the fixture (see the top of this file)"


def result(name: str) -> dict[str, Any]:
    words, notes, links, options = cases()[name]
    return anki_sync.plan(words, notes, links, exporters.anki_fields, **options)


def quiet(plan: dict[str, Any], *, but: tuple[str, ...] = ()) -> bool:
    """True when the plan changes nothing except the named lists ("anki.create", "tamkeen.add", ...)."""
    return all(not plan[side][kind] for side in ("anki", "tamkeen") for kind in plan[side] if f"{side}.{kind}" not in but)


# ----- Tamkeen -> Anki -----

def test_a_new_word_becomes_a_card_carrying_its_identity_both_ways():
    plan = result("new word goes to anki")
    assert [c["uid"] for c in plan["anki"]["create"]] == [A, B]
    first = plan["anki"]["create"][0]
    assert first["guid"] == f"tk-{A}" and first["tags"] == ["tamkeen", f"tamkeen-id::{A}"]
    assert (first["front"], first["back"]) == card(word(A))
    assert plan["links"] == {}, "a card is linked only once it is seen in the deck"
    assert plan["counts"]["to_anki"] == {"added": 2, "changed": 0, "removed": 0}


def test_a_synced_pair_is_left_alone():
    plan = result("nothing to do")
    assert quiet(plan) and plan["links"][A]["note"] == 10


def test_only_front_back_and_tags_are_ever_written():
    """The image field, the audio field and the card layout (with its timer) have no way in."""
    for name in cases():
        plan = result(name)
        for made in plan["anki"]["create"]:
            assert set(made) == {"uid", "guid", "front", "back", "tags"}, name
        for change in plan["anki"]["update"]:
            assert set(change) <= {"note", "uid", "front", "back"}, name
        for tagged in plan["anki"]["tag"]:
            assert set(tagged) == {"note", "add"}, name


# ----- one identity whatever the route -----

def test_routes_add_on_and_phone_link_without_doubling():
    for name in ("route add-on: linked by guid", "route phone: linked by tag"):
        plan = result(name)
        assert quiet(plan), name
        assert plan["links"][A]["note"] == 10, name


def test_route_import_the_newer_side_wins():
    plan = result("route import: tamkeen newer wins")
    assert quiet(plan, but=("anki.update",))
    assert plan["anki"]["update"] == [{"note": 10, "uid": A, "front": "a book"}]
    plan = result("route import: anki newer wins")
    assert quiet(plan, but=("tamkeen.update",))
    assert plan["tamkeen"]["update"] == [{"uid": A, "set": {"meaning": "volume", "notes": "seen in a shop"}}]


def test_route_ankiweb_two_cards_of_one_word_become_one():
    plan = result("route ankiweb: unstudied copy removed")
    assert plan["anki"]["delete"] == [{"note": 11, "uid": A, "why": "duplicate"}]
    assert plan["links"][A]["note"] == 10 and plan["counts"]["to_anki"]["removed"] == 0
    plan = result("route ankiweb: studied copy kept and tagged")
    assert plan["links"][A]["note"] == 11, "the card with review history is the one kept"
    assert plan["anki"]["delete"] == [{"note": 10, "uid": A, "why": "duplicate"}]
    plan = result("route ankiweb: edited copy kept and tagged")
    assert plan["anki"]["delete"] == [] and plan["anki"]["tag"] == [{"note": 11, "add": ["tamkeen-duplicate"]}]
    assert plan["duplicates"] == 1 and plan["tamkeen"]["add"] == []
    plan = result("tagged duplicate is ignored")
    assert quiet(plan) and plan["duplicates"] == 1


def test_two_devices_agree_which_copy_to_keep():
    """The phone is linked to the card it made (11), the computer to its own (10). Both must keep the
    same one, or each would delete the other's and the word would end with no card at all."""
    plan = result("route ankiweb: both devices keep the same card")
    assert plan["anki"]["delete"] == [{"note": 11, "uid": A, "why": "duplicate"}]
    assert plan["links"][A]["note"] == 10, "this device moves its link to the card that stays"


def test_a_hand_made_card_of_an_existing_word_is_linked_not_doubled():
    for name in ("hand-made card of an existing word", "hand-made card, word on the front"):
        plan = result(name)
        assert quiet(plan, but=("anki.tag",)), name
        assert plan["anki"]["tag"] == [{"note": 20, "add": [f"tamkeen-id::{A}"]}], name
        assert plan["links"][A]["note"] == 20, name
        assert plan["links"][A]["af"] != plan["links"][A]["tf"], "each side keeps its own wording until one is edited"
    plan = result("hand-made card with the same front")
    assert quiet(plan, but=("anki.tag",)) and plan["links"][B]["note"] == 20


def test_a_hand_made_card_goes_to_the_oldest_word_and_the_other_word_gets_its_own_card():
    plan = result("two words, one hand-made card")
    assert plan["links"][B]["note"] == 20 and [c["uid"] for c in plan["anki"]["create"]] == [A]


def test_a_hand_made_card_becomes_a_word_with_a_uid_every_device_agrees_on():
    plan = result("hand-made card becomes a word")
    uid = anki_sync.uid_from_guid("Hx7$a")
    added = plan["tamkeen"]["add"]
    assert len(added) == 1 and added[0]["uid"] == uid
    assert (added[0]["text"], added[0]["meaning"], added[0]["sentence"], added[0]["notes"]) == ("قلم", "pen", "هذا قلم جديد", "a loose line")
    assert added[0]["created_at"] == 1_700_000_000.001
    assert plan["anki"]["tag"] == [{"note": 1_700_000_000_001, "add": [f"tamkeen-id::{uid}"]}]
    assert plan["anki"]["update"] == [] and plan["anki"]["create"] == [], "the hand-made card keeps its own text"
    assert plan["links"][uid]["ab"].startswith("قلم")


def test_a_hand_made_card_already_turned_into_a_word_elsewhere_is_only_linked():
    """The phone and the computer both meet the same hand-made card: one word, and the card keeps its text."""
    plan = result("hand-made card already a word elsewhere")
    uid = anki_sync.uid_from_guid("Hx7$a")
    assert quiet(plan, but=("anki.tag",)) and plan["links"][uid]["note"] == 1_700_000_000_001


def test_a_card_made_the_other_way_round_still_gets_the_word_right():
    plan = result("hand-made card the other way round")
    assert [(a["text"], a["meaning"]) for a in plan["tamkeen"]["add"]] == [("قلم", "pen")]
    plan = result("hand-made card with only a front")
    assert [(a["text"], a["meaning"]) for a in plan["tamkeen"]["add"]] == [("قلم", "")]


def test_notes_with_nothing_to_go_on_are_skipped():
    plan = result("empty note is skipped")
    assert quiet(plan) and plan["skipped"] == 2


# ----- edits -----

def test_an_edit_in_tamkeen_rewrites_only_the_side_that_changed():
    assert result("meaning edited in tamkeen")["anki"]["update"] == [{"note": 10, "uid": A, "front": "a book"}]
    assert result("notes edited in tamkeen")["anki"]["update"] == [{"note": 10, "uid": A, "back": "<b>كتاب</b><br>Note: my remark"}]


def test_a_write_is_sent_again_until_the_card_is_seen_to_hold_it():
    plan = result("write not yet done is sent again")
    assert plan["anki"]["update"] and plan["links"][A]["tf"] == "book", "the link has not moved on"
    plan = result("write seen to have worked")
    assert quiet(plan) and plan["links"][A]["tf"] == plan["links"][A]["af"] == "a book"


def test_an_edit_in_anki_comes_back():
    assert result("meaning edited in anki")["tamkeen"]["update"] == [{"uid": A, "set": {"meaning": "volume"}}]
    plan = result("notes edited in anki")
    assert plan["tamkeen"]["update"] == [{"uid": B, "set": {
        "notes": "adjective · Dictionary form: اِرْتَبَكَ · Root: ر ب ك · Common. · Heard twice"}}]
    assert plan["anki"]["update"] == [], "the card is not rewritten after its own edit"
    assert result("sentence front edited in anki")["tamkeen"]["update"] == [{"uid": B, "set": {"translation": "She was ⟦puzzled⟧ by it."}}]
    assert result("sentence front replaced by a meaning")["tamkeen"]["update"] == [{"uid": B, "set": {"meaning": "puzzled", "translation": ""}}]
    assert result("own notes edited in anki")["tamkeen"]["update"] == [{"uid": A, "set": {"notes": "n", "memo": "mine\nsecond"}}]


def test_when_both_sides_changed_the_newer_edit_wins():
    plan = result("both edited, anki newer")
    assert plan["tamkeen"]["update"] == [{"uid": A, "set": {"meaning": "volume"}}] and plan["anki"]["update"] == []
    plan = result("both edited, tamkeen newer")
    assert plan["anki"]["update"] == [{"note": 10, "uid": A, "front": "a book"}] and plan["tamkeen"]["update"] == []


def test_front_and_back_are_merged_separately():
    plan = result("front edited there, back edited here")
    assert plan["tamkeen"]["update"] == [{"uid": A, "set": {"meaning": "volume"}}]
    assert plan["anki"]["update"] == [{"note": 10, "uid": A, "back": "<b>كتاب</b><br>Note: my remark"}]


def test_the_word_and_its_sentence_are_not_taken_from_anki():
    plan = result("word and sentence edited in anki stay as tamkeen has them")
    assert quiet(plan)


# ----- deletions, and deletion safety -----

def test_deleting_a_word_waits_for_the_learner_then_removes_its_card():
    plan = result("deleted in tamkeen, not yet agreed")
    assert quiet(plan) and plan["held"] == [A] and A in plan["links"]
    plan = result("deleted in tamkeen, agreed")
    assert plan["anki"]["delete"] == [{"note": 10, "uid": A, "why": "word"}] and A not in plan["links"]
    assert plan["counts"]["to_anki"]["removed"] == 1


def test_a_card_edited_after_its_word_was_deleted_brings_the_word_back():
    plan = result("deleted in tamkeen, card edited later")
    assert plan["tamkeen"]["restore"] == [A] and plan["anki"]["delete"] == []
    assert plan["tamkeen"]["update"] == [{"uid": A, "set": {"meaning": "volume"}}]


def test_a_deletion_recorded_by_anki_removes_the_word():
    for name in ("deleted in anki, recorded", "deleted in anki, recorded without a time"):
        plan = result(name)
        assert plan["tamkeen"]["remove"] == [A] and A not in plan["links"] and plan["anki"]["create"] == [], name
    plan = result("deleted in anki, word edited later")
    assert plan["tamkeen"]["remove"] == [] and [c["uid"] for c in plan["anki"]["create"]] == [A]
    plan = result("deleted in tamkeen, card already gone")
    assert quiet(plan) and plan["links"] == {}


def test_a_missing_card_is_never_taken_for_a_deletion():
    plan = result("card missing without a record")
    assert quiet(plan) and plan["missing"] == [A] and plan["links"][A]["note"] == 10
    plan = result("whole deck missing")
    assert quiet(plan) and plan["missing"] == [A, B], "an emptied Anki removes nothing from Tamkeen"
    plan = result("recorded deletion of an unlinked note")
    assert plan["tamkeen"]["remove"] == [], "only a linked word can be removed by a deletion"


def test_a_fresh_side_is_filled_not_wiped():
    plan = result("fresh anki is filled")
    assert quiet(plan, but=("anki.create",)) and [c["uid"] for c in plan["anki"]["create"]] == [A, B]
    plan = result("fresh tamkeen is filled")
    assert quiet(plan, but=("tamkeen.add",)), "an emptied Tamkeen removes nothing from Anki"
    assert [(a["uid"], a["text"], a["meaning"]) for a in plan["tamkeen"]["add"]] == [(A, "كتاب", "book"), (B, "مُرْتَبِكَة", "confused")]
    assert plan["tamkeen"]["add"][1]["translation"] == "The girl was ⟦confused⟧ by the question."
    assert plan["progress"] == {A: {"state": "review"}}


def test_no_case_deletes_without_a_record():
    """Across every case: a card is removed only for a tombstoned word (after agreement) or as an exact
    unstudied copy, and a word only for a note Anki itself reports deleted."""
    for name, (words, notes, links, options) in cases().items():
        plan = result(name)
        tombstones = {w["uid"] for w in words if w["deleted"]}
        for gone in plan["anki"]["delete"]:
            assert gone["why"] == "duplicate" or (gone["uid"] in tombstones and options["delete_ok"]), name
        for uid in plan["tamkeen"]["remove"]:
            assert str(links[uid]["note"]) in options["deleted_notes"], name


def test_a_card_moved_out_of_the_deck_is_left_alone():
    plan = result("card moved out of the deck")
    assert quiet(plan) and plan["moved"] == [A, B]


# ----- progress -----

def test_progress_is_copied_for_display():
    plan = result("progress is copied")
    assert quiet(plan)
    assert plan["progress"][A] == {"state": "review", "due_days": 3, "interval": 12, "reps": 9, "lapses": 2,
                                   "right": 7, "wrong": 2, "history": "1101"}


def test_progress_without_an_answer_log_counts_lapses_as_wrong():
    assert anki_sync.progress_record(2, 2, -3, 40, 12, 3)["right"] == 9
    assert anki_sync.progress_record(2, -1, 4, 40, 12, 3)["state"] == "suspended"
    assert anki_sync.progress_record(0, 0, 5, 0, 0, 0) == {"state": "new", "due_days": None, "interval": 0, "reps": 0,
                                                           "lapses": 0, "right": 0, "wrong": 0, "history": None}


# ----- reading cards -----

def test_a_card_reads_back_as_the_word_that_made_it():
    w = word(A, "مُرْتَبِكَة", "confused", sentence="كانت البنت مرتبكة من <السؤال>.",
             notes="Dictionary form: اِرْتَبَكَ · Root: ر ب ك · adjective · Common in everyday speech.\nheard in ep. 3",
             translation="The girl [Sara] was ⟦confused⟧ by the <question>.")
    read = anki_sync.parse_card(*card(w))
    assert read["text"] == w["text"] and read["sentence"] == w["sentence"]
    assert read["translation"] == "The girl (Sara) was ⟦confused⟧ by the <question>." and read["meaning"] == "confused"
    assert read["grammar"] == "adjective • Dictionary form: اِرْتَبَكَ • Root: ر ب ك"
    assert read["notes"] == ["Common in everyday speech.", "heard in ep. 3"]
    again = {**w, "notes": anki_sync.notes_text(read)}
    assert card(again)[1] == card(w)[1], "notes rebuilt from a card draw the same card"


def test_identity_is_read_from_guid_or_tag():
    assert anki_sync.note_uid({"guid": f"tk-{A}", "tags": []}) == A
    assert anki_sync.note_uid({"guid": "x", "tags": ["other", f"Tamkeen-ID::{A}"]}) == A
    assert anki_sync.note_uid({"guid": "tk-not a uid", "tags": ["tamkeen-id::nope", "tamkeen"]}) == ""
    assert anki_sync.uid_from_guid("Hx7$a") == anki_sync.uid_from_guid("Hx7$a") != anki_sync.uid_from_guid("Hx7$b")
    assert anki_sync.note_uid({"guid": "tk-" + anki_sync.uid_from_guid("Hx7$a")}) == anki_sync.uid_from_guid("Hx7$a")
