// The game's currencies in a few plain words each: how you get it and what it is for. Shown in the small popup that
// opens when a currency's counter is tapped (currency-ui.js). Words only, no screen code.
//
// When a reward changes, change its line here. Each line names where in the code it comes from (`from`: a file under
// web/js/game/ and a function or constant in it), and tests/js/currencies.test.mjs fails when one of those is gone,
// so a line can't quietly go on describing a reward that no longer exists. The longer explanations (every amount)
// are info.js's EARNED, opened from the popup's "Tell me more".

import { FOODS, SUPPLIES } from "./data.js";
import { STARDUST_BOOST } from "./idle.js";
import { BOTH_COINS, FULLY_GROWN_COINS } from "./rules.js";

const gemSupplies = SUPPLIES.filter((s) => s.gems);

/** {kind: {name, icon, get: [{text, from, prototype}], use: [{text, from, prototype}], more, open}}. A line with
 * `prototype` shows only while that prototype is on (prototype.js feature()). `more`: the long explanation in info.js
 * (EARNED), if there is one. `open`: the game sheet's page where it is spent, with the button's word. */
export const CURRENCIES = {
  coins: {
    name: "Coins", icon: "coin",
    get: [
      { text: "Reach your daily goal (10), win battles, and save words.", from: [["rules.js", "reachGoal"], ["rules.js", "finishBattle"], ["rules.js", "earn"]] },
      { text: "Sell the fish you catch.", from: [["fishing.js", "sell"]] },
      { text: `Extras: a new level, your guild's raid win, a fully grown creature (${FULLY_GROWN_COINS}), and a battle plus your flashcards on one day (${BOTH_COINS}).`,
        from: [["rules.js", "claimRaid"], ["rules.js", "grow"], ["rules.js", "payBoth"]] },
    ],
    use: [
      { text: "The Shop: things to wear, decorations and battle moves.", from: [["rules.js", "buy"], ["rules.js", "buyMove"]] },
    ],
    more: "coin", open: { tab: "shop", word: "Open the shop" },
  },
  gems: {
    name: "Gems", icon: "gem",
    get: [
      { text: "Earn a badge, rise a league, or help your guild beat the weekly raid boss.", from: [["idle.js", "tick"]] },
      { text: "Full bloom: every garden plot holding a fully grown building (10).", from: [["idle.js", "tick"]] },
      { text: "Now and then a rare roll when you remember a flashcard.", from: [["loot.js", "rewardFor"], ["loot.js", "payReward"]] },
      { text: "Buy one with glow in Supplies: 5,000 for the day's first, then twice the price for each more that day.",
        from: [["idle.js", "buyGemWithGlow"]], prototype: "gem_glow" },
    ],
    use: [
      { text: "Supplies: an XP boost, an incubator, a plot key or a mystery egg.", from: [["idle.js", "buySupply"]], supplies: gemSupplies.map((s) => s.id) },
      { text: "Gems are never sold for money.", from: [] },
    ],
    more: "gem", open: { tab: "supplies", word: "Open supplies" },
  },
  glow: {
    name: "Glow", icon: "glow",
    get: [
      { text: "The buildings in your garden make it, even while the app is closed.", from: [["idle.js", "tick"], ["idle.js", "collect"]] },
      { text: "Clearing the day's flashcards, reaching your daily goal and flashcard rolls send more at once.", from: [["idle.js", "cardsGlow"], ["loot.js", "payReward"]] },
    ],
    use: [
      { text: "New buildings, and growing them so they make more.", from: [["idle.js", "build"], ["idle.js", "upgrade"]] },
      { text: `Food for your creature (${FOODS[0].glow} each) and potions for wild battles.`, from: [["idle.js", "feed"], ["idle.js", "buySupply"]] },
      { text: "Gems, in Supplies: 5,000 glow for the day's first, twice the price for each more that day.",
        from: [["idle.js", "buyGemWithGlow"]], prototype: "gem_glow" },
    ],
    more: "glow", open: { tab: "garden", word: "Open the garden" },
  },
  pearls: {
    name: "Pearls", icon: "pearl",
    get: [
      { text: "Found inside the fish you catch, more often in the rarer ones.", from: [["fishing.js", "pearlsOf"], ["fishing.js", "land"]] },
    ],
    use: [
      { text: "Better rods (more luck on each cast) and bigger aquariums.", from: [["fishing.js", "buyRod"], ["fishing.js", "buyTank"]] },
    ],
    more: null, open: null,
  },
  stardust: {
    name: "Stardust", icon: "stardust",
    get: [
      { text: "Release a fully grown creature in the garden: 1, and 1 more for every 2 fully grown buildings.", from: [["idle.js", "release"], ["idle.js", "stardustGain"]] },
    ],
    use: [
      { text: `It is never spent: each one makes your garden ${Math.round(STARDUST_BOOST * 100)}% faster, for good.`, from: [["idle.js", "rateOf"]] },
    ],
    more: null, open: { tab: "garden", word: "Open the garden" },
  },
};

export const CURRENCY_KINDS = Object.keys(CURRENCIES);
/** The table's entry for a kind, also by its icon's name ("coin", "gem", "pearl"), or null. */
export const currencyOf = (kind) => CURRENCIES[kind] || Object.values(CURRENCIES).find((c) => c.icon === kind) || null;
