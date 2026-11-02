# Gulf Arabic basics (Saudi, Riyadh style): how the word list was made

The Gulf course teaches Saudi Arabic as spoken in Riyadh and the central region (Najd), the owner's choice
of "Saudi style" (وِشْ "what", not Kuwaiti شنو). It builds on the Standard Arabic (MSA) course: its basics
list holds only everyday Saudi words that MSA doesn't have. Grammar that differs from MSA is in the grammar
course (`tools/grammar/en-ar-glf/lessons.json`).

**88 words** pass every rule below and have a published source for their meaning. That is fewer than the
300 hoped for: the strict "no MSA word" rule removes most everyday Saudi words, because Arabic also has them
(see "Left out" below), and several well-known Saudi words have no published dictionary entry yet.

## Files

| file | what it is |
| --- | --- |
| `list.json` | the words chosen by hand: word (vowelled as said in Riyadh), part of speech, meaning, `note` (how it differs from an MSA word that looks the same), the example sentence and its translation, `form` (the word as the sentence has it), `forms` (the spellings it is counted in), `exforms` / `exmatch` (which sentences count as real examples), `la` (its Living Arabic headword), `manual` (other published sources) |
| `words.json` | the course's word list, numbered by how often Saudis use the words (made by `build-list.mjs`) |
| `evidence.json` | for every word: its counts in the three Saudi text collections, every published dictionary entry found for it (with a link), and real Saudi sentences that use it (made by `build-list.mjs`) |
| `la-gulf.json` | the Living Arabic Project Gulf dictionary entries looked up for the words (`la.mjs`), kept so the evidence can be rebuilt offline |
| `manual.json` | published sources that are neither Wiktionary nor Living Arabic (an Arab News article) |
| `head.json` | the course title, variety, description, voice |
| `counts.mjs`, `build-list.mjs`, `la.mjs`, `hf_text.py` | the tools (below) |

## Rebuilding

1. `node tools/course/dialect/sources.mjs` downloads the shared texts and dictionaries into
   `tools/course/build/dialect/` (git-ignored).
2. The extra Saudi texts, with `hf_text.py` (its header has the three commands), into
   `tools/course/build/dialect/sada/` and `.../fineweb2/`. The 43 Najdi Arabic Wiktionary entries are fetched
   into `.../wikt-najdi/najdi-pages.json` (the Wiktionary API, category "Najdi Arabic lemmas").
3. `node --max-old-space-size=8192 tools/course/ar-glf/counts.mjs` counts every word in the Saudi texts
   (`build/dialect/glf-work/counts.json`).
4. `node tools/course/ar-glf/la.mjs` looks up new words in the Living Arabic Gulf dictionary.
5. `node tools/course/ar-glf/build-list.mjs` writes `words.json` and `evidence.json`.
6. `node tools/course/dialect/overlap.mjs ar-glf` (must say none is an MSA word), then
   `.venv/Scripts/python.exe tools/course/build_course.py ar-glf --voice azure` for the audio.

## The Saudi texts (counted; never published except a few short quotes in evidence.json)

- **AOC, Al-Riyadh comments**: readers' comments on the Saudi daily Al-Riyadh that annotators judged dialectal
  (Arabic Online Commentary, Zaidan & Callison-Burch, ACL 2011). 260,000 words. Mostly Najdi.
- **SADA 2022**: transcripts of Saudi TV programmes (drama, cooking, talk shows) by speakers labelled Najdi
  (Saudi Data and AI Authority; CC BY-NC-SA 4.0), from two Hugging Face copies of its Najdi part. 900,000
  words. Some programmes are Hijazi (Jeddah) in practice; words used only there were not chosen.
- **FineWeb2, Najdi part**: web text (forums, mostly) that FineWeb2's language identifier labelled Najdi
  Arabic (Hugging Face; ODC-By 1.0), the first of its 11 files. 52 million words.
- A word's rank is its place among every spelling in these texts, Standard words included, by the average
  of its frequency per million words in the three. Its count adds up all the spellings in `forms` (and each
  with و / ف in front); `evidence.json` lists them. Where a spelling is also another word (العيش "living"),
  the count includes it, and the example sentences are filtered (`exmatch`) to the dialect meaning.

## The published evidence of each word's meaning

The owner's rule: every word needs a published source for its meaning, recorded. `evidence.json` has the
entries, each with its source and a link:

- **Wiktionary** (CC BY-SA 4.0): its Gulf Arabic, Hijazi Arabic and Najdi Arabic entries, and the senses of
  its Arabic entries labelled Gulf or Saudi (via kaikki.org; the Najdi entries from the Wiktionary API).
  Hijazi is the Arabic of western Saudi Arabia; a Hijazi entry is used only for a word that the Najdi texts
  also use with that meaning.
- **The Living Arabic Project's Gulf Arabic dictionary** (livingarabic.com), looked up word by word.
- **Arab News**, "Lost in translation: The Saudi words the English language can't quite handle" (Nada
  Alturki, 23 September 2026), for أَبْشِر and سَنَع.

Every word has at least one entry that gives the meaning the course teaches (read by hand, 2026-11-01).

## The rules (the owner's, approved 2026-10-27)

1. A word spelled like a word of the MSA basics list or the 1000 commonest Arabic words (no vowel marks, the
   app's search spelling) is out. `tools/course/dialect/overlap.mjs` and `tests/js/dialect-course.test.mjs`
   enforce it.
2. An MSA word only said differently is out (شَاهِي = شاي, فِنْجَال = فنجان, عَبَايَة = عباءة, رَايِح = رائح).
3. An MSA word with dialect grammar on it is out (مَحَد, مَانِي, بَيْرُوح); the grammar lessons teach the pattern.
4. A word spelled like a rarer MSA word but meaning something else stays, with a `note` (زَيْن "good", not MSA
   "beauty"; عَيْش "rice", not MSA "living").
5. A word from an MSA root in a form an MSA learner wouldn't recognise stays (مَدْرِي, مَعْلِيش, شْوَيّ, مُويَة).

And the owner's strict reading (2026-11-01, "keep the strict rules"): a word that Standard Arabic also has
with the same meaning is out, even if it isn't among its 1000 commonest words. The test for "the same
meaning" was the MSA dictionary the app uses (CAMeL Tools' MSA database) and, where unsure, Hans Wehr.

## Left out, and why

- **Rule 1 (spelled like an MSA basics or common word):** اللي, شي, أبي "I want", ترى, مرّة "very", سَوَّى "do",
  دَوَّر "look for", عَلَّم "tell", صِدِق "really?", رِجَّال "man", حَقّ "belonging to", إيه "yes", طَيِّب "OK".
  The grammar course teaches the ones that are grammar.
- **Standard Arabic has them with the same meaning:** حَطّ "put", رَاح "go", قَعَد "sit", شَال "carry", خَلَّى "let",
  طِلِع "go out", بِغَى "want" (MSA بَغَى "desire"), جَا "come", طَاح "fall", زِهِق "get fed up", شَاهِي "tea",
  دَلَّة "coffee pot", فِنْجَال "coffee cup", جَوَّال "mobile phone", حُرْمَة "woman, wife", حَرِيم "women", هَوْشَة "fight",
  عِزْوَة "kin who back you", كِذَا "like this", جُوَّا "inside", قِدَّام "in front", تَوّ "just now", بُكْرَة "tomorrow",
  شَايِب "old man", لَبَن, عِقَال, شَنْطَة "bag".
- **No published source for the meaning found yet:** تِكْفَى "please (I beg you)", كَفُو "well done", فَزْعَة
  "rallying to help", طَقْطَقَة "teasing", حَسَافَة "what a pity", مِير "but", نَاظَر "look at", قَلَّط "come in",
  شَغَّالَة "housemaid", سَمّ "yes? (answering)". They can join the list when a dictionary records them.
- **Too rare in the texts (under about 100 uses in 53 million words):** قَهْوَى "serve coffee", مْعَزِّب "host",
  زُولِيَّة "rug".
- **Counts not trustworthy:** سِيدَا "straight on" (its spelling is mostly the Standard phrase سَيِّدَا "the two
  masters").
- **Not Riyadh speech:** the Jeddah (Hijazi) words إيش, فين, كويس, عَلَشَان, دَحِين, لَيْه, ده, and the Kuwaiti /
  Emirati شنو, وايد, شلون (Riyadh says وِشْلُون).

## The audio

Azure's Saudi voice Hamed (ar-SA-HamedNeural), approved by the owner after the listening test in
`tools/course/build/dialect-voice-test/` (2026-10-27). It is an Azure voice for Saudi Arabia, trained mostly
on Standard Arabic with a Saudi accent: it reads the sentences clearly but says ق as q where Riyadh says g.

Listened back with Whisper large-v3 (`tools/course/check_audio.py ar-glf`, 2026-11-01): the sentences match
0.78 on average (MSA's course: 0.97), 45 of 88 fully. Most misses are Whisper writing Saudi words its own
way, since it learned mostly Standard Arabic: ويش for وش, the final -ah dropped (موي for مويه, كشت for كشتة),
حين for حيل. Two sentences that came out unclear were rewritten and voiced again (64 شِمَاغ, 81 هَرْجَة).
Worth a native listen: 4 عَشَان, 13 خَلَاص (فِهِمْت), 32 عُقْبَال, 47 خَرَابِيط, 68 يِمْدِي.
