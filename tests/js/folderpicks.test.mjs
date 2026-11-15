// Several vocab folders at once: the Vocab page's Folders popup and battles' "Battle words from a folder"
// (web/js/review/folderpicks.js, vocabedit.js folderCount, game/rules.js setWords / battlePicks).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NONE, firstFolder, hasFolder, inPicks, livePicks, pickKey, pickList, picksName, togglePick } from "../../web/js/review/folderpicks.js";
import { folderCount } from "../../web/js/review/vocabedit.js";
import { MIN_SET, battlePicks, battleWords, battleWordsFor, newState, normalize, setBattlePicks, setWords } from "../../web/js/game/rules.js";

const word = (uid, folders, n = 0) => ({ uid, text: `w${uid}`, meaning: `m${uid}`, folders, created_at: 1000 + n });

test("a key and a list of picks", () => {
  assert.deepEqual(pickList(""), []);
  assert.deepEqual(pickList("a"), ["a"], "One folder is stored just as before");
  assert.deepEqual(pickList("a,b,a, ,none"), ["a", "b", "none"]);
  assert.deepEqual(pickList(["a", 5, "", "b"]), ["a", "b"], "Only strings count");
  assert.deepEqual(pickList(["x".repeat(65)]), []);
  assert.equal(pickList(Array.from({ length: 80 }, (_, i) => `f${i}`)).length, 50);
  assert.equal(pickKey(["b", "a", "b"]), "b,a");
});

test("which words the picks show", () => {
  const free = word("1", []), a = word("2", ["a"]), ab = word("3", ["a", "b"]), c = word("4", ["c"]);
  const words = [free, a, ab, c];
  assert.ok(inPicks(c, ""), "Nothing picked: every word");
  assert.deepEqual(words.filter((v) => inPicks(v, "none")), [free]);
  assert.deepEqual(words.filter((v) => inPicks(v, "a,b")), [a, ab], "A word in two picked folders shows once");
  assert.deepEqual(words.filter((v) => inPicks(v, "c,none")), [free, c], "Not in a folder can be one of the picks");
  assert.ok(inPicks({ uid: "9" }, "none"), "A word with no folders list is in no folder");
  assert.equal(folderCount(words, ""), 4);
  assert.equal(folderCount(words, "a"), 2);
  assert.equal(folderCount(words, "none"), 1);
  assert.equal(folderCount(words, "b,c,none"), 3);
});

test("ticking, the folders still there, and names", () => {
  assert.equal(togglePick("", "a"), "a");
  assert.equal(togglePick("a", "b"), "a,b");
  assert.equal(togglePick("a,b", "a"), "b");
  assert.equal(togglePick("b", "b"), "", "The last one off: every word again");
  assert.equal(togglePick("a,b", ""), "", "All words clears the picks");
  const folders = [{ uid: "a", name: "Greetings" }, { uid: "b", name: "Food" }];
  assert.equal(livePicks("a,gone,none,b", folders), "a,none,b", "A deleted folder (or another language's) drops out");
  assert.equal(firstFolder("none,b,a"), "b");
  assert.equal(firstFolder("none"), "");
  assert.ok(hasFolder("none,a") && !hasFolder("none") && !hasFolder(""));
  const nameOf = (uid) => (folders.find((f) => f.uid === uid) || {}).name;
  assert.equal(picksName("a,none,b", nameOf), "Greetings, Not in a folder, Food");
  assert.equal(picksName("a,gone", nameOf), "Greetings");
});

test("battles: several folders' words together reach the minimum", () => {
  const vocab = [];
  for (let i = 0; i < 12; i++) vocab.push(word(`a${i}`, ["a"], i));
  for (let i = 0; i < 6; i++) vocab.push(word(`b${i}`, ["b"], 20 + i));
  for (let i = 0; i < 5; i++) vocab.push(word(`n${i}`, [], 40 + i));
  vocab.push(word("ab", ["a", "b"], 60));
  assert.equal(setWords(vocab, "folder", { folder: "a" }).length, 13, "One folder (a uid) works as before");
  assert.equal(setWords(vocab, "folder", { folder: ["a", "b"] }).length, 19, "The word in both counts once");
  assert.equal(setWords(vocab, "folder", { folder: [NONE] }).length, 5);
  const three = setWords(vocab, "folder", { folder: ["a", "b", NONE] });
  assert.equal(three.length, 24);
  assert.ok(three.length >= MIN_SET);
  assert.deepEqual(battleWords(vocab, "folder", { folder: ["a", "b", NONE] }), three, "Enough together: the battle asks them");
  assert.equal(battleWords(vocab, "folder", { folder: ["a", "b"] }).length, 24, "19 < 20: the newest words instead");
});

test("battles: the picks are kept so older versions still read one folder", () => {
  const s = newState(1);
  assert.deepEqual(battlePicks(s), []);
  setBattlePicks(s, ["b", "none", "b"]);
  assert.deepEqual(s.battleFolders, ["b", "none"]);
  assert.equal(s.battleFolder, "b", "An older version reads the first folder picked");
  assert.deepEqual(battlePicks(s), ["b", "none"]);
  // An older version changed the one folder it knows: that one counts.
  s.battleFolder = "c";
  assert.deepEqual(battlePicks(s), ["c"]);
  // A save from before (one folder, no list) still works.
  assert.deepEqual(battlePicks({ battleFolder: "a" }), ["a"]);
  // Cleaned on loading: only strings, each once.
  const loaded = normalize({ ...newState(2), battleFolder: "a", battleFolders: ["a", 7, "a", "x".repeat(70), "b"] });
  assert.deepEqual(loaded.battleFolders, ["a", "b"]);
  assert.deepEqual(normalize({ ...newState(3), battleFolders: "nonsense" }).battleFolders, []);
  const vocab = [word("1", ["a"]), word("2", [])];
  s.battleMode = "folder";
  setBattlePicks(s, ["a", "none"]);
  assert.equal(battleWordsFor(vocab, s).length, 2);
});

test("the phone's library and the battle popup use the shared rule", () => {
  const backend = readFileSync(new URL("../../mobile/src/js/backend.js", import.meta.url), "utf8");
  assert.match(backend, /pickList\(q\.getAll\("folder"\)/);
  const ui = readFileSync(new URL("../../web/js/game/battle-ui.js", import.meta.url), "utf8");
  assert.match(ui, /row\(NONE, "Not in a folder"/, "Not in a folder is a battle choice");
  assert.match(ui, /t\("\{0\} of \{1\} words", fmt\(n\), fmt\(MIN_SET\)\)/, "The combined count is shown live");
});
