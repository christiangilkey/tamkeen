// Run with: node --test tests/js/
// Korean: particles and verb endings come off a word to give its dictionary form, checked against the
// Korean word table (docs/lexicon/ko-words.json.gz, made by tools/build_korean_words.mjs), and every word
// is read in Revised Romanization. Reads the real table and meanings in docs/lexicon/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { KoreanWords, koreanKeys, koreanLemma, koreanLexeme, koreanWord, romanize } from "../../web/js/lexicon/korean.js";
import { lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";
import { lookUp, matchKey } from "../../web/js/lexicon/meaningdata.js";
import { detectLanguage, joinWords, LANGUAGES } from "../../web/js/languages.js";
import common from "../../web/js/wordlists/ko.js";

const load = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))));
const data = load("ko-words.json.gz");
const table = new KoreanWords(data);
const lemmas = (words) => words.split(" ").map((w) => koreanLemma(w, table));

test("the table is the published one: Korean dictionary words, commonest first, with verb stems", () => {
  assert.equal(data.kind, "ko");
  assert.ok(data.lemmas.length > 25000);
  assert.equal(data.pos.length, data.lemmas.length);
  assert.ok(Object.keys(data.preds).length > 4000);
  assert.deepEqual(data.lemmas.slice(0, 3), ["하다", "있다", "나"]);
  assert.equal(data.preds["듣다"], "들어|들으", "the stems come from Wiktionary's conjugation tables");
  assert.throws(() => new KoreanWords({ format: 2, kind: "ko" }), /different version/);
});

test("particles come off nouns and pronouns", () => {
  assert.deepEqual(lemmas("책을 학교에서 서울로 집으로 친구랑 사람들이 메시지를 아들에게 나라의"),
    ["책", "학교", "서울", "집", "친구", "사람", "메시지", "아들", "나라"]);
  assert.deepEqual(lemmas("내가 제가 네가 나는 저는 우리는 이건 그건 뭘 얘긴 그땐"),
    ["나", "저", "너", "나", "저", "우리", "이거", "그거", "뭐", "얘기", "그때"], "pronouns, and 는/를 shortened to ㄴ/ㄹ");
  assert.deepEqual(lemmas("빨리요 많이도 지금은 어디예요 진짜예요"), ["빨리", "많이", "지금", "어디", "진짜"]);
});

test("the copula: 학생이에요, 친구예요, 학생입니다", () => {
  assert.deepEqual(lemmas("학생이에요 친구예요 학생입니다 친구다 학생이었어요 친구라고 말야"),
    ["학생", "친구", "학생", "친구", "학생", "친구", "말"]);
});

test("verb and adjective endings come off, back to the -다 form", () => {
  assert.deepEqual(lemmas("먹었어요 먹고 먹는 먹을래요 먹겠습니다 먹어"), Array(6).fill("먹다"));
  assert.deepEqual(lemmas("갔는데 가세요 가셨어요 갈게요 가요"), Array(5).fill("가다"), "past, honorific, future; 가요 is 'goes' before 'song'");
  assert.deepEqual(lemmas("했어요 해요 하는데요 하더라고요 하잖아요 하려고 해야겠어"), Array(7).fill("하다"));
  assert.deepEqual(lemmas("공부했어요 미안해요 사랑해요 좋아해요"), ["공부하다", "미안하다", "사랑하다", "좋아하다"]);
  assert.deepEqual(lemmas("있어요 있었어요 없어요 아니에요 아녜요"), ["있다", "있다", "없다", "아니다", "아니다"]);
});

test("irregular verbs and adjectives: their stems come from the table", () => {
  assert.deepEqual(lemmas("더워서 추워요 어려워요 도와 고마워요"), ["덥다", "춥다", "어렵다", "돕다", "고맙다"], "ㅂ");
  assert.deepEqual(lemmas("들었어요 걸으면"), ["듣다", "걷다"], "ㄷ");
  assert.deepEqual(lemmas("나아요 지었어요"), ["낫다", "짓다"], "ㅅ");
  assert.deepEqual(lemmas("내리었다 내렸다 졌어요 피었다"), ["내리다", "내리다", "지다", "피다"],
    "a stem in ㅣ: -이어 as in older writing too, unless it is another verb's (지어: 짓다)");
  assert.deepEqual(lemmas("몰라 몰랐어요 불러요"), ["모르다", "모르다", "부르다"], "르");
  assert.deepEqual(lemmas("바빠요 예뻐요 써요"), ["바쁘다", "예쁘다", "쓰다"], "ㅡ");
  assert.deepEqual(lemmas("그래요 빨개요"), ["그렇다", "빨갛다"], "ㅎ");
  assert.deepEqual(lemmas("사는 만드는 아는데 아세요 압니다 살면 놀러"), ["살다", "만들다", "알다", "알다", "알다", "살다", "놀다"],
    "ㄹ stems drop the ㄹ before ㄴ, ㅅ and ㅂ, and keep it before 면 and 러");
  assert.deepEqual(lemmas("마셔요 드세요 주무세요 계세요"), ["마시다", "드시다", "주무시다", "계시다"],
    "a verb's own form beats the honorific of another (마셔요 is not 말다 + -시-)");
});

test("words written whole stay whole; a common word isn't taken apart wrongly", () => {
  assert.deepEqual(lemmas("그래서 그런데 하지만 그리고 어떻게 정말 같이 많이"),
    ["그래서", "그런데", "하지만", "그리고", "어떻게", "정말", "같이", "많이"], "adverbs and conjunctions aren't verb forms");
  assert.deepEqual(lemmas("바다 나라 사랑 날씨 날씨가"), ["바다", "나라", "사랑", "날씨", "날씨"],
    "바다 is not 바 + 다, 날씨 not 날 + 씨");
  assert.deepEqual(lemmas("살려 들려 나가"), ["살리다", "들리다", "나가다"]);
  assert.deepEqual(lemmas("보고 일이"), ["보다", "일"]);
});

test("helping verbs and little words run together, numbers with counters, Latin letters with particles", () => {
  assert.deepEqual(lemmas("해줄게 살아있는 해봤어"), ["하다", "살다", "하다"]);
  assert.deepEqual(lemmas("안좋아 어딨어"), ["좋다", "있다"]);
  assert.deepEqual(lemmas("10분 3일에"), ["분", "일"]);
  assert.deepEqual(lemmas("BTS가 K팝을"), ["bts", "k팝"]);
  assert.equal(koreanWord("“먹었어요?”"), "먹었어요", "punctuation off the ends");
});

test("seen words: every form of a word is one lexeme; without the table, the spelling", () => {
  assert.ok(usesDictionaries("ko"));
  const keys = lexemesFor(["먹었어요", "먹고", "먹는"], "ko", [table]).map((x) => x.key);
  assert.deepEqual(keys, ["ko|먹다|x", "ko|먹다|x", "ko|먹다|x"]);
  assert.equal(koreanLexeme("먹었어요").key, "ko|먹었어요|x");
  assert.equal(lexemesFor(["?!"], "ko", [table])[0], null, "punctuation is no word");
});

test("No AI: a tapped word finds its dictionary form's meaning", () => {
  const mean = load("ko-meanings.json.gz");
  const meaning = (w) => {
    const found = lookUp([mean], [...new Set(koreanKeys(w, table).map((k) => matchKey(k, "ko")))], w, "ko");
    return found ? found.groups[0][2][0] : "";
  };
  assert.match(meaning("먹었어요"), /eat/);
  assert.match(meaning("학교에서"), /school/);
  assert.match(meaning("들었어요"), /listen|hear/);
  assert.match(meaning("우리는"), /^we/, "the everyday meaning first (not 'cage')");
  assert.match(meaning("안"), /^not$/);
  assert.match(meaning("내"), /^my/);
  assert.match(meaning("가요"), /go/, "가요 'goes' before 가요 'song'");
  const group = mean.words["학교"][0];
  assert.equal(String(group[3]).split("|")[0], "學校", "a Sino-Korean word carries its Hanja");
  assert.equal(mean.words["학교"] && LANGUAGES.ko.root, "Hanja");
});

test("Revised Romanization, with the sound changes between syllables", () => {
  const cases = {
    안녕하세요: "annyeonghaseyo", 감사합니다: "gamsahamnida", 먹었어요: "meogeosseoyo", 한국어: "hangugeo", 학교: "hakgyo",
    좋아요: "joayo", 많이: "mani", 읽다: "ikda", 읽고: "ilgo", 앉다: "anda", 없어요: "eopseoyo", 같이: "gachi", 굳이: "guji",
    국물: "gungmul", 신라: "silla", 종로: "jongno", 좋고: "joko", 놓는: "nonneun", 축하해요: "chukahaeyo", 입학: "ipak",
    설날: "seollal", 서울: "seoul", 의사: "uisa", 있습니다: "itseumnida", 값이: "gapsi", 닭: "dak", 여덟: "yeodeol",
    밟다: "bapda", 좋습니다: "josseumnida", 독립: "dongnip", 심리: "simni", 떡볶이: "tteokbokki", 꽃이: "kkochi",
  };
  for (const [hangul, rr] of Object.entries(cases)) assert.equal(romanize(hangul), rr, hangul);
  assert.equal(romanize("BTS가 좋아!"), "BTSga joa!", "anything not Hangul is left as it is");
  assert.equal(romanize("동광학교(東光學校)까지"), "donggwanghakgyokkaji", "Hanja in brackets is not read");
  assert.equal(koreanWord("학교(學校)에"), "학교에", "nor looked up");
  assert.equal(koreanWord("문안에(거기도"), "문안에", "two words joined by a bracket: the first");
  assert.equal(koreanWord("‘대박’이야"), "대박");
  assert.equal(romanize("學校"), "學校", "Hanja on its own is left as it is");
});

test("Korean is told by its letters, written with spaces, with a list of 1000 common dictionary words", () => {
  assert.equal(detectLanguage("안녕하세요, 반갑습니다", "es"), "ko");
  assert.equal(detectLanguage("BTS 신곡 너무 좋아요", "en"), "ko");
  assert.equal(joinWords(["학교에", "가요."], "ko"), "학교에 가요.");
  assert.equal(common.length, 1000);
  assert.ok(common.slice(0, 20).includes("하다") && common.includes("먹다") && common.includes("학교"));
  assert.ok(common.every((w) => /^[가-힣]+$/.test(w)), "Hangul only");
});
