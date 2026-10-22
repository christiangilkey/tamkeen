// When to sync, flushing on hide, ignoring one's own nudge, the check interval (web/js/syncpace.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_HIDDEN_MS, CHECK_VISIBLE_MS, FULL_EVERY_MS, RETURN_GAP_MS, SyncTimer, canSkip, checkEvery, checkOnReturn,
  earliestDue, hashText, libraryFingerprint, nudgeChannel, nudgeFromOther, nudgeKey, nudgePayload, refreshMessage, runId,
  shouldRedraw,
} from "../../web/js/syncpace.js";

function fakeClock() {
  let now = 1000;
  let next = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (f, ms) => { const id = next++; timers.set(id, { f, at: now + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) { timers.delete(id); t.f(); }
      }
    },
    count: () => timers.size,
  };
}

test("check every minute on screen; 5 minutes put away in the apps; never from a hidden web page", () => {
  assert.equal(checkEvery({ visible: true }), CHECK_VISIBLE_MS);
  assert.equal(checkEvery({ visible: true, web: true }), 60 * 1000);
  assert.equal(checkEvery({ visible: false }), CHECK_HIDDEN_MS);
  assert.equal(checkEvery({ visible: false, web: false }), 5 * 60 * 1000);
  assert.equal(checkEvery({ visible: false, web: true }), 0);
});

test("a later, longer request never pushes back a sooner one", () => {
  assert.equal(earliestDue(0, 100, 20000), 20100);
  assert.equal(earliestDue(20100, 5000, 90000), 20100); // the game's 90 s after a review answer's 20 s
  assert.equal(earliestDue(20100, 5000, 0), 5000);      // "now" wins
  assert.equal(earliestDue(20100, 5000, -5), 5000);
});

test("SyncTimer runs once when due, keeps the sooner time, and flushes on hide", () => {
  const clock = fakeClock();
  let runs = 0;
  const t = new SyncTimer(() => runs++, clock);
  assert.equal(t.pending, false);
  assert.equal(t.flush(), false, "nothing waiting: nothing to flush");
  t.request(20000);
  clock.advance(5000);
  t.request(90000); // a game save during the review
  assert.equal(t.pending, true);
  clock.advance(15000);
  assert.equal(runs, 1, "ran at the review's 20 s, not the game's 90 s");
  assert.equal(t.pending, false);
  assert.equal(clock.count(), 0);
  // Put away before it is due: sent at once, and not again later.
  t.request(20000);
  assert.equal(t.flush(), true);
  assert.equal(runs, 2);
  clock.advance(60000);
  assert.equal(runs, 2);
  // A sooner request replaces a later one.
  t.request(90000);
  t.request(1000);
  clock.advance(1000);
  assert.equal(runs, 3);
  assert.equal(clock.count(), 0);
  // cancel: a sync that started anyway takes the change with it
  t.request(5000);
  t.cancel();
  clock.advance(10000);
  assert.equal(runs, 3);
});

test("coming back checks at once, but not twice within a few seconds", () => {
  assert.equal(checkOnReturn(0, 5000), true);
  assert.equal(checkOnReturn(1000, 1000 + RETURN_GAP_MS - 1), false);
  assert.equal(checkOnReturn(1000, 1000 + RETURN_GAP_MS), true);
});

test("the cheap check: only when Drive's library and this one are both unchanged", () => {
  const meta = { id: "lib1", modifiedTime: "2026-10-22T10:00:00Z", size: "1234", md5Checksum: "abc" };
  const fp = libraryFingerprint(meta);
  assert.equal(libraryFingerprint(null), "");
  assert.notEqual(libraryFingerprint({ ...meta, modifiedTime: "2026-10-22T10:01:00Z" }), fp);
  const h = hashText("library content");
  const memo = { fp, hash: h, complete: true, fullAt: 0 };
  const now = 10 * 60 * 1000;
  assert.equal(canSkip(memo, fp, h, now), true);
  assert.equal(canSkip(null, fp, h, now), false, "first sync of this run: read it all");
  assert.equal(canSkip(memo, libraryFingerprint({ ...meta, md5Checksum: "def" }), h, now), false, "another device wrote");
  assert.equal(canSkip(memo, fp, hashText("library content!"), now), false, "a change here");
  assert.equal(canSkip({ ...memo, complete: false }, fp, h, now), false, "a transcript still to fetch");
  assert.equal(canSkip(memo, fp, h, FULL_EVERY_MS + 1), false, "read in full every 15 minutes anyway");
  assert.equal(canSkip(memo, "", h, now), false, "no library in Drive yet");
});

test("hashText is stable and tells texts apart", () => {
  assert.equal(hashText("abc"), hashText("abc"));
  assert.notEqual(hashText("abc"), hashText("abd"));
  assert.notEqual(hashText(""), hashText(" "));
});

test("the nudge key is the same as the computer's (app/sync nudge_key)", async () => {
  assert.equal(await nudgeKey("1AbCdEfGhIjKlMnOpQrStUvWxYz012345"), "47378edb89ce41282d6e8ccb44359cfc");
  assert.equal(await nudgeKey(""), "");
});

test("the nudge channel needs both the Friends id and a well-formed key", () => {
  const key = "47378edb89ce41282d6e8ccb44359cfc";
  assert.equal(nudgeChannel("user-1", key), `sync:user-1:${key}`);
  assert.equal(nudgeChannel("", key), "");
  assert.equal(nudgeChannel("user-1", ""), "");
  assert.equal(nudgeChannel("user-1", "not-a-key"), "");
});

test("a device ignores its own nudge and anything malformed", () => {
  const me = runId();
  const other = runId();
  assert.match(me, /^[0-9a-f]{16}$/);
  assert.notEqual(me, other);
  assert.deepEqual(nudgePayload(me), { d: me }, "a nudge carries nothing but the run id");
  assert.equal(nudgeFromOther(nudgePayload(me), me), false);
  assert.equal(nudgeFromOther(nudgePayload(other), me), true);
  assert.equal(nudgeFromOther(null, me), false);
  assert.equal(nudgeFromOther({}, me), false);
  assert.equal(nudgeFromOther({ d: "<script>" }, me), false);
  assert.equal(nudgeFromOther({ d: 42 }, me), false);
});

test("the refresh button's message", () => {
  assert.equal(refreshMessage(0), "Up to date");
  assert.equal(refreshMessage(undefined), "Up to date");
  assert.equal(refreshMessage(1), "Got 1 change from your other devices");
  assert.equal(refreshMessage(12), "Got 12 changes from your other devices");
});

test("which pages are drawn again after a sync", () => {
  // By itself: only Home and Vocab (their counts), only when something came, never while busy.
  assert.equal(shouldRedraw({ received: 3, hash: "#/" }), true);
  assert.equal(shouldRedraw({ received: 3, hash: "" }), true);
  assert.equal(shouldRedraw({ received: 3, hash: "#/vocab" }), true);
  assert.equal(shouldRedraw({ received: 0, hash: "#/vocab" }), false);
  assert.equal(shouldRedraw({ received: 3, hash: "#/vocab", busy: true }), false);
  assert.equal(shouldRedraw({ received: 3, hash: "#/library" }), false);
  // The refresh button: any page that is safe to draw again.
  assert.equal(shouldRedraw({ received: 3, hash: "#/library", manual: true }), true);
  assert.equal(shouldRedraw({ received: 3, hash: "#/episode/12", manual: true }), false);
  assert.equal(shouldRedraw({ received: 3, hash: "#/chat/abc", manual: true }), false);
  assert.equal(shouldRedraw({ received: 3, hash: "#/reels/play", manual: true }), false);
  assert.equal(shouldRedraw({ received: 3, hash: "#/welcome", manual: true }), false);
});
