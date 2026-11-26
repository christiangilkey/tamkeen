// Ranked battles: the rating sums (web/js/game/ranked.js), which the server (supabase/v18-ranked.sql) must match.
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../../web/js/game/ranked.js";

test("everyone starts at 0, and equal ratings move by K/2", () => {
  assert.equal(R.START, 0);
  assert.equal(R.change(0, 0, true, 0), 20);     // new player: K 40
  assert.equal(R.change(500, 500, true, 10), 12); // after 10 games: K 24
  assert.equal(R.change(500, 500, false, 10), -12);
});

test("an upset pays more; losing to a lower rating costs more", () => {
  assert.equal(R.change(300, 500, true, 20), 18);
  assert.equal(R.change(500, 300, false, 20), -18);
  assert.ok(R.change(500, 300, true, 20) < R.change(500, 500, true, 20));
});

test("never below 0, and a result always moves at least 1 point", () => {
  assert.equal(R.change(0, 0, false, 0), 0);
  assert.equal(R.change(5, 500, false, 0), -2); // losing to a far better player costs little
  assert.equal(R.change(5, 0, false, 30), -5);
  assert.equal(R.change(2000, 0, true, 30), 1);
  assert.equal(R.change(0, 2000, false, 30), 0);
});

test("stakes, tiers, signed numbers", () => {
  assert.deepEqual(R.stakes(500, 500, 30), { win: 12, lose: -12 });
  assert.equal(R.tierOf(0).id, "bronze");
  assert.equal(R.tierOf(199).id, "bronze");
  assert.equal(R.tierOf(200).id, "silver");
  assert.equal(R.tierOf(999).id, "diamond");
  assert.equal(R.tierOf(5000).id, "champion");
  assert.equal(R.signed(18), "+18");
  assert.equal(R.signed(-12), "−12");
  assert.equal(R.signed(0), "0");
});

test("the matchmaking window widens the longer you wait", () => {
  assert.equal(R.windowAt(0), 100);
  assert.equal(R.windowAt(14.9), 100);
  assert.equal(R.windowAt(15), 200);
  assert.equal(R.windowAt(30), 400);
  assert.equal(R.windowAt(50), Infinity);
});

test("what comes from the server is checked", () => {
  assert.deepEqual(R.readMine({ rating: -5, games: 3.7, wins: 9 }), { rating: 0, games: 3, wins: 3, tier: "bronze" });
  assert.deepEqual(R.readMine(null), { rating: 0, games: 0, wins: 0, tier: "bronze" });
  const top = R.readTop([{ username: "ok_name", rating: 420 }, { username: "<b>x</b>", rating: 9 }, { username: "me.too", rating: "x", me: true }]);
  assert.deepEqual(top, [{ username: "ok_name", rating: 420, tier: "gold", me: false }, { username: "me.too", rating: 0, tier: "bronze", me: true }]);
});

// ---------- the SQL file (never run here: these read it) ----------
import { readFileSync } from "node:fs";
const SQL = readFileSync(new URL("../../supabase/v18-ranked.sql", import.meta.url), "utf8");
const bare = SQL.replace(/--[^\n]*/g, "");

test("the SQL file: no table rules, every UPDATE and DELETE has a WHERE, only the listed calls are open", () => {
  assert.ok(!/create policy/i.test(bare), "no reading or writing rule: everything goes through the functions");
  for (const t of ["ranked_ratings", "ranked_queue", "ranked_matches"]) {
    assert.ok(bare.includes(`alter table public.${t} enable row level security`), `${t}: row-level security on`);
  }
  for (const m of bare.matchAll(/\b(update|delete from)\s+public\.\w+[^;]*;/gi)) assert.ok(/\bwhere\b/i.test(m[0]), `needs a where: ${m[0].slice(0, 80)}`);
  for (const m of bare.matchAll(/do update set[^;]*;/gi)) assert.ok(/\bwhere\b/i.test(m[0]), "an upsert's update needs a where too");
  const open = [...bare.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(open, ["ranked_join", "ranked_leave", "ranked_me", "ranked_poll", "ranked_report", "ranked_result", "ranked_top"]);
  assert.ok(/from public, anon;/.test(bare) && /to authenticated;/.test(bare), "signed-in people only");
  assert.ok(/blocked_between\(me, x\.user_id\)/.test(bare), "blocked people are never paired");
});

test("the SQL file's numbers are the app's numbers", () => {
  assert.ok(bare.includes(`when coalesce(games, 0) < ${R.NEW_GAMES} then ${R.K_NEW} else ${R.K} end`));
  assert.ok(bare.includes(`/ ${R.SPREAD}.0`));
  assert.ok(bare.includes(`waited >= 45 then null when waited >= 30 then 400 when waited >= 15 then 200 else 100`));
  assert.deepEqual(R.WINDOW_STEPS.map(([s, w]) => [s, w]), [[0, 100], [15, 200], [30, 400], [45, Infinity]]);
  assert.ok(bare.includes(`v_waited >= ${R.GIVE_UP_S}`));
  assert.ok(!/pair_count|v_counted|PAIR_PER_DAY/.test(bare) && !("PAIR_PER_DAY" in R), "no daily limit for the same two players (the owner: \"make it infinite\")");
  assert.ok(/rating\s+integer not null default 0 check \(rating >= 0/.test(bare), "starts at 0, never below");
});

// ---------- the online calls, against a stand-in ----------
import * as S from "../../web/js/rankedsync.js";

test("rankedsync: Ranked isn't switched on yet, until the SQL file is run", async () => {
  S.useClient({ rpc: async () => ({ error: { code: "PGRST202", message: "Could not find the function public.ranked_me" } }) });
  await assert.rejects(S.myRating(), (e) => e.notReady === true && e.message === "Ranked isn't switched on yet.");
  S.useClient({ rpc: async () => { throw new Error("offline"); } });
  await assert.rejects(S.joinQueue(), (e) => !e.notReady && /internet/.test(e.message));
});

test("rankedsync: answers are checked", async () => {
  const answers = {
    ranked_me: { rating: 212, games: 4, wins: 3, place: 7 },
    ranked_join: { status: "waiting", waited: 3, window: 100 },
    ranked_poll: { status: "matched", match: "m1", seed: 99, host: true, me: { rating: 212, games: 4 }, rival: { id: "u2", username: "rival_1", rating: 250, games: 30 } },
    ranked_report: { status: "settled", outcome: "won", change: 18, rating: 230 },
    ranked_top: [{ username: "rival_1", rating: 250 }, { username: "bad name!", rating: 1 }],
  };
  const calls = [];
  S.useClient({ rpc: async (name, args) => { calls.push([name, args]); return { data: answers[name], error: null }; } });
  assert.deepEqual(await S.myRating(), { rating: 212, games: 4, wins: 3, tier: "silver", place: 7 });
  assert.deepEqual(await S.joinQueue(), { status: "waiting", waited: 3, window: 100 });
  const m = await S.pollQueue();
  assert.equal(m.status, "matched");
  assert.equal(m.rival.username, "rival_1");
  assert.equal(m.host, true);
  assert.deepEqual(await S.report("m1", "won"), { status: "settled", outcome: "won", change: 18, rating: 230 });
  assert.deepEqual(calls.at(-1), ["ranked_report", { match: "m1", said: "won" }]);
  assert.equal((await S.top()).length, 1);
  assert.deepEqual(S.readQueue({ status: "waiting", waited: 50, window: null }), { status: "waiting", waited: 50, window: Infinity });
  assert.deepEqual(S.readQueue({ status: "weird" }), { status: "out" });
  assert.deepEqual(S.readResult({ status: "settled", outcome: "hacked", change: 9999 }), { status: "settled", outcome: "void", change: 200, rating: 0 });
  S.useClient(null);
});
