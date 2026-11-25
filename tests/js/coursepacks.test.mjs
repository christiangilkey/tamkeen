// The basics courses' audio packs (web/js/coursepacks.js, tools/course/packs.py): one file per unit, each word's
// clip cut out of it, downloaded once and kept. And the published courses: every clip is where course.json says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { KEEP_CACHE, clipOf, cut, packStore, packsOf } from "../../web/js/coursepacks.js";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const text = (p) => readFileSync(at(p), "utf8");
const times = { start: 0, end: 0.3, sent_start: 1, sent_end: 2 };

test("where a word's audio is: its clip in a pack, its own file (a course from before the packs), or none", () => {
  assert.deepEqual(clipOf({ n: 1, times, clip: { pack: "audio/u01-0123456789.pack", at: 0, size: 9 } }),
    { file: "audio/u01-0123456789.pack", at: 0, size: 9 });
  assert.deepEqual(clipOf({ n: 1, times, audio: "audio/0001.ogg" }), { file: "audio/0001.ogg" });
  assert.deepEqual(clipOf({ n: 1, times, audio: "audio/0001.ogg", clip: { pack: "audio/u01-0123456789.pack", at: 4, size: 5 } }).at, 4,
    "the pack comes first while both are there");
  assert.equal(clipOf({ n: 1, audio: "audio/0001.ogg" }), null, "no times: nothing to play");
  assert.equal(clipOf({ n: 1, times }), null, "a course without audio (Moroccan)");
  assert.equal(clipOf({ n: 1, times, clip: { pack: "x.pack", at: -1, size: 3 } }), null, "a broken clip isn't trusted");
  assert.equal(clipOf({ n: 1, times, clip: { pack: "x.pack", at: 0, size: 0 } }), null);
  assert.deepEqual(packsOf([
    { n: 1, times, clip: { pack: "audio/u01-a.pack", at: 0, size: 2 } },
    { n: 2, times, clip: { pack: "audio/u01-a.pack", at: 2, size: 2 } },
    { n: 51, times, clip: { pack: "audio/u02-b.pack", at: 0, size: 2 } },
    { n: 52, times, audio: "audio/0052.ogg" },
    { n: 53 },
  ]), ["audio/u01-a.pack", "audio/u02-b.pack"]);
});

test("a clip is its bytes cut out of the pack, as Ogg audio", async () => {
  const pack = new Blob([new TextEncoder().encode("OggS-one|OggS-two")]);
  const two = cut(pack, { file: "p", at: 9, size: 8 });
  assert.equal(two.type, "audio/ogg");
  assert.equal(await two.text(), "OggS-two");
  assert.throws(() => cut(pack, { file: "p", at: 9, size: 100 }), /incomplete/);
  const own = cut(new Blob(["OggS-own"]), { file: "audio/0001.ogg" });
  assert.equal([own.type, await own.text()].join(" "), "audio/ogg OggS-own");
});

/** A fetch that answers from `files` and counts what was asked. */
function server(files) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    return url in files ? new Response(files[url]) : new Response("", { status: 404 });
  };
  return { fetch, asked };
}

/** Cache Storage, in memory (keyed by the absolute address, as the browser's is). */
function fakeCaches() {
  const stores = new Map();
  const abs = (u) => new URL(typeof u === "string" ? u : u.url, "https://localhost/").href;
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        async match(u) { const b = m.get(abs(u)); return b ? new Response(b) : undefined; },
        async put(u, res) { m.set(abs(u), await res.blob()); },
        async delete(u) { return m.delete(abs(u)); },
        async keys() { return [...m.keys()].map((url) => ({ url })); },
      };
    },
  };
}

const PACK = "/tamkeen/course/ar/audio/u01-0123456789.pack";
const urlOf = (file) => `/tamkeen/course/ar/${file}`;
const w1 = { n: 1, times, clip: { pack: "audio/u01-0123456789.pack", at: 0, size: 8 } };
const w2 = { n: 2, times, clip: { pack: "audio/u01-0123456789.pack", at: 8, size: 8 } };

test("a unit's pack is downloaded once for all its words, and kept for next time", async () => {
  const { fetch, asked } = server({ [PACK]: "OggS-oneOggS-two" });
  const caches = fakeCaches();
  const store = packStore({ fetch, cacheStorage: caches });
  assert.equal(await (await store.clip(w1, urlOf)).text(), "OggS-one");
  assert.equal(await (await store.clip(w2, urlOf)).text(), "OggS-two");
  assert.deepEqual(asked, [PACK], "one download for the unit");
  assert.ok(caches.stores.get(KEEP_CACHE).has("https://localhost" + PACK), "kept in Cache Storage");
  // The app opened again (nothing in memory): the kept pack is used, no download.
  const again = packStore({ fetch, cacheStorage: caches });
  assert.equal(await (await again.clip(w2, urlOf)).text(), "OggS-two");
  assert.equal(asked.length, 1);
});

test("without Cache Storage (or on the computer, whose server keeps it) the pack is held in memory only", async () => {
  const { fetch, asked } = server({ [PACK]: "OggS-oneOggS-two" });
  const caches = fakeCaches();
  const store = packStore({ fetch, cacheStorage: caches, keep: false });
  await store.clip(w1, urlOf);
  await store.clip(w2, urlOf);
  assert.equal(asked.length, 1);
  assert.equal(caches.stores.size, 0, "nothing kept twice");
  const none = packStore({ fetch, cacheStorage: undefined });
  assert.equal(await (await none.clip(w1, urlOf)).text(), "OggS-one");
  const broken = packStore({ fetch, cacheStorage: { open: async () => { throw new Error("not here (an iPhone's app scheme)"); } } });
  assert.equal(await (await broken.clip(w2, urlOf)).text(), "OggS-two", "Cache Storage refusing doesn't stop the audio");
});

test("a failed or cut-short download isn't kept: the next try downloads again", async () => {
  let body = "OggS-one"; // (the second clip is missing)
  const asked = [];
  const fetch = async (url) => { asked.push(url); return body ? new Response(body) : new Response("", { status: 503 }); };
  const caches = fakeCaches();
  const store = packStore({ fetch, cacheStorage: caches });
  await assert.rejects(store.clip(w2, urlOf), /incomplete/);
  assert.equal(caches.stores.get(KEEP_CACHE).size, 0);
  body = "";
  await assert.rejects(store.clip(w1, urlOf), /HTTP 503/);
  body = "OggS-oneOggS-two";
  assert.equal(await (await store.clip(w2, urlOf)).text(), "OggS-two");
  assert.equal(asked.length, 3);
});

test("a word from a course built before the packs is fetched from its own file", async () => {
  const { fetch, asked } = server({ "/tamkeen/course/ar/audio/0003.ogg": "OggS-three" });
  const store = packStore({ fetch, cacheStorage: fakeCaches() });
  const clip = await store.clip({ n: 3, times, audio: "audio/0003.ogg" }, urlOf);
  assert.equal([clip.type, await clip.text()].join(" "), "audio/ogg OggS-three");
  assert.deepEqual(asked, ["/tamkeen/course/ar/audio/0003.ogg"]);
  await assert.rejects(store.clip({ n: 4, times }, urlOf), /no audio/);
});

test("opening a unit starts its pack's download; only a few packs are held in memory", async () => {
  const files = {};
  const words = [];
  for (let u = 1; u <= 8; u++) {
    const pack = `audio/u0${u}-0123456789.pack`;
    files[urlOf(pack)] = "OggS-xx";
    words.push({ n: u * 50, times, clip: { pack, at: 0, size: 7 } });
  }
  const { fetch, asked } = server(files);
  const store = packStore({ fetch, cacheStorage: undefined });
  store.warm(words.slice(0, 1), urlOf);
  await store.clip(words[0], urlOf);
  assert.equal(asked.length, 1, "warm and play share one download");
  for (const w of words) await store.clip(w, urlOf);
  assert.equal(store.held().length, 6);
  assert.equal(store.held().at(-1), urlOf(words[7].clip.pack), "the latest used is kept");
});

test("packs a rebuilt course no longer names are dropped from the kept ones; other courses' are left", async () => {
  const caches = fakeCaches();
  const keep = await caches.open(KEEP_CACHE);
  for (const p of ["ar/audio/u01-0123456789.pack", "ar/audio/u01-aaaaaaaaaa.pack", "es/audio/u01-bbbbbbbbbb.pack"]) {
    await keep.put(`/tamkeen/course/${p}`, new Response("x"));
  }
  const store = packStore({ fetch: async () => new Response(""), cacheStorage: caches });
  assert.equal(await store.tidy({ words: [w1, w2] }, urlOf), 1);
  assert.deepEqual([...caches.stores.get(KEEP_CACHE).keys()].sort(), [
    "https://localhost/tamkeen/course/ar/audio/u01-0123456789.pack",
    "https://localhost/tamkeen/course/es/audio/u01-bbbbbbbbbb.pack"]);
});

test("the screens use the packs, every version has them, and the web app's service worker keeps them", () => {
  const panel = text("web/js/components/coursepanel.js");
  assert.match(panel, /import \{ clipOf, packStore \} from "\.\.\/coursepacks\.js";/);
  // (made on first use: the panel is loaded before app.js's `platform` is set)
  assert.match(panel, /const packs = \(\) => \(store \|\|= packStore\(\{ keep: platform !== "desktop" \}\)\);/);
  assert.doesNotMatch(panel, /^const \w+ = packStore\(/m);
  assert.match(panel, /await saveVoice\(card\.id, await packs\(\)\.clip\(w, audioUrl\), w\.times\);/);
  assert.match(panel, /URL\.createObjectURL\(clip\)/);
  assert.match(panel, /packs\(\)\.warm\(unit\.words, audioUrl\)/);
  assert.doesNotMatch(panel, /w\.audio/, "no word's own file asked for directly");
  assert.match(text("mobile/scripts/build-www.mjs"), /"js\/coursepacks\.js"/);
  const web = text("webapp/sw.js"); // (the web app's service worker, copied into the build by build-web.mjs)
  assert.match(web, /if \(key !== CACHE && !key\.startsWith\("tamkeen-keep-"\)\) await caches\.delete\(key\);/);
  assert.ok(KEEP_CACHE.startsWith("tamkeen-keep-"));
  // The computer's server lets the packs through and keeps them (tests/test_course.py tries it).
  assert.match(text("app/course.py"), /audio\/u\\d\{2\}-\[0-9a-f\]\{10\}\\\.pack/);
});

// ---------------------------------------------------------------- the published courses

const COURSES = existsSync(at("docs/course/index.json")) ? Object.keys(JSON.parse(text("docs/course/index.json")).courses) : [];

test("every published word's clip is in its unit's pack, starts as an Ogg file, and the packs hold nothing else", () => {
  const index = JSON.parse(text("docs/course/index.json")).courses;
  let checked = 0;
  for (const id of COURSES) {
    const course = JSON.parse(text(`docs/course/${id}/course.json`));
    const voiced = course.words.filter((w) => w.times);
    if (!course.voice) {
      assert.equal(voiced.length, 0, `${id}: no voice, no audio`);
      continue;
    }
    const used = new Map(); // pack -> bytes its clips cover
    for (const w of course.words) {
      const c = clipOf(w);
      assert.ok(c && c.at !== undefined, `${id} ${w.n}: has a clip in a pack`);
      const unit = Math.ceil(w.n / course.unit);
      assert.match(c.file, new RegExp(`^audio/u${String(unit).padStart(2, "0")}-[0-9a-f]{10}\\.pack$`), `${id} ${w.n}: its unit's pack`);
      const path = at(`docs/course/${id}/${c.file}`);
      assert.equal(c.at, used.get(c.file) || 0, `${id} ${w.n}: right after the clip before it`);
      used.set(c.file, c.at + c.size);
      const head = Buffer.alloc(4);
      const fd = openSync(path, "r");
      try { readSync(fd, head, 0, 4, c.at); } finally { closeSync(fd); }
      assert.equal(head.toString("latin1"), "OggS", `${id} ${w.n}: an Ogg file where its clip starts`);
      if (w.audio && existsSync(at(`docs/course/${id}/${w.audio}`))) {
        assert.equal(statSync(at(`docs/course/${id}/${w.audio}`)).size, c.size, `${id} ${w.n}: the same clip as its own file`);
      }
      checked++;
    }
    let bytes = 0;
    for (const [file, end] of used) {
      assert.equal(statSync(at(`docs/course/${id}/${file}`)).size, end, `${id} ${file}: nothing but its clips`);
      bytes += end;
    }
    const lying = readdirSync(at(`docs/course/${id}/audio`)).filter((f) => f.endsWith(".pack") && !used.has(`audio/${f}`));
    assert.deepEqual(lying, [], `${id}: no pack left over from an earlier build`);
    assert.equal(index[id].audio_bytes, bytes, `${id}: the index says how big its audio is`);
  }
  assert.ok(checked > 10000, `${checked} clips checked`);
});
