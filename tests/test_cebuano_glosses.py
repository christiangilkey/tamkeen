"""Wolff's words listed only by their affix (tools/build_cebuano_glosses.py): spelled out by his rules, and
kept only when the Bisaya word list has the spelling."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import build_cebuano_glosses as b  # noqa: E402


def test_nasal_prefix_swallows_the_first_consonant():
    assert "pamalit" in b.affix_forms("palit", "paN-", "n")
    assert "panindug" in b.affix_forms("tindug", "paN-", "n")
    assert "panguha" in b.affix_forms("kúhà", "paN-", "n")
    assert "pangabang" in b.affix_forms("ábang", "paN-", "n")
    assert "panimalay" in b.affix_forms("balay", "paniN-", "n")


def test_a_verb_gets_its_tense_forms():
    forms = b.affix_forms("palit", "paN-", "v")
    assert {"pamalit", "mamalit", "namalit", "gipamalit"} <= set(forms)


def test_suffixes_and_the_dropped_vowel():
    assert "kabalayan" in b.affix_forms("balay", "ka-an", "n")
    assert "dakpan" in b.affix_forms("dakup", "-an", "v")
    assert "sudlan" in b.affix_forms("sulud", "-an", "n")
    assert "imnun" in b.affix_forms("inum", "-un", "v")
    assert "basahun" in b.affix_forms("basa", "-un", "v")
    assert "kahangturan" in b.affix_forms("hangtud", "ka-an", "n")
    # The consonants are swapped only where Bisaya swaps them (not hakug -> hagkan, which is "kiss").
    assert "hagkan" not in b.affix_forms("hakug", "-an", "a")


def test_infix_and_repeated_syllable():
    assert "sinulat" in b.affix_forms("sulat", "-in-", "n")
    assert "inilis" in b.affix_forms("ilis", "-in-", "n")
    assert "magbababuy" in b.affix_forms("bábuy", "mag-r-", "n")
    assert "mangangagaw" in b.affix_forms("ágaw", "maN-r-", "n")


def test_patterns_of_their_own_are_left_out():
    assert b.affix_forms("bakintul", "Culu-", "v") == []
    assert b.affix_forms("Ála", "not without l", "n") == []


def test_only_spellings_in_the_word_list_and_in_no_dictionary_are_kept():
    entries = [("balay", "paniN-", "n", "household"), ("balay", "ka-an", "n", "group of homes"),
               ("palit", "paN-", "v", "buy"), ("túod", "paN-", "v", "get agitated"), ("sakit", "na-", "v", "cut trees")]
    k = lambda w: b.key(w, "ceb")  # noqa: E731
    out = b.spelled_out(entries, have={k("kabalayan")}, heads={k("sakit")}, tagalog={k("manood")},
                        wordlist=["panimalay", "kabalayan", "namalit", "manuod", "nasakit", "pamalitan"])
    assert out[k("panimalay")][:3] == ["panimalay", "noun", ["household"]]
    assert out[k("panimalay")][3] == "balay", "the root, shown in the popup"
    assert out[k("namalit")][2] == ["buy"]
    assert k("kabalayan") not in out, "a dictionary has it already"
    assert k("manuod") not in out, "Tagalog manood ('watch'), not maN- + túod"
    assert k("nasakit") not in out, "na- + a word Wolff has: left to the root finder"
    assert k("pamalitan") not in out, "only spellings the rules make"
