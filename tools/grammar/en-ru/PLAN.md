# English → Russian: the plan

Russian taught to an English speaker, explained in English, from zero to everyday conversation (A2,
touching B1). Standard Russian as spoken in Moscow, the variety of the Russian basics course. Every
Russian example is in Cyrillic with **stress marks** (an acute accent on the stressed vowel of every word of
two or more syllables; ё is always stressed, so it carries no mark) and a reading in Latin letters.

## How the course is built

- **Capabilities first.** Each lesson is something the learner can do ("Say where you live"), and its
  grammar is the tool for it ("the prepositional case with в and на").
- **The six cases one at a time**, each arriving with the job it does, and each coming back for harder
  jobs: prepositional (where? about what?), accusative (objects, where to?), genitive (have / don't have,
  how many, whose, from where), dative (to whom, likes, age, need), instrumental (with whom, as what).
  Some forms arrive first as fixed chunks (меня́ зову́т, у меня́ есть, мне два́дцать лет, мне на́до) and
  are explained when their case is taught: the learner can say them long before they can analyse them.
- **Aspect is a spiral**: the past without aspect (A1: what you did), then finished vs not finished in the
  past, the perfective future (promises), aspect in requests, in advice (нельзя́), in telling a story, in
  habits, and in prefixed verbs of motion.
- **Verbs of motion as a spiral**: going now (иду́/е́ду + куда́), round trips and habits (ходи́ть/е́здить),
  getting around (from where, by what), setting off and arriving (пойти́, прийти́, уйти́…).
- Grammar words (`term`) are defined once, the first time they are needed.
- The words come mostly from the Russian basics course (its 1000 commonest words).

## Readings and spelling (checked by `tests/js/grammar-ru.test.mjs`)

- `t` in Cyrillic, with ё always written and the stress marked with U+0301 on every word of two or more
  syllables. One-syllable words carry no mark (except не́ in не́ был, не́ было, where the stress moves to
  не).
- `r` (and the reading of every `{{…}}` piece, and the readings of the choices a learner taps: `r` and
  `rs` on `fill`, `rs` on `order` and on dialogue replies) is made from `t` by `tools/grammar/en-ru/readings.mjs`
  (`node tools/grammar/en-ru/readings.mjs` fills them all in): a simple Latin transliteration (ж zh, х kh,
  ц ts, ч ch, ш sh, щ shch, ы y, й y, ь ', е → ye at the start of a word and after a vowel), with the
  stress marked, and the few words that aren't said as they're spelled said as they are: что "shto",
  г in -ого/-его "v" (его́ "yevó"), -тся/-ться "tsa", коне́чно "konéshno", сего́дня "sevódnya",
  здра́вствуйте "zdrástvuyte" and a handful more. Unstressed о said as a (молоко́) is taught once, in a
  tip, not spelled out in every reading.
- The test also checks that no word mixes Latin and Cyrillic letters (a Latin "o" inside a Russian word
  looks the same but breaks the voice and the search).

## Units and lessons (50: 20 A1, 21 A2, 9 B1)

| # | id | Capability (title) | Grammar | Level |
|---|---|---|---|---|
| **1** | | **First conversations** | | |
| 1 | say-who-you-are | Say hello and who you are | no "am/is/are" in the present; я, ты, вы (ты or вы?); меня́ зову́т as a chunk; questions by intonation | A1 |
| 2 | whats-this | Ask "What's this?" and "Who's this?" | э́то "this is"; кто / что; не; да / нет; а "and, but" | A1 |
| 3 | ask-for-things | Ask for what you want | хочу́ / хоти́те, мо́жно…?, пожа́луйста; the thing you want: -а → -у (во́ду) | A1 |
| 4 | where-is-it | Ask where things are | gender from the ending: он / она́ / оно́; мой / моя́ / моё; где? вот | A1 |
| 5 | describe-things | Say what things are like | adjectives agree: -ый / -ая / -ое (and -ий, -ой); како́й? | A1 |
| 6 | more-than-one | Talk about more than one | plurals -ы / -и / -а; они́; мои́, но́вые; the spelling rule after к, г, х, ж, ш, ч, щ | A1 |
| **2** | | **Your everyday life** | | |
| 7 | say-what-you-do | Say what you do | verbs in the present: the -ешь pattern (рабо́тать, чита́ть, знать, де́лать) | A1 |
| 8 | speak-languages | Say which languages you speak | the -ишь pattern (говори́ть, смотре́ть, люби́ть: люблю́); по-ру́сски vs ру́сский язы́к | A1 |
| 9 | say-where-you-live | Say where you live and work | prepositional case with в / на (где?); жить: живу́, живёшь | A1 |
| 10 | say-what-you-like | Say what you like and what you're doing | accusative of things: -у / -ю, adjectives -ую; люблю́ + infinitive | A1 |
| 11 | people-you-know | Talk about people you know | accusative of people (бра́та, А́нну); меня́, тебя́, его́, её…; меня́ зову́т explained | A1 |
| 12 | say-what-you-did | Say what you did yesterday | past tense: -л / -ла / -ло / -ли, by the speaker's gender; был / была́ | A1 |
| **3** | | **Having, counting and time** | | |
| 13 | say-what-you-have | Say what you have | у меня́ есть; у тебя́, у него́, у неё… (н- after у) | A1 |
| 14 | say-what-isnt-there | Say what you don't have, and what isn't there | нет + genitive singular (-а / -я, -ы / -и); нет вре́мени | A1 |
| 15 | ask-the-price | Ask what things cost | numbers; ско́лько сто́ит / сто́ят; 1 рубль, 2–4 рубля́, 5+ рубле́й | A1 |
| 16 | your-family-and-age | Talk about your family and your age | мне два́дцать лет (мне, тебе́, ему́, ей… as chunks); год / го́да / лет | A1 |
| 17 | tell-the-time | Say what time and which day | Кото́рый час? в два часа́; в + day (в сре́ду); у́тром, ве́чером | A1 |
| **4** | | **Plans and getting things done** | | |
| 18 | say-where-youre-going | Say where you're going | идти́ / е́хать (now) + в / на + accusative: куда́? vs где?; домо́й | A1 |
| 19 | can-and-must | Say what you can, may and must do | мочь, уме́ть; мо́жно, нельзя́; мне на́до / ну́жно + infinitive | A1 |
| 20 | say-what-youll-do | Say what you're going to do | future with бу́ду + infinitive; бу́дет | A1 |
| 21 | say-what-youve-done | Say what you've done and finished | aspect: imperfective and perfective in the past (чита́л / прочита́л) | A2 |
| 22 | promise-to-do | Promise and offer to do things | perfective future (позвоню́, куплю́, сде́лаю) vs бу́ду + imperfective | A2 |
| 23 | ask-someone-to-do | Ask someone to do something | imperative (-й / -и / -ь, -те); aspect in requests; дава́й(те) | A2 |
| **5** | | **You and other people** | | |
| 24 | give-and-tell | Give, send and tell things to people | dative case (кому́?): -у / -ю, -е, -и; мне, тебе́, ему́… | A2 |
| 25 | likes-and-needs | Say what you like, need and feel | нра́вится / нра́вятся; ну́жен / нужна́ / ну́жно / нужны́; мне хо́лодно, ску́чно | A2 |
| 26 | talk-about-things | Say what something is about | о + prepositional; обо мне, о нём, о ней; ду́мать о, говори́ть о | A2 |
| 27 | with-whom | Say who you're with | instrumental case with с: -ом / -ой / -ью; со мной, с ним…; мы с дру́гом | A2 |
| 28 | jobs-and-hobbies | Talk about your job and your hobbies | instrumental without с: рабо́тать врачо́м, стать, занима́ться спо́ртом | A2 |
| **6** | | **Out and about** | | |
| 29 | go-and-come-back | Talk about trips and habits | идти́ / ходи́ть, е́хать / е́здить: one way now vs there and back, often | A2 |
| 30 | get-around-town | Get around town: from, to and by | на авто́бусе, пешко́м; отку́да? из / с + genitive; к + dative | A2 |
| 31 | count-things | Count things | numbers with nouns: genitive plural (-ов, -ей, no ending); мно́го, ма́ло, не́сколько | A2 |
| 32 | whose-and-how-much | Say whose it is, and ask for amounts | genitive for "of": маши́на бра́та, буты́лка воды́; без, для, по́сле, до, о́коло | A2 |
| 33 | daily-routine | Describe your daily routine | -ся verbs (просыпа́ться, одева́ться, учи́ться); -ся / -сь | A2 |
| 34 | dates-and-plans | Talk about dates and birthdays | ordinal numbers; пя́того ма́я; в ма́е, в две ты́сячи деся́том году́; через / наза́д | A2 |
| **7** | | **Reasons, comparisons and stories** | | |
| 35 | compare-things | Compare things | comparatives (-ее, лу́чше, бо́льше…), чем, гора́здо; са́мый | A2 |
| 36 | describe-people | Describe people | у неё дли́нные во́лосы; short adjectives: рад, за́нят, гото́в, бо́лен, похо́ж на | A2 |
| 37 | give-advice | Give advice and say what must be done | до́лжен / должна́ / должны́; сто́ит, лу́чше + infinitive; нельзя́ + aspect | A2 |
| 38 | say-why | Say why | почему́? потому́ что, поэ́тому, так как; из-за + genitive | A2 |
| 39 | if-and-when | Say what will happen if… | е́сли / когда́ + future (where English uses the present) | A2 |
| 40 | never-and-nobody | Talk about experiences: ever and never | никогда́ не, никто́ не, ничего́ не (double negatives); когда́-нибудь | A2 |
| 41 | tell-what-happened | Tell what happened, in order | aspect in a story: perfective for the events, imperfective for the background; снача́ла, пото́м, вдруг | A2 |
| **8** | | **Connecting your ideas** | | |
| 42 | come-and-leave | Arrive, leave, go in and out | prefixed verbs of motion: при-, у-, в-, вы-, пере-, за-, до- (прийти́ / приходи́ть) | B1 |
| 43 | which-who | Say which one you mean | кото́рый: gender from the noun, case from its own clause | B1 |
| 44 | report-what-was-said | Pass on what someone said or asked | сказа́л, что…; спроси́л, где… / спроси́л, + ли; no change of tense | B1 |
| 45 | so-that | Say what for, and what you want others to do | что́бы + infinitive / что́бы + past (хочу́, что́бы ты пришёл) | B1 |
| 46 | give-your-opinion | Give your opinion, agree and disagree | по-мо́ему, мне ка́жется, я счита́ю, что…; я согла́сен / согла́сна с (instrumental) | B1 |
| **9** | | **Stories and imagination** | | |
| 47 | groups-of-people | Talk about groups of people and things | plural of the other cases: -ам, -ами, -ах (and -ых, -ым, -ыми) | B1 |
| 48 | myself-and-my-own | Say "my own" and "myself" | свой vs его́ / её; себя́ (себе́, собо́й) | B1 |
| 49 | imagine-and-wish | Imagine, wish and ask very politely | бы + past: е́сли бы…, я бы хоте́л, не могли́ бы вы…? | B1 |
| 50 | tell-a-story | Tell a story | everything together: aspect, когда́ / пока́ / как то́лько, motion verbs, reported speech | B1 |

## The spiral: where each big structure comes back

| Structure | First | Comes back in |
|---|---|---|
| no "is"; э́то | say-who-you-are, whats-this | describe-things (Дом большо́й), where-is-it, say-what-you-did (the past has был) |
| gender | where-is-it | describe-things, say-what-you-did (past by gender), likes-and-needs (ну́жен / нужна́), which-who (кото́рый) |
| prepositional | say-where-you-live | talk-about-things (о), get-around-town (на авто́бусе), dates-and-plans (в ма́е), groups-of-people (-ах) |
| accusative | ask-for-things (-у) | say-what-you-like, people-you-know, tell-the-time (в сре́ду), say-where-youre-going (куда́), dates-and-plans (через неде́лю), describe-people (похо́ж на) |
| genitive | say-what-you-have (у меня́), say-what-isnt-there | ask-the-price, your-family-and-age (лет), count-things, whose-and-how-much, get-around-town (из / с), compare-things (бо́льше Москвы́), say-why (из-за) |
| dative | your-family-and-age (мне… лет), can-and-must (мне на́до) | give-and-tell, likes-and-needs, get-around-town (к), give-advice (тебе́ сто́ит), groups-of-people (-ам) |
| instrumental | with-whom | jobs-and-hobbies, give-your-opinion (согла́сен с), groups-of-people (-ами), myself-and-my-own (с собо́й) |
| verbs: present | say-what-you-do, speak-languages | say-where-you-live (жить), can-and-must (мочь), daily-routine (-ся) |
| past | say-what-you-did | say-what-youve-done, go-and-come-back (ходи́л = went and came back), tell-what-happened, report-what-was-said, imagine-and-wish (бы + past), tell-a-story |
| aspect | say-what-youve-done | promise-to-do, ask-someone-to-do, give-advice, if-and-when, tell-what-happened, come-and-leave, tell-a-story |
| future | say-what-youll-do (бу́ду) | promise-to-do, if-and-when, dates-and-plans |
| motion | say-where-youre-going | go-and-come-back, get-around-town, come-and-leave, tell-a-story |
| хоте́ть | ask-for-things | say-what-you-like, so-that (хочу́, что́бы), imagine-and-wish (я бы хоте́л) |
| questions | say-who-you-are (intonation), whats-this (кто, что) | where-is-it (где), say-where-youre-going (куда́), get-around-town (отку́да), say-why (почему́), report-what-was-said (ли) |
| numbers | ask-the-price | your-family-and-age, tell-the-time, count-things, dates-and-plans |
