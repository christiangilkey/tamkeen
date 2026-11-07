# DLI vocabulary decks: how they are made

The owner gave five Anki decks of the DLI basic courses (Arabic, Chinese, Farsi, Korean, Spanish). Each one
becomes a **DLI deck**: for a DLI student of that language, the app puts every word in the Vocab tab, **one
folder per chapter**, each word with a full sentence, its English translation and audio (the word, then the
sentence). Everything made from the decks is DLI material: it stays in the private content folder
`C:\Users\chris\Documents\arabic-tts\dli-content` (outside this public repository) and reaches the app only
encrypted (`tools/dli/encrypt.mjs`, see `dli-content\README.txt`).

    dli-content/<lang>/<deck id>/
      deck.json              the deck's words and chapters (tools/dli/anki_decks.py; never edit by hand)
      sentences/<chapter>.json   a sentence and translation for each word first met in that chapter
      audio/<n>.ogg, made.json   each word's audio (tools/dli/voice_deck.py)

1. **Words**: `.venv/Scripts/python -I tools/dli/anki_decks.py <lang> <deck.apkg>` reads the deck: words, meanings,
   notes (plurals, pinyin, hanja), and chapters in course order (c001, c002...). A word met in several chapters
   is one word (one number `n`) listed in each; its sentence is written in the first chapter it is met in.
2. **Sentences** (below): one file per chapter, checked with `node tools/dli/check_sentences.mjs <lang> [chapters]`.
3. **Audio**: `.venv/Scripts/python tools/dli/voice_deck.py <lang>` (Azure, the owner's key, as the basics
   courses). The owner chose the free tier: about 500,000 characters a month, so the decks are voiced over
   two or three months, Arabic and Chinese first. Words show up in the app with their sentences straight away;
   their audio arrives with a later release, and until then the device's voice reads them.
4. **Package**: `node tools/dli/encrypt.mjs` with `DLI_PASSWORD` set.

## Writing the sentences

A file `sentences/<chapter id>.json`:

```json
{ "chapter": "c010", "words": [
  { "n": 123, "sentence": "أَسْكُنُ ⟦فِي⟧ بَيْتٍ صَغِيرٍ.", "translation": "I live ⟦in⟧ a small house." },
  { "n": 124, "sentence": "...", "translation": "...", "say": "...", "fix": { "word": "...", "meaning": "..." } }
] }
```

There must be exactly one entry for each word whose **first** chapter is this one (`deck.json`: the word's
`chapters[0]`), and no others. `node tools/dli/check_sentences.mjs <lang> --todo <chapter>` lists them.

- `sentence`: **one** natural sentence that a native speaker would really say or write, using the word in the
  sense the deck's meaning gives (the first sense if it gives several). Put ⟦ ⟧ round the word **as it appears
  in the sentence** (conjugated, with its article or suffix as the language writes it: Korean `주말에 뭐 ⟦해⟧요?`,
  Arabic `⟦كَتَبْتُ⟧ رِسَالَةً`). DLI students learn these words for real use, so the sentence should show the word
  in its typical setting, with the words it usually goes with; the level can rise with the course (simple and
  everyday in early chapters, news, military, politics or society in the later ones, as the word itself
  suggests). It must make sense on its own and end like a sentence. Length: about 4 to 14 words, at most 100
  characters (Chinese at most 40 characters). No real living people's names; common first names are fine.
  Factual and calm for hard topics (weapons, terrorism, disasters, crime): the news, not a story.
- `translation`: natural English, with ⟦ ⟧ round exactly the part that translates the word.
- `say` (when needed): how to voice the word **said alone** in the audio, when the deck's text can't be read
  as it is: alternatives with slashes (`amable/simpático(a)` → `amable, simpático`), grammar marks
  (`jugar (ue)` → `jugar`, `제안 (~하다 / 되다)` → `제안`, `~(으)로` → `으로`), or a reading the voice would get
  wrong. **Arabic: always**, the word fully vowelled as a dictionary form (nouns without a case ending:
  `مَكْتَبَة`, verbs in the past `حَفَّزَ`, phrases as said: `حِزَامُ الأَمَانِ`). **Chinese**: a character that has
  several readings, said alone, gets its exact sound from the deck's pinyin, in Azure's tone-number form:
  `{"alphabet": "sapi", "ph": "zhi 3"}` (several syllables: `"chuang 1 hu 5"`); 了 → `"le 5"`, 为 → `"wei 4"`.
- `fix` (rarely): only when the deck's own text is plainly broken, e.g. a typo (`divorsed`) or a Korean phrase
  split by a line break (`오래(간) 만입니다.` → `오래간만입니다.`). `word` and/or `meaning`; leave DLI's wording
  alone otherwise.

### Each language (the variety the Azure voice speaks)

| lang | voice | write |
|---|---|---|
| ar | ar-SA Zariyah | Modern Standard Arabic, **fully vowelled** (every letter, case endings included, as tools/course/ar/words.json) |
| zh | zh-CN Xiaoxiao | Mandarin, simplified characters, no pinyin in the sentence |
| es | es-MX Dalia | Latin American Spanish (Mexico): ustedes, no vosotros |
| fa | fa-IR Dilara | Iranian Persian, standard written form; Persian ی and ک (never Arabic ي ك); the half-space (ZWNJ) where standard (می‌روم) |
| ko | ko-KR SunHi | Standard Korean (Seoul), polite 요 style unless the setting calls for 합니다 style (news, military, formal speech) |

Quality over speed: every sentence must be something a native speaker would actually say, correct in grammar,
spelling and (Arabic) vowels. Read each one again before moving on.
