# ICPT prep decks: how they are made

DLI students take ICPTs (In-Course Proficiency Tests) during the course. Like the DLPT they test reading and listening
on authentic passages (signs, ads, newspapers, radio and TV, the internet), and the questions are in English. Unlike the
unit tests, students get **no glossary** for them. The owner asked for a deck per DLI language that students can study for
them, by topic, so each student can work on their weak areas.

How it's built (the owner's choices, 2026-11-09): **one deck per DLI language, Arabic first** (Modern Standard Arabic
only), **folders by topic, then level**, audio on Azure's free tier after the basic decks (the device's voice until then).

## Why it's built this way (the research, in short)

- The DLPT5 lower range covers ILR 0+ to 3. Passages cover "social, cultural, political, economic, geographic,
  scientific, and military topics". Each passage starts with a one-line English orientation ("From a local news
  report") (DLIFLC DLPT5 familiarization guides).
- A level is assigned at about 70% of its questions, and only once the lower levels are passed. So the words of
  Level 1, 1+ and 2 passages (ads, notices, everyday factual news) carry most of the score. A deck split by level
  lets a student build up in the order the test is scored.
- Understanding a passage needs about 95-98% of its words known. So each topic's deck is its **frequent** words,
  not every word.
- The test only asks for understanding: cards go **foreign word to English**, with audio for the listening half.
- Topic sets help vocabulary (repeated meetings, "narrow reading"). But near-synonyms learned side by side get
  mixed up (Tinkham, Waring, Nakata & Suzuki 2019), so a level's new words are not ordered synonym after synonym.
- Besides topics, passages turn on news phrases, words for who said what, linking and opinion words, numbers,
  dates and prices. Those get folders of their own.

## Topics (ids, what belongs where)

| id | folder title | holds |
|---|---|---|
| politics | Politics & government | elections, parliament, parties, government and ministries, diplomacy, treaties, summits, protests, international organisations |
| military | Military & security | armed forces, ranks, units, weapons, operations, attacks, ceasefire, terrorism, borders as front lines, intelligence, peacekeeping |
| economy | Economy & business | prices, markets, trade, oil and energy as industry, budget, inflation, jobs and unemployment figures, banks, investment, companies, agriculture |
| crime | Crime & law | police, arrests, investigations, courts, trials, sentences, smuggling, corruption, fraud, prisons, laws |
| health | Health & medicine | hospitals, doctors, diseases, epidemics, vaccines, medicine, the body as news uses it, health services |
| disasters | Disasters, accidents & weather | earthquakes, floods, fires, storms, road and air accidents, rescue, casualties and damage, weather forecasts |
| science | Science, technology & environment | research, space, the internet, phones and computers, pollution, climate, water, energy sources |
| society | Society & education | population, family, women and youth, schools and universities, work, migration and refugees, housing, poverty, social services |
| culture | Culture, religion & media | religion and holidays, heritage, art, music, film, books, newspapers, TV and radio, journalists |
| sports | Sports | games, teams, players, tournaments, results, the Olympics, football |
| geography | Geography & travel | regions, terrain, directions, capitals and nationalities (common ones), transport, airports, hotels, tourism |
| notices | Signs, ads & notices | shop and street signs, ads, opening hours, offers, invitations, public announcements, warnings, forms |
| numbers | Numbers, time & dates | large numbers, ordinals, fractions, percent, days, months (all the sets in use), times, periods, ages, prices |
| news | News language | reporting verbs (said, announced, denied, confirmed, condemned, warned, called for), sources (an official, a spokesman, the agency), linking words (however, despite, due to), opinion and analysis words, time phrases |

A word goes in the topic where news meets it most. If it really belongs to two (حُكُومَة: politics and economy), write
it once, in its main topic.

## Levels (a word's level is the easiest passage where a learner needs it)

- **1** = Level 1-1+: signs, ads, notices, timetables, invitations, headlines, short simple statements of fact.
  Concrete and very frequent.
- **2** = Level 2: factual news reports of common events (who did what, where, when, how many), simple
  biographies, routine announcements. Standard news verbs and nouns.
- **3** = Level 2+/3: commentary, editorials, analysis and argument: causes, consequences, positions, hypotheses,
  criticism, policy. Abstract nouns and stance verbs, but ones the press really uses, not rare literary words.

Every topic has all three levels, except **notices** and **numbers** (mostly 1, some 2).

## Writing a topic file

`dli-content/<lang>/<lang>-icpt/src/<topic id>.json`:

```json
{ "topic": "economy", "words": [
  { "level": "1", "word": "سِعْر", "meaning": "price", "notes": "Plural: أَسْعَار",
    "sentence": "⟦سِعْرُ⟧ الْخُبْزِ ثَابِتٌ هٰذَا الشَّهْرَ.", "translation": "⟦The price⟧ of bread is unchanged this month.", "say": "سِعْر" }
] }
```

- `level`: "1", "2" or "3" as above.
- `word`: the dictionary form, **fully vowelled**: a noun without a case ending (`مِيزَانِيَّة`), a verb in the
  past (`وَقَّعَ`), a phrase as it is said (`وَقْفُ إِطْلَاقِ النَّارِ`). Use the form news really uses: the plural
  if news nearly always says that (`مُحَادَثَات` talks), a set phrase when the phrase is what one has to know
  (`عَلَى صَعِيدٍ آخَرَ`).
- `meaning`: short English, in the sense news uses. Two senses at most, with "; ".
- `notes`: what helps recognise the word in a passage. For a noun, an irregular plural: `Plural: أَسْعَار`. For a
  verb, the present and the verbal noun: `Present: يُوَقِّعُ · Verbal noun: تَوْقِيع`. For an adjective, only an
  irregular form. A common synonym the press also uses: `Also: مَصْرِف`. "" when there's nothing useful.
- `sentence`: **one** sentence in the style of the level's passages (an ad or a sign for 1, a news report for
  2, a commentary for 3), as a native journalist or copywriter would write it. Fully vowelled, case endings
  included. ⟦ ⟧ round the word as it appears in the sentence, once. About 4 to 14 words, at most 100 characters.
  It ends like a sentence (. ! ? ؟).
  - No real living people's names. Common first names are fine.
  - For a real country, only neutral facts (its capital, that it hosts a summit). Never invent attacks, crimes
    or scandals by a real country, group or company. Say "the two countries", "the neighbouring state" or "the
    ministry" instead.
  - Hard topics (weapons, terrorism, disasters, crime) are factual and calm, like the news.
- `translation`: natural English, with ⟦ ⟧ round exactly the part that translates the word.
- `say`: the word to voice alone, fully vowelled (usually the same as `word`).

**Choose the words a learner meets most often in that topic at that level.** Real news usage comes first, the
common term before its rarer synonyms. Don't put two near-synonyms one after the other in a file: spread them out.
Everyday basics that every first-semester student knows (house, big, go) don't belong; words a student may have
seen but news uses all the time (حُكُومَة, وَزِير, قَالَ) do. Quality over speed: read every sentence again for
grammar and vowels before moving on.

## From topic files to the deck

`node tools/dli/icpt_deck.mjs <lang>` turns the topic files into `deck.json` and `sentences/` beside them, in the
basic decks' format, so `check_sentences.mjs --deck <id>`, `voice_deck.py` and `encrypt.mjs` read it like any
deck:

- Chapters are **level first, then topic** ("Politics & government · Level 1-1+", then the next topic at Level
  1-1+, ...). The app adds a deck's chapters so that its first chapter's words are the newest cards, and the
  reviewer shows the newest new cards first. So a student who just reviews everything learns Level 1 of every
  topic before Level 2. One who wants a topic opens its folders.
- A word written in two topics is one word (one card) filed in both folders, with the first one's sentence. A word
  number never changes once given (it's what the audio and the learner's cards are matched by).
- A word the student already has from the basic deck is **linked** to it: the app files the student's existing card
  in the ICPT folder instead of making a second card, and it needs no audio of its own. Linked = the same letters
  (the article, a sun letter's shadda and a tanween ي aside), the same shadda and verb-or-not when both are vowelled,
  and the basic card's meaning has the ICPT word's **first** sense (قَضَى "to sentence" stays its own card, since the
  basic card says "to spend time").
- Two topics' entries are one word by the same letter and shadda rules plus a meaning in common; its meaning then
  has the senses of both.
- **Once released, a chapter's word list is final** (the app adds a chapter once). More words go in a new chapter.
- Audio: `voice_deck.py ar --deck ar-icpt`. Its `usage.json` counts per deck folder, so for the month's Azure total
  add the basic deck's `usage.json` too.
