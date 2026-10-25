# Grammar courses: how each language is made (shared brief)

The owner (Christian, not a programmer: explain in plain English) wants a grammar course for every
language Tamkeen teaches, from zero to everyday conversation, in both directions with English. One
session per language writes **both** of its courses:

- **English → <lang>** (`tools/grammar/en-<lang>/lessons.json`): <lang> taught to an English speaker,
  explanations in English;
- **<lang> → English** (`tools/grammar/<lang>-en/lessons.json`): English taught to a speaker of <lang>,
  explanations written in natural <lang> (not translated from English: written for that speaker).

(Arabic: `en-ar` is the model course, written on branch `grammar-course`; the Arabic session writes
`ar-en`.) The session that started you is the grammar-course session: it owns the app and the format. Nobody
here merges anything; the main Tamkeen chat merges once the owner approves.

Read these first (your worktree has them):
- `tools/grammar/README.md`: the design. **The principle section is the owner's and is not optional**:
  every lesson is a capability ("Say what you want"), opens with its goal sentence, then meaning, form,
  common mistakes, and practice that ends with the learner's own sentence; grammar comes back in later
  lessons for harder jobs (a spiral), with `from` on the questions that reuse it.
- `tools/grammar/en-ar/lessons.json`: the model lessons (the style, the level of detail, the kinds of
  practice).
- `web/js/grammardata.js` `checkCourse`: what the checks require.

## Your own branch and folder
- If the app didn't already give you a worktree on branch `grammar-<lang>`, make one (retry after a few
  seconds if git says a lock file exists):
  `git -C C:/Users/chris/Documents/arabic-tts/tamkeen-grammar worktree add C:/Users/chris/Documents/arabic-tts/tamkeen-grammar-<lang> -b grammar-<lang> grammar-course`
  and work only there. Never work in `tamkeen-grammar`, `tamkeen-basics` or another language's folder.
- Touch only your own files: `tools/grammar/en-<lang>/` and `tools/grammar/<lang>-en/` (lessons.json and
  a PLAN.md), `docs/grammar/en-<lang>/`, `docs/grammar/<lang>-en/`, your two entries in
  `docs/grammar/index.json` (the build keeps every other entry), and optionally
  `tests/js/grammar-<lang>.test.mjs` for checks of your own (accents, spelling, script).
- Do NOT edit shared files (web/, app/, mobile/, tools/grammar/*.mjs, README.md, this file, other tests). If
  the format or the checks need a change, message the session that started you (one short message) and
  carry on with something else meanwhile.
- Commit on `grammar-<lang>` as you go (end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  Never push, merge, tag or release.

## How to work
1. **Plan both courses first**, in `tools/grammar/en-<lang>/PLAN.md` and `tools/grammar/<lang>-en/PLAN.md`:
   units (named for what they let the learner do), lessons in order (id, capability title, the grammar it
   needs, level), and where each big structure comes back (the spiral). Use the starting points below,
   but the order is your judgement as an expert teacher of this language: what does a beginner need to
   say first, and what must be understood before what? 40 to 55 lessons per course; about 40% A1, 40%
   A2, 20% B1.
2. Write a unit at a time, then `node tools/grammar/format.mjs <pair>` (tidies the file),
   `node tools/grammar/build.mjs <pair>` (checks it and publishes `docs/grammar`) and
   `node --test tests/js/grammar.test.mjs` (must pass). Commit after each unit.
3. **Quality over speed.** Every example is something a native speaker really says, in the variety below,
   and correct to the last accent, tone mark and particle. Explanations are short, plain and exact. Each
   lesson has 3+ examples, a scene (`dialog`) when the capability is a conversation, 1 to 3 common
   mistakes, and 4 to 8 practice questions mixing the kinds (fill, choice, order, dialogue, say) and
   ending with "your turn" (`free`, with 2 or 3 model answers).
4. The app's Grammar tab is being updated for the new kinds of practice on `grammar-course`; you don't need
   to look at your course in the app. The build and the test are what count.
5. Finish: both courses written, built and tested, committed. Report: branch, last commit, lessons per
   course, and anything you were unsure of.

## Variety and readings
Write the variety the basics course uses (`tools/course/LANGUAGES.md`). English, in the `<lang>-en`
courses, is American English. A course whose examples are in a script the learner can't yet read has
`"reading"` set and gives every example (and goal, dialogue line, model answer and `say` answer) its `r`:

| course | reading (`r`) |
|---|---|
| en-ja | rōmaji (Hepburn); `t` in natural Japanese (kanji and kana as a native writes) |
| en-zh | pinyin with tone marks; `t` in simplified characters |
| en-ko | Revised Romanization; `t` in Hangul |
| en-th | the romanisation the Thai basics course uses, with tones; `t` in Thai script |
| en-hi | the romanisation the Hindi basics course uses; `t` in Devanagari |
| en-fa | a romanisation with the short vowels (they aren't written in Persian); `t` in Persian script |
| en-ru | a Latin transliteration; `t` in Cyrillic with stress marks |
| en-ar | transliteration (done) |
| Latin-script courses (es, fr, it, pt, ca, de, tl, ceb) and every `<lang>-en` | none (`"reading": ""`) |

## Starting points, language by language

These are the structures that make each language what it is, and a sensible early order. Plan the rest.

**Spanish (es, Mexico)**. en-es: *ser* vs *estar* (who/what vs where/how) early and back often; gender and
articles; regular present and the key irregulars (*tener, querer, ir, poder, hacer*); *me gusta* (its
back-to-front shape) early; *ir a* + infinitive for plans; questions; stem-changing verbs; reflexives for
daily routine; object pronouns; preterite, then imperfect (background vs events: a spiral); *por/para*;
commands (*tú/usted*); present subjunctive for wishes and requests (*quiero que, ojalá, cuando*) at A2–B1;
conditional and *si* clauses at B1. *Ustedes*, never *vosotros*. es-en: *do* in questions and negatives;
the subject is never dropped (*It's raining*); adjective before the noun, never plural; present simple vs
continuous; irregular past; present perfect (and where Spanish uses the preterite); *for/since*; *I'm 20*,
not *I have 20 years*; *make/do*; prepositions *in/on/at*; phrasal verbs; false friends.

**French (fr, France)**. en-fr: *être/avoir*; gender, articles and the partitive (*du, de la*: needed to
order food); present of -er verbs and *aller, faire, vouloir, pouvoir*; *je voudrais* as a polite chunk
early; *ne…pas*; questions (intonation, *est-ce que*; inversion to recognise); *aller* + infinitive; passé
composé with *avoir/être*, then imparfait (a spiral); object pronouns and *y/en*; reflexive verbs; futur
simple; conditional; subjunctive after *il faut que, vouloir que* (A2–B1); *tu/vous*; elision and liaison
as reading notes. fr-en: *do*; present continuous; present perfect vs passé composé (*since/for* with the
present perfect, not *depuis* + present); no gender; adjective before the noun; articles and generic
nouns (*I like cats*); third-person -s; *th* and *h*.

**Japanese (ja)**. en-ja: polite です/ます from day one; は (topic) vs が (subject), coming back often;
particles を, に, で, へ, と, も, の; verb at the end; い- and な-adjectives with their negatives and pasts;
verb groups; ます forms (present, negative, past, ～ましょう); て-form (～てください, ～ている, linking);
いる/ある; ～たい and ほしい; counters and numbers; plain forms for casual speech and inside sentences;
giving and receiving (あげる, くれる, もらう) at A2; potential, conditionals (～たら, ～ば), noun-modifying
clauses, keigo to recognise at B1. Explain the scripts briefly at the start, as en-ar does the vowel marks.
ja-en: *a/the*; plurals and countable nouns; the subject is always said; word order (SVO); *be*; perfect
and progressive tenses; prepositions; relative clauses after the noun; answers to negative questions
(*Yes, I do*); *l/r* as a pronunciation note.

**Chinese (zh, Mandarin, simplified)**. en-zh: no conjugation: word order is the grammar (subject, time,
place, verb, object); 是 for identity, adjectives with 很 (no 是); 吗 questions and question words in
place; measure words (个, 本, 杯…) with numbers and 这/那, early; 的; 有 (have, there is); 在 (location);
想/要 (want), 会/能/可以 (can); aspect, a spiral: 了 (done), 过 (ever), 在/着 (in progress); 不 vs 没;
comparison with 比; resultative and directional complements (A2); 把 and 被 (B1); 是…的. Tones and
pinyin as reading notes. zh-en: tense and verb forms (Chinese has none); third-person -s; plurals and
articles; *he/she* (the same sound in Chinese); *be* with adjectives (*She is tall*); time and place at
the end; relative clauses after the noun; prepositions.

**Russian (ru)**. en-ru: no "is" in the present; noun gender from the ending; the cases one at a time,
each with what it lets you do: prepositional (where? *в/на*, about), accusative (objects, where to?),
genitive (*у меня есть*, *нет* + genitive, quantities, whose), dative (*мне нравится*, age *мне 20 лет*),
instrumental (*с*, *работать кем*); verb conjugations; past tense (with gender); aspect (perfective and
imperfective), a spiral from A1; verbs of motion (*идти/ходить, ехать/ездить*); -ся verbs; adjective
agreement; numbers with cases. Stress marks in every example. ru-en: *a/the*; tenses (perfect,
progressive) and *do*; fixed word order (it does the work of cases); *there is/are*; *be* must be said;
prepositions; *th* and *w*.

**Italian (it)**. en-it: *essere/avere*; gender and articles (*il, lo, la, l', i, gli, le*); agreement;
present (-are, -ere, -ire) and *andare, fare, volere, potere*; *mi piace*; *c'è/ci sono*; prepositions
joined to articles (*nel, del*); passato prossimo with *essere/avere*, then imperfetto (a spiral);
reflexives; object pronouns and *ci/ne*; futuro; *vorrei* and the condizionale; congiuntivo (*penso che,
voglio che*) at A2–B1; imperative; *tu/Lei*. it-en: *do*; present perfect vs passato prossimo;
continuous; subject pronouns always said; adjective before the noun; generic nouns without *the*; -s;
*make/do*; phrasal verbs; *h* and *th*.

**Tagalog (tl, Manila)**. en-tl: *po/opo* politeness from day one; sentences with no "to be" (*Ako si
Maria*, *Guro siya*); the markers *ang/ng/sa* and *si/ni/kay* (a spiral: introduce them through what they
do); the three pronoun sets (*ako/ko/akin*); the linker *na/-ng*; *may/mayroon/wala*; verbs by aspect
(done, ongoing, coming) rather than tense; actor-focus verbs (*-um-, mag-*) first, object focus (*-in,
-an, i-*) after; *gusto/ayaw/kailangan* + verb; questions (*ba, sino, ano, saan, kailan*); the order of
little words (*ba, na, pa, din*); everyday Taglish is fine where natural. tl-en: tense (not aspect);
*he/she* (*siya* is both); *a/the*; plurals and -s; *be*; one word *sa* vs *in/on/at*; *do* in
questions; English word order (subject first).

**Portuguese (pt, Brazil, você)**. en-pt: *ser/estar*; gender and articles, and *no, na, do, da*; present
and *ir, ter, fazer, querer, poder*; *ter* also for "there is" (*tem*), as Brazilians say it; *gostar de*;
*ir* + infinitive for plans; *estar* + gerund; pretérito perfeito, then imperfeito (a spiral); object
pronouns as Brazilians place them; reflexives; subjunctive (*que, quando, se*) at A2–B1; *você* and *a
gente*. pt-en: as Spanish speakers (*do*, the subject always said, present perfect, continuous,
adjective order, *I'm 20*), plus false friends (*pretend, push, actually*) and final consonants.

**Catalan (ca, central)**. en-ca: *ser/estar* (not used like Spanish); gender and articles (*el, la, l',
els, les*; *en/na* with names); the weak pronouns (*em, et, el, hi, en*), a spiral: very Catalan, very
frequent; present; *m'agrada*; *hi ha*; the past with *anar* + infinitive (*vaig anar* "I went": a false
friend for Spanish speakers and a surprise for English ones); the perfet (*he menjat*) for today; imperfet;
future; *haver de* (must); subjunctive at A2–B1. ca-en: *do*; present perfect vs perfet; continuous;
word order; articles with generic nouns; phrasal verbs; pronunciation.

**Thai (th, Central)**. en-th: polite particles ครับ/ค่ะ (by the speaker's gender) from day one; pronouns
and dropping them; no conjugation; adjectives after the noun and used as verbs (no "is"); เป็น, คือ, อยู่
(three kinds of "be"); questions (ไหม, อะไร, ที่ไหน, ใคร, เมื่อไร); ไม่; classifiers (คน, ตัว, อัน,
ใบ…) with numbers and with นี้/นั้น; time words and the aspect markers แล้ว, กำลัง, จะ, เคย (a spiral);
อยาก/ต้องการ; ได้, เป็น, สามารถ (three kinds of "can"); verbs in a row (ไปซื้อ); กว่า, ที่สุด;
ให้ (give, let, make someone do) at A2; ที่ for relative clauses at B1. Tones as reading notes. th-en: tense
and verb forms; -s; plurals and *a/the*; *be* with adjectives; *he/she*; final consonants and clusters;
*do* in questions.

**German (de, Germany)**. en-de: the verb in second place, from the first sentence; *sein/haben*; gender,
articles and plurals; present; questions; nominative and accusative (objects) early; modal verbs
(*möchte, will, kann, muss*: the infinitive goes to the end) for doing things; separable verbs for
routines; Perfekt (*haben/sein* + participle) for the past in speech; dative (*mit, zu*, *mir gefällt*,
the two-way prepositions) at A2; subordinate clauses (*weil, dass, wenn*: verb last) at A2; adjective
endings a little at a time (B1); Präteritum of *sein, haben* and the modals; Konjunktiv II (*würde,
hätte, wäre, könnte*) for politeness and wishes; *du/Sie*. de-en: the progressive; present perfect vs
Perfekt (used very differently); *do*; SVO in every clause; *since/for*; false friends (*become, also,
actual*); *will* vs *wollen*; *th* and *w*.

**Persian (fa, Iranian, standard written)**. en-fa: verb at the end; the ezafe (-e) joining a noun to its
adjective or owner, early and often; "to be" (است and the personal endings); no gender; plurals (ها، ان);
را for a definite object; two stems per verb (past and present): learn both; present (می + stem + ending);
negation (ن); the subjunctive (ب) for want, can and must (*می‌خواهم بروم*, *می‌توانم*, *باید*); simple
past, present perfect, past progressive; compound verbs (*کار کردن، زنگ زدن*): a large part of everyday
Persian; possessive endings; که; the formal future to recognise. Note where speech differs from the written
standard, but write the standard. fa-en: *a/the*; tenses (progressive, perfect); SVO; prepositions; *he/she*
(او is both); vowels before *s* clusters (*street*, not *estreet*); *do* in questions.

**Hindi (hi)**. en-hi: verb at the end; postpositions (में, पर, से, को, का/की/के, with का agreeing with
what is owned); noun gender, which changes verbs and adjectives; है/हैं/हूँ; तू/तुम/आप respect from day one;
present habitual (-ता है), progressive (रहा है), simple past, then ने with transitive verbs in the past (a
spiral, A2); future (-गा/-गी); चाहना; सकना; चाहिए, पड़ना, होना (must); questions (क्या, कब, कहाँ); नहीं,
मत, न; subjunctive; compound verbs (कर लेना, चले जाना) and जो…वह at B1. hi-en: *a/the*; tenses (perfect,
progressive); SVO; prepositions before the noun; *he/she* (वह is both); plurals; *do* in questions; *v/w*.

**Korean (ko, polite 요 style)**. en-ko: verb at the end; 은/는 (topic) vs 이/가 (subject), coming back
often; 을/를; the polite 해요 style from day one (합니다 to recognise, 반말 at B1); 이에요/예요;
있어요/없어요 (have, there is); present -아요/-어요 (vowel harmony); 안/못; past -았/었어요; future
-(으)ㄹ 거예요; -고 싶어요; -(으)ㄹ 수 있어요; requests -(으)세요, -아/어 주세요; linking -고, -아서/어서,
-지만, -(으)니까; honorific -시-; particles 에, 에서, (으)로, 하고, 도, 만; two number systems and counters;
noun modifiers (-는/-(으)ㄴ/-(으)ㄹ) at A2–B1. ko-en: *a/the*; plurals; tense (perfect); SVO and the
subject always said; prepositions; relative clauses after the noun; answers to negative questions;
*f/p, l/r, th*.

**Cebuano / Bisaya (ceb, Cebu)**. en-ceb: sentences with no "to be" (*Maestra ko*); the markers *ang,
sa, si, ni, kang* (a spiral); the pronoun sets (*ako/nako/akong*); the linker *nga*; *naa/adunay/wala*;
verbs by aspect: done (*mi-, ni-*), coming (*mo-*), ongoing (*nag-, ga-*), actor focus first, object focus
(*-on, -i, -an*) after; *gusto/kinahanglan* + verb; questions (*asa, unsa, kinsa, kanus-a, pila*); the
little words *ba, na, pa, sab*. Bisaya as spoken in Cebu, in the spelling the basics course uses. ceb-en:
tense (not aspect); *he/she* (*siya* is both); *a/the*; plurals and -s; *be*; *in/on/at*; *do* in
questions; *f/v, p/b*.

**Arabic (ar)**. ar-en (the Arabic session): explanations in Modern Standard Arabic (clear, simple, as a
good teacher writes; vowel marks only where they help), for an Arabic speaker learning American English:
*a/the* (and where Arabic's الـ differs: *I like coffee*, not *I like the coffee*); *be* must be said
(*She is a doctor*); *do* in questions and negatives; present simple vs continuous; the past and the
present perfect; *p/b, v/f* and vowels as pronunciation notes; word order (adjective before the noun);
*it* for things (no gender); capital letters and left-to-right writing as reading notes.

## The English courses (`<lang>-en`): one spine, each with its own emphasis
Every English course covers, in an order that suits its learner: *be*; *a/the* and plurals; present
simple with *do*; present continuous; *can*; *there is/are*; *have (got)*; past simple (regular and
irregular); *going to* and *will*; comparatives and superlatives; present perfect (*ever, never, for,
since, just, yet*); *should, have to, must*; first and second conditionals; relative clauses (*who,
which, that*); *used to*; common phrasal verbs; the passive to recognise. The learner's own language
decides what needs most time and which mistakes to show (the starting points above), and the explanations
compare with their language, never with a third one.
