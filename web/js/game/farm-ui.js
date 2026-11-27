// The farm's boxes (prototype "farm"): the seed stand, the barn, the field's fence, a plant's card, choosing a seed to
// plant, and the watering question (one due word, on the question card battles and fishing use). Every one says what
// it is in a line or two (the owner: every building and recipe explains itself when tapped, plain and clean). The
// rules are farm.js; the scene is habitat.js.

import { api, h, toast } from "../app.js";
import { openModal } from "../components/modal.js";
import { t } from "../i18n.js";
import { detectLanguage, setLang } from "../languages.js";
import { plan, states } from "../review/deck.js";
import { dayNumber as reviewDay } from "../review/fsrs.js";
import { garden, shrineRate, shrineTier, stardustBoost } from "./idle.js";
import { SHRINE_LINES } from "./shrinelines.js";
import { answerQuestion, markDue, pickQuestion, weekNumber } from "./rules.js";
import { pondWords } from "./fishing.js";
import { TIERS } from "./loot.js";
import { getGame, saveGame, sfx } from "./game.js";
import { amount, block, details, fact, fmt, row } from "./screenparts.js";
import {
  CROPS, barnList, buySeeds, cropById, daysToNextSeason, farmOf, fenceCost, fieldSize, growFence, inSeason, plant,
  plantState, rareSeedOf, seasonOf, seedPrice, seedsOnSale, water,
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
      buttons: [{ word: "Close", run: () => d.close() }],
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
      const cell = h(`<div class="farm-barn-item" style="--tier:${tier.colour}">${cropIcon(it.crop, 32)}<span class="farm-barn-n">×${fmt(it.n)}</span></div>`);
      cell.title = `${t(it.crop.name)} · ${t(tier.name)}`;
      more.append(cell);
    }
    if (!list.length) more.append(h(`<p class="farm-empty">${t("Nothing yet. Ripe crops you harvest wait here.")}</p>`));
    return {
      title: "Barn",
      text: "Your harvests wait here, as long as you like: nothing in the barn spoils. A coloured edge is a rarer harvest.",
      more,
      buttons: [{ word: "Close", run: () => d.close() }],
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
      const ok = inSeason(c);
      more.append(row({
        pic: cropIcon(c, 32), name: t(c.name), dim: !ok,
        sub: ok ? `${daysLine(c)} · ${t("You have {0}", f.seeds[c.id])}` : t("Its season: {0}", t(SEASON_NAME[c.season])),
        end: ok ? `<span class="farm-plant">${t("Plant")}</span>` : "",
        open: ok ? () => {
          const err = plant(game, key, c.id);
          if (err) { toast(t(err), { error: true }); return; }
          sfx("tick");
          saveGame();
          changed();
          d.close();
          planted(c);
        } : null,
      }));
    }
    return {
      title: "Plant a seed",
      text: have.length ? "Pick a seed for this spot. Water it each day with a word, and it ripens." : "You have no seeds. The seed stand by the barn sells them for glow.",
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
async function farmWords(game) {
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

/**
 * Water a plant: one due word asked on the question card. Right: it has its water for today; wrong: a little (two
 * make a watering), and the right answer is shown. Resolves to {correct, grew, ripe, revived} or null (no word could
 * be asked, or the card was closed).
 */
export async function askToWater(key) {
  const game = getGame();
  const vocab = await farmWords(game);
  const q = pickQuestion(game, vocab, Math.random, new Date());
  if (!q) { toast(t("Save a few more words first: watering asks one of them.")); return null; }
  const c = (plantState(game, key) || {}).crop;
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({ title: "", cls: "farm-q-back", onClose: () => { if (!answered) resolve(null); } });
    const panel = h(`<div class="lbq fishq farm-q">
      <div class="lbq-head"><span class="lbq-move"></span></div>
      <div class="lbq-ask"></div>
      <div class="lbq-prompt"></div>
      <div class="lbq-options"></div>
      <div class="lbq-foot"><span class="lbq-verdict" hidden></span></div>
    </div>`);
    const head = panel.querySelector(".lbq-move");
    head.innerHTML = c ? cropIcon(c, 32) : "";
    head.append(document.createTextNode(c ? t("Water the {0}", t(c.name).toLowerCase()) : t("Water it")));
    panel.querySelector(".lbq-ask").textContent = t("Which of your words means this?");
    const prompt = panel.querySelector(".lbq-prompt");
    prompt.textContent = q.prompt;
    setLang(prompt, detectLanguage(q.prompt));
    const buttons = q.options.map((text, i) => {
      const b = h(`<button type="button" class="lbq-opt"><span class="lbq-text" dir="auto" translate="no"></span></button>`);
      const el = b.querySelector(".lbq-text");
      el.textContent = text;
      setLang(el, detectLanguage(text));
      b.onclick = () => choose(i);
      panel.querySelector(".lbq-options").append(b);
      return b;
    });
    m.body.replaceChildren(panel);
    function choose(i) {
      if (answered) return;
      answered = true;
      const correct = i === q.answer;
      for (const b of buttons) b.disabled = true;
      buttons[q.answer].classList.add("right");
      if (!correct) buttons[i].classList.add("wrong");
      answerQuestion(game, q.uid, correct);
      const r = water(game, key, correct);
      saveGame();
      const verdict = panel.querySelector(".lbq-verdict");
      verdict.hidden = false;
      verdict.className = `lbq-verdict ${correct ? "ok" : "no"}`;
      verdict.textContent = correct ? t("Right! It has its water for today.") : t("Not quite: a little water. One more answer waters it.");
      sfx(correct ? "common" : "surprise");
      setTimeout(() => { m.close(); resolve(typeof r === "string" ? null : { correct, ...r }); }, correct ? 900 : 2200);
    }
  });
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
