// Searching the Vocab list with folder:, is: and dates (web/js/review/vocabsearch.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGAIN, GOOD, dayNumber } from "../../web/js/review/fsrs.js";
import { states } from "../../web/js/review/deck.js";
import { answerDays, answerSeconds, dateRange, dateValue, dayIso, fuzzy, insertFilter, matches, parseQuery, trigger } from "../../web/js/review/vocabsearch.js";

test("the search box is taken apart into words and filters", () => {
  assert.deepEqual(parseQuery(`كتاب folder:"Chapter 2" -is:new reviewed:7 note: http://x.y`), {
    text: "كتاب note: http://x.y",
    filters: [{ op: "folder", value: "Chapter 2", not: false }, { op: "is", value: "new", not: true }, { op: "reviewed", value: "7", not: false }],
  });
  assert.deepEqual(parseQuery("FOLDER:Verbs"), { text: "", filters: [{ op: "folder", value: "Verbs", not: false }] });
  assert.deepEqual(parseQuery("folder:"), { text: "", filters: [] });  // nothing after it yet: no filter
});

test("dates: a number of days, a day, or a range with either side open", () => {
  const today = 20400;
  assert.deepEqual(dateRange("7", today), [20394, 20400]);
  assert.deepEqual(dateRange("1", today), [20400, 20400]);
  const d = dateRange("2026-04-15", today);
  assert.equal(dayIso(d[0]), "2026-04-15");
  assert.equal(d[0], d[1]);
  const r = dateRange("2026-04-15..2026-04-19", today);
  assert.equal(r[1] - r[0], 4);
  assert.deepEqual(dateRange("..2026-04-19", today), [null, r[1]]);
  assert.deepEqual(dateRange("2026-04-15..", today), [r[0], null]);
  assert.equal(dateRange("soon", today), null);
  assert.equal(dateRange("..", today), null);
  assert.equal(dateValue("2026-04-15", "2026-04-19"), "2026-04-15..2026-04-19");
  assert.equal(dateValue("2026-04-15", "2026-04-15"), "2026-04-15");
  assert.equal(dateValue("", "2026-04-19"), "..2026-04-19");
  assert.equal(dateValue("", ""), "");
});

test("each filter narrows the list, and a '-' turns it round", () => {
  const today = dayNumber();
  const at = (day) => (day * 86400000 + new Date(day * 86400000).getTimezoneOffset() * 60000 + 12 * 3600000) / 1000;  // noon, local
  const words = [
    { uid: "a", folders: ["f1"], created_at: at(today - 40), updated_at: at(today - 1) },
    { uid: "b", folders: [], created_at: at(today - 2), updated_at: at(today - 2) },
    { uid: "c", folders: ["f2"], created_at: at(today - 10), updated_at: at(today - 10) },
  ];
  const log = {
    a: [[1, AGAIN, today - 30, 1], [2, GOOD, today - 29, 1], [3, GOOD, today - 3, 1]],  // learned 29 days ago, due in a while
    c: [[4, AGAIN, today, 1]],                                                         // missed today: due (to be remembered)
  };
  const ctx = { folders: [{ uid: "f1", name: "Verbs" }, { uid: "f2", name: "Chapter 2" }], cards: states(log), days: answerDays(log), today };
  const pick = (q) => words.filter((v) => matches(v, parseQuery(q).filters, ctx)).map((v) => v.uid).join("");
  assert.equal(pick("folder:verbs"), "a");
  assert.equal(pick(`folder:"Chapter 2"`), "c");
  assert.equal(pick("folder:none"), "b");
  assert.equal(pick("-folder:none"), "ac");
  assert.equal(pick("folder:Nouns"), "");  // a folder that isn't there shows nothing, not everything
  assert.equal(pick("is:new"), "b");
  assert.equal(pick("is:due"), "c");
  assert.equal(pick("is:learned"), "a");
  assert.equal(pick("added:7"), "b");
  assert.equal(pick("added:30"), "bc");
  assert.equal(pick("edited:1"), "");
  assert.equal(pick("edited:2"), "a");
  assert.equal(pick("edited:3"), "ab");
  assert.equal(pick("reviewed:1"), "c");
  assert.equal(pick("reviewed:7"), "ac");
  assert.equal(pick("learned:7"), "");
  assert.equal(pick(`learned:${dayIso(today - 29)}`), "a");
  assert.equal(pick("reviewed:7 -is:due"), "a");
  assert.equal(pick("added:someday"), "");
  assert.deepEqual(answerSeconds(log.a, "learned"), [0.002]);
  assert.deepEqual(answerSeconds(log.a, "reviewed"), [0.001, 0.002, 0.003]);
});

test("the picker's filter: every piece, in any order; ~ leaves out", () => {
  assert.equal(fuzzy("b c o", "Vocabulary"), true);
  assert.equal(fuzzy("b c x", "Vocabulary"), false);
  assert.equal(fuzzy("VOCA", "vocabulary"), true);
  assert.equal(fuzzy("", "anything"), true);
  assert.equal(fuzzy("chap ~semester", "DLI Arabic · Chapter 2"), true);
  assert.equal(fuzzy("dli ~arabic", "DLI Arabic · Chapter 2"), false);
  assert.equal(fuzzy("hyper ~pul", "pulmonary hypertension"), false);
});

test("a picker opens when a filter word has just been typed, and the pick goes in its place", () => {
  assert.deepEqual(trigger("cat folder:"), { op: "folder", start: 4, end: 11, not: false });
  assert.deepEqual(trigger("-is:"), { op: "is", start: 0, end: 4, not: true });
  assert.equal(trigger("folder:Ve"), null);
  assert.equal(trigger("note:"), null);
  assert.equal(trigger("afolder:"), null);
  const t = trigger("cat folder: dog", 11);
  assert.deepEqual(insertFilter("cat folder: dog", t, "Chapter 2"), { text: `cat folder:"Chapter 2" dog`, caret: 23 });
  assert.deepEqual(insertFilter("-is:", trigger("-is:"), "due"), { text: "-is:due ", caret: 8 });
});
