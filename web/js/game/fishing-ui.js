// The pond: fishing as it is played (the rules are fishing.js; the Fishing screens of the game sheet, with the
// basket, the aquarium, the rods and the Fishdex, are fishscreen.js).
//
// A full-screen scene like a live battle's: the creature out in the habitat stands on a little dock with a rod, and
// each word due for review is a fish shadow in the water (a bigger shadow is a luckier fish). Tap the water (or
// press Cast) and it casts; the nearest shadow comes over, nibbles and bites, and that word's card comes up: its
// meaning, four words to choose from, the same card as in a battle. Right: the fish is hooked and rolled on the ten
// tiers (loot.js); a Legendary or better fights back with one or two more cards. Wrong, or too slow: it gets away.
// Every answer is recorded as a review, exactly as battles record theirs (fishing.record). A landed fish's tier is
// shown by the shared reveal (reveal.js, the same one the flashcards play), with the fish on its tile; until it has
// landed nothing on screen gives the tier away (a fighting fish glows the same pale gold whatever it is).
//
// The creature's own fishing frames (cast, wait, reel, catch, cheer) aren't drawn yet: it plays whichever of those
// actions its drawing has (render.animAt falls back to its idle), and the rod, the line and the little hop of a
// cheer are drawn here, so the scene already reads as fishing.

import { api, h, state as appState, toast } from "../app.js";
import { t } from "../i18n.js";
import { detectLanguage, setLang } from "../languages.js";
import { icon as lineIcon } from "../icons.js";
import { openModal } from "../components/modal.js";
import { plan, states } from "../review/deck.js";
import { snippetPlayer } from "../snippetplayer.js";
import { cardSayer, stopDevice } from "../voiceplay.js";
import { dayNumber as reviewDay } from "../review/fsrs.js";
import { HABITAT, TYPES } from "./data.js";
import { describe } from "./genome.js";
import { dayNumber, pickQuestion } from "./rules.js";
import { FRAME, animAt, beastHeight, beastOrigin, composeCreature, drawLiving, drawingOf, dressEgg, icon, loadImage } from "./render.js";
import { getGame, saveGame, sfx, trackStudy } from "./game.js";
import { battleDictionary } from "./battle-ui.js";
import { EPIC, TIERS, golden, isBoss } from "./loot.js";
import { reveal } from "./reveal.js";
import { RODS, SHADOWS } from "./fishdata.js";
import {
  canFish, classify, escape, escapedIn, fightLength, fishById, fishingOf, hook, land, luckOf, pondById, pondNeed, pondShadows, questionFor, record,
  tierOfRoll, PONDS,
} from "./fishing.js";
import { SPRITE, fishPicture, fishSprite, fishTile } from "./fishart.js";

const W = 320;
const H = 180;
const LIFT = HABITAT.ground - 100;   // the habitat's backdrop is drawn this much higher: its ground becomes the bank
const WATER_Y = 104;                 // where the water starts
const CX = 50;                       // the creature stands here, on the dock...
const FEET_Y = 111;                  // ...with its feet on this line
const DOCK = [14, 99];               // where the dock's picture goes (its top-left)
const SWIM = { x0: 104, x1: 306, y0: 124, y1: 170 }; // where shadows swim
const ROD_LEN = 36;
const QUIZ_S = 12;                   // seconds to answer a bite before the fish gets away
const KEYS = ["1", "2", "3", "4"];
const FIGHT_GLOW = "#fff2a8";        // the glow of a fish that fights back (the same for every tier: no giving it away)
const rand = Math.random;
const lerp = (a, b, p) => a + (b - a) * p;
const ease = (p) => p * p * (3 - 2 * p);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const uidOf = (v) => String(v.uid || v.id);

/** The saved words, and which of them the flashcards have due for review now (a Set of word ids). */
async function loadWords() {
  let vocab = [];
  let log = {};
  try { vocab = await api("/vocab"); } catch { /* shown as an empty pond */ }
  try { log = (await api("/reviews")).reviews || {}; } catch { /* the game's own record decides alone */ }
  let flashDue = new Set();
  try { flashDue = new Set(plan(vocab, states(log), reviewDay(), 0).due.map(uidOf)); } catch { /* as above */ }
  return { vocab, flashDue };
}

/** How many fish are waiting: the words due for review (what the Home tile shows). Resolves to a number. */
export async function fishWaiting(game = getGame()) {
  const { vocab, flashDue } = await loadWords();
  if (!canFish(game, vocab)) return 0;
  return pondShadows(game, vocab, { pond: fishingOf(game).pond, flashDue, boss: (uid) => isBoss(game, uid) }).due;
}

/** The water of a pond, painted once: bands from the far light water to the near deep water, dithered between. */
function waterArt(pond) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H - WATER_Y;
  const g = c.getContext("2d");
  const [deep, mid, light] = pond.water;
  const bands = [[0, light], [7, mid], [30, deep]];
  for (let y = 0; y < c.height; y++) {
    let colour = deep;
    for (const [from, col] of bands) if (y >= from) colour = col;
    g.fillStyle = colour;
    g.fillRect(0, y, W, 1);
  }
  // (a checker row or two where one band meets the next, so the change isn't a hard line)
  for (const [from, col] of bands.slice(1)) {
    g.fillStyle = col;
    for (const dy of [-2, -1]) for (let x = (dy + from) & 1; x < W; x += dy === -2 ? 4 : 2) g.fillRect(x, from + dy, 1, 1);
  }
  return c;
}

/**
 * Open the pond. `opts.pond`: which one (default: the one last fished, if it is still open). `opts.changed()` runs
 * when something was earned; `opts.sheet(section)` opens a section of the game sheet (the pond closes first).
 * Returns close().
 */
export function openPond(opts = {}) {
  const game = getGame();
  const F = fishingOf(game);
  const changed = opts.changed || (() => {});
  let pondId = opts.pond && pondNeed(game, opts.pond).open ? opts.pond : pondNeed(game, F.pond).open ? F.pond : "tide";
  let pond = pondById(pondId);
  F.pond = pondId;

  document.querySelector(".fish-wrap")?.remove();
  const wrap = h(`<div class="live-wrap fish-wrap" role="dialog" aria-label="Fishing"><div class="fish">
    <div class="fish-top">
      <button type="button" class="fish-pond" title="Change pond"><i class="fish-swatch"></i><span class="fish-pond-name"></span>${lineIcon("chevron", 16)}</button>
      <span class="fish-chips">
        <span class="fish-chip fish-due" title="Words due for review: each one is a fish">${icon("fish_shadow")}<b></b></span>
        <button type="button" class="fish-chip fish-luck" title="How lucky a cast is here">${icon("luck")}<b translate="no"></b></button>
        <span class="fish-chip fish-pearls" title="Pearls">${icon("pearl")}<b translate="no"></b></span>
        <span class="fish-chip fish-golden" hidden title="Golden hour: triple luck">${icon("star")}<b translate="no"></b></span>
      </span>
      <button type="button" class="fish-basket" title="Your basket">${icon("basket")}<b translate="no"></b></button>
      <button type="button" class="ghost icon fish-close" title="Close" aria-label="Close">${icon("close")}</button>
    </div>
    <div class="fish-stage"><canvas width="${W}" height="${H}" role="button" tabindex="-1" aria-label="The pond: tap the water to cast"></canvas>
      <div class="fish-say" hidden></div>
      <div class="fish-gate" hidden></div>
    </div>
    <div class="fish-foot">
      <div class="fish-act">
        <button type="button" class="primary fish-cast">Cast</button>
        <p class="fish-hint"></p>
      </div>
      <div class="fish-card" hidden></div>
    </div>
  </div></div>`);
  const $ = (q) => wrap.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  document.body.append(wrap);

  // ----- what the scene holds -----
  let vocab = [];
  let flashDue = new Set();
  let dict = null;
  let info = { due: 0, practice: false, shadows: [] };
  const gone = new Set();      // words answered in this visit: out of the water
  const later = [];            // missed words come back after a few more bites: {uid, at}
  let bites = 0;
  let closed = false;
  let busy = false;            // a bite is being played out (cards, the fight, the catch)
  let lastAnswer = 0;          // (time fishing counts as study time while answers keep coming)
  const sc = { mode: "idle", t0: performance.now(), bob: null, cast: null, shadows: [], target: null, drops: [], rings: [], fish: null, emote: null, aura: null };
  const setMode = (m) => { sc.mode = m; sc.t0 = performance.now(); if (!closed && wrap.isConnected) hint(); };
  const art = {};
  let water = waterArt(pond);
  const look = describe(game.creature);
  const isEgg = look.stage === "egg";
  let eggPic = null;
  let frames = {};

  for (const [key, file] of [["dock", "fish/dock.png"], ["bobber", "fish/bobber.png"], ["exclaim", "fx/emote_exclaim.png"], ["sweat", "fx/emote_sweat.png"],
    ["love", "fx/emote_love.png"], ["shadow", "fx/shadow_m.png"]]) loadImage(file).then((img) => { art[key] = img; });
  function loadScene() {
    for (const layer of HABITAT.layers) { art[layer] = null; loadImage(`habitat/${pond.scene}/${layer}.png`).then((img) => { if (!closed) art[layer] = img; }); }
  }
  loadScene();
  if (isEgg) loadImage(`egg/${look.type}.png`).then((img) => (img ? dressEgg(img, look.equipped) : null)).then((pic) => { eggPic = pic; });

  // The right answer's word is said the moment a choice is made, as in battles (its own recording, else the card
  // voice). It plays on by itself: nothing waits for it, and the card closes as quickly as it always did. A new
  // answer takes over from a word still playing. Game sound off: not said.
  const player = snippetPlayer();
  const sayCard = cardSayer(player.playSnippet);
  const sayAnswer = (q) => {
    const s = appState.status && appState.status.settings;
    if (s && s.game_sound === false) return;
    const v = vocab.find((w) => uidOf(w) === q.uid);
    if (v) sayCard(v, "word").catch(() => {});
  };
  const stopStudy = trackStudy("read", () => !closed && Date.now() - lastAnswer < 60000);

  // ----- the bar on top -----
  function paintHud() {
    $(".fish-pond-name").textContent = pond.name;
    $(".fish-swatch").style.background = pond.water[2];
    const due = $(".fish-due b");
    due.textContent = info.practice ? t("Practice") : info.due > 99 ? "99+" : String(info.due);
    $(".fish-due").classList.toggle("practice", info.practice);
    $(".fish-luck b").textContent = `×${luckOf(game, pondId)}`;
    $(".fish-pearls b").textContent = F.pearls.toLocaleString();
    $(".fish-basket b").textContent = String(F.bag.length);
    const left = golden(game);
    $(".fish-golden").hidden = !left;
    if (left) $(".fish-golden b").textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
  }
  function hint() {
    const el = $(".fish-hint");
    const cast = $(".fish-cast");
    cast.hidden = busy;
    if (busy) {
      el.textContent = sc.mode === "fight" ? t("It's fighting back! Get ready…") : sc.mode === "reel" || sc.mode === "leap" || sc.mode === "cheer" ? t("Got it!")
        : sc.mode === "away" ? t("It got away…") : "";
      return;
    }
    if (sc.mode === "wait" || sc.mode === "cast") { cast.textContent = t("Reel in"); el.textContent = t("Wait for a bite…"); cast.disabled = sc.mode === "cast"; return; }
    cast.textContent = t("Cast");
    cast.disabled = busy || !info.shadows.length;
    el.textContent = !info.shadows.length ? t("No more fish for now. Come back when more words are due.")
      : info.practice ? t("Nothing is due: these are practice fish, with less luck.")
        : t("Tap the water to cast. A bigger shadow is a luckier fish.");
  }
  let sayTimer = 0;
  /** A few words over the scene for a moment. */
  function say(text, ms = 1800) {
    const el = $(".fish-say");
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ----- the shadows -----
  const spot = () => ({ x: lerp(SWIM.x0, SWIM.x1, rand()), y: lerp(SWIM.y0, SWIM.y1, rand()) });
  function spawn(s, inside) {
    const p = spot();
    const to = spot();
    return { ...s, x: inside ? p.x : W + 20 + rand() * 30, y: p.y, tx: to.x, ty: to.y, dir: -1, mode: "swim", speed: 7 + rand() * 9, phase: rand() * 6, alpha: inside ? 1 : 0, rest: rand() * 2 };
  }
  /** Put in the water what the rules say swims now (fishing.pondShadows), keeping the ones already there. */
  function refresh(first = false) {
    for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= bites) { gone.delete(later[i].uid); later.splice(i, 1); }
    info = pondShadows(game, vocab, { pond: pondId, flashDue, boss: (uid) => isBoss(game, uid), skip: gone });
    // (a missed word waiting its turn still counts as a fish to come: the pond isn't empty while one is)
    if (!info.shadows.length && later.length) { gone.delete(later[0].uid); later.shift(); info = pondShadows(game, vocab, { pond: pondId, flashDue, boss: (uid) => isBoss(game, uid), skip: gone }); }
    const have = new Map(sc.shadows.map((s) => [s.uid, s]));
    const next = info.shadows.map((s) => (have.has(s.uid) ? Object.assign(have.get(s.uid), s) : spawn(s, first)));
    for (const s of sc.shadows) if (!next.includes(s) && s.mode !== "gone") { if (s.mode === "swim") { s.mode = "leave"; } next.push(s); }
    sc.shadows = next;
    paintHud();
    hint();
  }
  function moveShadow(s, dt, now) {
    if (s.alpha < 1 && s.mode !== "leave" && s.mode !== "flee") s.alpha = Math.min(1, s.alpha + dt * 2);
    let tx = s.tx, ty = s.ty, speed = s.speed;
    if (s.mode === "leave" || s.mode === "flee") { tx = W + 60; ty = s.y; speed = s.mode === "flee" ? 150 : 40; s.alpha = Math.max(0, s.alpha - dt * (s.mode === "flee" ? 1.6 : 0.8)); }
    else if (s.mode === "approach" && sc.bob) { tx = sc.bob.x + s.side * (SHADOWS[s.cls].len / 2 + 2); ty = sc.bob.y + 1; speed = s.rush || 40; }
    else if (s.mode === "nibble" || s.mode === "hooked") {
      if (sc.bob) { // on the line: it tugs about the bobber
        const pull = s.mode === "hooked" ? 4 : 1;
        s.x = sc.bob.x + s.side * (SHADOWS[s.cls].len / 2 + 1) + Math.sin(now / 90 + s.phase) * pull;
        s.y = sc.bob.y + 1 + Math.cos(now / 130 + s.phase) * pull * 0.5;
      }
      return;
    } else if (s.rest > 0) { s.rest -= dt; return; }
    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.5) {
      if (s.mode === "approach") { s.mode = "nibble"; s.dir = -s.side; s.nibbles = Math.floor(rand() * 3); s.at = now; s.beat = -1; return; }
      if (s.mode === "leave" || s.mode === "flee") { s.mode = "gone"; return; }
      const to = spot();
      s.tx = to.x; s.ty = to.y; s.rest = rand() < 0.4 ? 0.5 + rand() * 1.5 : 0;
      return;
    }
    const step = Math.min(d, speed * dt);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    if (Math.abs(dx) > 1) s.dir = dx > 0 ? 1 : -1;
    // (however it got there, a fish that has been coming for the bobber for a while has arrived: never a cast with no bite)
    if (s.mode === "approach" && now - s.since > 2600) { s.x = tx; s.y = ty; }
  }
  function drawShadow(s, now) {
    const big = s === sc.target && sc.aura ? 1.15 : 1;
    const len = Math.round(SHADOWS[s.cls].len * big);
    const hgt = Math.max(3, Math.round(len * 0.42));
    const body = Math.round(len * 0.74);
    const tail = len - body;
    const fast = s.mode === "swim" || s.mode === "leave" ? 190 : 70;
    const wag = Math.sin(now / fast + s.phase);
    const head = Math.round(s.x + (s.dir * len) / 2);
    const cy = Math.round(s.y);
    const shape = (grow, colour) => {
      ctx.fillStyle = colour;
      for (let i = 0; i < body; i++) {
        const u = (i + 0.5) / body;
        const half = Math.max(1, Math.round(((hgt + grow * 2) / 2) * Math.sqrt(Math.max(0, 1 - (2 * u - 0.9) ** 2 * 0.9))));
        ctx.fillRect(head - s.dir * i - (s.dir > 0 ? 1 : 0), cy - half, 1, half * 2);
      }
      for (let j = 0; j < tail; j++) {
        const half = Math.max(1, Math.round(((j + 1) / tail) * (hgt * 0.45 + grow)));
        const off = Math.round(wag * ((j + 1) / tail) * 1.6);
        ctx.fillRect(head - s.dir * (body + j) - (s.dir > 0 ? 1 : 0), cy - half + off, 1, half * 2);
      }
    };
    const aura = s === sc.target && sc.aura ? sc.aura : s.cls === "boss" ? pond.water[3] : null;
    if (aura) {
      ctx.globalAlpha = s.alpha * (0.3 + 0.2 * Math.sin(now / 160));
      shape(2, aura);
    }
    ctx.globalAlpha = s.alpha * 0.72;
    shape(0, "#02040f");
    ctx.globalAlpha = 1;
  }

  // ----- the creature, its rod and the line -----
  function creatureFrame(pose) {
    const key = `${pose.anim}|${pose.frame}|${pose.eyes}`;
    if (!(key in frames)) {
      frames[key] = null;
      const made = frames;
      composeCreature({ ...look, equipped: { ...(look.equipped || {}), held: null } }, pose).then((c) => { if (made === frames) frames[key] = c; },
        () => setTimeout(() => { if (made === frames && frames[key] === null) delete frames[key]; }, 2000));
    }
    return frames[key] || Object.values(frames).find(Boolean) || null;
  }
  /** Where it holds the rod, in the scene: at the height of its "held" socket in this frame (so the rod breathes
   * with it), and never further back than its front edge, so the rod is clear of its body whatever its shape (a
   * wide golem's hand is on its far side). An egg's rod stands beside it. */
  function handOf(pose) {
    if (isEgg) return [CX + 11, FEET_Y - 12];
    const b = drawingOf(look);
    const a = b.anims[pose.anim];
    const at = (a && a.at && a.at.held && a.at.held[pose.frame]) || [0, 0];
    const [ox, oy] = beastOrigin(b);
    const [sx, sy] = (b.sockets && b.sockets.held) || [FRAME / 2 - ox + 8, FRAME - oy - 14];
    const front = CX - FRAME / 2 + ox + b.box[2] - 7; // (its drawing's right edge, a little way in)
    return [Math.max(CX - FRAME / 2 + ox + sx + at[0], front), FEET_Y - FRAME + oy + sy + at[1]];
  }
  /** The rod's angle now, in degrees (0 points right, -90 straight up), by what is happening. */
  function rodAngle(now) {
    const p = (now - sc.t0) / 1000;
    const sway = Math.sin(now / 800) * 1.5;
    if (sc.mode === "cast") return p < 0.22 ? lerp(-52, -128, ease(p / 0.22)) : lerp(-128, -14, ease(clamp((p - 0.22) / 0.2, 0, 1)));
    if (sc.mode === "wait") return -30 + sway + (sc.target && sc.target.mode === "nibble" && (now - sc.target.at) % 600 < 120 ? 4 : 0);
    if (sc.mode === "card") return -24 + Math.sin(now / 70) * 2;
    if (sc.mode === "fight") return -46 + Math.sin(now / 55) * 9;
    if (sc.mode === "reel") return lerp(-30, -78, ease(clamp(p / 0.9, 0, 1))) + Math.sin(now / 50) * 3;
    if (sc.mode === "cheer" || sc.mode === "leap") return -84;
    if (sc.mode === "away") return -40 + sway;
    return -52 + sway;
  }
  const rodColours = () => ({ twig: ["#3a2418", "#8a5a34", "#c9a070"], bamboo: ["#2d3a14", "#8fa83c", "#dfe88a"], neon: ["#0c2a44", "#22a6d8", "#9af4ff"], star: ["#4a2c08", "#e0a020", "#fff0a0"] })[RODS[F.rod].id];
  /** Pixels on the straight line between two points. */
  function linePixels(x0, y0, x1, y1) {
    const out = [];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    let lx = null, ly = null;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(lerp(x0, x1, i / n)), y = Math.round(lerp(y0, y1, i / n));
      if (x !== lx || y !== ly) out.push([x, y]);
      lx = x; ly = y;
    }
    return out;
  }
  function drawRod(hand, deg) {
    const a = (deg * Math.PI) / 180;
    const tip = [hand[0] + Math.cos(a) * ROD_LEN, hand[1] + Math.sin(a) * ROD_LEN];
    const butt = [hand[0] - Math.cos(a) * 4, hand[1] - Math.sin(a) * 4];
    const [dark, wood, light] = rodColours();
    const px = linePixels(butt[0], butt[1], tip[0], tip[1]);
    // a dark edge all along it first (so it shows against sky, water and creature alike), then the wood on top
    ctx.fillStyle = dark;
    px.forEach(([x, y], i) => { const thick = i < px.length * 0.6 ? 3 : 2; ctx.fillRect(x - 1, y - 1, thick, thick); });
    px.forEach(([x, y], i) => {
      const grip = i < 8;
      ctx.fillStyle = i > px.length - 6 ? light : grip ? dark : wood;
      ctx.fillRect(x, y, 1, 1);
      if (!grip && i < px.length * 0.6) { ctx.fillStyle = i % 7 === 3 ? light : wood; ctx.fillRect(x, y - 1, 1, 1); }
    });
    // the reel, by the hand
    ctx.fillStyle = dark;
    ctx.fillRect(Math.round(hand[0] + Math.cos(a) * 5) - 1, Math.round(hand[1] + Math.sin(a) * 5) + 1, 3, 3);
    ctx.fillStyle = light;
    ctx.fillRect(Math.round(hand[0] + Math.cos(a) * 5), Math.round(hand[1] + Math.sin(a) * 5) + 2, 1, 1);
    return tip.map(Math.round);
  }
  function drawLine(tip, to, slack) {
    ctx.fillStyle = RODS[F.rod].line;
    const n = Math.max(2, Math.ceil(Math.hypot(to[0] - tip[0], to[1] - tip[1]) / 1.2));
    let lx = null, ly = null;
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      const x = Math.round(lerp(tip[0], to[0], p));
      const y = Math.round(lerp(tip[1], to[1], p) + Math.sin(Math.PI * p) * slack);
      if (x !== lx || y !== ly) { ctx.globalAlpha = 0.85; ctx.fillRect(x, y, 1, 1); }
      lx = x; ly = y;
    }
    ctx.globalAlpha = 1;
  }
  function drawBobber(x, y, dip) {
    const bx = Math.round(x) - 3, by = Math.round(y) - 5 + dip;
    if (art.bobber) { ctx.drawImage(art.bobber, 0, 0, 8, 8 - Math.max(0, dip), bx - 1, by - 1, 8, 8 - Math.max(0, dip)); return; }
    ctx.fillStyle = "#1b1420"; ctx.fillRect(bx, by, 6, 6 - Math.max(0, dip - 1));
    ctx.fillStyle = "#ffffff"; ctx.fillRect(bx + 1, by + 1, 4, 2);
    if (dip < 3) { ctx.fillStyle = "#ff4f6d"; ctx.fillRect(bx + 1, by + 3, 4, 2 - Math.max(0, dip - 1)); }
  }
  const splash = (x, y, n = 6, force = 1) => {
    for (let i = 0; i < n; i++) sc.drops.push({ x, y, vx: (rand() - 0.5) * 46 * force, vy: -(20 + rand() * 46) * force, life: 0.5 + rand() * 0.3 });
    sc.rings.push({ x, y, r: 2, life: 0.9 });
  };

  // ----- one frame -----
  function tick(dt, now) {
    for (const s of sc.shadows) moveShadow(s, dt, now);
    sc.shadows = sc.shadows.filter((s) => s.mode !== "gone");
    for (const d of sc.drops) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 160 * dt; d.life -= dt; }
    sc.drops = sc.drops.filter((d) => d.life > 0);
    for (const r of sc.rings) { r.r += 14 * dt; r.life -= dt; }
    sc.rings = sc.rings.filter((r) => r.life > 0);

    // The fish coming for the bobber: it nibbles a time or two, then bites.
    const tg = sc.target;
    if (sc.mode === "wait" && tg && tg.mode === "nibble") {
      const since = now - tg.at;
      const beat = Math.floor(since / 600);
      if (beat !== tg.beat) { tg.beat = beat; if (beat < tg.nibbles) { sfx("tick"); sc.rings.push({ x: sc.bob.x, y: sc.bob.y, r: 2, life: 0.5 }); } }
      if (since >= tg.nibbles * 600 + 250 && !busy) bite(tg);
    }
    if (sc.mode === "wait" && !tg && now - sc.t0 > 300) attract();
    if (sc.mode === "cast" && now - sc.t0 >= 860) { // the bobber lands
      setMode("wait");
      splash(sc.bob.x, sc.bob.y, 5, 0.7);
      sfx("tick");
      hint();
    }
    draw(now);
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    for (const layer of HABITAT.layers) if (art[layer]) ctx.drawImage(art[layer], 0, -LIFT);
    ctx.drawImage(water, 0, WATER_Y);
    // glints: short light dashes drifting on the water, fewer far away
    const gold = golden(game) > 0;
    ctx.fillStyle = gold ? "#ffd75c" : pond.water[3];
    for (let i = 0; i < (gold ? 52 : 34); i++) {
      const y = WATER_Y + 3 + ((i * 37) % (H - WATER_Y - 5));
      const drift = (now / (60 + (i % 5) * 22) + i * 53) % (W + 40);
      const on = Math.sin(now / 420 + i * 1.7) > 0.1;
      if (!on) continue;
      ctx.globalAlpha = (gold ? 0.3 : 0.16) + (i % 3) * 0.07;
      ctx.fillRect(Math.round(W + 20 - drift), y, 3 + (i % 4) * 2, 1);
    }
    ctx.globalAlpha = 1;
    for (const s of sc.shadows) drawShadow(s, now);
    // rings on the water
    for (const r of sc.rings) {
      ctx.globalAlpha = clamp(r.life, 0, 1) * 0.6;
      ctx.fillStyle = "#ffffff";
      const rx = Math.round(r.r), ry = Math.max(1, Math.round(r.r * 0.4));
      for (let a = 0; a < 20; a++) { const k = (a / 20) * Math.PI * 2; ctx.fillRect(Math.round(r.x + Math.cos(k) * rx), Math.round(r.y + Math.sin(k) * ry), 1, 1); }
    }
    ctx.globalAlpha = 1;

    // the dock
    if (art.dock) ctx.drawImage(art.dock, DOCK[0], DOCK[1]);
    else { ctx.fillStyle = "#5a3d2e"; ctx.fillRect(DOCK[0], FEET_Y - 3, 62, 6); ctx.fillStyle = "#2c1c18"; ctx.fillRect(DOCK[0], FEET_Y + 3, 62, 2); ctx.fillRect(DOCK[0] + 6, FEET_Y + 5, 3, 9); ctx.fillRect(DOCK[0] + 53, FEET_Y + 5, 3, 9); }

    // the creature (or the egg), with what it is doing
    const p = (now - sc.t0) / 1000;
    const action = { cast: "cast", wait: "wait", card: "wait", fight: "reel", reel: "reel", leap: "catch", cheer: "cheer" }[sc.mode] || "idle";
    const pose = isEgg ? { anim: "idle", frame: 0, eyes: "open" } : animAt(look, action, now - (action === "idle" ? 0 : sc.t0));
    if (sc.mode === "cheer") pose.eyes = "happy";
    const hop = sc.mode === "cheer" ? Math.round(Math.abs(Math.sin(now / 110)) * 6) : 0;
    const lean = sc.mode === "cast" && p > 0.22 && p < 0.5 ? Math.round(3 * Math.sin(Math.PI * ((p - 0.22) / 0.28))) : sc.mode === "fight" ? Math.round(Math.sin(now / 55)) : 0;
    if (art.shadow) ctx.drawImage(art.shadow, Math.round(CX - 3 - art.shadow.width / 2), FEET_Y - Math.floor(art.shadow.height / 2));
    const hand = handOf(pose);
    hand[0] += lean; hand[1] -= hop;
    if (isEgg) {
      if (eggPic) ctx.drawImage(eggPic, Math.round(CX - eggPic.width / 2 + (sc.mode === "fight" || sc.mode === "card" ? Math.sin(now / 60) : 0)), FEET_Y - eggPic.height - hop);
    } else {
      const frame = creatureFrame(pose);
      if (frame) {
        ctx.save();
        ctx.translate(CX + lean, FEET_Y - hop);
        drawLiving(ctx, frame, look, now);
        ctx.restore();
      }
    }
    const tip = drawRod(hand, rodAngle(now));
    // the line and the bobber
    if (sc.mode === "cast" && sc.bob) {
      const q = clamp((p - 0.36) / 0.5, 0, 1);
      if (q > 0) {
        const x = lerp(tip[0], sc.bob.x, q), y = lerp(tip[1], sc.bob.y, q) - Math.sin(Math.PI * q) * 34;
        drawLine(tip, [x, y], -3);
        drawBobber(x, y + 4, 0);
      }
    } else if (sc.bob && ["wait", "card", "fight", "reel"].includes(sc.mode)) {
      const tg = sc.target;
      const nib = tg && tg.mode === "nibble" && (now - tg.at) % 600 < 130 && Math.floor((now - tg.at) / 600) < tg.nibbles;
      const taut = sc.mode !== "wait";
      const dip = taut ? 5 : nib ? 2 : Math.round(Math.sin(now / 500) * 0.6);
      const bx = sc.bob.x + (taut && tg ? Math.sin(now / 90 + tg.phase) * 3 : 0);
      drawLine(tip, [bx, sc.bob.y - 3 + Math.max(0, dip)], taut ? 0 : 5);
      drawBobber(bx, sc.bob.y, dip);
    }
    // a fish out of the water: leaping to the creature, then held up
    if (sc.fish) {
      const f = sc.fish;
      const top = FEET_Y - (isEgg ? 34 : beastHeight(look)) - hop - SPRITE[1] + 3; // (held up, just over its head)
      let x = CX - SPRITE[0] / 2 + 4, y = top;
      if (sc.mode === "leap") {
        const q = ease(clamp(p / 0.55, 0, 1));
        x = lerp(f.from[0], x, q);
        y = lerp(f.from[1], top, q) - Math.sin(Math.PI * q) * 30;
      }
      if (f.sprite) {
        ctx.save();
        ctx.translate(Math.round(x + SPRITE[0] / 2), Math.round(y + SPRITE[1] / 2));
        if (sc.mode === "leap") ctx.rotate(-0.5 + clamp(p / 0.55, 0, 1) * 0.5);
        ctx.drawImage(f.sprite, -SPRITE[0] / 2, -SPRITE[1] / 2);
        ctx.restore();
      }
    }
    for (const d of sc.drops) { ctx.globalAlpha = clamp(d.life * 2.5, 0, 1); ctx.fillStyle = "#e8f6ff"; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); }
    ctx.globalAlpha = 1;
    // how it feels: "!" at a bite, a sweat drop when one gets away
    if (sc.emote && now < sc.emote.until && art[sc.emote.id]) {
      ctx.drawImage(art[sc.emote.id], CX + 8, FEET_Y - (isEgg ? 34 : beastHeight(look)) - 12 - hop);
    }
  }

  // ----- casting -----
  /** Scene pixel under a pointer event. */
  function scenePoint(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }
  function cast(x, y) {
    if (busy || closed || sc.mode !== "idle" || !info.shadows.length) return;
    sc.bob = { x: clamp(x, SWIM.x0 - 6, SWIM.x1 + 4), y: clamp(y, SWIM.y0 - 6, SWIM.y1 + 4) };
    sc.target = null;
    setMode("cast");
    sfx("pet");
    hint();
  }
  /** Cast without aiming: at the luckiest fish in the water. */
  function castAtBest() {
    const s = sc.shadows.filter((x) => x.mode === "swim" && x.alpha > 0.5)
      .sort((a, b) => SHADOWS[b.cls].len - SHADOWS[a.cls].len)[0] || sc.shadows.find((x) => x.mode === "swim");
    if (s) cast(clamp(s.x + 12 * s.dir, SWIM.x0, SWIM.x1), s.y);
    else cast(lerp(SWIM.x0, SWIM.x1, 0.4), lerp(SWIM.y0, SWIM.y1, 0.5));
  }
  function reelIn() {
    if (busy || (sc.mode !== "wait" && sc.mode !== "cast")) return;
    if (sc.target) { sc.target.mode = "swim"; sc.target.rest = 0; sc.target = null; }
    sc.bob = null;
    setMode("idle");
    hint();
  }
  /** The nearest free fish notices the bobber and comes over. */
  function attract() {
    const free = sc.shadows.filter((s) => s.mode === "swim");
    if (!free.length || !sc.bob) return;
    free.sort((a, b) => Math.hypot(a.x - sc.bob.x, a.y - sc.bob.y) - Math.hypot(b.x - sc.bob.x, b.y - sc.bob.y));
    const s = free[0];
    const d = Math.hypot(s.x - sc.bob.x, s.y - sc.bob.y);
    s.mode = "approach";
    s.side = s.x <= sc.bob.x ? -1 : 1; // the side of the bobber it comes to, and stays on
    s.since = performance.now();
    s.dir = sc.bob.x >= s.x ? 1 : -1;
    s.rush = Math.max(36, d / 1.3); // (never a long wait: it is there within about a second)
    s.rest = 0;
    sc.target = s;
  }

  // ----- a card: one word asked -----
  let card = null; // the card on screen: {q, buttons, shownAt, left, done}
  function askCard(q, head) {
    return new Promise((resolve) => {
      const box = $(".fish-card");
      const panel = h(`<div class="lbq fishq">
        <div class="lbq-head"><span class="lbq-move"></span><span class="lbq-left" translate="no"></span></div>
        <div class="lbq-bar"><i></i></div>
        <div class="lbq-ask">Which of your words means this?</div>
        <div class="lbq-prompt"></div>
        <div class="lbq-options"></div>
        <div class="lbq-foot"><span class="lbq-verdict" hidden></span></div>
      </div>`);
      panel.querySelector(".lbq-move").textContent = head;
      const prompt = panel.querySelector(".lbq-prompt");
      prompt.textContent = q.prompt;
      setLang(prompt, detectLanguage(q.prompt));
      const buttons = q.options.map((text, i) => {
        const b = h(`<button type="button" class="lbq-opt"><span class="fishq-key" translate="no">${i + 1}</span><span class="lbq-text" dir="auto" translate="no"></span></button>`);
        const el = b.querySelector(".lbq-text");
        el.textContent = text;
        setLang(el, detectLanguage(text));
        b.addEventListener("click", () => choose(i));
        panel.querySelector(".lbq-options").append(b);
        return b;
      });
      box.replaceChildren(panel);
      box.hidden = false;
      $(".fish-act").hidden = true;
      card = { q, buttons, panel, shownAt: performance.now(), left: QUIZ_S, done: false, resolve };
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
    });
  }
  /** An answer (`i`), or none in time (null): show how it went for a moment, then carry on. */
  function choose(i) {
    const c = card;
    if (!c || c.done || (i !== null && !c.buttons[i])) return;
    c.done = true;
    const correct = i !== null && i === c.q.answer;
    const ms = performance.now() - c.shownAt;
    for (const b of c.buttons) b.disabled = true;
    c.buttons[c.q.answer].classList.add("right");
    if (i !== null && !correct) c.buttons[i].classList.add("wrong");
    const verdict = c.panel.querySelector(".lbq-verdict");
    verdict.hidden = false;
    verdict.className = `lbq-verdict ${correct ? "ok" : "no"}`;
    verdict.textContent = correct ? t("Right!") : i === null ? t("Too slow: it got away") : t("Wrong answer: it got away");
    if (!correct) c.panel.querySelector(".lbq-bar i").style.width = "0%";
    sfx(correct ? "common" : "surprise");
    if (i !== null) sayAnswer(c.q); // (a choice was made: not when the time ran out)
    lastAnswer = Date.now();
    setTimeout(() => {
      if (card === c) card = null;
      if (!closed) { $(".fish-card").hidden = true; $(".fish-act").hidden = false; }
      c.resolve({ correct, ms });
    }, correct ? 500 : 1400);
  }
  function paintCardTimer() {
    const c = card;
    if (!c || c.done) return;
    c.left = QUIZ_S - (performance.now() - c.shownAt) / 1000; // (by the clock, not by frames drawn)
    const share = Math.max(0, c.left / QUIZ_S);
    const bar = c.panel.querySelector(".lbq-bar i");
    bar.style.width = `${share * 100}%`;
    bar.className = share < 0.2 ? "late" : share < 0.4 ? "soon" : "";
    c.panel.querySelector(".lbq-left").textContent = String(Math.max(0, Math.ceil(c.left)));
    if (c.left <= 0) choose(null);
  }
  /** What an answer earned besides the fish (as battles say it). */
  function tell(review) {
    if (review.graduated) toast(t("That word is now well known.")).prepend(h(icon("star")), " ");
    if (review.retentionBonus) toast(t("Accurate all week: +60 XP and 5 coins")).prepend(h(icon("goal")), " ");
  }
  /** Mark a word answered: out of the water (a missed one comes back after a few more bites). */
  function answered(uid, correct) {
    gone.add(uid);
    if (!correct) later.push({ uid, at: bites + 3 });
  }

  // ----- a bite, played out -----
  async function bite(sh) {
    if (busy || closed) return;
    busy = true;
    bites++;
    sh.mode = "hooked";
    setMode("card");
    sc.emote = { id: "exclaim", until: performance.now() + 900 };
    splash(sc.bob.x, sc.bob.y, 8);
    sfx("surprise");
    hint();
    try {
      const q = questionFor(game, vocab, sh.uid, { dict });
      if (!q) { gone.add(sh.uid); await away(sh, ""); return; } // (a word that can't be asked after all)
      const a = await askCard(q, t("A bite!"));
      if (closed) return;
      const r = record(game, { uid: q.uid, correct: a.correct, ms: a.ms, due: sh.due, extra: sh.extra, luck: sh.luck });
      saveGame();
      tell(r.review);
      answered(q.uid, a.correct);
      if (!a.correct) { await away(sh, t("It got away…")); return; }
      const hk = hook(game, { pond: pondId, sp: sh.sp, tier: tierOfRoll(r.roll) });
      let best = hk.tier;
      let roll = r.roll;
      const need = fightLength(hk.tier);
      const asked = [q.uid];
      if (need) {
        // A Legendary or better fights back: more right answers in a row, on other words.
        setMode("fight");
        sc.aura = FIGHT_GLOW;
        fighting = { sp: hk.sp, tier: best };
        say(hk.back ? t("It's the one that got away!") : t("It's fighting back!"), 1500);
        sfx("lucky");
        for (let i = 0; i < need; i++) {
          splash(sc.bob.x, sc.bob.y, 10, 1.2);
          await wait(1100);
          if (closed) return;
          const next = fightWord(asked);
          if (!next) break; // (no other word to ask: it tires)
          asked.push(next.q.uid);
          setMode("card");
          const na = await askCard(next.q, need - i === 1 ? t("Hold on! One more") : t("Hold on! {0} more", need - i));
          if (closed) return;
          const nr = record(game, { uid: next.q.uid, correct: na.correct, ms: na.ms, due: next.due, extra: next.extra, luck: next.luck });
          saveGame();
          tell(nr.review);
          answered(next.q.uid, na.correct);
          if (!na.correct) {
            fighting = null;
            escape(game, { pond: pondId, sp: hk.sp, tier: best });
            saveGame();
            await away(sh, t("It broke free! It is still out there…"));
            return;
          }
          if (tierOfRoll(nr.roll) > best) { best = tierOfRoll(nr.roll); roll = nr.roll; }
          fighting = { sp: hk.sp, tier: best };
          setMode("fight");
        }
      }
      // It is landed and saved first; reeling it in and the reveal are the show (closing the pond meanwhile loses nothing).
      fighting = null;
      const got = land(game, { pond: pondId, sp: hk.sp, tier: best, back: hk.back });
      saveGame();
      changed();
      await reel(sh, hk.sp);
      if (closed) return;
      // Its tier, told by the shared reveal: a chip over the scene for the common ones, the whole scene for Epic and up.
      const fish = fishById(got.fish.sp);
      // (a big one takes the whole pond, bar and all: on a phone the scene alone is too small for it)
      const shown = reveal($(got.fish.t >= EPIC ? ".fish" : ".fish-stage"), { ...(roll && roll.rolled ? roll : {}), rolled: true, tier: got.fish.t, reward: null },
        { art: fishTile(got.fish.sp, got.fish.t), title: t(fish.name), text: [got.fish.cm.toLocaleString(), "cm"].join(" "), top: 10 });
      lootOpen = shown;
      await shown.landed;
      fishSprite(got.fish.sp, got.fish.t).then((s) => { if (sc.fish) sc.fish.sprite = s; }); // (now in its tier's colours)
      if (got.fish.t >= EPIC) await shown; // (a big one holds the scene until it is tapped away)
      lootOpen = null;
      if (closed) return;
      paintHud();
      await showCatch(got, roll, hk.back);
    } finally {
      fighting = null;
      sc.fish = null;
      sc.aura = null;
      sc.bob = null;
      sc.target = null;
      busy = false;
      if (!closed) { setMode("idle"); refresh(); }
    }
  }
  /** Another word for a fight: a shadow still in the water (a due one first), else any word that can be asked. */
  function fightWord(asked) {
    const now = new Date();
    for (const s of info.shadows.filter((x) => !asked.includes(x.uid) && !gone.has(x.uid))) {
      const q = questionFor(game, vocab, s.uid, { dict, now });
      if (q) return { q, due: s.due, extra: s.extra, luck: s.luck };
    }
    const q = pickQuestion(game, vocab, rand, now, asked, dict);
    if (!q || asked.includes(q.uid)) return null;
    const v = vocab.find((w) => uidOf(w) === q.uid);
    const c = v ? classify(game, v, { today: dayNumber(now), flashDue, boss: (uid) => isBoss(game, uid) }) : { due: false, extra: true };
    return { q, due: c.due, extra: c.extra, luck: luckOf(game, pondId) };
  }
  /** The fish is off: the shadow darts away, the creature is sorry about it. */
  async function away(sh, words) {
    sh.mode = "flee";
    sh.dir = 1;
    sc.aura = null;
    if (sc.bob) splash(sc.bob.x, sc.bob.y, 6);
    sc.bob = null;
    setMode("away");
    if (words) { say(words, 1700); sc.emote = { id: "sweat", until: performance.now() + 1500 }; }
    await wait(words ? 1200 : 300);
  }
  /** Reel it in: the shadow is pulled to the dock, then the fish leaps out and is held up. */
  async function reel(sh, sp) {
    setMode("reel");
    const from = { ...sc.bob };
    const to = { x: DOCK[0] + 66, y: FEET_Y + 8 };
    const t0 = performance.now();
    while (!closed && performance.now() - t0 < 900) {
      const q = ease((performance.now() - t0) / 900);
      sc.bob.x = lerp(from.x, to.x, q) + Math.sin(q * 16) * 4 * (1 - q);
      sc.bob.y = lerp(from.y, to.y, q);
      if (rand() < 0.3) splash(sc.bob.x, sc.bob.y, 1, 0.6);
      await wait(30);
    }
    if (closed) return;
    splash(to.x, to.y, 12, 1.3);
    sh.mode = "gone";
    sc.fish = { sprite: null, from: [to.x - SPRITE[0] / 2, to.y - SPRITE[1]] };
    fishSprite(sp, 0).then((s) => { if (sc.fish && !sc.fish.sprite) sc.fish.sprite = s; }); // (plain until its tier is revealed)
    sc.bob = null;
    setMode("leap");
    sfx("common");
    await wait(560);
    setMode("cheer");
    sc.emote = { id: "love", until: performance.now() + 1200 };
    await wait(500);
  }

  // ----- the catch, shown -----
  /** What was landed: its tier, the fish, its length, what is new about it, and the pearls in it. Resolves when tapped away. */
  function showCatch(got, roll, back) {
    return new Promise((resolve) => {
      const fish = fishById(got.fish.sp);
      const tier = TIERS[got.fish.t];
      const box = h(`<div class="fish-catch">
        <div class="fish-catch-row">
          <span class="fish-catch-pic"></span>
          <span class="fish-catch-text"><span class="fish-tier"></span><strong class="fish-catch-name"></strong>
            <span class="fish-catch-cm" translate="no"></span></span>
        </div>
        <span class="fish-catch-tags"></span>
        <span class="fish-catch-gains"></span>
        <button type="button" class="primary fish-cast">Keep fishing</button>
      </div>`);
      box.style.setProperty("--tier", tier.colour);
      box.querySelector(".fish-tier").textContent = tier.name;
      box.querySelector(".fish-catch-pic").append(fishPicture(got.fish.sp, got.fish.t, 4));
      box.querySelector(".fish-catch-name").textContent = fish.name;
      box.querySelector(".fish-catch-cm").textContent = [got.fish.cm.toLocaleString(), "cm"].join(" "); // (a unit's symbol)
      const tags = box.querySelector(".fish-catch-tags");
      const tag = (text) => { const el = h(`<span class="fish-tag"></span>`); el.textContent = text; tags.append(el); };
      if (back) tag(t("The one that got away"));
      if (got.newKind) tag(t("New fish!"));
      else if (got.newTier) tag(t("New in your Fishdex"));
      if (got.longest && !got.newKind) tag(t("Your longest yet"));
      if (roll && roll.boss) tag(t("Boss word beaten"));
      const gains = box.querySelector(".fish-catch-gains");
      gains.innerHTML = `<span class="gs-amount cur-coin" title="What it sells for">${icon("coin")}${got.fish.w}</span>`
        + (got.pearls ? `<span class="gs-amount fish-pearl-gain" title="Pearls found in it">${icon("pearl")}+${got.pearls}</span>` : "")
        + (roll && roll.rolled && roll.luck ? `<span class="gs-amount fish-luck-was" title="How lucky this cast was">${icon("luck")}×${Math.round(roll.luck * 100) / 100}</span>` : "");
      let done = false;
      const finish = () => { if (done) return; done = true; catchOpen = null; box.remove(); if (!closed) $(".fish-act").hidden = false; resolve(); };
      box.querySelector("button").onclick = finish;
      catchOpen = finish;
      $(".fish-act").hidden = true;
      $(".fish-foot").append(box);
      box.querySelector("button").focus({ preventScroll: true });
      if (roll && roll.golden) say(t("Golden hour! Triple luck for 10 minutes."), 2600);
    });
  }
  let catchOpen = null;
  let fighting = null; // the fish being fought ({sp, tier}): walking away from the fight lets it go, as a wrong answer does
  let lootOpen = null; // the reveal playing (reveal.js), so it can be taken away if the pond is closed under it

  // ----- changing pond, the luck explained -----
  function pondBox() {
    if (busy) return;
    const m = openModal({ title: t("Ponds"), cls: "gs-detail-back" });
    const list = h(`<div class="fish-ponds"></div>`);
    for (const p of PONDS) {
      const need = pondNeed(game, p.id);
      const home = game.creature.type === p.id;
      const b = h(`<button type="button" class="fish-pond-row${p.id === pondId ? " on" : ""}"><i class="fish-swatch"></i>
        <span class="fish-pond-text"><strong></strong><span class="fish-pond-sub"></span></span><span class="fish-pond-end"></span></button>`);
      b.querySelector(".fish-swatch").style.background = p.water[2];
      b.querySelector("strong").textContent = p.name;
      const sub = b.querySelector(".fish-pond-sub");
      sub.textContent = !need.open ? t("Beat {0} gym leaders or catch {1} fish to open it.", need.gyms, need.caught)
        : home ? t("{0} water. Your creature's home: luck ×{1}", t(TYPES[p.id].name), luckOf(game, p.id)) : t("{0} water", t(TYPES[p.id].name));
      b.querySelector(".fish-pond-end").innerHTML = need.open ? (p.id === pondId ? icon("check") : "") : icon("lock");
      b.disabled = !need.open;
      b.onclick = () => { m.close(); if (p.id !== pondId) changePond(p.id); };
      list.append(b);
    }
    m.body.append(list);
  }
  function changePond(id) {
    pondId = id;
    pond = pondById(id);
    F.pond = id;
    saveGame();
    water = waterArt(pond);
    loadScene();
    sc.shadows = [];
    refresh(true);
    const e = escapedIn(game, id);
    if (e) say(t("Something big got away here today. It is still out there…"), 2600);
  }
  function luckBox() {
    const m = openModal({ title: t("Luck"), cls: "gs-detail-back" });
    const home = game.creature.type === pondId;
    const rows = [
      [t("Your rod: {0}", t(RODS[F.rod].name)), `×${RODS[F.rod].luck}`],
      [home ? t("Your creature's home water") : t("Not your creature's home water"), home ? "×1.25" : "×1"],
      [t("A word due for review"), "×2"],
      [t("A word you often miss (a big shadow)"), "×1.25"],
      [t("A practice fish (a word that isn't due)"), "×0.25"],
    ];
    const box = h(`<div class="fish-luck-list"></div>`);
    for (const [k, v] of rows) {
      const r = h(`<div class="fish-luck-row"><span></span><b translate="no"></b></div>`);
      r.querySelector("span").textContent = k;
      r.querySelector("b").textContent = v;
      box.append(r);
    }
    const p = h(`<p class="gs-detail-text"></p>`);
    p.textContent = t("Luck makes the rarer tiers likelier. Right answers in a row add more, and so does a Golden hour. Better rods are bought with pearls, found inside rarer fish.");
    m.body.append(box, p);
  }

  // ----- the gate: nothing to ask yet -----
  function gate() {
    const g = $(".fish-gate");
    g.hidden = false;
    g.replaceChildren(h(`<div class="fish-gate-card"><strong>The pond is empty</strong>
      <p>Fish are your saved words. Save at least four words with their meanings, and they will be swimming here.</p>
      <a class="btn primary" href="#/vocab">Open Vocab</a></div>`));
    g.querySelector("a").addEventListener("click", () => close());
    $(".fish-act").hidden = true;
  }

  // ----- input -----
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const [x, y] = scenePoint(e);
    if (sc.mode === "idle" && y >= WATER_Y) cast(x, y);
    else if (sc.mode === "idle") castAtBest();
  });
  $(".fish-cast").onclick = () => (sc.mode === "idle" ? castAtBest() : reelIn());
  $(".fish-pond").onclick = pondBox;
  $(".fish-luck").onclick = luckBox;
  $(".fish-basket").onclick = () => { if (busy) return; close(); if (opts.sheet) opts.sheet("basket"); };
  $(".fish-close").onclick = () => close();
  const onKey = (e) => {
    if (closed || document.querySelector(".modal-back")) return;
    if (e.key === "Escape") { if (!lootOpen) { e.preventDefault(); close(); } return; } // (a reveal on screen is put away first)
    if (card && !card.done) {
      const i = KEYS.indexOf(e.key);
      if (i >= 0) { e.preventDefault(); choose(i); }
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      if (lootOpen) return; // (a reveal on screen takes these itself)
      if (e.target && e.target.closest && e.target.closest("button, a")) return; // (the button's own press)
      e.preventDefault();
      if (catchOpen) catchOpen();
      else if (sc.mode === "idle") castAtBest();
      else reelIn();
    }
  };
  document.addEventListener("keydown", onKey);
  // Leaving the app with a card open counts as too slow (else the word could be looked up meanwhile).
  const onHide = () => { if (document.hidden && card && !card.done) choose(null); };
  document.addEventListener("visibilitychange", onHide);

  // ----- the loop -----
  let raf = 0;
  let last = performance.now();
  let hudAt = 0;
  function loop() {
    if (closed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try { paintCardTimer(); tick(dt, now); } catch (err) { if (!loop.failed) { loop.failed = true; console.error("Pond frame failed:", err); } }
    if (now - hudAt > 1000) { hudAt = now; if (golden(game) || !$(".fish-golden").hidden) paintHud(); }
  }

  function close() {
    if (closed) return;
    // A card left open is a fish let go: it counts as a miss, as running out of time does.
    if (card && !card.done) {
      const c = card;
      c.done = true;
      record(game, { uid: c.q.uid, correct: false, ms: performance.now() - c.shownAt, due: true, extra: false, luck: 1 });
      saveGame();
    }
    if (fighting) { escape(game, { pond: pondId, sp: fighting.sp, tier: fighting.tier }); fighting = null; saveGame(); }
    closed = true;
    cancelAnimationFrame(raf);
    clearTimeout(sayTimer);
    stopStudy();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onHide);
    try { if (lootOpen) lootOpen.close(); } catch { /* already gone */ }
    try { player.stop(); stopDevice(); } catch { /* nothing was playing */ }
    wrap.remove();
    changed();
    if (opts.closed) opts.closed();
  }

  paintHud();
  hint();
  loop();
  Promise.all([loadWords(), battleDictionary().catch(() => null)]).then(([w, d]) => {
    if (closed) return;
    vocab = w.vocab;
    flashDue = w.flashDue;
    dict = d;
    if (!canFish(game, vocab)) { gate(); return; }
    refresh(true);
    const e = escapedIn(game, pondId);
    if (e) say(t("Something big got away here today. It is still out there…"), 2600);
  });
  return close;
}
