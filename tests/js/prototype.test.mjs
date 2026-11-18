// Prototype mode (web/js/prototype.js): new features stay hidden until the owner has tried them on their own device
// (five quick taps on the version in Settings), then are released for everyone. The owner, 2026-11-18.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A small stand-in for the browser's storage, so the switch can be tried here.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const proto = await import("../../web/js/prototype.js");
const { WEEKLY_RULES } = await import("../../web/js/game/data.js");
const { weeklyRule } = await import("../../web/js/game/rules.js");
const at = (s) => new Date(s);

test("off for everyone, on only in prototype mode, and released features for all", () => {
  store.clear();
  assert.equal(proto.prototypeOn(), false);
  for (const f of proto.waiting()) assert.equal(proto.feature(f.id), false, `${f.id} hidden`);
  assert.ok(proto.setPrototype(true));
  for (const f of proto.waiting()) assert.equal(proto.feature(f.id), true, `${f.id} on in prototype mode`);
  assert.equal(proto.feature("no_such_feature"), false, "a typo never switches anything on");
  assert.ok(proto.setPrototype(false));
  assert.equal(proto.prototypeOn(), false);
  store.set("tamkeenTryDictation", "1"); // the first hidden switch still counts
  assert.equal(proto.feature("dictation"), true);
  proto.setPrototype(false);
  assert.equal(store.has("tamkeenTryDictation"), false, "and switching off clears it");
  for (const [id, f] of Object.entries(proto.PROTOTYPES)) {
    assert.equal(typeof f.name, "string", id);
    assert.equal(typeof f.released, "boolean", id);
  }
});

test("five quick taps switch it, and say what it covers", () => {
  store.clear();
  let click = null; const said = [];
  proto.prototypeTaps({ addEventListener: (_, fn) => { click = fn; } }, (m) => said.push(m));
  for (let i = 0; i < 4; i++) click();
  assert.equal(proto.prototypeOn(), false, "four taps do nothing");
  click();
  assert.equal(proto.prototypeOn(), true);
  assert.match(said[0], /Prototype mode is on/);
  for (let i = 0; i < 5; i++) click();
  assert.equal(proto.prototypeOn(), false);
  assert.match(said[1], /off/);
});

test("open_weeks: in prototype mode no week allows only some elements", () => {
  store.clear();
  assert.ok(WEEKLY_RULES.some((r) => r.types), "everyone else still has the element weeks");
  proto.setPrototype(true);
  for (let w = 0; w < 30; w++) {
    const rule = weeklyRule(new Date(at("2026-10-12T10:00:00").getTime() + w * 7 * 864e5));
    assert.ok(!rule.types, `week ${w}: ${rule.id}`);
  }
  assert.notEqual(weeklyRule(at("2026-10-12T10:00:00")), weeklyRule(at("2026-10-19T10:00:00")), "still a different rule each week");
  proto.setPrototype(false);
});

test("the phones get the file", () => {
  assert.match(readFileSync(new URL("../../mobile/scripts/build-www.mjs", import.meta.url), "utf8"), /"js\/prototype\.js"/);
});
