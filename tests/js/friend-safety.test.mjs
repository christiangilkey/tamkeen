// Run with: node --test tests/js/
// What friends send to the game is checked before anything uses it (web/js/game/remote.js): a
// friend can write anything into their own online row, so their team, favourite creature, numbers,
// battle results and gifts must never carry code into the page, reach into an object's prototype,
// or hold a number the game can't use. These tests send hostile rows on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOG, LEAGUES, MOVES, RAID_HP_PER_MEMBER, SLOTS, TYPE_IDS, VARIANTS, WEEKLY_RULES } from "../../web/js/game/data.js";
import { describe, newGenome } from "../../web/js/game/genome.js";
import { finishBattle, newState, receiveGift, recordDefence } from "../../web/js/game/rules.js";
import { fighter, fighters, fits, showcaseGenome } from "../../web/js/game/battle.js";
import { LIMITS, cleanGenome, cleanName, cleanProfile, cleanProfiles, cleanRival, cleanTeam, isType, raidShare } from "../../web/js/game/remote.js";
import { icon, iconEl } from "../../web/js/game/render.js";

const XSS = "<img src=x onerror=alert(1)>";
const QUOTE = `x" onerror="alert(1)`;
/** Anything that could start markup or break out of an HTML attribute. */
const UNSAFE = /[<>"'`]|onerror|javascript:/i;
/** Every string anywhere inside a value (keys too). */
function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); }
  return out;
}

const hostileCreature = (over = {}) => ({
  seed: 12345, type: XSS, growth: 0.6, variant: QUOTE, show: "<b>", partnerHue: "red", name: `${XSS}${"y".repeat(50)}`,
  equipped: { hat: XSS, face: "../../../evil", neck: "hat/cap", __proto__: { polluted: true }, onerror: "hat/cap", shirt: "shirt/striped" },
  loadout: [XSS, "tackle", "tackle", "__proto__", { id: "tackle" }, "nope"], known: "9999999", cards: 1e12, traits: { hack: 1 },
  ...over,
});

test("a friend's creature with a type made of HTML is given a real element, never the HTML", () => {
  const g = cleanGenome(hostileCreature());
  assert.ok(isType(g.type), "an element the game has");
  assert.equal(g.type, newGenome(12345).type, "the one its seed would have given it");
  assert.equal(g.variant, null);
  assert.equal(g.show, null);
  assert.ok(!("partnerHue" in g), "a hue that isn't a number is dropped");
  assert.equal(g.name, XSS.slice(0, LIMITS.name), "a name is cut to 20 characters (and only ever shown as text)");
  // Only real items, each in its own slot.
  assert.deepEqual(g.equipped, { shirt: "shirt/striped" });
  assert.deepEqual(g.loadout, ["tackle"], "only real moves, each once");
  assert.equal(g.cards, LIMITS.known, "a huge number is brought into range");
  assert.ok(!("known" in g), "a number sent as text is dropped");
  assert.ok(!("traits" in g), "only the fields the game shares are read");
  for (const s of strings({ ...g, name: "" })) assert.doesNotMatch(s, UNSAFE, `nothing hostile survives: ${s}`);
  assert.equal(({}).polluted, undefined, "no prototype was touched");
});

test("a creature's name keeps its text but loses control and direction-flipping characters", () => {
  assert.equal(cleanName("Noor"), "Noor");
  assert.equal(cleanName("نور"), "نور", "Arabic is fine");
  assert.equal(cleanName("a‮evil\u0000\u0007b"), "aevilb");
  assert.equal(cleanName("😀".repeat(30)), "😀".repeat(20), "counted in characters, never cutting one in half");
  assert.equal(cleanName({ toString: () => XSS }), "", "only a string is a name");
  assert.equal(cleanName(42), "");
  // A name is shown as text (textContent), so markup in it is harmless: it stays as typed, cut to 20.
  assert.equal(cleanName(XSS), XSS.slice(0, 20));
});

test("hostile creatures can't be made into a team: no seed, no growth, not an object", () => {
  assert.equal(cleanGenome(null), null);
  assert.equal(cleanGenome("ember"), null);
  assert.equal(cleanGenome([1, 2]), null);
  assert.equal(cleanGenome({ seed: "1", growth: 0.5 }), null, "a seed sent as text");
  assert.equal(cleanGenome({ seed: 1, growth: NaN }), null);
  assert.equal(cleanGenome({ seed: Infinity, growth: 0.5 }), null);
  const team = cleanTeam([hostileCreature(), null, { seed: 2, growth: 0.5, type: "tide" }, hostileCreature({ seed: 3 }), hostileCreature({ seed: 4 })]);
  assert.equal(team.length, 3, "at most three");
  assert.deepEqual(team.map((g) => g.seed), [12345, 2, 3]);
  assert.equal(team[1].type, "tide", "a real element is kept");
  assert.deepEqual(cleanTeam("not a team"), []);
  assert.equal(cleanTeam(Array.from({ length: 10000 }, () => hostileCreature())).length, 3);
});

test("prototype names are never elements, variants or items", () => {
  for (const bad of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", ""]) {
    assert.equal(isType(bad), false, bad);
    const g = cleanGenome({ seed: 9, growth: 0.5, type: bad, variant: bad, equipped: { hat: bad, [bad]: "hat/cap" } });
    assert.ok(TYPE_IDS.includes(g.type));
    assert.equal(g.variant, null);
    assert.deepEqual(g.equipped, {});
  }
  assert.equal(describe(newGenome(5, "__proto__")).type !== "__proto__", true, "a new creature never takes one either");
});

test("a whole hostile profile row comes out holding only known values in range", () => {
  const row = {
    user_id: "u1", team: [hostileCreature()], form: 50, rating: "9e99", league: "constructor", week: "2900", goal_days: 99,
    reviews: 1e9, language: XSS, xp_day: "javascript:alert(1)", xp_today: 1e12, showcase: hostileCreature({ show: "juvenile" }),
    streak: XSS, streak_until: XSS, updated_at: { evil: true }, extra: XSS, __proto__: { polluted: 1 },
  };
  const p = cleanProfile(row);
  assert.deepEqual(Object.keys(p).sort(), ["form", "goal_days", "language", "league", "rating", "reviews", "showcase", "streak",
    "streak_until", "team", "updated_at", "user_id", "week", "xp_day", "xp_today"]);
  assert.equal(p.form, 1);
  assert.equal(p.rating, 1000, "a rating sent as text");
  assert.equal(p.league, 0);
  assert.ok(LEAGUES[p.league]);
  assert.equal(p.week, null);
  assert.equal(p.goal_days, 7);
  assert.equal(p.reviews, LIMITS.reviews);
  assert.equal(p.language, null);
  assert.equal(p.xp_day, null);
  assert.equal(p.xp_today, LIMITS.xpToday);
  assert.equal(p.streak, 0);
  assert.equal(p.streak_until, null);
  assert.equal(p.updated_at, null);
  assert.equal(p.showcase.show, "juvenile");
  for (const s of strings({ ...p, team: p.team.map((g) => ({ ...g, name: "" })), showcase: { ...p.showcase, name: "" } })) {
    assert.doesNotMatch(s, UNSAFE, `nothing hostile survives: ${s}`);
  }
  assert.equal(({}).polluted, undefined);
  // A row from a well-behaved friend comes through as it was.
  const good = { user_id: "u2", team: [{ seed: 7, type: "dusk", growth: 0.5, variant: "twin", partnerHue: 40, name: "Noor",
    equipped: { hat: "hat/cap" }, loadout: ["tackle"], known: 120, cards: 300 }], form: 0.82, rating: 1130, league: 2, week: 2915,
    goal_days: 4, reviews: 61, language: "ar", xp_day: "2026-11-06", xp_today: 340, showcase: null, updated_at: "2026-11-06T10:00:00Z",
    streak: 12, streak_until: "2026-11-08T00:00:00.000Z" };
  const q = cleanProfile(good);
  assert.deepEqual(q.team, [{ ...good.team[0], show: null }]);
  for (const k of ["form", "rating", "league", "week", "goal_days", "reviews", "language", "xp_day", "xp_today", "updated_at", "streak", "streak_until"]) {
    assert.deepEqual(q[k], good[k], k);
  }
  assert.ok(!("streak" in cleanProfile({ league: 1 })), "a row from an app too old to send the flame has none");
  assert.equal(cleanProfile(null), null);
  assert.equal(cleanProfile([1]), null);
  const all = cleanProfiles(new Map([["u1", row], ["u2", "not a row"], [{}, good]]));
  assert.deepEqual([...all.keys()], ["u1"]);
  assert.equal(cleanProfiles(null).size, 0);
});

test("a hostile friend's team fights as checked creatures: real elements, real moves, sane numbers", () => {
  const team = cleanProfile({ team: [hostileCreature(), hostileCreature({ seed: 99, type: "ember", loadout: "tackle" })] }).team;
  const fs = fighters(null, team);
  for (const f of fs) {
    assert.ok(isType(f.type));
    assert.ok(f.moves.length >= 1 && f.moves.every((id) => MOVES.some((m) => m.id === id)));
    assert.ok(Number.isFinite(f.hp) && f.hp > 0);
    assert.ok(Object.keys(f.look.equipped).every((slot) => slot in SLOTS && CATALOG.some((it) => it.id === f.look.equipped[slot])));
  }
  // Even an unchecked creature never fights with a made-up element (battle.fighter checks it too).
  assert.ok(isType(fighter({ tags: [] }, { ...newGenome(3), type: XSS, growth: 0.5 }).type));
  // A rule that limits elements keeps a made-up one out, whatever it claims.
  const warm = WEEKLY_RULES.find((r) => r.types);
  assert.equal(fits({ seed: 1, growth: 0.5, type: XSS }, warm), false);
  assert.equal(fits({ seed: 1, growth: 0.5, type: "__proto__" }, warm), false);
  assert.equal(fits({ seed: 1, growth: 0.5, type: warm.types[0] }, warm), true);
});

test("a hostile favourite creature is drawn as a real one", () => {
  const g = showcaseGenome({ showcase: hostileCreature() });
  assert.ok(isType(g.type));
  assert.ok(g.variant === null || g.variant in VARIANTS);
  const look = describe(g);
  assert.ok(Object.values(look.equipped).every((id) => CATALOG.some((it) => it.id === id)));
  assert.equal(showcaseGenome({ showcase: { ...hostileCreature(), growth: 0 } }), null, "an egg is not a showcase");
});

test("a gift can't be an egg of a made-up or prototype element", () => {
  const s = newState(3);
  const before = s.roster.length;
  for (const type of [XSS, "__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.match(receiveGift(s, "egg", { seed: 5, type }), /couldn't/, type);
  }
  assert.equal(s.roster.length, before);
  assert.match(receiveGift(s, "item", { id: XSS }), /couldn't/);
  assert.match(receiveGift(s, "item", { id: "__proto__" }), /couldn't/);
  assert.match(receiveGift(s, "egg", { seed: 5, type: "tide" }), /Tide egg/);
});

test("battle results: a rival's name is cleaned, their id can't reach a prototype, their rating can't break mine", () => {
  const s = newState(8);
  recordDefence(s, { id: "__proto__", name: XSS }, true);
  recordDefence(s, { id: "constructor", name: "x" }, false);
  recordDefence(s, { id: { toString: () => "u1" }, name: "x" }, false);
  assert.equal(({}).wins, undefined, "Object.prototype untouched");
  assert.equal(({}).name, undefined);
  assert.deepEqual(Object.keys(s.rivals), []);
  recordDefence(s, { id: "u5", name: `Sam‮${"z".repeat(80)}` }, true);
  assert.equal(s.rivals.u5.name, `Sam${"z".repeat(37)}`, "control characters out, 40 characters at most");
  assert.deepEqual([s.rivals.u5.wins, s.rivals.u5.losses], [0, 1]);
  const pay = finishBattle(s, { mode: "friend", won: true, rival: { id: "u5", name: "Sam", rating: "<b>" } }, { now: new Date("2026-11-06T10:00:00") });
  assert.ok(Number.isFinite(pay.rating) && Number.isFinite(s.rating), "a rating sent as text counts as 1000");
  finishBattle(s, { mode: "friend", won: true, rival: { id: "u5", name: "Sam", rating: 1e300 } }, { now: new Date("2026-11-06T10:05:00") });
  assert.ok(Number.isFinite(s.rating));
  finishBattle(s, { mode: "friend", won: true, rival: { id: "__proto__", name: "Sam", rating: 1000 } }, { now: new Date("2026-11-06T10:10:00") });
  assert.equal(({}).wins, undefined);
  const r = cleanRival({ id: XSS.repeat(10), name: XSS, rating: -50 });
  assert.equal(r.id, null);
  assert.equal(r.rating, 0);
  assert.deepEqual(cleanRival(null), { id: null, name: "A friend", rating: 1000 });
});

test("one guild-mate can't bring down the raid boss alone by writing a big number", () => {
  assert.equal(raidShare(1e9, RAID_HP_PER_MEMBER), 2 * RAID_HP_PER_MEMBER);
  assert.equal(raidShare(40, RAID_HP_PER_MEMBER), 40, "a real week counts in full");
  assert.equal(raidShare(-5, RAID_HP_PER_MEMBER), 0);
  assert.equal(raidShare("150", RAID_HP_PER_MEMBER), 0);
  const members = 4;
  assert.ok(raidShare(1e9, RAID_HP_PER_MEMBER) < members * RAID_HP_PER_MEMBER, "a guild of four needs more than one");
});

test("a game icon's name and alt text are escaped, and the screens build a friend's element icon without HTML", () => {
  const html = icon(`type_${QUOTE}`, 16, `"><script>alert(1)</script>`);
  assert.doesNotMatch(html, /onerror="/);
  assert.doesNotMatch(html, /<script/);
  assert.equal((html.match(/"/g) || []).length, 10, "exactly the five attributes' own quotes");
  assert.equal(icon("coin"), icon("coin", 16, ""), "an ordinary icon is unchanged");
  // iconEl sets properties on an element; nothing is parsed as HTML.
  const made = [];
  globalThis.document = { createElement: (tag) => { const el = { tag }; made.push(el); return el; } };
  try {
    const img = iconEl(`type_${XSS}`, 16);
    assert.equal(img.tag, "img");
    assert.ok(img.src.endsWith(`icon/type_${XSS}.png`), "set as a property: a bad name is just a missing picture");
    assert.ok(!("innerHTML" in img));
  } finally { delete globalThis.document; }
  // The battle screen's element icon (the bug this guards against) is made with iconEl now.
  const ui = readFileSync(new URL("../../web/js/game/livebattle-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /innerHTML\s*=\s*`[^`]*\$\{c\.type\}/, "no creature type is put into innerHTML");
  assert.match(ui, /iconEl\(`type_\$\{c\.type\}`/);
  // The places friends' rows arrive check them first.
  const fg = readFileSync(new URL("../../web/js/game/friends-game.js", import.meta.url), "utf8");
  assert.match(fg, /profiles = cleanProfiles\(profiles\)/);
  const bar = readFileSync(new URL("../../web/js/game/friend-bar.js", import.meta.url), "utf8");
  assert.match(bar, /const profile = cleanProfile\(row\)/);
  const bu = readFileSync(new URL("../../web/js/game/battle-ui.js", import.meta.url), "utf8");
  assert.match(bu, /const profile = cleanProfile\(row\)/);
});
