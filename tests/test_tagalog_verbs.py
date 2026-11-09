"""Tagalog verbs in the word popup: root, affix, focus and aspect forms (tools/build_meanings.py, the Tagalog part)."""

import importlib.util
from collections import Counter
from pathlib import Path

_spec = importlib.util.spec_from_file_location("build_meanings", Path(__file__).resolve().parent.parent / "tools" / "build_meanings.py")
bm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bm)


def test_aspects_by_the_shape_of_the_form():
    aspect = bm.tl_aspect
    # -um-: the complete is the infinitive itself
    assert [aspect(f, "sumulat") for f in ("sumulat", "sumusulat", "susulat")] == ["infinitive", "progressive", "contemplative"]
    assert [aspect(f, "umalis") for f in ("umaalis", "aalis")] == ["progressive", "contemplative"]
    # -in, -an, i-: the infix -in- marks the complete and progressive; a doubled syllable the progressive and contemplative
    assert [aspect(f, "sulatin") for f in ("sinulat", "sinusulat", "susulatin")] == ["complete", "progressive", "contemplative"]
    assert [aspect(f, "bilhin") for f in ("binili", "binibili", "bibilhin")] == ["complete", "progressive", "contemplative"]
    assert [aspect(f, "isulat") for f in ("isinulat", "isinusulat", "isusulat")] == ["complete", "progressive", "contemplative"]
    assert [aspect(f, "inumin") for f in ("ininom", "iniinom")] == ["complete", "progressive"], "o turns to u before -in"
    # mag-, ma-: n- for m-
    assert [aspect(f, "magluto") for f in ("nagluto", "nagluluto", "magluluto")] == ["complete", "progressive", "contemplative"]
    assert aspect("darating", "dumating") == "contemplative", "d is said r between vowels"
    assert aspect("maninila", "manila") == "contemplative", "not the complete: -in- is no realis mark after m-"
    assert aspect("ikasulat", "ipansulat") == "", "the next row's infinitive is no form of this one"


def flattened(*items, template="tl-conj-ipang"):
    """A conjugation table as Wiktextract gives it: one list, labels mostly lost, Baybayin spellings in between."""
    forms = [{"form": "no-table-tags", "source": "conjugation", "tags": ["table-tags"]},
             {"form": template, "source": "conjugation", "tags": ["inflection-template"]}]
    for form, *tags in items:
        forms.append({"form": form, "source": "conjugation", "tags": ["error-unrecognized-form", *tags]})
    return forms


def test_the_flattened_table_becomes_rows_again():
    e = {"word": "sulatin", "pos": "verb", "forms": flattened(
        ("sulat",), ("sumulat", "infinitive"), ("sumulat",), ("sumusulat", "progressive"),
        ("nasulat", "dialectal", "progressive"), ("susulat",), ("kasusulat", "formal"), ("kakasulat",),
        ("sulatin", "infinitive", "objective"), ("ᜐᜓᜎᜆᜒᜈ᜔", "objective"), ("sinulat", "objective"),
        ("sinusulat", "objective", "progressive"), ("susulatin", "objective"), ("⁠—", "objective"),
        ("sulatan", "directional", "infinitive"), ("sinulatan", "directional"), ("sinusulatan", "directional", "progressive"),
        ("susulatan", "directional"),
        # a row whose labels Wiktextract moved one form on (Wiktionary's causative ika- row): no infinitive tag
        ("ikasulat",), ("ikinasulat",), ("ikinasusulat", "formal"), ("ikasusulat", "formal"))}
    rows, root = bm.tagalog_rows(e)
    assert root == "sulat"
    got = {r["inf"]: (r["focus"], r["complete"], r["progressive"], r["contemplative"]) for r in rows}
    assert got["sumulat"] == ("actor", [], ["sumusulat"], ["susulat"])
    assert got["sulatin"] == ("object", ["sinulat"], ["sinusulat"], ["susulatin"])
    assert got["sulatan"] == ("directional", ["sinulatan"], ["sinusulatan"], ["susulatan"])
    assert got["ikasulat"] == ("causative", ["ikinasulat"], ["ikinasusulat"], ["ikasusulat"])
    actor = next(r for r in rows if r["inf"] == "sumulat")
    assert actor["recently complete"] == ["kasusulat", "kakasulat"]
    assert all(r["main"] and r["usual"] for r in rows), "the root's own table, with an -um- actor"


def test_a_one_verb_table_and_a_causative_table():
    e = {"word": "magluto", "pos": "verb", "forms": flattened(
        ("mag-",), ("luto",), ("actor",), ("magluto", "infinitive"), ("nagluto",), ("nagluluto", "progressive"),
        ("magluluto",), template="tl-infl-mag")}
    rows, root = bm.tagalog_rows(e)
    assert root == "luto" and len(rows) == 1
    assert rows[0]["focus"] == "actor" and rows[0]["main"] and rows[0]["small"]
    assert rows[0]["complete"] == ["nagluto"] and rows[0]["contemplative"] == ["magluluto"]
    causative = {"word": "magpaluto", "pos": "verb", "forms": flattened(
        ("luto",), ("magpaluto", "infinitive"), ("nagpaluto",), ("nagpapaluto", "progressive"), ("magpapaluto",))}
    assert not bm.tagalog_rows(causative)[0][0]["main"], "magpa- + luto is the causative, not the root's own table"
    palit = {"word": "magpalit", "pos": "verb", "forms": flattened(("palit",), ("magpalit", "infinitive"), ("nagpalit",))}
    assert bm.tagalog_rows(palit)[0][0]["main"], "mag- + palit: the pa is the root's"


def test_root_affix_and_sense_from_the_etymology():
    def ety(*parts):
        args = {"1": "tl", "2": ":af", **{str(i + 3): p for i, p in enumerate(parts)}}
        return {"word": "x", "etymology_templates": [{"name": "ety", "args": args}]}
    assert bm.tagalog_etymology(ety("kain", "-um-<aftype:infix>")) == ("kain", ["-um-"], "")
    assert bm.tagalog_etymology(ety("mag-", "luto<id:cook><t:cooking>")) == ("luto", ["mag-"], "cook")
    assert bm.tagalog_etymology(ety("pag-", "sulat", "-an")) == ("sulat", ["pag-", "-an"], "")
    assert bm.tagalog_etymology({"word": "bahay", "etymology_templates": [{"name": "ety", "args": {"1": "tl", "2": ":inh", "3": "poz-pro:*balay"}}]}) == ("", [], "")
    assert bm.tagalog_etymology({"word": "dalhin", "etymology_templates": [{"name": "suffix", "args": {"1": "tl", "2": "dala", "3": "hin"}}]}) == ("dala", ["-hin"], "")


def test_the_trigger_in_the_headword_line():
    head = lambda text: {"head_templates": [{"expansion": text}]}  # noqa: E731
    assert bm.tagalog_head_focus(head("kumain (complete kumain, progressive kumakain, contemplative kakain, 1st actor trigger, Baybayin spelling ᜃᜓᜋᜁᜈ᜔)")) == "actor"
    assert bm.tagalog_head_focus(head("basín (complete binasa, progressive binabasa, contemplative babasin, 1st object trigger)")) == "object"
    assert bm.tagalog_head_focus(head("magpaoperá (complete nagpaopera, indirect actor trigger)")) == "indirect actor"
    assert bm.tagalog_head_focus(head("bumilí (complete bumili, progressive bumibili, contemplative bibili)")) == ""


def test_ud_features_name_the_focus_and_aspect():
    assert bm.ud_label("binihag", "bihag", "Aspect=Perf|Mood=Ind|Voice=Pass") == ("object", "complete")
    assert bm.ud_label("nagsisimba", "simba", "Aspect=Imp|Mood=Ind|Voice=Act") == ("actor", "progressive")
    # UD marks the infinitive and the contemplative alike: the doubled first syllable tells them apart
    assert bm.ud_label("magseselos", "selos", "Aspect=Imp|Mood=Pot|Voice=Act") == ("actor", "contemplative")
    assert bm.ud_label("pasukin", "pasok", "Aspect=Imp|Mood=Pot|Voice=Pass") == ("object", "infinitive")
    assert bm.ud_label("darating", "dating", "Aspect=Imp|Mood=Pot|Voice=Act") == ("actor", "contemplative")


def test_the_tagalog_pass_on_a_small_file(tmp_path, monkeypatch):
    monkeypatch.setattr(bm, "OUT", tmp_path)  # (no word list there: only rows of verbs with an entry are linked)
    kumain = {"word": "kumain", "pos": "verb", "head_templates": [{"expansion": "kumain (complete kumain, progressive kumakain, contemplative kakain, 1st actor trigger)"}],
              "etymology_templates": [{"name": "ety", "args": {"1": "tl", "2": ":af", "3": "kain", "4": "-um-<aftype:infix>"}}],
              "forms": [{"form": "kumain", "tags": ["completive"]}, {"form": "kumakain", "tags": ["progressive"]}, {"form": "kakain", "tags": ["contemplative"]},
                        *flattened(("kain",), ("kumain", "infinitive"), ("kumain",), ("kumakain", "progressive"), ("kakain",),
                                   ("kainin", "infinitive", "objective"), ("kinain", "objective"), ("kinakain", "objective", "progressive"),
                                   ("kakainin", "objective"), ("kainan", "directional", "infinitive"), ("kinainan", "directional"))]}
    kainin = {"word": "kainin", "pos": "verb", "head_templates": [{"expansion": "kainin (complete kinain, progressive kinakain, contemplative kakainin, 1st object trigger)"}],
              "forms": [], "etymology_templates": [{"name": "ety", "args": {"1": "tl", "2": ":af", "3": "kain", "4": "-in"}}]}
    kinain = {"word": "kinain", "pos": "verb", "forms": []}
    kain = {"word": "kain", "pos": "noun", "forms": []}
    data = {"words": {"kumain": [["kumain", "verb", ["to eat", "complete aspect of kumain"], ""]],
                      "kainin": [["kainin", "verb", ["to be eaten"], ""]],
                      "kinain": [["kinain", "verb", ["complete aspect of kainin"], ""]],
                      "kain": [["kain", "noun", ["act of eating"], ""]],
                      "gusto": [["gusto", "verb", ["to want; to like"], ""]]}, "forms": {}}
    bm.TL_NOTES.clear()
    for e in (kumain, kainin, kinain, kain):
        k = bm.key(e["word"], "tl")
        bm.note_tagalog(e, k, data["words"][k][0])
    ud = {"nagugustuhan": Counter({("gusto", "VERB", "Aspect=Imp|Mood=Ind|Voice=Act"): 3})}
    roots = bm.tagalog_grammar(data, bm.TL_NOTES, ud)
    words, forms = data["words"], data["forms"]
    eat = words["kumain"][0]
    assert eat[2] == ["to eat"], "a verb's sense naming itself goes"
    assert eat[3] == "kain", "the root, shown as Root"
    assert eat[4] == [["actor focus", "affix -um-"], [["progressive", "kumakain"], ["contemplative", "kakain"],
                                                      ["object focus", "kainin"], ["directional focus", "kainan"]]]
    assert words["kainin"][0][4][0] == ["object focus", "affix -in"]
    assert "kinain" not in words, "an entry that only names a form becomes a form"
    assert forms["kinain"] == [["kainin", "object focus, complete aspect of kainin"]]
    assert forms["kinakain"] == [["kainin", "object focus, progressive aspect of kainin"]]
    assert forms["kumakain"] == [["kumain", "actor focus, progressive aspect of kumain"]]
    assert forms["nagugustuhan"] == [["gusto", "actor focus, progressive aspect of gusto"]], "from UD"
    assert words["kain"][0][4] == [[], [["actor focus", "kumain"], ["object focus", "kainin"], ["directional focus", "kainan"]]], \
        "a root lists its verbs"
    assert roots["kinakain"] == "kain" and roots["nagugustuhan"] == "gusto"
    bm.TL_NOTES.clear()
