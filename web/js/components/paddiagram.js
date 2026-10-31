// Settings → Controller: a drawing of an Xbox-style controller (drawn here, no one's artwork or logo)
// with a line from each button and stick to what it does on the screen chosen above it. The labels
// come from the mapping (padmap.js whatDoes), so they change as soon as a button is given another job.
// Wide: the labels stand in a column either side of the drawing. Narrow (a phone): the drawing on top
// and the labels in two columns under it, their lines running up the sides to their buttons.

import { esc } from "../app.js";
import { t } from "../i18n.js";
import { actionOf, inputName, shortOf, whatDoes } from "../padmap.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// The controller, seen from the front, in a 320 × 210 box. Each control has a data-at name the
// labels point to.
const PICTURE = `<svg class="pad-dia-svg" viewBox="0 0 320 210" role="img" aria-label="A game controller">
  <g class="pd-trig">
    <rect data-at="b6" x="62" y="10" width="50" height="20" rx="9"/>
    <rect data-at="b7" x="208" y="10" width="50" height="20" rx="9"/>
  </g>
  <g class="pd-bump">
    <path data-at="b4" d="M56 44 C66 30 96 26 124 30 L124 40 C100 38 76 42 62 50 Z"/>
    <path data-at="b5" d="M264 44 C254 30 224 26 196 30 L196 40 C220 38 244 42 258 50 Z"/>
  </g>
  <path class="pd-body" d="M88 42 C120 34 200 34 232 42 C262 48 286 68 296 104 C306 140 312 178 290 192 C272 204 252 194 240 178 C228 160 210 150 160 150 C110 150 92 160 80 178 C68 194 48 204 30 192 C8 178 14 140 24 104 C34 68 58 48 88 42 Z"/>
  <g data-at="ls"><circle class="pd-well" cx="92" cy="88" r="21"/><circle class="pd-stick" cx="92" cy="88" r="13"/></g>
  <g data-at="rs"><circle class="pd-well" cx="198" cy="128" r="19"/><circle class="pd-stick" cx="198" cy="128" r="12"/></g>
  <path data-at="dpad" class="pd-dpad" d="M117 112 h14 v12 h12 v14 h-12 v12 h-14 v-12 h-12 v-14 h12 Z"/>
  <g data-at="b8" class="pd-small"><circle cx="138" cy="86" r="8"/><rect x="133.5" y="82.5" width="5.5" height="4.5" rx="1"/><rect x="136.5" y="85" width="5.5" height="4.5" rx="1"/></g>
  <g data-at="b9" class="pd-small"><circle cx="182" cy="86" r="8"/><path d="M178 83 h8 M178 86 h8 M178 89 h8"/></g>
  <g class="pd-face">
    <g data-at="b3"><circle class="pd-y" cx="236" cy="68" r="10"/><text x="236" y="72">Y</text></g>
    <g data-at="b2"><circle class="pd-x" cx="216" cy="88" r="10"/><text x="216" y="92">X</text></g>
    <g data-at="b1"><circle class="pd-b" cx="256" cy="88" r="10"/><text x="256" y="92">B</text></g>
    <g data-at="b0"><circle class="pd-a" cx="236" cy="108" r="10"/><text x="236" y="112">A</text></g>
  </g>
</svg>`;

// The labels, each side top to bottom, roughly in the order of what they point at.
const LEFT = ["b6", "b4", "b8", "ls", "dpad"];
const RIGHT = ["b7", "b5", "b9", "b3", "b2", "b1", "b0", "rs"];

const ARROW = { b12: "↑", b13: "↓", b14: "←", b15: "→", "a1-": "↑", "a1+": "↓", "a0-": "←", "a0+": "→" };
const MOVES = new Set(["up", "down", "left", "right"]);
// A, B, X, Y's labels wear their button's colour, so each is easy to match with its button.
const FACE = { b0: "a", b1: "b", b2: "x", b3: "y" };

/** The words for a set of directions (the D-pad, a stick): "Move the highlight", or "↑↓ Line · ←→ Word". */
function directions(full, area, inputs) {
  const said = inputs.map((i) => whatDoes(full, area, i));
  if (said.every((s) => s && MOVES.has(s.action) && actionOf(s.area, s.action).short === "Move")) {
    return { text: t("Move the highlight"), own: said.some((s) => s.area === area) };
  }
  const groups = new Map();
  inputs.forEach((input, k) => {
    const s = said[k];
    const name = s ? t(shortOf(s.area, s.action)) : "—";
    groups.set(name, (groups.get(name) || "") + ARROW[input]);
  });
  return {
    text: [...groups].map(([name, arrows]) => `${arrows} ${name}`).join(" · "),
    own: said.some((s) => s && s.area === area),
  };
}

/** What one labelled control does on `area`: { key, text, own } (own: the screen's, not Everywhere's). */
function labelFor(full, area, at) {
  if (at === "dpad") return { key: t("D-pad"), ...directions(full, area, ["b12", "b13", "b14", "b15"]) };
  if (at === "ls" || at === "rs") {
    const left = at === "ls";
    let moved;
    if (left) moved = directions(full, area, ["a1-", "a1+", "a0-", "a0+"]);
    else {  // the right stick: up / down scroll; its sideways ways do nothing
      const s = whatDoes(full, area, "a3+");
      moved = s ? { text: t(shortOf(s.area, s.action)), own: s.area === area } : { text: "—", own: false };
    }
    const press = whatDoes(full, area, left ? "b10" : "b11");
    const extra = press ? ` · ${t("Press: {0}", t(shortOf(press.area, press.action)))}` : "";
    return { key: t(left ? "Left stick" : "Right stick"), text: moved.text + extra, own: moved.own || !!(press && press.area === area) };
  }
  const s = whatDoes(full, area, at);
  return { key: inputName(at, "xbox"), text: s ? t(shortOf(s.area, s.action)) : "—", own: !!s && s.area === area, printed: true };
}

/**
 * The drawing, ready to be put on the page. `draw(full, area)` writes its labels (and their lines) for
 * one screen; `flash(input)` lights a button a moment (the controller's button just pressed).
 */
export function controllerDiagram() {
  const el = document.createElement("div");
  el.className = "pad-dia";
  el.innerHTML = `<div class="pad-dia-col pad-dia-left"></div><div class="pad-dia-pic">${PICTURE}</div>
    <div class="pad-dia-col pad-dia-right"></div><svg class="pad-dia-lines" aria-hidden="true"></svg>`;
  const lines = el.querySelector(".pad-dia-lines");
  const pic = el.querySelector(".pad-dia-svg");
  const cols = { left: el.querySelector(".pad-dia-left"), right: el.querySelector(".pad-dia-right") };
  let state = null;

  function write(full, area) {
    for (const [side, list] of [["left", LEFT], ["right", RIGHT]]) {
      cols[side].innerHTML = list.map((at) => {
        const l = labelFor(full, area, at);
        return `<div class="pad-lab${l.own ? " own" : ""}${l.text === "—" ? " none" : ""}" data-at="${at}">
          <span class="pad-lab-key${FACE[at] ? ` face pk-${FACE[at]}` : ""}"${l.printed ? ` translate="no"` : ""}>${esc(l.key)}</span>
          <span class="pad-lab-text" dir="auto">${esc(l.text)}</span></div>`;
      }).join("");
    }
  }

  /** The lines, from each label to its control, measured from where they are drawn now. */
  function route() {
    if (!el.isConnected) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const narrow = el.classList.contains("narrow");
    lines.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    lines.setAttribute("width", box.width);
    lines.setAttribute("height", box.height);
    // Where every control is (its middle and size), so a line can go round one that is in its way.
    const spots = new Map();
    for (const node of pic.querySelectorAll("[data-at]")) {
      const g = node.getBoundingClientRect();
      spots.set(node.dataset.at, { x: g.left + g.width / 2 - box.left, y: g.top + g.height / 2 - box.top, hw: g.width / 2, hh: g.height / 2 });
    }
    /** Does a line across at height y, from x0 to x1, touch another control than `at`? */
    const across = (at, x0, x1, y) => [...spots].some(([other, s]) => other !== at
      && Math.abs(s.y - y) < s.hh + 3 && s.x + s.hw > Math.min(x0, x1) && s.x - s.hw < Math.max(x0, x1));
    /** Does a line up or down at x, between y0 and y1, touch another control than `at`? */
    const upDown = (at, x, y0, y1) => [...spots].some(([other, s]) => other !== at
      && Math.abs(s.x - x) < s.hw + 3 && s.y + s.hh > Math.min(y0, y1) && s.y - s.hh < Math.max(y0, y1));
    const out = [];
    for (const side of ["left", "right"]) {
      const labs = [...cols[side].querySelectorAll(".pad-lab")];
      labs.forEach((lab, k) => {
        const at = lab.dataset.at;
        const spot = spots.get(at);
        if (!spot) return;
        const r = lab.getBoundingClientRect();
        const { x: tx, y: ty } = spot;
        const y = r.top + Math.min(r.height / 2, 13) - box.top;
        let d;
        if (!narrow) {
          const x = side === "left" ? r.right - box.left + 4 : r.left - box.left - 4;
          const stub = side === "left" ? x + 10 : x - 10;
          d = `M${x} ${y} H${stub} L${tx} ${ty}`;
        } else {
          // Up the side of the page in a lane of its own, then across to the control. When another
          // control is on that way across, the line crosses above or below it and comes to its own
          // from there.
          const lane = side === "left" ? 4 + k * 4 : box.width - 4 - k * 4;
          const x = side === "left" ? r.left - box.left - 3 : r.right - box.left + 3;
          d = `M${x} ${y} H${lane} V${ty} H${tx}`;
          if (across(at, lane, tx, ty)) {
            for (const step of [1, -1, 2, -2, 3, -3, 4, -4]) {
              const at2 = ty + step * (spot.hh + 12);
              const end = ty + Math.sign(step) * spot.hh;
              if (!across(at, lane, tx, at2) && !upDown(at, tx, at2, end)) { d = `M${x} ${y} H${lane} V${at2} H${tx} V${end}`; break; }
            }
          }
        }
        out.push(`<path d="${d}"/><circle cx="${tx}" cy="${ty}" r="2.6"/>`);
      });
    }
    lines.innerHTML = out.join("");
  }

  const fit = () => {
    const w = el.getBoundingClientRect().width;
    el.classList.toggle("narrow", w > 0 && w < 600);
    route();
  };
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
  if (watch) watch.observe(el);
  window.addEventListener("resize", fit);

  return {
    el,
    draw(full, area) {
      state = { full, area };
      write(full, area);
      requestAnimationFrame(fit);
    },
    /** Light up the control an input belongs to, a moment. */
    flash(input) {
      const at = /^b1[2-5]$/.test(input) ? "dpad" : /^a[01]/.test(input) || input === "b10" ? "ls" : /^a[23]/.test(input) || input === "b11" ? "rs" : input;
      for (const node of el.querySelectorAll(`[data-at="${at}"]`)) {
        node.classList.remove("lit");
        void node.getBoundingClientRect();
        node.classList.add("lit");
        setTimeout(() => node.classList.remove("lit"), 600);
      }
    },
    redraw: () => state && requestAnimationFrame(fit),
    destroy() { if (watch) watch.disconnect(); window.removeEventListener("resize", fit); },
  };
}

export const _internal = { labelFor, directions, LEFT, RIGHT };
