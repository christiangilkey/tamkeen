// The creature's home card at the bottom of Home: a small living scene, and under it a thin level bar,
// two currencies and the goal streak, and six big tiles: Battle, Creatures, Shop, Garden, then Fishing and Words (which
// words every game asks) side by side, each with a short line under its word.
//
// It is learnt by playing rather than by reading (the owner, 2026-11-06): the day's goal is a ring on the
// ground around the creature that fills as you study, its hearts float over its head, buildings glow when
// their glow is ready and are gathered with a tap, a friend's gift waits in the scene to be opened, and
// what you earn flies into the counter that keeps it (fly.js). A red dot on a tile says something waits
// there (homecard.js). The long explanations (info.js) stay a hold, or a "?" in each sheet, away.

import { api, h, toast } from "../app.js";
import { detectLanguage, setLang, studyLanguage } from "../languages.js";
import { FOLK, knownKeys, lineFor, lineWords, poseOf, readLine } from "./muffles.js";
import { seenOf } from "../lexicon/seen.js";
import { COUNTER_SPOT, HALL_DOOR_SPOT, HALL_WALK, hallBlocked, hallMap, tapHall } from "./hall.js";
import { CROPS, beesToday, buildingsOn, cropById as cropOf, decorById, decorOn, farmJobs, farmOf, fieldSize, harvest as harvestPlant, level as upLevel, placeBuilding, placeDecor, plantState, seasonOf, spots as fieldSpots, sprinklerOn, underGlass } from "./farm.js";
import { openBuilding } from "./garden.js";
import { structureArt } from "./sections.js";
import { BARN, FARM_GATE, FARM_IN, FARM_W, FARM_WALK, SEED_STAND, UPGRADE_AT, farmBlocked, farmCamera, farmMap, plotAt, spotXY, sprinklerAt, tapFarm } from "./farmmap.js";
import { askToWater, decorCard, harvestLine, openBarn, openCookbook, openFence, openFruitStall, openOrder, openSeedStand, openShrine, pickSeed, plantCard, upgradeCard, windmillCard } from "./farm-ui.js";
import { buffsOf, ordersToday, wokenKeys } from "./farmuses.js";
import { shrineTier } from "./idle.js";
import { states as reviewStates } from "../review/deck.js";
import { openModal } from "../components/modal.js";
import { icon as lineIcon } from "../icons.js";
import * as social from "../social.js";
import { EMOTES, FX_FRAMES, GROWN, HABITAT, SHADOW, STAGES, TYPES, beastById, itemById } from "./data.js";
import { homeOf, isSmall, putAway, setSpot, spotOf } from "./home.js";
import { automated, collect, garden, hearts, isHungry, tick as gardenTick } from "./idle.js";
import { feedBest, hungryButton, wantedFood } from "./hunger-ui.js";
import { describe, formOf, isGrown, stageOf } from "./genome.js";
import { t, uiLanguage } from "../i18n.js";
import { badgeToast, openBattleMenu, openWordChoice, wordChoiceLine } from "./battle-ui.js";
import { publishNow } from "./friends-game.js";
import { FULLY_GROWN_COINS, GOALS, checkBadges, dayKey, levelOf, receiveGift } from "./rules.js";
import { FRAME, animAt, beastHeight, composeCreature, drawLiving, drawSheet, drawingOf, dressEgg, icon, loadImage } from "./render.js";
import { checkAnki, getGame, onGame, rollNumber, saveGame, sfx } from "./game.js";
import { openShop } from "./shop.js";
import { currencyTaps, openCurrency, openEarned, openEvolution } from "./info.js";
import { cleanName } from "./remote.js";
import { KINDS, SHOP_SEEN_KEY, collectables, gains, goalRing, ringPixels, tileDots, wallet } from "./homecard.js";
import { fly } from "./fly.js";
import { fishWaiting, openPond } from "./fishing-ui.js";
import { fishingOf } from "./fishing.js";
import { aquariumView, drawTinyFish } from "./aquarium.js";
import { TANK_SIZE } from "./fishdata.js";
import { TIERS } from "./loot.js";
import { feature } from "../prototype.js";
import { ROOM, blockedCells, cellKey, clampToFloor, depthScale, findPath, isIndoor, roomLayout, savedView, saveView, tapIn } from "./room.js";
import { SHRINE } from "./yard.js";
import { COTTAGE, PIER_CHAIR, PIER_RIPPLES, YARD_DOOR_SPOT, YARD_EGG, YARD_WALK, cameraFor, decorSpot, plotSpot, stationAt, stationById, tankSpot, tapYard, thingSpot, yardBlocked, yardMap } from "./yard.js";
import { DECALS, PROPS, ROOFS, ROOF_EXTRAS, SHEETS, TILE, drawCorners, roofRows } from "./battlemap.js";

const [W, H] = HABITAT.size;
const STAGE_LABEL = { egg: "Egg", hatchling: "Hatchling", juvenile: "Juvenile" };
const RING = { rx: 34, ry: 10, dy: 1 };   // the goal ring on the ground, round the creature's feet (scene pixels)
const RING_FILL = ["#5cf2b0", "#2fbf86"]; // outer and inner pixels as it fills (one colour per thing: the goal is mint)
const RING_DONE = ["#c9ffe6", "#5cf2b0"];
const RING_TRACK = ["rgba(6, 10, 22, .62)", "rgba(6, 10, 22, .38)"];
const HOLD_MS = 550;                      // a press this long opens the explanation instead
const OVERLAYS = ".game-sheet-wrap, .live-wrap, .modal-back, .battle-wrap";
const SEEN_KEY = "tamkeen.game.homeSeen";  // what the card showed last time, on this device (what came in meanwhile flies in)

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window: no memory, that's all */ } },
};

/** A button that does one thing when tapped and another (its explanation) when held or right-clicked. */
function holdable(btn, onTap, onHold) {
  let timer = 0;
  let held = false;
  btn.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    held = false;
    clearTimeout(timer);
    timer = setTimeout(() => { held = true; onHold(); }, HOLD_MS);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, () => clearTimeout(timer));
  btn.addEventListener("contextmenu", (e) => { e.preventDefault(); clearTimeout(timer); if (!held) { held = true; onHold(); } });
  btn.addEventListener("click", (e) => { if (held) { held = false; e.preventDefault(); return; } onTap(); });
}

const tile = (id, pic, word) => `<button type="button" class="hud-tile" id="g-${id}">${icon(pic, 32)}<span class="tile-word">${word}</span>`
  + `<span class="tile-dot" hidden></span><span class="tile-plus" hidden></span></button>`;

/** A tile the same size as those, with a short line under its word (how many fish wait; which words the games ask). */
const subTile = (id, pic, word) => `<button type="button" class="hud-tile has-sub" id="g-${id}">${icon(pic, 32)}<span class="tile-text">`
  + `<span class="tile-word">${word}</span><span class="tile-sub" hidden></span></span></button>`;

/** How much faster than at first the creature walks, and its walk plays with it so its feet don't skate (the owner:
 * "the creature moves too slow through the world"). */
export const WALK_PACE = 2;

/** Build the habitat section. Returns {el, dispose}. */
export function habitat() {
  const game = getGame();
  // With the room (prototype "habitat_room") the scene is drawn at 3 screen pixels per pixel, so the creature can be drawn
  // smaller outside and still crisp: 2 per pixel there, two thirds of its size (the owner: "our creatures should be a bit
  // smaller compared to the over world, it seems like they are huge compared to houses"). Without it, as before.
  const RES = feature("habitat_room") ? 3 : 1;
  const el = h(`<section class="habitat card">
    <div class="habitat-scene"><canvas width="${W * RES}" height="${H * RES}" aria-label="Your creature's habitat" role="button" tabindex="0"></canvas>
      <button type="button" class="habitat-name" title="Its name and how it grows"></button>
      <span class="habitat-about" hidden></span>
      <div class="pet-word" hidden><b></b><span></span></div><div class="pet-word muffle-say" hidden><b></b><span></span></div><span class="hab-hungry" hidden></span></div>
    <div class="habitat-hud">
      <div class="hud-top"><button type="button" class="hud-lv" id="g-lv" title="Your level: tap to see how XP works"><span class="hud-lv-n">Lv <b id="g-level"></b></span>
        <span class="hud-bar thin"><i id="g-xpbar"></i></span></button>
        <button type="button" class="goal-ring" id="g-goal" title="Today's goal: tap to change it"></button></div>
      <div class="hud-wallet">
        <button type="button" class="hud-count cur-coin" id="g-coins" title="Coins: tap to see how to get them, hold to learn more">${icon("coin")}<b></b></button>
        <button type="button" class="hud-count cur-gem" id="g-gems" title="Gems: tap to see how to get them, hold to learn more">${icon("gem")}<b></b></button>
        <button type="button" class="hud-count cur-streak" id="g-streak" title="Goal streak: days in a row you reached your daily goal">
          <span class="streak-pic">${icon("streak")}<span class="freeze-badge" hidden>${icon("freeze_badge", 9)}</span></span><b></b></button>
      </div>
      <div class="hud-actions hud-tiles">
        ${tile("battle", "battle", "Battle")}${tile("creatures", "nav_roster", "Creatures")}
        ${tile("shop", "nav_shop", "Shop")}${tile("garden", "structure/word_sprout_2", "Garden")}
        ${subTile("fishing", "fishing", "Fishing")}${subTile("words", "words", "Words")}
        <button type="button" class="hud-aq" id="g-aquarium" hidden>
          <span class="hud-aq-head"><span class="hud-aq-word">Aquarium</span><span class="hud-aq-n" translate="no"></span></span>
          <span class="hud-aq-tank"></span>
          <span class="hud-aq-empty" hidden>Keep your best fish here. Your friends can see your aquarium.</span></button>
      </div>
    </div>
  </section>`);
  const $ = (q) => el.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.scale(RES, RES); // (scene pixels from here on)
  /** How big the creature is drawn: two thirds outside (2 screen pixels per pixel against the world's 3), else 1. */
  const creatureScale = () => (RES === 3 && outside() ? 2 / 3 : 1);

  const isEgg = () => stageOf(game.creature.growth).id === "egg";
  let online = { gifts: [], battles: 0 };  // from the online service (friends' gifts and challenges), when signed in
  let things = [];                          // what can be tapped in the scene (homecard.collectables)

  // ----- the counters: what they show trails what the game holds until the reward has flown in -----
  const now0 = wallet(game);
  const last = store.get(SEEN_KEY);
  const shown = { ...now0 };
  // Earned somewhere else since the card was last on screen: it flies in a moment after the card opens.
  if (last && typeof last === "object") for (const k of KINDS) if (Number.isFinite(last[k]) && last[k] < now0[k]) shown[k] = Math.max(0, Math.floor(last[k]));
  const inFlight = new Set();
  let pending = false;
  let live = false; // nothing flies before the card is on screen (a moment after it opens)
  // Where each lands (and bounces): the level's "Lv", the two counters, the Garden tile's picture.
  const TARGET = { xp: "#g-lv .hud-lv-n", coins: "#g-coins", gems: "#g-gems", glow: "#g-garden .px-icon" };
  const PIC = { xp: "xp", coins: "coin", gems: "gem", glow: "glow" };

  function paintCounters(animate = false) {
    const lv = levelOf(shown.xp);
    $("#g-level").textContent = lv.level;
    $("#g-xpbar").style.width = `${Math.round((lv.into / lv.need) * 100)}%`;
    for (const [k, sel] of [["coins", "#g-coins b"], ["gems", "#g-gems b"]]) {
      const b = $(sel);
      if (animate) rollNumber(b, shown[k], (n) => n.toLocaleString());
      else { b.dataset.value = String(shown[k]); b.textContent = shown[k].toLocaleString(); }
    }
  }
  const toScreen = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + ((x - cam()) / W) * r.width, y: r.top + (y / H) * r.height }; };
  // Outside, the window is a camera on a field longer than it (yard.js: the yard and the village), following the creature.
  let camX = 0, camReady = false;
  const cam = () => (outside() && !inHall() ? Math.round(camX) : 0); // (the hall is one window wide)
  const creaturePoint = () => (isEgg() ? toScreen(W / 2, feetNow() - 18) : toScreen(pet.x, feetNow() - beastHeight(describe(game.creature)) / 2));
  /** "+12" rising from a tile that has no number of its own (glow lands on the Garden tile). */
  function plusOn(target, text) {
    const p = target && target.querySelector(".tile-plus");
    if (!p) return;
    p.textContent = text;
    p.hidden = false;
    p.classList.remove("show");
    void p.offsetWidth;
    p.classList.add("show");
    clearTimeout(p._t);
    p._t = setTimeout(() => { p.hidden = true; }, 1300);
  }
  /** Bring the counters up to what the game holds: what went up flies in from `from` (default: the creature). */
  function settle(from = null) {
    if (!live) { paintCounters(); return; }
    if (document.querySelector(OVERLAYS)) { pending = true; return; } // shown when the sheet or battle closes
    pending = false;
    const now = wallet(game);
    for (const k of KINDS) if (now[k] < shown[k]) shown[k] = now[k]; // spent: at once
    for (const { kind, amount } of gains(shown, now)) {
      if (inFlight.has(kind)) continue; // the one in the air takes the newest number when it lands
      inFlight.add(kind);
      const target = $(TARGET[kind]);
      fly(PIC[kind], from || creaturePoint(), target, {
        count: amount >= 100 ? 3 : amount >= 10 ? 2 : 1,
        arrive: () => {
          inFlight.delete(kind);
          const before = shown[kind];
          shown[kind] = Math.max(shown[kind], wallet(game)[kind]);
          paintCounters(true);
          if (kind === "glow") plusOn($("#g-garden"), `+${(shown.glow - before).toLocaleString()}`);
          store.set(SEEN_KEY, { ...shown });
        },
      });
    }
    paintCounters();
    store.set(SEEN_KEY, { ...shown, ...now }); // (what will be showing once the flights land)
  }

  // ----- everything else on the card -----
  function infoLine() {
    const look = describe(game.creature);
    const stage = formOf(game.creature);
    const grown = isGrown(game.creature);
    const next = game.creature.show ? null : STAGES[STAGES.indexOf(stageOf(game.creature.growth)) + 1];
    // After juvenile there is one more step, fully grown (it stays a juvenile: no adult forms).
    const to = next ? next.from : GROWN;
    const pct = Math.min(100, Math.round(((game.creature.growth - stage.from) / (to - stage.from)) * 100));
    // Each piece goes through t() so the line reads naturally in the user's language.
    const kind = t(TYPES[look.type].name);
    const what = stage.id === "egg" ? t("{0} egg", kind) : t("{0} {1}", kind, t(beastById(look.beast).name).toLocaleLowerCase(uiLanguage()));
    return `${what} · ${t(STAGE_LABEL[stage.id])}`
      + (next ? ` ${t("· {0}% to {1}", pct, t(STAGE_LABEL[next.id].toLowerCase()))}`
        : game.creature.show ? "" : grown ? ` ${t("· fully grown")}` : ` ${t("· {0}% to fully grown", pct)}`);
  }
  function paintHud() {
    // A creature that hatched in the incubator and has been brought out is no longer waiting in the scene.
    if (game.creature.hatchedAway) { delete game.creature.hatchedAway; saveGame(); }
    const ring = goalRing(game);
    const label = $("#g-goal");
    label.classList.toggle("done", ring.done);
    if (ring.done) { label.innerHTML = lineIcon("check", 12); label.append(` ${t("{0} min", ring.goal)}`); }
    else label.textContent = t("{0} / {1} min", ring.mins, ring.goal);
    label.setAttribute("aria-label", ring.done ? t("Daily goal reached: {0} minutes", ring.goal) : t("Daily goal: {0} of {1} minutes", ring.mins, ring.goal));
    // Hungry (prototype "hunger"): a tag in the scene that says so and feeds it; the bubble over its head is drawn.
    const hungryNow = isHungry(game.creature);
    const hungryTag = $(".hab-hungry");
    if (hungryTag.hidden === hungryNow || hungryTag.dataset.seed !== String(game.creature.seed)) {
      hungryTag.hidden = !hungryNow;
      hungryTag.dataset.seed = String(game.creature.seed);
      hungryTag.replaceChildren(...(hungryNow ? [hungryButton(game, game.creature, () => paintHud(), {})] : []));
    }
    const stage = formOf(game.creature);
    const name = $(".habitat-name");
    name.hidden = roomOn() && !inRoom(); // (the owner: only in the cottage, not outside)
    name.textContent = game.creature.name || (stage.id === "egg" ? "Your egg" : "Name me ");
    if (!game.creature.name && stage.id !== "egg") name.append(h(icon("edit")));
    const streak = $("#g-streak");
    streak.querySelector("b").textContent = game.streak.toLocaleString();
    streak.classList.toggle("cold", game.streak === 0);
    const freezes = game.items.freeze || 0;
    streak.querySelector(".freeze-badge").hidden = freezes < 1;
    const s = (n) => (n === 1 ? "" : "s"); // (an English plural; other languages leave it out)
    streak.setAttribute("aria-label", freezes ? t("Goal streak: {0} day{1}, {2} streak freeze{3}", game.streak, s(game.streak), freezes, s(freezes))
      : t("Goal streak: {0} day{1}", game.streak, s(game.streak)));
    things = collectables(game, { gifts: online.gifts });
    const dots = tileDots(game, { online: { gifts: online.gifts.length, battles: online.battles }, seen: store.get(SHOP_SEEN_KEY) });
    for (const [id, on] of Object.entries(dots)) $(`#g-${id} .tile-dot`).hidden = !on;
    paintAquarium();
    settle();
  }
  // The garden keeps time: glow builds up, and what studying earned here is paid out.
  function gardenBeat() {
    const r = gardenTick(game);
    // Once collecting is automated, glow trickles in from the buildings by itself, a little every few
    // seconds: that is counted quietly (a glow icon flying in every minute would be noise). A burst, such
    // as the daily goal's, still flies.
    if (!r.burst && automated(game)) shown.glow = Math.max(shown.glow, wallet(game).glow);
    if (r.bloom) toast("Full bloom: every plot holds a fully grown building.");
    if (r.burst || r.gems) saveGame();
    if (farmOn()) { // (prototype "farm": the buildings' farm jobs)
      const j = farmJobs(game);
      if (j.seeds.length) toast(t("The Word Sprout dropped seeds: {0}", j.seeds.map((id) => t(cropOf(id).name)).join(", ")));
      if (j.watered.length) toast(j.watered.length === 1 ? t("The Echo Shell watered a plant.") : t("The Echo Shell watered {0} plants.", j.watered.length));
      if (j.honey) toast(t("The bees made honey."));
      if (j.seeds.length || j.watered.length || j.honey) saveGame();
    }
    paintHud();
  }
  const go = (tab) => openShop(tab, () => paintHud());
  let vocab = null; // the owner's saved words, once they have loaded
  const loadVocab = () => api("/vocab").then((words) => { vocab = words; return words; });
  const vocabReady = loadVocab().then((words) => { checkBadges(game, { words: words.length }); gardenBeat(); }).catch(() => {});

  // The level bar explains XP; coins and gems say in brief how to get them and what they're for (with a button to
  // where they're spent), and explain themselves in full when held. Any other counter marked data-cur does the same.
  $("#g-lv").onclick = () => openEarned("xp", game, go);
  holdable($("#g-coins"), () => openCurrency("coins", game, go), () => openEarned("coin", game, go));
  holdable($("#g-gems"), () => openCurrency("gems", game, go), () => openEarned("gem", game, go));
  currencyTaps(getGame, go);
  holdable($("#g-streak"), () => openEarned("streak", game, go), () => openEarned("freeze", game, go));
  // Each big tile also sends the creature to its place (prototype "habitat_room", the owner: "each of the buttons ...
  // should automatically teleport the creature to specific spots in the viewer screen ... corresponding to what part
  // they are"): Shop the tailor's stall, Garden the fruit stall, Fishing the pier, Battle the hall (the gyms),
  // Creatures home to its room. The page opens as before; closed, there it stands.
  $("#g-shop").onclick = () => { teleportTo("cloth"); go("shop"); };
  $("#g-creatures").onclick = () => { teleportTo("room"); go("creatures"); };
  $("#g-garden").onclick = () => { teleportTo(feature("farm") ? "farm" : "fruit"); go("garden"); }; // (the farm, with its buildings: prototype "farm")
  $("#g-battle").onclick = () => teleportTo("hall") || openBattleMenu({ changed: () => paintHud(), waiting: online.gifts.length + online.battles });
  // The aquarium, under the Fishing tile once a fish has been caught: the fish kept in it, swimming. A tap opens the
  // Basket, where fish go in and out. It is drawn again only when what is in the tank has changed.
  let tankShown = null;
  function paintAquarium() {
    const F = fishingOf(game);
    const box = $("#g-aquarium");
    box.hidden = !(F.caught > 0 || F.tank.length);
    if (box.hidden) return;
    const key = JSON.stringify(F.tank);
    if (key === tankShown) return;
    tankShown = key;
    box.querySelector(".hud-aq-n").textContent = `${F.tank.length} / ${TANK_SIZE}`;
    box.querySelector(".hud-aq-tank").replaceChildren(aquariumView(F.tank, { w: 160, h: 44, scale: 2 }));
    box.querySelector(".hud-aq-empty").hidden = F.tank.length > 0;
  }
  $("#g-aquarium").onclick = () => go("basket");
  // Fishing: straight to the pond. Its tile says how many fish are waiting (the words due for review).
  function paintFishing() {
    fishWaiting(game).then((n) => {
      if (disposed) return;
      const sub = $("#g-fishing .tile-sub");
      sub.hidden = !n;
      sub.textContent = n === 1 ? t("1 fish waiting") : t("{0} fish waiting", n > 99 ? "99+" : String(n));
    }).catch(() => {});
  }
  $("#g-fishing").onclick = () => teleportTo("pier") || openPond({ changed: () => paintHud(), closed: () => paintFishing(), sheet: go });
  setTimeout(paintFishing, 600);
  // Words: the one choice of words for battles and fishing (the newest, all, the ones due, or folders). Its tile says
  // what is chosen now; a change there changes how many fish are waiting too.
  function paintWords() {
    wordChoiceLine(game).then((line) => {
      if (disposed || !line) return;
      const sub = $("#g-words .tile-sub");
      sub.textContent = line.text;
      if (line.own) sub.setAttribute("translate", "no"); else sub.removeAttribute("translate");
      sub.hidden = !line.text;
    }).catch(() => {});
  }
  $("#g-words").onclick = () => openWordChoice({ changed: () => { paintWords(); paintFishing(); } });
  setTimeout(paintWords, 700);
  $("#g-goal").onclick = () => goalBox();
  $(".habitat-name").onclick = () => nameBox();

  // (no arrows to switch habitats any more: the owner, "serve no purpose". An old save's `scene` is kept, unused,
  // for the side-on scenes drawn without the room.)

  /** The day's goal: three sizes, the one in use lit. */
  function goalBox() {
    const m = openModal({ title: "Daily goal" });
    const row = h(`<div class="goal-pick"></div>`);
    for (const g of GOALS) {
      const b = h(`<button type="button" class="goal-opt${g === game.goal ? " on" : ""}"></button>`);
      b.textContent = t("{0} min", g);
      b.onclick = () => { game.goal = g; saveGame(); paintHud(); m.close(); };
      row.append(b);
    }
    m.body.append(row);
    (row.querySelector(".on") || row.firstElementChild).focus();
  }
  /** The name tag: rename it, see what it is, or open how it grows. */
  function nameBox() {
    const egg = isEgg();
    const m = openModal({ title: egg ? "Your egg" : "Your creature" });
    const form = h(`<form class="stack name-box">
      <input type="text" maxlength="20" autocomplete="off" spellcheck="false" placeholder="Name" aria-label="Name">
      <p class="small muted name-about"></p>
      <div class="confirm-buttons"><button type="button" class="ghost">How it grows</button><button type="submit" class="primary">Save</button></div></form>`);
    const input = form.querySelector("input");
    input.value = game.creature.name || "";
    form.querySelector(".name-about").textContent = infoLine();
    form.onsubmit = (e) => {
      e.preventDefault();
      game.creature.name = cleanName(input.value, 20); // (friends see it: no control characters)
      saveGame();
      paintHud();
      m.close();
    };
    form.querySelector(".ghost").onclick = () => { m.close(); openEvolution(game, go); };
    m.body.append(form);
    input.focus();
    input.select();
  }

  setTimeout(() => publishNow(), 4000); // keep what friends see of me fresh (only when connected)
  setTimeout(() => checkAnki(), 1500);  // count Anki reviews reported while this screen was closed
  // Friends' gifts and challenges, when signed in: a gift waits in the scene, both light the Battle tile.
  async function checkOnline() {
    try {
      if (!(await social.currentUser())) return;
      const [gifts, inbox] = await Promise.all([social.giftInbox(), social.battleInbox()]);
      if (disposed) return;
      // (from the online service: only the id is passed back, and the sender's name is shown as text)
      online = {
        gifts: (Array.isArray(gifts) ? gifts : []).filter((g) => g && (typeof g.id === "string" || Number.isFinite(g.id))).slice(0, 20)
          .map((g) => ({ id: g.id, kind: g.kind === "egg" ? "egg" : "item", from: cleanName(g.from, 40) || "A friend" })),
        battles: Array.isArray(inbox) ? Math.min(99, inbox.length) : 0,
      };
      paintHud();
    } catch { /* offline, or the online service isn't set up for the game: nothing waits */ }
  }
  setTimeout(checkOnline, 4500);
  const onlineTimer = setInterval(checkOnline, 5 * 60000);

  // ----- the scene -----
  const art = {};
  const files = { heart: "fx/heart.png", zzz: "fx/zzz.png", star: "fx/star.png" };
  for (const id of EMOTES) files[`emote_${id}`] = `fx/emote_${id}.png`;
  files.rain = "habitat/rain.png";
  for (const id of Object.keys(FX_FRAMES)) files[id] = `fx/${id}.png`;
  for (const size of Object.keys(SHADOW)) files[`shadow_${size}`] = `fx/shadow_${size}.png`;
  files.glowIcon = "icon/glow.png";
  files.gift = "icon/gift.png";
  files.tank = "fish/tank.png";
  files.room = "room/room.png"; files.door = "room/door.png"; files.doorOpen = "room/door_open.png"; files.fire = "room/fire.png";
  // the room's own sky, seen through its window and doorway: a plain sun and moon and white clouds (the owner: "normal
  // clouds and sun", not the old neon ones, which the other scenes keep)
  for (const k of ["sun", "moon", "cloud_1", "cloud_2"]) files[`room_${k}`] = `room/sky_${k}.png`;
  files.mailbox = "room/mailbox.png"; files.mailboxFlag = "room/mailbox_flag.png"; // (slice 4) // (prototype "habitat_room")
  for (const [k, f] of Object.entries(files)) loadImage(f).then((img) => { art[k] = img; });
  const eggArt = {};  // egg picture by element (a spare egg in the incubator)

  const pet = { x: W / 2, dir: 1, target: W / 2, wait: 2, mood: "", moodT: 0, hop: 0, emote: "", emoteT: 0, idleT: 6,
                walkMs: 0, fly: false, air: 0, stand: 0, // (walkMs: how far its walk or wing beat has got; fly: this trip is flown; air: 0 on the ground .. 1 up; stand: 0 lying .. 1 up, for one that gets up to walk)
                y: 120, path: [], after: null, moving: false, leaving: 0 }; // (the room, prototype "habitat_room": its feet's depth, the way it is walking, what it does on arriving: "out" or "in")
  const FLY_UP = 9; // about how high its fly frames hold it (anim.py `lift`): it rises to that and sinks back from it
  // A creature that rests lying down (the forest stag) gets up before it walks and lies back down when it stops: its
  // `rise` frames, forwards then backwards. How long that takes (0: it has none).
  const riseMs = (look) => { const r = drawingOf(look).anims.rise; return r ? r.ms.reduce((s, v) => s + v, 0) : 0; };
  const emote = (id, secs = 1.8) => { if (id) { pet.emote = id; pet.emoteT = secs; } };
  // It rains on about one day in four (the same days for everyone, so it is weather and not a glitch).
  const rainy = () => { const d = new Date(); return (d.getDate() * 7 + d.getMonth()) % 4 === 0; };
  const decorArt = {}; // decoration id -> image
  // The room (prototype "habitat_room", room.js): the habitat window is the creature's room, and its door leads out to
  // the outdoor scene (the village to come). `view` is which side of the door it is on (this device only).
  const roomOn = () => feature("habitat_room");
  let view = savedView();
  const inRoom = () => roomOn() && view === "room";
  // Outside its door, with the room: the yard seen from above like the battles' arenas (yard.js; the owner, 2026-11-25:
  // "I want outside the house to look like the over head battles where they walk around a playing field").
  const outside = () => roomOn() && view !== "room";
  // Outside is the yard and the village, or (hall.js) inside the championship hall, drawn the same way from above.
  const inHall = () => roomOn() && view === "hall";
  // (prototype "farm", farm.js and farmmap.js: the fenced farm west of the cottage, through the gate at the yard's edge)
  const farmOn = () => roomOn() && feature("farm");
  const inFarm = () => farmOn() && view === "farm";
  if (view === "farm" && !farmOn()) view = "yard";
  const inYard = () => roomOn() && view === "yard";
  const walkArea = () => (inRoom() ? ROOM.walk : inHall() ? HALL_WALK : inFarm() ? FARM_WALK : YARD_WALK);
  /** The map of the place outside it is in: the yard and village, the hall's inside, or the farm. */
  const sceneMap = () => (inHall() ? hallMap() : inFarm() ? farmMap(...fieldSize(game)) : yardMap());
  /** The yard's gate to the farm (at its left edge, on the path): where it stands. */
  const FARM_DOOR = { x: 18, y: 94 };
  /** How near the yard's left edge (and the farm's right edge) a tap carries on into the other (the owner: "if the
   * creature goes more to the left it should just allow them to transition into it, not only by clicking the gate"). */
  const FARM_EDGE = 30;
  const outdoorDecor = () => game.decor.filter((x) => !isIndoor(x.id));
  /** What stands on the yard's field and is walked round: the outdoor decorations and the garden's open plots. */
  const yardStanding = () => [
    ...yardDecor(),
    ...(inYard() && shrineTier(game) ? [{ id: "shrine", x: SHRINE.x, y: SHRINE.y }] : []),
  ];
  /** The outdoor decorations on the yard's field, each at its spot (not one being carried). */
  function yardDecor() {
    return outdoorDecor().map((d, k) => ({ id: d.id, ...decorSpot(d.x, k, spotOf(game, d.id)) })).filter((d) => !(carry && carry.held && carry.id === d.id));
  }
  const standWidth = (id) => (decorArt[id] && decorArt[id].width) || (String(id).startsWith("plot") ? 30 : 24);
  /** Where a thing outside stands: on the field in the yard, on the ground line in the side-on scene. */
  const baseY = (kind, x) => (!outside() ? HABITAT.ground : kind === "thing" ? thingSpot(x).y : kind === "tank" ? tankSpot(x).y : plotSpot(x).y);
  let doorT = 0; // how long the door stays open (it opens as the creature goes through)
  // Carrying a decoration (slice 2, home.js): {id, to, held, auto}: what it is fetching or holding, where it goes.
  let carry = null;
  // Using things (slice 4): the aquarium stands in the room once a fish is caught; the mailbox by the cottage's path.
  const TANK_IN = { x: 184, y: 93 };
  const MAILBOX = { x: 92, y: 76 };
  const roomTank = () => (fishingOf(game).caught > 0 ? [{ id: "tank", x: TANK_IN.x, y: TANK_IN.y }] : []);
  let rolling = null; // the ball, kicked: {id, from, to, t}
  const furniture = () => [...roomLayout(game.decor, homeOf(game).spots).filter((d) => !(carry && carry.held && carry.id === d.id)), ...roomTank()];
  const blocked = () => (inRoom() ? blockedCells(furniture(), (id) => (decorArt[id] && decorArt[id].width) || 32)
    : inHall() ? hallBlocked((p) => cellKey(p, HALL_WALK))
    : inFarm() ? farmBlocked(...fieldSize(game), (p) => cellKey(p, FARM_WALK), blockedCells([...buildingsOn(game).map((b) => ({ id: b.id, x: b.x, y: b.y })), ...farmStanding().map(([id, at]) => ({ id, x: at.x, y: at.y }))], () => 26, FARM_WALK))
    : yardBlocked((p) => cellKey(p, YARD_WALK), blockedCells(yardStanding(), standWidth, YARD_WALK)));
  /** Where the creature's feet are now: on the room's floor, or on the outdoor ground. */
  const feetNow = () => (inRoom() ? (isEgg() ? ROOM.egg.y : pet.y) : outside() ? (isEgg() ? YARD_EGG.y : pet.y) : HABITAT.ground);
  /** Walk to a spot in the room, round the furniture; `after`: "out" goes through the door on arriving. */
  function walkTo(spot, after = null) {
    pet.napUntil = 0; // (sent somewhere: up from its nap)
    // asked to go somewhere else while carrying: it puts the thing down where it stands
    if (carry && after !== "pickup" && after !== "drop") {
      if (carry.held) { setSpot(game, carry.id, { x: pet.x, y: pet.y }); saveGame(); }
      carry = null;
    }
    pet.path = findPath({ x: pet.x, y: pet.y }, spot, blocked(), walkArea());
    if (pet.path.length === 1 && Math.hypot(pet.path[0].x - pet.x, pet.path[0].y - pet.y) < 1.5) { pet.path[0] = { x: pet.x, y: pet.y }; } // (there already: no shuffle)
    pet.after = after;
    pet.moodT = Math.max(pet.moodT, 4); // (a tap wakes it: it was asked to come)
  }
  function goThrough(to) {
    // whatever it was carrying is put down where it stood, on this side of the door
    if (carry) { if (carry.held) { setSpot(game, carry.id, { x: pet.x, y: pet.y }); saveGame(); } carry = null; }
    const from = view;
    view = to;
    saveView(to);
    $(".habitat-name").hidden = to !== "room";
    doorT = 0.7;
    pet.path = [];
    pet.after = null;
    camReady = false; // (the camera starts where it comes out)
    const hallDoor = stationById("hall");
    if (to === "farm") { pet.x = FARM_IN.x; pet.y = FARM_IN.y; walkTo({ x: FARM_IN.x - 40, y: FARM_IN.y - 4 }); }
    else if (to === "yard" && from === "farm") { pet.x = FARM_DOOR.x + 4; pet.y = FARM_DOOR.y; walkTo({ x: FARM_DOOR.x + 44, y: FARM_DOOR.y + 4 }); }
    else if (to === "hall") { pet.x = HALL_DOOR_SPOT.x; pet.y = HALL_DOOR_SPOT.y; walkTo({ x: HALL_DOOR_SPOT.x, y: HALL_DOOR_SPOT.y - 26 }); }
    else if (to === "yard" && from === "hall" && hallDoor) { pet.x = hallDoor.x; pet.y = hallDoor.y + 2; walkTo({ x: hallDoor.x, y: hallDoor.y + 24 }); }
    else if (to === "yard") { pet.x = YARD_DOOR_SPOT.x; pet.y = YARD_DOOR_SPOT.y; walkTo({ x: YARD_DOOR_SPOT.x + 40, y: YARD_DOOR_SPOT.y + 30 }); }
    else { pet.x = ROOM.doorSpot.x; pet.y = ROOM.doorSpot.y; walkTo({ x: ROOM.doorSpot.x - 50, y: 116 }); }
  }
  /** Straight to a place, no walking (the big tiles): "room" (the middle of its room), or a village station's spot. */
  function teleportTo(where) {
    if (!roomOn()) return;
    if (carry) { if (carry.held) { setSpot(game, carry.id, { x: pet.x, y: pet.y }); saveGame(); } carry = null; }
    const st = where === "room" || where === "hall" || where === "farm" ? null : stationById(where);
    if (where !== "room" && where !== "hall" && where !== "farm" && !st) return;
    view = st ? "yard" : where;
    saveView(view);
    $(".habitat-name").hidden = view !== "room";
    pet.path = []; pet.after = null; pet.leaving = 0; pet.napUntil = 0;
    pet.wait = 30; // (it stays there a while: still there when the page is closed)
    if (st) { pet.x = st.x; pet.y = st.y; pet.dir = 1; } else if (where === "farm") { pet.x = FARM_IN.x - 40; pet.y = FARM_IN.y - 4; } else if (where === "hall") { pet.x = COUNTER_SPOT.x; pet.y = COUNTER_SPOT.y; } else { pet.x = W / 2; pet.y = 118; }
    camReady = false; // (the camera jumps there with it)
  }
  /** One step of walking in the room: along its way, or (with nowhere to go) a wander now and then. */
  function roomWalk(dt, look, asleep) {
    pet.moving = false;
    if (look.stage === "egg") return;
    if (pet.leaving > 0) { if ((pet.leaving -= dt) <= 0) goThrough(inRoom() ? "yard" : "room"); return; }
    if (pet.path.length) {
      const rise = riseMs(look);
      if (rise && pet.stand < 1) { pet.stand = Math.min(1, pet.stand + (dt * 1000) / rise); return; } // (getting up first)
      const p = pet.path[0];
      const dx = p.x - pet.x, dy = p.y - pet.y, d = Math.hypot(dx, dy);
      if (d < 0.8) {
        pet.path.shift();
        if (!pet.path.length) {
          pet.wait = 2 + Math.random() * 5;
          if (pet.after === "out" || pet.after === "in") { pet.after = null; doorT = 0.9; pet.leaving = 0.45; }
          else if (String(pet.after).startsWith("use:")) { const what = pet.after.slice(4); pet.after = null; useThing(what); }
          else if (String(pet.after).startsWith("go:")) { const st = stationById(pet.after.slice(3)); pet.after = null; if (st) openStation(st); }
          else if (pet.after === "pickup" && carry) { carry.held = true; pet.wait = 0; sfx("tick"); walkTo(carry.to, "drop"); } // picked up: off to its new spot
          else if (pet.after === "drop" && carry) { // put down
            pet.after = null;
            setSpot(game, carry.id, carry.to);
            saveGame();
            carry = null;
            sfx("common");
            emote("idea", 1.2);
          }
        }
        return;
      }
      const step = Math.min(d, (look.size === "s" ? 15 : 22) * WALK_PACE * dt);
      pet.x += (dx / d) * step;
      pet.y += (dy / d) * step;
      if (Math.abs(dx) > 2 || (Math.abs(dx) > 0.4 && Math.abs(dx) >= Math.abs(dy))) pet.dir = dx > 0 ? 1 : -1; // (walking up or down it keeps facing the way it was: no flip-flopping)
      pet.walkMs += dt * 1000 * WALK_PACE;
      pet.moving = true;
      return;
    }
    if (asleep) return;
    if (pet.wait > 0) { pet.wait -= dt; return; }
    // Now and then, in its room, it moves one of its small things somewhere else by itself.
    if (inRoom() && !carry && Math.random() < 0.12) {
      const small = furniture().filter((d) => isSmall(d.id));
      if (small.length) {
        const d = small[Math.floor(Math.random() * small.length)];
        const r = ROOM.walk;
        carry = { id: d.id, to: { x: r.x0 + 20 + Math.random() * (r.x1 - r.x0 - 40), y: r.y0 + 6 + Math.random() * (r.y1 - r.y0 - 12) }, held: false, auto: true };
        walkTo({ x: d.x, y: d.y }, "pickup");
        return;
      }
    }
    const w = walkArea();
    pet.path = findPath({ x: pet.x, y: pet.y }, { x: w.x0 + Math.random() * (w.x1 - w.x0), y: w.y0 + Math.random() * (w.y1 - w.y0) }, blocked(), w);
  }
  // ----- the yard (prototype "habitat_room"): the battle terrain's own art, put together as the arenas are -----
  const yardImgs = {};
  let yardGround = null, yardDirty = true;
  const yimg = (p) => {
    if (!(p in yardImgs)) { yardImgs[p] = null; loadImage(p).then((im) => { yardImgs[p] = im; yardDirty = true; }).catch(() => {}); }
    return yardImgs[p];
  };
  let yardMoving = []; // [{x, y, layers}]: the cells with moving ground (water), from that layer up, drawn every frame
  const ANIM_MS = 200; // a frame of the moving water (the battles' pace)
  /** One layer of a dual-grid cell whose top left is at (x, y): its edge tile (mask) or a middle tile (mask 15); moving
   * ground from its _anim sheet at frame `f` (livebattle-ui's drawLayer, and battle/terrain/README.md). */
  function yardTile(g, l, x, y, f = -1) {
    const sh = SHEETS[l.terrain];
    if (!sh) return true;
    const full = l.mask === 15;
    if (sh.anim && f >= 0) {
      const moving = yimg((full ? sh.fill : sh.edges).replace(".png", "_anim.png"));
      if (moving) {
        if (full) g.drawImage(moving, f * TILE, (l.fill % Math.max(1, Math.round(moving.height / TILE))) * TILE, TILE, TILE, x, y, TILE, TILE);
        else g.drawImage(moving, f * 4 * TILE + (l.mask % 4) * TILE, Math.floor(l.mask / 4) * TILE, TILE, TILE, x, y, TILE, TILE);
        return true;
      }
    }
    const img = yimg(full ? sh.fill : sh.edges);
    if (!img) return false;
    if (full) g.drawImage(img, (l.fill % Math.max(1, Math.round(img.width / TILE))) * TILE, 0, TILE, TILE, x, y, TILE, TILE);
    else g.drawImage(img, (l.mask % 4) * TILE, Math.floor(l.mask / 4) * TILE, TILE, TILE, x, y, TILE, TILE);
    return true;
  }
  /** The ground: its still layers drawn once into their own canvas (again when a picture arrives), the water over them
   * every frame, only where the window shows. */
  let groundOf = "";
  function drawYard(now = performance.now()) {
    const which = inHall() ? "hall" : inFarm() ? `farm${fieldSize(game).join("x")}` : "yard";
    if (which !== groundOf) { groundOf = which; yardDirty = true; yardGround = null; }
    if (yardDirty) {
      yardDirty = false;
      yardMoving = [];
      const m = sceneMap();
      if (!yardGround) { yardGround = document.createElement("canvas"); yardGround.width = m.width; yardGround.height = H; }
      const g = yardGround.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.fillStyle = inHall() ? "#3a3440" : "#3f7a34";
      g.fillRect(0, 0, m.width, H);
      for (let cy = 0; cy <= m.rows; cy++) for (let cx = 0; cx <= m.cols; cx++) {
        const layers = drawCorners(m, cx, cy);
        const x = cx * TILE - TILE / 2, y = cy * TILE - TILE / 2;
        const k = layers.findIndex((l) => SHEETS[l.terrain] && SHEETS[l.terrain].anim);
        for (const l of k < 0 ? layers : layers.slice(0, k)) yardTile(g, l, x, y);
        if (k >= 0) yardMoving.push({ x, y, layers: layers.slice(k) });
      }
      for (const d of m.decals) {
        const info = DECALS[d.id];
        const img = info && yimg(info.art);
        if (!img) continue;
        const [w, hgt] = info.size || [16, 16];
        g.drawImage(img, (d.v || 0) * w, 0, w, hgt, d.x, d.y, w, hgt);
      }
    }
    ctx.drawImage(yardGround, -cam(), 0);
    const f = Math.floor(now / ANIM_MS) % 4, left = cam();
    for (const c of yardMoving) {
      if (c.x + TILE < left || c.x > left + W) continue;
      for (const l of c.layers) yardTile(ctx, l, c.x - left, c.y, f);
    }
  }
  /** A roof (the cottage's thatch, the tavern's, the hall's), put together once from its 16x16 pieces (as livebattle-ui's
   * roofImage). */
  function yardRoof(r) {
    if (r.canvas) return r.canvas;
    const sheet = yimg(ROOFS[r.style].sheet);
    if (!sheet) return null;
    const c = document.createElement("canvas");
    const w = r.w * TILE + 6;
    c.width = w;
    const { back, front } = roofRows(r.h);
    const rows = [0, ...Array(back).fill(1), 2, ...Array(front).fill(3), 4];
    c.height = rows.length * TILE;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    rows.forEach((row, k) => {
      const y = k * TILE, sy = row * TILE;
      g.drawImage(sheet, 0, sy, TILE, TILE, 0, y, TILE, TILE);
      for (let x = TILE; x < w - TILE; x += TILE) { const cw = Math.min(TILE, w - TILE - x); g.drawImage(sheet, TILE, sy, cw, TILE, x, y, cw, TILE); }
      g.drawImage(sheet, 2 * TILE, sy, TILE, TILE, w - TILE, y, TILE, TILE);
    });
    r.canvas = c;
    return c;
  }
  /** After dark, over the night's shade (which falls on the whole scene in one pass): a warm glow round each light,
   * the lamp posts and the Star Shrine, so they still shine (the owner: night shading on everything, lights bright). */
  function nightLights(dark) {
    const k = Math.min(1, dark / 0.55);
    const glow = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, `rgba(255, 210, 130, ${a * k})`); g.addColorStop(0.45, `rgba(255, 180, 90, ${a * k * 0.4})`); g.addColorStop(1, "rgba(255, 170, 80, 0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of sceneMap().props) {
      if (p.id !== "lamp_post") continue;
      const img = PROPS[p.id] && yimg(PROPS[p.id].art);
      if (!img) continue;
      const cx = p.x * TILE + (p.w * TILE) / 2, top = (p.y + 1) * TILE - img.height;
      glow(cx, top + 5, 26, 0.55);
    }
    if (inYard() && farmOn() && shrineTier(game)) glow(SHRINE.x, SHRINE.y - 26, 22, 0.35);
    ctx.restore();
  }
  /** Everything standing on the yard's field, each with its depth (the y of its foot) and how to draw it. */
  function yardScene(now, sparkle) {
    const out = [];
    const m = sceneMap();
    for (const p of m.props) {
      const img = PROPS[p.id] && yimg(PROPS[p.id].art);
      if (!img) continue;
      const cx = p.x * TILE + (p.w * TILE) / 2, bottom = (p.y + 1) * TILE;
      out.push({ y: bottom - 1, draw: () => {
        ctx.save();
        ctx.translate(Math.round(cx), bottom);
        if (p.flip) ctx.scale(-1, 1);
        ctx.drawImage(img, -Math.round(img.width / 2), -img.height);
        ctx.restore();
      } });
    }
    for (const r of m.roofs) out.push({ y: (r.y0 + r.h) * TILE - 1, draw: () => {
      const pic = yardRoof(r);
      if (!pic) return;
      const top = r.y0 * TILE - 10;
      ctx.drawImage(pic, r.x0 * TILE - 3, top);
      const ridge = top + (1 + roofRows(r.h).back) * TILE;
      for (const e of r.extras) {
        const info = ROOF_EXTRAS[e.id];
        const im = info && yimg(info.art);
        if (im) ctx.drawImage(im, Math.round(r.x0 * TILE + e.x * TILE - im.width / 2 + (info.dx || 0)), ridge + info.sit - im.height);
      }
      // a thread of smoke from the chimney
      const chim = r.extras.find((e) => e.id === "chimney");
      if (chim) {
        const sx = r.x0 * TILE + chim.x * TILE, sy = ridge + ROOF_EXTRAS.chimney.sit - 31;
        for (let i = 0; i < 4; i++) {
          const k = ((now / 2600) + i / 4) % 1;
          ctx.fillStyle = `rgba(230, 226, 236, ${(0.55 * (1 - k)).toFixed(2)})`;
          const px = Math.round(sx + Math.sin(k * 5 + i) * 2 + k * 8), py = Math.round(sy - k * 26), n = 2 + Math.round(k * 3);
          ctx.fillRect(px - n, py - n + 1, n * 2, n * 2 - 2);
          ctx.fillRect(px - n + 1, py - n, n * 2 - 2, n * 2);
        }
      }
    } });
    // The Muffles: at their stalls and doors, two walking about; drawn at the creature's outdoor size, bobbing a little
    // (each picture is a strip of frames, muffles.js POSE: busy at something, walking side on, away or towards you)
    for (const f of folkHere()) {
      const img = yimg(`muffle/${f.id}.png`);
      if (!img) continue;
      const pose = poseOf(f, now, f.mv);
      const frame = img.width >= 80 ? pose.frame : 0;
      const sit = f.act === "eat";
      out.push({ y: f.y, draw: () => {
        const k = creatureScale();
        ctx.save();
        ctx.translate(Math.round(f.x), Math.round(f.y));
        ctx.scale(k * pose.dir * (f.act ? 1 : f.mv ? 1 : f.dir), k);
        if (art.shadow_m && !sit) ctx.drawImage(art.shadow_m, -Math.round(art.shadow_m.width / 2), -Math.floor(art.shadow_m.height / 2));
        const bob = f.act || f.mv ? 0 : Math.floor(now / 520 + f.phase) % 2; // (standing: a little breath; the frames move by themselves)
        ctx.drawImage(img, frame * 40, 0, 40, 40, -20, -37 - bob, 40, 40);
        ctx.restore();
      } });
      if (farmOn() && ordersToday(game).some((o) => o.folk === f.id && !o.done)) out.push({ y: f.y + 0.5, draw: () => { // (slice 4: an order)
        const bx = Math.round(f.x), by = Math.round(f.y - 30 + Math.sin(now / 300) * 1.5);
        ctx.fillStyle = "#1e1a2c"; ctx.fillRect(bx - 4, by - 7, 9, 10);
        ctx.fillStyle = "#fff4c0"; ctx.fillRect(bx - 3, by - 6, 7, 8);
        ctx.fillStyle = "#c86010"; ctx.fillRect(bx, by - 5, 1, 4); ctx.fillRect(bx, by, 1, 1);
      } });
      if (f.act === "cook") { // her pot over its fire, the steam curling (muffle/pot.png: 2 frames of 24 x 24)
        const pot = yimg("muffle/pot.png");
        if (pot) out.push({ y: f.y + 1, draw: () => {
          const k = creatureScale();
          ctx.save();
          ctx.translate(Math.round(f.x + 11), Math.round(f.y + 2));
          ctx.scale(k, k);
          ctx.drawImage(pot, (Math.floor(now / 300) % 2) * 24, 0, 24, 24, -12, -23, 24, 24);
          ctx.restore();
        } });
      }
    }
    if (inFarm()) farmScene(out, now, sparkle);
    if (inYard() && shrineTier(game)) { // the Star Shrine (slice 3), once there is stardust
      const pic = yimg(`farm/shrine_${shrineTier(game)}.png`);
      if (pic) out.push({ y: SHRINE.y, draw: () => {
        ctx.drawImage(pic, SHRINE.x - 24, SHRINE.y - pic.height + 2);
        if (art.ready && Math.floor(now / 1800) % 2 === 0) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, SHRINE.x + 6, SHRINE.y - 30);
      } });
    }
    if (inYard() && farmOn()) { // the gate to the farm, at the yard's left edge
      const gate = yimg("farm/gate.png");
      // (in the gap of the fence line along the yard's left edge, on the path: farm_buildings.py gate_open)
      if (gate) out.push({ y: 97, draw: () => ctx.drawImage(gate, 0, 80 - 24) });
    }
    for (const at of inYard() ? yardDecor() : []) {
      if (!(at.id in decorArt)) { decorArt[at.id] = null; loadImage(`${at.id}.png`).then((img) => { decorArt[at.id] = img; }); }
      const img = decorArt[at.id];
      if (img) out.push({ y: at.y, draw: () => ctx.drawImage(img, Math.round(at.x - img.width / 2), at.y - img.height + 2) });
    }
    // the pier's fishing spot: ripples where the line goes in (rings now and then, a fish's shadow passing), the chair
    // and its rod (tap either: the creature walks to the chair and the pond opens)
    if (inYard()) {
      out.push({ y: PIER_RIPPLES.y - 8, draw: () => {
        for (let k = 0; k < 2; k++) {
          const t = ((now / 1800) + k * 0.5) % 1, r = 2 + t * 7;
          ctx.globalAlpha = 0.55 * (1 - t);
          ctx.strokeStyle = "#cfefff"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(PIER_RIPPLES.x, PIER_RIPPLES.y, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
        }
        const f = (now / 1000) % 9; // a fish's shadow slipping by, now and then
        if (f < 1.6) { ctx.globalAlpha = 0.28 * Math.sin((f / 1.6) * Math.PI); ctx.fillStyle = "#06162c";
          ctx.beginPath(); ctx.ellipse(PIER_RIPPLES.x - 10 + f * 12, PIER_RIPPLES.y + 2, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      } });
      const chair = yimg("village/pier_chair.png");
      if (chair) out.push({ y: PIER_CHAIR.y, draw: () => ctx.drawImage(chair, PIER_CHAIR.x - 16, PIER_CHAIR.y - chair.height + 3) });
    }
    // the mailbox: its flag up when a friend's gift has come (tap it: the creature fetches it)
    const mail = things.some((it) => it.kind === "gift");
    const box = mail ? art.mailboxFlag : art.mailbox;
    if (box && inYard()) out.push({ y: MAILBOX.y, draw: () => {
      ctx.drawImage(box, MAILBOX.x - Math.floor(box.width / 2), MAILBOX.y - box.height + 2);
      if (mail && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, MAILBOX.x + 6, MAILBOX.y - 22);
    } });
    for (const th of inYard() ? things : []) {
      const at = thingSpot(th.x);
      if (th.kind === "gift") continue; // (in the mailbox)
      if (th.kind === "gift" && art.gift) {
        out.push({ y: at.y, draw: () => {
          const jump = Math.floor(now / 1400) % 2 ? 0 : Math.round(Math.abs(Math.sin(now / 120)) * 3);
          ctx.drawImage(art.gift, th.x - 8, at.y - 15 - jump);
          if (art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, th.x, at.y - 10);
        } });
      } else if (th.kind === "egg") {
        const spare = game.roster[th.index];
        const img = spare && eggOf(spare.type);
        if (!img) continue;
        out.push({ y: at.y, draw: () => {
          const shake = th.ready ? Math.sin(now / 70) * 2 : Math.sin(now / 260) * (th.progress > 0.8 ? 2 : 0.6);
          ctx.save();
          ctx.translate(Math.round(th.x + shake), at.y);
          ctx.drawImage(img, -16, -32);
          const n = th.ready ? 2 : Math.min(2, Math.floor(th.progress * 4) - 1);
          if (n >= 0 && cracks[n]) ctx.drawImage(cracks[n], -16, -32);
          ctx.restore();
          if (th.ready && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, th.x, at.y - 16);
        } });
      }
    }
    return out.sort((a, b) => a.y - b.y);
  }
  /** The view from the room's window and doorway: a sky by the hour and green hills (no town: "more fantasy"). */
  function drawHills(hour) {
    const day = hour >= 7 && hour < 18, dusk = !day && hour >= 5 && hour < 20;
    const sky = ctx.createLinearGradient(0, 0, 0, 84);
    sky.addColorStop(0, day ? "#6fb4e8" : dusk ? "#5a4a8a" : "#141a40");
    sky.addColorStop(1, day ? "#cfeaff" : dusk ? "#f0a070" : "#2c3466");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }
  function drawHillsFront() {
    ctx.fillStyle = "#6a9a4a";
    for (let x = 0; x < W; x++) { const y = 44 + Math.round(Math.sin(x / 23) * 4 + Math.sin(x / 9) * 1.5); ctx.fillRect(x, y, 1, H - y); }
    for (const tx of [146, 168, 182, 274, 288]) {
      ctx.fillStyle = "#5a3a20"; ctx.fillRect(tx - 1, 46, 2, 6);
      ctx.fillStyle = "#2f5e2a"; ctx.fillRect(tx - 5, 38, 10, 9); ctx.fillRect(tx - 3, 35, 6, 3);
    }
    ctx.fillStyle = "#4f8a3c";
    for (let x = 0; x < W; x++) { const y = 54 + Math.round(Math.sin(x / 31 + 2) * 5); ctx.fillRect(x, y, 1, H - y); }
    ctx.fillStyle = "#3d7230";
    for (let x = 0; x < W; x++) { const y = 70 + Math.round(Math.sin(x / 17 + 1) * 3); ctx.fillRect(x, y, 1, H - y); }
  }
  // ----- the Muffles (muffles.js): where each is, and what it says -----
  const MUFFLE_NAMES = { grocer: "The grocer", baker: "The baker", barkeep: "The barkeep", florist: "The florist", tailor: "The tailor", fisher: "The fisher" };
  const folk = FOLK.map((f, i) => ({ ...f, dir: 1, phase: f.phase ?? i * 0.37, said: 0, spoke: 0, to: null, mv: null, rest: 2 + i }));
  /** The Muffles where the creature is: the village's, or the hall's custodian. */
  const folkHere = () => folk.filter((f) => (f.scene || "yard") === (inHall() ? "hall" : inFarm() ? "farm" : "yard"));
  let learned = null, learnedReady = null; // the uids of the words remembered in the flashcards (for which of a Muffle's words show)
  const loadLearned = () => {
    if (!learnedReady) learnedReady = api("/reviews").then((r) => { learned = new Set([...reviewStates((r && r.reviews) || {})].filter(([, c]) => c && c.known).map(([uid]) => uid)); })
      .catch(() => { learned = new Set(); });
    return learnedReady;
  };
  loadLearned(); // (up front: the first line after launch knows your words too)
  let speaking = false;
  const msay = $(".muffle-say");
  let msayFor = null, msayUntil = 0;
  /** The Muffle at a point outside, or null. */
  const muffleAt = (x, y) => folkHere().find((f) => Math.abs(x - f.x) < 8 && y <= f.y + 2 && y >= f.y - 24) || null;
  let pressedMuffle = null; // (the Muffle under the finger when the press began: only it can answer the tap)
  /** A Muffle says something: its words you know show, the rest in its forgotten script (the owner's rule). */
  async function muffleSpeak(f) {
    if (speaking) return;
    speaking = true;
    const lang = studyLanguage();
    const line = lineFor(f, lang, f.said++);
    f.spoke = performance.now();
    // which of its words you know: saved and remembered, well known from battles, woken by orders, or SEEN in a text
    // (white, not purple, in the player and reader: the owner's rule); waited for, so the first line knows them too
    let seen = null;
    try {
      await Promise.race([Promise.all([loadLearned(), vocabReady]), new Promise((ok) => setTimeout(ok, 2500))]);
      seen = line ? await Promise.race([seenOf(lineWords(line, lang), lang), new Promise((ok) => setTimeout(() => ok(null), 2500))]) : null;
    } catch { /* what is known so far */ } finally { speaking = false; }
    if (disposed || !outside()) return;
    const known = knownKeys(vocab || [], learned || new Set(), game.review, lang);
    if (farmOn()) for (const k of wokenKeys(game, lang)) known.add(k); // (slice 4: words woken by orders and the feast)
    const read = line ? readLine(line, known, lang, seen) : { words: [0, 1, 2, 3].slice(0, 2 + (f.said % 3)).map((i) => ({ text: f.id + i + f.said, known: false, glyphs: [((i * 5 + f.said) % 12), ((i * 7 + 3) % 12), ((i + f.said * 2) % 12)] })), known: 0, total: 0 };
    const [b, small] = msay.children;
    b.replaceChildren();
    for (const w of read.words) {
      if (w.known) { const s = h(`<span class="mw"></span>`); s.textContent = w.text; b.append(s); continue; }
      const lost = h(`<span class="mw-lost" aria-hidden="true"></span>`);
      for (const g of w.glyphs) lost.append(h(`<i class="mg" style="--g:${g}"></i>`));
      b.append(lost);
    }
    setLang(b, lang);
    b.dir = lang === "ar" || lang === "fa" ? "rtl" : "ltr";
    b.classList.toggle("unspaced", ["ja", "zh", "th"].includes(lang)); // (written without spaces: its words close together)
    // who is talking (the owner's name for them: "Muffles", one is a Muffle), and how many of its words are awake
    small.textContent = read.total ? `${t("Muffle")} · ${t("Words you know: {0} of {1}", read.known, read.total)}` : t("Muffle");
    small.hidden = false;
    msay.hidden = false;
    msay.classList.remove("show");
    void msay.offsetWidth; // (restarts its fade)
    msay.classList.add("show");
    msayFor = f;
    msayUntil = performance.now() + 6000;
    sfx("tick");
  }
  /** The Muffles' moment: the two who walk about, a word as the creature passes, the bubble kept over its speaker. */
  function folkTick(dt) {
    for (const f of folkHere()) {
      if (!f.walk) continue;
      if (!f.to) { f.mv = null; if ((f.rest -= dt) > 0) continue; const [x0, y0, x1, y1] = f.walk; f.to = { x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0) }; }
      const dx = f.to.x - f.x, dy = f.to.y - f.y, d = Math.hypot(dx, dy);
      if (d < 1) { f.to = null; f.mv = null; f.rest = 3 + Math.random() * 6; continue; }
      f.mv = { dx, dy }; // (which way it walks: which frames, muffles.js poseOf)
      const step = Math.min(d, 9 * dt);
      f.x += (dx / d) * step; f.y += (dy / d) * step;
      if (Math.abs(dx) > 0.5) f.dir = dx > 0 ? 1 : -1;
    }
    const nowMs = performance.now();
    if (!isEgg() && msay.hidden) {
      const near = folkHere().find((f) => Math.hypot(f.x - pet.x, (f.y - pet.y) * 1.5) < 30 && nowMs - f.spoke > 25000);
      if (near) muffleSpeak(near);
    }
    if (msayFor) {
      if (nowMs > msayUntil) { msay.hidden = true; msayFor = null; return; }
      const half = (msay.offsetWidth / Math.max(1, canvas.clientWidth)) * W / 2 + 2; // (kept inside the window)
      msay.style.left = `${(Math.max(half, Math.min(W - half, msayFor.x - cam())) / W) * 100}%`;
      const high = msayFor.y < 84; // (one up by the stalls and doors: its words below it, clear of the corner buttons)
      msay.style.bottom = high ? "auto" : `${((H - msayFor.y + 30) / H) * 100}%`;
      msay.style.top = high ? `${((msayFor.y + 4) / H) * 100}%` : "auto";
    }
  }
  const foodArt = {}; // food id -> image (a hungry creature's thought bubble)
  const bursts = [];   // {id, x, y, t}
  const floats = [];   // {img, x, y, t}
  let frames = {};     // pose key -> canvas (composed creature)
  let lookKey = "";
  let egg = null;
  let cracks = [];
  let disposed = false;
  let last0 = performance.now();
  let raf = 0;
  let timer = 0;
  let seen = false;
  let pendingT = 0;
  // The ring fills smoothly toward the day's minutes (from what was last shown today, so studying elsewhere
  // shows as the ring filling up when Home opens).
  const ringSeen = store.get(`${SEEN_KEY}.ring`);
  let ringShown = ringSeen && ringSeen.day === game.day.key && Number.isFinite(ringSeen.frac) ? Math.min(goalRing(game).frac, ringSeen.frac) : goalRing(game).frac;
  const ringPx = ringPixels(RING.rx, RING.ry);
  let ringCache = { key: "", back: null, front: null };

  // Petting it brings up one of the owner's saved words over its head for a moment.
  const say = $(".pet-word");
  const about = $(".habitat-about");
  const SAY_MS = 3600; // matches the pet-word animation in app.css
  let sayTimer = 0;
  let aboutTimer = 0;
  let sayHalf = 0;     // half the bubble's width and its whole height, in scene pixels (to keep it inside the scene)
  let sayTall = 0;
  const said = new Set(); // words shown this round: every saved word turns up once before any comes back
  let saidLast = "";      // the one shown last, so a new round never opens with the word just seen
  function placeSay(look) {
    const top = look.stage === "egg" ? 36 : beastHeight(look) - 4;
    const x = (look.stage === "egg" ? W / 2 : pet.x) - cam();
    say.style.left = `${(Math.max(sayHalf + 2, Math.min(W - sayHalf - 2, x)) / W) * 100}%`;
    say.style.bottom = `${(Math.min(H - sayTall - 2, H - feetNow() + top + pet.hop) / H) * 100}%`;
  }
  async function sayWord() {
    if (vocab === null) await vocabReady;
    if (vocab === null || disposed) return; // the words couldn't be read: say nothing rather than something untrue
    const words = vocab.filter((v) => v && String(v.text || "").trim());
    const idOf = (v) => String(v.uid || v.id);
    let fresh = words.filter((v) => !said.has(idOf(v)));
    if (!fresh.length) { // every word has had its turn: start again, with any word but the last one
      said.clear();
      fresh = words.length > 1 ? words.filter((v) => idOf(v) !== saidLast) : words;
    }
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    if (pick) { saidLast = idOf(pick); said.add(saidLast); }
    const [word, meaning] = say.children;
    word.textContent = pick ? String(pick.text).trim() : "";
    word.hidden = !pick;
    if (pick) setLang(word, detectLanguage(pick.sentence || pick.text));
    meaning.textContent = pick ? String(pick.meaning || "").trim() : "no words saved yet :(";
    meaning.hidden = !meaning.textContent;
    pet.emoteT = 0; // the word takes the place of the little heart bubble
    say.hidden = false;
    say.classList.remove("show");
    const px = canvas.clientWidth ? W / canvas.clientWidth : 1; // scene pixels per screen pixel
    sayHalf = (say.offsetWidth / 2) * px; // measuring also restarts the fade
    sayTall = say.offsetHeight * px;
    say.classList.add("show");
    placeSay(refreshLook());
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { say.hidden = true; }, SAY_MS);
    loadVocab().catch(() => {}); // pick up words saved since, for the next time
  }
  // Tapping it also says what it is, under its name tag, for as long as the word shows.
  function showAbout() {
    about.textContent = infoLine();
    about.hidden = false;
    clearTimeout(aboutTimer);
    aboutTimer = setTimeout(() => { about.hidden = true; }, SAY_MS);
  }

  function refreshLook() {
    const look = describe(game.creature);
    const key = JSON.stringify([game.creature.seed, look.stage, look.variant, look.size, look.equipped]);
    if (key === lookKey) return look;
    lookKey = key;
    frames = {};
    if (look.stage === "egg") {
      // (with its hat and wings on, when it wears them: render.dressEgg)
      loadImage(`egg/${look.type}.png`).then((img) => dressEgg(img, look.equipped)).then((pic) => { if (key === lookKey) egg = pic; });
      Promise.all([1, 2, 3].map((n) => loadImage(`egg/crack_${n}.png`))).then((imgs) => { cracks = imgs; });
    }
    return look;
  }
  const eggOf = (type) => {
    if (!(type in eggArt)) { eggArt[type] = null; loadImage(`egg/${type}.png`).then((img) => { eggArt[type] = img; }); }
    if (!cracks.length && !eggArt._cracks) { eggArt._cracks = true; Promise.all([1, 2, 3].map((n) => loadImage(`egg/crack_${n}.png`))).then((imgs) => { cracks = imgs; }); }
    return eggArt[type];
  };

  function creatureFrame(look, pose) {
    const key = `${pose.anim}|${pose.frame}|${pose.eyes}`;
    if (!(key in frames)) {
      frames[key] = null; // being made; draw the previous frame meanwhile
      const made = frames;
      // (one that couldn't be made, say a picture that didn't load, is tried again a moment later, not never)
      composeCreature(look, pose).then((c) => { if (made === frames) frames[key] = c; },
        () => setTimeout(() => { if (made === frames && frames[key] === null) delete frames[key]; }, 2000));
    }
    // While the new look is still being drawn, the last picture shown stays (the creature used to vanish).
    const pic = frames[key] || Object.values(frames).find(Boolean) || lastPic;
    if (pic) lastPic = pic;
    return pic || null;
  }
  let lastPic = null;

  /** The goal ring as two small pictures (behind and in front of the creature), redrawn only when it changes. */
  function ringArt(frac, done) {
    const key = `${Math.round(frac * 160)}|${done}`;
    if (ringCache.key === key) return ringCache;
    const make = (back) => {
      const c = document.createElement("canvas");
      c.width = RING.rx * 2 + 3;
      c.height = RING.ry * 2 + 3;
      const g = c.getContext("2d");
      for (const p of ringPx) {
        if (p.back !== back) continue;
        const lit = done || p.f < frac;
        g.fillStyle = (lit ? (done ? RING_DONE : RING_FILL) : RING_TRACK)[p.outer ? 0 : 1];
        g.fillRect(p.x + RING.rx + 1, p.y + RING.ry + 1, 1, 1);
      }
      return c;
    };
    ringCache = { key, back: make(true), front: make(false) };
    return ringCache;
  }

  function tick(dt, now) {
    const look = refreshLook();
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const night = hour < 6 || hour >= 20;
    const asleep = (night && !pet.moodT) || pet.napUntil > performance.now(); // (or napping on its bed: slice 4)
    if (rolling && (rolling.t += dt / 0.7) >= 1) rolling = null;
    // Wander: walk to a spot, wait, pick another. Eggs just wobble. (In the room it walks round the furniture.)
    if (inRoom() || outside()) roomWalk(dt, look, asleep);
    if (outside()) folkTick(dt); else if (msayFor) { msay.hidden = true; msayFor = null; }
    const lieMs = riseMs(look);
    if (pet.stand > 0 && lieMs && (pet.wait > 0 || asleep)) pet.stand = Math.max(0, pet.stand - (dt * 1000) / lieMs); // lying back down
    if (pet.air > 0 && (pet.wait > 0 || asleep || !pet.fly)) { pet.air = Math.max(0, pet.air - dt * 3); pet.walkMs += dt * 1000; } // landing
    if (!pet.air && pet.wait > 0) pet.fly = false;
    if (pet.moodT > 0) { pet.moodT -= dt; if (pet.moodT <= 0) pet.mood = ""; }
    pet.hop = pet.mood === "happy" ? Math.abs(Math.sin(now / 110)) * 6 : 0;
    // Now and then it says how it feels, in a little bubble.
    if (pet.emoteT > 0) pet.emoteT -= dt;
    else if ((pet.idleT -= dt) < 0) {
      pet.idleT = 7 + Math.random() * 8;
      if (look.stage !== "egg") {
        emote(asleep ? "sleepy" : !game.day.seconds && hour >= 12 ? "hungry"
          : !game.day.done && game.streak > 0 && hour >= 18 ? "sweat" : Math.random() < 0.3 ? "question" : "");
      }
    }

    // Sky: day and night, with a little dusk.
    const dark = night ? 0.55 : hour > 18 ? (hour - 18) * 0.22 : hour < 7.5 ? (7.5 - hour) * 0.3 : 0;
    if (outside()) { // the camera glides after the creature (straight onto it when it comes out)
      const want = inHall() ? 0 : inFarm() ? farmCamera(pet.x) : cameraFor(pet.x);
      camX = camReady ? camX + (want - camX) * Math.min(1, dt * 5) : want;
      camReady = true;
    } else camReady = false;
    ctx.clearRect(0, 0, W, H);
    if (outside()) drawYard(now);
    else drawHills(hour);
    const arc = (hour >= 6 && hour < 20 ? (hour - 6) / 14 : ((hour + 4) % 24) / 10);
    if (inRoom()) { // through the window (x 116-198) and the doorway: the sun by day, the moon by night, clouds by day
      const orb = night ? art.room_moon : art.room_sun;
      if (orb) ctx.drawImage(orb, Math.round(118 + arc * 60), Math.round(40 - Math.sin(arc * Math.PI) * 16)); // (it crosses the window)
      if (!night) {
        if (art.room_cloud_1) ctx.drawImage(art.room_cloud_1, Math.round(((now / 120) % 200) + 76), 22);
        if (art.room_cloud_2) ctx.drawImage(art.room_cloud_2, Math.round(((now / 170 + 90) % 170) + 90), 38);
      }
    }
    // (in the room only the far view shows, through the window and the doorway, then the room over it)
    if (inRoom()) drawHillsFront();
    if (art.rain && rainy() && !outside()) { // (not indoors; outside it falls over everything, below)
      const fall = Math.floor(now / 14) % 32; // the tile repeats, sliding down and a little to the left
      for (let x = 0; x < W + 32; x += 32) for (let y = -32; y < H; y += 32) ctx.drawImage(art.rain, x - Math.floor(fall / 2), y + fall);
    }
    if (dark && !outside()) { ctx.fillStyle = `rgba(20, 12, 48, ${dark})`; ctx.fillRect(0, 0, W, H); } // (outside: over everything, below)
    if (doorT > 0) doorT -= dt;
    if (inRoom() && art.room) {
      ctx.drawImage(art.room, 0, 0);
      if (art.fire) { // the hearth's fire flickers (room.py FIRE_BOX: 36 x 32 at 28, 52; 4 frames)
        const fw = art.fire.width / 4, ff = Math.floor(now / 140) % 4;
        ctx.drawImage(art.fire, ff * fw, 0, fw, art.fire.height, 28, 52, fw, art.fire.height);
      }
      const open = doorT > 0 || (pet.after === "out" && Math.hypot(pet.x - ROOM.doorSpot.x, pet.y - ROOM.doorSpot.y) < 26);
      const leaf = open ? art.doorOpen : art.door;
      if (leaf) ctx.drawImage(leaf, ROOM.door.x0, ROOM.door.y0);
      if (dark) { ctx.fillStyle = `rgba(20, 12, 48, ${dark * 0.45})`; ctx.fillRect(0, 0, W, H); } // (indoors, lamps: less dark)
    }

    ctx.save();
    ctx.translate(-cam(), 0); // (outside: everything on the field is drawn where it is on it)
    const sparkle = Math.floor(now / 170) % FX_FRAMES.ready; // the "ready" twinkle over things to collect

    // The room's furniture: what stands behind the creature now, then (after it) what stands in front.
    const feet = feetNow();
    const pieces = inRoom() ? furniture() : [];
    const drawPiece = (d) => {
      if (d.id === "tank") { // the aquarium, its fish swimming (very small)
        if (!art.tank) return;
        const tx = d.x - art.tank.width / 2, ty = d.y - art.tank.height + 2;
        ctx.drawImage(art.tank, tx, ty);
        drawTinyFish(ctx, fishingOf(game).tank, TIERS.map((tier) => tier.colour), tx + 8, ty + 8, 20, 7, now);
        return;
      }
      if (rolling && rolling.id === d.id) { // the ball, rolling and bouncing to where it was kicked
        const k = Math.min(1, rolling.t), e = 1 - (1 - k) ** 2;
        d = { ...d, x: rolling.from.x + (rolling.to.x - rolling.from.x) * e, y: rolling.from.y + (rolling.to.y - rolling.from.y) * e - Math.abs(Math.sin(k * Math.PI * 2)) * 6 * (1 - k) };
      }
      if (!(d.id in decorArt)) { decorArt[d.id] = null; loadImage(`${d.id}.png`).then((img) => { decorArt[d.id] = img; }); }
      const img = decorArt[d.id];
      if (img) ctx.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height + 2));
    };
    for (const d of pieces) if (d.y <= feet) drawPiece(d);
    const yardItems = outside() ? yardScene(now, sparkle) : [];
    for (const it of yardItems) if (it.y <= feet) it.draw(); // (what stands behind it on the field)
    const scale = inRoom() ? depthScale(feet) : 1;

    // The goal ring round the creature's feet: its back half behind the creature, its front half in front.
    const cx = look.stage === "egg" ? (inRoom() ? ROOM.egg.x : W / 2) : pet.x;
    const ring = goalRing(game);
    ringShown += (ring.frac - ringShown) * Math.min(1, dt * 3);
    if (Math.abs(ring.frac - ringShown) < 0.002) ringShown = ring.frac;
    const ringPic = ringArt(ringShown, ring.done && ringShown >= 0.999);
    const rx0 = Math.round(cx) - RING.rx - 1;
    const ry0 = feet + RING.dy - RING.ry - 1;
    const k = creatureScale(); // the creature and everything on it (ring, shadow, things worn, bubbles, hearts) at its size
    ctx.save();
    if (k !== 1) { ctx.translate(Math.round(cx), feet); ctx.scale(k, k); ctx.translate(-Math.round(cx), -feet); }
    ctx.drawImage(ringPic.back, rx0, ry0);

    if (look.stage === "egg") {
      // Near hatching it shakes harder and twinkles: something is about to happen.
      const near = game.creature.growth / STAGES[1].from >= 0.85;
      const wobble = Math.sin(now / (near ? 90 : 260)) * (pet.mood ? 3 : near ? 2 : 1);
      if (egg) {
        ctx.save();
        ctx.translate(Math.round(cx + wobble), feet);
        ctx.drawImage(egg, -egg.width / 2, -egg.height - Math.round(pet.hop)); // (a dressed egg is bigger: hat and wings)
        // Cracks spread as the egg nears hatching.
        const n = Math.min(2, Math.floor((game.creature.growth / STAGES[1].from) * 4) - 1);
        if (n >= 0 && cracks[n]) ctx.drawImage(cracks[n], -16, -32 - Math.round(pet.hop));
        ctx.restore();
        if (near && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, cx, feet - 18);
      }
    } else {
      // Its frame: flying (taking off and landing too), walking, or still (breathing, now and then a blink;
      // slower asleep).
      const moving = pet.moving;
      const rise = drawingOf(look).anims.rise;
      const pose = pet.air > 0 ? animAt(look, "fly", pet.walkMs)
        : rise && pet.stand > 0 && pet.stand < 1 ? { anim: "rise", frame: Math.min(rise.frames - 1, Math.floor(pet.stand * rise.frames)), eyes: "open" }
        : moving ? animAt(look, "walk", pet.walkMs)
        : animAt(look, "idle", asleep ? now * 0.6 : now);
      if (asleep) pose.eyes = "sleepy";
      else if (pet.mood === "happy") pose.eyes = "happy";
      const frame = creatureFrame(look, pose);
      const sink = pose.anim === "fly" ? Math.round((1 - pet.air) * FLY_UP) : 0; // (its fly frames hold it up: from the ground at take-off)
      const body = pet.x - pet.dir * 3; // the body sits 3px behind the middle of its frame (the head leans forward)
      const shadow = art.shadow_m; // (the creatures are all one size now)
      if (frame && shadow) ctx.drawImage(shadow, Math.round(body - shadow.width / 2), feet - Math.floor(shadow.height / 2)); // stays on the ground through a hop
      if (frame) {
        ctx.save();
        ctx.translate(Math.round(pet.x), feet - Math.round(pet.hop) + sink);
        if (pet.dir < 0) ctx.scale(-1, 1);
        if (scale !== 1) ctx.scale(scale, scale); // (smaller at the back of the room)
        const tint = farmOn() && game.creature && game.creature.tint && game.creature.tint.until > Date.now() / 1000 ? game.creature.tint.hue : 0;
        if (tint) ctx.filter = `hue-rotate(${tint}deg)`; // (slice 4: a Berry tart or a Moon jelly, for a day)
        drawLiving(ctx, frame, look, now); // (as drawImage(frame, -FRAME / 2, -FRAME), with a colouring's particles)
        ctx.filter = "none";
        ctx.restore();
      }
      // (higher while it stands up to walk; a flight rises by its own reckoning: FLY_UP)
      let top = feet - Math.round(beastHeight(look, pose.anim === "fly" ? null : pose.anim) * scale) - Math.round(pet.hop) - Math.round(pet.air * FLY_UP);
      const held = carry && carry.held && decorArt[carry.id];
      if (held) { // carried over its head (slice 2), a little bob with each step
        const s = Math.min(1, 26 / Math.max(held.width, held.height));
        const w = Math.round(held.width * s), hh = Math.round(held.height * s);
        ctx.drawImage(held, Math.round(pet.x - w / 2), Math.round(top - hh + 6 + Math.abs(Math.sin(pet.walkMs / 140)) * 2), w, hh);
        top -= hh - 4;
      }
      const bubble = pet.emoteT > 0 && art[`emote_${pet.emote}`];
      if (bubble) ctx.drawImage(bubble, Math.round(pet.x + pet.dir * 12 - 6), top);
      else if (asleep && art.zzz && Math.floor(now / 900) % 2) ctx.drawImage(art.zzz, Math.round(pet.x + 10), top + 4 - (Math.floor(now / 300) % 3));
      else if (say.hidden && isHungry(game.creature)) {
        // Hungry (prototype "hunger"): a thought bubble with its favourite food, bobbing, in place of its hearts.
        const food = wantedFood(game.creature).id;
        if (!(food in foodArt)) { foodArt[food] = null; loadImage(`icon/${food}.png`).then((img) => { foodArt[food] = img; }); }
        const y = top - 24 + Math.round(Math.sin(now / 500));
        const x = Math.round(pet.x + pet.dir * 10 - 11);
        ctx.fillStyle = "#1a1030";
        ctx.fillRect(x - 1, y - 1, 24, 22); ctx.fillRect(x + (pet.dir < 0 ? 15 : 3), y + 21, 5, 4); ctx.fillRect(x + (pet.dir < 0 ? 18 : 1), y + 26, 3, 3);
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y, 22, 20); ctx.fillRect(x + (pet.dir < 0 ? 16 : 4), y + 21, 3, 2); ctx.fillRect(x + (pet.dir < 0 ? 19 : 2), y + 27, 1, 1);
        if (foodArt[food]) ctx.drawImage(foodArt[food], x + 3, y + 2);
      } else if (say.hidden && art.heart) {
        // Its hearts float over its head, like a mood: filled as far as it has been fed and cared for.
        const n = hearts(game.creature);
        const y = top - 10 + Math.round(Math.sin(now / 600));
        for (let i = 0; i < 5; i++) {
          ctx.globalAlpha = i < n ? 1 : 0.28;
          ctx.drawImage(art.heart, Math.round(pet.x - 22 + i * 9), y);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.drawImage(ringPic.front, rx0, ry0);
    ctx.restore();
    for (const d of pieces) if (d.y > feet) drawPiece(d); // (the furniture in front of it)
    for (const it of yardItems) if (it.y > feet) it.draw(); // (and on the field)
    // Night outside falls on everything on the field alike (the ground, the buildings, the props, the Muffles, the
    // creature), as in the battles; inside the hall the lamps are lit (less dark).
    if (dark && outside()) { ctx.fillStyle = `rgba(20, 12, 48, ${inHall() ? dark * 0.45 : dark})`; ctx.fillRect(cam(), 0, W, H); }
    if (outside() && !inHall() && rainy()) { // the rain: a grey sky over the whole scene, as the night is (every building, prop,
      // Muffle and the creature alike: the owner, "the shading of the day night or weather cycles dont seem to effect the
      // new assets"), then the drops over it all
      ctx.fillStyle = "rgba(44, 54, 74, 0.24)"; ctx.fillRect(cam(), 0, W, H);
    }
    if (dark && outside() && !inHall()) nightLights(dark); // (then the lights on top, so they stay bright)
    if (outside() && !inHall() && rainy() && art.rain) {
      const fall = Math.floor(now / 14) % 32;
      const x0 = Math.floor(cam() / 32) * 32;
      for (let x = x0; x < cam() + W + 32; x += 32) for (let y = -32; y < H; y += 32) ctx.drawImage(art.rain, x - Math.floor(fall / 2), y + fall);
    }
    if (outside() && !inHall() && farmOn()) { ctx.save(); ctx.translate(cam(), 0); seasonOverlay(now); ctx.restore(); } // (prototype "farm")
    if (lanternNight()) { // (Lantern soup: the glow, and now and then a Muffle comes to say a word)
      const g2 = ctx.createRadialGradient(pet.x, feet - 10, 2, pet.x, feet - 10, 34);
      g2.addColorStop(0, "rgba(255, 214, 120, 0.45)"); g2.addColorStop(1, "rgba(255, 214, 120, 0)");
      ctx.fillStyle = g2; ctx.fillRect(pet.x - 34, feet - 44, 68, 68);
      if (inYard() && now - lanternTalk > 20000 && msay.hidden) {
        const near = folkHere().filter((x) => !x.act).sort((a, b) => Math.abs(a.x - pet.x) - Math.abs(b.x - pet.x))[0];
        if (near && Math.abs(near.x - pet.x) < 200) { lanternTalk = now; muffleSpeak(near); }
      }
    }
    if (ring.done && art.ready && ringShown >= 0.999 && Math.floor(now / 2400) % 3 === 0) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, cx, feet + 2);
    // (the ring's "4 / 10 min" is a chip in the bar below the window, beside the level: nothing in the scene under
    // its feet takes a tap; the owner, "the 0/10 min thing under my creature ... I accidentally click on it all the time")

    if (!say.hidden) placeSay(look);
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      if (f.t > 1.1) { floats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      if (f.img) ctx.drawImage(f.img, Math.round(f.x + Math.sin(f.t * 8 + i) * 3), Math.round(f.y - f.t * 26));
      ctx.globalAlpha = 1;
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const n = FX_FRAMES[b.id];
      if (b.t * 14 >= n) { bursts.splice(i, 1); continue; }
      drawSheet(ctx, art[b.id], n, b.t * 14, b.x, b.y);
    }
    // Something earned while a sheet or a battle covered the card flies in once it is gone.
    ctx.restore();
    if (pending && (pendingT -= dt) < 0) { pendingT = 0.5; if (!document.querySelector(OVERLAYS)) settle(); }
  }

  // Animation frames pause in a hidden window, so a slow timer keeps the scene honest there.
  function loop() {
    if (disposed) return;
    if (!el.isConnected && seen) { dispose(); return; } // the page was left
    seen = seen || el.isConnected;
    const now = performance.now();
    // The next frame is booked first: a frame that fails to draw is skipped, and the scene carries on
    // (it used to stop for good: the Home card looked frozen). The first failure is logged, for finding it.
    raf = requestAnimationFrame(loop);
    try { tick(Math.min(0.1, (now - last0) / 1000), now); }
    catch (err) { if (!loopFailed) { loopFailed = true; console.error("Habitat frame failed:", err); } }
    last0 = now;
  }
  let loopFailed = false;
  timer = setInterval(() => { if (document.hidden) { const now = performance.now(); tick(0.1, now); last0 = now; } }, 1000);
  const gardenTimer = setInterval(gardenBeat, 5000);

  function cheer(kind) {
    pet.mood = "happy";
    pet.moodT = kind === "jackpot" ? 3 : 1.4;
    const y = feetNow() - (isEgg() ? 36 : 50);
    const x = isEgg() ? (inRoom() ? ROOM.egg.x : W / 2) : pet.x;
    const img = kind === "pet" ? art.heart : art.star;
    for (let i = 0; i < (kind === "jackpot" ? 6 : 3); i++) floats.push({ img, x: x - 12 + Math.random() * 24, y: y + Math.random() * 10, t: -i * 0.12 });
    if (kind === "jackpot") bursts.push({ id: "burst_jackpot", x, y: y + 16, t: 0 });
    emote({ pet: "love", jackpot: "love", lucky: "music", surprise: "question" }[kind]);
  }

  // ----- tapping the scene -----
  let claiming = false;
  async function openGift(gift, x) {
    if (claiming) return;
    claiming = true;
    try {
      const got = await social.claimGift(gift.id);
      const message = receiveGift(game, got && got.kind, got && got.payload);
      online.gifts = online.gifts.filter((g) => g !== gift);
      saveGame();
      sfx("jackpot");
      bursts.push({ id: "burst_lucky", x, y: baseY("thing", x) - 10, t: 0 });
      // What came out flies to where it is kept: an egg to Creatures, a thing to wear to the Shop's My things.
      fly(got && got.kind === "egg" ? "egg" : "gift", toScreen(x, baseY("thing", x) - 8), $(got && got.kind === "egg" ? "#g-creatures .px-icon" : "#g-shop .px-icon"));
      toast(t("From {0}: {1}", gift.from, t(message))).prepend(h(icon("gift")), " "); // (what came out, in the reader's language too)
      paintHud();
    } catch (err) {
      toast(err.message, { error: true });
    } finally { claiming = false; }
  }
  function hatchAway(th) {
    const c = game.roster[th.index];
    if (!c) return;
    delete c.hatchedAway;
    saveGame();
    sfx("jackpot");
    bursts.push({ id: "hatch", x: th.x, y: baseY("thing", th.x) - 16, t: 0 });
    fly("nav_roster", toScreen(th.x, baseY("thing", th.x) - 16), $("#g-creatures .px-icon"));
    toast(t("It hatched! Bring it out on the Creatures page.")).prepend(h(icon("egg")), " ");
    paintHud();
  }
  /** The creature uses something it has walked to (slice 4). Nothing here pays anything: it is for fun and for
   * looking after it (the owner's rules: no money, no battle strength, no pay for tapping). */
  function useThing(what) {
    if (what.startsWith("spot:")) { useSpot(what.slice(5)); return; }
    if (what === "barn") { sfx("tick"); openBarn(); return; }
    if (what === "shrine") { sfx("tick"); openShrine(); return; }
    if (what === "seeds") { sfx("tick"); openSeedStand({ changed: () => paintHud() }); return; }
    if (what === "farmgate") { sfx("tick"); goThrough("farm"); return; }
    if (what === "yardgate") { sfx("tick"); goThrough("yard"); return; }
    if (what === "register") { // at the hall's counter: the custodian says something, and the gym register opens
      const c = folk.find((f) => f.id === "custodian");
      if (c) muffleSpeak(c);
      sfx("tick");
      setTimeout(() => import("./gyms-ui.js").then((m) => m.openGyms()).catch(() => {}), 700);
      return;
    }
    const thing = furniture().find((d) => d.id.replace(/^decor\//, "") === what);
    if (what === "bed" && thing) { // a nap on its bed: lies on it, eyes shut, for a while (a tap or a walk wakes it)
      pet.x = thing.x; pet.y = thing.y + 1;
      pet.napUntil = performance.now() + 20000;
      emote("sleepy", 2);
    } else if (what === "food_bowl") { // a meal from its bowl: its best food (its favourite first), as Supplies feeds it
      const why = feedBest(game, game.creature);
      if (why) { toast(t(why)); emote("question", 1.6); return; }
      saveGame();
      paintHud();
      cheer("pet");
      emote("love", 2);
    } else if (what === "toy_ball" && thing) { // a kick: the ball rolls off somewhere, and it runs after it
      const r = ROOM.walk;
      const to = clampToFloor({ x: thing.x + (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 50), y: r.y0 + 6 + Math.random() * (r.y1 - r.y0 - 12) });
      rolling = { id: thing.id, from: { x: thing.x, y: thing.y }, to, t: 0 };
      setSpot(game, thing.id, to);
      saveGame();
      sfx("tick");
      pet.mood = "happy"; pet.moodT = 3;
      setTimeout(() => { if (!disposed && inRoom()) walkTo({ x: to.x + 14, y: to.y }); }, 650);
    } else if (what === "tank") { // it watches the fish a moment, then your basket opens
      emote("love", 1.2);
      setTimeout(() => { if (!disposed) go("basket"); }, 700);
    } else if (what === "mail") { // a friend's gift from the mailbox, or nothing today
      const gift = things.find((it) => it.kind === "gift");
      if (gift) openGift(gift.gift, MAILBOX.x); else { toast(t("No mail today.")); emote("question", 1.4); }
    }
  }
  /** What a station in the village opens (yard.js STATIONS): a page of the game sheet, the pond, the gyms, the tavern. */
  function openStation(st) {
    sfx("tick");
    if (st.opens === "pond") openPond({ changed: () => paintHud(), closed: () => paintFishing(), sheet: go });
    else if (st.opens === "garden" && farmOn()) openFruitStall({ changed: () => paintHud() }); // (slice 4: selling harvests)
    else if (st.opens === "gyms" && roomOn()) goThrough("hall"); // (in through its door: the custodian keeps the register)
    else if (st.opens === "gyms") import("./gyms-ui.js").then((m) => m.openGyms()).catch(() => {});
    else if (st.opens === "tavern") {
      const tav = document.querySelector("#home-tavern");
      if (tav && tav.childElementCount) tav.scrollIntoView({ behavior: "smooth", block: "center" }); // (the guild tavern, on Home)
      else location.hash = "#/friends"; // (no guild yet: the Guilds page, where one is joined)
    } else go(st.opens);
  }
/** What stands on the farm besides the field and the buildings (slice 5): [[id, {x, y, i}]]: the upgrades once built
   * ("windmill", "compost", "scarecrow", the earned "sprinkler"), the decorations ("decor:<id>"). */
  function farmStanding() {
    const out = [];
    for (const id of ["windmill", "compost", "scarecrow"]) if (upLevel(game, id)) out.push([id, UPGRADE_AT[id]]);
    if (sprinklerOn(game)) out.push(["sprinkler", sprinklerAt(...fieldSize(game))]);
    for (const d of decorOn(game)) out.push([`decor:${d.id}`, { x: d.x, y: d.y, i: d.i }]);
    return out;
  }
  const decorPic = (id) => { const d = decorById(id); return d && yimg(d.art || PROPS[d.prop].art); };
  let moving = null; // a building being moved on the farm (its slot), until a tap says where it stands
  const onMove = (e) => {
    if (!farmOn() || !e.detail) return;
    if (!inFarm()) teleportTo("farm");
    moving = Number.isInteger(e.detail.decor) ? { decor: e.detail.decor } : e.detail.i;
    toast(t("Tap where it should stand on your farm."));
  };
  window.addEventListener("tamkeen-farm-move", onMove);
  /** The farm's field: each spot tilled (dark once watered today), its plant at its stage (wilted when a day was
   * missed), a drop over a thirsty one, a twinkle over a ripe one; the seed stand and the gate back. */
  function farmScene(out, now, sparkle) {
    const soil = yimg("farm/soil.png"), crops = yimg("farm/crops.png");
    for (const sp of fieldSpots(game)) {
      const at = spotXY(sp.c, sp.r);
      const st = plantState(game, sp.key);
      if (soil) out.push({ y: at.y - 9, draw: () => {
        ctx.drawImage(soil, st && st.watered ? 16 : 0, 0, 16, 16, at.x - 8, at.y - 8, 16, 16);
        if (spotFlash && spotFlash.key === sp.key && performance.now() < spotFlash.until) { // (just tapped: outlined)
          ctx.fillStyle = "#fff8d0";
          ctx.fillRect(at.x - 8, at.y - 8, 16, 1); ctx.fillRect(at.x - 8, at.y + 7, 16, 1);
          ctx.fillRect(at.x - 8, at.y - 8, 1, 16); ctx.fillRect(at.x + 7, at.y - 8, 1, 16);
        }
      } });
      if (underGlass(game, sp.key)) { const gl = yimg("farm/glass.png"); if (gl) out.push({ y: at.y + 6, draw: () => ctx.drawImage(gl, at.x - 8, at.y - 16) }); } // (slice 5: the greenhouse)
      if (!st || !crops) continue;
      const row = CROPS.indexOf(st.crop);
      const frame = st.wilted ? 4 : st.stage;
      out.push({ y: at.y + 5, draw: () => {
        if (st.resting) ctx.globalAlpha = 0.6;
        ctx.drawImage(crops, frame * 16, row * 24, 16, 24, at.x - 8, at.y + 5 - 21, 16, 24);
        ctx.globalAlpha = 1;
        if (st.ripe && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, at.x, at.y - 8);
        if (st.thirsty) { // a drop of water over it, bobbing: it wants its word today
          const by = at.y - 20 + Math.round(Math.sin(now / 260 + sp.c + sp.r) * 1.5);
          ctx.fillStyle = "#1e2a44";
          ctx.fillRect(at.x - 2, by - 1, 5, 6); ctx.fillRect(at.x - 1, by - 3, 3, 2);
          ctx.fillStyle = st.half ? "#8ab8e8" : "#4a9ae8";
          ctx.fillRect(at.x - 1, by, 3, 4); ctx.fillRect(at.x, by - 2, 1, 2);
          ctx.fillStyle = "#c8e8ff"; ctx.fillRect(at.x - 1, by, 1, 1);
        }
      } });
    }
    // the garden's buildings where they stand (slice 2): glow waiting glows and twinkles; bees round the hive
    const auto = automated(game);
    for (const b of buildingsOn(game)) {
      const a = structureArt(b.id, b.tier);
      const img = yimg(a.file);
      if (!img) continue;
      const p = garden(game).plots[b.i];
      const x = Math.round(b.x - img.width / 2), y = b.y - img.height + 3;
      out.push({ y: b.y, draw: () => {
        if (moving === b.i) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 160);
        ctx.drawImage(img, x, y);
        ctx.globalAlpha = 1;
        if (!auto && p && p.stored >= 1) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.22 + 0.16 * Math.sin(now / 320 + b.i);
          ctx.drawImage(img, x, y);
          ctx.restore();
          if (art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, (sparkle + b.i) % FX_FRAMES.ready, b.x, y + img.height / 2);
          if (art.glowIcon) ctx.drawImage(art.glowIcon, b.x - 8, y - 14 + Math.round(Math.sin(now / 300 + b.i) * 2));
        }
        if (b.kind === "hive") { // a bee for each word saved today (three a tier at most), buzzing round it
          const n = beesToday(game);
          for (let k = 0; k < n; k++) {
            const a2 = now / (420 + k * 37) + k * 2.1;
            const bx = Math.round(b.x + Math.cos(a2) * (10 + (k % 3) * 5)), by = Math.round(y + 8 + Math.sin(a2 * 1.7) * 6 - (k % 2) * 4);
            ctx.fillStyle = "#2a1a0a"; ctx.fillRect(bx - 1, by, 3, 2);
            ctx.fillStyle = "#ffd24a"; ctx.fillRect(bx, by, 1, 2);
            ctx.fillStyle = "rgba(232, 244, 255, 0.9)"; ctx.fillRect(bx, by - 1, 1, 1);
          }
        }
      } });
    }
    // the upgrades, once built (slice 5), and the decorations (just for looks)
    for (const [id, at] of farmStanding()) {
      const pic = id.startsWith("decor:") ? decorPic(id.slice(6)) : id === "scarecrow" ? yimg(PROPS.scarecrow.art) : yimg(`farm/${id}.png`);
      if (!pic) continue;
      out.push({ y: at.y, draw: () => {
        if (moving && moving.decor === at.i && id.startsWith("decor:")) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 160);
        ctx.drawImage(pic, Math.round(at.x - pic.width / 2), Math.round(at.y - pic.height + 2));
        ctx.globalAlpha = 1;
        if (id === "sprinkler" && Math.floor(now / 900) % 3 === 0) { // its fan of drops, now and then
          ctx.fillStyle = "#8ac8f0";
          for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(at.x + Math.cos(k + now / 300) * 10), Math.round(at.y - 18 + Math.sin(k * 2) * 4), 1, 2);
        }
      } });
    }
    const stand = yimg("farm/seedstand.png");
    if (stand) out.push({ y: SEED_STAND.y, draw: () => ctx.drawImage(stand, SEED_STAND.x - 16, SEED_STAND.y - stand.height + 2) });
    const gate = yimg("farm/gate.png");
    if (gate) out.push({ y: FARM_GATE.y, draw: () => { // (the same gate, facing the farm, in its fence line's gap at the path)
      ctx.save(); ctx.translate(FARM_W, 0); ctx.scale(-1, 1); ctx.drawImage(gate, 0, (FARM_GATE.y - 12) - 24); ctx.restore();
    } });
  }
  /** The season, shown outside (the owner: the village's look follows the season): blossom drifting in spring, a
   * few bright motes in summer, falling leaves in autumn, snow (and a paler ground) in winter. */
  /** Lantern soup tonight (slice 4): a warm glow round the creature outside after dark. */
  const lanternNight = () => farmOn() && outside() && !inHall() && buffsOf(game).lantern === dayKey() && (new Date().getHours() >= 18 || new Date().getHours() < 6);
  let lanternTalk = 0;
  function seasonOverlay(now) {
    const season = seasonOf();
    if (season === "winter") { ctx.fillStyle = "rgba(235, 242, 255, 0.16)"; ctx.fillRect(0, 0, W, H); }
    const look = { spring: [18, ["#ffc8dc", "#ffe0ea", "#f8a8c8"], 0.6], summer: [7, ["#fff4b0", "#ffe680"], 0.25],
      autumn: [16, ["#e8782a", "#c8501a", "#f0a838"], 0.8], winter: [30, ["#ffffff", "#e8f0ff"], 0.5] }[season];
    const [n, colours, sway] = look;
    for (let i = 0; i < n; i++) {
      const speed = 9 + (i * 7) % 11;
      const y = ((now / 1000) * speed + i * 37) % (H + 10) - 5;
      const x = ((i * 61 + Math.sin(now / 900 + i) * 12 * sway + (now / 1000) * (season === "autumn" ? 6 : 2)) % (W + 10) + W + 10) % (W + 10) - 5;
      ctx.fillStyle = colours[i % colours.length];
      ctx.fillRect(Math.round(x), Math.round(y), season === "summer" ? 1 : 2, season === "autumn" ? 1 : 2);
      if (season === "autumn") ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, 1, 1);
    }
  }
  /** A spot of the field tapped (the creature has walked there): plant, water, harvest, or how it is doing. */
  let spotFlash = null; // {key, until}: the spot just tapped, outlined for a moment
  /** A field spot tapped: it lights up, its card opens now, and the creature (not an egg) walks over to it. */
  function tapSpot(c, r) {
    const key = `${c},${r}`, at = spotXY(c, r);
    spotFlash = { key, until: performance.now() + 420 };
    sfx("tick");
    if (!isEgg() && Math.hypot(pet.x - at.x, pet.y - (at.y + 2)) > 14) walkTo({ x: at.x, y: at.y + 2 });
    useSpot(key);
  }
  async function useSpot(key) {
    const st = plantState(game, key);
    const at = (() => { const [c, r] = key.split(",").map(Number); return spotXY(c, r); })();
    if (!st) { pickSeed(key, { changed: () => paintHud(), planted: () => emote("idea", 1.2) }); return; }
    if (st.ripe) { reap(key, at); return; }
    if (!st.thirsty) { plantCard(key, { harvest: () => reap(key, at) }); return; }
    const r = await askToWater(key);
    if (!r) return;
    if (r.correct || r.grew) bursts.push({ id: "sparkle", x: at.x, y: at.y - 6, t: 0 });
    if (r.revived) toast(t("It perked up again."));
    if (r.ripe) { emote("love", 1.5); toast(t("Ripe! Tap it to harvest.")); }
  }
  function reap(key, at) {
    const got = harvestPlant(game, key);
    if (typeof got === "string") { toast(t(got), { error: true }); return; }
    saveGame();
    sfx(got.tier >= 3 ? "lucky" : "common");
    emote("love", 1.2);
    bursts.push({ id: "sparkle", x: at.x, y: at.y - 6, t: 0 });
    toast(harvestLine(got));
  }
  /** The decoration at a point in the room or the yard (the front one first), or null. */
  function decorAt(x, y) {
    const list = inRoom() ? furniture() : inYard() ? yardDecor() : [];
    const hit = list.filter((d) => {
      const img = decorArt[d.id];
      if (!img) return false;
      return Math.abs(x - d.x) <= img.width * 0.35 && y <= d.y + 2 && y >= d.y - img.height * 0.9; // (squarely on it)
    });
    return hit.sort((a, b) => b.y - a.y)[0] || null;
  }
  /** A decoration's little menu: Move it (tap where, and the creature carries it there) or Put away (My things). */
  function decorMenu(d) {
    const it = itemById(d.id);
    const name = (it && it.name) || "Decoration";
    const box = openModal({ title: t(name), cls: "decor-menu" });
    const body = h(`<div class="decor-menu-body"><p></p><div class="confirm-buttons"></div></div>`);
    body.querySelector("p").textContent = isEgg() ? t("Tap where it should go.") : t("Tap where it should go, and your creature carries it there.");
    const row = body.querySelector(".confirm-buttons");
    const button = (word, primary, run) => {
      const b = h(`<button type="button" class="${primary ? "primary" : "ghost"}"></button>`);
      b.textContent = word;
      b.onclick = () => { box.close(); run(); };
      row.append(b);
    };
    button(t("Put away"), false, () => { putAway(game, d.id); saveGame(); toast(t("{0} is back in My things.", t(name))); });
    const use = { bed: "Nap", food_bowl: "Eat", toy_ball: "Play" }[d.id.replace(/^decor\//, "")];
    button(t("Move it"), !use, () => { carry = { id: d.id, to: null, held: false, auto: false }; toast(t("Tap where it should go.")); });
    if (use && !isEgg()) button(t(use), true, () => walkTo({ x: d.x, y: d.y }, `use:${d.id.replace(/^decor\//, "")}`));
    box.body.replaceChildren(body);
  }
  // Pressed rather than tapped (Enter or Space on the keyboard, A on a game controller, which come with no
  // place on the picture): the creature itself is tapped.
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); canvas.click(); return; }
    // Arrow keys (and a controller's stick or pad, which arrive as them) walk it, with the room (prototype "habitat_room").
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!step || !roomOn() || isEgg()) return;
    e.preventDefault();
    if (inRoom()) walkTo(clampToFloor({ x: pet.x + step[0] * 26, y: pet.y + step[1] * 12 }));
    else if (inYard() && farmOn() && step[0] < 0 && pet.x < FARM_EDGE + 26) walkTo(FARM_DOOR, "use:farmgate"); // (on past the left edge: the farm)
    else if (inFarm() && step[0] > 0 && pet.x > FARM_WALK.x1 + 8 - FARM_EDGE - 26) walkTo(FARM_IN, "use:yardgate"); // (on past the right: the yard)
    else walkTo(clampToFloor({ x: pet.x + step[0] * 26, y: pet.y + step[1] * 14 }, walkArea()));
  });
  const scenePoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W + cam(), y: ((e.clientY - r.top) / r.height) * H };
  };
  const onCreature = (x, y) => Math.abs(x - (isEgg() ? (inRoom() ? ROOM.egg.x : W / 2) : pet.x)) < 30 && y <= feetNow() + 2 && (!inRoom() || y >= feetNow() - 70);
  // Held on the creature: how it grows (the evolution page).
  let holdTimer = 0;
  let heldDown = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    heldDown = false;
    const p = scenePoint(e);
    pressedMuffle = outside() ? (muffleAt(p.x, p.y) || {}).id || null : null;
    clearTimeout(holdTimer);
    if (onCreature(p.x, p.y)) holdTimer = setTimeout(() => { heldDown = true; openEvolution(game, go); }, HOLD_MS);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) canvas.addEventListener(ev, () => clearTimeout(holdTimer));
  canvas.addEventListener("contextmenu", (e) => { const p = scenePoint(e); if (onCreature(p.x, p.y)) { e.preventDefault(); clearTimeout(holdTimer); if (!heldDown) openEvolution(game, go); heldDown = true; } });
  canvas.addEventListener("click", (e) => {
    if (heldDown) { heldDown = false; return; }
    const pressed = e.detail === 0 && !e.clientX && !e.clientY;
    const p = pressed ? { x: isEgg() ? (inRoom() ? ROOM.egg.x : W / 2) : pet.x, y: 0 } : scenePoint(e);
    const { x, y } = p;
    const cx = isEgg() ? (inRoom() ? ROOM.egg.x : W / 2) : pet.x;
    // Moving a decoration (slice 2): after "Move it", the next tap says where it goes.
    if (roomOn() && !pressed && carry && !carry.to) {
      const to = inRoom() ? clampToFloor({ x, y: Math.max(y, ROOM.walk.y0) }) : clampToFloor({ x, y: Math.max(y, YARD_WALK.y0 + 30) }, YARD_WALK);
      carry.to = to;
      if (isEgg()) { setSpot(game, carry.id, to); saveGame(); carry = null; return; } // (an egg can't carry: it just goes there)
      const from = (inRoom() ? furniture() : yardDecor()).find((d) => d.id === carry.id);
      if (from) walkTo({ x: from.x, y: from.y }, "pickup"); else carry = null;
      return;
    }
    // On the farm, the field comes first: a tap in it (or a near miss) is for its nearest spot, whatever wanders or
    // stands over it; the spot lights up and its card opens straight away, the creature walking over meanwhile.
    if (inFarm() && !pressed && moving === null) {
      const [fw, fh] = fieldSize(game);
      const sp = plotAt(x, y, fw, fh);
      if (sp) { tapSpot(sp.c, sp.r); return; }
    }
    // A decoration tapped: move it (the creature carries it) or put it away.
    const piece = roomOn() && !pressed && !onCreature(x, y) ? decorAt(x, y) : null;
    if (piece) { decorMenu(piece); return; }
    // A Muffle tapped: it says something (muffles.js).
    const under = outside() && !pressed ? muffleAt(x, y) : null;
    const mf = under && under.id === pressedMuffle ? under : null; // (a press that began on open ground walks, whoever wanders under it)
    if (mf && mf.id === "custodian") { if (isEgg()) useThing("register"); else walkTo(COUNTER_SPOT, "use:register"); return; } // (the hall's: sign up)
    if (mf && farmOn() && mf.id === "cook") { sfx("tick"); openCookbook({ changed: () => paintHud() }); return; } // (slice 4: the Cookbook)
    const order = mf && farmOn() ? ordersToday(game).find((o) => o.folk === mf.id && !o.done) : null;
    if (order) { sfx("tick"); openOrder(order, t(MUFFLE_NAMES[mf.id] || "Muffle"), { changed: () => paintHud() }); return; }
    if (mf) { muffleSpeak(mf); return; }
    // (the cook's pot: her Cookbook too)
    const cookF = farmOn() && outside() && !inHall() && !inFarm() ? folk.find((x) => x.id === "cook") : null;
    if (cookF && !pressed && Math.abs(x - (cookF.x + 11)) < 9 && y > cookF.y - 14 && y < cookF.y + 4) { sfx("tick"); openCookbook({ changed: () => paintHud() }); return; }
    // On the farm (farmmap.js): a spot of the field (the creature walks there, then plant, water or harvest), the barn,
    // the seed stand, the fence (how big the field is, and growing it), the gate back to the yard.
    if (inFarm() && !pressed && moving !== null) { // (a building's or a decoration's "Move it": this tap says where it stands)
      const err = typeof moving === "object" ? placeDecor(game, moving.decor, x, y) : placeBuilding(game, moving, x, y);
      if (err) { toast(t(err), { error: true }); return; }
      moving = null;
      sfx("common");
      saveGame();
      return;
    }
    if (inFarm() && !pressed) {
      const bt = buildingsOn(game).find((b) => { const im = yimg(structureArt(b.id, b.tier).file); const w = im ? im.width : 32, hh = im ? im.height : 32; return Math.abs(x - b.x) < w * 0.35 && y > b.y - hh * 0.9 && y < b.y + 3; }); // (squarely on it)
      const stood = !bt && farmStanding().find(([id, at]) => { const pic = id.startsWith("decor:") ? decorPic(id.slice(6)) : id === "scarecrow" ? yimg(PROPS.scarecrow.art) : yimg(`farm/${id}.png`); const w2 = pic ? pic.width : 16, h2 = pic ? pic.height : 16; return Math.abs(x - at.x) < w2 / 2 && y > at.y - h2 && y < at.y + 4; });
      if (stood) { // (slice 5: the windmill grinds; a decoration moves or goes away; the rest say what they do)
        const [id, at] = stood;
        sfx("tick");
        if (id.startsWith("decor:")) decorCard(at.i, { changed: () => paintHud() });
        else if (id === "windmill") windmillCard({ changed: () => paintHud() });
        else upgradeCard(id);
        return;
      }
      if (bt) {
        const p = garden(game).plots[bt.i];
        if (!automated(game) && p.stored >= 1) { // glow waiting: gathered with a tap, as on the old plots
          collect(game, bt.i);
          for (let k = 0; k < 4; k++) floats.push({ img: art.glowIcon, x: bt.x - 12 + Math.random() * 16, y: bt.y - 40 + Math.random() * 8, t: -k * 0.1 });
          sfx("lucky");
          saveGame();
          settle(toScreen(bt.x, bt.y - 30));
          paintHud();
        } else openBuilding(game, bt.i, () => paintHud());
        return;
      }
      const [fw, fh] = fieldSize(game);
      const w = tapFarm(x, y, fw, fh);
      if (w.kind === "plot") { tapSpot(w.c, w.r); return; }
      if (w.kind === "gate" || x > FARM_WALK.x1 + 8 - FARM_EDGE) { if (isEgg()) useThing("yardgate"); else walkTo(FARM_IN, "use:yardgate"); return; } // (back to the yard: its gate, or anywhere along the right edge)
      if (w.kind === "barn") { const door = { x: BARN.door.tx * 16 + 8, y: (BARN.y0 + BARN.h) * 16 + 6 }; if (isEgg()) useThing("barn"); else walkTo(door, "use:barn"); return; }
      if (w.kind === "seeds") { if (isEgg()) useThing("seeds"); else walkTo({ x: SEED_STAND.x, y: SEED_STAND.y + 6 }, "use:seeds"); return; }
      if (w.kind === "fence") { sfx("tick"); openFence({ changed: () => { yardDirty = true; paintHud(); } }); return; }
      if (!isEgg()) walkTo(clampToFloor({ x, y }, FARM_WALK));
      return;
    }
    // Inside the hall (hall.js): its door goes back out, the counter is where it signs up, the floor is walked on.
    if (inHall() && !pressed) {
      const w = tapHall(x, y);
      if (w === "door") { sfx("tick"); goThrough("yard"); return; }
      if (w === "counter") { if (isEgg()) useThing("register"); else walkTo(COUNTER_SPOT, "use:register"); return; }
      if (!isEgg()) walkTo(clampToFloor({ x, y }, HALL_WALK));
      return;
    }
    // The room (prototype "habitat_room"): a tap on the floor walks it there, on the door takes it out; on it, a pet.
    if (inRoom() && !pressed && tapIn(x, y) === "door") { sfx("tick"); goThrough("yard"); return; } // (even with the creature in front of it)
    if (inRoom() && !pressed && !onCreature(x, y)) {
      // the aquarium: it walks over and watches the fish, then your basket opens
      if (roomTank().length && Math.abs(x - TANK_IN.x) < 18 && y < TANK_IN.y + 3 && y > TANK_IN.y - 30) {
        if (isEgg()) go("basket"); else walkTo({ x: TANK_IN.x, y: TANK_IN.y + 8 }, "use:tank");
        return;
      }
      // (the door, above: straight out from anywhere in the room, the owner: "Clicking on the door once should just
      // bring the creature straight outside"); anywhere else, it walks there
      const where = tapIn(x, y);
      if (!isEgg()) walkTo({ x, y: where === "floor" ? y : ROOM.walk.y0 });
      return;
    }
    // Outside, the cottage's door: straight in (even with the creature standing in front of it).
    if (inYard() && !pressed && shrineTier(game) && Math.abs(x - SHRINE.x) < 18 && y > SHRINE.y - 44 && y < SHRINE.y + 4) { // the Star Shrine
      if (isEgg()) useThing("shrine"); else walkTo({ x: SHRINE.x, y: SHRINE.y + 10 }, "use:shrine");
      return;
    }
    if (inYard() && farmOn() && !pressed && (x < FARM_EDGE || (Math.abs(x - FARM_DOOR.x) < 18 && y > FARM_DOOR.y - 38 && y < FARM_DOOR.y + 6))) { // the farm: its gate, or anywhere along the yard's left edge
      if (isEgg()) useThing("farmgate"); else walkTo(FARM_DOOR, "use:farmgate");
      return;
    }
    if (inYard() && !pressed && tapYard(x, y) === "door") { sfx("tick"); goThrough("room"); return; }
    // A gift or an egg on the ground.
    const th = !pressed && !inRoom() && things.find((it) => it.kind !== "glow" && !(outside() && it.kind === "gift") && Math.abs(x - it.x) < 13 && y > baseY("thing", it.x) - 34 && y < baseY("thing", it.x) + 6);
    if (th && th.kind === "gift") { openGift(th.gift, th.x); return; }
    if (th && th.kind === "egg") { if (th.ready) hatchAway(th); else go("creatures"); return; }
    // a pat (in the room and the old scenes; outside a tap on it just walks there: the owner, "clicking the creature
    // shouldnt give you word popup boxes once it leaves the house")
    if (pressed || (!outside() && Math.abs(x - cx) < 30)) {
      pet.napUntil = 0; // (a pat wakes it from a nap)
      cheer("pet");
      sfx("pet");
      sayWord();
      showAbout();
    }
    else if (outside() && Math.abs(x - MAILBOX.x) < 10 && y > MAILBOX.y - 26 && y < MAILBOX.y + 4) { // the mailbox
      if (isEgg()) useThing("mail"); else walkTo({ x: MAILBOX.x + 12, y: MAILBOX.y + 6 }, "use:mail");
    }
    else if (outside() && stationAt(x, y)) { // the village: a stall, a door or the pier; it walks there and it opens
      const st = stationAt(x, y);
      if (isEgg()) openStation(st); else walkTo({ x: st.x, y: st.y }, `go:${st.id}`);
    }
    else if (outside() && !isEgg()) walkTo(clampToFloor({ x, y }, YARD_WALK)); // anywhere else outside: it walks there
  });

  const stop = onGame((result) => {
    if (result.type === "sync") { Object.assign(shown, wallet(game)); paintCounters(); paintHud(); return; } // a newer save arrived from another device
    paintHud();
    for (const id of result.badges || []) badgeToast(id);
    if (result.stage === "grown") toast(t("Your creature is fully grown! It left you a new egg and {0} coins.", FULLY_GROWN_COINS)).prepend(h(icon("egg")), " ");
    if (result.stage) {
      const x = result.stage === "hatchling" ? W / 2 : pet.x;
      bursts.push({ id: { hatchling: "hatch", grown: "evolve" }[result.stage] || "levelup", x, y: HABITAT.ground - 30, t: 0 });
      if (result.stage === "hatchling") pet.x = W / 2;
      sfx("jackpot");
    } else if (result.levelUp) {
      bursts.push({ id: "levelup", x: pet.x, y: HABITAT.ground - 30, t: 0 });
      emote("idea", 2.4);
    }
    if (result.type !== "study" || result.goalDone) cheer(result.goalDone ? "jackpot" : result.tier); // quiet while time ticks by
  });

  function dispose() {
    disposed = true;
    window.removeEventListener("tamkeen-farm-move", onMove);
    cancelAnimationFrame(raf);
    clearInterval(timer);
    clearInterval(gardenTimer);
    clearInterval(onlineTimer);
    clearTimeout(sayTimer);
    clearTimeout(aboutTimer);
    store.set(`${SEEN_KEY}.ring`, { day: game.day.key, frac: goalRing(game).frac });
    stop();
  }
  paintCounters();
  paintHud();
  // What came in while the card was away flies in once it is on screen.
  setTimeout(() => { if (disposed) return; live = true; settle(); }, 900);
  loop();
  return { el, dispose };
}
