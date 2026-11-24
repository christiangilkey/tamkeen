// Gifts from Tamkeen's creator (web/js/game/gifts.js, prototype "owner_gifts"): what a gift may hold, and that one
// is added to a game exactly once whatever the devices do (merge.js; the desktop's copy of the rules is run on the
// same cases in tests/test_gamemerge.py through tests/fixtures/game_merge.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GIFT_MAX, GIFT_MOVES, applyGift, cleanGift, cleanRecord, cleanWaiting, giftKey, giftLines, giftSeed } from "../../web/js/game/gifts.js";
import { combine, resolve, stamp } from "../../web/js/game/merge.js";
import { newState, normalize, wearProblem } from "../../web/js/game/rules.js";
import { BEASTS, GROWN, ITEMS, TAGS } from "../../web/js/game/data.js";
import { beastOf, stageOf } from "../../web/js/game/genome.js";
import { garden } from "../../web/js/game/idle.js";

const G1 = "0f8fad5b-d9cb-469f-a165-70867728950e";
const G2 = "1f8fad5b-d9cb-469f-a165-70867728950e";
const clone = (v) => JSON.parse(JSON.stringify(v));
const HAT = ITEMS.find((x) => x.slot === "hat").id;
const BACK = ITEMS.find((x) => x.slot === "back").id;
const MOVE = GIFT_MOVES[0].id;
/** A game that has been played, saved by device "desk". */
function played() {
  const s = normalize(newState(7));
  s.xp = 500; s.coins = 100; s.gems = 10;
  garden(s).glow = 40;
  stamp(s, "desk");
  return s;
}

test("a gift holds only what the game knows, cut to size", () => {
  assert.equal(cleanGift(null), null);
  assert.equal(cleanGift({}), null);
  assert.equal(cleanGift({ coins: 0, items: ["hat/not_a_hat"], moves: ["tackle"], tags: ["__proto__"], creatures: [{ beast: "dragon" }] }), null,
    "nothing known is nothing (tackle is every creature's own move, not one to give)");
  const g = cleanGift({ coins: "50", gems: -3.4, xp: 1e12, glow: -1e12, level: 99, items: [HAT, HAT, "<b>"], moves: [MOVE], tags: ["flawless"],
    creatures: [{ beast: BEASTS[0].id, stage: "grown" }, { beast: BEASTS[1].id, stage: "giant" }], html: "<img>" });
  assert.deepEqual(g, { coins: 50, gems: -3, xp: GIFT_MAX, glow: -GIFT_MAX, items: [HAT], moves: [MOVE], tags: ["flawless"],
    creatures: [{ beast: BEASTS[0].id, stage: "grown" }, { beast: BEASTS[1].id, stage: "egg" }] });
  assert.equal(cleanGift({ creatures: new Array(50).fill({ beast: BEASTS[0].id }) }).creatures.length, 6);
  for (const id of Object.keys(TAGS)) assert.ok(cleanGift({ tags: [id] }));
});

test("what arrives from the online service is checked", () => {
  const list = cleanWaiting([{ id: G1, what: { coins: 5 }, note: " <b>Thanks</b> " }, { id: "nope", what: { coins: 5 } }, { id: G2, what: { level: 9 } }, null]);
  assert.deepEqual(list, [{ id: G1, what: { coins: 5 }, note: "bThanks/b" }, { id: G2, what: null, note: "" }]);
  assert.deepEqual(cleanWaiting("x"), []);
  const rec = cleanRecord([{ id: G1, username: "sam_k", what: { gems: 2 }, note: "", created_at: "2026-11-24T00:00:00Z", got_at: null }, { id: G2, username: "<i>" }]);
  assert.equal(rec[0].username, "sam_k");
  assert.equal(rec[0].got_at, "");
  assert.equal(rec[1].username, "?");
});

test("a gift is added once: coins, gems, XP, glow, things, a move, an unlock and creatures", () => {
  const s = played();
  const what = { coins: 50, gems: 5, xp: 300, glow: 25, items: [HAT, BACK], moves: [MOVE], tags: ["night_owl"],
    creatures: [{ beast: BEASTS[0].id, stage: "egg" }, { beast: BEASTS[4].id, stage: "hatchling" }, { beast: BEASTS[9].id, stage: "grown" }] };
  const got = applyGift(s, G1, what);
  assert.deepEqual([got.coins, got.gems, got.xp, got.glow], [50, 5, 300, 25]);
  assert.deepEqual([s.coins, s.gems, s.xp, garden(s).glow], [150, 15, 800, 65]);
  assert.ok(s.owned.includes(HAT) && s.owned.includes(BACK) && s.attacks.includes(MOVE) && s.tags.includes("night_owl"));
  assert.equal(s.roster.length, 4);
  assert.deepEqual(s.roster.slice(1).map((c) => beastOf(c).id), [BEASTS[0].id, BEASTS[4].id, BEASTS[9].id], "each is the creature asked for");
  assert.deepEqual(s.roster.slice(1).map((c) => stageOf(c.growth).id), ["egg", "hatchling", "juvenile"]);
  assert.ok(s.roster[3].growth >= GROWN && s.roster[3].grown === true);
  assert.equal(applyGift(s, G1, what), null, "the same gift again does nothing");
  assert.deepEqual([s.coins, s.gems, s.xp, garden(s).glow, s.roster.length], [150, 15, 800, 65, 4]);
  // giving something to wear never puts it on, and the dress-up rules still decide what may be worn
  for (const c of s.roster) assert.deepEqual(c.equipped, {});
  const winged = BEASTS.find((b) => b.wings);
  const t2 = played();
  applyGift(t2, G2, { items: [BACK], creatures: [{ beast: winged.id, stage: "juvenile" }] });
  assert.ok(wearProblem(t2.roster[1], ITEMS.find((x) => x.id === BACK)), "a winged creature still wears nothing on its back");
  // it loads again as a game, the gift remembered
  const again = normalize(clone(s));
  assert.equal(again.gifts[G1], 25);
  assert.equal(again.coins, 150);
});

test("taking away never goes below nothing, and something already owned is not added twice", () => {
  const s = played();
  s.owned.push(HAT);
  const got = applyGift(s, G1, { coins: -500, gems: -4, items: [HAT] });
  assert.deepEqual([got.coins, got.gems, got.items], [-100, -4, []]);
  assert.deepEqual([s.coins, s.gems], [0, 6]);
  assert.equal(s.owned.filter((x) => x === HAT).length, 1);
  stamp(s, "desk"); // (saving puts nothing of the gift under the device's name)
  assert.deepEqual(s.tally.coins[giftKey(G1)], [0, 100]);
  assert.equal(Object.values(s.tally.coins).reduce((n, e) => n + e[0] - e[1], 0), 0);
});

test("two devices that each collected the gift before syncing count it once", () => {
  const base = played();
  const desk = normalize(clone(base));
  const phone = normalize(clone(base));
  const what = { coins: 50, gems: 5, xp: 300, glow: 25, items: [HAT], moves: [MOVE], creatures: [{ beast: BEASTS[2].id, stage: "hatchling" }] };
  applyGift(desk, G1, what);
  desk.coins += 7; // (and each went on playing)
  stamp(desk, "desk");
  applyGift(phone, G1, what);
  phone.xp += 20;
  stamp(phone, "phone");
  for (const [mine, theirs] of [[desk, phone], [phone, desk]]) {
    const { keep, state } = resolve(clone(mine), clone(theirs));
    assert.equal(keep, "merged");
    assert.deepEqual([state.coins, state.gems, state.xp], [100 + 50 + 7, 10 + 5, 500 + 300 + 20]);
    assert.equal(state.idle.glow, 65, "the glow once");
    assert.equal(state.roster.length, 2, "one creature, not two");
    assert.equal(state.owned.filter((x) => x === HAT).length, 1);
    assert.deepEqual(Object.keys(state.gifts), [G1]);
    assert.equal(applyGift(normalize(clone(state)), G1, what), null, "and the merged game has had it");
  }
});

test("a device that had not collected the gift cannot undo it", () => {
  const base = played();
  const desk = normalize(clone(base));
  const phone = normalize(clone(base));
  applyGift(desk, G1, { coins: 50, glow: 25, items: [HAT], creatures: [{ beast: BEASTS[2].id, stage: "egg" }] });
  stamp(desk, "desk");
  phone.xp += 2000; // (the phone is further along, so its copy is the base of the merge, garden and all)
  stamp(phone, "phone");
  for (const [mine, theirs] of [[desk, phone], [phone, desk]]) {
    const { keep, state } = resolve(clone(mine), clone(theirs));
    assert.equal(keep, "merged");
    assert.equal(state.coins, 150);
    assert.equal(state.idle.glow, 65, "the glow reaches the garden that was kept");
    assert.ok(state.owned.includes(HAT));
    assert.equal(state.roster.length, 2);
    assert.equal(state.gifts[G1], 25);
  }
  // an older copy that had seen none of it is simply replaced
  assert.equal(resolve(clone(base), clone(desk)).keep, "theirs");
  assert.equal(resolve(clone(desk), clone(base)).keep, "mine");
  // glow taken away reaches the kept garden too, and never below nothing
  const d2 = normalize(clone(base));
  applyGift(d2, G2, { glow: -30 });
  stamp(d2, "desk");
  assert.equal(combine(clone(phone), clone(d2)).idle.glow, 10);
});

test("a new egg that collected a gift is joined to the real game when it arrives, not thrown away", () => {
  const real = played();
  const fresh = normalize(newState(99)); // (a web app just installed: nothing played)
  applyGift(fresh, G1, { items: [HAT], gems: 5 });
  stamp(fresh, "web");
  for (const [mine, theirs] of [[fresh, real], [real, fresh]]) {
    const { keep, state } = resolve(clone(mine), clone(theirs));
    assert.equal(keep, "merged");
    assert.ok(state.owned.includes(HAT));
    assert.equal(state.gems, 15);
    assert.equal(state.xp, 500);
  }
  // (without a gift, a new egg still never joins a game with progress)
  assert.equal(resolve(normalize(newState(98)), clone(real)).keep, "theirs");
});

test("a gift's creature is the same on every device, and the one asked for", () => {
  for (const b of BEASTS) {
    const seed = giftSeed(G1, 0, b.id);
    assert.ok(Number.isInteger(seed) && seed >= 0);
    assert.equal(seed, giftSeed(G1, 0, b.id));
    assert.equal(beastOf({ seed, type: b.type }).id, b.id);
  }
  assert.notEqual(giftSeed(G1, 0, BEASTS[0].id), giftSeed(G1, 1, BEASTS[0].id), "two of the same creature in one gift are two creatures");
  assert.equal(giftSeed(G1, 0, "dragon"), null);
});

test("a gift in words", () => {
  const lines = giftLines({ coins: 1500, gems: -20, items: [HAT], moves: [MOVE], creatures: [{ beast: BEASTS[0].id, stage: "egg" }, { beast: BEASTS[0].id, stage: "grown" }] });
  assert.equal(lines[0], "+1,500 coins");
  assert.equal(lines[1], "−20 gems");
  assert.ok(lines.includes(ITEMS.find((x) => x.id === HAT).name));
  assert.ok(lines.some((l) => l.endsWith(" egg")), "an egg doesn't say what will hatch");
  assert.ok(lines.includes(`${BEASTS[0].name} (Fully grown)`));
  assert.deepEqual(giftLines({ level: 3 }), []);
});

test("the database file keeps the rules (it can't be run here: there is no database on this machine)", () => {
  const sql = readFileSync(new URL("../../supabase/v16-owner-gifts.sql", import.meta.url), "utf8");
  const bare = sql.replace(/--[^\n]*/g, "");
  assert.equal(sql.split("$$").length % 2, 1, "every function body is opened and closed");
  assert.ok(sql.includes("alter table public.game_gifts enable row level security;"));
  assert.ok(!/create policy/i.test(bare), "no rule on the table: everything goes through the functions");
  const fns = ["creator_give", "creator_gifts", "creator_take_back", "my_gifts", "gifts_got"];
  for (const name of fns) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    const fn = body.slice(0, body.indexOf("end $$;"));
    assert.ok(/security definer set search_path = ''/.test(fn), `${name} pins its search path`);
    assert.ok(/(me|auth\.uid\(\)) is null then raise exception 'Not signed in'/.test(fn), `${name} refuses a signed-out caller`);
    assert.ok(new RegExp(`grant execute on function[^;]*public\\.${name}\\(`).test(sql), `${name} may be run by signed-in people`);
    assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(sql), `${name} is closed to everyone else`);
    assert.equal(/private\.is_creator\(/.test(fn), name.startsWith("creator_"), `${name}: creators only, or not`);
  }
  // the receiving side only ever touches my own rows, and never says who gave
  for (const name of ["my_gifts", "gifts_got"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    const fn = body.slice(0, body.indexOf("end $$;"));
    assert.ok(/g\.user_id = me/.test(fn), `${name} is about my own gifts`);
    assert.ok(!/given_by/.test(fn));
  }
  // every UPDATE and DELETE has a WHERE (the API refuses one without)
  const risky = bare.split(";").map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky, []);
  const selftest = readFileSync(new URL("../../supabase/test_rls_gifts.sql", import.meta.url), "utf8");
  assert.ok(/raise exception 'RESULTS ok=% bad=\[%\]/.test(selftest));
  for (const name of fns) assert.ok(selftest.includes(`'${name}'`), `the self-test checks ${name} is closed to the signed-out`);
  // the app calls only what the file has, holds no key, and is a prototype on every version
  const sync = readFileSync(new URL("../../web/js/giftsync.js", import.meta.url), "utf8");
  for (const m of sync.matchAll(/rpc\("([a-z_]+)"/g)) assert.ok(fns.includes(m[1]), `${m[1]} is in the SQL file`);
  assert.ok(!/service_role|sb_secret|sbp_/.test(sync + readFileSync(new URL("../../web/js/components/giftpanel.js", import.meta.url), "utf8")));
  assert.ok(/owner_gifts: \{[^}]*released: false/.test(readFileSync(new URL("../../web/js/prototype.js", import.meta.url), "utf8")));
  assert.ok(sync.includes('feature("owner_gifts")'));
  const build = readFileSync(new URL("../../mobile/scripts/build-www.mjs", import.meta.url), "utf8");
  for (const f of ["js/giftsync.js", "js/components/giftpanel.js"]) assert.ok(build.includes(`"${f}"`), `${f} is in the phones' and the web app's build`);
});
