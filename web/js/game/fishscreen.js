// The Fishing screens of the game sheet (shop.js openShop draws their head, their "?" and the X back to Home, with a
// switch between the three): Ponds (go fishing, the ponds, the rods, your record, this week's biggest catches among
// friends), Basket (what you caught: sell, feed, or keep in the aquarium) and Fishdex (every fish at every tier).
// The pond itself is fishing-ui.js; the rules are fishing.js. In blocks like the game's other screens.

import { h, toast } from "../app.js";
import * as social from "../social.js";
import { t } from "../i18n.js";
import { TYPES } from "./data.js";
import { saveGame, sfx } from "./game.js";
import { icon } from "./render.js";
import { sheet as helpSheet } from "./info.js";
import { TIERS } from "./loot.js";
import { hearts } from "./idle.js";
import { amount, block, details, fact, fmt, grid, row, tile } from "./screenparts.js";
import { RODS, SELL, fishOf } from "./fishdata.js";
import {
  BAG_SIZE, DEX_TOTAL, PONDS, TANK_SIZE, buyRod, catchBoard, dexCount, dexRow, feedFish, fishById, fishingOf, fromTank, luckOf, pondById, pondNeed,
  publicAquarium, sell, sellCommon, toTank,
} from "./fishing.js";
import { fishPicture, fishShape } from "./fishart.js";
import { aquariumView } from "./aquarium.js";
import { fishWaiting, openPond } from "./fishing-ui.js";
import { cleanName, cleanProfiles } from "./remote.js";

/** A tier's name with a dot of its colour (the colours alone don't all read on a light panel). */
const tierMark = (tier) => `<span class="fish-tier-mark"><i class="fish-dot" style="background:${TIERS[tier].colour}"></i><span>${TIERS[tier].name}</span></span>`;
const cm = (n) => [Number(n).toLocaleString(), "cm"].join(" "); // (a unit's symbol: the same in every language)

/** Facts in labelled cells, two to a row: [[label, value markup]]. */
function factCells(list) {
  const box = h(`<div class="gs-facts"></div>`);
  for (const [label, value] of list) {
    const cell = h(`<div class="gs-fact"><span class="gs-label"></span><span class="gs-fact-v">${value}</span></div>`);
    cell.querySelector(".gs-label").textContent = label;
    box.append(cell);
  }
  return box;
}

/** A pond's little picture: its water, with its biggest fish in it. */
function pondPic(pond, open) {
  const box = h(`<span class="fish-pond-pic"></span>`);
  pond.water.slice(0, 3).forEach((colour, i) => box.style.setProperty(`--w${i}`, colour)); // (app.css bands them)
  const big = fishOf(pond.id)[2];
  box.append(open ? fishPicture(big.id, 0, 2) : fishShape(big.id, 2));
  return box;
}

// ---------- Ponds ----------

/**
 * The Fishing screen. `close()` closes the sheet (the pond takes the whole screen); `reopen(section)` opens the sheet
 * again from the pond (its basket button).
 */
export function fishingPanel(body, game, changed, go, close, reopen) {
  const F = fishingOf(game);
  const again = () => { saveGame(); changed(); const top = body.scrollTop; fishingPanel(body, game, changed, go, close, reopen); body.scrollTop = top; };
  const fishAt = (pond) => { close(); openPond({ pond, changed, sheet: reopen }); };
  body.replaceChildren();

  // Go fishing: the pond last fished, and how many fish are waiting.
  const top = block();
  const start = h(`<button type="button" class="primary gs-wide fish-go">${icon("fishing")}<span>Go fishing</span></button>`);
  start.onclick = () => fishAt(F.pond);
  const waiting = h(`<p class="gs-state muted fish-waiting"></p>`);
  top.append(start, waiting);
  body.append(top);
  fishWaiting(game).then((n) => {
    if (!waiting.isConnected) return;
    waiting.textContent = n === 0 ? t("Nothing is due: fish for practice, with less luck.") : n === 1 ? t("1 fish waiting: a word due for review")
      : t("{0} fish waiting: your words due for review", fmt(n));
  }).catch(() => {});

  // The ponds: one per element; the creature out is luckier in its own element's water.
  const ponds = block("Ponds", `${PONDS.filter((p) => pondNeed(game, p.id).open).length} / ${PONDS.length}`);
  const g = grid();
  for (const p of PONDS) {
    const need = pondNeed(game, p.id);
    const home = game.creature.type === p.id;
    const b = tile({
      pic: "", name: p.name, on: p.id === F.pond && need.open,
      sub: need.open ? `${icon("luck")}<span translate="no">×${luckOf(game, p.id)}</span>` : `${icon("lock")}`,
      open: () => (need.open ? fishAt(p.id) : lockedPond(game, p)),
    });
    b.querySelector(".gs-tile-pic").append(pondPic(p, need.open));
    if (!need.open) b.classList.add("fish-locked");
    if (home && need.open) b.title = t("Your creature's home water");
    g.append(b);
  }
  ponds.append(g);
  body.append(ponds);

  // Rods: bought with pearls, each one luckier.
  const rods = block("Rods", h(`<span class="gs-block-end">${amount("pearls", F.pearls)}</span>`));
  RODS.forEach((rod, i) => {
    const mine = F.rods.includes(i);
    const using = F.rod === i;
    rods.append(row({
      pic: icon(`rod_${rod.id}`, 32), name: rod.name,
      sub: `<span>${t("Luck")}</span> <span translate="no">×${rod.luck}</span>`,
      end: using ? `${icon("check")}<span>In use</span>` : mine ? `<span class="gs-row-word">Use</span>` : amount("pearls", rod.pearls, F.pearls < rod.pearls),
      open: using ? null : () => rodBox(game, i, again),
    }));
  });
  body.append(rods);

  // Your record.
  const week = publicAquarium(game).best;
  const record = block("Your record");
  record.append(factCells([
    fact("Fish caught", fmt(F.caught)),
    fact("Fishdex", `<span translate="no">${dexCount(game)} / ${DEX_TOTAL}</span>`),
    fact("In your basket", `<span translate="no">${F.bag.length} / ${BAG_SIZE}</span>`),
    fact("Biggest this week", week ? `<span translate="no">${cm(week.cm)}</span>` : "—"),
  ]));
  body.append(record);

  // This week's biggest catches among friends and guild-mates (never strangers; nothing when signed out).
  const slot = h(`<div class="fish-board-slot"></div>`);
  body.append(slot);
  boardBlock(game).then((b) => { if (b && slot.isConnected) slot.replaceWith(b); }).catch(() => {});
}

/** A pond still closed: what opens it and how far along you are. */
function lockedPond(game, pond) {
  details((d) => {
    const need = pondNeed(game, pond.id);
    return {
      title: pond.name, pic: pondPic(pond, false),
      facts: [
        fact("Gym leaders beaten", `<span translate="no">${Math.min(need.haveGyms, need.gyms)} / ${need.gyms}</span>`),
        fact("Fish caught", `<span translate="no">${fmt(Math.min(need.haveCaught, need.caught))} / ${fmt(need.caught)}</span>`),
      ],
      text: t("Either one opens this pond: beat {0} gym leaders, or catch {1} fish. It has {2} water and three fish of its own.", need.gyms, fmt(need.caught), t(TYPES[pond.id].name)),
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

function rodBox(game, i, again) {
  const rod = RODS[i];
  details((d) => {
    const F = fishingOf(game);
    const mine = F.rods.includes(i);
    const short = !mine && F.pearls < rod.pearls;
    return {
      title: rod.name, pic: icon(`rod_${rod.id}`, 96),
      facts: [fact("Luck", `<span translate="no">×${rod.luck}</span>`), fact("Price", mine ? `${icon("check")}<span>Yours</span>` : amount("pearls", rod.pearls))],
      text: "A better rod makes every cast luckier, in every pond. Pearls are found inside rarer fish.",
      note: short ? t("You need {0} more pearls.", rod.pearls - F.pearls) : "",
      buttons: [
        { word: "Close", run: () => d.close() },
        { word: mine ? "Use it" : "Buy", primary: true, disabled: short, extra: mine ? "" : amount("pearls", rod.pearls),
          run: () => { const problem = buyRod(game, i); if (problem) { toast(problem, { error: true }); return; } sfx("lucky"); d.close(); again(); } },
      ],
    };
  });
}

/** The biggest catch board: me, my friends and my guild-mates, this week. null when signed out or offline. */
async function boardBlock(game) {
  const me = await social.currentUser();
  if (!me) return null;
  const [friends, guilds] = await Promise.all([social.friendsState(), social.guildsState().catch(() => null)]);
  if (!friends) return null;
  const people = new Map(friends.friends.map((f) => [f.user.id, f.user]));
  for (const gd of (guilds && guilds.guilds) || []) for (const m of gd.members) if (m.id !== me.id && !people.has(m.id)) people.set(m.id, m);
  let profiles = new Map();
  if (people.size) profiles = cleanProfiles(await social.gameProfiles([...people.keys()])); // (from their devices: checked first, remote.js)
  const rows = [{ id: me.id, name: t("You"), me: true, aquarium: publicAquarium(game) }];
  for (const [id, user] of people) {
    const p = profiles.get(id);
    rows.push({ id, name: cleanName(user.username, 40) || t("A friend"), aquarium: p ? p.aquarium : null });
  }
  return boardView(rows);
}

/** The board as a block. `rows`: [{id, name (already cleaned), me, aquarium (already checked: remote.cleanAquarium)}]. */
export function boardView(rows, now = new Date()) {
  const board = catchBoard(rows, now);
  const b = block("Biggest catch this week", board.length ? String(board.length) : null);
  if (!board.length) {
    b.append(h(`<p class="gs-state muted">Nobody has landed a fish yet this week.</p>`));
    return b;
  }
  board.forEach((r, i) => {
    const fish = fishById(r.fish.sp);
    const theirs = rows.find((x) => x.id === r.id);
    const el = row({
      pic: "", name: r.name,
      sub: `${tierMark(r.fish.t)} <span>${fish.name}</span>`,
      end: `<span class="fish-board-cm" translate="no">${cm(r.fish.cm)}</span>`,
      open: r.me ? null : () => friendAquarium(r.name, theirs.aquarium),
    });
    el.classList.add("fr-row");
    if (r.me) el.classList.add("fr-me");
    el.querySelector(".gs-row-name").setAttribute("translate", "no"); // (a person's name: shown as they wrote it)
    const pic = el.querySelector(".gs-row-pic");
    pic.append(fishPicture(r.fish.sp, r.fish.t, 2), h(`<span class="fr-rank" translate="no">${i + 1}</span>`));
    b.append(el);
  });
  return b;
}

/** A friend's aquarium, in a box (their fish came from their device: remote.cleanAquarium checked them). */
export function friendAquarium(name, aquarium) {
  details((d) => ({
    title: t("{0}'s aquarium", name),
    pic: aquarium && aquarium.tank.length ? aquariumView(aquarium.tank, { w: 136, h: 64, scale: 2 }) : null,
    facts: [
      fact("In the aquarium", `<span translate="no">${aquarium ? aquarium.tank.length : 0} / ${TANK_SIZE}</span>`),
      fact("Fishdex", `<span translate="no">${aquarium ? aquarium.dex : 0} / ${DEX_TOTAL}</span>`),
    ],
    text: aquarium && aquarium.tank.length ? "" : t("Their aquarium is empty for now."),
    buttons: [{ word: "Close", run: () => d.close() }],
  }));
}

// ---------- Basket ----------

export function basketPanel(body, game, changed, go, close, reopen) {
  const F = fishingOf(game);
  const again = () => { saveGame(); changed(); const top = body.scrollTop; basketPanel(body, game, changed, go, close, reopen); body.scrollTop = top; };
  body.replaceChildren();

  // The aquarium: your best fish, swimming. Friends see it.
  const aq = block("Aquarium", `${F.tank.length} / ${TANK_SIZE}`);
  if (F.tank.length) {
    const view = h(`<div class="fish-aq"></div>`);
    view.append(aquariumView(F.tank));
    aq.append(view);
    const g = grid();
    F.tank.forEach((fish) => {
      const b = tile({ pic: "", name: fishById(fish.sp).name, sub: tierMark(fish.t), open: () => tankBox(game, fish, again) });
      b.querySelector(".gs-tile-pic").append(fishPicture(fish.sp, fish.t, 2));
      g.append(b);
    });
    aq.append(g);
  } else aq.append(h(`<p class="gs-state muted">Keep your best fish here. Your friends can see your aquarium.</p>`));
  body.append(aq);

  // The basket: what you caught, the rarest first.
  const bag = block("Basket", `${F.bag.length} / ${BAG_SIZE}`);
  if (!F.bag.length) {
    const empty = h(`<p class="gs-empty">${icon("basket", 32)}<span>Your basket is empty.</span><button type="button" class="primary">Go fishing</button></p>`);
    empty.querySelector("button").onclick = () => { close(); openPond({ changed, sheet: reopen }); };
    bag.append(empty);
  } else {
    const common = F.bag.filter((x) => x.t <= 1);
    if (common.length) {
      const all = h(`<button type="button" class="gs-wide fish-sell-all">${icon("coin")}<span></span></button>`);
      all.querySelector("span").textContent = t("Sell the {0} Common and Uncommon fish: +{1}", common.length, common.reduce((n, x) => n + x.w, 0));
      all.onclick = () => { const r = sellCommon(game); if (r.n) { sfx("common"); toast(t("Sold {0} fish: +{1} coins", r.n, r.coins)); } again(); };
      bag.append(all);
    }
    const g = grid();
    for (const fish of [...F.bag].sort((a, b) => b.t - a.t || b.cm - a.cm)) {
      const b = tile({ pic: "", name: fishById(fish.sp).name, sub: tierMark(fish.t), open: () => fishBox(game, fish, again) });
      b.querySelector(".gs-tile-pic").append(fishPicture(fish.sp, fish.t, 2));
      g.append(b);
    }
    bag.append(g);
  }
  body.append(bag);
}

/** A fish in the basket: sell it, feed it to the creature, or put it in the aquarium. */
function fishBox(game, fish, again) {
  details((d) => {
    const F = fishingOf(game);
    const i = F.bag.indexOf(fish);
    if (i < 0) return null;
    const kind = fishById(fish.sp);
    const full = F.tank.length >= TANK_SIZE;
    const done = (problem, sound) => { if (typeof problem === "string" && problem) { toast(problem, { error: true }); return; } sfx(sound); d.close(); again(); };
    return {
      title: kind.name, pic: tierPic(fish, 5),
      facts: [fact("Rarity", tierMark(fish.t)), fact("Length", `<span translate="no">${cm(fish.cm)}</span>`),
        fact("Pond", `<span>${pondById(kind.pond).name}</span>`), fact("Sells for", amount("coins", fish.w))],
      note: full ? t("The aquarium is full: take a fish out first.") : "",
      buttons: [
        { word: "Sell", extra: amount("coins", fish.w), run: () => { sell(game, [F.bag.indexOf(fish)]); done("", "common"); } },
        { word: "Feed", pic: icon("heart_full"), run: () => {
          const r = feedFish(game, F.bag.indexOf(fish));
          if (typeof r === "string") { toast(r, { error: true }); return; }
          toast(r.loved ? t("It loved that! {0} of 5 hearts", hearts(game.creature)) : t("Yum. {0} of 5 hearts", hearts(game.creature)));
          done("", "pet");
        } },
        { word: "Aquarium", primary: true, disabled: full, run: () => done(toTank(game, F.bag.indexOf(fish)), "lucky") },
      ],
    };
  });
}

/** A fish in the aquarium: take it back out. */
function tankBox(game, fish, again) {
  details((d) => {
    const F = fishingOf(game);
    if (!F.tank.includes(fish)) return null;
    const kind = fishById(fish.sp);
    return {
      title: kind.name, pic: tierPic(fish, 5),
      facts: [fact("Rarity", tierMark(fish.t)), fact("Length", `<span translate="no">${cm(fish.cm)}</span>`)],
      text: "In your aquarium, where your friends can see it.",
      buttons: [
        { word: "Close", run: () => d.close() },
        { word: "Take out", run: () => { const problem = fromTank(game, F.tank.indexOf(fish)); if (problem) { toast(problem, { error: true }); return; } d.close(); again(); } },
      ],
    };
  });
}

/** A fish's big picture on a panel tinted with its tier's colour. */
function tierPic(fish, scale) {
  const box = h(`<span class="fish-tier-pic"></span>`);
  box.style.setProperty("--tier", TIERS[fish.t].colour);
  box.append(fishPicture(fish.sp, fish.t, scale));
  return box;
}

// ---------- Fishdex ----------

export function fishdexPanel(body, game) {
  body.replaceChildren();
  const top = block("Fishdex", `${dexCount(game)} / ${DEX_TOTAL}`);
  top.append(h(`<p class="gs-state muted">Every fish at every tier, Common to Eternal.</p>`));
  body.append(top);
  for (const pond of PONDS) {
    const open = pondNeed(game, pond.id).open;
    const kinds = fishOf(pond.id).map((f) => dexRow(game, f.id));
    const b = block(pond.name, open ? `${kinds.reduce((n, k) => n + k.n, 0)} / ${kinds.length * TIERS.length}` : h(`<span class="gs-block-end">${icon("lock")}</span>`));
    for (const k of kinds) {
      const best = k.tiers.lastIndexOf(true);
      const pips = k.tiers.map((got, tier) => `<i class="fish-pip${got ? " on" : ""}" style="--tier:${TIERS[tier].colour}" title="${TIERS[tier].name}"></i>`).join("");
      const el = row({
        pic: "", name: k.n ? k.name : "???", dim: !k.n,
        sub: `<span class="fish-pips">${pips}</span>`,
        end: k.best ? `<span translate="no">${cm(k.best)}</span>` : "",
        open: k.n ? () => dexBox(game, k) : null,
      });
      el.querySelector(".gs-row-pic").append(k.n ? fishPicture(k.id, best, 2) : fishShape(k.id, 2));
      b.append(el);
    }
    body.append(b);
  }
}

/** A fish's Fishdex entry: its best look, its longest, and which tiers you have. */
function dexBox(game, k) {
  details((d) => {
    const best = k.tiers.lastIndexOf(true);
    const list = h(`<div class="fish-dex-tiers"></div>`);
    k.tiers.forEach((got, tier) => {
      const el = h(`<span class="fish-dex-tier${got ? " on" : ""}">${tierMark(tier)}</span>`);
      list.append(el);
    });
    return {
      title: k.name, pic: tierPic({ sp: k.id, t: best }, 5),
      facts: [fact("Longest", `<span translate="no">${cm(k.best)}</span>`), fact("Pond", `<span>${pondById(k.pond).name}</span>`),
        fact("Tiers caught", `<span translate="no">${k.n} / ${TIERS.length}</span>`), fact("Best sells for", amount("coins", SELL[best]))],
      more: list,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

// ---------- the "?" ----------

function helpPart(title, ...items) {
  const part = h(`<div><strong></strong><ul class="info-list"></ul></div>`);
  part.querySelector("strong").textContent = title;
  for (const it of items) { const li = h(`<li></li>`); li.textContent = it; part.querySelector("ul").append(li); }
  return part;
}

/** How fishing works, over the Fishing screens (their "?"). */
export function fishingHelp(game, go, opts = {}) {
  const { body } = helpSheet("How fishing works", "fishing", opts);
  body.append(
    helpPart(t("The pond"),
      t("Every word due for review is a fish in the water. A bigger shadow is a luckier fish: a word you often miss, or a boss word."),
      t("When nothing is due you can still fish for practice, with less luck.")),
    helpPart(t("Cast, bite, answer"),
      t("Tap the water to cast. When a fish bites, its word's card comes up: pick the word that means what it says. A right answer hooks the fish."),
      t("A wrong answer, or none in 12 seconds, and it gets away: that word comes back sooner."),
      t("Every answer counts as a review, the same as in a battle.")),
    helpPart(t("Rarity"),
      t("Each fish you land is rolled on ten tiers, from Common to Eternal. Luck makes the rare ones likelier: a word that was due, right answers in a row, your rod, and your creature fishing in the water of its own element."),
      t("A Legendary or better fights back: one or two more right answers in a row to land it. If it breaks free it stays in that pond all day, and the next fish you hook there is it."),
      t("An answer given too fast to have been read lands a Common fish at most.")),
    helpPart(t("What fish are for"),
      t("Sell them for coins, feed one to your creature for a heart, or keep your best in the aquarium, where your friends can see them."),
      t("Rarer fish hold pearls. Pearls buy better rods, and a better rod makes every cast luckier."),
      t("The Fishdex keeps every fish at every tier you have caught.")),
    helpPart(t("Ponds"),
      t("Each pond has three fish of its own. More ponds open as you beat gym leaders or catch more fish.")),
    helpPart(t("Fair play"),
      t("Nothing here is bought with money, and nothing here makes a creature stronger in battles.")),
  );
}
