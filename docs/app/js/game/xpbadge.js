// Where XP shows while studying, without ever covering a button or the text (the owner: the old XP chip
// "covers buttons"; it floated over the top bar for 5 seconds after every reward).
//  - The level badge: a round button of its own in the top bar, like "?" and refresh beside it. Its ring fills
//    with the XP towards the next level, the level's number in the middle. When XP lands it flies in from where
//    it was earned, the badge bounces and shows "+12" for a moment in its own space; a pixel flame sits on it
//    while the study session's combo is alive. A tap opens a small card: the level, the XP in all, what the next
//    level needs, the combo, and "Open the game". It shows on Home too (the owner: it "disappears on the home
//    screen for whatever reason"), though Home's game card has a level bar of its own.
//  - The line in a word's popup (components/wordbubble.js keeps an empty slot for it): what that lookup, or the
//    Save after it, earned ("+12 XP  10 ×1.2"), and the next lookup's multiplier while the combo is on.
// game.js calls landXp after each reward; what the texts say is worked out in xpline.js.

import { gameOn } from "../components/gameswitch.js";
import { icon as lineIcon } from "../icons.js";
import { state as app } from "../app.js";
import { fly, pop } from "./fly.js";
import { comboNow, getGame, onGame } from "./game.js";
import { icon } from "./render.js";
import { badgeFace, gainLine, ringOffset, shortXp } from "./xpline.js";

let badge = null;
let flashTimer = 0;
let shownLevel = 0;
let inFlight = 0; // XP icons on their way to the badge

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n) => Number(n || 0).toLocaleString();
const loaded = () => !!(app.status && app.status.settings);
const onHome = () => !location.hash || /^#\/?(\?|$)/.test(location.hash);
/** The first-run screens: the badge keeps its place, unseen. */
const away = () => /^#\/(welcome|setup)/.test(location.hash);

function ring(cls, size) {
  return `<svg class="${cls}" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true">
    <circle class="xp-track" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="xp-fill" cx="18" cy="18" r="15.5" pathLength="100"/></svg>`;
}

/** Put the level badge in the top bar `bar`, just before `before` (or at its end). Once. */
export function mountXpBadge(bar, before = null) {
  if (!bar || badge) return;
  badge = document.createElement("button");
  badge.type = "button";
  badge.className = "xp-badge";
  badge.innerHTML = `${ring("xp-ring", 32)}<span class="xp-num"></span><span class="xp-flame" hidden>${icon("combo", 16)}</span>`;
  badge.setAttribute("aria-haspopup", "dialog");
  badge.setAttribute("aria-expanded", "false");
  badge.onclick = () => (document.querySelector(".xp-pop") ? closeCard() : openCard());
  if (before && before.parentNode === bar) before.before(badge); else bar.append(badge);
  paintBadge();
  onGame(() => { if (!inFlight) paintBadge(); }); // (XP on its way in moves the ring when it lands)
  window.addEventListener("hashchange", () => { closeCard(); paintBadge(); });
  fitBar(bar);
}

/** Draw the badge for the game as it is now: its ring slides to the XP held (all the way round first, after a
 * new level), the flame while the combo is alive. */
export function paintBadge() {
  if (!badge) return;
  const on = loaded() && gameOn();
  badge.hidden = !on;
  if (!on) return;
  badge.classList.toggle("away", away());
  const g = getGame();
  const face = badgeFace(g.xp);
  const combo = comboNow();
  const fill = badge.querySelector(".xp-ring .xp-fill");
  if (shownLevel && face.level > shownLevel && !reduced()) {
    // A new level: the ring fills up all the way, then starts again from the new level's share.
    fill.style.strokeDashoffset = "0";
    setTimeout(() => {
      badge.classList.add("still");
      fill.style.strokeDashoffset = String(ringOffset(face.fill));
      void fill.getBoundingClientRect();
      badge.classList.remove("still");
    }, 700);
  } else fill.style.strokeDashoffset = String(ringOffset(face.fill));
  shownLevel = face.level;
  if (!badge.classList.contains("flash")) badge.querySelector(".xp-num").textContent = String(face.level);
  badge.classList.toggle("hot", combo.alive);
  badge.querySelector(".xp-flame").hidden = !combo.alive;
  const label = `Level ${face.level}: ${fmt(g.xp)} XP`;
  badge.setAttribute("aria-label", combo.alive ? `${label}. Combo, next ${combo.next}` : label);
  badge.title = label;
}

/** The gain shows in the badge for a moment ("+12"), in its own space; then the level comes back. */
function flash(xp) {
  if (!badge || badge.hidden || !(xp > 0)) return;
  const num = badge.querySelector(".xp-num");
  const text = `+${shortXp(xp)}`;
  badge.classList.add("flash");
  num.textContent = text;
  num.dataset.len = String(text.length); // (smaller for "+149", so it stays inside the ring)
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    badge.classList.remove("flash");
    delete num.dataset.len;
    num.textContent = String(badgeFace(getGame().xp).level);
  }, 1400);
}

/** The point the earned XP bursts from when it has no place of its own (the day's goal reached while
 * reading): the badge, when it can be seen. */
export function badgePoint() {
  if (!badge || badge.hidden || badge.classList.contains("away") || !badge.getClientRects().length) return null;
  const r = badge.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom };
}

// ---------- the line in a word's popup ----------

/** The popup's slot for this reward: the open popup shown for `anchor` (the word looked up). A word saved
 * from a popup shown for another element (a video's captions) still finds the one open popup. */
function slotFor(anchor, type) {
  const slots = [...document.querySelectorAll(".word-bubble:not([hidden]) > .wb-xp")];
  return slots.find((s) => anchor && s.wbAnchor === anchor) || (type === "save" && slots.length === 1 ? slots[0] : null);
}

function paintLine(slot, line) {
  slot.replaceChildren();
  slot.hidden = !line;
  if (!line) return;
  const main = document.createElement("span");
  main.className = "xp-gain";
  for (const p of line.parts) {
    const el = document.createElement(p.kind === "xp" ? "b" : "span");
    el.className = `xp-${p.kind}`;
    if (p.kind === "item") el.innerHTML = icon(p.item === "freeze" ? "freeze_badge" : "hint", 16);
    if (p.kind === "coins") el.innerHTML = icon("coin", 16);
    el.append(p.text);
    main.append(el);
  }
  slot.append(main);
  if (line.combo) {
    const c = document.createElement("span");
    c.className = `xp-next${line.combo.hot ? " hot" : ""}`;
    if (line.combo.hot) c.innerHTML = icon("combo", 16);
    c.append(line.combo.text);
    slot.append(c);
  }
  slot.title = line.label;
}

/**
 * A reward came (game.js reward). `result` is what rules.earn returned (null when nothing was earned);
 * `from` is where it was earned (the word tapped), `loud` false for the quiet ones (study time ticking up,
 * a review card: the reviewer has its own). The other options are gainLine's.
 */
export function landXp(result, { from = null, loud = true, chained = false, hot = false, next = "", coins = 0, repeat = false } = {}) {
  const slot = slotFor(from, result ? result.type : "word");
  const line = slot && (loud || repeat) ? gainLine(result, { chained, hot, next, coins, repeat }) : null;
  if (slot && line) paintLine(slot, line);
  if (!result) { paintBadge(); return; }
  if (!badge || badge.hidden || badge.classList.contains("away") || !loud) { paintBadge(); return; }
  // (from the word that earned it; with nothing to fly from, it lands at once)
  inFlight++;
  fly("xp", from, badge, { arrive: () => { inFlight = Math.max(0, inFlight - 1); paintBadge(); flash(result.xp); } });
}

// ---------- the card a tap on the badge opens ----------

function closeCard() {
  const card = document.querySelector(".xp-pop");
  if (!card) return;
  card.remove();
  if (badge) badge.setAttribute("aria-expanded", "false");
}

function openCard() {
  if (!badge || !loaded()) return;
  closeCard();
  const g = getGame();
  const face = badgeFace(g.xp);
  const combo = comboNow();
  const card = document.createElement("div");
  card.className = "xp-pop";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Your level");
  card.innerHTML = `
    <span class="xp-pop-ring">${ring("xp-ring", 76)}<b><small>Level</small><span></span></b></span>
    <div class="xp-pop-total"></div>
    <div class="xp-pop-left"></div>
    <div class="xp-pop-combo${combo.alive ? " hot" : ""}"></div>
    <button type="button" class="primary xp-pop-go">Open the game</button>
    <button type="button" class="ghost icon xp-pop-close" aria-label="Close" title="Close">${lineIcon("close", 18)}</button>`;
  card.querySelector(".xp-fill").style.strokeDashoffset = String(ringOffset(face.fill));
  card.querySelector(".xp-pop-ring b span").textContent = String(face.level);
  card.querySelector(".xp-pop-total").textContent = `${fmt(g.xp)} XP`;
  card.querySelector(".xp-pop-left").textContent = `${fmt(face.left)} XP to level ${face.level + 1}`;
  const c = card.querySelector(".xp-pop-combo");
  if (combo.alive) {
    c.innerHTML = icon("combo", 16);
    c.append(`Combo on: next lookup ${combo.next}`);
  } else c.textContent = "Look words up one after another for a combo: ×1.2, then ×1.5, then ×2.";
  const go = card.querySelector(".xp-pop-go");
  go.onclick = () => { closeCard(); openGame(); };
  card.querySelector(".xp-pop-close").onclick = closeCard;
  document.body.append(card);
  placeCard(card);
  badge.setAttribute("aria-expanded", "true");
  go.focus({ preventScroll: true });
  const outside = (e) => {
    if (!card.isConnected) { document.removeEventListener("pointerdown", outside, true); return; }
    if (card.contains(e.target) || badge.contains(e.target)) return;
    closeCard();
  };
  const esc = (e) => {
    if (!card.isConnected) { document.removeEventListener("keydown", esc); return; }
    if (e.key === "Escape") { closeCard(); badge.focus(); }
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", esc);
}

/** Under the badge, its far edge in line with the badge's (inside the window either way). */
function placeCard(card) {
  const r = badge.getBoundingClientRect();
  const w = card.offsetWidth;
  const rtl = getComputedStyle(badge).direction === "rtl";
  let left = rtl ? r.left : r.right - w;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  card.style.left = `${left}px`;
  card.style.top = `${r.bottom + 10}px`;
}

/** Home, scrolled to the game card at its bottom. */
function openGame() {
  if (!onHome()) location.hash = "#/";
  let tries = 0;
  const find = () => {
    const el = document.querySelector(".habitat");
    if (el) el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
    else if (++tries < 60) setTimeout(find, 50);
  };
  setTimeout(find, 50);
}

// ---------- room in the top bar ----------

/** A narrow phone (or a long language name, or the web app's extra buttons): when the phone's top bar can't
 * hold everything at its full size, the name "Tamkeen" beside the logo gives way (the logo, which says it in
 * Arabic, stays and still goes Home). Nothing is made smaller. (The computer's bar has room: its links scroll.) */
function fitBar(bar) {
  if (!bar.querySelector(".top-search")) return;
  const check = () => {
    bar.classList.remove("xp-tight");
    bar.classList.add("xp-measure"); // (nothing may shrink while measuring: Search would, quietly)
    let lo = Infinity;
    let hi = -Infinity;
    for (const k of bar.children) {
      if (!k.getClientRects().length) continue;
      const r = k.getBoundingClientRect();
      lo = Math.min(lo, r.left);
      hi = Math.max(hi, r.right);
    }
    const cs = getComputedStyle(bar);
    const room = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const over = hi - lo > room + 0.5;
    bar.classList.remove("xp-measure");
    bar.classList.toggle("xp-tight", over);
  };
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; check(); }); } };
  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(later);
    const watch = () => { for (const el of bar.children) ro.observe(el); };
    watch();
    new MutationObserver(() => { watch(); later(); }).observe(bar, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
  }
  window.addEventListener("resize", later);
  later();
}
