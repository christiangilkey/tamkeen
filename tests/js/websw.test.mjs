// The web app's service worker (webapp/sw.js, copied into docs/app by webapp/build-web.mjs), run with a stand-in
// network and browser cache. The owner, desktop Chrome on learntamkeen.com (2026-11-25): the Creatures screen's
// element icons, egg and two creatures stayed blank, while pictures loaded before showed. Pictures now keep a copy
// across builds, and a request that failed outright is sent once more.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../../webapp/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://learntamkeen.com";

test("the build script uses this file, and gives each build its own name", () => {
  const build = readFileSync(new URL("../../webapp/build-web.mjs", import.meta.url), "utf8");
  assert.match(build, /readFileSync\(join\(here, "sw\.js"\), "utf8"\)\.replaceAll\("__BUILD__", build\)/);
  assert.match(SOURCE, /const CACHE = "tamkeen-__BUILD__";/);
});

/** A service worker of build `name` on a stand-in browser: `net(url)` answers each request (a Response, or throws). */
function worker(name, { net, caches = new Map(), waitMs = 60 } = {}) {
  const handlers = {};
  const storage = {
    async open(key) { if (!caches.has(key)) caches.set(key, new Map()); const c = caches.get(key);
      return { put: async (req, res) => { c.set(typeof req === "string" ? req : req.url, res); } }; },
    async keys() { return [...caches.keys()]; },
    async delete(key) { return caches.delete(key); },
    async match(req, { ignoreSearch } = {}) {
      const want = (u) => (ignoreSearch ? u.replace(/\?.*$/, "") : u);
      for (const c of caches.values()) for (const [k, v] of c) if (want(k) === want(req.url)) return v.clone();
      return undefined;
    },
  };
  const asked = [];
  const context = {
    self: { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } },
    location: new URL(`${ORIGIN}/sw.js`),
    caches: storage,
    fetch: async (req) => { asked.push(req.url); return net(req.url); },
    URL, Response, Request, setTimeout, clearTimeout, console, Promise,
  };
  const code = SOURCE.replaceAll("__BUILD__", name).replace(/const ART_WAIT_MS = \d+;/, `const ART_WAIT_MS = ${waitMs};`)
    .replace(/const RETRY_GAP_MS = \d+;/, "const RETRY_GAP_MS = 5;");
  vm.runInNewContext(code, context);
  const get = async (path) => {
    let answer = null;
    handlers.fetch({ request: new Request(ORIGIN + path), respondWith: (p) => { answer = p; } });
    return answer && answer.then((res) => res);
  };
  const activate = async () => { let w; handlers.activate({ waitUntil: (p) => { w = p; } }); await w; };
  return { get, activate, caches, asked };
}
const png = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "Content-Type": "image/png" } });
const offline = () => { throw new TypeError("Failed to fetch"); };
const settle = () => new Promise((r) => setTimeout(r, 20));

test("a picture brought by the network is kept, by its address without ?retry", async () => {
  const sw = worker("1", { net: png });
  const res = await sw.get("/game-art/icon/type_spark.png?retry=123");
  assert.equal(res.status, 200);
  await settle();
  assert.ok(sw.caches.get("tamkeen-keep-art").has(`${ORIGIN}/game-art/icon/type_spark.png`));
});

test("a new build keeps the pictures' copy (and drops the old build's files)", async () => {
  const caches = new Map([["tamkeen-old", new Map()], ["tamkeen-keep-art", new Map()], ["tamkeen-keep-course-packs", new Map()]]);
  await worker("2", { net: png, caches }).activate();
  assert.deepEqual([...caches.keys()].sort(), ["tamkeen-keep-art", "tamkeen-keep-course-packs"]);
});

test("with the network failing, a picture seen before still shows (its kept copy)", async () => {
  const caches = new Map();
  await worker("1", { net: png, caches }).get("/game-art/egg/spark.png");
  await settle();
  const sw = worker("2", { net: offline, caches }); // a later build, and the connection gone
  const res = await sw.get("/game-art/egg/spark.png?retry=9");
  assert.equal(res.status, 200, "from the kept copy");
  assert.equal(sw.asked.length, 2, "the network was asked twice first (once more on a new connection)");
});

test("with the network hanging, the kept copy answers instead of waiting", async () => {
  const caches = new Map();
  await worker("1", { net: png, caches }).get("/game-art/icon/badge.png");
  await settle();
  const sw = worker("1", { net: () => new Promise(() => {}), caches, waitMs: 30 });
  const res = await Promise.race([sw.get("/game-art/icon/badge.png"), new Promise((r) => setTimeout(r, 1000, "hung"))]);
  assert.notEqual(res, "hung");
  assert.equal(res.status, 200);
});

test("a request that failed once is sent again, so a dropped connection doesn't leave a gap", async () => {
  let n = 0;
  const sw = worker("1", { net: () => (n++ ? png() : offline()) });
  const res = await sw.get("/game-art/creature/beast/dragon_whelp/idle.png");
  assert.equal(res.status, 200);
  assert.equal(n, 2);
});

test("a missing picture stays missing (the server's 404 is passed on)", async () => {
  const sw = worker("1", { net: () => new Response("Not found", { status: 404 }) });
  assert.equal((await sw.get("/game-art/icon/nothing.png")).status, 404);
  await settle();
  assert.ok(!(sw.caches.get("tamkeen-keep-art") || new Map()).size, "and nothing is kept for it");
});

test("the app's own files: from the network, else this build's copy; not kept as pictures", async () => {
  const caches = new Map();
  const sw = worker("1", { net: () => new Response("export {}", { status: 200 }), caches });
  await sw.get("/js/app.js");
  await settle();
  assert.ok(caches.get("tamkeen-1").has(`${ORIGIN}/js/app.js`));
  assert.ok(!caches.has("tamkeen-keep-art"));
  const down = worker("1", { net: offline, caches });
  assert.equal((await down.get("/js/app.js")).status, 200, "offline: this build's copy");
  await assert.rejects(down.get("/js/never-seen.js"), "offline, never seen: the browser's own error");
});
