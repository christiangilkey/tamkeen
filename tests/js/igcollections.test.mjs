// Run with: node --test tests/js/
// Saved Instagram collections shared between the phone and the computer. The cases in "two
// devices agree" are repeated for the computer's copy in tests/test_reels.py
// (test_synced_collections_merge_like_the_phones).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCollection, cleanCollections, foundCollections, mergeCollections } from "../../web/js/igcollections.js";

const EMPTY = { at: 0, items: [], chosen: "all", chosen_at: 0 };

test("anything odd becomes a tidy record", () => {
  assert.deepEqual(cleanCollections(null), EMPTY);
  assert.deepEqual(cleanCollections([1, 2]), EMPTY);
  assert.deepEqual(cleanCollections({
    at: "12.9", chosen: "17900000000000002", chosen_at: -5,
    items: [{ id: "17900000000000001", name: "  Arabic \n comedy " }, { id: "17900000000000002x" }, { id: "17900000000000001", name: "again" },
            { id: "12", name: "too short" }, "nope", { id: "17900000000000003", name: "x".repeat(90) }],
  }), {
    at: 12, chosen: "all", chosen_at: 0, // the chosen one isn't a collection that is kept
    items: [{ id: "17900000000000001", name: "Arabic comedy" }, { id: "17900000000000003", name: "x".repeat(80) }],
  });
  assert.equal(cleanCollections({ items: [{ id: "17900000000000001", name: "" }] }).items[0].name, "Collection 1");
});

test("two devices agree", () => {
  const phone = { at: 100, items: [{ id: "17900000000000001", name: "Arabic" }, { id: "17900000000000002", name: "Cooking 🍲" }],
                  chosen: "17900000000000002", chosen_at: 300 };
  const computer = { at: 200, items: [{ id: "17900000000000001", name: "Arabic" }, { id: "17900000000000003", name: "Funny" }],
                     chosen: "17900000000000003", chosen_at: 250 };
  // The computer looked last, so its list wins; the phone chose last, but its choice is gone from that list.
  const expected = { at: 200, items: computer.items, chosen: "all", chosen_at: 300 };
  assert.deepEqual(mergeCollections(phone, computer), expected);
  assert.deepEqual(mergeCollections(computer, phone), expected);
  assert.deepEqual(mergeCollections(expected, expected), expected);
  // A choice that is in the winning list stays.
  const chose = { ...phone, chosen: "17900000000000001" };
  assert.equal(mergeCollections(chose, computer).chosen, "17900000000000001");
  assert.equal(mergeCollections(computer, chose).chosen, "17900000000000001");
  // Nothing found yet on one side: the other side's list.
  assert.deepEqual(mergeCollections(EMPTY, phone), cleanCollections(phone));
  assert.deepEqual(mergeCollections(phone, undefined), cleanCollections(phone));
  // Found at the same moment: both pick the same one (emoji compared as characters, not halves).
  const a = { at: 5, items: [{ id: "17900000000000001", name: "😀" }] };
  const b = { at: 5, items: [{ id: "17900000000000001", name: "ﻻ" }] };
  assert.deepEqual(mergeCollections(a, b), mergeCollections(b, a));
  assert.equal(mergeCollections(a, b).items[0].name, "ﻻ");
});

test("finding and choosing", () => {
  let r = foundCollections(null, [{ id: "17900000000000001", name: "Arabic" }], 50);
  assert.deepEqual(r, { at: 50, items: [{ id: "17900000000000001", name: "Arabic" }], chosen: "all", chosen_at: 0 });
  r = chooseCollection(r, "17900000000000001", 60);
  assert.equal(r.chosen, "17900000000000001");
  assert.equal(r.chosen_at, 60);
  assert.equal(chooseCollection(r, "17900000000000001", 70).chosen_at, 60, "choosing it again changes nothing");
  // A new look that no longer finds the chosen collection falls back to everything saved.
  assert.equal(foundCollections(r, [], 80).chosen, "all");
});
