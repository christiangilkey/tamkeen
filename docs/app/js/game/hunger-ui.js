// Hungry creatures on screen (prototype "hunger"; the rules are idle.js's): the sign on a hungry creature, the popup
// its sign opens (with a way to feed it), and "Feed first?" before a gym or a friend battle. Nothing here shows
// while the prototype is off: idle.isHungry is false for every creature then.

import { h, toast } from "../app.js";
import { t } from "../i18n.js";
import { FOODS, beastById } from "./data.js";
import { describe } from "./genome.js";
import { HUNGRY_STRENGTH, feed, foodFor, isHungry } from "./idle.js";
import { icon } from "./render.js";
import { saveGame, sfx } from "./game.js";
import { sheet } from "./info.js";

/** How much weaker a hungry creature fights, as a percent: 15. */
export const HUNGRY_PERCENT = Math.round((1 - HUNGRY_STRENGTH) * 100);

/** A creature's name, or what it is when it has none ("Cyber seal"). */
const nameOf = (c) => c.name || beastById(describe(c).beast).name;

/** The creature's favourite food (what its hungry sign shows it thinking of). */
export const wantedFood = (c) => FOODS.find((f) => f.loves === c.type) || FOODS[0];

/** The sign: a little thought bubble with its favourite food in it. Markup, for inside a tile or a card. */
export const hungrySignHtml = (c) => `<span class="hungry-sign" title="Hungry">${icon(wantedFood(c).id, 16)}</span>`;

/** The sign as its own button, for where nothing else is pressed: a tap opens openHungry. `after()` runs once it ate. */
export function hungryButton(game, c, after = () => {}, { word = true } = {}) {
  const b = h(`<button type="button" class="hungry-chip" title="Hungry: tap to feed it">${icon(wantedFood(c).id, 16)}${word ? "<span>Hungry</span>" : ""}</button>`);
  b.onclick = (e) => { e.stopPropagation(); e.preventDefault(); openHungry(game, c, after); };
  return b;
}

/** Feed `c` the best food there is for it (its favourite first). Returns "" or why not. */
export function feedBest(game, c) {
  const food = foodFor(game, c);
  if (!food) return "You have no food. Buy some on the Supplies page.";
  const r = feed(game, food.id, new Date(), c.seed);
  return typeof r === "string" ? r : "";
}

/** The popup a hungry sign opens: what hunger does and a button to feed it now (or to the food, with none). `go(tab)`
 * opens a game page (Supplies, to buy food). */
export function openHungry(game, c, after = () => {}, go = null) {
  const { body, close } = sheet("Hungry", wantedFood(c).id, { over: true });
  body.closest(".game-sheet").classList.add("cur-sheet");
  const who = h(`<p class="info-now"></p>`);
  who.textContent = "Hungry: feed it to bring back its full strength.";
  body.append(who);
  const why = h(`<p></p>`);
  why.textContent = `It fights at ${100 - HUNGRY_PERCENT}% of its attack and defence until it eats. It never loses health, growth or hearts, and can still battle.`;
  body.append(why);
  const row = h(`<div class="row"></div>`);
  const food = foodFor(game, c);
  if (food) {
    const b = h(`<button type="button" class="primary">${icon(food.id)} <span></span></button>`);
    b.querySelector("span").textContent = `Feed it: ${food.name}`;
    b.onclick = () => {
      const problem = feedBest(game, c);
      if (problem) { toast(problem, { error: true }); return; }
      saveGame(); sfx("lucky"); close(); after();
    };
    row.append(b);
  } else {
    row.append(h(`<p class="info-where">You have no food. Food costs ${FOODS[0].glow} glow on the Supplies page.</p>`));
    if (go) {
      const b = h(`<button type="button" class="primary">${icon("potion")} <span>Open supplies</span></button>`);
      b.onclick = () => { close(); go("supplies"); };
      row.append(b);
    }
  }
  body.append(row);
  return close;
}

/** Before a gym or a friend battle: if any of `team` (roster creatures) is hungry, ask "Feed first?". Resolves true to
 * go on (fed, or fight anyway), false when the owner closed it. With nobody hungry it resolves true at once. */
export function feedFirst(game, team) {
  const now = new Date();
  const hungry = team.filter((c) => isHungry(c, now));
  if (!hungry.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    let answered = false;
    const { body, close } = sheet("Feed first?", wantedFood(hungry[0]).id, { over: true });
    const wrap = body.closest(".game-sheet-wrap");
    body.closest(".game-sheet").classList.add("cur-sheet");
    const names = hungry.map(nameOf).join(", ");
    const who = h(`<p class="info-now"></p>`);
    who.textContent = hungry.length === 1 ? t("{0} is hungry", names) : t("These are hungry: {0}", names);
    who.setAttribute("translate", "no"); // (made in the app's language already: names stay as they are)
    body.append(who);
    const why = h(`<p></p>`);
    why.textContent = `A hungry creature fights at ${100 - HUNGRY_PERCENT}% of its attack and defence.`;
    body.append(why);
    const row = h(`<div class="row"></div>`);
    const done = (go) => { answered = true; close(); resolve(go); };
    const canFeed = hungry.some((c) => foodFor(game, c));
    if (canFeed) {
      const b = h(`<button type="button" class="primary">${icon(wantedFood(hungry[0]).id)} <span>Feed them</span></button>`);
      b.onclick = () => {
        let fed = 0;
        for (const c of hungry) if (!feedBest(game, c)) fed++;
        if (fed) { saveGame(); sfx("lucky"); }
        if (fed < hungry.length) toast("Not enough food for all of them. The rest fight hungry.");
        done(true);
      };
      row.append(b);
    } else row.append(h(`<p class="info-where">You have no food. It is on the Supplies page.</p>`));
    const anyway = h(`<button type="button"><span>Fight anyway</span></button>`);
    anyway.onclick = () => done(true);
    row.append(anyway);
    body.append(row);
    // (closing it any other way, the X, Escape or outside it, is "not now")
    new MutationObserver((_, obs) => { if (!wrap.isConnected) { obs.disconnect(); if (!answered) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}
