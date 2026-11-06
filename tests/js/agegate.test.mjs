// The age check for the online features (web/js/agegate.js): 16 or older, the birth month counted as younger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onlineFrom, onlineAge, ONLINE_MIN_AGE } from "../../web/js/agegate.js";

const now = new Date(2026, 10, 6); // 6 November 2026

test("16 or older may use the online features", () => {
  assert.equal(ONLINE_MIN_AGE, 16);
  assert.equal(onlineFrom(1990, 3, now), "ok");
  assert.equal(onlineFrom(2010, 10, now), "ok", "turned 16 last month");
});

test("younger learners get the month they turn 16, and their birth month still counts as younger", () => {
  assert.equal(onlineFrom(2010, 11, now), "2026-11", "16 this month: the birthday may not have come yet");
  assert.equal(onlineFrom(2010, 12, now), "2026-12");
  assert.equal(onlineFrom(2015, 1, now), "2031-01");
});

test("the saved value says ok, young or ask, and opens once the birthday month is over", () => {
  assert.equal(onlineAge("", now), "ask");
  assert.equal(onlineAge("nonsense", now), "ask");
  assert.equal(onlineAge("ok", now), "ok");
  assert.equal(onlineAge("2026-11", now), "young");
  assert.equal(onlineAge("2026-11", new Date(2026, 11, 1)), "ok");
  assert.equal(onlineAge("2031-01", now), "young");
});

test("impossible answers aren't accepted", () => {
  assert.equal(onlineFrom("", 5, now), "");
  assert.equal(onlineFrom(2030, 5, now), "", "a year in the future");
  assert.equal(onlineFrom(2000, 13, now), "");
  assert.equal(onlineFrom(1800, 1, now), "");
});

test("the age is checked before every way into the online features, and syncs between devices", () => {
  const root = new URL("../../", import.meta.url);
  const social = readFileSync(new URL("web/js/social.js", root), "utf8");
  assert.ok(/export async function connect\([^)]*\) \{\s*if \(!\(await requireOnlineAge\(\)\)\)/.test(social), "connect asks first");
  assert.ok(/connectWithIdToken\(\{ token, nonce \}\) \{\s*if \(\(await onlineStatus\(\)\) !== "ok"\)/.test(social), "and the sign-in itself checks");
  assert.ok(/currentUser\(\) \{\s*try \{\s*const age = await onlineStatus\(\)/.test(social), "nobody counts as signed in before the check");
  for (const f of ["web/js/aikeys.js", "app/aikeys.py", "app/db.py", "mobile/src/js/store.js"]) {
    assert.ok(readFileSync(new URL(f, root), "utf8").includes("online_from"), `${f} knows the setting`);
  }
  assert.ok(readFileSync(new URL("mobile/scripts/build-www.mjs", root), "utf8").includes('"js/agegate.js"'));
});
