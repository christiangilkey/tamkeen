// The shop and the wardrobe: a sheet that slides over the page, opened from the habitat.
// Coins come from studying; everything here is for looks.

import { h, toast } from "../app.js";
import { CATALOG, DECOR, ITEMS, SLOTS, TAGS, itemById } from "./data.js";
import { buy, equip, placeDecor, shopStock } from "./rules.js";
import { getGame, saveGame, sfx } from "./game.js";
import { badgesPanel, creaturesPanel } from "./creatures.js";
import { friendsPanel, gift } from "./friends-game.js";
import { startFriendBattle } from "./battle-ui.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const fileOf = (it) => (it.slot === "decor" ? `${it.id}.png` : `item/${it.id}.png`);

/** Open the sheet on "shop" or "mine". `changed()` runs whenever something was bought or worn. */
export function openShop(tab, changed) {
  const game = getGame();
  document.querySelector(".game-sheet-wrap")?.remove();
  const wrap = h(`<div class="game-sheet-wrap"><div class="game-sheet" role="dialog" aria-label="Shop and wardrobe">
    <div class="game-sheet-head">
      <div class="tabs">
        <button type="button" data-tab="shop">Shop</button>
        <button type="button" data-tab="mine">My things</button>
        <button type="button" data-tab="creatures">Creatures</button>
        <button type="button" data-tab="badges">Badges</button>
        <button type="button" data-tab="friends">Friends</button>
      </div>
      <span class="spacer"></span>
      <span class="today-chip lit" id="sheet-coins"></span>
      <button type="button" class="ghost icon" data-close title="Close">✕</button>
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
      <span class="shop-pic"><img alt="" src="${ART}${fileOf(it)}"></span>
      <span class="shop-name"></span>
      <span class="small muted">${it.slot === "decor" ? "Decoration" : SLOTS[it.slot].name}</span>
      <button type="button"></button>
    </div>`);
    el.querySelector(".shop-name").textContent = it.name;
    const btn = el.querySelector("button");
    if (mode === "shop") {
      btn.textContent = `◉ ${it.price}`;
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
      const give = h(`<button type="button" class="ghost small" title="Give this to a friend">🎁 Give</button>`);
      give.onclick = () => gift("item", it.id, () => { changed(); paint("mine"); });
      el.append(give);
    }
    return el;
  }

  function paint(which) {
    for (const b of wrap.querySelectorAll("[data-tab]")) b.classList.toggle("primary", b.dataset.tab === which);
    wrap.querySelector("#sheet-coins").textContent = `◉ ${game.coins} coins`;
    body.innerHTML = "";
    if (which === "creatures") { creaturesPanel(body, game, changed); return; }
    if (which === "badges") { badgesPanel(body, game); return; }
    if (which === "friends") { friendsPanel(body, game, changed, (friend, profile) => { close(); startFriendBattle(friend, profile); }); return; }
    if (which === "shop") {
      const stock = shopStock(game);
      body.append(h(`<p class="small muted">Today's selection, chosen for your creature. It changes every day. Coins come from
        reaching your daily goal (10), saving words (1 each) and levelling up (5).</p>`));
      if (!stock.length) body.append(h(`<p class="muted">You own everything that's on offer.</p>`));
      const grid = h(`<div class="shop-grid"></div>`);
      for (const it of stock) grid.append(card(it, "shop"));
      body.append(grid);
      const locked = CATALOG.filter((it) => (it.requires || []).some((t) => !game.tags.includes(t)) && !game.owned.includes(it.id));
      if (locked.length) {
        const need = [...new Set(locked.flatMap((it) => it.requires))].filter((t) => !game.tags.includes(t));
        body.append(h(`<p class="small muted">🔒 ${locked.length} more item${locked.length === 1 ? "" : "s"} appear once you've earned:
          ${need.map((t) => TAGS[t]).join("; ")}.</p>`));
      }
    } else {
      const mine = [...ITEMS, ...DECOR].filter((it) => game.owned.includes(it.id));
      if (!mine.length) body.append(h(`<p class="muted">Nothing yet. Things you buy in the shop are kept here.</p>`));
      const grid = h(`<div class="shop-grid"></div>`);
      for (const it of mine) grid.append(card(it, "mine"));
      body.append(grid);
    }
  }
  for (const b of wrap.querySelectorAll("[data-tab]")) b.onclick = () => paint(b.dataset.tab);
  document.body.append(wrap);
  paint(["mine", "creatures", "badges", "friends"].includes(tab) ? tab : "shop");
  return close;
}

export { itemById };
