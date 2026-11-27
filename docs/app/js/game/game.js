// The game's saved state, and the one function the study screens call: reward().
// Also the "juice": the pop, particles, sounds and rolling numbers that make a reward feel good.

import { api, on, saveSettings, state as app, toast } from "../app.js";
import { gameOn } from "../components/gameswitch.js";
import { SESSION_GAP_MS, UNPAID_TIME, earn, earnAnki, finishedEpisode, hearMultiplier, normalize, newState, readPage, rollDay, wordMultiplier } from "./rules.js";
import { VARIANTS, prizeOf } from "./data.js";
import { t } from "../i18n.js";
import { cardsGlow } from "./idle.js";
import { restore, rollAnswer, snapshot } from "./loot.js";
import { icon } from "./render.js";
import { times, working } from "./xpline.js";
import { deviceId, noteStudy } from "../dlitime.js";
import { resolve, sameGame, stamp } from "./merge.js";
import { badgePoint, landXp, paintBadge } from "./xpbadge.js";
import { appOut } from "../appvolume.js";

let game = null;
let saveTimer = 0;
const listeners = new Set();
const combo = { count: 0, at: 0, session: 0 };
// The study session the combo belongs to: a new one once the app has been away for SESSION_GAP_MS.
let session = 1;
let hiddenAt = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= SESSION_GAP_MS) { session++; paintBadge(); } // (the combo's flame goes out)
    hiddenAt = 0;
  });
}
/** Is a combo running in this session (the level badge's flame)? */
const comboAlive = () => combo.count > 0 && combo.session === session && new Date(combo.at).toDateString() === new Date().toDateString();
/** The combo as the level badge shows it: alive or not, and what the next lookup will really be multiplied by
 * (combo, boost and the day's fade together: the same sum its popup will show). */
export function comboNow() {
  return { alive: comboAlive(), next: game ? times(wordMultiplier(game, combo.count + 1)) : "" };
}

export function getGame() {
  listenForAnki();
  if (!game) {
    const saved = app.status && app.status.settings && app.status.settings.game_state;
    game = saved ? normalize(JSON.parse(JSON.stringify(saved))) : newState();
    rollDay(game);
  }
  return game;
}

/** Another copy of the game has come (another device's, through sync; the copy stored by another tab; the desktop
 * server's answer to a save): if it has seen everything this one has, it replaces this one; if each has something
 * the other hasn't, the two are combined and saved (merge.js). In place, so screens holding the state see it.
 * Never "saved last wins": a copy that was behind wiped out the garden and the gyms beaten (fixed after v0.68.0). */
function adopt(remote) {
  if (!game || !remote) return;
  const { keep, state } = resolve(game, remote);
  if (keep === "mine") return;
  const next = normalize(JSON.parse(JSON.stringify(state)));
  for (const k of Object.keys(game)) delete game[k];
  Object.assign(game, next);
  rollDay(game);
  if (keep === "merged") saveGame();
  for (const fn of listeners) { try { fn({ type: "sync" }, game); } catch { /* ignore */ } }
}
if (typeof window !== "undefined") window.addEventListener("tamkeen:game", (e) => adopt(e.detail));
/** Bring back an older copy of the game (Settings → Find an older game: game/oldgames-ui.js): it is combined with
 * the game as it is now, so nothing earned since is lost. Returns {changed}: false when the game already had
 * everything in that copy. */
export function restoreGame(old) {
  const g = getGame();
  const { keep, state } = resolve(g, old);
  if (keep === "mine") return { changed: false };
  const next = normalize(JSON.parse(JSON.stringify(state)));
  rollDay(next);
  if (sameGame(next, JSON.parse(JSON.stringify(g)))) return { changed: false }; // (it brought nothing new)
  for (const k of Object.keys(g)) delete g[k];
  Object.assign(g, next);
  rollDay(g);
  saveGame();
  for (const fn of listeners) { try { fn({ type: "sync" }, g); } catch { /* ignore */ } }
  return { changed: true };
}

// Other tabs of the app in this browser hear each save at once, so two open tabs never play two copies apart.
let tabs = null;
try {
  tabs = new BroadcastChannel("tamkeen-game");
  tabs.onmessage = (e) => adopt(e.data);
  if (tabs.unref) tabs.unref(); // (under Node, in the tests: an open channel must not keep the run from ending)
} catch { /* no other tabs to tell */ }

function store() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  saveSettings({ game_state: game })
    // The desktop server merges what it is sent with what it already has (app/sync/gamemerge.py): take its answer.
    .then((s) => { if (s && s.game_state) adopt(s.game_state); })
    .catch(() => {});
}
// (A tab put away saves at once, so the tab or device used next starts from what was just played.)
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.hidden && saveTimer) store(); });

export function saveGame() {
  game.updated_at = Date.now() / 1000;
  stamp(game, deviceId()); // (what changed since the last save is this device's, and its count of saves moves on)
  try { if (tabs) tabs.postMessage(JSON.parse(JSON.stringify(game))); } catch { /* the other tabs catch up when shown */ }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(store, 1200);
}

/** Be told whenever something is earned: fn(result, state). Returns a function that stops it. */
/** Tell the habitat (and anything else listening) that something was earned outside reward(). */
export function announce(result) {
  for (const fn of listeners) { try { fn(result, game); } catch { /* a listener must not break the game */ } }
}

export function onGame(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Report something the learner did (see rules.js for the events). If it earns anything, the
 * effects play at `anchor` (the word that was tapped, say) and the Home habitat is told.
 */
export function reward(event, anchor = null) {
  if (!gameOn()) return null;  // the game is switched off in Settings
  const g = getGame();
  rollDay(g);
  const coins0 = g.coins;
  // (a word pays once a day: looked up again, its popup says so instead of showing nothing)
  const repeat = event.type === "word" && g.day.words.includes(String(event.key || ""));
  const result = earn(g, event, { combo, session });
  if (!result) {
    if (repeat) landXp(null, { from: anchor, repeat: true, next: comboAlive() ? comboNow().next : "", hot: comboAlive() });
    return null;
  }
  if (result.colouring) tellColouring(result.colouring);
  if (!result.xp && result.colouring && !result.goalDone && !result.cleared) { // (it paid nothing but a colouring)
    saveGame();
    for (const fn of listeners) { try { fn(result, g); } catch { /* ignore */ } }
    return result;
  }
  if (result.cleared) result.glow = cardsGlow(g); // the day's flashcards are done: their reward is glow
  saveGame();
  // (`quiet` events still earn, but without the fountain: the vocab reviewer has its own effects.)
  const loud = (event.type !== "study" && !event.quiet) || result.goalDone;
  if (loud) celebrate(result, anchor);
  // Where it shows: the word's popup (what this lookup or save earned, and the combo's next step), and the
  // level badge in the top bar, which it flies into. Never on Home, which has the game card (it flies them in itself).
  const hot = comboAlive();
  const chain = chained(result.type);
  const next = chain || hot ? times((result.type === "hear" ? hearMultiplier : wordMultiplier)(g, combo.count + 1)) : "";
  const home = !!document.querySelector(".habitat");
  landXp(result, { from: home ? null : anchor, loud: loud && !home, chained: chain, hot, next, coins: Math.max(0, g.coins - coins0) });
  if (loud && !home) tell(result);
  for (const fn of listeners) { try { fn(result, g); } catch { /* a listener must not break studying */ } }
  return result;
}

/**
 * An answer in the vocab reviewer: a right one rolls for a reward on the ten tiers (loot.js), a wrong one
 * ends the answer streak. `ctx` is rollAnswer's: {correct, ms, uid, due, extra}. Returns what rollAnswer
 * returned, with `undo()` for when the answer is taken back (the streak and its shield are put back; what
 * a roll paid stays paid). Null with the game switched off.
 */
export function rollCard(ctx) {
  if (!gameOn()) return null;
  const g = getGame();
  rollDay(g);
  const before = snapshot(g, ctx.uid);
  const out = rollAnswer(g, { source: "cards", ...ctx });
  out.undo = () => { restore(g, before); saveGame(); };
  saveGame();
  if (out.rolled) for (const fn of listeners) { try { fn({ type: "loot", ...out }, g); } catch { /* a listener must not break studying */ } }
  return out;
}

/** The rare big moments get a few words too (the app's own short note at the bottom): the day's goal, a new
 * level, cards matured in Anki. Everything else shows in the popup or the level badge. */
function tell(result) {
  const said = result.goalDone ? `Daily goal reached: +${result.xp} XP`
    : result.type === "anki" && result.matured ? `Anki: ${result.matured} card${result.matured === 1 ? "" : "s"} matured · +${result.xp} XP`
    : "";
  const level = result.levelUp ? "Level up! +5 coins" : "";
  const text = [said, level].filter(Boolean).join(" · ");
  if (text) try { toast(text, { timeout: 3500 }); } catch { /* no toasts here */ }
}

/** Credit whatever the Anki companion has reported and the game hasn't counted yet (desktop only:
 * on the phone there is no Anki add-on to hear from, and the creature arrives through sync). */
export async function checkAnki() {
  if (!gameOn()) return null;
  let report;
  try { report = await api("/anki/days"); } catch { return null; }
  const g = getGame();
  const result = earnAnki(g, report && report.days);
  if (!result) return null;
  saveGame();
  const big = !!(result.goalDone || result.matured);
  if (big) celebrate(result, null);
  const home = !!document.querySelector(".habitat");
  landXp(result, { loud: big && !home });
  if (big && !home) tell(result);
  for (const fn of listeners) { try { fn(result, g); } catch { /* ignore */ } }
  return result;
}
// (Listening starts on first use rather than here: this file loads while the app shell is still
// starting up, before its event list exists.)
let listening = false;
function listenForAnki() {
  if (listening) return;
  listening = true;
  try { on("anki", () => { checkAnki(); }); } catch { /* this shell has no server events */ }
}

// ---------- colourings earned by feats (rules.js featUp; data.js FEATS) ----------

/** Say that the main creature has earned colouring `id` (a VARIANTS id): a jingle and a note. */
export function tellColouring(id) {
  const v = VARIANTS[id];
  if (!v) return;
  sfx("jackpot");
  const name = t(v.name);
  const prize = prizeOf(id); // (its prize, in the bag now: rules.featUp)
  const text = prize ? t("{0} colouring earned! Pick it on the Creatures page. {1} is in My things too.", name, t(prize.name))
    : t("{0} colouring earned! Pick it on the Creatures page.", name);
  try { toast(text, { timeout: 6000 }); } catch { /* no toasts here */ }
}

/** Tell everyone listening about a feat's result, and the creature's new colouring if it earned one. */
function featDone(res) {
  if (!res) return res;
  saveGame();
  if (res.colouring) tellColouring(res.colouring);
  for (const fn of listeners) { try { fn({ type: "feat", ...res }, game); } catch { /* ignore */ } }
  return res;
}

/** An episode was watched ("netflix") or listened to ("podcast") to near its end without skipping (playcover.js):
 * it counts for the main creature, once. */
export function featEpisode(kind, id) {
  if (!gameOn()) return null;
  return featDone(finishedEpisode(getGame(), kind, id));
}

/** A page of a book has been read for real (rules.readPage): words `from` to `to` of `total`. */
export function featBookPage(key, from, to, total) {
  if (!gameOn()) return null;
  const res = readPage(getGame(), key, { from, to, total });
  if (!res) return null;
  saveGame();
  return res.colouring ? featDone(res) : res;
}

/** Count study time while `active()` is true. Returns a function that stops counting. `source` "youtube":
 * nothing is earned, since time watching YouTube earns nothing (rules.UNPAID_TIME). `dli` ("listen", "watch",
 * "read", or null for none) is what the time counts as in a DLI student's weekly numbers (dlitime.js), YouTube's
 * included: that is a count, not a reward. Flashcard time passes null (the answers count it themselves). */
export function trackStudy(mode, active, source = null, dli = mode) {
  const paid = !UNPAID_TIME.has(source);
  if (!paid && !dli) return () => {};
  const timer = setInterval(() => {
    if (document.hidden || !active()) return;
    if (dli) noteStudy(dli, 5);
    if (paid) reward({ type: "study", seconds: 5, mode });
  }, 5000);
  return () => clearInterval(timer);
}

// ---------- sound: tiny synthesised effects, no audio files ----------
let audioCtx = null;
function tone(freq, start, length, type = "sine", volume = 0.08) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + start;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(appOut(audioCtx));
    osc.start(t);
    osc.stop(t + length);
  } catch { /* no sound available */ }
}
export function sfx(kind) {
  const s = app.status && app.status.settings;
  if ((s && s.game_sound === false) || !gameOn()) return;
  if (kind === "common") { tone(880, 0, 0.09, "triangle"); tone(1320, 0.03, 0.08, "sine", 0.05); }
  else if (kind === "lucky") [659, 784, 988].forEach((f, i) => tone(f, i * 0.08, 0.16, "triangle"));
  else if (kind === "jackpot") [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.28, "square", 0.05));
  else if (kind === "surprise") { tone(392, 0, 0.12, "sawtooth", 0.04); tone(784, 0.12, 0.25, "triangle"); }
  else if (kind === "tick") tone(1500, 0, 0.03, "square", 0.02);
  else if (kind === "pet") { tone(700, 0, 0.08); tone(940, 0.07, 0.12); }
  else if (kind === "plant") { tone(196, 0, 0.09, "triangle"); tone(523, 0.1, 0.12, "sine", 0.05); } // (the farm: a seed in, a sprout up)
  else if (kind === "water") [1175, 988, 880, 784, 698].forEach((f, i) => tone(f, i * 0.07, 0.09, "sine", 0.035)); // (the can poured)
}

// ---------- particles and pops ----------
// What flies up from a reward: 8x8 particles from game-art/fx/, by how good the reward was.
const PARTICLES = { common: ["spark", "plus"], lucky: ["spark", "star", "plus"], jackpot: ["star", "spark", "gem", "plus"], surprise: ["question", "spark"] };

function layer() {
  let el = document.getElementById("game-fx");
  if (!el) {
    el = document.createElement("div");
    el.id = "game-fx";
    document.body.append(el);
  }
  return el;
}

/** Rewards that carry the study session's combo: a word looked up, a grammar example heard. */
const chained = (type) => type === "word" || type === "hear";
export { times };
/** How a multiplied word reward was worked out, e.g. "12 ×2" for +24 XP; "" when nothing multiplied it
 * (xpline.js; the word's popup shows it beside the XP earned). */
export const sumText = (result) => working(result, chained(result.type));

/** A short burst of particles up from a point on screen (the word tapped): no words. What was earned shows
 * in the word's popup and the top bar's level badge (xpbadge.js), never on top of the page. */
export function fountain(x, y, result) {
  const fx = layer();
  const tier = result.tier;
  const count = { common: 5, lucky: 8, jackpot: 14, surprise: 6 }[tier] || 5;
  const kinds = PARTICLES[tier] || PARTICLES.common;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = `fx-p fx-${tier}`;
    p.innerHTML = icon(`fx/${kinds[i % kinds.length]}`, tier === "jackpot" ? 24 : 16);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (tier === "jackpot" ? 2.4 : 1.5);
    const dist = 24 + Math.random() * (tier === "jackpot" ? 70 : 40);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist - 12}px`);
    p.style.animationDelay = `${Math.random() * 60}ms`;
    fx.append(p);
    setTimeout(() => p.remove(), 700);
  }
  if (tier === "jackpot") {
    document.body.classList.add("fx-shake");
    setTimeout(() => document.body.classList.remove("fx-shake"), 420);
  }
}

function celebrate(result, anchor) {
  // From the word that earned it; with no word (the day's goal reached while reading, Anki), from the level
  // badge it lands in, or else the middle of the screen.
  const at = badgePoint();
  let x = at ? at.x : window.innerWidth / 2;
  let y = at ? at.y : window.innerHeight * 0.4;
  if (anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    if (r.width) { x = r.left + r.width / 2; y = r.top; }
    anchor.classList.remove("fx-pop");
    void anchor.offsetWidth; // restart the animation if it is already running
    anchor.classList.add("fx-pop");
    anchor.addEventListener("animationend", () => anchor.classList.remove("fx-pop"), { once: true });
  }
  fountain(x, y, result);
  sfx(result.tier);
}

/** Count a number on screen up to its new value, ticking as it goes. */
export function rollNumber(el, to, format = (n) => String(n)) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = String(to);
  if (to <= from) { el.textContent = format(to); return; }
  const steps = Math.min(24, to - from);
  let i = 0;
  const timer = setInterval(() => {
    i++;
    el.textContent = format(Math.round(from + ((to - from) * i) / steps));
    if (i % 3 === 0) sfx("tick");
    if (i >= steps) clearInterval(timer);
  }, 28);
}
