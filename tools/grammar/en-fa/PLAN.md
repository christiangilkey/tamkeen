# English → Persian grammar: the plan

Persian taught to an English speaker, explanations in English. The variety is the basics course's:
**Iranian Persian, standard written form** (what is written, read aloud and said in careful speech). Where
everyday speech says it differently (میرم for می‌روم, ـه for است, رو for را) a tip points it out, but every
example is the written standard.

## The reading (`r`)

Persian doesn't write most of its vowels (a, e, o), so every Persian sentence has a reading in Latin letters
that shows them. It is the basics course's romanisation (Tehran pronunciation), so a learner doing both sees
one system:

- **â** as in *father*, **a** as in *cat*, **e** as in *bed*, **o** as in *go*, **i** as in *see*,
  **u** as in *food*; **ey** as in *day*, **ow** as in *low*.
- **kh** and **gh** in the throat (خ, and ق/غ), **sh**, **ch**, **zh** (as in *measure*), **'** a catch in
  the voice (ع, ء). A doubled letter is held: *ammâ*, *bachche*.
- A **hyphen** where the Persian has a small gap inside a word (the zero-width joiner of *می‌روم*,
  *کتاب‌ها*, *خسته‌ام*): *mi-ravam*, *ketâb-hâ*, *khaste-am*; and before the **ezafe**, which Persian
  doesn't write: *ketâb-e khub*, *khâne-ye bozorg*.
- Readings are lower case, as in the other courses.

## Spelling

Persian letters (ی, ک, not the Arabic ي, ك); the zero-width non-joiner where the standard puts one
(می‌روم, نمی‌دانم, کتاب‌ها, خسته‌ام, رفته‌ام); the ezafe written only where the standard writes it:
ـهٔ after a silent h (خانهٔ من), ی after a long vowel (دانشجوی خوب). Persian punctuation (، ؟ «»).
`tests/js/grammar-fa.test.mjs` checks all of this.

## Order: why this one

Persian is easy where English speakers fear it (no gender, no articles to agree, regular endings, one
pattern for almost every tense) and hard in a few places they don't expect: **the verb comes last**, the
**ezafe** (the unwritten -e that joins a noun to everything that describes or owns it), **two stems per
verb**, **را** for a definite object, **the subjunctive** after *want, can, must*, and **compound verbs**
(most everyday actions are *noun + do/hit/give*). So:

1. The verb last and "to be" from the first sentence (lesson 1), the ezafe from lesson 3 and in nearly every
   lesson after it.
2. The personal endings once, with *have* (lesson 6), because every verb uses them.
3. The present tense as soon as the learner wants to go somewhere (lesson 11), then the system (two stems)
   and compound verbs, then را.
4. The subjunctive right after: *I want to go, I can, I must, let's* (unit 4), the most useful thing in
   Persian once you have the present.
5. The past, then the perfect and the imperfect (unit 5), then ways to connect ideas, then imagination.

About 40% A1 (lessons 1–19), 40% A2 (20–38), 20% B1 (39–48).

## Units and lessons

### Unit 1 · First conversations (A1)
| # | id | capability | grammar |
|---|---|---|---|
| 1 | say-who-you-are | Say hello and who you are | من/تو/شما; هستم، هستی، هستید، است; the verb last; اهلِ; formal شما; the script and its missing vowels |
| 2 | name-things | Point at things and name them | این/آن + است; چیست؟; نیست; no gender, no "the"; یک "a" |
| 3 | describe-things | Describe people and things | **the ezafe** (کتابِ خوب، خانهٔ بزرگ، دانشجوی خوب); ezafe vs "is" (کتابِ خوب / کتاب خوب است); خیلی; the short "am/are" (خسته‌ام) |
| 4 | say-whose-it-is | Say whose it is | ezafe with an owner (کیفِ سارا); the possessive endings ـَم، ـَت، ـَش، ـِمان، ـِتان، ـِشان |
| 5 | ask-questions | Ask questions | questions by the voice and آیا; question words where the answer goes (کجا، چه، کی، کِی، چند، چطور، چرا); کجاست، چیست |
| 6 | say-what-you-have | Say what you have | داشتن: دارم… ندارم; the personal endings of every verb; leaving out "I"; age (بیست سال دارم) |

### Unit 2 · Out and about (A1)
| # | id | capability | grammar |
|---|---|---|---|
| 7 | ask-for-what-you-want | Ask for what you want | می‌خواهم + a thing; the present prefix می‌; با / بدون; لطفاً |
| 8 | count-and-pay | Count, and ask what it costs | numbers; a noun stays singular after a number; plurals ـها and ـان; چند؟ چقدر؟ |
| 9 | say-where-things-are | Say where things are | در، به، از; روی، زیرِ، کنارِ، جلوی، پشتِ، بینِ (ezafe again) |
| 10 | say-what-there-is | Say what there is and isn't | هست / نیست; وجود دارد; هیچ … نیست; the indefinite ـی |
| 11 | say-where-you-are-going | Say where you're going, and how | the present tense of رفتن/آمدن (می‌روم، می‌آیم); the present stem; به + a place; با + transport |

### Unit 3 · Everyday life (A1)
| # | id | capability | grammar |
|---|---|---|---|
| 12 | say-what-you-do-every-day | Say what you do every day | the present tense of any verb; **the two stems** (infinitive, past stem, present stem); time words |
| 13 | say-what-you-dont-do | Say what you don't do, and how often | نمی‌; همیشه، معمولاً، گاهی، هیچ‌وقت + a negative verb |
| 14 | talk-about-work-and-study | Talk about work, study and calls | **compound verbs** (کار کردن، درس خواندن، زنگ زدن، صحبت کردن، گوش دادن) |
| 15 | say-which-one-you-mean | Say which thing you mean: را | the object; **را** after a definite object; مرا |
| 16 | say-what-you-like | Say what you like | دوست داشتن (+ را); از … خوشم می‌آید; علاقه داشتن به |
| 17 | say-when | Say when: times and days | ساعت چند است؟; days of the week; صبح‌ها; ordinal numbers |
| 18 | say-how-you-feel | Say how you feel | the short "be" again; سردم است، خوابم می‌آید (the possessive endings as "to me") |

### Unit 4 · Plans, wishes and abilities (A1–A2)
| # | id | capability | grammar | level |
|---|---|---|---|---|
| 19 | say-what-you-want-to-do | Say what you want to do | **the subjunctive** (بـ + present stem + ending): می‌خواهم بروم | A1 |
| 20 | say-what-you-can-do | Say what you can do, and ask if you may | توانستن + subjunctive; compound verbs in the subjunctive | A2 |
| 21 | say-what-you-must-do | Say what you have to do | باید / نباید + subjunctive; لازم است | A2 |
| 22 | suggest-and-invite | Suggest and invite | بیا / بیایید + subjunctive; برویم؟; شاید; چطور است؟ | A2 |
| 23 | tell-people-what-to-do | Ask and tell people to do things | the imperative (بنشین، بنشینید، نرو); بفرمایید; directions | A2 |
| 24 | talk-about-the-future | Talk about the future | the present for the future; قرار است + subjunctive; the formal future خواهم رفت (to recognise) | A2 |

### Unit 5 · Telling what happened (A2)
| # | id | capability | grammar |
|---|---|---|---|
| 25 | say-what-you-did | Say what you did | the simple past: past stem + endings (no ending for he/she); بودم، داشتم |
| 26 | ask-about-the-past | Ask what someone did, and say what you didn't | نـ + past; questions; compound verbs in the past; پیش "ago" |
| 27 | tell-a-story-in-order | Tell a story in order | اول، بعد، بعد از; وقتی + past; که "when (suddenly)" |
| 28 | say-what-you-have-done | Say what you have done | the present perfect (رفته‌ام); تا حالا، هنوز … نـ، تازه، هرگز; the participle |
| 29 | say-what-you-used-to-do | Say what you used to do | the imperfect (می‌ + past stem) for habits in the past |
| 30 | say-what-was-happening | Say what was happening | the imperfect for the background; داشتم می‌… که … |
| 31 | say-what-happened-to-you | Say what happened to you | شدن vs کردن (تمام شد / تمامش کردم، گم شد / گم کردم); becoming (خسته شدم) |

### Unit 6 · Comparing, health and people (A2)
| # | id | capability | grammar |
|---|---|---|---|
| 32 | compare-things | Compare things | ـتر از; ـترین before the noun; بهتر، بیشتر; مثلِ |
| 33 | say-what-hurts | Say what hurts | سرم درد می‌کند (possessive ending + compound verb); تب دارم; باید … (again) |
| 34 | say-how-long | Say how long and since when | دو سال است که + present; از … تا حالا; چند وقت است که …؟ |
| 35 | talk-about-people-and-things | Talk about people and things without naming them | او را، آن را; the endings on prepositions (برایش، به او); خودم |

### Unit 7 · Connecting your ideas (A2–B1)
| # | id | capability | grammar | level |
|---|---|---|---|---|
| 36 | give-reasons | Give reasons and say why | چون، برای اینکه، به خاطرِ، پس; برای اینکه + subjunctive (purpose) | A2 |
| 37 | say-what-you-think | Say what you think | فکر می‌کنم که…; به نظرِ من; موافقم / مخالفم; مطمئنم که… | A2 |
| 38 | say-which-person-or-thing | Say which person or thing you mean | relative clauses: ـی + که (کتابی که خریدم); را; the pronoun that stays | A2 |
| 39 | before-and-after | Say what happens before and after | قبل از اینکه + subjunctive; بعد از اینکه + past; تا + subjunctive | B1 |
| 40 | report-what-someone-said | Tell what someone said | گفت که + the tense they used; گفت که بیایم (a request); پرسید که آیا… | B1 |

### Unit 8 · Imagination, politeness and real speech (B1)
| # | id | capability | grammar |
|---|---|---|---|
| 41 | say-what-will-happen-if | Say what happens if… | اگر + subjunctive / past; the present in the result |
| 42 | imagine | Imagine: if I were… | اگر + imperfect / past, می‌ + past in the result; اگر جای تو بودم |
| 43 | hope-and-wish | Hope and wish | امیدوارم (که) + subjunctive; کاش + imperfect / past perfect |
| 44 | say-how-sure-you-are | Say how sure you are | شاید، ممکن است + subjunctive; باید "must be"; the perfect subjunctive (رفته باشد) |
| 45 | be-polite-the-persian-way | Be polite the Persian way | ta'ârof: بفرمایید، خواهش می‌کنم، قابلی ندارد; ایشان + plural verb; polite verbs (تشریف آوردن، میل کردن) |
| 46 | read-the-news | Read the news: things that are done | the passive (participle + شدن): ساخته شد، گفته می‌شود |
| 47 | follow-everyday-speech | Follow everyday spoken Persian | the spoken forms of the written standard (میرم، خونه، است → ـه، را → رو) |
| 48 | tell-your-story | Tell your story: past, present and future | every tense together |

## The spiral: where each big structure comes back

| structure | first | comes back for a harder job |
|---|---|---|
| verb last, "to be" | 1 | 2 (is not), 3 (short forms), 18 (feelings), 25 (was), 44 (must be) |
| ezafe | 3 | 4 (owners), 9 (places), 17 (times), 32 (مثلِ), 36 (به خاطرِ), 38 (with ـی + که) |
| possessive endings | 4 | 6, 18 (سردم است), 33 (سرم درد می‌کند), 35 (endings on words) |
| personal endings | 6 | 7, 11, 12, 19, 25 (no ending for he/she), 28 |
| present tense | 11 | 12 (the system), 13, 14, 24 (for the future), 34 (for "since") |
| two stems | 12 | 19 (subjunctive), 23 (imperative), 25 (past), 28, 29 |
| compound verbs | 14 | 16, 20 (subjunctive), 26 (past), 31 (شدن/کردن), 33 |
| را | 15 | 16, 26, 35 (او را), 38 (relative clauses) |
| subjunctive | 19 | 20–24, 36 (purpose), 39 (before), 40 (requests), 41 (if), 43 (hope), 44 |
| simple past | 25 | 26, 27 (stories), 40 (reported), 41 (if), 48 |
| imperfect | 29 | 30, 42 (imagined), 43 (wish) |
| questions | 5 | 7, 11, 26 (about the past), 28 (ever?), 40 (reported) |
| negation | 2 | 6, 13 (هیچ‌وقت), 21 (نباید), 23 (نرو), 26 (نرفتم), 28 (هنوز … نـ) |

From lesson 4 on every lesson has practice marked `from` an earlier lesson.
