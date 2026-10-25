# English → Japanese grammar course: the plan

Japanese taught to an English speaker, explanations in English, every Japanese piece with its rōmaji
(Hepburn). Standard Japanese, polite です/ます from the first lesson; plain (casual) forms from unit 5,
both for talking with friends and because so much grammar is built on them.

## How the order was chosen

- **Something to say in lesson 1.** "X は Y です" needs no verbs, so the first lessons are introductions,
  questions, pointing and shopping. The learner can say "I'm Sarah, I'm a student" and "Two of these,
  please" before meeting a single verb.
- **Verbs in ます form before anything else about verbs.** ます verbs don't change for person or number,
  so "I/you/she eat(s)" is one word: 食べます. Present, negative, past and "let's" are four endings of
  the same stem, learnt in unit 2 for daily life.
- **は and が come back again and again** (the hardest thing in Japanese for an English speaker): は in
  lesson 1 (the topic), が first with あります/います (12), then with 好き/上手/わかる (15), then a
  lesson of its own on "who did it?" and contrast (16), then inside "when" clauses (34) and inside
  clauses that describe a noun (38).
- **The て-form is taught from the ます form**, not from the dictionary form (飲みます → 飲んで), so it
  comes early (unit 4, still A1) and opens requests, permission, "-ing" and linking.
- **Plain forms in unit 5**, once the polite system is solid. The dictionary form is then the key to a
  run of A2 tools: ことができる, つもり, 前に, とき, と思う, から/ので, んです.
- **B1** (unit 8): clauses that describe nouns, the potential form, conditionals (たら, ば, なら),
  hearsay and guesses, the volitional, the passive, keigo to recognise, and telling a whole story.
- Words come mostly from the Japanese basics course (its 1000 commonest words).
- Scripts: lesson 1 explains the three scripts in a tip, as en-ar explains the vowel marks. Every example,
  goal, line of dialogue, model answer and `say` answer has its rōmaji `r`; pieces in explanations are
  written `{{日本語|nihongo}}`.

### Readings of the choices
A beginner can't pick a word they can't read, so every choice has its rōmaji (README, "Readings of the
choices"): `r` (with `___`) and `rs` on `fill`, `rs` on `order` and on dialogue replies, and
`{{日本語|reading}}` in `choice` options and in every Japanese piece of an explanation. Each mistake also
carries `rw` and `rr` (readings of `wrong` and `right`): not part of the format yet, so the app doesn't
show them, but they're ready if it does. Most `why` texts repeat the right sentence as `{{…|reading}}`.
`tests/js/grammar-ja.test.mjs` checks that all of these are there and are Latin letters.

### Rōmaji
Modified Hepburn: は/へ/を as particles are wa/e/o; long vowels with macrons (Tōkyō, kōhī, jū, okāsan,
onēsan), but い-long stays ii (oniisan, ii) and えい stays ei (sensei); ん before a vowel or y is n'
(hon'ya); small っ doubles (chotto, matte, itchō). Words are spaced, particles separate, ます endings joined
to their verb (tabemasu, tabete kudasai), sentences begin with a capital. Checked against the app's
tokenizer (kuromoji + IPADIC) with a script; every difference was looked at by hand.

## Units and lessons

Levels: lessons 1–19 A1, 20–37 A2, 38–47 B1 (40% / 38% / 21%).

### Unit 1: First conversations (A1)
| # | id | capability | grammar |
|---|---|---|---|
| 1 | introduce-yourself | Say hello and who you are | X は Y です; leaving out 私は; ～さん (never for yourself); ～人 (nationality); the scripts |
| 2 | ask-yes-no-questions | Ask yes-or-no questions and say "not" | ～ですか; はい / いいえ; ～じゃありません; も "too" |
| 3 | ask-what-it-is | Point at things and ask what they are | これ / それ / あれ / どれ; 何; の (my, of, from) ; だれの |
| 4 | buy-things | Ask for things and how much they cost | この / その / あの + noun; ～をください; いくら; numbers and 円; ～つ; と "and" |

### Unit 2: Your day (A1)
| # | id | capability | grammar |
|---|---|---|---|
| 5 | say-what-you-do | Say what you do, and what you don't | verbs in ます / ません; を; the verb at the end; present = habits and the future |
| 6 | say-where-you-go | Say where you're going, when and how | 行きます / 来ます / 帰ります; へ / に (where to); に with clock times and days; で (by bus) |
| 7 | talk-about-your-day | Talk about your daily routine | で (where you do something); と (with someone); から / まで; time words without に |
| 8 | say-what-you-did | Say what you did yesterday | ました / ませんでした; 何も / どこへも + not |
| 9 | invite-someone | Invite someone and make plans together | ～ませんか; ～ましょう; ～ましょうか; turning down politely (ちょっと…) |

### Unit 3: Describing things, likes and wants (A1)
| # | id | capability | grammar |
|---|---|---|---|
| 10 | describe-things | Describe people, places and things | い- and な-adjectives, before a noun and with です; their negatives; とても / あまり |
| 11 | say-how-it-was | Say how something was | adjectives in the past (かったです, でした) and their negatives; nouns in the past; いい → よかった |
| 12 | say-where-things-are | Say what is where | あります / います; ～に～があります; ～は～にあります; position words (上, 中, 前, 隣…); が first met |
| 13 | count-things | Count people and things | counters: ～人, ～つ, ～枚, ～本, ～匹; 何人 / いくつ; the number after the particle |
| 14 | say-what-you-want | Say what you want and want to do | ～たいです / たくないです; ほしいです; stem + に行きます (to go and do) |
| 15 | say-what-you-like | Say what you like and what you're good at | 好き / 嫌い / 上手 / 下手 + が; ～がわかります; どんな |
| 16 | who-and-which | Ask who did it, and contrast two things | question word + が (誰が…); answering with が; は for contrast; ～が、… "but" |

### Unit 4: Getting things done (A1 → A2)
| # | id | capability | grammar |
|---|---|---|---|
| 17 | ask-politely | Ask someone to do something | the て-form from the ます form; the three verb groups; ～てください |
| 18 | ask-permission | Ask if you may, and say what's not allowed | ～てもいいですか; ～てはいけません |
| 19 | say-whats-happening | Say what's happening now, and how things are | ～ています: in progress, and states (住んでいます, 結婚しています, 知っています / 知りません) |
| 20 | link-actions | Tell what you do, step by step (A2) | ～て、～て; ～てから; adjectives joined with くて / で |

### Unit 5: Talking with friends (A2)
| # | id | capability | grammar |
|---|---|---|---|
| 21 | talk-casually | Talk casually with friends | plain present: the dictionary form, ない form, だ; questions without か; うん / ううん |
| 22 | chat-about-the-past | Chat casually about what happened | plain past: た / なかった (made from the て-form); だった; かった |
| 23 | say-what-you-think | Say what you think, and what someone said | plain form + と思います; ～と言っていました |
| 24 | give-reasons | Say why | から / ので; どうして / なんで; だから |
| 25 | explain-situations | Explain what's going on, and ask | ～んです / ～んですか; どうしたんですか; ～んですが、… to open a request |

### Unit 6: Plans, abilities and experiences (A2)
| # | id | capability | grammar |
|---|---|---|---|
| 26 | say-what-you-can-do | Say what you can do | dictionary form + ことができます; 趣味は～ことです |
| 27 | talk-about-plans | Talk about your plans | ～つもりです; ～予定です; dictionary form + 前に; た + 後で |
| 28 | talk-about-experiences | Say what you have (never) done | ～たことがあります; 一度も～ません |
| 29 | talk-about-weekends | Give examples of what you do | ～たり～たりします |
| 30 | compare | Compare things and pick the best | AはBより; ～のほうが; ～の中で～が一番; どちら / どれ |
| 31 | say-how-things-change | Say how things change, and choose | ～くなります / ～になります; ～にします (I'll have…) |

### Unit 7: Rules, advice and help (A2)
| # | id | capability | grammar |
|---|---|---|---|
| 32 | say-what-you-must | Say what you must and needn't do | ～なければなりません / ～なきゃ; ～なくてもいいです |
| 33 | give-advice | Give advice | ～たほうがいいです / ～ないほうがいいです; ～ないでください |
| 34 | say-when | Say when things happen | plain form + とき; 子供のとき; 行くとき / 行ったとき |
| 35 | give-directions | Give and follow directions | ～と (whenever / as soon as: まっすぐ行くと…); を for a route; に曲がる |
| 36 | give-and-receive | Talk about giving and getting presents | あげます / くれます / もらいます |
| 37 | ask-for-favors | Ask for and talk about favours | ～てあげます / ～てくれます / ～てもらいます; ～てくれませんか / ～てもらえませんか |

### Unit 8: Describing, imagining and polite Japanese (B1)
| # | id | capability | grammar |
|---|---|---|---|
| 38 | describe-with-clauses | Describe people and things in detail | clauses before the noun: 昨日見た映画, 眼鏡をかけている人; が inside them |
| 39 | say-what-you-are-able-to-do | Say what you can do, the short way | the potential form (話せる, 食べられる, 来られる, できる); が with it |
| 40 | say-what-if | Say what will happen if… | ～たら; ～たらどうですか |
| 41 | give-conditions | Give conditions and recommendations | ～ば; ～なら |
| 42 | guess | Guess, and say how things look | ～そうです (looks…); ～でしょう; ～かもしれません |
| 43 | pass-on-news | Pass on what you've heard | ～そうです (I hear); ～って; ～らしいです |
| 44 | say-your-intentions | Say what you're thinking of doing | the volitional (行こう, 食べよう); ～ようと思っています |
| 45 | say-what-happened-to-you | Say what happened to you | the passive (盗まれました, 雨に降られました, ほめられました) |
| 46 | understand-polite-japanese | Understand polite Japanese in shops and offices | keigo to recognise: いらっしゃいませ, お待ちください, ～でございます, 召し上がる, 申します, いただきます |
| 47 | tell-a-story | Tell a story, and what went wrong | ～てしまいました; putting it together: past, て, とき, たら, から |

## The spiral: where each big structure comes back
| structure | first | comes back in |
|---|---|---|
| は (topic) and が | 1 (は), 12 (が: there is) | 15 (好き が), 16 (who? / contrast), 34 (inside とき), 38 (inside noun clauses), 39 (potential が), 45 (passive に) |
| です / ます | 1, 5 | 8 (past), 9 (let's), 21 (plain beside polite), 46 (keigo) |
| questions | 2 (か) | 3 (何), 6 (何時), 8 (何も), 16 (誰が), 21 (casual, no か), 24 (どうして), 25 (んですか) |
| asking for things | 4 (をください) | 17 (てください), 18 (てもいい), 25 (んですが), 33 (ないでください), 37 (てくれませんか), 46 (お～ください) |
| the past | 8 (ました) | 11 (adjectives), 22 (plain past), 28 (たことがある), 29 (たり), 34 (たとき), 40 (たら), 47 (a story) |
| adjectives | 10 | 11 (past), 14 (たい / ほしい work like い-adjectives), 20 (くて / で), 31 (くなる), 42 (そう) |
| the て-form | 17 | 18, 19, 20, 22 (た from て), 37 (てくれる), 47 (てしまう) |
| wanting and plans | 4 (ください), 14 (たい) | 27 (つもり), 44 (volitional) |
| ability | 15 (上手, わかる) | 26 (ことができる), 39 (potential) |
| reasons | 24 (から / ので) | 25 (んです), 47 |
| particles | 3 (の), 5 (を), 6 (へ / に / で) | 7 (で / と / から / まで), 12 (に for place), 35 (を for a route), 36 (に for the receiver) |

From lesson 4 on, every lesson has practice marked `from` an earlier lesson.
