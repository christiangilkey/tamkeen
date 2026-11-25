// New things in the Library, paid in the creature game (prototype "content_rewards", the owner, 2026-11-25: "a system
// that incentivizes adding new content"). Three things count:
//   - adding something new to the Library (a podcast, a book, a PDF, an audiobook, a reel, a web page, a Netflix
//     title, a file of your own);
//   - finishing something new: listening, watching or reading it to the end (the players and the reader say so);
//   - sharing with others: words, a folder or a Library item sent to a friend or a DLI class, once it is delivered.
// Each pays a little XP and a few coins, finishing far more than adding (so adding junk is never the best plan),
// with a cap a day for each, and badges for milestones. A weekly goal ("Finish 3 new things this week") pays a bonus.
//
// The rules that keep it honest:
//   - an item counts once ever: adding the same link again, or the same file again, is not new; neither is
//     finishing it again. What has counted is kept as short fingerprints (`fp`), never the links themselves;
//   - a share counts once per item and person (or class), and only once the friend's or class's copy is there;
//   - YouTube pays nothing here, as everywhere (rules.UNPAID_TIME: YouTube's API policies don't allow rewarding
//     people for watching), nor do your own recordings or the random reels "Get random reels" picks;
//   - coins and XP only (they add up across devices without being counted twice: merge.js tally); no gems but the
//     badges' usual two (idle.tick), nothing for battles, nothing bought with money.
// Two copies of the game played apart join their records here (join, used by merge.js and app/sync/gamemerge.py),
// so an item that counted on one device never pays again on the other.
//
// No screen code: game.js reports the events (contentEvent) and shows what they earned.

import { feature } from "../prototype.js";
import { checkBadges, dayKey, grow, levelOf, weekNumber } from "./rules.js";
import { ACTIONS, KEPT } from "./contentjoin.js";

export { KEPT };

export const PROTO = "content_rewards";

/** What each action pays, and how many of it pay in a day (the rest still count toward badges and the week). */
export const PAY = {
  add: { xp: 10, coins: 1, day: 5 },     // something new added to the Library
  done: { xp: 50, coins: 5, day: 5 },    // something new finished: an episode, a chapter, a book, a film
  short: { xp: 10, coins: 1, day: 10 },  // something short finished: a reel, a web page (minutes, not hours)
  sent: { xp: 15, coins: 2, day: 5 },    // something shared with a friend or a class, once delivered
};
/** The weekly goal: finish this many new things (not counting reels) between Monday and Sunday. */
export const WEEK_GOAL = 3;
export const WEEK_PAY = { xp: 150, coins: 20 };
/** Kinds whose finishing is quick: they pay PAY.short, and reels don't count toward the weekly goal. */
export const SHORT = new Set(["reel", "page"]);
/** Every kind of thing that can count (the badge for five different kinds counts finished ones). */
export const KINDS = ["podcast", "audiobook", "netflix", "video", "audio", "book", "pdf", "page", "reel", "lesson"];

/** Badges (data.js BADGES, `proto: "content_rewards"`): id -> is it earned, from the record. */
export const BADGE_RULES = {
  content_first: (c) => c.n.add >= 1,
  content_done_10: (c) => c.n.done >= 10,
  content_done_50: (c) => c.n.done >= 50,
  content_done_200: (c) => c.n.done >= 200,
  content_kinds_5: (c) => c.kinds.length >= 5,
  content_share_1: (c) => c.n.sent >= 1,
  content_share_25: (c) => c.n.sent >= 25,
};

// ---------- fingerprints ----------

/** A short fingerprint of a text (two 32-bit FNV-1a hashes, 11 to 14 letters): enough to tell thousands of items
 * apart, and it keeps no link or title in the saved game. */
export function fp(text) {
  const s = String(text ?? "");
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b ^= b >>> 15;
  }
  return a.toString(36) + "." + (b >>> 0).toString(36);
}

const FP = /^[0-9a-z]{1,7}\.[0-9a-z]{1,7}$/;
/** A link or name made comparable: trimmed, its scheme, "www." and a last slash left off. */
export function sameKey(text) {
  return String(text ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").slice(0, 600);
}

// ---------- the record ----------

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const fps = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && FP.test(x)))].slice(-KEPT) : []);

/** The record a save holds, checked and filled in (a new one when it has none). In place: `state.content`. */
export function record(state) {
  const c = state.content && typeof state.content === "object" && !Array.isArray(state.content) ? state.content : {};
  const out = {
    add: fps(c.add), done: fps(c.done), sent: fps(c.sent),
    kinds: Array.isArray(c.kinds) ? [...new Set(c.kinds.filter((k) => KINDS.includes(k)))] : [],
    n: {}, day: {}, week: {},
  };
  const n = c.n && typeof c.n === "object" ? c.n : {};
  for (const k of ["add", "done", "sent"]) out.n[k] = Math.max(num(n[k]), out[k].length);
  const d = c.day && typeof c.day === "object" ? c.day : {};
  out.day = { key: typeof d.key === "string" && d.key.length <= 10 ? d.key : "" };
  for (const k of ACTIONS) out.day[k] = num(d[k]);
  const w = c.week && typeof c.week === "object" ? c.week : {};
  out.week = { n: num(w.n), done: fps(w.done).slice(-50), paid: w.paid === true };
  state.content = out;
  return out;
}

/** A new day, a new week: today's counts start again; this week's finished things too. */
function roll(c, now) {
  const key = dayKey(now);
  if (c.day.key !== key) { c.day = { key }; for (const k of ACTIONS) c.day[k] = 0; }
  const week = weekNumber(now);
  if (c.week.n !== week) c.week = { n: week, done: [], paid: false };
}

/** The weekly goal as it stands: {done, goal, paid, left (days to Sunday night, today counted)}. */
export function weekly(state, now = new Date()) {
  const c = record(state);
  roll(c, now);
  const day = (now.getDay() + 6) % 7; // Monday 0 .. Sunday 6
  return { done: Math.min(WEEK_GOAL, c.week.done.length), goal: WEEK_GOAL, paid: c.week.paid, left: 7 - day };
}

// ---------- what an item is ----------

/** The kind of a Library item (an episode as the app lists it), or null for what never counts (YouTube). */
export function kindOf(ep) {
  if (!ep || typeof ep !== "object") return null;
  const feed = String(ep.feed_url || "");
  if (feed === "local:youtube" || ep.youtube_id) return null; // (YouTube never pays: see the top of this file)
  if (feed === "local:pages") return "page";
  if (feed === "local:lessons") return "lesson";
  if (feed === "local:books") return /\.pdf$/i.test(String(ep.source || ep.guid || "")) ? "pdf" : "book";
  if (feed === "local:audio") return "audio";
  if (feed === "local:videos") return "video";
  if (feed === "local:netflix") return "netflix";
  if (feed === "local:reels") return "reel";
  if (feed.startsWith("local:audiobook:") || /^https?:\/\/(www\.)?librivox\.org\/rss\//i.test(feed)) return "audiobook";
  if (/^https?:/i.test(feed)) return "podcast";
  return null;
}

/**
 * What a call to the app's server added to the Library, from what was sent (`path` and `body` of a POST that
 * succeeded): [{kind, key}], one per new thing (the same link or file gives the same key on every device, so it
 * counts once). Empty for anything that isn't an addition, or doesn't count: YouTube, the random reels, Tamkeen's own
 * lists, a DLI course pushed in.
 */
export function addedBy(path, body) {
  const b = body && typeof body === "object" ? body : {};
  const one = (kind, key) => (key ? [{ kind, key: `${kind}:${sameKey(key)}` }] : []);
  switch (path) {
    case "/feeds": {
      const url = String(b.url || "");
      if (!url || url.startsWith("local:")) return [];
      return one(/librivox\.org\/rss\//i.test(url) ? "audiobook" : "podcast", url);
    }
    case "/shared/podcast": return one("podcast", b.guid || b.audio_url);
    case "/shared/reel": return one("reel", b.code);
    case "/reels/saved/send": return (Array.isArray(b.codes) ? b.codes : []).slice(0, 200).flatMap((code) => one("reel", code));
    case "/pages": return one("page", b.url || b.title);
    case "/netflix": return one("netflix", b.id);
    case "/books": {
      const guid = String(b.guid || "");
      if (b.list === "lessons" || guid.startsWith("file:lesson:")) return one("lesson", guid);
      return one(/\.pdf$/i.test(String(b.source || "")) || /^file:[^:]*\.pdf:/i.test(guid) ? "pdf" : "book", guid || b.title);
    }
    default: return [];
  }
}

/** What an upload of one of the learner's own files (app.uploadVideo) added: [{kind, key}]. Audiobooks count once,
 * by their first chapter; a lesson by its passage (/books), not its sound tracks; your own recordings don't count
 * (you made them; nothing new came in). */
export function uploadedBy(file, { book = null, transcribe = true, recording = false, lesson = false } = {}) {
  if (!file || recording) return [];
  if (book && !transcribe) return []; // (a later chapter of the same audiobook)
  if (lesson) return []; // (a lesson's sound track: the lesson counts once, by its passage)
  const name = String(file.name || "");
  const key = `${name}:${Number(file.size) || 0}`;
  const audio = String(file.type || "").startsWith("audio/") || /\.(mp3|m4a|m4b|aac|ogg|oga|opus|flac|wav|wma)$/i.test(name);
  const kind = book ? "audiobook" : audio ? "audio" : "video";
  return [{ kind, key: `${kind}:file:${sameKey(key)}` }];
}

// ---------- an event ----------

/**
 * Something counted: `action` "add" (something new in the Library), "done" (finished), or "sent" (shared, once
 * delivered); `kind` one of KINDS (sent: any text, e.g. "words"), `key` what makes it this item (sent: the item and
 * the person or class it went to). Returns what it earned, or null when it had counted before (or the prototype is
 * off): {action, kind, xp, coins, capped, week: {done, goal, reached}, weekPay, levelUp, stage, badges}. `capped`:
 * it counted, but today's share for this action has all been paid.
 */
export function contentEvent(state, { action, kind, key }, { now = new Date(), on = feature(PROTO) } = {}) {
  if (!on || !state || !["add", "done", "sent"].includes(action)) return null;
  if (action !== "sent" && !KINDS.includes(kind)) return null;
  const id = String(key ?? "").trim();
  if (!id) return null;
  const c = record(state);
  roll(c, now);
  const f = fp(`${action}|${id}`);
  const list = c[action];
  if (list.includes(f)) return null;
  list.push(f);
  if (list.length > KEPT) list.splice(0, list.length - KEPT);
  c.n[action] += 1;
  if (action === "done" && !c.kinds.includes(kind)) c.kinds.push(kind);

  const pay = action === "done" && SHORT.has(kind) ? "short" : action;
  const rate = PAY[pay];
  const out = { action, kind, xp: 0, coins: 0, capped: false, week: null, weekPay: null, levelUp: false, stage: null, badges: [] };
  const levelBefore = levelOf(state.xp).level;
  if (c.day[pay] < rate.day) {
    c.day[pay] += 1;
    out.xp = rate.xp;
    out.coins = rate.coins;
  } else out.capped = true;

  // The weekly goal: new things finished this week (a reel is too short to count).
  if (action === "done" && kind !== "reel") {
    if (!c.week.done.includes(f) && c.week.done.length < 50) c.week.done.push(f);
    const reached = !c.week.paid && c.week.done.length >= WEEK_GOAL;
    if (reached) {
      c.week.paid = true;
      out.weekPay = { ...WEEK_PAY };
      out.xp += WEEK_PAY.xp;
      out.coins += WEEK_PAY.coins;
    }
    out.week = { done: Math.min(WEEK_GOAL, c.week.done.length), goal: WEEK_GOAL, reached };
  }

  if (out.coins) state.coins = (Number(state.coins) || 0) + out.coins;
  if (out.xp) out.stage = grow(state, out.xp, null);
  out.levelUp = levelOf(state.xp).level > levelBefore;
  if (out.levelUp) { state.coins += 5; out.coins += 5; }
  out.badges = checkBadges(state);
  state.updated_at = now.getTime() / 1000;
  return out;
}

/** The badges the record has earned (rules.checkBadges asks, with the prototype on). */
export function contentBadges(state, on = feature(PROTO)) {
  if (!on || !state || !state.content) return {};
  const c = record(state);
  return Object.fromEntries(Object.entries(BADGE_RULES).map(([id, test]) => [id, test(c)]));
}

// Two copies of the game: their records are joined in contentjoin.js (pure: merge.js uses it).
export { join } from "./contentjoin.js";
