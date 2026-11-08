"""The word popup's grammar line, read from Wiktionary's headword line (tools/build_meanings.py grammar_info)."""

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("build_meanings", Path(__file__).resolve().parent.parent / "tools" / "build_meanings.py")
bm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bm)


def entry(word, pos, expansion, forms, categories=()):
    return {"word": word, "pos": pos, "head_templates": [{"expansion": expansion}], "forms": forms, "categories": list(categories)}


def test_arabic_noun_root_and_broken_plural():
    e = entry("كتاب", "noun", "كِتَاب • (kitāb) m (plural كُتُب (kutub))",
              [{"form": "كِتَاب", "tags": ["canonical", "masculine"]}, {"form": "kitāb", "tags": ["romanization"]},
               {"form": "كُتُب", "tags": ["plural"]}, {"form": "كِتَابٌ", "tags": ["indefinite", "nominative"], "source": "declension"}],
              ["Arabic terms belonging to the root ك ت ب"])
    assert bm.root(e, "ar") == "ك ت ب"
    assert bm.grammar_info(e, "ar") == [["masculine"], [["plural", "كُتُب", "kutub"]]]


def test_arabic_verb_form_non_past_and_verbal_noun():
    e = entry("كتب", "verb", "كَتَبَ • (kataba) I (non-past يَكْتُبُ (yaktubu), verbal noun كِتَابَة (kitāba))",
              [{"form": "كَتَبَ", "tags": ["canonical", "form-i"]}, {"form": "يَكْتُبُ", "tags": ["non-past"]},
               {"form": "كِتَابَة", "tags": ["noun-from-verb"]}])
    assert bm.grammar_info(e, "ar") == [["form I"], [["non-past", "يَكْتُبُ", "yaktubu"], ["verbal noun", "كِتَابَة", "kitāba"]]]


def test_german_gender_class_and_forms_without_diminutives():
    e = entry("Haus", "noun", "Haus n (strong, genitive Hauses, plural Häuser, diminutive Häuschen n)",
              [{"form": "Hauses", "tags": ["genitive"]}, {"form": "Häuser", "tags": ["plural"]},
               {"form": "Häuschen", "tags": ["diminutive", "neuter"]}])
    assert bm.grammar_info(e, "de") == [["neuter", "strong"], [["genitive", "Hauses"], ["plural", "Häuser"]]]


def test_latin_principal_parts_and_conjugation():
    e = entry("amo", "verb", "amō (present infinitive amāre, perfect active amāvī, supine amātum); first conjugation",
              [{"form": "amō", "tags": ["canonical"]}, {"form": "amāre", "tags": ["infinitive", "present"]},
               {"form": "amāvī", "tags": ["active", "perfect"]}, {"form": "amātum", "tags": ["supine"]}])
    assert bm.grammar_info(e, "la") == [["first conjugation"], [["present infinitive", "amāre"], ["perfect active", "amāvī"], ["supine", "amātum"]]]


def test_regular_forms_are_left_out():
    casa = entry("casa", "noun", "casa f (plural casas)", [{"form": "casas", "tags": ["plural"]}])
    assert bm.grammar_info(casa, "es") == [["feminine"], []]
    walk = entry("walk", "verb", "walk (third-person singular simple present walks, present participle walking, simple past and past participle walked)",
                 [{"form": "walks", "tags": ["present", "singular", "third-person"]}, {"form": "walking", "tags": ["participle", "present"]},
                  {"form": "walked", "tags": ["participle", "past"]}, {"form": "walked", "tags": ["past"]}])
    assert bm.grammar_info(walk, "en") == []
    go = entry("go", "verb", "go (simple past went, past participle gone)", [{"form": "went", "tags": ["past"]}, {"form": "gone", "tags": ["participle", "past"]}])
    assert bm.grammar_info(go, "en") == [[], [["past", "went"], ["past participle", "gone"]]]


def test_root_on_a_sense_as_the_whole_language_files_have_it():
    e = entry("بيت", "noun", "بَيْت • (bayt) m (plural بُيُوت (buyūt))", [{"form": "بُيُوت", "tags": ["plural"]}])
    e["senses"] = [{"glosses": ["house"], "categories": [{"name": "Arabic terms belonging to the root ب ي ت", "kind": "other"}]}]
    assert bm.root(e, "ar") == "ب ي ت"


def test_chinese_measure_words_leave_the_meaning_for_a_row_of_their_own():
    e = {"word": "朋友", "pos": "noun", "forms": [], "head_templates": [],
         "senses": [{"glosses": ["friend (Classifier: 個／个 m c; 位 m c; 隻 c)"]}]}
    assert bm.grammar_info(e, "zh") == [[], [["classifier", "個／个"], ["classifier", "位"]]]
    assert bm.zh_gloss("friend (Classifier: 個／个 m c; 位 m c)") == "friend"


def test_camel_and_wiktionary_spellings_of_one_word_match():
    assert bm.vowel_key("مَزَّاح") == bm.vowel_key("مَزّاح")
    assert bm.vowel_key("كِتَاب") != bm.vowel_key("كُتَّاب")


def test_a_persian_word_from_arabic_names_the_arabic_root():
    bm._ARABIC_ROOTS = {"كتاب": "ك ت ب"}
    e = {"word": "کتاب", "pos": "noun", "forms": [], "head_templates": [], "senses": [{"glosses": ["book"]}],
         "etymology_templates": [{"name": "bor", "args": {"1": "fa", "2": "ar", "3": "كِتَاب"}}]}
    assert bm.grammar_info(e, "fa") == [["from the Arabic root ك ت ب"], []]
    bm._ARABIC_ROOTS = None
