// Squircle corners (DESIGN.md section 6, the owner's choice: smooth, continuous corners rather than round ones).
//
// Where the browser can draw them (Chromium: Windows, Android, the web app in Chrome or Edge), app.css does it all with
// `corner-shape: squircle` and this file does nothing. Where it can't (Safari: iPhone, Mac), this cuts each element that
// uses one of the corner tokens (--r-s 10px, --r-l 20px) to an exact squircle outline with `clip-path`, and redraws it
// when the element changes size. Pills (--r-pill) and circles (50%) are left round on purpose.
//
// Clipping cuts off an element's border and its focus ring, so a clipped element draws its outline (and, when it has
// the keyboard focus, a 2px teal ring) as a picture inside the same shape. Elements with a shadow (the floating things:
// popups, menus, sheets) are left with plain round corners, since a clip would cut their shadow away. Until this has
// run, and wherever it skips something, the element keeps its plain rounded corners: nothing looks broken.

const TOKEN_RADII = [10, 20];       // px: the corner tokens; anything else is not ours to change
const STEPS = 12;                   // points along each corner's curve (smooth at these sizes)
const N = 4;                        // the superellipse's power: CSS's `squircle` is superellipse(2) = |x|^4 + |y|^4 = 1
const SKIP_TAGS = new Set(["SPAN", "A", "B", "I", "EM", "STRONG", "SMALL", "SUP", "SUB", "RUBY", "RT", "RP", "BR", "WBR",
  "SVG", "PATH", "G", "USE", "CANVAS", "VIDEO", "AUDIO", "SOURCE", "TRACK", "SCRIPT", "STYLE", "LINK", "META", "OPTION",
  "IFRAME", "TEMPLATE", "MARK", "U", "S", "Q", "ABBR", "CODE", "KBD", "TIME", "DATA", "BDI", "BDO", "LABEL"]);

/** Does this browser draw squircles itself? (Then app.css's `corner-shape: squircle` does the work.) */
export function nativeSquircles() {
  try {
    if (localStorage.getItem("tkSquircleFallback") === "1") return false; // (to try the fallback in Chrome)
  } catch { /* storage unavailable */ }
  return typeof CSS !== "undefined" && !!CSS.supports && CSS.supports("corner-shape", "squircle");
}

/** The outline of a box w×h with squircle corners of radii [topLeft, topRight, bottomRight, bottomLeft], inset by `inset`
 *  on every side, as SVG path data, traced clockwise. */
export function squirclePath(w, h, radii, inset = 0) {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const max = Math.max(0, Math.min(x1 - x0, y1 - y0) / 2);
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r - inset, max)));
  const f = (n) => Math.round(n * 100) / 100;
  const pts = [];
  // One corner, centred (cx, cy), from angle a to a + 90° (y points down, so a growing angle turns clockwise on screen).
  const corner = (cx, cy, r, a) => {
    if (!r) { pts.push([cx, cy]); return; }
    for (let k = 0; k <= STEPS; k++) {
      const t = a + (k / STEPS) * (Math.PI / 2);
      const c = Math.cos(t), s = Math.sin(t);
      pts.push([cx + Math.sign(c) * Math.abs(c) ** (2 / N) * r, cy + Math.sign(s) * Math.abs(s) ** (2 / N) * r]);
    }
  };
  corner(x0 + tl, y0 + tl, tl, Math.PI);            // top-left: from the left edge up to the top edge
  corner(x1 - tr, y0 + tr, tr, 1.5 * Math.PI);      // top-right: from the top edge down to the right edge
  corner(x1 - br, y1 - br, br, 0);                  // bottom-right: from the right edge to the bottom edge
  corner(x0 + bl, y1 - bl, bl, 0.5 * Math.PI);      // bottom-left: from the bottom edge to the left edge
  return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
}

// ---------- the fallback (only where the browser can't draw squircles) ----------

const clipped = new Map(); // element -> {radii, border: {w, color} | null}
let ro = null;
let pending = new Set();
let scheduled = false;

function radiiOf(cs) {
  return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
    .map((v) => parseFloat(v) || 0);
}

function candidate(el) {
  if (!(el instanceof HTMLElement) || SKIP_TAGS.has(el.tagName) || el.closest("[data-no-squircle]")) return null;
  const cs = getComputedStyle(el);
  const radii = radiiOf(cs);
  if (!radii.some((r) => r > 0) || !radii.every((r) => r === 0 || TOKEN_RADII.includes(r))) return null;
  if (cs.display === "inline" || cs.display === "contents" || cs.display === "none") return null;
  if (cs.boxShadow && cs.boxShadow !== "none") return null; // (a floating thing: its shadow matters more)
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const visible = bw > 0 && cs.borderTopStyle !== "none" && !/rgba\([^)]*,\s*0\)|transparent/.test(cs.borderTopColor);
  return { radii, border: visible ? { w: bw, color: cs.borderTopColor } : null };
}

function strokeImage(w, h, radii, strokes) {
  const paths = strokes.map(({ w: sw, color }) =>
    `<path d="${squirclePath(w, h, radii, sw / 2)}" fill="none" stroke="${color}" stroke-width="${sw}"/>`).join("");
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${paths}</svg>`)}")`;
}

function draw(el) {
  const info = clipped.get(el);
  if (!info) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  el.style.borderRadius = "0";
  el.style.clipPath = `path("${squirclePath(w, h, info.radii)}")`;
  const strokes = [];
  if (info.border) strokes.push(info.border);
  if (el.matches(":focus-visible")) strokes.push({ w: 2, color: getComputedStyle(document.documentElement).getPropertyValue("--teal").trim() || "teal" });
  if (strokes.length) {
    el.style.borderColor = "transparent";
    el.style.backgroundImage = strokeImage(w, h, info.radii, strokes) + (info.bgImage && info.bgImage !== "none" ? `, ${info.bgImage}` : "");
    el.style.backgroundOrigin = "border-box";
    el.style.backgroundSize = "100% 100%" + (info.bgImage && info.bgImage !== "none" ? `, ${info.bgSize}` : "");
    el.style.backgroundRepeat = "no-repeat" + (info.bgImage && info.bgImage !== "none" ? `, ${info.bgRepeat}` : "");
    info.stroked = true;
  } else if (info.stroked) {
    unstroke(el);
  }
}

function unstroke(el) {
  for (const p of ["borderColor", "backgroundImage", "backgroundOrigin", "backgroundSize", "backgroundRepeat"]) el.style[p] = "";
  const info = clipped.get(el);
  if (info) info.stroked = false;
}

function release(el) {
  unstroke(el);
  el.style.borderRadius = "";
  el.style.clipPath = "";
  clipped.delete(el);
  if (ro) ro.unobserve(el);
}

function scan(root) {
  const els = root.nodeType === 1 ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  const found = [];
  for (const el of els) { // (all the reading first, then all the writing: one style calculation, not one per element)
    if (clipped.has(el)) continue;
    const info = candidate(el);
    if (info) {
      const cs = getComputedStyle(el);
      found.push([el, { ...info, bgImage: cs.backgroundImage, bgSize: cs.backgroundSize, bgRepeat: cs.backgroundRepeat }]);
    }
  }
  for (const [el, info] of found) {
    clipped.set(el, info);
    ro.observe(el);
    draw(el);
  }
}

function flush() {
  scheduled = false;
  const roots = [...pending];
  pending = new Set();
  for (const el of clipped.keys()) if (!el.isConnected) release(el);
  for (const r of roots) if (r.isConnected) scan(r);
}

function later(node) {
  pending.add(node);
  if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
}

/** Look again at every clipped element (its colours, after a change of theme) and at the whole page. */
export function refreshSquircles() {
  if (!ro) return;
  for (const el of [...clipped.keys()]) release(el);
  later(document.body);
}

let started = false;
/** Start the helper (once). Does nothing where the browser draws squircles itself. */
export function startSquircles() {
  if (started || typeof document === "undefined") return;
  started = true;
  if (nativeSquircles()) { document.documentElement.classList.add("sq-native"); return; }
  document.documentElement.classList.add("sq-js");
  if (typeof ResizeObserver === "undefined" || !CSS.supports("clip-path", 'path("M0 0L1 0L1 1Z")')) return; // (plain round corners, then)
  ro = new ResizeObserver((entries) => { for (const e of entries) draw(e.target); });
  new MutationObserver((records) => {
    for (const rec of records) for (const n of rec.addedNodes) if (n.nodeType === 1 && !SKIP_TAGS.has(n.tagName)) later(n);
  }).observe(document.documentElement, { childList: true, subtree: true });
  // The theme decides the outline colours: look again when it changes.
  new MutationObserver(refreshSquircles).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshSquircles); } catch { /* old browser */ }
  // The focus ring is drawn inside the shape.
  const refocus = (e) => { if (clipped.has(e.target)) draw(e.target); };
  document.addEventListener("focusin", refocus);
  document.addEventListener("focusout", refocus);
  later(document.body);
}
