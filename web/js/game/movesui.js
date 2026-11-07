// A creature's battle moves on the Creatures page (creatures.js), laid out like a handheld monster game's move list:
// the four it uses as tiles in its elements' colours (in the places of the battle's X Y / A B buttons), then the
// other moves it knows. A tap on a move shows what it does, with "Swap" or "Use this move". When all four slots are
// full the popup asks which move to replace, so nothing is ever dropped without asking. The rules are movepick.js.

import { h } from "../app.js";
import { MOVE_STYLES, SHOP_MOVES, TYPES, moveById, moveIcon } from "./data.js";
import { knownMoves, loadout } from "./battle.js";
import { moveHelp, moveLine } from "./battle-ui.js";
import { icon } from "./render.js";
import { openModal } from "../components/modal.js";
import { t } from "../i18n.js";
import { SLOT_ORDER, benched, moveElement, moveFacts, onlyAttack, slotsOf, useMove, whyNot } from "./movepick.js";

/** A small pill with an element's picture and name. */
export function elementBadge(type) {
  const b = h(`<span class="el-badge tint-${type}">${icon(`type_${type}`)}<span></span></span>`);
  b.lastChild.textContent = TYPES[type].name;
  return b;
}

const tintOf = (m, g) => `tint-${moveElement(m, g) || "plain"}`;
/** What a move does in a few words: for an attack its power, else "Blocks 50%", "Heals 36%", "Spring"... */
function effectOf(m) {
  if (m.kind === "attack") return t("Power {0}", m.power);
  const { effect } = moveFacts(m);
  return effect.name ? t(effect.value) : `${t(effect.label)} ${effect.value}`;
}
/** A move's line in a list: "Strike · Power 55 · Drop", or "Guard · Blocks 50%" for a move that doesn't attack. */
const lineOf = (m) => moveLine(m, m.kind === "attack" ? null : effectOf(m));
/** A slot's line, its number and kind only, so a long name has room for two lines; the number first, so a narrow
 * slot never cuts it off: "Power 55 · Strike". */
const shortLine = (m) => `${effectOf(m)} · ${t(MOVE_STYLES[m.style].name)}`;

/** One of the four slots: the move's picture, its name and one short line (or a note saying why it can't be picked). */
function slotTile(m, g, note = "") {
  const b = h(`<button type="button" class="mv-slot ${tintOf(m, g)}"><span class="mv-pic">${icon(moveIcon(m), 32)}</span>
    <span class="mv-txt"><strong></strong><span class="mv-line"></span></span></button>`);
  b.querySelector("strong").textContent = m.name;
  b.querySelector(".mv-line").textContent = note || shortLine(m);
  return b;
}
const emptyTile = () => h(`<button type="button" class="mv-slot empty"><span>Empty</span></button>`);

/** A move in a list: its picture on its element's colour, its name and line, and its element. (Also the Shop's and
 * My things' move rows, shop.js.) */
export function moveRow(m, g, note = "") {
  const b = h(`<button type="button" class="mv-row"><span class="mv-pic ${tintOf(m, g)}">${icon(moveIcon(m), 32)}</span>
    <span class="mv-txt"><strong></strong><span class="mv-line"></span></span></button>`);
  b.querySelector("strong").textContent = m.name;
  b.querySelector(".mv-line").textContent = note || lineOf(m);
  const el = moveElement(m, g);
  if (el) b.append(elementBadge(el));
  return b;
}

/** The four slots laid out like the battle's buttons (X Y over A B). `tile(id, slot)` makes each. */
function slotGrid(slots, tile) {
  const grid = h(`<div class="mv-slots"></div>`);
  for (const at of SLOT_ORDER) grid.append(tile(slots[at] || null, at));
  return grid;
}

/**
 * The Moves blocks of a creature's entry: the four it uses, and the other moves it knows. `done()` runs after
 * the moves changed (save and repaint); `shop()` opens the shop.
 */
export function movesBlocks(game, g, done, shop) {
  const slots = slotsOf(loadout(game, g));
  const rest = benched(knownMoves(game, g), slots);
  const save = (next) => { g.moves = next; done(); };
  const pick = (at) => pickMove(game, g, at, save, null);

  const mine = h(`<div class="gs-block"><div class="gs-label">Moves</div></div>`);
  mine.append(slotGrid(slots, (id, at) => {
    if (!id) {
      const b = emptyTile();
      if (rest.length) b.onclick = () => pick(at); else b.disabled = true;
      return b;
    }
    const b = slotTile(moveById(id), g);
    b.onclick = () => openMove(game, g, id, save);
    return b;
  }));
  mine.append(h(`<p class="small muted mv-rule">Tap a move to see it or swap it. Keep at least one attacking move.</p>`));

  const others = h(`<div class="gs-block"><div class="gs-label">Other moves it knows</div></div>`);
  if (rest.length) {
    const list = h(`<div class="mv-list"></div>`);
    for (const m of rest) {
      const b = moveRow(m, g);
      b.onclick = () => openMove(game, g, m.id, save);
      list.append(b);
    }
    others.append(list);
  } else others.append(h(`<p class="small muted mv-rule">It uses every move it knows.</p>`));
  if (SHOP_MOVES.some((m) => !(game.attacks || []).includes(m.id))) {
    const go = h(`<button type="button" class="mv-shop">${icon("coin")} Buy more moves in the shop</button>`);
    go.onclick = shop;
    others.append(go);
  }
  return [mine, others];
}

/** The top of a move's popup: its picture on its element's colour, its element, three numbers and what it does
 * (`.mv-help`). The popup's own buttons go after it. (Also the Shop's move popup, with Buy: shop.js.) */
export function moveView(m, g) {
  const facts = moveFacts(m);
  const el = moveElement(m, g);
  const view = h(`<div class="mv-detail"><div class="mv-hero ${tintOf(m, g)}">${icon(moveIcon(m), 48)}</div>
    <div class="mv-facts"><span class="mv-fact"><span>Kind</span><b></b></span><span class="mv-fact"><span></span><b></b></span>
      <span class="mv-fact"><span>Wait</span><b></b></span></div>
    <p class="mv-help"></p></div>`);
  if (el) view.querySelector(".mv-hero").after(elementBadge(el));
  const [kind, effect, wait] = view.querySelectorAll(".mv-fact");
  kind.querySelector("b").textContent = facts.kind;
  effect.querySelector("span").textContent = facts.effect.label;
  effect.querySelector("b").textContent = facts.effect.value;
  if (!facts.effect.name) effect.querySelector("b").setAttribute("translate", "no"); // a number
  wait.querySelector("b").textContent = t("{0} s", String(facts.wait));
  view.querySelector(".mv-help").textContent = moveHelp(m);
  return view;
}

/** A move's details in a popup: its picture, element, numbers and what it does, with Swap or Use this move. */
export function openMove(game, g, id, save) {
  const m = moveById(id);
  const box = openModal({ title: m.name, cls: "mv-back" });
  const slots = slotsOf(loadout(game, g));
  const at = slots.indexOf(id);
  const rest = benched(knownMoves(game, g), slots);
  const done = (next) => { box.close(); save(next); };

  function details() {
    box.setTitle(m.name);
    const view = moveView(m, g);
    // What can't be done is said before it is tried.
    const note = at >= 0 && onlyAttack(slots, at) ? "Its only attacking move: it can only be swapped for another attacking move."
      : at >= 0 && !rest.length ? "It knows no other moves yet." : "";
    if (note) view.append(Object.assign(h(`<p class="small muted mv-note"></p>`), { textContent: note }));
    const row = h(`<div class="confirm-buttons"><button type="button" class="ghost">Close</button><button type="button" class="primary"></button></div>`);
    const [close, act] = row.children;
    close.onclick = () => box.close();
    if (at >= 0) {
      act.textContent = "Swap";
      act.disabled = !rest.length;
      act.onclick = () => pickMove(game, g, at, done, { box, back: details });
    } else {
      act.textContent = "Use this move";
      act.onclick = () => {
        const r = useMove(slots, id);
        if (r.problem === "full") replace(); else if (!r.problem) done(r.slots);
      };
    }
    view.append(row);
    box.body.replaceChildren(view);
  }

  // All four slots are full: which one does the new move replace?
  function replace() {
    box.setTitle("Replace which move?");
    const view = h(`<div class="mv-detail"><p class="muted mv-ask"></p></div>`);
    view.firstChild.textContent = `${m.name} takes the place of the move you pick.`; // (the page translates the sentence and the name in it)
    view.append(slotGrid(slots, (old, i) => {
      const why = whyNot(slots, id, i);
      const b = slotTile(moveById(old), g, why === "attack" ? "Its only attacking move" : "");
      b.disabled = !!why;
      b.onclick = () => { const r = useMove(slots, id, i); if (!r.problem) done(r.slots); };
      return b;
    }));
    const back = h(`<div class="confirm-buttons"><button type="button" class="ghost">Back</button></div>`);
    back.firstChild.onclick = details;
    view.append(back);
    box.body.replaceChildren(view);
  }

  details();
  return box;
}

/**
 * Choose which of the other known moves goes into slot `at` (swapping out what is there, or filling an empty slot).
 * `inside` = { box, back } when it opens inside a move's popup (Back returns there); else it opens its own popup.
 */
function pickMove(game, g, at, save, inside) {
  const slots = slotsOf(loadout(game, g));
  const rest = benched(knownMoves(game, g), slots);
  const box = inside ? inside.box : openModal({ title: "", cls: "mv-back" });
  box.setTitle(slots[at] ? "Swap for which move?" : "Choose a move");
  const view = h(`<div class="mv-detail"><div class="mv-list"></div></div>`);
  for (const m of rest) {
    const why = whyNot(slots, m.id, at);
    const b = moveRow(m, g, why === "attack" ? "Keep at least one attacking move." : "");
    b.disabled = !!why;
    b.onclick = () => {
      const r = useMove(slots, m.id, at);
      if (r.problem) return;
      if (!inside) box.close();
      save(r.slots);
    };
    view.firstChild.append(b);
  }
  const row = h(`<div class="confirm-buttons"><button type="button" class="ghost"></button></div>`);
  row.firstChild.textContent = inside ? "Back" : "Cancel";
  row.firstChild.onclick = inside ? inside.back : () => box.close();
  view.append(row);
  box.body.replaceChildren(view);
}

