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


# ---------- a verb's main forms, from Wolff's conjugation codes (his introduction, section 7) ----------

def test_codes_decoded_as_wolffs_key_explains_them():
    d = b.decode
    # A action verbs: a number is a set the verb lacks, unless S (stress shift) or P follows it.
    assert d("A; a") == {"active": [("A", {"sets": ["mu", "mag", "maka"], "shift": set(), "paN": False})],
                         "passive": [("a", set())]}
    assert d("A2S")["active"][0][1]["sets"] == ["mu", "mag", "maka"], "dalágan: all three, mag- with a short penult"
    assert d("A2S")["active"][0][1]["shift"] == {"mag"}
    assert d("A3S")["active"][0][1]["shift"] == {"maka"}, "dáwat"
    assert d("A12")["active"][0][1]["sets"] == ["maka"], "salà: only maka-"
    assert d("A13")["active"][0][1]["sets"] == ["mag"], "dahum: only mag-"
    assert d("A123P; a4")["active"][0][1]["sets"] == ["maka"], "malarya: maka- (and makapa-)"
    assert d("AN; a")["active"][0][1]["paN"], "sanghid: paN- can be added"
    # B stative verbs: B1 no mu-, B2 no mag-, B4 no ma-, B5 no maka-, B6 no magka-; B3 only changes maka-.
    assert d("B16")["active"][0][1]["sets"] == ["ma", "mag", "maka"], "duktur 'become a doctor'"
    assert d("B1256; b6")["active"][0][1]["sets"] == ["ma"]
    assert d("B3(1)")["active"][0][1]["sets"] == ["ma", "mu", "mag", "maka", "magka"], "lup-ut: nothing lacking"
    # C mutual action verbs: C1 no mag-, C2 no magka-, C3 no makig-.
    assert d("C13")["active"][0][1]["sets"] == ["magka"], "balíus"
    assert d("C2")["active"][0][1]["sets"] == ["mag", "makig"], "púyù"
    # Two active classes, and the passive classes with their numbers.
    two = d("AB56; b5c")
    assert [a for a, _ in two["active"]] == ["A", "B"] and two["active"][1][1]["sets"] == ["ma", "mu", "mag"]
    assert two["passive"] == [("b", {"5"}), ("c", set())]
    assert d("A; a12b2")["passive"] == [("a", {"1", "2"}), ("b", {"2"})]
    assert d("A; b6(1)")["passive"] == [("b", {"6(1)"})], "dagkut"
    assert d("A; b(1)")["passive"] == [("b", {"(1)"})], "bantay"
    assert d("A; c16")["passive"] == [("c", {"1", "6"})]
    assert d("a3")["active"] == [] and d("a3")["passive"] == [("a", {"3"})], "dungug: a passive alone"
    # Square brackets that hold something else are no code.
    for other in ("so-and-so", "noun", "adj.", "such-and-such a time", ""):
        assert d(other) is None


def test_where_the_stress_is_in_wolffs_spelling():
    assert b.penult_stress("bása") and b.penult_stress("káun"), "an acute marks the long, stressed vowel"
    assert not b.penult_stress("palit"), "an open short penult: palít"
    assert b.penult_stress("tan-aw") and b.penult_stress("bàbà"), "a closed penult (a glottal stop closes it too)"
    assert not b.penult_stress("mandǎr"), "a wedge: the last syllable"
    assert b.predictable("tábang") and not b.predictable("palit") and not b.predictable("káun")


def test_suffixed_spellings_by_wolffs_rules():
    c = b.suffix_candidates
    assert "kan-un" in c("kaun", "un"), "the glottal stop between vowels moves after the n (5.14)"
    assert "pustun" in c("putus", "un") and "lutsan" in c("lusut", "an"), "consonants swapped"
    assert "ludhan" in c("luhud", "an") and "hagkan" in c("haluk", "an") and "pagngan" in c("palung", "an")
    assert {"dad-un", "dalhun"} <= set(c("dala", "un")), "dala's three spellings (dad-un, dalhun, dal-un)"
    assert "imbitahun" in c("imbitar", "un")
    assert c("kuha", "un", glottal=True) == ["kuhaun"], "a glottal stop at the end stays: no h"
    assert c("wala", "un", glottal=True) == ["walaun", "wad-un"]


def test_a_verbs_forms_future_and_past():
    k = lambda w: b.key(w, "ceb")  # noqa: E731
    # káun [A2S3S; a] "eat": Wolff's own examples have kan-un and nakan-an.
    eat = b.verb_grammar("káun", "A2S3S; a", {k("kan-un"), k("nakan-an")}, {})
    assert eat == [[], [["actor focus", "mokaon"], ["actor focus", "mikaon"], ["object focus", "kan-on"],
                        ["object focus", "gikaon"], ["local focus", "kan-an"], ["local focus", "gikan-an"]]]
    # hátag [A; c] "give": i- is what the action is done to (the thing given), -an the one given to.
    shown = {k(w): (i, w) for i, w in enumerate(["ihatag", "hatagan", "gihatagan"])}
    give = b.verb_grammar("hátag", "A; c", set(), shown)[1]
    assert give == [["actor focus", "mohatag"], ["actor focus", "mihatag"], ["object focus", "ihatag"],
                    ["object focus", "gihatag"], ["local focus", "hatagan"], ["local focus", "gihatagan"]]
    # haluk [A; b] "kiss": the local passive is the one kissed; its spelling from the example (gihagkan).
    kiss = b.verb_grammar("haluk", "A; b", {k("gihagkan")}, {})[1]
    assert ["object focus", "hagkan"] in kiss and ["instrument focus", "ihalok"] in kiss
    assert b.verb_grammar("bantay", "A; b(1)", {k("gibantayan")}, {})[1][-1] == ["object focus", "gibantayan"], \
        "b(1): no instrumental passive"


def test_a_spelling_shown_with_a_verb_prefix_beats_a_noun_of_the_same_letters():
    k = lambda w: b.key(w, "ceb")  # noqa: E731
    # sakay "ride": the entry has the noun sakayan "boat" and the verb's gisakyan.
    rows = b.verb_grammar("sakay", "A; c", {k("sakayan"), k("gisakyan")}, {k("sakayan"): (10, "sakayan")})[1]
    assert ["local focus", "sakyan"] in rows
    # Of Wolff's three spellings, the one real text uses most.
    shown = {k("dad-on"): (1463, "dad-on"), k("dalhon"): (7022, "dalhon")}
    rows = b.verb_grammar("dala", "A; a2", {k("dad-un"), k("dalhun"), k("dal-un")}, shown)[1]
    assert ["object focus", "dad-on"] in rows


def test_stative_potential_and_only_spellings_that_are_found():
    k = lambda w: b.key(w, "ceb")  # noqa: E731
    happy = b.verb_grammar("lípay", "B1256; b6", set(), {})
    assert happy[0] == ["stative"] and happy[1][:2] == [["actor focus", "malipay"], ["actor focus", "nalipay"]], "ma-/na- first"
    assert ["object focus", "lipayan"] in happy[1], "a consonant-ending root stressed on its penult: -an simply added"
    assert b.verb_grammar("dungug", "A12; a3", set(), {})[1][:4] == [
        ["actor focus", "makadungog"], ["actor focus", "nakadungog"], ["object focus", "madungog"], ["object focus", "nadungog"]], \
        "a3: only the potential passive"
    lose = b.verb_grammar("walà", "A; ab4(1)", {k("wad-un"), k("nawad-an")}, {})[1]
    assert ["object focus", "wad-on"] in lose and ["local focus", "mawad-an"] in lose and ["local focus", "nawad-an"] in lose
    assert b.verb_grammar("isturya", "A; c3", set(), {})[1][2:] == [["object focus", "ikaisturya"], ["object focus", "gikaisturya"]]
    assert b.verb_grammar("balíus", "C13", set(), {}) == [["mutual action"], [["actor focus", "magkabalios"], ["actor focus", "nagkabalios"]]]
    assert b.verb_grammar("adtu", "A2; b3c", set(), {})[1][:2] == [["actor focus", "moadto"], ["actor focus", "miadto"]]
    # A vowel-ending root with no example and no word-list spelling: no -on form is guessed.
    assert [r[0] for r in b.verb_grammar("bása", "A; a12", set(), {})[1]] == ["actor focus", "actor focus"]
    assert b.verb_grammar("bása", "so-and-so", set(), {}) == []


def test_the_codes_of_an_entry_and_of_its_own_derived_words():
    para = ("adtu_1 {1} there (far away, future). v {1} [A2; b3c] go, bring to a place. Nakaadtu na ku didtu kas-a. "
            "hi-/ha- v [B1256; b6] happen to go. adtuan v [A13] always go s.w. Mag-adtuan ku sa íla.")
    codes = b.verb_codes(para)
    assert codes[""][0] == "A2; b3c"
    assert codes["adtuan"][0] == "A13", "a derived word with meanings of its own"
    assert "hi-/ha-" not in codes, "a word listed only by its affix"


def test_tagalog_lookalikes_are_its_words_not_its_verb_forms():
    tl = {"words": {"manood": [["manood", "verb", ["to watch"], ""]],
                    "nangisda": [["nangisda", "verb", ["complete aspect of mangisda"], ""]]},
          "forms": {"nagpadala": [["magpadala", "actor focus, complete aspect of magpadala"]],
                    "manuod": [["manood", "alternative form of manood"]]}}
    keys = b.tagalog_lookalikes(tl)
    assert b.key("manood", "ceb") in keys and b.key("manuod", "ceb") in keys, "a Tagalog word and its spelling"
    assert b.key("nagpadala", "ceb") not in keys and b.key("nangisda", "ceb") not in keys, \
        "a verb form both languages share is no look-alike"
