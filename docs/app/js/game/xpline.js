// What the study screens say about XP, worked out without a page (so it can be tested): the line in a
// word's popup that says what the lookup earned, and what the level badge in the top bar shows.
// game.js decides when; xpbadge.js draws it.
//
// The owner's rule (it was the XP popup's): the big number is what was earned. When it was multiplied, the
// working goes beside it ("+24 XP  12 ×2"), so the multiplier can never read as still to come.

import { levelOf } from "./rules.js";

/** A multiplier as shown on screen: "×2", "×1.2", "×0.48". */
export const times = (m) => `×${Math.round(m * 100) / 100}`;

/** How a multiplied reward was worked out, e.g. "12 ×2" for +24 XP; "" when nothing multiplied it, or for a
 * reward the study session's combo doesn't carry (`chained` false). */
export const working = (result, chained) =>
  (chained && result && result.base && result.mult && result.mult !== 1 ? `${result.base} ${times(result.mult)}` : "");

/** XP in a small space (inside the level badge for a moment): 12, 999, 1.2k, 15k. */
export function shortXp(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}k`;
}

const ITEMS = { freeze: "Streak freeze!", hint: "Hint card!" };

/**
 * The line in a word's popup: what this lookup (or the Save after it) earned, and the next lookup's
 * multiplier while there is one to show. `result` is what rules.earn returned (null when nothing was
 * earned). Options:
 *   chained  the reward carries the session's combo (a lookup): the working may show beside the XP
 *   hot      the combo is alive (this lookup was multiplied by it): the flame shows by "next"
 *   next     the next lookup's whole multiplier ("×1.5"), or "" to leave the combo out
 *   coins    coins that came with it (a word saved: 1)
 *   repeat   the word was looked up earlier today (it pays once a day): say so instead
 * Returns {parts: [{kind, text, item?}], combo: {text, hot} | null, label} or null when there is nothing to say.
 */
export function gainLine(result, { chained = false, hot = false, next = "", coins = 0, repeat = false } = {}) {
  const parts = [];
  if (repeat) parts.push({ kind: "note", text: "Already looked up today" });
  else if (result) {
    if (result.item && ITEMS[result.item]) parts.push({ kind: "item", item: result.item, text: ITEMS[result.item] });
    const xp = Math.max(0, Math.round(Number(result.xp) || 0));
    if (xp > 0) {
      parts.push({ kind: "xp", text: `+${xp} XP` });
      const sum = working(result, chained);
      if (sum) parts.push({ kind: "working", text: sum });
    }
    const c = Math.max(0, Math.round(Number(coins) || 0));
    if (c > 0) parts.push({ kind: "coins", text: `+${c}`, said: c === 1 ? "+1 coin" : `+${c} coins` });
  }
  const combo = next ? { text: `next ${next}`, hot: !!hot } : null;
  if (!parts.length && !combo) return null;
  const label = [...parts.map((p) => p.said || p.text), combo && combo.text].filter(Boolean).join(" · ");
  return { parts, combo, label };
}

/** What the level badge shows for `xp` in all: the level, how much of its ring is filled (0..1), and the
 * XP still needed for the next level. */
export function badgeFace(xp) {
  const lv = levelOf(Math.max(0, Number(xp) || 0));
  const fill = lv.need > 0 ? Math.max(0, Math.min(1, lv.into / lv.need)) : 0;
  return { level: lv.level, into: lv.into, need: lv.need, left: Math.max(0, lv.need - lv.into), fill };
}

/** How far round the ring is drawn, for `stroke-dashoffset` on a circle whose pathLength is 100: a sliver
 * always shows once anything is earned towards the level, so a ring just started doesn't look empty. */
export function ringOffset(fill) {
  const f = Math.max(0, Math.min(1, Number(fill) || 0));
  return Math.round((100 - (f > 0 ? Math.max(4, f * 100) : 0)) * 10) / 10;
}
