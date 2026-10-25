// The Chinese grammar courses' own checks (tools/grammar/en-zh and zh-en), on top of grammar.test.mjs:
//   en-zh: every piece of Chinese has its pinyin, and the pinyin is right: one syllable per character,
//          the tone mark on the right vowel, and each syllable and tone as CC-CEDICT gives it (allowing
//          the tone changes of 一 and 不, neutral tones, and the second readings listed below). Simplified
//          characters only; no Chinese outside {{ }} in the English explanations.
//   zh-en: the explanations are simplified Chinese with Chinese punctuation; the English has no Chinese.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ChineseDictionary, chineseWords } from "../../web/js/lexicon/chinese.js";
import { explanationTexts, parseRich, targetsOf } from "../../web/js/grammardata.js";

const source = (id) => new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
const zh = new ChineseDictionary(JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/zh-cedict.json.gz", import.meta.url)))));
const HAN = /[\u3400-\u9fff\u3007]/u;
const isHan = (ch) => HAN.test(ch);

// Second readings a character has outside the word CC-CEDICT's cut puts it in (a single character
// gets only its commonest reading there). Base syllable + tone (0 = neutral).
const ALSO = {
  得: ["de0", "dei3", "de2"], 着: ["zhe0", "zhao2"], 了: ["le0", "liao3"], 还: ["hai2", "huan2"], 只: ["zhi3", "zhi1"],
  长: ["chang2", "zhang3"], 都: ["dou1", "du1"], 行: ["xing2", "hang2"], 觉: ["jue2", "jiao4"], 重: ["zhong4", "chong2"],
  好: ["hao3", "hao4"], 为: ["wei4", "wei2"], 地: ["di4", "de0"], 的: ["de0"], 少: ["shao3", "shao4", "shao0"], 要: ["yao4", "yao1"],
  教: ["jiao1", "jiao4"], 种: ["zhong3", "zhong4"], 数: ["shu4", "shu3"], 差: ["cha4", "cha1"], 空: ["kong1", "kong4"],
  干: ["gan4", "gan1"], 假: ["jia4", "jia3"], 发: ["fa1", "fa4"], 相: ["xiang1", "xiang4"], 调: ["diao4", "tiao2"],
  乐: ["le4", "yue4"], 和: ["he2", "huo0"], 场: ["chang3", "chang2"], 会: ["hui4"], 应: ["ying1", "ying4"], 分: ["fen1", "fen4"],
  那: ["na4", "nei4"], 哪: ["na3", "nei3"], 这: ["zhe4", "zhei4"], 谁: ["shei2", "shui2"], 便: ["bian4", "pian2"],
  看: ["kan4", "kan1"], 难: ["nan2", "nan4"], 背: ["bei4", "bei1"], 倒: ["dao3", "dao4"], 系: ["xi4", "ji4"], 待: ["dai4", "dai1"],
  兴: ["xing4", "xing1"], 当: ["dang1", "dang4"], 正: ["zheng4", "zheng1"], 中: ["zhong1", "zhong4"], 一: ["yi1"], 不: ["bu4"],
  上: ["shang4"], 下: ["xia4"], 里: ["li3"], 头: ["tou2"], 过: ["guo4"], 么: ["me0"], 们: ["men0"], 子: ["zi3"], 个: ["ge4"],
  儿: ["er2", "r0"], 喂: ["wei2"], 喝: ["he1"], 汤: ["tang1"], 累: ["lei4"], 几: ["ji3"], 骑: ["qi2"], 打: ["da3"], 跑: ["pao3"],
};
// Characters that are often said with a neutral tone in a phrase (个 after a number, 上 after a noun,
// a direction after a verb, 不 inside 看不懂…), so pinyin without a mark is fine for them.
const NEUTRAL_OK = new Set("个们子的了着过得地么吗呢吧啊嘛呀啦哦上下里来去起开回进出头一不边面候生友西气识欢亮服楚思字道方量拾觉白情事意");
const MARKED = { ā: ["a", 1], á: ["a", 2], ǎ: ["a", 3], à: ["a", 4], ē: ["e", 1], é: ["e", 2], ě: ["e", 3], è: ["e", 4],
  ī: ["i", 1], í: ["i", 2], ǐ: ["i", 3], ì: ["i", 4], ō: ["o", 1], ó: ["o", 2], ǒ: ["o", 3], ò: ["o", 4],
  ū: ["u", 1], ú: ["u", 2], ǔ: ["u", 3], ù: ["u", 4], ǖ: ["ü", 1], ǘ: ["ü", 2], ǚ: ["ü", 3], ǜ: ["ü", 4] };

/** Pinyin as a stream of letters ({ch, tone}) and breaks (null) between words. */
function stream(r) {
  const out = [];
  for (const raw of String(r).normalize("NFC").toLowerCase()) {
    if (MARKED[raw]) out.push({ ch: MARKED[raw][0], tone: MARKED[raw][1] });
    else if (/[a-zü]/.test(raw)) out.push({ ch: raw, tone: 0 });
    else if (out.length && out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/** Each character's reading in its word, as CC-CEDICT cuts the text: [{ch, base, tone, alone}]. */
function dictionaryReadings(t) {
  const out = [];
  for (const w of chineseWords(zh, t)) {
    const chars = Array.from(w.text).filter(isHan);
    if (!chars.length) continue;
    const syl = String(w.pinyin || "").split(/\s+/).filter(Boolean);
    chars.forEach((ch, i) => {
      const m = String(syl[i] || "").toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü").match(/^([a-zü]+)([1-5])$/);
      const one = zh.entry(ch);
      const alone = one ? String(one[0]).toLowerCase().replace(/u:/g, "ü").match(/^([a-zü]+)([1-5])$/) : null;
      out.push({ ch, base: m ? m[1] : "", tone: m ? Number(m[2]) % 5 : -1, alone: alone ? Number(alone[2]) % 5 : -1 });
    });
  }
  return out;
}

/** Where the tone mark of a syllable belongs: a or e, the o of ou, else the last vowel. */
function markAt(base) {
  let at = base.search(/[ae]/);
  if (at < 0) at = base.indexOf("ou");
  if (at < 0) for (let i = base.length - 1; i >= 0; i--) if ("iouü".includes(base[i])) { at = i; break; }
  return at;
}

/** What is wrong with the pinyin `r` of the Chinese `t` (a list; empty when nothing is). */
export function pinyinProblems(t, r) {
  const bad = [];
  const text = String(t || "");
  if (/[0-9]/.test(text)) bad.push(`digits in “${text}” (write numbers in characters)`);
  if (/[A-Za-z]/.test(text)) bad.push(`Latin letters in “${text}”`);
  if (zh.isTraditional(text)) bad.push(`traditional characters in “${text}”`);
  const s = stream(r);
  let pos = 0;
  const skip = () => { while (pos < s.length && s[pos] === null) pos++; };
  const readings = dictionaryReadings(text);
  for (let k = 0; k < readings.length; k++) {
    const d = readings[k];
    skip();
    const erhua = d.ch === "儿" && d.base === "r";
    if (!erhua && pos > 0 && s[pos - 1] !== null && d.ch !== "儿") {
      // fine: syllables of one word are written together
    }
    const options = [d.base, ...(ALSO[d.ch] || []).map((x) => x.replace(/\d$/, ""))].filter(Boolean);
    let took = null;
    for (const base of [...new Set(options)].sort((a, b) => b.length - a.length)) {
      const got = s.slice(pos, pos + base.length);
      if (got.length === base.length && got.every((x, i) => x && x.ch === base[i])) { took = { base, letters: got }; break; }
    }
    if (!took) {
      const rest = s.slice(pos, pos + 8).map((x) => (x ? x.ch : " ")).join("");
      bad.push(`“${text}”: ${d.ch} should read ${d.base}${d.tone || ""}, the pinyin has “${rest}…” (in “${r}”)`);
      return bad;
    }
    pos += took.base.length;
    const marks = took.letters.map((x, i) => [x.tone, i]).filter(([tone]) => tone);
    if (marks.length > 1) { bad.push(`“${r}”: two tone marks in ${took.base}`); continue; }
    const mine = marks.length ? marks[0][0] : 0;
    if (marks.length && took.base !== "r" && marks[0][1] !== markAt(took.base)) bad.push(`“${r}”: the tone mark of ${took.base} is on the wrong letter`);
    if (took.base === "r") continue;
    const want = d.tone < 0 ? -1 : d.tone;
    const also = (ALSO[d.ch] || []).includes(`${took.base}${mine}`);
    const ok = mine === want || also
      || (d.ch === "一" && [0, 1, 2, 4].includes(mine))
      || (d.ch === "不" && [0, 2, 4].includes(mine))
      || (mine === 0 && (NEUTRAL_OK.has(d.ch) || (k > 0 && readings[k - 1].ch === d.ch)))
      || (want === 0 && mine === d.alone);
    if (!ok) bad.push(`“${text}”: ${d.ch} is ${took.base}${want || "(neutral)"}, the pinyin says ${took.base}${mine || "(neutral)"} (in “${r}”)`);
  }
  skip();
  if (pos < s.length) bad.push(`“${text}”: the pinyin has more syllables than the characters (in “${r}”)`);
  return bad;
}

/** Every Chinese text of an en-zh lesson with its pinyin: [[t, r, where]]. */
function pairs(lesson) {
  const out = [];
  const add = (t, r, where) => out.push([t, r, `${lesson.id}: ${where}`]);
  for (const b of lesson.blocks || []) {
    if (b.goal) add(b.goal.t, b.goal.r, "goal");
    for (const e of b.ex || []) add(e.t, e.r, "example");
    for (const d of b.dialog || []) add(d.t, d.r, "dialogue");
  }
  for (const { text } of explanationTexts(lesson)) {
    for (const piece of targetsOf(text)) {
      const [t, r] = piece.split("|");
      if (HAN.test(t)) add(t, r, `{{${piece}}}`);
    }
  }
  for (const q of lesson.practice || []) {
    const at = `practice “${q.q}”`;
    if (q.type === "say") add(q.answer, q.r, at);
    if (q.type === "free") for (const a of q.answers || []) add(a.t, a.r, at);
    if (q.type === "fill") {
      if (!q.r || !Array.isArray(q.rs)) add(q.t, "", `${at} (no r and rs)`);
      else {
        add(String(q.t).replace("___", q.options[q.answer]), String(q.r).replace("___", ` ${q.rs[q.answer]} `), at);
        q.options.forEach((o, i) => add(o, q.rs[i], `${at}, option`));
      }
    }
    if (q.type === "order") {
      if (!Array.isArray(q.rs)) add(q.words.join(""), "", `${at} (no rs)`);
      else {
        add(q.words.join(""), q.rs.join(" "), at);
        q.words.forEach((w, i) => add(w, q.rs[i], `${at}, word`));
      }
    }
    if (q.type === "dialogue") for (const l of q.lines || []) {
      if (l.options) {
        if (!Array.isArray(l.rs)) add(l.options[0], "", `${at} (a reply without rs)`);
        else l.options.forEach((o, i) => add(o, l.rs[i], `${at}, reply`));
      } else add(l.t, l.r, `${at}, line`);
    }
  }
  return out;
}

/** The explanation text outside its {{ }} pieces. */
const outside = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join("");

if (existsSync(source("en-zh"))) {
  const course = JSON.parse(readFileSync(source("en-zh"), "utf8"));
  test("en-zh: every piece of Chinese has its pinyin, and the pinyin matches the characters", () => {
    const bad = [];
    for (const l of course.lessons) {
      for (const [t, r, where] of pairs(l)) {
        if (!String(r || "").trim()) { bad.push(`${where}: “${t}” has no pinyin`); continue; }
        for (const p of pinyinProblems(t, r)) bad.push(`${where}: ${p}`);
      }
    }
    assert.deepEqual(bad, []);
  });
  test("en-zh: the explanations are English, with Chinese only inside {{ }}", () => {
    const bad = [];
    for (const l of course.lessons) for (const { text, kind } of explanationTexts(l)) {
      if (HAN.test(outside(text))) bad.push(`${l.id}: Chinese outside {{ }} in ${kind} “${text.slice(0, 50)}”`);
    }
    for (const l of course.lessons) for (const m of l.mistakes || []) {
      for (const s of [m.wrong, m.right]) if (zh.isTraditional(s)) bad.push(`${l.id}: traditional characters in “${s}”`);
    }
    assert.deepEqual(bad, []);
  });
}

if (existsSync(source("zh-en"))) {
  const course = JSON.parse(readFileSync(source("zh-en"), "utf8"));
  test("zh-en: the explanations are simplified Chinese with Chinese punctuation; the English has no Chinese", () => {
    const bad = [];
    const english = (s, where) => { if (HAN.test(String(s || ""))) bad.push(`${where}: Chinese in the English “${s}”`); };
    for (const l of course.lessons) {
      for (const { text, kind } of explanationTexts(l)) {
        const own = outside(text);
        if (zh.isTraditional(own)) bad.push(`${l.id}: traditional characters in ${kind} “${text.slice(0, 40)}”`);
        if (/[\u3400-\u9fff][,.;:?!()]/u.test(own) || /[,;:?!(][\u3400-\u9fff]/u.test(own)) bad.push(`${l.id}: English punctuation beside Chinese in ${kind} “${text.slice(0, 40)}”`);
      }
      for (const b of l.blocks || []) {
        if (b.goal) english(b.goal.t, l.id);
        for (const e of b.ex || []) english(e.t, l.id);
        for (const d of b.dialog || []) english(d.t, l.id);
      }
      for (const m of l.mistakes || []) { english(m.wrong, l.id); english(m.right, l.id); }
      for (const q of l.practice || []) {
        english(q.answer, l.id);
        if (q.type !== "choice") for (const o of q.options || []) english(o, l.id);
        for (const w of q.words || []) english(w, l.id);
        if (q.type === "fill") english(q.t, l.id);
        for (const x of q.lines || []) { english(x.t, l.id); for (const o of x.options || []) english(o, l.id); }
        for (const a of q.answers || []) english(a.t, l.id);
      }
      for (const { text } of explanationTexts(l)) for (const piece of targetsOf(text)) english(piece, l.id);
    }
    assert.deepEqual(bad, []);
  });
}

test("the pinyin check finds wrong tones, missing syllables and misplaced marks", () => {
  assert.deepEqual(pinyinProblems("我是学生。", "Wǒ shì xuésheng."), []);
  assert.deepEqual(pinyinProblems("我不是老师。", "Wǒ bú shì lǎoshī."), [], "不 before a fourth tone");
  assert.deepEqual(pinyinProblems("一个人", "yí ge rén"), [], "一 and a neutral 个");
  assert.deepEqual(pinyinProblems("你在哪儿？", "Nǐ zài nǎr?"), [], "erhua");
  assert.ok(pinyinProblems("我是学生。", "Wǒ shí xuésheng.").length, "a wrong tone");
  assert.ok(pinyinProblems("我是学生。", "Wǒ xuésheng.").length, "a missing syllable");
  assert.ok(pinyinProblems("我很好。", "Wǒ hěn hǎo hǎo.").length, "an extra syllable");
  assert.ok(pinyinProblems("对", "dúi").length, "the mark goes on the last vowel of ui");
});
