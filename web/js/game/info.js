// Explanations opened from the bar under the habitat: what each thing you earn is, how to get it
// and where it is spent, and how the way you study shapes what a creature can become.
// Words only: the rules themselves are in rules.js and idle.js, and the numbers here are read from them.

import { esc, h } from "../app.js";
import { BRANCHES, CATALOG, FOODS, MOVES, SPECIES, STAGES, SUPPLIES, TRAITS, TYPES, VARIANTS } from "./data.js";
import { describe, leadingBranch, readyToEvolve, stageOf } from "./genome.js";
import { AUTO_GOALS, FEEDS_PER_DAY, OFFLINE_HOURS, garden, hearts, totalRate } from "./idle.js";
import { ADULT_XP, DAILY_COMPLETE_XP, SHOP_SIZE, branchOptions, levelOf, variantOptions } from "./rules.js";
import { icon } from "./render.js";

const fmt = (n) => Math.floor(n).toLocaleString();
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
const list = (items) => `<ul class="info-list">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;

/** A small sheet over the page with a title and a close button. Returns {body, close}. */
function sheet(title, pic) {
  document.querySelector(".game-sheet-wrap")?.remove();
  const wrap = h(`<div class="game-sheet-wrap"><div class="game-sheet info-sheet" role="dialog">
    <div class="game-sheet-head"><strong class="info-title">${icon(pic, 32)} <span></span></strong><span class="spacer"></span>
      <button type="button" class="ghost icon" data-close title="Close">${icon("close")}</button></div>
    <div class="game-sheet-body stack"></div>
  </div></div>`);
  wrap.querySelector(".info-title span").textContent = title;
  wrap.querySelector(".game-sheet").setAttribute("aria-label", title);
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });
  document.body.append(wrap);
  return { body: wrap.querySelector(".game-sheet-body"), close };
}

/** Buttons that leave the sheet for somewhere else: [{label, pic, run}]. */
function links(close, items) {
  const row = h(`<div class="row"></div>`);
  items.forEach((it, i) => {
    const b = h(`<button type="button" class="${i ? "" : "primary"}">${icon(it.pic)} <span></span></button>`);
    b.querySelector("span").textContent = it.label;
    b.onclick = () => { close(); it.run(); };
    row.append(b);
  });
  return row;
}

// ---------- what you earn ----------
// Each entry: {title, pic, now, get: [...], use: [...], where (left out when it isn't spent anywhere), go: [{label, pic, tab}]}.
// `tab` is a page of the game sheet (see shop.js), or "evolve" for the evolution guide below.
const EARNED = {
  xp(game) {
    const lv = levelOf(game.xp);
    return {
      title: "XP", pic: "xp",
      now: `You have ${fmt(game.xp)} XP and are level ${lv.level}. The next level is ${fmt(lv.need - lv.into)} XP away.`,
      get: [
        "Look up a word: usually 5 to 15, sometimes 30 to 50, now and then 100 to 200. A word pays once a day, and looking up another within 30 seconds builds a combo of up to double.",
        "Save a word to your vocab: 20.",
        "Listen or read: a slow trickle while you study, which dries up well past your daily goal.",
        `Reach your daily goal: ${DAILY_COMPLETE_XP}. This is the big one, and it pays the same whether your goal is 5 minutes or 20.`,
        "Battles: 3 for each right answer, 15 more when a word becomes well known, 40 for a win and 15 for a loss (in full for the day's first three battles).",
        "Doing the same thing many times in one day pays less and less, so a little every day beats one long session.",
      ],
      use: [
        `It fills your level bar. Each new level pays 5 coins, and each level needs more XP than the last (this one needs ${fmt(lv.need)}).`,
        "It grows the creature in your habitat: it hatches, grows up and becomes ready to evolve.",
        "XP is never spent. It only goes up.",
      ],
      where: "Nowhere to spend it: it works by itself.",
      go: [{ label: "How evolving works", pic: "evolve", tab: "evolve" }],
    };
  },
  streak(game) {
    const prizes = CATALOG.filter((it) => (it.requires || []).includes("streak_7")).map((it) => it.name);
    return {
      title: "Streak", pic: "streak",
      now: `${plural(game.streak, "day")} in a row. Your best is ${plural(game.best_streak, "day")}.`,
      get: [
        `Reach your daily goal (${game.goal} minutes of listening or reading). Each day you do adds one.`,
        "With the Anki companion, clearing everything due in Anki also counts as the day's goal.",
        "Miss a day and a streak freeze covers it if you have one. Without one the streak starts again from zero. Nothing else is lost.",
      ],
      use: [
        "Every 7th day in a row earns a streak freeze.",
        `Reaching 7 days opens new things in the shop for good (${prizes.join(", ")}) and the battle move Steady Heart.`,
        "A 5-day streak opens a building plot in the garden.",
        "Badges at 7, 30 and 100 days, and each badge pays 2 gems.",
      ],
      go: [{ label: "See your badges", pic: "nav_badges", tab: "badges" }],
    };
  },
  coin(game) {
    const prices = CATALOG.map((it) => it.price);
    return {
      title: "Coins", pic: "coin",
      now: `You have ${plural(game.coins, "coin")}.`,
      get: [
        "Reach your daily goal: 10.",
        "Save a word to your vocab: 1 each.",
        "Go up a level: 5.",
        "Win a battle: 4 for each of the day's first three wins, less after that.",
        "A word becomes well known through battles: 1.",
        "Keep 8 in 10 battle answers right over a week (30 answers or more): 5.",
        "Your guild beats the weekly raid boss: 20.",
      ],
      use: [
        `Things for your creature to wear and for its habitat: hats, glasses, neckwear, things to hold, capes and wings, shirts, and decorations. They cost ${Math.min(...prices)} to ${Math.max(...prices)} coins.`,
        "Everything bought with coins is for looks. Nothing makes a creature stronger.",
      ],
      where: `The Shop. It offers ${SHOP_SIZE} things a day, chosen for your creature, and changes every day.`,
      go: [{ label: "Open the shop", pic: "nav_shop", tab: "shop" }],
    };
  },
  freeze(game) {
    return {
      title: "Streak freeze", pic: "freeze",
      now: `You have ${plural(game.items.freeze || 0, "streak freeze")}.`,
      get: [
        "Every 7th day in a row of reaching your daily goal gives one (up to 3 held this way).",
        "Now and then one drops as a surprise when you look up a word.",
        "You started with one.",
      ],
      use: [
        "It covers one missed day, so your streak carries on as if you had studied.",
        "It is used by itself the next time you open the app after a missed day. Two missed days need two.",
      ],
      go: [],
    };
  },
  glow(game) {
    const g = garden(game);
    const waiting = g.plots.reduce((n, p) => n + p.stored, 0);
    return {
      title: "Glow", pic: "glow",
      now: `You have ${fmt(g.glow)} glow${waiting >= 1 ? `, and ${fmt(waiting)} more is waiting in your buildings` : ""}. Your buildings make ${fmt(totalRate(game))} an hour.`,
      get: [
        `Buildings in your garden make it all day, even while the app is closed (up to ${OFFLINE_HOURS} hours' worth waits for you).`,
        `Tap a building with a light bobbing over it to gather its glow. After ${AUTO_GOALS} daily goals it gathers itself.`,
        "Reach your daily goal: every building makes half as much again for the rest of the day, and two hours of glow arrive at once.",
        "Each kind of building makes more for one study habit, and each heart on your creature adds a little.",
      ],
      use: [
        "New buildings, and growing a building to its next tier so it makes more.",
        `Food for your creature (${FOODS[0].glow} glow each), which fills its hearts.`,
        `Potions (${SUPPLIES.find((s) => s.id === "potion").glow} glow) for wild battles.`,
      ],
      where: "Buildings are on the Garden page. Food and potions are on the Supplies page.",
      go: [{ label: "Open the garden", pic: "glow", tab: "garden" }, { label: "Open supplies", pic: "potion", tab: "supplies" }],
    };
  },
  gem(game) {
    return {
      title: "Gems", pic: "gem",
      now: `You have ${plural(game.gems || 0, "gem")}.`,
      get: [
        "Earn a badge: 2 each.",
        "Your guild beats the weekly raid boss: 3.",
        "Rise a league (reach your daily goal on 5 days of a week): 2.",
        "Full bloom, when every garden plot holds a fully grown building: 10.",
        "Gems only come from things you do. They are never sold for money.",
      ],
      use: SUPPLIES.filter((s) => s.gems).map((s) => `<strong>${esc(s.name)}</strong> (${plural(s.gems, "gem")}): ${esc(s.text)}`),
      where: "The Supplies page.",
      go: [{ label: "Open supplies", pic: "potion", tab: "supplies" }],
    };
  },
  heart(game) {
    const c = game.creature;
    const n = hearts(c);
    const favourite = FOODS.find((f) => f.loves === c.type);
    return {
      title: "Hearts", pic: "heart_full",
      now: `${esc(c.name || "Your creature")} has ${n} of 5 hearts.`,
      get: [
        `Feed the creature in your habitat. Food costs ${FOODS[0].glow} glow, and it eats up to ${FEEDS_PER_DAY} times a day.`,
        `Two feedings fill one heart. Its favourite food counts double${favourite ? `: for a ${TYPES[c.type].name} creature that is ${favourite.name.toLowerCase()}` : ""}.`,
        "Hearts belong to each creature, and they never go down.",
      ],
      use: [
        "Each heart makes all your buildings 4% faster while that creature is in the habitat.",
        "Hearts change nothing in battles.",
      ],
      where: "Feed it on the Supplies page.",
      go: [{ label: "Open supplies", pic: "potion", tab: "supplies" }],
    };
  },
};

/** Explain one of the things in the habitat's bar: "xp", "streak", "coin", "freeze", "glow", "gem"
 * or "heart". `go(tab)` opens a page of the game sheet. */
export function openEarned(id, game, go) {
  const c = EARNED[id](game);
  const { body, close } = sheet(c.title, c.pic);
  body.append(h(`<p class="info-now">${c.now}</p>`));
  body.append(h(`<div><strong>How you get it</strong>${list(c.get)}</div>`));
  body.append(h(`<div><strong>What it does</strong>${list(c.use)}</div>`));
  if (c.where) body.append(h(`<div><strong>Where</strong><p class="info-where">${c.where}</p></div>`));
  if (c.go.length) body.append(links(close, c.go.map((l) => ({ ...l, run: () => (l.tab === "evolve" ? openEvolution(game, go) : go(l.tab)) }))));
}

// ---------- how a creature evolves ----------
const STAGE_NAME = { egg: "Egg", hatchling: "Hatchling", juvenile: "Juvenile", adult: "Adult" };
const HABIT = {
  listener: { name: "Listening", how: "time spent listening to podcasts, audio and videos" },
  reader: { name: "Reading", how: "time spent reading web pages" },
  collector: { name: "Collecting", how: "saving words, right answers in battles, Anki reviews" },
  curious: { name: "Curiosity", how: "looking words up" },
};
const EGG_LEANS = "Ember for curiosity, Tide for listening, Grove for collecting, Stone for reading, Spark for early mornings and Dusk for late nights";

/** The page behind the creature's own chip: how the owner's choices decide what it can become. */
export function openEvolution(game, go) {
  const g = game.creature;
  const look = describe(g);
  const stage = stageOf(g.growth);
  const egg = stage.id === "egg";
  const ready = readyToEvolve(g);
  const pct = (t) => Math.round((g.traits[t] || 0) * 100);
  const { body, close } = sheet("How your creature evolves", "evolve");

  const kind = `${TYPES[look.type].name} ${egg ? "egg" : SPECIES[look.species].name.toLowerCase()}`;
  body.append(h(`<p class="info-now">${esc(g.name || (egg ? "Your egg" : "Your creature"))} is a ${kind}. What it turns into follows how you study,
    you choose the moment, and nothing you choose is final.</p>`));

  // Growing up: four stages, reached with XP.
  const xp = g.growth * ADULT_XP;
  const next = STAGES[STAGES.indexOf(stage) + 1];
  const at = ready ? "juvenile" : stage.id; // grown enough, but it waits as a juvenile until its owner evolves it
  const steps = STAGES.map((s) => `<span class="info-step${s.id === at ? " on" : ""}"><b>${STAGE_NAME[s.id]}</b><span class="small">${s.from ? `${fmt(s.from * ADULT_XP)} XP` : "start"}</span></span>`);
  body.append(h(`<div><strong>1. Growing up</strong>
    <div class="info-steps">${steps.join(icon("arrow"))}</div>
    <p class="small muted">${next ? `${fmt(Math.max(1, Math.ceil(next.from * ADULT_XP - xp)))} more XP until it ${next.id === "hatchling" ? "hatches" : next.id === "adult" ? "is ready to evolve" : `is a ${next.id}`}.`
      : g.branch ? "It is fully grown." : "It is ready to evolve: tap it in the habitat."}
      All the XP you earn goes to the creature that is out in the habitat. The others wait, so who you bring out is your first choice.</p></div>`));

  // The four habits: what the owner actually does, measured.
  const bars = TRAITS.map((t) => `<div class="info-habit">${icon(`trait_${t}`)}<span><b>${HABIT[t].name}</b> <span class="small muted">${HABIT[t].how}</span></span>
    <span class="hud-bar"><i style="width:${pct(t)}%"></i></span><span class="info-pct">${pct(t)}%</span></div>`);
  body.append(h(`<div><strong>2. Your four habits</strong>
    <p class="small muted">Each creature keeps a record of how you studied while it was out. A habit rises when you earn XP that way and the
      others fade a little, so the bars follow what you have been doing lately. About 1,500 XP of one kind fills a bar.</p>
    ${bars.join("")}</div>`));

  // Adult forms: one per habit.
  const lead = leadingBranch(g);
  const forms = branchOptions(g).map((b) => {
    const habit = HABIT[BRANCHES[b.id].trait].name.toLowerCase();
    const have = pct(BRANCHES[b.id].trait);
    const move = MOVES.find((m) => m.branch === b.id);
    let state;
    if (g.branch === b.id) state = `${icon("check")} Its form now`;
    else if (g.branches.includes(b.id)) state = `${icon("check")} Unlocked: switch to it on the Creatures page`;
    else if (g.branch) state = `${icon("lock")} Opens at 50% ${habit} (now ${have}%)`;
    else if (b.open) state = `${icon("check")} ${b.id === lead ? "Open: your strongest habit so far" : "Open: this habit is past 25%"}`;
    else state = `${icon("lock")} Opens at 25% ${habit} (now ${have}%)`;
    return `<div class="info-form${b.open || g.branches.includes(b.id) ? " on" : ""}">${icon(`form_${b.id}`, 32)}
      <span><b>${b.name}</b> <span class="small muted">${BRANCHES[b.id].blurb}${move ? ` · brings the battle move ${move.name}` : ""}</span>
      <span class="small">${state}</span></span></div>`;
  });
  body.append(h(`<div><strong>3. Its adult form</strong>
    <p class="small muted">Once it has grown enough it waits as a juvenile and sparkles. Tap it and you choose its adult form. The form of your
      strongest habit is always open, and another opens once its habit passes 25%. After evolving, raising another habit to 50% unlocks
      that form too, and you can switch between unlocked forms whenever you like. Evolving also leaves you a new egg.
      Curiosity has no form of its own: it shows in your eggs, the shop and the garden.</p>
    ${forms.join("")}</div>`));

  // Special forms: earned by something other than growth.
  const specials = variantOptions(game, g).map((v) => `<div class="info-form${v.open ? " on" : ""}">${icon(`form_${v.id}`, 32)}
    <span><b>${v.name}</b> <span class="small muted">${VARIANTS[v.id].blurb}</span>
    <span class="small">${v.open ? `${icon("check")} Earned` : `${icon("lock")} ${VARIANTS[v.id].how}`}</span></span></div>`);
  body.append(h(`<div><strong>4. Special forms</strong>
    <p class="small muted">Worn on top of an adult form. They come from when you study, who it grows up beside, and what you pull off in battle.
      They change colours and features, never strength.</p>
    ${specials.join("")}</div>`));

  body.append(h(`<div><strong>What else your habits change</strong>${list([
    "Its horn, which comes in as a juvenile, leans toward antennae for listeners and a gem for collectors.",
    `The element of every new egg leans toward how you study: ${EGG_LEANS}.`,
    "The shop offers more of what suits your habits, such as headphones for listeners and books for readers.",
    "Each garden building makes more glow for one habit.",
    "Battles between people ignore all of this: every creature fights at the same level, and you win by knowing your words.",
  ])}</div>`));

  body.append(links(close, [{ label: ready ? "Choose its form now" : "Open your creatures", pic: ready ? "evolve" : "nav_roster", run: () => go("creatures") }]));
}
