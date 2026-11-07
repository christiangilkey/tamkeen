// Parts shared by the creature game's screens (shop.js, garden.js): blocks with a small heading, square tiles that
// open a thing's details, the details box itself (like an entry in a creature guide: a big picture, its name, facts
// in labelled cells, two buttons of equal width), and a switch of two or three equal parts. Pictures are drawn at
// whole-number scales (sections.fitScale), so their pixels stay square.

import { h } from "../app.js";
import { openModal } from "../components/modal.js";
import { icon } from "./render.js";
import { artOf, fitScale } from "./sections.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const attr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString();

/** A thing's picture as big as fits in a `box`-pixel square: `thing` is anything sections.artOf knows, or {file, w, h}. */
export function art(thing, box = 64) {
  const a = thing.file ? thing : artOf(thing);
  const k = fitScale(a.w, a.h, box);
  return `<img class="px-icon gs-art" alt="" width="${a.w * k}" height="${a.h * k}" src="${attr(ART + a.file)}">`;
}

/** A price or an amount in its own colour: "coins", "gems" or "glow". `short`: not enough of it (shown muted). */
export function amount(kind, n, short = false) {
  const pic = { coins: "coin", gems: "gem", glow: "glow" }[kind];
  return `<span class="gs-amount cur-${pic}${short ? " short" : ""}">${icon(pic)}${fmt(n)}</span>`;
}

/** A block: a solid panel with a small heading (`label`, optional). `end` (text or an element) sits at the heading's
 * other end: a count, or a "?". */
export function block(label = "", end = null) {
  const el = h(`<section class="gs-block">${label ? `<div class="gs-block-head"><span class="gs-label"></span></div>` : ""}</section>`);
  if (label) {
    el.querySelector(".gs-label").textContent = label;
    if (end != null) {
      const e = typeof end === "string" ? h(`<span class="gs-block-end"></span>`) : end;
      if (typeof end === "string") e.textContent = end;
      el.querySelector(".gs-block-head").append(e);
    }
  }
  return el;
}

/** A fact for a details box: its label and its value (markup). (A call, so the label is found for translating.) */
export const fact = (label, value) => [label, value];

/** A grid for tiles. */
export const grid = () => h(`<div class="gs-grid"></div>`);

/** A square tile: its picture, its name, and a line under it (`sub`: markup, such as a price). A tap runs `open`;
 * without one the tile is shown but can't be pressed. `on`: worn, or out in the habitat. `done`: bought already.
 * `count`: how many the owner has, in the tile's corner. */
export function tile({ pic, name, sub = "", on = false, done = false, open = null, count = null }) {
  const b = h(`<button type="button" class="gs-tile${on ? " on" : ""}${done ? " done" : ""}"><span class="gs-tile-pic">${pic}</span>
    <span class="gs-tile-name"></span><span class="gs-tile-sub">${sub}</span></button>`);
  b.querySelector(".gs-tile-name").textContent = name;
  if (count != null) b.append(h(`<span class="gs-tile-n${count ? "" : " none"}" title="How many you have">×${fmt(count)}</span>`));
  if (open) b.onclick = open; else b.disabled = true;
  return b;
}

/** A row in a block: a picture, a name with a line under it, and something at its end (a button, a count, an arrow).
 * `open`: the whole row is one button that runs it (then `end` is only shown, never pressed). */
export function row({ pic, name, sub = "", end = "", open = null, dim = false }) {
  const inside = `<span class="gs-row-pic">${pic}</span><span class="gs-row-text"><span class="gs-row-name"></span>
    <span class="gs-row-sub">${sub}</span></span><span class="gs-row-end"></span>`;
  const el = h(open ? `<button type="button" class="gs-row">${inside}</button>` : `<div class="gs-row">${inside}</div>`);
  el.classList.toggle("dim", dim);
  el.querySelector(".gs-row-name").textContent = name;
  const e = el.querySelector(".gs-row-end");
  if (typeof end === "string") e.innerHTML = end; else if (end) e.append(end);
  if (open) el.onclick = open;
  return el;
}

/** A switch of two or three equal parts: options [{id, word, icon, count}]; `pick(id)` runs on a tap. */
export function switcher(options, current, pick, cls = "") {
  const el = h(`<div class="segmented gs-seg${cls ? ` ${cls}` : ""}" role="tablist"></div>`);
  for (const o of options) {
    const on = o.id === current;
    const b = h(`<button type="button" class="seg-btn${on ? " on" : ""}" role="tab" aria-selected="${on}">${o.icon ? icon(o.icon) : ""}<span></span></button>`);
    b.querySelector("span").textContent = o.word;
    if (o.count != null) b.append(h(`<span class="gs-seg-n">${fmt(o.count)}</span>`));
    b.onclick = () => { if (!on) pick(o.id); };
    el.append(b);
  }
  return el;
}

/**
 * A thing's details in the app's own box over the screen. `fill(d)` returns what to show and is called again by
 * `d.redraw()` after something changed (bought, worn, fed), so the box stays where it is; returning null closes it.
 *   {title, pic (markup or an element; none: no picture panel), thing (markup: a small picture in the big one's corner),
 *    facts: [[label, value markup]], text, more (an element under the text: a list of choices), note,
 *    buttons: [{word, pic (markup before it), extra (markup after it: a price), primary, danger, disabled, run(d)}]}
 * Facts are labelled cells, two to a row. `note` (a word on why a button can't be pressed) keeps its line even
 * when empty, so the buttons never move. Returns d: {close, redraw}.
 */
export function details(fill) {
  const m = openModal({ title: "", cls: "gs-detail-back" });
  const d = { close: m.close, redraw };
  function redraw() {
    const v = fill(d);
    if (!v) { m.close(); return; }
    m.setTitle(v.title || "");
    const box = h(`<div class="gs-detail"></div>`);
    if (v.pic) {
      const pic = h(`<div class="gs-detail-pic"></div>`);
      if (typeof v.pic === "string") pic.innerHTML = v.pic; else pic.append(v.pic);
      if (v.thing) pic.append(h(`<span class="gs-detail-thing">${v.thing}</span>`));
      box.append(pic);
    }
    if (v.facts && v.facts.length) {
      const facts = h(`<div class="gs-facts"></div>`);
      for (const [k, val] of v.facts) {
        const cell = h(`<div class="gs-fact"><span class="gs-label"></span><span class="gs-fact-v">${val}</span></div>`);
        cell.querySelector(".gs-label").textContent = k;
        facts.append(cell);
      }
      box.append(facts);
    }
    if (v.text) { const p = h(`<p class="gs-detail-text"></p>`); p.textContent = v.text; box.append(p); }
    if (v.more) box.append(v.more);
    const note = h(`<p class="gs-detail-note"></p>`);
    note.textContent = v.note || "";
    box.append(note);
    const buttons = h(`<div class="confirm-buttons"></div>`);
    for (const b of v.buttons || []) {
      const el = h(`<button type="button" class="${b.primary ? "primary" : b.danger ? "danger-solid" : ""}">${b.pic || ""}<span></span>${b.extra || ""}</button>`);
      el.querySelector("span").textContent = b.word;
      el.disabled = !!b.disabled;
      el.onclick = () => b.run(d);
      buttons.append(el);
    }
    box.append(buttons);
    m.body.replaceChildren(box);
  }
  redraw();
  return d;
}
