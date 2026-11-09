// The garden's screens in the game sheet (shop.js opens them; they share one screen with a switch): Garden
// (the glow, the buildings on their plots, releasing a creature) and Supplies (food, and things bought with glow
// or gems, in blocks by what they are for). Each thing opens its details in a box. The rules are in idle.js,
// what each screen shows in sections.js; this file only draws them.

import { h, toast } from "../app.js";
import { confirmBox } from "../components/modal.js";
import { t } from "../i18n.js";
import { FOODS, STRUCTURES, TYPES } from "./data.js";
import { formOf, isGrown } from "./genome.js";
import { dayKey } from "./rules.js";
import {
  BOOST_MINUTES, FEEDS_PER_DAY, STARDUST_BOOST, build, buySupply, collect, feed, garden, hearts, incubate, release, stardustGain, tick,
  upgrade, useBoost, useKey,
} from "./idle.js";
import { announce, saveGame, sfx } from "./game.js";
import { icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { openEarned } from "./info.js";
import { portrait } from "./battle-ui.js";
import { buildOptions, gardenFacts, plotRows, structureArt, supplyBlocks } from "./sections.js";
import { amount, art, block, details, fact, fmt, grid, row, tile } from "./screenparts.js";

const structure = (id) => STRUCTURES.find((s) => s.id === id);
const HABIT = { listener: "Listening", reader: "Reading", collector: "Collecting", curious: "Curiosity" };
const chevron = () => `<span class="gs-chev">${lineIcon("chevron", 18)}</span>`;
const tierPips = (tier) => `<span class="gs-pips" title="Tier ${tier} of 3">${[1, 2, 3].map((n) => `<i class="${n <= tier ? "on" : ""}"></i>`).join("")}</span>`;

/** Five hearts for a creature, filled as far as it has been cared for. */
export function heartsRow(creature) {
  const n = hearts(creature);
  return `<span class="hearts" title="${n} of 5 hearts: feed it to raise them">${Array.from({ length: 5 }, (_, i) => icon(i < n ? "heart_full" : "heart_empty")).join("")}</span>`;
}

/** A fact for an amount in its own colour. */
const counted = (label, kind, n) => fact(label, amount(kind, n));
/** Draw a screen again after a change, scrolled where it was. */
const redrawKeeping = (body, draw) => { const top = body.scrollTop; draw(); body.scrollTop = top; };

// ---------- Garden ----------

/** The Garden screen. `changed()` runs after anything is altered. */
export function gardenPanel(body, game, changed, go = () => {}) {
  tick(game);
  const again = () => { saveGame(); changed(); redrawKeeping(body, () => gardenPanel(body, game, changed, go)); };
  const act = (problem, sound = "lucky") => { if (problem) { toast(problem, { error: true }); return false; } sfx(sound); again(); return true; };
  const f = gardenFacts(game);
  body.replaceChildren();

  // Glow: what there is, what the buildings make, what waits in them.
  const top = block("Glow");
  const facts = h(`<div class="gs-facts"></div>`);
  const cells = [counted("You have", "glow", f.glow), counted("An hour", "glow", f.rate)];
  if (!f.auto) cells.push(counted("Waiting", "glow", f.waiting));
  if (f.stardust) cells.push(fact("Stardust", `${icon("stardust")}${fmt(f.stardust)}`));
  for (const [k, v] of cells) {
    const c = h(`<div class="gs-fact"><span class="gs-label"></span><span class="gs-fact-v">${v}</span></div>`);
    c.querySelector(".gs-label").textContent = k;
    facts.append(c);
  }
  top.append(facts);
  if (f.auto) top.append(h(`<p class="gs-state">${icon("check")}<span>Glow collects itself</span></p>`));
  else {
    const all = h(`<button type="button" class="primary gs-wide" ${f.waiting >= 1 ? "" : "disabled"}>${icon("glow")}<span></span></button>`);
    all.querySelector("span").textContent = f.waiting >= 1 ? t("Collect {0} glow", fmt(f.waiting)) : t("Nothing to collect yet");
    all.onclick = () => { collect(game); act(""); };
    top.append(all);
    top.append(h(`<p class="gs-state muted">${f.goalsLeft === 1 ? t("Collects itself after one more daily goal")
      : t("Collects itself after {0} more daily goals", f.goalsLeft)}</p>`));
  }
  if (f.bloom) top.append(h(`<p class="gs-state">${icon("trophy")}<span>Full bloom: every plot holds a fully grown building.</span></p>`));
  body.append(top);

  // Buildings: one row per plot.
  const plots = block("Buildings", `${f.open} / ${f.plots}`);
  plots.querySelector(".gs-block-end").title = "Plots open";
  for (const p of plotRows(game)) {
    if (p.kind === "closed") {
      let end = "";
      if (p.key) {
        end = h(`<button type="button" class="gs-row-btn">${icon("key")}<span>Use a key</span></button>`);
        end.onclick = () => act(useKey(game));
      }
      plots.append(row({ pic: art(structureArt(null, 0), 48), name: t("Plot {0}", p.i + 1), sub: `<span class="gs-need-line">${icon("lock")}<span class="gs-need"></span></span>`, end, dim: true }));
      plots.lastElementChild.querySelector(".gs-need").textContent = p.need;
    } else if (p.kind === "empty") {
      plots.append(row({ pic: art(structureArt(null, 0), 48), name: t("Plot {0}", p.i + 1), sub: "Empty: choose something to build",
        end: `<span class="gs-row-go">${lineIcon("plus", 18)}<span>Build</span></span>`, open: () => buildPicker(game, p.i, act) }));
    } else {
      const s = structure(p.id);
      const sub = `${tierPips(p.tier)}<span class="gs-amount cur-glow">${icon("glow")}${fmt(p.rate)}</span><span>an hour</span>`;
      const end = p.stored >= 1 && !f.auto ? `${amount("glow", p.stored)}${chevron()}` : chevron();
      plots.append(row({ pic: art(structureArt(p.id, p.tier), 48), name: s.name, sub, end, open: () => buildingDetails(game, p.i, act) }));
    }
  }
  body.append(plots);

  // Releasing: the garden's fresh start, with stardust kept for good.
  const g = garden(game);
  const grown = game.roster.map((c, i) => [c, i]).filter(([c]) => isGrown(c));
  const rel = block("Release a creature", null);
  const helpBtn = h(`<button type="button" class="ghost icon sheet-help" title="What releasing does">${lineIcon("question", 16)}</button>`);
  helpBtn.onclick = () => releaseHelp(game);
  rel.querySelector(".gs-block-head").append(helpBtn);
  if (!grown.length) rel.append(h(`<p class="gs-state muted">You have no fully grown creature yet.</p>`));
  for (const [c, i] of grown) {
    const b = h(`<button type="button" class="gs-row-btn danger">${icon("release")}<span>Release</span></button>`);
    b.onclick = async () => {
      const ok = await confirmBox(c.name ? t("Release {0}?", c.name) : t("Release this creature?"),
        "It leaves for good, and your buildings and glow start over. You keep stardust, your other creatures and everything you own.",
        { ok: "Release", danger: true });
      if (!ok) return;
      const r = release(game, i);
      if (typeof r === "string") { toast(r, { error: true }); return; }
      sfx("jackpot");
      toast(`Released. You gained ${r.stardust} stardust.`);
      announce({ type: "release", xp: 0, tier: "jackpot" });
      again();
    };
    const pic = portrait(c, 44);
    const r = row({ pic: "", name: c.name || TYPES[c.type].name, sub: `<span>${t("Leaves {0} stardust", stardustGain(game))}</span>${icon("stardust")}`, end: b });
    r.querySelector(".gs-row-pic").append(pic);
    rel.append(r);
  }
  if (g.released.length) {
    const p = h(`<p class="gs-state muted"></p>`);
    p.textContent = t("Set free so far: {0}", g.released.map((x) => x.name || TYPES[x.type].name).join(", "));
    rel.append(p);
  }
  body.append(rel);
}

/** What releasing does, in a box (the long explanation that used to sit on the screen). */
function releaseHelp(game) {
  details((d) => ({
    title: "Release a creature", pic: art({ file: "icon/stardust.png", w: 16, h: 16 }, 96),
    facts: [fact("Stardust now", `${icon("stardust")}${fmt(garden(game).stardust)}`), fact("Each one", `+${Math.round(STARDUST_BOOST * 100)}%`)],
    text: "A fully grown creature can be set free. It leaves your roster and is remembered here. Your buildings and glow start over, and you keep stardust: each one makes every building faster for good, so the next garden grows much quicker. More fully grown buildings at the time means more stardust.",
    buttons: [{ word: "Close", run: () => d.close() }],
  }));
}

/** Choose what to build on an empty plot. */
function buildPicker(game, i, act) {
  details((d) => {
    // One row for each kind of building: what it costs and makes, or what opens it.
    const list = h(`<div class="gs-build-list"></div>`);
    for (const o of buildOptions(game, i)) {
      const sub = o.open
        ? `${amount("glow", o.cost, !o.can)}<span class="gs-amount cur-glow">${icon("clock")}${fmt(o.rate)}</span><span>an hour</span>`
        : `<span class="gs-need-line">${icon("lock")}<span class="gs-need"></span></span>`;
      let end = "";
      if (o.open) {
        end = h(`<button type="button" class="${o.can ? "primary " : ""}gs-row-btn"><span>Build</span></button>`);
        end.disabled = !o.can;
        end.onclick = () => { if (act(build(game, i, o.id))) d.close(); };
      }
      const r = row({ pic: art(structureArt(o.id, 1), 32), name: o.name, sub, end, dim: !o.open });
      if (!o.open) r.querySelector(".gs-need").textContent = o.need;
      r.title = o.text;
      list.append(r);
    }
    return {
      title: t("Build on plot {0}", i + 1),
      facts: [counted("You have", "glow", garden(game).glow)], more: list,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** A building's details: its picture, tier, glow an hour, what waits in it, the habit it likes; Collect and Grow. */
function buildingDetails(game, i, act) {
  details((d) => {
    const p = plotRows(game)[i];
    if (!p || p.kind !== "built") return null;
    const s = structure(p.id);
    const auto = gardenFacts(game).auto;
    const facts = [fact("Tier", `${tierPips(p.tier)}<span>${p.tier} / 3</span>`), counted("An hour", "glow", p.rate)];
    if (!auto) facts.push(counted("Waiting", "glow", p.stored));
    facts.push(fact("Does best for", s.trait ? `${icon(`trait_${s.trait}`)}<span>${HABIT[s.trait]}</span>` : `<span>Everyone</span>`));
    const redo = (problem) => { if (act(problem)) d.redraw(); };
    const buttons = [];
    if (!auto) buttons.push({ word: "Collect", pic: icon("glow"), disabled: p.stored < 1, run: () => { collect(game, i); redo(""); } });
    else buttons.push({ word: "Close", run: () => d.close() });
    if (p.cost === null) buttons.push({ word: "Fully grown", pic: icon("check"), disabled: true, run: () => {} });
    else buttons.push({ word: "Grow", extra: amount("glow", p.cost), primary: true, disabled: !p.can, run: () => redo(upgrade(game, i)) });
    const short = p.cost !== null && !p.can ? Math.ceil(p.cost - garden(game).glow) : 0;
    return {
      title: s.name, pic: art(structureArt(p.id, p.tier), 128), facts, text: s.text, buttons,
      note: short > 0 ? t("You need {0} more glow.", short) : "",
    };
  });
}

// ---------- Supplies ----------

/** The Supplies screen: food for the creature in the habitat, then useful things in blocks by what they are for. */
export function suppliesPanel(body, game, changed, go = () => {}) {
  tick(game);
  const again = () => { saveGame(); changed(); redrawKeeping(body, () => suppliesPanel(body, game, changed, go)); };
  const c = game.creature;
  const egg = formOf(c).id === "egg";
  body.replaceChildren();

  // Food: who eats it, how cared for it is, and the six foods.
  const fedToday = c.fed && c.fed.day === dayKey() ? c.fed.n : 0;
  const helpBtn = h(`<button type="button" class="ghost icon sheet-help" title="How hearts work">${lineIcon("question", 16)}</button>`);
  helpBtn.onclick = () => openEarned("heart", game, () => {}, { over: true });
  const food = block("Food", helpBtn);
  const who = h(`<div class="gs-who"><span class="gs-who-pic"></span><span class="gs-row-text"><span class="gs-row-name"></span>
    <span class="gs-row-sub"></span></span></div>`);
  who.querySelector(".gs-who-pic").append(egg ? h(icon(`egg`, 32)) : portrait(c, 44));
  who.querySelector(".gs-row-name").textContent = c.name || (egg ? "Your egg" : "Your creature");
  const sub = who.querySelector(".gs-row-sub");
  if (egg) sub.textContent = "Hatch your egg first; then it can be fed.";
  else sub.innerHTML = `${heartsRow(c)}<span>${t("Fed {0} of {1} today", Math.min(fedToday, FEEDS_PER_DAY), FEEDS_PER_DAY)}</span>`;
  food.append(who);
  const foods = grid();
  for (const f of FOODS) {
    const have = game.items[f.id] || 0;
    const fav = f.loves === c.type && !egg;
    foods.append(tile({ pic: art({ file: `icon/${f.id}.png`, w: 16, h: 16 }, 48), name: f.name, count: have,
      sub: `${fav ? icon("heart_full") : ""}${amount("glow", f.glow, garden(game).glow < f.glow)}`, open: () => foodDetails(game, f, again) }));
  }
  food.append(foods);
  body.append(food);

  // Supplies, in blocks by what they are for.
  const boosting = game.boostUntil && Date.now() / 1000 < game.boostUntil;
  for (const bl of supplyBlocks()) {
    const b = block(bl.label);
    const g = grid();
    for (const s of bl.items) {
      const have = game.items[s.id] || 0;
      let sub = s.glow ? amount("glow", s.glow, garden(game).glow < s.glow) : amount("gems", s.gems, game.gems < s.gems);
      if (s.id === "xp_boost" && boosting) sub = `${icon("xp_boost")}<span>${t("{0} min left", minutesLeft(game))}</span>`;
      else if (s.id === "incubator" && game.incubating != null) sub = `${icon("incubator")}<span>Warming</span>`;
      g.append(tile({ pic: art(s, 48), name: s.name, sub, count: s.id === "egg" ? null : have, open: () => supplyDetails(game, s, again) }));
    }
    b.append(g);
    body.append(b);
  }
}

const minutesLeft = (game) => Math.ceil((game.boostUntil - Date.now() / 1000) / 60);
const needGlow = (game, n) => { const k = Math.ceil(n - garden(game).glow); return k > 0 ? t("You need {0} more glow.", k) : ""; };
const needGems = (game, n) => { const k = n - game.gems; return k > 0 ? `You need ${k} more gem${k === 1 ? "" : "s"}.` : ""; };

function foodDetails(game, f, again) {
  details((d) => {
    const c = game.creature;
    const egg = formOf(c).id === "egg";
    const have = game.items[f.id] || 0;
    const fedToday = c.fed && c.fed.day === dayKey() ? c.fed.n : 0;
    const full = fedToday >= FEEDS_PER_DAY;
    const glow = garden(game).glow;
    const why = egg ? "Hatch your egg first; then it can be fed." : full ? "It is full for today." : !have ? "Buy one to feed it." : "";
    return {
      title: f.name, pic: art({ file: `icon/${f.id}.png`, w: 16, h: 16 }, 96),
      facts: [fact("You have", `<span>${have}</span>`), fact("Price", amount("glow", f.glow)),
        fact("Loved by", `${icon(`type_${f.loves}`)}<span>${t(TYPES[f.loves].name)}</span>`), fact("Fed today", `<span>${Math.min(fedToday, FEEDS_PER_DAY)} / ${FEEDS_PER_DAY}</span>`)],
      text: f.loves === c.type && !egg ? "Its favourite: it counts double." : "",
      note: glow < f.glow ? needGlow(game, f.glow) : why,
      buttons: [
        { word: "Buy", extra: amount("glow", f.glow), disabled: glow < f.glow, run: () => {
          const p = buySupply(game, f.id);
          if (p) { toast(p, { error: true }); return; }
          sfx("common");
          again();
          d.redraw();
        } },
        { word: "Feed", pic: icon("heart_full"), primary: true, disabled: !have || egg || full, run: () => {
          const r = feed(game, f.id);
          if (typeof r === "string") { toast(r, { error: true }); return; }
          sfx("pet");
          toast(r.loved ? "It loves that!" : "Yum.");
          announce({ type: "feed", xp: 0, tier: r.loved ? "lucky" : "common" });
          again();
          d.redraw();
        } },
      ],
    };
  });
}

/** What using a supply does, where it is not a button here. */
const USED = { key: "Use it on the Garden page.", potion: "Use it during a wild battle." };

function supplyDetails(game, s, again) {
  details((d) => {
    const have = game.items[s.id] || 0;
    const price = s.glow ? amount("glow", s.glow) : amount("gems", s.gems);
    const short = s.glow ? garden(game).glow < s.glow : game.gems < s.gems;
    const bought = () => {
      const p = buySupply(game, s.id);
      if (p) { toast(p, { error: true }); return; }
      sfx("lucky");
      if (s.id === "egg") toast("A new egg is with your creatures.");
      again();
      d.redraw();
    };
    const facts = [];
    if (s.id !== "egg") facts.push(fact("You have", `<span>${have}</span>`));
    facts.push(fact("Price", price));
    const buyBtn = { word: "Buy", extra: price, disabled: short, run: bought };
    let use = null;
    let state = USED[s.id] || "";
    if (s.id === "xp_boost") {
      const boosting = game.boostUntil && Date.now() / 1000 < game.boostUntil;
      if (boosting) state = t("Running for {0} more min", minutesLeft(game));
      use = { word: boosting ? "Add 20 more minutes" : "Use now", primary: true, disabled: !have, run: () => {
        const p = useBoost(game);
        if (p) { toast(p, { error: true }); return; }
        sfx("lucky");
        toast(`XP is doubled for ${BOOST_MINUTES} minutes. Go and study!`);
        again();
        d.redraw();
      } };
    } else if (s.id === "incubator") {
      const eggIndex = game.roster.findIndex((r, i) => i !== game.active && formOf(r).id === "egg" && r.seed !== game.incubating);
      state = game.incubating != null ? "An egg is warming." : eggIndex < 0 ? "You need a spare egg that isn't out in the habitat" : "";
      use = { word: "Warm an egg", primary: true, disabled: !have || eggIndex < 0, run: () => {
        const p = incubate(game, eggIndex);
        if (p) { toast(p, { error: true }); return; }
        sfx("lucky");
        toast("The egg is warming: it grows as your creature does.");
        again();
        d.redraw();
      } };
    }
    const note = short ? (s.glow ? needGlow(game, s.glow) : needGems(game, s.gems)) : state;
    return {
      title: s.name, pic: art(s, 96), facts, text: s.text, note,
      buttons: use ? [buyBtn, use] : [{ word: "Close", run: () => d.close() }, { ...buyBtn, primary: true }],
    };
  });
}
