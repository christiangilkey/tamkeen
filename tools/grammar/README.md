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

### The principle: grammar as a tool for doing things

The owner's design (2026-10-24, from research on task-based teaching, explicit grammar instruction,
spaced retrieval and learner motivation): **teach grammar as a tool for accomplishing things with the
language, not as a body of knowledge to master before speaking.** A learner says something meaningful in
the very first lesson, then gains, lesson by lesson, the ability to say more complex things, follow
natural conversation and answer without translating in their head. Three things go together that grammar
books usually keep apart:

- **Immediate usability**: every lesson ends with the learner able to say something useful they couldn't
  before ("Say what you want", "Tell someone what happened yesterday").
- **Systematic mastery**: the explanation is explicit and accurate, so the learner builds a true picture
  of how the language works.
- **Fluency**: patterns come back again and again, in new situations, until they come out fast.

So a lesson is named after a **capability**, and its grammar is the tool for it ("Tell someone what
happened yesterday", topic: the past tense). Every lesson answers five questions, in this order:

1. **Purpose**: what can I do with this? The lesson opens with its goal sentence, something the learner
   can say right away (`goal` block), and `title` and `summary` say the capability.
2. **Meaning**: what does it mean, and when is it used? Contrast it with forms that look similar.
3. **Form**: how is it built? The pattern, the endings, the word order, the agreement (`p`, `term`,
   `table`, `ex`, `dialog`).
4. **Contrast**: which mistake to watch for, and why it is wrong (`mistakes`).
5. **Application**: can I use it for my own thought? Practice that builds sentences (`fill`, `order`,
   `dialogue`), and always a **"your turn"** question (`free`) where the learner says or writes something
   of their own (they see model answers, and the learner's AI key can check their sentence).

**A spiral, not a list.** Every major structure comes back several times, each time for a harder job:
the past first to say what happened, later to tell a story in order, later still to report what someone
said; questions first to ask for information, later to interview someone, later to ask follow-ups.
Practice questions carry `"from": "<earlier lesson id>"` when they reuse an earlier lesson's grammar in
the new situation; from the fourth lesson on, every lesson has at least one. The app's **mixed review**
(Grammar tab) brings back questions from lessons already done, the oldest and the weakest first.

**Fun comes from having something to say.** Scenes and missions (`dialog` blocks: a real exchange at a
café, a hotel, a doctor's, a phone call), choices in conversation (`dialogue` questions: pick your reply),
small challenges, humour in the examples. Rotate the kinds of practice while the goal stays the same.
Mistakes are a normal part of trying. Finishing a lesson earns **XP** in the app's creature game (more the
first time, and for more right answers); a mixed review earns XP too.

### The path, per language

Each course has its own order, because each language is hard in its own places, and each learner's own
language makes different things easy or hard. `tools/grammar/LANGUAGES.md` gives each language's starting
points. Rules for every course:

- **Capabilities in the order a beginner needs them**: greet and say who you are, point and name, ask,
  say what you want and have, where things are, what you do every day, what happened, what you will do,
  why, compare, suggest, tell a story, give your opinion, imagine… The grammar of each language decides
  how each of those is done and what has to come first.
- **One capability per lesson**, 5 to 10 minutes.
- **Grammar words are explained the first time they are needed**, in plain words, with a `term` block
  ("A **verb** is a word for doing or being: eat, go, is."), and never assumed before. A course defines
  each term once; later lessons may use it.
- **Useful, natural examples**, sentences someone really says, in the variety the basics course uses
  (`tools/course/LANGUAGES.md`). The words come mostly from the language's basics course (its 1000
  commonest words), so a learner doing both meets them twice.
- **Levels**: about the first 40% of lessons A1, the next 40% A2, the rest B1 (each lesson says its level;
  the level never goes down). Target: everyday conversation, about A2, touching B1.
- **Size**: about 40 to 55 lessons in 6 to 9 units, each unit named for what it lets the learner do
  ("First conversations", "Out and about", "Telling what happened").
- The English courses (`<lang>-en`) are written for a speaker of that language: their order, comparisons
  and mistakes are about what is hard for that speaker (a Japanese speaker needs "a" and "the" early and
  often; a Spanish speaker doesn't need gender explained, but does need "do" in questions).

### The format

The source is `tools/grammar/<from>-<to>/lessons.json`, written by hand; `node tools/grammar/build.mjs`
checks it and publishes `docs/grammar/<from>-<to>/course.json` and `docs/grammar/index.json` (beside
`docs/course`). `tests/js/grammar.test.mjs` checks every course (and that the published copy is up to
date). The rules the checks enforce are in `web/js/grammardata.js` (`checkCourse`), shared by the build,
the test and the app. `node tools/grammar/format.mjs <from>-<to> [more.json]` tidies the file (and adds
the lessons of another file to it). `tools/grammar/en-ar/lessons.json` is the model.

```jsonc
{
  "from": "en", "to": "ar",
  "title": "Arabic grammar",                 // in the explanation language
  "variety": "Modern Standard Arabic",
  "about": "From your very first sentence to everyday conversation…",
  "reading": "transliteration",              // what an example's `r` is, if the course has readings
  "draft": false,                            // true: checked, but not published (learners don't see it yet)
  "units": [{ "n": 1, "title": "First conversations" }, …],
  "lessons": [
    {
      "id": "say-what-you-want",             // never changes once published (progress is kept by it)
      "unit": 1, "level": "A1",
      "title": "Say what you want",          // the capability
      "summary": "Ask for things, and say what you want to do: “I want to learn Arabic.”",
      "topic": "{{أُرِيدُ}} with a noun, and {{أَنْ}} + the -a form of a verb",   // the grammar, as a tag
      "blocks": [
        { "goal": { "t": "أُرِيدُ أَنْ أَتَعَلَّمَ الْعَرَبِيَّةَ.", "r": "urīdu an ataʿallama l-ʿarabiyya.", "tr": "I want to learn Arabic." } },
        { "p": "A paragraph. **bold**, and {{الْبَيْتُ|al-baytu}} for a piece of Arabic (with its reading)." },
        { "term": "verb", "means": "a word for an action or a state: write, go, live, want." },
        { "ex": [ { "t": "…", "r": "…", "tr": "…", "note": "optional" } ] },
        { "dialog": [ { "who": "Waiter", "t": "…", "r": "…", "tr": "…" }, { "who": "You", "t": "…", "r": "…", "tr": "…" } ] },
        { "table": [["", "present", "after {{أَنْ}}"], ["I", "{{أَتَعَلَّمُ}}", "{{أَنْ أَتَعَلَّمَ}}"]] },
        { "tip": "A short note worth remembering." }
      ],
      "mistakes": [ { "wrong": "أُرِيدُ أَتَعَلَّمُ.", "right": "أُرِيدُ أَنْ أَتَعَلَّمَ.", "tr": "I want to learn.", "why": "…" } ],
      "practice": [
        { "type": "choice", "q": "…", "options": ["{{…}}", "…"], "answer": 0, "why": "…" },
        { "type": "fill", "q": "Choose the missing word.", "t": "أُرِيدُ ___ أَذْهَبَ.", "tr": "I want to go.", "options": ["أَنْ", "أَنَّ"], "answer": 0, "why": "…" },
        { "type": "order", "q": "Put the words in order.", "tr": "…", "words": ["…", "…"], "also": [] },
        { "type": "dialogue", "q": "At the café: choose your replies.", "lines": [
            { "who": "Waiter", "t": "…", "r": "…", "tr": "…" },
            { "options": ["…", "…"], "answer": 0, "why": "…" } ] },
        { "type": "say", "q": "How do you say “…”?", "answer": "…", "r": "…", "from": "an-earlier-lesson-id" },
        { "type": "free", "q": "Your turn: what do you want to do this year? Start with {{أُرِيدُ أَنْ}}…",
          "answers": [ { "t": "…", "r": "…", "tr": "…" }, { "t": "…", "r": "…", "tr": "…" } ] }
      ]
    }
  ]
}
```

- **Which language is which.** In the language learned: the `t` and `r` of a goal, an example, a line of
  dialogue or a model answer; a mistake's `wrong` and `right`; the `t` and `options` of a `fill` question;
  an `order` question's `words` and `also`; a `dialogue` reply's `options`; a `say` question's `answer`
  and `r`; and whatever is inside `{{ }}`. Everything else (a `choice` question's options included) is in
  the explanation language. This is what lets the app translate a course safely: it sends only the second
  kind.
- **Marks inside explanation text**: `**bold**`; `{{text}}` or `{{text|reading}}` for a piece of the
  language learned (shown in its own script and direction, tappable to hear). Nothing else: no HTML.
- **Blocks**: the first is always the `goal` sentence. Then `p` (paragraph), `term` (a grammar word, once
  per course), `ex` (examples, at least 3 per lesson), `dialog` (a short scene: lines with `who`), `table`
  (rows of cells, the first row is its heading), `tip`.
- **Practice**: 4 to 8 questions. At least one builds a sentence (`fill`, `order` or `dialogue`), at least
  one is "your turn" (`free`), and from the fourth lesson on at least one has `from` (an earlier lesson's
  grammar, used again).
  - `choice`: 2 to 4 `options`, `answer` = the right one's index, `why` (shown after answering).
  - `fill` (select the word): a sentence `t` with one gap `___`, 2 to 4 `options` (words of the language
    learned, no marks), `answer`, `tr`, `why`.
  - `order`: the sentence's words in the right order (the app shuffles them); `also` lists other orders
    that are also right; `tr` is what it means.
  - `dialogue`: `lines` of a conversation; a line with `who`, `t`, `tr` (and `r`) is said by someone else,
    a line with `options`, `answer` and `why` is the learner's reply to choose.
  - `say`: the learner says the answer, then sees and hears it, and says whether they got it.
  - `free`: a question the learner answers with their own sentence (typed or said); `answers` are model
    answers. With an AI key, the app can check what they wrote.
- **Examples**: every `t` is a whole, natural sentence or phrase with its translation `tr`; a course with
  readings (`reading`) gives every example its `r`. Arabic: fully vowelled, case endings included.
- **Readings of the choices** (optional; for a script the learner can't read yet, give them): a `fill`
  question's `r` is its sentence's reading with the same `___`, and its `rs` one reading per option; an
  `order` question's `rs` is one reading per word; a dialogue reply's `rs` is one reading per option. All in
  the same order as what they read. The app shows them under the tiles and buttons when readings are on,
  and fills the gap of `r` with the right option's reading once answered. A `choice` option is explanation
  text, so it gives its reading inside the marks: `{{word|reading}}`. A mistake can give the readings of
  its `wrong` and `right` as `rw` and `rr`.

  ```jsonc
  { "type": "fill", "t": "我___咖啡。", "r": "Wǒ ___ kāfēi.", "options": ["要", "是"], "rs": ["yào", "shì"], … }
  { "type": "order", "words": ["我", "要", "咖啡。"], "rs": ["wǒ", "yào", "kāfēi."], … }
  { "options": ["好的。", "不是。"], "rs": ["Hǎo de.", "Bú shì."], "answer": 0, "why": "…" }
  ```


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
