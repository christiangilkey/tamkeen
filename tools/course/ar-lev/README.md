# Levantine basics (`ar-lev`)

The commonest words of spoken Levantine Arabic (Damascus and Beirut speech, with a few common Palestinian and
Jordanian words, each marked) that are **not** Standard Arabic. The course builds on the Arabic basics course
(`tools/course/ar`): a learner who did that one already knows the Standard words, so this one teaches only
what is new. The grammar that differs from Standard Arabic is in the grammar course (`tools/grammar/en-ar-lev`).

**147 words** (the owner asked for up to 300 if the evidence allowed: see "How many words" below).

## Files

| File | What it is |
|---|---|
| `list.tsv` | The list, written by hand: word, part of speech, meaning, note, its dictionary entries, the forms counted in the texts, the sentence and its translation. |
| `make.mjs` | `node tools/course/ar-lev/make.mjs`: `list.tsv` → `words.json` (counts, frequency rank, dictionary proof, order) and `EVIDENCE.md`. |
| `words.json` | The course as `build_course.py ar-lev --voice azure` reads it (the extra fields `forms`, `uses`, `src`, `msa` are not published). |
| `EVIDENCE.md` | The proof for every word, to read: how often it is used, the dictionary's definition with a link, what Standard Arabic's entry spelled the same says, and the note. |
| `evidence.json` | `node tools/course/dialect/evidence.mjs lev`: the same counts plus three real sentences from the texts that use each word. |

Rebuild after editing `list.tsv`: `node tools/course/ar-lev/make.mjs`, `node tools/course/dialect/evidence.mjs lev`,
`node tools/course/dialect/overlap.mjs ar-lev`, then `.venv/Scripts/python.exe tools/course/build_course.py ar-lev --voice azure`
(only changed words are voiced again) and `node --test tests/js/course-ar-lev.test.mjs`.

## How the words were chosen

1. **Counted in real Levantine text**, 2.13 million words (`tools/course/dialect/sources.mjs`, downloaded into the
   git-ignored `tools/course/build/dialect/`; the texts are only counted, never published):
   - Shami corpus: Syrian, Lebanese, Palestinian and Jordanian social-media text (Abu Kwaik et al. 2018, Apache-2.0), 1.1 million words;
   - UFAL Parallel Corpus of North Levantine 1.0: film and TV subtitles translated into Syrian/Lebanese Arabic by native speakers (Sellat et al. 2023, CC BY-NC-SA 4.0), 0.73 million words;
   - Levanti: only its 42,000 sentences "found in the wild" (Mor-Lan 2024, CC BY-NC 4.0; its other 466,000 sentences were written by an AI model and are not used), 0.28 million words;
   - the Jordanian readers' comments of the Arabic Online Commentary corpus (Zaidan and Callison-Burch 2011).
   The web text of FineWeb2's "North Levantine" part was looked at and left out: most of it is Standard Arabic.
2. **Every Levantine dictionary word was counted**: the 4,400 entries of Wiktionary's North and South Levantine
   Arabic dictionaries (kaikki.org extract, CC BY-SA), each with its inflected forms, plus the commonest spellings
   the Standard Arabic dictionary can't read at all. About 3,200 are used at least three times.
3. **The strict "is it Standard Arabic?" rules** (approved by the owner), applied by hand to the commonest ~1,500:
   1. Spelled like a word of the MSA basics course or of the 1,000 commonest Arabic words (`web/js/wordlists/ar.js`),
      compared the way the app's search compares words: out. `tools/course/dialect/overlap.mjs` and
      `tests/js/dialect-course.test.mjs` enforce it. (So اللي, مش, شي, إيه, إي, لأ, عَم, دَوَّر "look for",
      حَدّ "next to", كَفّى "carry on", تِمّ "mouth" and وَلَو "you're welcome" are out.)
   2. A Standard word only said differently: out (كْتير = كَثير, تْلاتة = ثَلاثة, هادا = هَذا, مَيّ = ماء,
      ضَلّ = ظَلّ, بَعَت = بَعَث, زْغير = صَغير, خَبّى = خَبَّأ, إيد = يَد, عيلِة = عائِلة, اسْتَنّى = اسْتَأْنى).
   3. A Standard word with dialect grammar on it: out (كيفَك, عَنْجَدّ = عَن جَدّ, عَطول = عَلى طول, ماعاد,
      أَهْلين, مَرْحَبْتين, خالْتو, عَمّو, جِدّو, لَإِنّو, هالشّي). The grammar course teaches these patterns.
   4. Spelled like a rarer Standard word but meaning something else: **in, with a note** (هَوْن "here", not MSA
      "ease"; كَمان "also", not MSA "violin"). The note is shown under the word in the app.
   5. From a Standard root but in a form you wouldn't recognise: in (إِجا "came", لَيْش "why", مْبارِح "yesterday").

   **What counts as Standard Arabic**, so that the rule is checkable: a word is Standard when **Wiktionary's Arabic
   (Standard) entry spelled the same gives the same meaning without a regional or "colloquial" label**. This is
   strict: Wiktionary lists many everyday Levantine words in its Standard section with no label, so they are out
   even though Levantine speakers think of them as their own: تَخْت "bed", دَوام "working hours", بَرّاد
   "fridge", بَهْدَل "scold", عَيَّط "shout", شَلَح "take off", زِهِق "get bored", وَلَّع "light", شَقْفة "piece",
   فْراطة "small change", شَرْشَف "bedsheet", مَجْلى "sink", قْرَيْدِس "shrimp", بِسّة "cat", بَرّا "outside",
   كَنْزة "sweater", جِزْدان "wallet", شَحّاطة "flip-flops", حِرام "blanket", شَتّى "rain", نِقِز "be startled"
   (MSA نَقَزَ "leap"). Each word's Standard senses are in `EVIDENCE.md`.
4. **Evidence of meaning** (the owner: "real solid evidence that each word means what you thought it meant"):
   every word cites its published dictionary entries (`src` in `words.json`, with links): Wiktionary's North or
   South Levantine Arabic entry, or a sense of Wiktionary's Arabic entry labelled Syrian/Lebanese/Palestinian/
   Jordanian. The meaning taught is one of the senses given there. `EVIDENCE.md` lists them, and `evidence.json`
   adds three real sentences from the texts that use the word. Words with no such entry were left out even when
   they are common: نِيّال "lucky", يِسْلَمو "thanks", تِكْرَم "you're welcome", ضَيْعة "village", هَلْكان
   "worn out", لَكان "so then".
5. **Order**: by uses in the texts, most used first, 50 to a unit. `rank` is the word's place among all the
   Levantine dictionary's words counted the same way; the gaps are the words left out by the rules above.

## How many words

147. The strict rules leave out most of the commonest Levantine words: they are Standard Arabic said a little
differently, Standard words with dialect grammar, or words Wiktionary also lists as Standard. The 147 are
everything in the 2.13 million words that passes all five rules and has a dictionary entry for its meaning,
down to words used once or twice (كَزْدَر "go for a drive", شَقْلَب "flip over"). Going further would mean
words with no published definition or words no one in the texts uses.

## Sentences

One short everyday sentence per word, written for this course in natural Levantine (Damascus/Beirut forms:
بْيِحْكي, عَم, رَح, مو; Lebanese words in Lebanese sentences), 2 to 12 words, with English translation and ⟦ ⟧
round the word's part in both. Vowel marks follow Levantine pronunciation (no case endings; فوت, جيب, بيت-type
long vowels unmarked; aw/ay written َوْ / َيْ as usual for ō/ē). The sentences use only words a learner who has
done the MSA basics will know, plus the course's own words.

## Audio

Azure's Syrian voice **Amany** (`ar-SY-AmanyNeural`), approved by the owner after the voice samples in
`tools/course/build/dialect-voice-test/`. Each file: the word, a pause, the sentence a little slower. Built by
`build_course.py ar-lev --voice azure`; checked with `check_audio.py ar-lev` (Whisper large-v3 heard as Arabic,
results in `docs/course/ar-lev/audio/check.json`).

**The machine check is weak for a dialect.** Whisper matched the sentences 0.40 on average (the Standard Arabic
course: 0.97). Whisper is trained mostly on Standard Arabic and short Levantine sentences throw it: it wrote the
same audio differently on two runs, and it often writes the Levantine sounds correctly (قَدّيش heard as أديش,
القَهْوِة as الأهوة, so the voice does say ق as ʔ). Voicing the 12 worst sentences again without vowel marks scored
the same (0.18 against 0.19), so the marks are not the problem. Worth a native listen: words 7 (مو), 8 (هون),
10 (هلق), 16 (وين), 23 (بلش), 25 (خلص), 34 (بكرا): Whisper heard nothing like the sentence in those.
