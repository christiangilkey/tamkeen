// Step 2 for Korean: the forms counted by forms_ko.py, grouped by dictionary word and ranked by how
// common each dictionary word is in all its forms together, like tools/course/rank.mjs for Arabic.
//
//   node tools/course/ko/rank_ko.mjs   ->  tools/course/build/ko-ranked.json
//     [{rank, lemma, freq, forms: [[form, freq], ...]}, ...]  (the top 3000)
//
// wordfreq counts Korean the way MeCab cuts it up: verb stems apart from their endings (하, 했, 할, 합니다),
// nouns apart from their particles (사람 + 들 + 이). So each form is read with the app's analyzer
// (web/js/lexicon/korean.js and docs/lexicon/ko-words.json.gz) and, when it is a bare stem, with the
// table's stems; of the dictionary words a form could be, the commonest (in the table's subtitle
// counts) gets it. Particles get their usual written pair (이/가, 은/는); endings (-습니다, -었-, -지만),
// numbers in digits and Latin letters are left out. The course's own list (words.json) is chosen from
// this one by hand, which also settles forms that could be two words (일 "work"/"day", 네 "yes"/"your").
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KoreanWords, koreanReadings } from "../../../web/js/lexicon/korean.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(here, "..", "build");
const forms = JSON.parse(readFileSync(join(build, "ko-forms.json"), "utf8"));
const table = new KoreanWords(JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "ko-words.json.gz")))));

// Particles (조사, words in Korean grammar), each under the pair a learner sees.
const PARTICLE = {
  이: "이/가", 가: "이/가", 은: "은/는", 는: "은/는", 을: "을/를", 를: "을/를", 과: "와/과", 와: "와/과",
  로: "(으)로", 으로: "(으)로", 랑: "(이)랑", 이랑: "(이)랑", 이나: "(이)나",
  에: "에", 에서: "에서", 의: "의", 도: "도", 만: "만", 까지: "까지", 부터: "부터", 에게: "에게", 한테: "한테",
  께: "께", 께서: "께서", 처럼: "처럼", 보다: "보다 (than)", 마다: "마다", 하고: "하고", 밖에: "밖에", 엔: "에",
  에서는: "에서", 에는: "에", 으로서: "(으)로서", 로서: "(으)로서", 씩: "씩", 쯤: "쯤", 만큼: "만큼", 대로: "대로",
  조차: "조차", 마저: "마저", 뿐: "뿐", 라도: "(이)라도", 이라도: "(이)라도",
};
// Endings and other pieces that aren't words (어미, suffixes), left out.
const ENDING = new Set(("다 고 어 아 게 지 었 았 였 겠 기 면 으면 니 니까 으니까 지만 는데 은데 ㄴ데 던 며 으며 면서 으면서 " +
  "습니다 ㅂ니다 세요 으세요 셨 으시 요 죠 네요 아요 어요 야 여 어서 아서 라고 다고 다는 라는 냐 는지 은지 도록 " +
  "어야 아야 려고 으려고 거나 든 다가 다면 는다 ㄴ다 란 군 구나 잖아 거든 래 더라 라 서 러 으러 ㄹ 음 ㅁ 는다고 " +
  "님 트 스 드 테 까 인지 인가 라면 어도 아도 다니 다며 습니까 " +
  "다가 어도 아도 구나 대요 곤 고자 으로써 로써 고요 지요 거든요 는데요 은가 는가 ㄹ까 을까 까요 ㄹ게 을게 ㄹ래 을래").split(" "));

const rankOf = (l) => table.rankOf(l);
const best = (cands) => cands.filter((l) => table.has(l)).sort((a, b) => rankOf(a) - rankOf(b))[0];
// Forms the readings get wrong, by hand: [[dictionary word, the share of the form's count it gets], ...].
// 다 is nearly always the ending -다: a twentieth of its count goes to the adverb 다 "all", about where the
// table's subtitle counts put it. 이 is mostly the particle, but also the copula 이(다) and 이 "this";
// 시 mostly the honorific -시-, sometimes 시 "o'clock". Some single syllables are two common words.
const OVERRIDE = {
  이: [["이/가", 0.6], ["이다", 0.25], ["이", 0.15]], 다: [["다", 0.05]], 시: [["시", 0.3]], 들: [["들다", 0.3]],
  전: [["전", 1]], 잘: [["잘", 1]], 안: [["안", 1]], 오: [["오다", 1]], 아니: [["아니다", 1]], 젤: [["제일", 1]],
  잔: [["잔", 1]], 골: [["골", 1]], 벨: [["벨", 1]], 쌀: [["쌀", 1]], 끈: [["끈", 1]], 꿀: [["꿀", 1]], 판: [["판", 1]],
  살: [["살다", 0.6], ["살", 0.4]], 날: [["날", 0.6], ["나", 0.4]], 줄: [["주다", 0.5], ["줄", 0.5]],
  가지: [["가지다", 0.6], ["가지", 0.4]], 열: [["열다", 0.5], ["열", 0.5]], 산: [["산", 0.5], ["살다", 0.5]],
  주: [["주다", 0.7], ["주", 0.3]], 입: [["이다", 0.9], ["입", 0.1]], 함: [["하다", 1]], 배우: [["배우다", 0.6], ["배우", 0.4]], 달리: [["달리다", 0.5], ["달리", 0.5]],
  마치: [["마치다", 0.5], ["마치", 0.5]], 그리: [["그리다", 0.5], ["그리", 0.5]], 먹이: [["먹이다", 0.5], ["먹이", 0.5]],
};
// MeCab keeps a noun or adverb whole (정도, 고기, 가게, 거의), so a form of two syllables or more that the
// table lists as one is that word, except these, which are verb forms MeCab leaves joined (해서 = 하 + 여서).
const VERB_FORMS = new Set(("해서 해도 위해 대한 인지 인가 지난 지나 지내 드릴 마실 그런지 갈래 신나 심해 자라 이래 켜 " +
  "뭘 뭔 뭔지 이게 그게 저게 누가 누군가 어딘가 우린 듯이 걸로 그릴 가도 이건 그건 저건 이걸 그걸 " +
  // verb stems spelled like a rarer noun (보이 "boy", 이기 "egoism")
  "보이 이기 이루 생기 고마워 아냐 내리 미치 계시 불리 전하 누리 알리 강하 인하 피하 사귀 건너 빌리 모시 상하 모이 " +
  "거두 부수 말리 겁나 고치 망치 치우 몰리 내주 갈리 어리 지치 해치 기울 반하").split(" "));

function lemmaOf(form) {
  if (OVERRIDE[form]) return OVERRIDE[form];
  if (PARTICLE[form]) return [[PARTICLE[form], 1]];
  if (ENDING.has(form)) return null;
  if (!/^[가-힣]+$/.test(form)) return null;
  if (form.length > 1 && table.has(form) && table.kind.get(form) !== "v" && !VERB_FORMS.has(form)) return [[form, 1]];
  const top = koreanReadings(form, table).map((r) => r.lemma).find((l) => table.has(l));
  // A bare stem as MeCab leaves it (하, 먹, 했, 해, 할, 한): the verbs it is a stem of.
  const stems = [];
  for (const type of ["C", "A", "U", "Cn", "Ud"]) stems.push(...(table.bases[type].get(form) || []));
  const nfd = form.normalize("NFD");
  const last = nfd.at(-1);
  const rest = nfd.slice(0, -1).normalize("NFC");
  if (last === "ᆻ") stems.push(...(table.bases.A.get(rest) || [])); // ㅆ: a past stem (했, 봤, 갔)
  if (last === "ᆫ" || last === "ᆯ") // ㄴ ㄹ: 한, 할 (not ㅂ: MeCab keeps 합니다 whole, and 잡, 압 are words)
    stems.push(...(table.bases.U.get(rest) || []), ...(table.bases.Ud.get(rest) || []), ...(table.bases.Cn.get(rest) || []));
  const stem = best(stems);
  if (!top) return [[stem || form, 1]];
  if (!stem) return [[top, 1]];
  // The form read as a word of its own gets a head start, as in the app (korean.js WHOLE_HEAD_START).
  return [[rankOf(top) / (top === form ? 5 : 1) <= rankOf(stem) ? top : stem, 1]];
}

const byLemma = new Map();
for (const [form, freq] of forms) {
  for (const [lemma, share] of lemmaOf(form) || []) {
    let e = byLemma.get(lemma);
    if (!e) byLemma.set(lemma, (e = { lemma, freq: 0, forms: [] }));
    e.freq += freq * share;
    e.forms.push([form, freq * share]);
  }
}
const ranked = [...byLemma.values()].sort((x, y) => y.freq - x.freq).slice(0, 3000)
  .map((e, i) => ({ rank: i + 1, ...e, freq: Number(e.freq.toPrecision(4)), forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(build, "ko-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byLemma.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/ko-ranked.json`);
