// "Find an older game" (web/js/game/oldgames.js, oldgames-ui.js; mobile/src/js/oldgames-drive.js): the older versions
// Google Drive keeps of the synced library, shown by their game, and one brought back by combining it with the game
// as it is now. Drive is faked here: no real account is ever used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { MOST_VERSIONS, cameBack, clearlyMore, hintPicks, perDay, summary } from "../../web/js/game/oldgames.js";
import { resolve, sameGame } from "../../web/js/game/merge.js";
import { normalize, newState } from "../../web/js/game/rules.js";
import { listVersions, loadVersion } from "../../mobile/src/js/oldgames-drive.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const at = (iso) => Date.parse(iso) / 1000;

/** A good game from before the loss, and the game as the user has it now (a new egg that replaced it). */
function lostAndNow() {
  const good = normalize(newState(7));
  delete good.clock; delete good.tally; // (saved before d907ae7a: no clock, no tally)
  Object.assign(good, { xp: 52000, coins: 340, gyms: { beaten: 6, wins: { pip: 2, marin: 1, tor: 1, volta: 1, sola: 1, umbra: 1 } } });
  good.roster.push({ ...good.roster[0], seed: 11 }, { ...good.roster[0], seed: 12 });
  good.idle = { glow: 900, stardust: 1, released: [], plots: [{ open: true, id: "word_sprout", tier: 3, stored: 0 }, { open: true, id: "echo_shell", tier: 2, stored: 0 }] };
  const now = normalize(newState(99));
  Object.assign(now, { xp: 140, coins: 4 });
  now.clock = { web: 9 };
  now.tally = { xp: { web: [140, 0] }, coins: { web: [4, 0] }, gems: {} };
  return { good: JSON.parse(JSON.stringify(good)), now };
}

test("the versions offered: the last of each day, the newest first, at most a set number", () => {
  const vs = [
    { id: "a", at: at("2026-11-20T08:00:00") }, { id: "b", at: at("2026-11-20T21:00:00") },
    { id: "c", at: at("2026-11-22T10:00:00") }, { id: "d", at: at("2026-11-21T12:00:00") }, { id: "", at: 5 }, { id: "z", at: 0 },
  ];
  assert.deepEqual(perDay(vs).map((v) => v.id), ["c", "d", "b"]);
  const many = Array.from({ length: 90 }, (_, i) => ({ id: `r${i}`, at: at("2026-08-01T12:00:00") + i * 86400 }));
  assert.equal(perDay(many).length, MOST_VERSIONS);
  assert.equal(perDay(many)[0].id, "r89");
  assert.deepEqual(perDay(null), []);
});

test("a game is shown by its level, gym leaders, garden buildings and creatures", () => {
  const { good, now } = lostAndNow();
  const s = summary(good);
  assert.equal(s.gyms, 6);
  assert.equal(s.buildings, 2);
  assert.equal(s.tiers, 5);
  assert.equal(s.creatures, 3);
  assert.ok(s.level > summary(now).level);
  assert.equal(summary(null), null);
  assert.equal(summary({ words: [] }), null, "a version with no game in it");
  assert.equal(summary({ creature: { seed: 1 }, xp: 5 }).creatures, 1, "a save from before several creatures");
  assert.equal(summary({ roster: [{ seed: 1 }], gyms: { beaten: 99 } }).gyms, 10);
});

test("clearly more: more gyms, a bigger garden, more creatures or a higher level", () => {
  const base = { level: 5, gyms: 2, tiers: 3, creatures: 2 };
  assert.ok(clearlyMore({ ...base, gyms: 3 }, base));
  assert.ok(clearlyMore({ ...base, tiers: 4 }, base));
  assert.ok(!clearlyMore(base, base));
  assert.ok(!clearlyMore({ ...base, gyms: 1, level: 5 }, base));
  assert.ok(!clearlyMore(null, base));
});

test("bringing back the lost game: its gyms, garden and creatures come back, and what was earned since stays", () => {
  const { good, now } = lostAndNow();
  const before = summary(now);
  // What game.js restoreGame does: resolve against the game now, then load the result.
  const { keep, state } = resolve(now, good);
  assert.equal(keep, "merged", "an old copy is combined, never put in place of the game");
  const after = summary(normalize(JSON.parse(JSON.stringify(state))));
  assert.equal(after.gyms, 6);
  assert.equal(after.buildings, 2);
  assert.equal(after.creatures, 4, "its three creatures and the egg hatched since");
  assert.equal(state.xp, 52000 + 140, "the XP earned since is kept on top");
  const lines = cameBack(before, after);
  assert.deepEqual(lines.map((l) => l.key), ["gyms", "buildings", "creatures", "level", "xp"]);
  assert.deepEqual(lines[0], { key: "gyms", label: "Gym leaders beaten", from: 0, to: 6 });
  // A copy the game has already seen everything of brings nothing back.
  const again = resolve(normalize(JSON.parse(JSON.stringify(state))), state);
  assert.equal(again.keep, "mine");
  // ...and the same old copy brought back a second time is combined again (it has no clock) but adds nothing,
  // so the screen says "Nothing to bring back".
  const restored = normalize(JSON.parse(JSON.stringify(state)));
  const twice = normalize(JSON.parse(JSON.stringify(resolve(restored, good).state)));
  assert.ok(sameGame(twice, JSON.parse(JSON.stringify(restored))));
  assert.ok(!sameGame(restored, JSON.parse(JSON.stringify(now))));
  assert.match(read("web/js/game/game.js"), /if \(sameGame\(next, JSON\.parse\(JSON\.stringify\(g\)\)\)\) return \{ changed: false \}/);
  assert.match(read("web/js/game/game.js"), /export function restoreGame\(old\) \{\n  const g = getGame\(\);\n  const \{ keep, state \} = resolve\(g, old\);/);
});

/** A fake Drive with older versions of the library: each a whole library, with words that must never be read in. */
function fakeDrive() {
  const versions = {
    r1: { vocab: [{ uid: "w1", text: "كتاب" }], game: { xp: 900, roster: [{ seed: 7 }], gyms: { beaten: 3 } } },
    r2: { vocab: [{ uid: "w1", text: "كتاب" }] },
  };
  const calls = [];
  return {
    calls,
    async list() { calls.push("list"); return [{ id: "lib-1", name: "library.json.gz" }, { id: "t-1", name: "t_x.json.gz" }]; },
    async revisions(id) { calls.push(`revisions ${id}`); return [{ id: "r1", modifiedTime: "2026-11-01T10:00:00.000Z", size: "1200" }, { id: "r2", modifiedTime: "2026-11-20T10:00:00Z", size: "900" }]; },
    async downloadRevision(id, rev) { calls.push(`download ${id} ${rev}`); return gzipSync(JSON.stringify(versions[rev])); },
  };
}
const gunzip = async (buf) => JSON.parse(gunzipSync(Buffer.from(buf)).toString("utf8"));

test("the phones and the web app list Drive's versions and read only the game out of one", async () => {
  const drive = fakeDrive();
  assert.deepEqual(await listVersions(drive, false), { signed_in: false, versions: [] }, "not signed in: Drive isn't asked");
  assert.deepEqual(drive.calls, []);
  const res = await listVersions(drive, true);
  assert.equal(res.signed_in, true);
  assert.deepEqual(res.versions, [{ id: "r1", at: at("2026-11-01T10:00:00Z"), size: 1200 }, { id: "r2", at: at("2026-11-20T10:00:00Z"), size: 900 }]);
  const one = await loadVersion(drive, gunzip, "r1");
  assert.deepEqual(one, { id: "r1", game: { xp: 900, roster: [{ seed: 7 }], gyms: { beaten: 3 } } });
  assert.ok(!("vocab" in one), "the old version's words are left out");
  assert.deepEqual(await loadVersion(drive, gunzip, "r2"), { id: "r2", game: null });
  assert.ok(drive.calls.includes("download lib-1 r1"));
  await assert.rejects(() => loadVersion(drive, gunzip, "../files"), /isn't a version/);
});

test("Find an older game is a prototype, in Settings and on Home, and the routes exist on both", () => {
  assert.match(read("web/js/prototype.js"), /old_games: \{[^}]*released: false/);
  assert.match(read("web/js/components/gameswitch.js"), /feature\("old_games"\)[\s\S]*Find an older game[\s\S]*openOldGames/);
  assert.match(read("web/js/pages/home.js"), /feature\("old_games"\)\) import\("\.\.\/game\/oldgames-ui\.js"\)\.then\(\(m\) => m\.homeHint/);
  assert.match(read("mobile/src/js/backend.js"), /\/\^\\\/sync\\\/game-versions\$\//);
  assert.match(read("app/api/sync.py"), /@router\.get\("\/game-versions"\)[\s\S]*@router\.get\("\/game-versions\/\{rev\}"\)/);
});

test("the note on Home looks at a few versions only: the newest, two days, a week and the oldest", () => {
  const now = at("2026-11-23T12:00:00");
  const vs = perDay(Array.from({ length: 25 }, (_, i) => ({ id: `d${i}`, at: now - i * 86400 })));
  assert.deepEqual(hintPicks(vs, now).map((v) => v.id), ["d0", "d2", "d7", "d24"]);
});
