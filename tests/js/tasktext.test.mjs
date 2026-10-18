// Today's review as a to-do (web/js/review/tasktext.js): what Google Tasks and Onyx are given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { onyxLink, reviewTask } from "../../web/js/review/tasktext.js";

const day = new Date(2026, 9, 18, 9, 30);

test("the task says what is left and how long it should take, for today", () => {
  const task = reviewTask({ revLeft: 42, newLeft: 10 }, { ms: 18 * 60000 }, day);
  assert.equal(task.title, "Tamkeen review (20 min)"); // 18 min, rounded the way people say it
  assert.equal(task.minutes, 20);
  assert.equal(task.due, "2026-10-18");
  assert.equal(task.id, "tamkeen-review-2026-10-18");
  assert.match(task.notes, /^42 reviews and 10 new words left today/);
  assert.equal(reviewTask({ revLeft: 1, newLeft: 0 }, { ms: 20000 }, day).title, "Tamkeen review (1 min)");
});

test("the Onyx link carries the task", () => {
  const link = onyxLink(reviewTask({ revLeft: 3, newLeft: 0 }, { ms: 5 * 60000 }, day), 1792345000000);
  assert.ok(link.startsWith("onyx://task?"));
  const q = new URL(link.replace("onyx://", "https://x/")).searchParams;
  assert.equal(q.get("title"), "Tamkeen review (5 min)");
  assert.equal(q.get("minutes"), "5");
  assert.equal(q.get("due"), "2026-10-18");
  assert.equal(q.get("from"), "tamkeen");
  assert.equal(q.get("id"), "tamkeen-review-2026-10-18");
  assert.equal(q.get("n"), "1792345000000"); // each send counts as new on Android
});
