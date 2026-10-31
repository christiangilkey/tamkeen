// The shop and the wardrobe: a sheet that slides over the page, opened from the habitat.
// Coins come from studying. They buy things to wear and decorations (for looks only) and battle
// moves (new tricks for battles, not bigger numbers).

import { h, toast } from "../app.js";
import { CATALOG, DECOR, ITEMS, SHOP_MOVES, SLOTS, TAGS, itemById, moveIcon } from "./data.js";
import { buy, buyMove, equip, moveStock, placeDecor, shopStock } from "./rules.js";
import { getGame, saveGame, sfx } from "./game.js";
import { icon } from "./render.js";
import { badgesPanel, creaturesPanel } from "./creatures.js";
import { friendsPanel, gift } from "./friends-game.js";
import { gardenPanel, suppliesPanel } from "./garden.js";
import { moveHelp, moveLine, startFriendBattle } from "./battle-ui.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const fileOf = (it) => (it.slot === "decor" ? `${it.id}.png` : `item/${it.id}.png`);

/** Open the sheet on "shop" or "mine". `changed()` runs whenever something was bought or worn. */
export function openShop(tab, changed) {
  const game = getGame();
  document.querySelector(".game-sheet-wrap")?.remove();
  const wrap = h(`<div class="game-sheet-wrap"><div class="game-sheet" role="dialog" aria-label="Shop and wardrobe">
    <div class="game-sheet-head">
      <div class="tabs">
        <button type="button" data-tab="shop">${icon("nav_shop")} Shop</button>
        <button type="button" data-tab="mine">${icon("nav_wardrobe")} My things</button>
        <button type="button" data-tab="creatures">${icon("nav_roster")} Creatures</button>
        <button type="button" data-tab="badges">${icon("nav_badges")} Badges</button>
        <button type="button" data-tab="friends">${icon("trade")} Friends</button>
        <button type="button" data-tab="garden">${icon("glow")} Garden</button>
        <button type="button" data-tab="supplies">${icon("potion")} Supplies</button>
      </div>
      <span class="spacer"></span>
      <span class="today-chip lit" id="sheet-coins">${icon("coin")} <span></span></span>
      <button type="button" class="ghost icon" data-close title="Close">${icon("close")}</button>
    </div>
    <div class="game-sheet-body"></div>
  </div></div>`);
  const body = wrap.querySelector(".game-sheet-body");
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });

  function card(it, mode) {
    const owned = game.owned.includes(it.id);
    const worn = it.slot === "decor" ? game.decor.some((d) => d.id === it.id) : game.creature.equipped[it.slot] === it.id;
    const el = h(`<div class="shop-item${worn ? " on" : ""}">
      <span class="shop-pic rarity-${it.price >= 60 ? "jackpot" : it.price >= 30 ? "lucky" : "common"}"><img alt="" src="${ART}${fileOf(it)}"></span>
      <span class="shop-name"></span>
      <span class="small muted">${it.slot === "decor" ? "Decoration" : SLOTS[it.slot].name}</span>
      <button type="button"></button>
    </div>`);
    el.querySelector(".shop-name").textContent = it.name;
    const btn = el.querySelector("button");
    if (mode === "shop") {
      btn.innerHTML = `${icon("coin")} ${it.price}`;
      btn.className = game.coins >= it.price ? "primary" : "";
      btn.disabled = owned;
      btn.onclick = () => {
        const problem = buy(game, it.id);
        if (problem) { toast(problem, { error: true }); return; }
        sfx("lucky");
        toast(`${it.name} is yours`);
        saveGame();
        changed();
        paint("shop");
      };
    } else {
      btn.textContent = it.slot === "decor" ? (worn ? "Put away" : "Put out") : worn ? "Take off" : "Wear";
      btn.onclick = () => {
        if (it.slot === "decor") placeDecor(game, it.id, !worn);
        else equip(game, it.slot, worn ? null : it.id);
        saveGame();
        changed();
        paint("mine");
      };
      const give = h(`<button type="button" class="ghost small" title="Give this to a friend">${icon("gift")} Give</button>`);
      give.onclick = () => gift("item", it.id, () => { changed(); paint("mine"); });
      el.append(give);
    }
    return el;
  }

  function paint(which) {
    for (const b of wrap.querySelectorAll("[data-tab]")) b.classList.toggle("primary", b.dataset.tab === which);
    wrap.querySelector("#sheet-coins span").textContent = `${game.coins} coins`;
    body.innerHTML = "";
    if (which === "creatures") { creaturesPanel(body, game, changed); return; }
    if (which === "badges") { badgesPanel(body, game); return; }
    if (which === "garden") { gardenPanel(body, game, changed); return; }
    if (which === "supplies") { suppliesPanel(body, game, changed); return; }
    if (which === "friends") { friendsPanel(body, game, changed, (friend, profile) => { close(); startFriendBattle(friend, profile); }); return; }
    if (which === "shop") {
      const stock = shopStock(game);
      body.append(h(`<p class="small muted">Today's selection, chosen for your creature. It changes every day. Coins come from
        reaching your daily goal (10), saving words (1 each), levelling up (5), winning battles, and a creature becoming fully grown (25).</p>`));
      if (!stock.length) body.append(h(`<p class="muted">You own everything that's on offer.</p>`));
      const grid = h(`<div class="shop-grid"></div>`);
      for (const it of stock) grid.append(card(it, "shop"));
      body.append(grid);
      // Battle moves: bought once, for all of your creatures. Choose who takes which on the Creatures page.
      const moves = moveStock(game);
      body.append(h(`<h3>${icon("battle")} Battle moves</h3>`));
      body.append(h(`<p class="small muted">Bought once, any of your creatures can take it into battle: choose on the Creatures page.
        You know ${game.attacks.length} of the ${SHOP_MOVES.length} moves sold here.</p>`));
      if (!moves.length) body.append(h(`<p class="muted">You know every move there is to buy.</p>`));
      const moveGrid = h(`<div class="shop-grid"></div>`);
      for (const m of moves) {
        const el = h(`<div class="shop-item"><span class="shop-pic rarity-${m.price >= 100 ? "jackpot" : m.price >= 70 ? "lucky" : "common"}"><img alt="" src="${ART}${moveIcon(m)}.png"></span>
          <span class="shop-name"></span><span class="small muted"></span><button type="button"></button></div>`);
        el.querySelector(".shop-name").textContent = m.name;
        el.querySelector(".small").textContent = moveLine(m);
        el.title = moveHelp(m);
        const btn = el.querySelector("button");
        btn.innerHTML = `${icon("coin")} ${m.price}`;
        btn.className = game.coins >= m.price ? "primary" : "";
        btn.onclick = () => {
          const problem = buyMove(game, m.id);
          if (problem) { toast(problem, { error: true }); return; }
          sfx("lucky");
          toast(`You learned ${m.name}. Give it to a creature on the Creatures page.`);
          saveGame();
          changed();
          paint("shop");
        };
        moveGrid.append(el);
      }
      body.append(moveGrid);
      const locked = CATALOG.filter((it) => (it.requires || []).some((t) => !game.tags.includes(t)) && !game.owned.includes(it.id));
      if (locked.length) {
        const need = [...new Set(locked.flatMap((it) => it.requires))].filter((t) => !game.tags.includes(t));
        body.append(h(`<p class="small muted">${icon("lock")} ${locked.length} more item${locked.length === 1 ? "" : "s"} appear once you've earned:
          ${need.map((t) => `${icon(`tag_${t}`)} ${TAGS[t] || t}`).join("; ")}.</p>`));
      }
    } else {
      const mine = [...ITEMS, ...DECOR].filter((it) => game.owned.includes(it.id));
      if (!mine.length) body.append(h(`<p class="muted">${icon("ui/slot_empty", 48)} Nothing yet. Things you buy in the shop are kept here.</p>`));
      const grid = h(`<div class="shop-grid"></div>`);
      for (const it of mine) grid.append(card(it, "mine"));
      body.append(grid);
    }
  }
  for (const b of wrap.querySelectorAll("[data-tab]")) b.onclick = () => paint(b.dataset.tab);
  document.body.append(wrap);
  paint(["mine", "creatures", "badges", "friends", "garden", "supplies"].includes(tab) ? tab : "shop");
  return close;
}

export { itemById };
