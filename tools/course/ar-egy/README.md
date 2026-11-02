# Egyptian basics (`ar-egy`)

The commonest words of everyday Egyptian Arabic (Cairo speech) that are **not** Standard Arabic. The course
builds on the Arabic basics course (`tools/course/ar`): a learner who did that one already knows the Standard
words, so this one teaches only what is new. The grammar that differs from Standard Arabic is in the grammar
course (`tools/grammar/en-ar-egy`, 16 lessons).

**150 words** (the owner asked for up to 300 if the evidence allowed: see "How many words" below).

## Files

| File | What it is |
|---|---|
| `texts.mjs` | `node tools/course/ar-egy/texts.mjs`: downloads the extra Egyptian texts into the git-ignored `tools/course/build/dialect/egy-extra/` and writes them one sentence per line. |
| `rank.mjs` | `node tools/course/ar-egy/rank.mjs`: counts every spelling in all the texts (kept in `egy-extra/counts.json`) and writes two lists to look through: the commonest dictionary words (`egy-groups.tsv`) and the commonest non-MSA spellings an Egyptian dictionary defines (`egy-pool.tsv`). |
| `lisaan.mjs` | Looks words up in the Lisaan Masry dictionary (pages kept in `egy-extra/lisaan/`, fetched once, a second apart). |
| `cites.json` | Three dictionary entries checked by hand on Wiktionary's site (يلا, أهو, جدّو), for words its Egyptian section lacks. |
| `proof.mjs` | `node tools/course/ar-egy/proof.mjs`: `words.json` → `evidence.json` (uses in each kind of text, every dictionary definition found, real sentences). `node tools/course/ar-egy/proof.mjs draft.tsv` prints a review table of a draft list. |
| `order.mjs` | `node tools/course/ar-egy/order.mjs`: puts `words.json` in frequency order and sets `n`, `rank` and `planned`. |
| `words.json` | The course, as `build_course.py ar-egy --voice azure` reads it. Extra fields not published: `forms` (the spellings counted), `see` (other spellings to look up in dictionaries), `formsOnly`, `perMillion`. |
| `evidence.json` | The proof for every word (made by `proof.mjs`). |

Rebuild after editing `words.json`: `node tools/course/ar-egy/order.mjs`, `node tools/course/ar-egy/proof.mjs`,
`node tools/course/dialect/overlap.mjs ar-egy`, `.venv/Scripts/python.exe tools/course/build_course.py ar-egy --voice azure`
(only changed words are voiced again), then `node --test tests/js/course-ar-egy.test.mjs`.

## How the words were chosen

1. **Counted in real Egyptian text**, 7.4 million words, only counted (never published):
   - AOC: readers' comments on Youm7 judged Egyptian (Zaidan and Callison-Burch 2011), 0.3 million words;
   - ArzEn-MultiGenre v3: Egyptian TV subtitles, novels and songs, each line with a human English translation
     (Al-Sabbagh 2023, Mendeley Data doi:10.17632/6k97jty9xg.3, CC BY 4.0), and the Egyptian Arabic Dialogue Dataset
     (TV subtitles with English, CC BY 4.0, huggingface.co/datasets/fr3on/egyptian-dialogue): 0.16 million words;
   - Egyptian Forums Corpus-mini, files 0-2 of 52 (the corpus EgyBERT was trained on; CC BY-NC 4.0,
     huggingface.co/datasets/faisalq/EFC-mini), 7 million words; counted only, never quoted.
   A word's rate is the **average of its rate in the three kinds of text** (comments, subtitles, forums), so the
   forums' size (and their football talk) doesn't outweigh speech.
2. **Candidates**: the commonest spellings that the Standard Arabic dictionary can't read, every Egyptian
   Wiktionary headword counted with its forms (`rank.mjs`), and everyday Egyptian words checked one by one;
   about 320 were looked at closely.
3. **The strict "is it Standard Arabic?" rules** (approved by the owner), applied by hand:
   1. Spelled like a word of the MSA basics course or of the 1,000 commonest Arabic words (`web/js/wordlists/ar.js`),
      compared the way the app's search compares words: out. `tools/course/dialect/overlap.mjs` and
      `tests/js/dialect-course.test.mjs` enforce it. (So اللي, مش, دي, دول, إيه, يعني, حاجة, طب, حد, دور, فضل, نص,
      ادّى, بطّل, ساعات, خلف and جون are out; the grammar course teaches the commonest of them.)
   2. A Standard word only said differently: out (كتير = كثير, تاني = ثاني, تلاتة, ورا = وراء, إيد = يد, جعان =
      جوعان, عيلة = عائلة, استنّى = استأنى, مزبوط = مضبوط, ضهر = ظهر, تلاجة = ثلاجة).
   3. A Standard word with dialect grammar on it: out (بيقول, هيبقى, اتكلم = تكلّم, اتعلم, اتجوّز = تزوّج,
      اتخانق = تخانق, مفيش = ما فيه شيء, محدّش, علطول = على طول, ببلاش, متهيّألي, عمّو, جدّو, لوحده).
      The grammar course teaches these patterns.
   4. Spelled like a rarer Standard word but meaning something else: **in, with a note** shown under the word
      (كمان "also", not MSA "violin"; عيش "bread", not MSA "life"; عربية "car", not MSA "Arabic").
   5. From a Standard root but in a form you wouldn't recognise: in (جه "came" from جاء, خد "took" from أخذ,
      إزاي "how", دلوقتي "now", النهارده "today", عشان, معلش, بلاش).

   **What counts as Standard Arabic** (the same test as the Levantine course, so the dialects agree): a word is
   Standard when the MSA dictionary gives it the same meaning, or **Wiktionary's Arabic (Standard) entry spelled
   the same gives the same meaning without a regional or "colloquial" label**. This is strict: it leaves out many
   words Cairenes think of as their own, because a Standard dictionary gives them the same meaning: ساب "leave",
   خلّى "let", ودّى "take to", زهق "get bored", عيّط "weep", بهدل "scold", شنطة "bag", مشوار "errand", عبيط
   "silly", سرحان "absent-minded", شلّة "gang", كوبري "bridge", لمبة "bulb", موتوسيكل, زبادي, شطّة, طرحة, عزبة,
   غيط, محشي, فسحة, ماما, بابا, مبسوط, عيّل and برّه "outside" are out. (شاف "see" stays: its Standard sense is
   "look down at".) Modern MSA usage known to be the same was also left out (ركن "park", نده "call", ولّع
   "light", عيّان "ill", حلّة "pot", فكّة "change", شراب "socks", بوتاجاز).
4. **Evidence of meaning** (the owner: "real solid evidence that each word means what you thought it meant"):
   every word has at least one published dictionary definition that gives the meaning taught, recorded with its
   source in `evidence.json`: Wiktionary's Egyptian Arabic entries (92 words), CAMeL Tools' Egyptian lexicon
   (136), the Lisaan Masry Egyptian Arabic–English dictionary (97), Egypt-labelled senses of Wiktionary's Arabic
   entries, and three entries checked by hand (`cites.json`). Up to four real sentences that use each word come
   with them, those from the subtitles with their human English translation. Words with no such entry were left
   out even when common: مامي "mummy", أبيه "big brother", خالو "uncle", سوري "sorry", والنبي "please".
   `tests/js/course-ar-egy.test.mjs` checks that every word has a dictionary gloss matching its meaning,
   is used at least 15 times, and that every word the MSA dictionary can read carries a note.
5. **Order**: most used first (the average rate above), 50 to a unit. `rank` is the word's place among all the
   Egyptian dictionary's words counted the same way (spellings grouped by CAMeL's Egyptian dictionary); the gaps
   are the words the rules left out.

## How many words

150. As with the Levantine course, the strict rules leave out most of the commonest Egyptian words: they are
Standard Arabic said a little differently, Standard words with dialect grammar, or words dictionaries also list
as Standard. The 150 are everything that passed all five rules, has a published definition and is used at least
15 times in the 7.4 million words. The bigger texts (the forum posts and the subtitles) added words but couldn't
add 150 more: what they brought in was mostly the same everyday words again, names, football, or words found
in Standard dictionaries.

## Sentences

One short everyday sentence per word, written for this course in natural Cairo Arabic, 2 to 12 words, with an
English translation and ⟦ ⟧ round the word's part in both. The sentences are **not vowelled**, as Egyptians write
(and as the voice was heard and approved in the owner's listening test); the headword is vowelled the way it is
said in Cairo, following the Egyptian dictionaries (فِين, لِيه, بَعْدِين). Each word is voiced from its unvowelled
spelling (`say`), the way it is written in its sentence.

## Audio

Azure's Egyptian voice **Salma** (`ar-EG-SalmaNeural`), approved by the owner after the voice samples in
`tools/course/build/dialect-voice-test/`. Each file: the word, a pause, the sentence a little slower. Built by
`build_course.py ar-egy --voice azure` (about 3,400 Azure characters); checked with `check_audio.py ar-egy`
(Whisper large-v3, results in `docs/course/ar-egy/audio/check.json`).

**The machine check is weak for a dialect.** Whisper matched the sentences 0.73 on average (the Standard Arabic
course: 0.97; the Levantine one: 0.40) and heard the word alone in 54 of 150 files. Most misses are Whisper
spelling Egyptian sounds its own way (أوي written أوا, جدع written جدعا, بوظ written بوز). Worth a native listen:
words 24 (بعدين), 60 (واد: heard as الوادي "the valley"), 70 (عيش: heard as عائشة), 77 (طنط), 121 (كوباية).
