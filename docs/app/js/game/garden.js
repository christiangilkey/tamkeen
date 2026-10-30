// The garden's pages in the game sheet: buildings and plots, releasing a creature, and supplies
// (food, potions and the rest). The rules are in idle.js; this file only shows them.

import { h, toast } from "../app.js";
import { confirmBox } from "../components/modal.js";
import { t } from "../i18n.js";
import { BRANCHES, FOODS, PLOTS, STRUCTURES, SUPPLIES, TYPES } from "./data.js";
import { formOf } from "./genome.js";
import { dayKey } from "./rules.js";
import {
  AUTO_GOALS, BOOST_MINUTES, FEEDS_PER_DAY, OFFLINE_HOURS, STARDUST_BOOST, automated, build, buySupply, collect, costOf, feed, garden,
  hearts, incubate, meets, rateOf, release, tick, totalRate, upgrade, useBoost, useKey,
} from "./idle.js";
import { announce, saveGame, sfx } from "./game.js";
import { icon } from "./render.js";

const fmt = (n) => Math.floor(n).toLocaleString();
const structure = (id) => STRUCTURES.find((s) => s.id === id);

/** Five hearts for a creature, filled as far as it has been cared for. */
export function heartsRow(creature) {
  const n = hearts(creature);
  return `<span class="hearts" title="${n} of 5 hearts: feed it to raise them">${Array.from({ length: 5 }, (_, i) => icon(i < n ? "heart_full" : "heart_empty")).join("")}</span>`;
}

function wallet(game) {
  const g = garden(game);
  return `<div class="today-chips">
    <span class="today-chip lit" title="Glow: made by your buildings">${icon("glow")} ${fmt(g.glow)} glow</span>
    <span class="today-chip" title="Glow per hour right now">${icon("clock")} ${fmt(totalRate(game))} an hour</span>
    <span class="today-chip" title="Gems: earned from badges, raids, rising a league and full bloom">${icon("gem")} ${game.gems}</span>
    <span class="today-chip" title="Stardust: each one makes everything ${Math.round(STARDUST_BOOST * 100)}% faster, for good">${icon("stardust")} ${g.stardust}</span>
  </div>`;
}

/** The Garden page. `changed()` runs after anything is altered. */
export function gardenPanel(body, game, changed) {
  const g = garden(game);
  tick(game);
  const again = () => { saveGame(); changed(); gardenPanel(body, game, changed); };
  const act = (problem, sound = "lucky") => { if (problem) { toast(problem, { error: true }); return false; } sfx(sound); again(); return true; };
  body.innerHTML = "";
  body.append(h(wallet(game)));
  body.append(h(`<p class="small muted">Buildings make glow while you are away: up to ${OFFLINE_HOURS} hours' worth waits for you. Each kind does best
    for a different study habit, and reaching today's goal speeds them all up by half and sends two hours of glow at once.
    ${automated(game) ? `${icon("check")} Glow now collects itself.` : `Reach your daily goal ${AUTO_GOALS} times and glow collects itself (${game.stats.goals || 0} so far).`}</p>`));
  if (g.bloom) body.append(h(`<p class="evolve-box">${icon("trophy")} <strong>Full bloom.</strong> Every plot holds a fully grown building. The garden is complete; releasing a creature starts a new, faster one.</p>`));

  const waiting = g.plots.reduce((n, p) => n + p.stored, 0);
  if (waiting >= 1) {
    const all = h(`<button type="button" class="primary">${icon("glow")} Collect ${fmt(waiting)} glow</button>`);
    all.onclick = () => { collect(game); act(""); };
    body.append(all);
  }

  g.plots.forEach((p, i) => {
    const s = p.tier ? structure(p.id) : null;
    const card = h(`<div class="creature-card${p.tier ? " on" : ""}"><div class="creature-head">
      <span class="shop-pic">${icon(s ? `structure/${s.id}_${p.tier}` : "structure/plot", s && p.tier === 3 ? 48 : 64)}</span>
      <div class="creature-info"><strong></strong><span class="small muted"></span></div><span class="plot-act row"></span></div>
      <div class="creature-more stack"></div></div>`);
    const title = card.querySelector("strong");
    const info = card.querySelector(".small");
    const acts = card.querySelector(".plot-act");
    const more = card.querySelector(".creature-more");
    if (!p.open) {
      card.classList.add("locked-plot");
      title.textContent = `Plot ${i + 1}: closed`;
      info.innerHTML = `${icon("lock")} Opens when you: ${PLOTS[i].need.text.toLowerCase()}`;
      if (game.items.key > 0 && g.plots.findIndex((q) => !q.open) === i) {
        const b = h(`<button type="button">${icon("key")} Use a key (${game.items.key})</button>`);
        b.onclick = () => act(useKey(game));
        acts.append(b);
      }
    } else if (!s) {
      title.textContent = `Plot ${i + 1}: empty`;
      info.textContent = "Choose something to build here.";
      const row = h(`<div class="pick-row"></div>`);
      for (const opt of STRUCTURES) {
        const can = meets(game, opt.need);
        const cost = costOf(game, i, opt.id);
        const b = h(`<button type="button" class="pick build-opt" ${can ? "" : "disabled"}>${icon(`structure/${opt.id}_1`, 32)}
          <span><b></b><span class="small">${can ? `${icon("glow")} ${fmt(cost)} · ${opt.rate} an hour` : `${icon("lock")} ${opt.need.text}`}</span></span></button>`);
        b.querySelector("b").textContent = opt.name;
        b.title = opt.text;
        b.onclick = () => act(build(game, i, opt.id));
        row.append(b);
      }
      more.append(row);
    } else {
      const rate = rateOf(game, p);
      title.textContent = `${s.name} · tier ${p.tier}`;
      info.innerHTML = `${fmt(rate)} glow an hour${s.trait ? ` · likes ${icon(`trait_${s.trait}`)} ${s.trait}` : ""} · ${fmt(p.stored)} waiting`;
      if (p.stored >= 1) {
        const c = h(`<button type="button">${icon("glow")} Collect</button>`);
        c.onclick = () => { collect(game, i); act(""); };
        acts.append(c);
      }
      const cost = costOf(game, i);
      if (cost !== null) {
        const u = h(`<button type="button" class="${g.glow >= cost ? "primary" : ""}">${icon("arrow")} Grow · ${icon("glow")} ${fmt(cost)}</button>`);
        u.title = "Raise it a tier: it makes a good deal more glow";
        u.onclick = () => act(upgrade(game, i));
        acts.append(u);
      } else acts.append(h(`<span class="small muted">${icon("check")} Fully grown</span>`));
    }
    body.append(card);
  });

  // Releasing: the garden's fresh start, with something kept for good.
  const adults = game.roster.map((c, i) => [c, i]).filter(([c]) => c.branch);
  const box = h(`<div class="creature-card stack"><strong>${icon("release")} Release a grown creature</strong>
    <span class="small muted">A grown creature can be set free. It leaves your roster and is remembered here. Your buildings and glow
    start over, and you keep <strong>${icon("stardust")} stardust</strong>: each one makes every building ${Math.round(STARDUST_BOOST * 100)}% faster for good,
    so the next garden grows much quicker than the last. More fully grown buildings at the time means more stardust.</span>
    <div class="pick-row" id="rel"></div><div class="small muted" id="rel-log"></div></div>`);
  if (!adults.length) box.querySelector("#rel").append(h(`<span class="small muted">You have no adult creature yet.</span>`));
  for (const [c, i] of adults) {
    const b = h(`<button type="button" class="pick"></button>`);
    b.textContent = `${c.name || TYPES[c.type].name} (${BRANCHES[c.branch].name})`;
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
    box.querySelector("#rel").append(b);
  }
  if (g.released.length) box.querySelector("#rel-log").textContent = `Set free so far: ${g.released.map((r) => r.name || TYPES[r.type].name).join(", ")}.`;
  body.append(box);
}

/** The Supplies page: food for the creature in the habitat, and useful items. */
export function suppliesPanel(body, game, changed) {
  const g = garden(game);
  tick(game);
  const again = () => { saveGame(); changed(); suppliesPanel(body, game, changed); };
  const c = game.creature;
  const egg = formOf(c).id === "egg";
  body.innerHTML = "";
  body.append(h(wallet(game)));

  const fedToday = c.fed && c.fed.day === dayKey() ? c.fed.n : 0;
  body.append(h(`<div class="stack"><strong>Food</strong>
    <span class="small muted">${egg ? "Hatch your egg first; then it can be fed." : `${c.name || "Your creature"} ${heartsRow(c)} · fed ${Math.min(fedToday, FEEDS_PER_DAY)} of ${FEEDS_PER_DAY} times today.
      Its favourite counts double. Hearts make its buildings a little faster and change nothing in battles.`}</span></div>`));
  const foods = h(`<div class="shop-grid"></div>`);
  for (const f of FOODS) {
    const have = game.items[f.id] || 0;
    const card = h(`<div class="shop-item"><span class="shop-pic">${icon(f.id, 48)}</span><span class="shop-name"></span>
      <span class="small muted">${f.loves === c.type && !egg ? `${icon("heart_full")} its favourite` : `${TYPES[f.loves].name} creatures love it`} · you have ${have}</span>
      <button type="button" class="primary" ${have && !egg ? "" : "disabled"}>Feed</button>
      <button type="button" class="small">${icon("glow")} ${f.glow}</button></div>`);
    card.querySelector(".shop-name").textContent = f.name;
    const [feedBtn, buyBtn] = card.querySelectorAll("button");
    feedBtn.onclick = () => {
      const r = feed(game, f.id);
      if (typeof r === "string") { toast(r, { error: true }); return; }
      sfx("pet");
      toast(r.loved ? "It loves that!" : "Yum.");
      announce({ type: "feed", xp: 0, tier: r.loved ? "lucky" : "common" });
      again();
    };
    buyBtn.title = `Buy one for ${f.glow} glow`;
    buyBtn.onclick = () => { const p = buySupply(game, f.id); if (p) toast(p, { error: true }); else { sfx("common"); again(); } };
    foods.append(card);
  }
  body.append(foods);

  body.append(h(`<div class="stack" style="margin-top:14px"><strong>Supplies</strong>
    <span class="small muted">Gems come only from things you do: each badge (2), a raid won (3), rising a league (2), full bloom (10). Nothing is sold for money.</span></div>`));
  const grid = h(`<div class="shop-grid"></div>`);
  const boosting = game.boostUntil && Date.now() / 1000 < game.boostUntil;
  for (const s of SUPPLIES) {
    const have = game.items[s.id] || 0;
    const card = h(`<div class="shop-item"><span class="shop-pic">${icon(s.icon || s.id, 48)}</span><span class="shop-name"></span>
      <span class="small muted"></span><button type="button" class="small"></button></div>`);
    card.querySelector(".shop-name").textContent = s.id === "egg" ? s.name : `${s.name} × ${have}`;
    card.querySelector(".small.muted").textContent = s.text;
    const buyBtn = card.querySelector("button");
    buyBtn.innerHTML = s.glow ? `${icon("glow")} ${s.glow}` : `${icon("gem")} ${s.gems}`;
    buyBtn.onclick = () => { const p = buySupply(game, s.id); if (p) toast(p, { error: true }); else { sfx("lucky"); if (s.id === "egg") toast("A new egg is with your creatures."); again(); } };
    if (s.id === "xp_boost") {
      const use = h(`<button type="button" class="primary" ${have ? "" : "disabled"}>${boosting ? "Add 20 more minutes" : "Use now"}</button>`);
      use.onclick = () => { const p = useBoost(game); if (p) toast(p, { error: true }); else { sfx("lucky"); toast(`XP is doubled for ${BOOST_MINUTES} minutes. Go and study!`); again(); } };
      card.append(use);
      if (boosting) card.append(h(`<span class="small">${icon("xp_boost")} running for ${Math.ceil((game.boostUntil - Date.now() / 1000) / 60)} more min</span>`));
    } else if (s.id === "incubator") {
      const eggIndex = game.roster.findIndex((r, i) => i !== game.active && formOf(r).id === "egg" && r.seed !== game.incubating);
      const use = h(`<button type="button" class="primary" ${have && eggIndex >= 0 ? "" : "disabled"}>Warm an egg</button>`);
      use.title = eggIndex >= 0 ? "" : "You need a spare egg that isn't out in the habitat";
      use.onclick = () => { const p = incubate(game, eggIndex); if (p) toast(p, { error: true }); else { sfx("lucky"); toast("The egg is warming: it grows as your creature does."); again(); } };
      card.append(use);
      if (game.incubating != null) card.append(h(`<span class="small">${icon("incubator")} an egg is warming</span>`));
    } else if (s.id === "key") card.append(h(`<span class="small muted">Use it on the Garden page.</span>`));
    else if (s.id === "ticket") card.append(h(`<span class="small muted">Used by itself when a battle would pay less.</span>`));
    else if (s.id === "potion") card.append(h(`<span class="small muted">Use it during a wild battle.</span>`));
    grid.append(card);
  }
  body.append(grid);
}
