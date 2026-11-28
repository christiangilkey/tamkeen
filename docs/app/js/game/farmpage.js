// The farm page (prototype "farm_page"; the owner, 2026-11-27: "tapping on the farm icon ... should just pop open a
// farming page, which allows more real estate to make a dedicated farming type game, purchasing seeds should be able to
// be done there and all the watering planting harvesting ... visually interesting, fun satisfying and addicting", and
// "each interaction with them should require a question answered"). Full screen, like the fishing pond: the season,
// glow and barn at the top, what needs doing today, the field with big plots and your creature among the rows, the
// watering chain, the seed tray, "Water next" and the seed stand. Every planting, watering and harvest asks one of your
// words on the page's own question panel; then that job's moment plays on the plot (game-art/farm/card.png): planting
// digs, drops the seed and a sprout pops up; watering pours the can, the soil darkens and the plant grows; a wrong
// watering drizzles; a harvest pops out with its rarity reveal (reveal.js, as fishing's catch). The owner's rules hold:
// nothing pays for speed (the chain is a sound, not a reward), every word studied grows every plant, nothing dies.

import { h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon as lineIcon } from "../icons.js";
import { detectLanguage, setLang } from "../languages.js";
import { getGame, saveGame, sfx } from "./game.js";
import { describe, formOf } from "./genome.js";
import { garden } from "./idle.js";
import { artCache, composeCreature, icon } from "./render.js";
import { answerQuestion, pickQuestion } from "./rules.js";
import { reveal } from "./reveal.js";
import { CROPS, barnCap, barnCount, digUp, farmOf, fieldSize, harvest, inSeason, plant, plantState, seasonOf, underGlass, water, waterAround } from "./farm.js";
import { cropIcon, farmWords, harvestLine, nextSeasonLine, openBarn, openFence, openSeasonPeek, openSeedStand, plantCard, sayAnswer, seasonTag } from "./farm-ui.js";
import { feature } from "../prototype.js";
import { cardsWaiting, dockReview } from "./reviewplay.js";

const SEASON_NAME = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter", all: "All year" };
const CELL = 26;            // a plot's square in the scene, in pixels (its soil 22 across)
const EDGE = 8;             // grass round the field
const CHAIN_MAX = 5;        // pips on the watering chain
const pic = artCache(); // (asks again after a failed load)

/** Open the farm page. `changed()` runs after anything changes (for the Home screen's numbers). Returns close(). */
export function openFarm({ changed = () => {} } = {}) {
  const game = getGame();
  document.querySelector(".farm-wrap")?.remove();
  const wrap = h(`<div class="live-wrap farm-wrap" role="dialog" aria-label="Farm"><div class="farmp">
    <div class="farmp-top">
      <span class="farmp-title"><b></b><button type="button" class="farmp-season"></button></span>
      <span class="farmp-chip farmp-glow" title="Glow">${icon("glow")}<b translate="no"></b></span>
      <button type="button" class="farmp-chip farmp-barn" title="Your barn">${icon("basket")}<b translate="no"></b></button>
      <button type="button" class="ghost icon farmp-close" title="Close (Esc)" aria-label="Close">${lineIcon("close", 20)}</button>
    </div>
    <div class="farmp-today"></div>
    <div class="farmp-field"><canvas aria-label="Your field: tap a plot"></canvas></div>
    <div class="farmp-chain" aria-hidden="true"><span></span><i></i><i></i><i></i><i></i><i></i><b translate="no"></b></div>
    <div class="farmp-foot">
      <div class="farmp-tools">
        <p class="farmp-tray-head"></p>
        <div class="farmp-tray" role="listbox" aria-label="Seeds"></div>
        <div class="farmp-actions"><button type="button" class="primary farmp-next"></button><button type="button" class="farmp-stand"></button><button type="button" class="farmp-review" hidden></button></div>
        <p class="farmp-hint"></p>
      </div>
      <div class="farmp-ask px-corner" hidden>
        <div class="farmp-ask-title"></div>
        <div class="lbq-ask"></div>
        <div class="lbq-prompt"></div>
        <div class="lbq-options"></div>
        <div class="farmp-verdict" hidden></div>
      </div>
    </div>
  </div></div>`);
  const $ = (q) => wrap.querySelector(q);
  document.body.append(wrap);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  $(".farmp-title b").textContent = t("Farm");
  $(".farmp-next").innerHTML = dropIcon();
  $(".farmp-next").append(` ${t("Water next")}`);
  $(".farmp-stand").textContent = t("Seed stand");
  $(".farmp-hint").textContent = t("Every word you study grows all your plants a little. Tap a plot: planting, watering, harvesting and digging up each ask one of your words.");
  $(".farmp-chain span").textContent = t("Watering chain");
  $(".farmp-season").onclick = () => { sfx("tick"); openSeasonPeek(); }; // (the next season, and the seeds it brings)

  let alive = true, busy = false, seed = null, chain = 0;
  let rp = null; // the vocab reviewer docked over the field, while it is there (review_play)
  let pet = { x: 0, y: 0, tx: 0, ty: 0, frame: null };
  const moments = []; // {kind: "plant" | "water" | "drizzle" | "harvest", key, t0, grew}
  let flash = null;   // {key, until}

  // ----- your creature among the rows -----
  if (formOf(game.creature).id !== "egg") composeCreature(describe(game.creature), { eyes: "open", mouth: "smile" }).then((c) => { pet.frame = c; }).catch(() => {});

  // ----- the field's size and where each plot is -----
  const size = () => fieldSize(game);
  const sceneW = () => size()[0] * CELL + EDGE * 2, sceneH = () => size()[1] * CELL + EDGE * 2 + 18;
  /** The middle of plot (c, r) in the scene. Columns count from the field's right edge, as farmmap.spotXY. */
  const plotXY = (c, r) => { const [w] = size(); return { x: EDGE + (w - 1 - c) * CELL + CELL / 2, y: EDGE + 14 + r * CELL + CELL / 2 }; };
  function fit() {
    const [w, hh] = size();
    canvas.width = sceneW() * 3; canvas.height = sceneH() * 3;
    const box = $(".farmp-field").getBoundingClientRect();
    const room = Math.max(160, window.innerHeight - 420); // (the rest of the page: the top, chips, chain, tray, buttons)
    const cell = rp // (beside the cards the field fits the room the page has left, its plots never tapped)
      ? Math.max(24, Math.min(box.width / Math.min(w, 4.2), ($(".farmp").clientHeight - 200) / (Math.max(3, hh) + 1.4)))
      : Math.max(44, Math.min(box.width / Math.min(w, 4.2), room / Math.max(3, hh))) ; // (a fingertip at least; four columns across a phone)
    const k = cell / CELL;
    const was = canvas.style.width;
    canvas.style.width = `${Math.round(sceneW() * k)}px`;
    canvas.style.height = `${Math.round(sceneH() * k)}px`;
    ctx.imageSmoothingEnabled = false;
    if (canvas.style.width !== was) toStart(); // (a new size, as when the cards beside it close: back to its first plots)
  }
  /** Scroll the field to its right edge, where it starts by the gate and its first plots are (it grows west as the
   * fence grows); right to left the scroll runs the other way. */
  function toStart() {
    const field = $(".farmp-field");
    field.scrollLeft = getComputedStyle(field).direction === "rtl" ? 0 : field.scrollWidth;
  }
  const keys = () => { const [w, hh] = size(); const out = []; for (let r = 0; r < hh; r++) for (let c = 0; c < w; c++) out.push(`${c},${r}`); return out; };
  const at = (key) => { const [c, r] = key.split(",").map(Number); return plotXY(c, r); };

  // ----- the numbers at the top, today's chips, the tray -----
  function paint() {
    const now = new Date();
    $(".farmp-season").textContent = `${t(SEASON_NAME[seasonOf(now)])} · ${nextSeasonLine(now)}`; // ("Summer · Autumn in 3 days")
    $(".farmp-glow b").textContent = Math.floor(garden(game).glow).toLocaleString();
    $(".farmp-barn b").textContent = barnCount(game).toLocaleString();
    let thirsty = 0, ripe = 0, empty = 0, growing = 0;
    for (const k of keys()) { const s = plantState(game, k); if (!s) empty++; else if (s.ripe) ripe++; else { if (s.thirsty) thirsty++; if (s.growing) growing++; } }
    const today = $(".farmp-today");
    today.replaceChildren();
    const chip = (cls, ico, text) => { const s = h(`<span class="farmp-tag ${cls}">${ico}<span></span></span>`); s.lastChild.textContent = text; today.append(s); };
    if (thirsty) chip("water", dropIcon(), t("{0} need water", thirsty));
    if (ripe) chip("ripe", lineIcon("sparkle", 16), t("{0} ripe", ripe));
    if (empty) chip("", lineIcon("plus", 16), t("{0} empty", empty));
    $(".farmp-next").disabled = !growing; // (no daily cap: anything growing can be watered again)
    // (the seeds to plant, labelled as seeds: they show their crop's picture, and the owner took them for harvests;
    // harvests are in the barn, the basket at the top)
    $(".farmp-tray-head").textContent = t("Seeds to plant");
    const tray = $(".farmp-tray");
    tray.replaceChildren();
    const f = farmOf(game);
    const have = CROPS.filter((c) => f.seeds[c.id] > 0);
    if (seed && !have.some((c) => c.id === seed)) seed = null;
    if (!seed) { const first = have.find((c) => inSeason(c)); seed = first ? first.id : null; }
    for (const c of have) {
      const ok = inSeason(c);
      const b = h(`<button type="button" class="farmp-seed${c.id === seed ? " on" : ""}" role="option" aria-selected="${c.id === seed}">${cropIcon(c, 32)}<span class="farmp-seed-name"></span><b translate="no"></b></button>`);
      b.querySelector(".farmp-seed-name").textContent = t(c.name); // (its own class: the crop's picture is a span too)
      b.querySelector("b").textContent = `×${f.seeds[c.id]}`;
      if (!ok) { b.classList.add("off"); b.title = seasonTag(c); } // ("Back in Autumn")
      b.onclick = () => { seed = c.id; sfx("tick"); paint(); };
      tray.append(b);
    }
    if (!have.length) { const p = h(`<p class="farmp-empty"></p>`); p.textContent = t("No seeds yet: the seed stand sells them for glow."); tray.append(p); }
    const pips = [...wrap.querySelectorAll(".farmp-chain i")];
    pips.forEach((p, i) => p.classList.toggle("on", i < Math.min(chain, CHAIN_MAX)));
    $(".farmp-chain b").textContent = chain > 1 ? `×${chain}` : "";
    changed();
  }

  // ----- the scene -----
  function draw(now) {
    if (!alive) return;
    const grass = pic("battle/terrain/grass_fill.png"), soil = pic("farm/soil.png"), crops = pic("farm/crops.png"), fx = pic("farm/card.png"), fence = pic("farm/gate.png");
    ctx.setTransform(3, 0, 0, 3, 0, 0);
    ctx.clearRect(0, 0, sceneW(), sceneH());
    if (grass) for (let y = 0; y < sceneH(); y += 16) for (let x = 0; x < sceneW(); x += 16) ctx.drawImage(grass, ((x / 16 + y / 16) % 4) * 16, 0, 16, 16, x, y, 16, 16);
    // the fence round the field (its posts and rails, the planks of the farm's gate)
    const [w, hh] = size();
    const fx0 = EDGE - 3, fy0 = EDGE + 11, fx1 = EDGE + w * CELL + 2, fy1 = EDGE + 14 + hh * CELL + 2;
    ctx.fillStyle = "#5e3a22"; ctx.fillRect(fx0, fy0, fx1 - fx0, 2); ctx.fillRect(fx0, fy0, 2, fy1 - fy0); ctx.fillRect(fx1 - 2, fy0, 2, fy1 - fy0);
    ctx.fillRect(fx0, fy1, (fx1 - fx0) / 2 - 8, 2); ctx.fillRect(fx0 + (fx1 - fx0) / 2 + 8, fy1, (fx1 - fx0) / 2 - 8, 2);
    ctx.fillStyle = "#b28048"; for (let x = fx0; x <= fx1 - 2; x += 8) ctx.fillRect(x, fy0 - 3, 2, 5); for (let y = fy0; y <= fy1; y += 8) { ctx.fillRect(fx0, y, 2, 3); ctx.fillRect(fx1 - 2, y, 2, 3); }
    void fence;
    // the plots
    for (const key of keys()) {
      const p = at(key), s = plantState(game, key);
      const m = moments.find((x) => x.key === key);
      const t1 = m ? now - m.t0 : 0;
      const wet = (s && s.watered) || (m && m.kind === "water" && t1 > 700);
      ctx.fillStyle = "#3e2414"; ctx.fillRect(p.x - 12, p.y - 12, 24, 24);
      if (soil) for (const [dx, dy] of [[-11, -11], [0, -11], [-11, 0], [0, 0]]) ctx.drawImage(soil, wet ? 16 : 0, 0, 16, 16, p.x + dx, p.y + dy, 11, 11);
      if (flash && flash.key === key && now < flash.until) { ctx.fillStyle = "#fff8d0"; ctx.fillRect(p.x - 12, p.y - 12, 24, 1); ctx.fillRect(p.x - 12, p.y + 11, 24, 1); ctx.fillRect(p.x - 12, p.y - 12, 1, 24); ctx.fillRect(p.x + 11, p.y - 12, 1, 24); }
      if (!s && !(m && (m.kind === "plant" || m.kind === "dig"))) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(p.x - 1, p.y - 4, 2, 8); ctx.fillRect(p.x - 4, p.y - 1, 8, 2); continue; }
      // the plant at its stage (by how far it has grown): planting shows its sprout only once the seed is in; a
      // watering that moves it on a stage shows the last one first; a harvest pops it out; digging up tugs it, then it
      // comes up out of the ground
      let stage = s ? (s.wilted ? 4 : s.stage) : 0;
      let lift = 0, show = true, tug = 0;
      if (m && m.kind === "plant") { show = t1 > 1900; lift = show ? Math.max(0, Math.round((2300 - t1) / 100)) : 0; stage = 0; }
      if (m && m.kind === "water" && m.from !== undefined && t1 < 1100) stage = m.from;
      if (m && m.kind === "harvest") { lift = -Math.round(Math.min(1, t1 / 400) * 14); show = t1 < 700; stage = 3; }
      if (m && m.kind === "dig") { stage = m.stage; tug = t1 < 450 ? (Math.floor(t1 / 60) % 2 ? 1 : -1) : 0; lift = -Math.round(Math.min(1, Math.max(0, t1 - 450) / 350) * 18); show = t1 < 950; }
      const c = s ? s.crop : CROPS.find((x) => x.id === (m && m.crop));
      const row = c ? CROPS.indexOf(c) : -1;
      if (show && crops && row >= 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(p.x - 14, 0, 28, p.y + 12); ctx.clip();
        if (s && s.resting) ctx.globalAlpha = 0.6;
        ctx.drawImage(crops, stage * 16, row * 24, 16, 24, p.x - 8 + tug, p.y - 17 + lift, 16, 24);
        ctx.restore();
      }
      if (s && s.thirsty && !m) { const bx = p.x + 7, by = p.y - 14 + Math.round(Math.sin(now / 260 + p.x) * 1.5); ctx.fillStyle = "#1e2a44"; ctx.fillRect(bx - 2, by - 1, 5, 6); ctx.fillRect(bx - 1, by - 3, 3, 2); ctx.fillStyle = "#4a9ae8"; ctx.fillRect(bx - 1, by, 3, 4); ctx.fillRect(bx, by - 2, 1, 2); ctx.fillStyle = "#c8e8ff"; ctx.fillRect(bx - 1, by, 1, 1); }
      if (s && s.ripe && !m && Math.floor(now / 400 + p.x) % 3 === 0) { ctx.fillStyle = "#fff4b4"; for (const [dx, dy] of [[-8, -10], [8, -6], [0, -16]]) { ctx.fillRect(p.x + dx, p.y + dy, 1, 3); ctx.fillRect(p.x + dx - 1, p.y + dy + 1, 3, 1); } }
      // the job's moment over the plot (the card's frames: the plot sits at 8, 16 in each 32 x 32 frame, 16 across)
      if (m && fx) {
        const frame = (i) => ctx.drawImage(fx, i * 32, 0, 32, 32, p.x - 16, p.y - 20, 32, 32);
        if (m.kind === "plant") { if (t1 < 900) frame(Math.floor(t1 / 150) % 2); else if (t1 < 1300) frame(2); else if (t1 < 1500) frame(3); else if (t1 < 1900) frame(4 + (Math.floor(t1 / 120) % 2)); else if (t1 < 2500) frame(13); }
        else if (m.kind === "water") { // the splash (the owner's pick): a big drop, its crown and ripples, then sparkles (farm/splash.png: 48 x 48 frames, the soil at 16, 26)
          const sp = pic("farm/splash.png");
          if (sp && t1 < 1700) ctx.drawImage(sp, Math.min(13, Math.floor(t1 / 110)) * 48, 0, 48, 48, p.x - 24, p.y - 34, 48, 48);
        }
        else if (m.kind === "drizzle") frame(11 + (Math.floor(t1 / 200) % 2));
        else if (m.kind === "harvest") { frame(13); ctx.fillStyle = "#ffe680"; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, d = Math.min(1, t1 / 600) * 14; ctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y - 6 + Math.sin(a) * d * 0.7), 1, 1); } }
        else if (m.kind === "dig" && t1 > 400 && t1 < 1300) { // (the soil flies as it comes up: clods arcing out and falling back)
          const q = (t1 - 400) / 900;
          for (let k = 0; k < 8; k++) {
            const side = k % 2 ? 1 : -1, reach = 5 + (k % 4) * 3;
            ctx.fillStyle = k % 3 ? "#6b4426" : "#3e2414";
            ctx.fillRect(Math.round(p.x + side * reach * q), Math.round(p.y + 2 - Math.sin(q * Math.PI) * (6 + (k % 3) * 3)), k % 3 ? 1 : 2, k % 3 ? 1 : 2);
          }
        }
      }
    }
    for (let i = moments.length - 1; i >= 0; i--) if (now - moments[i].t0 > 2700) moments.splice(i, 1);
    // your creature, walking to the plot being tended, a little bob as it goes
    pet.x += (pet.tx - pet.x) * 0.08; pet.y += (pet.ty - pet.y) * 0.08;
    if (pet.frame) { const s = 40; ctx.drawImage(pet.frame, 0, 0, pet.frame.width, pet.frame.height, Math.round(pet.x - s / 2), Math.round(pet.y - s + 4 + Math.abs(Math.sin(now / 160)) * (Math.abs(pet.tx - pet.x) > 1 ? 1.5 : 0)), s, s); }
    requestAnimationFrame(draw);
  }

  // ----- a plot tapped: what it needs, asked with a word -----
  function walkTo(key) { const p = at(key); pet.tx = p.x + 12; pet.ty = p.y + 18; }
  function plotAtPoint(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * sceneW(), y = ((e.clientY - r.top) / r.height) * sceneH();
    const [w, hh] = size();
    let best = null, bd = Infinity;
    for (let r2 = 0; r2 < hh; r2++) for (let c = 0; c < w; c++) { const p = plotXY(c, r2); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = `${c},${r2}`; } }
    return bd < CELL ? best : null; // (the nearest plot, a near miss included)
  }
  canvas.addEventListener("click", (e) => {
    const key = plotAtPoint(e);
    if (key) { tapPlot(key); return; }
    if (!busy) { sfx("tick"); openFence({ changed: () => { fit(); paint(); } }); } // (the fence and the grass round it: how big the field is, and growing it)
  });

  async function tapPlot(key) {
    if (busy || rp) return; // (beside the cards, the cards tend the field)
    flash = { key, until: performance.now() + 420 };
    walkTo(key);
    const s = plantState(game, key);
    if (!s) {
      if (!seed) { toast(t("Pick a seed below first.")); return; }
      const c = CROPS.find((x) => x.id === seed);
      if (!inSeason(c) && !underGlass(game, key)) { toast(seasonTag(c)); return; } // ("Back in Autumn")
      await ask("plant", key, c, () => { const err = plant(game, key, c.id); if (err) { toast(t(err), { error: true }); return null; } return {}; });
      return;
    }
    if (s.ripe) { await ask("harvest", key, s.crop, () => harvest(game, key)); return; }
    // a growing (or resting) plant: its card, how far it has grown, and Water / Dig up, each asking a word
    sfx("tick");
    plantCard(key, { water: s.growing ? () => waterPlot(key) : null, dig: () => digPlot(key), harvest: () => ask("harvest", key, s.crop, () => harvest(game, key)) });
  }
  /** Water a plot with a word: right or wrong, a full watering (the owner's rule); the watering can's neighbours too. */
  function waterPlot(key) {
    const s = plantState(game, key);
    if (!s || !s.growing) return Promise.resolve();
    return ask("water", key, s.crop, () => { const r = water(game, key, true); if (typeof r === "string") { toast(t(r), { error: true }); return null; } return { ...r, from: s.stage, more: waterAround(game, key).length }; });
  }
  /** Dig a plot up with a word (the owner, 2026-11-28): right or wrong, it comes up and its seed goes back in the tray. */
  function digPlot(key) {
    const s = plantState(game, key);
    if (!s || s.ripe) return Promise.resolve();
    return ask("dig", key, s.crop, () => { const err = digUp(game, key); if (err) { toast(t(err), { error: true }); return null; } return { stage: s.wilted ? 4 : s.stage }; });
  }

  /** One word asked on the page's own panel, then the job done and its moment played. */
  async function ask(kind, key, crop, act) {
    busy = true;
    try {
      const vocab = await farmWords(game);
      const q = pickQuestion(game, vocab, Math.random, new Date());
      if (!alive) return;
      if (!q) { finish(kind, key, crop, true, act(true)); return; } // (no word to ask: it is done straight away)
      const panel = $(".farmp-ask");
      $(".farmp-tools").hidden = true;
      panel.hidden = false;
      const name = t(crop.name).toLowerCase();
      $(".farmp-ask-title").textContent = kind === "plant" ? t("Plant the {0}", name) : kind === "water" ? t("Water the {0}", name)
        : kind === "dig" ? t("Dig up the {0}", name) : t("Harvest the {0}", name);
      $(".farmp-ask .lbq-ask").textContent = t("Which of your words means this?");
      const prompt = $(".farmp-ask .lbq-prompt");
      prompt.textContent = q.prompt;
      setLang(prompt, detectLanguage(q.prompt));
      const box = $(".farmp-ask .lbq-options");
      box.replaceChildren();
      const verdict = $(".farmp-verdict");
      verdict.hidden = true;
      const chosen = await new Promise((resolve) => {
        q.options.forEach((text, i) => {
          const b = h(`<button type="button" class="lbq-opt"><span class="lbq-text" dir="auto" translate="no"></span></button>`);
          const el = b.querySelector(".lbq-text"); el.textContent = text; setLang(el, detectLanguage(text));
          b.onclick = () => resolve(i);
          box.append(b);
        });
        cancelAsk = () => resolve(-1);
      });
      cancelAsk = null;
      if (chosen < 0 || !alive) return;
      const buttons = [...box.children];
      const correct = chosen === q.answer;
      buttons.forEach((b) => { b.disabled = true; });
      buttons[q.answer].classList.add("right");
      if (!correct) buttons[chosen].classList.add("wrong");
      answerQuestion(game, q.uid, correct);
      sayAnswer(q, vocab); // (the right word, said, as in battles and at the pond)
      const r = act(correct);
      verdict.hidden = false;
      verdict.className = `farmp-verdict ${correct ? "ok" : "no"}`;
      verdict.textContent = kind === "plant" ? (correct ? t("Right! It's planted.") : t("Not quite, but it's planted all the same."))
        : kind === "water" ? (correct ? t("Right! It's watered.") : t("Not quite, but it's watered all the same."))
          : kind === "dig" ? (correct ? t("Right! It's dug up, and its seed is back in your tray.") : t("Not quite, but it's dug up all the same, and its seed is back in your tray."))
            : (correct ? t("Right!") : t("Not quite, but it's harvested all the same."));
      finish(kind, key, crop, correct, r);
      await new Promise((ok) => setTimeout(ok, correct ? 900 : 1700));
      if (!alive) return;
      panel.hidden = true;
      $(".farmp-tools").hidden = false;
    } finally { busy = false; }
  }
  let cancelAsk = null;

  /** The job done: its moment, its sound, the chain, the harvest's reveal. */
  function finish(kind, key, crop, correct, r) {
    if (r === null || r === undefined || typeof r === "string") { if (typeof r === "string") toast(t(r), { error: true }); paint(); return; }
    saveGame();
    const now = performance.now();
    if (kind === "plant") { moments.push({ kind: "plant", key, t0: now, crop: crop.id }); sfx("tick"); setTimeout(() => alive && sfx("plant"), 1900); }
    else if (kind === "water") { // (a full watering either way: a right answer's splash, a wrong one's drizzle and the right word)
      if (correct) { chain++; moments.push({ kind: "water", key, t0: now, from: r.from }); sfx(`chain${Math.min(chain, CHAIN_MAX)}`); }
      else { chain = 0; moments.push({ kind: "drizzle", key, t0: now }); sfx("surprise"); }
    } else if (kind === "dig") { moments.push({ kind: "dig", key, t0: now, crop: crop.id, stage: r.stage }); sfx("tick"); setTimeout(() => alive && sfx("plant"), 450); }
    else if (kind === "harvest") {
      moments.push({ kind: "harvest", key, t0: now, crop: crop.id });
      const shown = reveal($(".farmp-field"), { rolled: true, tier: r.tier, reward: null }, { art: h(cropIcon(crop, 32)), title: t(crop.name), text: harvestLine(r), top: 10 });
      shown.then(() => {}).catch(() => {});
    }
    paint();
  }

  // ----- review while you play (prototype "review_play": game/reviewplay.js) -----
  // With cards waiting, the vocab reviewer comes up over the field (beside it on a computer). Turning a card sends your
  // creature to the next job; each answer does it, the same whichever answer: a ripe crop harvested first, then a
  // thirsty one watered, then an empty plot planted with the seed picked in the tray.
  async function startReview() {
    if (!feature("review_play") || rp || !alive || busy) return;
    $(".farmp-review").hidden = true;
    const r = await dockReview({ wrap, foot: $(".farmp-foot"), kind: "farm", turn: () => reviewWalk(), act: (a, luck) => reviewTend(luck),
      ended: () => { rp = null; if (!alive) return; $(".farmp-tools").hidden = false; fit(); paint(); offerReview(); } });
    if (!r) { offerReview(); return; }
    if (!alive || busy) { r.close(); return; } // (a question of its own began meanwhile)
    rp = r;
    $(".farmp-tools").hidden = true;
    fit();
  }
  /** Without the cards, while some are waiting: the button that brings them back. */
  async function offerReview() {
    const b = $(".farmp-review");
    if (!feature("review_play") || rp || !alive) { b.hidden = true; return; }
    const n = await cardsWaiting();
    if (!alive || rp) return;
    b.hidden = !n;
    b.textContent = t("Review your cards here ({0})", n);
  }
  $(".farmp-review").onclick = () => startReview();
  /** The next job a card does: a ripe crop (with room in the barn), else one not watered today, else an empty plot the
   * picked seed can go in, else a growing one nearest ripe (no daily cap); the nearest your creature. Null when
   * nothing is growing and nothing can be planted. */
  function nextJob() {
    const near = (list) => list.sort((a, b) => Math.hypot(at(a).x - pet.x, at(a).y - pet.y) - Math.hypot(at(b).x - pet.x, at(b).y - pet.y))[0];
    const all = keys().map((k) => [k, plantState(game, k)]);
    const ripe = all.filter(([, s]) => s && s.ripe).map(([k]) => k);
    if (ripe.length && barnCount(game) < barnCap(game)) return { kind: "harvest", key: near(ripe) };
    const dry = all.filter(([, s]) => s && s.thirsty).map(([k]) => k);
    if (dry.length) return { kind: "water", key: near(dry) };
    const c = seed ? CROPS.find((x) => x.id === seed) : null;
    const empty = c && farmOf(game).seeds[c.id] > 0 ? all.filter(([k, s]) => !s && (inSeason(c) || underGlass(game, k))).map(([k]) => k) : [];
    if (empty.length) return { kind: "plant", key: near(empty), crop: c };
    const next = waterNext();
    return next ? { kind: "water", key: next } : null;
  }
  /** A card turned: your creature walks to the next job. */
  function reviewWalk() {
    const job = alive ? nextJob() : null;
    if (!job) return "";
    walkTo(job.key);
    flash = { key: job.key, until: performance.now() + 420 };
    const name = t((job.crop || plantState(game, job.key).crop).name).toLowerCase();
    return job.kind === "harvest" ? t("Off to harvest the {0}…", name) : job.kind === "water" ? t("Off to water the {0}…", name) : t("Off to plant the {0}…", name);
  }
  /** A card answered: the next job done, whatever the answer (the owner: the same in the game for "Remembered" and
   * "Not remembered", so a watering is a full one either way); a harvest's rarity takes `luck` (the memory calls meter,
   * a spot check passed). */
  async function reviewTend(luck) {
    if (!alive) return null;
    const job = nextJob();
    if (!job) { paint(); return { text: t("Everything is tended for now. Your cards still count."), lucky: false }; }
    walkTo(job.key);
    const crop = job.crop || plantState(game, job.key).crop;
    const name = t(crop.name).toLowerCase();
    if (job.kind === "harvest") {
      const r = harvest(game, job.key, Math.random, new Date(), luck);
      finish("harvest", job.key, crop, true, r);
      return typeof r === "string" ? null : { text: t("Harvested the {0}", name), lucky: true };
    }
    if (job.kind === "water") {
      const from = plantState(game, job.key).stage;
      const w = water(game, job.key, true);
      finish("water", job.key, crop, true, typeof w === "string" ? w : { ...w, from, more: waterAround(game, job.key).length });
      return typeof w === "string" ? null : { text: t("Watered the {0}", name), lucky: false };
    }
    const err = plant(game, job.key, crop.id);
    finish("plant", job.key, crop, true, err || {});
    return err ? null : { text: t("Planted the {0}", name), lucky: false };
  }

  // ----- the buttons, the keyboard, closing -----
  $(".farmp-next").onclick = () => { // the nearest plot not watered today; else the growing one nearest ripe (no daily cap)
    if (busy || rp) return;
    const key = waterNext();
    if (!key) { toast(t("Nothing is growing right now.")); return; }
    flash = { key, until: performance.now() + 420 };
    walkTo(key);
    waterPlot(key);
  };
  function waterNext() {
    const near = (list) => list.sort((a, b) => Math.hypot(at(a).x - pet.x, at(a).y - pet.y) - Math.hypot(at(b).x - pet.x, at(b).y - pet.y))[0];
    const all = keys().map((k) => [k, plantState(game, k)]).filter(([, s]) => s && s.growing);
    const dry = all.filter(([, s]) => s.thirsty).map(([k]) => k);
    if (dry.length) return near(dry);
    return all.length ? all.sort((a, b) => b[1].pct - a[1].pct)[0][0] : null;
  }
  $(".farmp-stand").onclick = () => openSeedStand({ changed: () => paint() });
  $(".farmp-barn").onclick = () => openBarn({ changed: () => paint() });
  $(".farmp-close").onclick = () => close();
  const onKey = (e) => {
    if (document.querySelectorAll(".modal-back").length) return; // (a box over the page answers first)
    if (e.key === "Escape") { e.preventDefault(); if (cancelAsk) cancelAsk(); else close(); }
    if (!rp && !$(".farmp-ask").hidden && /^[1-4]$/.test(e.key)) { const b = $(".farmp-ask .lbq-options").children[Number(e.key) - 1]; if (b && !b.disabled) b.click(); }
  };
  document.addEventListener("keydown", onKey);
  const onResize = () => fit();
  window.addEventListener("resize", onResize);
  function close() {
    if (!alive) return;
    alive = false;
    if (rp) { const r = rp; rp = null; r.close(); }
    if (cancelAsk) cancelAsk();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    wrap.remove();
    changed();
  }

  fit();
  const [w0, h0] = size();
  const start = plotXY(Math.floor(w0 / 2), h0 - 1);
  pet = { ...pet, x: start.x + 12, y: start.y + 22, tx: start.x + 12, ty: start.y + 22 };
  paint();
  requestAnimationFrame(draw);
  toStart(); // (the field's right edge first, where it starts by the gate)
  startReview(); // (with cards waiting, the reviewer comes up over the field: review_play)
  return close;
}

function dropIcon() {
  return `<svg class="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5C8 1.5 3 7.5 3 10.5a5 5 0 0 0 10 0C13 7.5 8 1.5 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}
