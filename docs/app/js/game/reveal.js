// The reveal of a roll (loot.js): a small tile that turns over in its tier's colour. Shared by the
// flashcards and the mini-games (fishing passes its fish as `opts.art`).
//
// The waiting is the point. The tile lands face down and climbs the tiers one colour at a time, a note
// higher each step, and nobody can tell where it will stop:
//   - Common, Uncommon and Rare stop quickly and stay small (a chip that doesn't hold anything up);
//   - anything better "breaks out": the screen dims, the tile comes to the middle, and each further tier
//     takes longer and trembles harder before it either stops or climbs again.
// Someone who has asked for less motion sees the result at once.

import { buzz } from "../app.js";
import { gameOn, soundOn } from "../components/gameswitch.js";
import { t } from "../i18n.js";
import { EPIC, LEGENDARY, MYTHIC, RARE, TIERS } from "./loot.js";
import { climb, grantView, holdFor, luckText, rewardView } from "./lootview.js";

const ART = new URL("../../game-art/", import.meta.url).href;
if (typeof Image !== "undefined") new Image().src = `${ART}fx/question.png`;  // (the tile's back, ready before the first roll)
const calm = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export { climb, grantView, holdFor, luckText, rewardView };

const BREAKOUT_MS = 400;
const CHIP_HOLD_MS = 1500;
const TAP_GUARD_MS = 450; // a tap this soon after landing is taken as "hurry up", not "I have seen it"

// ---------- sound: a few synthesised notes, no audio files ----------
let audioCtx = null;
function tone(freq, start, length, type = "triangle", volume = 0.06) {
  if (!gameOn() || !soundOn()) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const at = audioCtx.currentTime + start;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(at);
    osc.stop(at + length);
  } catch { /* no sound available */ }
}
// One note per tier, rising (a pentatonic scale, so any run of them sounds like a tune).
const NOTE = [392, 440, 523, 587, 659, 784, 880, 1047, 1175, 1319];
const SOUND = {
  step: (i, big) => { tone(NOTE[i], 0, big ? 0.22 : 0.07, big ? "square" : "triangle", big ? 0.035 : 0.04); if (big) tone(NOTE[i] / 4, 0, 0.25, "sine", 0.09); },
  breakout: () => { tone(70, 0, 0.5, "sine", 0.16); tone(140, 0, 0.3, "sawtooth", 0.03); },
  land: (tier, big) => {
    if (!big) { for (let i = 0; i <= Math.min(tier, 2); i++) tone(NOTE[tier] * [1, 1.25, 1.5][i], i * 0.06, 0.16, "triangle", 0.05); return; }
    const chord = [1, 1.25, 1.5, 2, 2.5, 3, 4];
    const n = Math.min(chord.length, 3 + (tier - EPIC));
    for (let i = 0; i < n; i++) tone(NOTE[Math.min(tier, 6)] * chord[i], i * 0.075, 0.5 + tier * 0.05, i % 2 ? "triangle" : "square", 0.045);
    tone(55, 0, 0.7, "sine", 0.18);
    if (tier >= LEGENDARY) for (let i = 0; i < 6 + tier; i++) tone(1568 + ((i * 397) % 1200), 0.35 + i * 0.07, 0.12, "sine", 0.025);
  },
};

// ---------- the pieces on screen ----------
function picture(art, px) {
  if (art && typeof art === "object" && art.nodeType === 1) { art.classList.add("loot-art"); return art; }
  const img = document.createElement("img");
  img.className = "loot-art";
  img.alt = "";
  img.draggable = false;
  img.width = img.height = px;
  if (art) img.src = /^(https?:|data:|blob:|\/)/.test(art) ? art : `${ART}${art}.png`;
  return img;
}

/** A layer over the whole window, for a reveal with no host of its own. */
function windowLayer() {
  let el = document.getElementById("loot-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "loot-layer";
    document.body.append(el);
  }
  return el;
}

function bits(root, x, y, count, colour, reach) {
  if (calm()) return;
  for (let i = 0; i < count; i++) {
    const b = document.createElement("i");
    b.className = "loot-bit";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = reach * (0.45 + Math.random() * 0.75);
    const size = 5 + Math.round(Math.random() * 2) * 3;
    b.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${i % 4 === 3 ? "#ffffff" : colour};--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;animation-delay:${Math.round(Math.random() * 90)}ms`;
    root.append(b);
    setTimeout(() => b.remove(), 1250);
  }
}

/** A small square in a tier's colour with a number or a picture in it (the luck sheet, a session's finds). */
export function tierBadge(tier, inner = "") {
  const tr = TIERS[tier] || TIERS[0];
  const el = document.createElement("span");
  el.className = "loot-badge";
  el.style.setProperty("--tier", tr.colour);
  el.title = t(tr.name);
  if (inner && typeof inner === "object") el.append(inner); else el.textContent = String(inner);
  return el;
}

/**
 * A chip in a reveal's place that only says something (a shield spent, an answer too quick to roll): nothing
 * turns over. `name` and `text` are shown as given (translate them first). Returns a Promise resolved when it has gone.
 */
export function notice(host, { art = "", name = "", text = "", colour = "#aab4c3", top = 8, hold = 1700 } = {}) {
  const where = host || windowLayer();
  for (const old of where.querySelectorAll(":scope > .loot")) if (old.lootEnd) old.lootEnd();
  const root = document.createElement("div");
  root.className = "loot open note";
  root.setAttribute("translate", "no");
  root.setAttribute("role", "status");
  root.style.setProperty("--loot-top", `${Math.max(0, Number(top) || 0)}px`);
  root.style.setProperty("--tier", colour);
  root.innerHTML = `<div class="loot-pill"><div class="loot-tile"><div class="loot-face"></div></div>
    <div class="loot-words"><div class="loot-name"></div><div class="loot-text"></div></div></div>`;
  root.querySelector(".loot-face").append(picture(art || "icon/gift", 32));
  root.querySelector(".loot-name").textContent = name;
  root.querySelector(".loot-text").textContent = text;
  return new Promise((done) => {
    let over = false;
    const end = () => { if (over) return; over = true; root.remove(); done(); };
    root.lootEnd = end;
    where.append(root);
    setTimeout(() => { root.classList.add("out"); setTimeout(end, calm() ? 0 : 200); }, hold);
  });
}

/**
 * Play the reveal of `result` (what loot.rollAnswer returned).
 *   host   the element to play in (it must be positioned: the reveal sits at its top, or fills it for a
 *          big one); null plays over the whole window
 *   opts   {art     a picture for the tile's face instead of the reward's own: a URL, a game-art path
 *                   ("icon/gem"), or an element (a canvas)
 *           title   a line over the reward's words (a fish's name); the tier's name shows either way
 *           text    the words under it, instead of the reward's own
 *           mode    "chip" (small, holds nothing up) or "show" (big); by default Epic and better are big
 *           top     where the chip sits, in pixels from the top of the host (default 8)
 *           hold    how long it stays once landed, in ms
 *           sound   false for none
 *           keys    false to leave the keyboard alone (a big reveal otherwise takes Space, Enter and Escape)}
 * Returns a Promise that resolves when the reveal has gone, with:
 *   .landed  a Promise resolved when the tier shows
 *   .skip()  hurry to the result (before it lands), or put it away (after)
 *   .close() take it off the screen now
 */
export function reveal(host, result, opts = {}) {
  const tier = Math.max(0, Math.min(TIERS.length - 1, Math.floor(Number(result && result.tier) || 0)));
  const big = opts.mode ? opts.mode === "show" : tier >= EPIC;
  const where = host || windowLayer();
  for (const old of where.querySelectorAll(":scope > .loot")) if (old.lootEnd) old.lootEnd();
  const view = rewardView(result && result.reward);
  const sound = opts.sound !== false;
  const still = calm();

  const root = document.createElement("div");
  root.className = `loot${big ? " show" : ""}`;
  root.setAttribute("translate", "no"); // (its words are translated here, with t())
  root.setAttribute("role", "status");
  root.style.setProperty("--loot-top", `${Math.max(0, Number(opts.top ?? 8) || 0)}px`);
  root.innerHTML = `<div class="loot-flash"></div><div class="loot-rays"></div>
    <div class="loot-pill"><div class="loot-tile"><div class="loot-flip">
      <div class="loot-face loot-back"></div><div class="loot-face loot-front"></div>
    </div></div><div class="loot-words"><div class="loot-name"></div><div class="loot-text"></div></div></div>
    <div class="loot-big" hidden><div class="loot-rank"></div><div class="loot-odds"></div><div class="loot-title"></div>
      <div class="loot-prize"></div><div class="loot-why"></div><div class="loot-hint"></div></div>`;
  const $ = (s) => root.querySelector(s);
  $(".loot-back").append(picture("fx/question", 24));
  $(".loot-front").append(picture(opts.art || view.art || "icon/gift", 32));
  const text = opts.text ?? view.text;
  $(".loot-text").textContent = text;
  if (big) {
    $(".loot-title").textContent = opts.title || "";
    $(".loot-title").hidden = !opts.title;
    const prize = $(".loot-prize");
    for (const line of opts.text != null ? [opts.text] : view.lines) { const d = document.createElement("div"); d.textContent = line; prize.append(d); }
    const why = [];
    if (result && result.boss) why.push(t("Boss word beaten"));
    if (result && result.pity) why.push(t("Luck was overdue"));
    const made = luckText(result && result.parts);
    if (made) why.push(made);
    $(".loot-why").textContent = why.join(" · ");
    $(".loot-hint").textContent = t("Tap to continue");
  }

  const paint = (i) => {
    const tr = TIERS[i];
    root.style.setProperty("--tier", tr.colour);
    root.dataset.tier = String(i);
    $(".loot-name").textContent = opts.title && !big ? opts.title : t(tr.name);
    if (big) { $(".loot-rank").textContent = t(tr.name); $(".loot-odds").textContent = i ? t("1 in {0}", tr.odds.toLocaleString()) : ""; }
  };
  const bump = () => {
    const tile = $(".loot-tile");
    tile.classList.remove("bump");
    void tile.offsetWidth;
    tile.classList.add("bump");
  };

  let ended = false;
  let landed = false;
  let landedAt = 0;
  let hurried = false;
  let wake = null;   // ends the wait in progress
  let finish;
  let hasLanded;
  const done = new Promise((r) => { finish = r; });
  done.landed = new Promise((r) => { hasLanded = r; });
  const beat = (ms) => (hurried || still || ended ? Promise.resolve() : new Promise((r) => {
    const id = setTimeout(() => { wake = null; r(); }, ms);
    wake = () => { clearTimeout(id); wake = null; r(); };
  }));
  const onKey = (e) => {
    if (!root.isConnected) { end(); return; }  // (its host was taken away under it: the keys are everyone's again)
    if (![" ", "Enter", "Escape"].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) done.skip();
  };
  const end = () => {
    if (ended) return;
    ended = true;
    if (wake) wake();
    window.removeEventListener("keydown", onKey, true);
    root.remove();
    hasLanded();
    finish();
  };
  root.lootEnd = end;
  done.close = end;
  done.skip = () => {
    if (ended) return;
    if (!landed) { hurried = true; if (wake) wake(); return; }
    if (performance.now() - landedAt < TAP_GUARD_MS) return;
    if (wake) wake(); else end();
  };
  if (big) {
    root.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); done.skip(); });
    if (opts.keys !== false) window.addEventListener("keydown", onKey, true);
  }

  where.append(root);
  // Where the tile comes to rest in a big reveal: a little above the middle of the host.
  const size = root.getBoundingClientRect();
  const dy = Math.max(0, size.height * 0.34 - (Number(opts.top ?? 8) || 0) - 30);
  root.style.setProperty("--loot-dy", `${Math.round(dy)}px`);

  (async () => {
    paint(0);
    await beat(big ? 200 : 150);
    for (const step of climb(tier, big)) {
      if (ended) return;
      paint(step.tier);
      const out = root.classList.contains("big");
      if (step.tier > 0) { bump(); if (sound && !hurried && !still) SOUND.step(step.tier, out); }
      await beat(step.ms);
      if (step.breakout && !ended) {
        root.classList.add("big");
        if (sound && !hurried && !still) SOUND.breakout();
        await beat(BREAKOUT_MS);
      }
    }
    if (ended) return;
    if (big) root.classList.add("big");
    paint(tier);
    root.classList.add("open");
    if (big) $(".loot-big").hidden = false;
    landed = true;
    landedAt = performance.now();
    hasLanded();
    if (sound) SOUND.land(tier, big);
    if (tier >= RARE) buzz("tick");
    const tile = $(".loot-tile").getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const count = big ? 26 + (tier - EPIC) * 10 : [0, 6, 12][tier] || 0;
    bits(root, tile.left - box.left + tile.width / 2, tile.top - box.top + tile.height / 2, count, TIERS[tier].colour, big ? 170 + tier * 22 : 56);
    if (big && tier >= MYTHIC && !still) { root.classList.add("quake"); setTimeout(() => root.classList.remove("quake"), 520); }
    // It stays a while, then goes by itself; a tap (skip) ends the wait.
    hurried = false;
    await new Promise((r) => {
      const id = setTimeout(() => { wake = null; r(); }, opts.hold ?? (big ? holdFor(tier) : CHIP_HOLD_MS));
      wake = () => { clearTimeout(id); wake = null; r(); };
    });
    if (ended) return;
    root.classList.add("out");
    setTimeout(end, still ? 0 : 200);
  })();
  return done;
}
