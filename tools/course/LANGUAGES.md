# Basics courses: how each language is made (shared brief)

The owner (Christian, not a programmer: explain in plain English) wants a basics course for every language
Tamkeen teaches: the 1000 most common words, each in one short, elementary, everyday sentence used the way
native speakers really use it, with audio from the most natural voice available. Arabic was made first, on
branch `basics-course` (worktree `C:\Users\chris\Documents\arabic-tts\tamkeen-basics`): all 1000 words, with
Azure audio, and the owner approved its style. Every other language is made the same way, one session per
language, each on its own branch. "The session that started you" is the basics-course session, which checks
your audio sample. Nobody here merges anything: the main Tamkeen chat merges once the owner approves.

Read these first (your worktree has them too):
- `tools/course/README.md` (the whole process, incl. "Other languages")
- `tools/course/ar/words.json` (the style to copy)
- `tools/course/build_course.py`, `tools/course/add_batch.py`, `tests/js/course-content.test.mjs`

## Your own branch and folder
- Make your worktree (retry after a few seconds if git says a lock file exists; skip if it already exists):
  `git -C C:/Users/chris/Documents/arabic-tts/tamkeen-basics worktree add C:/Users/chris/Documents/arabic-tts/tamkeen-basics-<lang> -b basics-<lang> basics-course`
  and work only in `C:\Users\chris\Documents\arabic-tts\tamkeen-basics-<lang>`.
- Touch only your language's files: `tools/course/<lang>/` (words.json and any ranking script you need),
  `tools/course/build/` (gitignored scratch), `docs/course/<lang>/`, your entry in `docs/course/index.json`,
  and optionally `tests/js/course-<lang>.test.mjs` for checks of your own.
- Do NOT edit shared files (build_course.py, add_batch.py, check_audio.py, rank.mjs, forms.py, the tests other
  than your own, app/, web/, mobile/, CHANGELOG, HANDOFF, this file). If a shared change is needed, message the
  session that started you instead of making it.
- Commit on `basics-<lang>` as you go (end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  Never push, merge, tag or release.

## Which variety
Write the variety the voice speaks (build_course.py `AZURE`), and say it in words.json's `variety`:

| lang | voice | variety to write |
|---|---|---|
| es | es-MX Dalia | Latin American Spanish (Mexico): ustedes, no vosotros |
| fr | fr-FR Denise | French (France) |
| ja | ja-JP Nanami | Standard Japanese; polite です/ます sentences unless a plain form is what people really say |
| zh | zh-CN Xiaoxiao | Mandarin, simplified characters; pinyin with tone marks in `meaning` |
| ru | ru-RU Svetlana | Russian; stress marks are optional, but be consistent |
| it | it-IT Elsa | Italian (Italy) |
| tl | fil-PH Blessica | Tagalog / Filipino as spoken in Manila (everyday Taglish loans are fine where natural) |
| pt | pt-BR Francisca | Brazilian Portuguese (você) |
| ca | ca-ES Joana | Catalan (central) |
| th | th-TH Premwadee | Central Thai; a romanisation in `meaning` |
| de | de-DE Katja | German (Germany) |
| fa | fa-IR Dilara | Iranian Persian, standard written form (not colloquial spellings) |
| hi | hi-IN Swara | Hindi in Devanagari; a romanisation in `meaning` |
| ko | ko-KR SunHi | Korean, polite 요 style unless another is what people really say |
| en | en-US Jenny | American English; `meaning` is a short, simple English definition (the learner reads English) |
| ceb | Meta MMS (local) | Cebuano / Bisaya as spoken in Cebu |

## The words
1. Ranked list: `C:/Users/chris/AppData/Local/Temp/tlt/wfvenv/Scripts/python.exe tools/course/forms.py <lang>`
   (wordfreq 3.1.1; Tagalog is `fil` in wordfreq if `tl` fails). Thai and Bisaya aren't in wordfreq: start from
   `web/js/wordlists/<lang>.js` (see its README for the sources) and, if you need more than 1000, the same sources.
   Group forms by dictionary word (lemma): your language's files in `docs/lexicon/` (`<lang>-lemmas.json.gz`
   for most; `ko-words`, `zh-cedict`, `ja-ipadic`, `tl-roots`, `ceb-roots`, `th-readings` for the others) and
   the analyzers in `web/js/lexicon/` help; write any script for this inside `tools/course/<lang>/`.
2. Choose by hand, most common first: skip names of people/places/nationalities, junk, abbreviations, and
   forms of a word already in the course. Fix wrong groupings. `rank` = its place in your ranked list (must rise).
3. Write batches of 100 to `tools/course/build/batch-<lang>-NNN.json` as rows
   `[rank, word, pos, meaning, sentence, translation, form?]`, then
   `C:/Users/chris/Documents/arabic-tts/podcast-studio/.venv/Scripts/python.exe tools/course/add_batch.py <lang> <batch>`
   and `node --test tests/js/course-content.test.mjs` (must pass). words.json header:
   `{"lang", "title": "<Language> basics", "variety", "about", "words": []}` (copy Arabic's shape).
   - `word`: dictionary form as a learner should see it; `meaning`: short English, commonest sense first
     (add a reading/romanisation in brackets where the script needs one: pinyin, kana, etc.);
   - `sentence`: 3–8 words (max 12; zh/ja/th max 30 characters), elementary, natural, commonest sense, with
     the words it usually goes with; it must make sense alone and end like a sentence;
   - `translation`: natural English with ⟦ ⟧ round exactly the part that translates the word;
   - `form`: the word as written in the sentence when it differs (string or list), so the test can find it.
   - Quality over speed: every sentence must be something a native speaker would actually say.
4. **Sample first.** The owner wants each voice's accuracy checked before a whole language is voiced. Make
   words.json hold only your first 20 words, build their audio (command below), commit, then send ONE short
   message to the session that started you: "<lang> sample ready: <commit>". It checks the sample by
   listening back (Whisper; Thai with Typhoon, Bisaya with its own model) and replies. Meanwhile keep writing
   words in batch files, but make no more audio until it says the voice is fine (or tells you what to change).
5. Audio, after each batch or two, in the background (several languages take turns with Azure automatically):
   `C:/Users/chris/Documents/arabic-tts/podcast-studio/.venv/Scripts/python.exe tools/course/build_course.py <lang> --voice azure`
   (Bisaya: `--voice mms`, the local MMS voice in `Documents/arabic-tts/local-tts`). It only makes new audio.
   If Azure refuses (401/403: the monthly free allowance may be used up), stop making audio, keep writing words,
   and say so in your report. Do not run check_audio.py (Whisper): the starting session runs it for all
   languages at the end, one at a time, so the graphics card isn't overloaded.
6. Finish: all 1000 words written and tested, audio made as far as Azure allows, committed. Report: branch,
   last commit, word count, audio count, anything unsure (words you skipped or doubted).
