// Vocab → Ask by voice, in the learner's own language (prototype voice_ask_native; the owner, 2026-11-21: questions
// understood in all the app's languages, "¿cómo se dice perro en árabe?", "ما معنى …", "add it" said in their own
// language). One table per app language: how its speakers ask how to say a word, what a word means, which language
// they mean, and how they say "add it"; and the box's examples in that language. voiceask.js readQuestion reads a
// question with the learner's own table first and with English after it.
//
// The patterns are matched against the question in small letters (the words asked about keep their own letters).
// "{L}" in a language pattern is where the language's name goes. Every pattern is the whole question (^…$).
//
// Shared by the desktop app, the phone and the web app (tested in tests/js/voiceask.test.mjs).

// Each table:
//   names    the languages a question can name, by the words people say for them: the first is the one the box's
//            example says ("en árabe"); the others are other spellings or stems (Russian "арабск" is in арабский,
//            по-арабски, на арабском).
//   lang     where the language's name stands, with the little words round it ("en {L}", "{L}語で")
//   say      how do I say … (the word asked about is the one group)
//   sayLang  the same, but only when a language was named ("¿qué es perro en árabe?")
//   mean     what does … mean
//   meanBare the same, but only when no language was named ("¿qué es bonito?")
//   add      "add it", at the end of a question or on its own;  all: within it, "add them all"
//   yes      words that may stand beside "add it" ("sí, añádelo");  join: "and", "then"
//   fill     words a question may start with ("oye", "por favor")
//   word     "the word" before what is asked about ("la palabra perro")
//   tail     endings a question may have (Japanese か, Chinese 呢)
//   cut      words that may stand anywhere and mean nothing here (Tagalog po)
//   particle little endings a Korean or Japanese word takes in a sentence (개를, 犬は): taken off, and kept as a second try
//   spaced   false for a language written without spaces between words
//   ex       the examples: say(word, language), mean(word), add; dog: the language's own word for "dog" (en: its English,
//            when the example asks for another word: Portuguese cachorro is "puppy" first in the dictionary)
export const NATIVE = {
  es: {
    names: { es: "español|castellano", ar: "árabe|arabe", fr: "francés|frances", ja: "japonés|japones", zh: "chino|mandarín|mandarin",
      ru: "ruso", it: "italiano", tl: "tagalo|tagalog|filipino", pt: "portugués|portugues|brasileño", ca: "catalán|catalan",
      ceb: "bisaya|cebuano|visaya", th: "tailandés|tailandes|thai", de: "alemán|aleman", fa: "persa|farsi", hi: "hindi|hindú",
      ko: "coreano", la: "latín|latin", en: "inglés|ingles" },
    lang: "(?:en|al|a)\\s+(?:el\\s+)?(?:idioma\\s+|lengua\\s+)?{L}",
    say: ["c[oó]mo\\s+(?:se\\s+dice|se\\s+escribe|se\\s+traduce|digo|dir[ií]a|puedo\\s+decir|se\\s+puede\\s+decir|traduzco|le\\s+digo)\\s+(.+)",
      "(.+?)\\s+c[oó]mo\\s+se\\s+dice", "(?:traduce|trad[uú]ceme|traducir|traduzca)\\s+(.+)",
      "(?:cu[aá]l\\s+es\\s+|qu[eé]\\s+es\\s+)?la\\s+palabra\\s+(?:para|de)\\s+(.+)"],
    sayLang: ["(?:qu[eé]\\s+es|c[oó]mo\\s+es)\\s+(.+)"],
    mean: ["qu[eé]\\s+(?:significa|quiere\\s+decir)\\s+(.+)", "(?:cu[aá]l\\s+es\\s+)?el\\s+significado\\s+de\\s+(.+)",
      "significado\\s+de\\s+(.+)", "(?:define|defin[ei]ci[oó]n\\s+de)\\s+(.+)", "(.+?)\\s+qu[eé]\\s+(?:significa|quiere\\s+decir)"],
    meanBare: ["qu[eé]\\s+es\\s+(.+)"],
    add: "(?:a[nñ][aá]de|agr[eé]ga|gu[aá]rda|a[nñ]adir|agregar|guardar|pon)(?:lo|la|los|las|melo|mela)?(?:\\s+(?:todos|todas|ambos|ambas|los\\s+dos|las\\s+dos))?(?:\\s+(?:a|en)\\s+(?:mis\\s+)?(?:tarjetas|palabras|vocabulario|fichas|mazo))?|(?:haz|hazme|crea)\\s+una\\s+tarjeta",
    all: "(?:los|las)\\b|todos|todas|ambos|ambas|los\\s+dos|las\\s+dos",
    yes: "s[ií]|vale|ok|okay|por\\s+favor|ya|ahora|tambi[eé]n|claro",
    join: "y|luego|despu[eé]s|tambi[eé]n|por\\s+favor",
    fill: "oye|hola|vale|bueno|eh+|este|pues|por\\s+favor|tamkeen|dime|me\\s+puedes\\s+decir|puedes\\s+decirme|quiero\\s+saber|sabes|una\\s+pregunta",
    word: "(?:la\\s+)?(?:palabra|frase|expresi[oó]n)",
    ex: { say: (w, n) => `¿Cómo se dice ${w} en ${n}?`, mean: (w) => `¿Qué significa ${w}?`, add: "añádelo", dog: "perro" },
  },
  fr: {
    names: { es: "espagnol", ar: "arabe", fr: "français|francais", ja: "japonais", zh: "chinois|mandarin", ru: "russe", it: "italien",
      tl: "tagalog|filipino", pt: "portugais|brésilien", ca: "catalan", ceb: "bisaya|cebuano", th: "thaï|thai|thaïlandais",
      de: "allemand", fa: "persan|farsi", hi: "hindi", ko: "coréen|coreen", la: "latin", en: "anglais" },
    lang: "(?:en|à|a)\\s+(?:langue\\s+)?{L}",
    say: ["comment\\s+(?:est-ce\\s+qu'on\\s+dit|on\\s+dit|dit-on|dire|je\\s+dis|je\\s+peux\\s+dire|puis-je\\s+dire|dirais-je|s'[eé]crit|[eé]crit-on|on\\s+[eé]crit|se\\s+dit|traduire|traduit-on|on\\s+traduit)\\s+(.+)",
      "(.+?)\\s+(?:se\\s+dit|s'[eé]crit|on\\s+dit)\\s+comment", "(?:traduis|traduisez|traduire)(?:-moi)?\\s+(.+)",
      "(?:quel\\s+est\\s+)?le\\s+mot\\s+(?:pour|de)\\s+(.+)"],
    sayLang: ["(?:c'est\\s+quoi|quel\\s+est)\\s+(.+)", "(.+?)\\s+c'est\\s+quoi"],
    mean: ["que\\s+(?:veut\\s+dire|signifie)\\s+(.+)", "qu'est-ce\\s+que\\s+(?:veut\\s+dire|signifie)\\s+(.+)",
      "qu'est-ce\\s+que\\s+(.+?)\\s+veut\\s+dire", "(.+?)\\s+(?:[cç]a\\s+)?veut\\s+dire\\s+quoi", "(.+?)\\s+(?:signifie|veut\\s+dire)\\s+quoi",
      "(?:quel\\s+est\\s+)?le\\s+sens\\s+de\\s+(.+)", "(?:la\\s+)?signification\\s+de\\s+(.+)", "(?:d[eé]finis|d[eé]finition\\s+de)\\s+(.+)"],
    meanBare: ["c'est\\s+quoi\\s+(.+)", "qu'est-ce\\s+que\\s+(?:c'est\\s+que\\s+)?(.+)", "(.+?)\\s+c'est\\s+quoi"],
    add: "(?:ajoute|ajoutez|ajouter|enregistre|garde|sauvegarde)(?:[- ](?:le|la|les))?(?:\\s+(?:à|a|dans)\\s+(?:mes\\s+)?(?:cartes|mots|vocabulaire|paquet))?|(?:fais|fais-en|crée|cree)\\s+(?:en\\s+)?une\\s+carte",
    all: "\\bles\\b|tous|toutes|les\\s+deux",
    yes: "oui|ok|okay|d'accord|s'il\\s+te\\s+pla[iî]t|s'il\\s+vous\\s+pla[iî]t|maintenant|aussi",
    join: "et|puis|ensuite|aussi",
    fill: "dis|dites|euh+|bon|alors|ok|okay|salut|bonjour|s'il\\s+te\\s+pla[iî]t|s'il\\s+vous\\s+pla[iî]t|tamkeen|dis-moi|dites-moi|je\\s+voudrais\\s+savoir|je\\s+veux\\s+savoir|tu\\s+sais|est-ce\\s+que\\s+tu\\s+peux\\s+me\\s+dire|peux-tu\\s+me\\s+dire",
    word: "(?:le\\s+)?(?:mot|terme|l'expression|expression|la\\s+phrase|phrase)",
    ex: { say: (w, n) => `Comment dit-on ${w} en ${n} ?`, mean: (w) => `Que veut dire ${w} ?`, add: "ajoute-le", dog: "chien" },
  },
  de: {
    names: { es: "spanisch", ar: "arabisch", fr: "französisch|franzoesisch", ja: "japanisch", zh: "chinesisch|mandarin", ru: "russisch",
      it: "italienisch", tl: "tagalog|filipino", pt: "portugiesisch", ca: "katalanisch", ceb: "bisaya|cebuano",
      th: "thailändisch|thailaendisch|thai", de: "deutsch", fa: "persisch|farsi", hi: "hindi", ko: "koreanisch", la: "latein", en: "englisch" },
    cap: true,
    lang: "(?:auf|in|im|ins)\\s+{L}",
    say: ["wie\\s+(?:sagt\\s+man|sage\\s+ich|kann\\s+ich|würde\\s+ich|wuerde\\s+ich|schreibt\\s+man|übersetzt\\s+man|uebersetzt\\s+man|heißt|heisst)\\s+(.+?)(?:\\s+(?:sagen|schreiben|übersetzen|uebersetzen))?",
      "(?:übersetze|übersetz|übersetzen|uebersetze)(?:\\s+mir)?\\s+(.+)", "(?:was\\s+ist\\s+)?das\\s+wort\\s+für\\s+(.+)"],
    sayLang: ["was\\s+(?:ist|heißt|heisst)\\s+(.+)"],
    mean: ["was\\s+(?:bedeutet|meint)\\s+(.+)", "was\\s+ist\\s+die\\s+bedeutung\\s+von\\s+(.+)", "(?:die\\s+)?bedeutung\\s+von\\s+(.+)",
      "(?:definiere|erkläre|erklaere)(?:\\s+mir)?\\s+(.+)", "(.+?)\\s+bedeutet\\s+was"],
    meanBare: ["was\\s+(?:heißt|heisst|ist)\\s+(.+)"],
    add: "(?:füg|füge|fügen|fueg|fuege)\\s+(?:es|das|sie|ihn|beide|alle)?\\s*(?:zu\\s+(?:meinen\\s+)?(?:karten|wörtern|vokabeln)\\s+)?hinzu|(?:speicher|speichere|merk|merke)\\s+(?:es|das|sie|ihn|beide|alle)(?:\\s+dir)?|(?:es\\s+|das\\s+)?(?:hinzufügen|speichern)|mach(?:e)?\\s+(?:daraus\\s+)?eine\\s+karte",
    all: "beide|alle",
    yes: "ja|ok|okay|bitte|jetzt|auch",
    join: "und|dann|auch|bitte",
    fill: "hey|hallo|also|ok|okay|ähm|äh|bitte|tamkeen|sag\\s+mal|sag\\s+mir|kannst\\s+du\\s+mir\\s+sagen|ich\\s+möchte\\s+wissen|ich\\s+will\\s+wissen|weißt\\s+du",
    word: "(?:das\\s+)?(?:wort|ausdruck)",
    ex: { say: (w, n) => `Wie sagt man ${w} auf ${n}?`, mean: (w) => `Was bedeutet ${w}?`, add: "füg es hinzu", dog: "Hund" },
  },
  it: {
    names: { es: "spagnolo", ar: "arabo", fr: "francese", ja: "giapponese", zh: "cinese|mandarino", ru: "russo", it: "italiano",
      tl: "tagalog|filippino", pt: "portoghese", ca: "catalano", ceb: "bisaya|cebuano", th: "thailandese|thai", de: "tedesco",
      fa: "persiano|farsi", hi: "hindi", ko: "coreano", la: "latino", en: "inglese" },
    lang: "(?:in)\\s+{L}",
    say: ["come\\s+(?:si\\s+dice|dico|direi|posso\\s+dire|si\\s+scrive|si\\s+traduce|traduco)\\s+(.+)", "(.+?)\\s+come\\s+si\\s+dice",
      "(?:traduci|tradurre|traduca)(?:mi)?\\s+(.+)", "(?:qual\\s+è\\s+)?la\\s+parola\\s+per\\s+(.+)"],
    sayLang: ["(?:cos'è|cosa\\s+è|che\\s+cos'è|cos'e)\\s+(.+)"],
    mean: ["(?:che\\s+)?cosa\\s+(?:significa|vuol\\s+dire|vuole\\s+dire)\\s+(.+)", "che\\s+(?:significa|vuol\\s+dire)\\s+(.+)",
      "(?:qual\\s+è\\s+)?il\\s+significato\\s+di\\s+(.+)", "significato\\s+di\\s+(.+)", "(?:definisci|definizione\\s+di)\\s+(.+)",
      "(.+?)\\s+(?:che\\s+)?cosa\\s+(?:significa|vuol\\s+dire)"],
    meanBare: ["(?:cos'è|cosa\\s+è|che\\s+cos'è|cos'e)\\s+(.+)"],
    add: "(?:aggiungi|aggiungere|salva|salvare|metti)(?:lo|la|li|le|melo)?(?:\\s+(?:tutti|tutte|entrambi|entrambe))?(?:\\s+(?:alle|nelle|tra\\s+le)\\s+(?:mie\\s+)?(?:carte|schede|parole|flashcard))?|fanne\\s+una\\s+(?:carta|scheda)|(?:crea|fai)\\s+una\\s+(?:carta|scheda)",
    all: "(?:li|le)$|tutti|tutte|entrambi|entrambe",
    yes: "sì|si|ok|okay|va\\s+bene|per\\s+favore|adesso|ora|anche",
    join: "e|poi|anche|per\\s+favore",
    fill: "ehi|ciao|allora|ok|okay|ehm|beh|per\\s+favore|tamkeen|dimmi|mi\\s+dici|puoi\\s+dirmi|vorrei\\s+sapere|voglio\\s+sapere|sai",
    word: "(?:la\\s+)?(?:parola|frase|espressione)",
    ex: { say: (w, n) => `Come si dice ${w} in ${n}?`, mean: (w) => `Cosa significa ${w}?`, add: "aggiungilo", dog: "cane" },
  },
  pt: {
    names: { es: "espanhol", ar: "árabe|arabe", fr: "francês|frances", ja: "japonês|japones", zh: "chinês|chines|mandarim", ru: "russo",
      it: "italiano", tl: "tagalo|tagalog|filipino", pt: "português|portugues", ca: "catalão|catalao", ceb: "bisaya|cebuano",
      th: "tailandês|tailandes|thai", de: "alemão|alemao", fa: "persa|farsi", hi: "hindi", ko: "coreano", la: "latim", en: "inglês|ingles" },
    lang: "(?:em|para|pra|pro)\\s+(?:o\\s+)?(?:idioma\\s+)?{L}",
    say: ["como\\s+(?:se\\s+diz|eu\\s+digo|digo|diria|posso\\s+dizer|se\\s+fala|eu\\s+falo|falo|se\\s+escreve|se\\s+traduz|traduzo)\\s+(.+)",
      "(.+?)\\s+como\\s+(?:se\\s+diz|se\\s+fala)", "(?:traduz|traduza|traduzir)\\s+(.+)", "(?:qual\\s+é\\s+)?a\\s+palavra\\s+(?:para|pra)\\s+(.+)"],
    sayLang: ["(?:o\\s+que\\s+é|como\\s+é)\\s+(.+)"],
    mean: ["o\\s+que\\s+(?:significa|quer\\s+dizer)\\s+(.+)", "que\\s+(?:significa|quer\\s+dizer)\\s+(.+)",
      "(?:qual\\s+(?:é\\s+)?)?o\\s+significado\\s+de\\s+(.+)", "significado\\s+de\\s+(.+)", "(?:defina|define|definição\\s+de)\\s+(.+)",
      "(.+?)\\s+(?:significa|quer\\s+dizer)\\s+o\\s+qu[eê]"],
    meanBare: ["o\\s+que\\s+é\\s+(.+)"],
    add: "(?:adiciona|adicione|adicionar|acrescenta|acrescente|salva|salve|salvar|guarda|guarde|põe|coloca|coloque)(?:[- ](?:isso|isto|ele|ela|eles|elas|os\\s+dois|as\\s+duas|todos|todas))?(?:\\s+(?:nos|nas|aos|às|em)\\s+(?:meus\\s+|minhas\\s+)?(?:cartões|cartoes|cartas|palavras|vocabulário|flashcards))?|(?:faz|faça|cria|crie)\\s+um\\s+(?:cartão|cartao|flashcard)",
    all: "eles|elas|os\\s+dois|as\\s+duas|todos|todas|ambos",
    yes: "sim|ok|okay|tá|beleza|por\\s+favor|agora|também",
    join: "e|depois|também|por\\s+favor",
    fill: "ei|oi|olá|ola|então|entao|ok|okay|hum|bom|por\\s+favor|tamkeen|me\\s+diz|me\\s+diga|me\\s+fala|você\\s+pode\\s+me\\s+dizer|voce\\s+pode\\s+me\\s+dizer|eu\\s+quero\\s+saber|quero\\s+saber|sabe",
    word: "(?:a\\s+)?(?:palavra|frase|expressão)",
    ex: { say: (w, n) => `Como se diz ${w} em ${n}?`, mean: (w) => `O que significa ${w}?`, add: "adiciona", dog: "gato", en: "cat" },
  },
  ca: {
    names: { es: "castellà|castella|espanyol", ar: "àrab|arab", fr: "francès|frances", ja: "japonès|japones", zh: "xinès|xines|mandarí|mandari",
      ru: "rus", it: "italià|italia", tl: "tagal|tagalog|filipí|filipi", pt: "portuguès|portugues", ca: "català|catala",
      ceb: "bisaya|cebuà|cebua", th: "tailandès|tailandes|thai", de: "alemany", fa: "persa|farsi", hi: "hindi", ko: "coreà|corea",
      la: "llatí|llati", en: "anglès|angles" },
    lang: "(?:en\\s+|al\\s+|a\\s+l'\\s*)(?:idioma\\s+)?{L}",
    say: ["com\\s+(?:es\\s+diu|dic|diria|puc\\s+dir|s'escriu|es\\s+tradueix|tradueixo)\\s+(.+)", "(.+?)\\s+com\\s+es\\s+diu",
      "(?:tradueix|traduir|tradueixi)(?:-me)?\\s+(.+)", "(?:quina\\s+és\\s+)?la\\s+paraula\\s+per\\s+(?:a\\s+)?(.+)"],
    sayLang: ["(?:què\\s+és|que\\s+es|com\\s+és)\\s+(.+)"],
    mean: ["qu[eè]\\s+(?:vol\\s+dir|significa)\\s+(.+)", "(?:el\\s+)?significat\\s+de\\s+(.+)", "(?:defineix|definició\\s+de)\\s+(.+)",
      "(.+?)\\s+qu[eè]\\s+vol\\s+dir"],
    meanBare: ["qu[eè]\\s+[eé]s\\s+(.+)"],
    add: "(?:afegeix|afegir|desa|desar|guarda|guardar)(?:[- ]?(?:lo|la|los|les|'l|'ls))?(?:\\s+(?:a|en)\\s+(?:les\\s+meves\\s+)?(?:targetes|paraules|vocabulari))?|(?:fes|crea)(?:-ne)?\\s+una\\s+targeta",
    all: "(?:los|les)$|tots|totes|els\\s+dos|les\\s+dues|ambdós",
    yes: "sí|si|d'acord|ok|okay|si\\s+us\\s+plau|ara|també",
    join: "i|després|també|si\\s+us\\s+plau",
    fill: "ei|hola|doncs|bé|be|ok|okay|d'acord|eh|si\\s+us\\s+plau|tamkeen|digues-me|em\\s+pots\\s+dir|vull\\s+saber|voldria\\s+saber|saps",
    word: "(?:la\\s+)?(?:paraula|frase|expressió)",
    ex: { say: (w, n) => `Com es diu ${w} en ${n}?`, mean: (w) => `Què vol dir ${w}?`, add: "afegeix-lo", dog: "gos" },
  },
  ru: {
    names: { es: "по-испански|испанск", ar: "по-арабски|арабск", fr: "по-французски|французск", ja: "по-японски|японск",
      zh: "по-китайски|китайск|мандарин", ru: "по-русски|русск", it: "по-итальянски|итальянск", tl: "на тагальском|тагальск|филиппинск",
      pt: "по-португальски|португальск|бразильск", ca: "по-каталански|каталанск", ceb: "на себуанском|себуанск|бисайск|висайск",
      th: "по-тайски|тайск", de: "по-немецки|немецк", fa: "на фарси|персидск|фарси", hi: "на хинди|хинди", ko: "по-корейски|корейск",
      la: "на латыни|латинск|латын", en: "по-английски|английск" },
    lang: "(?:по-|на\\s+|в\\s+)?{L}(?:\\s+язык[а-яё]*)?",
    say: ["как\\s+(?:будет|сказать|мне\\s+сказать|я\\s+скажу|говорят|написать|пишется|перевести|переводится|по-[а-яё]+\\s+будет)\\s+(?:слово\\s+)?(.+)",
      "(.+?)\\s+как\\s+(?:будет|сказать|перевести|переводится)", "(?:переведи|перевести|переведите)\\s+(?:слово\\s+)?(.+)",
      "(?:какое\\s+)?слово\\s+(?:для|означает)\\s+(.+)"],
    sayLang: ["что\\s+такое\\s+(.+)", "(.+?)\\s+это\\s+как"],
    mean: ["что\\s+(?:значит|означает)\\s+(?:слово\\s+)?(.+)", "(.+?)\\s+что\\s+(?:это\\s+)?(?:значит|означает)",
      "(?:какое\\s+)?значение\\s+(?:слова\\s+)?(.+)", "(?:объясни|определи)\\s+(?:слово\\s+)?(.+)"],
    meanBare: ["что\\s+такое\\s+(.+)"],
    add: "(?:добавь|добавить|добавьте|сохрани|сохранить|запиши)(?:\\s+(?:это|его|её|ее|их|оба|обе|все))?(?:\\s+в\\s+(?:мои\\s+)?(?:карточки|слова|словарь))?|сделай\\s+(?:из\\s+этого\\s+)?карточку",
    all: "(?<![а-яё])(?:их|оба|обе|все)(?![а-яё])",
    yes: "да|ок|окей|пожалуйста|сейчас|тоже|давай",
    join: "и|потом|затем|тоже|пожалуйста",
    fill: "эй|привет|ну|так|ок|окей|слушай|скажи|скажи\\s+мне|подскажи|пожалуйста|тамкин|tamkeen|я\\s+хочу\\s+знать|хочу\\s+знать|ты\\s+знаешь|а",
    word: "(?:слово|выражение|фраза|фразу)",
    ex: { say: (w, n) => `Как сказать „${w}“ ${n}?`, mean: (w) => `Что значит ${w}?`, add: "добавь", dog: "собака" },
  },
  ar: {
    names: { es: "الإسبانية|اسبان|إسبان", ar: "العربية|عرب", fr: "الفرنسية|فرنس", ja: "اليابانية|يابان", zh: "الصينية|صين",
      ru: "الروسية|روس", it: "الإيطالية|ايطال|إيطال", tl: "التاغالوغية|تاغال|تجال|فلبين", pt: "البرتغالية|برتغال",
      ca: "الكتالانية|كتالان|كاتالان", ceb: "البيسايا|بيساي|سيبوان|سبوان", th: "التايلاندية|تايلاند", de: "الألمانية|ألمان|الماني|المان",
      fa: "الفارسية|فارس", hi: "الهندية|هندي", ko: "الكورية|كوري", la: "اللاتينية|لاتين", en: "الإنجليزية|انجليز|إنجليز|انكليز|إنكليز" },
    lang: "(?:باللغة\\s+|في\\s+اللغة\\s+|اللغة\\s+|في\\s+|إلى\\s+|الى\\s+|ل)?(?:بال|لل|ال|ب)?{L}",
    say: ["(?:كيف|ازاي|إزاي|شلون|كيفاش)\\s+(?:أقول|اقول|نقول|يقال|يقولون|تقول|بقول|بنقول|بتقول|أكتب|اكتب|نكتب|تكتب|أترجم|اترجم|نترجم|تترجم|بتقولوا|يقولوا)\\s+(?:كلمة\\s+)?(.+)",
      "(?:ترجم|ترجمي|ترجملي|ترجم\\s+لي)\\s+(?:كلمة\\s+)?(.+)", "(?:ما|ماهي|ما\\s+هي|ما\\s+هو|شو|ايش|إيش|وش)\\s+(?:هي\\s+)?كلمة\\s+(.+)",
      "(.+?)\\s+(?:كيف|ازاي|إزاي|شلون)\\s+(?:أقولها|اقولها|نقولها|يقولونها|تقولها|بقولها|أقول|اقول|نقول|تقول)"],
    sayLang: ["كلمة\\s+(.+)", "(?:ما|ماذا|شو|ايش|إيش|وش)\\s+(?:هي\\s+|هو\\s+)?(.+)", "(.+?)\\s+(?:ايش|إيش|شو|ايه|إيه)"],
    mean: ["(?:ما|ماذا)\\s+(?:معنى|تعني|يعني|معني)\\s+(?:كلمة\\s+)?(.+)", "(?:شو|ايش|إيش|وش|ايه|إيه)\\s+(?:معنى|يعني|معناها|معنى\\s+كلمة)\\s+(?:كلمة\\s+)?(.+)",
      "(?:معنى|تعريف|عرّف|عرف|اشرح)\\s+(?:كلمة\\s+)?(.+)", "(.+?)\\s+(?:ماذا|ما|شو|ايش|إيش|ايه|إيه)\\s+(?:تعني|يعني|معناها)",
      "(.+?)\\s+(?:يعني|تعني)\\s+(?:ايه|إيه|شو|ايش|إيش|ماذا)"],
    meanBare: [],
    add: "(?:و)?(?:أضف|اضف|أضيف|اضيف|ضيف|احفظ|سجل)(?:ها|ه|هم|يها|يه)?(?:\\s+(?:هذه|هذا|هذي|الكلمة|الكلمتين|الكل|كلها|كلهم|الاثنين|الاثنتين))?(?:\\s+(?:إلى|الى|ل|في)\\s*(?:بطاقاتي|البطاقات|كلماتي|مفرداتي))?|(?:اعمل|اعملها|اصنع|سو|سوي)\\s*(?:منها\\s+)?بطاقة",
    all: "هم$|كلها|كلهم|الكل|الاثنين|الكلمتين|جميع",
    yes: "نعم|ايوه|أيوه|اي|أي|طيب|تمام|حسنا|من\\s+فضلك|لو\\s+سمحت|الآن|الان|كمان|أيضا|ايضا",
    join: "و|ثم|بعدين|كمان|أيضا|ايضا|من\\s+فضلك",
    fill: "يا|طيب|حسنا|اوكي|أوكي|ممكن|من\\s+فضلك|لو\\s+سمحت|تمكين|قل\\s+لي|قولي|أخبرني|اخبرني|أريد\\s+أن\\s+أعرف|اريد\\s+ان\\s+اعرف|بدي\\s+اعرف|عايز\\s+اعرف|هل\\s+تعرف",
    word: "(?:ال)?كلمة",
    ex: { say: (w, n) => `كيف أقول ${w} ب${n}؟`, mean: (w) => `ما معنى ${w}؟`, add: "أضفها", dog: "كلب" },
  },
  fa: {
    names: { es: "اسپانیایی|اسپانیولی", ar: "عربی", fr: "فرانسوی", ja: "ژاپنی", zh: "چینی|ماندارین", ru: "روسی", it: "ایتالیایی",
      tl: "تاگالوگ|فیلیپینی", pt: "پرتغالی", ca: "کاتالان", ceb: "بیسایا|سبوانو", th: "تایلندی|تایی", de: "آلمانی", fa: "فارسی",
      hi: "هندی", ko: "کره‌ای|کره ای|کرهای", la: "لاتین", en: "انگلیسی" },
    lang: "(?:به\\s+|در\\s+)?(?:زبان\\s+)?{L}",
    say: ["(?:چطور|چطوری|چگونه|چه\\s*جوری|چجوری)\\s+(?:بگم|بگویم|میگن|می‌گن|می\\s+گن|می‌گویند|بنویسم|ترجمه\\s+کنم)\\s+(.+)",
      "(.+?)\\s+(?:را\\s+|رو\\s+)?(?:چطور|چطوری|چگونه|چه\\s*جوری|چجوری)\\s+(?:بگم|بگویم|میگن|می‌گن|می\\s+گن|می‌گویند|بنویسم|ترجمه\\s+کنم|می‌شه|میشه|می‌شود|میشود)",
      "(?:ترجمه\\s+کن|ترجمه‌ی|ترجمه)\\s+(.+)", "(.+?)\\s+(?:را|رو)\\s+ترجمه\\s+کن"],
    sayLang: ["(.+?)\\s+(?:چی|چه)\\s+(?:می‌شه|میشه|می\\s+شه|می‌شود|میشود|می‌گن|میگن|می\\s+گن|می‌گویند)", "(.+?)\\s+(?:چیست|چیه|چی)"],
    mean: ["(.+?)\\s+(?:یعنی\\s+چی|یعنی\\s+چه|چه\\s+معنی(?:\\s*ای)?\\s+(?:دارد|میده|می‌دهد|داره)|به\\s+چه\\s+معناست|معنیش\\s+چیه)",
      "(?:معنی|معنای)(?:‌ی|\\s+ی|ی)?\\s+(.+?)(?:\\s+(?:چیست|چیه|چی\\s+هست|چی\\s+است))?", "تعریف\\s+(.+?)(?:\\s+(?:چیست|چیه))?"],
    meanBare: ["(.+?)\\s+(?:چیست|چیه)"],
    add: "(?:(?:این(?:\\s+را|\\s+رو)?|اینو|همه(?:\\s+را|\\s+رو)?|هردو(?:\\s+را)?|هر\\s+دو(?:\\s+را|\\s+رو)?)\\s*)?(?:اضافه(?:‌?اش|ش)?\\s*کن|اضافش\\s*کن|ذخیره(?:‌?اش|ش)?\\s*کن|نگه(?:ش)?\\s*دار|بذارش|بزارش|کارتش\\s+کن|(?:یک\\s+)?کارت\\s+بساز)(?:\\s+(?:به|در|توی)\\s+(?:کارت(?:‌|\\s)?ها(?:ی\\s+من|یم)?|لغت(?:‌|\\s)?ها(?:یم)?))?",
    all: "همه|هر\\s*دو|هردو|همشون",
    yes: "آره|بله|باشه|اوکی|لطفا|لطفاً|الان|هم",
    join: "و|بعد|بعدش|هم|لطفا|لطفاً",
    fill: "خب|خوب|سلام|ببین|لطفا|لطفاً|تمکین|بگو|به\\s+من\\s+بگو|می‌خواهم\\s+بدانم|میخوام\\s+بدونم|می‌دونی|اوکی",
    word: "(?:کلمه|واژه)(?:‌ی|\\s+ی|ی)?",
    ex: { say: (w, n) => `${w} به ${n} چی می‌شه؟`, mean: (w) => `${w} یعنی چی؟`, add: "اضافه‌اش کن", dog: "سگ" },
  },
  hi: {
    names: { es: "स्पेनिश|स्पैनिश|स्पेनी", ar: "अरबी", fr: "फ़्रेंच|फ्रेंच|फ्रांसीसी", ja: "जापानी", zh: "चीनी|मंदारिन", ru: "रूसी",
      it: "इतालवी|इटैलियन", tl: "तागालोग|टागालोग|फ़िलिपीनो|फिलिपीनो", pt: "पुर्तगाली", ca: "कातालान|कैटलन", ceb: "बिसाया|सेबुआनो",
      th: "थाई", de: "जर्मन", fa: "फ़ारसी|फारसी", hi: "हिंदी|हिन्दी", ko: "कोरियाई|कोरियन", la: "लैटिन", en: "अंग्रेज़ी|अंग्रेजी|इंग्लिश" },
    lang: "{L}(?:\\s+भाषा)?\\s+(?:में|मे)",
    say: ["(.+?)\\s+(?:को|का|के)?\\s*(?:कैसे|किस\\s+तरह)\\s+(?:कहते|बोलते|लिखते|कहें|बोलें|कहूँ|कहूं|बोलूँ|बोलूं|कहा\\s+जाता|लिखा\\s+जाता)(?:\\s+(?:हैं|है|जाता\\s+है))?",
      "(?:कैसे|किस\\s+तरह)\\s+(?:कहते|बोलते|लिखते|कहें|बोलें|कहूँ|कहूं|कहा\\s+जाता)\\s+(?:हैं\\s+|है\\s+)?(.+)",
      "(.+?)\\s+(?:को|का|के)?\\s*क्या\\s+(?:कहते|बोलते|कहा\\s+जाता)(?:\\s+(?:हैं|है))?",
      "(.+?)\\s+(?:का|की|के)\\s+(?:अनुवाद|ट्रांसलेशन)(?:\\s+(?:करो|करें|कीजिए|क्या\\s+है|बताओ))?", "(?:अनुवाद\\s+करो|ट्रांसलेट\\s+करो)\\s+(.+)"],
    sayLang: ["(.+?)\\s+(?:क्या\\s+है|क्या\\s+होता\\s+है|क्या\\s+होगा)", "(.+?)\\s+को\\s+क्या"],
    mean: ["(.+?)\\s+(?:का|के|की)\\s+(?:मतलब|अर्थ|मायने)(?:\\s+(?:क्या\\s+(?:है|होता\\s+है)|बताओ|बताइए))?", "(.+?)\\s+(?:मतलब|अर्थ)\\s+क्या(?:\\s+है)?",
      "(?:मतलब|अर्थ)\\s+(?:बताओ\\s+)?(.+)"],
    meanBare: ["(.+?)\\s+क्या\\s+(?:है|होता\\s+है)"],
    add: "(?:(?:इसे|इन्हें|इन्हे|यह|ये|दोनों(?:\\s+को)?|सब(?:\\s+को)?|सभी(?:\\s+को)?)\\s+)?(?:(?:मेरे\\s+)?(?:कार्ड्स|कार्ड|शब्दों)\\s+में\\s+)?(?:जोड़|जोड|सेव\\s+कर|सहेज|ऐड\\s+कर|कार्ड\\s+बना)(?:ो|ें|िए|\\s+दो|\\s+दें|\\s+दीजिए|\\s+देना|\\s+लो|\\s+लें)?",
    all: "इन्हें|इन्हे|दोनों|सब|सभी",
    yes: "हाँ|हां|ठीक\\s+है|ओके|प्लीज़|प्लीज|अभी|भी",
    join: "और|फिर|भी|प्लीज़|प्लीज",
    fill: "अरे|हाय|नमस्ते|अच्छा|ठीक\\s+है|ओके|प्लीज़|प्लीज|कृपया|तमकीन|मुझे\\s+बताओ|बताओ|बताइए|मुझे\\s+बताइए|मैं\\s+जानना\\s+चाहता\\s+हूँ|मैं\\s+जानना\\s+चाहती\\s+हूँ|क्या\\s+तुम\\s+जानते\\s+हो",
    word: "(?:शब्द)",
    ex: { say: (w, n) => `${n} में ${w} कैसे कहते हैं?`, mean: (w) => `${w} का मतलब क्या है?`, add: "इसे जोड़ दो", dog: "कुत्ता" },
  },
  ja: {
    names: { es: "スペイン語", ar: "アラビア語", fr: "フランス語", ja: "日本語", zh: "中国語", ru: "ロシア語", it: "イタリア語",
      tl: "タガログ語|フィリピノ語|フィリピン語", pt: "ポルトガル語", ca: "カタルーニャ語|カタロニア語|カタラン語", ceb: "ビサヤ語|セブアノ語",
      th: "タイ語", de: "ドイツ語", fa: "ペルシャ語|ペルシア語", hi: "ヒンディー語|ヒンディ語", ko: "韓国語|朝鮮語", la: "ラテン語", en: "英語" },
    spaced: false,
    lang: "{L}\\s*(?:で(?:は)?|に)?",
    say: ["(.+?)\\s*(?:何|なん|なに)\\s*(?:て|と|って)\\s*(?:言|い)(?:う|います|うの|うんですか|えば(?:いい)?|ったら(?:いい)?)",
      "(.+?)\\s*どう\\s*(?:言|い)(?:う|います|うの|えば(?:いい)?|ったら(?:いい)?)", "(.+?)\\s*(?:を)?\\s*(?:翻訳|訳)(?:して|す)?"],
    sayLang: ["(.+?)\\s*(?:は|って)\\s*(?:何|なん|なに)(?:です|だ)?"],
    mean: ["(.+?)\\s*(?:どういう|どんな)\\s*意味(?:です|だ)?", "(.+?)\\s*(?:の)?\\s*意味(?:は|って)?\\s*(?:何|なに|なん)?(?:です|だ)?"],
    meanBare: ["(.+?)\\s*(?:って|は)\\s*(?:何|なに|なん)(?:です|だ)?", "(.+?)\\s*とは"],
    add: "(?:(?:それ|これ|両方|全部|ぜんぶ|全て|すべて)\\s*(?:を|も)?\\s*)?(?:カードに|単語帳に)?\\s*(?:追加|保存|登録|入れ)\\s*(?:して|する|しといて|しておいて|て)?(?:ください|下さい|ね)?|カード(?:を)?(?:作って|にして)(?:ください)?",
    all: "両方|全部|ぜんぶ|全て|すべて",
    yes: "はい|うん|ええ|お願い(?:します)?|今|も",
    join: "そして|それから|あと",
    fill: "ねえ|ねぇ|あの|あのう|えっと|ええと|えーと|じゃあ|ちょっと|すみません|タムキーン|tamkeen",
    tail: "(?:か|の|ですか|でしょうか|かな|かしら|んですか|のですか|ん|ね|よ|教えて(?:ください)?|ください)+",
    word: "(?:言葉|単語)",
    particle: "は|を|が|って|というのは|という言葉は|とは|も",
    ex: { say: (w, n) => `${w}は${n}で何と言いますか？`, mean: (w) => `${w}はどういう意味ですか？`, add: "追加して", dog: "犬" },
  },
  zh: {
    names: { es: "西班牙语|西班牙文|西语", ar: "阿拉伯语|阿拉伯文|阿语", fr: "法语|法文", ja: "日语|日文|日本话", zh: "中文|汉语|普通话|华语",
      ru: "俄语|俄文", it: "意大利语|意大利文", tl: "他加禄语|塔加洛语|菲律宾语", pt: "葡萄牙语|葡萄牙文|葡语", ca: "加泰罗尼亚语|加泰隆尼亚语",
      ceb: "宿务语|比萨扬语|米沙鄢语", th: "泰语|泰文", de: "德语|德文", fa: "波斯语|波斯文", hi: "印地语|印地文", ko: "韩语|韩文|朝鲜语",
      la: "拉丁语|拉丁文", en: "英语|英文" },
    spaced: false,
    lang: "(?:用|在|以)?\\s*{L}\\s*(?:里|中|里面)?",
    say: ["(.+?)\\s*(?:要|应该|该)?\\s*(?:怎么|怎样|怎么样|如何)\\s*(?:说|讲|写|翻译|表达)", "(?:怎么|如何)\\s*(?:说|讲|写|翻译|表达)\\s*(.+)",
      "(?:翻译|翻成|翻译成)\\s*(?:一下)?\\s*(.+)", "(.+?)\\s*(?:翻译|翻译成)(?:一下)?", "(.+?)\\s*(?:的)?\\s*(?:说法|讲法)\\s*(?:是)?(?:什么|啥)?"],
    sayLang: ["(.+?)\\s*(?:是|叫)\\s*(?:什么|啥)"],
    mean: ["(.+?)\\s*(?:是)?\\s*(?:什么|啥)\\s*意思", "(.+?)\\s*的\\s*意思\\s*(?:是)?\\s*(?:什么|啥)?", "(?:解释|定义|解释一下)\\s*(.+)",
      "(.+?)\\s*(?:指|意味着)\\s*什么"],
    meanBare: ["(.+?)\\s*(?:是什么|是啥)"],
    add: "(?:把\\s*(?:它|这个|这些|它们|两个|都|全部)\\s*)?(?:都\\s*)?(?:加|添加|加上|加入|保存|存|收藏|存下来)\\s*(?:到|进)?\\s*(?:我的)?\\s*(?:卡片|单词|生词本|词库)?\\s*(?:里|中)?\\s*(?:吧|一下|上|进去|起来)?|(?:做成|生成|做)\\s*(?:一张)?\\s*卡片",
    all: "这些|它们|两个|都|全部",
    yes: "好|好的|是|对|行|可以|请|现在|也",
    join: "然后|再|也|并且|和",
    fill: "嘿|喂|那个|嗯|呃|好|好的|请问|请|麻烦|tamkeen|告诉我|你能告诉我|我想知道|你知道",
    tail: "(?:呢|吗|啊|呀|了|吧)+",
    word: "(?:这个)?(?:词|单词|字)",
    ex: { say: (w, n) => `${w}用${n}怎么说？`, mean: (w) => `${w}是什么意思？`, add: "加到卡片里", dog: "狗" },
  },
  ko: {
    names: { es: "스페인어|스페인\\s*말", ar: "아랍어", fr: "프랑스어|불어", ja: "일본어|일어", zh: "중국어", ru: "러시아어", it: "이탈리아어",
      tl: "타갈로그어|필리핀어", pt: "포르투갈어", ca: "카탈루냐어|카탈로니아어", ceb: "세부아노어|비사야어", th: "태국어", de: "독일어",
      fa: "페르시아어", hi: "힌디어", ko: "한국어|한국말", la: "라틴어", en: "영어" },
    lang: "{L}\\s*(?:로|으로|에서)?(?:는)?",
    say: ["(.+?)\\s*(?:어떻게|어떡해)\\s*(?:말해|말하|해요|하나요|해|써|쓰나|번역|라고)\\S*(?:\\s+\\S+)?", "(.+?)\\s*(?:뭐|뭐라고|무엇이라고|뭐라)\\s*(?:해|하나|하죠|말해|합니까)\\S*",
      "(.+?)\\s*번역(?:해|해줘|해\\s*줘|해주세요|해\\s*주세요)?"],
    sayLang: ["(.+?)\\s*(?:뭐|뭐예요|뭐에요|뭐야|무엇|무엇인가요|뭔가요|뭐지)"],
    mean: ["(.+?)\\s*(?:무슨|어떤)\\s*(?:뜻|의미)\\S*", "(.+?)\\s*(?:의)?\\s*(?:뜻|의미)\\s*(?:이|가|은|는)?\\s*(?:뭐|무엇|뭔가요|뭐예요|뭐야)?\\S*"],
    meanBare: ["(.+?)\\s*(?:뭐|뭐예요|뭐에요|뭐야|뭐지)"],
    add: "(?:(?:그거|이거|이것|그것|둘\\s*다|전부|모두)\\s*(?:를|을|도)?\\s*)?(?:카드에|단어장에)?\\s*(?:추가|저장)\\s*(?:해|해줘|해\\s*줘|해주세요|해\\s*주세요|하기|해요)?|카드\\s*(?:로)?\\s*만들어\\s*(?:줘|주세요)?",
    all: "둘\\s*다|전부|모두",
    yes: "네|응|예|좋아|그래|부탁해|지금|도",
    join: "그리고|그다음|그\\s*다음|또",
    fill: "저기|저기요|음|어|그|자|있잖아|탐킨|tamkeen|알려\\s*줘|알려\\s*주세요|궁금한데|궁금해요",
    word: "(?:단어|말)",
    particle: "를|을|는|은|가|이|도",
    ex: { say: (w, n) => `${w}를 ${n}로 어떻게 말해요?`, mean: (w) => `${w} 무슨 뜻이에요?`, add: "추가해 줘", dog: "개" },
  },
  th: {
    names: { es: "สเปน", ar: "อาหรับ", fr: "ฝรั่งเศส", ja: "ญี่ปุ่น", zh: "จีน", ru: "รัสเซีย", it: "อิตาลี|อิตาเลียน",
      tl: "ตากาล็อก|ฟิลิปปินส์|ฟิลิปิโน", pt: "โปรตุเกส", ca: "คาตาลัน", ceb: "เซบู|บีซายา|วิสายัน", th: "ไทย", de: "เยอรมัน",
      fa: "เปอร์เซีย|ฟาร์ซี", hi: "ฮินดี", ko: "เกาหลี", la: "ละติน", en: "อังกฤษ" },
    spaced: false,
    lang: "(?:ใน|เป็น)?\\s*ภาษา\\s*{L}",
    say: ["(?:คำว่า)?\\s*(.+?)\\s*(?:พูด|เรียก|เขียน|แปล)(?:ว่า)?\\s*(?:อะไร|ยังไง|อย่างไร|ไง)", "(?:พูด|เขียน)(?:คำว่า|ว่า)?\\s*(.+?)\\s*(?:ยังไง|อย่างไร|ไง)",
      "แปล(?:คำว่า)?\\s*(.+)"],
    sayLang: ["(?:คำว่า)?\\s*(.+?)\\s*(?:คือ|ว่า)\\s*(?:อะไร)", "คำว่า\\s*(.+)"],
    mean: ["(?:คำว่า)?\\s*(.+?)\\s*(?:แปลว่า|หมายความว่า|หมายถึง|มีความหมายว่า)\\s*(?:อะไร)?", "ความหมายของ(?:คำว่า)?\\s*(.+)"],
    meanBare: ["(?:คำว่า)?\\s*(.+?)\\s*คือ\\s*อะไร"],
    add: "(?:เพิ่ม|บันทึก|เก็บ|ใส่)\\s*(?:คำนี้|อันนี้|มัน|ทั้งหมด|ทั้งสอง|ทั้งคู่)?\\s*(?:ลง|เข้า|ใน|ไว้ใน)?\\s*(?:การ์ด|บัตรคำ|คลังคำ)?\\s*(?:ด้วย|เลย|ให้หน่อย|ให้ที|ไว้)?|(?:ทำ|สร้าง)\\s*(?:เป็น)?\\s*(?:การ์ด|บัตรคำ)",
    all: "ทั้งหมด|ทั้งสอง|ทั้งคู่",
    yes: "ใช่|โอเค|ได้|เลย|ตอนนี้|ด้วย",
    join: "แล้วก็|แล้ว|และ|ด้วย",
    fill: "เอ่อ|อืม|นี่|ขอถาม|อยากรู้ว่า|บอกหน่อย|ทามคีน|tamkeen",
    tail: "(?:ครับ|คะ|ค่ะ|คับ|จ้ะ|จ๊ะ|นะ|หน่อย|ล่ะ|เหรอ|หรอ|ไหม)+",
    word: "คำว่า",
    ex: { say: (w, n) => `${w}ภาษา${n}พูดว่าอะไร`, mean: (w) => `${w}แปลว่าอะไร`, add: "เพิ่มเลย", dog: "หมา" },
  },
  tl: {
    names: { es: "Espanyol|español|kastila|spanish", ar: "Arabe|arabic|arabo", fr: "Pranses|french", ja: "Japanese|hapon|nihongo",
      zh: "Chinese|intsik|tsino|mandarin", ru: "Ruso|russian", it: "Italyano|italian", tl: "Tagalog|filipino", pt: "Portuges|portuguese|portugues",
      ca: "Catalan|katalan", ceb: "Bisaya|cebuano|sebwano|binisaya", th: "Thai", de: "Aleman|german", fa: "Persian|persyano|farsi",
      hi: "Hindi", ko: "Koreano|korean", la: "Latin", en: "Ingles|english" },
    lang: "sa\\s+(?:wikang\\s+)?{L}",
    say: ["paano\\s+(?:ko\\s+|natin\\s+)?(?:sabihin|sasabihin|isulat|isusulat|isalin|bigkasin)\\s+(?:ang\\s+)?(.+)", "(.+?)\\s+paano\\s+(?:sabihin|isulat)",
      "(?:isalin|isalin\\s+mo|i-translate|itranslate|translate)\\s+(?:ang\\s+)?(.+)", "(?:anong|ano\\s+ang)\\s+salita\\s+(?:para\\s+sa|sa)\\s+(.+)"],
    sayLang: ["(?:ano\\s+ang|anong)\\s+tawag\\s+sa\\s+(.+)", "(?:ano\\s+ang|anong|ano)\\s+(.+)"],
    mean: ["(?:ano\\s+(?:ang\\s+|'ng\\s+)?|anong\\s+)?(?:ibig\\s+sabihin|kahulugan|meaning)\\s+(?:ng|nang|ang)\\s+(.+)",
      "(.+?)\\s+(?:ay\\s+)?(?:ano\\s+ang\\s+ibig\\s+sabihin|ibig\\s+sabihin)"],
    meanBare: ["(?:ano\\s+ang|anong)\\s+(.+)"],
    add: "(?:idagdag|dagdagan|i-add|iadd|add|i-save|isave|itabi|ilagay)(?:\\s+(?:mo|natin|nyo|ninyo))?(?:\\s+(?:ito|iyan|yan|yun|iyon|lahat|pareho|silang\\s+dalawa))?(?:\\s+sa\\s+(?:aking\\s+|mga\\s+)?(?:cards?|kard|salita|deck|bokabularyo))?|gawin(?:g|\\s+mo(?:ng)?)?\\s+(?:card|kard)",
    all: "lahat|pareho|dalawa",
    yes: "oo|opo|sige|okay|ok|ngayon|din|rin|pakiusap",
    join: "at|tapos|pagkatapos|din|rin",
    fill: "uy|hoy|sige|okay|ok|eh|kasi|pakisabi|sabihin\\s+mo|gusto\\s+kong\\s+malaman|alam\\s+mo\\s+ba|tamkeen",
    cut: "po|ba|nga|naman",
    word: "(?:ang\\s+)?(?:salitang|salita\\s+na)",
    ex: { say: (w, n) => `Paano sabihin ang ${w} sa ${n}?`, mean: (w) => `Ano ang ibig sabihin ng ${w}?`, add: "Idagdag mo", dog: "aso" },
  },
  ceb: {
    names: { es: "Espanyol|español|kinatsila|katsila|spanish", ar: "Arabic|arabiko|arabe", fr: "French|pranses|pinranses",
      ja: "Japanese|hapon|hinapon|nihongo", zh: "Chinese|insik|intsik|mandarin|tsino", ru: "Russian|ruso|rinuso", it: "Italian|italyano",
      tl: "Tagalog|tinagalog|filipino", pt: "Portuguese|portuges", ca: "Catalan|katalan", ceb: "Bisaya|binisaya|cebuano|sinugboanon|sugbuanon",
      th: "Thai", de: "German|aleman|inaleman", fa: "Persian|persyano|farsi", hi: "Hindi", ko: "Korean|koreano|kinoreano", la: "Latin|linatin",
      en: "English|ingles|iningles|inenglish" },
    lang: "sa\\s+(?:pinulongang\\s+)?{L}",
    say: ["unsaon\\s+(?:nako\\s+|nimo\\s+|man\\s+)?(?:pag[- ]?)?(?:ingon|sulti|isulti|sulat|isulat|hubad|ingna|litok)\\s+(?:ang\\s+|sa\\s+|nga\\s+)?(.+)",
      "(?:hubara|hubad|i-translate|itranslate|translate)\\s+(?:ang\\s+)?(.+)", "(?:unsa\\s+ang|unsay|unsa'y)\\s+pulong\\s+(?:para\\s+sa|sa)\\s+(.+)"],
    sayLang: ["(?:unsa\\s+ang|unsay|unsa'y)\\s+tawag\\s+sa\\s+(.+)", "(?:unsa\\s+ang|unsay|unsa'y|unsa)\\s+(.+)"],
    mean: ["(?:unsa\\s+ang|unsay|unsa'y|unsa)\\s+(?:buot\\s+(?:ipasabot|ipasabut|pasabot)|kahulogan|kahulugan|meaning|pasabot|gipasabot)\\s+(?:sa|ana|aning|niining|ning|ang|nga)\\s+(.+)",
      "(?:kahulogan|kahulugan|pasabot)\\s+(?:sa|ana|ang)\\s+(.+)", "(.+?)\\s+(?:unsay\\s+pasabot|unsa\\s+ang\\s+pasabot|unsay\\s+kahulogan)"],
    meanBare: ["(?:unsa\\s+ang|unsay|unsa'y)\\s+(.+)"],
    add: "(?:idugang|dugangi|dugang|i-add|iadd|add|i-save|isave|itago|ibutang|isulod)(?:\\s+(?:na|ni|kana|kini|tanan|duha|silang\\s+duha))?(?:\\s+sa\\s+(?:akong\\s+)?(?:cards?|kard|pulong|deck))?|himo(?:a|ag)?\\s+(?:og\\s+|ug\\s+)?(?:card|kard)",
    all: "tanan|duha",
    yes: "oo|o|sige|okay|ok|karon|pud|pod|usab|palihug",
    join: "ug|unya|dayon|pud|pod|usab",
    fill: "uy|hoy|sige|okay|ok|eh|kuan|palihug|palihog|ingna\\s+ko|gusto\\s+ko\\s+mahibal-an|tamkeen|day|bai|dong",
    cut: "ba|diay|bitaw|lagi|gud|god|man",
    word: "(?:ang\\s+)?(?:pulong\\s+nga)",
    ex: { say: (w, n) => `Unsaon pag-ingon ang ${w} sa ${n}?`, mean: (w) => `Unsay buot ipasabot sa ${w}?`, add: "Idugang", dog: "iro" },
  },
};

// The quotation marks each language puts round something said (the box's examples): «…» in Arabic, „…“ in German.
const QUOTE_MARKS = { ar: ["«", "»"], fa: ["«", "»"], es: ["«", "»"], ca: ["«", "»"], it: ["«", "»"], ru: ["«", "»"], fr: ["« ", " »"],
  de: ["„", "“"], ja: ["「", "」"] };
/** The quotation marks of app language `ui`: [opening, closing]. */
export const quoteMarks = (ui) => QUOTE_MARKS[ui] || ["“", "”"];

/** Whether questions in app language `ui` can be read in it (every app language but English, which voiceask.js reads itself). */
export const hasNative = (ui) => Object.prototype.hasOwnProperty.call(NATIVE, ui);

// ---------------------------------------------------------------- the patterns, made once per language

const LETTER = "[\\p{L}\\p{M}]";
const B = `(?<!${LETTER})`;  // where a word starts (not used for a language written without spaces)
const made = new Map();

/** Chinese written in traditional characters, as simplified ones (only the characters these questions use). */
const TRAD = { 語: "语", 華: "华", 韓: "韩", 漢: "汉", 譯: "译", 說: "说", 麼: "么", 樣: "样", 個: "个", 詞: "词", 為: "为", 這: "这", 們: "们", 裡: "里",
  義: "义", 魯: "鲁", 蘭: "兰", 亞: "亚", 羅: "罗", 務: "务", 薩: "萨", 揚: "扬", 爾: "尔", 寫: "写", 祿: "禄", 牙: "牙", 國: "国", 臘: "腊", 鮮: "鲜",
  講: "讲", 釋: "释", 麵: "面", 隆: "隆", 張: "张", 進: "进", 加: "加", 卡: "卡", 片: "片", 單: "单", 錄: "录", 藏: "藏", 嗎: "吗", 啥: "啥" };

function compile(ui) {
  if (made.has(ui)) return made.get(ui);
  const g = NATIVE[ui];
  const spaced = g.spaced !== false;
  const norm = (src) => String(src).normalize("NFC");
  const re = (src, flags = "u") => new RegExp(norm(src), flags);
  const whole = (list) => (list || []).map((src) => re(`^(?:${src})$`));
  // The languages' names, longest first (so "по-испански" is tried before "испанск"), each to its language.
  const stems = [];
  for (const [code, list] of Object.entries(g.names)) for (const n of list.split("|")) stems.push([norm(n.toLowerCase()), code]);
  stems.sort((a, b) => b[0].length - a[0].length);
  const alt = stems.map(([n]) => n).join("|");
  const L = `(${alt})${spaced ? `${LETTER}*` : ""}`;
  const sep = spaced ? "(?:^|[\\s,،、，]+)" : "(?:^|[\\s,،、，]*)";
  const c = {
    g, spaced, stems,
    lang: re(`${spaced ? B : ""}${g.lang.replace("{L}", L)}`),
    say: whole(g.say), sayLang: whole(g.sayLang), mean: whole(g.mean), meanBare: whole(g.meanBare),
    add: re(`${sep}(?:(?:${g.join})[\\s,،、，]*)?(${g.add})(?:[\\s,،、，]*(?:${g.yes}))*$`),
    all: re(g.all),
    yes: re(`^(?:(?:${g.yes})[\\s,،、，]*)+$`),
    joinEnd: re(`(?:^|[\\s,،、，]+)(?:${g.join})$`),
    joinStart: re(`^(?:${g.join})[\\s,،、，]+`),
    fill: re(`^(?:(?:${g.fill})${spaced ? "(?![\\p{L}\\p{M}])" : ""}[\\s,،、，!]*)+`),
    tail: g.tail ? re(`(?:${g.tail})$`) : null,
    cut: g.cut ? re(`${B}(?:${g.cut})(?!${LETTER})`, "gu") : null,
    word: g.word ? re(`^${g.word}\\s*`) : null,
    particle: g.particle ? re(`^(.+?)(?:${g.particle})$`) : null,
  };
  made.set(ui, c);
  return c;
}

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const QUOTES = /^["'“”‘’«»„「」『』《》〈〉]+|["'“”‘’«»„「」『』《》〈〉]+$/g;
const END = /[\s?!.,;:…。？！、，؟،]+$/u;

/** The letters changed one for one (so a word found in it is at the same place in what was said): small letters,
 * Persian's own ی and ک, simplified Chinese. */
function fold(text, ui) {
  let s = String(text ?? "").normalize("NFC").replace(/[’‘`]/g, "'").replace(/ẞ/g, "ß").toLowerCase();
  if (ui === "fa") s = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
  if (ui === "zh") s = s.replace(/[一-鿿]/g, (ch) => TRAD[ch] || ch);
  return s;
}

/** The question made ready to read: folded, no Spanish ¿ ¡, no Arabic vowel marks, no end punctuation. */
function prepare(text, ui) {
  let s = fold(text, ui).replace(/[¿¡]/g, " ");
  if (ui === "ar" || ui === "fa") s = s.replace(/[ً-ْٰـ]/g, "");  // vowel marks, the stretching line
  return tidy(s.replace(END, ""));
}

/** What was asked about, tidied: no quotes, no "the word", no end punctuation; [word, ...other tries]. */
function phraseOf(raw, c) {
  let p = tidy(String(raw ?? "").replace(QUOTES, "").replace(END, ""));
  if (c.word) p = tidy(p.replace(c.word, ""));
  p = tidy(p.replace(QUOTES, "").replace(END, ""));
  const tries = [p];
  // 개를, 犬は: the little ending off, and the word with it kept as a second try (아이 is a word, not 아 + 이).
  if (c.particle) {
    const m = c.particle.exec(p);
    if (m && tidy(m[1])) tries.unshift(tidy(m[1]));
  }
  return tries.filter(Boolean);
}

/**
 * A question read in app language `ui`: {kind, phrase, lang, add, all, alts?, matched}. `matched` is false when
 * nothing in it was recognised (the whole of it is then the phrase), so voiceask.js can try it as English.
 */
export function readNative(text, ui) {
  const c = compile(ui);
  const out = { kind: "none", phrase: "", lang: "", add: false, all: false };
  let s = prepare(text, ui);
  if (c.cut) s = tidy(s.replace(c.cut, " "));
  if (c.tail) s = tidy(s.replace(c.tail, "").replace(END, ""));
  s = tidy(s.replace(c.fill, ""));
  if (!s) return { ...out, matched: false };
  let matched = false;
  // "…, y añádelo" / "añádelo": the adding is taken off the end.
  const add = c.add.exec(s);
  if (add) {
    matched = true;
    out.add = true;
    out.all = c.all.test(add[1]);
    s = tidy(s.slice(0, add.index).replace(/[\s,،、，]+$/u, ""));
    s = tidy(s.replace(c.joinEnd, ""));
    if (!s || c.yes.test(s)) return { ...out, kind: "add", matched };
  }
  s = tidy(s.replace(c.joinStart, ""));
  if (c.tail) s = tidy(s.replace(c.tail, "").replace(END, ""));
  // The language named: "en árabe", "по-арабски", "アラビア語で". The words round it go with it.
  const named = c.lang.exec(s);
  if (named) {
    const said = named[1];
    const hit = c.stems.find(([n]) => said.startsWith(n) || n === said);
    if (hit) {
      out.lang = hit[1];
      matched = true;
      s = tidy(`${s.slice(0, named.index)} ${s.slice(named.index + named[0].length)}`.replace(/\s+([,،、，])/gu, "$1").replace(/^[\s,،、，]+|[\s,،、，]+$/gu, ""));
      if (c.tail) s = tidy(s.replace(c.tail, "").replace(END, ""));
    }
  }
  // (the word asked about as it was said: German Hund in its capital, an Arabic word in Arabic letters)
  const original = String(text ?? "").normalize("NFC");
  const lowered = fold(original, ui);
  const asSaid = (p) => {
    const at = lowered.length === original.length ? lowered.indexOf(p) : -1;
    return at >= 0 ? original.slice(at, at + p.length) : p;
  };
  const take = (kind, m) => {
    const tries = phraseOf(m[1], c).map(asSaid);
    out.kind = kind;
    out.phrase = tries[0] || "";
    if (tries.length > 1) out.alts = tries.slice(1);
    if (!out.phrase) out.kind = out.add ? "add" : "none";
    return { ...out, matched: true };
  };
  const first = (list) => { for (const r of list) { const m = r.exec(s); if (m) return m; } return null; };
  // A word of one's own language asked about in one's own language: what it means ("¿qué es bonito en español?").
  const own = out.lang === ui;
  if (own) out.lang = "";
  let m;
  if ((m = first(c.mean))) return take(out.lang ? "say" : "mean", m);  // ("¿qué significa perro en árabe?": how to say it)
  if ((m = first(c.say))) return take(own ? "mean" : "say", m);
  if (out.lang && (m = first(c.sayLang))) return take("say", m);
  if (!out.lang && (m = first(c.meanBare.concat(own ? c.sayLang : [])))) return take("mean", m);
  if (!s) return { ...out, kind: out.add ? "add" : "none", matched };
  // Nothing recognised but the language or "add it": the whole of what is left is the word.
  return { ...take(own ? "mean" : "say", [s, s]), matched };
}

/** The box's examples in app language `ui`, for the language studied (`study`); `word` is the studied language's own
 * word for the "what does it mean" one (voiceask.js EXAMPLE_WORDS). */
export function nativeExamples(study, ui, word) {
  const g = NATIVE[ui];
  const out = [];
  if (study !== ui) {
    const first = String(g.names[study] || "").split("|")[0];
    const name = g.cap ? first.charAt(0).toUpperCase() + first.slice(1) : first;
    if (name) out.push({ text: g.ex.say(g.ex.dog, name), own: g.ex.dog });
    if (word) out.push({ text: g.ex.mean(word), word });
  }
  out.push({ text: g.ex.add, after: true });
  return out;
}
