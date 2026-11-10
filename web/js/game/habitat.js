// The creature's home card at the bottom of Home: a small living scene, and under it a thin level bar,
// two currencies and the goal streak, and four big tiles (Battle, Creatures, Shop, Garden).
//
// It is learnt by playing rather than by reading (the owner, 2026-11-06): the day's goal is a ring on the
// ground around the creature that fills as you study, its hearts float over its head, buildings glow when
// their glow is ready and are gathered with a tap, a friend's gift waits in the scene to be opened, and
// what you earn flies into the counter that keeps it (fly.js). A red dot on a tile says something waits
// there (homecard.js). The long explanations (info.js) stay a hold, or a "?" in each sheet, away.

import { api, h, toast } from "../app.js";
import { detectLanguage, setLang } from "../languages.js";
import { openModal } from "../components/modal.js";
import { icon as lineIcon } from "../icons.js";
import * as social from "../social.js";
import { EMOTES, FX_FRAMES, GROWN, HABITAT, PLOTS, SCENES, SHADOW, STAGES, TYPES, beastById } from "./data.js";
import { automated, collect, garden, hearts, tick as gardenTick } from "./idle.js";
import { describe, formOf, isGrown, stageOf } from "./genome.js";
import { t, uiLanguage } from "../i18n.js";
import { badgeToast, openBattleMenu } from "./battle-ui.js";
import { publishNow } from "./friends-game.js";
import { FULLY_GROWN_COINS, GOALS, checkBadges, levelOf, receiveGift } from "./rules.js";
import { FRAME, animAt, beastHeight, composeCreature, drawLiving, drawSheet, drawingOf, dressEgg, icon, loadImage } from "./render.js";
import { checkAnki, getGame, onGame, rollNumber, saveGame, sfx } from "./game.js";
import { openShop } from "./shop.js";
import { openEarned, openEvolution } from "./info.js";
import { cleanName } from "./remote.js";
import { KINDS, SHOP_SEEN_KEY, collectables, gains, goalRing, nextScene, ringPixels, tileDots, wallet } from "./homecard.js";
import { fly } from "./fly.js";

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

/** Build the habitat section. Returns {el, dispose}. */
export function habitat() {
  const game = getGame();
  const el = h(`<section class="habitat card">
    <div class="habitat-scene"><canvas width="${W}" height="${H}" aria-label="Your creature's habitat" role="button" tabindex="0"></canvas>
      <button type="button" class="habitat-name" title="Its name and how it grows"></button>
      <span class="habitat-about" hidden></span>
      <button type="button" class="scene-arrow prev" title="Another habitat" aria-label="Previous habitat">${lineIcon("chevron", 18)}</button>
      <button type="button" class="scene-arrow next" title="Another habitat" aria-label="Next habitat">${lineIcon("chevron", 18)}</button>
      <span class="scene-label" hidden></span>
      <button type="button" class="goal-ring" id="g-goal" title="Today's goal: tap to change it"></button>
      <div class="pet-word" hidden><b></b><span></span></div></div>
    <div class="habitat-hud">
      <button type="button" class="hud-lv" id="g-lv" title="Your level: tap to see how XP works"><span class="hud-lv-n">Lv <b id="g-level"></b></span>
        <span class="hud-bar thin"><i id="g-xpbar"></i></span></button>
      <div class="hud-wallet">
        <button type="button" class="hud-count cur-coin" id="g-coins" title="Coins: tap for the shop, hold to learn more">${icon("coin")}<b></b></button>
        <button type="button" class="hud-count cur-gem" id="g-gems" title="Gems: tap for supplies, hold to learn more">${icon("gem")}<b></b></button>
        <button type="button" class="hud-count cur-streak" id="g-streak" title="Goal streak: days in a row you reached your daily goal">
          <span class="streak-pic">${icon("streak")}<span class="freeze-badge" hidden>${icon("freeze_badge", 9)}</span></span><b></b></button>
      </div>
      <div class="hud-actions hud-tiles">
        ${tile("battle", "battle", "Battle")}${tile("creatures", "nav_roster", "Creatures")}
        ${tile("shop", "nav_shop", "Shop")}${tile("garden", "structure/word_sprout_2", "Garden")}
      </div>
    </div>
  </section>`);
  const $ = (q) => el.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const scene = () => (HABITAT.themes.includes(game.scene) ? game.scene : HABITAT.themes[0]);
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
  const toScreen = (x, y) => { const r = canvas.getBoundingClientRect(); return { x: r.left + (x / W) * r.width, y: r.top + (y / H) * r.height }; };
  const creaturePoint = () => (isEgg() ? toScreen(W / 2, HABITAT.ground - 18) : toScreen(pet.x, HABITAT.ground - beastHeight(describe(game.creature)) / 2));
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
    const stage = formOf(game.creature);
    const name = $(".habitat-name");
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
    paintHud();
  }
  const go = (tab) => openShop(tab, () => paintHud());
  let vocab = null; // the owner's saved words, once they have loaded
  const loadVocab = () => api("/vocab").then((words) => { vocab = words; return words; });
  const vocabReady = loadVocab().then((words) => { checkBadges(game, { words: words.length }); gardenBeat(); }).catch(() => {});

  // The level bar explains XP; coins and gems open where they are spent, and explain themselves when held.
  $("#g-lv").onclick = () => openEarned("xp", game, go);
  holdable($("#g-coins"), () => go("shop"), () => openEarned("coin", game, go));
  holdable($("#g-gems"), () => go("supplies"), () => openEarned("gem", game, go));
  holdable($("#g-streak"), () => openEarned("streak", game, go), () => openEarned("freeze", game, go));
  $("#g-shop").onclick = () => go("shop");
  $("#g-creatures").onclick = () => go("creatures");
  $("#g-garden").onclick = () => go("garden");
  $("#g-battle").onclick = () => openBattleMenu({ changed: () => paintHud(), waiting: online.gifts.length + online.battles });
  $("#g-goal").onclick = () => goalBox();
  $(".habitat-name").onclick = () => nameBox();

  // The arrows at the scene's sides: another habitat. Its name shows for a moment.
  const sceneLabel = $(".scene-label");
  let labelTimer = 0;
  const moveTo = (dir) => {
    game.scene = nextScene(HABITAT.themes, scene(), dir);
    saveGame();
    sceneLabel.textContent = SCENES[scene()];
    sceneLabel.hidden = false;
    sceneLabel.classList.remove("show");
    void sceneLabel.offsetWidth;
    sceneLabel.classList.add("show");
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => { sceneLabel.hidden = true; }, 1600);
  };
  $(".scene-arrow.prev").onclick = () => moveTo(-1);
  $(".scene-arrow.next").onclick = () => moveTo(1);

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
  const files = { sun: "habitat/sun.png", moon: "habitat/moon.png", cloud1: "habitat/cloud_1.png", cloud2: "habitat/cloud_2.png",
                  heart: "fx/heart.png", zzz: "fx/zzz.png", star: "fx/star.png" };
  for (const theme of HABITAT.themes) for (const layer of HABITAT.layers) files[`${theme}_${layer}`] = `habitat/${theme}/${layer}.png`;
  for (const id of EMOTES) files[`emote_${id}`] = `fx/emote_${id}.png`;
  files.rain = "habitat/rain.png";
  for (const id of Object.keys(FX_FRAMES)) files[id] = `fx/${id}.png`;
  for (const size of Object.keys(SHADOW)) files[`shadow_${size}`] = `fx/shadow_${size}.png`;
  files.glowIcon = "icon/glow.png";
  files.gift = "icon/gift.png";
  for (const [k, f] of Object.entries(files)) loadImage(f).then((img) => { art[k] = img; });
  const plotArt = {}; // building picture by file name
  const eggArt = {};  // egg picture by element (a spare egg in the incubator)

  const pet = { x: W / 2, dir: 1, target: W / 2, wait: 2, mood: "", moodT: 0, hop: 0, emote: "", emoteT: 0, idleT: 6,
                walkMs: 0, fly: false, air: 0, stand: 0 }; // (walkMs: how far its walk or wing beat has got; fly: this trip is flown; air: 0 on the ground .. 1 up; stand: 0 lying .. 1 up, for one that gets up to walk)
  const FLY_UP = 9; // about how high its fly frames hold it (anim.py `lift`): it rises to that and sinks back from it
  const canFly = (look) => { const f = drawingOf(look); return !!(f.anims && f.anims.fly); };
  // A creature that rests lying down (the forest stag) gets up before it walks and lies back down when it stops: its
  // `rise` frames, forwards then backwards. How long that takes (0: it has none).
  const riseMs = (look) => { const r = drawingOf(look).anims.rise; return r ? r.ms.reduce((s, v) => s + v, 0) : 0; };
  const emote = (id, secs = 1.8) => { if (id) { pet.emote = id; pet.emoteT = secs; } };
  // It rains on about one day in four (the same days for everyone, so it is weather and not a glitch).
  const rainy = () => { const d = new Date(); return (d.getDate() * 7 + d.getMonth()) % 4 === 0; };
  const decorArt = {}; // decoration id -> image
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
    const x = look.stage === "egg" ? W / 2 : pet.x;
    say.style.left = `${(Math.max(sayHalf + 2, Math.min(W - sayHalf - 2, x)) / W) * 100}%`;
    say.style.bottom = `${(Math.min(H - sayTall - 2, H - HABITAT.ground + top + pet.hop) / H) * 100}%`;
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
      composeCreature(look, pose).then((c) => { frames[key] = c; });
    }
    return frames[key] || Object.values(frames).find(Boolean) || null;
  }

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
  const goalLabel = $("#g-goal");
  let labelAt = "";

  function tick(dt, now) {
    const look = refreshLook();
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const night = hour < 6 || hour >= 20;
    const asleep = night && !pet.moodT;
    // Wander: walk to a spot, wait, pick another. Eggs just wobble.
    if (look.stage !== "egg" && !asleep) {
      if (pet.wait > 0) pet.wait -= dt;
      else if (Math.abs(pet.target - pet.x) < 1) {
        pet.wait = 1.5 + Math.random() * 4;
        pet.target = 40 + Math.random() * (W - 80);
        // A winged creature flies some of its longer trips.
        pet.fly = canFly(look) && Math.abs(pet.target - pet.x) > 70 && Math.random() < 0.4;
      } else {
        pet.dir = pet.target > pet.x ? 1 : -1;
        const flying = pet.fly && canFly(look);
        const rise = !flying && riseMs(look);
        if (rise && pet.stand < 1) pet.stand = Math.min(1, pet.stand + (dt * 1000) / rise); // (getting up first)
        else {
          if (flying) pet.air = Math.min(1, pet.air + dt * 3); // up it goes, then across
          if (!flying || pet.air > 0.6) pet.x += pet.dir * (look.size === "s" ? 14 : 20) * (flying ? 1.6 : 1) * dt;
          pet.walkMs += dt * 1000;
        }
      }
    }
    const settle = riseMs(look);
    if (pet.stand > 0 && settle && (pet.wait > 0 || asleep)) pet.stand = Math.max(0, pet.stand - (dt * 1000) / settle); // lying back down
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
    ctx.clearRect(0, 0, W, H);
    const here = scene();
    if (art[`${here}_sky`]) ctx.drawImage(art[`${here}_sky`], 0, 0);
    const arc = (hour >= 6 && hour < 20 ? (hour - 6) / 14 : ((hour + 4) % 24) / 10);
    const orb = night ? art.moon : art.sun;
    if (orb) ctx.drawImage(orb, Math.round(20 + arc * (W - 64)), Math.round(34 - Math.sin(arc * Math.PI) * 26));
    if (art.cloud1) ctx.drawImage(art.cloud1, Math.round(((now / 90) % (W + 60)) - 50), 16);
    if (art.cloud2) ctx.drawImage(art.cloud2, Math.round(((now / 140 + 150) % (W + 40)) - 36), 34);
    for (const layer of ["far", "mid", "ground"]) if (art[`${here}_${layer}`]) ctx.drawImage(art[`${here}_${layer}`], 0, 0);
    if (art.rain && rainy()) {
      const fall = Math.floor(now / 14) % 32; // the tile repeats, sliding down and a little to the left
      for (let x = 0; x < W + 32; x += 32) for (let y = -32; y < H; y += 32) ctx.drawImage(art.rain, x - Math.floor(fall / 2), y + fall);
    }
    if (dark) { ctx.fillStyle = `rgba(20, 12, 48, ${dark})`; ctx.fillRect(0, 0, W, H); }

    const groundY = HABITAT.ground;
    const sparkle = Math.floor(now / 170) % FX_FRAMES.ready; // the "ready" twinkle over things to collect
    // Decorations stand on the ground, behind the creature.
    for (const d of game.decor) {
      if (!(d.id in decorArt)) { decorArt[d.id] = null; loadImage(`${d.id}.png`).then((img) => { decorArt[d.id] = img; }); }
      const img = decorArt[d.id];
      if (img) ctx.drawImage(img, Math.round(d.x - img.width / 2), groundY - img.height + 2);
    }
    // Building plots: an empty plot, or the building on it. A building with glow waiting glows, twinkles and
    // has a light bobbing over it: tap it to gather.
    const plots = garden(game).plots;
    const glowing = [];
    for (let i = 0; i < PLOTS.length; i++) {
      const p = plots[i];
      if (!p.open) continue;
      const file = p.tier ? `structure/${p.id}_${p.tier}.png` : "structure/plot.png";
      if (!(file in plotArt)) { plotArt[file] = null; loadImage(file).then((img) => { plotArt[file] = img; }); }
      const img = plotArt[file];
      if (!img) continue;
      const x = Math.round(PLOTS[i].x - img.width / 2);
      const y = groundY - img.height + 3;
      ctx.drawImage(img, x, y);
      if (p.tier && p.stored >= 1) glowing.push({ img, x, y, i });
    }
    if (dark && (game.decor.length || plots.some((p) => p.open))) { ctx.fillStyle = `rgba(20, 12, 48, ${dark * 0.6})`; ctx.fillRect(0, groundY - 48, W, 50); }
    for (const b of glowing) { // (over the night's shade: a ready building lights up the dark)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.22 + 0.16 * Math.sin(now / 320 + b.i);
      ctx.drawImage(b.img, b.x, b.y);
      ctx.restore();
      if (art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, (sparkle + b.i) % FX_FRAMES.ready, PLOTS[b.i].x, b.y + b.img.height / 2);
      if (art.glowIcon) ctx.drawImage(art.glowIcon, PLOTS[b.i].x - 8, b.y - 14 + Math.round(Math.sin(now / 300 + b.i) * 2));
    }
    // A friend's gift and an egg from the incubator wait on the ground, between the plots.
    for (const th of things) {
      if (th.kind === "gift" && art.gift) {
        const jump = Math.floor(now / 1400) % 2 ? 0 : Math.round(Math.abs(Math.sin(now / 120)) * 3); // a little hop now and then
        ctx.drawImage(art.gift, th.x - 8, groundY - 15 - jump);
        if (art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, th.x, groundY - 10);
      } else if (th.kind === "egg") {
        const spare = game.roster[th.index];
        const img = spare && eggOf(spare.type);
        if (!img) continue;
        const shake = th.ready ? Math.sin(now / 70) * 2 : Math.sin(now / 260) * (th.progress > 0.8 ? 2 : 0.6);
        ctx.save();
        ctx.translate(Math.round(th.x + shake), groundY);
        ctx.drawImage(img, -16, -32);
        const n = th.ready ? 2 : Math.min(2, Math.floor(th.progress * 4) - 1);
        if (n >= 0 && cracks[n]) ctx.drawImage(cracks[n], -16, -32);
        ctx.restore();
        if (th.ready && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, th.x, groundY - 16);
      }
    }

    // The goal ring round the creature's feet: its back half behind the creature, its front half in front.
    const cx = look.stage === "egg" ? W / 2 : pet.x;
    const ring = goalRing(game);
    ringShown += (ring.frac - ringShown) * Math.min(1, dt * 3);
    if (Math.abs(ring.frac - ringShown) < 0.002) ringShown = ring.frac;
    const ringPic = ringArt(ringShown, ring.done && ringShown >= 0.999);
    const rx0 = Math.round(cx) - RING.rx - 1;
    const ry0 = groundY + RING.dy - RING.ry - 1;
    ctx.drawImage(ringPic.back, rx0, ry0);

    if (look.stage === "egg") {
      // Near hatching it shakes harder and twinkles: something is about to happen.
      const near = game.creature.growth / STAGES[1].from >= 0.85;
      const wobble = Math.sin(now / (near ? 90 : 260)) * (pet.mood ? 3 : near ? 2 : 1);
      if (egg) {
        ctx.save();
        ctx.translate(Math.round(W / 2 + wobble), groundY);
        ctx.drawImage(egg, -egg.width / 2, -egg.height - Math.round(pet.hop)); // (a dressed egg is bigger: hat and wings)
        // Cracks spread as the egg nears hatching.
        const n = Math.min(2, Math.floor((game.creature.growth / STAGES[1].from) * 4) - 1);
        if (n >= 0 && cracks[n]) ctx.drawImage(cracks[n], -16, -32 - Math.round(pet.hop));
        ctx.restore();
        if (near && art.ready) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, W / 2, groundY - 18);
      }
    } else {
      // Its frame: flying (taking off and landing too), walking, or still (breathing, now and then a blink;
      // slower asleep).
      const moving = pet.wait <= 0 && !asleep && Math.abs(pet.target - pet.x) >= 1;
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
      if (frame && shadow) ctx.drawImage(shadow, Math.round(body - shadow.width / 2), groundY - Math.floor(shadow.height / 2)); // stays on the ground through a hop
      if (frame) {
        ctx.save();
        ctx.translate(Math.round(pet.x), groundY - Math.round(pet.hop) + sink);
        if (pet.dir < 0) ctx.scale(-1, 1);
        drawLiving(ctx, frame, look, now); // (as drawImage(frame, -FRAME / 2, -FRAME), with a colouring's particles)
        ctx.restore();
      }
      // (higher while it stands up to walk; a flight rises by its own reckoning: FLY_UP)
      const top = groundY - beastHeight(look, pose.anim === "fly" ? null : pose.anim) - Math.round(pet.hop) - Math.round(pet.air * FLY_UP);
      const bubble = pet.emoteT > 0 && art[`emote_${pet.emote}`];
      if (bubble) ctx.drawImage(bubble, Math.round(pet.x + pet.dir * 12 - 6), top);
      else if (asleep && art.zzz && Math.floor(now / 900) % 2) ctx.drawImage(art.zzz, Math.round(pet.x + 10), top + 4 - (Math.floor(now / 300) % 3));
      else if (say.hidden && art.heart) {
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
    if (ring.done && art.ready && ringShown >= 0.999 && Math.floor(now / 2400) % 3 === 0) drawSheet(ctx, art.ready, FX_FRAMES.ready, sparkle, cx, groundY + 2);
    // The ring's "4 / 10 min" sits inside its front half (a button over the picture).
    const at = `${((cx / W) * 100).toFixed(2)}|${(((groundY + RING.dy + 6) / H) * 100).toFixed(2)}`;
    if (at !== labelAt) {
      labelAt = at;
      const [lx, ly] = at.split("|");
      goalLabel.style.left = `${lx}%`;
      goalLabel.style.top = `${ly}%`;
    }

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
    if (pending && (pendingT -= dt) < 0) { pendingT = 0.5; if (!document.querySelector(OVERLAYS)) settle(); }
  }

  // Animation frames pause in a hidden window, so a slow timer keeps the scene honest there.
  function loop() {
    if (disposed) return;
    if (!el.isConnected && seen) { dispose(); return; } // the page was left
    seen = seen || el.isConnected;
    const now = performance.now();
    tick(Math.min(0.1, (now - last0) / 1000), now);
    last0 = now;
    raf = requestAnimationFrame(loop);
  }
  timer = setInterval(() => { if (document.hidden) { const now = performance.now(); tick(0.1, now); last0 = now; } }, 1000);
  const gardenTimer = setInterval(gardenBeat, 5000);

  function cheer(kind) {
    pet.mood = "happy";
    pet.moodT = kind === "jackpot" ? 3 : 1.4;
    const y = HABITAT.ground - (isEgg() ? 36 : 50);
    const x = isEgg() ? W / 2 : pet.x;
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
      bursts.push({ id: "burst_lucky", x, y: HABITAT.ground - 10, t: 0 });
      // What came out flies to where it is kept: an egg to Creatures, a thing to wear to the Shop's My things.
      fly(got && got.kind === "egg" ? "egg" : "gift", toScreen(x, HABITAT.ground - 8), $(got && got.kind === "egg" ? "#g-creatures .px-icon" : "#g-shop .px-icon"));
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
    bursts.push({ id: "hatch", x: th.x, y: HABITAT.ground - 16, t: 0 });
    fly("nav_roster", toScreen(th.x, HABITAT.ground - 16), $("#g-creatures .px-icon"));
    toast(t("It hatched! Bring it out on the Creatures page.")).prepend(h(icon("egg")), " ");
    paintHud();
  }
  // Pressed rather than tapped (Enter or Space on the keyboard, A on a game controller, which come with no
  // place on the picture): the creature itself is tapped.
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); canvas.click(); }
  });
  const scenePoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onCreature = (x, y) => Math.abs(x - (isEgg() ? W / 2 : pet.x)) < 30 && y <= HABITAT.ground + 2;
  // Held on the creature: how it grows (the evolution page).
  let holdTimer = 0;
  let heldDown = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    heldDown = false;
    const p = scenePoint(e);
    clearTimeout(holdTimer);
    if (onCreature(p.x, p.y)) holdTimer = setTimeout(() => { heldDown = true; openEvolution(game, go); }, HOLD_MS);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) canvas.addEventListener(ev, () => clearTimeout(holdTimer));
  canvas.addEventListener("contextmenu", (e) => { const p = scenePoint(e); if (onCreature(p.x, p.y)) { e.preventDefault(); clearTimeout(holdTimer); if (!heldDown) openEvolution(game, go); heldDown = true; } });
  canvas.addEventListener("click", (e) => {
    if (heldDown) { heldDown = false; return; }
    const pressed = e.detail === 0 && !e.clientX && !e.clientY;
    const p = pressed ? { x: isEgg() ? W / 2 : pet.x, y: 0 } : scenePoint(e);
    const { x, y } = p;
    const cx = isEgg() ? W / 2 : pet.x;
    // The ring's front, below the feet: the goal.
    const ry = (y - (HABITAT.ground + RING.dy)) / RING.ry;
    if (!pressed && y > HABITAT.ground + 2 && ((x - cx) / RING.rx) ** 2 + ry ** 2 <= 1.4) { goalBox(); return; }
    // A gift or an egg on the ground.
    const th = !pressed && things.find((it) => it.kind !== "glow" && Math.abs(x - it.x) < 13 && y > HABITAT.ground - 34 && y < HABITAT.ground + 6);
    if (th && th.kind === "gift") { openGift(th.gift, th.x); return; }
    if (th && th.kind === "egg") { if (th.ready) hatchAway(th); else go("creatures"); return; }
    // A building with glow waiting is gathered with a tap; an empty plot opens the garden.
    const plots = garden(game).plots;
    const hit = pressed ? -1 : PLOTS.findIndex((spot, i) => plots[i].open && Math.abs(x - spot.x) < 16 && y > HABITAT.ground - 50);
    if (hit >= 0 && plots[hit].stored >= 1) {
      collect(game, hit);
      for (let i = 0; i < 4; i++) floats.push({ img: art.glowIcon, x: PLOTS[hit].x - 12 + Math.random() * 16, y: HABITAT.ground - 40 + Math.random() * 8, t: -i * 0.1 });
      sfx("lucky");
      saveGame();
      things = collectables(game, { gifts: online.gifts });
      settle(toScreen(PLOTS[hit].x, HABITAT.ground - 30)); // the glow flies from the building to the Garden tile
      paintHud();
      return;
    }
    if (hit >= 0 && !plots[hit].tier && Math.abs(x - pet.x) > 24) { go("garden"); return; }
    if (pressed || Math.abs(x - cx) < 30) {
      cheer("pet");
      sfx("pet");
      sayWord();
      showAbout();
    }
    else if (!isEgg()) { pet.target = Math.max(30, Math.min(W - 30, x)); pet.wait = 0; } // "come here"
  });

  const stop = onGame((result) => {
    if (result.type === "sync") { Object.assign(shown, wallet(game)); paintCounters(); paintHud(); return; } // a newer save arrived from another device
    paintHud();
    for (const id of result.badges || []) badgeToast(id);
    if (result.stage === "grown") toast(t("Your creature is fully grown! It left you a new egg and {0} coins.", FULLY_GROWN_COINS)).prepend(h(icon("egg")), " ");
    if (result.stage) {
      const x = result.stage === "hatchling" ? W / 2 : pet.x;
      bursts.push({ id: { hatchling: "hatch", grown: "evolve" }[result.stage] || "levelup", x, y: HABITAT.ground - 30, t: 0 });
      if (result.stage === "hatchling") pet.x = pet.target = W / 2;
      sfx("jackpot");
    } else if (result.levelUp) {
      bursts.push({ id: "levelup", x: pet.x, y: HABITAT.ground - 30, t: 0 });
      emote("idea", 2.4);
    }
    if (result.type !== "study" || result.goalDone) cheer(result.goalDone ? "jackpot" : result.tier); // quiet while time ticks by
  });

  function dispose() {
    disposed = true;
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
