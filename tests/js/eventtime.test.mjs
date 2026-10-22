// Today's review as a Google Calendar event (web/js/review/eventtime.js): the time offered, the
// event Google is given, and whether a send moves today's event or adds one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarError, clockText, defaultTime, eventAction, eventBody, patchKept } from "../../web/js/review/eventtime.js";
import { reviewTask } from "../../web/js/review/tasktext.js";

const at = (h, m) => new Date(2026, 9, 22, h, m);

test("the popup offers last time's choice while it is still ahead, otherwise the next quarter hour", () => {
  assert.equal(defaultTime(at(18, 5), "19:30"), "19:30");
  assert.equal(defaultTime(at(19, 30), "19:30"), "19:45"); // now: no longer ahead
  assert.equal(defaultTime(at(20, 10), "19:30"), "20:15");
  assert.equal(defaultTime(at(20, 0), ""), "20:15");
  assert.equal(defaultTime(at(20, 14), "nonsense"), "20:15");
  assert.equal(defaultTime(at(23, 50), ""), "23:45"); // still today
});

test("the event starts at the chosen time, in the device's time zone, for the estimated minutes", () => {
  const task = reviewTask({ revLeft: 12, newLeft: 3 }, { ms: 6 * 60000 }, at(9, 0));
  const e = eventBody(task, "19:30", "Europe/London");
  assert.equal(e.summary, "Tamkeen review (6 min)");
  assert.match(e.description, /^12 reviews and 3 new words left today/);
  assert.deepEqual(e.start, { dateTime: "2026-10-22T19:30:00", timeZone: "Europe/London" });
  assert.deepEqual(e.end, { dateTime: "2026-10-22T19:36:00", timeZone: "Europe/London" });
  assert.equal(e.extendedProperties.private.tamkeen, "tamkeen-review-2026-10-22");
  // Late in the evening it ends the next day (the end of a month too).
  const late = eventBody({ ...task, due: "2026-10-31", minutes: 30 }, "23:45", "America/New_York");
  assert.deepEqual(late.end, { dateTime: "2026-11-01T00:15:00", timeZone: "America/New_York" });
  assert.throws(() => eventBody(task, "7pm", "UTC"));
  assert.throws(() => eventBody({ ...task, due: "" }, "19:30", "UTC"));
  assert.equal(eventBody(task, "08:00", "").start.timeZone, "UTC");
});

test("sending again the same day moves that day's event; another day, or none kept, adds one", () => {
  assert.deepEqual(eventAction({ day: "2026-10-22", id: "e1" }, "2026-10-22"), { method: "PATCH", id: "e1" });
  assert.deepEqual(eventAction({ day: "2026-10-21", id: "e1" }, "2026-10-22"), { method: "POST" });
  assert.deepEqual(eventAction({}, "2026-10-22"), { method: "POST" });
  assert.deepEqual(eventAction(undefined, "2026-10-22"), { method: "POST" });
  assert.ok(patchKept(200, { id: "e1", status: "confirmed" }));
  assert.ok(!patchKept(200, { id: "e1", status: "cancelled" })); // deleted in Google Calendar: add a new one
  assert.ok(!patchKept(404, null));
  assert.ok(!patchKept(410, null));
});

test("Google's refusals in words", () => {
  assert.match(calendarError(403, "Google Calendar API has not been used in project 1 before or it is disabled"), /isn't switched on/);
  assert.match(calendarError(403, "Request had insufficient authentication scopes."), /wasn't allowed/);
  assert.match(calendarError(500, ""), /\(500\)/);
});

test("the time in words", () => {
  assert.equal(clockText("19:30", "en-US"), "7:30 pm");
  assert.equal(clockText("07:05", "en-US"), "7:05 am");
  assert.equal(clockText("19:30", "de-DE"), "19:30");
});
