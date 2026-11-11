// What a roll's reward is called and looks like, and the order a reveal plays in: the parts of the reveal
// (reveal.js) with no screen code, so they can be tested and used where there is no page.

import { t } from "../i18n.js";
import { FOODS, SUPPLIES, itemById } from "./data.js";
import { EPIC, LEGENDARY, MYTHIC, RARE } from "./loot.js";

// ---------- what a reward is called and looks like ----------
const SUPPLY_ART = { shield: "icon/streak_shield", xp_boost: "icon/xp_boost" };
const SUPPLY_NAME = { shield: "Streak shield" };

/** One grant as {art, text}: a picture from game-art/ (no extension) and a few words, already translated. */
export function grantView(g) {
  const n = Math.max(1, Math.floor(Number(g && g.n) || 1));
  const times = (name) => (n > 1 ? `${name} ×${n}` : name);
  switch (g && g.kind) {
    case "glow": return { art: "icon/glow", text: t("+{0} glow", n.toLocaleString()) };
    case "gems": return { art: "icon/gem", text: n === 1 ? t("+1 gem") : t("+{0} gems", n.toLocaleString()) };
    case "coins": return { art: "icon/coin", text: n === 1 ? t("+1 coin") : t("+{0} coins", n.toLocaleString()) };
    case "food": { const f = FOODS.find((x) => x.id === g.id); return { art: `icon/${f ? f.id : "food_berry"}`, text: times(t(f ? f.name : "Food")) }; }
    case "supply": {
      const s = SUPPLIES.find((x) => x.id === g.id);
      return { art: SUPPLY_ART[g.id] || `icon/${(s && s.icon) || g.id}`, text: times(t(SUPPLY_NAME[g.id] || (s ? s.name : "Supply"))) };
    }
    case "egg": return { art: "icon/egg_mystery", text: t("Mystery egg") };
    case "wearable": { const it = itemById(g.id); return { art: it ? `item/${it.id}` : "icon/gift", text: t(it ? it.name : "Something to wear") }; }
    default: return { art: "icon/gift", text: "" };
  }
}

/** A whole reward as {art, text, lines}: the first grant's picture, and every grant's words. */
export function rewardView(reward) {
  const grants = reward && Array.isArray(reward.grants) ? reward.grants.map(grantView) : [];
  if (!grants.length) return { art: "", text: "", lines: [] };
  return { art: grants[0].art, text: grants.map((g) => g.text).filter(Boolean).join(" + "), lines: grants.map((g) => g.text).filter(Boolean) };
}

/** What made the luck, in words: "Due ×2 · Streak ×3". */
export function luckText(parts) {
  const NAME = { due: "Due", extra: "Extra", streak: "Streak", golden: "Golden hour", bonus: "Bonus" };
  return (parts || []).map((p) => `${t(NAME[p.id] || "Bonus")} ×${Math.round(p.x * 100) / 100}`).join(" · ");
}

// ---------- the order of things ----------
/**
 * The colours the tile passes through before it lands on `tier`: [{tier, ms, breakout}]. Each is shown
 * for `ms`; `breakout` marks the last small step of a big reveal, after which the tile comes to the middle.
 */
export function climb(tier, big = tier >= EPIC) {
  const steps = [];
  for (let i = 0; i < tier; i++) {
    const small = i <= RARE;
    steps.push({ tier: i, ms: small ? 110 + i * 35 + (big && i === RARE ? 150 : 0) : 420 + (i - EPIC) * 110, breakout: big && i === RARE });
  }
  // A big reveal that stops below Rare (a mini-game asking for one) still comes to the middle.
  if (big && tier <= RARE && steps.length) steps[steps.length - 1].breakout = true;
  return steps;
}
// ---------- a chip on a card, where it covers nothing ----------
// A flashcard's front has one place that is always empty: its top corner on the far side from the status badge
// ("New word", "Review"), level with the badge and under the card's timer bar. Numbers in CSS pixels.
export const CHIP = { top: 16, height: 60, inset: 16, gap: 8, smallTop: 14, smallHeight: 30, badgeInset: 20, minWidth: 96 };

/**
 * Where a chip goes on a card: reveal()'s and notice()'s {top, left | right, maxWidth, small}.
 *   card   {left, top, width}: the card's box within the host the chip is drawn in
 *   host   {width}: that host
 *   badge  the status badge's width (0 when the card shows none)
 *   free   how far under the card's top its first line of content begins (Infinity when nothing is there)
 *   rtl    the page reads right to left: the badge is on the right, so the empty corner is the left one
 * `small` asks for the one-line chip: when the content starts too high for the usual one, the chip keeps to the
 * badge's own band, which the card's padding always leaves free.
 */
export function cornerSlot({ card, host, badge = 0, free = Infinity, rtl = false }) {
  const small = free < CHIP.top + CHIP.height + CHIP.gap;
  const top = Math.round(card.top + (small ? CHIP.smallTop : CHIP.top));
  const taken = badge > 0 ? CHIP.badgeInset + badge + CHIP.gap : CHIP.inset;
  const maxWidth = Math.max(CHIP.minWidth, Math.floor(card.width - CHIP.inset - taken));
  return rtl ? { top, left: Math.round(card.left + CHIP.inset), maxWidth, small }
    : { top, right: Math.round(host.width - card.left - card.width + CHIP.inset), maxWidth, small };
}

/** How long a big reveal stays up by itself once it has landed (a tap ends it sooner). */
export const holdFor = (tier) => (tier >= MYTHIC ? 9000 : tier >= LEGENDARY ? 6000 : 3800);
