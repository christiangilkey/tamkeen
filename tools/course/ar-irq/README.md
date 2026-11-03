# Iraqi basics (`ar-irq`)

The commonest words of spoken Iraqi Arabic, Baghdad style, that are **not** Standard Arabic. The course builds on
the Arabic basics course (`tools/course/ar`): a learner who did that one already knows the Standard words, so this
one teaches only what is new. The grammar that differs from Standard Arabic is in the grammar course
(`tools/grammar/en-ar-irq`, 16 lessons).

**98 words.** Fewer than 300: the strict rules below leave out most everyday Iraqi words (they are Standard
Arabic said the Iraqi way), and a word goes in only with a published dictionary entry for its meaning.

## Files

| File | What it is |
|---|---|
| `list.tsv` | The list, written by hand: word, part of speech, meaning, note, its dictionary headwords, the spellings counted in the texts, the sentence and its translation. |
| `sounds.tsv` | How the voice says every word written with گ or چ, in IPA (below). |
| `make.mjs` | `node tools/course/ar-irq/make.mjs`: `list.tsv` + `sounds.tsv` → `words.json` (counts, rank, dictionary proof, order, the voice's sounds) and `EVIDENCE.md`. |
| `words.json` | The course as `build_course.py ar-irq --voice azure` reads it (`forms`, `uses`, `src`, `msa` are not published). |
| `EVIDENCE.md` | The proof for every word, to read: how often it is used, each dictionary's definition with a link, what Standard Arabic's entry spelled the same says, and the note. |
| `evidence.json` | `node tools/course/dialect/evidence.mjs irq`: the same counts plus three real sentences from the texts that use each word. |
| `texts.mjs`, `parquet.mjs` | Download the Iraqi texts (below) into the git-ignored `tools/course/build/dialect/irq/`. They come as parquet files, read by `parquet.mjs` (a small reader written here, so nothing has to be installed). |
| `wikt.mjs` | Fetches Wiktionary's Iraqi Arabic entries (kaikki.org, the other courses' source, has none) into `build/dialect/irq/wikt-iraqi.json`. |
| `la.mjs`, `la-iraqi.json` | Looks words up in the Living Arabic Project's Iraqi dictionary; the entries are kept in `la-iraqi.json` so the evidence can be rebuilt offline. |

## Rebuilding

1. `node tools/course/ar-irq/texts.mjs` (a minute), `node tools/course/ar-irq/wikt.mjs`, and
   `node tools/course/dialect/sources.mjs` for Wiktionary's Arabic entries (shared with the other dialects).
2. After editing `list.tsv`: `node tools/course/ar-irq/la.mjs` (looks up new Living Arabic headwords),
   `node --max-old-space-size=8192 tools/course/ar-irq/make.mjs`, `node tools/course/dialect/evidence.mjs irq`,
   `node tools/course/dialect/overlap.mjs ar-irq`.
3. `.venv/Scripts/python.exe tools/course/build_course.py ar-irq --voice azure` (only changed words are voiced
   again), `.venv/Scripts/python.exe tools/course/check_audio.py ar-irq`, `node --test tests/js/course-ar-irq.test.mjs`.

## How the words were chosen

1. **Counted in real Iraqi text**, 3.67 million words: the "high" and "medium" parts of the **Iraqi Arabic Dialect
   Corpus** (factlogic 2026, Hugging Face, CC BY-NC 4.0): 281,000 comments and messages Iraqis wrote on 401 Iraqi
   YouTube channels (collected with YouTube's own API) and 34 public Telegram chats, picked out by four dialect
   classifiers and found 100% ("high") and 99.4% ("medium") Iraqi in blind human checks. Counted only, never
   published (a few short quotes in `evidence.json` as proof of use). Its third part ("medium_extended", 98.5%)
   is left out. Iraqis write g as ك, ق or گ and ch as ج, ك or
   چ, so each word is counted in all its spellings (`list.tsv`), each also with و / ف in front.
   **The texts lean to chat:** words for things in the house (kettle, sofa, towel) are used little in comments,
   so they come last, though every Iraqi knows them.
2. **The strict "is it Standard Arabic?" rules** (the owner's, the same as the other dialect courses'):
   1. Spelled like a word of the MSA basics course or of the 1,000 commonest Arabic words (`web/js/wordlists/ar.js`),
      compared the way the app's search compares words: out. `tools/course/dialect/overlap.mjs` and
      `tests/js/dialect-course.test.mjs` enforce it. (So آني “I” (= إني), هم “also”, بعد “still”, مال “belonging
      to”, لو “or”, اي “yes” and بطل “bottle” are out; the grammar course teaches the grammar ones.)
   2. A Standard word only said the Iraqi way: out. Most of all the g and ch words: گال = قال, چان = كان,
      چبير = كبير, وكت = وقت, گعد = قعد, گدام = قدام, لگى = لقي, چذب = كذب, بچى = بكى, چلب = كلب, چاي = شاي, and
      زغير = صغير, صدگ = صدق, فوگ = فوق, گاع = قاع. The grammar course's first lesson teaches the sounds.
   3. A Standard word with Iraqi grammar on it: out (ماكو = ما + أكو, شكو = ش + أكو, محد, شبيك, عبالي, ميخالف,
      يمه, خويه). أكو is in; the grammar course teaches ماكو and شكو.
   4. Spelled like a rarer Standard word but meaning something else: **in, with a note** (زين “good”, not MSA
      “beauty”; هواية “a lot”, not MSA “hobby”; جاهل “child”, not MSA “ignorant”). The note shows under the word.
   5. From a Standard root but in a form you wouldn't recognise: in (كلش “very”, هيچ “like this”, إجا “came”).

   **What counts as Standard Arabic**, so that the rule is checkable: a word is Standard when **Wiktionary's Arabic
   (Standard) entry spelled the same gives the same meaning without a regional or “colloquial” label**. So تتن
   “tobacco” (Wiktionary: Standard, archaic), دشداشة “robe” and سويا “together” are out. Each word's Standard
   senses are in `EVIDENCE.md`.
3. **Evidence of meaning** (the owner: “real solid evidence that each word means what you thought it meant”):
   every word cites at least one published dictionary entry for the meaning taught (`src` in `words.json`, with
   links): Wiktionary's Iraqi Arabic entries (203 pages, CC BY-SA), the senses of Wiktionary's Arabic entries
   labelled Iraqi, and the **Living Arabic Project's Iraqi dictionary** (livingarabic.com), looked up word by word.
   Words with no entry for the meaning were left out even when common: تره “you know”, عبالي “I thought”, مدري
   “I don't know”, يمعود “come on, man”, عفية “well done”, حباب “sweet”, نوب “again”, فدوة “dear”, مصلحة “city
   bus”. And غوري “teapot” is never used in the texts, so it is out too.
4. **Order**: by uses in the texts, most used first, 50 to a unit. `rank` is the word's place among every spelling
   in the texts, Standard words included (the Gulf course's way).

## Sentences

One short everyday sentence per word, written for this course as people say it in Baghdad, 2 to 12 words, with
the English and ⟦ ⟧ round the word's part in both. Vowel marks show the Baghdad pronunciation (no case endings;
ē and ō written َيْ and َوْ). **گ is the Iraqi g and چ is ch**, as in Iraqi dictionaries, so a learner sees the
sound; the grammar course's first lesson explains them.

## Audio

Azure's Iraqi voice **Bassel** (`ar-IQ-BasselNeural`). Azure has two Iraqi voices, Bassel and Rana; a test on ten
Baghdad sentences (`tools/course/build/dialect-voice-test/irq/`, checked with Whisper and Meta's phoneme recogniser,
wav2vec2-xlsr-53-espeak-cv-ft) found:

- **Both voices skip گ and چ without a sound** (گاعد came out ʕaːd, چبير as biːr), and given the Standard
  letters they say q and k, as in Standard Arabic.
- **Told the sound in IPA** (`<phoneme alphabet="ipa">`), Bassel says g and tʃ; Rana turns g into dʒ. So the
  course uses Bassel, and `build_course.py` gives him every word written with گ or چ from `sounds.tsv`
  (words.json `voice.ipa`; a plain g, since the IPA letter ɡ came out silent). Other words he reads as written.
- Vowel marks keep him from adding Standard case endings (unmarked بيت كبير came out baytun kabīra).

Listen-back, 2026-11-02:

- **Whisper large-v3** (`check_audio.py ar-irq`, results in `docs/course/ar-irq/audio/check.json`): the sentences
  match **0.58** on average (the MSA course: 0.97; Levantine 0.40, Egyptian 0.73, Gulf 0.78). Most misses are
  Whisper writing Iraqi its own way: ch as تش (هيچ heard هيتش, which shows the ch is said), g as ج or ك
  (طرگاعة heard ترجاع, عگروگ عجروك), and dialect words as the nearest Standard ones (منين heard من أين).
- **The g and ch sounds**: Meta's phoneme recogniser on every word and sentence part written with گ or چ (43
  parts): **30 have every g and ch**. Said once, the voice dropped a g at the end of a word or before another
  consonant, so `sounds.tsv` writes those double (gg) and puts ʔ before a word starting with a vowel (5 more parts
  came through); مرگ was moved off the end of its sentence. The misses left are mostly short words said alone,
  where the recogniser also misses sounds Whisper hears.

**Worth a native listen** (an optional job for an Iraqi speaker): the words said alone in 5 هيچ, 13 حچى, 62 چا,
75 خاشوگة, 92 چطل, 93 چول, 98 چرخ (is the ch or g there?); the sentences of 87 قنفة (اُگْعُد), 95 عگروگ and
98 چرخ; and 26 شوكت, 28 لعد, 42 هذول, 55 دز, where Whisper heard something quite different. Voice test files:
`tools/course/build/dialect-voice-test/irq/` (git-ignored).
