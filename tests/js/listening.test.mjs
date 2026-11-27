// What has been listened to, watched and read, shared between devices: web/js/listening.js (the twin of
// app/listening.py, checked with the same cases), the phone's routes (listItems / takeItems in backend.js), and the
// page's go-between (listensync.js with progress.js and watched.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A browser's storage, one per simulated device (set before the page's modules are used).
class Storage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new Storage();
globalThis.window = new EventTarget();

const L = await import("../../web/js/listening.js");
const P = await import("../../web/js/progress.js");
const W = await import("../../web/js/watched.js");
const S = await import("../../web/js/listensync.js");

const CASES = JSON.parse(readFileSync(new URL("../fixtures/listening_cases.json", import.meta.url), "utf8"));
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("records are cleaned and merged the same as on the computer, whichever device merges", () => {
  for (const c of CASES.clean) assert.deepEqual(L.cleanState(c.in), c.out, JSON.stringify(c.in));
  for (const c of CASES.merge) {
    assert.deepEqual(L.mergeState(c.mine, c.theirs), c.out, JSON.stringify(c));
    assert.deepEqual(L.mergeState(c.theirs, c.mine), c.out, JSON.stringify(c));
  }
});

test("finished items are never dropped; unfinished ones keep the newest 1000 (as on the computer)", () => {
  const state = {};
  for (let i = 0; i < 3000; i++) state[`d${i}`] = { done: i + 1, ts: i + 1 };
  for (let i = 0; i < 1500; i++) state[`u${i}`] = { ts: 10000 + i, pos: 30, dur: 900 };
  const kept = L.cleanState(state);
  assert.equal(Object.values(kept).filter((r) => r.done).length, 3000);
  assert.equal(Object.values(kept).filter((r) => !r.done).length, L.UNFINISHED_KEPT);
  assert.ok(kept.u1499 && !kept.u0);
});

test("the phone's routes keep what the page sends for its episodes, and give back only those still there", () => {
  const known = new Set(["a", "b", "gone"]);
  let { state, saved } = L.takeItems({}, [{ id: "a", ts: 5, pos: 100, dur: 900 }, { id: "zzz", ts: 5 }, { id: "b", done: 7 }, null], known);
  assert.equal(saved, 2);
  assert.deepEqual(Object.keys(state), ["a", "b"]);
  ({ state, saved } = L.takeItems(state, [{ id: "a", ts: 5, pos: 100, dur: 900 }], known));
  assert.equal(saved, 0); // the same again changes nothing
  ({ state, saved } = L.takeItems(state, [{ id: "gone", done: 3 }], known));
  assert.deepEqual(L.listItems(state, new Set(["a", "b"])).map((x) => [x.id, x.uid]), [["a", "a"], ["b", "b"]]);
  const backend = read("mobile/src/js/backend.js");
  assert.match(backend, /\["GET", \/\^\\\/listening\$\/, \(\) => \(\{ items: listItems\(/);
  assert.match(backend, /takeItems\(lib\.listening, items,/);
});

test("both apps share it through the Drive sync, and start the page's go-between", () => {
  const sync = read("mobile/src/js/sync.js");
  assert.match(sync, /listening: cleanListening\(lib\.listening\),/);              // sent
  assert.match(sync, /listening: cleanListening\(l\.listening\),/);                // compared before uploading
  assert.match(sync, /mergeListening\(before, remote\.listening\)/);               // taken in
  assert.match(read("mobile/src/js/store.js"), /reviews: \{\}, listening: \{\} \};/);
  for (const app of ["web/js/app.js", "mobile/src/js/app.js"]) assert.match(read(app), /startListenSync\(api, on\);/, app);
  const www = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/listening.js", "js/listensync.js"]) assert.ok(www.includes(`"${f}"`), f);
});

// ----- the page: two devices, each with its own browser storage, and one phone-style app between them -----

function device() { return new Storage(); }
function useDevice(storage) { globalThis.localStorage = storage; }
function server(known) {
  const box = { state: {}, sent: [] };
  box.api = async (path, { method = "GET", body } = {}) => {
    if (path !== "/listening") throw new Error(path);
    if (method === "POST") { box.sent.push(body.items.map((x) => x.id)); const r = L.takeItems(box.state, body.items, known); box.state = r.state; return { saved: r.saved }; }
    return { items: L.listItems(box.state, known) };
  };
  return box;
}

test("what changes here is noted to be sent; what comes from elsewhere isn't sent back", () => {
  useDevice(device());
  P.saveProgress({ id: "e1", kind: "audio", title: "Episode 1", sub: "Feed", pos: 100, dur: 1200 });
  W.markWatched("v1");
  assert.deepEqual(P.changedIds(), ["e1", "v1"]);
  P.clearChanged(["e1", "v1"]);
  assert.equal(P.takeProgress([{ id: "e2", kind: "audio", ts: Date.now(), pos: 50, dur: 600, title: "Two" }]), 1);
  assert.equal(W.takeWatched(["v2", "v1"]), 1); // (v1 was already here)
  assert.deepEqual(P.changedIds(), []);
  assert.ok(W.watchedIds().has("v2"));
});

test("an older position from elsewhere doesn't replace a newer one here; a page keeps its furthest point", () => {
  useDevice(device());
  P.saveProgress({ id: "e1", kind: "audio", pos: 700, dur: 1200 });
  assert.equal(P.takeProgress([{ id: "e1", kind: "audio", ts: 1, pos: 5, dur: 1200 }]), 0);
  P.saveProgress({ id: "p1", kind: "page", frac: 0.6 });
  assert.equal(P.takeProgress([{ id: "p1", kind: "page", ts: Date.now() + 1000, frac: 0.2 }]), 1);
  const page = P.allProgress().find((x) => x.id === "p1");
  assert.equal(page.frac, 0.6);
});

test("a device's first send has everything it already had; after that only what changed", async () => {
  const app = server(new Set(["e1", "e2", "v1", "v2"]));
  S.useApi(app.api);
  useDevice(device());
  localStorage.setItem("progress", JSON.stringify({ e1: { id: "e1", kind: "audio", pos: 90, dur: 1200, ts: 1000 } })); // from before
  localStorage.setItem("watched", JSON.stringify(["v1"]));                                                           // from before
  await S.sendListening();
  assert.deepEqual(app.sent, [["e1", "v1"]]);
  assert.equal(app.state.v1.done > 0, true);
  P.saveProgress({ id: "e2", kind: "audio", pos: 10, dur: 600 });
  await S.sendListening();
  assert.deepEqual(app.sent[1], ["e2"]);
  await S.sendListening();
  assert.equal(app.sent.length, 2); // nothing new: nothing sent
});

test("finished on one device shows as finished on the other (the \"Listened to 0\" bug)", async () => {
  const app = server(new Set(["e1", "e2"]));
  S.useApi(app.api);
  const phone = device(), computer = device();
  useDevice(phone);
  P.saveProgress({ id: "e1", kind: "audio", title: "Episode 1", sub: "Feed", pos: 1195, dur: 1200 });
  W.markWatched("e1");
  P.saveProgress({ id: "e2", kind: "audio", title: "Episode 2", sub: "Feed", pos: 300, dur: 1200 });
  await S.sendListening();
  useDevice(computer);
  let heard = 0;
  window.addEventListener("tamkeen:listening", () => heard++, { once: true });
  assert.equal(await S.takeListening(), 3); // two positions and one finished
  assert.equal(heard, 1);
  assert.ok(W.watchedIds().has("e1"));
  const two = P.allProgress().find((x) => x.id === "e2");
  assert.equal(two.pos, 300);
  assert.equal(two.title, "Episode 2");
  assert.deepEqual(P.changedIds(), []); // nothing to send back
  assert.equal(await S.takeListening(), 0); // and taking it in again changes nothing
});
