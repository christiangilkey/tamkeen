// Gifts from Tamkeen's creator (prototype "owner_gifts"), the pure part: what a gift may hold, and how one is
// added to a game exactly once. The online side is supabase/v16-owner-gifts.sql and web/js/giftsync.js; the
// creator's screen is components/giftpanel.js. No page here: tests/js/gifts.test.mjs runs it without a browser.
//
// A gift is `what`: any of
//   coins, gems, xp, glow   a whole number to add, or a negative one to take away (never below nothing)
//   items                   ids of things to wear or stand in the habitat (data.CATALOG)
//   moves                   ids of battle moves sold in the shop (data.MOVES with a price)
//   tags                    ids of data.TAGS (they unlock things in the shop and colourings)
//   creatures               [{beast, stage}]: one of beasts.js, as an egg, a hatchling, a juvenile or fully grown
//
// ONCE, WHATEVER THE DEVICES DO. The game is saved per account and merged between devices (merge.js). A gift must
// not be undone by an older copy, nor added twice when two devices each collect it before they sync:
//   - the game keeps `gifts`: gift id -> the glow it added. A gift already there is never added again, and
//     merging keeps every id from both copies;
//   - coins, gems and XP go into the merge's own tally under a key of the gift ("g:<id>"), not the device's, so
//     two copies that each added it count it once (the tally keeps the larger of each key);
//   - items, moves and tags are lists merged by joining; a creature's seed is worked out from the gift's id, so
//     both copies hold the very same creature and merging keeps one;
//   - glow is not tallied (it belongs to the garden, kept from one copy): merging adds the glow of a gift that the
//     copy whose garden is kept had not had yet.
// Giving something to wear never puts it on: the dress-up rules (rules.wearProblem) apply when the owner does.

import { BEASTS, GROWN, MOVES, STAGES, TAGS, TYPES, itemById } from "./data.js";
import { beastOf, newGenome } from "./genome.js";
import { garden } from "./idle.js";

export const GIFT_COUNTERS = ["coins", "gems", "xp", "glow"];
/** The most a gift adds or takes of one counter, and the most things of one kind. */
export const GIFT_MAX = 1000000;
export const GIFT_LIST_MAX = 40;
export const GIFT_CREATURES_MAX = 6;
/** How many creatures a game may hold once gifts are counted (the game's own cap is rules.MAX_CREATURES). */
export const GIFT_ROSTER_MAX = 24;
export const GIFT_STAGES = ["egg", "hatchling", "juvenile", "grown"];

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isId = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(v || ""));
/** The moves a gift may hold: those the shop sells (a creature's own moves come with its element and age). */
export const GIFT_MOVES = MOVES.filter((m) => m.price);
const moveOk = (id) => GIFT_MOVES.some((m) => m.id === id);
const beastOk = (id) => typeof id === "string" && BEASTS.some((b) => b.id === id);

/** A gift made safe: only what the game knows, cut to size. Null when nothing is left of it. */
export function cleanGift(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const k of GIFT_COUNTERS) {
    const n = Math.round(Number(raw[k]));
    if (Number.isFinite(n) && n !== 0) out[k] = Math.max(-GIFT_MAX, Math.min(GIFT_MAX, n));
  }
  const list = (v, ok) => [...new Set((Array.isArray(v) ? v : []).filter((id) => typeof id === "string" && ok(id)))].slice(0, GIFT_LIST_MAX);
  const items = list(raw.items, (id) => !!itemById(id));
  const moves = list(raw.moves, moveOk);
  const tags = list(raw.tags, (id) => own(TAGS, id));
  const creatures = (Array.isArray(raw.creatures) ? raw.creatures : [])
    .filter((c) => c && typeof c === "object" && beastOk(c.beast))
    .map((c) => ({ beast: c.beast, stage: GIFT_STAGES.includes(c.stage) ? c.stage : "egg" })).slice(0, GIFT_CREATURES_MAX);
  if (items.length) out.items = items;
  if (moves.length) out.moves = moves;
  if (tags.length) out.tags = tags;
  if (creatures.length) out.creatures = creatures;
  return Object.keys(out).length ? out : null;
}

/** Gifts as the online service lists them for me, made safe: [{id, what, note}] (a gift with nothing known in it is
 * kept with `what: null`, so it can still be marked collected). */
export function cleanWaiting(list) {
  return (Array.isArray(list) ? list : []).filter((g) => g && isId(g.id))
    .map((g) => ({ id: String(g.id), what: cleanGift(g.what), note: String(g.note || "").replace(/[<>]/g, "").trim().slice(0, 200) })).slice(0, 50);
}

/** The creator's record, made safe: [{id, username, what, note, created_at, got_at}]. */
export function cleanRecord(list) {
  const when = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : "");
  return (Array.isArray(list) ? list : []).filter((g) => g && isId(g.id)).map((g) => ({
    id: String(g.id), username: /^[A-Za-z0-9_.]{3,20}$/.test(String(g.username || "")) ? String(g.username) : "?",
    what: cleanGift(g.what), note: String(g.note || "").replace(/[<>]/g, "").trim().slice(0, 200),
    created_at: when(g.created_at), got_at: when(g.got_at) })).slice(0, 500);
}

/** The tally's key for a gift (merge.js: counted once however many copies added it). */
export const giftKey = (id) => `g:${id}`;

function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** The seed of the `index`-th creature of gift `id`: the same on every device, and one that makes it the beast asked for. */
export function giftSeed(id, index, beastId) {
  const beast = BEASTS.find((b) => b.id === beastId);
  if (!beast) return null;
  for (let n = 0; n < 200; n++) {
    const seed = hash32(`${id}:${index}:${n}`);
    if (beastOf({ seed, type: beast.type }).id === beastId) return seed;
  }
  return null;
}

const growthOf = (stage) => (stage === "grown" ? GROWN : stage === "egg" ? 0 : (STAGES.find((s) => s.id === stage) || STAGES[0]).from);

/**
 * Add gift `id` to `state` (a normalized game), once. Returns null when the game has had it already, else what was
 * really added: { coins, gems, xp, glow, items, moves, tags, creatures: [{beast, stage}] } (a counter taken below
 * nothing stops at nothing; something already owned is left out).
 */
export function applyGift(state, id, what) {
  if (!isId(id)) return null;
  state.gifts = state.gifts && typeof state.gifts === "object" && !Array.isArray(state.gifts) ? state.gifts : {};
  if (own(state.gifts, id)) return null;
  const gift = cleanGift(what) || {};
  const got = { coins: 0, gems: 0, xp: 0, glow: 0, items: [], moves: [], tags: [], creatures: [] };
  const key = giftKey(id);
  const tally = (state.tally = state.tally && typeof state.tally === "object" ? state.tally : {});
  for (const k of ["coins", "gems", "xp"]) {
    if (!gift[k]) continue;
    const before = Number.isFinite(state[k]) ? state[k] : 0;
    state[k] = Math.max(0, before + gift[k]);
    const real = state[k] - before;
    if (!real) continue;
    got[k] = real;
    const t = (tally[k] = tally[k] && typeof tally[k] === "object" ? tally[k] : {});
    t[key] = real > 0 ? [real, 0] : [0, -real];
  }
  if (gift.glow) {
    const g = garden(state);
    const before = g.glow;
    g.glow = Math.max(0, before + gift.glow);
    got.glow = g.glow - before;
  }
  const add = (list, ids, into) => { for (const x of ids || []) if (!list.includes(x)) { list.push(x); into.push(x); } };
  for (const k of ["owned", "attacks", "tags"]) if (!Array.isArray(state[k])) state[k] = [];
  add(state.owned, gift.items, got.items);
  add(state.attacks, gift.moves, got.moves);
  add(state.tags, gift.tags, got.tags);
  const released = new Set(((state.idle && state.idle.released) || []).map((c) => c && c.seed));
  (gift.creatures || []).forEach((c, i) => {
    const seed = giftSeed(id, i, c.beast);
    if (seed === null || state.roster.length >= GIFT_ROSTER_MAX) return;
    if (released.has(seed) || state.roster.some((g) => g.seed === seed)) return;
    const beast = BEASTS.find((b) => b.id === c.beast);
    const genome = newGenome(seed, beast.type);
    genome.growth = growthOf(c.stage);
    if (c.stage === "grown") genome.grown = true; // (it arrives grown: the once-only pay for growing up is not paid again)
    state.roster.push(genome);
    got.creatures.push({ beast: c.beast, stage: c.stage });
  });
  state.gifts[id] = got.glow;
  return got;
}

const stageName = (stage, t) => (stage === "grown" ? t("Fully grown") : stage === "juvenile" ? t("Juvenile") : t("Hatched"));
/**
 * A gift in words, one line per thing, for the notice and the creator's record. `t` translates (i18n.js); given
 * `(s, ...args) => …`. Counters: "+50 coins" / "−20 gems".
 */
export function giftLines(what, t = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i])) {
  const gift = cleanGift(what);
  if (!gift) return [];
  const lines = [];
  const signed = (n) => (n > 0 ? `+${n.toLocaleString("en-US")}` : `−${Math.abs(n).toLocaleString("en-US")}`);
  if (gift.coins) lines.push(t("{0} coins", signed(gift.coins)));
  if (gift.gems) lines.push(t("{0} gems", signed(gift.gems)));
  if (gift.xp) lines.push(t("{0} XP", signed(gift.xp)));
  if (gift.glow) lines.push(t("{0} glow", signed(gift.glow)));
  for (const id of gift.items || []) lines.push(t(itemById(id).name));
  for (const id of gift.moves || []) lines.push(t("The move {0}", t(GIFT_MOVES.find((m) => m.id === id).name)));
  for (const id of gift.tags || []) lines.push(t(TAGS[id]));
  for (const c of gift.creatures || []) {
    const b = BEASTS.find((x) => x.id === c.beast);
    lines.push(c.stage === "egg" ? t("{0} egg", t(TYPES[b.type].name)) : `${t(b.name)} (${stageName(c.stage, t)})`);
  }
  return lines;
}
