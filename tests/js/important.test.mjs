// Words marked important come first: in a session's reviews and among the day's new words (web/js/review/deck.js),
// can be found with is:important (review/vocabsearch.js), and are marked from a word's tools or the ticked words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plan, queue } from "../../web/js/review/deck.js";
import { matches, parseQuery } from "../../web/js/review/vocabsearch.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const word = (uid, extra = {}) => ({ uid, text: uid, meaning: "m", created_at: 1, ...extra });
const card = (due, learning = false) => ({ due, learning, known: true });

test("important due words are reviewed first", () => {
  const words = [word("a"), word("b", { important: 1 }), word("c"), word("d", { important: 1 })];
  const cards = new Map([["a", card(1)], ["b", card(5)], ["c", card(2, true)], ["d", card(3)]]);
  const p = plan(words, cards, 10, 0);
  assert.deepEqual(p.due.map((v) => v.uid), ["d", "b", "c", "a"], "important (longest due first), then the rest as before");
});

test("important new words are let in first, whatever their age", () => {
  const words = [word("old", { created_at: 1, important: 1 }), word("new1", { created_at: 9 }), word("new2", { created_at: 8 }),
    word("old2", { created_at: 2, important: true })];
  const p = plan(words, new Map(), 10, 2);
  assert.deepEqual(p.fresh.map((v) => v.uid), ["old2", "old"]);
  assert.equal(p.waiting, 4);
});

test("a session starts with the important words, new and due, then the rest spread as before", () => {
  const due = [word("D1", { important: 1 }), word("d2"), word("d3")];
  const fresh = [word("N1", { important: 1 }), word("n2")];
  const order = queue(due, fresh).map((v) => v.uid);
  assert.deepEqual(order.slice(0, 2).sort(), ["D1", "N1"]);
  assert.equal(order.length, 5);
  assert.deepEqual(queue([word("x"), word("y")], [word("z")]).map((v) => v.uid), ["x", "y", "z"], "no important words: as before");
});

test("is:important finds the marked words, -is:important the others", () => {
  const ctx = { cards: new Map(), today: 10 };
  const marked = word("a", { important: 1 }), plain = word("b");
  const { filters } = parseQuery("is:important");
  assert.equal(matches(marked, filters, ctx), true);
  assert.equal(matches(plain, filters, ctx), false);
  assert.equal(matches(plain, parseQuery("-is:important").filters, ctx), true);
});

test("the mark is a word tool (on the list and on a review card), a ticked-words button, and stored everywhere", () => {
  const tools = read("web/js/components/wordtools.js");
  assert.match(tools, /id === "important" \? toggleImportant\(b\) : openTool\(id\)/);
  assert.match(tools, /save\(\{ important: on \}\)/);
  const vocab = read("web/js/pages/vocab.js");
  assert.match(vocab, /id="bulk-important"/);
  assert.match(vocab, /body: \{ important: on \}/);
  assert.match(vocab, /class="vi-imp"/);
  assert.match(read("mobile/src/js/backend.js"), /if \(typeof body\.important === "boolean"\) v\.important = body\.important \? 1 : 0;/);
  assert.match(read("mobile/src/js/sync.js"), /important: r\.important \?\? l\.important \?\? 0/);
  assert.match(read("app/api/vocab.py"), /important: bool \| None = None/);
});
