// Korean: from a word as written to its dictionary form, and how it is said in Latin letters.
//
// Korean is written with spaces, but each "word" between them carries its particles and endings:
// 책을 (the book, as object) -> 책, 학교에서 (at school) -> 학교, 학생이에요 (is a student) -> 학생,
// 먹었어요 (ate) -> 먹다, 갔는데 (went, but) -> 가다, 공부했어요 (studied) -> 공부하다. Irregular verbs
// change their stem: 들어요 -> 듣다 (or 들다), 더워서 -> 덥다, 몰라 -> 모르다, 그래서 -> 그렇다, 사는 -> 살다.
//
// The word table (docs/lexicon/ko-words.json.gz, made by tools/build_korean_words.mjs) lists Korean
// dictionary words, commonest first: the English Wiktionary's Korean entries, ranked by how often they
// are used in Korean film and TV subtitles (OpenSubtitles, counted by FrequencyWords). For each verb
// and adjective it gives the stems endings go on, taken from Wiktionary's conjugation tables, so the
// irregular ones are exactly right:
//   C  the stem itself, before endings that start with a consonant: 먹고, 먹지만, 먹는, 듣고, 살고
//   U  the stem before endings that start with 으 after a consonant: 먹으면, 먹은, 들으면, 더우면, 사는
//   A  the -아/-어 form: 먹어, 먹어요, 먹었다 (past = A + ㅆ), 들어, 더워, 몰라, 해
// Endings stack: past -었-, future -겠- and the honorific -시- make a new stem that takes the endings
// again (먹 + 었 + 는데 + 요). Nouns, pronouns and the rest take particles (학교 + 에서 + 는), the copula
// (학생 + 이에요) or both. Every way of taking the word apart that ends on a word of the table is a
// candidate, and the commonest word wins; a word the table lists whole as an adverb, conjunction or
// the like stays whole (그래서 "so" is not 그렇다 + -어서). Without the table a word is known by its
// spelling. No screen or network code here: tests/js/korean.test.mjs.

const HANGUL = /[가-힣]/;
const ALL_HANGUL = /^[가-힣]+$/;
const S_BASE = 0xac00;
const FINAL_BASE = 0x11a7; // + 1..27: the final consonants as jamo (ᆨ ... ᇂ)
const fin = (n) => String.fromCharCode(FINAL_BASE + n);
const N = fin(4), L = fin(8), M = fin(16), B = fin(17), SS = fin(20); // ᆫ ᆯ ᆷ ᆸ ᆻ

const nfd = (s) => s.normalize("NFD");
const nfc = (s) => s.normalize("NFC");
/** Does the last syllable of a (complete) Hangul string have a final consonant? */
function closed(s) {
  const c = s.charCodeAt(s.length - 1) - S_BASE;
  return c >= 0 && c < 11172 && c % 28 !== 0;
}
const finalOf = (s) => { const c = s.charCodeAt(s.length - 1) - S_BASE; return c >= 0 && c < 11172 ? c % 28 : -1; };
/** The string with its last syllable's final consonant taken off (살 -> 사). */
const dropFinal = (s) => { const f = finalOf(s); return f > 0 ? s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) - f) : s; };

// ---------- endings on verbs and adjectives ----------
// Written with whole syllables and, where an ending is only a final consonant joined onto the stem's last
// syllable (간 = 가 + ㄴ, 갈게 = 가 + ㄹ게, 갑니다 = 가 + ㅂ니다), with that consonant as a jamo.
const C_END = [
  "고", "고요", "고는", "고도", "고서", "고나서", "고말고",
  "지", "지요", "죠", "지만", "지만요", "지도", "지는", "지를", "지마", "지마요", "지말고",
  "기", "기에", "기로", "기는", "기도", "기가", "기를", "기만", "기까지", "기엔", "기에는", "기로는", "기도록",
  "게", "게요", "게끔", "게도", "게는",
  "는", "는데", "는데요", "는데도", "는지", "는지요", "는지도", "는가", "는가요", "는구나", "는군", "는군요", "는다",
  "는다고", "는다고요", "는다면", "는다는", "는단", "는대", "는대요", "는다니", "는다며", "는다면서", "는답니다", "는댔",
  "느냐", "느냐고", "는냐", "는걸", "는걸요", "는거", "는거야", "는거죠", "는게", "는건", "는거지", "는데다", "는다더니",
  "는구먼", "는구만", "느라", "느라고", "는바", "는듯", "는척", "는중",
  "다", "다가", "다가요", "다고", "다고요", "다면", "다는", "단", "대", "대요", "다니", "다니까", "다며", "다면서",
  "답니다", "더라", "더라고", "더라고요", "더라도", "더니", "더군요", "더군", "더구나", "던", "던데", "던데요", "던가",
  "던지", "던가요", "도록", "자", "자고", "자마자", "자니", "자면", "잖아", "잖아요", "잖니", "거든", "거든요", "거나",
  "건", "건대", "네", "네요", "니", "나", "나요", "냐", "냐고", "군", "군요", "구나", "구요", "구만", "구먼",
  "습니다", "습니까", "습니다만", "습디다", "소", "든", "든지", "든가", "고자", "되", "지않", "질", "길",
  // spoken: 하진 (하지는), 있긴 (있기는), -구 for -고 (있다구요), -다시피, -듯이
  "진", "긴", "다구", "다구요", "단다", "자구", "라구", "냐구", "냐구요", "다시피", "듯이", "듯", "다네", "는거에요", "는거예요",
  "는겁니다", "는거야", "는거죠", "대두", "다더라", "곤", "고는요",
];
const U_END = [
  "면", "면서", "면요", "면은", "며", "니", "니까", "니까요", "니깐", "러", "려고", "려고요", "려면", "려는", "려나",
  "려니", "련다", "세요", "셔요", "십니다", "십니까", "십시오", "세", "실", "신", "심", "므로",
  `${B}니다`, `${B}니까`, `${B}시다`, `${B}시오`, `${B}디다`,
  N, `${N}데`, `${N}데요`, `${N}데도`, `${N}지`, `${N}지도`, `${N}지요`, `${N}가`, `${N}가요`, `${N}다`, `${N}다고`,
  `${N}다고요`, `${N}다면`, `${N}다는`, `${N}대`, `${N}대요`, `${N}다니`, `${N}다며`, `${N}답니다`, `${N}걸`, `${N}적`,
  `${N}채`, `${N}후`, `${N}거`, `${N}건`, `${N}게`, `${N}거야`, `${N}거죠`, `${N}듯`, `${N}단다`, `${N}댔`, `${N}다더니`,
  L, `${L}게`, `${L}게요`, `${L}까`, `${L}까요`, `${L}래`, `${L}래요`, `${L}지`, `${L}지도`, `${L}지요`, `${L}수록`,
  `${L}걸`, `${L}걸요`, `${L}거야`, `${L}거예요`, `${L}거에요`, `${L}거지`, `${L}거죠`, `${L}거라`, `${L}거니까`, `${L}거고`,
  `${L}건데`, `${L}텐데`, `${L}텐데요`, `${L}테니`, `${L}테니까`, `${L}라고`, `${L}라`, `${L}때`, `${L}뿐`, `${L}만큼`,
  `${L}수`, `${L}께`, `${L}께요`, `${L}거`, `${L}게`, `${L}듯`, `${L}지라도`,
  M, `${M}으로`, `${M}에도`, `${M}을`, `${M}이`, `${M}은`,
  // more: 죽이려, 하려던, 보렴, 하오, 주시오, 하라고 (quoting a command), 할겁니다 (할 거입니다), 한단 (한다는)
  "려던", "려다", "려다가", "려구", "렴", "오", "시오", "라고", "라는", "래", "래요", "라고요", "라구", "냐", "냐고",
  // (not -려 alone: 살려 "save!", 들려 "heard" are 살리다, 들리다, not 살다, 듣다 + -려)
  `${N}단`, `${N}거지`, `${N}거에요`, `${N}거예요`, `${N}겁니다`, `${L}겁니다`, `${L}겁니까`, `${L}꺼야`, `${L}꺼예요`, `${L}꺼에요`,
  `${L}세`, `${L}거래`, `${L}거라고`,
];
// (and a few helping verbs that are sometimes written joined on: 먹어봐, 먹어줘, 먹어주세요)
const A_END = ["", "요", "서", "서요", "서는", "서도", "서야", "도", "도요", "야", "야지", "야지요", "야죠", "야만", "라", "라고",
  "봐", "봐요", "줘", "줘요", "주세요", "다", "선"]; // (가져다 = 가져다가; 대해선 = 대해서는)
const ENDS = { C: new Set(C_END.map(nfd)), U: new Set(U_END.map(nfd)), A: new Set(A_END.filter(Boolean).map(nfd)) };
const ENDS_LEN = Math.max(...[...ENDS.C, ...ENDS.U, ...ENDS.A].map((e) => e.length));

// ---------- particles on nouns, and the copula ----------
// [particle, what it goes on]: "c" after a final consonant, "v" after a vowel, "" after either.
// (으로 goes after a consonant other than ㄹ; 로 after a vowel or ㄹ: 서울로.)
const PARTICLES = [
  ["이", "c"], ["은", "c"], ["을", "c"], ["과", "c"], ["으로", "c-l"], ["으로서", "c-l"], ["으로써", "c-l"], ["으로부터", "c-l"],
  ["이랑", "c"], ["이나", "c"], ["이나마", "c"], ["이라도", "c"], ["이든지", "c"], ["이든", "c"], ["이며", "c"], ["아", "c"],
  ["이여", "c"], ["이야말로", "c"], ["이란", "c"], ["이라는", "c"], ["이라고", "c"], ["이요", "c"],
  ["가", "v"], ["는", "v"], ["를", "v"], ["와", "v"], ["로", "v-l"], ["로서", "v-l"], ["로써", "v-l"], ["로부터", "v-l"],
  ["랑", "v"], ["나", "v"], ["나마", "v"], ["라도", "v"], ["든지", "v"], ["든", "v"], ["며", "v"], ["야", "v"], ["여", "v"],
  ["야말로", "v"], ["란", "v"], ["라는", "v"], ["라고", "v"],
  ["의", ""], ["에", ""], ["에서", ""], ["에게", ""], ["에게서", ""], ["한테", ""], ["한테서", ""], ["께", ""], ["께서", ""],
  ["도", ""], ["만", ""], ["까지", ""], ["부터", ""], ["보다", ""], ["처럼", ""], ["같이", ""], ["마다", ""], ["조차", ""],
  ["마저", ""], ["밖에", ""], ["뿐", ""], ["요", ""], ["하고", ""], ["대로", ""], ["만큼", ""], ["씩", ""], ["쯤", ""],
  ["끼리", ""], ["들", ""], ["에다", ""], ["에다가", ""], ["서", ""], ["씨", ""], ["께로", ""], ["보고", ""],
  ["더러", ""], ["커녕", ""], ["치고", ""], ["까진", ""], ["부턴", ""], ["에선", ""], ["에겐", ""], ["한텐", ""], ["엔", ""],
  ["만은", ""], ["뿐만", ""], ["이라", "c"], ["라", "v"], ["선", ""], ["론", "v"], ["으론", "c-l"], ["보단", ""], ["로선", "v-l"],
  ["으로선", "c-l"], ["과도", "c"], ["와도", "v"],
];
// The copula ("to be") after a noun: 학생이에요, 학생입니다, 친구예요, 친구야, 학생이었어요, 친구였어요, 친군데.
const COPULA = [
  "이다", "이에요", "이야", "이었어", "이었어요", "이었다", "이었습니다", "이었는데", "이었고", "이었지만", "이었던", "이었지",
  "이었으면", "이었을", "입니다", "입니까", "이고", "이지", "이지만", "이지요", "이죠", "인데", "인데요", "인데도", "인지", "인가",
  "인가요", "이라서", "이라면", "이래", "이래요", "이면", "이니까", "이네", "이네요", "이냐", "이니", "인", "일", "일까",
  "일까요", "일지", "일걸", "일거야", "일텐데", "이잖아", "이잖아요", "이거든", "이거든요", "이군", "이군요", "이구나", "이었니",
  "이었냐", "이어서", "이어야", "이어도", "이었구나", "이란다", "이랍니다", "이래서", "이라니", "이라며", "이라면서", "이시다",
  "이세요", "이십니다", "이셨어요",
  // spoken and older: 말야 (말이야), 말예요, 것이오, 말일세, 이라구요, 거겠지 (거이겠지)
  "야", "예요", "이오", "일세", "이라구", "이라구요", "이겠지", "이겠죠", "이겠어", "이겠어요", "이겠네", "이시죠", "일거야", "일겁니다",
  "이었죠", "이었나", "이었나요", "이었네",
];
const COPULA_V = [ // after a vowel the 이 is usually left out or joined on
  "다", "예요", "에요", "야", "였어", "였어요", "였다", "였습니다", "였는데", "였고", "였지만", "였던", "였지", "였으면", "였을",
  "고", "지", "지만", "죠", `${N}데`, `${N}데요`, `${N}지`, `${N}가`, `${N}가요`, "라서", "라면", "면",
  "니까", "네", "네요", "냐", "니", "잖아", "잖아요", "거든", "거든요", "군", "군요", "구나", "였니", "였냐", "여서", "여야",
  "여도", "였구나", "란다", "랍니다", "라니", "라며", "라면서", "세요", "셨어요",
  "라구", "라구요", "겠지", "겠죠", "겠네", "겠다", "겠어", "겠어요", `${B}니다`, `${B}니까`, "시죠", "시군요", "십니까", "신가요",
  "신데", "신지", "였죠", "였나", "였나요", "였네", "였군",
  // (not a lone ㄴ or ㄹ, 친군, 친굴: too often a different word, 산 is not 사 + ㄴ; nor 래요 "they say it is",
  // which made 그래요 그 + 래요)
];
// Particles that seldom go on a noun, or are also the end of many words, and the copula: a reading that
// puts one of them straight on the noun counts only when no reading with a case particle, no verb form and
// no word of the table fits (바다 "sea" is not 바 + 다 "it is", 날씨 not 날 + 씨 "Mr.", 나라에 not 나 + 라 + 에).
const WEAK = new Set(["라", "랑", "이랑", "씨", "요", "야", "여", "아", "이여", "나", "이나", "나마", "이나마", "서", "선", "론", "으론",
  "이라", "라는", "이라는", "란", "이란", "라고", "이라고", "이요", "며", "이며", "든", "이든", "든지", "이든지", "대로", "커녕", "치고",
  "보고", "더러", "께로", "쯤", "씩", "끼리", "마다", "조차", "마저", "뿐", "밖에", "같이", "라도", "이라도", "야말로", "이야말로", "만은",
  "뿐만", "께", "과도", "와도", "들", "하고"].map(nfd)); // (들, the plural: 아들에게 is 아들 "son", not 아 + 들;
// 하고 "and, with": 피하고 is 피하다 "avoid", not 피 "blood" + 하고)
// The few particles an adverb or interjection takes (빨리요, 많이도, 잘은): 그렇지만 is 그렇다 + -지만, not 그렇지 + 만.
const AFTER_ADVERB = new Set(["요", "도", "는", "은", "도요", "는요"].map(nfd));
const PARTICLE_LIST = PARTICLES.map(([p, after]) => [nfd(p), after]);
// Case particles: no other particle comes after one, except 요 (나는요, 저도요).
const FINAL_PARTICLES = new Set(["이", "가", "을", "를", "은", "는", "의", "과", "와", "랑", "이랑"].map(nfd));
const YO = nfd("요");
const WITH_COPULA = new Set(["거", "것", "때문", "뿐", "수", "중", "적", "줄", "리", "터", "셈", "법", "모양", "편", "듯", "뭐", "누구", "어디", "언제",
  "때"]);
const GA = nfd("가");
const NOT_BEFORE_GA = new Set(["나", "저", "너", "누구"]); // (내가, 제가, 네가, 누가: SPECIAL)
const COPULA_C = new Set(COPULA.map(nfd));
const COPULA_AFTER_V = new Set(COPULA_V.map(nfd));
// Pronouns and 거 ("thing") that take 는/를 shortened to a final ㄴ/ㄹ: 난, 넌, 전, 건, 이건, 날, 널, 걸, 뭘.
const SHORTENS = new Set(["나", "너", "저", "거", "이거", "그거", "저거", "뭐", "우리", "여기", "거기", "저기", "누구", "자기", "내", "제"]);
// Forms the rules don't reach (pronouns that change before 가, 거 + 이).
const SPECIAL = { 내가: "나", 제가: "저", 네가: "너", 니가: "너", 누가: "누구", 이게: "이거", 그게: "그거", 저게: "저거", 게: "거",
  뭔: "뭐", 뭐가: "뭐", 내겐: "나", 내게: "나", 네겐: "너", 네게: "너", 제겐: "저", 제게: "저" };
// Verbs and adjectives made from a noun the table may not list on its own (운동하다 from 운동): their forms
// are the forms of these, after the noun.
const LIGHT_PRED = ["하다", "되다", "시키다", "받다", "드리다", "당하다", "스럽다", "롭다", "답다"];

// ---------- the table ----------
export class KoreanWords {
  /** data: {format: 1, kind: "ko", lemmas: [commonest first], pos: a letter for each (n, w, b, v: below),
   *  preds: {lemma: "A,A|U,U"}} */
  constructor(data) {
    if (!data || data.format !== 1 || data.kind !== "ko") throw new Error("This Korean word table is from a different version of the app.");
    this.name = "ko";
    this.lang = "ko";
    this.lemmas = data.lemmas;
    this.rank = new Map();
    // lemma -> "n" a noun, pronoun, number ... (takes particles and the copula), "w" an adverb, determiner,
    // conjunction or interjection (never taken apart; takes particles: 빨리요), "b" both (지금, 진짜, 어디),
    // "v" only a verb or adjective
    this.kind = new Map();
    data.lemmas.forEach((w, i) => {
      if (!this.rank.has(w)) this.rank.set(w, i);
      this.kind.set(w, (data.pos || "")[i] || "n");
    });
    // Cn and Ud: a ㄹ stem without its ㄹ, as C before ㄴ (사는) and as U (사니까, 사세요)
    this.bases = { C: new Map(), U: new Map(), A: new Map(), Cn: new Map(), Ud: new Map() };
    const add = (type, stem, lemma) => {
      if (!stem) return;
      const list = this.bases[type].get(stem);
      if (!list) this.bases[type].set(stem, [lemma]);
      else if (!list.includes(lemma)) list.push(lemma);
    };
    for (const [lemma, forms] of Object.entries(data.preds || {})) {
      if (!lemma.endsWith("다")) continue;
      const c = lemma.slice(0, -1);
      const [a = "", u = ""] = String(forms).split("|");
      add("C", c, lemma);
      for (const x of a.split(",")) add("A", x, lemma);
      if (finalOf(c) === 8) {
        // ㄹ stems drop the ㄹ before ㄴ, ㅅ and ㅂ (사는, 사니까, 사세요, 삽니다, 산, 살 = 사 + ㄹ) but keep it
        // before ㅁ and ㄹ (살면, 살며, 살려고, 놀러): Ud is the stem without it, U the stem with it.
        for (const x of u.split(",")) add("Ud", x, lemma);
        add("U", c, lemma);
        add("Cn", dropFinal(c), lemma);
      } else for (const x of u.split(",")) add("U", x, lemma);
      if (c.endsWith("시")) add("A", `${c.slice(0, -1)}세`, lemma); // 주무시다: 주무세요
      if (!this.rank.has(lemma)) { this.rank.set(lemma, Infinity); this.kind.set(lemma, "v"); }
    }
    this.cache = new Map();
  }

  has(word) { return this.rank.has(word); }
  rankOf(lemma) { return this.rank.has(lemma) ? this.rank.get(lemma) : Infinity; }
  /** Can it take particles (a noun, pronoun, number, adverb ...: anything but a verb or adjective)? */
  nominal(word) { const k = this.kind.get(word); return !!k && k !== "v"; }
}

// ---------- taking a word apart ----------
// Hanja in brackets after a word, as in 학교(學校), only shows where the word comes from: it is
// not read out a second time, and the word is the same without it.
const HANJA_NOTE = /[(（][\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF·\s]+[)）]/g;
// A bracket or quotation mark inside what is written without a space (문안에(거기도) parts two words.
const INNER_MARK = /[()（）[\]「」『』《》〈〉“”‘’"']/;
const EDGE_MARKS = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

/** The word as the table knows it: punctuation off its ends, Hanja in brackets left out, letters in
 *  their usual (composed) form; of two words joined by a bracket, the first. */
export function koreanWord(token) {
  let w = String(token ?? "").normalize("NFC").replace(HANJA_NOTE, "").replace(EDGE_MARKS, "");
  if (INNER_MARK.test(w)) w = w.split(INNER_MARK).find((part) => /[가-힣]/.test(part)) ?? w;
  return w.replace(EDGE_MARKS, "").toLowerCase();
}

/** The dictionary forms of the verbs and adjectives whose `type` stem (C, U or A) is `stem` (NFC),
 * through the past -었-, the future -겠- and the honorific -시- too. [{lemma, steps}] */
function predicatesOf(stem, type, table, depth = 0, hon = false) {
  const out = [];
  // (type "Um": a U stem before an ending that starts with ㅁ or ㄹ, where a ㄹ stem keeps its ㄹ)
  const lexical = type === "Um" ? table.bases.U.get(stem) : type === "U"
    ? [...(table.bases.U.get(stem) || []), ...(table.bases.Ud.get(stem) || [])] : table.bases[type].get(stem);
  if (lexical) for (const lemma of lexical) out.push({ lemma, steps: depth, hon });
  if (type === "Um") type = "U";
  if (depth >= 3 || !stem) return out;
  const d = nfd(stem);
  const more = (s, t, h = false) => { if (s) for (const x of predicatesOf(nfc(s), t, table, depth + 1, hon || h)) out.push(x); };
  // The stem made by an ending inside the word: C of 먹었 / 먹겠 / 가시 is itself, U adds 으 (먹었으면) or
  // nothing (가시면), A adds 어 (먹었어요) or becomes 셔 (가셔요).
  const asC = (s) => {
    if (s.endsWith(SS)) more(s.slice(0, -1), "A");            // 먹었 = 먹어 + ㅆ, 했 = 해 + ㅆ, 갔 = 가 + ㅆ
    if (s.endsWith(nfd("야겠"))) more(s.slice(0, -nfd("야겠").length), "A"); // 해야겠, 가야겠 ("must")
    else if (s.endsWith(nfd("겠"))) more(s.slice(0, -nfd("겠").length), "C"); // 먹겠, 먹었겠
    if (s.endsWith(nfd("시"))) more(s.slice(0, -nfd("시").length), "U", true); // 가시, 먹으시
  };
  if (type === "C") asC(d);
  if (type === "U") {
    if (d.endsWith(nfd("으"))) { const s = d.slice(0, -nfd("으").length); if (s.endsWith(SS) || s.endsWith(nfd("겠"))) asC(s); }
    if (d.endsWith(nfd("시"))) asC(d);
  }
  if (type === "A") {
    if (d.endsWith(nfd("어"))) { const s = d.slice(0, -nfd("어").length); if (s.endsWith(SS) || s.endsWith(nfd("겠"))) asC(s); }
    if (d.endsWith(nfd("셔"))) more(d.slice(0, -nfd("셔").length), "U", true);
  }
  return out;
}

// Endings that carry the honorific -시- themselves (가세요, 가십니다, 가신): a reading through one of
// these, or through -시- inside the word, is the less likely one when the word is also another verb's
// own form (마셔요 is 마시다 "drink", not 말다 + -시-; 가시고 is 가시다 only if nothing commoner fits).
const HONORIFIC_ENDS = new Set(["세요", "셔요", "십니다", "십니까", "십시오", "세", "실", "신", "심", "시오"].map(nfd));
const RA = nfd("라");
const YA = nfd("야");
const HONORIFIC_LOOKALIKES = new Set(["가시다", "오시다", "하시다", "보시다", "사시다", "아시다", "나시다", "자시다"]);

/** Every way `w` (NFC, all Hangul) is a verb or adjective form: [{lemma, steps, hon}]. */
function predicateReadings(w, table) {
  const d = nfd(w);
  const out = [];
  for (let i = d.length - 1; i >= 0; i--) {
    const end = d.slice(i);
    if (end.length > ENDS_LEN) break;
    const stem = d.slice(0, i);
    if (!stem || !isSyllableEnd(stem)) continue;
    const s = nfc(stem);
    const hon = HONORIFIC_ENDS.has(end);
    const mOrL = end.charCodeAt(0) === 0x1106 || end.charCodeAt(0) === 0x1105; // 면, 며, 므로; 려고, 러, 라고
    for (const type of ["C", "U", "A"]) {
      if (!ENDS[type].has(end)) continue;
      // (the written-style command -아라/-어라, -아야/-어야 "must" and the noun-making -ㅁ are weak: 나라 is
      // "country", not 나다 + -라 "come out!"; 때야 "it's time" is not 때다 + -야; 검은 "black" is 검다, not
      // 걸다 + -ㅁ + 은)
      const weak = (type === "A" && (end === RA || end === YA)) || (type === "U" && end.startsWith(M));
      for (const x of predicatesOf(s, type === "U" && mOrL ? "Um" : type, table)) out.push({ ...x, steps: x.steps + 1, hon: x.hon || hon, weak });
    }
    if (ENDS.C.has(end) && end.charCodeAt(0) === 0x1102) { // an ending starting with ㄴ after a ㄹ stem: 사는, 아는데
      for (const lemma of table.bases.Cn.get(s) || []) out.push({ lemma, steps: 1, hon: false });
    }
  }
  for (const x of predicatesOf(w, "A", table)) out.push(x); // the -아/-어 form on its own: 먹어, 가, 해
  return out;
}

// A string of jamo can be cut only where a syllable is complete (after its vowel or its final).
const isSyllableEnd = (d) => { const c = d.charCodeAt(d.length - 1); return (c >= 0x1161 && c <= 0x1175) || (c >= 0x11a8 && c <= 0x11c2); };

/** Every way `w` is a noun (or other word of the table) with particles and/or the copula on it. */
function nounReadings(w, table) {
  const out = [];
  const seen = new Set();
  // weak: the piece that came off last (the one on the noun) is WEAK, the copula or a guessed shortening.
  // outer: the particle that came off just before (the one after this one in the word).
  const visit = (s, steps, copula = false, short = false, weak = false, outer = "") => { // s: NFC, what is left of the word
    if (!s || steps > 4) return;
    const key = `${s}|${steps}|${copula}|${short}|${weak}|${outer}`;
    if (seen.has(key)) return;
    seen.add(key);
    // (the copula follows nouns and pronouns, not adverbs: 아니에요 is 아니다, not 아니 "no" + 이에요)
    if (steps && table.nominal(s) && !(table.kind.get(s) === "w" && (copula || !AFTER_ADVERB.has(outer)))) out.push({ lemma: s, steps, short, weak, piece: outer });
    const d = nfd(s);
    for (const [p, after] of PARTICLE_LIST) {
      if (d.length <= p.length || !d.endsWith(p)) continue;
      // A case particle ends the noun's particles: only 요 may follow it (나는요), not another (나라의 is 나라 + 의).
      if (outer && FINAL_PARTICLES.has(p) && outer !== YO) continue;
      const rest = nfc(d.slice(0, -p.length));
      if (!ALL_HANGUL.test(rest)) continue;
      const f = finalOf(rest);
      if (after === "c" && f === 0) continue;
      if (after === "v" && f !== 0) continue;
      if (after === "c-l" && (f === 0 || f === 8)) continue;
      if (after === "v-l" && f !== 0 && f !== 8) continue;
      if (p === GA && NOT_BEFORE_GA.has(rest)) continue; // 나 + 가 is 내가: 나가 is 나가다 "go out"
      visit(rest, steps + 1, copula, false, WEAK.has(p), p);
    }
    // the copula
    for (let i = d.length - 1; i > 0; i--) {
      const end = d.slice(i);
      if (end.length > 14) break;
      const stem = d.slice(0, i);
      if (!isSyllableEnd(stem)) continue;
      const rest = nfc(stem);
      // (the nouns that are mostly used with the copula, 거야, 건지, 때문이야, 수밖에, are not weak with it)
      if (COPULA_C.has(end) || (COPULA_AFTER_V.has(end) && !closed(rest))) visit(rest, steps + 1, true, false, !WITH_COPULA.has(rest), "=");
    }
    // 는/를 shortened to ㄴ/ㄹ: 난, 건, 이건, 날, 걸, 뭘; on other words too when the word isn't one of the
    // table's own (얘긴, 그땐, 저흰, 그리곤), so 산 "mountain" stays 산, not 사 + ㄴ. Only at the very end of
    // the word: nothing comes after 는/를 (날씨 is not 나 + ㄹ + 씨).
    const last = d.charCodeAt(d.length - 1);
    if (steps === 0 && (last === N.charCodeAt(0) || last === L.charCodeAt(0))) {
      const rest = nfc(d.slice(0, -1));
      const as = nfd(last === N.charCodeAt(0) ? "는" : "를");
      if (SHORTENS.has(rest)) visit(rest, steps + 1, copula, steps === 0, false, as);
      else if (steps === 0 && !table.has(s) && table.nominal(rest)) visit(rest, steps + 1, copula, false, table.kind.get(rest) === "n", as);
    }
  };
  visit(w, 0);
  return out;
}

/** Particles (and the copula) taken off the end of Korean that follows something not Korean, longest first,
 * without the table (BTS가 -> BTS, 3월에 -> 3월): what is left of `s`. */
function looseParticles(s) {
  let d = nfd(s);
  for (let n = 0; n < 3; n++) {
    let cut = 0;
    for (const [p] of PARTICLE_LIST) if (p.length > cut && d.endsWith(p)) cut = p.length;
    for (const c of COPULA_C) if (c.length > cut && d.endsWith(c)) cut = c.length;
    if (!cut) break;
    d = d.slice(0, -cut);
  }
  return nfc(d);
}

// Helping verbs that follow a verb's -아/-어 form, often written joined on to it: 해줄게 (do for you),
// 해봤어 (tried), 살아있는 (alive), 내버려둬 (leave it), 도와달라고 (asked to help).
const AFTER_A = new Set(["주다", "보다", "버리다", "드리다", "놓다", "두다", "가다", "오다", "내다", "있다", "지다", "달다", "대다",
  "치우다", "계시다", "하다"]); // (하다 as in 싶어하다: only when the table has no such word, as it has 좋아하다)
// Little words run together with the next word, no space between (안좋아, 못가, 그런식으로, 제말은, 어디있어):
// the word after them is the word.
const JOINED_BEFORE_VERB = ["안", "못", "잘", "다", "또", "어디", "여기", "거기", "저기"];
const JOINED_BEFORE_NOUN = ["그런", "이런", "저런", "모든", "아무", "무슨", "어느", "다른", "또", "이", "그", "저", "제", "내", "네",
  "한", "두", "세", "몇", "새", "우리"];
// ... after -고 (먹고있어, 하고싶어), after -지 (가지않아, 하지마), and after -아/-어야 (해야돼).
const AFTER_GO = new Set(["있다", "계시다", "싶다", "말다"]);
const AFTER_JI = new Set(["않다", "말다", "못하다"]);
const AFTER_YA = new Set(["되다", "하다"]);

/** A verb with a helping verb written joined on (the table doesn't list the pair): 해줄게 -> 하다. */
function helperReadings(w, table) {
  const out = [];
  const chars = [...w];
  for (let i = 1; i < chars.length; i++) {
    const head = chars.slice(0, i).join("");
    const helpers = new Set(predicateReadings(chars.slice(i).join(""), table).map((r) => r.lemma));
    if (!helpers.size) continue;
    const take = (stem, type, set) => {
      if (stem && [...helpers].some((h) => set.has(h))) for (const r of predicatesOf(stem, type, table)) out.push({ lemma: r.lemma, steps: r.steps + 2 });
    };
    take(head, "A", AFTER_A);
    if (head.endsWith("고")) take(head.slice(0, -1), "C", AFTER_GO);
    if (head.endsWith("지")) take(head.slice(0, -1), "C", AFTER_JI);
    if (head.endsWith("야")) take(head.slice(0, -1), "A", AFTER_YA);
  }
  if (out.length) return out;
  for (const little of JOINED_BEFORE_VERB) {
    if (w.length > little.length + 1 && w.startsWith(little)) {
      for (const r of predicateReadings(w.slice(little.length), table)) out.push({ lemma: r.lemma, steps: r.steps + 2 });
    }
  }
  for (const little of JOINED_BEFORE_NOUN) {
    if (w.length > little.length && w.startsWith(little)) {
      const rest = w.slice(little.length);
      if (table.nominal(rest) && table.kind.get(rest) !== "w") out.push({ lemma: rest, steps: 2 });
      for (const r of nounReadings(rest, table)) out.push({ lemma: r.lemma, steps: r.steps + 2 });
    }
  }
  return out;
}

/** A verb made from a noun (+ 하다, 되다, 시키다 ...) that the table doesn't list: 운동했어요 -> 운동하다. */
function lightVerbReadings(w, table) {
  const out = [];
  const chars = [...w];
  for (let i = 1; i < chars.length; i++) {
    const noun = chars.slice(0, i).join("");
    if (!table.nominal(noun)) continue;
    const rest = chars.slice(i).join("");
    for (const r of predicateReadings(rest, table)) {
      if (LIGHT_PRED.includes(r.lemma)) out.push({ lemma: noun + r.lemma, steps: r.steps + 1, made: true });
    }
  }
  return out;
}

/** All the ways of reading a Korean word, best first: [{lemma, steps}] (the word itself when nothing fits). */
export function koreanReadings(token, table) {
  const w = koreanWord(token);
  if (!table || !w) return w ? [{ lemma: w, steps: 0 }] : [];
  if (table.cache.has(w)) return table.cache.get(w);
  const found = koreanAnalyses(w, table);
  if (table.cache.size > 50000) table.cache.clear();
  table.cache.set(w, found);
  return found;
}

function koreanAnalyses(w, table) {
  // Latin letters or digits with Korean after them (BTS가, 3월에, K팝을): the particles come off the end.
  const mixed = w.match(/^([^가-힣]+)([가-힣]+)$/);
  if (mixed && /[\p{L}\p{N}]/u.test(mixed[1])) {
    // A number with a counter (10분, 3일, 3년에): the counter is the word (분 "minute", 일 "day", 년 "year").
    if (/^[\d.,]+$/.test(mixed[1])) {
      const counter = [mixed[2], ...nounReadings(mixed[2], table).map((r) => r.lemma)].find((x) => table.nominal(x));
      if (counter) return [{ lemma: counter, steps: 1 }];
    }
    const rest = looseParticles(mixed[2]);
    return [{ lemma: mixed[1] + rest, steps: rest === mixed[2] ? 0 : 1 }];
  }
  if (!ALL_HANGUL.test(w)) return [{ lemma: w, steps: 0 }];
  if (SPECIAL[w] && table.has(SPECIAL[w])) return [{ lemma: SPECIAL[w], steps: 1 }];
  // 어딨어, 여깄어: 어디/여기 + 있다 run together ("where is it", "here it is").
  if (/^(?:어딨|여깄|거깄|저깄)/.test(w) && table.has("있다")) return [{ lemma: "있다", steps: 2 }];
  const kind = table.kind.get(w);
  const nouns = nounReadings(w, table);
  let all = [];
  if (kind === "w" || kind === "b") {
    // A word the table lists whole as an adverb, conjunction, interjection or determiner is never read as a
    // verb form (그래서 "so" is not 그렇다 + -어서); only a commoner noun with one case particle beats it
    // (일이 is mostly 일 + 이, "the work", not 일이 "one by one"; 하지만 "but" is not 하지 + 만).
    all = [{ lemma: w, steps: 0 }, ...nouns.filter((x) => !x.weak && x.steps === 1 && FINAL_PARTICLES.has(x.piece))];
  } else {
    if (table.has(w) && kind !== "v") all.push({ lemma: w, steps: 0 });
    const preds = predicateReadings(w, table);
    all.push(...nouns, ...preds);
    if (!all.some((x) => table.has(x.lemma))) all.push(...helperReadings(w, table), ...lightVerbReadings(w, table));
    if (!all.length) return [{ lemma: w, steps: 0 }];
    // A form that is a verb's own (마셔요: 마시다 "drink"), or a noun with a case particle (메시지를), beats the
    // same letters read with the honorific -시- (말다 + -시-, 메다 + -시- + -지를). Not 가시다 ("to clear
    // away"), far rarer than 가다 + -시- (가셨어요 "went").
    if (all.some((x) => !x.hon && !x.weak && table.has(x.lemma) && !HONORIFIC_LOOKALIKES.has(x.lemma))) all = all.filter((x) => !x.hon);
    // A noun reached through a WEAK particle or the copula only when nothing else fits (see WEAK).
    if (all.some((x) => !x.weak && (table.has(x.lemma) || x.made))) all = all.filter((x) => !x.weak);
  }
  // Commonest dictionary word first; of two readings of one word, the one that takes off fewer pieces. The
  // word itself, when the table has it, gets a head start: another reading must be several times commoner
  // to beat it (가요 "song" gives way to 가다 "go", 위해 "harm" to 위하다 "do for").
  const best = new Map();
  for (const x of all) {
    const had = best.get(x.lemma);
    if (!had || x.steps < had.steps) best.set(x.lemma, x);
  }
  // (tools/build_korean_words.mjs counts the subtitles without it: else a rare word spelled like a common
  // form, 거야 "last night" for 거 + 야 "it's the thing", would take that form's count and keep winning.)
  const start = table.headStart ?? WHOLE_HEAD_START;
  const key = (x) => table.rankOf(x.lemma) / (x.lemma === w && x.steps === 0 ? start : 1);
  return [...best.values()].sort((a, b) => key(a) - key(b) || a.steps - b.steps);
}
const WHOLE_HEAD_START = 5;

/** The dictionary form of one Korean word (the word itself when the table has nothing for it). */
export function koreanLemma(token, table) {
  const r = koreanReadings(token, table);
  return r.length ? r[0].lemma : koreanWord(token);
}

/** The lexeme of one Korean word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function koreanLexeme(token, table = null) {
  const word = koreanWord(token);
  if (!/[\p{L}]/u.test(word)) return null;
  const lemma = table ? koreanLemma(word, table) : word;
  return { key: `ko|${lemma}|x`, lemma, pos: "", root: "" };
}

/** Keys for looking a word up in the meanings file, best first: the readings' dictionary forms, then the
 * word as written, then (for a verb made from a noun) the noun. */
export function koreanKeys(token, table) {
  const w = koreanWord(token);
  if (!w) return [];
  const readings = table ? koreanReadings(w, table) : [];
  const keys = readings.slice(0, 4).map((r) => r.lemma);
  keys.push(w);
  for (const r of readings.slice(0, 2)) {
    const light = LIGHT_PRED.find((x) => r.lemma.endsWith(x) && r.lemma.length > x.length);
    if (light) keys.push(r.lemma.slice(0, -light.length));
  }
  return [...new Set(keys)];
}

// ---------- how a word is said: the Revised Romanization of Korean ----------
// The official system (Ministry of Culture, 2000) writes Korean as it is pronounced: the sound changes
// between syllables are applied (한국어 hangugeo, 국물 gungmul, 신라 silla, 좋고 joko, 같이 gachi,
// 합니다 hamnida), but not the tensing of consonants (학교 hakgyo, not hakkyo).
const INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWEL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
// Each final consonant as said at the end of a word or before a consonant (index = Unicode's final number).
const FINAL = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];
// Before a vowel: [what stays, what moves on to start the next syllable].
const LINK = [["", ""], ["", "g"], ["", "kk"], ["k", "s"], ["", "n"], ["n", "j"], ["", "n"], ["", "d"], ["", "r"], ["l", "g"],
  ["l", "m"], ["l", "b"], ["l", "s"], ["l", "t"], ["l", "p"], ["", "r"], ["", "m"], ["", "b"], ["p", "s"], ["", "s"], ["", "ss"],
  ["ng", ""], ["", "j"], ["", "ch"], ["", "k"], ["", "t"], ["", "p"], ["", ""]];
const KIND = { k: "k", t: "t", p: "p" };
const H_FINALS = new Set([6, 15, 27]); // ㄶ ㅀ ㅎ

/** [final as said, next initial as said] where a syllable ending in final `t` meets one starting with `l`
 * (Unicode numbers), the next syllable's vowel being `v`. */
function meet(t, l, v) {
  if (l === 11) { // ㅇ: the final carries over (먹어 meogeo), ㄷ/ㅌ before 이 become j/ch (굳이 guji, 같이 gachi)
    if (v === 20 && (t === 7 || t === 25 || t === 13)) return [t === 13 ? "l" : "", t === 7 ? "j" : "ch"];
    return LINK[t];
  }
  const said = FINAL[t];
  if (H_FINALS.has(t)) { // ㅎ joins the next consonant: 좋고 joko, 많다 manta, 놓는 nonneun, 좋습니다 josseumnida
    const keep = t === 6 ? "n" : t === 15 ? "l" : "";
    if (l === 0) return [keep, "k"];
    if (l === 3) return [keep, "t"];
    if (l === 12) return [keep, "ch"];
    if (l === 9) return [keep, "ss"];
    if (l === 2) return t === 15 ? ["l", "l"] : ["n", "n"];
  }
  if (l === 18) { // ㅎ after a stop makes it aspirated: 축하 chuka, 입학 ipak, 못해 motae, 닫히다 dachida
    if (KIND[said] === "k") return [t === 9 ? "l" : "", "k"];
    if (KIND[said] === "t") return ["", (t === 7 && v === 20) || t === 22 || t === 23 ? "ch" : "t"];
    if (KIND[said] === "p") return [t === 11 ? "l" : "", "p"];
  }
  if (l === 2 || l === 6) { // ㄴ ㅁ make stops nasal: 국물 gungmul, 있는 inneun, 합니다 hamnida; ㄹ + ㄴ is ll: 설날 seollal
    if (KIND[said] === "k") return ["ng", INITIAL[l]];
    if (KIND[said] === "t") return ["n", INITIAL[l]];
    if (KIND[said] === "p") return ["m", INITIAL[l]];
    if (said === "l" && l === 2) return ["l", "l"];
  }
  if (l === 5) { // ㄹ: 신라 silla, 종로 jongno, 심리 simni, 독립 dongnip, 협력 hyeomnyeok
    if (said === "n" || said === "l") return ["l", "l"];
    if (said === "m" || said === "ng") return [said, "n"];
    if (KIND[said] === "k") return ["ng", "n"];
    if (KIND[said] === "t") return ["n", "n"];
    if (KIND[said] === "p") return ["m", "n"];
  }
  if (t === 9 && l === 0) return ["l", "g"]; // 읽고 ilgo
  return [said, INITIAL[l]];
}

/** One run of Hangul syllables in Revised Romanization: 안녕하세요 -> annyeonghaseyo. */
function romanizeRun(run) {
  const syl = [...run].map((ch) => { const c = ch.charCodeAt(0) - S_BASE; return [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28]; });
  let out = "";
  let start = null; // how this syllable's first consonant is said, decided where it met the one before
  syl.forEach(([l, v, t], i) => {
    out += (start !== null ? start : INITIAL[l]) + VOWEL[v];
    if (i + 1 < syl.length) {
      const [nl, nv] = syl[i + 1];
      // 밟다: the ㄼ of 밟 is said p before a consonant (bapda)
      const [here, next] = l === 7 && v === 0 && t === 11 && nl !== 11 ? ["p", INITIAL[nl]] : meet(t, nl, nv);
      out += here;
      start = next;
    } else {
      out += FINAL[t];
    }
  });
  return out;
}

/** Korean text in Revised Romanization: each run of Hangul is romanized, Hanja in brackets after
 *  a word is left out, and anything else is left as it is. */
export function romanize(text) {
  return String(text ?? "").normalize("NFC").replace(HANJA_NOTE, "").replace(/[가-힣]+/g, (run) => romanizeRun(run));
}

/** Is there Korean in this text? */
export const hasHangul = (text) => HANGUL.test(String(text ?? ""));
