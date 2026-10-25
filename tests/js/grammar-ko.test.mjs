// The Korean grammar courses (tools/grammar/en-ko, tools/grammar/ko-en): the right script in the right
// place, and the right readings. en-ko: everything in Korean is in Hangul, every reading is in Latin
// letters and is the Revised Romanization of its Korean (romanize(), below: if you change a Korean sentence,
// this test tells you its new reading), every piece of Korean in an explanation has its reading, and so do
// the choices a learner taps. ko-en: the explanations are written in Korean, the English taught has no Hangul.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { explanationTexts, taughtTexts, targetsOf } from "../../web/js/grammardata.js";

const HANGUL = /[가-힣ㄱ-ㆎ]/; // syllables and single letters
const SYLLABLE = /[가-힣]/;
const read = (id) => {
  const path = `tools/grammar/${id}/lessons.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

// ---------------------------------------------------------------- Revised Romanization
// The official system, with the sound changes inside a word (liaison, nasalisation, ㄹ+ㄴ → ll,
// aspiration, palatalisation, a silent ㅎ) and without tensing, as the official system does. Each word
// (between spaces) is romanised on its own, in lowercase. Words that don't follow the rules go in EXCEPTIONS.

const INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const INITIAL_LETTER = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const VOWEL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINAL_LETTER = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
// a final consonant before another consonant or at the end of a word
const FINAL = {
  "": "", ㄱ: "k", ㄲ: "k", ㅋ: "k", ㄳ: "k", ㄺ: "k", ㄴ: "n", ㄵ: "n", ㄶ: "n",
  ㄷ: "t", ㅅ: "t", ㅆ: "t", ㅈ: "t", ㅊ: "t", ㅌ: "t", ㅎ: "t",
  ㄹ: "l", ㄼ: "l", ㄽ: "l", ㄾ: "l", ㅀ: "l", ㄻ: "m", ㅁ: "m", ㅂ: "p", ㅍ: "p", ㄿ: "p", ㅄ: "p", ㅇ: "ng",
};
const K_SOUND = new Set(["ㄱ", "ㄲ", "ㅋ", "ㄳ", "ㄺ"]);
const T_SOUND = new Set(["ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ", "ㅎ"]);
const P_SOUND = new Set(["ㅂ", "ㅍ", "ㅄ", "ㄿ"]);
const LG_STEMS = new Set(["읽", "맑", "밝", "늙", "긁", "붉"]); // ㄺ + ㄱ is l-g in these verb stems
// compounds that add an "n" sound before 이/야/여/요/유 (ㄴ 첨가): 지하철역 jihacheollyeok
const N_ADDED = ["지하철역", "서울역", "강남역", "명동역", "시청역", "부산역", "경복궁역", "십육", "한여름", "색연필", "꽃잎", "식용유", "휘발유", "볼일", "담요"];
const EXCEPTIONS = new Map(Object.entries({
  맛없어요: "madeopseoyo", 맛없다: "madeopda", 백화점: "baekhwajeom", 입학: "iphak", 축하: "chukha",
}));

function syllable(ch) {
  const c = ch.codePointAt(0) - 0xac00;
  const i = Math.floor(c / 588);
  return { ch, l: INITIAL_LETTER[i], li: i, v: Math.floor((c % 588) / 28), t: FINAL_LETTER[c % 28] };
}

/** How a final consonant and the next initial are said together: [final, initial]. */
function join(a, b) {
  const t = a.t, l = b.l, next = INITIAL[b.li], iNext = b.v === 20;
  if (l === "ㅇ") return {
    "": ["", ""], ㄱ: ["", "g"], ㄲ: ["", "kk"], ㅋ: ["", "k"], ㄴ: ["", "n"], ㄷ: ["", iNext ? "j" : "d"],
    ㄹ: ["", "r"], ㅁ: ["", "m"], ㅂ: ["", "b"], ㅅ: ["", "s"], ㅆ: ["", "ss"], ㅇ: ["ng", ""], ㅈ: ["", "j"],
    ㅊ: ["", "ch"], ㅌ: ["", iNext ? "ch" : "t"], ㅍ: ["", "p"], ㅎ: ["", ""],
    ㄳ: ["k", "s"], ㄵ: ["n", "j"], ㄶ: ["", "n"], ㄺ: ["l", "g"], ㄻ: ["l", "m"], ㄼ: ["l", "b"], ㄽ: ["l", "s"],
    ㄾ: ["l", iNext ? "ch" : "t"], ㄿ: ["l", "p"], ㅀ: ["", "r"], ㅄ: ["p", "s"],
  }[t];
  if (l === "ㅎ") {
    if (K_SOUND.has(t)) return t === "ㄺ" ? ["l", "k"] : ["", "k"];
    if (t === "ㄷ") return ["", iNext ? "ch" : "t"];
    if (t === "ㅅ" || t === "ㅆ" || t === "ㅌ") return ["", "t"];
    if (t === "ㅈ" || t === "ㅊ") return ["", "ch"];
    if (t === "ㄵ") return ["n", "ch"];
    if (P_SOUND.has(t)) return ["", "p"];
    if (t === "ㄼ") return ["l", "p"];
    if (t === "ㅎ") return ["", "t"];
    return [FINAL[t], "h"];
  }
  if (l === "ㄴ" || l === "ㅁ") {
    if (["ㅀ", "ㄼ", "ㄾ", "ㄽ", "ㄹ"].includes(t)) return l === "ㄴ" ? ["l", "l"] : ["l", "m"];
    if (K_SOUND.has(t)) return ["ng", next];
    if (T_SOUND.has(t) || t === "ㄶ" || t === "ㄵ") return ["n", next];
    if (P_SOUND.has(t) || t === "ㄻ") return ["m", next];
    return [FINAL[t], next];
  }
  if (l === "ㄹ") {
    if (t === "") return ["", "r"];
    if (["ㄴ", "ㄹ", "ㄼ", "ㄽ", "ㄾ", "ㅀ"].includes(t)) return ["l", "l"];
    if (t === "ㅁ" || t === "ㄻ") return ["m", "n"];
    if (t === "ㅇ" || K_SOUND.has(t)) return ["ng", "n"];
    if (P_SOUND.has(t)) return ["m", "n"];
    return ["n", "n"];
  }
  if (t === "ㅎ") return l === "ㄱ" ? ["", "k"] : l === "ㄷ" ? ["", "t"] : l === "ㅈ" ? ["", "ch"] : l === "ㅅ" ? ["", "ss"] : "ㅊㅋㅌㅍ".includes(l) ? ["", next] : ["t", next];
  if (t === "ㄶ" || t === "ㅀ") {
    const f = t === "ㄶ" ? "n" : "l";
    return l === "ㄱ" ? [f, "k"] : l === "ㄷ" ? [f, "t"] : l === "ㅈ" ? [f, "ch"] : [f, next];
  }
  if (t === "ㄺ" && l === "ㄱ" && LG_STEMS.has(a.ch)) return ["l", "g"];
  return [FINAL[t], next];
}

function romanizeWord(word) {
  if (EXCEPTIONS.has(word)) return EXCEPTIONS.get(word);
  const s = [...word].map(syllable);
  for (const pat of N_ADDED) {
    for (let at = word.indexOf(pat); at >= 0; at = word.indexOf(pat, at + 1)) {
      const k = [...word.slice(0, at)].length + [...pat].length - 1;
      if (k > 0 && s[k].l === "ㅇ" && s[k - 1].t) { s[k].l = "ㄴ"; s[k].li = 2; }
    }
  }
  let out = "", initial = INITIAL[s[0].li];
  s.forEach((x, i) => {
    out += initial + VOWEL[x.v];
    if (i < s.length - 1) { const [f, n] = join(x, s[i + 1]); out += f; initial = n; } else out += FINAL[x.t];
  });
  return out;
}

// a single consonant letter inside an ending (-(으)ㄹ 거예요, -(으)ㅂ시다) is said as a final consonant
const LETTER = { ㄱ: "k", ㄲ: "kk", ㄴ: "n", ㄷ: "t", ㄹ: "l", ㅁ: "m", ㅂ: "p", ㅅ: "s", ㅆ: "ss", ㅇ: "ng", ㅈ: "j", ㅊ: "ch", ㅋ: "k", ㅌ: "t", ㅍ: "p", ㅎ: "h" };
/** The reading of a Korean text: each Hangul word romanised, everything else kept as it is. */
export function romanize(text) {
  return String(text)
    .replace(/ㄹ([라-맇])/g, (m, syl) => "l" + romanizeWord(syl).replace(/^r/, "l"))
    .replace(/ㅂ(?=니)/g, "m")
    .replace(/[ㄱ-ㅎ]/g, (j) => LETTER[j] ?? j)
    .replace(/[가-힣]+/g, romanizeWord);
}

test("the romanization follows the official rules on words where they're easy to get wrong", () => {
  const cases = {
    안녕하세요: "annyeonghaseyo", 감사합니다: "gamsahamnida", 학교: "hakgyo", 같이: "gachi", 좋아요: "joayo", 좋고: "joko",
    많이: "mani", 괜찮아요: "gwaenchanayo", 읽어요: "ilgeoyo", 읽고: "ilgo", 읽다: "ikda", 없어요: "eopseoyo", 없는: "eomneun",
    있습니다: "itseumnida", 몰라요: "mollayo", 설날: "seollal", 종로: "jongno", 독립: "dongnip", 먹는: "meongneun",
    끝나요: "kkeunnayo", 어떻게: "eotteoke", 싫다: "silta", 앉으세요: "anjeuseyo", 여덟: "yeodeol", 닭고기: "dakgogi",
    맛있어요: "masisseoyo", 한국어: "hangugeo", 꽃이: "kkochi", 밖에: "bakke", 못해요: "motaeyo", 의사: "uisa",
    넓네요: "neolleyo", 정류장: "jeongnyujang", 십만: "simman", 놓쳤어요: "nochyeosseoyo", 지하철역이: "jihacheollyeogi",
    "-(으)ㄹ 거예요": "-(eu)l geoyeyo", "-(스)ㅂ니다": "-(seu)mnida", "-(으)ㄹ래요": "-(eu)llaeyo",
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(romanize(k), v, k);
});

// ---------------------------------------------------------------- the readings of a lesson

/** Every reading of a lesson, with the Korean it reads: [korean, reading, where]. */
function readings(l) {
  const out = [];
  const sent = (x, what) => x && x.r !== undefined && out.push([x.t, x.r, what]);
  for (const b of l.blocks || []) {
    if (b.goal) sent(b.goal, "the goal");
    (b.ex || []).forEach((e) => sent(e, "an example"));
    (b.dialog || []).forEach((d) => sent(d, "a line of the scene"));
  }
  for (const q of l.practice || []) {
    for (const x of q.lines || []) {
      if (x.options) x.options.forEach((o, i) => out.push([o, (x.rs || [])[i], "a reply"]));
      else sent(x, "a line of a dialogue");
    }
    (q.answers || []).forEach((a) => sent(a, "a model answer"));
    if (q.type === "say") out.push([q.answer, q.r, "a say answer"]);
    if (q.type === "order") q.words.forEach((w, i) => out.push([w, (q.rs || [])[i], "a word to order"]));
    if (q.type === "fill") {
      // a gap inside a word (질문___): the whole word is the gap, and each option reads as the whole word
      const m = q.t.match(/([가-힣]*)___([가-힣]*)/);
      out.push([q.t.slice(0, m.index) + "___" + q.t.slice(m.index + m[0].length), q.r, "a fill sentence"]);
      q.options.forEach((o, i) => out.push([m[1] + o + m[2], (q.rs || [])[i], "a fill option"]));
    }
  }
  for (const { text } of explanationTexts(l)) {
    for (const p of targetsOf(text)) {
      const [t, r] = p.split("|");
      if (SYLLABLE.test(t)) out.push([t, r, `{{${t}}}`]);
    }
  }
  return out;
}

const enko = read("en-ko");
test("en-ko: the Korean is in Hangul, every reading is its Revised Romanization", { skip: !enko }, () => {
  for (const l of enko.lessons) {
    for (const t of taughtTexts(l)) assert.match(t, HANGUL, `${l.id}: Korean without Hangul: “${t}”`);
    for (const [t, r, where] of readings(l)) {
      assert.ok(String(r || "").trim(), `${l.id}: ${where} “${t}” has no reading`);
      assert.equal(r, romanize(t), `${l.id}: ${where} “${t}” reads “${r}”; its reading is “${romanize(t)}”`);
    }
  }
});

test("en-ko: the choices a learner taps have their readings (a beginner can't pick a word they can't read)", { skip: !enko }, () => {
  for (const l of enko.lessons) {
    for (const q of l.practice) {
      if (q.type === "fill") {
        assert.ok(String(q.r || "").includes("___"), `${l.id}: a fill question without the reading of its sentence`);
        assert.equal((q.rs || []).length, q.options.length, `${l.id}: a fill question without a reading for each option`);
      }
      if (q.type === "order") assert.equal((q.rs || []).length, q.words.length, `${l.id}: an order question without a reading for each word`);
      for (const x of q.lines || []) if (x.options) assert.equal((x.rs || []).length, x.options.length, `${l.id}: a dialogue reply without a reading for each option`);
    }
  }
});

const koen = read("ko-en");
test("ko-en: the explanations are written in Korean, the English taught has no Hangul", { skip: !koen }, () => {
  assert.match(koen.title, HANGUL);
  assert.match(koen.about, HANGUL);
  for (const u of koen.units) assert.match(u.title, HANGUL, `unit ${u.n}`);
  for (const l of koen.lessons) {
    for (const k of ["title", "summary"]) assert.match(l[k], HANGUL, `${l.id}: its ${k} isn't in Korean`);
    for (const b of l.blocks) if (b.p) assert.match(b.p, HANGUL, `${l.id}: a paragraph that isn't in Korean: “${b.p.slice(0, 40)}”`);
    for (const t of taughtTexts(l)) assert.doesNotMatch(t, HANGUL, `${l.id}: Hangul in the English taught: “${t}”`);
  }
});
