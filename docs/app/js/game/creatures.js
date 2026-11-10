// The "Creatures" and "Badges" pages of the game sheet, laid out like a handheld monster game's creature dex: with
// several creatures a grid of them first, and each creature's entry broken into blocks (its picture and name, its
// stats, how its owner's study raised it, its look, its battle moves). Badges are a badge case. Explanations live
// behind the sheet's "?" (info.js), not on the pages. The blocks use the shared .gs-block / .gs-label look.

import { h } from "../app.js";
import { BADGES, BASE_STATS, GROWN, STAGES, TRAITS, TYPES, beastById, prizeOf } from "./data.js";
import { progressText } from "./screenparts.js";
import { describe, formOf, isGrown, stageOf } from "./genome.js";
import { reshape, setActive, setShowcase, showcaseOf, variantOptions } from "./rules.js";
import { fighter } from "./battle.js";
import { portrait } from "./battle-ui.js";
import { eggPicture, icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { saveGame } from "./game.js";
import { gift, publishNow } from "./friends-game.js";
import { openModal } from "../components/modal.js";
import { t } from "../i18n.js";
import { elementBadge, movesBlocks } from "./movesui.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const STAGE_NAME = { egg: "Egg", hatchling: "Hatchling", juvenile: "Juvenile" };
const STAT_NAME = { hp: "Health", atk: "Attack", def: "Defence", spd: "Speed" };
const HABIT_NAME = { listener: "Listening", reader: "Reading", collector: "Collecting", curious: "Curiosity" }; // as in info.js
// A stat's bar is full at the best of that stat among the body plans (BASE_STATS).
const STAT_TOP = Object.fromEntries(["hp", "atk", "def", "spd"].map((k) => [k, Math.max(...Object.values(BASE_STATS).map((s) => s[k]))]));
const HATCH_AT = STAGES.find((s) => s.id === "hatchling").from;
const isEgg = (g) => stageOf(g.growth).id === "egg";
const titleOf = (g) => g.name || (isEgg(g) ? "Egg" : beastById(describe(g).beast).name);

/** Fill `body` again and keep where the page was scrolled to. */
function keepScroll(body, fill) {
  const top = body.scrollTop;
  fill();
  body.scrollTop = top;
}

// Friends see each creature's moves; tell them a little after the last change (not on every tap).
let publishTimer = 0;
const publishSoon = () => { clearTimeout(publishTimer); publishTimer = setTimeout(() => publishNow(true), 3000); };

/**
 * Fill `body` with the Creatures page. With one creature its entry; with several, the grid of them, or the entry
 * of the one whose seed is `seed`. `changed()` runs after anything is altered.
 */
export function creaturesPanel(body, game, changed, seed = null) {
  body.innerHTML = "";
  const one = game.roster.length === 1;
  const g = one ? game.roster[0] : game.roster.find((x) => x.seed === seed);
  if (g) entry(body, game, changed, g, !one);
  else list(body, game, changed);
}

/** Every creature as a tile: its picture, name and element. A tap opens its entry. */
function list(body, game, changed) {
  const block = h(`<div class="gs-block"><div class="gs-label">Your creatures</div><div class="cr-grid"></div></div>`);
  game.roster.forEach((g, i) => {
    const tile = h(`<button type="button" class="cr-tile${i === game.active ? " on" : ""}"><span class="cr-tile-pic"></span><strong></strong></button>`);
    tile.querySelector(".cr-tile-pic").append(picture(g, 88, 64));
    const name = tile.querySelector("strong");
    name.textContent = titleOf(g);
    if (g.name) name.setAttribute("translate", "no"); // a name its owner gave it
    tile.append(elementBadge(g.type));
    if (i === game.active) {
      tile.append(h(`<span class="cr-here" title="In the habitat">${lineIcon("home", 16)}</span>`));
      tile.setAttribute("aria-label", `${titleOf(g)}, ${t("In the habitat")}`);
    }
    tile.onclick = () => { creaturesPanel(body, game, changed, g.seed); body.scrollTop = 0; };
    block.querySelector(".cr-grid").append(tile);
  });
  body.append(block);
}

/** A creature's picture: its portrait, or its egg (in its hat and wings, when it wears them). */
function picture(g, size, eggSize) {
  if (!isEgg(g)) return portrait(g, size);
  return eggPicture(g, eggSize);
}

/** One creature's entry, as blocks. `back` adds the way back to the grid. */
function entry(body, game, changed, g, back) {
  const i = game.roster.indexOf(g);
  const repaint = () => { saveGame(); changed(); keepScroll(body, () => creaturesPanel(body, game, changed, g.seed)); };
  if (back) {
    const b = h(`<button type="button" class="ghost cr-back">${lineIcon("chevron", 18)}<span>All creatures</span></button>`);
    b.onclick = () => { creaturesPanel(body, game, changed); body.scrollTop = 0; };
    body.append(b);
  }
  body.append(hero(body, game, changed, g, i, repaint));
  if (isEgg(g)) return;
  // Battle things together (its numbers, then its moves), then its look, then the record of how it was raised.
  const toShop = () => import("./shop.js").then((m) => m.openShop("shop", changed));
  body.append(statsBlock(game, g), ...movesBlocks(game, g, () => { repaint(); publishSoon(); }, toShop));
  const looks = lookBlock(game, g, i, repaint);
  if (looks) body.append(looks);
  body.append(raisedBlock(g));
}

/** The top block: a big picture on its element's colour, the name, element, stage and growth, and what to do with it. */
function hero(body, game, changed, g, i, repaint) {
  const egg = isEgg(g);
  const out = i === game.active;
  const block = h(`<div class="gs-block cr-hero">
    <div class="cr-stage tint-${g.type}"></div>
    <div class="cr-name"><span class="cr-no small muted" translate="no"></span><strong></strong></div>
    <div class="cr-tags"></div>
    <div class="cr-grow"><span class="small muted"></span><span class="cr-bar"><i></i></span><span class="small cr-pct"></span></div>
    <div class="confirm-buttons cr-acts"></div></div>`);
  block.querySelector(".cr-stage").append(picture(g, 176, 96));
  block.querySelector(".cr-no").textContent = `#${g.seed}`;
  const name = block.querySelector("strong");
  name.textContent = titleOf(g);
  if (g.name) name.setAttribute("translate", "no");
  // The element, then what it is (when it has a name of its own) and its stage.
  const tags = block.querySelector(".cr-tags");
  tags.append(elementBadge(g.type));
  const what = [g.name && !egg ? beastById(describe(g).beast).name : "", egg && !g.name ? "" : STAGE_NAME[stageOf(g.growth).id]].filter(Boolean);
  for (const w of what) tags.append(Object.assign(h(`<span class="cr-tag"></span>`), { textContent: w }));
  // Growing: an egg towards hatching, a creature towards fully grown.
  const share = egg ? g.growth / HATCH_AT : g.growth / GROWN;
  const grown = !egg && isGrown(g);
  block.querySelector(".cr-grow .muted").textContent = egg ? "Hatching" : "Growth";
  block.querySelector(".cr-bar i").style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
  block.querySelector(".cr-pct").textContent = grown ? "Fully grown" : `${Math.min(99, Math.floor(share * 100))}%`;
  if (grown) block.querySelector(".cr-grow").classList.add("done");

  // Two buttons of one width: bring it out, and show it to friends (an egg: give it to a friend).
  const acts = block.querySelector(".cr-acts");
  const bring = h(`<button type="button" class="${out ? "" : "primary"}"></button>`);
  bring.textContent = out ? "In the habitat" : "Bring out";
  bring.disabled = out;
  bring.onclick = () => { setActive(game, i); repaint(); };
  acts.append(bring);
  if (egg) {
    const give = h(`<button type="button">${icon("gift")} <span>Give this egg to a friend</span></button>`);
    give.disabled = out || game.roster.length < 2;
    give.onclick = () => gift("egg", i, () => { changed(); creaturesPanel(body, game, changed); });
    acts.append(give);
    block.insertBefore(Object.assign(h(`<p class="small muted cr-about"></p>`), { textContent: out ? "It hatches as you study." : "Bring it out and study to hatch it." }), acts);
  } else {
    // The favourite: the creature friends see next to my name in their friends list.
    const shown = showcaseOf(game) === g;
    const fav = h(`<button type="button" class="fav-btn${shown ? " on" : ""}">${icon("star")} <span></span></button>`);
    fav.querySelector("span").textContent = shown ? "Shown to friends" : "Show to friends";
    fav.onclick = () => { setShowcase(game, shown && game.showcase === g.seed ? null : g.seed); repaint(); publishNow(true); };
    acts.append(fav);
  }
  return block;
}

/** Labelled rows, each a picture, a name, a number and a bar. */
function rows(items) {
  const grid = h(`<div class="cr-rows"></div>`);
  for (const it of items) {
    grid.append(h(`<span class="cr-ri">${icon(it.icon)}</span>`), Object.assign(h(`<span class="cr-rl"></span>`), { textContent: it.label }),
      Object.assign(h(`<b class="cr-rn" translate="no"></b>`), { textContent: it.value }),
      h(`<span class="cr-bar"><i style="width:${Math.round(Math.min(1, Math.max(0, it.share)) * 100)}%"></i></span>`));
  }
  return grid;
}

/** Its battle numbers. */
function statsBlock(game, g) {
  const f = fighter(game, g);
  const value = { hp: f.max, atk: f.atk, def: f.def, spd: f.spd };
  const block = h(`<div class="gs-block"><div class="gs-label">Stats</div></div>`);
  block.append(rows(Object.keys(STAT_NAME).map((k) => ({ icon: `stat_${k}`, label: STAT_NAME[k], value: String(Math.round(value[k])), share: value[k] / STAT_TOP[k] }))));
  return block;
}

/** How each way of studying has shaped it. */
function raisedBlock(g) {
  const block = h(`<div class="gs-block"><div class="gs-label">How you raised it</div></div>`);
  block.append(rows(TRAITS.map((k) => {
    const n = Math.max(0, Math.min(1, Number(g.traits && g.traits[k]) || 0));
    return { icon: `trait_${k}`, label: HABIT_NAME[k], value: `${Math.round(n * 100)}%`, share: n };
  })));
  return block;
}

/** Its look: a younger look it has grown through, and (a juvenile) a special colouring, each shown as a picture. */
function lookBlock(game, g, i, repaint) {
  const reached = STAGES.filter((s) => s.id !== "egg" && s.from <= g.growth);
  if (reached.length < 2) return null; // a hatchling has only the one look
  const latest = reached[reached.length - 1].id;
  const block = h(`<div class="gs-block"><div class="gs-label">Look</div><div class="cr-looks"></div>
    <div class="gs-label">Special colouring</div><div class="cr-looks"></div></div>`);
  const [looks, colours] = block.querySelectorAll(".cr-looks");
  for (const s of reached) {
    const show = s.id === latest ? null : s.id;
    looks.append(lookTile({ ...g, show }, STAGE_NAME[s.id], formOf(g).id === s.id, () => { reshape(game, i, { show }); repaint(); }));
  }
  for (const o of [{ id: null, name: "None", open: true }, ...variantOptions(game, g)]) {
    const tile = lookTile({ ...g, show: null, variant: o.id }, o.name, (g.variant || null) === o.id,
      o.open ? () => { reshape(game, i, { variant: o.id }); repaint(); } : () => lockedColouring(g, o));
    if (!o.open) {
      tile.classList.add("locked");
      tile.append(h(`<span class="cr-lock">${icon("lock")}</span>`));
      // (a colouring earned by a feat: how far this creature has got, "143 / 200 words")
      if (o.progress) tile.append(Object.assign(h(`<span class="cr-look-progress small" translate="no"></span>`), { textContent: progressText(o) }));
    }
    colours.append(tile);
  }
  if (formOf(g).id !== "juvenile") block.append(h(`<p class="small muted mv-rule">Colourings show on the Juvenile look.</p>`));
  return block;
}

function lookTile(look, name, on, pick) {
  const b = h(`<button type="button" class="cr-look${on ? " on" : ""}"><span class="cr-look-pic"></span><span class="cr-look-name"></span></button>`);
  b.querySelector(".cr-look-pic").append(portrait(look, 88));
  b.querySelector(".cr-look-name").textContent = name;
  b.setAttribute("aria-pressed", on ? "true" : "false");
  b.onclick = pick;
  return b;
}

/** A colouring not earned yet: what it looks like, and how to earn it (and, earned by a feat, how far it has got). */
function lockedColouring(g, o) {
  const prize = prizeOf(o.id); // (a colouring earned by a feat comes with a thing to wear)
  const why = prize ? `${t(o.why)}. ${t("It comes with {0}.", t(prize.name))}` : o.why;
  infoBox(o.name, portrait({ ...g, show: null, variant: o.id }, 176), why, false,
    o.progress ? `${t("Not earned yet")} · ${progressText(o)}` : "Not earned yet");
}

/** A small popup about one thing: its picture, a line of text, and whether it is earned. */
function infoBox(title, pic, text, earned, status) {
  const box = openModal({ title, cls: "cr-info-back" });
  const view = h(`<div class="cr-info"><div class="cr-info-pic${earned ? "" : " dim"}"></div><p class="cr-info-text"></p>
    <p class="small cr-info-status${earned ? " got" : ""}"></p><div class="confirm-buttons"><button type="button" class="primary">OK</button></div></div>`);
  view.querySelector(".cr-info-pic").append(pic);
  view.querySelector(".cr-info-text").textContent = text;
  const st = view.querySelector(".cr-info-status");
  st.innerHTML = earned ? lineIcon("check", 16) : icon("lock");
  st.append(" ", status);
  view.querySelector("button").onclick = () => box.close();
  box.body.append(view);
}

/** The badge case: every badge in its slot, earned ones in colour and the rest as dim outlines. A tap says what it is for. */
export function badgesPanel(body, game) {
  body.innerHTML = "";
  const got = BADGES.filter((b) => game.badges.includes(b.id)).length;
  const block = h(`<div class="gs-block"><div class="gs-label"></div><div class="badge-case"></div></div>`);
  block.querySelector(".gs-label").textContent = t("{0} of {1} earned", String(got), String(BADGES.length));
  for (const b of BADGES) {
    const have = game.badges.includes(b.id);
    const src = `${ART}badge/${b.art || b.id}.png`;
    const slot = h(`<button type="button" class="badge-slot${have ? " got" : ""}"><span class="badge-pic"><img alt="" width="48" height="48" src="${src}"></span>
      <span class="badge-name"></span></button>`);
    slot.querySelector(".badge-name").textContent = b.name;
    slot.onclick = () => infoBox(b.name, h(`<img alt="" width="96" height="96" src="${src}">`), b.text, have, have ? "Earned" : "Not earned yet");
    block.querySelector(".badge-case").append(slot);
  }
  body.append(block);
}
