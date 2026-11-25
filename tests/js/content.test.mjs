// New things in the Library paid in the creature game (web/js/game/content.js, prototype "content_rewards"): adding,
// finishing and sharing each count once per item, a few a day, finishing paying most; a weekly goal; badges; and two
// copies of the game joining their records so nothing pays twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { KINDS, PAY, SHORT, WEEK_GOAL, WEEK_PAY, addedBy, contentEvent, fp, join, kindOf, record, uploadedBy, weekly } = await import("../../web/js/game/content.js");
const { newState, normalize, checkBadges } = await import("../../web/js/game/rules.js");
const { combine } = await import("../../web/js/game/merge.js");
const { BADGES } = await import("../../web/js/game/data.js");
const { PROTOTYPES } = await import("../../web/js/prototype.js");

const ON = { on: true };
const monday = new Date("2026-11-23T10:00:00");
const at = (days, hours = 10) => new Date(monday.getTime() + days * 86400000 + (hours - 10) * 3600000);
const fresh = () => newState(7);

test("a prototype, off until the owner releases it", () => {
  assert.equal(PROTOTYPES.content_rewards.released, false);
  const s = fresh();
  assert.equal(contentEvent(s, { action: "add", kind: "podcast", key: "x" }, { now: monday, on: false }), null);
  assert.equal(s.content, undefined, "nothing is kept with it off");
  for (const b of BADGES.filter((x) => x.id.startsWith("content_"))) assert.equal(b.proto, "content_rewards", b.id);
});

test("finishing pays more than adding; sharing in between; reels and web pages pay little", () => {
  assert.ok(PAY.done.xp >= 4 * PAY.add.xp && PAY.done.coins >= 4 * PAY.add.coins, "finishing beats adding by far");
  assert.ok(PAY.sent.xp > PAY.add.xp && PAY.sent.xp < PAY.done.xp);
  assert.deepEqual([...SHORT].sort(), ["page", "reel"]);
  assert.ok(PAY.short.xp < PAY.done.xp);
  // the most adding can earn in a day is less than finishing one thing
  assert.ok(PAY.add.xp * PAY.add.day <= PAY.done.xp, "a day of adding is worth one thing finished");
  const s = fresh();
  const coins = s.coins;
  const r = contentEvent(s, { action: "done", kind: "podcast", key: "ep1" }, { now: monday, ...ON });
  assert.equal(r.xp, PAY.done.xp);
  assert.equal(s.coins - coins, PAY.done.coins + (r.levelUp ? 5 : 0));
  assert.ok(s.xp >= PAY.done.xp, "XP goes to the player and the creature");
  assert.equal(contentEvent(s, { action: "done", kind: "reel", key: "r1" }, { now: monday, ...ON }).xp, PAY.short.xp);
});

test("each item counts once ever: the same link again is not new", () => {
  const s = fresh();
  assert.ok(contentEvent(s, { action: "add", kind: "podcast", key: "podcast:feeds.example.com/rss" }, { now: monday, ...ON }));
  assert.equal(contentEvent(s, { action: "add", kind: "podcast", key: "podcast:feeds.example.com/rss" }, { now: monday, ...ON }), null);
  assert.equal(contentEvent(s, { action: "add", kind: "podcast", key: "podcast:feeds.example.com/rss" }, { now: at(30), ...ON }), null, "nor a month later");
  // the same address written differently is the same item
  const [a] = addedBy("/feeds", { url: "https://www.feeds.example.com/rss/" });
  const [b] = addedBy("/feeds", { url: "http://feeds.example.com/rss" });
  assert.equal(a.key, b.key);
  // finishing it is a different thing from adding it, and also counts once
  assert.ok(contentEvent(s, { action: "done", kind: "podcast", key: "ep" }, { now: monday, ...ON }));
  assert.equal(contentEvent(s, { action: "done", kind: "podcast", key: "ep" }, { now: at(1), ...ON }), null);
  assert.equal(record(s).n.add, 1);
  assert.equal(record(s).n.done, 1);
});

test("a cap a day for each: past it things still count (badges, the week) but pay nothing", () => {
  const s = fresh();
  for (let i = 0; i < PAY.add.day; i++) assert.equal(contentEvent(s, { action: "add", kind: "book", key: `b${i}` }, { now: monday, ...ON }).xp, PAY.add.xp);
  const over = contentEvent(s, { action: "add", kind: "book", key: "one more" }, { now: monday, ...ON });
  assert.equal(over.xp, 0);
  assert.equal(over.coins, 0);
  assert.equal(over.capped, true);
  assert.equal(record(s).n.add, PAY.add.day + 1, "it still counted");
  // finishing has its own cap; the next day starts again
  assert.equal(contentEvent(s, { action: "done", kind: "book", key: "b0" }, { now: monday, ...ON }).xp, PAY.done.xp);
  assert.equal(contentEvent(s, { action: "add", kind: "book", key: "tomorrow" }, { now: at(1), ...ON }).xp, PAY.add.xp);
});

test("shares count once per item and person", () => {
  const s = fresh();
  assert.equal(contentEvent(s, { action: "sent", kind: "share", key: "folder:Food|friend-a" }, { now: monday, ...ON }).xp, PAY.sent.xp);
  assert.equal(contentEvent(s, { action: "sent", kind: "share", key: "folder:Food|friend-a" }, { now: monday, ...ON }), null, "again to the same friend");
  assert.ok(contentEvent(s, { action: "sent", kind: "share", key: "folder:Food|friend-b" }, { now: monday, ...ON }), "to someone else");
  assert.ok(contentEvent(s, { action: "sent", kind: "share", key: "folder:Food|class:c1" }, { now: monday, ...ON }), "to a class");
});

test("the weekly goal: finish 3 new things (not reels) between Monday and Sunday, paid once", () => {
  const s = fresh();
  assert.equal(weekly(s, monday).done, 0);
  assert.equal(weekly(s, monday).left, 7);
  contentEvent(s, { action: "done", kind: "reel", key: "r" }, { now: monday, ...ON });
  assert.equal(weekly(s, monday).done, 0, "a reel doesn't count");
  contentEvent(s, { action: "add", kind: "podcast", key: "a" }, { now: monday, ...ON });
  assert.equal(weekly(s, monday).done, 0, "adding doesn't count");
  let r;
  for (let i = 0; i < WEEK_GOAL; i++) r = contentEvent(s, { action: "done", kind: i ? "book" : "page", key: `d${i}` }, { now: at(i * 2), ...ON });
  assert.deepEqual(r.weekPay, WEEK_PAY);
  assert.equal(r.week.reached, true);
  assert.equal(weekly(s, at(5)).paid, true);
  const more = contentEvent(s, { action: "done", kind: "book", key: "d9" }, { now: at(5), ...ON });
  assert.equal(more.weekPay, null, "paid once a week");
  // next Monday it starts again
  assert.deepEqual(weekly(s, at(7)), { done: 0, goal: WEEK_GOAL, paid: false, left: 7 });
});

test("badges: first find, 10/50/200 finished, five kinds, first share, 25 shares", () => {
  localStorage.setItem("tamkeenPrototype", "1");
  try {
    const s = fresh();
    const got = [];
    const ev = (action, kind, key, when = monday) => { const r = contentEvent(s, { action, kind, key }, { now: when }); if (r) got.push(...r.badges); };
    ev("add", "podcast", "p");
    assert.ok(got.includes("content_first"));
    ev("sent", "share", "x|f");
    assert.ok(got.includes("content_share_1"));
    for (let i = 0; i < 10; i++) ev("done", KINDS[i % 5], `k${i}`, at(i % 7));
    assert.ok(got.includes("content_done_10"));
    assert.ok(got.includes("content_kinds_5"));
    assert.ok(!got.includes("content_done_50"));
    for (let i = 0; i < 24; i++) ev("sent", "share", `x|f${i}`);
    assert.ok(got.includes("content_share_25"));
    for (const id of got) assert.ok(BADGES.find((b) => b.id === id), `${id} is a badge`);
    // every content badge has its art
    for (const b of BADGES.filter((x) => x.proto === "content_rewards")) {
      assert.ok(readFileSync(new URL(`../../web/game-art/badge/${b.art || b.id}.png`, import.meta.url)).length > 50, `${b.id} art`);
    }
    // and checkBadges finds them from a synced record alone
    const t = fresh();
    t.content = { add: [fp("add|z")], done: [], sent: [], kinds: [], n: { add: 1, done: 0, sent: 0 } };
    assert.ok(checkBadges(t).includes("content_first"));
  } finally { localStorage.removeItem("tamkeenPrototype"); }
});

test("what an addition is: from the call that made it; YouTube, random reels and Tamkeen's own lists never count", () => {
  assert.deepEqual(addedBy("/youtube", { video_id: "abc" }), []);
  assert.deepEqual(addedBy("/reels/batch", { count: 10 }), []);
  assert.deepEqual(addedBy("/feeds", { url: "local:reels" }), []);
  assert.equal(addedBy("/feeds", { url: "https://librivox.org/rss/123" })[0].kind, "audiobook");
  assert.equal(addedBy("/books", { guid: "file:My book.pdf:1234", source: "My book.pdf" })[0].kind, "pdf");
  assert.equal(addedBy("/books", { guid: "book:ar/12" })[0].kind, "book");
  assert.equal(addedBy("/books", { guid: "file:lesson:9", list: "lessons" })[0].kind, "lesson");
  assert.equal(addedBy("/reels/saved/send", { codes: ["a", "b"] }).length, 2);
  assert.equal(addedBy("/netflix", { id: 81 })[0].kind, "netflix");
  assert.equal(addedBy("/pages", { url: "https://news.example/x" })[0].kind, "page");
  // own files: the same file again is the same; an audiobook counts by its first chapter; recordings and lessons' tracks don't
  const file = { name: "talk.mp3", size: 1000, type: "audio/mpeg" };
  assert.deepEqual(uploadedBy(file), uploadedBy({ ...file }));
  assert.equal(uploadedBy(file)[0].kind, "audio");
  assert.equal(uploadedBy({ name: "film.mp4", size: 9, type: "video/mp4" })[0].kind, "video");
  assert.equal(uploadedBy(file, { book: { key: "k" } })[0].kind, "audiobook");
  assert.deepEqual(uploadedBy(file, { book: { key: "k" }, transcribe: false }), []);
  assert.deepEqual(uploadedBy(file, { recording: true }), []);
  assert.deepEqual(uploadedBy(file, { lesson: true }), []);
});

test("what a finished item is, by where it lives", () => {
  assert.equal(kindOf({ feed_url: "https://feeds.example/rss" }), "podcast");
  assert.equal(kindOf({ feed_url: "local:audiobook:abc" }), "audiobook");
  assert.equal(kindOf({ feed_url: "https://librivox.org/rss/55" }), "audiobook");
  assert.equal(kindOf({ feed_url: "local:youtube" }), null);
  assert.equal(kindOf({ feed_url: "local:books", source: "x.PDF" }), "pdf");
  assert.equal(kindOf({ feed_url: "local:books", guid: "book:ar/1" }), "book");
  for (const [feed, kind] of [["local:pages", "page"], ["local:lessons", "lesson"], ["local:audio", "audio"], ["local:videos", "video"], ["local:netflix", "netflix"], ["local:reels", "reel"]]) {
    assert.equal(kindOf({ feed_url: feed }), kind);
  }
});

test("no links or titles are kept: only short fingerprints", () => {
  const s = fresh();
  contentEvent(s, { action: "add", kind: "page", key: "page:secret.example/my-private-page" }, { now: monday, ...ON });
  assert.doesNotMatch(JSON.stringify(s.content), /secret|example|private/);
  assert.match(s.content.add[0], /^[0-9a-z]+\.[0-9a-z]+$/);
  assert.notEqual(fp("a"), fp("b"));
});

test("two devices: what counted on one never pays again after they sync", () => {
  const base = fresh();
  base.xp = 10;
  const phone = normalize(JSON.parse(JSON.stringify(base)));
  const desk = normalize(JSON.parse(JSON.stringify(base)));
  phone.clock = { phone: 3 };
  desk.clock = { desk: 2 };
  assert.ok(contentEvent(phone, { action: "done", kind: "podcast", key: "ep" }, { now: monday, ...ON }));
  assert.ok(contentEvent(desk, { action: "add", kind: "book", key: "bk" }, { now: monday, ...ON }));
  const both = normalize(combine(JSON.parse(JSON.stringify(phone)), JSON.parse(JSON.stringify(desk))));
  assert.equal(contentEvent(both, { action: "done", kind: "podcast", key: "ep" }, { now: monday, ...ON }), null, "finished on the phone");
  assert.equal(contentEvent(both, { action: "add", kind: "book", key: "bk" }, { now: monday, ...ON }), null, "added on the computer");
  assert.equal(record(both).n.done, 1);
  assert.equal(record(both).n.add, 1);
  // join is the same whichever side it is on, and leaves its inputs alone
  const a = JSON.parse(JSON.stringify(phone.content));
  const b = JSON.parse(JSON.stringify(desk.content));
  assert.deepEqual(join(a, b).n, join(b, a).n);
  assert.deepEqual(a, phone.content);
  assert.equal(join(null, null), null);
});

test("the pieces are wired in: the app's calls, the players, the reader, the shares, the merges, Home", () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const p of ["web/js/app.js", "mobile/src/js/app.js"]) {
    assert.match(read(p), /ADDS\.has\(path\)\) libraryAdded\(path, body\)/, `${p}: additions`);
    assert.match(read(p), /libraryUploaded\(file, \{ book, transcribe, recording, lesson \}\)/, `${p}: own files`);
  }
  assert.match(read("web/js/pages/player.js"), /contentFinished\(ep,/);
  assert.match(read("web/js/pages/book.js"), /if \(read && read\.done\) contentFinished\(ep, bookKey\)/);
  assert.match(read("web/js/pages/reader.js"), /contentFinished\(ep,/);
  assert.match(read("web/js/social.js"), /contentShared\(what, friendId\)/);
  assert.match(read("web/js/components/sendmedia.js"), /sharedOut\(item, friendId\)/);
  assert.match(read("web/js/components/sendmedia.js"), /sharedOut\(p\.item, `class:\$\{classId\}`\)/);
  assert.match(read("web/js/game/merge.js"), /joinContent\(a\.content, b\.content\)/);
  assert.match(read("app/sync/gamemerge.py"), /join_content\(a\.get\("content"\), b\.get\("content"\)\)/);
  assert.match(read("web/js/game/habitat.js"), /weekChipHtml\(\)/);
});

test("every browser file it touches parses as a module (they only load in the app, never in these tests)", () => {
  const dir = mkdtempSync(pathJoin(tmpdir(), "tk-content-"));
  for (const p of ["web/js/game/game.js", "web/js/game/content-ui.js", "web/js/game/habitat.js", "web/js/game/info.js", "web/js/pages/player.js",
    "web/js/pages/reader.js", "web/js/pages/book.js", "web/js/social.js", "web/js/components/sendmedia.js", "web/js/app.js", "mobile/src/js/app.js"]) {
    const copy = pathJoin(dir, "check.mjs");
    writeFileSync(copy, readFileSync(new URL(`../../${p}`, import.meta.url)));
    assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", copy], { stdio: "pipe" }), p);
  }
});
