// The "Luck" sheet: how the rolls work (loot.js), where the owner's luck stands, and what has been found so
// far. Opened from the vocab reviewer's luck chip; a mini-game may open it too.

import { h } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "./render.js";
import { sheet } from "./info.js";
import { tierBadge } from "./reveal.js";
import {
  BOSS_MISSES, BOSS_TIER, DUE_LUCK, FAST_MS_BY, GOLDEN_LUCK, GOLDEN_MS, PITY, STREAK_STEPS, TIERS, bossCount, chances, golden,
  lootState, luckFor, pityLeft,
} from "./loot.js";

// What each tier pays in the flashcards, in a few words (the amounts are loot.js REWARDS).
const PAYS = [
  "A little glow",
  "Some glow",
  "More glow, or a Streak shield",
  "A lot of glow, or food",
  "A pile of glow, food, Streak shields or a gem",
  "Gems, an XP boost, or half a day of glow",
  "A Mystery egg, or 5 gems",
  "Something to wear, and 5 gems",
  "Something rare to wear, and 15 gems",
  "One of the rarest things to wear, and 50 gems",
];

/** A chance as "1 in N" (or "every time" when it is sure, "never" when it cannot be). */
export function oddsText(p) {
  if (!(p > 0)) return t("never");
  if (p >= 0.995) return t("every time");
  const n = 1 / p;
  return t("1 in {0}", (n < 10 ? Math.round(n * 10) / 10 : Math.round(n)).toLocaleString());
}

/** Minutes and seconds left of a Golden hour: "8:05". */
export const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Open the sheet. `opts.over`: on top of another sheet. */
export function openLuck(game, opts = {}) {
  const L = lootState(game);
  const next = luckFor(game, { due: true, streak: L.streak + 1 });
  const odds = chances(next.luck);
  const left = golden(game);
  const pity = pityLeft(game);
  const shields = Math.max(0, Math.floor(Number(game.items && game.items.shield) || 0));
  const bosses = bossCount(game);
  const { body } = sheet(t("Luck"), "luck", opts);
  const times = (x) => `×${Math.round(x * 100) / 100}`;

  body.append(h(`<p class="info-now">You have ${L.streak} right in a row today. Your next due card rolls at luck ${times(next.luck)}.</p>`));
  if (left) body.append(h(`<p class="luck-golden">${icon("luck")} Golden hour: luck ${times(GOLDEN_LUCK)} for another ${clock(left)}.</p>`));
  const steps = STREAK_STEPS.map(([n, x]) => `${n} ${times(x)}`).join(", ");
  body.append(h(`<div><strong>How it works</strong><ul class="info-list">
    <li>Every card you remember rolls once for a reward. The rarer it is, the longer it takes to show.</li>
    <li>A card that was due today rolls at luck ${times(DUE_LUCK)}. An extra card (a new word past your day's number, or a word for the second time today) rolls at a quarter.</li>
    <li>Right answers in a row raise your luck: ${steps}. A wrong answer starts the count again, and so does a new day.</li>
    <li>A Streak shield saves a run of ${STREAK_STEPS[0][0]} or more from one wrong answer. You hold ${shields}.</li>
    <li>Boss words: a word you have missed on ${BOSS_MISSES} different days turns gold. Remember it and it pays at least ${TIERS[BOSS_TIER].name}. Waiting now: ${bosses}.</li>
    <li>Golden hour: now and then a roll starts ${Math.round(GOLDEN_MS / 60000)} minutes of luck ${times(GOLDEN_LUCK)}.</li>
    <li>Luck is never overdue for long: ${TIERS[PITY[1].tier].name} or better comes within ${pity.epic} more rolls, and ${TIERS[PITY[0].tier].name} or better within ${pity.legendary}.</li>
    <li>An answer given in under ${FAST_MS_BY.cards / 1000} seconds doesn't roll, so tapping through cards earns nothing.</li>
    <li>Rolls only come from studying. They are never sold.</li>
  </ul></div>`));

  const table = h(`<div class="luck-table"><strong>What you can find</strong>
    <p class="small muted">The chances are for your next due card, at luck ${times(next.luck)}.</p></div>`);
  TIERS.forEach((tr, i) => {
    const row = h(`<div class="luck-row"><span class="luck-what"><b></b><span></span></span><span class="luck-odds"></span></div>`);
    row.style.setProperty("--tier", tr.colour);
    row.prepend(tierBadge(i, L.found[i] > 999 ? "999+" : L.found[i]));
    row.querySelector("b").textContent = tr.name;
    row.querySelector(".luck-what span").textContent = PAYS[i];
    row.querySelector(".luck-odds").textContent = oddsText(odds[i]);
    row.querySelector(".luck-odds").setAttribute("translate", "no");
    table.append(row);
  });
  table.append(h(`<p class="small muted">The number in each square is how many you have found so far.</p>`));
  body.append(table);
}
