// Run with: node --test tests/js/
// Folder challenges between friends (web/js/game/challenge.js): who may be challenged on a folder, which words go,
// how they meet the other player's own words, and how a challenge that came from another device is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGE_MAX, CHALLENGE_MIN, canChallenge, challengeWords, folderWords, isChallengeWord, readChallenge } from "../../web/js/game/challenge.js";

const word = (i, extra = {}) => ({ id: `w${i}`, text: `palabra${i}`, meaning: `word ${i}`, sentence: `Una palabra${i}.`, folders: ["f1"], notes: "secret", ...extra });

test("a folder challenge only between players studying the same language", () => {
  assert.ok(canChallenge({ language: "es" }, "es"));
  assert.ok(!canChallenge({ language: "fr" }, "es"), "another language");
  assert.ok(!canChallenge({ language: null }, "es"), "their profile doesn't say");
  assert.ok(!canChallenge({ language: "es" }, null), "I haven't picked one");
  assert.ok(!canChallenge(null, "es"));
  assert.equal(CHALLENGE_MIN, 20, "the same 20 words as a battle from one folder");
});

test("a folder's words as they travel: only the folder's, with a meaning; text, meaning and sentence, nothing else", () => {
  const vocab = [...Array.from({ length: 25 }, (_, i) => word(i)), word(99, { folders: ["f2"] }), word(98, { meaning: "" })];
  const out = folderWords(vocab, "f1");
  assert.equal(out.length, 25);
  assert.deepEqual(Object.keys(out[0]).sort(), ["meaning", "sentence", "text"], "no notes, ids or audio leave the device");
  assert.ok(!out.some((w) => w.text === "palabra99" || w.text === "palabra98"));
  const many = Array.from({ length: CHALLENGE_MAX + 40 }, (_, i) => word(i));
  assert.equal(folderWords(many, "f1").length, CHALLENGE_MAX);
});

test("a challenge battle asks the player's own copy of a word when they have it, else the word as it came", () => {
  const sent = [{ text: "Casa", meaning: "house" }, { text: "perro", meaning: "dog", sentence: "El perro." }, { text: "perro", meaning: "dog" },
    { text: "gato", meaning: "" }, { text: "", meaning: "x" }];
  const mine = [{ id: "m1", text: "casa ", meaning: "a house", folders: [] }];
  const out = challengeWords(sent, mine);
  assert.equal(out.length, 2, "repeats, and words without a meaning, are left out");
  assert.equal(out[0].id, "m1", "my own copy (whatever its case and spaces), so its progress counts");
  assert.equal(out[1].uid, "challenge:perro");
  assert.ok(out[1].challenge && isChallengeWord(out[1].uid) && !isChallengeWord("m1"));
  assert.equal(out[1].sentence, "El perro.");
});

test("a challenge from another device is checked before it is used", () => {
  const words = [{ text: "a", meaning: "b" }, { text: 5, meaning: "x" }, null];
  assert.equal(readChallenge({ folder: "Food", words }), null, "a plain shared folder is no challenge");
  const c = readChallenge({ folder: "Food".repeat(40), words, challenge: { v: 1, language: "es" } });
  assert.equal(c.folder.length, 80);
  assert.deepEqual(c.words, [{ text: "a", meaning: "b" }]);
  assert.equal(c.language, "es");
  assert.equal(readChallenge({ folder: "x", words: [], challenge: {} }), null, "no words, no challenge");
  assert.equal(readChallenge({ words, challenge: { language: 7 } }).language, "");
});
