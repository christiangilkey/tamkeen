// Creature talents (prototype "talents", the owner's design of 2026-11-26: farming-plan.md section 4). No screen code.
//
// Every creature is born with a talent for each of its four strengths (health, attack, defence, speed): 0 to 15
// points, worked out from its seed, so a creature hatched long ago has its talents too and they are the same on every
// device. Each strength gets a grade (C, B, A, S). The owner (2026-11-26) wants no star rating shown, so nobody feels
// their pet is worse than another's: talents are for players who like to dig in. A rating of 1 to 5 stars is still
// worked out (starsOf), but only to award the quiet "Perfect talent" badge for top talents in everything (5 stars: about
// 1 hatch in 135 with no help); it is shown nowhere and never sent to friends.
//
// Better odds are all earned, never bought:
//   - stardust (from releasing grown creatures) raises the lowest roll an egg can make;
//   - a release passes the released creature's best talent down to the next egg laid;
//   - Warm porridge (cooked from the farm's harvest) raises one egg's lowest roll.
// The lowest roll is kept on the egg as `tf` (0..TF_MAX), the inherited talent as `tg` = {s: strength, p: points,
// from: the parent's seed}. Both are fixed once it hatches, and neither is shared with friends (battle.publicProfile
// sends neither; remote.cleanGenome would drop them).
//
// Talents count ONLY in battles against the game (wild battles, gyms): up to +15% on a strength (battle.js fighter,
// option vsGame). In battles between people (friends, ranked) everyone is evened out to the same: talents add nothing,
// whatever a device sends.

import { rng, stageOf } from "./genome.js";
import { feature } from "../prototype.js";
import { addShrineLines } from "./shrinelines.js";

export const STRENGTHS = ["hp", "atk", "def", "spd"];
export const MAX_POINTS = 15;          // a strength's talent: 0..15
export const TALENT_BOOST = 0.15;      // a strength at 15 points: +15% in battles against the game
export const TF_MAX = 0.4;             // the highest lowest-roll an egg can have (as a share of the range)
export const STARDUST_FLOOR = 0.05;    // each stardust raises new eggs' lowest roll by this...
export const STARDUST_FLOOR_MAX = 0.25; // ...up to this
export const PORRIDGE_FLOOR = 0.1;     // a bowl of Warm porridge raises one egg's lowest roll by this
const STAR_AT = [0, 20, 30, 40, 52];   // total points (0..60) for 1, 2, 3, 4 and 5 stars
const GRADE_AT = [["S", 14], ["A", 10], ["B", 6], ["C", 0]];

/** Whether talents are switched on (the prototype; `on` in place of it, for tests). */
export const talentsOn = (on = undefined) => (on === undefined ? feature("talents") : !!on);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isStrength = (s) => typeof s === "string" && STRENGTHS.includes(s);
const clampPoints = (p) => Math.max(0, Math.min(MAX_POINTS, Math.round(num(p))));

/** An egg's lowest roll, in range. */
export const floorOf = (g) => Math.max(0, Math.min(TF_MAX, num(g && g.tf)));

/** The talent passed down to it by a release, in range, or null. */
export function giftOf(g) {
  const t = g && g.tg;
  if (!t || typeof t !== "object" || !isStrength(t.s)) return null;
  return { s: t.s, p: clampPoints(t.p), from: num(t.from) >>> 0 };
}

/** A creature's talent points per strength, {hp, atk, def, spd}, each 0..15. From its seed (its own stream of numbers,
 * separate from the one that picks its kind), raised by its egg's lowest roll and the talent passed down to it. */
export function talentsOf(g) {
  const r = rng(((num(g && g.seed) >>> 0) ^ 0x5bd1e995) >>> 0);
  const f = floorOf(g);
  const out = {};
  for (const s of STRENGTHS) out[s] = Math.min(MAX_POINTS, Math.floor((f + (1 - f) * r()) * (MAX_POINTS + 1)));
  const gift = giftOf(g);
  if (gift) out[gift.s] = Math.max(out[gift.s], gift.p);
  return out;
}

/** A strength's grade from its points: C, B, A or S. */
export const gradeOf = (points) => GRADE_AT.find(([, at]) => points >= at)[0];

/** All four points added up (0..60). */
export const totalOf = (t) => STRENGTHS.reduce((sum, s) => sum + t[s], 0);

/** The overall rating, 1..5 stars. */
export function starsOf(g) {
  const total = totalOf(talentsOf(g));
  let stars = 1;
  STAR_AT.forEach((at, i) => { if (total >= at) stars = i + 1; });
  return stars;
}

/** The strength it is best at (the first of the highest), and its points. */
export function bestOf(g) {
  const t = talentsOf(g);
  const s = STRENGTHS.reduce((best, k) => (t[k] > t[best] ? k : best), STRENGTHS[0]);
  return { s, p: t[s] };
}

/** How much a strength's talent multiplies it in a battle against the game: 1 .. 1.15. */
export const boostOf = (points) => 1 + TALENT_BOOST * (clampPoints(points) / MAX_POINTS);

/** The multipliers a creature fights with, {hp, atk, def, spd}. All 1 unless the battle is against the game and
 * talents are on: in battles between people everyone is evened out. */
export function battleBoost(g, { vsGame = false, on = undefined } = {}) {
  if (!vsGame || !talentsOn(on) || !g || stageOf(num(g.growth)).id === "egg") return { hp: 1, atk: 1, def: 1, spd: 1 };
  const t = talentsOf(g);
  return Object.fromEntries(STRENGTHS.map((s) => [s, boostOf(t[s])]));
}

/** Whether its talents can be shown yet (an egg's are a secret until it hatches). */
export const hatched = (g) => !!g && stageOf(num(g.growth)).id !== "egg";

/** Whether this creature was born with top talents in everything (5 stars): the "Perfect talent" badge, on its owner's
 * card only. */
export const perfect = (g) => hatched(g) && starsOf(g) === 5;

// ---------- earned better odds ----------

/** The lowest roll new eggs get from stardust. */
export const stardustFloor = (stardust) => Math.min(STARDUST_FLOOR_MAX, STARDUST_FLOOR * Math.max(0, Math.floor(num(stardust))));

const stardustOf = (state) => num(state && state.idle && state.idle.stardust);
const isEggNow = (g) => !!g && stageOf(num(g.growth)).id === "egg";

/** The release whose best talent is waiting for the next egg: the latest release, unless an egg or creature in the
 * roster already carries its talent. Null when there is none. */
export function waitingGift(state) {
  const list = state && state.idle && Array.isArray(state.idle.released) ? state.idle.released : [];
  const last = list[list.length - 1];
  if (!last || typeof last !== "object" || !last.best || !isStrength(last.best.s)) return null;
  const from = num(last.seed) >>> 0;
  if ((state.roster || []).some((c) => { const t = giftOf(c); return t && t.from === from; })) return null;
  return { s: last.best.s, p: clampPoints(last.best.p), from };
}

/** Give a new egg what has been earned: stardust's lowest roll, and a waiting talent from the last release.
 * (rules.layEgg calls this for every egg laid; it is stored whether or not the prototype is on, so nothing earned
 * now is lost when it is released.) */
export function prepareEgg(state, egg) {
  if (!egg) return egg;
  const f = stardustFloor(stardustOf(state));
  if (f > floorOf(egg)) egg.tf = f;
  const gift = waitingGift(state);
  if (gift) egg.tg = gift;
  return egg;
}

/** After a release: what goes into the garden's record of it (its best talent), worked out before it leaves. */
export const releaseRecord = (c) => ({ best: bestOf(c) });

/** After stardust grows: every egg not hatched yet gets the new lowest roll too. */
export function liftEggs(state) {
  const f = stardustFloor(stardustOf(state));
  for (const c of Array.isArray(state && state.roster) ? state.roster : []) if (isEggNow(c) && f > floorOf(c)) c.tf = f;
}

/** Warm porridge (the farm's dish; the farm calls this when it is fed to an egg): raises that egg's lowest roll by
 * PORRIDGE_FLOOR, up to TF_MAX. Returns "" or an error message. Using up the dish is the farm's part. */
export function warmPorridge(state, rosterIndex) {
  const egg = state && Array.isArray(state.roster) ? state.roster[rosterIndex] : null;
  if (!egg) return "That egg isn't in your roster.";
  if (!isEggNow(egg)) return "Only an egg can have Warm porridge.";
  if (floorOf(egg) >= TF_MAX - 1e-9) return "This egg can't get any warmer.";
  egg.tf = Math.round(Math.min(TF_MAX, floorOf(egg) + PORRIDGE_FLOOR) * 1000) / 1000;
  return "";
}

// ---------- words ----------

export const STRENGTH_NAME = { hp: "Health", atk: "Attack", def: "Defence", spd: "Speed" };

/** What a grade means, for its explanation when tapped. */
export const GRADE_TEXT = {
  S: "S is the best a creature can be born with.",
  A: "A is a strong talent.",
  B: "B is a good, everyday talent.",
  C: "C is a gentle talent. It changes nothing in battles with friends, and every creature can grow just as dear.",
};

/** The short explanation shown when talents are tapped. */
export const TALENT_TEXT = [
  "Every creature is born with a talent for health, attack, defence and speed.",
  "Talents count only in battles against the game: wild battles and gyms, up to 15% more.",
  "In battles with friends and in ranked battles everyone is evened out, so talents add nothing there.",
];

/** How to get better talents, for the talents' explanation and the Star Shrine. */
export const ODDS_TEXT = [
  "Stardust raises the lowest talent your new eggs can roll.",
  "Releasing a creature passes its best talent down to your next egg.",
  "Warm porridge from the farm raises one egg's lowest roll.",
];

/** The Star Shrine's lines about talents (the shrine is the farm's: it shows these). */
export const SHRINE_TALENT_LINES = ODDS_TEXT.slice(0, 2);
// (the Star Shrine's card, farm-ui.js, shows these too where talents are on)
if (talentsOn()) addShrineLines(SHRINE_TALENT_LINES);
