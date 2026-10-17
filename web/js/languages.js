// The languages Tamkeen can teach, and everything that differs between them on screen:
// reading direction, sample text, how words are separated, and the labels in the word popup.
// Shared by the desktop app and the Android app. (app/languages.py holds the same list of codes
// for the server side: which language Whisper listens for.)

const LTR = { dir: "ltr", unspaced: false, reading: "below", root: "", standard: "Standard form", note: "Usage" };

export const LANGUAGES = {
  es: {
    ...LTR, name: "Spanish", native: "Español",
    hello: "¡Bienvenido!", hi: "hola", search: "buscar", word: "la palabra",
    greet: ["Buenos días", "Buenas tardes", "Buenas noches"],
    sample: "Bienvenidos a un nuevo episodio del pódcast.",
    pageSample: "El café es una bebida que se obtiene de los granos tostados del cafeto, y es una de las más populares del mundo.",
    test: { word: "ahorita", marked: "Te llamo ⟦ahorita⟧, ¿vale?", podcast: "Español real" },
  },
  ar: {
    dir: "rtl", unspaced: false, name: "Arabic", native: "العربية",
    reading: "replace", root: "Root", standard: "In MSA", note: "Dialect",
    hello: "أَهْلًا وَسَهْلًا", hi: "مرحبا", search: "ابحث", word: "الكلمة",
    greet: ["صباح الخير", "نهارك سعيد", "مساء الخير"],
    sample: "مَرْحَبًا بِكُمْ فِي حَلْقَةٍ جَدِيدَةٍ مِنَ البودكاست.",
    pageSample: "القهوة مشروب يُحضر من بذور البن المحمصة، وتعد واحدة من أكثر المشروبات شعبية في العالم.",
    test: { word: "هون", marked: "انتي جديدة ⟦هون⟧؟", podcast: "Real Arabic (Levantine)" },
    searchNote: "Matches ignore diacritics (tashkeel) and spelling variants of alef (أ إ آ ا), taa marbuta/haa (ة ه) and alef maqsura/yaa (ى ي).",
  },
  fr: {
    ...LTR, name: "French", native: "Français",
    hello: "Bienvenue !", hi: "salut", search: "chercher", word: "le mot",
    greet: ["Bonjour", "Bon après-midi", "Bonsoir"],
    sample: "Bienvenue dans un nouvel épisode du podcast.",
    pageSample: "Le café est une boisson obtenue à partir des graines torréfiées du caféier, et l'une des plus populaires au monde.",
    test: { word: "truc", marked: "C'est quoi ce ⟦truc⟧ ?", podcast: "Français réel" },
  },
  ja: {
    ...LTR, unspaced: true, name: "Japanese", native: "日本語", root: "Characters",
    hello: "ようこそ", hi: "こんにちは", search: "検索", word: "単語",
    greet: ["おはようございます", "こんにちは", "こんばんは"],
    sample: "ポッドキャストの新しいエピソードへようこそ。",
    pageSample: "コーヒーは焙煎したコーヒー豆から作られる飲み物で、世界で最も人気のある飲み物の一つです。",
    test: { word: "めっちゃ", marked: "これ、⟦めっちゃ⟧おいしいね。", podcast: "Real Japanese" },
  },
  zh: {
    ...LTR, unspaced: true, name: "Chinese", native: "中文", root: "Characters",
    hello: "欢迎", hi: "你好", search: "搜索", word: "词语",
    greet: ["早上好", "下午好", "晚上好"],
    sample: "欢迎收听新一期的播客节目。",
    pageSample: "咖啡是用烘焙过的咖啡豆制作的饮料，是世界上最受欢迎的饮料之一。",
    test: { word: "靠谱", marked: "他这个人很⟦靠谱⟧。", podcast: "Real Chinese" },
  },
  ru: {
    ...LTR, name: "Russian", native: "Русский", reading: "replace",
    hello: "Добро пожаловать!", hi: "привет", search: "поиск", word: "слово",
    greet: ["Доброе утро", "Добрый день", "Добрый вечер"],
    sample: "Добро пожаловать в новый выпуск подкаста.",
    pageSample: "Кофе — это напиток из обжаренных зёрен кофейного дерева, один из самых популярных в мире.",
    test: { word: "ладно", marked: "Ну ⟦ладно⟧, пойдём.", podcast: "Real Russian" },
  },
  it: {
    ...LTR, name: "Italian", native: "Italiano",
    hello: "Benvenuto!", hi: "ciao", search: "cerca", word: "la parola",
    greet: ["Buongiorno", "Buon pomeriggio", "Buonasera"],
    sample: "Benvenuti a un nuovo episodio del podcast.",
    pageSample: "Il caffè è una bevanda che si ottiene dai semi tostati della pianta del caffè, ed è una delle più diffuse al mondo.",
    test: { word: "magari", marked: "Ci vediamo ⟦magari⟧ domani.", podcast: "Italiano vero" },
  },
  tl: {
    ...LTR, name: "Tagalog", native: "Tagalog", root: "Root",
    hello: "Maligayang pagdating!", hi: "kumusta", search: "hanapin", word: "ang salita",
    greet: ["Magandang umaga", "Magandang hapon", "Magandang gabi"],
    sample: "Maligayang pagdating sa bagong episode ng podcast.",
    pageSample: "Ang kape ay inuming gawa sa mga binusang buto ng halamang kape, at isa ito sa pinakasikat na inumin sa buong mundo.",
    test: { word: "kasi", marked: "Hindi ako nakapunta ⟦kasi⟧ umulan.", podcast: "Totoong Tagalog" },
  },
  en: {
    ...LTR, name: "English", native: "English",
    hello: "Welcome!", hi: "hi", search: "search", word: "the word",
    greet: ["Good morning", "Good afternoon", "Good evening"],
    sample: "Welcome to a brand new episode of the podcast.",
    pageSample: "Coffee is a drink made from the roasted seeds of the coffee plant, and it is one of the most popular drinks in the world.",
    test: { word: "gonna", marked: "I'm ⟦gonna⟧ call you later, okay?", podcast: "Real English" },
  },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES);
const OTHER = { ...LTR, name: "", native: "" }; // text in a language the app doesn't teach

export const isLanguage = (code) => Object.prototype.hasOwnProperty.call(LANGUAGES, code);
export const langInfo = (code) => (isLanguage(code) ? LANGUAGES[code] : OTHER);

// ---------- the language being studied ----------
// Set by each app shell from the saved settings. Until the user has chosen, this is "" and
// anything that needs a language falls back to Arabic, the app's first language.
let study = "";
const studyListeners = new Set();
export function setStudyLanguage(code) {
  const before = study;
  study = isLanguage(code) ? code : "";
  if (study !== before) for (const fn of studyListeners) { try { fn(study); } catch { /* a listener must not break settings */ } }
}
/** Be told when the language being studied is set or changes: fn(code). */
export function onStudyLanguage(fn) { studyListeners.add(fn); return () => studyListeners.delete(fn); }
export const studyLanguage = () => study || "ar";
export const hasStudyLanguage = () => !!study;

/** The language of something studied: what was recorded when it was transcribed or imported.
 * Items from before the app knew other languages are Arabic. */
export const episodeLanguage = (ep) => (ep && isLanguage(ep.language) ? ep.language : "ar");

// ---------- telling languages apart by their writing ----------
const SCRIPTS = [
  ["ar", /[؀-ۿݐ-ݿࢠ-ࣿ]/g],
  ["kana", /[぀-ヿ]/g],
  ["han", /[㐀-䶿一-鿿]/g],
  ["ru", /[Ѐ-ӿ]/g],
  ["latin", /[A-Za-zÀ-ɏ]/g],
];

/** The taught languages written in Latin letters: text in Latin letters is one of these when it is
 * the language being studied (the letters alone can't tell them apart, or from English). */
export const LATIN_LANGUAGES = ["es", "fr", "it", "tl", "en"];

/** Which language a piece of text is written in, judged by its letters. Used where nothing
 * recorded the language (saved words, search results, things friends send). Text in Latin
 * letters counts as the language being studied when that is written in Latin letters. */
export function detectLanguage(text, hint = studyLanguage()) {
  const s = String(text || "").slice(0, 2000);
  const count = {};
  let top = "";
  for (const [name, re] of SCRIPTS) {
    count[name] = (s.match(re) || []).length;
    if (count[name] > (count[top] || 0)) top = name;
  }
  if (count.kana && (top === "han" || top === "kana")) return "ja";
  if (top === "han") return hint === "ja" ? "ja" : "zh";
  if (top === "ar" || top === "ru") return top;
  if (top === "latin") return LATIN_LANGUAGES.includes(hint) ? hint : "en";
  return hint;
}

/** HTML attributes that make an element show text of this language correctly (direction and font). */
export function langAttrs(code) {
  return `lang="${isLanguage(code) ? code : "en"}" dir="${langInfo(code).dir}"`;
}
/** The same, set on an existing element. */
export function setLang(el, code) {
  el.lang = isLanguage(code) ? code : "en";
  el.dir = langInfo(code).dir;
  return el;
}

/** `translation` with ⟦ ⟧ put around `meaning`, when the meaning appears in it exactly once as
 * whole words; "" otherwise. Used for answers that came without the marks (ones saved before
 * the AI was asked for them, or where it forgot). */
function markMeaning(translation, meaning) {
  const wanted = meaning.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!wanted) return "";
  const hits = [...translation.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${wanted}(?![\\p{L}\\p{N}])`, "giu"))];
  if (hits.length !== 1) return "";
  const from = hits[0].index;
  const to = from + hits[0][0].length;
  return `${translation.slice(0, from)}⟦${translation.slice(from, to)}⟧${translation.slice(to)}`;
}

/** What to store when a looked-up word is saved to vocab (`def` is the AI's answer, or null).
 * Arabic keeps the fully vowelled spelling as the word itself; other languages keep the word as
 * written and note how it is read. `translation` is the sentence in the learner's own language
 * with ⟦ ⟧ around the part that renders the word: the front of the word's Anki card. */
export function vocabFromDefinition(def, word, code) {
  if (!def) return { text: word, meaning: "", notes: "", translation: "" };
  const L = langInfo(code);
  const vowelled = code === "ar" && def.vocalized;
  const notes = [
    !vowelled && def.vocalized && def.vocalized !== word && `Reading: ${def.vocalized}`,
    def.lemma && `Dictionary form: ${def.lemma}`,
    def.root && `${L.root || "Root"}: ${def.root}`,
    def.pos, def.dialect_note,
  ].filter(Boolean).join(" · ");
  const plain = def.sentence_translation || "";
  const translation = def.translation_marked || markMeaning(plain, def.meaning || "") || plain;
  // (A misheard word is saved as the word that was said.)
  return { text: vowelled ? def.vocalized : (def.correction || word), meaning: def.meaning || "", notes, translation };
}

// ---------- words with and without spaces ----------
// Japanese and Chinese are written without spaces between words. Foreign words inside them
// (names, brands) still are, so a space is kept only between two "spaced-script" words.
const SPACED_START = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Greek}\p{N}]/u;
const SPACED_END = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Greek}\p{N},.;:!?)'"]$/u;

/** What goes between two neighbouring words when they are shown or sent as a sentence. */
export function gap(prev, next, code) {
  if (!langInfo(code).unspaced) return " ";
  return SPACED_END.test(prev) && SPACED_START.test(next) ? " " : "";
}

export function joinWords(words, code) {
  let out = "";
  for (let i = 0; i < words.length; i++) out += (i ? gap(words[i - 1], words[i], code) : "") + words[i];
  return out;
}

const OPENERS = /^[「『（《〈【〔［｛“‘(\[{«¿¡]+$/u;
const LETTERS = /[\p{L}\p{N}]/u;

/**
 * Japanese and Chinese only: turn the pieces a transcript or page was stored as into real words.
 *
 * Speech recognition returns these languages one or two characters at a time, and an imported
 * page arrives as whole unbroken sentences. The device's built-in word breaker (Intl.Segmenter)
 * finds the word boundaries; each word's time is worked out from the pieces it covers, so the
 * highlight and "play this word" still line up. Punctuation stays attached to its word, as in
 * the other languages.
 *
 * W is {start: [], end: [], seg: [], text: []} (parallel lists, one entry per piece).
 * `across` = true merges neighbouring pieces into words (audio); false only splits pieces (pages,
 * where the gaps between pieces are real spaces). `segText(seg)` may give a line's original text.
 */
export function regroupWords(W, code, across = true, segText = null) {
  if (!langInfo(code).unspaced || typeof Intl === "undefined" || !Intl.Segmenter || !W.text.length) return W;
  const breaker = new Intl.Segmenter(code, { granularity: "word" });
  const out = { start: [], end: [], seg: [], text: [] };
  const n = W.text.length;
  let a = 0;
  while (a < n) {
    let b = a;
    if (across) while (b + 1 < n && W.seg[b + 1] === W.seg[a]) b++;
    // Every character of the run: which piece it came from and where in that piece.
    const chars = [];
    let flat = "";
    let joined = "";
    for (let t = a; t <= b; t++) {
      const piece = String(W.text[t]);
      for (let k = 0; k < piece.length; k++) {
        if (/\s/.test(piece[k])) continue;
        chars.push([t, k, piece.length]);
        flat += piece[k];
      }
      joined += (t > a ? gap(String(W.text[t - 1]), piece, code) : "") + piece;
    }
    // The line as originally written keeps real spaces ("New York") and unbroken names ("iPhone").
    let run = joined;
    if (across && segText) {
      const original = String(segText(W.seg[a]) || "");
      if (original.replace(/\s+/g, "") === flat) run = original;
    }
    const owner = [];
    for (let i = 0, c = 0; i < run.length; i++) owner.push(/\s/.test(run[i]) ? null : chars[c++]);
    const timeAt = (c, edge) => { // edge 0 = where character c starts, 1 = where it ends
      const [t, k, len] = owner[c];
      return W.start[t] + (W.end[t] - W.start[t]) * ((k + edge) / len);
    };
    const words = []; // [first character, last character] of each word
    let pendingFrom = -1; // opening punctuation waiting for the word it belongs to
    for (const part of breaker.segment(run)) {
      const text = part.segment;
      if (!text.trim()) continue;
      const first = part.index;
      const last = part.index + text.length - 1;
      if (LETTERS.test(text)) {
        words.push([pendingFrom >= 0 ? pendingFrom : first, last]);
        pendingFrom = -1;
      } else if (OPENERS.test(text) || !words.length) {
        if (pendingFrom < 0) pendingFrom = first;
      } else {
        words[words.length - 1][1] = last; // closing punctuation joins the word before it
      }
    }
    if (pendingFrom >= 0) { // punctuation with no word after it
      if (words.length) words[words.length - 1][1] = run.length - 1;
      else words.push([pendingFrom, run.length - 1]);
    }
    for (const [first, last] of words) {
      let f = first;
      let l = last;
      while (owner[f] === null) f++;
      while (owner[l] === null) l--;
      out.text.push(run.slice(f, l + 1));
      out.start.push(timeAt(f, 0));
      out.end.push(timeAt(l, 1));
      out.seg.push(W.seg[a]);
    }
    a = b + 1;
  }
  return out;
}
