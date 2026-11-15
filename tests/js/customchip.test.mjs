// A number of one's own after a row of chips (web/js/review/customchip.js), and the new-words-a-day setting it feeds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampWhole } from "../../web/js/review/customchip.js";
import { NEW_MAX, cleanNewPerDay } from "../../web/js/review/deck.js";

test("a typed number is made whole and kept in range; anything else is nothing", () => {
  assert.equal(clampWhole("12", 0, 500), 12);
  assert.equal(clampWhole("12.6", 0, 500), 13);
  assert.equal(clampWhole("9999", 0, 500), 500);
  assert.equal(clampWhole("-3", 0, 500), 0);
  assert.equal(clampWhole("", 0, 500), null);
  assert.equal(clampWhole("abc", 0, 500), null);
});

test("new words a day: any whole number from 0 to the most, a chip's or one typed in", () => {
  assert.equal(NEW_MAX, 500);
  for (const n of [0, 1, 12, 20, 137, 500]) assert.equal(cleanNewPerDay(n), n);
  for (const bad of [-1, 501, 2.5, "20", null, undefined]) assert.equal(cleanNewPerDay(bad), null);
});
