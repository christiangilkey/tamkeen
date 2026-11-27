// The farm's boxes (prototype "farm"): the seed stand, the barn, the field's fence, a plant's card, choosing a seed to
// plant, and the watering question (one due word, on the question card battles and fishing use). Every one says what
// it is in a line or two (the owner: every building and recipe explains itself when tapped, plain and clean). The
// rules are farm.js; the scene is habitat.js.

import { api, h, state as appState, toast } from "../app.js";
import { snippetPlayer } from "../snippetplayer.js";
import { cardSayer } from "../voiceplay.js";
import { openModal } from "../components/modal.js";
import { t } from "../i18n.js";
import { detectLanguage, setLang, studyLanguage } from "../languages.js";
import { plan, states } from "../review/deck.js";
import { dayNumber as reviewDay } from "../review/fsrs.js";
import { FEEDS_PER_DAY, garden, shrineRate, shrineTier, stardustBoost } from "./idle.js";
import { SHRINE_LINES } from "./shrinelines.js";
import { TYPES } from "./data.js";
import { describe, formOf } from "./genome.js";
import { artCache, composeCreature } from "./render.js";
import { LINES, knownKeys, readLine } from "./muffles.js";
import { warmPorridge } from "./talents.js";
import * as social from "../social.js";
import { cleanName, cleanProfiles } from "./remote.js";
import {
  FAVOURITES, GROUP_NAME, RECIPES, canCook, cook, feedCrop, festivalDay, fillOrder, have, isFavourite, makeBait, sell, sellPrice,
  wake, wokenKeys,
} from "./farmuses.js";
import { answerQuestion, markDue, pickQuestion, weekNumber } from "./rules.js";
import { pondWords } from "./fishing.js";
import { TIERS } from "./loot.js";
import { getGame, saveGame, sfx } from "./game.js";
import { amount, block, details, fact, fmt, row } from "./screenparts.js";
import {
  CROPS, DECOR, DECOR_MAX, SPRINKLER_DAYS, UPGRADES, barnCap, barnCount, barnList, buyDecor, buySeeds, buyUpgrade, cropById,
  daysToNextSeason, decorById, decorOn, farmOf, fenceCost, fieldSize, grind, growFence, inSeason, level, plant, plantState,
  publicFarm, rareSeedOf, removeDecor, seasonOf, seedPrice, seedsOnSale, sprinklerOn, underGlass, upgradeById, upgradeCost,
  water, waterAround,
} from "./farm.js";

const ART = new URL("../../game-art/farm/", import.meta.url).href;
const SEASON_NAME = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter", all: "All year" };
/** A crop's harvest picture (game-art/farm/icons.png), `px` pixels square (a whole-number scale of 16). */
export function cropIcon(c, px = 32) {
  const i = CROPS.indexOf(c);
  return `<span class="farm-ico" style="width:${px}px;height:${px}px;background-image:url('${ART}icons.png');background-size:${CROPS.length * px}px ${px}px;background-position:${-i * px}px 0"></span>`;
}
/** "Summer: a new season in 3 days" (the line every farm box starts with). */
export function seasonLine(now = new Date()) {
  const n = daysToNextSeason(now);
  return n === 1 ? t("{0}: a new season tomorrow", t(SEASON_NAME[seasonOf(now)])) : t("{0}: a new season in {1} days", t(SEASON_NAME[seasonOf(now)]), n);
}
const daysLine = (c) => (c.days === 1 ? t("Ripens after 1 day of water") : t("Ripens after {0} days of water", c.days));

/** The seed stand: this week's seeds (the season's and the all-year ones) and the week's rare seed packet. */
export function openSeedStand({ changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const g = garden(game);
    const f = farmOf(game);
    const more = h(`<div class="farm-list"></div>`);
    const shop = block(seasonLine());
    for (const c of seedsOnSale()) shop.append(seedRow(c));
    more.append(shop);
    const rare = rareSeedOf();
    const rb = block("This week's rare seed");
    rb.append(seedRow(rare, f.rareWeek === weekNumber()));
    more.append(rb);
    return {
      title: "Seed stand",
      text: "Seeds for your field, bought with glow. Each season has its own crops; all-year ones grow any week.",
      more,
      note: t("You have {0} glow.", fmt(g.glow)),
      buttons: [{ word: "Close", run: () => d.close() }, { word: "Upgrades", primary: true, run: () => { d.close(); openFarmShop({ changed }); } }],
    };
    function seedRow(c, had = false) {
      const price = seedPrice(c);
      const btn = h(`<button type="button" class="primary farm-buy"></button>`);
      btn.innerHTML = amount("glow", price, g.glow < price);
      btn.disabled = had || g.glow < price;
      btn.onclick = () => {
        const err = buySeeds(game, g, c.id);
        if (err) { toast(t(err), { error: true }); return; }
        sfx("tick");
        saveGame();
        changed();
        d.redraw();
      };
      const have = f.seeds[c.id] || 0;
      const sub = [daysLine(c), have ? t("You have {0}", have) : "", had ? t("Bought this week") : ""].filter(Boolean).join(" · ");
      return row({ pic: cropIcon(c, 32), name: t(c.name), sub, end: btn });
    }
  });
}

/** The barn: every harvest waiting, by rarity (nothing in it spoils). */
export function openBarn() {
  const game = getGame();
  details((d) => {
    const list = barnList(game);
    const more = h(`<div class="farm-barn"></div>`);
    for (const it of list) {
      const tier = TIERS[it.tier];
      const cell = h(`<button type="button" class="farm-barn-item" style="--tier:${tier.colour}">${cropIcon(it.crop, 32)}<span class="farm-barn-n">×${fmt(it.n)}</span></button>`);
      cell.title = `${t(it.crop.name)} · ${t(tier.name)}`;
      cell.onclick = () => barnItem(`${it.crop.id}:${it.tier}`, { changed: () => d.redraw() }); // (slice 4: feed it, or make bait)
      more.append(cell);
    }
    if (!list.length) more.append(h(`<p class="farm-empty">${t("Nothing yet. Ripe crops you harvest wait here.")}</p>`));
    return {
      title: "Barn",
      text: "Your harvests wait here, as long as you like: nothing in the barn spoils. A coloured edge is a rarer harvest. Tap one to feed it to your creature or make bait.",
      facts: [fact("In the barn", `<span>${fmt(barnCount(game))} / ${fmt(barnCap(game))}</span>`), fact("Honey", `<span>${fmt(farmOf(game).honey || 0)}</span>`),
        fact("Bait", `<span>${fmt(farmOf(game).bait || 0)}</span>`), fact("Flour", `<span>${fmt(farmOf(game).flour || 0)}</span>`)],
      more,
      buttons: [{ word: "Cropdex", run: () => openCropdex() }, { word: "Harvest board", primary: true, run: () => openHarvestBoard() }],
    };
  });
}

/** The field's fence: how big the field is, and a section more for glow. */
export function openFence({ changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const g = garden(game);
    const [w, h2] = fieldSize(game);
    const cost = fenceCost(game);
    return {
      title: "Your field",
      facts: [fact("Size", `<span>${w} × ${h2}</span>`), fact("Next section", cost === null ? `<span>${t("None: it's as big as it gets")}</span>` : amount("glow", cost, g.glow < cost))],
      text: "Each fence section gives your field another row or column of spots to plant.",
      note: cost !== null && g.glow < cost ? t("You need {0} more glow.", fmt(Math.ceil(cost - g.glow))) : "",
      buttons: [
        { word: "Close", run: () => d.close() },
        { word: "Grow the field", primary: true, disabled: cost === null || g.glow < cost, run: () => {
          const err = growFence(game, g);
          if (err) { toast(t(err), { error: true }); return; }
          sfx("lucky");
          saveGame();
          changed();
          d.redraw();
        } },
      ],
    };
  });
}

/** Choose a seed to plant on an empty spot; `planted(crop)` runs once one is planted. */
export function pickSeed(key, { changed = () => {}, planted = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const f = farmOf(game);
    const have = CROPS.filter((c) => f.seeds[c.id] > 0);
    const more = h(`<div class="farm-list"></div>`);
    for (const c of have) {
      const ok = inSeason(c) || underGlass(game, key); // (slice 5: the greenhouse's row grows any season)
      more.append(row({
        pic: cropIcon(c, 32), name: t(c.name), dim: !ok,
        sub: ok ? `${daysLine(c)} · ${t("You have {0}", f.seeds[c.id])}` : t("Its season: {0}", t(SEASON_NAME[c.season])),
        end: ok ? `<span class="farm-plant">${t("Plant")}</span>` : "",
        open: ok ? () => { // one word on the question card, then it is planted (right or wrong)
          d.close();
          askToPlant(key, c).then((done) => { if (done) { changed(); planted(c); } });
        } : null,
      }));
    }
    return {
      title: "Plant a seed",
      text: have.length ? "Pick a seed for this spot: plant it with a word, water it each day with a word, and it ripens." : "You have no seeds. The seed stand by the barn sells them for glow.",
      more,
      buttons: [{ word: "Close", run: () => d.close() }, ...(have.length ? [] : [{ word: "Seed stand", primary: true, run: () => { d.close(); openSeedStand({ changed }); } }])],
    };
  });
}

/** A plant that isn't thirsty: how it is doing (its water days, resting out of season, ripe), and Harvest. */
export function plantCard(key, { harvest = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const s = plantState(game, key);
    if (!s) return null;
    const c = s.crop;
    const text = s.ripe ? "It's ripe. Harvest it into your barn."
      : s.resting ? t("It rests out of its season and grows again when {0} comes back.", t(SEASON_NAME[c.season]))
        : s.watered ? "It has had its water today. Come back tomorrow: it grows on different days, not all at once."
          : "It's thirsty: tap it to water it with a word.";
    return {
      title: c.name,
      pic: cropIcon(c, 64),
      facts: [fact("Water days", `<span>${Math.min(s.days, s.need)} / ${s.need}</span>`), fact("Season", `<span>${t(SEASON_NAME[c.season])}</span>`)],
      text,
      buttons: [{ word: "Close", run: () => d.close() }, ...(s.ripe ? [{ word: "Harvest", primary: true, run: () => { d.close(); harvest(); } }] : [])],
    };
  });
}

// ---------- watering: one due word on the question card ----------
let words = null; // {vocab, at}: the words the farm asks (the game's word choice, as the pond's), kept a few minutes
export async function farmWords(game) {
  if (words && Date.now() - words.at < 5 * 60 * 1000) return words.vocab;
  let vocab = [];
  let log = {};
  try { vocab = await api("/vocab"); } catch { /* none: nothing to ask */ }
  try { log = (await api("/reviews")).reviews || {}; } catch { /* the game's own record decides alone */ }
  let due = new Set();
  try { due = new Set(plan(vocab, states(log), reviewDay(), 0).due.map((v) => String(v.uid || v.id))); } catch { /* as above */ }
  markDue(vocab, due);
  words = { vocab: pondWords(vocab, game), at: Date.now() };
  return words.vocab;
}

/** The right answer's word, said after a choice (the owner: "it should play the correct words audio once a thing is
 * selected"): as battles and the pond say it (voiceplay.cardSayer: the card's own recording, else the voice in your
 * dialect and voice settings, else the device's). Game sound off: not said. */
const farmPlayer = { said: null };
export function sayAnswer(q, vocab) {
  const s = appState.status && appState.status.settings;
  if (s && s.game_sound === false) return;
  const v = (vocab || []).find((w) => String(w.uid || w.id) === String(q.uid));
  if (!v) return;
  if (!farmPlayer.said) farmPlayer.said = cardSayer(snippetPlayer().playSnippet);
  farmPlayer.said(v, "word").catch(() => {});
}

// ---------- the farm's question card: a little scene, one word, then the action's own moment ----------
const CARD_W = 96, CARD_H = 48;          // the scene, in pixels (drawn three times over, crisp)
const PLOT_AT = { x: 58, y: 24 };        // the plot's soil, top left
const pic = artCache(); // (the card's pictures; asks again after a failed load)
let creatureFrame = null, creatureFor = ""; // (your creature, composed once per look)

/**
 * The question card for a farm job: `kind` "plant" (the seed `crop` goes into empty spot `key`) or "water". A little
 * scene at the top (the spot, its crop at its stage, your creature with its trowel or watering can), the crop's
 * progress under it, the word and four answers. `act(correct)` does the job and returns what happened; then the
 * scene plays that job's own moment (planting: a hole dug, the seed dropped in, the earth patted down, a sprout;
 * watering: the can poured, the soil darkening, the plant perking up; a wrong answer: a drizzle and the right word).
 * Resolves to act's result, or null if closed first.
 */
function farmCard({ kind, key, crop, q, act, vocab = [] }) {
  const game = getGame();
  const before = plantState(game, key);
  return new Promise((resolve) => {
    let answered = false, result = null, alive = true;
    const m = openModal({ title: "", cls: "farm-q-back", cross: false, onClose: () => { alive = false; if (!answered) resolve(null); } });
    const panel = h(`<div class="lbq farm-q">
      <button type="button" class="farm-q-x ghost icon" aria-label="Close" title="Close (Esc)">✕</button>
      <canvas class="farm-q-scene" width="${CARD_W * 3}" height="${CARD_H * 3}" aria-hidden="true"></canvas>
      <div class="farm-q-title"></div>
      <div class="farm-q-progress"></div>
      <div class="lbq-ask"></div>
      <div class="lbq-prompt"></div>
      <div class="lbq-options"></div>
      <div class="lbq-verdict" hidden></div>
    </div>`);
    panel.querySelector(".farm-q-x").onclick = () => m.close();
    panel.querySelector(".farm-q-title").textContent = kind === "plant" ? t("Plant the {0}", t(crop.name).toLowerCase()) : t("Water the {0}", t(crop.name).toLowerCase());
    const progress = panel.querySelector(".farm-q-progress");
    progress.textContent = kind === "plant" ? daysLine(crop) : t("Water day {0} of {1}", Math.min(before.days + 1, before.need), before.need);
    panel.querySelector(".lbq-ask").textContent = t("Which of your words means this?");
    const prompt = panel.querySelector(".lbq-prompt");
    prompt.textContent = q.prompt;
    setLang(prompt, detectLanguage(q.prompt));
    const buttons = q.options.map((text, i) => {
      const bt = h(`<button type="button" class="lbq-opt"><span class="lbq-text" dir="auto" translate="no"></span></button>`);
      const el = bt.querySelector(".lbq-text");
      el.textContent = text;
      setLang(el, detectLanguage(text));
      bt.onclick = () => choose(i);
      panel.querySelector(".lbq-options").append(bt);
      return bt;
    });
    m.body.replaceChildren(panel);

    // the scene
    const canvas = panel.querySelector(".farm-q-scene");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const look = describe(game.creature);
    const egg = formOf(game.creature).id === "egg";
    const lookKey = JSON.stringify(look);
    if (!egg && lookKey !== creatureFor) { creatureFor = lookKey; creatureFrame = null; composeCreature(look, { eyes: "open", mouth: "smile" }).then((c) => { creatureFrame = c; }).catch(() => {}); }
    let moment = null; // {kind: "plant" | "water" | "drizzle", t0, grew}
    const row = CROPS.indexOf(crop);
    function draw(now) {
      if (!alive) return;
      ctx.setTransform(3, 0, 0, 3, 0, 0);
      ctx.clearRect(0, 0, CARD_W, CARD_H);
      const grass = pic("battle/terrain/grass_fill.png"), soil = pic("farm/soil.png"), crops = pic("farm/crops.png"), fx = pic("farm/card.png");
      if (grass) for (let y = 0; y < CARD_H; y += 16) for (let x = 0; x < CARD_W; x += 16) ctx.drawImage(grass, ((x / 16 + y / 8) % 4) * 16, 0, 16, 16, x, y, 16, 16);
      const t1 = moment ? now - moment.t0 : 0;
      const wet = (before && before.watered) || (moment && moment.kind === "water" && t1 > 700);
      if (soil) ctx.drawImage(soil, wet ? 16 : 0, 0, 16, 16, PLOT_AT.x, PLOT_AT.y, 16, 16);
      // the crop: none yet when planting until its sprout pops up; when watering, its stage (one up once it grew)
      let stage = kind === "plant" ? (moment && t1 > 2000 ? 0 : -1) : before.stage + (moment && moment.grew && t1 > 1100 ? 1 : 0);
      stage = Math.min(3, stage);
      if (crops && stage >= 0 && row >= 0) {
        const pop = kind === "plant" && t1 < 2300 ? Math.round((2300 - t1) / 100) : 0; // (the sprout rises out of the earth)
        const perk = kind === "water" && moment && moment.kind === "water" && t1 > 1100 && t1 < 1400 ? -1 : 0;
        ctx.save();
        ctx.beginPath(); ctx.rect(PLOT_AT.x - 4, 0, 24, PLOT_AT.y + 16); ctx.clip();
        ctx.drawImage(crops, stage * 16, row * 24, 16, 24, PLOT_AT.x, PLOT_AT.y - 11 + pop + perk, 16, 24);
        ctx.restore();
      }
      // your creature beside it (not an egg: it can't hold a can)
      if (creatureFrame) ctx.drawImage(creatureFrame, 0, 0, creatureFrame.width, creatureFrame.height, 6, CARD_H - 46 + Math.round(Math.sin(now / 400)), 46, 46);
      // the tools and what happens (game-art/farm/card.png: 32 x 32 frames, the plot at 8, 16 in each)
      const frame = (i) => { if (fx) ctx.drawImage(fx, i * 32, 0, 32, 32, PLOT_AT.x - 8, PLOT_AT.y - 16, 32, 32); };
      if (!moment) { if (kind === "plant") frame(Math.floor(now / 600) % 2 ? 0 : 2); } // (the trowel and the seed, waiting)
      else if (moment.kind === "plant") {
        if (t1 < 900) frame(Math.floor(t1 / 150) % 2);           // digging
        else if (t1 < 1300) frame(2);                            // the seed drops
        else if (t1 < 1500) frame(3);                            // in the hole
        else if (t1 < 2000) frame(4 + (Math.floor(t1 / 120) % 2)); // patted down
        else if (t1 < 2600) frame(13);                           // a sprout, and a sparkle
      } else if (moment.kind === "water") { // the splash (the owner's pick: farm/splash.png, 48 x 48 frames, the soil at 16, 26)
        const sp = pic("farm/splash.png");
        if (sp && t1 < 1700) ctx.drawImage(sp, Math.min(13, Math.floor(t1 / 110)) * 48, 0, 48, 48, PLOT_AT.x - 16, PLOT_AT.y - 26, 48, 48);
      } else if (moment.kind === "drizzle") frame(11 + (Math.floor(t1 / 200) % 2));
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    function choose(i) {
      if (answered) return;
      answered = true;
      const correct = i === q.answer;
      for (const bt of buttons) bt.disabled = true;
      buttons[q.answer].classList.add("right");
      if (!correct) buttons[i].classList.add("wrong");
      answerQuestion(game, q.uid, correct);
      sayAnswer(q, vocab); // (the right word, said)
      result = act(correct);
      saveGame();
      const verdict = panel.querySelector(".lbq-verdict");
      verdict.hidden = false;
      verdict.className = `lbq-verdict ${correct ? "ok" : "no"}`;
      const now = performance.now();
      if (kind === "plant") {
        moment = { kind: "plant", t0: now };
        verdict.textContent = correct ? t("Right! It's planted.") : t("Not quite, but it's planted all the same.");
        sfx("tick"); setTimeout(() => sfx("tick"), 300);
        setTimeout(() => { if (alive) sfx("plant"); }, 2000);
        progress.textContent = daysLine(crop);
      } else if (correct) {
        moment = { kind: "water", t0: now, grew: !!(result && result.grew) };
        const more = (result && result.more) || 0;
        verdict.textContent = more ? t("Right! It and {0} more have their water for today.", more) : t("Right! It has its water for today.");
        sfx("water");
        const after = plantState(game, key);
        if (after) progress.textContent = after.ripe ? t("Ripe! Tap it to harvest.") : t("Water day {0} of {1} · come back tomorrow", after.days, after.need);
      } else {
        moment = { kind: "drizzle", t0: now };
        verdict.textContent = t("Not quite: a little water. One more answer waters it.");
        sfx("surprise");
      }
      setTimeout(() => { m.close(); resolve(result); }, kind === "plant" ? (correct ? 2800 : 3400) : correct ? 2100 : 2600);
    }
  });
}

/**
 * Water a plant: one due word asked on the farm's question card. Right: it has its water for today; wrong: a little
 * (two make a watering), and the right answer is shown. Resolves to {correct, grew, ripe, revived} or null (no word
 * could be asked, or the card was closed).
 */
export async function askToWater(key) {
  const game = getGame();
  const vocab = await farmWords(game);
  const q = pickQuestion(game, vocab, Math.random, new Date());
  if (!q) { toast(t("Save a few more words first: watering asks one of them.")); return null; }
  const st = plantState(game, key);
  if (!st) return null;
  let answer = null;
  const r = await farmCard({ kind: "water", key, crop: st.crop, q, vocab, act: (correct) => {
    const out = water(game, key, correct);
    const more = correct && typeof out === "object" ? waterAround(game, key) : []; // (slice 5: the watering can)
    answer = correct;
    return typeof out === "string" ? null : { ...out, more: more.length };
  } });
  return r ? { correct: answer, ...r } : null;
}

/**
 * Plant seed `crop` in empty spot `key` with one word on the farm's question card (the owner: "Planting a seed should
 * take a vocab question to answer"). Right or wrong it is planted (a wrong answer shows the right word): the seed is
 * never lost and nobody gets stuck. With no word to ask, it is planted straight away. Resolves to true once planted.
 */
export async function askToPlant(key, crop) {
  const game = getGame();
  const sow = () => {
    const err = plant(game, key, crop.id);
    if (err) { toast(t(err), { error: true }); return null; }
    return { planted: true };
  };
  const vocab = await farmWords(game);
  const q = pickQuestion(game, vocab, Math.random, new Date());
  if (!q) { const r = sow(); if (r) { saveGame(); sfx("plant"); } return !!r; }
  const r = await farmCard({ kind: "plant", key, crop, q, vocab, act: () => sow() });
  return !!r;
}

/** The Star Shrine's card (slice 3): what stardust does now, the glow it makes (the Star Loom's), how a release
 * works, and what else stardust does (shrinelines.js: the talents' lines, added by talents.js). */
export function openShrine() {
  const game = getGame();
  const d = details(() => {
    const g = garden(game);
    const tier = Math.max(1, shrineTier(game));
    const more = h(`<div class="farm-list"></div>`);
    for (const line of ["Stardust is never spent. You gain it by releasing a fully grown creature.",
      "The shrine also weaves the Star Loom's steady glow, straight into your glow.",
      "A release starts your buildings and glow over. It never touches your farm: its land, crops, barn and seeds stay.", ...SHRINE_LINES]) {
      const li = h(`<p class="gs-detail-text"></p>`);
      li.textContent = t(line);
      more.append(li);
    }
    return {
      title: "Star Shrine",
      pic: `<img class="px-icon gs-art" alt="" width="96" height="96" src="${ART}shrine_${tier}.png">`,
      facts: [fact("Stardust", `<span>${fmt(g.stardust)}</span>`), fact("Each one", `<span>+${Math.round(stardustBoost() * 100)}% ${t("glow")}</span>`),
        fact("An hour", amount("glow", shrineRate(game)))],
      text: "Your stardust lives here. Each one makes all your glow faster, for good, and the shrine grows grander as you gather more.",
      more,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** A short line for a harvest (shown as a toast). */
export function harvestLine(got) {
  const tier = TIERS[got.tier];
  return got.tier ? t("{0} × {1} ({2}) to the barn", t(got.crop.name), got.n, t(tier.name)) : t("{0} × {1} to the barn", t(got.crop.name), got.n);
}
export { cropById };

// ---------- slice 4: what harvests are for (farmuses.js) ----------
const DISH_ART = `${ART}dishes.png`;
/** A dish's picture (game-art/farm/dishes.png), `px` square. */
export function dishIcon(r, px = 32) {
  const i = RECIPES.indexOf(r);
  return `<span class="farm-ico" style="width:${px}px;height:${px}px;background-image:url('${DISH_ART}');background-size:${RECIPES.length * px}px ${px}px;background-position:${-i * px}px 0"></span>`;
}
/** A dish's name and what it does, translated (an element's pie: its element's name put in). */
const recipeName = (r) => (r.type ? t("{0} pie", t(TYPES[r.type].name)) : t(r.name));
const recipeText = (r) => (r.type ? t("Your next egg leans to {0}.", t(TYPES[r.type].name)) : t(r.text));
const needLine = (r) => r.needs.map(([w, n]) => `${n} × ${w === "honey" ? t("Honey") : w.startsWith("fav_") ? t("{0}'s favourite crops", t(TYPES[w.slice(4)].name)) : cropById(w) ? t(cropById(w).name) : t(GROUP_NAME[w])}`).join(", ");

/** One harvest in the barn: feed it to the creature out (a favourite makes it Well fed), or make bait of it. */
function barnItem(key, { changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const f = farmOf(game);
    const n = f.barn[key] || 0;
    if (!n) return null;
    const [id, tier] = key.split(":");
    const c = cropById(id);
    const who = game.creature;
    const fav = who && isFavourite(who.type, id);
    const favs = Object.entries(FAVOURITES).filter(([, list]) => list.includes(id)).map(([type]) => t(TYPES[type].name));
    return {
      title: c.name,
      pic: cropIcon(c, 64),
      facts: [fact("You have", `<span>${fmt(n)}</span>`), fact("Rarity", `<span style="color:${TIERS[tier].colour}">${t(TIERS[tier].name)}</span>`),
        fact("Favourite of", `<span>${favs.length ? favs.join(", ") : t("Nobody")}</span>`), fact("Bait", `<span>${fmt(f.bait || 0)}</span>`)],
      text: fav ? "Your creature loves this one: feeding it makes it Well fed for a day (5% stronger, against the game only)."
        : "Feed it to your creature (a meal, like any food), or make it into bait: each crop makes 3, and bait brings a little more luck at the pond.",
      buttons: [
        ...(id === "wheat" && level(game, "windmill") ? [{ word: "Grind", run: () => { const r = grind(game, n); if (typeof r === "string") { toast(t(r), { error: true }); return; } sfx("tick"); saveGame(); changed(); d.redraw(); } }] : []),
        { word: "Make bait", run: () => { const err = makeBait(game, key); if (err) { toast(t(err), { error: true }); return; } sfx("tick"); saveGame(); changed(); d.redraw(); } },
        { word: "Feed", primary: true, run: () => {
          const r = feedCrop(game, key, null, new Date(), FEEDS_PER_DAY);
          if (typeof r === "string") { toast(t(r), { error: true }); return; }
          sfx(r.loved ? "lucky" : "pet");
          toast(r.loved ? t("Its favourite! It's Well fed for a day.") : t("Yum."));
          saveGame(); changed(); d.redraw();
        } },
      ],
    };
  });
}

/** The Cookbook at the cook's pot: every dish, what it does, what goes in it; Cook. */
export function openCookbook({ changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const more = h(`<div class="farm-list"></div>`);
    for (const r of RECIPES) {
      const ok = canCook(game, r);
      more.append(row({ pic: dishIcon(r, 32), name: recipeName(r), sub: needLine(r), dim: !ok, end: ok ? `<span class="farm-plant">${t("Cook")}</span>` : "",
        open: () => recipeCard(r, { changed, again: () => d.redraw() }) }));
    }
    const f = farmOf(game);
    return {
      title: "Cookbook",
      text: "Dishes cooked from your harvests and honey. Each does one thing; tap one to see what.",
      facts: [fact("Honey", `<span>${fmt(f.honey || 0)}</span>`), fact("Festival", `<span>${festivalDay() ? t("Today!") : t("Sundays")}</span>`)],
      more,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** A dish: its picture, what it does, what goes in it (and how many you have); Cook. */
function recipeCard(r, { changed = () => {}, again = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const facts = r.needs.map(([w, n]) => fact(needLine({ needs: [[w, n]] }).replace(/^\d+ × /, ""), `<span>${fmt(Math.min(have(game, w), 999))} / ${n}</span>`));
    const ok = canCook(game, r);
    const note = r.when === "festival" && !festivalDay() ? t("Only on a festival day (Sundays).") : ok ? "" : t("You don't have everything it needs yet.");
    return {
      title: recipeName(r), pic: dishIcon(r, 64), facts, text: recipeText(r), note,
      buttons: [{ word: "Close", run: () => d.close() }, { word: "Cook", primary: true, disabled: !ok, run: () => {
        if (r.egg) { d.close(); pickEgg((i) => doCook(r, { egg: i })); return; }
        if (doCook(r)) { d.close(); again(); }
      } }],
    };
  });
  function doCook(rr, opts = {}) {
    const res = cook(game, rr.id, { ...opts, porridge: warmPorridge });
    if (typeof res === "string") { toast(t(res), { error: true }); return false; }
    sfx("lucky");
    if (rr.id === "feast") wakeWords(game, 3).then((w) => toast(w.length ? t("Words woke up: {0}", w.join(", ")) : t("The Muffles feast with you.")));
    else toast(t("You cooked: {0}", recipeName(rr)));
    saveGame();
    changed();
    return true;
  }
}

/** Choose one of your eggs (for Warm porridge). */
function pickEgg(then) {
  const game = getGame();
  details((d) => {
    const more = h(`<div class="farm-list"></div>`);
    game.roster.forEach((c, i) => {
      if (formOf(c).id !== "egg") return;
      more.append(row({ pic: "", name: c.name || t("Egg"), sub: t(TYPES[c.type].name), open: () => { d.close(); then(i); } }));
    });
    return {
      title: "Which egg?",
      text: more.childElementCount ? "Warm porridge is for an egg: choose which." : "You have no egg to feed it to.",
      more, buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** The fruit stall: sell harvests for glow. */
export function openFruitStall({ changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const g = garden(game);
    const more = h(`<div class="farm-list"></div>`);
    const list = barnList(game);
    for (const it of list) {
      const key = `${it.crop.id}:${it.tier}`;
      const price = sellPrice(it.crop, it.tier);
      const btn = h(`<button type="button" class="primary farm-buy"></button>`);
      btn.innerHTML = `${t("Sell")} ${amount("glow", price)}`;
      btn.onclick = () => { const got = sell(game, g, key, 1); if (typeof got === "string") { toast(t(got), { error: true }); return; } sfx("tick"); saveGame(); changed(); d.redraw(); };
      more.append(row({ pic: cropIcon(it.crop, 32), name: t(it.crop.name), sub: `×${fmt(it.n)}${it.tier ? ` · ${t(TIERS[it.tier].name)}` : ""}`, end: btn }));
    }
    return {
      title: "Fruit stall",
      text: list.length ? "The grocer buys your harvests for glow. Rarer ones fetch more." : "Nothing to sell yet: harvests from your farm can be sold here for glow.",
      facts: [fact("You have", amount("glow", g.glow))],
      more,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** A Muffle's order: "5 carrots, please". Give them from the barn: glow, and one of their words wakes. */
export function openOrder(order, folkName, { changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const g = garden(game);
    const can = have(game, order.crop.id) >= order.n;
    return {
      title: t("{0}'s order", folkName),
      pic: cropIcon(order.crop, 64),
      facts: [fact("Wants", `<span>${order.n} × ${t(order.crop.name)}</span>`), fact("You have", `<span>${fmt(have(game, order.crop.id))}</span>`),
        fact("Pays", amount("coins", order.coins))],
      text: "Fill a Muffle's order and one of their forgotten words wakes up: it shows in their speech from now on.",
      note: can ? "" : t("Grow some more first: the order waits until tomorrow."),
      buttons: [{ word: "Close", run: () => d.close() }, { word: "Give", primary: true, disabled: !can, run: () => {
        const r = fillOrder(game, g, order.i);
        if (typeof r === "string") { toast(t(r), { error: true }); return; }
        sfx("lucky");
        wakeWords(game, 1).then((w) => toast(w.length ? t("Thank you! A word woke up: {0}", w[0]) : t("Thank you!")));
        saveGame();
        changed();
        d.close();
      } }],
    };
  });
}

/** Wake `n` of the Muffles' forgotten words in the language being learned: words of their lines you don't know yet,
 * which from now on show in their speech. Resolves to the words woken (as written). */
export async function wakeWords(game, n) {
  const lang = studyLanguage();
  let vocab = [];
  try { vocab = await api("/vocab"); } catch { /* none known: any word may wake */ }
  const known = new Set([...knownKeys(vocab, new Set(), game.review, lang), ...wokenKeys(game, lang)]);
  const pool = [];
  for (const lines of Object.values(LINES[lang] || {})) {
    for (const line of lines) for (const w of readLine(line, known, lang).words) if (!w.known && w.key && !pool.some((p) => p.key === w.key)) pool.push(w);
  }
  const picked = [];
  while (picked.length < n && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (picked.length) { wake(game, lang, picked.map((w) => w.key)); saveGame(); }
  return picked.map((w) => w.text.replace(/[.,!?¡¿،؛؟:;"'«»()…]/g, ""));
}

// ---------- slice 5: upgrades, decorations, the Cropdex, the friends' harvest board ----------
const UP_ICON = (i, px = 32) => `<span class="farm-ico" style="width:${px}px;height:${px}px;background-image:url('${ART}upgrades.png');background-size:${7 * px}px ${px}px;background-position:${-i * px}px 0"></span>`;
const decorPic = (d, px = 32) => {
  const src = d.art ? `${ART.replace(/farm\/$/, "")}${d.art}` : `${ART.replace(/farm\/$/, "")}battle/terrain/prop_${d.prop}.png`;
  return `<img class="px-icon" alt="" style="max-width:${px}px;max-height:${px}px;image-rendering:pixelated" src="${src}">`;
};

/** Upgrades (bought with glow; the sprinkler earned) and decorations (no power at all) for the farm. */
export function openFarmShop({ changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const g = garden(game);
    const f = farmOf(game);
    const more = h(`<div class="farm-list"></div>`);
    const ub = block("Upgrades");
    UPGRADES.forEach((u, i) => {
      const l = level(game, u.id);
      const cost = upgradeCost(game, u.id);
      const btn = h(`<button type="button" class="primary farm-buy"></button>`);
      if (cost === null) { btn.textContent = t("Built"); btn.disabled = true; } else { btn.innerHTML = amount("glow", cost, g.glow < cost); btn.disabled = g.glow < cost; }
      btn.onclick = () => { const err = buyUpgrade(game, g, u.id); if (err) { toast(t(err), { error: true }); return; } sfx("lucky"); saveGame(); changed(); d.redraw(); };
      ub.append(row({ pic: UP_ICON(i), name: u.cost.length > 1 ? `${t(u.name)} · ${l} / ${u.cost.length}` : t(u.name), sub: t(u.text), end: btn }));
    });
    const days = Math.min(SPRINKLER_DAYS, Number(f.farmDays) || 0);
    ub.append(row({ pic: UP_ICON(6), name: t("Sprinkler"), sub: sprinklerOn(game) ? t("Earned: plants never wilt, and it waters two of them each day.")
      : t("Earned, not bought: water plants on {0} different days ({1} so far). Then plants never wilt, and it waters two each day.", SPRINKLER_DAYS, days), end: sprinklerOn(game) ? `<span class="farm-plant">${t("Earned")}</span>` : "" }));
    more.append(ub);
    const db = block("Decorations", `${decorOn(game).length} / ${DECOR_MAX}`);
    for (const dd of DECOR) {
      const btn = h(`<button type="button" class="primary farm-buy"></button>`);
      btn.innerHTML = amount("glow", dd.cost, g.glow < dd.cost);
      btn.disabled = g.glow < dd.cost;
      btn.onclick = () => { const err = buyDecor(game, g, dd.id); if (err) { toast(t(err), { error: true }); return; } sfx("tick"); toast(t("It's on your farm. Tap it there to move it.")); saveGame(); changed(); d.redraw(); };
      db.append(row({ pic: decorPic(dd), name: t(dd.name), sub: t("Just for looks"), end: btn }));
    }
    more.append(db);
    return {
      title: "Upgrades and decorations",
      text: "Upgrades help your farm; decorations are just for looks. Both are bought with glow.",
      facts: [fact("You have", amount("glow", g.glow))],
      more,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** A decoration tapped on the farm: move it, or put it away (half its glow back). */
export function decorCard(i, { changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const it = decorOn(game).find((x) => x.i === i);
    const dd = it && decorById(it.id);
    if (!dd) return null;
    return {
      title: dd.name, pic: decorPic(dd, 96), text: "Just for looks: put it wherever you like on your farm.",
      buttons: [
        { word: "Put away", run: () => { const r = removeDecor(game, garden(game), i); if (typeof r === "string") { toast(t(r), { error: true }); return; } toast(t("Put away: {0} glow back.", r)); saveGame(); changed(); d.close(); } },
        { word: "Move it", primary: true, run: () => { d.close(); window.dispatchEvent(new CustomEvent("tamkeen-farm-move", { detail: { decor: i } })); } },
      ],
    };
  });
}

/** The windmill: grind wheat into flour. */
export function windmillCard({ changed = () => {} } = {}) {
  const game = getGame();
  details((d) => {
    const f = farmOf(game);
    const wheat = Object.entries(f.barn).filter(([k]) => k.startsWith("wheat:")).reduce((n, [, k]) => n + k, 0);
    return {
      title: "Windmill", pic: `<img class="px-icon gs-art" alt="" width="96" height="128" src="${ART}windmill.png">`,
      facts: [fact("Wheat", `<span>${fmt(wheat)}</span>`), fact("Flour", `<span>${fmt(f.flour || 0)}</span>`)],
      text: "It grinds wheat into flour. In the Cookbook one flour counts as two grain.",
      buttons: [{ word: "Close", run: () => d.close() }, { word: "Grind all", primary: true, disabled: !wheat, run: () => {
        const r = grind(game, wheat);
        if (typeof r === "string") { toast(t(r), { error: true }); return; }
        sfx("tick"); saveGame(); changed(); d.redraw();
      } }],
    };
  });
}

/** An upgrade standing on the farm, tapped: what it does. */
export function upgradeCard(id) {
  const u = upgradeById(id);
  const i = UPGRADES.indexOf(u);
  details((d) => ({ title: u ? u.name : "Sprinkler", pic: UP_ICON(i < 0 ? 6 : i, 64),
    text: u ? u.text : "Earned by watering on many days: plants never wilt, and it waters two of them each day.",
    buttons: [{ word: "Close", run: () => d.close() }] }));
}

/** The Cropdex: every crop, the rarest of it grown (the ones not grown yet shown faintly). */
export function openCropdex() {
  const game = getGame();
  details((d) => {
    const dex = farmOf(game).dex || {};
    const grid = h(`<div class="farm-barn"></div>`);
    for (const c of CROPS) {
      const best = dex[c.id] ? TIERS[dex[c.id] - 1] : null;
      const cell = h(`<div class="farm-barn-item${best ? "" : " farm-dex-none"}" style="--tier:${best ? best.colour : "transparent"}">${cropIcon(c, 32)}<span class="farm-barn-n"></span></div>`);
      cell.querySelector(".farm-barn-n").textContent = best ? t(best.name) : "?";
      cell.title = best ? `${t(c.name)} · ${t(best.name)}` : `${t(c.name)} · ${t(SEASON_NAME[c.season])}`;
      grid.append(cell);
    }
    return {
      title: "Cropdex", text: "Every crop there is. The edge shows the rarest of it you've grown; faint ones are still to grow.",
      facts: [fact("Grown", `<span>${Object.keys(dex).length} / ${CROPS.length}</span>`)], more: grid,
      buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}

/** The harvest board: you and your friends, this week's harvests (friends only, as the aquarium is; needs
 * supabase/v20-farm.sql on the online database, else only you are on it). */
export async function openHarvestBoard() {
  const game = getGame();
  const rows = [{ name: t("You"), farm: publicFarm(game), me: true }];
  try {
    const me = await social.currentUser();
    const friends = me ? await social.friendsState() : null;
    if (friends && friends.friends.length) {
      const profiles = cleanProfiles(await social.gameProfiles(friends.friends.map((x) => x.user.id)));
      for (const fr of friends.friends) {
        const p = profiles.get(fr.user.id);
        if (p && p.farm) rows.push({ name: cleanName(fr.user.username, 40) || t("A friend"), farm: p.farm });
      }
    }
  } catch { /* offline or signed out: just you */ }
  const wk = publicFarm(game).week;
  const list = rows.filter((r) => r.farm && r.farm.week === wk).sort((a, b) => b.farm.n - a.farm.n);
  details((d) => {
    const more = h(`<div class="farm-list"></div>`);
    list.forEach((r, i) => {
      const best = r.farm.best && cropById(r.farm.best.c);
      more.append(row({ pic: best ? cropIcon(best, 32) : "", name: `${i + 1}. ${r.name}`,
        sub: best ? `${t("Rarest: {0}", t(best.name))} · <span style="color:${TIERS[r.farm.best.t].colour}">${t(TIERS[r.farm.best.t].name)}</span>` : t("Nothing harvested yet"),
        end: `<span class="farm-plant" translate="no">${fmt(r.farm.n)}</span>` }));
    });
    return {
      title: "Harvest board",
      text: "You and your friends, by what you've harvested this week. Only friends see it.",
      more, buttons: [{ word: "Close", run: () => d.close() }],
    };
  });
}
