// Pictures on the backs of flashcards (prototype card_pictures): web/js/cardpicture.js (Openverse search with only
// the licences that allow commercial use, credits, file names), web/js/picturebatch.js (many cards, gently), the
// phone's sync and Anki export, and that every version gets the files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// (picturebatch.js asks feature("card_pictures"): prototype mode on, as on the owner's devices)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
localStorage.setItem("tamkeenPrototype", "1");

const pic = await import("../../web/js/cardpicture.js");
const batch = await import("../../web/js/picturebatch.js");
const { PROTOTYPES } = await import("../../web/js/prototype.js");
const { buildDeck } = await import("../../mobile/src/js/anki-deck.js");
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const RESULT = {
  id: "dcef0b54-2338-4141-9be0-1b5bb50fa729", title: "dogs of Iquitos", foreign_landing_url: "https://www.flickr.com/photos/x/1",
  url: "https://live.staticflickr.com/1.jpg", creator: "iquitos", creator_url: "https://www.flickr.com/photos/x", license: "by",
  license_version: "2.0", license_url: "https://creativecommons.org/licenses/by/2.0/", provider: "flickr", source: "flickr",
  mature: false, width: 500, height: 375, thumbnail: "https://api.openverse.org/v1/images/dcef0b54-2338-4141-9be0-1b5bb50fa729/thumb/",
};

test("your own picture is released; everything that asks Openverse waits in prototype mode", () => {
  assert.equal(PROTOTYPES.card_pictures.released, true);
  assert.equal(PROTOTYPES.card_pictures_openverse.released, false);
  // (the owner, 2026-11-23: release your own pictures, leave Openverse out until its search works)
  const picker = read("web/js/components/cardpic.js");
  assert.match(picker, /export const openverseOn = \(\) => picturesOn\(\) && feature\("card_pictures_openverse"\)/);
  assert.match(picker, /const online = openverseOn\(\);/);
  assert.match(picker, /if \(online\) \{\n    if \(box\.value\) search\(box\.value\);/, "the picker searches only with Openverse on");
  assert.match(read("web/js/components/picturesettings.js"), /if \(!openverseOn\(\)\) return/, "Settings' card only with Openverse on");
  assert.match(read("web/js/pages/vocab.js"), /\.\.\.\(openverseOn\(\) \? \[\{ label: "Add pictures"/, "the Vocab menu's Add pictures too");
  assert.match(read("web/js/components/settingsui.js"), /id: "pictures"[^}]*prototype: "card_pictures_openverse"/);
});

test("with Openverse's prototype off, nothing is queued and no new card asks for a picture", async () => {
  localStorage.removeItem("tamkeenPrototype");
  batch._reset();
  batch.setAuto(true);
  assert.equal(batch.autoOn(), false);
  assert.equal(batch.addPictures([{ id: 1, uid: "x", meaning: "dog" }]), 0);
  batch.cardsSaved({ id: 2, uid: "y", meaning: "cat" });
  assert.equal(batch.progress.total, 0);
  batch.setAuto(false);
  localStorage.setItem("tamkeenPrototype", "1");
});

test("the search is the card's short meaning, its first sense", () => {
  assert.equal(pic.searchQuery("dog"), "dog");
  assert.equal(pic.searchQuery("to eat (food); meal"), "eat");
  assert.equal(pic.searchQuery("the house, home"), "house");
  assert.equal(pic.searchQuery("a big red apple tree in spring"), "big red apple tree");
  assert.equal(pic.searchQuery("“book”"), "book");
  assert.equal(pic.searchQuery(""), "");
  assert.equal(pic.searchQuery("(grammar)"), "");
});

test("only licences that allow commercial use are asked for, and checked again", () => {
  const url = new URL(pic.searchUrl("dog"));
  assert.equal(url.origin + url.pathname, "https://api.openverse.org/v1/images/");
  assert.equal(url.searchParams.get("license"), "cc0,pdm,by,by-sa");
  assert.equal(url.searchParams.get("license_type"), null, "Openverse's 'commercial' lets ND through: the list is given exactly");
  assert.equal(url.searchParams.get("mature"), "false");
  assert.equal(pic.LICENSES.join(), "cc0,pdm,by,by-sa");
  // The computer keeps the same list (app/pictures.py).
  assert.match(read("app/pictures.py"), /LICENSES = \("cc0", "pdm", "by", "by-sa"\)/);
  for (const license of ["by-nc", "by-nd", "by-nc-sa", "by-nc-nd", "sampling+", "nc-sampling+"]) {
    assert.equal(pic.cleanResult({ ...RESULT, license }), null, license);
  }
  assert.equal(pic.cleanResult({ ...RESULT, mature: true }), null);
  assert.equal(pic.cleanResult({ ...RESULT, id: "../x" }), null);
  const ok = pic.cleanResult({ ...RESULT, license: "by-sa" });
  assert.equal(ok.license, "by-sa");
  assert.equal(ok.source, RESULT.foreign_landing_url);
  assert.equal(pic.cleanResult({ ...RESULT, foreign_landing_url: "javascript:alert(1)" }).source, "");
});

test("searching: results checked, nothing personal sent, a 'slow down' says so", async () => {
  let asked = null;
  const fetcher = async (url, opts) => {
    asked = { url, opts };
    return { ok: true, status: 200, json: async () => ({ page_count: 3, results: [RESULT, { ...RESULT, id: "b", license: "by-nd" }] }) };
  };
  const found = await pic.searchPictures("dog", { fetcher });
  assert.equal(found.results.length, 1, "the ND one is dropped");
  assert.equal(found.pages, 3);
  assert.equal(asked.opts.credentials, "omit");
  assert.equal(asked.opts.referrerPolicy, "no-referrer");
  assert.equal(asked.opts.headers.Authorization, undefined, "no key");
  await assert.rejects(pic.searchPictures("dog", { fetcher: async () => ({ ok: false, status: 429 }) }), (e) => e.rate === true);
  globalThis.navigator ??= {};
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
  await assert.rejects(pic.searchPictures("dog", { fetcher: async () => { throw new TypeError("offline"); } }), (e) => e.offline === true);
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  await assert.rejects(pic.searchPictures("dog", { fetcher: async () => { throw new TypeError("Failed to fetch"); } }), (e) => e.down === true,
    "online: a refused request is Openverse having trouble (its error pages can't be read by a page), not the connection");
  assert.deepEqual(await pic.searchPictures("  ", { fetcher }), { results: [], pages: 0 });
  await assert.rejects(pic.searchPictures("dog", { fetcher: async () => ({ ok: false, status: 504 }) }), (e) => e.down === true,
    "Openverse down (seen 2026-11-23: its search gave 504 for a while): Add pictures stops instead of using up the day's searches");
  const slow = (url, opts) => new Promise((resolve, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  await assert.rejects(pic.searchPictures("dog", { fetcher: slow, timeoutMs: 20 }), (e) => e.down === true && e.message === pic.DOWN);
});

test("a card keeps its picture's version and credit; the credit line and file names", () => {
  const meta = pic.cleanMeta(pic.pictureMeta(pic.cleanResult(RESULT), "a1b2c3d4e5f6"));
  assert.deepEqual(Object.keys(meta), ["v", "src", "id", "title", "by", "by_url", "lic", "lic_v", "lic_url", "url"],
    "the same keys in the same order as app/pictures.py clean, so both write the same text");
  const card = { uid: "w1", picture: JSON.stringify(meta) };
  assert.deepEqual(pic.pictureOf(card), meta);
  assert.equal(pic.creditText(meta), "Photo: iquitos · CC BY 2.0");
  assert.equal(pic.creditText({ ...meta, lic: "cc0" }), "Photo: iquitos · CC0");
  assert.equal(pic.creditText({ ...meta, lic: "pdm", by: "" }), "Photo: unknown · Public domain");
  assert.equal(pic.creditText(pic.cleanMeta(pic.pictureMeta(null, "0000aaaa1111"))), "", "the learner's own picture has no credit");
  assert.equal(pic.pictureFile("w1", meta), "p_w1_a1b2c3d4e5f6.jpg");
  assert.equal(pic.pictureFile("w 1", meta), "");
  assert.equal(pic.pictureOf({ picture: JSON.stringify({ ...meta, lic: "by-nc" }) }), null);
  assert.equal(pic.pictureOf({ picture: JSON.stringify({ ...meta, v: "../x" }) }), null);
  assert.equal(pic.pictureOf({ picture: "" }), null);
  assert.match(pic.newVersion(), /^[a-f0-9]{12}$/);
  assert.equal(pic.ankiName("w1", meta), "tk-w1-p-a1b2c3d4e5f6.jpg");
  const field = pic.ankiImageField({ ...meta, by: "<b>x</b>" }, "tk-w1-p-a1b2c3d4e5f6.jpg");
  assert.ok(field.startsWith('<img src="tk-w1-p-a1b2c3d4e5f6.jpg">'));
  assert.ok(field.includes("&lt;b&gt;x&lt;/b&gt;") && field.includes(RESULT.foreign_landing_url));
});

test("searches are counted per day on this device; 'Add pictures' leaves room for the picker", () => {
  const store = new Map();
  const s = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(pic.searchesToday(s, 100), 0);
  for (let i = 0; i < pic.BATCH_DAY_CAP; i++) pic.countSearch(s, 100);
  assert.equal(pic.batchRoom(s, 100), false);
  assert.equal(pic.batchRoom(s, 101), true, "a new day starts again");
  assert.ok(pic.BATCH_DAY_CAP < 200 && pic.BATCH_GAP_MS >= 3000, "under Openverse's 200 a day and 20 a minute");
});

test("Add pictures: one card at a time, a few seconds apart; stops for a 'slow down' or the day's limit", async () => {
  batch._reset();
  const cards = [{ id: 1, uid: "a", meaning: "dog" }, { id: 2, uid: "b", meaning: "zzqx" }, { id: 3, uid: "c", meaning: "cat", picture: "" },
                 { id: 4, uid: "d", meaning: "" }, { id: 5, uid: "e", meaning: "tree", picture: JSON.stringify({ v: "a1b2c3d4", src: "own" }) }];
  const searched = [], waits = [], used = [];
  const search = async (q) => { searched.push(q); return { results: q === "zzqx" ? [] : [pic.cleanResult(RESULT)] }; };
  const use = async (v, r) => { used.push([v.uid, r.id]); return { picture: JSON.stringify(pic.cleanMeta(pic.pictureMeta(r, "a1b2c3d4e5f6"))) }; };
  const deps = { search, use, wait: async (ms) => { waits.push(ms); }, room: () => true, count: () => {} };
  // queued (the cards without a picture and with a meaning), and run with the stand-ins
  batch._useDeps(deps);
  const n = batch.addPictures(cards);
  assert.equal(n, 3, "the card with a picture and the one with no meaning are left out");
  await batch.run();
  assert.deepEqual(searched, ["dog", "zzqx", "cat"]);
  assert.deepEqual(used.map((u) => u[0]), ["a", "c"]);
  assert.deepEqual(waits, [pic.BATCH_GAP_MS, pic.BATCH_GAP_MS], "a pause between two searches");
  assert.equal(batch.progress.added, 2);
  assert.equal(batch.progress.none, 1);
  assert.ok(pic.pictureOf(cards[0]), "the card has its picture");
  assert.equal(batch.addPictures(cards), 0, "a card with nothing found isn't searched for again");

  batch._reset();
  const more = [{ id: 6, uid: "f", meaning: "sun" }, { id: 7, uid: "g", meaning: "moon" }];
  batch._useDeps({ ...deps, search: async () => { throw Object.assign(new Error("slow down"), { rate: true }); } });
  batch.addPictures(more);
  await batch.run();
  assert.equal(batch.progress.stopped, "rate");
  batch._reset();
  batch._useDeps({ ...deps, room: () => false });
  batch.addPictures(more);
  await batch.run();
  assert.equal(batch.progress.stopped, "day");
  batch._reset();
  batch._useDeps({});
});

test("new cards get a picture only with the switch on", () => {
  batch._reset();
  batch.setAuto(false);
  batch._useDeps({ search: async () => ({ results: [] }), use: async () => ({}), wait: async () => {}, room: () => true, count: () => {} });
  batch.cardsSaved({ id: 1, uid: "n1", meaning: "horse" });
  assert.equal(batch.progress.total, 0);
  assert.equal(batch.autoOn(), false);
  batch.setAuto(true);
  assert.equal(batch.autoOn(), true);
  batch._reset();
  batch.setAuto(false);
  batch._useDeps({});
  // (the shells hand every POST /vocab and /vocab/batch answer to cardsSaved)
  for (const shell of ["web/js/app.js", "mobile/src/js/app.js"]) {
    assert.match(read(shell), /path === "\/vocab" \|\| path === "\/vocab\/batch"\)\) cardsSaved\(data\)/, shell);
  }
});

test("the phone keeps, sends and fetches pictures like the computer", () => {
  const sync = read("mobile/src/js/sync.js");
  assert.match(sync, /picture: r\.picture \?\? l\.picture \?\? ""/, "an older app's copy without a picture keeps the one known here");
  assert.match(sync, /picture: v\.picture \|\| ""/, "the library sent to Drive carries it, as the computer's does");
  assert.match(sync, /uploadPendingPictures\(files\)/);
  assert.match(sync, /prefetchPictures\(files\)/);
  const engine = read("app/sync/engine.py");
  for (const name of ["upload_pictures(drive, files)", "fetch_pictures(drive, files)", "remove_old_pictures(drive, files)"]) {
    assert.ok(engine.includes(name), name);
  }
  assert.ok(engine.includes("voice, picture, deleted, created_at, updated_at FROM vocab"), "the computer's snapshot has it");
});

test("every version gets the files", () => {
  const list = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/cardpicture.js", "js/picturebatch.js", "js/components/cardpic.js", "js/components/picturesettings.js"]) {
    assert.ok(list.includes(`"${f}"`), f);
  }
  for (const shell of ["web/js/app.js", "mobile/src/js/app.js"]) {
    const s = read(shell);
    for (const fn of ["pictureUrl", "savePicture", "removePicture"]) assert.match(s, new RegExp(`export (async )?(function|const) ${fn}\\b`), `${shell} ${fn}`);
  }
});

test("the phone's Anki deck puts the picture and its credit in the image field", async () => {
  const meta = pic.cleanMeta(pic.pictureMeta(pic.cleanResult(RESULT), "a1b2c3d4e5f6"));
  const words = [{ uid: "w1", text: "كلب", meaning: "dog", sentence: "", translation: "", notes: "", memo: "", created_at: 1,
                   start: null, end: null, sent_start: null, sent_end: null, picture: JSON.stringify(meta) }];
  const name = pic.ankiName("w1", meta);
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const deck = await buildDeck(words, {}, { front: "{{Front}}", back: "{{Back}}", css: "" }, new Uint8Array([1]), 1_800_000_000, {}, undefined,
    () => null, null, "", { w1: { name, bytes, field: pic.ankiImageField(meta, name) } });
  assert.ok(deck instanceof Uint8Array && deck.length > 100);
  // the zip holds the picture's bytes and the media index names it
  const text = new TextDecoder("latin1").decode(deck);
  assert.ok(text.includes(name), "the media index names the picture");
  assert.ok(text.includes("\xff\xd8\xff\x01\x02\x03"), "and the picture is in the file");
});
