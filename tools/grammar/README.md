# Grammar courses

Each language Tamkeen teaches gets a grammar course that starts from nothing (it never assumes the
learner knows what a verb or a subject is) and goes, in short lessons, to everyday conversation: about
CEFR A2, touching B1 (the level where someone can get by in most everyday talk, tell what happened, say
what they want and why). The app shows it on the Vocab page's **Grammar** tab, beside **Basics** (the 1000
commonest words: `tools/course/README.md`). The two are made to go together: Basics gives the words,
Grammar the ways to put them together.

## Who reads which course

A course is named `<from>-<to>`: the language its explanations are written in, then the language it
teaches. `en-ar` is Arabic explained in English; `ar-en` is English explained in Arabic.

- **Ready-made, written and checked by hand**: English → each of the 16 other languages (`en-ar`, `en-es`,
  `en-ja`…) and each of them → English (`ar-en`, `es-en`, `ja-en`…): 32 courses.
- **Any other pair** (a Chinese speaker learning Arabic, `zh-ar`): the app offers to make the lessons in
  the learner's language with the learner's own AI key (the one Settings → Word definitions already has).
  A lesson made this way is kept on that device, so it is paid for once.
- Which course the app shows: the learner's own language is the one the app is shown in (`ui_language`),
  the language learned is the one being studied (`study_language`). If a ready-made course exists for
  that pair, that one. Otherwise the English-explained course of the language learned, with the offer to
  make it in the learner's own language. (Someone studying the language the app is shown in gets the
  English-explained course, without the offer.)

### Why the AI translates the ready-made course instead of writing lessons itself

For a pair like Chinese → Arabic, the app takes the hand-checked English → Arabic course and has the AI
put **only its explanations** into Chinese. Everything in Arabic (the examples, their readings, the
right and wrong sentences, the practice answers) is never sent to be rewritten, so it stays exactly as
checked. Reasons:

1. **The language being learned stays correct.** The risky part of a grammar lesson is the examples: a
   model writing Arabic from nothing drops vowel marks, mixes dialect into Modern Standard Arabic or
   makes the very mistake the lesson warns about. Translating explanations into the learner's language is
   the kind of work these models do reliably; writing correct, fully vowelled Arabic examples is not.
2. **The order and the size are the course's, not a guess.** Every learner of Arabic gets the same
   sequence of lessons, worked out once by hand (roots and gender early, the three endings once objects
   are known…), instead of whatever a model invents on the day.
3. **Progress means the same thing for everyone.** A lesson is the same lesson whichever language it is
   read in, so switching the app's language (or a friend comparing notes) keeps the place.
4. **It is cheap and quick.** Only text goes out and comes back, a few thousand words per lesson: about a
   tenth of a US cent per lesson with the cheapest models, a few cents for a whole course.

What the AI is told: the learner speaks <their language>, not English, so where an explanation compares
with English it compares with their language instead (or leaves the comparison out when it doesn't
apply); every piece of the language being learned (marked `{{…}}`, below) is copied exactly. The app
checks each answer: a translated text must keep every `{{…}}` piece unchanged and every `**` pair; a piece
that doesn't is asked for again once, then shown in English rather than wrong.

## Audio

The examples have no recorded audio: the owner's Azure allowance is for the basics courses, and grammar
examples are short sentences any voice reads well. Tapping an example says it with the learner's own
**card voice** (Settings → Card voices): Azure with the learner's own key (made once per sentence and kept
while the app is open), "My computer" on the computer, or else the device's own voice, live and free.

## The lessons

### The path, per language

Each course has its own order, because each language is hard in its own places. Arabic needs the vowel
marks, roots and gender at once; Japanese its particles and polite endings; Russian its cases one at a
time; Chinese its measure words, aspect (了, 过) and word order of time and place. But every course
follows the same rules:

- **One idea per lesson**, 5 to 10 minutes: a short explanation, examples, common mistakes, practice.
- **Grammar words are explained the first time they are needed**, in plain words, with a `term` block
  ("A **verb** is a word for doing or being: *eat*, *go*, *is*."), and never assumed before. A course
  defines each term once; later lessons may use it.
- **The commonest first.** What a beginner says on the first day (I am…, this is…, I want…, where is…?)
  comes before what is rare or only written. The words in the examples come mostly from the language's
  basics course (its 1000 commonest words), so a learner doing both meets them twice.
- **Useful, natural examples**, the kind of sentences someone really says or reads. In the variety the
  basics course uses (`tools/course/LANGUAGES.md`: Modern Standard Arabic fully vowelled, Mexican Spanish,
  Brazilian Portuguese…).
- **Levels**: about the first 40% of lessons A1, the next 40% A2, the rest B1. Each lesson says its level.
- **Size**: about 40 to 55 lessons, grouped in 6 to 9 units with a name each ("First steps", "The past").
- The English courses (`<lang>-en`) are written for a speaker of that language: their order, comparisons
  and mistakes are about what is hard for that speaker (a Japanese speaker needs "a" and "the" early and
  long; a Spanish speaker doesn't need gender explained).

### The format

The source is `tools/grammar/<from>-<to>/lessons.json`, written by hand; `node tools/grammar/build.mjs`
checks it and publishes `docs/grammar/<from>-<to>/course.json` and `docs/grammar/index.json` (beside
`docs/course`). `tests/js/grammar.test.mjs` checks every course (and that the published copy is up to
date). The rules the checks enforce are in `web/js/grammardata.js` (`checkCourse`), shared by the build,
the test and the app.

```jsonc
{
  "from": "en", "to": "ar",
  "title": "Arabic grammar",                 // in the explanation language
  "variety": "Modern Standard Arabic",
  "about": "From the very start to everyday conversation…",
  "reading": "transliteration",              // what an example's `r` is, if the course has readings
  "units": [{ "n": 1, "title": "First steps" }, …],
  "lessons": [
    {
      "id": "nouns-the",                     // never changes once published (progress is kept by it)
      "unit": 1, "level": "A1",
      "title": "Nouns, and the word for “the”",
      "summary": "One line: what the learner will be able to do.",
      "blocks": [                            // the explanation, in order
        { "p": "A paragraph. **bold**, and {{الْبَيْتُ|al-baytu}} for a piece of Arabic (with its reading)." },
        { "term": "noun", "means": "a word for a person, an animal, a place, a thing or an idea." },
        { "ex": [ { "t": "الْبَيْتُ كَبِيرٌ.", "r": "al-baytu kabīrun.", "tr": "The house is big.", "note": "optional" } ] },
        { "table": [["", "Masculine", "Feminine"], ["big", "{{كَبِيرٌ|kabīrun}}", "{{كَبِيرَةٌ|kabīratun}}"]] },
        { "tip": "A short note worth remembering." }
      ],
      "mistakes": [ { "wrong": "الْبَيْتُ هُوَ كَبِيرٌ.", "right": "الْبَيْتُ كَبِيرٌ.", "why": "Arabic has no word for “is” here." } ],
      "practice": [
        { "type": "choice", "q": "Which means “the house is big”?", "options": ["{{…}}", "{{…}}"], "answer": 0, "why": "…" },
        { "type": "order", "q": "Put the words in order.", "tr": "The big house.", "words": ["الْبَيْتُ", "الْكَبِيرُ"], "also": [] },
        { "type": "say", "q": "How do you say “I am a student” (to a man)?", "answer": "أَنَا طَالِبٌ.", "r": "anā ṭālibun." }
      ]
    }
  ]
}
```

- **Which language is which.** Fields in the language learned: an example's `t` and `r`, a mistake's
  `wrong` and `right`, an `order` question's `words` and `also`, a `say` question's `answer` and `r`, and
  whatever is inside `{{ }}`. Everything else is in the explanation language. (This is what lets the app
  translate a course safely: it sends only the second kind.)
- **Marks inside explanation text**: `**bold**`; `{{text}}` or `{{text|reading}}` for a piece of the
  language learned (shown in its own script and direction, tappable to hear). Nothing else: no HTML.
- **A table** is rows of cells; the first row is its heading. Cells are explanation text with `{{ }}`.
- **Practice**: 3 to 6 questions per lesson, and at least one per lesson asks the learner to produce
  something (`order` or `say`).
  - `choice`: 2 to 4 `options` (explanation text with `{{ }}`), `answer` = the right one's index, `why`
    says why (shown after answering).
  - `order`: the sentence's words in the right order (the app shuffles them); `also` lists other orders
    that are also right; `tr` is what it means.
  - `say`: the learner says or thinks the answer, then shows it and hears it, and says whether they got it.
- **Examples**: every `t` is a whole, natural sentence or phrase with its translation `tr`; a course with
  readings (`reading`) gives every example its `r`. Arabic: fully vowelled, case endings included.

## Progress

A lesson is done once its practice is finished; the app keeps, per lesson, when and how many answers were
right (setting `grammar_progress`, `{"en-ar/nouns-the": {"at": seconds, "right": 4, "of": 5}}`), and it
travels to the learner's other devices with the sync (the latest finish of each lesson wins). Lessons made
in another language with an AI key share the progress of the course they were made from (a Chinese
speaker's `zh-ar` lessons count as `en-ar`'s).

## Making a course

1. Write `tools/grammar/<from>-<to>/lessons.json` (the format above), a unit or two at a time.
2. `node tools/grammar/build.mjs` (checks and publishes), then `node --test tests/js/grammar.test.mjs`.
3. Look at it in the app: run Tamkeen from source (the computer reads `docs/grammar` directly).
4. Publish with the website (a release; ask the owner first).

`tools/grammar/LANGUAGES.md` is the brief for the sessions that write the other languages' courses.

## Licences

The lessons are written for Tamkeen. No audio is published with them.
