# Frequency words 1001–3000: how each language is extended (shared brief)

The owner (Christian, not a programmer: explain in plain English) said on 2026-11-27: Basics' word list, now called
**Frequency words**, "should include all 3,000 of the most common words … which are going to connect to the glyph",
and later: "go ahead with the 3,000 words". Words 1–1000 are done for 17 languages (ar ca ceb de en es fa fr hi it
ja ko pt ru th tl zh). Each language gets words **1001–3000**, written the same way, one session per language.
Arabic dialect courses (ar-lev, ar-egy, ar-glf, ar-irq, ar-mor) are **not** part of this: they keep their own lists.

Read first: `tools/course/LANGUAGES.md` (the variety and voice of your language, the style, the checks: everything
there still applies), `tools/course/README.md`, your language's `tools/course/<lang>/words.json` (words 1–1000:
the style to copy) and its ranking script in `tools/course/<lang>/`.

## One list, shared with the Wellspring Glyph

The course **is** the shared list: the Glyph counts how many of the language's Frequency words the learner has
(`web/js/coursedata.js` `courseCount`, the same matching as Basics' own progress). So:
- **Words 1–1000 stay exactly as they are** (numbers, order, spelling): learners' progress and the Glyph count on them.
- Words 1001–3000 come next, **in frequency order** (your ranking script, run deeper: to about rank 4,000, since
  some are skipped), each its **dictionary form** (the form a dictionary lists, as for 1–1000).
- Leave out, as for 1–1000: names of people and places, words from another language that crept into the counts,
  numbers and symbols, and any word that is only a form of a word already in the list (a plural, a feminine, a
  conjugation, another spelling). A word is never in the list twice (the tests check).
- `rank` is the word's place in your ranked list, so the order can be checked.

## Writing

- Set `"planned": 3000` in your `words.json` (Basics then shows 60 units, those not written yet as "Coming soon").
- Write batches of 50 (`tools/course/build/batch-<lang>-<first>.json`, rows as `add_batch.py` explains), add them
  with `python tools/course/add_batch.py <lang> <batch>`, and run `node --test tests/js/course-content.test.mjs`
  (and `course.test.mjs` for Arabic) after each batch. Same rules as 1–1000: a short everyday sentence (about 3 to
  8 words) a native speaker would really say, the word in its most common sense, elementary, natural English
  translation with ⟦ ⟧ round the part that translates the word, `form` when the sentence has another form of it,
  `say` when the voice would read the word alone wrongly.
- **No audio yet**: Azure's free allowance goes to the DLI decks first. Build the course text-only, keeping the
  audio of 1–1000: `python tools/course/build_course.py <lang> --voice azure --no-new-audio` (no Azure calls). In
  the app, a word without its audio is said by the app's own voice (`coursepanel.js`), as before for cards.
- Check a unit in the app (Content → Basics → Frequency words) before going on.

## Branch, files, reports

- Work in your own worktree and branch, as `LANGUAGES.md` says, named `freq-<lang>` off `main`:
  `git -C C:/Users/chris/Documents/arabic-tts/podcast-studio worktree add C:/Users/chris/Documents/arabic-tts/freq-<lang> -b freq-<lang> main`.
  Junction `mobile/node_modules` from the main checkout if you build the phone app there, and remove the junction
  (`rmdir`, never a recursive delete) before deleting the worktree.
- Touch only `tools/course/<lang>/`, `tools/course/build/` (scratch), `docs/course/<lang>/` and your entry in
  `docs/course/index.json`. Shared files (build_course.py, add_batch.py, the tests, app code) are not yours: ask.
- Commit on your branch as you go (end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  Never push, merge, tag or release: the main Tamkeen chat merges.
- Report to "Temkeen Main Chat" every 500 words (the count, the commit, the tests, anything unclear), and at the end.

## Audio, later

When the main chat says the month's Azure allowance is free (planned February–March 2027, after the DLI decks),
most-studied languages first (ar, es, fr, de, then the rest): `python tools/course/build_course.py <lang> --voice
azure` makes only the missing audio (about 20–80k characters per 1,000 words, by language), then
`python tools/course/check_audio.py <lang>` and fix what it lists.
