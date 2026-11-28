// The ranked champion in the championship hall (prototype "ranked_champion"): what the server's answer means
// (web/js/game/champion.js), the online calls (web/js/rankedsync.js) and the SQL file (supabase/v22-ranked-champion.sql,
// never run here: these read it).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../web/js/game/champion.js";
import * as S from "../../web/js/rankedsync.js";
import { newGenome } from "../../web/js/game/genome.js";

const mon = (seed, type, name) => ({ ...newGenome(seed, type), growth: 1, name });

test("readChampion: a username or nothing; numbers in range; the team checked as a friend's", () => {
  assert.equal(C.readChampion(null), null);
  assert.equal(C.readChampion({ username: "<b>x</b>", rating: 5 }), null);
  assert.equal(C.readChampion({ rating: 5 }), null);
  const team = [mon(1, "ember", "Cinder"), "junk", { nonsense: true }, mon(2, "tide", "Ripple"), mon(3, "grove", "Bramble"), mon(4, "spark", "Extra")];
  const c = C.readChampion({ username: "layla_reads", rating: 1240.7, games: 58, wins: 99, me: "yes", team, hidden: false });
  assert.equal(c.username, "layla_reads");
  assert.equal(c.rating, 1240);
  assert.equal(c.tier, "champion");
  assert.equal(c.wins, 58, "never more wins than battles");
  assert.equal(c.me, false, "only a real true");
  assert.ok(c.team.length <= 3 && c.team.length >= 2, "at most three, junk dropped");
  assert.ok(c.team.every((g) => g && typeof g === "object" && typeof g.name === "string"));
  assert.equal(C.readChampion({ username: "x_y", rating: -9, games: -1, wins: 3 }).rating, 0);
});

test("readChampion: a private team, and the older server's name-and-rating only", () => {
  const hid = C.readChampion({ username: "layla_reads", rating: 900, games: 3, wins: 1, team: [], hidden: true });
  assert.equal(hid.hidden, true);
  assert.deepEqual(hid.team, []);
  const part = C.readChampion({ username: "layla_reads", rating: 900, team: [mon(1, "ember", "A")] }, true);
  assert.equal(part.partial, true);
  assert.deepEqual(part.team, [], "the leaderboard row carries no team");
  assert.equal(part.hidden, false);
});

test("record: wins and losses from the battles", () => {
  assert.deepEqual(C.record({ games: 58, wins: 41 }), { wins: 41, losses: 17 });
  assert.equal(C.record({ games: 0, wins: 0 }), null);
  assert.equal(C.record(null), null);
});

test("the dais: inside the hall's right half, its party on it, its tiles under it", () => {
  const W = 320, TILE = 16;
  assert.ok(C.DAIS.x >= W / 2 && C.DAIS.x + C.DAIS.w <= W - TILE, "on the right, off the wall");
  for (const s of C.STANDS) assert.ok(s.x >= C.DAIS.x && s.x <= C.DAIS.x + C.DAIS.w && s.y >= C.DAIS.y && s.y <= C.DAIS.y + C.DAIS.h);
  for (const [c, r] of C.DAIS_TILES) {
    assert.ok(c * TILE >= C.DAIS.x - TILE && (c + 1) * TILE <= C.DAIS.x + C.DAIS.w + TILE);
    assert.ok(r * TILE >= C.DAIS.y - TILE && r * TILE <= C.DAIS.y + C.DAIS.h);
  }
  assert.ok(C.onDais(C.DAIS.x + 40, C.DAIS.y + 10), "the dais");
  assert.ok(C.onDais(C.STANDS[0].x, C.STANDS[0].y - 20), "its lead creature");
  assert.ok(C.onDais(C.PENNANTS[0].x + 8, C.PENNANTS[0].y + 10), "a pennant");
  assert.ok(!C.onDais(40, 100) && !C.onDais(160, 130), "not the rest of the hall");
  assert.ok(!C.onDais(C.DAIS_FRONT.x, C.DAIS_FRONT.y), "where the creature stands to look is floor");
});

test("the Settings switch: on unless switched off", () => {
  assert.equal(C.showTeamOn(null), true);
  assert.equal(C.showTeamOn({}), true);
  assert.equal(C.showTeamOn({ ranked_show_team: true }), true);
  assert.equal(C.showTeamOn({ ranked_show_team: false }), false);
});

test("rankedsync.champion: v22's answer; before v22, the leaderboard's first row; nobody: null", async () => {
  const calls = [];
  S.useClient({ rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === "ranked_champion") return { data: { username: "layla_reads", rating: 1240, games: 58, wins: 41, team: [mon(1, "ember", "C")], hidden: false }, error: null };
    return { data: { ok: true }, error: null };
  } });
  const c = await S.champion();
  assert.equal(c.username, "layla_reads");
  assert.equal(c.team.length, 1);
  await S.showcase([mon(1, "ember", "C")], false);
  assert.equal(calls.at(-1)[0], "ranked_showcase_set");
  assert.equal(calls.at(-1)[1].show, false);
  assert.equal(calls.at(-1)[1].team.length, 1);
  await S.showcase(null, true);
  assert.deepEqual(calls.at(-1)[1], { team: null, show: true });

  S.useClient({ rpc: async (name) => name === "ranked_champion"
    ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.ranked_champion" } }
    : { data: [{ username: "first_one", rating: 700 }, { username: "second", rating: 600 }], error: null } });
  const old = await S.champion();
  assert.equal(old.username, "first_one");
  assert.equal(old.partial, true);
  assert.deepEqual(old.team, []);

  S.useClient({ rpc: async () => ({ data: null, error: null }) });
  assert.equal(await S.champion(), null);
  S.useClient({ rpc: async (name) => name === "ranked_champion" ? { data: null, error: { code: "PGRST202", message: "x" } } : { data: [], error: null } });
  assert.equal(await S.champion(), null);
  S.useClient({ rpc: async () => { throw new Error("offline"); } });
  await assert.rejects(S.champion(), (e) => /internet/.test(e.message));
  S.useClient(null);
});

// ---------- the SQL file (never run here) ----------
const SQL = readFileSync(new URL("../../supabase/v22-ranked-champion.sql", import.meta.url), "utf8");
const bare = SQL.replace(/--[^\n]*/g, "");

test("v22: one closed table, two checked calls, every update with a WHERE, nothing dropped", () => {
  assert.ok(!/create policy/i.test(bare), "no reading or writing rule");
  assert.ok(bare.includes("alter table public.ranked_showcase enable row level security"));
  assert.ok(!/\b(drop|truncate)\b/i.test(bare), "nothing dropped or emptied");
  assert.deepEqual([...bare.matchAll(/\balter table\b[^;]*;/gi)].map((m) => m[0]), ["alter table public.ranked_showcase enable row level security;"], "no other table changed");
  for (const m of bare.matchAll(/\b(update|delete from)\s+public\.\w+[^;]*;/gi)) assert.ok(/\bwhere\b/i.test(m[0]), `needs a where: ${m[0].slice(0, 80)}`);
  for (const m of bare.matchAll(/do update[^;]*;/gi)) assert.ok(/\bwhere\b/i.test(m[0]), "an upsert's update needs a where");
  const open = [...bare.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(open, ["ranked_champion", "ranked_showcase_set"]);
  assert.ok(bare.includes("from public, anon;") && bare.includes("to authenticated;"), "signed-in people only");
  assert.ok(/not private\.blocked_between\(me, r\.user_id\)/.test(bare), "blocked people are left out");
  assert.ok(/when c\.shown then c\.team else '\[\]'::jsonb/.test(bare), "a hidden team is never sent");
  assert.ok(/jsonb_array_length\(v_team\) > 3/.test(bare) && /> 12000/.test(bare), "at most three creatures, a size cap");
  assert.ok(/if me is null then raise exception 'Not signed in'/.test(bare));
  assert.ok(bare.includes("run supabase/v8-safety.sql, then supabase/v18-ranked.sql, then this file.") && bare.includes("run supabase/v18-ranked.sql, then this file."), "it asks for v8 and v18 first, naming the missing one");
  assert.ok(!/'id', c\.user_id|'user_id'|email/.test(bare), "only the username leaves, never the id or email");
});

test("v22's self-test rolls itself back and reports", () => {
  const T = readFileSync(new URL("../../supabase/test_rls_ranked_champion.sql", import.meta.url), "utf8");
  assert.ok(/raise exception 'RESULTS ok=% bad=\[%\]'/.test(T));
  for (const m of T.replace(/--[^\n]*/g, "").matchAll(/\b(update|delete from)\s+public\.\w+[^;]*;/gi)) assert.ok(/\bwhere\b/i.test(m[0]), `needs a where: ${m[0].slice(0, 80)}`);
});

// ---------- the hall with the dais (hall.js) ----------
import * as Hall from "../../web/js/game/hall.js";

test("the hall: as before without the champion; with it, the dais on the right, walked round, tapped", () => {
  const plain = Hall.hallMap(false), champ = Hall.hallMap(true);
  assert.equal(plain, Hall.hallMap(), "the plain hall is the default");
  assert.ok(plain.props.some((p) => p.id === "statue_knight" && p.x === 14), "the plain hall keeps its right side");
  for (const [c, r] of C.DAIS_TILES) assert.equal(champ.propTiles[r * Hall.HALL_COLS + c], null, `nothing stands on the dais at ${c},${r}`);
  for (const p of champ.props) for (let k = 0; k < p.w; k++) {
    const x = (p.x + k) * 16;
    assert.ok(!(x + 16 > C.DAIS.x && x < C.DAIS.x + C.DAIS.w && (p.y + 1) * 16 > C.DAIS.y && p.y * 16 < C.DAIS.y + C.DAIS.h), `${p.id} overlaps the dais`);
  }
  assert.equal(Hall.tapHall(C.DAIS.x + 40, C.DAIS.y + 10, true), "champion");
  assert.equal(Hall.tapHall(C.DAIS.x + 40, C.DAIS.y + 10, false), "floor");
  assert.equal(Hall.tapHall(160, 140, true), "door", "the door still works");
  const key = (p) => `${p.x},${p.y}`;
  assert.ok(Hall.hallBlocked(key, undefined, true).has(`${C.DAIS.x + 40},${C.DAIS.y + 10}`), "the dais is walked round");
  assert.ok(!Hall.hallBlocked(key).has(`${C.DAIS.x + 40},${C.DAIS.y + 10}`));
  assert.ok(!Hall.hallBlocked(key, undefined, true).has(key({ x: C.DAIS_FRONT.x, y: C.DAIS_FRONT.y })), "where it stands to look is free");
});
