import { test } from "node:test";
import assert from "node:assert/strict";
import { sentenceStart } from "../../web/js/sentencestart.js";

const starts = [0, 4, 9.5, 15];

test("goes to the start of the line being heard", () => {
  assert.equal(sentenceStart(starts, 7), 4);
  assert.equal(sentenceStart(starts, 20), 15);
});

test("pressed again right after a line's start: the line before", () => {
  assert.equal(sentenceStart(starts, 4.3), 0);
  assert.equal(sentenceStart(starts, 9.5), 4);
});

test("the first line and before any line: the very start", () => {
  assert.equal(sentenceStart(starts, 0.4), 0);
  assert.equal(sentenceStart([2, 5], 1), 0);
  assert.equal(sentenceStart([], 3), 0);
});

test("between two lines: the start of the one just heard", () => {
  assert.equal(sentenceStart(starts, 14), 9.5);
});
