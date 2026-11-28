// The Library's Home as a bubble map (prototype "library_home", pages/library.js): every kind of thing in the Library
// as a circle round the language being learned, bigger the more it is used. A brand-plum ring marks a kind that needs
// something not set up on this device yet (libraryhome.js ringOf: a key, or for Netflix the computer app or the browser
// extension); tapping a ringed bubble says what is missing, with a button to set it up, instead of opening it blind.
// Tapping any other bubble opens that kind. No legend (the owner: "I don't think the legend at the bottom is
// necessary"). The map sits on a dark stage in either theme (the owner chose the dark picture; libraryhome.css).

import { h } from "../app.js";
import { icon } from "../icons.js";
import { langAttrs, langInfo } from "../languages.js";
import { t, uiLanguage } from "../i18n.js";
import { settingsHref } from "../fixes.js";
import { openModal } from "./modal.js";
import { extensionLink, unavailableText } from "../netflix.js";
import { arrange, bubbleSizes, extentOf, layoutBubbles, linksOf, overlaps, relax } from "../libraryhome.js";
import { feature } from "../prototype.js";

const SVG = "http://www.w3.org/2000/svg";
// The computer app's download page (the same as Settings → Card voices points to: voicesetup.js).
const DESKTOP_DOWNLOAD = "https://github.com/christiangilkey/tamkeen/releases/latest";

/** The short line under a ringed bubble's name, where one helps at a glance (Netflix: what it needs). */
function ringLabel(ring) {
  if (!ring || ring.why !== "netflix") return "";
  return ring.reason === "web-computer" ? t("Needs the browser extension") : t("Needs the computer app");
}

/** What a ringed bubble says when tapped: what is missing, a button to set it up, and the kind itself anyway. */
function explainRing(ring, name, href) {
  const m = openModal({ title: ring.why === "netflix" ? unavailableText(ring.reason).title : t("Needs your own key") });
  const body = h(`<div class="stack lh-why-box"><p></p><div class="row"><a class="btn primary"></a><a class="btn"></a></div></div>`);
  const [say, go, anyway] = [body.querySelector("p"), body.querySelector("a.primary"), body.querySelector("a:not(.primary)")];
  if (ring.why === "ai") {
    say.textContent = t("{0} talks with your own AI, so it needs your AI key. Add it in Settings.", name);
    go.textContent = t("Add a key");
    go.href = settingsHref("words", "key");
  } else if (ring.why === "stt") {
    say.textContent = t("These come with no words to read: a speech-to-text service writes them with your own key, or the Tamkeen computer app does it for free. Add a key in Settings.");
    go.textContent = t("Add a key");
    go.href = settingsHref("listening", "sttkey");
  } else {
    say.textContent = unavailableText(ring.reason).lines[0];
    if (ring.reason === "web-computer") {
      go.textContent = t("Get the Tamkeen extension");
      go.href = extensionLink(navigator.userAgent, uiLanguage());
    } else {
      go.textContent = t("Get the computer app");
      go.href = DESKTOP_DOWNLOAD;
    }
    go.target = "_blank";
    go.rel = "noopener";
  }
  anyway.textContent = t("Open {0}", name);
  anyway.href = href;
  for (const a of [go, anyway]) a.addEventListener("click", () => m.close());
  m.body.append(body);
}

// ---------- what you were last on (the owner, 2026-11-27: Continue must "mesh well" with the map) ----------

const KIND_ICON = { audio: "podcast", video: "video", page: "page" };

/** A thin ring round a cover that fills as far as it got (the stage's teal on its line colour). */
function progressRing(frac) {
  const pct = Math.max(2, Math.min(100, Math.round((frac || 0) * 100)));
  return `<svg class="lh-pr" viewBox="0 0 100 100" aria-hidden="true"><circle class="lh-pr-bg" cx="50" cy="50" r="47" pathLength="100"/>`
    + `<circle class="lh-pr-on" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="${pct} 100"/></svg>`;
}

/** The round cover: its picture, or the kind's line icon when it has none (a web page). */
function cover(item, px) {
  const el = h(`<span class="lh-cover">${item.cover ? `<img alt="" loading="lazy">` : icon(KIND_ICON[item.kind] || "video", px)}</span>`);
  if (item.cover) el.querySelector("img").src = item.cover;
  return el;
}

/** Where each bubble is kept after it was dragged (prototype "library_physics"), on this device only: {"<width
 *  band>": {key: [dx, dy] from the hub}}. */
const PLACED = "lhPlaced";
const band = (W) => String(Math.round(W / 40) * 40);
function placedFor(W) { try { return (JSON.parse(localStorage.getItem(PLACED) || "{}") || {})[band(W)] || null; } catch { return null; } }
function savePlaced(W, bodies, hub) {
  try {
    const all = JSON.parse(localStorage.getItem(PLACED) || "{}") || {};
    all[band(W)] = Object.fromEntries(bodies.filter((b) => !b.hub && !b.attach).map((b) => [b.key, [Math.round(b.x - hub.x), Math.round(b.y - hub.y)]]));
    localStorage.setItem(PLACED, JSON.stringify(all));
  } catch { /* storage off: the arrangement just isn't kept */ }
}

/**
 * Draw the map into `box`. `kinds`: [{key, label, icon, href}] (the Library's kinds, Home left out); `uses`: {key:
 * number} (libraryhome.js usage); `rings`: {key: ringOf's answer}; `lang`: the language being learned; `resume`: what
 * was played or read last and isn't finished, newest first ([{href, title, left, frac, cover, kind, section}]), each
 * beside its section's bubble (the owner chose this, "I like A more", 2026-11-27); an item whose section isn't on the
 * map goes beside the biggest bubble.
 * Nothing overlaps (the owner: "it looks like things overlap"): every bubble's words are measured as drawn, and
 * libraryhome.js arrange() gives each bubble, its words, the hub and the "continue" bubbles clear space, keeps lines
 * off other words, and keeps it all on the stage, whose height then fits what is on it. With the prototype
 * "library_physics" the bubbles can be dragged and the others make room (not with reduced motion). Returns a
 * function that tidies up.
 */
export function homeMap(box, { kinds, uses, rings = {}, lang, resume = [] }) {
  const rtl = document.documentElement.dir === "rtl";
  const info = langInfo(lang) || {};
  box.innerHTML = "";
  const stage = h(`<section class="lh-stage" aria-label="${t("Your library")}">
    <div class="lh-map"><svg class="lh-lines" aria-hidden="true"></svg>
      <div class="lh-hub"><span class="lh-lang" ${langAttrs(lang)} translate="no"></span><span class="lh-sub">${t("Your library")}</span></div>
    </div>
  </section>`);
  stage.querySelector(".lh-lang").textContent = info.native || info.name || lang;
  box.append(stage);
  const map = stage.querySelector(".lh-map");
  const lines = stage.querySelector(".lh-lines");
  const hubEl = stage.querySelector(".lh-hub");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const physics = feature("library_physics") && !calm;
  map.classList.toggle("lh-physics", physics);
  let lastW = 0, bodies = [], els = new Map(), W = 0, H = 0;

  /** The bubbles' elements, made once per width (their words measured once they are in the page). */
  function makeBubble(n, small, i, cx, cy) {
    const ring = rings[n.key] || null;
    const name = t(n.label), why = ringLabel(ring);
    const b = h(`<a class="lh-b${ring ? " ring" : ""}${n.below ? " small" : ""}${n.r > (small ? 58 : 80) ? " big" : ""}" href="${n.href}">
      ${icon(n.icon, small ? 22 : 24)}<span class="lh-n"><span class="lh-name"></span>${why ? `<span class="lh-need"></span>` : ""}</span></a>`);
    b.querySelector(".lh-name").textContent = name;
    if (why) b.querySelector(".lh-need").textContent = why;
    b.setAttribute("aria-label", why ? `${name}, ${why}` : ring ? `${name}, ${t("Needs your own key")}` : name);
    if (ring) b.addEventListener("click", (e) => { e.preventDefault(); explainRing(ring, name, n.href); });
    b.style.width = b.style.height = `${2 * n.r}px`;
    // A gentle settle (the study side's calm movement): each bubble eases out from the hub, a little after the one before.
    if (!calm) {
      b.style.setProperty("--from-x", `${cx - n.x}px`);
      b.style.setProperty("--from-y", `${cy - n.y}px`);
      b.style.animationDelay = `${Math.min(i * 20, 160)}ms`;
    }
    return b;
  }
  function makeResume(it, main, r) {
    const a = h(`<a class="lh-r${main ? " main" : ""}" href="${it.href}"><span class="lh-ring"></span></a>`);
    a.querySelector(".lh-ring").append(cover(it, main ? 22 : 14));
    a.querySelector(".lh-ring").insertAdjacentHTML("beforeend", progressRing(it.frac));
    if (main) {
      a.insertAdjacentHTML("beforeend", `<span class="lh-rl"><span class="lh-rv"></span><span class="lh-rt" dir="auto"></span></span>`);
      a.querySelector(".lh-rv").textContent = `${t("Continue")} · ${it.left || ""}`;
      a.querySelector(".lh-rt").textContent = it.title || "";
    }
    a.setAttribute("aria-label", `${t("Continue")}: ${it.title || ""}, ${it.left || ""}`);
    a.title = it.title || "";
    a.style.width = a.style.height = `${2 * r}px`;
    return a;
  }

  /** Put every element where its body is, and draw the lines (libraryhome.js linksOf: each ends where it meets its
   *  bubble or its words, so no line runs under words). */
  function place() {
    for (const b of bodies) {
      const el = b.hub ? hubEl : els.get(b.key);
      el.style.left = `${b.x}px`;
      el.style.top = `${b.y}px`;
    }
    lines.replaceChildren();
    for (const link of linksOf(bodies)) {
      const line = document.createElementNS(SVG, "line");
      const [x1, y1, x2, y2] = link.ends;
      line.dataset.from = link.from; line.dataset.to = link.to;
      line.setAttribute("x1", x1); line.setAttribute("y1", y1); line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      if (bodies.find((b) => b.key === link.to)?.attach) line.setAttribute("class", "lh-rline");
      lines.append(line);
    }
  }

  function draw() {
    W = Math.round(map.clientWidth);
    if (!W || W === lastW) return;
    lastW = W;
    const small = W < 560; // (by the room there is: the web app on a computer is the phone build at full width)
    hubEl.classList.toggle("narrow", W < 370); // (a narrow phone: the language's name a size smaller)
    const room = small ? Math.round(W * 1.9) : Math.min(1100, Math.max(760, Math.round(W * 0.9))); // (room to arrange in: the stage is then cut to fit)
    map.style.height = `${room}px`;
    const fit = small ? Math.min(1, W / 370) : 1; // (a narrow phone: a little smaller bubbles)
    const sized = bubbleSizes(kinds.map((k) => ({ ...k, note: !!ringLabel(rings[k.key]) })), uses, { phone: small })
      .map((n) => ({ ...n, r: Math.round(n.r * fit) }));
    const { nodes, cx, cy } = layoutBubbles(sized, W, room, { phone: small, rtl });
    map.querySelectorAll(".lh-b, .lh-r").forEach((b) => b.remove());
    els = new Map();
    nodes.forEach((n, i) => { const b = makeBubble(n, small, i, cx, cy); b.dataset.key = n.key; els.set(n.key, b); map.append(b); });
    const sections = new Set(nodes.map((n) => n.key));
    const biggest = [...nodes].sort((a, b) => b.r - a.r)[0];
    const going = kinds.length ? resume : [];
    going.forEach((it, i) => {
      const r = i === 0 ? (small ? 34 : 44) : (small ? 17 : 21);
      const a = makeResume(it, i === 0, r);
      a.dataset.key = `resume${i}`;
      els.set(`resume${i}`, a);
      map.append(a);
    });
    // The bodies, with the words measured as the page draws them (offsetWidth: the size before any movement).
    // (the hub anchored in the middle of the stage, side to side)
    const hubBody = { key: "hub", hub: true, x: W / 2, y: cy, w: hubEl.offsetWidth + 8, h: hubEl.offsetHeight + 4 };
    bodies = [hubBody, ...nodes.map((n) => {
      const words = n.below ? els.get(n.key).querySelector(".lh-n") : null;
      return { key: n.key, x: n.x, y: n.y, r: n.r, lw: words ? words.offsetWidth : 0, lh: words ? words.offsetHeight : 0 };
    })];
    const kept = physics ? placedFor(W) : null;
    if (kept) for (const b of bodies) if (kept[b.key]) { b.x = hubBody.x + kept[b.key][0]; b.y = hubBody.y + kept[b.key][1]; }
    going.forEach((it, i) => {
      const el = els.get(`resume${i}`), words = el.querySelector(".lh-rl");
      const r = parseFloat(el.style.width) / 2 + (i === 0 ? 5 : 0); // (the main one's outer ring, 5px out)
      bodies.push({ key: `resume${i}`, attach: sections.has(it.section) ? it.section : biggest.key, near: 12, x: cx, y: cy, r,
        lw: words ? words.offsetWidth : 0, lh: words ? words.offsetHeight + 4 : 0 });
    });
    // If no arrangement clears everything (a narrow phone, long words), the circles a little smaller and again: the
    // words keep their size.
    const start = bodies;
    for (const shrink of [1, 0.92, 0.85, 0.78]) {
      bodies = arrange(start.map((b) => (b.hub || !b.r ? b : { ...b, r: Math.round(b.r * shrink) })), { W, H: room });
      if (!overlaps(bodies, W, room).length) break;
    }
    for (const b of bodies) {
      const el = els.get(b.key);
      if (el && el.classList.contains("lh-b")) el.style.width = el.style.height = `${2 * b.r}px`;
    }
    // The stage as tall as what is on it.
    const ext = bodies.map(extentOf), top = Math.min(...ext.map((e) => e.t)) - 12, bottom = Math.max(...ext.map((e) => e.b)) + 12;
    for (const b of bodies) b.y -= top;
    H = Math.round(bottom - top);
    map.style.height = `${H}px`;
    lines.setAttribute("width", W);
    lines.setAttribute("height", H);
    for (const b of bodies) if (!b.hub && !b.attach) b.rest = Math.hypot(b.x - bodies[0].x, b.y - bodies[0].y);
    place();
  }

  // ---------- dragging (prototype "library_physics") ----------
  // Press and move a bubble: it follows the finger and the others make room (libraryhome.js relax, a few steps a
  // frame, shown with a little easing). Let go: it stays where it was put, the rest settle, and the arrangement is
  // kept on this device. A tap without moving still opens the bubble.
  let drag = null, justDragged = false, frame = 0;
  const shown = new Map(); // where each body is drawn, easing towards where the simulation has it
  function animate(until) {
    cancelAnimationFrame(frame);
    let quiet = 0;
    const tick = () => {
      relax(bodies, { W, H, steps: 3, pinned: drag && drag.key, pull: 0 });
      let moved = 0;
      for (const b of bodies) {
        if (b.hub) continue;
        const s = shown.get(b.key) || { x: b.x, y: b.y };
        const k = drag && b.key === drag.key ? 1 : 0.3;
        const nx = s.x + (b.x - s.x) * k, ny = s.y + (b.y - s.y) * k;
        moved = Math.max(moved, Math.hypot(nx - s.x, ny - s.y));
        shown.set(b.key, { x: nx, y: ny });
      }
      const real = bodies.map((b) => ({ ...b }));
      for (const b of bodies) if (!b.hub) Object.assign(b, shown.get(b.key));
      place();
      for (const [i, b] of bodies.entries()) Object.assign(b, { x: real[i].x, y: real[i].y });
      quiet = moved < 0.2 ? quiet + 1 : 0;
      if (drag || quiet < 8) frame = requestAnimationFrame(tick);
      else { until && until(); }
    };
    frame = requestAnimationFrame(tick);
  }
  function at(e) { const r = map.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  if (physics) {
    map.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".lh-b, .lh-r");
      if (!el || e.button > 0) return;
      const key = [...els].find(([, v]) => v === el)?.[0];
      const body = bodies.find((b) => b.key === key);
      if (!body) return;
      const p = at(e);
      drag = { key, el, start: p, dx: body.x - p.x, dy: body.y - p.y, moving: false, id: e.pointerId };
    });
    map.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = at(e);
      if (!drag.moving) {
        if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 6) return;
        drag.moving = true;
        drag.el.setPointerCapture(e.pointerId);
        drag.el.classList.add("lh-held");
        for (const b of bodies) shown.set(b.key, { x: b.x, y: b.y });
        animate();
      }
      const body = bodies.find((b) => b.key === drag.key);
      const e2 = extentOf(body); // (kept on the stage, words and all)
      body.x = Math.max(body.x - e2.l + 2, Math.min(W - (e2.r - body.x) - 2, p.x + drag.dx));
      body.y = Math.max(body.y - e2.t + 2, Math.min(H - (e2.b - body.y) - 2, p.y + drag.dy));
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag;
      drag = null;
      if (!was.moving) return; // (a tap: the link opens as usual)
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 50);
      was.el.classList.remove("lh-held");
      // It stays where it was put: every bubble's own distance from the hub becomes where it is now.
      const hub = bodies.find((b) => b.hub);
      for (const b of bodies) if (!b.hub && !b.attach) b.rest = Math.hypot(b.x - hub.x, b.y - hub.y);
      animate(() => savePlaced(W, bodies, hub));
    };
    map.addEventListener("pointerup", end);
    map.addEventListener("pointercancel", end);
    // (not the browser's own dragging of a link or picture, which would take the pointer away)
    map.addEventListener("dragstart", (e) => e.preventDefault());
    // (a drag ends with a click on what was dragged: that click doesn't open it)
    map.addEventListener("click", (e) => { if (justDragged) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  const watch = new ResizeObserver(() => draw());
  watch.observe(map);
  draw();
  return () => { watch.disconnect(); cancelAnimationFrame(frame); };
}
