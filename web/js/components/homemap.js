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

/**
 * Draw the map into `box`. `kinds`: [{key, label, icon, href}] (the Library's kinds, Home left out); `uses`: {key:
 * number} (libraryhome.js usage); `rings`: {key: ringOf's answer}; `lang`: the language being learned. Returns a
 * function that tidies up.
 */
export function homeMap(box, { kinds, uses, rings = {}, lang }) {
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
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastW = 0;

  function draw() {
    const W = Math.round(map.clientWidth);
    if (!W || W === lastW) return;
    lastW = W;
    const small = W < 560; // (by the room there is: the web app on a computer is the phone build at full width)
    const H = small ? Math.round(W * 1.5) : Math.min(760, Math.max(560, Math.round(W * 0.72)));
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
  }

  const watch = new ResizeObserver(() => draw());
  watch.observe(map);
  draw();
  return () => watch.disconnect();
}
