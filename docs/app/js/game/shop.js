// The creature game's screens, opened from the home card's buttons: each section is a screen of its own. Its head
// shows the section's picture and name, what it is paid with, a "?" (the explanation, info.js) and an X back to
// Home. Shop and My things share one screen with a switch, like a shop counter and your bag; Garden and Supplies
// share another (garden.js draws those two); so do Creatures and Badges (creatures.js draws those), and Battle and
// its Friends side (battle-ui.js and friends-game.js; the gym leaders are gyms-ui.js). Battle moves
// are shown as on the Creatures screen (movesui.js). What each screen shows and how its things are sorted: sections.js.
//
// Coins come from studying. They buy things to wear and decorations (for looks only) and battle moves (new tricks
// for battles, not bigger numbers).

import { h, toast } from "../app.js";
import { openModal } from "../components/modal.js";
import { SHOP_MOVES, itemById } from "./data.js";
import { formOf } from "./genome.js";
import { t } from "../i18n.js";
import { buy, buyMove, equip, moveStock, placeDecor, shopStock, wearProblem } from "./rules.js";
import { getGame, saveGame, sfx } from "./game.js";
import { eggPicture, icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { badgesPanel, creaturesPanel } from "./creatures.js";
import { friendsHelp, friendsPanel, gift } from "./friends-game.js";
import { gardenPanel, suppliesPanel } from "./garden.js";
import { battleHelp, battlePanel, moveHelp, portrait, startFriendBattle } from "./battle-ui.js";
import { moveRow, moveView } from "./movesui.js";
import { SHOP_SEEN_KEY, shopSeen } from "./homecard.js";
import { openEarned, openEvolution } from "./info.js";
import {
  KIND, POCKETS, isOn, lockedShelf, pillsOf, pocketBlocks, pocketCounts, pocketOf, screenOf, sectionOf, shelves, wearing,
} from "./sections.js";
import { amount, art, block, details, fact, grid, switcher, tile } from "./screenparts.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const PILL_WORD = { coins: "Coins", gems: "Gems", glow: "Glow" };
let pocket = "wear"; // the bag's pocket last open (for as long as the app is open)

/**
 * Open the game sheet on a section: "shop", "mine", "creatures", "badges", "garden" or "supplies" (anything else
 * opens the shop). `changed()` runs whenever something was bought, worn or used. The Shop, My things, Garden and
 * Supplies panels are drawn by `panel(body, game, changed, go)`, where `go(section)` turns the sheet to another
 * section in place; from anywhere else, calling openShop(section, changed) again does the same. Returns close().
 * "battle" and "friends" are the Battle screen and its Friends side (battle-ui.js, friends-game.js): `opts.counts`
 * puts a number on the switch ({friends: n}: gifts and challenges waiting), `opts.focus` = "gyms" scrolls to the gyms.
 */
export function openShop(tab, changed = () => {}, opts = {}) {
  const game = getGame();
  const counts = { ...(opts.counts || {}) };
  let focus = opts.focus || null;
  document.querySelector(".game-sheet-wrap")?.remove();
  const wrap = h(`<div class="game-sheet-wrap"><div class="game-sheet gs-sheet" role="dialog">
    <div class="game-sheet-head gs-head">
      <strong class="gs-title"><span class="gs-title-pic"></span><span class="gs-title-word"></span></strong>
      <span class="gs-pills"></span>
      <button type="button" class="ghost icon sheet-help" title="How this works" aria-label="How this works">${lineIcon("question", 20)}</button>
      <button type="button" class="ghost icon gs-close" data-close title="Close" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="gs-switch"></div>
    <div class="game-sheet-body"></div>
  </div></div>`);
  const $ = (q) => wrap.querySelector(q);
  const body = $(".game-sheet-body");
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });

  let current = "shop";
  const today = {}; // the shop's selection as it was when this sheet opened: what is bought stays in its place
  const onChange = () => { changed(); head(); };
  const go = (id) => paint(id);

  /** The head and the switch: the section's picture and name, its counters and its "?". */
  function head() {
    const s = screenOf(current);
    $(".gs-title-pic").innerHTML = icon(s.icon, 32);
    $(".gs-title-word").textContent = s.title;
    $(".game-sheet").setAttribute("aria-label", s.title);
    const pills = $(".gs-pills");
    pills.replaceChildren(...pillsOf(current, game).map((p) => {
      const el = h(`<span class="gs-pill">${amount(p.kind, p.n)}</span>`);
      el.title = PILL_WORD[p.kind];
      return el;
    }));
    const help = $(".sheet-help");
    help.classList.toggle("gs-off", !s.help); // (kept in its place, so the X never moves)
    help.disabled = !s.help;
    const own = { evolve: openEvolution, battle: battleHelp, friends: friendsHelp }[s.help];
    help.onclick = () => (own ? own(game, go, { over: true }) : openEarned(s.help, game, go, { over: true }));
    const sw = $(".gs-switch");
    sw.hidden = !s.switch;
    sw.replaceChildren(...(s.switch ? [switcher(s.switch.map((o) => ({ ...o, icon: screenOf(o.id).icon, count: o.id === current ? null : counts[o.id] || null })), current, (id) => paint(id))] : []));
  }

  /** Draw a section. `keep`: the same section again after a change, scrolled where it was. */
  function paint(id, keep = false) {
    const top = body.scrollTop;
    current = sectionOf(id);
    head();
    body.replaceChildren();
    PANELS[current](body, game, onChange, go);
    body.scrollTop = keep ? top : 0;
  }

  const PANELS = {
    shop: (b) => shopPanel(b, game, onChange, today, () => paint("shop", true)),
    mine: (b) => minePanel(b, game, onChange, go, () => paint("mine", true)),
    creatures: (b) => creaturesPanel(b, game, onChange),
    badges: (b) => badgesPanel(b, game),
    garden: (b) => gardenPanel(b, game, onChange, go),
    supplies: (b) => suppliesPanel(b, game, onChange, go),
    battle: (b) => { battlePanel(b, game, onChange, go, close, focus); focus = null; },
    // (what waits there is seen once it is open: the number on the switch goes at the next redraw)
    friends: (b) => { delete counts.friends; friendsPanel(b, game, onChange, (friend, profile, opts) => { close(); startFriendBattle(friend, profile, opts); }); },
  };
  document.body.append(wrap);
  paint(tab);
  return close;
}

// ---------- pictures and facts shared by the shop and the bag ----------

/** The creature in the habitat trying a thing to wear on (null for decorations, and for an egg, which wears nothing). */
function tryOn(game, it) {
  const c = game.creature;
  if (it.slot === "decor" || formOf(c).id === "egg") return null;
  return portrait({ ...c, equipped: { ...(c.equipped || {}), [it.slot]: it.id } }, 176);
}
/** The big picture in an item's details: the creature wearing it (with the item itself in the corner), or the item. */
const itemPic = (game, it) => {
  const on = tryOn(game, it);
  return on ? { pic: on, thing: art(it, 48) } : { pic: art(it, 128) };
};

// ---------- Buy: the shop counter ----------

function shopPanel(body, game, changed, today, repaint) {
  // Seen: what is affordable now no longer lights the Shop tile's dot on Home (homecard.shopDot).
  try { localStorage.setItem(SHOP_SEEN_KEY, JSON.stringify(shopSeen(game))); } catch { /* no memory here: the dot may come back */ }
  if (!today.stock) { today.stock = shopStock(game); today.moves = moveStock(game); }
  const list = shelves(today.stock, today.moves);
  if (!list.length) {
    const b = block();
    b.append(h(`<p class="gs-empty">${icon("check", 32)}<span>You own everything that's on offer.</span></p>`));
    body.append(b);
  }
  for (const shelf of list) {
    const moves = shelf.id === "moves";
    const b = block(shelf.label, moves ? `${game.attacks.filter((id) => SHOP_MOVES.some((m) => m.id === id)).length} / ${SHOP_MOVES.length}` : null);
    if (moves) b.querySelector(".gs-block-end").title = "Battle moves you know, of those sold here";
    if (moves) {
      const list = h(`<div class="mv-list"></div>`);
      for (const m of shelf.items) {
        const bought = game.attacks.includes(m.id);
        const r = moveRow(m, game.creature);
        r.classList.add("gs-move-row");
        r.append(h(`<span class="gs-move-price">${bought ? `${icon("check")}<span>Yours</span>` : amount("coins", m.price, game.coins < m.price)}</span>`));
        if (bought) r.disabled = true; else r.onclick = () => moveToBuy(game, m, changed, repaint);
        list.append(r);
      }
      b.append(list);
      body.append(b);
      continue;
    }
    const g = grid();
    for (const it of shelf.items) {
      const bought = game.owned.includes(it.id);
      g.append(tile({
        pic: art(it), name: it.name, done: bought,
        sub: bought ? `${icon("check")}<span>Yours</span>` : amount("coins", it.price, game.coins < it.price),
        open: bought ? null : () => itemToBuy(game, it, changed, repaint),
      }));
    }
    b.append(g);
    body.append(b);
  }
  // What the shop keeps back until something is earned.
  const locked = lockedShelf(game);
  if (locked.length) {
    const b = block("Still to unlock");
    for (const l of locked) {
      const line = h(`<div class="gs-line">${icon(`tag_${l.tag}`)}<span class="gs-line-text"></span><span class="gs-line-end">${icon("lock")}${l.n}</span></div>`);
      line.querySelector(".gs-line-text").textContent = l.text;
      b.append(line);
    }
    body.append(b);
  }
}

const needCoins = (game, price) => {
  const n = price - game.coins;
  return n > 0 ? `You need ${n} more coin${n === 1 ? "" : "s"}.` : "";
};

function itemToBuy(game, it, changed, repaint) {
  details((d) => ({
    title: it.name, ...itemPic(game, it),
    facts: [fact("Kind", KIND[it.slot]), fact("Price", amount("coins", it.price))],
    text: it.slot === "decor" ? "For looks only. It goes out in the habitat straight away."
      : wearProblem(game.creature, it) === "wings" ? "For looks only. Your creature has wings of its own, so it can't wear things on its back. It goes in your bag for another creature."
      : wearProblem(game.creature, it) === "egg" ? "For looks only. Eggs only wear hats and things on the back, so it goes in your bag until your egg hatches."
      : "For looks only. It goes on straight away.",
    note: needCoins(game, it.price),
    buttons: [
      { word: "Close", run: () => d.close() },
      { word: "Buy", extra: amount("coins", it.price), primary: true, disabled: game.coins < it.price, run: () => {
        const problem = buy(game, it.id);
        if (problem) { toast(problem, { error: true }); return; }
        sfx("lucky");
        toast(`${it.name} is yours`);
        saveGame();
        changed();
        d.close();
        repaint();
      } },
    ],
  }));
}

/** A move's popup, the same as on the Creatures screen (movesui.moveView), with the buttons given: [{word, pic, extra,
 * primary, disabled, run}], and a line under it (`note`) that keeps its place. */
function moveBox(game, m, { text = "", note = "", buttons }) {
  const box = openModal({ title: m.name, cls: "mv-back" });
  const view = moveView(m, game.creature);
  if (text) view.querySelector(".mv-help").textContent = text;
  const n = h(`<p class="gs-detail-note"></p>`);
  n.textContent = note;
  view.append(n);
  const row = h(`<div class="confirm-buttons"></div>`);
  for (const b of buttons) {
    const el = h(`<button type="button" class="${b.primary ? "primary" : "ghost"}">${b.pic || ""}<span></span>${b.extra || ""}</button>`);
    el.querySelector("span").textContent = b.word;
    el.disabled = !!b.disabled;
    el.onclick = () => b.run(box);
    row.append(el);
  }
  view.append(row);
  box.body.replaceChildren(view);
  return box;
}

function moveToBuy(game, m, changed, repaint) {
  moveBox(game, m, {
    text: t("{0} Bought once, for all your creatures.", moveHelp(m)),
    note: needCoins(game, m.price),
    buttons: [
      { word: "Close", run: (box) => box.close() },
      { word: "Buy", extra: amount("coins", m.price), primary: true, disabled: game.coins < m.price, run: (box) => {
        const problem = buyMove(game, m.id);
        if (problem) { toast(problem, { error: true }); return; }
        sfx("lucky");
        toast(`You learned ${m.name}. Give it to a creature on the Creatures page.`);
        saveGame();
        changed();
        box.close();
        repaint();
      } },
    ],
  });
}

// ---------- My things: the bag, with a pocket for each kind ----------

function minePanel(body, game, changed, go, repaint) {
  pocket = pocketOf(pocket);
  const counts = pocketCounts(game);
  body.append(switcher(POCKETS.map((p) => ({ ...p, count: counts[p.id] })), pocket, (id) => { pocket = id; go("mine"); }, "gs-pockets"));
  const blocks = pocketBlocks(game, pocket);
  if (!blocks.length) {
    const b = block();
    const empty = h(`<div class="gs-empty">${icon("ui/slot_empty", 48)}<span>Nothing yet. Things you buy in the shop are kept here.</span>
      <button type="button" class="primary">${icon("nav_shop")}<span>Open the shop</span></button></div>`);
    empty.querySelector("button").onclick = () => go("shop");
    b.append(empty);
    body.append(b);
    return;
  }
  if (pocket === "wear") body.append(wearingBlock(game, changed, go, repaint));
  for (const bl of blocks) {
    const b = block(bl.label, String(bl.items.length));
    if (pocket === "moves") {
      const list = h(`<div class="mv-list"></div>`);
      for (const m of bl.items) {
        const r = moveRow(m, game.creature);
        r.onclick = () => moveInBag(game, m, go);
        list.append(r);
      }
      b.append(list);
      body.append(b);
      continue;
    }
    const g = grid();
    for (const it of bl.items) {
      const on = isOn(game, it);
      g.append(tile({
        pic: art(it), name: it.name, on,
        sub: on && it.slot !== "decor" ? `${icon("check")}<span>Wearing</span>` : "",
        open: () => itemInBag(game, it, changed, repaint),
      }));
    }
    b.append(g);
    body.append(b);
  }
}

/** The creature in the habitat and what it wears, one cell per kind of thing. */
function wearingBlock(game, changed, go, repaint) {
  const c = game.creature;
  const egg = formOf(c).id === "egg";
  const b = block("Wearing now");
  const pic = h(`<div class="gs-wear-pic"></div>`);
  pic.append(egg ? eggPicture(c, 64, "px-icon") : portrait(c, 176));
  b.append(pic);
  const slots = h(`<div class="gs-slots"></div>`);
  for (const w of wearing(game)) {
    const cell = h(`<button type="button" class="gs-slot"><span class="gs-slot-pic">${w.item ? art(w.item, 32) : icon("ui/slot_empty", 24)}</span>
      <span class="gs-label"></span><span class="gs-slot-v"></span></button>`);
    cell.querySelector(".gs-label").textContent = w.label;
    cell.querySelector(".gs-slot-v").textContent = w.item ? w.item.name : "Nothing";
    if (w.item) cell.onclick = () => itemInBag(game, w.item, changed, repaint);
    else cell.disabled = true;
    slots.append(cell);
  }
  b.append(slots);
  if (egg) b.append(h(`<p class="gs-detail-text">Eggs wear a hat and something on the back. Everything else waits until they hatch.</p>`));
  return b;
}

function itemInBag(game, it, changed, repaint) {
  details((d) => {
    if (!game.owned.includes(it.id)) return null; // given away meanwhile
    const decor = it.slot === "decor";
    const on = isOn(game, it);
    const cant = decor || on ? "" : wearProblem(game.creature, it); // a back item on a winged creature, or not a hat or back item on an egg
    return {
      title: it.name, ...itemPic(game, it),
      facts: [fact("Kind", KIND[it.slot]), fact("Now", decor ? (on ? "Out in the habitat" : "Put away") : on ? "Wearing" : "In your bag")],
      note: cant === "wings" ? "Your creature has wings of its own, so it can't wear things on its back. Another of your creatures can."
        : cant === "egg" ? "Eggs only wear hats and things on the back. Your creature can wear this once it hatches." : "",
      buttons: [
        { word: "Give", pic: icon("gift"), run: () => { d.close(); gift("item", it.id, () => { changed(); repaint(); }); } },
        { word: decor ? (on ? "Put away" : "Put out") : on ? "Take off" : "Wear", primary: !on, disabled: !!cant, run: () => {
          if (decor) placeDecor(game, it.id, !on);
          else equip(game, it.slot, on ? null : it.id);
          saveGame();
          changed();
          repaint();
          d.redraw();
        } },
      ],
    };
  });
}

function moveInBag(game, m, go) {
  moveBox(game, m, {
    buttons: [
      { word: "Close", run: (box) => box.close() },
      { word: "Creatures", pic: icon("nav_roster"), primary: true, run: (box) => { box.close(); go("creatures"); } },
    ],
  });
}

export { itemById };
