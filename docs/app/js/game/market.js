// The Market (prototype "market", the owner's design of 2026-11-27): Home's Shop tile became the Market, one sheet with
// everything the village market offers, organised by stall, each kept by its Muffle. The owner: "the current shop tab
// should probably get changed to a market tab, and it should be redesigned to include all the things that are
// available in the market". My things is no longer here: it is the dresser in the cottage (habitat.js).
//
// Every stall shows the same code as before, never a copy: the tailor and the herald are the shop's shelves
// (shop.js shopPanel, things to wear and decorations, then battle moves), the baker is Supplies (garden.js), the
// florist, the grocer and the cook are the farm's own screens drawn into the stall (farm-ui.js, through
// screenparts.inline), the fisher is the pond's rods and aquarium rows (fishscreen.js), and an order opens the farm's
// order box. The owner's reward rules stay as they are: what is sold is paid for with what studying earns; orders
// pay coins.

import { h } from "../app.js";
import { feature } from "../prototype.js";
import { t } from "../i18n.js";
import { garden } from "./idle.js";
import { fishingOf } from "./fishing.js";
import { amount, block, inline, row } from "./screenparts.js";
import { openCurrency } from "./info.js";
import { icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { ordersToday } from "./farmuses.js";
import { saveGame } from "./game.js";

const ART = new URL("../../game-art/", import.meta.url).href;

/**
 * The stalls, in the order they stand in the Market. `job`: the Muffle who keeps it (web/game-art/muffle/<job>.png),
 * `tab`: its word on the row of keepers, `pay`: the currencies it takes or pays, `say`: what the keeper says,
 * `farm`: only with the farm.
 */
export const STALLS = [
  { id: "orders", job: "baker", name: "Today's orders", tab: "Orders", pay: ["coins"], farm: true,
    about: "Muffles want crops from your barn. Each order pays coins and wakes one of their forgotten words.",
    say: "Bring us what we ask for from your barn. We pay in coins, and you'll hear one of our old words again." },
  { id: "tailor", job: "tailor", name: "The tailor", tab: "Tailor", pay: ["coins"],
    about: "Things to wear and decorations", say: "Fresh things to wear every day, and things for your home. Pick one and your creature tries it on." },
  { id: "herald", job: "herald", name: "The herald", tab: "Moves", pay: ["coins"],
    about: "Battle moves: new tricks, not bigger numbers", say: "New tricks for battles. Each one is bought once, for all your creatures." },
  { id: "baker", job: "baker", name: "The baker", tab: "Baker", pay: ["glow", "gems"],
    about: "Food, potions, eggs and keys; gems for glow", say: "Food, potions and keys, fresh today. I'll trade you a gem for glow, too." },
  { id: "florist", job: "florist", name: "The florist", tab: "Seeds", pay: ["glow"], farm: true,
    about: "Seeds, farm upgrades and farm decorations", say: "Seeds for your field, and things to help your farm along." },
  { id: "grocer", job: "grocer", name: "The grocer", tab: "Grocer", pay: ["glow"], farm: true,
    about: "Buys your harvests for glow", say: "I buy what you grow. Rarer harvests fetch more glow." },
  { id: "cook", job: "cook", name: "The cook", tab: "Cook", pay: [], farm: true,
    about: "The Cookbook: dishes from your harvests", say: "Bring me your harvests and I'll cook you something good." },
  { id: "fisher", job: "fisher", name: "The fisher", tab: "Fisher", pay: ["pearls"],
    about: "Rods and bigger aquariums", say: "Luckier rods and bigger tanks, for the pearls in your rarer fish." },
];
const PAY_WORD = { coins: "Paid with coins, from studying", glow: "Paid with glow", gems: "Paid with gems", pearls: "Paid with pearls" };
const PAYS_WORD = { coins: "Pays coins", glow: "Pays glow" };
/** The keepers of orders, by the folk who give them (farmuses ORDER_FOLK), and what to call them. */
const FOLK_NAME = { grocer: "The grocer", baker: "The baker", barkeep: "The barkeep", florist: "The florist", tailor: "The tailor", fisher: "The fisher",
  cook: "The cook", herald: "The herald" };

/** The stalls open now (the farm's only with the farm). */
export const stallsOpen = (on = feature("farm")) => STALLS.filter((s) => !s.farm || on);

let stall = null; // the stall open (null: the whole Market), for as long as the app is open
/** Open the Market on a stall next time it is drawn (the village's stalls: habitat.js openStation). */
export function marketStall(id) { stall = STALLS.some((s) => s.id === id) ? id : null; }

/** A Muffle keeper's picture: the first frame of its strip (standing, facing you). */
export function keeper(job, px = 48) {
  const el = h(`<span class="mk-keeper" aria-hidden="true"></span>`);
  el.style.width = el.style.height = `${px}px`;
  el.style.backgroundImage = `url("${ART}muffle/${job}.png")`;
  el.style.backgroundSize = `${17 * px}px ${px}px`;
  return el;
}

/** How much of a currency the owner has. */
function have(game, kind) {
  if (kind === "glow") return Math.floor(garden(game).glow);
  if (kind === "pearls") return Number(fishingOf(game).pearls) || 0;
  return Math.max(0, Math.floor(Number(game[kind]) || 0));
}

/** A row of counters (a tap says how to get it and what it is for: info.openCurrency). */
function pills(game, kinds, go) {
  const el = h(`<div class="mk-pills"></div>`);
  for (const kind of kinds) {
    const b = h(`<button type="button" class="gs-pill" data-cur-own>${amount(kind, have(game, kind))}</button>`);
    b.onclick = () => openCurrency(kind, game, go, { here: "market" });
    el.append(b);
  }
  return el;
}

/**
 * Draw the Market into `body`: the whole Market (today's orders, then a row for each stall), or one stall open (the
 * keepers along the top, the keeper and what they say, what it takes, then what it sells).
 * `changed()` runs after something was bought, sold or cooked; `repaint()` draws the Market again where it was.
 * `shelf(body, only)` draws the shop's shelves ("items" or "moves": shop.js).
 */
export function marketPanel(body, game, { changed, go, repaint, shelf, supplies }) {
  const open = stallsOpen();
  if (stall && !open.some((s) => s.id === stall)) stall = null;
  if (!stall) { overview(body, game, open, go, repaint); return; }
  const s = STALLS.find((x) => x.id === stall);
  body.append(tabs(open, s, repaint));
  const back = h(`<button type="button" class="ghost cr-back mk-back">${lineIcon("chevron", 18)}<span></span></button>`);
  back.querySelector("span").textContent = t("All stalls");
  back.onclick = () => { stall = null; repaint(); };
  body.append(back);
  const head = h(`<div class="mk-head"><div class="mk-who"><strong class="mk-name"></strong><p class="mk-say"></p></div></div>`);
  head.prepend(keeper(s.job, 88));
  head.querySelector(".mk-name").textContent = t(s.name);
  head.querySelector(".mk-say").textContent = t(s.say);
  body.append(head);
  if (s.pay.length) {
    const pay = h(`<div class="mk-pay"><span class="mk-pay-word"></span></div>`);
    pay.querySelector(".mk-pay-word").textContent = t(s.id === "grocer" ? PAYS_WORD.glow : PAY_WORD[s.pay[0]]);
    pay.append(pills(game, s.pay, go));
    body.append(pay);
  }
  const done = () => { saveGame(); changed(); };
  const at = h(`<div class="mk-stall"></div>`);
  body.append(at);
  // What each stall sells: the same screens as before, drawn here.
  const farm = () => import("./farm-ui.js");
  if (s.id === "tailor") shelf(at, "items");
  else if (s.id === "herald") shelf(at, "moves");
  else if (s.id === "baker") supplies(at);
  else if (s.id === "fisher") {
    import("./fishscreen.js").then((m) => {
      const again = () => { saveGame(); changed(); repaint(); };
      at.append(m.rodsBlock(game, again));
      const tank = m.tankRow(game, again);
      if (tank) { const b = block("Aquarium"); b.append(tank); at.append(b); }
    });
  } else if (s.id === "florist") {
    farm().then((m) => {
      const seeds = h(`<div class="mk-part"></div>`);
      const ups = h(`<div class="mk-part"></div>`);
      at.append(seeds, ups);
      inline(seeds, () => m.openSeedStand({ changed: done }));
      inline(ups, () => m.openFarmShop({ changed: done }));
    });
  } else if (s.id === "grocer") farm().then((m) => inline(at, () => m.openFruitStall({ changed: done })));
  else if (s.id === "cook") farm().then((m) => inline(at, () => m.openCookbook({ changed: done })));
  else if (s.id === "orders") orders(at, game, done, repaint);
}

/** The keepers along the top: a tap opens their stall. */
function tabs(open, s, repaint) {
  const el = h(`<div class="mk-tabs" role="tablist"></div>`);
  for (const x of open) {
    const b = h(`<button type="button" class="mk-tab${x.id === s.id ? " on" : ""}" role="tab" aria-selected="${x.id === s.id}"><span class="mk-tab-word"></span></button>`);
    b.prepend(keeper(x.job, 40));
    b.querySelector(".mk-tab-word").textContent = t(x.tab);
    b.onclick = () => { if (x.id !== s.id) { stall = x.id; repaint(); } };
    el.append(b);
  }
  requestAnimationFrame(() => el.querySelector(".mk-tab.on")?.scrollIntoView({ block: "nearest", inline: "center" }));
  return el;
}

/** The whole Market: every counter, today's orders first (what needs you), then a row for each stall. */
function overview(body, game, open, go, repaint) {
  body.append(pills(game, ["coins", "gems", "glow", "pearls"], go));
  const list = h(`<div class="mk-list"></div>`);
  for (const s of open) {
    const waiting = s.id === "orders" ? ordersToday(game).filter((o) => !o.done).length : 0;
    if (s.id === "orders" && !waiting) continue; // (no orders left today: nothing to show)
    const r = h(`<button type="button" class="mk-row${s.id === "orders" ? " mk-lead" : ""}"><span class="mk-row-text"><span class="mk-row-name"></span>
      <span class="mk-row-sub"></span></span><span class="mk-row-end"></span></button>`);
    r.prepend(keeper(s.job, 56));
    r.querySelector(".mk-row-name").textContent = t(s.name);
    r.querySelector(".mk-row-sub").textContent = t(s.about);
    const end = r.querySelector(".mk-row-end");
    if (waiting) end.append(Object.assign(h(`<span class="nav-count mk-count"></span>`), { textContent: String(waiting) }));
    for (const kind of s.pay) end.insertAdjacentHTML("beforeend", icon({ coins: "coin", gems: "gem", glow: "glow", pearls: "pearl" }[kind]));
    r.onclick = () => { stall = s.id; repaint(); };
    list.append(r);
    if (s.id === "orders") list.append(Object.assign(h(`<p class="mk-heading"></p>`), { textContent: t("Stalls") }));
  }
  body.append(list);
}

/** Today's orders: a row each (who wants what, and what it pays); a tap opens the farm's order box. */
function orders(at, game, done, repaint) {
  const list = ordersToday(game);
  import("./farm-ui.js").then((m) => {
    const b = block();
    for (const o of list) {
      const who = t(FOLK_NAME[o.folk] || "Muffle");
      const r = row({
        pic: "", name: t("{0} wants {1} × {2}", who, o.n, t(o.crop.name)),
        sub: o.done ? t("Filled today") : amount("coins", o.coins), dim: o.done,
        end: o.done ? icon("check") : m.cropIcon(o.crop, 32),
        open: o.done ? null : () => m.openOrder(o, who, { changed: () => { done(); repaint(); } }),
      });
      r.querySelector(".gs-row-pic").append(keeper(o.folk, 40));
      b.append(r);
    }
    if (!list.length) b.append(Object.assign(h(`<p class="gs-state muted"></p>`), { textContent: t("No orders today.") }));
    at.append(b);
  });
}
