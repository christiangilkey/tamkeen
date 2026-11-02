# Moroccan basics: the evidence for every word

Made by `tools/course/ar-mor/make.mjs` from `list.tsv`; the method is in `README.md`. For each word:

- **Uses**: how often it is used, per million words, in real Darija: the mean of its rate in the Darija Open Dataset's sentences (218033 words) and in the subtitles of 248 Moroccan YouTube videos (613472 words), with the number of times it is used in both. The forms counted are listed.
- **Dictionary**: what a published dictionary says it means (Wiktionary's Moroccan Arabic entry, or the Darija Open Dataset's word lists, linked). The meaning taught is one of these senses.
- **Standard Arabic**: what Wiktionary's Standard Arabic entry spelled the same says, if there is one. It never gives the meaning taught (that would make it a Standard Arabic word, which the course leaves out); the note in the app says how they differ.
- Real sentences that use each word are in `evidence.json` (made by `tools/course/dialect/evidence.mjs mor`).

## 1. ديال (prep): of, belonging to

- Uses: 20422 per million (18580 times). Forms counted: ديال ديالو ديالها ديالك ديالي ديالهم ديالنا ديالكم وديال ديالهوم ديالكوم لديال دياله بديال وديالي بديالي لديالي ديالوك
- Dictionary: [Wiktionary, (Moroccan Arabic), ديال](https://en.wiktionary.org/wiki/%D8%AF%D9%8A%D8%A7%D9%84#Moroccan_Arabic): “alternative form of د (d, di, “of”), used mostly with pronominal suffixes”
- Dictionary: [Darija Open Dataset (nouns), ديال](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “of”
- Dictionary: [Darija Open Dataset (shorts), ديال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “of”
- Dictionary: [Darija Open Dataset (pronouns), ديالي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “mine”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الطونوبيل ديال خويا زوينة.: My brother's car is nice.

## 2. غادي (particle): going to, will (before a verb)

- Uses: 14747.7 per million (11988 times). Forms counted: غادي وغادي غادا غا مغاديش بغا ماغاديش غاديش غادين غاديين فغادي وغادا ومغاديش غاديه وغا وماغاديش غاديا وغاديين وغادين فمغاديش
- Dictionary: [Wiktionary, (Moroccan Arabic), غادي](https://en.wiktionary.org/wiki/%D8%BA%D8%A7%D8%AF%D9%8A#Moroccan_Arabic): “added to a non-past verb form to express future tense: will”
- Dictionary: [Darija Open Dataset (shorts), غادي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “will”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: غادي نمشي للسوق غدا.: I'm going to go to the market tomorrow.

## 3. راه (particle): look, (it) is (points to what is true now)

- Uses: 8580.8 per million (5595 times). Forms counted: راه راني راك راها فراه وراه راكم راهم راهوم وراها راكي وراني وراهم وراك وراكم براني فراك براه براها فراني
- Dictionary: [Wiktionary, (Moroccan Arabic), را](https://en.wiktionary.org/wiki/%D8%B1%D8%A7#Moroccan_Arabic): “(false verb) to be + personal pronoun”
- Dictionary: [Darija Open Dataset (shorts), راه](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “it's”
- Dictionary: [Darija Open Dataset (shorts), راها](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “it's”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: راه ناعس دابا.: He's asleep right now.

## 4. باش (conj): so that, to; with what?

- Uses: 7446.4 per million (6619 times). Forms counted: باش وباش فباش
- Dictionary: [Wiktionary, (Moroccan Arabic), باش](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D8%B4#Moroccan_Arabic): “in order to, in order that, so that: followed by the subjunctive mood”
- Dictionary: [Wiktionary, (Moroccan Arabic), باش](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) with what?”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA بَاشّ (cheerful).
- Sentence: جيت باش نشوفك.: I came to see you.

## 5. بغا (verb): to want; to love

- Uses: 7111.2 per million (3937 times). Forms counted: مابغيتيش بغيت بغيتي بغا بغات بغاو بغينا مابغيتش بغيتو بغي تبغي كنبغي بغيتيني بغيتك بغاه كتبغي وبغا يبغي مابغاش بغاش
- Dictionary: [Wiktionary, (Moroccan Arabic), بغى](https://en.wiktionary.org/wiki/%D8%A8%D8%BA%D9%89#Moroccan_Arabic): “to want”
- Dictionary: [Wiktionary, (Moroccan Arabic), بغى](https://en.wiktionary.org/wiki/%D8%A8%D8%BA%D9%89#Moroccan_Arabic): “to love”
- Dictionary: [Darija Open Dataset (shorts), بغا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “want”
- Dictionary: [Darija Open Dataset (shorts), بغا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he wanted”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA بَغَى (to wrong, to oppress).
- Sentence: بغيت نشرب أتاي.: I want to drink tea.

## 6. واش (particle): (starts a yes/no question)

- Uses: 5714.2 per million (3108 times). Forms counted: واش لواش
- Dictionary: [Wiktionary, (Moroccan Arabic), واش](https://en.wiktionary.org/wiki/%D9%88%D8%A7%D8%B4#Moroccan_Arabic): “Interrogative particle that is added to the beginning of a declarative sentence to change it into a yes-or-no question.”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واش نتا مغربي؟: Are you Moroccan?

## 7. بزاف (adv): a lot; very

- Uses: 5332.4 per million (3443 times). Forms counted: بزاف فبزاف وبزاف لبزاف ببزاف بالزاف
- Dictionary: [Darija Open Dataset (adverbs), بزّاف](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “a lot”
- Dictionary: [Darija Open Dataset (shorts), بزّاف](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “a lot”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الماكلة زوينة بزاف.: The food is very good.

## 8. مشى (verb): to go; to leave

- Uses: 5064.3 per million (3553 times). Forms counted: نمشي مشي تمشي نمشيو مشيت يمشي مشينا مشات مشاو مشا مشيتي يمشيو كيمشي كتمشي غانمشي ومشي كيمشيو ومشات كانمشي كايمشي
- Dictionary: [Wiktionary, (Moroccan Arabic), مشى](https://en.wiktionary.org/wiki/%D9%85%D8%B4%D9%89#Moroccan_Arabic): “(intransitive) to go”
- Dictionary: [Wiktionary, (Moroccan Arabic), مشى](https://en.wiktionary.org/wiki/%D9%85%D8%B4%D9%89#Moroccan_Arabic): “(intransitive) to leave”
- Dictionary: [Darija Open Dataset (shorts), مشي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “leave”
- Dictionary: [Darija Open Dataset (verbs), مشا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “go”
- Standard Arabic: “مشى (verb): to have many living beings to care for (scilicet which one has to walk by)”
- Note in the app: In MSA مَشَى is "to walk".
- Sentence: مشيت للبحر البارح.: I went to the beach yesterday.

## 9. هادشي (pron): this (thing)

- Uses: 4381.9 per million (3151 times). Forms counted: هادشي وهادشي فهادشي هادش بهادشي لهادشي هادشو
- Dictionary: [Darija Open Dataset (shorts), هادشي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “this”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هادشي ماشي ديالي.: This isn't mine.

## 10. شاف (verb): to see, to look

- Uses: 3815.1 per million (3074 times). Forms counted: شوف نشوفو شاف نشوف تشوف يشوف شفت كنشوف شفتي كتشوف شافو كيشوف شفنا يشوفو شفتو شافت نشوفك شوفي تيشوف تشوفو
- Dictionary: [Wiktionary, (Moroccan Arabic), شاف](https://en.wiktionary.org/wiki/%D8%B4%D8%A7%D9%81#Moroccan_Arabic): “to see (to perceive with the eyes)”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), شاف](https://en.wiktionary.org/wiki/%D8%B4%D8%A7%D9%81#Arabic): “from Arabic شاف: to look down at; to view”
- Dictionary: [Darija Open Dataset (verbs), شاف](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “see”
- Dictionary: [Darija Open Dataset (verbs), شاف](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “look”
- Standard Arabic: “شاف (verb): to look down at; to view”
- Note in the app: Not MSA شَافَ (to look down on); MSA says رَأَى.
- Sentence: شفت صاحبك فالزنقة.: I saw your friend in the street.

## 11. كاين (particle): there is, there are

- Uses: 3693.3 per million (2910 times). Forms counted: كاين كاينه كاينين وكاين مكاينش مكاين كاينا ماكاين كاينش ماكاينش ماكايناش فكاين وكاينه وكاينين فكاينه ومكاين وماكاينش ومكاينش فمكاين وماكايناش
- Dictionary: [Wiktionary, (Moroccan Arabic), كاين](https://en.wiktionary.org/wiki/%D9%83%D8%A7%D9%8A%D9%86#Moroccan_Arabic): “there is”
- Standard Arabic: “كأين (particle): how many!”
- Note in the app: Not MSA كَائِن (a being).
- Sentence: واش كاين شي حانوت قريب؟: Is there a shop nearby?

## 12. علاش (adv): why

- Uses: 3455.8 per million (1982 times). Forms counted: علاش لاش علاياش وعلاش علاه بلاش فعلاش فلاش علياش ولاش وعلاياش
- Dictionary: [Wiktionary, (Moroccan Arabic), علاش](https://en.wiktionary.org/wiki/%D8%B9%D9%84%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) why?”
- Dictionary: [Wiktionary, (Moroccan Arabic), علياش](https://en.wiktionary.org/wiki/%D8%B9%D9%84%D9%8A%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) why?”
- Dictionary: [Wiktionary, (Moroccan Arabic), علاه](https://en.wiktionary.org/wiki/%D8%B9%D9%84%D8%A7%D9%87#Moroccan_Arabic): “(interrogative) why?”
- Dictionary: [Darija Open Dataset (pronouns), علاش](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “why”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: علاش ماجيتيش البارح؟: Why didn't you come yesterday?

## 13. شنو (pron): what

- Uses: 2762.3 per million (2150 times). Forms counted: شنو اشنو وشنو اشناهوا اشناهيا فشنو شناهيا لشنو واشنو شناهوا بشنو شنوي فاشنو باشنو لاشنو
- Dictionary: [Wiktionary, (Moroccan Arabic), شنو](https://en.wiktionary.org/wiki/%D8%B4%D9%86%D9%88#Moroccan_Arabic): “(interrogative) what?”
- Dictionary: [Wiktionary, (Moroccan Arabic), أشنو](https://en.wiktionary.org/wiki/%D8%A3%D8%B4%D9%86%D9%88#Moroccan_Arabic): “(interrogative) what?”
- Dictionary: [Darija Open Dataset (pronouns), شنو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “what”
- Dictionary: [Darija Open Dataset (shorts), شنو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “what”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شنو كتدير؟: What are you doing?

## 14. دابا (adv): now

- Uses: 2556.9 per million (2029 times). Forms counted: دابا ودابا لدابا بدابا
- Dictionary: [Wiktionary, (Moroccan Arabic), دابا](https://en.wiktionary.org/wiki/%D8%AF%D8%A7%D8%A8%D8%A7#Moroccan_Arabic): “now; right now; at present”
- Dictionary: [Darija Open Dataset (adverbs), دابا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “now”
- Dictionary: [Darija Open Dataset (time), دابا](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/time.csv): “now”
- Dictionary: [Darija Open Dataset (shorts), دابا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “now”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA دَأْب (habit).
- Sentence: أنا فالدار دابا.: I'm at home now.

## 15. بحال (prep): like, as; the same as

- Uses: 2460 per million (2106 times). Forms counted: بحال بحالا بحالو بحالي بحالك بهال بحالها بحالنا بحالهم بهالك فبحال وبحال بهالي بحالكم بحاله بحالهوم بهالنا لبحال وبحالك بهالها
- Dictionary: [Wiktionary, (Moroccan Arabic), بحال](https://en.wiktionary.org/wiki/%D8%A8%D8%AD%D8%A7%D9%84#Moroccan_Arabic): “similar to, like, as”
- Dictionary: [Darija Open Dataset (adjectives), بحال](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “same”
- Dictionary: [Darija Open Dataset (prepositions), بحال](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/prepositions.csv): “like”
- Dictionary: [Darija Open Dataset (shorts), بحال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “like”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هو بحال باه.: He's like his father.

## 16. شوية (adv): a little, a bit

- Uses: 2274.7 per million (1598 times). Forms counted: شويه بشويه الشويه وشويه شويا شوييا فشويه لشويه بشويا
- Dictionary: [Wiktionary, (Moroccan Arabic), شوية](https://en.wiktionary.org/wiki/%D8%B4%D9%88%D9%8A%D8%A9#Moroccan_Arabic): “a little”
- Dictionary: [Darija Open Dataset (shorts), شوية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “a little”
- Dictionary: [Darija Open Dataset (adverbs), شويا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “a little”
- Dictionary: [Darija Open Dataset (shorts), شويا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “a little”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني شوية ديال الما.: Give me a little water.

## 17. ديك (det): that (feminine)

- Uses: 2146 per million (1962 times). Forms counted: ديك فديك وديك بديك لديك
- Dictionary: [Wiktionary, (Moroccan Arabic), ديك](https://en.wiktionary.org/wiki/%D8%AF%D9%8A%D9%83#Moroccan_Arabic): “feminine singular of داك (dāk)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA دِيك (rooster).
- Sentence: ديك البنت ختي.: That girl is my sister.

## 18. داكشي (pron): that (thing)

- Uses: 2133.7 per million (1673 times). Forms counted: داكشي دكشي وداكشي لداكشي فداكشي بداكشي فدكشي بدكشي لدكشي ودكشي
- Dictionary: [Darija Open Dataset (shorts), داكشي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “that”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: داكشي اللي قلت ليك.: That's what I told you.

## 19. مزيان (adj): good; fine; well

- Uses: 2047.9 per million (1546 times). Forms counted: مزيان مزيانه المزيان مزيانين مزيانا بالمزيان المزيانه المزيانين ومزيان ومزيانك ومزيانه لمزيانين
- Dictionary: [Wiktionary, (Moroccan Arabic), مزيان](https://en.wiktionary.org/wiki/%D9%85%D8%B2%D9%8A%D8%A7%D9%86#Moroccan_Arabic): “good, nice”
- Dictionary: [Wiktionary, (Moroccan Arabic), زيان](https://en.wiktionary.org/wiki/%D8%B2%D9%8A%D8%A7%D9%86#Moroccan_Arabic): “to become good, nice”
- Dictionary: [Darija Open Dataset (adjectives), مزيان](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “fine”
- Dictionary: [Darija Open Dataset (nouns), مزيان](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “well”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هاد الأتاي مزيان.: This tea is good.

## 20. شحال (adv): how much, how many

- Uses: 2027.2 per million (1283 times). Forms counted: شحال بشحال شهال وشحال فشحال بشهال لشحال وبشحال
- Dictionary: [Wiktionary, (Moroccan Arabic), شحال](https://en.wiktionary.org/wiki/%D8%B4%D8%AD%D8%A7%D9%84#Moroccan_Arabic): “(interrogative) how much?”
- Dictionary: [Darija Open Dataset (shorts), شحال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “how much”
- Dictionary: [Darija Open Dataset (shorts), شحال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “how many”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شحال هادي؟: How much is this?

## 21. فاش (conj): when (at the time that); in what

- Uses: 2012.8 per million (2145 times). Forms counted: فاش وفاش ففاش لفاش
- Dictionary: [Wiktionary, (Moroccan Arabic), وقتاش](https://en.wiktionary.org/wiki/%D9%88%D9%82%D8%AA%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) when?”
- Dictionary: [Darija Open Dataset (shorts), فاش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “when”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فاش توصل، صيفط ليا ميساج.: When you get there, send me a text.

## 22. ماشي (particle): not (before nouns and adjectives)

- Uses: 1989.4 per million (1534 times). Forms counted: ماشي وماشي فماشي
- Dictionary: [Wiktionary, (Moroccan Arabic), ماشي](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D8%B4%D9%8A#Moroccan_Arabic): “not”
- Dictionary: [Wiktionary, (Moroccan Arabic), ماشي](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D8%B4%D9%8A#Moroccan_Arabic): “added to a non-past verb form to express future tense: will”
- Dictionary: [Darija Open Dataset (adverbs), ماشي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “not”
- Dictionary: [Darija Open Dataset (shorts), ماشي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “not”
- Standard Arabic: “ماشى (verb): to walk side by side”; “ماشى (verb): to go along with (of another opinion)”
- Note in the app: Not MSA مَاشٍ (walking).
- Sentence: هادا ماشي مشكل.: That's not a problem.

## 23. آش (pron): what

- Uses: 1974.5 per million (1062 times). Forms counted: اش اشنو واشنو فاشنو باشنو اشي باشي اشك لاشنو
- Dictionary: [Wiktionary, (Moroccan Arabic), آش](https://en.wiktionary.org/wiki/%D8%A2%D8%B4#Moroccan_Arabic): “(interrogative) what?”
- Dictionary: [Darija Open Dataset (pronouns), أش](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “what”
- Dictionary: [Darija Open Dataset (shorts), أش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “what”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Also spelled اش.
- Sentence: آش بغيتي تاكل؟: What do you want to eat?

## 24. جاب (verb): to bring

- Uses: 1930.7 per million (1424 times). Forms counted: نجيب جاب جيب يجيب جابو تجيب جبت يجيبو كيجيب جبتي جابت نجيبو جابها كيجيبو جيبي وجاب كتجيب نجيبها تجيبها يجيبها
- Dictionary: [Wiktionary, (Moroccan Arabic), جاب](https://en.wiktionary.org/wiki/%D8%AC%D8%A7%D8%A8#Moroccan_Arabic): “to bring”
- Dictionary: [Darija Open Dataset (verbs), جاب](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “bring”
- Dictionary: [Darija Open Dataset (shorts), جاب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bring”
- Standard Arabic: “جاب (verb): to traverse”; “جاب (noun): taxman, collector”
- Note in the app: Not MSA جَابَ (to roam).
- Sentence: جيب ليا كاس ديال الما.: Bring me a glass of water.

## 25. فين (adv): where

- Uses: 1820.8 per million (1173 times). Forms counted: فين وفين لفين فاين
- Dictionary: [Wiktionary, (Moroccan Arabic), فين](https://en.wiktionary.org/wiki/%D9%81%D9%8A%D9%86#Moroccan_Arabic): “(interrogative) where?”
- Dictionary: [Darija Open Dataset (pronouns), فين](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “where”
- Dictionary: [Darija Open Dataset (shorts), فين](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “where”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فين ساكن؟: Where do you live?

## 26. تسنا (verb): to wait

- Uses: 1768.7 per million (1022 times). Forms counted: كانتسنا كنتسني كيتسني كيتسناو تسنا تسني كنتسنا تسناو نتسنا يتسناو كنتسناو تسنيت يتسني تيتسني كيتسناني نتسني نتسناو كنتسناك كيتسناها كيتسناه
- Dictionary: [Darija Open Dataset (verbs), تسنّا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “wait”
- Dictionary: [Darija Open Dataset (shorts), تسنّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “wait”
- Dictionary: [Darija Open Dataset (shorts), تسنّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he waited”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA تَسَنَّى (to become possible).
- Sentence: تسنا شوية، أنا جاي.: Wait a minute, I'm coming.

## 27. بلاصة (noun): place

- Uses: 1648.7 per million (1350 times). Forms counted: بلاصه البلاصه البلايص بلاصتو لبلاصه فبلاصه بلاصتك بلايص بلاصتي فالبلاصه للبلاصه بلاصتها فبلاصتي فبلاصتو بلاصتهم فبلايص فبلاصتها فبلاصتك فلبلاصه لبلاصتو
- Dictionary: [Wiktionary, (Moroccan Arabic), بلاصة](https://en.wiktionary.org/wiki/%D8%A8%D9%84%D8%A7%D8%B5%D8%A9#Moroccan_Arabic): “place, location, spot”
- Dictionary: [Wiktionary, (Moroccan Arabic), بلاصة](https://en.wiktionary.org/wiki/%D8%A8%D9%84%D8%A7%D8%B5%D8%A9#Moroccan_Arabic): “instead of, in place of”
- Dictionary: [Darija Open Dataset (nouns), بلاصة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “place”
- Dictionary: [Darija Open Dataset (places), بلاصة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “place”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هادي بلاصة زوينة.: This is a nice place.

## 28. جوج (num): two

- Uses: 1475.7 per million (1554 times). Forms counted: جوج بجوج الجوج وجوج لجوج فجوج بجوجهم بجوجنا دجوج وبجوج والجوج بجوجكم بجوجكوم وبجوجهم
- Dictionary: [Wiktionary, (Moroccan Arabic), جوج](https://en.wiktionary.org/wiki/%D8%AC%D9%88%D8%AC#Moroccan_Arabic): “two”
- Dictionary: [Darija Open Dataset (numbers), جوج](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/numbers.csv): “two”
- Dictionary: [Darija Open Dataset (shorts), جوج](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “two”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندي جوج ديال الدراري.: I have two children.

## 29. ولّى (verb): to become; to come back

- Uses: 1418.7 per million (1407 times). Forms counted: ولات ولاو يولي وليت تولي ولينا وليتي تيولي غتولي كتولي كيولي نولي نوليو تتولي غيولي وولات وولاو وتولي كيوليو ويولي
- Dictionary: [Wiktionary, (Moroccan Arabic), ولى](https://en.wiktionary.org/wiki/%D9%88%D9%84%D9%89#Moroccan_Arabic): “to become”
- Dictionary: [Darija Open Dataset (shorts), ولّي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “become”
- Standard Arabic: “ولي (verb): to be close to, stand immediately by, be neighboring, follow close upon (transitive)”; “ولي (verb): to follow”; “ولي (verb): to confine with (transitive)”; “ولي (verb): to depend, appertain”
- Note in the app: Not MSA وَلَّى (to turn away).
- Sentence: الجو ولّى بارد.: The weather has turned cold.

## 30. كيفاش (adv): how

- Uses: 1394.6 per million (1118 times). Forms counted: كيفاش وكيفاش فكيفاش بكيفاش
- Dictionary: [Darija Open Dataset (pronouns), كيفاش](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “how”
- Dictionary: [Darija Open Dataset (shorts), كيفاش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “how”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كيفاش داير؟: How are you?

## 31. مورا (prep): behind; after

- Uses: 1355.2 per million (1358 times). Forms counted: مور مورا موراها موراه موراهم وموراها موراك مورانا ومورا لمورا وموراه ومور وموراهم موراهوم وموري فمورا بمور لمور مورك ومورك
- Dictionary: [Wiktionary, (Moroccan Arabic), مورا](https://en.wiktionary.org/wiki/%D9%85%D9%88%D8%B1%D8%A7#Moroccan_Arabic): “behind”
- Dictionary: [Wiktionary, (Moroccan Arabic), مورا](https://en.wiktionary.org/wiki/%D9%85%D9%88%D8%B1%D8%A7#Moroccan_Arabic): “after”
- Dictionary: [Wiktionary, (Moroccan Arabic), مور](https://en.wiktionary.org/wiki/%D9%85%D9%88%D8%B1#Moroccan_Arabic): “behind”
- Dictionary: [Wiktionary, (Moroccan Arabic), مور](https://en.wiktionary.org/wiki/%D9%85%D9%88%D8%B1#Moroccan_Arabic): “after”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: نتلاقاو مورا الخدمة.: Let's meet after work.

## 32. ايلا (conj): if

- Uses: 1349.6 per million (789 times). Forms counted: ايلا وايلا فايلا
- Dictionary: [Wiktionary, (Moroccan Arabic), إدا](https://en.wiktionary.org/wiki/%D8%A5%D8%AF%D8%A7#Moroccan_Arabic): “if”
- Dictionary: [Darija Open Dataset (prepositions), إلا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/prepositions.csv): “if”
- Dictionary: [Darija Open Dataset (shorts), إلا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “if”
- Dictionary: [Darija Open Dataset (utils), إلا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “if”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA إِلَّا (except).
- Sentence: ايلا بغيتي، نمشيو معاك.: If you want, we'll go with you.

## 33. داز (verb): to pass, to go by

- Uses: 1305.8 per million (1214 times). Forms counted: داز دازت دازو دوز يدوز كيدوز ندوزو ندوز يدوزو دوزو دزنا كيدوزو دزت ودوز وداز دزتي تيدوز ودازت دوزنا كندوز
- Dictionary: [Wiktionary, (Moroccan Arabic), داز](https://en.wiktionary.org/wiki/%D8%AF%D8%A7%D8%B2#Moroccan_Arabic): “(transitive) to pass, pass by”
- Dictionary: [Darija Open Dataset (verbs), داز](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “pass”
- Dictionary: [Darija Open Dataset (shorts), داز](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pass”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الطوبيس داز دابا.: The bus has just gone past.

## 34. واخا (intj): OK, all right; even if

- Uses: 1275 per million (993 times). Forms counted: واخا وخا واحا وواخا فواخا لوخا
- Dictionary: [Wiktionary, (Moroccan Arabic), وخا](https://en.wiktionary.org/wiki/%D9%88%D8%AE%D8%A7#Moroccan_Arabic): “OK”
- Dictionary: [Darija Open Dataset (shorts), واخا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “ok”
- Dictionary: [Darija Open Dataset (utils), واخا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “ok”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واخا، نتلاقاو غدا.: OK, see you tomorrow.

## 35. زوين (adj): nice, beautiful

- Uses: 1233.1 per million (637 times). Forms counted: زوينه زوين زوينين زوينا الزوين الزوينه وزوينه بالزوين
- Dictionary: [Darija Open Dataset (adjectives), زوين](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “beautiful”
- Dictionary: [Darija Open Dataset (adjectives), زوين](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “nice”
- Dictionary: [Darija Open Dataset (art), زوين](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/art.csv): “beautiful”
- Dictionary: [Darija Open Dataset (shorts), زوين](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “beautiful”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندك دار زوينة.: You have a lovely house.

## 36. والو (pron): nothing

- Uses: 1211.5 per million (897 times). Forms counted: والو بوالو لوالو ووالو فوالو والوي
- Dictionary: [Wiktionary, (Moroccan Arabic), والو](https://en.wiktionary.org/wiki/%D9%88%D8%A7%D9%84%D9%88#Moroccan_Arabic): “nothing”
- Dictionary: [Darija Open Dataset (shorts), والو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “nothing”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ماعندي والو.: I have nothing.

## 37. ڭاع (adv): all; (not) at all

- Uses: 1201.8 per million (896 times). Forms counted: كاع ڭاع ڭاعما كاعما فكاع گاع وكاع بكاع فگاع لكاع فڭاع لڭاع بڭاع لگاع
- Dictionary: [Wiktionary, (Moroccan Arabic), ڭاع](https://en.wiktionary.org/wiki/%DA%AD%D8%A7%D8%B9#Moroccan_Arabic): “all, every”
- Dictionary: [Wiktionary, (Moroccan Arabic), ڭاع](https://en.wiktionary.org/wiki/%DA%AD%D8%A7%D8%B9#Moroccan_Arabic): “at all”
- Dictionary: [Darija Open Dataset (adjectives), ڭاع](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “all”
- Dictionary: [Darija Open Dataset (shorts), ڭاع](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “all”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ڭاع الناس جاو.: All the people came.

## 38. آه (intj): yes

- Uses: 1162.2 per million (842 times). Forms counted: اه واه
- Dictionary: [Wiktionary, (Moroccan Arabic), آه](https://en.wiktionary.org/wiki/%D8%A2%D9%87#Moroccan_Arabic): “yes”
- Dictionary: [Darija Open Dataset (shorts), أه](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “yes”
- Dictionary: [Darija Open Dataset (utils), أه](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “yes”
- Standard Arabic: “اه (verb): abbreviation of اِنْتَهَى (intahā): used to mark the end of a quotation”; “آه (intj): ah, aw, ooh, ouch (expression of physical or emotional pain)”; “آه (noun): pain (physical or emotional)”; “آه (verb): to moan, groan”
- Note in the app: Not MSA آهٍ (ah!, a sigh).
- Sentence: آه، أنا جاي.: Yes, I'm coming.

## 39. حوايج (noun): clothes; things

- Uses: 1149.1 per million (766 times). Forms counted: الحوايج حوايج لحوايج حوايجك حوايجي حوايجو حوايجها حوايجنا هوايجي حوايجهم هوايج هوايجك بحوايج دالحوايج الهوايج وحوايج فحوايج بالحوايج فحوايجي فحوايجو
- Dictionary: [Wiktionary, (Moroccan Arabic), حوايج](https://en.wiktionary.org/wiki/%D8%AD%D9%88%D8%A7%D9%8A%D8%AC#Moroccan_Arabic): “clothes”
- Dictionary: [Darija Open Dataset (clothes), حوايج](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “clothes”
- Dictionary: [Darija Open Dataset (shorts), حوايج](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “clothes”
- Dictionary: [Darija Open Dataset (shorts), حوايج](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “things”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Plural of حاجة; MSA حَوَائِج means "needs".
- Sentence: حوايجي فالباليزة.: My clothes are in the suitcase.

## 40. ملي (conj): when (at the time that)

- Uses: 1138.2 per million (798 times). Forms counted: ملي وملي فملي ماللي
- Dictionary: [Wiktionary, (Moroccan Arabic), ماللي](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D9%84%D9%84%D9%8A#Moroccan_Arabic): “when”
- Standard Arabic: “ملي (noun): a (relatively) long period of time”; “ملى (verb): to cause to enjoy [with accusative ‘someone’ and accusative ‘something’] (for a long time; said of God)”
- Note in the app: Not MSA مَلِيّ (a long while).
- Sentence: ملي كنت صغير، كنت ساكن فكازا.: When I was little, I lived in Casablanca.

## 41. كيسحاب (verb): to think, to reckon (literally "it seems to")

- Uses: 1133.9 per million (537 times). Forms counted: كيسحاب تيسحاب يسحاب كيسحابلي كايسحاب
- Dictionary: [Darija Open Dataset (shorts), كايسحاب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “think”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: From the verb تّسحاب; usually كيسحاب ليا "it seems to me".
- Sentence: كيسحاب ليا غادي تشتا.: I think it's going to rain.

## 42. صافي (intj): OK, that's it, enough

- Uses: 1066.2 per million (668 times). Forms counted: صافي وصافي
- Dictionary: [Darija Open Dataset (shorts), صافي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “alright”
- Dictionary: [Darija Open Dataset (utils), صافي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “alright”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA صَافٍ (pure, clear).
- Sentence: صافي، شبعت.: That's enough, I'm full.

## 43. سمية (noun): name (of a person)

- Uses: 1018.9 per million (1096 times). Forms counted: سميتو سميتها السميه سميتك سميتي السميات سميه بسميه بالسميه سميات بسميتو سميتهم بالسميات فالسميه بسميتي والسميه بسميتك وسميتو سمياتنا سمياتهم
- Dictionary: [Darija Open Dataset (nouns), سمية](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “first name”
- Dictionary: [Darija Open Dataset (nouns), سمية](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “name”
- Dictionary: [Darija Open Dataset (shorts), سمية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “first name”
- Dictionary: [Darija Open Dataset (shorts), سمية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “name”
- Standard Arabic: “سمية (noun): the quality of toxicity”; “سمية (noun): the degree of toxicity”; “سمية (adj): feminine singular of سَمِيّ (samiyy)”
- Note in the app: Not MSA سُمِّيَّة (toxicity).
- Sentence: سميتي كريم.: My name is Karim.

## 44. دوك (det): those

- Uses: 983.4 per million (969 times). Forms counted: دوك فدوك لدوك بدوك ودوك
- Dictionary: [Wiktionary, (Moroccan Arabic), دوك](https://en.wiktionary.org/wiki/%D8%AF%D9%88%D9%83#Moroccan_Arabic): “plural of داك (dāk): those”
- Dictionary: [Darija Open Dataset (shorts), دوك](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “those”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شكون دوك الناس؟: Who are those people?

## 45. يالله (adv): only just, a moment ago; come on

- Uses: 929.7 per million (602 times). Forms counted: يلاه يالاه يالله ويالاه ويلاه فيلاه فيالاه
- Dictionary: [Wiktionary, (Moroccan Arabic), يالله](https://en.wiktionary.org/wiki/%D9%8A%D8%A7%D9%84%D9%84%D9%87#Moroccan_Arabic): “just, just now, recently”
- Dictionary: [Wiktionary, (Moroccan Arabic), يالله](https://en.wiktionary.org/wiki/%D9%8A%D8%A7%D9%84%D9%84%D9%87#Moroccan_Arabic): “hurry up, come on”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), ياالله](https://en.wiktionary.org/wiki/%D9%8A%D8%A7%D8%A7%D9%84%D9%84%D9%87#Arabic): “from Arabic ياالله: come on, c’mon”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA يَا اللهُ (O God).
- Sentence: يالله وصلت.: I've only just arrived.

## 46. دوّز (verb): to spend (time); to get through

- Uses: 872.8 per million (739 times). Forms counted: دوز دوزت يدوز كيدوز ندوزو ندوز يدوزو دوزتي دوزات دوزو كيدوزو ودوز تيدوز دوزنا دوزتها كندوز دوزناها تدوز وكيدوز دوزها
- Dictionary: [Wiktionary, (Moroccan Arabic), داز](https://en.wiktionary.org/wiki/%D8%AF%D8%A7%D8%B2#Moroccan_Arabic): “(transitive) to pass, pass by”
- Dictionary: [Darija Open Dataset (shorts), دوز](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pass”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: دوّزنا نهار زوين.: We spent a lovely day.

## 47. سوّل (verb): to ask

- Uses: 843.2 per million (641 times). Forms counted: نسولك سولني سول سولو نسول سولت سولتو سولتي تسول يسول كيسول سولها سولاتو سولوني تسولني سولات سولوه نسولو سولاتني سولتيني
- Dictionary: [Wiktionary, (Moroccan Arabic), سول](https://en.wiktionary.org/wiki/%D8%B3%D9%88%D9%84#Moroccan_Arabic): “(transitive or intransitive) to ask”
- Dictionary: [Darija Open Dataset (verbs), سوّل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “ask”
- Dictionary: [Darija Open Dataset (shorts), سوّل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “ask”
- Dictionary: [Darija Open Dataset (shorts), سوّل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he asked”
- Standard Arabic: “سول (verb): to entice, to tempt, to make covet”
- Note in the app: Not MSA سَوَّلَ (to tempt).
- Sentence: سوّل الشيفور على الطريق.: Ask the driver the way.

## 48. هضر (verb): to talk, to speak

- Uses: 818.3 per million (649 times). Forms counted: هضرنا نهضرو نهضر تهضر هدر هدرنا هضره يهضر كيهضر تيهضر كانهضر هضر كنهضر يهضرو غنهضرو تتهضر هدرت يهدر تنهضرو هضرت
- Dictionary: [Wiktionary, (Moroccan Arabic), هدر](https://en.wiktionary.org/wiki/%D9%87%D8%AF%D8%B1#Moroccan_Arabic): “to talk, to speak”
- Dictionary: [Wiktionary, (Moroccan Arabic), هدر](https://en.wiktionary.org/wiki/%D9%87%D8%AF%D8%B1#Moroccan_Arabic): “to cause to talk”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), هذر](https://en.wiktionary.org/wiki/%D9%87%D8%B0%D8%B1#Arabic): “from Arabic هذر: to prattle, to talk foolishly”
- Dictionary: [Darija Open Dataset (verbs), هضر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “talk”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA هَدَرَ (to waste).
- Sentence: كيهضر الدارجة مزيان.: He speaks Darija well.

## 49. راجل (noun): man; husband

- Uses: 788.7 per million (527 times). Forms counted: راجل الراجل راجلها راجلي راجلك وراجلها وراجل والراجل براجل لراجلها لراجل فراجل فالراجل لراجلي لراجلك بالراجل دالراجل فراجلي وراجلك فراجلك
- Dictionary: [Wiktionary, (Moroccan Arabic), راجل](https://en.wiktionary.org/wiki/%D8%B1%D8%A7%D8%AC%D9%84#Moroccan_Arabic): “man”
- Dictionary: [Wiktionary, (Moroccan Arabic), راجل](https://en.wiktionary.org/wiki/%D8%B1%D8%A7%D8%AC%D9%84#Moroccan_Arabic): “husband”
- Dictionary: [Darija Open Dataset (nouns), راجل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “man”
- Dictionary: [Darija Open Dataset (nouns), راجل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “husband”
- Standard Arabic: “راجل (noun): pedestrian”; “راجل (noun): good walker”; “راجل (noun): footsoldier”
- Note in the app: Not MSA رَاجِل (on foot).
- Sentence: راجلها خدام فالفيرمة.: Her husband works on the farm.

## 50. شكون (pron): who

- Uses: 782.5 per million (532 times). Forms counted: شكون وشكون فشكون بشكون لشكون اشكون واشكون
- Dictionary: [Wiktionary, (Moroccan Arabic), شكون](https://en.wiktionary.org/wiki/%D8%B4%D9%83%D9%88%D9%86#Moroccan_Arabic): “(interrogative) who?”
- Dictionary: [Wiktionary, (Moroccan Arabic), أشكون](https://en.wiktionary.org/wiki/%D8%A3%D8%B4%D9%83%D9%88%D9%86#Moroccan_Arabic): “(interrogative) who?”
- Dictionary: [Darija Open Dataset (pronouns), شكون](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “who”
- Dictionary: [Darija Open Dataset (shorts), شكون](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “who”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شكون جا؟: Who came?

## 51. سالى (verb): to finish

- Uses: 754 per million (508 times). Forms counted: سالا سالي سالات يسالي ساليت نسالي سالينا تسالي سالاو نساليو ساليتي يساليو كتسالي كيساليو ساليو ساليتو وكتسالي ماكاتساليش غاتسالي كيسالي
- Dictionary: [Wiktionary, (Moroccan Arabic), سالى](https://en.wiktionary.org/wiki/%D8%B3%D8%A7%D9%84%D9%89#Moroccan_Arabic): “(transitive, intransitive) to finish”
- Dictionary: [Darija Open Dataset (shorts), سالي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “finish”
- Dictionary: [Darija Open Dataset (verbs), سالا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “finish”
- Dictionary: [Darija Open Dataset (shorts), سالا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he finished”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA سَلَا (to forget, to find comfort).
- Sentence: ساليت الخدمة بكري.: I finished work early.

## 52. ماكلة (noun): food

- Uses: 747.2 per million (467 times). Forms counted: الماكله ماكله فالماكله لماكله والماكله ماكلتك بالماكله ماكلتي دالماكله للماكله ماكلتو ماكلتنا ماكلتهوم وماكله بماكله فلماكله دلماكله ماكلتها
- Dictionary: [Wiktionary, (Moroccan Arabic), ماكلة](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D9%83%D9%84%D8%A9#Moroccan_Arabic): “food”
- Dictionary: [Darija Open Dataset (nouns), ماكلة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “food”
- Dictionary: [Darija Open Dataset (food), ماكلة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “food”
- Dictionary: [Darija Open Dataset (shorts), ماكلة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “food”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الماكلة هنا بنينة.: The food here is delicious.

## 53. حنا (pron): we

- Uses: 745.1 per million (659 times). Forms counted: حنا وحنا لحنا حناك فحنا حناكم لحناها
- Dictionary: [Wiktionary, (Moroccan Arabic), حنا](https://en.wiktionary.org/wiki/%D8%AD%D9%86%D8%A7#Moroccan_Arabic): “we (subject pronoun)”
- Dictionary: [Darija Open Dataset (pronouns), حنا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “we”
- Dictionary: [Darija Open Dataset (shorts), حنا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “we”
- Standard Arabic: “حنا (verb): (transitive) to bend, to curve”; “حنا (verb): to twist (someone's arm, etc.)”; “حنا (verb): to bow (one's head)”; “حنا (verb): to lean [with إِلَى (ʔilā) or عَلَى (ʕalā) ‘towards someone’]”
- Note in the app: Not MSA حَنَا (bent over).
- Sentence: حنا من الرباط.: We're from Rabat.

## 54. دوى (verb): to talk, to speak

- Uses: 740.3 per million (542 times). Forms counted: دوي ندوي كيدوي ندويو كندوي دويت دوينا يدوي كيدويو تدوي دواو دوات كندويو يدويو دويتي كاندوي كايدويو كايدوي ودوي دويو
- Dictionary: [Wiktionary, (Moroccan Arabic), دوى](https://en.wiktionary.org/wiki/%D8%AF%D9%88%D9%89#Moroccan_Arabic): “to talk”
- Standard Arabic: “دوى (verb): to buzz, to hum (of insects)”; “دوى (verb): to make a noise, to be noisy”; “دوى (verb): to buzz, to hum (of insects)”; “دوى (verb): to buzz, to drone, to din”
- Note in the app: Not MSA دَوَّى (to echo).
- Sentence: كندويو على الماتش.: We're talking about the match.

## 55. بنادم (noun): person, human being

- Uses: 717.9 per million (714 times). Forms counted: بنادم وبنادم دبنادم فبنادم لبنادم ببنادم البنادم بنادمه
- Dictionary: [Wiktionary, (Moroccan Arabic), بنادم](https://en.wiktionary.org/wiki/%D8%A8%D9%86%D8%A7%D8%AF%D9%85#Moroccan_Arabic): “human being, person”
- Dictionary: [Darija Open Dataset (nouns), بنادم](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “human”
- Dictionary: [Darija Open Dataset (humanbody), بنادم](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/humanbody.csv): “human”
- Dictionary: [Darija Open Dataset (shorts), بنادم](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “human”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هو بنادم مزيان.: He's a good person.

## 56. طونوبيل (noun): car

- Uses: 707.6 per million (529 times). Forms counted: الطونوبيل طونوبيل توموبيل الطوموبيلات تونوبيل فالطونوبيل طوموبيل للطونوبيل الطوموبيل فطونوبيل تونوبيلا بالطونوبيل فطوموبيل فتونوبيل فتوموبيل طوموبيلات والطونوبيل التونوبيل بطونوبيل بتوموبيل
- Dictionary: [Wiktionary, (Moroccan Arabic), طمبيل](https://en.wiktionary.org/wiki/%D8%B7%D9%85%D8%A8%D9%8A%D9%84#Moroccan_Arabic): “car”
- Dictionary: [Darija Open Dataset (nouns), طوموبيل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “car”
- Dictionary: [Darija Open Dataset (shorts), طوموبيل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “car”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شريت طونوبيل جديدة.: I bought a new car.

## 57. هادو (pron): these

- Uses: 696.3 per million (604 times). Forms counted: هادو هادوك وهادو وهادوك فهادوك لهادوك بهادوك فهادو لهادو بهادو هادوي
- Dictionary: [Darija Open Dataset (pronouns), هادو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “these”
- Dictionary: [Darija Open Dataset (shorts), هادو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “these”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هادو صحابي.: These are my friends.

## 58. هزّ (verb): to lift, to carry

- Uses: 694.5 per million (678 times). Forms counted: هاز هز تهز هزيت يهز هازه هازين نهز هزات هزو يهزو وهز هزوني وهاز هزوه كنهز كيهزو هزها كتهز كيهز
- Dictionary: [Darija Open Dataset (verbs), هزّ](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “lift”
- Dictionary: [Darija Open Dataset (verbs), هزّ](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “carry”
- Dictionary: [Darija Open Dataset (shorts), هزّ](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “lift”
- Dictionary: [Darija Open Dataset (shorts), هزّ](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “carry”
- Standard Arabic: “هز (verb): (transitive) to shake, to move quickly and jerkily up and down”; “هز (noun): vibration, oscillation”
- Note in the app: MSA هَزَّ is "to shake".
- Sentence: هزّ معايا هاد الطابلة.: Lift this table with me.

## 59. هوما (pron): they

- Uses: 689.4 per million (592 times). Forms counted: هوما وهوما هوم هومو لهوما لهوم بهوما
- Dictionary: [Wiktionary, (Moroccan Arabic), هوما](https://en.wiktionary.org/wiki/%D9%87%D9%88%D9%85%D8%A7#Moroccan_Arabic): “they (masculine or feminine plural subject pronoun)”
- Dictionary: [Darija Open Dataset (shorts), هوما](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “they”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: MSA هُمَا is "the two of them".
- Sentence: هوما جاو من فاس.: They came from Fes.

## 60. عيّط (verb): to call (someone, on the phone)

- Uses: 639.1 per million (503 times). Forms counted: عيط نعيط عيطو تعيط يعيط كيعيطو عيطات يعيطو كيعيط عيطت وعيط نعيطو كتعيط وعيطت كنعيط عيطنا وعيطات تعيطي كانعيط كاتعيط
- Dictionary: [Wiktionary, (Moroccan Arabic), عيط](https://en.wiktionary.org/wiki/%D8%B9%D9%8A%D8%B7#Moroccan_Arabic): “to call”
- Dictionary: [Darija Open Dataset (verbs), عيط](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “call”
- Dictionary: [Darija Open Dataset (shorts), عيط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “call”
- Dictionary: [Darija Open Dataset (shorts), عيط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he called”
- Standard Arabic: “عيط (verb): to cry out, scream, yell, weep”; “عيط (verb): to clamour”; “عيط (verb): to call out, scold”; “عيط (verb): to hail”
- Note in the app: MSA عَيَّطَ is "to scream".
- Sentence: عيّط لماماك.: Call your mum.

## 61. عفاك (intj): please

- Uses: 611 per million (269 times). Forms counted: عفاك عافاك
- Dictionary: [Darija Open Dataset (shorts), عافاك](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “please”
- Dictionary: [Darija Open Dataset (utils), عافاك](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “please”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني الما عفاك.: Give me the water, please.

## 62. دراري (noun): children, kids; young men

- Uses: 583.7 per million (475 times). Forms counted: الدراري دراري والدراري للدراري بالدراري لدراري ودراري فالدراري فدراري بدراري وبالدراري
- Dictionary: [Wiktionary, (Moroccan Arabic), دري](https://en.wiktionary.org/wiki/%D8%AF%D8%B1%D9%8A#Moroccan_Arabic): “kid, offspring”
- Dictionary: [Darija Open Dataset (family), الدراري](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/family.csv): “children”
- Dictionary: [Darija Open Dataset (shorts), الدراري](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “children”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدراري مشاو للمدرسة.: The kids have gone to school.

## 63. نعس (verb): to sleep

- Uses: 524.4 per million (317 times). Forms counted: نعس تنعس ينعس نعست كنعس نعسو كينعس ونعس نعسه نعستي كاتنعس كنعسو ينعسو نعسي كانعس مانعس نعسنا ماتنعس تنعسي كتنعس
- Dictionary: [Wiktionary, (Moroccan Arabic), نعس](https://en.wiktionary.org/wiki/%D9%86%D8%B9%D8%B3#Moroccan_Arabic): “(intransitive) to sleep”
- Dictionary: [Wiktionary, (Moroccan Arabic), نعس](https://en.wiktionary.org/wiki/%D9%86%D8%B9%D8%B3#Moroccan_Arabic): “(transitive) to cause to sleep”
- Dictionary: [Darija Open Dataset (verbs), نعس](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “sleep”
- Dictionary: [Darija Open Dataset (shorts), نعس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “sleep”
- Standard Arabic: “نعس (verb): to be sleepy, drowsy”; “نعس (verb): to be inactive”; “نعس (verb): (transitive) to cause to be sleepy”
- Note in the app: MSA نَعَسَ is "to doze".
- Sentence: نعست مزيان البارح.: I slept well last night.

## 64. اوا (intj): well, so (then)

- Uses: 498.1 per million (281 times). Forms counted: اوا ايوا
- Dictionary: [Darija Open Dataset (shorts), إوا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “so”
- Dictionary: [Darija Open Dataset (weird), إوا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/weird.csv): “well”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Also spelled إيوا.
- Sentence: اوا، شنو غادي نديرو؟: So, what are we going to do?

## 65. خلّص (verb): to pay

- Uses: 495.2 per million (370 times). Forms counted: تخلص نخلص يخلص كتخلص خلص كيخلصو خلصت خلصو يخلصو كيخلص نخلصو تخلصو يخلصوها كنخلصو خلصات تتخلص تيخلصو خلصهم خلصتي نخلصك
- Dictionary: [Wiktionary, (Moroccan Arabic), خلص](https://en.wiktionary.org/wiki/%D8%AE%D9%84%D8%B5#Moroccan_Arabic): “to pay”
- Dictionary: [Darija Open Dataset (verbs), خلّص](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “pay”
- Dictionary: [Darija Open Dataset (shorts), خلّص](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pay”
- Standard Arabic: “خلص (verb): to be pure, to be unadulterated (e.g. of water or wine)”; “خلص (verb): (figurative) to be clear (of a goal, an idea, etc.)”; “خلص (verb): to belong [with لِ (li) ‘to someone’]”; “خلص (verb): to reach [with إِلَى (ʔilā) ‘a goal’]”
- Note in the app: Not MSA خَلَّصَ (to rescue).
- Sentence: خلّصت الفاكتورة ديال الضو.: I paid the electricity bill.

## 66. حيّد (verb): to remove, to take off

- Uses: 458.8 per million (407 times). Forms counted: حيد تحيد حيدو نحيد يحيد يحيدو نحيدو حيدت حيدات كيحيدو كيحيد حيدتي حيدنا تيحيدو حيدوه تحيدو كتحيد وحيدت وحيدات وتحيد
- Dictionary: [Darija Open Dataset (verbs), حيّد](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “remove”
- Dictionary: [Darija Open Dataset (shorts), حيّد](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “remove”
- Standard Arabic: “حيد (verb): to neutralize”; “حيد (verb): to make neutral or accuse of neutrality”
- Note in the app: Not MSA حَيَّدَ (to make neutral).
- Sentence: حيّد صباطك قبل ما تدخل.: Take off your shoes before you come in.

## 67. سيمانة (noun): week

- Uses: 456.7 per million (310 times). Forms counted: سيمانه السيمانه سيمانا فالسيمانه فسيمانه لسيمانه والسيمانه للسيمانه وسيمانه لسيمانا بالسيمانه دالسيمانه فسيمانا السيمانا
- Dictionary: [Wiktionary, (Moroccan Arabic), سيمانة](https://en.wiktionary.org/wiki/%D8%B3%D9%8A%D9%85%D8%A7%D9%86%D8%A9#Moroccan_Arabic): “week”
- Dictionary: [Darija Open Dataset (nouns), سيمانة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “week”
- Dictionary: [Darija Open Dataset (time), سيمانة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/time.csv): “week”
- Dictionary: [Darija Open Dataset (shorts), سيمانة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “week”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: غادي نسافر السيمانة الجاية.: I'm travelling next week.

## 68. هضرة (noun): talk, words; way of speaking

- Uses: 451.5 per million (433 times). Forms counted: الهضره الهدره هضره بالهضره لهدره فالهضره هضرتو بالهدره هدرتي هدرتو هدره لهضره والهضره لهدرتي هدرتك هضرتي للهدره دالهضره للهضره فالهدره
- Dictionary: [Wiktionary, (Moroccan Arabic), هدرة](https://en.wiktionary.org/wiki/%D9%87%D8%AF%D8%B1%D8%A9#Moroccan_Arabic): “talking, speaking”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA هَدْر (waste).
- Sentence: ماعجباتنيش الهضرة ديالو.: I didn't like his words.

## 69. ياك (particle): right?, isn't it?

- Uses: 444.7 per million (299 times). Forms counted: ياك وياك لياك
- Dictionary: [Darija Open Dataset (shorts), ياك](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “isn't it”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ياك لاباس؟: Everything's fine, isn't it?

## 70. خايب (adj): bad; ugly

- Uses: 441 per million (269 times). Forms counted: خايبه خايب خايبين الخايبه الخايب بالخايب وخايبه لخايبين وخايب لخايب خايبا والخايب لخايبه والخايبه
- Dictionary: [Darija Open Dataset (adjectives), خايب](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “ugly”
- Dictionary: [Darija Open Dataset (adjectives), خايب](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “bad”
- Dictionary: [Darija Open Dataset (shorts), خايب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bad”
- Dictionary: [Darija Open Dataset (shorts), خايب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “ugly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA خَائِب (disappointed).
- Sentence: الجو خايب اليوم.: The weather is bad today.

## 71. منين (adv): from where; when (since)

- Uses: 412.8 per million (278 times). Forms counted: منين ومنين فمنين
- Dictionary: [Wiktionary, (Moroccan Arabic), منين](https://en.wiktionary.org/wiki/%D9%85%D9%86%D9%8A%D9%86#Moroccan_Arabic): “from where?”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: منين جيتي؟: Where did you come from?

## 72. مول (noun): owner of, the one with

- Uses: 410.2 per million (351 times). Forms counted: مول مالين مولات لمول ومول لمولي بمول فمول ومالين لمالين المول فالمول مولي مولو مولها لمولات ومولاتي لمولاتها مولاتهم لمولاتهم
- Dictionary: [Wiktionary, (Moroccan Arabic), مول](https://en.wiktionary.org/wiki/%D9%85%D9%88%D9%84#Moroccan_Arabic): “owner, caretaker or person responsible for something”
- Dictionary: [Darija Open Dataset (nouns), مول](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “owner”
- Dictionary: [Darija Open Dataset (shorts), مول](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “owner”
- Standard Arabic: “مول (verb): to make rich”; “مول (verb): to fund, to finance, to sponsor”; “مول (noun): mall, shopping center”; “مول (noun): (chemistry, physics) mole (unit of amount)”
- Note in the app: Not MSA مَوَّلَ (to finance).
- Sentence: مول الحانوت راجل مزيان.: The owner of the shop is a nice man.

## 73. طيّح (verb): to drop

- Uses: 408.7 per million (467 times). Forms counted: طيح يطيح يطيحو كيطيح كيطيحو نطيح طيحو طيحات نطيحو وطيح تيطيح ونطيح كايطيح يطيحوه تنطيحو تطيح ويطيح طيحها طيحهم كنطيح
- Dictionary: [Darija Open Dataset (verbs), طيّح](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “drop”
- Dictionary: [Darija Open Dataset (shorts), طيّح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “drop”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: طيّحت الساروت فالزنقة.: I dropped the key in the street.

## 74. بصح (adv): really, truly

- Uses: 406.6 per million (323 times). Forms counted: بصح بالصح وبصح
- Dictionary: [Darija Open Dataset (shorts), بصح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “really”
- Dictionary: [Darija Open Dataset (shorts), بصح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “really!”
- Dictionary: [Darija Open Dataset (utils), بصح!](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “really!”
- Dictionary: [Darija Open Dataset (utils), بصح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “really”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بصح؟ ماكنتش عارف.: Really? I didn't know.

## 75. جبد (verb): to pull; to take out

- Uses: 377.3 per million (374 times). Forms counted: جبد يجبد نجبد تجبد يجبدو جبدت جبدو نجبدو جبدات كيجبد وجبد جبدتي كنجبد كتجبد كيجبدو جبدنا وجبدت جبدتيه جبدوه نجبدها
- Dictionary: [Wiktionary, (Moroccan Arabic), جبد](https://en.wiktionary.org/wiki/%D8%AC%D8%A8%D8%AF#Moroccan_Arabic): “to pull”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جبد الساروت من جيبو.: He took the key out of his pocket.

## 76. فاق (verb): to wake up

- Uses: 369.1 per million (277 times). Forms counted: فقت فاق فيق نفيق تفيق يفيق كنفيق فاقت كتفيق كيفيق كانفيق فيقني نفيقك كتفيقني فيقاتني فقتي تفيقني يفيقو كيفيقو وكنفيق
- Dictionary: [Wiktionary, (Moroccan Arabic), فاق](https://en.wiktionary.org/wiki/%D9%81%D8%A7%D9%82#Moroccan_Arabic): “(intransitive) to wake up”
- Dictionary: [Wiktionary, (Moroccan Arabic), فيق](https://en.wiktionary.org/wiki/%D9%81%D9%8A%D9%82#Moroccan_Arabic): “(transitive) to wake up”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), أفاق](https://en.wiktionary.org/wiki/%D8%A3%D9%81%D8%A7%D9%82#Arabic): “from Arabic أفاق: to wake up”
- Dictionary: [Darija Open Dataset (verbs), فاق](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “wake up”
- Standard Arabic: “فاق (verb): to exceed, to surpass, to go over, to go beyond”; “فاق (verb): to die (together with نَفْسَهُ (nafsahu))”; “فاق (verb): to have hiccup”
- Note in the app: Not MSA فَاقَ (to surpass).
- Sentence: فقت بكري اليوم.: I woke up early today.

## 77. واعر (adj): great, impressive; tough

- Uses: 358.7 per million (208 times). Forms counted: واعر واعره والواعره واعرين الواعره الواعر الواعرين لواعره لواعرين
- Dictionary: [Wiktionary, (Moroccan Arabic), واعر](https://en.wiktionary.org/wiki/%D9%88%D8%A7%D8%B9%D8%B1#Moroccan_Arabic): “difficult”
- Dictionary: [Darija Open Dataset (adjectives), واعر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “potent”
- Dictionary: [Darija Open Dataset (shorts), واعر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “potent”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA وَعْر (rugged).
- Sentence: هاد الفيلم واعر.: This film is great.

## 78. عاوتاني (adv): again

- Uses: 340.8 per million (342 times). Forms counted: عاوتاني وعاوتاني عاودتاني
- Dictionary: [Darija Open Dataset (adverbs), عاوتّاني](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “again”
- Dictionary: [Darija Open Dataset (shorts), عاوتّاني](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “again”
- Dictionary: [Darija Open Dataset (utils), عاوتّاني](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “again”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: قولها عاوتاني عفاك.: Say it again, please.

## 79. دغيا (adv): quickly, right away

- Uses: 337 per million (194 times). Forms counted: دغيا دخيا ودغيا بدخيا
- Dictionary: [Darija Open Dataset (adverbs), دغيا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “quickly”
- Dictionary: [Darija Open Dataset (shorts), دغيا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “quickly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جي دغيا!: Come quickly!

## 80. بلان (noun): plan

- Uses: 331.3 per million (314 times). Forms counted: البلان بلان لبلان فلبلان فالبلان والبلان بلانك بالبلان بلانو للبلان بلاني وبلاني وبلانو بلانها
- Dictionary: [Darija Open Dataset (economy), بلان](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/economy.csv): “plan”
- Dictionary: [Darija Open Dataset (shorts), بلان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “plan”
- Standard Arabic: “بلان (noun): barber surgeon, bath-man”; “بلان (noun): Sarcopoterium spinosum, Sarcopoterium (a monotypic genus)”
- Note in the app: Not MSA بَلَّان (bath attendant).
- Sentence: عندي بلان مزيان.: I've got a good plan.

## 81. ورّى (verb): to show

- Uses: 313.1 per million (230 times). Forms counted: نوريك توريه توريني نوريكم وريني وريت يوريك تتورينا نوريه تورينا تيورينا ورينا ورات وراتو توريك يوري يوريه يوريهم وريه فوريه
- Dictionary: [Darija Open Dataset (shorts), ورّي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “show”
- Standard Arabic: “ورى (noun): creation”; “ورى (noun): mortals, mankind”; “ورى (verb): kindle, catch fire”; “ورى (verb): strike fire”
- Note in the app: Not MSA وَرَّى (to hide a meaning).
- Sentence: ورّيني التصاور.: Show me the photos.

## 82. حبس (verb): to stop

- Uses: 311 per million (280 times). Forms counted: حبس تحبس يحبس حبسو نحبس يحبسو نحبسو فحبس حبسنا حبسات وحبسو كنحبس ماحبسش حبسهم وحبسوه يحبسوه حبسك حبسه حبسها حبست
- Dictionary: [Wiktionary, (Moroccan Arabic), حبس](https://en.wiktionary.org/wiki/%D8%AD%D8%A8%D8%B3#Moroccan_Arabic): “to quit (to give up, stop doing something)”
- Dictionary: [Darija Open Dataset (verbs), حبس](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “stop”
- Dictionary: [Darija Open Dataset (shorts), حبس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “stop”
- Dictionary: [Darija Open Dataset (utils), حبس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “stop”
- Standard Arabic: “حبس (verb): to imprison”; “حبس (verb): to hold back”; “حبس (verb): (transitive) to tie up”
- Note in the app: In MSA حَبَسَ is "to imprison".
- Sentence: حبس هنا عفاك.: Stop here, please.

## 83. لاح (verb): to throw (away)

- Uses: 303 per million (307 times). Forms counted: لحتي يلوح تلوح نلوح لاح لاحو لحت لاحت كيلوح نلوحو لحتو لاحوه لاحونا كيلوحو لاحوني ولاحوه كتلوح لوحو فلاح فلاحه
- Dictionary: [Wiktionary, (Moroccan Arabic), لاح](https://en.wiktionary.org/wiki/%D9%84%D8%A7%D8%AD#Moroccan_Arabic): “to throw, to toss”
- Dictionary: [Darija Open Dataset (verbs), لاح](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “throw”
- Dictionary: [Darija Open Dataset (shorts), لاح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “throw”
- Standard Arabic: “لاح (verb): to appear, to become visible, to begin to shine; (figurative) to glimmer, to emerge, loom, to engender”; “لاح (verb): to appear, to become visible, to begin to shine; (rare) to shine upon; to tan [with accusative]”
- Note in the app: Not MSA لَاحَ (to appear).
- Sentence: لاح الكورة بعيد.: He threw the ball a long way.

## 84. أتاي (noun): tea (mint tea)

- Uses: 295.1 per million (148 times). Forms counted: اتاي الاتاي تاي داتاي تايه واتاي لاتاي والاتاي التاي تايها
- Dictionary: [Wiktionary, (Moroccan Arabic), أتاي](https://en.wiktionary.org/wiki/%D8%A3%D8%AA%D8%A7%D9%8A#Moroccan_Arabic): “tea”
- Dictionary: [Darija Open Dataset (nouns), أتاي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “tea”
- Dictionary: [Darija Open Dataset (food), أتاي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “tea”
- Dictionary: [Darija Open Dataset (shorts), أتاي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “tea”
- Standard Arabic: “اتأى (verb): to receive a promise”
- Note in the app: Not MSA اِتَّأَى (to be promised).
- Sentence: بغيت كاس ديال أتاي.: I'd like a glass of tea.

## 85. ناض (verb): to get up

- Uses: 289.3 per million (340 times). Forms counted: ناض ناضت ناضو نوض تنوض ينوض نضت وناض كتنوض ونوض وينوض وناضت ينوضو كينوض نوضوها نوضو ونضت نضتي نضنا وتنوض
- Dictionary: [Wiktionary, (Moroccan Arabic), ناض](https://en.wiktionary.org/wiki/%D9%86%D8%A7%D8%B6#Moroccan_Arabic): “to stand up”
- Dictionary: [Wiktionary, (Moroccan Arabic), ناض](https://en.wiktionary.org/wiki/%D9%86%D8%A7%D8%B6#Moroccan_Arabic): “to get up”
- Dictionary: [Darija Open Dataset (verbs), ناض](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “get up”
- Dictionary: [Darija Open Dataset (shorts), ناض](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “get up”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: نوض، راك معطّل!: Get up, you're late!

## 86. ماتش (noun): match, game

- Uses: 286.5 per million (152 times). Forms counted: الماتش ماتش لماتش فالماتش فلماتش فماتش فماتشو لماتشو
- Dictionary: [Darija Open Dataset (nouns), ماتش](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “match”
- Dictionary: [Darija Open Dataset (shorts), ماتش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “match”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شفتي الماتش البارح؟: Did you watch the match yesterday?

## 87. سبيتار (noun): hospital

- Uses: 282.6 per million (227 times). Forms counted: السبيطار للسبيطار سبيتار فالسبيطار سبيطار السبيتار فسبيتار لسبيتار للسبيتار فالسبيتار فسبيطار لسبيطار بالسبيطار دالسبيطار
- Dictionary: [Wiktionary, (Moroccan Arabic), سبيطار](https://en.wiktionary.org/wiki/%D8%B3%D8%A8%D9%8A%D8%B7%D8%A7%D8%B1#Moroccan_Arabic): “hospital”
- Dictionary: [Wiktionary, (Moroccan Arabic), سبيتار](https://en.wiktionary.org/wiki/%D8%B3%D8%A8%D9%8A%D8%AA%D8%A7%D8%B1#Moroccan_Arabic): “alternative form of سبيطار (sbīṭār): hospital”
- Dictionary: [Darija Open Dataset (nouns), سبيطار](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “hospital”
- Dictionary: [Darija Open Dataset (health), سبيطار](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/health.csv): “hospital”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشا للسبيتار حيت مريض.: He went to the hospital because he's ill.

## 88. بكري (adv): early; long ago

- Uses: 282.3 per million (145 times). Forms counted: بكري
- Dictionary: [Darija Open Dataset (adjectives), بكري](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “early”
- Dictionary: [Darija Open Dataset (adverbs), بكري](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “early”
- Dictionary: [Darija Open Dataset (shorts), بكري](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “early”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA بُكْرَة (early morning).
- Sentence: كنفيق بكري كل نهار.: I wake up early every day.

## 89. تيق (verb): to trust, to believe

- Uses: 279.8 per million (220 times). Forms counted: تايق تيق نتيق تيقوليك كيتيق تيقو تيقتي تيقولينا ماتيقش تيقوليها نتيقو كيتيقو تيقي تيقني تيقها تيقتك تيقوني وتيقوليك يتيق تيتيق
- Dictionary: [Wiktionary, (Moroccan Arabic), تاق](https://en.wiktionary.org/wiki/%D8%AA%D8%A7%D9%82#Moroccan_Arabic): “(intransitive) to trust [with بـ (b-)]”
- Dictionary: [Wiktionary, (Moroccan Arabic), تيق](https://en.wiktionary.org/wiki/%D8%AA%D9%8A%D9%82#Moroccan_Arabic): “(transitive) to trust”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), وثق](https://en.wiktionary.org/wiki/%D9%88%D8%AB%D9%82#Arabic): “from Arabic وثق: to trust, to place one's confidence”
- Dictionary: [Darija Open Dataset (shorts), تيق](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “trust”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كنتيق فيك.: I trust you.

## 90. تفكّر (verb): to remember

- Uses: 277.5 per million (190 times). Forms counted: تفكر تفكرت كنتفكر نتفكر تفكرو تفكري تفكرني تتفكر ماتفكرش ماتفكري وتفكر تفكرنا تفكرتي تفكرتيني تفكرتيه تفكرات نتفكرو كانتفكر كيتفكر تيتفكر
- Dictionary: [Darija Open Dataset (verbs), تفكّر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “remember”
- Dictionary: [Darija Open Dataset (shorts), تفكّر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “remember”
- Dictionary: [Darija Open Dataset (shorts), تفكّر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he remembered”
- Standard Arabic: “تفكر (verb): to ponder, to reflect”
- Note in the app: In MSA تَفَكَّرَ is "to reflect".
- Sentence: تفكّرت دابا سميتو.: I've just remembered his name.

## 91. واجد (adj): ready

- Uses: 267.1 per million (159 times). Forms counted: واجد واجدين واجده واجدا
- Dictionary: [Wiktionary, (Moroccan Arabic), واجد](https://en.wiktionary.org/wiki/%D9%88%D8%A7%D8%AC%D8%AF#Moroccan_Arabic): “ready, prepared”
- Dictionary: [Darija Open Dataset (adjectives), واجد](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “ready”
- Dictionary: [Darija Open Dataset (shorts), واجد](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “ready”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA وَاجِد (finding).
- Sentence: الماكلة واجدة.: The food is ready.

## 92. عيا (verb): to get tired

- Uses: 247.4 per million (178 times). Forms counted: عييت تعيا عيا عياو عيينا تعياو عيات نعيا يعيا عييتي كيعياو عييتو ماتعياش كنعياو كيعيا فعيا عياك وعياو عيانا عياتني
- Dictionary: [Darija Open Dataset (verbs), عيا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “fatigue”
- Dictionary: [Darija Open Dataset (shorts), عيا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “fatigue”
- Dictionary: [Darija Open Dataset (shorts), عيا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he fatigues”
- Dictionary: [Darija Open Dataset (shorts), عيا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “jade”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عييت بزاف اليوم.: I'm really tired today.

## 93. زرب (verb): to hurry

- Uses: 247.1 per million (149 times). Forms counted: تزرب يزرب زرب زربيه نزرب زربانه زربه زربت نزربو يزربو كنزرب زربان زربتي زربو ماتزربش تزربو وزرب مازربتش زربتو وزربات
- Dictionary: [Wiktionary, (Moroccan Arabic), زرب](https://en.wiktionary.org/wiki/%D8%B2%D8%B1%D8%A8#Moroccan_Arabic): “(intransitive) to hurry”
- Dictionary: [Wiktionary, (Moroccan Arabic), زرب](https://en.wiktionary.org/wiki/%D8%B2%D8%B1%D8%A8#Moroccan_Arabic): “(transitive) to hurry”
- Dictionary: [Darija Open Dataset (verbs), زرب](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “hurry”
- Dictionary: [Darija Open Dataset (shorts), زرب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “hurry”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: زرب، الطوبيس جاي!: Hurry, the bus is coming!

## 94. نتوما (pron): you (more than one)

- Uses: 236.4 per million (183 times). Forms counted: نتوما ونتوما
- Dictionary: [Darija Open Dataset (pronouns), نتوما](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “you”
- Dictionary: [Darija Open Dataset (shorts), نتوما](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “you”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واش نتوما خوت؟: Are you brothers?

## 95. غوّت (verb): to shout

- Uses: 235.9 per million (226 times). Forms counted: كيغوت غوت تغوت غوته كيغوتو يغوت نغوت كتغوت كنغوت كاتغوت وكيغوت وغوت غوتات غوتي ويغوت كايغوت ونغوتو تيغوت ونغوت مانغوتش
- Dictionary: [Wiktionary, (Moroccan Arabic), غوت](https://en.wiktionary.org/wiki/%D8%BA%D9%88%D8%AA#Moroccan_Arabic): “to shout, to scream”
- Dictionary: [Darija Open Dataset (verbs), غوّت](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “shout”
- Dictionary: [Darija Open Dataset (shorts), غوّت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “shout”
- Dictionary: [Darija Open Dataset (shorts), غوّت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he shouted”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: علاش كتغوّت؟: Why are you shouting?

## 96. لور (noun): the back; behind

- Uses: 235.1 per million (205 times). Forms counted: اللور لور للور فلور باللور دلور
- Dictionary: [Darija Open Dataset (nouns), لور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “back”
- Dictionary: [Darija Open Dataset (shorts), لور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “back”
- Dictionary: [Darija Open Dataset (places), اللور](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “back”
- Dictionary: [Darija Open Dataset (shorts), اللور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “back”
- Standard Arabic: “لور (noun): whey cheese”; “لور (noun): the Lor people of southwestern Iran”
- Note in the app: Not MSA لُور (whey cheese).
- Sentence: رجع لللور شوية.: Move back a little.

## 97. أشمن (det): which

- Uses: 217.7 per million (122 times). Forms counted: اشمن واشمن فاشمن
- Dictionary: [Wiktionary, (Moroccan Arabic), أشمن](https://en.wiktionary.org/wiki/%D8%A3%D8%B4%D9%85%D9%86#Moroccan_Arabic): “(interrogative) which?”
- Dictionary: [Darija Open Dataset (shorts), أشمن](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “which”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أشمن واحد بغيتي؟: Which one do you want?

## 98. كحل (adj): black

- Uses: 215.5 per million (210 times). Forms counted: كحله كحل الكحل كحلين الكحله الكحلين فلكحل بالكحل لكحل فالكحل كحلها والكحل للكحل كحلك لكحلين والكحلين
- Dictionary: [Wiktionary, (Moroccan Arabic), كحل](https://en.wiktionary.org/wiki/%D9%83%D8%AD%D9%84#Moroccan_Arabic): “black”
- Dictionary: [Darija Open Dataset (colors), كحل](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/colors.csv): “black”
- Dictionary: [Darija Open Dataset (shorts), كحل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “black”
- Standard Arabic: “كحل (verb): to rub with kohl (stibnite), to paint with kohl”; “كحل (verb): to rub with kohl (stibnite), to paint with kohl”; “كحل (noun): black coloring of the edges of the eyelids”; “كحل (adj): darkened with kohl, dyed black (of the eyelids)”
- Note in the app: Not MSA كُحْل (kohl).
- Sentence: شريت سروال كحل.: I bought black trousers.

## 99. عشية (noun): afternoon

- Uses: 200.5 per million (139 times). Forms counted: العشيه عشيه فالعشيه والعشيه لعشيه بالعشيه دالعشيه وعشيه بلعشيه دلعشيه
- Dictionary: [Wiktionary, (Moroccan Arabic), عشية](https://en.wiktionary.org/wiki/%D8%B9%D8%B4%D9%8A%D8%A9#Moroccan_Arabic): “afternoon”
- Dictionary: [Darija Open Dataset (nouns), عشية](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “afternoon”
- Dictionary: [Darija Open Dataset (shorts), عشية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “afternoon”
- Standard Arabic: “عشية (noun): evening, nightfall”; “عشية (noun): a cloud that comes in the evening”
- Note in the app: In MSA عَشِيَّة is "evening".
- Sentence: نتلاقاو فالعشية.: Let's meet in the afternoon.

## 100. صيفط (verb): to send

- Uses: 197.3 per million (233 times). Forms counted: صيفط صيفطو صيفطات صيفطوه صيفطها وصيفطوه صيفطت صيفطوني وصيفط صيفطوها صيفطونا وصيفطو صيفطاتو صيفطوهم صيفطني سيفط صيفطنا تيسيفط وصيفطات صيفطاتني
- Dictionary: [Wiktionary, (Moroccan Arabic), سيفط](https://en.wiktionary.org/wiki/%D8%B3%D9%8A%D9%81%D8%B7#Moroccan_Arabic): “to send”
- Dictionary: [Darija Open Dataset (verbs), سيفط](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “send”
- Dictionary: [Darija Open Dataset (shorts), سيفط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “send”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صيفط ليا ميساج.: Send me a text.

## 101. زهر (noun): luck

- Uses: 193.3 per million (161 times). Forms counted: الزهر زهر زهره زهرنا زهري زهرهم زهرك زهرو بالزهر زهرها والزهر وزهرك وزهرو فزهر وزهري زهرهوم
- Dictionary: [Wiktionary, (Moroccan Arabic), زهر](https://en.wiktionary.org/wiki/%D8%B2%D9%87%D8%B1#Moroccan_Arabic): “luck”
- Standard Arabic: “زهر (verb): to shine, to be radiant, to give light”
- Note in the app: Not MSA زَهْر (flowers).
- Sentence: عندو الزهر بزاف.: He has a lot of luck.

## 102. خلع (verb): to frighten

- Uses: 191.4 per million (122 times). Forms counted: تخلع تخلعو كيخلع كايخلع خلعتيني خلعني ماتخلعش كتخلع خلع يخلع يخلعو تتخلع خلعه خلعك خلعها نخلعك نخلعو ماتخلعوش يخلعني يخلعنا
- Dictionary: [Darija Open Dataset (verbs), خلع](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “frighten”
- Dictionary: [Darija Open Dataset (shorts), خلع](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “frighten”
- Dictionary: [Darija Open Dataset (shorts), خلع](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he frightened”
- Standard Arabic: “خلع (verb): to take (an item of clothing) off (one's or someone else's body), to remove; to pull off; to strip off”; “خلع (verb): to remove by pulling, to take out, to pull out, to extract”; “خلع (verb): (chiefly Modern Standard Arabic) to remove from power, to overthrow, to oust, to topple”; “خلع (verb): (Islam, of a woman) to divorce (one's husband) under a divorce settlement whereby the woman agrees to give away an amount of money or property to the man or to forgo her right thereto”
- Note in the app: Not MSA خَلَعَ (to take off).
- Sentence: خلعتيني بزاف!: You really scared me!

## 103. روينة (noun): mess, chaos

- Uses: 189.9 per million (233 times). Forms counted: الروينه روينه والروينه وروينه فالروينه للروينه
- Dictionary: [Wiktionary, (Moroccan Arabic), روينة](https://en.wiktionary.org/wiki/%D8%B1%D9%88%D9%8A%D9%86%D8%A9#Moroccan_Arabic): “mess, wreck”
- Dictionary: [Darija Open Dataset (nouns), روينة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “mess”
- Dictionary: [Darija Open Dataset (shorts), روينة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “mess”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدار فيها روينة.: The house is a mess.

## 104. تهلّا (verb): to take care (of); take care!, bye

- Uses: 188.5 per million (175 times). Forms counted: تهلاو تهلا طهلا تهلاي وتهلاو كيتهلا وتهلا تيتهلا نتهلا كنتهلا
- Dictionary: [Darija Open Dataset (shorts), تهلّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bye”
- Dictionary: [Darija Open Dataset (shorts), طهلّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “take care”
- Dictionary: [Darija Open Dataset (utils), طهلّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “take care”
- Dictionary: [Darija Open Dataset (weird), طهلّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/weird.csv): “bye”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: تهلّا فراسك.: Take care of yourself.

## 105. زنقة (noun): street

- Uses: 185 per million (120 times). Forms counted: زنقه الزنقه فالزنقه للزنقه فزنقه وزنقه لزنقه والزنقه
- Dictionary: [Wiktionary, (Moroccan Arabic), زنقة](https://en.wiktionary.org/wiki/%D8%B2%D9%86%D9%82%D8%A9#Moroccan_Arabic): “street, alley”
- Dictionary: [Darija Open Dataset (nouns), زنقة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “street”
- Dictionary: [Darija Open Dataset (shorts), زنقة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “street”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ساكن فزنقة صغيرة.: I live on a small street.

## 106. شفر (verb): to steal

- Uses: 181.7 per million (154 times). Forms counted: شفر تشفر يشفر يشفرو شفرو كيشفر شفره نشفر شفرك شفرتي تشفرو كيشفرو شفرنا شفرت شفروه نشفرو ويشفر وكيشفرو تيشفر وشفر
- Dictionary: [Wiktionary, (Moroccan Arabic), شفر](https://en.wiktionary.org/wiki/%D8%B4%D9%81%D8%B1#Moroccan_Arabic): “to steal”
- Dictionary: [Darija Open Dataset (verbs), شفر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “steal”
- Dictionary: [Darija Open Dataset (shorts), شفر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “steal”
- Standard Arabic: “شفر (verb): to encode, to encrypt, to encipher”
- Note in the app: Not MSA شَفَّرَ (to encode).
- Sentence: شفرو ليه البزطام.: They stole his wallet.

## 107. شرجم (noun): window

- Uses: 180.4 per million (118 times). Forms counted: الشرجم شرجم فشرجم للشرجم والشرجم دالشرجم وشرجم فالشرجم سرجم
- Dictionary: [Wiktionary, (Moroccan Arabic), شرجم](https://en.wiktionary.org/wiki/%D8%B4%D8%B1%D8%AC%D9%85#Moroccan_Arabic): “alternative form of شرجب (“window”)”
- Dictionary: [Wiktionary, (Moroccan Arabic), شرجب](https://en.wiktionary.org/wiki/%D8%B4%D8%B1%D8%AC%D8%A8#Moroccan_Arabic): “window”
- Dictionary: [Wiktionary, (Moroccan Arabic), سرجم](https://en.wiktionary.org/wiki/%D8%B3%D8%B1%D8%AC%D9%85#Moroccan_Arabic): “alternative form of شرجب (“window”)”
- Dictionary: [Darija Open Dataset (nouns), شرجم](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “window”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: حل الشرجم عفاك.: Open the window, please.

## 108. باراكا (intj): enough!, stop it

- Uses: 179.6 per million (88 times). Forms counted: باراكا وباراكا باركا
- Dictionary: [Darija Open Dataset (shorts), باراكا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “enough”
- Dictionary: [Darija Open Dataset (utils), باراكا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “enough”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: باراكا من الهضرة!: Enough talking!

## 109. طابلة (noun): table

- Uses: 179.3 per million (122 times). Forms counted: الطابله طابله طبله الطبله فطابله فالطابله فالطبله للطبله
- Dictionary: [Wiktionary, (Moroccan Arabic), طابلة](https://en.wiktionary.org/wiki/%D8%B7%D8%A7%D8%A8%D9%84%D8%A9#Moroccan_Arabic): “(furniture) table”
- Dictionary: [Darija Open Dataset (nouns), طبلة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “table”
- Dictionary: [Darija Open Dataset (shorts), طبلة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “table”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: حط الماكلة على الطابلة.: Put the food on the table.

## 110. صاوب (verb): to make, to fix

- Uses: 178.5 per million (199 times). Forms counted: تصاوب يصاوبو صاوب يصاوب نصاوبو صاوبو نصاوب كتصاوب صاوبت كيصاوب تصاوبو صاوبتي كنصاوبو كيصاوبو وتصاوب كنصاوب كانصاوبو وصاوبو صاوبات صاوبوها
- Dictionary: [Darija Open Dataset (verbs), صاوب](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “prepare”
- Dictionary: [Darija Open Dataset (verbs), صاوب](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “create”
- Dictionary: [Darija Open Dataset (shorts), صاوب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “create”
- Dictionary: [Darija Open Dataset (shorts), صاوب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he created”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صاوب ليا أتاي.: Make me some tea.

## 111. عيالات (noun): women

- Uses: 177.4 per million (176 times). Forms counted: العيالات عيالات دالعيالات وعيالات لعيالات عيالاتهم والعيالات عيالاتو بالعيالات للعيالات دلعيالات فالعيالات عيالاتي بعيالاتو
- Dictionary: [Darija Open Dataset (nouns), عيالات](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “women”
- Dictionary: [Darija Open Dataset (shorts), عيالات](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “women”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: العيالات فالكوزينة.: The women are in the kitchen.

## 112. كادو (noun): present, gift

- Uses: 175.2 per million (88 times). Forms counted: كادو كادوي الكادو لكادو وكادوي
- Dictionary: [Wiktionary, (Moroccan Arabic), كادو](https://en.wiktionary.org/wiki/%D9%83%D8%A7%D8%AF%D9%88#Moroccan_Arabic): “gift”
- Dictionary: [Darija Open Dataset (shorts), كادو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “gift”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جبت ليك كادو.: I brought you a present.

## 113. تقدا (verb): to do the shopping

- Uses: 174.6 per million (80 times). Forms counted: تقدا نتقدا تقديه تقديت نتقداو تقديتي تقدينا تقداو تقدي وتقدا تقدات نتقدي وتقدي
- Dictionary: [Darija Open Dataset (shorts), تقدّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he shopped”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: خاصني نتقدا اليوم.: I need to do the shopping today.

## 114. عيان (adj): tired

- Uses: 170.6 per million (91 times). Forms counted: عيان عيانه العيان عيانين وعيان والعيان للعيان العيانه عيانا عياني
- Dictionary: [Wiktionary, (Moroccan Arabic), عيان](https://en.wiktionary.org/wiki/%D8%B9%D9%8A%D8%A7%D9%86#Moroccan_Arabic): “tired”
- Dictionary: [Darija Open Dataset (adjectives), عيّان](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “tired”
- Dictionary: [Darija Open Dataset (shorts), عيّان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “tired”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA عِيَان (seeing with your own eyes).
- Sentence: أنا عيان بزاف.: I'm very tired.

## 115. بشوية (adv): slowly, gently

- Uses: 166.5 per million (134 times). Forms counted: بشويه وبشويه
- Dictionary: [Darija Open Dataset (shorts), بشوية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “slowly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هضر بشوية عفاك.: Speak slowly, please.

## 116. معطّل (adj): late

- Uses: 164 per million (87 times). Forms counted: معطل معطله معطلين معطلا
- Dictionary: [Darija Open Dataset (adjectives), معطّل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “late”
- Dictionary: [Darija Open Dataset (shorts), معطّل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “late”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: In MSA مُعَطَّل is "out of order".
- Sentence: سمح ليا، أنا معطّل.: Sorry, I'm late.

## 117. ميساج (noun): text message

- Uses: 163.4 per million (137 times). Forms counted: ميساج الميساج مساج المساج بميساج وميساج فميساج لميساج والميساج والمساج بالمساج للمساج
- Dictionary: [Darija Open Dataset (nouns), ميساج](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “message”
- Dictionary: [Darija Open Dataset (shorts), ميساج](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “message”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صيفطت ليك ميساج.: I sent you a text.

## 118. كليان (noun): customer

- Uses: 155.6 per million (122 times). Forms counted: الكليان كليان لكليان للكليان والكليان بالكليان دلكليان فالكليان كليانه
- Dictionary: [Darija Open Dataset (nouns), كليان](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “customer”
- Dictionary: [Darija Open Dataset (shorts), كليان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “customer”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الكليان ديما عندو الحق.: The customer is always right.

## 119. قرعة (noun): bottle

- Uses: 154.1 per million (93 times). Forms counted: قرعه القرعه لقرعه فالقرعه وقرعه فقرعه
- Dictionary: [Wiktionary, (Moroccan Arabic), قرعة](https://en.wiktionary.org/wiki/%D9%82%D8%B1%D8%B9%D8%A9#Moroccan_Arabic): “bottle”
- Dictionary: [Darija Open Dataset (nouns), قرعة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “bottle”
- Dictionary: [Darija Open Dataset (shorts), قرعة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bottle”
- Standard Arabic: “قرعة (noun): an act of drawing lots, drawing straws, toss; lottery; raffle”; “قرعة (noun): pumpkin, gourd”
- Note in the app: Not MSA قُرْعَة (a draw, a lottery).
- Sentence: جيب قرعة ديال الما.: Bring a bottle of water.

## 120. بزربة (adv): in a hurry, quickly

- Uses: 152.6 per million (82 times). Forms counted: بزربه بالزربه
- Dictionary: [Wiktionary, (Moroccan Arabic), بالزربة](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D9%84%D8%B2%D8%B1%D8%A8%D8%A9#Moroccan_Arabic): “quickly”
- Dictionary: [Darija Open Dataset (adverbs), بزّربة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “quickly”
- Dictionary: [Darija Open Dataset (shorts), بزّربة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “quickly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشا بزربة.: He left in a hurry.

## 121. واقيلا (adv): maybe, it seems

- Uses: 150.4 per million (83 times). Forms counted: واقيلا
- Dictionary: [Darija Open Dataset (shorts), واقيلا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “maybe”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واقيلا غادي يجي غدا.: Maybe he'll come tomorrow.

## 122. قاسح (adj): hard; tough

- Uses: 150 per million (106 times). Forms counted: قاسح قاصح قاصحه قاسحه قاصحين القاسحه القاصح لقاسح القاسح وقاسحه قاسحين وقاسحين فالقاصح القاصحه
- Dictionary: [Wiktionary, (Moroccan Arabic), قاسح](https://en.wiktionary.org/wiki/%D9%82%D8%A7%D8%B3%D8%AD#Moroccan_Arabic): “hard”
- Dictionary: [Darija Open Dataset (adjectives), قاسح](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “hard”
- Dictionary: [Darija Open Dataset (shorts), قاسح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “hard”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هاد الخبز قاسح.: This bread is hard.

## 123. موتور (noun): motorbike

- Uses: 144.4 per million (81 times). Forms counted: الموتور الموطور موتور موتير موطور بموتور لموتور بالموتور بالموطور موتوري بموطور لموطور دلموطور موطوري
- Dictionary: [Darija Open Dataset (nouns), موتور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “motorcycle”
- Dictionary: [Darija Open Dataset (shorts), موتور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “motorcycle”
- Dictionary: [Darija Open Dataset (nouns), موطور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “engine”
- Dictionary: [Darija Open Dataset (nouns), موطور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “motor”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جا فوق موتور.: He came on a motorbike.

## 124. عافية (noun): fire

- Uses: 142.8 per million (99 times). Forms counted: العافيه عافيه دعافيتي والعافيه بالعافيه لعافيه فالعافيه دالعافيه
- Dictionary: [Wiktionary, (Moroccan Arabic), عافية](https://en.wiktionary.org/wiki/%D8%B9%D8%A7%D9%81%D9%8A%D8%A9#Moroccan_Arabic): “fire”
- Dictionary: [Darija Open Dataset (nouns), عافية](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “fire”
- Dictionary: [Darija Open Dataset (environment), عافية](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/environment.csv): “fire”
- Dictionary: [Darija Open Dataset (shorts), عافية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “fire”
- Standard Arabic: “عافية (noun): health”
- Note in the app: In MSA عَافِيَة is "good health".
- Sentence: شعل العافية.: Light the fire.

## 125. بيرو (noun): office; desk

- Uses: 142.7 per million (108 times). Forms counted: البيرو بورو للبيرو بيرو البورو فالبيرو لبورو لبيرو فبيرو فلبيرو ولبيرو والبيرو دلبورو بوروك
- Dictionary: [Darija Open Dataset (nouns), بيرو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “desk”
- Dictionary: [Darija Open Dataset (shorts), بيرو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “desk”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أنا فالبيرو دابا.: I'm at the office now.

## 126. تران (noun): train

- Uses: 142.5 per million (124 times). Forms counted: التران تران فتران لتران بالتران للتران وتران والتران
- Dictionary: [Wiktionary, (Moroccan Arabic), تران](https://en.wiktionary.org/wiki/%D8%AA%D8%B1%D8%A7%D9%86#Moroccan_Arabic): “(transport, railway) train”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: غادي نمشي لفاس فالتران.: I'm going to Fes by train.

## 127. فينما (adv): wherever

- Uses: 141.1 per million (126 times). Forms counted: فينما وفينما لفينما
- Dictionary: [Darija Open Dataset (adverbs), فينمّا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “everywhere”
- Dictionary: [Darija Open Dataset (places), فينمّا](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “anywhere”
- Dictionary: [Darija Open Dataset (shorts), فينمّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “anywhere”
- Dictionary: [Darija Open Dataset (shorts), فينمّا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “everywhere”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فينما مشيتي، عيط ليا.: Wherever you go, call me.

## 128. بجوج (adv): both, the two of

- Uses: 138.4 per million (129 times). Forms counted: بجوج وبجوج
- Dictionary: [Wiktionary, (Moroccan Arabic), بجوج](https://en.wiktionary.org/wiki/%D8%A8%D8%AC%D9%88%D8%AC#Moroccan_Arabic): “both”
- Dictionary: [Darija Open Dataset (adverbs), بجوج](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “both”
- Dictionary: [Darija Open Dataset (shorts), بجوج](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “both”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بجوج مزيانين.: Both are good.

## 129. شفّار (noun): thief

- Uses: 130.2 per million (80 times). Forms counted: شفار شفاره الشفار وشفار بالشفار شفاري وشفاره
- Dictionary: [Darija Open Dataset (nouns), شفار](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “thief”
- Dictionary: [Darija Open Dataset (shorts), شفار](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “thief”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شدو الشفّار.: They caught the thief.

## 130. قاس (verb): to touch

- Uses: 126.4 per million (117 times). Forms counted: قاس تقيس يقيس كيقيس تقيسو كتقيس نقيس كنقيس وقاس يقيسو كنقيسو كيقيسو تيقيس قاسو قاسها قست قستك قستو تقيسش ماتقيسنيش
- Dictionary: [Wiktionary, (Moroccan Arabic), قاس](https://en.wiktionary.org/wiki/%D9%82%D8%A7%D8%B3#Moroccan_Arabic): “to touch, to feel”
- Dictionary: [Darija Open Dataset (verbs), قاس](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “touch”
- Dictionary: [Darija Open Dataset (shorts), قاس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “touch”
- Dictionary: [Darija Open Dataset (shorts), قاس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he touched”
- Standard Arabic: “قاس (adj): hard, stiff, solid”; “قاس (adj): harsh, severe, strict”; “قاس (adj): extreme, heavy”
- Note in the app: Not MSA قَاسَ (to measure).
- Sentence: ماتقيسش هادشي!: Don't touch that!

## 131. جردة (noun): garden; park

- Uses: 125.6 per million (67 times). Forms counted: جرده الجرده فجرده فالجرده للجرده لجرده فلجرده
- Dictionary: [Wiktionary, (Moroccan Arabic), جردة](https://en.wiktionary.org/wiki/%D8%AC%D8%B1%D8%AF%D8%A9#Moroccan_Arabic): “garden”
- Dictionary: [Darija Open Dataset (nouns), جردة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “garden”
- Dictionary: [Darija Open Dataset (nouns), جردة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “park”
- Dictionary: [Darija Open Dataset (shorts), جردة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “park”
- Standard Arabic: “جردة (noun): state of undress, being stripped of one’s vesture”
- Note in the app: Not MSA جَرْدَة (bareness).
- Sentence: الدراري كيلعبو فالجردة.: The kids are playing in the park.

## 132. غبر (verb): to disappear

- Uses: 125.5 per million (125 times). Forms counted: غبر غبرات يغبر غبرو غبرتي غبره نغبر كيغبر وغبر غبرت تغبر كيغبرو يغبرو كتغبر وغبرو غبروه نغبرو وتغبر ماتغبرش وكيغبر
- Dictionary: [Darija Open Dataset (verbs), غبر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “disappear”
- Dictionary: [Darija Open Dataset (shorts), غبر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “disappear”
- Dictionary: [Darija Open Dataset (shorts), غبر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he disappeared”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فين غبرتي؟: Where have you disappeared to?

## 133. ليمون (noun): oranges

- Uses: 125 per million (59 times). Forms counted: ليمون ليمونه الليمون ليموني دليمون
- Dictionary: [Wiktionary, (Moroccan Arabic), ليمون](https://en.wiktionary.org/wiki/%D9%84%D9%8A%D9%85%D9%88%D9%86#Moroccan_Arabic): “oranges (fruit)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: In MSA لَيْمُون is "lemon".
- Sentence: عصرت الليمون للدراري.: I squeezed oranges for the kids.

## 134. ديسير (noun): dessert

- Uses: 120.9 per million (54 times). Forms counted: ديسير الديسير للديسير
- Dictionary: [Darija Open Dataset (food), ديسير](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “desserts”
- Dictionary: [Darija Open Dataset (shorts), ديسير](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “desserts”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شنو كاين فالديسير؟: What's for dessert?

## 135. حومة (noun): neighbourhood

- Uses: 120.8 per million (141 times). Forms counted: الحومه حومه فالحومه للحومه حومتي حومتنا فحومه بحومه حومتو لحومه دلحومه بالحومه وحومتي فحومتو لحومتو فحومتنا فحومتهم
- Dictionary: [Wiktionary, (Moroccan Arabic), حومة](https://en.wiktionary.org/wiki/%D8%AD%D9%88%D9%85%D8%A9#Moroccan_Arabic): “neighborhood, quarter”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), حومة](https://en.wiktionary.org/wiki/%D8%AD%D9%88%D9%85%D8%A9#Arabic): “from Arabic حومة: heart of the fight, turmoil of battle”
- Dictionary: [Wiktionary, (Arabic, labelled Moroccan), حومة](https://en.wiktionary.org/wiki/%D8%AD%D9%88%D9%85%D8%A9#Arabic): “(chiefly Maghreb) neighborhood, quarter”
- Dictionary: [Darija Open Dataset (nouns), حومة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “neighborhood”
- Standard Arabic: “حومة (noun): heart of the fight, turmoil of battle”; “حومة (noun): main part, main body”
- Note in the app: Not MSA حَوْمَة (the thick of a battle).
- Sentence: كنعرف ڭاع الناس فالحومة.: I know everyone in the neighbourhood.

## 136. نوّض (verb): to wake (someone) up; to get going

- Uses: 115.7 per million (127 times). Forms counted: نوض تنوض ينوض ونوض كتنوض وينوض نوضات ينوضو كينوض نوضتها نوضوها نوضو نوضتو وتنوض كينوضو نوضها وينوضو ينوضوها وكتنوض ونوضو
- Dictionary: [Wiktionary, (Moroccan Arabic), ناض](https://en.wiktionary.org/wiki/%D9%86%D8%A7%D8%B6#Moroccan_Arabic): “to stand up”
- Dictionary: [Wiktionary, (Moroccan Arabic), ناض](https://en.wiktionary.org/wiki/%D9%86%D8%A7%D8%B6#Moroccan_Arabic): “to get up”
- Dictionary: [Darija Open Dataset (shorts), نوض](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “get up”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: نوّضني على سبعة.: Wake me up at seven.

## 137. بالخف (adv): quickly, fast

- Uses: 113.1 per million (137 times). Forms counted: بالخف وبالخف
- Dictionary: [Wiktionary, (Moroccan Arabic), بالخف](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D9%84%D8%AE%D9%81#Moroccan_Arabic): “quickly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الطونوبيل كتمشي بالخف.: The car goes fast.

## 138. عزل (verb): to choose, to pick out

- Uses: 111.8 per million (81 times). Forms counted: يعزل تعزل عزل يعزلو نعزل عزلو عزلتي عزلات عزلوني نعزلو يعزلها وعزل عزلك فعزله عزلها عزلت عزلوها عزلوهم ونعزل نعزلك
- Dictionary: [Darija Open Dataset (verbs), عزل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “pick”
- Dictionary: [Darija Open Dataset (shorts), عزل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he picked”
- Dictionary: [Darija Open Dataset (shorts), عزل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pick”
- Standard Arabic: “عزل (verb): to remove, to set aside, to isolate, to separate, to segregate, to detach, to cut off”; “عزل (verb): to depose, to release, to dismiss, to discharge”; “عزل (noun): removal, dissociation, detachment, setting aside, isolation, cutting off, segregation, separation, (medicine) quarantine”; “عزل (noun): deposition, discharge, dismissal”
- Note in the app: Not MSA عَزَلَ (to isolate).
- Sentence: عزل اللي بغيتي.: Pick the one you want.

## 139. صونا (verb): to ring

- Uses: 111.5 per million (77 times). Forms counted: صونا يصوني كيصوني كايسوني تصوني صونات كايصوني سونيت سونات سونيتي صونيت نصوني صوني سونا صوناو وصوناو وتصوني يصونيو وتيصونيو وصوني
- Dictionary: [Darija Open Dataset (verbs), صونا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “ring”
- Dictionary: [Darija Open Dataset (shorts), صونا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “ring”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: التيليفون صونا.: The phone rang.

## 140. عاق (verb): to notice, to realise

- Uses: 102.5 per million (84 times). Forms counted: عاق تعيق يعيق عقت يعيقو عاقو نعيق عاقت عاقوش عاقليا عاقلو ماعقتش ماعقتيش وعاقت مانعيق نعيقو ماتعيقش تعيقش ماتعيق ويعيق
- Dictionary: [Darija Open Dataset (verbs), عاق](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “realize”
- Dictionary: [Darija Open Dataset (shorts), عاق](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he realized”
- Dictionary: [Darija Open Dataset (shorts), عاق](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “realize”
- Standard Arabic: “عاق (verb): to hamper, to be an obstacle to, to obstruct, to impair, to impede, to hinder”
- Note in the app: Not MSA عَاقَ (to hinder).
- Sentence: عقت بيه ملي دخل.: I noticed him when he came in.

## 141. كوزينة (noun): kitchen

- Uses: 100.2 per million (74 times). Forms counted: الكوزينه للكوزينه فالكوزينه كوزينه والكوزينه دالكوزينه كوزينتك كوزينتهم
- Dictionary: [Wiktionary, (Moroccan Arabic), كوزينة](https://en.wiktionary.org/wiki/%D9%83%D9%88%D8%B2%D9%8A%D9%86%D8%A9#Moroccan_Arabic): “kitchen”
- Dictionary: [Darija Open Dataset (nouns), كوزينة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “kitchen”
- Dictionary: [Darija Open Dataset (shorts), كوزينة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “kitchen”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الماكلة فالكوزينة.: The food is in the kitchen.

## 142. فوقاش (adv): when?

- Uses: 95.9 per million (85 times). Forms counted: فوقاش وفوقاش لفوقاش
- Dictionary: [Wiktionary, (Moroccan Arabic), وقتاش](https://en.wiktionary.org/wiki/%D9%88%D9%82%D8%AA%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) when?”
- Dictionary: [Wiktionary, (Moroccan Arabic), فوقاش](https://en.wiktionary.org/wiki/%D9%81%D9%88%D9%82%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) alternative form of وقتاش (waqtāš): when?”
- Dictionary: [Darija Open Dataset (pronouns), فوقاش](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “when”
- Dictionary: [Darija Open Dataset (shorts), فوقاش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “when”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فوقاش غادي تجي؟: When are you coming?

## 143. زبل (noun): rubbish, trash

- Uses: 95.2 per million (66 times). Forms counted: زبل الزبل والزبل زبله بزبل دالزبل فالزبل بالزبل للزبل زبلو زبلها
- Dictionary: [Darija Open Dataset (nouns), زبل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “trash”
- Dictionary: [Darija Open Dataset (shorts), زبل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “trash”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: MSA زِبْل is "dung".
- Sentence: لوح الزبل عفاك.: Throw out the rubbish, please.

## 144. طواليط (noun): toilet

- Uses: 94.2 per million (112 times). Forms counted: الطواليط للطواليط طواليط فالطواليط لطواليط وطواليط بالطواليط طواليت بطواليط والطواليط
- Dictionary: [Wiktionary, (Moroccan Arabic), طواليط](https://en.wiktionary.org/wiki/%D8%B7%D9%88%D8%A7%D9%84%D9%8A%D8%B7#Moroccan_Arabic): “toilet”
- Dictionary: [Darija Open Dataset (nouns), طواليت](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “toilet”
- Dictionary: [Darija Open Dataset (shorts), طواليت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “toilet”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فين الطواليط؟: Where's the toilet?

## 145. ريسطورة (noun): restaurant

- Uses: 93.5 per million (53 times). Forms counted: ريسطوره الريسطو ريسطو لريسطوره الريسطوره للريسطو فريسطو لريسطو
- Dictionary: [Wiktionary, (Moroccan Arabic), ريسطورة](https://en.wiktionary.org/wiki/%D8%B1%D9%8A%D8%B3%D8%B7%D9%88%D8%B1%D8%A9#Moroccan_Arabic): “restaurant”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: تعشينا فريسطورة زوينة.: We had dinner at a nice restaurant.

## 146. تقلق (verb): to get upset, to get angry

- Uses: 93.4 per million (42 times). Forms counted: تقلق ماتقلقش نتقلق تقلقتي مانتقلقش يتقلق وتقلق ماتقلق تقلقك تقلقو تقلقت ماتقلقتيش تقلقات مايتقلقش كيتقلق تقلقي ماتقلقيش ماتقلقي
- Dictionary: [Wiktionary, (Moroccan Arabic), قلق](https://en.wiktionary.org/wiki/%D9%82%D9%84%D9%82#Moroccan_Arabic): “to upset, to anger, to worry”
- Dictionary: [Darija Open Dataset (verbs), تقلّق](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “upset”
- Dictionary: [Darija Open Dataset (shorts), تقلّق](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “upset”
- Dictionary: [Darija Open Dataset (shorts), تقلّق](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he upset”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: In MSA قَلِقَ is "to be worried".
- Sentence: تقلقت بزاف من هادشي.: I got really upset about this.

## 147. توحّش (verb): to miss (someone)

- Uses: 93 per million (47 times). Forms counted: توحشت توحشتك توحشتو توحشتكم توحشناك توحشو توحشنا توحشتها توحشتي ماتوحشتيش توحشتيها توحشات توحشتوني نتوحش نتوحشك
- Dictionary: [Darija Open Dataset (shorts), توحش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “miss”
- Dictionary: [Darija Open Dataset (shorts), توحشت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “I miss”
- Standard Arabic: “توحش (verb): to be unsocial, unsociable, unfamiliar or shy”; “توحش (verb): to act wild, savage, monstrous, brutal, barbarous, untamed, bestial or feral”; “توحش (verb): to be desolate, deserted, waste”
- Note in the app: In MSA تَوَحَّشَ is "to become wild".
- Sentence: توحّشتك بزاف.: I missed you a lot.

## 148. مقلق (adj): angry, upset

- Uses: 88.8 per million (40 times). Forms counted: مقلق مقلقه المقلق مقلقك مقلقاك مقلقاه
- Dictionary: [Wiktionary, (Moroccan Arabic), قلق](https://en.wiktionary.org/wiki/%D9%82%D9%84%D9%82#Moroccan_Arabic): “to upset, to anger, to worry”
- Dictionary: [Wiktionary, (Moroccan Arabic), مقلق](https://en.wiktionary.org/wiki/%D9%85%D9%82%D9%84%D9%82#Moroccan_Arabic): “angry, upset”
- Standard Arabic: “مقلق (adj): disturbing, disquieting, worrying”
- Note in the app: In MSA مُقْلِق is "worrying".
- Sentence: علاش نتا مقلق؟: Why are you upset?

## 149. زعم (verb): to dare

- Uses: 88.1 per million (50 times). Forms counted: زعمه زعم زعمت يزعم تزعم يزعمو زعمو زعموش وزعمت مازعمتش زعمتش زعمتك زعمتها زعمتنا زعمات نزعم نزعمو ماتزعمش كنزعمو ماكانزعمهمش
- Dictionary: [Darija Open Dataset (verbs), زعم](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “dare”
- Dictionary: [Darija Open Dataset (shorts), زعم](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “dare”
- Standard Arabic: “زعم (verb): to claim”; “زعم (verb): to say, to pretend, to assert”; “زعم (verb): to be of the opinion”; “زعم (verb): to talk over, to give one's opinion on (a subject)”
- Note in the app: Not MSA زَعَمَ (to claim).
- Sentence: زعم وهضر معاها.: He got up the nerve and spoke to her.

## 150. بلاتي (intj): wait!, slowly

- Uses: 81.4 per million (69 times). Forms counted: بلاتي وبلاتي
- Dictionary: [Darija Open Dataset (shorts), بلّاتي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “wait”
- Dictionary: [Darija Open Dataset (utils), بلّاتي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “wait”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بلاتي، ماتزربش!: Slow down, don't rush!

## 151. لهيه (adv): over there

- Uses: 80.9 per million (63 times). Forms counted: لهيه ولهيه
- Dictionary: [Darija Open Dataset (adverbs), لهيه](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “there”
- Dictionary: [Darija Open Dataset (shorts), لهيه](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “there”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدار ديالي لهيه.: My house is over there.

## 152. كار (noun): coach (long-distance bus)

- Uses: 80.2 per million (53 times). Forms counted: الكار كار لكار فالكار فكار للكار بكارو
- Dictionary: [Wiktionary, (Moroccan Arabic), كار](https://en.wiktionary.org/wiki/%D9%83%D8%A7%D8%B1#Moroccan_Arabic): “interurban bus”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشيت لمراكش فالكار.: I went to Marrakech by coach.

## 153. طوبيس (noun): bus

- Uses: 78.7 per million (53 times). Forms counted: طوبيس الطوبيس فطوبيس فالطوبيس للطوبيس
- Dictionary: [Darija Open Dataset (nouns), طوبيس](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “bus”
- Dictionary: [Darija Open Dataset (shorts), طوبيس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bus”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كنشد الطوبيس كل صباح.: I take the bus every morning.

## 154. تلف (verb): to get lost

- Uses: 78.6 per million (62 times). Forms counted: تلفت تلف يتلف وتلف تلفو وتلفت كايتلف تلفنا تلفتش تلفتو تلفتهم تلفتي تلفتينا تلفاتنا تلفوني نتلف نتلفو مانتلفوش يتلفش مايتلف
- Dictionary: [Wiktionary, (Moroccan Arabic), تلف](https://en.wiktionary.org/wiki/%D8%AA%D9%84%D9%81#Moroccan_Arabic): “to get lost”
- Dictionary: [Wiktionary, (Moroccan Arabic), تلف](https://en.wiktionary.org/wiki/%D8%AA%D9%84%D9%81#Moroccan_Arabic): “to cause to get lost, to make someone get lost”
- Standard Arabic: “تلف (verb): to perish, to become marred, to be spoiled, to suffer annihilation”; “تلف (verb): to make perish, to spoil, to ruin, to destroy”
- Note in the app: In MSA تَلِفَ is "to be damaged".
- Sentence: تلفت فالمدينة القديمة.: I got lost in the old town.

## 155. كسيدة (noun): accident

- Uses: 77.9 per million (52 times). Forms counted: كسيده الكسيده لكسيده بكسيده فكسيده بالكسيده
- Dictionary: [Wiktionary, (Moroccan Arabic), كسيدة](https://en.wiktionary.org/wiki/%D9%83%D8%B3%D9%8A%D8%AF%D8%A9#Moroccan_Arabic): “accident”
- Dictionary: [Darija Open Dataset (nouns), كسيدة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “accident”
- Dictionary: [Darija Open Dataset (shorts), كسيدة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “accident”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وقعات كسيدة فالطريق.: There was an accident on the road.

## 156. خشى (verb): to put in, to push in

- Uses: 77.7 per million (70 times). Forms counted: خشي تخشي خشا خشيت نخشي خشات وتخشي يخشي يخشيوها كتخشي كيخشي وخشاه وخشي خشيتك وخشيتو وخشاتو وخشاوني وخشاوه ونخشي نخشيو
- Dictionary: [Darija Open Dataset (shorts), خشي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “insert”
- Dictionary: [Darija Open Dataset (verbs), خشا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “insert”
- Dictionary: [Darija Open Dataset (shorts), خشا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “insert”
- Dictionary: [Darija Open Dataset (shorts), خشا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he inserted”
- Standard Arabic: “خشي (verb): to fear”
- Note in the app: Not MSA خَشِيَ (to fear).
- Sentence: خشي الساروت فالباب.: Put the key in the door.

## 157. بنين (adj): tasty, delicious

- Uses: 76.6 per million (36 times). Forms counted: بنين بنينه بنينا وبنينه البنين البنينه لبنينا بنيناه
- Dictionary: [Wiktionary, (Moroccan Arabic), بنين](https://en.wiktionary.org/wiki/%D8%A8%D9%86%D9%8A%D9%86#Moroccan_Arabic): “delicious”
- Dictionary: [Darija Open Dataset (adjectives), بنين](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “delicious”
- Dictionary: [Darija Open Dataset (food), بنين](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “delicious”
- Dictionary: [Darija Open Dataset (shorts), بنين](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “delicious”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA بَنِين (sons).
- Sentence: الحريرة بنينة بزاف.: The harira is really tasty.

## 158. صباط (noun): shoes

- Uses: 76.5 per million (63 times). Forms counted: الصباط صباط صباطي السباط وصباط صباطك صباطو سباط فالصباط بالصباط فصباطي فصباطك فصباطو صباطها بالسباط سباطك
- Dictionary: [Wiktionary, (Moroccan Arabic), صباط](https://en.wiktionary.org/wiki/%D8%B5%D8%A8%D8%A7%D8%B7#Moroccan_Arabic): “alternative form of سباط (subbāṭ, sabbāṭ)”
- Dictionary: [Wiktionary, (Moroccan Arabic), سباط](https://en.wiktionary.org/wiki/%D8%B3%D8%A8%D8%A7%D8%B7#Moroccan_Arabic): “shoe”
- Dictionary: [Darija Open Dataset (clothes), سبّاط](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “shoe”
- Dictionary: [Darija Open Dataset (shorts), سبّاط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “shoe”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شريت صباط جديد.: I bought new shoes.

## 159. ساروت (noun): key

- Uses: 75.2 per million (65 times). Forms counted: الساروت ساروت والساروت وساروت بالساروت ساروتك
- Dictionary: [Wiktionary, (Moroccan Arabic), ساروت](https://en.wiktionary.org/wiki/%D8%B3%D8%A7%D8%B1%D9%88%D8%AA#Moroccan_Arabic): “key”
- Dictionary: [Darija Open Dataset (nouns), ساروت](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “key”
- Dictionary: [Darija Open Dataset (shorts), ساروت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “key”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فين الساروت ديال الدار؟: Where's the house key?

## 160. ولّف (verb): to get used to

- Uses: 73.3 per million (50 times). Forms counted: ولفت ولف يولف ولفنا ولفتو ولفو ولفتها نولف كتولف ولفوش ولفتني ولفتهم ولفتي ولفات ولفناها وتولفو يولفوني يولفوه تولفي كنولف
- Dictionary: [Darija Open Dataset (verbs), ولّف](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “used to”
- Dictionary: [Darija Open Dataset (shorts), ولّف](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “used to”
- Dictionary: [Darija Open Dataset (shorts), ولّف](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he used to”
- Dictionary: [Darija Open Dataset (adjectives), مولّف](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “used to”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ولّفت على الجو هنا.: I've got used to the weather here.

## 161. ناموسية (noun): bed

- Uses: 72.2 per million (45 times). Forms counted: الناموسيه ناموسيه فناموسيه بناموسيه لناموسيه والناموسيه للناموسيه ناموسيتي
- Dictionary: [Wiktionary, (Moroccan Arabic), ناموسية](https://en.wiktionary.org/wiki/%D9%86%D8%A7%D9%85%D9%88%D8%B3%D9%8A%D8%A9#Moroccan_Arabic): “bed”
- Dictionary: [Wiktionary, (Arabic, labelled Moroccan), ناموسية](https://en.wiktionary.org/wiki/%D9%86%D8%A7%D9%85%D9%88%D8%B3%D9%8A%D8%A9#Arabic): “(Morocco) bed”
- Dictionary: [Darija Open Dataset (nouns), ناموسية](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “bed”
- Standard Arabic: “ناموسية (noun): protective net against nematocerous insects, mosquito net”
- Note in the app: MSA نَامُوسِيَّة is "mosquito net".
- Sentence: دخل للناموسية بكري.: He went to bed early.

## 162. شطح (verb): to dance

- Uses: 71.7 per million (39 times). Forms counted: تشطح نشطح كيشطحو نشطحو يشطح كاتشطح شطحات ماتشطح يشطحو كنشطح وكنشطح كتشطح تاتشطح كيشطح كيشطحنا
- Dictionary: [Wiktionary, (Moroccan Arabic), شطح](https://en.wiktionary.org/wiki/%D8%B4%D8%B7%D8%AD#Moroccan_Arabic): “to dance”
- Dictionary: [Darija Open Dataset (verbs), شطح](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “dance”
- Dictionary: [Darija Open Dataset (shorts), شطح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “dance”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA شَطَحَ (to go too far).
- Sentence: هي كتشطح مزيان.: She dances well.

## 163. شيفور (noun): driver

- Uses: 71.1 per million (80 times). Forms counted: الشيفور شيفور للشيفور والشيفور وشيفور بشيفور فالشيفور بالشيفور دالشيفور
- Dictionary: [Darija Open Dataset (nouns), شيفور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “driver”
- Dictionary: [Darija Open Dataset (professions), شيفور](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/professions.csv): “driver”
- Dictionary: [Darija Open Dataset (shorts), شيفور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “driver”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الشيفور كيسوق مزيان.: The driver drives well.

## 164. ڭارو (noun): cigarette

- Uses: 71.1 per million (31 times). Forms counted: الڭارو ڭارو لڭارو للڭارو وڭارو والڭارو بالڭارو
- Dictionary: [Wiktionary, (Moroccan Arabic), ڭارو](https://en.wiktionary.org/wiki/%DA%AD%D8%A7%D8%B1%D9%88#Moroccan_Arabic): “cigarette”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني ڭارو.: Give me a cigarette.

## 165. فابور (adv): free (of charge)

- Uses: 69 per million (52 times). Forms counted: فابور
- Dictionary: [Darija Open Dataset (economy), فابور](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/economy.csv): “free”
- Dictionary: [Darija Open Dataset (shorts), فابور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “free”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدخول فابور.: Entry is free.

## 166. تيران (noun): (sports) pitch, field

- Uses: 68.4 per million (64 times). Forms counted: التيران تيران فالتيران فتيران للتيران لتيران وتيران والتيران
- Dictionary: [Darija Open Dataset (nouns), تيران](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “field”
- Dictionary: [Darija Open Dataset (shorts), تيران](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “field”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدراري فالتيران.: The boys are at the pitch.

## 167. موس (noun): knife

- Uses: 68.3 per million (53 times). Forms counted: موس بالموس الموس بموس لموس بلموس والموس
- Dictionary: [Wiktionary, (Moroccan Arabic), موس](https://en.wiktionary.org/wiki/%D9%85%D9%88%D8%B3#Moroccan_Arabic): “knife”
- Dictionary: [Darija Open Dataset (nouns), موس](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “knife”
- Dictionary: [Darija Open Dataset (shorts), موس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “knife”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: قطع الخبز بالموس.: Cut the bread with the knife.

## 168. بنان (noun): bananas

- Uses: 67.6 per million (34 times). Forms counted: البنان فلبنان بنان للبنان بالبنان وبنانه
- Dictionary: [Wiktionary, (Moroccan Arabic), بنان](https://en.wiktionary.org/wiki/%D8%A8%D9%86%D8%A7%D9%86#Moroccan_Arabic): “banana”
- Dictionary: [Wiktionary, (Arabic, labelled Moroccan), بنان](https://en.wiktionary.org/wiki/%D8%A8%D9%86%D8%A7%D9%86#Arabic): “(Modern Standard Arabic, Morocco, Mauritania, Algeria, Tunisia) banana”
- Dictionary: [Darija Open Dataset (food), بنان](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “banana”
- Dictionary: [Darija Open Dataset (shorts), بنان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “banana”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كنحماق على البنان.: I'm crazy about bananas.

## 169. العروبية (noun): the countryside

- Uses: 67.3 per million (35 times). Forms counted: العروبيه فالعروبيه عروبيه لعروبيه للعروبيه فعروبيه
- Dictionary: [Darija Open Dataset (nouns), العروبية](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “countryside”
- Dictionary: [Darija Open Dataset (shorts), العروبية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “countryside”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جدي ساكن فالعروبية.: My grandfather lives in the countryside.

## 170. حريرة (noun): harira (a soup)

- Uses: 64.9 per million (47 times). Forms counted: الحريره حريره لحريره فحريره حريرتي حريرتك
- Dictionary: [Darija Open Dataset (food), حريرة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “soup”
- Dictionary: [Darija Open Dataset (shorts), حريرة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “soup”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA حَرِيرَة (a silk thread).
- Sentence: كنشربو الحريرة فرمضان.: We have harira in Ramadan.

## 171. اينا (det): which

- Uses: 62.8 per million (48 times). Forms counted: اينا واينا لاينا
- Dictionary: [Wiktionary, (Moroccan Arabic), إينا](https://en.wiktionary.org/wiki/%D8%A5%D9%8A%D9%86%D8%A7#Moroccan_Arabic): “(interrogative) which?”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: اينا واحد فيهم؟: Which one of them?

## 172. برزط (verb): to bother, to annoy

- Uses: 62.7 per million (57 times). Forms counted: تبرزيط برزطات برزط تبرزط يبرزط برزطاتني يبرزطك يبرزطو وبرزط برزطتك برزطاتها برزطوني برزطونا برزطوهم نبرزطك نبرزطها نبرزطهم تبرزطش ماتبرزطنيش تبرزطك
- Dictionary: [Darija Open Dataset (verbs), برزط](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “bother”
- Dictionary: [Darija Open Dataset (shorts), برزط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he bothered”
- Dictionary: [Darija Open Dataset (shorts), برزط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bother”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كتبرزطني بالهضرة ديالك.: You're annoying me with your talk.

## 173. بيسي (noun): computer

- Uses: 61.4 per million (30 times). Forms counted: البيسي بيسي پيسي
- Dictionary: [Darija Open Dataset (nouns), بيسي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “computer”
- Dictionary: [Darija Open Dataset (shorts), بيسي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “computer”
- Dictionary: [Darija Open Dataset (shorts), پيسّي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “computer”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: البيسي ديالي خسر.: My computer has broken.

## 174. فران (noun): oven; bakery

- Uses: 61.3 per million (48 times). Forms counted: الفران فرانك فران لفران للفران دفران وفران فلفران فالفران فراني
- Dictionary: [Wiktionary, (Moroccan Arabic), فران](https://en.wiktionary.org/wiki/%D9%81%D8%B1%D8%A7%D9%86#Moroccan_Arabic): “oven”
- Dictionary: [Wiktionary, (Moroccan Arabic), فران](https://en.wiktionary.org/wiki/%D9%81%D8%B1%D8%A7%D9%86#Moroccan_Arabic): “bakery”
- Dictionary: [Darija Open Dataset (nouns), فران](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “oven”
- Dictionary: [Darija Open Dataset (shorts), فران](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “oven”
- Standard Arabic: “فران (noun): oven owner”
- Note in the app: MSA فَرَّان is "baker".
- Sentence: دي الخبز للفران.: Take the bread to the bakery.

## 175. قنت (noun): corner

- Uses: 61.2 per million (66 times). Forms counted: قنت القنت للقنت والقنت فالقنت فقنت فلقنت قنتو قنتنا
- Dictionary: [Wiktionary, (Moroccan Arabic), قنت](https://en.wiktionary.org/wiki/%D9%82%D9%86%D8%AA#Moroccan_Arabic): “corner”
- Dictionary: [Darija Open Dataset (nouns), قنت](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “corner”
- Dictionary: [Darija Open Dataset (shorts), قنت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “corner”
- Standard Arabic: “قنت (verb): to be obedient, to be submissive, to be humble [with لِ (li) ‘to someone, e.g. God’]”; “قنت (verb): to be very obedient, to be very submissive [with لِ (li) ‘to someone’]”; “قنت (verb): to eat a little”
- Note in the app: Not MSA قَنَتَ (to be devout).
- Sentence: تسناني فالقنت.: Wait for me at the corner.

## 176. عنّق (verb): to hug

- Uses: 61.1 per million (55 times). Forms counted: عنقني نعنقك عنقت عنقتو وعنقاتها عنق عنقات تعنق تعنقني يعنق كيعنق فعنقه عنقنا وعنقت وعنقتو عنقتها وعنقتها عنقاتني وعنقاتني عنقاتها
- Dictionary: [Wiktionary, (Moroccan Arabic), عنق](https://en.wiktionary.org/wiki/%D8%B9%D9%86%D9%82#Moroccan_Arabic): “to hug”
- Standard Arabic: “عنق (noun): neck”; “عنق (noun): cervix uteri”; “عنق (noun): pedicle”; “عنق (noun): a company of men”
- Note in the app: Not MSA عُنُق (neck).
- Sentence: عنّق يماك.: Hug your mum.

## 177. عشير (noun): close friend, mate

- Uses: 60 per million (50 times). Forms counted: عشيري عشيرو العشير عشيره عشيرنا وعشيرو عشير وعشيري عشيرك فعشيرو لعشيرو
- Dictionary: [Darija Open Dataset (nouns), عشير](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “best friend”
- Dictionary: [Darija Open Dataset (shorts), عشير](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “best friend”
- Dictionary: [Darija Open Dataset (nouns), عشيري](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “my best friend”
- Dictionary: [Darija Open Dataset (shorts), عشيري](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “my best friend”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هو عشيري.: He's my mate.

## 178. زيّر (verb): to tighten, to squeeze

- Uses: 59.3 per million (51 times). Forms counted: تزير زير كيزيرو يزير زيرت نزير نزيرو يزيرو زيرات تزيرو كتزير زيرك وزيره زيروها وزيروها ويزير يزيرني يزيروهم كنزير غنزيرو
- Dictionary: [Darija Open Dataset (verbs), زيّر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “wind”
- Dictionary: [Darija Open Dataset (shorts), زيّر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “wind”
- Dictionary: [Darija Open Dataset (shorts), زيّر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “he winded”
- Dictionary: [Darija Open Dataset (adjectives), مزيّر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “tight”
- Standard Arabic: “زير (noun): women’s visitor, philanderer, womanizer”
- Note in the app: Not MSA زِير (womaniser).
- Sentence: زيّر الروبيني مزيان.: Tighten the tap properly.

## 179. مسالي (adj): free, not busy

- Uses: 59.1 per million (29 times). Forms counted: مسالي مساليه المسالي والمساليه مساليتي مساليا
- Dictionary: [Wiktionary, (Moroccan Arabic), مسالي](https://en.wiktionary.org/wiki/%D9%85%D8%B3%D8%A7%D9%84%D9%8A#Moroccan_Arabic): “free, not busy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واش نتا مسالي دابا؟: Are you free now?

## 180. تريكو (noun): sweater

- Uses: 59 per million (27 times). Forms counted: تريكو وتريكو التريكو لتريكو
- Dictionary: [Darija Open Dataset (nouns), تريكو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “sweater”
- Dictionary: [Darija Open Dataset (shorts), تريكو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “sweater”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لبس تريكو، راه البرد.: Put on a sweater, it's cold.

## 181. خلصة (noun): salary, pay

- Uses: 58.6 per million (32 times). Forms counted: الخلصه لخلصه فالخلصه خلصتي خلصه فلخلصه بالخلصه خلصتها
- Dictionary: [Wiktionary, (Moroccan Arabic), خلصة](https://en.wiktionary.org/wiki/%D8%AE%D9%84%D8%B5%D8%A9#Moroccan_Arabic): “salary, pay, wages”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA خُلَاصَة (summary).
- Sentence: الخلصة ماكافياش.: The salary isn't enough.

## 182. كوميسارية (noun): police station

- Uses: 58.2 per million (46 times). Forms counted: للكوميساريه الكوميساريه لكوميساريه كوميساريه فلكوميساريه فالكوميساريه
- Dictionary: [Darija Open Dataset (shorts), كوميسارية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “police station”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشا للكوميسارية.: He went to the police station.

## 183. كمى (verb): to smoke

- Uses: 58.1 per million (35 times). Forms counted: كنكمي كيكمي تكمي نكمي كايكمي كميت يكمي كتكمي كاتكمي كمي كميتها نكميو نكميهم ماكانكميش ماتاتكميش
- Dictionary: [Wiktionary, (Moroccan Arabic), كمى](https://en.wiktionary.org/wiki/%D9%83%D9%85%D9%89#Moroccan_Arabic): “to smoke”
- Dictionary: [Darija Open Dataset (shorts), كمي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “smoke”
- Standard Arabic: “كمي (adj): brave”; “كمي (adj): armored, clad in armor”
- Note in the app: Not MSA كَمِيّ (brave).
- Sentence: واش كتكمي؟: Do you smoke?

## 184. ورّك (verb): to press

- Uses: 57.4 per million (45 times). Forms counted: وركت ورك كيورك نورك نوركو يوركو وركات تورك فتورك يورك ووركت وركتي ماتورك كنورك وكنورك كنوركو غنورك كاتورك كيوركو
- Dictionary: [Darija Open Dataset (verbs), ورّك](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “press”
- Dictionary: [Darija Open Dataset (shorts), ورّك](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “press”
- Standard Arabic: “ورك (noun): hip, thigh”; “ورك (noun): hipbone, ischium”; “ورك (noun): knotty part of a branch”; “ورك (verb): to recumb with the hips”
- Note in the app: Not MSA وَرِك (hip).
- Sentence: ورّك على البوطون.: Press the button.

## 185. نيشان (adv): straight (ahead); directly

- Uses: 57.3 per million (34 times). Forms counted: نيشان
- Dictionary: [Wiktionary, (Moroccan Arabic), نيشان](https://en.wiktionary.org/wiki/%D9%86%D9%8A%D8%B4%D8%A7%D9%86#Moroccan_Arabic): “straight”
- Dictionary: [Darija Open Dataset (shorts), نيشان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “directly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: Not MSA نِيشَان (medal; target).
- Sentence: سير نيشان.: Go straight ahead.

## 186. خلعة (noun): fright, scare

- Uses: 56.2 per million (45 times). Forms counted: الخلعه بالخلعه والخلعه خلعه وبالخلعه
- Dictionary: [Darija Open Dataset (nouns), خلعة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “panic”
- Dictionary: [Darija Open Dataset (emotions), خلعة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/emotions.csv): “fear”
- Dictionary: [Darija Open Dataset (shorts), خلعة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “panic”
- Dictionary: [Darija Open Dataset (shorts), خلعة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “fear”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطاني خلعة كبيرة.: He gave me a big fright.

## 187. صاب (verb): to find

- Uses: 55.5 per million (50 times). Forms counted: تتصيب يصيب تيصيب تصيب صاب تيصيبو تيصيبوها صيبه صابني صابك صابه صابنا صبت وصبتهم صابتنا وماصابو نصيبك نصيبو نصيبوها تصيبهوم
- Dictionary: [Wiktionary, (Moroccan Arabic), صاب](https://en.wiktionary.org/wiki/%D8%B5%D8%A7%D8%A8#Moroccan_Arabic): “to find”
- Standard Arabic: “صاب (verb): (transitive, obsolete) to hit, to find the target in”; “صاب (verb): (intransitive, transitive, obsolete) to descend, to rain”; “صاب (noun): (obsolete) squirting cucumber”
- Note in the app: MSA صَابَ (old) is "to hit the mark".
- Sentence: ماصبتش الساروت.: I couldn't find the key.

## 188. تقاشر (noun): socks

- Uses: 54 per million (30 times). Forms counted: تقاشر تقاشري التقاشر تقشيره والتقاشر تقاشرو وتقاشر وتقاشري تقاشرك بتقشيره التقشيره
- Dictionary: [Wiktionary, (Moroccan Arabic), تقشيرة](https://en.wiktionary.org/wiki/%D8%AA%D9%82%D8%B4%D9%8A%D8%B1%D8%A9#Moroccan_Arabic): “sock”
- Dictionary: [Darija Open Dataset (clothes), تقاشر](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “socks”
- Dictionary: [Darija Open Dataset (shorts), تقاشر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “socks”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لبس التقاشر ديالك.: Put your socks on.

## 189. كارطة (noun): card (ID card, bank card)

- Uses: 53.7 per million (35 times). Forms counted: الكارطه كارطه كارطا وكارطه فكارطه بكارطا لكارطا
- Dictionary: [Darija Open Dataset (nouns), كارطا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “card”
- Dictionary: [Darija Open Dataset (shorts), كارطا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “card”
- Dictionary: [Darija Open Dataset (shorts), كارطا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “cards”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني الكارطة ديالك.: Give me your card.

## 190. مكلخ (adj): stupid

- Uses: 52.8 per million (34 times). Forms counted: مكلخ المكلخ مكلخين مكلخه ومكلخ المكلخين والمكلخين
- Dictionary: [Wiktionary, (Moroccan Arabic), مكلخ](https://en.wiktionary.org/wiki/%D9%85%D9%83%D9%84%D8%AE#Moroccan_Arabic): “stupid”
- Dictionary: [Darija Open Dataset (adjectives), مكلّخ](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “stupid”
- Dictionary: [Darija Open Dataset (shorts), مكلّخ](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “stupid”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ماتكونش مكلخ.: Don't be stupid.

## 191. فيرمة (noun): farm

- Uses: 52.6 per million (50 times). Forms counted: الفيرمه الفيرما فالفيرمه للفيرما فيرمه فالفيرما لفيرمه للفيرمه
- Dictionary: [Wiktionary, (Moroccan Arabic), فيرمة](https://en.wiktionary.org/wiki/%D9%81%D9%8A%D8%B1%D9%85%D8%A9#Moroccan_Arabic): “farm”
- Dictionary: [Darija Open Dataset (places), فيرمة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “farm”
- Dictionary: [Darija Open Dataset (shorts), فيرمة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “farm”
- Dictionary: [Darija Open Dataset (nouns), فيرما](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “farm”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندهم فيرمة كبيرة.: They have a big farm.

## 192. باطو (noun): boat

- Uses: 52 per million (62 times). Forms counted: الباطو باطو بالباطو فباطو للباطو فلباطو فالباطو دالباطو
- Dictionary: [Darija Open Dataset (nouns), باطو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “ship”
- Dictionary: [Darija Open Dataset (environment), باطو](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/environment.csv): “ship”
- Dictionary: [Darija Open Dataset (shorts), باطو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “ship”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشينا لطنجة فالباطو.: We went to Tangier by boat.

## 193. فرملي (noun): nurse

- Uses: 51.5 per million (45 times). Forms counted: الفرمليه فرمليه الفرملي فرملي وفرمليه للفرمليه
- Dictionary: [Wiktionary, (Moroccan Arabic), فرملي](https://en.wiktionary.org/wiki/%D9%81%D8%B1%D9%85%D9%84%D9%8A#Moroccan_Arabic): “nurse”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الفرملي عطاني الدوا.: The nurse gave me the medicine.

## 194. مارشي (noun): market

- Uses: 50.8 per million (46 times). Forms counted: المارشي مارشي للمارشي فالمارشي لمارشي
- Dictionary: [Darija Open Dataset (nouns), مارشي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “market”
- Dictionary: [Darija Open Dataset (shorts), مارشي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “market”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شريت الخضرة من المارشي.: I bought the vegetables at the market.

## 195. فاكتورة (noun): bill (to pay)

- Uses: 50.8 per million (46 times). Forms counted: الفاكتوره فاكتوره لفاكتوره فالفاكتوره
- Dictionary: [Darija Open Dataset (nouns), فاكتورة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “bill”
- Dictionary: [Darija Open Dataset (economy), فاكتورة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/economy.csv): “bill”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: خلصتي الفاكتورة؟: Did you pay the bill?

## 196. برهوش (noun): kid, little one

- Uses: 49.5 per million (39 times). Forms counted: البرهوش برهوش لبرهوش
- Dictionary: [Darija Open Dataset (weird), برهوش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/weird.csv): “kid”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: داك البرهوش ديما كيبكي.: That kid is always crying.

## 197. ريجيم (noun): diet (to lose weight)

- Uses: 49.3 per million (26 times). Forms counted: الريجيم ريجيم بريجيم دالريجيم
- Dictionary: [Darija Open Dataset (nouns), ريجيم](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “diet”
- Dictionary: [Darija Open Dataset (food), ريجيم](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “diet”
- Dictionary: [Darija Open Dataset (shorts), ريجيم](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “diet”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: أنا دايرة ريجيم.: I'm on a diet.

## 198. سانسور (noun): lift, elevator

- Uses: 47.5 per million (22 times). Forms counted: السانسور سانسور فسانسور
- Dictionary: [Darija Open Dataset (nouns), سانسور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “elevator”
- Dictionary: [Darija Open Dataset (shorts), سانسور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “elevator”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: السانسور خاسر.: The lift is broken.

## 199. كريدي (noun): debt; credit

- Uses: 47.3 per million (49 times). Forms counted: الكريدي كريدي بالكريدي بلكريدي
- Dictionary: [Darija Open Dataset (nouns), كريدي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “credit”
- Dictionary: [Darija Open Dataset (economy), كريدي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/economy.csv): “credit”
- Dictionary: [Darija Open Dataset (economy), كريدي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/economy.csv): “debt”
- Dictionary: [Darija Open Dataset (shorts), كريدي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “debt”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شريتها بالكريدي.: I bought it on credit.

## 200. طليلة (noun): a look, a glance

- Uses: 46.7 per million (50 times). Forms counted: طليله الطليله للطليله
- Dictionary: [Darija Open Dataset (nouns), طليلة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “look”
- Dictionary: [Darija Open Dataset (shorts), طليلة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “look”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: دير طليلة على الدراري.: Have a look at the kids.

## 201. صاك (noun): bag

- Uses: 46 per million (31 times). Forms counted: صاك الصاك فصاك صاكه فالصاك للصاك صاكي فصاكي
- Dictionary: [Wiktionary, (Moroccan Arabic), صاك](https://en.wiktionary.org/wiki/%D8%B5%D8%A7%D9%83#Moroccan_Arabic): “purse”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: فين الصاك ديالي؟: Where's my bag?

## 202. ديريكت (adv): directly, straight

- Uses: 45.9 per million (40 times). Forms counted: ديريكت ديركت
- Dictionary: [Darija Open Dataset (adverbs), ديريكت](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “directly”
- Dictionary: [Darija Open Dataset (shorts), ديريكت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “directly”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: سير ديريكت للدار.: Go straight home.

## 203. جلابة (noun): djellaba (a long hooded robe)

- Uses: 45.6 per million (36 times). Forms counted: جلابه الجلابه جلابتي فجلابه دالجلابه جلابتك
- Dictionary: [Darija Open Dataset (clothes), جلّابة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “jellaba”
- Dictionary: [Darija Open Dataset (shorts), جلّابة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “jellaba”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لبس جلابة للعيد.: He wore a djellaba for Eid.

## 204. ستيلو (noun): pen

- Uses: 44.3 per million (38 times). Forms counted: ستيلو الستيلو وستيلو فالستيلو بستيلو بالستيلو للستيلو
- Dictionary: [Wiktionary, (Moroccan Arabic), ستيلو](https://en.wiktionary.org/wiki/%D8%B3%D8%AA%D9%8A%D9%84%D9%88#Moroccan_Arabic): “pen”
- Dictionary: [Wiktionary, (Moroccan Arabic), ستيلو](https://en.wiktionary.org/wiki/%D8%B3%D8%AA%D9%8A%D9%84%D9%88#Moroccan_Arabic): “fountain pen”
- Dictionary: [Darija Open Dataset (education), ستيلو](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/education.csv): “pen”
- Dictionary: [Darija Open Dataset (shorts), ستيلو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pen”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: سلفني ستيلو عفاك.: Lend me a pen, please.

## 205. بوطة (noun): gas bottle

- Uses: 43.7 per million (30 times). Forms counted: البوطه بوطه ببوطه
- Dictionary: [Wiktionary, (Moroccan Arabic), بوطة](https://en.wiktionary.org/wiki/%D8%A8%D9%88%D8%B7%D8%A9#Moroccan_Arabic): “gas canister”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: البوطة سالات.: The gas bottle has run out.

## 206. ريزو (noun): network; phone signal

- Uses: 42.5 per million (25 times). Forms counted: الريزو ريزو
- Dictionary: [Darija Open Dataset (nouns), ريزو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “network”
- Dictionary: [Darija Open Dataset (shorts), ريزو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “network”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ماكاينش الريزو هنا.: There's no signal here.

## 207. سربي (intj): hurry up!

- Uses: 41.3 per million (18 times). Forms counted: سربي سربيو
- Dictionary: [Darija Open Dataset (shorts), سربي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “hurry”
- Dictionary: [Darija Open Dataset (utils), سربي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/utils.csv): “hurry”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: سربي، راه الوقت فات!: Hurry up, it's late!

## 208. برية (noun): letter (mail)

- Uses: 41 per million (34 times). Forms counted: البريه بريه بريتي لبريه
- Dictionary: [Wiktionary, (Moroccan Arabic), برية](https://en.wiktionary.org/wiki/%D8%A8%D8%B1%D9%8A%D8%A9#Moroccan_Arabic): “letter (written or printed communication)”
- Standard Arabic: “برية (noun): creatures”; “برية (adj): feminine singular of بَرِّيّ (barriyy, “wild”)”
- Note in the app: Not MSA بَرِّيَّة (wilderness).
- Sentence: جاتني برية من خويا.: I got a letter from my brother.

## 209. مروّن (adj): upset, confused

- Uses: 40.7 per million (39 times). Forms counted: مرونه مرون مرونين ومرونه والمرونه مرونينها ومرونا
- Dictionary: [Darija Open Dataset (adjectives), مروّن](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “confused”
- Dictionary: [Darija Open Dataset (shorts), مروّن](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “confused”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: راسي مروّن اليوم.: My head is all over the place today.

## 210. ميكا (noun): plastic bag

- Uses: 40.4 per million (35 times). Forms counted: ميكا ميكه الميكا لميكا الميكه فميكا فميكه بميكه ميكتو
- Dictionary: [Wiktionary, (Moroccan Arabic), ميكة](https://en.wiktionary.org/wiki/%D9%85%D9%8A%D9%83%D8%A9#Moroccan_Arabic): “plastic bag”
- Dictionary: [Wiktionary, (Moroccan Arabic), ميكة](https://en.wiktionary.org/wiki/%D9%85%D9%8A%D9%83%D8%A9#Moroccan_Arabic): “plastic”
- Dictionary: [Darija Open Dataset (nouns), ميكا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “plastic”
- Dictionary: [Darija Open Dataset (shorts), ميكا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “plastic”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني ميكا عفاك.: Give me a plastic bag, please.

## 211. رونديفو (noun): appointment, date

- Uses: 40.1 per million (22 times). Forms counted: رونديفو رانديفو
- Dictionary: [Darija Open Dataset (nouns), رونديفو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “date”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندي رونديفو عند الطبيب.: I have an appointment at the doctor's.

## 212. شلاضة (noun): salad

- Uses: 37.9 per million (41 times). Forms counted: شلاضه الشلاضه وشلاضه
- Dictionary: [Wiktionary, (Moroccan Arabic), شلاضة](https://en.wiktionary.org/wiki/%D8%B4%D9%84%D8%A7%D8%B6%D8%A9#Moroccan_Arabic): “salad”
- Dictionary: [Darija Open Dataset (food), شلاضة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “salad”
- Dictionary: [Darija Open Dataset (shorts), شلاضة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “salad”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صاوبت شلاضة ديال الماطيشة.: I made a tomato salad.

## 213. كاميو (noun): lorry, truck

- Uses: 37.3 per million (44 times). Forms counted: الكاميو كاميو وكاميو فكاميو لكاميو بالكاميو دلكاميو والكاميو فالكاميو دالكاميو
- Dictionary: [Darija Open Dataset (nouns), كاميو](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “truck”
- Dictionary: [Darija Open Dataset (shorts), كاميو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “truck”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الكاميو واقف فالزنقة.: The lorry is parked in the street.

## 214. جورنال (noun): newspaper

- Uses: 36.8 per million (27 times). Forms counted: جورنال الجورنال فجورنال وجورنال فالجورنال بالجورنال
- Dictionary: [Darija Open Dataset (nouns), جورنال](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “newspaper”
- Dictionary: [Darija Open Dataset (shorts), جورنال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “newspaper”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كنقرا الجورنال كل صباح.: I read the newspaper every morning.

## 215. خنشة (noun): sack

- Uses: 36.5 per million (43 times). Forms counted: الخنشه خنشه فخنشه فالخنشه وخنشه
- Dictionary: [Wiktionary, (Moroccan Arabic), خنشة](https://en.wiktionary.org/wiki/%D8%AE%D9%86%D8%B4%D8%A9#Moroccan_Arabic): “bag”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جاب خنشة ديال الدقيق.: He brought a sack of flour.

## 216. بيكالا (noun): bicycle

- Uses: 36.3 per million (21 times). Forms counted: بيكالا البيكالا ببيكالا بالبيكالا پيكاله الپيكاله
- Dictionary: [Wiktionary, (Moroccan Arabic), پيكالة](https://en.wiktionary.org/wiki/%D9%BE%D9%8A%D9%83%D8%A7%D9%84%D8%A9#Moroccan_Arabic): “bicycle”
- Dictionary: [Darija Open Dataset (nouns), بيكالا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “bicycle”
- Dictionary: [Darija Open Dataset (shorts), بيكالا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “bicycle”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كنمشي للخدمة فالبيكالا.: I go to work by bike.

## 217. طرطق (verb): to burst, to pop; to crack

- Uses: 34.9 per million (41 times). Forms counted: طرطق يطرطق يطرطقو طرطقو كيطرطق طرطقات يطرطقها كيطرطقو وكيطرطقو طرطقش طرطقوهم كنطرطق كنطرطقو وكيطرطق
- Dictionary: [Wiktionary, (Moroccan Arabic), طرطق](https://en.wiktionary.org/wiki/%D8%B7%D8%B1%D8%B7%D9%82#Moroccan_Arabic): “to crack (knuckles, head, etc)”
- Dictionary: [Wiktionary, (Moroccan Arabic), طرطق](https://en.wiktionary.org/wiki/%D8%B7%D8%B1%D8%B7%D9%82#Moroccan_Arabic): “to pop”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: النفاخة طرطقات.: The balloon popped.

## 218. حاولي (noun): sheep

- Uses: 34.9 per million (21 times). Forms counted: حاولي الحاولي وحاولي لحاولي
- Dictionary: [Darija Open Dataset (animals), حاولي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/animals.csv): “sheep”
- Dictionary: [Darija Open Dataset (shorts), حاولي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “sheep”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شرينا حاولي للعيد.: We bought a sheep for Eid.

## 219. سبرديلة (noun): trainers, sneakers

- Uses: 34.6 per million (28 times). Forms counted: سبرديله سبرديلتي سبرديلات السبرديله سبرديلتك السبرديلات وسبرديله سبرديلتو وسبرديلات والسبرديلات
- Dictionary: [Wiktionary, (Moroccan Arabic), سبرديلة](https://en.wiktionary.org/wiki/%D8%B3%D8%A8%D8%B1%D8%AF%D9%8A%D9%84%D8%A9#Moroccan_Arabic): “sneakers, creps”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لبس السبرديلة ديالك.: Put on your trainers.

## 220. سمطة (noun): belt

- Uses: 32.1 per million (34 times). Forms counted: السمطه سمطه بالسمطه
- Dictionary: [Wiktionary, (Moroccan Arabic), سمطة](https://en.wiktionary.org/wiki/%D8%B3%D9%85%D8%B7%D8%A9#Moroccan_Arabic): “belt”
- Dictionary: [Darija Open Dataset (clothes), سمطة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “belt”
- Dictionary: [Darija Open Dataset (shorts), سمطة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “belt”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني السمطة ديالي.: Give me my belt.

## 221. ماتريال (noun): equipment, gear, stuff

- Uses: 31.8 per million (30 times). Forms counted: الماتريال الماتيريال ماتريال والماتيريال بالماتيريال
- Dictionary: [Darija Open Dataset (nouns), ماتريال](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “stuff”
- Dictionary: [Darija Open Dataset (shorts), ماتريال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “stuff”
- Dictionary: [Darija Open Dataset (shorts), ماتريال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “equipment”
- Dictionary: [Darija Open Dataset (shorts), ماتيريال](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “stuff”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جيب الماتريال ديالك.: Bring your gear.

## 222. أوطيل (noun): hotel

- Uses: 31.6 per million (37 times). Forms counted: لوطيل اوطيل فلوطيل
- Dictionary: [Darija Open Dataset (nouns), أوطيل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “hotel”
- Dictionary: [Darija Open Dataset (places), أُوطيل](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “hotel”
- Dictionary: [Darija Open Dataset (shorts), أُوطيل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “hotel”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: نعسنا فأوطيل قريب للبحر.: We stayed in a hotel near the sea.

## 223. فرماج (noun): cheese

- Uses: 30.9 per million (18 times). Forms counted: الفرماج فرماج لفرماج فرماجه
- Dictionary: [Wiktionary, (Moroccan Arabic), فرماج](https://en.wiktionary.org/wiki/%D9%81%D8%B1%D9%85%D8%A7%D8%AC#Moroccan_Arabic): “cheese”
- Dictionary: [Darija Open Dataset (food), فرماج](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “cheese”
- Dictionary: [Darija Open Dataset (shorts), فرماج](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “cheese”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: بغيت الخبز بالفرماج.: I'd like bread with cheese.

## 224. معصب (adj): angry, in a temper

- Uses: 30.9 per million (18 times). Forms counted: معصب معصبه
- Dictionary: [Wiktionary, (Moroccan Arabic), معصب](https://en.wiktionary.org/wiki/%D9%85%D8%B9%D8%B5%D8%A8#Moroccan_Arabic): “angry, furious, enraged”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: باه ديما معصب.: His dad is always angry.

## 225. شارف (adj): old (of a person)

- Uses: 30.6 per million (23 times). Forms counted: شارف الشارف شارفين الشارفه
- Dictionary: [Wiktionary, (Moroccan Arabic), شارف](https://en.wiktionary.org/wiki/%D8%B4%D8%A7%D8%B1%D9%81#Moroccan_Arabic): “old (of people)”
- Dictionary: [Darija Open Dataset (adjectives), شارف](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “old”
- Dictionary: [Darija Open Dataset (shorts), شارف](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “old”
- Standard Arabic: “شارف (verb): to approach”; “شارف (verb): to supervise, to watch, to command”; “شارف (verb): to contend for superiority with”
- Note in the app: Not MSA شَارِف (looking out over).
- Sentence: جدي شارف بزاف.: My grandfather is very old.

## 226. ديجا (adv): already

- Uses: 30.3 per million (19 times). Forms counted: ديجا فديجا
- Dictionary: [Wiktionary, (Moroccan Arabic), ديجا](https://en.wiktionary.org/wiki/%D8%AF%D9%8A%D8%AC%D8%A7#Moroccan_Arabic): “already”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كليت ديجا.: I've already eaten.

## 227. جلبانة (noun): peas

- Uses: 29.2 per million (34 times). Forms counted: الجلبانه جلبانه والجلبانه دالجلبانه دجلبانه
- Dictionary: [Wiktionary, (Moroccan Arabic), جلبانة](https://en.wiktionary.org/wiki/%D8%AC%D9%84%D8%A8%D8%A7%D9%86%D8%A9#Moroccan_Arabic): “peas”
- Dictionary: [Darija Open Dataset (food), جلبانة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “pea”
- Dictionary: [Darija Open Dataset (shorts), جلبانة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pea”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: طيبت الجلبانة بالخيزو.: I cooked peas with carrots.

## 228. قادوس (noun): pipe, drain

- Uses: 28.2 per million (31 times). Forms counted: القادوس القوادس قادوس لقادوس فالقادوس دالقادوس قوادسهم
- Dictionary: [Wiktionary, (Moroccan Arabic), قادوس](https://en.wiktionary.org/wiki/%D9%82%D8%A7%D8%AF%D9%88%D8%B3#Moroccan_Arabic): “pipe, conduit, drain”
- Dictionary: [Darija Open Dataset (shorts), قادوس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pipe”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: القادوس مسدود.: The drain is blocked.

## 229. شكارة (noun): bag, sack

- Uses: 28 per million (18 times). Forms counted: شكاره فشكاره الشكاره شكارتي فشكارتي بشكارتو شكارتها
- Dictionary: [Wiktionary, (Moroccan Arabic), شكارة](https://en.wiktionary.org/wiki/%D8%B4%D9%83%D8%A7%D8%B1%D8%A9#Moroccan_Arabic): “bag”
- Dictionary: [Wiktionary, (Arabic, labelled Moroccan), شكارة](https://en.wiktionary.org/wiki/%D8%B4%D9%83%D8%A7%D8%B1%D8%A9#Arabic): “(Egypt, Libya, Algeria, Tunisia, Morocco, Mauritania) bag such as to carry grain, sack”
- Dictionary: [Darija Open Dataset (nouns), شكارة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “bag”
- Dictionary: [Darija Open Dataset (education), شكارة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/education.csv): “bag”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: حط الخبز فالشكارة.: Put the bread in the bag.

## 230. بوسطة (noun): post office

- Uses: 27.1 per million (26 times). Forms counted: البوسطه فالبوسطه للبوسطه فلبوسطه
- Dictionary: [Wiktionary, (Moroccan Arabic), بوسطة](https://en.wiktionary.org/wiki/%D8%A8%D9%88%D8%B3%D8%B7%D8%A9#Moroccan_Arabic): “post office”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشيت للبوسطة نصيفط برية.: I went to the post office to send a letter.

## 231. براد (noun): teapot

- Uses: 26.6 per million (20 times). Forms counted: براد لبراد البراد فبراد فلبراد براده
- Dictionary: [Wiktionary, (Moroccan Arabic), براد](https://en.wiktionary.org/wiki/%D8%A8%D8%B1%D8%A7%D8%AF#Moroccan_Arabic): “teapot”
- Standard Arabic: “براد (noun): refrigerator”
- Note in the app: Not MSA بَرَّاد (refrigerator).
- Sentence: عمّر البراد بالما.: Fill the teapot with water.

## 232. كسكسو (noun): couscous

- Uses: 26.2 per million (14 times). Forms counted: كسكسو الكسكسو لكسكسو
- Dictionary: [Darija Open Dataset (shorts), كسكسو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “couscous”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كناكلو الكسكسو نهار الجمعة.: We eat couscous on Fridays.

## 233. كرموس (noun): figs

- Uses: 26 per million (12 times). Forms counted: لكرموس كرموس الكرموس
- Dictionary: [Wiktionary, (Moroccan Arabic), كرموس](https://en.wiktionary.org/wiki/%D9%83%D8%B1%D9%85%D9%88%D8%B3#Moroccan_Arabic): “fig, figs”
- Dictionary: [Darija Open Dataset (food), كرموس](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “fig”
- Dictionary: [Darija Open Dataset (shorts), كرموس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “fig”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الصيف هو وقت الكرموس.: Summer is the season for figs.

## 234. ڭادّ (adj): able (to); up to it

- Uses: 25.2 per million (11 times). Forms counted: ڭاد وڭاد ڭادا
- Dictionary: [Darija Open Dataset (adjectives), ڭادّ](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “able”
- Dictionary: [Darija Open Dataset (shorts), ڭادّ](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “able”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واش نتا ڭادّ تهزها؟: Are you able to lift it?

## 235. سخف (verb): to faint

- Uses: 25 per million (18 times). Forms counted: سخفه سخفات يسخف سخف يسخفو سخفت نسخف تسخف كانسخف غيسخفهم
- Dictionary: [Wiktionary, (Moroccan Arabic), سخف](https://en.wiktionary.org/wiki/%D8%B3%D8%AE%D9%81#Moroccan_Arabic): “to faint”
- Standard Arabic: “سخف (verb): to ridicule, belittle, [[undervalue]”
- Note in the app: Not MSA سَخُفَ (to be silly).
- Sentence: سخفات من السخانة.: She fainted from the heat.

## 236. حشومة (intj): (it's) shameful!, shame on you

- Uses: 24.9 per million (16 times). Forms counted: حشومه
- Dictionary: [Darija Open Dataset (shorts), حشومة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “shame”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Note in the app: MSA حِشْمَة is "modesty".
- Sentence: حشومة عليك!: Shame on you!

## 237. طاسة (noun): cup, glass

- Uses: 23.6 per million (29 times). Forms counted: الطاسه للطاسه بالطاسه والطاسه طاسه وطاسه
- Dictionary: [Wiktionary, (Moroccan Arabic), طاسة](https://en.wiktionary.org/wiki/%D8%B7%D8%A7%D8%B3%D8%A9#Moroccan_Arabic): “cup (drinking vessel)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شربت طاسة ديال الحليب.: I drank a cup of milk.

## 238. بوطون (noun): button

- Uses: 22.9 per million (10 times). Forms counted: بوطون لبوطون
- Dictionary: [Darija Open Dataset (shorts), بوطون](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “button”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ورّك على البوطون الحمر.: Press the red button.

## 239. قبط (verb): to catch, to grab

- Uses: 22.6 per million (15 times). Forms counted: تقبط قبط نقبط قبطني فقبطت تقبطيه كيقبطوه
- Dictionary: [Wiktionary, (Moroccan Arabic), قبط](https://en.wiktionary.org/wiki/%D9%82%D8%A8%D8%B7#Moroccan_Arabic): “to seize, to take, to grab”
- Dictionary: [Darija Open Dataset (verbs), قبط](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “catch”
- Dictionary: [Darija Open Dataset (shorts), قبط](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “catch”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: البوليس قبطو الشفّار.: The police caught the thief.

## 240. دابز (verb): to fight, to quarrel

- Uses: 22.1 per million (18 times). Forms counted: تيدابزو دابز دابزو يدابز دابزت دابزات ندابزو تدابز يدابزو
- Dictionary: [Darija Open Dataset (verbs), دابز](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “fight”
- Dictionary: [Darija Open Dataset (shorts), دابز](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “fight”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدراري تدابزو فالزنقة.: The boys got into a fight in the street.

## 241. عنداك (intj): watch out!, careful!

- Uses: 22 per million (27 times). Forms counted: عنداك وعنداك
- Dictionary: [Darija Open Dataset (nouns), عنداك](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “attention”
- Dictionary: [Darija Open Dataset (shorts), عنداك](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “attention”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عنداك الطونوبيل!: Watch out, a car!

## 242. خيزو (noun): carrots

- Uses: 21.5 per million (10 times). Forms counted: خيزو بخيزو لخيزو الخيزو خيزوه
- Dictionary: [Wiktionary, (Moroccan Arabic), خيزو](https://en.wiktionary.org/wiki/%D8%AE%D9%8A%D8%B2%D9%88#Moroccan_Arabic): “carrot, carrots”
- Dictionary: [Darija Open Dataset (food), خيزو](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “carrot”
- Dictionary: [Darija Open Dataset (shorts), خيزو](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “carrot”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: زيد الخيزو للشلاضة.: Add carrots to the salad.

## 243. طبسيل (noun): plate

- Uses: 21 per million (24 times). Forms counted: الطبسيل طبسيل طبسيلك لطبسيل فالطبسيل
- Dictionary: [Wiktionary, (Moroccan Arabic), طبسيل](https://en.wiktionary.org/wiki/%D8%B7%D8%A8%D8%B3%D9%8A%D9%84#Moroccan_Arabic): “plate (flat dish)”
- Dictionary: [Darija Open Dataset (nouns), طبسيل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “plate”
- Dictionary: [Darija Open Dataset (shorts), طبسيل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “plate”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جيب طبسيل آخر.: Bring another plate.

## 244. بلاكة (noun): sign, panel; number plate

- Uses: 21 per million (24 times). Forms counted: البلاكه بلاكه وبلاكه
- Dictionary: [Darija Open Dataset (nouns), بلاكة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “panel”
- Dictionary: [Darija Open Dataset (shorts), بلاكة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “panel”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شفتي البلاكة ديال الطونوبيل؟: Did you see the car's number plate?

## 245. كيكا (noun): cake

- Uses: 20.6 per million (9 times). Forms counted: كيكا لكيكا
- Dictionary: [Darija Open Dataset (food), كيكا](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “cake”
- Dictionary: [Darija Open Dataset (shorts), كيكا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “cake”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صاوبت كيكا لعيد الميلاد.: I made a cake for the birthday.

## 246. كونطرا (noun): contract

- Uses: 20.4 per million (25 times). Forms counted: الكونطرا كونطرا فالكونطرا كونطراك
- Dictionary: [Darija Open Dataset (nouns), كونطرا](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “contract”
- Dictionary: [Darija Open Dataset (shorts), كونطرا](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “contract”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: سنيت الكونطرا ديال الخدمة.: I signed the work contract.

## 247. قنية (noun): rabbit

- Uses: 20.3 per million (14 times). Forms counted: القنيه قنيه فقنيه لقنيه قنيتو
- Dictionary: [Wiktionary, (Moroccan Arabic), قنية](https://en.wiktionary.org/wiki/%D9%82%D9%86%D9%8A%D8%A9#Moroccan_Arabic): “rabbit”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندنا قنية فالدار.: We have a rabbit at home.

## 248. باليزة (noun): suitcase

- Uses: 20.1 per million (12 times). Forms counted: الباليزه باليزه باليزتي باليزتك
- Dictionary: [Wiktionary, (Moroccan Arabic), باليزة](https://en.wiktionary.org/wiki/%D8%A8%D8%A7%D9%84%D9%8A%D8%B2%D8%A9#Moroccan_Arabic): “suitcase”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وجّدتي الباليزة؟: Have you packed the suitcase?

## 249. تزعلل (verb): to swing

- Uses: 20 per million (10 times). Forms counted: تزعلل نتزعلل كيتزعلل
- Dictionary: [Darija Open Dataset (verbs), تزعلل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “swing”
- Dictionary: [Darija Open Dataset (shorts), تزعلل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “swing”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدراري كيتزعللو فالجردة.: The kids are swinging in the park.

## 250. غيس (noun): mud

- Uses: 19.8 per million (17 times). Forms counted: الغيس والغيس لغيس فالغيس
- Dictionary: [Darija Open Dataset (environment), غيس](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/environment.csv): “mud”
- Dictionary: [Darija Open Dataset (shorts), غيس](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “mud”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: صباطي عامر غيس.: My shoes are covered in mud.

## 251. ستف (verb): to arrange, to stack neatly

- Uses: 19.6 per million (15 times). Forms counted: ستف ونستفو ستفو ستفونا تستفو يستف يستفهم كنستف كتستف كيستف كيستفو ستفي
- Dictionary: [Wiktionary, (Moroccan Arabic), ستف](https://en.wiktionary.org/wiki/%D8%B3%D8%AA%D9%81#Moroccan_Arabic): “to arrange”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ستف الحوايج فالباليزة.: Arrange the clothes in the suitcase.

## 252. صغيور (adj): tiny

- Uses: 19.6 per million (24 times). Forms counted: صغيوره صغيور صغيورين الصغيور الصغيوره
- Dictionary: [Darija Open Dataset (adjectives), صغيوّر](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “tiny”
- Dictionary: [Darija Open Dataset (shorts), صغيوّر](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “tiny”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندها دار صغيورة.: She has a tiny house.

## 253. بزطام (noun): wallet

- Uses: 18.8 per million (14 times). Forms counted: بزطام بزطامي بزطامو لبزطام البزطام بزطامك
- Dictionary: [Wiktionary, (Moroccan Arabic), بزطام](https://en.wiktionary.org/wiki/%D8%A8%D8%B2%D8%B7%D8%A7%D9%85#Moroccan_Arabic): “wallet”
- Dictionary: [Darija Open Dataset (shorts), بزطام](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “wallet”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ضاع ليا البزطام.: I've lost my wallet.

## 254. بلية (noun): addiction, bad habit

- Uses: 18.6 per million (21 times). Forms counted: البليه بليه بالبليه للبليه وبليتو
- Dictionary: [Wiktionary, (Moroccan Arabic), بلية](https://en.wiktionary.org/wiki/%D8%A8%D9%84%D9%8A%D8%A9#Moroccan_Arabic): “addiction”
- Standard Arabic: “بلية (noun): marble to play”
- Note in the app: Not MSA بَلِيَّة (calamity).
- Sentence: البلية ديال الڭارو خايبة.: Smoking is a bad habit.

## 255. شارجور (noun): charger

- Uses: 18.3 per million (8 times). Forms counted: شارجور الشارجور
- Dictionary: [Darija Open Dataset (nouns), شارجور](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “charger”
- Dictionary: [Darija Open Dataset (shorts), شارجور](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “charger”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندك شارجور ديال التيليفون؟: Do you have a phone charger?

## 256. مانطة (noun): blanket

- Uses: 17.9 per million (22 times). Forms counted: المانطه مانطه بالمانطه بمانطه والمانطه دالمانطه للمانطه
- Dictionary: [Wiktionary, (Moroccan Arabic), مانطة](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D9%86%D8%B7%D8%A9#Moroccan_Arabic): “blanket”
- Dictionary: [Darija Open Dataset (nouns), مانطة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “blanket”
- Dictionary: [Darija Open Dataset (shorts), مانطة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “blanket”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني مانطة، راني بردان.: Give me a blanket, I'm cold.

## 257. سرباية (noun): waitress

- Uses: 17.2 per million (12 times). Forms counted: سربايه السربايه
- Dictionary: [Darija Open Dataset (professions), سرباية](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/professions.csv): “waitress”
- Dictionary: [Darija Open Dataset (shorts), سرباية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “waitress”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: السرباية جابت القهوة.: The waitress brought the coffee.

## 258. صرفق (verb): to slap

- Uses: 16.8 per million (17 times). Forms counted: صرفقو صرفقها وصرفقها وصرفقتي صرفقتيهم صرفقات تصرفق تصرفقو يصرفقو ويصرفقو كنصرفق كنصرفقو كتصرفق كتصرفقني كيصرفق وكيصرفق فكيصرفقك
- Dictionary: [Wiktionary, (Moroccan Arabic), صرفق](https://en.wiktionary.org/wiki/%D8%B5%D8%B1%D9%81%D9%82#Moroccan_Arabic): “to smack; to slap”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: ماتصرفقش خوك!: Don't slap your brother!

## 259. فانيد (noun): sweets, candy

- Uses: 16.2 per million (9 times). Forms counted: فانيد فانيده الفانيد والفانيد
- Dictionary: [Wiktionary, (Moroccan Arabic), فانيد](https://en.wiktionary.org/wiki/%D9%81%D8%A7%D9%86%D9%8A%D8%AF#Moroccan_Arabic): “candy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطا للدراري الفانيد.: He gave the kids sweets.

## 260. زلافة (noun): bowl

- Uses: 15.4 per million (8 times). Forms counted: زلافه الزلافه زلافتها زلافتنا
- Dictionary: [Wiktionary, (Moroccan Arabic), زلافة](https://en.wiktionary.org/wiki/%D8%B2%D9%84%D8%A7%D9%81%D8%A9#Moroccan_Arabic): “bowl”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عطيني زلافة ديال الحريرة.: Give me a bowl of harira.

## 261. تكشيطة (noun): takchita (a long dress for parties)

- Uses: 14.6 per million (7 times). Forms counted: تكشيطه بتكشيطه لتكشيطه التكشيطه
- Dictionary: [Darija Open Dataset (clothes), تكشيطة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “takchiTa”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لبسات تكشيطة فالعرس.: She wore a takchita at the wedding.

## 262. زعلولة (noun): swing (for children)

- Uses: 14.6 per million (7 times). Forms counted: زعلوله الزعلوله فزعلوله
- Dictionary: [Wiktionary, (Moroccan Arabic), زعلولة](https://en.wiktionary.org/wiki/%D8%B2%D8%B9%D9%84%D9%88%D9%84%D8%A9#Moroccan_Arabic): “swing (for children)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدراري كيلعبو فالزعلولة.: The kids are playing on the swing.

## 263. تسارى (verb): to go for a walk, to go sightseeing

- Uses: 14.5 per million (16 times). Forms counted: تتساري يتساري تيتساري تساري تسارينا نتساري نتسارا نتساراو
- Dictionary: [Wiktionary, (Moroccan Arabic), تسارى](https://en.wiktionary.org/wiki/%D8%AA%D8%B3%D8%A7%D8%B1%D9%89#Moroccan_Arabic): “(intransitive) to sightsee”
- Dictionary: [Wiktionary, (Moroccan Arabic), سارى](https://en.wiktionary.org/wiki/%D8%B3%D8%A7%D8%B1%D9%89#Moroccan_Arabic): “(transitive) to take someone sightseeing”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: يالاه نتساراو شوية.: Let's go for a walk.

## 264. عطرية (noun): spices

- Uses: 14.2 per million (12 times). Forms counted: العطريه والعطريه عطريه لعطريه بالعطريه
- Dictionary: [Wiktionary, (Moroccan Arabic), عطرية](https://en.wiktionary.org/wiki/%D8%B9%D8%B7%D8%B1%D9%8A%D8%A9#Moroccan_Arabic): “spice, spices”
- Dictionary: [Darija Open Dataset (food), عطرية](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “spices”
- Dictionary: [Darija Open Dataset (shorts), عطرية](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “spices”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: زيد شوية ديال العطرية.: Add a bit of spice.

## 265. قميجة (noun): shirt

- Uses: 13.9 per million (8 times). Forms counted: القميجه وقميجه قميجه
- Dictionary: [Wiktionary, (Moroccan Arabic), قميجة](https://en.wiktionary.org/wiki/%D9%82%D9%85%D9%8A%D8%AC%D8%A9#Moroccan_Arabic): “shirt”
- Dictionary: [Darija Open Dataset (clothes), قميجة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/clothes.csv): “shirt”
- Dictionary: [Darija Open Dataset (shorts), قميجة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “shirt”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شريت قميجة بيضا.: I bought a white shirt.

## 266. ڭود (adv): straight (ahead)

- Uses: 13.8 per million (6 times). Forms counted: ڭود
- Dictionary: [Darija Open Dataset (adjectives), ڭود](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “straight”
- Dictionary: [Darija Open Dataset (shorts), ڭود](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “straight”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: سير ڭود وغادي تلقاها.: Go straight and you'll find it.

## 267. روبيني (noun): tap, faucet

- Uses: 13.4 per million (11 times). Forms counted: الروبيني روبيني فروبيني
- Dictionary: [Wiktionary, (Moroccan Arabic), روبيني](https://en.wiktionary.org/wiki/%D8%B1%D9%88%D8%A8%D9%8A%D9%86%D9%8A#Moroccan_Arabic): “tap, faucet”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: سد الروبيني.: Turn off the tap.

## 268. فريز (noun): strawberries

- Uses: 13.1 per million (7 times). Forms counted: الفريز فريز بالفريز
- Dictionary: [Wiktionary, (Moroccan Arabic), فريز](https://en.wiktionary.org/wiki/%D9%81%D8%B1%D9%8A%D8%B2#Moroccan_Arabic): “strawberry”
- Dictionary: [Darija Open Dataset (food), فريز](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “strawberry”
- Dictionary: [Darija Open Dataset (shorts), فريز](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “strawberry”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كنبغي الفريز بزاف.: I really like strawberries.

## 269. فرماسيان (noun): pharmacy

- Uses: 12.3 per million (6 times). Forms counted: فرماسيان لفرماسيان الفرماسيان
- Dictionary: [Darija Open Dataset (places), فرماسيان](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “pharmacy”
- Dictionary: [Darija Open Dataset (shorts), فرماسيان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “pharmacy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شريت الدوا من الفرماسيان.: I bought the medicine at the pharmacy.

## 270. برطمة (noun): flat, apartment

- Uses: 12.2 per million (15 times). Forms counted: البرطمه برطمه
- Dictionary: [Wiktionary, (Moroccan Arabic), برطمة](https://en.wiktionary.org/wiki/%D8%A8%D8%B1%D8%B7%D9%85%D8%A9#Moroccan_Arabic): “apartment, flat”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كريت برطمة فالرباط.: I rented a flat in Rabat.

## 271. شياطة (noun): leftovers, what's left over

- Uses: 12.2 per million (15 times). Forms counted: الشياطه شياطه فشياطه
- Dictionary: [Darija Open Dataset (adjectives), شياطة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “surplus”
- Dictionary: [Darija Open Dataset (shorts), شياطة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “surplus”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: كلينا الشياطة ديال البارح.: We ate yesterday's leftovers.

## 272. شطّب (verb): to sweep

- Uses: 11.6 per million (7 times). Forms counted: تشطب شطبو نشطب ويشطبو كانشطب كيشطب
- Dictionary: [Darija Open Dataset (shorts), شطب](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “clean”
- Standard Arabic: “شطب (verb): (obsolete) to slit, to cut through superficially, to slash”; “شطب (verb): (obsolete) to bend, to lean to the side”; “شطب (verb): (obsolete) to deviate, to decline [with عَن (ʕan)]”; “شطب (verb): to cross out, to delete, to discharge”
- Note in the app: MSA شَطَبَ is "to cross out".
- Sentence: شطّب الدار عفاك.: Sweep the house, please.

## 273. زڭل (verb): to miss (a bus, a chance)

- Uses: 11.5 per million (5 times). Forms counted: زڭل زڭلني زڭلتي كاتزڭل
- Dictionary: [Darija Open Dataset (verbs), زڭل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/verbs.csv): “miss”
- Dictionary: [Darija Open Dataset (shorts), زڭل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “miss”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: زڭلت الطوبيس.: I missed the bus.

## 274. زردة (noun): feast, big meal

- Uses: 11.5 per million (5 times). Forms counted: زرده
- Dictionary: [Wiktionary, (Moroccan Arabic), زردة](https://en.wiktionary.org/wiki/%D8%B2%D8%B1%D8%AF%D8%A9#Moroccan_Arabic): “banquet”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: دارو زردة كبيرة.: They threw a big feast.

## 275. زعفان (adj): upset, in a bad mood

- Uses: 11.5 per million (5 times). Forms counted: زعفان
- Dictionary: [Wiktionary, (Moroccan Arabic), زعفان](https://en.wiktionary.org/wiki/%D8%B2%D8%B9%D9%81%D8%A7%D9%86#Moroccan_Arabic): “upset”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: باه زعفان عليه.: His dad is cross with him.

## 276. جدارمي (noun): gendarme (country police officer)

- Uses: 11.4 per million (14 times). Forms counted: جدارمي الجدارميه جدارميه الجدارمي وجدارميه فالجدارميه
- Dictionary: [Darija Open Dataset (professions), جدارمي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/professions.csv): “gendarme”
- Dictionary: [Darija Open Dataset (shorts), جدارمي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “gendarme”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وقفنا جدارمي فالطريق.: A gendarme stopped us on the road.

## 277. قشع (verb): to make out, to see

- Uses: 11.1 per million (10 times). Forms counted: قشع ماقشعت نقشع يقشعو ويقشعو تيقشع كاتقشعي
- Dictionary: [Wiktionary, (Moroccan Arabic), قشع](https://en.wiktionary.org/wiki/%D9%82%D8%B4%D8%B9#Moroccan_Arabic): “to see”
- Standard Arabic: “قشع (verb): to scatter, to disperse, to drive away, to chase away”
- Note in the app: Not MSA قَشَعَ (to clear away).
- Sentence: واش كتقشع شي حاجة؟: Can you see anything?

## 278. زليج (noun): zellige (mosaic tiles)

- Uses: 11 per million (8 times). Forms counted: الزليج زليج فزليج زليجه
- Dictionary: [Wiktionary, (Moroccan Arabic), زليج](https://en.wiktionary.org/wiki/%D8%B2%D9%84%D9%8A%D8%AC#Moroccan_Arabic): “tiles; zelliges”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الزليج ديال هاد الدار زوين.: The tiles in this house are beautiful.

## 279. كوش (noun): nappy, diaper

- Uses: 11 per million (8 times). Forms counted: كوشي كوش الكوش بكوشه
- Dictionary: [Wiktionary, (Moroccan Arabic), كوش](https://en.wiktionary.org/wiki/%D9%83%D9%88%D8%B4#Moroccan_Arabic): “diaper”
- Standard Arabic: “كوش (verb): to amass, concentrate, heap up gather up, snatch, grasp”
- Note in the app: Not MSA كَوَّشَ (to grab).
- Sentence: بدّل ليه الكوش.: Change his nappy.

## 280. جاكيطة (noun): jacket

- Uses: 10.8 per million (6 times). Forms counted: الجاكيطه جاكيطه وبجاكيطه
- Dictionary: [Wiktionary, (Moroccan Arabic), جاكيطة](https://en.wiktionary.org/wiki/%D8%AC%D8%A7%D9%83%D9%8A%D8%B7%D8%A9#Moroccan_Arabic): “jacket (piece of clothing)”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: نسيت الجاكيطة فالخدمة.: I left my jacket at work.

## 281. طريطوار (noun): pavement, sidewalk

- Uses: 10.6 per million (13 times). Forms counted: الطريطوار والطريطوار
- Dictionary: [Darija Open Dataset (places), طريطوار](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “sidewalk”
- Dictionary: [Darija Open Dataset (shorts), طريطوار](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “sidewalk”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: مشي على الطريطوار.: Walk on the pavement.

## 282. حشمان (adj): shy; ashamed

- Uses: 10 per million (5 times). Forms counted: حشمان
- Dictionary: [Wiktionary, (Moroccan Arabic), حشمان](https://en.wiktionary.org/wiki/%D8%AD%D8%B4%D9%85%D8%A7%D9%86#Moroccan_Arabic): “shy”
- Dictionary: [Darija Open Dataset (adjectives), حشمان](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “shy”
- Dictionary: [Darija Open Dataset (adjectives), حشمان](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “ashamed”
- Dictionary: [Darija Open Dataset (shorts), حشمان](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “shy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هو حشمان شوية.: He's a bit shy.

## 283. تومة (noun): garlic

- Uses: 9.8 per million (12 times). Forms counted: التومه بالتومه
- Dictionary: [Darija Open Dataset (food), تومة](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “garlic”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: زيد التومة للماكلة.: Add garlic to the food.

## 284. فلبلاصة (adv): right away, immediately

- Uses: 9.6 per million (10 times). Forms counted: فلبلاصه
- Dictionary: [Darija Open Dataset (adverbs), فلبلاصة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adverbs.csv): “immediately”
- Dictionary: [Darija Open Dataset (shorts), فلبلاصة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “immediately”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جاوبني فلبلاصة.: He answered me right away.

## 285. بيرمي (noun): driving licence

- Uses: 9.5 per million (8 times). Forms counted: البيرمي بيرمي وبيرمي
- Dictionary: [Wiktionary, (Moroccan Arabic), بيرمي](https://en.wiktionary.org/wiki/%D8%A8%D9%8A%D8%B1%D9%85%D9%8A#Moroccan_Arabic): “driver's license”
- Dictionary: [Darija Open Dataset (nouns), بيرمي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “driver's license”
- Dictionary: [Darija Open Dataset (shorts), بيرمي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “driver s license”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: دوزت البيرمي البارح.: I took my driving licence test yesterday.

## 286. شطابة (noun): broom

- Uses: 9 per million (11 times). Forms counted: الشطابه بالشطابه شطابه فالشطابه
- Dictionary: [Wiktionary, (Moroccan Arabic), شطابة](https://en.wiktionary.org/wiki/%D8%B4%D8%B7%D8%A7%D8%A8%D8%A9#Moroccan_Arabic): “broom”
- Dictionary: [Darija Open Dataset (nouns), شطابة](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “broom”
- Dictionary: [Darija Open Dataset (shorts), شطابة](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “broom”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: جيب الشطابة.: Bring the broom.

## 287. عروبي (noun): country person

- Uses: 8.8 per million (5 times). Forms counted: عروبيه لعروبيه عروبي فعروبيه
- Dictionary: [Wiktionary, (Moroccan Arabic), عروبي](https://en.wiktionary.org/wiki/%D8%B9%D8%B1%D9%88%D8%A8%D9%8A#Moroccan_Arabic): “peasant, rural countrysider, bedouin”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: باه عروبي من دكالة.: His dad is a country man from Doukkala.

## 288. قهوي (adj): brown

- Uses: 8.8 per million (9 times). Forms counted: قهويين قهويه قهوي والقهويين
- Dictionary: [Wiktionary, (Moroccan Arabic), قهوي](https://en.wiktionary.org/wiki/%D9%82%D9%87%D9%88%D9%8A#Moroccan_Arabic): “brown”
- Dictionary: [Darija Open Dataset (nouns), قهوي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/nouns.csv): “brown”
- Dictionary: [Darija Open Dataset (colors), قهوي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/colors.csv): “brown”
- Dictionary: [Darija Open Dataset (shorts), قهوي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “brown”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عندها عينين قهويين.: She has brown eyes.

## 289. وقتاش (adv): when?

- Uses: 8.5 per million (5 times). Forms counted: وقتاش
- Dictionary: [Wiktionary, (Moroccan Arabic), وقتاش](https://en.wiktionary.org/wiki/%D9%88%D9%82%D8%AA%D8%A7%D8%B4#Moroccan_Arabic): “(interrogative) when?”
- Dictionary: [Darija Open Dataset (pronouns), وقتاش](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/pronouns.csv): “when”
- Dictionary: [Darija Open Dataset (shorts), وقتاش](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “when”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: وقتاش كيبدا الماتش؟: When does the match start?

## 290. حجّام (noun): barber

- Uses: 8.2 per million (10 times). Forms counted: الحجام حجام دلحجام
- Dictionary: [Darija Open Dataset (professions), حجّام](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/professions.csv): “barber”
- Dictionary: [Darija Open Dataset (shorts), حجّام](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “barber”
- Standard Arabic: “حجام (noun): muzzle, mouth-cup”; “حجام (noun): cupper, surgeon”
- Note in the app: MSA حَجَّام is "cupper".
- Sentence: مشيت عند الحجّام.: I went to the barber.

## 291. خبع (verb): to hide

- Uses: 8 per million (8 times). Forms counted: خبعت وتخبع خبع خبعوه يخبعها تيخبعوه
- Dictionary: [Wiktionary, (Moroccan Arabic), خبع](https://en.wiktionary.org/wiki/%D8%AE%D8%A8%D8%B9#Moroccan_Arabic): “(transitive) to hide, to conceal, to cloak”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: خبعت الفلوس تحت المانطة.: I hid the money under the blanket.

## 292. ماطيشة (noun): tomatoes

- Uses: 7.8 per million (6 times). Forms counted: ماطيشه دماطيشه
- Dictionary: [Wiktionary, (Moroccan Arabic), ماطيشة](https://en.wiktionary.org/wiki/%D9%85%D8%A7%D8%B7%D9%8A%D8%B4%D8%A9#Moroccan_Arabic): “tomatoes”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شري الماطيشة من المارشي.: Buy tomatoes at the market.

## 293. هبيل (adj): crazy, mad

- Uses: 7.8 per million (6 times). Forms counted: هبيل الهبيل لهبيله بهبيلا
- Dictionary: [Darija Open Dataset (adjectives), هبيل](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “crazy”
- Dictionary: [Darija Open Dataset (shorts), هبيل](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “crazy”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: واش نتا هبيل؟: Are you crazy?

## 294. دلاح (noun): watermelon

- Uses: 7 per million (5 times). Forms counted: دلاح دلاحه الدلاح
- Dictionary: [Wiktionary, (Moroccan Arabic), دلاح](https://en.wiktionary.org/wiki/%D8%AF%D9%84%D8%A7%D8%AD#Moroccan_Arabic): “watermelon, watermelons”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), دلاع](https://en.wiktionary.org/wiki/%D8%AF%D9%84%D8%A7%D8%B9#Arabic): “from Arabic دلاع: watermelon”
- Dictionary: [Darija Open Dataset (food), دلاح](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/food.csv): “watermelon”
- Dictionary: [Darija Open Dataset (shorts), دلاح](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “watermelon”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدلاح بارد وبنين.: The watermelon is cold and tasty.

## 295. حرايفي (adj): skilful, good with one's hands

- Uses: 7 per million (5 times). Forms counted: الحرايفي حرايفي بالحرايفي الحرايفيين
- Dictionary: [Darija Open Dataset (adjectives), حرايفي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “skilled”
- Dictionary: [Darija Open Dataset (adjectives), حرايفي](https://github.com/darija-open-dataset/dataset/blob/main/syntactic%20categories/adjectives.csv): “adroit”
- Dictionary: [Darija Open Dataset (professions), حرايفي](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/professions.csv): “craftsperson”
- Dictionary: [Darija Open Dataset (shorts), حرايفي](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “craftsperson”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: هو حرايفي فالخدمة ديالو.: He's skilled at his work.

## 296. سكويلة (noun): school

- Uses: 6.5 per million (8 times). Forms counted: السكويله سكويله
- Dictionary: [Wiktionary, (Moroccan Arabic), سكويلة](https://en.wiktionary.org/wiki/%D8%B3%D9%83%D9%88%D9%8A%D9%84%D8%A9#Moroccan_Arabic): “(dated) school”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: الدراري فالسكويلة.: The kids are at school.

## 297. صاية (noun): skirt

- Uses: 5.7 per million (7 times). Forms counted: الصايه
- Dictionary: [Wiktionary, (Moroccan Arabic), صاية](https://en.wiktionary.org/wiki/%D8%B5%D8%A7%D9%8A%D8%A9#Moroccan_Arabic): “skirt”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: لبسات صاية زرقا.: She wore a blue skirt.

## 298. ضاية (noun): pond, small lake

- Uses: 5.7 per million (7 times). Forms counted: ضايه الضايه
- Dictionary: [Wiktionary, (Moroccan Arabic), ضاية](https://en.wiktionary.org/wiki/%D8%B6%D8%A7%D9%8A%D8%A9#Moroccan_Arabic): “lake”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: عومنا فالضاية.: We swam in the pond.

## 299. فاكية (noun): dried fruit; fruit

- Uses: 4.9 per million (6 times). Forms counted: والفاكيه فاكيه الفاكيه
- Dictionary: [Wiktionary, (Moroccan Arabic), فاكية](https://en.wiktionary.org/wiki/%D9%81%D8%A7%D9%83%D9%8A%D8%A9#Moroccan_Arabic): “dried fruit”
- Dictionary: [Wiktionary, (Moroccan Arabic), فاكية](https://en.wiktionary.org/wiki/%D9%81%D8%A7%D9%83%D9%8A%D8%A9#Moroccan_Arabic): “fruit”
- Dictionary: [Wiktionary, (Arabic, its Moroccan descendant), فاكهة](https://en.wiktionary.org/wiki/%D9%81%D8%A7%D9%83%D9%87%D8%A9#Arabic): “from Arabic فاكهة: fruit”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: شرينا الفاكية للعيد.: We bought dried fruit for the holiday.

## 300. لوطوروت (noun): motorway

- Uses: 4.9 per million (6 times). Forms counted: فلوطوروت لوطوروت
- Dictionary: [Darija Open Dataset (places), لوطوروت](https://github.com/darija-open-dataset/dataset/blob/main/semantic%20categories/places.csv): “highway”
- Dictionary: [Darija Open Dataset (shorts), لوطوروت](https://github.com/darija-open-dataset/dataset/blob/main/x-tra/shorts.csv): “highway”
- Standard Arabic: Wiktionary has no Standard Arabic entry spelled this way.
- Sentence: خدينا اللوطوروت لمراكش.: We took the motorway to Marrakech.

