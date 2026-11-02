# Moroccan basics (ar-mor): how the word list was made

The Moroccan Arabic (Darija) basics course: the 300 most used Darija words that are **not** Standard Arabic
(MSA) words, most used first, 50 to a unit, each with one everyday sentence and its English translation. It
builds on the Arabic basics course (`tools/course/ar`): a learner who has done that one meets nothing twice.
The grammar course that goes with it is `tools/grammar/en-ar-mor` (only what differs from MSA).

The files here:

| file | what it is |
|---|---|
| `list.tsv` | the list, written by hand: word, part of speech, meaning, note, form used in the sentence, sentence, translation, the spellings to count, forms to leave out |
| `make.mjs` | `list.tsv` -> `words.json` (counts every word, ranks them, adds the dictionary entries) and `EVIDENCE.md` |
| `words.json` | what `tools/course/build_course.py ar-mor --voice none` publishes as `docs/course/ar-mor/course.json` |
| `EVIDENCE.md` | the proof behind every word, for reading: how often it is used, the dictionary entries (linked), what Standard Arabic says |
| `evidence.json` | real sentences from the texts that use each word (`tools/course/dialect/evidence.mjs mor`) |

## Which Darija

Casablanca and Rabat speech, the everyday Darija of the cities, as Moroccans write it online: Arabic letters,
no vowel marks, `ڭ` for the g sound where writers use it, the `ka-` present written `ك` (`كنبغي` "I want").
Darija has no fixed spelling, so each word is shown in its **most used spelling in the texts** (`طونوبيل`, not
`طوموبيل`; `عفاك`, not `عافاك`); the other spellings are counted with it (`list.tsv`, column 8).

## Where "most used" comes from

Two collections of real Darija, counted on this computer (their text is never published; a few short sentences
are quoted in `evidence.json` as proof of use):

- the **Darija Open Dataset** (DODa), its 49,000 sentences (220,000 words), CC BY-NC 4.0,
  github.com/darija-open-dataset/dataset;
- the subtitles of **248 Moroccan YouTube videos** (talk, news explainers, entertainment; 614,000 words),
  Bouaghad & Bourbouh, CC BY 4.0, huggingface.co/datasets/bourbouh/moroccan-darija-youtube-subtitles.

A word is counted in **all its forms**: `make.mjs` makes each verb's paradigm from its past and present (`بغا`:
`بغيت بغيتي بغات… نبغي كنبغي غانبغي مابغيتش…`), each noun with the article and possessive endings, each with
`و ف ب ل د` in front. A form that is itself a common MSA word is not counted (`مني` "from me" is not `ملي`
"when"), and a form two words share is split between them. The rank is the **mean of the two collections'
rates** per million words, so neither collection decides alone (DODa is translated sentences, YouTube is
speech). A word used fewer than 5 times in all is left out; the first 300 are kept.

## The "is it MSA?" rules (the owner's, 2026-10-27)

1. **Out**: a word spelled like a word of the MSA basics course or of the 1000 commonest Arabic words, compared
   the way the app's search compares words (`tools/course/dialect/overlap.mjs`; a test enforces it). So `شي`,
   `اللي`, `دار` "house / to do", `حاجة`, `خاص` "must", `مش` "cat", `عقل` "to remember" are out.
2. **Out**: an MSA word only said the Darija way: `جا` = `جاء`, `هاد` = `هذا`, `داك` = `ذاك`, `نتا` = `أنتَ`,
   `ديما` = `دائماً`, `ڭال` = `قال`, `البارح` = `البارحة`, `حيت` = `حيث`, `كلشي` = `كل شيء`. The grammar
   course's Sounds lesson teaches these changes once.
3. **Out**: an MSA word with Darija grammar on it (`عندك`, `مابغيتش`, `كيبان`): the grammar lessons teach the
   patterns.
4. **In, with a note**: a word spelled like some MSA word but meaning something else. The note in the app says
   so (`بغا`: "Not MSA بَغَى (to wrong, to oppress)."). `make.mjs` looks up Wiktionary's Standard Arabic entry
   spelled the same for every word; where there is one, it is checked by hand: **the same meaning puts the word
   out** (this is how `طاح` "to fall", `خدم` "to work", `حوت` "fish", `برا` "outside", `ماما`, `دوش` "shower"
   and `زربية` "carpet" were found to be MSA words and left out), a different one gets a note (a test checks
   every such word has one).
5. **In**: a word from an MSA root in a form an MSA learner wouldn't recognise (`ماكلة` "food" from `أكل`,
   `جوج` "two" from `زوج`, `بنادم` "person" from `ابن آدم`).

Loanwords: a loan MSA doesn't use is in (`طونوبيل`, `سبيتار`, `بلاصة`, `سيمانة`); one MSA uses in a form
you'd recognise is out (`تيليفون`, `شكلاط` = `شوكولاتة`, `بوليس`).

## Evidence of meaning

The owner: "I need real solid evidence that each word means what you thought it meant". Every word has at
least one **published dictionary entry** giving the meaning taught, recorded with its page (`src` in
`words.json`; `EVIDENCE.md` lists them all):

- Wiktionary's Moroccan Arabic entries (CC BY-SA 4.0, as extracted by kaikki.org), and its Arabic entries
  labelled Moroccan or Maghrebi;
- the Darija Open Dataset's word lists (its syntactic and semantic categories, and its `x-tra` lists of short
  phrases and verb forms), CC BY-NC 4.0.

`make.mjs` cites the senses that share a word with the meaning taught (`list.tsv` can name them instead with a
`~pattern` in the spellings column). A word with no entry for the meaning taught is left out, however common:
`كون` "if (it had been)" is in the texts 1,250 times, but the dictionaries only have it as "be", so it is taught
in the grammar course's "if" lesson instead; `إيوا` "well, so" is in as `اوا`, the spelling the dictionary has.
Every word is also used in real sentences of the texts (`evidence.json`; a test checks each has some).

## No audio

Azure's Moroccan voices (`ar-MA-MounaNeural`, `ar-MA-JamalNeural`) were tested on 7 Darija sentences
(2026-11-01) and run through a phoneme recognizer (Meta's `wav2vec2-xlsr-53-espeak-cv-ft`) next to the Saudi
MSA voice: both Moroccan voices say Darija with Standard Arabic vowels in every consonant cluster, exactly like
the Saudi voice (`بغيت` *bghit* said *baghīt*, `كنبغي` *kanbghi* said *kenabghi*, `كتب` *ktəb* said *katab*);
writing the Darija vowel marks in garbled other words. So the course ships without audio (`"audio": false`):
the app shows no Word / Sentence buttons, and a card made from it is read by the learner's card voice.

## Making it again

```
node tools/course/dialect/sources.mjs          # downloads the texts and dictionaries (once)
node tools/course/ar-mor/make.mjs              # list.tsv -> words.json, EVIDENCE.md
node tools/course/dialect/evidence.mjs mor     # -> evidence.json
node tools/course/dialect/overlap.mjs ar-mor   # no word is an MSA word
.venv/Scripts/python.exe tools/course/build_course.py ar-mor --voice none   # -> docs/course/ar-mor
node --test tests/js/course-ar-mor.test.mjs tests/js/course-content.test.mjs tests/js/dialect-course.test.mjs
```

To change a word, edit `list.tsv` and run the lines from `make.mjs` on. A word that drops below the first 300
(or under 5 uses) is reported by `make.mjs`; `list.tsv` should then lose it too (the test checks both match).
