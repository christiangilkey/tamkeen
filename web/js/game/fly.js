// Rewards that fly to their counter: a small pixel icon leaves the place something was earned (the word
// tapped, the building gathered, the creature) and lands in what counts it (coins, gems, the level bar,
// the Garden tile, the XP chip while studying), which pops as it lands. Cheap: a few <img>s moved by the
// browser's own animation, never more than MAX_FLYING at once. With "reduce motion" nothing flies: the
// counter just takes its new number.

import { icon } from "./render.js";

const MAX_FLYING = 10;
let flying = 0;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const visible = (el) => !!(el && el.isConnected && el.getClientRects().length);

function layer() {
  let el = document.getElementById("game-fx");
  if (!el) {
    el = document.createElement("div");
    el.id = "game-fx";
    document.body.append(el);
  }
  return el;
}

/** The middle of an element on screen, or the point itself ({x, y}). Null for an element no longer on the
 * page (a word bubble already closed): nothing flies from the corner of the screen. */
export function centre(from) {
  if (from && typeof from.getBoundingClientRect === "function") {
    if (from.isConnected === false) return null;
    const r = from.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return from && Number.isFinite(from.x) && Number.isFinite(from.y) ? from : null;
}

/** Make an element bounce once (the counter something landed in). */
export function pop(el) {
  if (!el || reduced()) return;
  el.classList.remove("hud-pop");
  void el.offsetWidth; // restart it if it is already running
  el.classList.add("hud-pop");
  el.addEventListener("animationend", () => el.classList.remove("hud-pop"), { once: true });
}

/**
 * Fly `count` copies (at most 4) of the pixel icon `id` from `from` (an element, or a point on screen) into
 * the element `to`. `arrive()` runs once, when the first lands (or at once when nothing can fly: reduced
 * motion, no `to` on screen, too many already in the air); the target pops then.
 */
export function fly(id, from, to, { count = 1, arrive = () => {}, px = 16 } = {}) {
  let landed = false;
  const land = () => { if (landed) return; landed = true; pop(to); try { arrive(); } catch { /* a counter must not break the game */ } };
  const start = centre(from);
  const end = visible(to) ? centre(to) : null;
  if (!start || !end || reduced() || typeof Element === "undefined" || !Element.prototype.animate || flying >= MAX_FLYING) { land(); return; }
  const fx = layer();
  const n = Math.max(1, Math.min(4, Math.round(count)));
  const lift = Math.min(90, 30 + Math.abs(end.x - start.x) * 0.25); // a little arc, higher for a longer way
  for (let i = 0; i < n; i++) {
    const img = document.createElement("span");
    img.className = "fly-icon";
    img.innerHTML = icon(id, px);
    fx.append(img);
    flying++;
    const jitter = (i - (n - 1) / 2) * 10;
    const x0 = start.x - px / 2 + jitter;
    const y0 = start.y - px / 2;
    const x1 = end.x - px / 2;
    const y1 = end.y - px / 2;
    const mid = `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1.25)`;
    const anim = img.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 8}px) scale(1.1)`, opacity: 1, offset: 0.12 },
      { transform: mid, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(.8)`, opacity: 1 },
    ], { duration: 640 + i * 70, delay: i * 70, easing: "cubic-bezier(.45,0,.7,1)" /* (no spaces: not words to translate) */, fill: "both" });
    const done = () => { img.remove(); flying = Math.max(0, flying - 1); land(); };
    anim.onfinish = done;
    anim.oncancel = done;
  }
}
