// The word popup's ! (Important) in place of "Not known yet", Important words yellow on the Vocab page with a filter
// (the owner, 2026-11-21: "it should be an important word marker instead of the dont know feature").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { vocabFromDefinition } from "../../web/js/languages.js";
import { plan, queue } from "../../web/js/review/deck.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the popup's ! marks a card important; on a word not saved yet it saves it, marked", () => {
  const wb = read("web/js/components/wordbubble.js");
  assert.match(wb, /data-act="important"/);
  assert.match(wb, /icon\("important", 15\)/, "an exclamation mark");
  assert.doesNotMatch(wb, /data-act="unknown"|unknownBtn|Not known yet: keep/, "Not known yet is gone from the popup");
  assert.match(wb, /await api\(`\/vocab\/\$\{shelf\.card\.id\}`, \{ method: "PATCH", body: \{ important: on \} \}\)/, "a card they have: the flag");
  assert.match(wb, /await saveCard\(\{ important: true \}\)/, "not saved yet: saved through Save's own steps, marked");
  assert.match(read("web/js/icons.js"), /important: `<path d="M12 4\.6v9\.6"\/>/);
  // the card carries the mark into POST /vocab, on the computer and on the phones and web app
  assert.equal(vocabFromDefinition({ meaning: "book", save_important: true }, "libro", "es").important, true);
  assert.equal("important" in vocabFromDefinition({ meaning: "book" }, "libro", "es"), false);
  assert.match(read("app/api/vocab.py"), /important: bool = False/);
  assert.match(read("mobile/src/js/backend.js"), /\.\.\.\(body\.important \? \{ important: 1 \} : \{\}\)/);
});

test("Not known yet is retired everywhere; the marks already made are left stored, unread", () => {
  const seen = read("web/js/lexicon/seen.js");
  assert.doesNotMatch(seen, /unknownButton|isUnknown|setUnknown|classList\.toggle\("unknown"/);
  assert.match(seen, /for \(const key of \(r && r\.keys\) \|\| \[\]\) if \(!key\.startsWith\(UNKNOWN\)\) known\.add\(key\);/,
    "an unknown| row is skipped, not deleted");
  for (const p of ["web/js/pages/player.js", "web/js/pages/reader.js", "web/js/pages/book.js", "web/js/pages/reels.js"]) {
    assert.doesNotMatch(read(p), /unknownButton/, p);
  }
  const css = read("web/css/app.css");
  assert.doesNotMatch(css, /\.w\.unknown|wb-unknown|--unknown-word/, "no amber left");
  assert.doesNotMatch(read("web/js/components/guideart.js"), /Not known yet/, "the popup's guide shows Important");
});

test("Important words are yellow on the Vocab page, with a one-tap filter that works with the folder choice", () => {
  const vocab = read("web/js/pages/vocab.js");
  assert.match(vocab, /el\.classList\.toggle\("vi-important", !!v\.important\)/);
  assert.match(vocab, /id="imp-only" aria-pressed="false"/);
  const visible = vocab.slice(vocab.indexOf("function visible()"), vocab.indexOf("// ----- the reviewer -----"));
  assert.ok(visible.indexOf("inPicks(v, st.folder)") < visible.indexOf("if (st.important) items = items.filter((v) => v.important)"),
    "the folder's words, then only the important ones");
  assert.match(vocab, /important: st\.important \}\)/, "the filter is remembered");
  const css = read("web/css/app.css");
  assert.match(css, /\.vocab-item\.vi-important \.word \{ color: var\(--important-word\); \}/);
  assert.match(css, /--important-word: #8a6500;/, "dark yellow on the light theme");
  assert.match(css, /--important-word: #ffd43b;/, "bright yellow on the dark theme");
});

test("important words come first in reviews and among new words (deck.js, 77298e72)", () => {
  const w = (uid, important, created_at) => ({ uid, text: uid, meaning: "m", important, created_at });
  const words = [w("a", 0, 3), w("b", 1, 1), w("c", 0, 2), w("d", 1, 0)];
  const cards = new Map([["a", { due: 1, learning: false }], ["b", { due: 5, learning: false }]]);
  const p = plan(words, cards, 10, 1);
  assert.deepEqual(p.due.map((v) => v.uid), ["b", "a"], "the important review first, though due later");
  assert.deepEqual(p.fresh.map((v) => v.uid), ["d"], "the day's one new word: the important one, though oldest");
  assert.equal(queue(p.due, p.fresh)[0].important, 1);
});
