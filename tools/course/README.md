# Basics courses

Each language Tamkeen teaches gets a basics course: its **1000 most common words**, most common first,
in **20 units of 50**. Every word has one short, everyday sentence that uses it the way native speakers
do, the sentence's translation, and **audio** (the word, a pause, then the sentence) from the most
natural voice available. The app shows the course on the Vocab page's **Basics** tab
(`web/js/components/coursepanel.js`); a word added from there becomes an ordinary card with that audio.

The courses are made on the owner's computer and published with the website (`docs/course`, beside
`docs/lexicon`). The app downloads only the course of the language being learned, and each word's audio
only when it is played or added.

## Making a language's course

1. **Count the forms** (needs `pip install wordfreq==3.1.1`, any Python):
   `python tools/course/forms.py ar` → `tools/course/build/ar-forms.json` (the 20,000 most common written
   forms, from wordfreq, CC BY-SA 4.0: the source of `web/js/wordlists`).
2. **Group them by dictionary word**: `node tools/course/rank.mjs ar` → `tools/course/build/ar-ranked.json`
   (وكتبوا, يكتبون and كتبت all count for كَتَب, with the analyzer the app uses for seen words). Only Arabic
   has this step so far; other languages need their own grouping (the word tables in `docs/lexicon` give
   each form's dictionary word for most of them).
3. **Choose and write the words** in `tools/course/<lang>/words.json`, in the ranked order, checking each
   by hand: the analyzer makes mistakes (it took كل for أَكَل "to eat"), names of people and places are left
   out, and the feminine or plural of a word already in the course is not a new word. For each word:
   - `word`: its dictionary form, as a learner should see it (Arabic: fully vowelled);
   - `meaning`: a short English meaning, the most common sense first;
   - `sentence`: one short sentence (about 3 to 8 words) a native speaker would really say, using the
     word in its most common sense and with the words it usually goes with; elementary, and it must make
     sense on its own (Arabic: Modern Standard Arabic, fully vowelled, case endings included);
   - `translation`: natural English, with ⟦ ⟧ round the part that translates the word;
   - `rank`: its place in the ranked list (so the order can be checked).
   `tests/js/course.test.mjs` checks the file: numbering, no word twice, the sentence uses the word, vowels.
4. **Make the audio**:
   - the real thing, with Azure (the owner's Speech key, from Tamkeen's Settings → Card voices, or
     `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`): `python tools/course/build_course.py ar --voice azure`
     → `docs/course/ar/` (course.json and audio/NNNN.ogg) and `docs/course/index.json`;
   - a preview with the free local voice, never published: `python tools/course/build_course.py ar --voice piper`
     → `tools/course/build/preview/`. To see it in the app, run it with `APS_COURSE_DIR` set to that folder.
   Audio already made for the same text and voice is kept; only new or changed words are made again.
5. **Check the audio**: `python tools/course/check_audio.py ar` writes down what each file says with
   Whisper large-v3 and lists the files whose sentence doesn't match (`docs/course/ar/audio/check.json`).
   Listen to those, fix the text or remake them (`--redo`).
6. **Publish** with the website (a release; ask the owner first).

## Other languages

Every language the app teaches has its voice in `build_course.py` (`AZURE`, the same voices as the app's
card voices; Bisaya, which Azure has no voice for, uses Meta's MMS voice made on this computer, `--voice mms`).
Each language is made on a branch of its own off `basics-course` (`basics-<lang>`), touching only its own
files: `tools/course/<lang>/` (its words, and any ranking script it needs), `docs/course/<lang>/`, and its
entry in `docs/course/index.json` (which merges by language: keep every language's entry). The full brief
for a language's session, with the variety each voice speaks, is `tools/course/LANGUAGES.md`.
- `check_audio.py` hears Chinese, Japanese and Thai letter by letter (they have no spaces), Thai with
  Typhoon and Bisaya with BuzzASR's model (the listening models Tamkeen downloads for them), and takes
  `--out` so a language's check can be written outside its folder.

- Rows of a batch can carry a seventh item, `form`: the word as the sentence has it when it isn't written
  the same ("went" for "go"); `tests/js/course-content.test.mjs` checks the sentence contains the word or
  that form, and the numbering, ranks, length, ending and ⟦ ⟧ marks, for every language but Arabic.
- A word said on its own can come out in the wrong reading (Chinese 的 as "dí", Japanese は as "ha", Portuguese
  "o" as the letter's name). Such a word carries `say`: the text to voice for the word part instead, or its
  exact sound for Azure (`{"alphabet": "sapi", "ph": "de 5"}`, `{"alphabet": "ipa", "ph": "u"}`). Words without
  it keep their audio; adding it remakes only that word's file.
- Several builds can run at once on this computer: they take turns with Azure (a lock file in the temp
  folder), since its free tier allows about 20 requests a minute for the whole key.
- If Azure refuses (401/403), the month's free allowance may be used up: what is made is kept, and the
  next run makes only the rest.

## Size and cost

About 14 KB of audio per word (Ogg Opus), so about 14 MB for a whole language. A word and its sentence are
about 40 to 60 characters: a language is about 50,000 characters of Azure, inside Azure's free monthly
allowance (about half a million characters; check Azure's pricing page).

## Licences

- The word counts: wordfreq (CC BY-SA 4.0), so the ranked lists are CC BY-SA 4.0 too.
- The sentences, meanings and translations are written for Tamkeen.
- The audio: Microsoft lets apps use what its neural voices say (e-learning is one of its named uses); the
  app says that the voice is a computer voice, as Microsoft's code of conduct asks. Piper's Arabic voice has
  no stated licence, which is why its previews are never published.
