// The game's saved state, and the one function the study screens call: reward().
// Also the "juice": the pop, particles, sounds and rolling numbers that make a reward feel good.

import { api, on, saveSettings, state as app } from "../app.js";
import { gameOn } from "../components/gameswitch.js";
import { COMBO_STEPS, SESSION_GAP_MS, earn, earnAnki, normalize, newState, rollDay, wordMultiplier } from "./rules.js";
import { cardsGlow } from "./idle.js";
import { icon } from "./render.js";

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
    if (hiddenAt && Date.now() - hiddenAt >= SESSION_GAP_MS) session++;
    hiddenAt = 0;
  });
}
/** Is a combo running in this session (for the chip)? */
const comboAlive = () => combo.count > 0 && combo.session === session && new Date(combo.at).toDateString() === new Date().toDateString();

export function getGame() {
  listenForAnki();
  if (!game) {
    const saved = app.status && app.status.settings && app.status.settings.game_state;
    game = saved ? normalize(JSON.parse(JSON.stringify(saved))) : newState();
    rollDay(game);
  }
  return game;
}

/** Another device saved a newer game: adopt it (in place, so screens holding the state see it). */
function adopt(remote) {
  if (!remote || !(remote.roster || remote.creature) || !game) return;
  const theirs = (remote.xp || 0) > 0;
  const mine = (game.xp || 0) > 0;
  // The newer save wins, but an unplayed egg never replaces a game with progress.
  if (theirs !== mine ? !theirs : (remote.updated_at || 0) <= (game.updated_at || 0)) return;
  const next = normalize(JSON.parse(JSON.stringify(remote)));
  for (const k of Object.keys(game)) delete game[k];
  Object.assign(game, next);
  rollDay(game);
  for (const fn of listeners) { try { fn({ type: "sync" }, game); } catch { /* ignore */ } }
}
if (typeof window !== "undefined") window.addEventListener("tamkeen:game", (e) => adopt(e.detail));

export function saveGame() {
  game.updated_at = Date.now() / 1000;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings({ game_state: game }).catch(() => {}), 1200);
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
  const result = earn(g, event, { combo, session });
  if (!result) return null;
  if (result.cleared) result.glow = cardsGlow(g); // the day's flashcards are done: their reward is glow
  saveGame();
  // (`quiet` events still earn, but without the fountain: the vocab reviewer has its own effects.)
  if ((event.type !== "study" && !event.quiet) || result.goalDone) celebrate(result, anchor);
  if (event.type !== "study" || result.goalDone) showChip(g, result);
  for (const fn of listeners) { try { fn(result, g); } catch { /* a listener must not break studying */ } }
  return result;
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
  if (result.goalDone || result.matured) celebrate(result, null);
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

/** Count study time while `active()` is true. Returns a function that stops counting. */
export function trackStudy(mode, active) {
  const timer = setInterval(() => { if (!document.hidden && active()) reward({ type: "study", seconds: 5, mode }); }, 5000);
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
    osc.connect(gain).connect(audioCtx.destination);
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

/** A multiplier as shown on screen: "×2", "×1.2", "×0.8". */
export const times = (m) => `×${Math.round(m * 100) / 100}`;
/** How a multiplied word reward was worked out, e.g. "12 ×2" for +24 XP; "" when nothing multiplied it. */
export const sumText = (result) => (result.type === "word" && result.base && result.mult && result.mult !== 1 ? `${result.base} ${times(result.mult)}` : "");

/** Shoot a small fountain of particles up from a point on screen, with the XP amount. */
export function fountain(x, y, result) {
  const fx = layer();
  const tier = result.tier;
  const count = { common: 6, lucky: 12, jackpot: 26, surprise: 8 }[tier] || 6;
  const kinds = PARTICLES[tier] || PARTICLES.common;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = `fx-p fx-${tier}`;
    p.innerHTML = icon(`fx/${kinds[i % kinds.length]}`, tier === "jackpot" ? 24 : 16);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (tier === "jackpot" ? 2.6 : 1.5);
    const dist = 30 + Math.random() * (tier === "jackpot" ? 110 : 60);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist - 20}px`);
    p.style.animationDelay = `${Math.random() * 90}ms`;
    fx.append(p);
    setTimeout(() => p.remove(), 1100);
  }
  const label = document.createElement("span");
  label.className = `fx-label fx-${tier}`;
  label.textContent = result.goalDone ? `Daily goal! +${result.xp} XP`
    : result.type === "anki" ? `Anki: ${result.matured} card${result.matured === 1 ? "" : "s"} matured · +${result.xp} XP`
    : result.item ? ` ${result.item === "freeze" ? "Streak freeze" : "Hint card"}!`
    : `+${result.xp} XP`;
  if (result.item && !result.goalDone) label.insertAdjacentHTML("afterbegin", icon(result.item === "freeze" ? "freeze" : "hint"));
  // The big number is what was earned. When it was multiplied, the working goes beside it
  // ("+24 XP  12 ×2"), so the multiplier can never read as still to come.
  const sum = sumText(result);
  if (sum && !result.goalDone && !result.item) {
    const small = document.createElement("small");
    small.textContent = sum;
    label.append(small);
  }
  label.style.left = `${x}px`;
  label.style.top = `${y}px`;
  // A quick flash (the owner: "show very briefly, disappears much quicker"): a moment longer only for
  // the rarer, wordier ones, so they can still be read.
  const ms = result.goalDone || result.item || result.type === "anki" ? 1100 : tier === "jackpot" ? 1000 : tier === "common" ? 650 : 800;
  label.style.animationDuration = `${ms}ms`;
  fx.append(label);
  setTimeout(() => label.remove(), ms + 50);
  if (tier === "jackpot") {
    document.body.classList.add("fx-shake");
    setTimeout(() => document.body.classList.remove("fx-shake"), 420);
  }
}

function celebrate(result, anchor) {
  let x = window.innerWidth / 2;
  let y = window.innerHeight * 0.4;
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

// ---------- the XP readout shown while studying ----------
// Away from Home there is no habitat on screen, so a small chip appears after each reward: the
// total rolls up to its new value, and while this session's combo is alive it catches fire and
// shows the multiplier and the next one. No countdown: the combo lasts the whole session.
let chipTimer = 0;
// Leaving the page puts the readout away (Home has the full bar).
if (typeof window !== "undefined") window.addEventListener("hashchange", () => document.getElementById("game-chip")?.classList.remove("show", "hot", "max"));
function showChip(g, result) {
  if (document.querySelector(".habitat")) return; // Home shows all this already
  let chip = document.getElementById("game-chip");
  if (!chip) {
    chip = document.createElement("div");
    chip.id = "game-chip";
    chip.innerHTML = `<span class="chip-xp"><b></b> XP</span><span class="chip-combo" hidden></span>`;
    chip.querySelector("b").dataset.value = String(g.xp - (result.xp || 0));
    document.body.append(chip);
  }
  rollNumber(chip.querySelector("b"), g.xp, (n) => n.toLocaleString());
  const hot = result.type === "word" && comboAlive();
  // What the next lookup will really be multiplied by (combo, boost and the day's fade together),
  // the same sum the popup beside the word shows.
  const next = times(wordMultiplier(g, combo.count + 1));
  const label = chip.querySelector(".chip-combo");
  label.hidden = result.type !== "word";
  label.textContent = hot ? `${times(result.mult)} · next ${next}` : `next ${next}`; // while hot, app.css puts the combo flame in front
  chip.classList.toggle("hot", hot);
  chip.classList.toggle("max", result.combo >= COMBO_STEPS[COMBO_STEPS.length - 1]);
  chip.classList.add("show");
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => chip.classList.remove("show", "hot", "max"), 5000);
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
