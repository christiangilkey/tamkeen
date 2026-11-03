# Iraqi basics: the evidence for every word

Made by `tools/course/ar-irq/make.mjs` from `list.tsv`; the method is in `README.md`. For each word:

- **Uses**: how often it is used per million words in 3.67 million words of real Iraqi text (the Iraqi Arabic Dialect Corpus: Iraqis' YouTube comments and Telegram messages), and its **rank** among every spelling in those texts.
- **Dictionary**: what a published dictionary says it means (Wiktionary's Iraqi Arabic entry, or the Living Arabic Project's Iraqi dictionary, linked). The meaning taught is one of these senses.
- **Standard Arabic**: what Wiktionary's Standard Arabic entry spelled the same says, if there is one. It never gives the meaning taught (that would make it a Standard Arabic word, which the course leaves out); the note in the app says how they differ.
- Real sentences that use each word are in `evidence.json` (made by `tools/course/dialect/evidence.mjs irq`).

## 1. بَسّ (adv): only, just; but

- Uses: 11729.5 per million (43076 times), rank 2. Forms counted: بس
- Dictionary: [Wiktionary (Iraqi Arabic), “بس”](https://en.wiktionary.org/wiki/%D8%A8%D8%B3#Iraqi_Arabic): “only, just”
- Dictionary: [Wiktionary (Iraqi Arabic), “بس”](https://en.wiktionary.org/wiki/%D8%A8%D8%B3#Iraqi_Arabic): “except, but”
- Dictionary: [Wiktionary (Iraqi Arabic), “بس”](https://en.wiktionary.org/wiki/%D8%A8%D8%B3#Iraqi_Arabic): “but, though”
- Dictionary: [Wiktionary (Iraqi Arabic), “بس”](https://en.wiktionary.org/wiki/%D8%A8%D8%B3#Iraqi_Arabic): “as soon as, once”
- Dictionary: [Wiktionary (Iraqi Arabic), “بس”](https://en.wiktionary.org/wiki/%D8%A8%D8%B3#Iraqi_Arabic): “stop!, enough!”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَسّ”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%B3&dc%5B%5D=5&st%5B%5D=1): “only, just”
- Standard Arabic: “بس (verb): (transitive) to crush”; “بس (noun): cat”
- Note in the app: Not MSA بَسَّ (to crush).
- Sentence: أَرِيد بَسّ چَاي. — I just want tea.

## 2. مُو (particle): not (before a noun, an adjective or a place)

- Uses: 6871.2 per million (25234 times), rank 7. Forms counted: مو
- Dictionary: [Wiktionary (Iraqi Arabic), “مو”](https://en.wiktionary.org/wiki/%D9%85%D9%88#Iraqi_Arabic): “not”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مُو”](https://www.livingarabic.com/en/search?q=%D9%85%D9%88&dc%5B%5D=5&st%5B%5D=1): “not, no (particle of negation, commonly said to be for nouns. However, this can negate verbs and nouns. More specifically, it seems to negate full statements or predicates and can act as negative imperative / prohibitive marker.)”
- Standard Arabic: “مو (noun): meu, baldmoney (Meum athamanticum)”
- Note in the app: Not MSA مُو (a plant). MSA says لَيْسَ.
- Sentence: هَذَا مُو بَيْتِي. — This is not my house.

## 3. هَاي (pron): this (for a feminine word)

- Uses: 6357.1 per million (23346 times), rank 9. Forms counted: هاي هايه
- Dictionary: [Wiktionary (Iraqi Arabic), “هاي”](https://en.wiktionary.org/wiki/%D9%87%D8%A7%D9%8A#Iraqi_Arabic): “feminine of هذا (hāḏa): this”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هَاي بِنْتِي. — This is my daughter.

## 4. شِنُو (pron): what?

- Uses: 5514 per million (20250 times), rank 12. Forms counted: شنو شني اشنو
- Dictionary: [Wiktionary (Iraqi Arabic), “شنو”](https://en.wiktionary.org/wiki/%D8%B4%D9%86%D9%88#Iraqi_Arabic): “what?”
- Dictionary: [Wiktionary (Iraqi Arabic), “شني”](https://en.wiktionary.org/wiki/%D8%B4%D9%86%D9%8A#Iraqi_Arabic): “what?”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شِنُو”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%86%D9%88&dc%5B%5D=5&st%5B%5D=1): “what? what's this? what do you mean? (interrogative pronoun) (often shortened to شْ and prefixed onto a word; if the following word starts with two consonants it becomes شِ to avoid a consonant cluster);”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شِنُو / شِنِي / شِنْهِي / شِنْهُو / شِنْهَو”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%86%D9%88&dc%5B%5D=5&st%5B%5D=1): “what? what is? (shinhu, shinhi) (interrogative, precedes a noun)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شِنُو اسْمَك؟ — What's your name?

## 5. هِيچ (adv): like this, like that, so

- Uses: 4028.7 per million (14795 times), rank 17. Forms counted: هيچ هيج هيچي هيجي
- Dictionary: [Wiktionary (Iraqi Arabic), “هيچ”](https://en.wiktionary.org/wiki/%D9%87%D9%8A%DA%86#Iraqi_Arabic): “thus, so”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هِيْكِي / هِيْچِي / هِيْك / هِيْچ”](https://www.livingarabic.com/en/search?q=%D9%87%D9%8A%D8%AC&dc%5B%5D=5&st%5B%5D=1): “such, this, that, this kind of, that kind of, like this (hiichi)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لَيْش تِحْچِي هِيچ؟ — Why are you talking like that?

## 6. كُلِّش (adv): very

- Uses: 3700.5 per million (13590 times), rank 18. Forms counted: كلش كولش
- Dictionary: [Wiktionary (Iraqi Arabic), “كلش”](https://en.wiktionary.org/wiki/%D9%83%D9%84%D8%B4#Iraqi_Arabic): “very”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “كُلّْشِ / كُلّْشِي”](https://www.livingarabic.com/en/search?q=%D9%83%D9%84%D8%B4&dc%5B%5D=5&st%5B%5D=1): “كُلّْ شِي = كُلّْ شِ : everything (showing different ways of writing it. the vowel on the ش can be short or long, like /∫i/ or /∫ii/) (note there is also a separate word in Iraqi as كُلِّش”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “كُلِّش”](https://www.livingarabic.com/en/search?q=%D9%83%D9%84%D8%B4&dc%5B%5D=5&st%5B%5D=1): “very much (adverb)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “كُلِّش / كِلِّش”](https://www.livingarabic.com/en/search?q=%D9%83%D9%84%D8%B4&dc%5B%5D=5&st%5B%5D=1): “very, extremely, highly (adverb) (note: often comes before the word it modifies.) (the form كُلِّش”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْأَكِل كُلِّش طَيِّب. — The food is very tasty.

## 7. هَسَّه (adv): now; just now

- Uses: 3576.9 per million (13136 times), rank 19. Forms counted: هسه هسا هسع
- Dictionary: [Wiktionary (Iraqi Arabic), “هسة”](https://en.wiktionary.org/wiki/%D9%87%D8%B3%D8%A9#Iraqi_Arabic): “now, by now, just”
- Dictionary: [Wiktionary (Iraqi Arabic), “هسه”](https://en.wiktionary.org/wiki/%D9%87%D8%B3%D9%87#Iraqi_Arabic): “alternative spelling of هسة (hassa)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَسَّا / هَسَّه / هَسَّة / هِسَّا”](https://www.livingarabic.com/en/search?q=%D9%87%D8%B3%D9%87&dc%5B%5D=5&st%5B%5D=1): “now, just now, right now, right this moment (hassa / hissa)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَسَّا / هِسَّه”](https://www.livingarabic.com/en/search?q=%D9%87%D8%B3%D9%87&dc%5B%5D=5&st%5B%5D=1): “right away, in just a moment, soon”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَسَّا / هِسَّه”](https://www.livingarabic.com/en/search?q=%D9%87%D8%B3%D9%87&dc%5B%5D=5&st%5B%5D=1): “just this moment, just a moment ago”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَسَّا / هِسَّه”](https://www.livingarabic.com/en/search?q=%D9%87%D8%B3%D9%87&dc%5B%5D=5&st%5B%5D=1): “لِهَسَّا / إِلَى هَسَّا : up to now, until this moment,”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وَيْنَك هَسَّه؟ — Where are you now?

## 8. لَيْش (adv): why?

- Uses: 3568.7 per million (13106 times), rank 20. Forms counted: ليش
- Dictionary: [Living Arabic Project, Iraqi dictionary, “لَيْش / لُوَيْش / إِلْوَيْش ¦ لَيْش / اِلْوَيْش / لُوَيْش”](https://www.livingarabic.com/en/search?q=%D9%84%D9%8A%D8%B4&dc%5B%5D=5&st%5B%5D=1): “why, for what reason, what for”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لَيْش مَا جِيت؟ — Why didn't you come?

## 9. وِيَّا (prep): with

- Uses: 2970.5 per million (10909 times), rank 26. Forms counted: ويا وياك وياي وياه وياها ويانا ويانه وياكم وياهم وياج
- Dictionary: [Living Arabic Project, Iraqi dictionary, “وِيَّا”](https://www.livingarabic.com/en/search?q=%D9%88%D9%8A%D8%A7&dc%5B%5D=5&st%5B%5D=1): “with (note conjugation: وِيَّايَ , with me وِيَّانَا : with us)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “وِيَّا”](https://www.livingarabic.com/en/search?q=%D9%88%D9%8A%D8%A7&dc%5B%5D=5&st%5B%5D=1): “with (same as مَع, but more common in the Iraqi dialect); (should be negated with مُو ) (note conjugation: وِيَّايَ , with me وِيَّانَا : with us)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: تِجِي وِيَّاي لِلسُّوگ؟ — Will you come to the market with me?

## 10. شَاف (verb): to see

- Uses: 2970 per million (10907 times), rank 27. Forms counted: شاف شافت شفت شافو شافوا يشوف تشوف اشوف نشوف شوف شوفي شوفو يشوفون تشوفين
- Dictionary: [Wiktionary (Iraqi Arabic), “شاف”](https://en.wiktionary.org/wiki/%D8%B4%D8%A7%D9%81#Iraqi_Arabic): “to see”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شَاْف، يْشُوْف، شَوْف”](https://www.livingarabic.com/en/search?q=%D8%B4%D8%A7%D9%81&dc%5B%5D=5&st%5B%5D=1): “to see, look at (ه = s.th.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شَاْف، يْشُوْف، شَوْف”](https://www.livingarabic.com/en/search?q=%D8%B4%D8%A7%D9%81&dc%5B%5D=5&st%5B%5D=1): “to see, notice”
- Standard Arabic: “شاف (verb): to look down at; to view”
- Note in the app: In MSA شافَ only means “to look down at”.
- Sentence: شِفِت أَخُوك الْبَارْحَة. — I saw your brother yesterday.

## 11. أَكُو (particle): there is, there are

- Uses: 2691.1 per million (9883 times), rank 31. Forms counted: اكو
- Dictionary: [Wiktionary (Iraqi Arabic), “أكو”](https://en.wiktionary.org/wiki/%D8%A3%D9%83%D9%88#Iraqi_Arabic): “there is”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “أَكُو”](https://www.livingarabic.com/en/search?q=%D8%A7%D9%83%D9%88&dc%5B%5D=5&st%5B%5D=1): “there is, there are”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أَكُو مَطْعَم زَيْن هْنَا. — There's a good restaurant here.

## 12. شْگَدّ (adv): how much? how many? how long?

- Uses: 2544.4 per million (9344 times), rank 32. Forms counted: شگد شكد شقد اشكد اشگد
- Dictionary: [Wiktionary (Iraqi Arabic), “شگد”](https://en.wiktionary.org/wiki/%D8%B4%DA%AF%D8%AF#Iraqi_Arabic): “how much”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْقَدّ / شْگَدّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%83%D8%AF&dc%5B%5D=5&st%5B%5D=1): “how much, how many (also used for costs) (often in this dictionary written as ش قَدّ , e.g. as two words) (this is made from a combination of شْ what and قَدّ / extent)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْقَدّ / شْگَدّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%83%D8%AF&dc%5B%5D=5&st%5B%5D=1): “to what extent, how long, how far”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْقَدّ / شْگَدّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%83%D8%AF&dc%5B%5D=5&st%5B%5D=1): “how much, so much, so many (exclamation of wonder, like how nice is...)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شْگَدّ سِعْرَه؟ — How much is it?

## 13. حِچَى (verb): to talk, to speak

- Uses: 2532.1 per million (9299 times), rank 33. Forms counted: حچى حجى حجيت حچيت يحجي يحچي تحجي تحچي احجي احچي نحجي نحچي يحجون يحچون تحجين تحچين تحجون
- Dictionary: [Wiktionary (Iraqi Arabic), “حچى”](https://en.wiktionary.org/wiki/%D8%AD%DA%86%D9%89#Iraqi_Arabic): “to talk, to speak”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “حِكَى / حِچَى، يِحْكِي / يِحْچِي، حَكِي / حَچِي”](https://www.livingarabic.com/en/search?q=%D8%AD%D8%AC%D9%89&dc%5B%5D=5&st%5B%5D=1): “to speak (ه = s.th., e.g. a language);”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “حِكَى / حِچَى، يِحْكِي / يِحْچِي، حَكِي / حَچِي”](https://www.livingarabic.com/en/search?q=%D8%AD%D8%AC%D9%89&dc%5B%5D=5&st%5B%5D=1): “to speak, talk (ل = to)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “حَكَّى / حَچَّى، يْحَكِّي / يْحَچِّي”](https://www.livingarabic.com/en/search?q=%D8%AD%D8%AC%D9%89&dc%5B%5D=5&st%5B%5D=1): “to force to speak, make talk (ه = s.o.)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: MSA حَكَى means to tell, to narrate.
- Sentence: أَرِيد أَحْچِي وِيَّاك شْوَيَّة. — I want to talk to you for a bit.

## 14. شْلَوْن (adv): how?

- Uses: 2488.5 per million (9139 times), rank 34. Forms counted: شلون اشلون
- Dictionary: [Wiktionary (Iraqi Arabic), “شلون”](https://en.wiktionary.org/wiki/%D8%B4%D9%84%D9%88%D9%86#Iraqi_Arabic): “how?”
- Dictionary: [Wiktionary (Iraqi Arabic), “شلون”](https://en.wiktionary.org/wiki/%D8%B4%D9%84%D9%88%D9%86#Iraqi_Arabic): “how”
- Dictionary: [Wiktionary (Iraqi Arabic), “شلون”](https://en.wiktionary.org/wiki/%D8%B4%D9%84%D9%88%D9%86#Iraqi_Arabic): “come again?”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْلَوْن”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%84%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “how, in what manner, in what way from the ش (meaning what) and لَوْن (meaning type or color);”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْلَوْن”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%84%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “how, in what condition, in what state, how are, how is”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْلَوْن”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%84%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “how could it be that, for what reason, why”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْلَوْن”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%84%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “what, what sort of, what kind of, what a”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْلَوْن”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%84%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “how nice is! What a...!(The main difference between this and the first interrogative meaning is one of tone) (exclamatory)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْلَوْن”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%84%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “شْلَوْن”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شْلَوْن رِحِت لِلشُّغُل؟ — How did you get to work?

## 15. إِحْنَا (pron): we

- Uses: 2278 per million (8366 times), rank 37. Forms counted: احنا احنه
- Dictionary: [Wiktionary (Iraqi Arabic), “احنا”](https://en.wiktionary.org/wiki/%D8%A7%D8%AD%D9%86%D8%A7#Iraqi_Arabic): “we (first-person plural pronoun)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “إِحْنَا”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%AD%D9%86%D8%A7&dc%5B%5D=5&st%5B%5D=1): “we”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: إِحْنَا مِن بَغْدَاد. — We're from Baghdad.

## 16. مِنُو (pron): who?

- Uses: 2214.1 per million (8131 times), rank 38. Forms counted: منو
- Dictionary: [Wiktionary (Iraqi Arabic), “منو”](https://en.wiktionary.org/wiki/%D9%85%D9%86%D9%88#Iraqi_Arabic): “who?”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مِنُو”](https://www.livingarabic.com/en/search?q=%D9%85%D9%86%D9%88&dc%5B%5D=5&st%5B%5D=1): “who (see also مَن , which acts as an interrogative suffix / second word in an iDaafa) (interrogative pronoun)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مِنُو هَذَا؟ — Who's this?

## 17. إِجَا (verb): to come

- Uses: 2073 per million (7613 times), rank 43. Forms counted: اجا اجه اجت اجيت يجي تجي اجي نجي يجون تجين اجو اجوا
- Dictionary: [Living Arabic Project, Iraqi dictionary, “إِجَا / إِجَى / جَا، يِجِي، جَيَّة، اسم الفاعِل: جاي، ج جايِّين، المؤنث: جايَّة”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%AC%D8%A7&dc%5B%5D=5&st%5B%5D=1): “to come, come to”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “إِجَا / إِجَى / جَا، يِجِي، جَيَّة، اسم الفاعِل: جاي، ج جايِّين، المؤنث: جايَّة”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%AC%D8%A7&dc%5B%5D=5&st%5B%5D=1): “to come to, accrue to, come one's way”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أَخُويَه إِجَا مِن الْبَصْرَة. — My brother came from Basra.

## 18. وَيْن (adv): where?

- Uses: 2058.8 per million (7561 times), rank 44. Forms counted: وين
- Dictionary: [Wiktionary (Iraqi Arabic), “وين”](https://en.wiktionary.org/wiki/%D9%88%D9%8A%D9%86#Iraqi_Arabic): “where”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “وَيْن”](https://www.livingarabic.com/en/search?q=%D9%88%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “where, what place (interrogative) (when asking about a specific object the pronoun can be suffixed onto وَيْن”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “وَيْن”](https://www.livingarabic.com/en/search?q=%D9%88%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “where (relative pronoun)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وَيْن الْحَمَّام؟ — Where's the bathroom?

## 19. هْوَايَة (adv): a lot, many; very

- Uses: 2017.5 per million (7409 times), rank 45. Forms counted: هوايه هواي اهواي
- Dictionary: [Wiktionary (Iraqi Arabic), “هواية”](https://en.wiktionary.org/wiki/%D9%87%D9%88%D8%A7%D9%8A%D8%A9#Iraqi_Arabic): “much; many; a lot”
- Dictionary: [Wiktionary (Iraqi Arabic), “هواية”](https://en.wiktionary.org/wiki/%D9%87%D9%88%D8%A7%D9%8A%D8%A9#Iraqi_Arabic): “much; a lot”
- Dictionary: [Wiktionary (Iraqi Arabic), “هواي”](https://en.wiktionary.org/wiki/%D9%87%D9%88%D8%A7%D9%8A#Iraqi_Arabic): “much; many; a lot”
- Dictionary: [Wiktionary (Iraqi Arabic), “هواي”](https://en.wiktionary.org/wiki/%D9%87%D9%88%D8%A7%D9%8A#Iraqi_Arabic): “much; a lot”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هْوَاْيَا / هْوَاْيَة”](https://www.livingarabic.com/en/search?q=%D9%87%D9%88%D8%A7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “much, very much, many, numerous, a lot, quite a bit”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هْوَاْيَا / هْوَاْيَة”](https://www.livingarabic.com/en/search?q=%D9%87%D9%88%D8%A7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “too much, excessive”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هْوَاْيَا / هْوَاْيَة”](https://www.livingarabic.com/en/search?q=%D9%87%D9%88%D8%A7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “very, extremely, really”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هْوَاْيَا / هْوَاْيَة”](https://www.livingarabic.com/en/search?q=%D9%87%D9%88%D8%A7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “often, frequently”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هْوَاْيَا / هْوَاْيَة”](https://www.livingarabic.com/en/search?q=%D9%87%D9%88%D8%A7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “for a long time, a while”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هِوَاْيَة / هُوَاْيَة، ج هِوَاْيَاْت / هُوَاْيَاْت”](https://www.livingarabic.com/en/search?q=%D9%87%D9%88%D8%A7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “hobby, spare time activity”
- Standard Arabic: “هواية (noun): hobby”; “هواية (noun): ventilator, fan”
- Note in the app: Not MSA هِوَايَة (hobby).
- Sentence: أَحِبّ بَغْدَاد هْوَايَة. — I love Baghdad a lot.

## 20. زَيْن (adj): good, fine; well

- Uses: 1508.3 per million (5539 times), rank 57. Forms counted: زين زينه زينين
- Dictionary: [Wiktionary (Iraqi Arabic), “زين”](https://en.wiktionary.org/wiki/%D8%B2%D9%8A%D9%86#Iraqi_Arabic): “good; someone or something good”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “زَيْن”](https://www.livingarabic.com/en/search?q=%D8%B2%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “fine, good, nice”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “زَيْن”](https://www.livingarabic.com/en/search?q=%D8%B2%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “fine, good, all right, okay (interjection of compliance or approbation, response to a question)”
- Standard Arabic: “زين (noun): beauty”; “زين (name): a male given name, Zayn and Zain”
- Note in the app: Not MSA زَيْن (beauty).
- Sentence: الْحَمْدُ لِلّٰه، آنِي زَيْن. — Thank God, I'm fine.

## 21. عَلَمُود (prep): for, for the sake of; so that

- Uses: 873.3 per million (3207 times), rank 108. Forms counted: علمود علمودك علموده علمودي علمودج علمودكم
- Dictionary: [Wiktionary (Iraqi Arabic), “على مود”](https://en.wiktionary.org/wiki/%D8%B9%D9%84%D9%89%20%D9%85%D9%88%D8%AF#Iraqi_Arabic): “because, because of”
- Dictionary: [Wiktionary (Iraqi Arabic), “على مود”](https://en.wiktionary.org/wiki/%D8%B9%D9%84%D9%89%20%D9%85%D9%88%D8%AF#Iraqi_Arabic): “for, for the sake of”
- Dictionary: [Wiktionary (Iraqi Arabic), “على مود”](https://en.wiktionary.org/wiki/%D8%B9%D9%84%D9%89%20%D9%85%D9%88%D8%AF#Iraqi_Arabic): “in order to”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “عَلَمُود”](https://www.livingarabic.com/en/search?q=%D8%B9%D9%84%D9%85%D9%88%D8%AF&dc%5B%5D=5&st%5B%5D=1): “because, due to, for the sake of, (3alamuud)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جِيت عَلَمُود أَشُوفَك. — I came so that I could see you.

## 22. شْوَيَّة (adv): a little, a bit

- Uses: 836.2 per million (3071 times), rank 115. Forms counted: شويه شوي
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْوَيَّة / شْوَيَّا / شْوَيّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%88%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “a small amount, a little bit, a few, some (note unlike other dialects, I don't find the word شوية”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْوَيَّة / شْوَيَّا / شْوَيّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%88%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “a short time, a little while”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْوَيَّة / شْوَيَّا / شْوَيّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%88%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “a little, a little bit, somewhat”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْوَيَّة / شْوَيَّا / شْوَيّ”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%88%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “gently, softly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أَحْچِي عِرَاقِي شْوَيَّة. — I speak Iraqi a little.

## 23. جَاب (verb): to bring

- Uses: 792.7 per million (2911 times), rank 121. Forms counted: جاب جابت جبت جابو جابوا يجيب تجيب اجيب نجيب جيب جيبي يجيبون
- Dictionary: [Living Arabic Project, Iraqi dictionary, “جَاْب، يْجِيْب، جَيْب”](https://www.livingarabic.com/en/search?q=%D8%AC%D8%A7%D8%A8&dc%5B%5D=5&st%5B%5D=1): “to bring, fetch”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “جَاْب، يْجِيْب، جَيْب”](https://www.livingarabic.com/en/search?q=%D8%AC%D8%A7%D8%A8&dc%5B%5D=5&st%5B%5D=1): “to bring out, come out with, pull off”
- Standard Arabic: “جاب (verb): to traverse”; “جاب (noun): taxman, collector”
- Note in the app: Not MSA جَابَ (to travel across).
- Sentence: جِيب الْمَاي وِيَّاك. — Bring the water with you.

## 24. خَطِيَّة (adj): poor thing!

- Uses: 744.2 per million (2733 times), rank 126. Forms counted: خطيه
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَطِيَّة”](https://www.livingarabic.com/en/search?q=%D8%AE%D8%B7%D9%8A%D8%A9&dc%5B%5D=5&st%5B%5D=1): “poor, unfortunate, poor wretch, poor fellow (invariable) (expression of sympathy toward someone who is poor or undergoing difficult circumstance, like saying, "poor guy he has been severely injured," or, "poor guy he is broke")”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA خَطِيئَة (sin).
- Sentence: خَطِيَّة، تَعْبَان هْوَايَة. — Poor thing, he's very tired.

## 25. بَعْدَيْن (adv): later; then

- Uses: 737.1 per million (2707 times), rank 127. Forms counted: بعدين
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَعْدَيْن”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%B9%D8%AF%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “then, after that”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَعْدَيْن”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%B9%D8%AF%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “afterwards, later”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بَعْدَيْن أَخَابْرَك. — I'll phone you later.

## 26. شْوَكِت (adv): when?

- Uses: 733.3 per million (2693 times), rank 128. Forms counted: شوكت اشوكت
- Dictionary: [Wiktionary (Iraqi Arabic), “شوكت”](https://en.wiktionary.org/wiki/%D8%B4%D9%88%D9%83%D8%AA#Iraqi_Arabic): “when”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شْوَقِت / شْوَكِت”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%88%D9%83%D8%AA&dc%5B%5D=5&st%5B%5D=1): “when (interrogative) [pronunciation: ق = ك]”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شْوَكِت تِرْجَع؟ — When are you coming back?

## 27. سَالْفَة (noun): story; what's going on

- Uses: 711.8 per million (2614 times), rank 133. Forms counted: سالفه السالفه سوالف السوالف
- Dictionary: [Living Arabic Project, Iraqi dictionary, “سَاْلْفَة، ج سْوَاْلِف / سَاْلْفَاْت”](https://www.livingarabic.com/en/search?q=%D8%B3%D8%A7%D9%84%D9%81%D8%A9&dc%5B%5D=5&st%5B%5D=1): “tale, story, narrative (see also سولف)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA سَالِفَة (former).
- Sentence: شِنُو السَّالْفَة؟ — What's going on?

## 28. لَعَد (particle): so then, in that case

- Uses: 698.4 per million (2565 times), rank 136. Forms counted: لعد
- Dictionary: [Wiktionary (Iraqi Arabic), “لعد”](https://en.wiktionary.org/wiki/%D9%84%D8%B9%D8%AF#Iraqi_Arabic): “so, then”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “لَعَد”](https://www.livingarabic.com/en/search?q=%D9%84%D8%B9%D8%AF&dc%5B%5D=5&st%5B%5D=1): “then, therefore, so, in that case (la'ad) (in Baghdad) (invariable word showing a transition or that a person is drawing a conclusion)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “لَعَد”](https://www.livingarabic.com/en/search?q=%D9%84%D8%B9%D8%AF&dc%5B%5D=5&st%5B%5D=1): “well? what else? what of it? why, so why?”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لَعَد خَلّ نْرُوح. — Well then, let's go.

## 29. يَلَّا (interj): come on, let's go

- Uses: 672.6 per million (2470 times), rank 145. Forms counted: يلا يله
- Dictionary: [Living Arabic Project, Iraqi dictionary, “يَللا / يَلَّا / يا الله”](https://www.livingarabic.com/en/search?q=%D9%8A%D9%84%D8%A7&dc%5B%5D=5&st%5B%5D=1): “come on, go on, hurry up”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: يَلَّا، تْأَخَّرْنَا! — Come on, we're late!

## 30. إِنْتُو (pron): you (talking to several people)

- Uses: 654.9 per million (2405 times), rank 147. Forms counted: انتو انتوا
- Dictionary: [Living Arabic Project, Iraqi dictionary, “اِنْتُو”](https://www.livingarabic.com/en/search?q=%D8%A7%D9%86%D8%AA%D9%88&dc%5B%5D=5&st%5B%5D=1): “you (plural) (second person stand alone pronoun)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: إِنْتُو شْتْرِيدُون؟ — What do you all want?

## 31. يَمّ (prep): next to, beside; at (someone's place)

- Uses: 612.9 per million (2251 times), rank 153. Forms counted: يم يمنا يمكم يمهم
- Dictionary: [Wiktionary (Iraqi Arabic), “يم”](https://en.wiktionary.org/wiki/%D9%8A%D9%85#Iraqi_Arabic): “next to, beside”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “يَمّ”](https://www.livingarabic.com/en/search?q=%D9%8A%D9%85&dc%5B%5D=5&st%5B%5D=1): “beside, next to, near (preposition) (like بجانب in CA);”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA يَمّ (sea).
- Sentence: الصَّيْدَلِيَّة يَمّ الْمَطْعَم. — The pharmacy is next to the restaurant.

## 32. خَوْش (adj): good, nice (before the noun)

- Uses: 585.7 per million (2151 times), rank 160. Forms counted: خوش
- Dictionary: [Wiktionary (Iraqi Arabic), “خوش”](https://en.wiktionary.org/wiki/%D8%AE%D9%88%D8%B4#Iraqi_Arabic): “good; someone or something good”
- Dictionary: [Wiktionary (Iraqi Arabic), “خوش”](https://en.wiktionary.org/wiki/%D8%AE%D9%88%D8%B4#Iraqi_Arabic): “nice, good, OK, alright, awesome.”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَوْش”](https://www.livingarabic.com/en/search?q=%D8%AE%D9%88%D8%B4&dc%5B%5D=5&st%5B%5D=1): “good, ok, okay, fine, excellent (invariable, typically preceding the word it is describing) (khoosh) (Farsi)”
- Standard Arabic: “خوش (verb): to countersink”; “خوش (verb): to ream”
- Note in the app: Not the MSA verb خَوَّشَ (to countersink).
- Sentence: هَذَا خَوْش مَطْعَم. — This is a good restaurant.

## 33. حَيْل (adv): very much; hard

- Uses: 538.3 per million (1977 times), rank 181. Forms counted: حيل
- Dictionary: [Living Arabic Project, Iraqi dictionary, “حَيْل”](https://www.livingarabic.com/en/search?q=%D8%AD%D9%8A%D9%84&dc%5B%5D=5&st%5B%5D=1): “really, very, extremely (used to emphasize s.th.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “حَيْل”](https://www.livingarabic.com/en/search?q=%D8%AD%D9%8A%D9%84&dc%5B%5D=5&st%5B%5D=1): “very, very much, really (same as كُلِّش)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA حَيْل (strength).
- Sentence: اشْتِغَلِت حَيْل الْيَوْم. — I worked hard today.

## 34. نِطَى (verb): to give

- Uses: 528.8 per million (1942 times), rank 185. Forms counted: انطي ينطي تنطي نطي انطيني نطاني انطاني نطيت انطيت ينطون
- Dictionary: [Living Arabic Project, Iraqi dictionary, “نِطَى، يِنْطِي، نَطِي”](https://www.livingarabic.com/en/search?q=%D9%86%D8%B7%D9%89&dc%5B%5D=5&st%5B%5D=1): “to give (ه = s.o., ه = s.th., or ه = s.th., ل = to s.o.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “نِطَى، يِنْطِي، نَطِي”](https://www.livingarabic.com/en/search?q=%D9%86%D8%B7%D9%89&dc%5B%5D=5&st%5B%5D=1): “to give up, give away (ه = s.th.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “نِطَى، يِنْطِي، نَطِي”](https://www.livingarabic.com/en/search?q=%D9%86%D8%B7%D9%89&dc%5B%5D=5&st%5B%5D=1): “to give off, emit, shed, yield”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: اِنْطِينِي التَّلَفَوْن. — Give me the phone.

## 35. بَاچِر (adv): tomorrow

- Uses: 518.7 per million (1905 times), rank 189. Forms counted: باچر باجر
- Dictionary: [Wiktionary (Iraqi Arabic), “باچر”](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%DA%86%D8%B1#Iraqi_Arabic): “tomorrow”
- Dictionary: [Wiktionary (Iraqi Arabic), “باچر”](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%DA%86%D8%B1#Iraqi_Arabic): “in the future, tomorrow”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَاْكِر / بَاْچِر”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%A7%D8%AC%D8%B1&dc%5B%5D=5&st%5B%5D=1): “tomorrow”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA بَاكِر (early).
- Sentence: أَشُوفَك بَاچِر. — See you tomorrow.

## 36. يَابَه (noun): Dad!; (to friends) mate, guys

- Uses: 518.2 per million (1903 times), rank 190. Forms counted: يابه يابا
- Dictionary: [Wiktionary (Iraqi Arabic), “يابا”](https://en.wiktionary.org/wiki/%D9%8A%D8%A7%D8%A8%D8%A7#Iraqi_Arabic): “man, mate, buddy guys (a group of people regardless of gender)”
- Dictionary: [Wiktionary (Iraqi Arabic), “يابا”](https://en.wiktionary.org/wiki/%D9%8A%D8%A7%D8%A8%D8%A7#Iraqi_Arabic): “guys (a group of people regardless of gender)”
- Dictionary: [Wiktionary (Iraqi Arabic), “يابا”](https://en.wiktionary.org/wiki/%D9%8A%D8%A7%D8%A8%D8%A7#Iraqi_Arabic): “dad, daddy (one's father)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: يَابَه، تَعَال شُوف! — Mate, come and look!

## 37. تْخَبُّل (adj): amazing, awesome (literally: it drives you crazy)

- Uses: 488.8 per million (1795 times), rank 214. Forms counted: تخبل
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تْخَبُّل”](https://www.livingarabic.com/en/search?q=%D8%AA%D8%AE%D8%A8%D9%84&dc%5B%5D=5&st%5B%5D=1): “unbelievable, making someone crazy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْأُغْنِيَة تْخَبُّل! — The song is amazing!

## 38. فَدّ (particle): a, one (before a noun)

- Uses: 463.2 per million (1701 times), rank 223. Forms counted: فد
- Dictionary: [Wiktionary (Iraqi Arabic), “فد”](https://en.wiktionary.org/wiki/%D9%81%D8%AF#Iraqi_Arabic): “a, an (indefinite article)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عِنْدِي فَدّ سُؤَال. — I have a question.

## 39. شَغْلَة (noun): thing, matter; job (to do)

- Uses: 438.9 per million (1612 times), rank 245. Forms counted: شغله شغلات الشغله
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شَغْلَة”](https://www.livingarabic.com/en/search?q=%D8%B4%D8%BA%D9%84%D8%A9&dc%5B%5D=5&st%5B%5D=1): “errand, matter”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شَغْلَة، ج شَغْلَاْت”](https://www.livingarabic.com/en/search?q=%D8%B4%D8%BA%D9%84%D8%A9&dc%5B%5D=5&st%5B%5D=1): “task, chore, something to be done”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عِنْدِي شَغْلَة لَازِم أَخَلُّصْهَا. — I have a job I need to finish.

## 40. بَيْش (adv): for how much?

- Uses: 415 per million (1524 times), rank 264. Forms counted: بيش بايش
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَيْش / بَايْش / اِبَّيْش / بْبَيْش”](https://www.livingarabic.com/en/search?q=%D8%A8%D9%8A%D8%B4&dc%5B%5D=5&st%5B%5D=1): “for what, how much (contraction of ب and ايش) (baysh, bbaysh, contraction of بأيش) (Used to ask for the price of merchandise and goods, and also used for asking about time)”
- Standard Arabic: “بيش (noun): aconite, wolfsbane, monkshood (Aconitum spp., especially Aconitum napellus)”
- Note in the app: Not MSA بِيش (aconite, a plant).
- Sentence: بَيْش الْكِيلُو؟ — How much is a kilo?

## 41. بَاوَع (verb): to look (at)

- Uses: 400.8 per million (1472 times), rank 279. Forms counted: باوع اباوع تباوع يباوع نباوع باوعت باوعي باوعو باوعوا يباوعون تباوعين
- Dictionary: [Wiktionary (Iraqi Arabic), “باوع”](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D9%88%D8%B9#Iraqi_Arabic): “to look”
- Dictionary: [Wiktionary (Iraqi Arabic), “باوع”](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D9%88%D8%B9#Iraqi_Arabic): “to observe, to watch”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَاوَع، يباوع”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%A7%D9%88%D8%B9&dc%5B%5D=5&st%5B%5D=1): “to look, see, gaze, stare (Bawa', ybawi')”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَاْوَع، يْبَاْوَع”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%A7%D9%88%D8%B9&dc%5B%5D=5&st%5B%5D=1): “to observe, watch”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَاْوَع، يْبَاْوَع”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%A7%D9%88%D8%B9&dc%5B%5D=5&st%5B%5D=1): “to look, see”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بَاوِع عَلَى هَذَا! — Look at this!

## 42. هَذَوْل (pron): these

- Uses: 375.8 per million (1380 times), rank 299. Forms counted: هذول هذوله هاذول
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَذَا / هَاْذَا، ج ذَوْل / ذَوْلَا / هَذَوْل / هَذَوْل / هَذَوْلَا، المؤنث: هَذِي / هَاْي”](https://www.livingarabic.com/en/search?q=%D9%87%D8%B0%D9%88%D9%84&dc%5B%5D=5&st%5B%5D=1): “this, that, this one (said haadha, with a long alif, and can be written هـٰذا . sometimes this dictionary uses هاذا .) (note: to indicate "over there/that", add ك , similar to al-Fusha)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هَذَوْل جِيرَانَّا. — These are our neighbours.

## 43. مْنَيْن (adv): where from?

- Uses: 308.2 per million (1132 times), rank 377. Forms counted: منين
- Dictionary: [Wiktionary (Iraqi Arabic), “منين”](https://en.wiktionary.org/wiki/%D9%85%D9%86%D9%8A%D9%86#Iraqi_Arabic): “from where?”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مْنَيْن ¦ مْنَيْـن / اِمَّيْـن”](https://www.livingarabic.com/en/search?q=%D9%85%D9%86%D9%8A%D9%86&dc%5B%5D=5&st%5B%5D=1): “from where, where from (contraction of مِن + أين)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مْنَيْن إِنْتَ؟ — Where are you from?

## 44. عَاف (verb): to leave (alone), to let go

- Uses: 306.6 per million (1126 times), rank 380. Forms counted: عاف عفت عافت يعوف تعوف اعوف عوف عوفه عوفني عوفيني
- Dictionary: [Living Arabic Project, Iraqi dictionary, “عَاْف، يْعُوْف”](https://www.livingarabic.com/en/search?q=%D8%B9%D8%A7%D9%81&dc%5B%5D=5&st%5B%5D=1): “to leave behind, abandon, forsake”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “عَاْف، يْعُوْف / يْعِيْف، عَوْف / عَوْفَة / عَيْف / عَيْفَة”](https://www.livingarabic.com/en/search?q=%D8%B9%D8%A7%D9%81&dc%5B%5D=5&st%5B%5D=1): “to leave (ه = s.th.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “عَاْف، يْعُوْف / يْعِيْف، عَوْف / عَوْفَة / عَيْف / عَيْفَة”](https://www.livingarabic.com/en/search?q=%D8%B9%D8%A7%D9%81&dc%5B%5D=5&st%5B%5D=1): “to leave alone, let alone, let be (ه / عن = s.o. / s.th.)”
- Standard Arabic: “عاف (verb): to detest [with accusative ‘something’] (of food, water, etc.)”
- Note in the app: MSA عافَ means to loathe (food).
- Sentence: عُوفْنِي، مَا عِنْدِي وَكِت. — Leave me alone, I've got no time.

## 45. ضَاج (verb): to get fed up, to get bored

- Uses: 299.8 per million (1101 times), rank 387. Forms counted: ضاج ضايج ضايجه ضجت ضاجت يضوج اضوج
- Dictionary: [Wiktionary (Iraqi Arabic), “ضاج”](https://en.wiktionary.org/wiki/%D8%B6%D8%A7%D8%AC#Iraqi_Arabic): “to be sick of, to be tired of, to be bored with”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “ضَاْج، يْضُوْج، ضَوْج / ضْوَاْجَة”](https://www.livingarabic.com/en/search?q=%D8%B6%D8%A7%D8%AC&dc%5B%5D=5&st%5B%5D=1): “to become uneasy, upset, annoyed, disturbed, irritated”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “ضَاْج، يْضُوْج، ضَوْج / ضْوَاْجَة”](https://www.livingarabic.com/en/search?q=%D8%B6%D8%A7%D8%AC&dc%5B%5D=5&st%5B%5D=1): “to become restless, bored, fed up, annoyed (with, by)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ضِجِت مِن الْبَيْت. — I'm fed up with being at home.

## 46. أَشُو (particle): it looks like, it seems

- Uses: 274.2 per million (1007 times), rank 423. Forms counted: اشو
- Dictionary: [Living Arabic Project, Iraqi dictionary, “أَشُ / أَشُو”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%B4%D9%88&dc%5B%5D=5&st%5B%5D=1): “it seems, it looks as if, it appears”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أَشُو مَحَّد هْنَا. — Looks like nobody's here.

## 47. جَاهِل (noun): child, kid (plural جَهَّال)

- Uses: 232 per million (852 times), rank 496. Forms counted: جاهل جهال الجهال جهالي جهالك جهاله جهالنا الجاهل
- Dictionary: [Wiktionary (Iraqi Arabic), “جاهل”](https://en.wiktionary.org/wiki/%D8%AC%D8%A7%D9%87%D9%84#Iraqi_Arabic): “child, kid”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “جَاْهِل / يَاْهِل، ج جْهَأْل / يْهَاْل / جَهَّاْل / يَهَّاْل”](https://www.livingarabic.com/en/search?q=%D8%AC%D8%A7%D9%87%D9%84&dc%5B%5D=5&st%5B%5D=1): “baby, child, youngster, kid. (the form with the ي is Basra usage)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA جَاهِل (ignorant).
- Sentence: الْجَهَّال يِلْعَبُون بَرَّه. — The kids are playing outside.

## 48. هَلَو (interj): hi!

- Uses: 226.6 per million (832 times), rank 509. Forms counted: هلو
- Dictionary: [Wiktionary (Iraqi Arabic), “هلو”](https://en.wiktionary.org/wiki/%D9%87%D9%84%D9%88#Iraqi_Arabic): “hello (greeting)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَلَو”](https://www.livingarabic.com/en/search?q=%D9%87%D9%84%D9%88&dc%5B%5D=5&st%5B%5D=1): “hello”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَلَو”](https://www.livingarabic.com/en/search?q=%D9%87%D9%84%D9%88&dc%5B%5D=5&st%5B%5D=1): “great, wow, say, hey (an expression of enthusiastic approbation, approximately)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هَلَو، شْلَوْنَك؟ — Hi, how are you?

## 49. بَلْكِي (adv): maybe, hopefully

- Uses: 221.1 per million (812 times), rank 519. Forms counted: بلكي بلكت بلكن
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَلْكِي / بَلْكَت / بَلْكَن / بَلْكًا / بَلَاْكِن”](https://www.livingarabic.com/en/search?q=%D8%A8%D9%84%D9%83%D9%8A&dc%5B%5D=5&st%5B%5D=1): “perhaps, maybe, could, hopefully (balki, balkan, balkat)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بَلْكِي يِجِي بَاچِر. — Maybe he'll come tomorrow.

## 50. هَلَا (interj): hello, welcome

- Uses: 191.2 per million (702 times), rank 594. Forms counted: هلا
- Dictionary: [Living Arabic Project, Iraqi dictionary, “هَلَا”](https://www.livingarabic.com/en/search?q=%D9%87%D9%84%D8%A7&dc%5B%5D=5&st%5B%5D=1): “welcome (from أَهلاً);”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA هَلَّا (why not).
- Sentence: هَلَا بِيك! — Welcome!

## 51. سَوْلَف (verb): to chat

- Uses: 187.3 per million (688 times), rank 606. Forms counted: سولف يسولف تسولف اسولف سولفت نسولف
- Dictionary: [Living Arabic Project, Iraqi dictionary, “سَوْلَف، يْسَوْلِف”](https://www.livingarabic.com/en/search?q=%D8%B3%D9%88%D9%84%D9%81&dc%5B%5D=5&st%5B%5D=1): “to reminisce, to chat, carry on idle conversation, talk”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: گْعَدْنَا نْسَوْلِف لِلصُّبُح. — We sat chatting till morning.

## 52. تِمَّن (noun): rice

- Uses: 178.1 per million (654 times), rank 645. Forms counted: تمن التمن
- Dictionary: [Wiktionary (Iraqi Arabic), “تمن”](https://en.wiktionary.org/wiki/%D8%AA%D9%85%D9%86#Iraqi_Arabic): “rice”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تِمَّن”](https://www.livingarabic.com/en/search?q=%D8%AA%D9%85%D9%86&dc%5B%5D=5&st%5B%5D=1): “rice”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تِمَّن”](https://www.livingarabic.com/en/search?q=%D8%AA%D9%85%D9%86&dc%5B%5D=5&st%5B%5D=1): “rice. (timman)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA ثَمَن (price).
- Sentence: أَكَلْنَا تِمَّن وِمَرَگ الْيَوْم. — We ate rice and stew today.

## 53. طَوْبَة (noun): ball; football

- Uses: 161.2 per million (592 times), rank 725. Forms counted: طوبه الطوبه
- Dictionary: [Wiktionary (Iraqi Arabic), “طوبة”](https://en.wiktionary.org/wiki/%D8%B7%D9%88%D8%A8%D8%A9#Iraqi_Arabic): “ball”
- Dictionary: [Wiktionary (Iraqi Arabic), “طوبة”](https://en.wiktionary.org/wiki/%D8%B7%D9%88%D8%A8%D8%A9#Iraqi_Arabic): “soccer”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “طَوْبَة / طَوْپَة، ج طَوْبَاْت / طُوَب / طَوْپَاْت / طُوَپ”](https://www.livingarabic.com/en/search?q=%D8%B7%D9%88%D8%A8%D8%A9&dc%5B%5D=5&st%5B%5D=1): “ball (Persian - توپ, and Turkish, top)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA طَوْبَة (brick).
- Sentence: عِنْدَك طَوْبَة؟ خَلّ نِلْعَب. — Have you got a ball? Let's play.

## 54. رَبُع (noun): friends, mates (your group)

- Uses: 157.7 per million (579 times), rank 742. Forms counted: ربعي ربعك ربعه ربعنا ربعج
- Dictionary: [Living Arabic Project, Iraqi dictionary, “رَبُع”](https://www.livingarabic.com/en/search?q=%D8%B1%D8%A8%D8%B9&dc%5B%5D=5&st%5B%5D=1): “(group of) friends”
- Standard Arabic: “ربع (noun): one fourth; one quarter”; “ربع (noun): quarter (area or region)”
- Note in the app: Not MSA رُبْع (a quarter).
- Sentence: طْلَعِت وِيَّا رَبْعِي. — I went out with my friends.

## 55. دَزّ (verb): to send

- Uses: 140 per million (514 times), rank 850. Forms counted: دز يدز تدز ادز دزيت دزلي دزيته دزها
- Dictionary: [Living Arabic Project, Iraqi dictionary, “دَزّ، يْدِزّ، دَزّ”](https://www.livingarabic.com/en/search?q=%D8%AF%D8%B2&dc%5B%5D=5&st%5B%5D=1): “to send (ه = s.th.)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: دِزّلِي الصُّورَة. — Send me the picture.

## 56. جَوَّه (adv): under, down, downstairs

- Uses: 120.6 per million (443 times), rank 984. Forms counted: جوه
- Dictionary: [Wiktionary (Iraqi Arabic), “جوة”](https://en.wiktionary.org/wiki/%D8%AC%D9%88%D8%A9#Iraqi_Arabic): “down, under.”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “جَوَّا / جَوَّة”](https://www.livingarabic.com/en/search?q=%D8%AC%D9%88%D8%A9&dc%5B%5D=5&st%5B%5D=1): “under, beneath, underneath”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْمِفْتَاح جَوَّه الْمَيْز. — The key is under the table.

## 57. يَاهُو (pron): which one? who?

- Uses: 102.4 per million (376 times), rank 1178. Forms counted: ياهو
- Dictionary: [Living Arabic Project, Iraqi dictionary, “أَيّ / يَا / ياهُو”](https://www.livingarabic.com/en/search?q=%D9%8A%D8%A7%D9%87%D9%88&dc%5B%5D=5&st%5B%5D=1): “which, which one? (interrogative particle)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “يَاْهُو، ج يَاْهُم، المؤنث: يَاْهِي”](https://www.livingarabic.com/en/search?q=%D9%8A%D8%A7%D9%87%D9%88&dc%5B%5D=5&st%5B%5D=1): “which, who among them, whoever, (contraction of يا هُوَّ and يا هِيِّ and يا هُمَّ respectively)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: يَاهُو الْأَحْسَن؟ — Which one is better?

## 58. تْدَلَّل (interj): as you wish; make yourself at home

- Uses: 97.8 per million (359 times), rank 1233. Forms counted: تدلل تدللين تدللون
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تْدَلَّل، يِتْدَلَّل”](https://www.livingarabic.com/en/search?q=%D8%AA%D8%AF%D9%84%D9%84&dc%5B%5D=5&st%5B%5D=1): “to makes demands, ask for favors, take advantage ( often used as an imperative, تْدَلَّل، تْدَلَّلِي، تْدلَّلُوا respectively, to say whatever you wish, at your service)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: تْدَلَّل، الْبَيْت بَيْتَك. — Make yourself at home, the house is yours.

## 59. مُطِي (noun): donkey; (as an insult) idiot

- Uses: 83.3 per million (306 times), rank 1438. Forms counted: مطي المطي مطايه مطايا
- Dictionary: [Wiktionary (Iraqi Arabic), “مطي”](https://en.wiktionary.org/wiki/%D9%85%D8%B7%D9%8A#Iraqi_Arabic): “donkey”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مُطِي، ج مْطَاْيَا”](https://www.livingarabic.com/en/search?q=%D9%85%D8%B7%D9%8A&dc%5B%5D=5&st%5B%5D=1): “donkey, ass”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جَدِّي عِنْدَه مُطِي بِالْمَزْرَعَة. — My grandad has a donkey on the farm.

## 60. زِلْمَة (noun): man, guy

- Uses: 83.1 per million (305 times), rank 1441. Forms counted: زلمه الزلمه
- Dictionary: [Wiktionary (Iraqi Arabic), “زلمة”](https://en.wiktionary.org/wiki/%D8%B2%D9%84%D9%85%D8%A9#Iraqi_Arabic): “man, guy”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “زِلْمَة / زْلِمَة، ج زِلِم”](https://www.livingarabic.com/en/search?q=%D8%B2%D9%84%D9%85%D8%A9&dc%5B%5D=5&st%5B%5D=1): “man”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هَذَا الزِّلْمَة جَارْنَا. — This man is our neighbour.

## 61. ذِيچ (pron): that (for a feminine word)

- Uses: 82.2 per million (302 times), rank 1456. Forms counted: ذيچ ذيج
- Dictionary: [Living Arabic Project, Iraqi dictionary, “ذَاْك / ذَاْكَا، ج ذَوْك / ذَوْكَا / ذَوْلَاْك / ذَوْلَاْكَا، المؤنث: ذِيْك / ذِيْچ / ذِيْچَا ¦ ذَوْلَاْكَا / ذَوْلَاْكَة”](https://www.livingarabic.com/en/search?q=%D8%B0%D9%8A%D8%AC&dc%5B%5D=5&st%5B%5D=1): “that, those, they (as the "far" demonstrative) (feminine form typically said with a چ , whereas the masculine and plural forms are with a ك )”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “ذَاْك، ج ذَوْك / ذَوْلَاْك، المؤنث: ذِيْك / ذِيْچ”](https://www.livingarabic.com/en/search?q=%D8%B0%D9%8A%D8%AC&dc%5B%5D=5&st%5B%5D=1): “that one, that person, that guy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ذِيچ السَّيَّارَة مَالْتِي. — That car is mine.

## 62. چَا (particle): so, then; well?

- Uses: 79.2 per million (291 times), rank 1506. Forms counted: چا
- Dictionary: [Wiktionary (Iraqi Arabic), “چا”](https://en.wiktionary.org/wiki/%DA%86%D8%A7#Iraqi_Arabic): “so, then”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “چَا”](https://www.livingarabic.com/en/search?q=%D8%AC%D8%A7&dc%5B%5D=5&st%5B%5D=1): “then, so, in that case (equivalent to لَعَد)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: چَا شْتْرِيد؟ — So what do you want?

## 63. خَشِم (noun): nose

- Uses: 58.8 per million (216 times), rank 2068. Forms counted: خشم خشمي خشمه خشمك
- Dictionary: [Wiktionary (Iraqi Arabic), “خشم”](https://en.wiktionary.org/wiki/%D8%AE%D8%B4%D9%85#Iraqi_Arabic): “nose”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَشِم، ج خْشُوْم”](https://www.livingarabic.com/en/search?q=%D8%AE%D8%B4%D9%85&dc%5B%5D=5&st%5B%5D=1): “nose”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: خَشْمَه أَحْمَر مِن الْبَرْد. — His nose is red from the cold.

## 64. لِزَم (verb): to catch, to grab

- Uses: 49.6 per million (182 times), rank 2461. Forms counted: لزمه لزمها لزمني لزمته لزمتها لزمتني الزمه الزمها الزمني
- Dictionary: [Living Arabic Project, Iraqi dictionary, “لِزَم، يِلْزَم، لَزِم”](https://www.livingarabic.com/en/search?q=%D9%84%D8%B2%D9%85&dc%5B%5D=5&st%5B%5D=1): “to catch, seize, grab, get hold of (ه = s.o. / s.th.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “لِزَم، يِلْزَم، لَزْمَة”](https://www.livingarabic.com/en/search?q=%D9%84%D8%B2%D9%85&dc%5B%5D=5&st%5B%5D=1): “to catch, grab, grasp, hold (ه = s.th.) (yilzam, lizam)”
- Standard Arabic: “لزم (verb): to be necessary”; “لزم (verb): to be necessary for (someone) [with لِ (li) ‘for something, to do something’] (idiomatically translated by English need with the subject and object reversed)”; “لزم (verb): to be permanent”; “لزم (verb): (law) to be binding (of a law)”
- Note in the app: MSA لَزِمَ means to be necessary.
- Sentence: اِلْزَم الطَّوْبَة! — Catch the ball!

## 65. شُمَر (verb): to throw

- Uses: 49.6 per million (182 times), rank 2462. Forms counted: شمر يشمر تشمر شمرت اشمر شمره
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شُمَر، يشْمُر، شَمُر”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%85%D8%B1&dc%5B%5D=5&st%5B%5D=1): “to toss, cast, throw (ه = s.th.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شُمَر، يِشْمُر”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%85%D8%B1&dc%5B%5D=5&st%5B%5D=1): “shumar, yishmur: to throw, toss (ه = s.th.) . Used metaphorically as in (shamrat 'asa): A stick's throw, which is similar to the English saying: A stone's throw which is literally the distance that a stone can be thrown, but has come to mean any short but undefined distance.”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شَمَّر، يْشَمُّر”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%85%D8%B1&dc%5B%5D=5&st%5B%5D=1): “to strew about, throw around, scatter (ه = s.th.)”
- Standard Arabic: “شمر (verb): to tuck up, to raise”; “شمر (verb): to tuck up, to raise”; “شمر (adj): light, agile, active, swift”; “شمر (noun): fennel (Foeniculum gen.)”
- Note in the app: Not MSA شَمَّرَ (to tuck up).
- Sentence: لَا تِشْمُر الزِّبَالَة هْنَا. — Don't throw rubbish here.

## 66. خَوْب (interj): well; all right then

- Uses: 45.7 per million (168 times), rank 2671. Forms counted: خوب
- Dictionary: [Wiktionary (Iraqi Arabic), “خوب”](https://en.wiktionary.org/wiki/%D8%AE%D9%88%D8%A8#Iraqi_Arabic): “well”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَوْب”](https://www.livingarabic.com/en/search?q=%D8%AE%D9%88%D8%A8&dc%5B%5D=5&st%5B%5D=1): “thus, therefore, so”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: خَوْب، شْتْرِيد هَسَّه؟ — Well, what do you want now?

## 67. جِگَارَة (noun): cigarette

- Uses: 41.1 per million (151 times), rank 2926. Forms counted: جكاره جگاره الجكاره جكاير
- Dictionary: [Living Arabic Project, Iraqi dictionary, “جِگارة”](https://www.livingarabic.com/en/search?q=%D8%AC%D9%83%D8%A7%D8%B1%D8%A9&dc%5B%5D=5&st%5B%5D=1): “cigarrette (jigarah) (English - cigarrette)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جِگَارَة وَحْدَة بَسّ. — Just one cigarette.

## 68. بَزُّون (noun): cat

- Uses: 37 per million (136 times), rank 3233. Forms counted: بزون البزون بزونه بزازين البزازين
- Dictionary: [Wiktionary (Iraqi Arabic), “بزون”](https://en.wiktionary.org/wiki/%D8%A8%D8%B2%D9%88%D9%86#Iraqi_Arabic): “cat”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَزُّوْن، ج بْزَاْزِيْن”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%B2%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “cat, tomcat, male cat. (bazzun) (of Aramaic origin)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْبَزُّون يْحِبّ الْحَلِيب. — The cat likes milk.

## 69. صُفَن (verb): to zone out, to stare into space

- Uses: 32.7 per million (120 times), rank 3634. Forms counted: صفن صافن صفنت
- Dictionary: [Living Arabic Project, Iraqi dictionary, “صُفَن”](https://www.livingarabic.com/en/search?q=%D8%B5%D9%81%D9%86&dc%5B%5D=5&st%5B%5D=1): “to be distracted and silent, to space out”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “صُفَن، يصْفُن، صَفُن / صَفْنَة”](https://www.livingarabic.com/en/search?q=%D8%B5%D9%81%D9%86&dc%5B%5D=5&st%5B%5D=1): “to lose concentration, lose focus, space out, zone out (sufan, yisfun) (of classic Arabic origin)”
- Standard Arabic: “صفن (noun): (anatomy) scrotum”
- Note in the app: Not MSA صَفَن (a part of the body).
- Sentence: لَيْش صَافِن؟ شْبِيك؟ — Why are you staring into space? What's up?

## 70. بِيبِي (noun): grandma

- Uses: 32.4 per million (119 times), rank 3657. Forms counted: بيبي
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بِيْبِي / بِيْبِيَّة، ج بِيْبِيَّاْت”](https://www.livingarabic.com/en/search?q=%D8%A8%D9%8A%D8%A8%D9%8A&dc%5B%5D=5&st%5B%5D=1): “grandmother, granny, grandma (the possess form would use بِيْبِيَّة, like بِيْبِيْتِي is my grandmother) (Likely from Classical Persian, بی‌بی bī-bī, where was used to mean grandmother.)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بِيبِي تْسَوِّي أَطْيَب كُبَّة. — Grandma makes the best kubba.

## 71. خَابَر (verb): to phone

- Uses: 31 per million (114 times), rank 3790. Forms counted: خابر يخابر اخابر خابرت خابرني
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَاْبَر، يْخَاْبِر”](https://www.livingarabic.com/en/search?q=%D8%AE%D8%A7%D8%A8%D8%B1&dc%5B%5D=5&st%5B%5D=1): “to telephone, phone, call (ه = s.o.)”
- Standard Arabic: “خابر (verb): to write to, to address, to appeal, to contact in writing”; “خابر (verb): to negotiate, to treat”
- Note in the app: MSA خَابَرَ means to write to, to contact.
- Sentence: خَابِرْنِي لَمَّن تُوصَل. — Call me when you get there.

## 72. صَمُّون (noun): bread (Iraqi oval rolls)

- Uses: 29.7 per million (109 times), rank 3943. Forms counted: صمون الصمون صمونه صمونات
- Dictionary: [Living Arabic Project, Iraqi dictionary, “صَمُّوْن”](https://www.livingarabic.com/en/search?q=%D8%B5%D9%85%D9%88%D9%86&dc%5B%5D=5&st%5B%5D=1): “Iraqi oval-shaped "stone" bread (often eaten at breakfast), a kind of bread baked in large, oblong loaves, (similar to French bread) (collective noun)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الصَّمُّون حَارّ، هَسَّه طِلَع. — The bread is hot, it's just come out.

## 73. مَيْز (noun): table, desk

- Uses: 29.4 per million (108 times), rank 3986. Forms counted: ميز الميز
- Dictionary: [Wiktionary (Iraqi Arabic), “ميز”](https://en.wiktionary.org/wiki/%D9%85%D9%8A%D8%B2#Iraqi_Arabic): “table”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَيْز، ج مَيْزَاْت / مْيُوْزَة”](https://www.livingarabic.com/en/search?q=%D9%85%D9%8A%D8%B2&dc%5B%5D=5&st%5B%5D=1): “table”
- Standard Arabic: “ميز (verb): to differentiate, to distinguish, to discern, to discriminate (constructed with بين)”; “ميز (verb): (constructed with ضِدَّ (ḍidda)) to discriminate against”; “ميز (verb): to prefer”; “ميز (verb): to separate, to select”
- Note in the app: Not MSA مَيَّزَ (to tell apart).
- Sentence: الْكُتُب عَلَى الْمَيْز. — The books are on the table.

## 74. مَوْطَة (noun): ice cream

- Uses: 26.7 per million (98 times), rank 4358. Forms counted: موطه الموطه
- Dictionary: [Wiktionary (Iraqi Arabic), “موطة”](https://en.wiktionary.org/wiki/%D9%85%D9%88%D8%B7%D8%A9#Iraqi_Arabic): “ice cream”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “موطة”](https://www.livingarabic.com/en/search?q=%D9%85%D9%88%D8%B7%D8%A9&dc%5B%5D=5&st%5B%5D=1): “Motta (the name of an Italian brand of ice cream, from the food company founded by Angelo Motta)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَوْطَة”](https://www.livingarabic.com/en/search?q=%D9%85%D9%88%D8%B7%D8%A9&dc%5B%5D=5&st%5B%5D=1): “: ice cream (mooTah) (of Italian origin, from the branch Motta)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أَرِيد مَوْطَة بِالشُّكُولَاتَة. — I want chocolate ice cream.

## 75. خَاشُوگَة (noun): spoon

- Uses: 22.3 per million (82 times), rank 5038. Forms counted: خاشوكه خاشوقه خاشوگه
- Dictionary: [Wiktionary (Iraqi Arabic), “خاشوقة”](https://en.wiktionary.org/wiki/%D8%AE%D8%A7%D8%B4%D9%88%D9%82%D8%A9#Iraqi_Arabic): “spoon”
- Dictionary: [Wiktionary (Iraqi Arabic), “خاشوكة”](https://en.wiktionary.org/wiki/%D8%AE%D8%A7%D8%B4%D9%88%D9%83%D8%A9#Iraqi_Arabic): “alternative spelling of خاشوقة (ḵāšūqa, ḵāšūga, ḵāšōga, “spoon”)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَاْشُوْقَة / خَاْشُوْگَة، ج خَوَاْشِيْق / خَوَاْشِيْگ”](https://www.livingarabic.com/en/search?q=%D8%AE%D8%A7%D8%B4%D9%88%D9%83%D8%A9&dc%5B%5D=5&st%5B%5D=1): “spoon (see also under خوشق)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَاْشُوْقَة / خَاْشُوْگَة، ج خَوَاْشِيْق / خَوَاْشِيْگ”](https://www.livingarabic.com/en/search?q=%D8%AE%D8%A7%D8%B4%D9%88%D9%83%D8%A9&dc%5B%5D=5&st%5B%5D=1): “spoonful”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْخَاشُوگَة وُگْعَت. — The spoon fell.

## 76. سْبِلِت (noun): air conditioner (split unit)

- Uses: 21.8 per million (80 times), rank 5138. Forms counted: سبلت سپلت السبلت
- Dictionary: [Wiktionary (Iraqi Arabic), “سپلت”](https://en.wiktionary.org/wiki/%D8%B3%D9%BE%D9%84%D8%AA#Iraqi_Arabic): “air conditioner.”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: السْبِلِت مَا يِشْتُغُل. — The air conditioner isn't working.

## 77. طِرْگَاعَة (noun): disaster, big trouble

- Uses: 20.4 per million (75 times), rank 5432. Forms counted: طركاعه طرگاعه
- Dictionary: [Wiktionary (Iraqi Arabic), “طرگاعة”](https://en.wiktionary.org/wiki/%D8%B7%D8%B1%DA%AF%D8%A7%D8%B9%D8%A9#Iraqi_Arabic): “trouble”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “طِرْقَاْعَة / طِرْگَاْعَة”](https://www.livingarabic.com/en/search?q=%D8%B7%D8%B1%D9%83%D8%A7%D8%B9%D8%A9&dc%5B%5D=5&st%5B%5D=1): “disaster, catastrophe”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صَارَت طِرْگَاعَة! — There's been a disaster!

## 78. تَيْل (noun): wire, cable

- Uses: 17.2 per million (63 times), rank 6323. Forms counted: تيل التيل
- Dictionary: [Wiktionary (Iraqi Arabic), “تيل”](https://en.wiktionary.org/wiki/%D8%AA%D9%8A%D9%84#Iraqi_Arabic): “wire, metallic thread”
- Dictionary: [Wiktionary (Iraqi Arabic), “تيل”](https://en.wiktionary.org/wiki/%D8%AA%D9%8A%D9%84#Iraqi_Arabic): “telegraph or power line etc.”
- Dictionary: [Wiktionary (Iraqi Arabic), “تيل”](https://en.wiktionary.org/wiki/%D8%AA%D9%8A%D9%84#Iraqi_Arabic): “wire screen, window screen”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تَيْل، ج تْيُوْل”](https://www.livingarabic.com/en/search?q=%D8%AA%D9%8A%D9%84&dc%5B%5D=5&st%5B%5D=1): “wire”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تَيْل، ج تْيُوْل”](https://www.livingarabic.com/en/search?q=%D8%AA%D9%8A%D9%84&dc%5B%5D=5&st%5B%5D=1): “wire screen, window screen”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: تَيْل الشَّاحِن مَگْطُوع. — The charger cable is broken.

## 79. كَرْوَة (noun): fare (for a taxi or bus)

- Uses: 15.8 per million (58 times), rank 6758. Forms counted: كروه الكروه
- Dictionary: [Wiktionary (Iraqi Arabic), “كروة”](https://en.wiktionary.org/wiki/%D9%83%D8%B1%D9%88%D8%A9#Iraqi_Arabic): “wage, fee, fare”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “كَرْوَة، ج كَرْوَاْت / كَرَاْوِي”](https://www.livingarabic.com/en/search?q=%D9%83%D8%B1%D9%88%D8%A9&dc%5B%5D=5&st%5B%5D=1): “fare, charge, fee, rent, rental fee”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْكَرْوَة خَمِس تَالَاف. — The fare is five thousand.

## 80. تْرَيَّگ (verb): to have breakfast

- Uses: 15 per million (55 times), rank 7091. Forms counted: تريك تريگ اتريك يتريك نتريك تريكت
- Dictionary: [Living Arabic Project, Iraqi dictionary, “ترَيَّق / تْرَيَّگ، يِتْرَيَّق / يِتْرَيَّگ”](https://www.livingarabic.com/en/search?q=%D8%AA%D8%B1%D9%8A%D9%83&dc%5B%5D=5&st%5B%5D=1): “to have breakfast. (yitrayyag) (CA - الريق)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تْرَيَّق / تْرَيَّگ، ج يِتْرَيَّق / يِتْرَيَّگ”](https://www.livingarabic.com/en/search?q=%D8%AA%D8%B1%D9%8A%D9%83&dc%5B%5D=5&st%5B%5D=1): “to eat breakfast, to have breakfast”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “تْرَيَّق / تْرَيَّگ، يِتْرَيَّق / يترَيَّگْ”](https://www.livingarabic.com/en/search?q=%D8%AA%D8%B1%D9%8A%D9%83&dc%5B%5D=5&st%5B%5D=1): “to have breakfast, eat breakfast (itrayyag, yitrayyag) (from CA: tarawaq, tarwiqah)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: تْرَيَّگِت صَمُّون وِگَيْمَر. — I had breakfast: bread and cream.

## 81. بَايْسِكِل (noun): bicycle

- Uses: 13.6 per million (50 times), rank 7668. Forms counted: بايسكل پايسكل
- Dictionary: [Wiktionary (Iraqi Arabic), “بايسكل”](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D9%8A%D8%B3%D9%83%D9%84#Iraqi_Arabic): “bicycle.”
- Dictionary: [Wiktionary (Iraqi Arabic), “پايسكل”](https://en.wiktionary.org/wiki/%D9%BE%D8%A7%D9%8A%D8%B3%D9%83%D9%84#Iraqi_Arabic): “bicycle.”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “بَاْيْسِكِل، ج بَاْيْسِكْلات”](https://www.livingarabic.com/en/search?q=%D8%A8%D8%A7%D9%8A%D8%B3%D9%83%D9%84&dc%5B%5D=5&st%5B%5D=1): “bicycle”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عِنْدِي بَايْسِكِل جِدِيد. — I've got a new bike.

## 82. بَنْكَة (noun): fan (electric, often on the ceiling)

- Uses: 12.3 per million (45 times), rank 8371. Forms counted: بنكه البنكه پنكه
- Dictionary: [Wiktionary (Iraqi Arabic), “بنكة”](https://en.wiktionary.org/wiki/%D8%A8%D9%86%D9%83%D8%A9#Iraqi_Arabic): “fan (electrical device)”
- Dictionary: [Wiktionary (Iraqi Arabic), “پنکه”](https://en.wiktionary.org/wiki/%D9%BE%D9%86%DA%A9%D9%87#Iraqi_Arabic): “alternative form of بنكة (banka)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شَغِّل الْبَنْكَة، الْجَوّ حَارّ. — Turn on the fan, it's hot.

## 83. كِتْلِي (noun): kettle

- Uses: 10.9 per million (40 times), rank 9244. Forms counted: كتلي
- Dictionary: [Wiktionary (Iraqi Arabic), “كتلي”](https://en.wiktionary.org/wiki/%D9%83%D8%AA%D9%84%D9%8A#Iraqi_Arabic): “kettle.”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “كِتْلِي / كَيْتْلِي، ج كِتْلِيَّاْت / كْتَاْلِي / كْيَاْتْلِي”](https://www.livingarabic.com/en/search?q=%D9%83%D8%AA%D9%84%D9%8A&dc%5B%5D=5&st%5B%5D=1): “kettle, teakettle (kitli) (of English origin) (supposedly the form كِتْلِي”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: حُطّ الْكِتْلِي عَلَى النَّار. — Put the kettle on.

## 84. أَدَبْسِز (adj): rude, ill-mannered

- Uses: 10.3 per million (38 times), rank 9629. Forms counted: ادبسز
- Dictionary: [Wiktionary (Iraqi Arabic), “ادبسز”](https://en.wiktionary.org/wiki/%D8%A7%D8%AF%D8%A8%D8%B3%D8%B2#Iraqi_Arabic): “shameless”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “أَدَبْسِزّ، المثنى: أَدَبْسِزِّيّة”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%AF%D8%A8%D8%B3%D8%B2&dc%5B%5D=5&st%5B%5D=1): “crude, boorish, impolite, rude, disrespectful, mannerless (also said of someone who harasses women in the street) (Adabsiz)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لَا تْصِير أَدَبْسِز. — Don't be rude.

## 85. اسْتِكَان (noun): small tea glass

- Uses: 6.8 per million (25 times), rank 13533. Forms counted: استكان استكانات
- Dictionary: [Living Arabic Project, Iraqi dictionary, “سْتِكَاْن / إِسْتِكَاْن / سْتِكَاْنَة / إسْتِكَانَة، ج سْتِكَاْنَاْت / إِسْتِكَاْنَاْت”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%B3%D8%AA%D9%83%D8%A7%D9%86&dc%5B%5D=5&st%5B%5D=1): “a small glass used for drinking tea (sometimes adorned and ornamented with colored, especially gold color, patterns) (stikaan / 2istikaan) [of Russian origin, CTAKAH, and pronounced stakan)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “إسْتِكان، ج إسْتِكَاْنَاْت”](https://www.livingarabic.com/en/search?q=%D8%A7%D8%B3%D8%AA%D9%83%D8%A7%D9%86&dc%5B%5D=5&st%5B%5D=1): “a tea glass, small cup”
- Standard Arabic: “استكان (verb): (intransitive) to submit (to), to yield (to); to surrender oneself willingly.”; “استكان (verb): to humble oneself (before), to abase oneself (before a person or authority).”; “استكان (verb): to give in (to), to succumb (to); to cease resistance under pressure.”
- Note in the app: Not MSA اسْتَكَانَ (to submit).
- Sentence: أَشْرَب اسْتِكَان چَاي. — I'll have a glass of tea.

## 86. شَفْقَة (noun): hat (with a brim)

- Uses: 6.3 per million (23 times), rank 14430. Forms counted: شفقه
- Dictionary: [Living Arabic Project, Iraqi dictionary, “شَفْقَة، ج شَفْقَاْت”](https://www.livingarabic.com/en/search?q=%D8%B4%D9%81%D9%82%D8%A9&dc%5B%5D=5&st%5B%5D=1): “hat (with a brim), (especially) western-style hat, cowboy hat (shafqah) (of Russian origin ШАПКА)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA شَفَقَة (pity).
- Sentence: اِلْبَس الشَّفْقَة، الشَّمِس حَارَّة. — Put on your hat, the sun's hot.

## 87. قَنَفَة (noun): sofa

- Uses: 6 per million (22 times), rank 14948. Forms counted: قنفه القنفه
- Dictionary: [Wiktionary (Iraqi Arabic), “قنفة”](https://en.wiktionary.org/wiki/%D9%82%D9%86%D9%81%D8%A9#Iraqi_Arabic): “sofa, couch”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “قَنَفَة”](https://www.livingarabic.com/en/search?q=%D9%82%D9%86%D9%81%D8%A9&dc%5B%5D=5&st%5B%5D=1): “couch”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: اُگْعُد عَلَى الْقَنَفَة. — Sit on the sofa.

## 88. مَاطَوْر (noun): motor: a water pump, a generator; motorbike

- Uses: 3.3 per million (12 times), rank 23851. Forms counted: ماطور
- Dictionary: [Wiktionary (Iraqi Arabic), “ماطور”](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D8%B7%D9%88%D8%B1#Iraqi_Arabic): “motorcycle.”
- Dictionary: [Wiktionary (Iraqi Arabic), “ماطور”](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D8%B7%D9%88%D8%B1#Iraqi_Arabic): “pump (electrical water pump).”
- Dictionary: [Wiktionary (Iraqi Arabic), “ماطور”](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D8%B7%D9%88%D8%B1#Iraqi_Arabic): “power generator.”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَاْتَوْر / مُتَوْر / مَاْطَوْر، ج مَاْتَوْرَاْت / مُتَوْرَاْت / مَاْطَوْرَاْت”](https://www.livingarabic.com/en/search?q=%D9%85%D8%A7%D8%B7%D9%88%D8%B1&dc%5B%5D=5&st%5B%5D=1): “motor, engine (of any kind. Also referring to a machine driven by a motor, such as a water pump, motorcycle, etc.)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَاْتَوْر / مُتَوْر / مَاْطَوْر، ج مَاْتَوْرَاْت / مُتَوْرَاْت / مَاْطَوْرَاْت”](https://www.livingarabic.com/en/search?q=%D9%85%D8%A7%D8%B7%D9%88%D8%B1&dc%5B%5D=5&st%5B%5D=1): “launch, motor boat, motor barge”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَاْتَوْر / مُتَوْر / مَاْطَوْر، ج مَاْتَوْرَاْت / مُتَوْرَاْت / مَاْطَوْرَاْت”](https://www.livingarabic.com/en/search?q=%D9%85%D8%A7%D8%B7%D9%88%D8%B1&dc%5B%5D=5&st%5B%5D=1): “motorcycle”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مَاطَوْر الْمَاي عَاطِل. — The water pump is broken.

## 89. خَاوْلِي (noun): towel

- Uses: 3.3 per million (12 times), rank 23852. Forms counted: خاولي
- Dictionary: [Wiktionary (Iraqi Arabic), “خاولي”](https://en.wiktionary.org/wiki/%D8%AE%D8%A7%D9%88%D9%84%D9%8A#Iraqi_Arabic): “towel”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “خَاْوْلِي، ج خَاْوْلِيَّاْت”](https://www.livingarabic.com/en/search?q=%D8%AE%D8%A7%D9%88%D9%84%D9%8A&dc%5B%5D=5&st%5B%5D=1): “towel, hand towel”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وَيْن الْخَاوْلِي؟ — Where's the towel?

## 90. دَوْشَگ (noun): mattress

- Uses: 2.2 per million (8 times), rank 31835. Forms counted: دوشك دوشگ
- Dictionary: [Wiktionary (Iraqi Arabic), “دوشك”](https://en.wiktionary.org/wiki/%D8%AF%D9%88%D8%B4%D9%83#Iraqi_Arabic): “mattress”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “دَوْشَق / دَوْشَگ، ج دْوَاْشِق / دْوَاْشِگ”](https://www.livingarabic.com/en/search?q=%D8%AF%D9%88%D8%B4%D9%83&dc%5B%5D=5&st%5B%5D=1): “mattress”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: نِمِت عَلَى دَوْشَگ بِالْگَاع. — I slept on a mattress on the floor.

## 91. بَنْچَر (noun): puncture, flat tyre

- Uses: 1.4 per million (5 times), rank 43706. Forms counted: بنچر بنجر پنچر
- Dictionary: [Wiktionary (Iraqi Arabic), “بنچر”](https://en.wiktionary.org/wiki/%D8%A8%D9%86%DA%86%D8%B1#Iraqi_Arabic): “puncture”
- Dictionary: [Wiktionary (Iraqi Arabic), “پنچر”](https://en.wiktionary.org/wiki/%D9%BE%D9%86%DA%86%D8%B1#Iraqi_Arabic): “puncture, leak, hole”
- Dictionary: [Wiktionary (Iraqi Arabic), “پنچر”](https://en.wiktionary.org/wiki/%D9%BE%D9%86%DA%86%D8%B1#Iraqi_Arabic): “to puncture”
- Dictionary: [Wiktionary (Iraqi Arabic), “پنچر”](https://en.wiktionary.org/wiki/%D9%BE%D9%86%DA%86%D8%B1#Iraqi_Arabic): “to break down”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: السَّيَّارَة بِيهَا بَنْچَر. — The car has a flat tyre.

## 92. چَطَل (noun): fork

- Uses: 1.4 per million (5 times), rank 43707. Forms counted: چطل جطل
- Dictionary: [Wiktionary (Iraqi Arabic), “چطل”](https://en.wiktionary.org/wiki/%DA%86%D8%B7%D9%84#Iraqi_Arabic): “fork”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “چَطَل / چَطْلَة، ج چَطَلَاْت / چَطْلَاْت”](https://www.livingarabic.com/en/search?q=%D8%AC%D8%B7%D9%84&dc%5B%5D=5&st%5B%5D=1): “fork (utensil)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: اِنْطِينِي چَطَل وِخَاشُوگَة. — Give me a fork and a spoon.

## 93. چَوْل (noun): desert, wasteland

- Uses: 1.4 per million (5 times), rank 43708. Forms counted: چول جول
- Dictionary: [Wiktionary (Iraqi Arabic), “چول”](https://en.wiktionary.org/wiki/%DA%86%D9%88%D9%84#Iraqi_Arabic): “desert, wasteland”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “چَوْل”](https://www.livingarabic.com/en/search?q=%D8%AC%D9%88%D9%84&dc%5B%5D=5&st%5B%5D=1): “deserted (invariable)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “چَوْل”](https://www.livingarabic.com/en/search?q=%D8%AC%D9%88%D9%84&dc%5B%5D=5&st%5B%5D=1): “wilderness, wasteland, desert”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كُلَّه چَوْل، مَاكُو بُيُوت. — It's all desert, there are no houses.

## 94. مَگْرُود (adj): poor (to be pitied), wretched

- Uses: 1.1 per million (4 times), rank 50588. Forms counted: مكرود مگرود مكروده
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَقْرُوْد / مَگْرُوْد، ج مْقَاْرِيْد / مْگَاْرِيْد”](https://www.livingarabic.com/en/search?q=%D9%85%D9%83%D8%B1%D9%88%D8%AF&dc%5B%5D=5&st%5B%5D=1): “pitiful, harmless, insignificant”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَقْرُوْد / مَگْرُوْد، ج مْقَاْرِيْد / مْگَاْرِيْد”](https://www.livingarabic.com/en/search?q=%D9%85%D9%83%D8%B1%D9%88%D8%AF&dc%5B%5D=5&st%5B%5D=1): “miserable, poor, vulnerable (person) (magruud)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “مَقْرُوْد / مَگْرُوْد، ج مْقَاْرِيْد / مْگَاْرِيْد”](https://www.livingarabic.com/en/search?q=%D9%85%D9%83%D8%B1%D9%88%D8%AF&dc%5B%5D=5&st%5B%5D=1): “a pitiful person, a poor soul”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مَگْرُود، مَا عِنْدَه أَحَد. — Poor guy, he has nobody.

## 95. عَگْرُوگ (noun): frog

- Uses: 1.1 per million (4 times), rank 50589. Forms counted: عكروك عگروگ
- Dictionary: [Wiktionary (Iraqi Arabic), “عگروگ”](https://en.wiktionary.org/wiki/%D8%B9%DA%AF%D8%B1%D9%88%DA%AF#Iraqi_Arabic): “Frog”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “عَقْرُوْق / عَگْرُوْگ، ج عَقَاْرِيْق / عَگَاْرِيْگ”](https://www.livingarabic.com/en/search?q=%D8%B9%D9%83%D8%B1%D9%88%D9%83&dc%5B%5D=5&st%5B%5D=1): “frog (3agroog, 3agariig) (of Aramaic origin, عقروقا)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أَكُو عَگْرُوگ بِالْحَدِيگَة. — There's a frog in the garden.

## 96. قَرْيَوْلَة (noun): bed

- Uses: 0.8 per million (3 times), rank 60350. Forms counted: قريوله
- Dictionary: [Wiktionary (Iraqi Arabic), “قريولة”](https://en.wiktionary.org/wiki/%D9%82%D8%B1%D9%8A%D9%88%D9%84%D8%A9#Iraqi_Arabic): “bed”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “قَرْيَوْلَة، ج قَرْيَوْلَاْت”](https://www.livingarabic.com/en/search?q=%D9%82%D8%B1%D9%8A%D9%88%D9%84%D8%A9&dc%5B%5D=5&st%5B%5D=1): “bed, bed frame, bedstead, cot”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الْقَرْيَوْلَة زْغَيْرَة. — The bed is small.

## 97. زَرْدُوم (noun): throat

- Uses: 0.5 per million (2 times), rank 77023. Forms counted: زردوم زردومي
- Dictionary: [Wiktionary (Iraqi Arabic), “زردوم”](https://en.wiktionary.org/wiki/%D8%B2%D8%B1%D8%AF%D9%88%D9%85#Iraqi_Arabic): “throat, Adam's apple”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “زَرْدُوْم، ج زَرَاْدِيْم”](https://www.livingarabic.com/en/search?q=%D8%B2%D8%B1%D8%AF%D9%88%D9%85&dc%5B%5D=5&st%5B%5D=1): “pharynx, maw, (and sometimes also) throat (zarduum) (also used in CA, Farsi)”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “زَرْدُوْم، ج زَرَاْدِيْم”](https://www.livingarabic.com/en/search?q=%D8%B2%D8%B1%D8%AF%D9%88%D9%85&dc%5B%5D=5&st%5B%5D=1): “larynx, Adam's apple”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: زَرْدُومِي يَوْجَعْنِي. — My throat hurts.

## 98. چَرِخ (noun): wheel

- Uses: 0.5 per million (2 times), rank 77024. Forms counted: چرخ جرخ
- Dictionary: [Wiktionary (Iraqi Arabic), “چرخ”](https://en.wiktionary.org/wiki/%DA%86%D8%B1%D8%AE#Iraqi_Arabic): “wheel”
- Dictionary: [Living Arabic Project, Iraqi dictionary, “چَرِخ، ج چْرُوْخ”](https://www.livingarabic.com/en/search?q=%D8%AC%D8%B1%D8%AE&dc%5B%5D=5&st%5B%5D=1): “wheel”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: چَرِخ الْبَايْسِكِل مَكْسُور. — The bike's wheel is broken.

