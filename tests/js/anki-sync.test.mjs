// The phone's sync rules (mobile/src/js/anki-sync.js) must answer exactly as the computer's
// (app/anki_sync.py). tests/fixtures/anki_sync_parity.json is written by tests/test_anki_sync.py:
// every case there (the four routes a card can arrive by, edits, deletions, deletion safety) is
// replayed here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as sync from "../../mobile/src/js/anki-sync.js";
import { ankiFields } from "../../mobile/src/js/shared-logic.js";

const py = JSON.parse(readFileSync(new URL("../fixtures/anki_sync_parity.json", import.meta.url), "utf8"));
const plain = (x) => JSON.parse(JSON.stringify(x));

for (const c of py.cases) {
  test(`plan matches Python: ${c.name}`, () => {
    const o = c.options;
    const made = sync.plan(c.words, c.notes, c.links, ankiFields,
      { now: o.now, deletedNotes: o.deleted_notes, elsewhere: o.elsewhere, deleteOk: o.delete_ok, language: o.language });
    assert.deepEqual(plain(made), c.plan);
  });
}

test("the fixture covers the routes and the deletion-safety cases", () => {
  const names = py.cases.map((c) => c.name).join("\n");
  for (const part of ["route add-on", "route phone", "route import", "route ankiweb", "hand-made card of an existing word",
    "card missing without a record", "whole deck missing", "fresh anki is filled", "fresh tamkeen is filled"]) {
    assert.ok(names.includes(part), part);
  }
});

test("cards read back the same as in Python", () => {
  for (const p of py.parse) {
    assert.deepEqual(sync.parseCard(p.front, p.back), p.card, JSON.stringify(p.front));
    assert.deepEqual(sync.wordFromNote({ front: p.front, back: p.back }, "ar"), p.word, JSON.stringify(p.back));
  }
});

test("a hand-made note's uid is the same as in Python", () => {
  for (const [guid, uid] of py.uids) assert.equal(sync.uidFromGuid(guid), uid, guid);
});

test("progress records match Python", () => {
  for (const [args, record] of py.progress) assert.deepEqual(sync.progressRecord(...args), record);
});

test("planning does not change what it was given", () => {
  for (const c of py.cases) {
    const before = JSON.stringify([c.words, c.notes, c.links]);
    const o = c.options;
    sync.plan(c.words, c.notes, c.links, ankiFields, { now: o.now, deletedNotes: o.deleted_notes, elsewhere: o.elsewhere, deleteOk: o.delete_ok, language: o.language });
    assert.equal(JSON.stringify([c.words, c.notes, c.links]), before, c.name);
  }
});

test("deck names per language match Python", () => {
  const names = { ar: "Arabic", es: "Spanish", fr: "French" };
  for (const [stored, codes, map, problem] of py.decks) {
    assert.deepEqual(sync.deckMap(stored, codes, names), map);
    assert.equal(sync.deckProblem(map), problem);
  }
  for (const [old, counts, first] of py.firstDecks) assert.deepEqual(sync.firstDecks(old, counts), first);
});
