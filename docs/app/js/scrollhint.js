// Rows that scroll sideways (the Library's kinds and status pills, Trending's topics, ...) show
// that they do, in three quiet ways, and only while they really have more than fits:
//   1. a peek: the spacing is nudged so the item at the right edge is cut part-way, never exactly
//      at a gap (a row that ends at a gap looks complete);
//   2. a fade over the edge where more is hidden (both edges once scrolled; gone at the end);
//   3. a nudge: the first time a row appears after the app starts, it slides a little to the left
//      and back. Not for people who asked their device for less motion.
// Shared by the desktop app and the phone. Rows are found by the selectors below (or the class
// "hscroll"), so pages don't have to call anything.

const ROWS = ".hscroll, .lib-bar .tabs, .lib-bar .kind-row, .library .feed-list.sub-list, .disc-cats, .topbar .nav";
const PEEK_MIN = 0.25;  // the cut item shows between a quarter ...
const PEEK_MAX = 0.65;  // ... and two thirds of itself
const GAP_RANGE = [-4, 14]; // px the spacing may shrink or grow to get there (else the fade alone shows it)
const PAD_RANGE = [-4, 4];  // px each item's side padding may change, if the gaps alone can't do it
const NUDGE_PX = 34;
const FADE_EDGE = 4;    // px of slack before an edge counts as "more to see"

const nudged = new Set(); // rows already nudged since the app started (by name)
const known = new WeakSet();
const pending = new Set(); // rows waiting for their nudge

/** True when the row really scrolls sideways and has more than fits (a row that wraps never does). */
const overflows = (row) => /auto|scroll/.test(getComputedStyle(row).overflowX) && row.scrollWidth > row.clientWidth + 2;
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A row's name for "already nudged": the same row redrawn (new elements) keeps its name. */
function nameOf(row) {
  return row.dataset.hint || row.id || [...row.classList].filter((c) => !c.startsWith("hs-")).join(".");
}

/** Show the fade on whichever edge has more beyond it. */
function shade(row) {
  const more = overflows(row);
  const left = more && row.scrollLeft > FADE_EDGE;
  const right = more && row.scrollLeft + row.clientWidth < row.scrollWidth - FADE_EDGE;
  row.classList.toggle("hs-back", left);
  row.classList.toggle("hs-more", right);
}

/** Space the items so the one at the right edge is cut part-way: first by changing the gaps between
 * them a little, then, if that is not enough, the items' own side padding a little too. */
function peek(row) {
  const items = [...row.children].filter((c) => c.offsetParent !== null);
  for (const item of items) item.style.paddingLeft = item.style.paddingRight = "";
  row.style.columnGap = "";
  if (!overflows(row) || items.length < 2) return;
  const base = parseFloat(getComputedStyle(row).columnGap) || 0;
  const pads = items.map((item) => {
    const cs = getComputedStyle(item);
    return [parseFloat(cs.paddingLeft) || 0, parseFloat(cs.paddingRight) || 0];
  });
  const shown = (gap, pad) => {
    row.style.columnGap = `${base + gap}px`;
    items.forEach((item, i) => {
      item.style.paddingLeft = pad ? `${pads[i][0] + pad}px` : "";
      item.style.paddingRight = pad ? `${pads[i][1] + pad}px` : "";
    });
    const edge = row.getBoundingClientRect().left + row.clientWidth;
    for (const item of items) {
      const r = item.getBoundingClientRect();
      if (r.right > edge) return r.left >= edge ? 0 : (edge - r.left) / r.width;
    }
    return 1;
  };
  // The smallest change that works, the gaps first: 0, +1, -1, +2, -2, ...
  const tries = [];
  for (let pad = PAD_RANGE[0]; pad <= PAD_RANGE[1]; pad++) {
    for (let gap = GAP_RANGE[0]; gap <= GAP_RANGE[1]; gap++) {
      if (base + gap < 4 || pads.some(([l, r]) => l + pad < 4 || r + pad < 4)) continue;
      // Tighter gaps look cramped sooner than slightly tighter items, so they cost more.
      tries.push([gap, pad, (gap < 0 ? 3 : 1) * Math.abs(gap) + 2 * Math.abs(pad)]);
    }
  }
  tries.sort((a, b) => a[2] - b[2]);
  for (const [gap, pad] of tries) {
    const f = shown(gap, pad);
    if (f >= PEEK_MIN && f <= PEEK_MAX) return; // keep this spacing
  }
  shown(0, 0); // nothing in range: the row as it was (the fade alone shows there is more)
  row.style.columnGap = "";
}

/** The first appearance since the app started: slide left a little, then back. */
function nudge(row) {
  const name = nameOf(row);
  if (nudged.has(name) || pending.has(row) || calm() || !overflows(row)) return;
  pending.add(row);
  let touched = false;
  const stop = () => { touched = true; };
  row.addEventListener("pointerdown", stop, { once: true, passive: true });
  row.addEventListener("wheel", stop, { once: true, passive: true });
  setTimeout(() => {
    pending.delete(row);
    // A row redrawn meanwhile (a new element with the same name) gets the nudge instead.
    if (!row.isConnected || !row.getClientRects().length || nudged.has(name)) return;
    nudged.add(name);
    const from = row.scrollLeft;
    const room = row.scrollWidth - row.clientWidth - from;
    if (touched || room < 8) return; // already being scrolled by hand: no need to show it
    row.scrollTo({ left: from + Math.min(NUDGE_PX, room), behavior: "smooth" });
    setTimeout(() => { if (!touched && row.isConnected) row.scrollTo({ left: from, behavior: "smooth" }); }, 420);
  }, 650);
}

function attach(row) {
  if (known.has(row)) return;
  known.add(row);
  // A timer, not an animation frame: frames pause while the app is hidden.
  let timer = 0;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (row.isConnected) { peek(row); shade(row); nudge(row); } }, 30);
  };
  row.addEventListener("scroll", () => shade(row), { passive: true });
  new ResizeObserver(refresh).observe(row);
  new MutationObserver(refresh).observe(row, { childList: true });
  refresh();
}

/** Watch the page for sideways rows (once, when the app starts). */
export function initScrollHints(root = document.body) {
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(ROWS)) attach(node);
    for (const row of node.querySelectorAll(ROWS)) attach(row);
  };
  scan(root);
  new MutationObserver((changes) => {
    for (const c of changes) for (const n of c.addedNodes) scan(n);
  }).observe(root, { childList: true, subtree: true });
}
