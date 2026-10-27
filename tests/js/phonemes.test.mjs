// The Mnemonic maker's sound check (web/js/review/phonemes.js): how pronunciations are read, how far
// apart two sounds are, and an evaluation set of keyword-method pairs across the app's languages (good
// keywords, many from published keyword-method examples, must pass; translations and near-misses must not).
// The English keywords' sounds come from the CMU Pronouncing Dictionary in the app's own English word
// table, as on the review card for English speakers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CLOSE, PASS, dropCost, letterPhones, match, phones, similarity, soundGap, soundLabel, wordSounds } from "../../web/js/review/phonemes.js";

const table = JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/en-lemmas.json.gz", import.meta.url))));
/** An English keyword's US pronunciation, word by word, from the CMU dictionary. */
const cmu = (phrase) => phrase.split(" ").map((w) => {
  const ipa = table.ipa[w];
  assert.ok(ipa, `"${w}" is in the CMU table`);
  return ipa;
}).join(" ");
const said = (ps) => ps.map((p) => p.s + (p.long ? "ː" : "")).join(" ");

test("IPA is read into sounds: stress, long sounds, glides, affricates, nasal vowels, marks that change nothing", () => {
  assert.equal(said(phones("ˈkæb")), "k æ b");
  assert.equal(said(phones("/ˈaɪ/")), "a j", "aɪ is a vowel and a glide");
  const tow = phones("ˈtoʊ");
  assert.equal(said(tow), "t o w");
  assert.equal(tow[2].weak, true, "the w of English oʊ is faint");
  assert.equal(said(phones("nijja")), "n i jː a", "a doubled letter is one long sound");
  assert.equal(said(phones("kitaːb")), "k i t aː b");
  assert.equal(said(phones("t͡ʃɛlo")), "tʃ ɛ l o");
  assert.equal(said(phones("ˈtʃɛloʊ")), "tʃ ɛ l o w");
  assert.equal(said(phones("kæts")), "k æ t s", "ts without a tie bar is two sounds");
  assert.equal(said(phones("t͡sar")), "ts a r");
  assert.equal(said(phones("sɔ̃")), "s ɔ n", "a nasal vowel ends in a faint n");
  assert.equal(said(phones("tˤaːʔir")), "t aː ʔ i r", "emphasis (ˤ) changes nothing here");
  assert.equal(said(phones("ˈmɑ˧˥")), "m ɑ", "tone letters are dropped");
  assert.equal(said(phones("ˈhæzɚd")), "h æ z ə ɹ d", "ɚ is a vowel and an r");
  assert.equal(said(phones("aɪ ˈjoʊ")), "a jː o w", "a sound ending one word and starting the next is said once");
  assert.equal(phones("ˈkɑɹt")[0].stress, true);
  assert.deepEqual(phones(""), []);
  assert.equal(said(letterPhones("shmetter")), "ʃ m e tː e r", "a romanization read roughly as letters (tt is one long t)");
  assert.equal(said(letterPhones("kitāb")), "k i t aː b", "ā is a long a");
});

test("close sounds are near, far ones far", () => {
  const p = (x) => phones(x)[0];
  for (const [a, b] of [["p", "b"], ["t", "d"], ["k", "ɡ"], ["s", "z"], ["s", "θ"], ["f", "v"], ["r", "ɹ"], ["ɾ", "ʁ"], ["q", "k"], ["h", "ħ"]]) {
    assert.ok(soundGap(p(a), p(b)) <= 0.2, `${a}/${b} are close: ${soundGap(p(a), p(b))}`);
  }
  assert.ok(soundGap(phones("aː")[0], p("a")) < 0.1, "a long vowel is close to its short one");
  assert.ok(soundGap(p("e"), p("ɛ")) < soundGap(p("e"), p("a")), "vowels by height");
  assert.ok(soundGap(p("i"), p("u")) < soundGap(p("i"), p("ɑ")), "and backness");
  for (const [a, b] of [["p", "s"], ["m", "k"], ["l", "ɡ"], ["i", "ɑ"], ["j", "w"]]) {
    assert.ok(soundGap(p(a), p(b)) >= 0.45, `${a}/${b} are far apart: ${soundGap(p(a), p(b))}`);
  }
  assert.equal(soundGap(p("a"), p("t")), 1, "a vowel is nothing like a consonant");
  assert.ok(dropCost(p("ə")) < dropCost(p("a")), "a schwa can go with less lost than a full vowel");
  assert.ok(dropCost(p("ʔ")) < dropCost(p("t")), "so can a glottal stop or an h");
  assert.equal(similarity(phones("kæt"), phones("kæt")), 1);
  assert.equal(similarity([], phones("kæt")), 0);
});

test("a keyword that sounds like part of a word scores less than one for all of it, and says which part", () => {
  const word = wordSounds([{ text: "pa", ipa: "pa" }, { text: "ja", ipa: "ja" }, { text: "so", ipa: "so" }], 1);
  const part = match(phones(cmu("pie")), word);
  const whole = match(phones(cmu("pie a so")), word);
  assert.deepEqual([part.from, part.to], [0, 1]);
  assert.deepEqual([whole.from, whole.to], [0, 2]);
  assert.ok(whole.score > part.score);
  assert.ok(part.coverage < 1 && whole.coverage === 1);
  // A doubled consonant split between two syllables is one long sound (nij|ja).
  const niyya = wordSounds([{ text: "niy", ipa: "nij" }, { text: "ya", ipa: "ja" }], 0);
  assert.equal(said(niyya.syllables.flat()), "n i jː a");
  // "knee" sounds just like the stressed first syllable: a good keyword, but only a partial match.
  const knee = match(phones(cmu("knee")), niyya);
  assert.ok(knee.score >= CLOSE && knee.coverage < 1);
  assert.equal(soundLabel(knee.score, knee.coverage), "partial");
  assert.equal(soundLabel(match(phones(cmu("knee yeah")), niyya).score), "close");
  // Without IPA a syllable's letters are read.
  assert.ok(wordSounds([{ text: "sa" }, { text: "ka" }, { text: "na" }], 1).syllables.length === 3);
  assert.equal(wordSounds([], 0), null);
  assert.equal(wordSounds([{ text: "pa", ipa: "pa" }], 7).stress, -1, "a stress outside the word marks none");
});

// [word (language, meaning), its syllables in IPA, stressed syllable, good English keywords, bad ones]
const EVALUATION = [
  ["Ente (de, duck)", ["ɛn", "tə"], 0, ["ant", "enter"], ["duck", "bird"]],
  ["ganz (de, whole)", ["ɡanʦ"], 0, ["guns"], ["goose"]],
  ["Schmetterling (de, butterfly)", ["ʃmɛ", "tɐ", "lɪŋ"], 0, ["shatter ling"], ["butterfly"]],
  ["caballo (es, horse)", ["ka", "βa", "ʎo"], 1, ["cab eye yo"], ["horse", "pony"]],
  ["pato (es, duck)", ["pa", "to"], 0, ["pot"], ["duck"]],
  ["carta (es, letter)", ["kaɾ", "ta"], 0, ["cart"], ["letter"]],
  ["payaso (es, clown)", ["pa", "ja", "so"], 1, ["pie a so"], ["clown"]],
  ["hérisson (fr, hedgehog)", ["e", "ʁi", "sɔ̃"], 2, ["hairy son"], ["hedgehog"]],
  ["poubelle (fr, bin)", ["pu", "bɛl"], 1, ["poo bell"], ["garbage"]],
  ["uccello (it, bird)", ["ut", "tʃɛl", "lo"], 1, ["cello"], ["bird"]],
  ["gatto (it, cat)", ["ɡat", "to"], 0, ["got toe"], ["kitten"]],
  ["sapato (pt, shoe)", ["sa", "pa", "tu"], 1, ["sap a two"], ["shoe"]],
  ["gos (ca, dog)", ["ɡɔs"], 0, ["gauze"], ["bark"]],
  ["neko (ja, cat)", ["ne", "ko"], 0, ["neck oh"], ["kitten"]],
  ["tori (ja, bird)", ["to", "ɾi"], 0, ["tory"], ["feather"]],
  ["kuruma (ja, car)", ["ku", "ɾu", "ma"], 0, ["crew ma"], ["car"]],
  ["māo (zh, cat)", ["mau"], 0, ["meow"], ["dog"]],
  ["shū (zh, book)", ["ʂu"], 0, ["shoe"], ["book"]],
  ["mul (ko, water)", ["mul"], 0, ["mule"], ["water"]],
  ["goyangi (ko, cat)", ["ɡo", "jaŋ", "i"], 1, ["go young e"], ["cat"]],
  ["kot (ru, cat)", ["kot"], 0, ["coat"], ["tree"]],
  ["sobaka (ru, dog)", ["sɐ", "ba", "kə"], 1, ["sob a car"], ["dog"]],
  ["pani (hi, water)", ["paː", "niː"], 0, ["pa knee"], ["drink"]],
  ["gaay (hi, cow)", ["ɡaːj"], 0, ["guy"], ["milk"]],
  ["maew (th, cat)", ["mɛːw"], 0, ["mare oh"], ["dog"]],
  ["naam (th, water)", ["naːm"], 0, ["numb"], ["water"]],
  ["sag (fa, dog)", ["sæɡ"], 0, ["sack"], ["bone"]],
  ["dast (fa, hand)", ["dæst"], 0, ["dust"], ["hand"]],
  ["aso (tl, dog)", ["a", "so"], 0, ["a sew"], ["pet"]],
  ["bahay (tl, house)", ["ba", "haj"], 1, ["buy hi"], ["house"]],
  ["tubig (tl, water)", ["tu", "biɡ"], 1, ["too big"], ["water"]],
  ["balay (ceb, house)", ["ba", "laj"], 1, ["ballet"], ["roof"]],
  ["نِيَّة niyya (ar MSA, intention)", ["nij", "ja"], 0, ["knee yeah"], ["intention", "now yeah"]],
  ["كِتَاب kitaab (ar MSA, book)", ["ki", "taːb"], 1, ["key tab"], ["book"]],
  ["قَلَم qalam (ar MSA, pen)", ["qa", "lam"], 0, ["call am"], ["pen"]],
  ["عربية ʕarabiyya (ar Egyptian, car)", ["ʕa", "ra", "bij", "ja"], 2, ["are a bee ya"], ["car", "rabbit"]],
  ["هون hoon (ar Levantine, here)", ["hoːn"], 0, ["hone"], ["here"]],
  ["وايد waayid (ar Gulf, a lot)", ["waː", "jid"], 0, ["why it"], ["many"]],
];
// The ones the learner should see marked "Close match".
const CLOSE_ONES = new Set(["ant", "guns", "poo bell", "go young e", "coat", "guy", "shoe", "dust", "too big", "knee yeah", "key tab", "hone", "why it"]);

test("the evaluation set: good keywords pass the sound check, bad ones don't", () => {
  const good = [], bad = [];
  for (const [name, syllables, stress, keep, drop] of EVALUATION) {
    const word = wordSounds(syllables.map((ipa) => ({ text: ipa, ipa })), stress);
    for (const k of keep) {
      const { score, coverage } = match(phones(cmu(k)), word);
      good.push(score);
      assert.ok(score >= PASS, `${name}: "${k}" should pass (${score.toFixed(2)})`);
      if (CLOSE_ONES.has(k)) assert.equal(soundLabel(score, coverage), "close", `${name}: "${k}" is a close match (${score.toFixed(2)})`);
    }
    for (const k of drop) {
      const { score } = match(phones(cmu(k)), word);
      bad.push(score);
      assert.ok(score < PASS, `${name}: "${k}" should fail (${score.toFixed(2)})`);
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(EVALUATION.length >= 30, "about 30 words");
  assert.ok(mean(good) >= 0.75 && mean(bad) <= 0.25, `good ${mean(good).toFixed(2)}, bad ${mean(bad).toFixed(2)}`);
  assert.ok(CLOSE > PASS);
});
