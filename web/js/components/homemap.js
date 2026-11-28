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
import { bubbleSizes, layoutBubbles } from "../libraryhome.js";

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

/**
 * Where a "continue" bubble of radius `r` sits beside its section's bubble `s`: tried round it, starting on
 * the side away from the hub, the place that overlaps least with the other bubbles, the hub, the ones placed already
 * and the stage's edges. `label`: room under it for its words (px).
 */
function besideSection(s, r, label, { nodes, placed, cx, cy, hub, W, H }) {
  const base = Math.atan2(s.y - cy, s.x - cx);
  const taken = [...nodes.map((n) => ({ x: n.x, y: n.y + (n.under || 0) / 2, r: Math.max(n.r + (n.under || 0) / 2, n.note && n.below ? 68 : 0) })),
    { x: cx, y: cy, r: hub }, ...placed];
  const own = taken[nodes.indexOf(s)];
  // The bubble and the words under it, each as a round area: the words (about 140px wide) must clear its own section
  // too; the bubble only the others (it touches its section by design, joined by the short line).
  const parts = (x, y) => [{ x, y, r, skipOwn: true }, ...(label ? [{ x, y: y + r + label / 2, r: 56, skipOwn: false }] : [])];
  let best = null;
  for (const extra of [10, 26, 44, 64]) {
    for (let k = 0; k <= 17; k++) {
      const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
      const x = s.x + Math.cos(ang) * (s.r + extra + r), y = s.y + Math.sin(ang) * (s.r + extra + r);
      let bad = extra / 20; // (nearer its section is better, other things equal)
      for (const p of parts(x, y)) {
        for (const o of taken) {
          if (o === own && p.skipOwn) continue;
          bad += Math.max(0, o.r + p.r + 6 - Math.hypot(o.x - p.x, o.y - p.y));
        }
        bad += 3 * (Math.max(0, p.r - p.x) + Math.max(0, p.x + p.r - W) + Math.max(0, p.r - p.y) + Math.max(0, p.y + p.r - H));
      }
      if (!best || bad < best.bad - 0.5) best = { x, y, bad };
    }
  }
  placed.push(...parts(best.x, best.y).map(({ x, y, r: pr }) => ({ x, y, r: pr })));
  return best;
}

/**
 * Draw the map into `box`. `kinds`: [{key, label, icon, href}] (the Library's kinds, Home left out); `uses`: {key:
 * number} (libraryhome.js usage); `rings`: {key: ringOf's answer}; `lang`: the language being learned; `resume`: what
 * was played or read last and isn't finished, newest first ([{href, title, left, frac, cover, kind, section}]), each
 * beside its section's bubble (the owner chose this, "I like A more", 2026-11-27); an item whose section isn't on the
 * map goes beside the biggest bubble. Returns a function that tidies up.
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
  const orbit = resume.length > 0 && kinds.length > 0;
  box.append(stage);
  const map = stage.querySelector(".lh-map");
  const lines = stage.querySelector(".lh-lines");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastW = 0;

  function draw() {
    const W = Math.round(map.clientWidth);
    if (!W || W === lastW) return;
    lastW = W;
    const small = W < 560; // (by the room there is: the web app on a computer is the phone build at full width)
    const H = (small ? Math.round(W * 1.5) : Math.min(760, Math.max(560, Math.round(W * 0.72)))) + (orbit ? (small ? 70 : 60) : 0);
    map.style.height = `${H}px`;
    lines.setAttribute("width", W);
    lines.setAttribute("height", H);
    const sized = bubbleSizes(kinds.map((k) => ({ ...k, note: !!ringLabel(rings[k.key]) })), uses, { phone: small });
    const { nodes, cx, cy, hub } = layoutBubbles(sized, W, H, { phone: small, rtl });
    const hubEl = stage.querySelector(".lh-hub");
    hubEl.style.left = `${cx}px`;
    hubEl.style.top = `${cy}px`;
    lines.replaceChildren();
    map.querySelectorAll(".lh-b").forEach((b) => b.remove());
    nodes.forEach((n, i) => {
      // A line from the edge of the hub's words to the bubble.
      const d = Math.hypot(n.x - cx, n.y - cy) || 1, start = hub * 0.8;
      const line = document.createElementNS(SVG, "line");
      line.setAttribute("x1", cx + ((n.x - cx) / d) * start);
      line.setAttribute("y1", cy + ((n.y - cy) / d) * start);
      line.setAttribute("x2", n.x);
      line.setAttribute("y2", n.y);
      lines.append(line);
      const ring = rings[n.key] || null;
      const name = t(n.label), why = ringLabel(ring);
      const b = h(`<a class="lh-b${ring ? " ring" : ""}${n.below ? " small" : ""}${n.r > (small ? 58 : 80) ? " big" : ""}" href="${n.href}">
        ${icon(n.icon, small ? 22 : 24)}<span class="lh-n"><span class="lh-name"></span>${why ? `<span class="lh-need"></span>` : ""}</span></a>`);
      b.querySelector(".lh-name").textContent = name;
      if (why) b.querySelector(".lh-need").textContent = why;
      b.setAttribute("aria-label", why ? `${name}, ${why}` : ring ? `${name}, ${t("Needs your own key")}` : name);
      if (ring) b.addEventListener("click", (e) => { e.preventDefault(); explainRing(ring, name, n.href); });
      b.style.width = b.style.height = `${2 * n.r}px`;
      b.style.left = `${n.x}px`;
      b.style.top = `${n.y}px`;
      // A gentle settle (the study side's calm movement): each bubble eases out from the hub, a little after the one before.
      if (!calm) {
        b.style.setProperty("--from-x", `${cx - n.x}px`);
        b.style.setProperty("--from-y", `${cy - n.y}px`);
        b.style.animationDelay = `${Math.min(i * 20, 160)}ms`;
      }
      map.append(b);
    });
    if (orbit) drawResume(nodes, cx, cy, hub, W, H, small);
  }

  /** The newest bubble beside its section's (its cover, a progress ring, "Continue" and its title under it);
   *  the next two as small ringed covers beside theirs. */
  function drawResume(nodes, cx, cy, hub, W, H, small) {
    map.querySelectorAll(".lh-r").forEach((b) => b.remove());
    const placed = [];
    resume.forEach((it, i) => {
      const main = i === 0;
      const r = main ? (small ? 34 : 44) : (small ? 17 : 21), label = main ? 40 : 0;
      const s = nodes.find((n) => n.key === it.section) || [...nodes].sort((a, b) => b.r - a.r)[0];
      const at = besideSection(s, r, label, { nodes, placed, cx, cy, hub, W, H });
      // The line joins its section to the bubble, or to the words under it when they face the section (no line
      // through the words).
      const under = label && at.y + r < s.y - s.r * 0.3;
      const end = under ? { x: at.x, y: at.y + r + label + 6, gap: 0 } : { x: at.x, y: at.y, gap: r };
      const d = Math.hypot(end.x - s.x, end.y - s.y) || 1;
      const line = document.createElementNS(SVG, "line");
      line.setAttribute("class", "lh-rline");
      line.setAttribute("x1", s.x + ((end.x - s.x) / d) * s.r);
      line.setAttribute("y1", s.y + ((end.y - s.y) / d) * s.r);
      line.setAttribute("x2", end.x - ((end.x - s.x) / d) * end.gap);
      line.setAttribute("y2", end.y - ((end.y - s.y) / d) * end.gap);
      lines.append(line);
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
      a.style.left = `${at.x}px`;
      a.style.top = `${at.y}px`;
      map.append(a);
    });
  }

  const watch = new ResizeObserver(() => draw());
  watch.observe(map);
  draw();
  return () => watch.disconnect();
}
