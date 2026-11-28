// The Library's Home as a bubble map (prototype "library_home"; the owner, 2026-11-27: "the library home page should
// be a bubble map, reactive to which ones the user actually uses (gets bigger) and the ones that require api Keys have
// the brand purple outline"; he chose the dark picture). This is the pure part: how big each bubble is, where it goes,
// which kinds need a key, and how much each kind is used. No screen code: tests/js/libraryhome.test.mjs runs it as it is.
// The drawing is components/homemap.js.

/** Use measured over this many days for the "recent" part. */
export const RECENT_DAYS = 30;
/** Below this much use in all, every bubble is the same modest size (a new learner: nothing to tell apart yet). */
export const FRESH_BELOW = 4;

/**
 * Why a kind's bubble wears the brand-plum ring, or null: only while something the learner can fix is missing on this
 * device (the owner, 2026-11-27: the ring goes once the key is added; "put a ring around Netflix … if the user is on
 * webapp/mobile"). The checks are the ones the app already makes for these features:
 *   - Conversation talks with the learner's own AI: {why: "ai"} without an AI key (define-service.js definerConfig().key, in both its desktop and phone copies).
 *   - Things with no words to read need a transcription key on the phones and the web app (the computer writes
 *     transcripts itself): {why: "stt"} when `stt` (stt.js sttConfig) has none, unless this language is only heard
 *     on the computer anyway (`blocked`: no key would help).
 *   - Netflix: {why: "netflix", reason} where it can't play here (app.js netflixSupport): a phone or an iPhone (the
 *     computer app), or the web app on a computer without the Tamkeen extension. Never on the computer app itself.
 */
export function ringOf(kind, { platform = "", aiKey = false, stt = {}, netflix = null } = {}) {
  if (kind === "conversation") return aiKey ? null : { why: "ai" };
  if (["podcasts", "audiobooks", "reels", "videos", "audio"].includes(kind)) {
    return platform === "desktop" || (stt && (stt.on || stt.blocked)) ? null : { why: "stt" };
  }
  if (kind === "netflix") return platform === "desktop" || !netflix || netflix.ok ? null : { why: "netflix", reason: netflix.reason || "" };
  return null;
}

/**
 * How much each kind is used: {kind: number}. `items`: {kind: how many things the learner has in it}. `recent`:
 * {kind: how many of them were opened in the last RECENT_DAYS}. Something opened lately counts three times as much
 * as something only kept.
 */
export function usage(items = {}, recent = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(items), ...Object.keys(recent)])) out[k] = (items[k] || 0) + 3 * (recent[k] || 0);
  return out;
}

/**
 * The bubbles' radii: [{key, r, below}] for `kinds` ([{key}]) and `uses` ({key: number}). The area follows use (the
 * radius goes with its square root), between a smallest and a largest size; a learner with almost no use yet gets
 * every bubble the same size. `below`: the name sits under a small bubble, not inside it; `under`: how much room (px)
 * that takes under the circle, more for a kind with a `note` (Netflix's "Needs the computer app", on two lines).
 */
export function bubbleSizes(kinds, uses = {}, { phone = true } = {}) {
  const minR = phone ? 28 : 46, maxR = phone ? 62 : 116, label = phone ? 46 : 60;
  const total = kinds.reduce((s, k) => s + (uses[k.key] || 0), 0);
  const most = Math.max(1, ...kinds.map((k) => uses[k.key] || 0));
  return kinds.map((k) => {
    const r = total < FRESH_BELOW ? (phone ? 40 : 64) : minR + (maxR - minR) * Math.sqrt((uses[k.key] || 0) / most);
    const below = r < label;
    return { ...k, r: Math.round(r * 10) / 10, below, under: below ? (k.note ? 50 : 18) : 0 };
  });
}

/**
 * Where each bubble goes in a W × H stage round a hub in its middle: the biggest nearest the hub (a golden-angle
 * spiral, biggest first), then rounds of pushing overlapping bubbles apart and drawing them gently in, and the whole
 * cluster centred. The same input gives the same picture. `rtl` mirrors it. Returns {nodes: [{...bubble, x, y}],
 * cx, cy, hub} (cx, cy: where the hub ended up).
 */
export function layoutBubbles(bubbles, W, H, { phone = true, rtl = false } = {}) {
  const nodes = bubbles.map((b) => ({ ...b }));
  // (a name or note under the circle takes room too; a note, two lines about 128px wide, as wide as that)
  const room = (n) => Math.max(n.r + (n.under || 0) / 2, n.note && n.below ? 68 : 0);
  // Half the width a bubble needs, side to side: its circle, or the note under it (128px wide) when wider.
  const half = (n) => Math.max(n.r, n.note && n.below ? 64 : 0);
  const cx = W / 2, cy = H / 2, hub = phone ? 56 : 96, gapAll = phone ? 8 : 18;
  const sx = W / Math.max(W, H), sy = H / Math.max(W, H);
  [...nodes].sort((a, b) => b.r - a.r).forEach((n, i) => {
    const ang = -Math.PI / 2 + i * 2.39996;
    const d = hub + 20 + room(n) + i * (phone ? 9 : 13);
    n.x = cx + Math.cos(ang) * d * (0.6 + sx * 0.6);
    n.y = cy + Math.sin(ang) * d * (0.6 + sy * 0.6);
  });
  for (let it = 0; it < 600; it++) {
    for (const n of nodes) {
      n.x += (cx - n.x) * 0.01 * sy;
      n.y += (cy - n.y) * 0.01 * sx;
      const dh = Math.hypot(n.x - cx, n.y - cy) || 1, need = hub + room(n) + 10;
      if (dh < need) { n.x = cx + ((n.x - cx) / dh) * need; n.y = cy + ((n.y - cy) / dh) * need; }
      for (const m of nodes) {
        if (m === n) continue;
        const dx = n.x - m.x, dy = n.y + (n.under || 0) / 2 - (m.y + (m.under || 0) / 2);
        const d = Math.hypot(dx, dy) || 1, gap = room(n) + room(m) + gapAll;
        if (d < gap) { const q = (gap - d) / 2; n.x += (dx / d) * q; n.y += (dy / d) * q; m.x -= (dx / d) * q; m.y -= (dy / d) * q; }
      }
      n.x = Math.min(W - half(n) - 2, Math.max(half(n) + 2, n.x));
      n.y = Math.min(H - room(n) * 2 + n.r - 2, Math.max(n.r + 2, n.y));
    }
  }
  const minX = Math.min(...nodes.map((n) => n.x - half(n))), maxX = Math.max(...nodes.map((n) => n.x + half(n)));
  const minY = Math.min(...nodes.map((n) => n.y - n.r)), maxY = Math.max(...nodes.map((n) => n.y + n.r + (n.under || 0)));
  const ox = (W - (maxX - minX)) / 2 - minX, oy = (H - (maxY - minY)) / 2 - minY;
  for (const n of nodes) { n.x = Math.round((n.x + ox) * 10) / 10; n.y = Math.round((n.y + oy) * 10) / 10; }
  let hx = cx + ox;
  if (rtl) { for (const n of nodes) n.x = Math.round((W - n.x) * 10) / 10; hx = W - hx; }
  return { nodes, cx: hx, cy: cy + oy, hub };
}

// ---------- clear space for everything, measured (the owner, 2026-11-27: "it looks like things overlap") ----------
//
// A body is a bubble with the box of its words under it (measured on the page), the hub (its words, fixed), or a
// "continue" bubble beside its section's (components/homemap.js). relax() moves them until nothing overlaps: circle,
// words, hub, a link line through someone else's words or bubble, the stage's edges. The same small simulation drags
// bubbles about when the prototype "library_physics" is on.

export const GAP = 6;        // clear space between any two things (px)
export const LABEL_GAP = 4;  // from a bubble to the words under it

/** A body's parts: its circle (none for the hub) and the box of its words (none for a bubble with its name inside). */
export function partsOf(b) {
  const circle = b.r ? { x: b.x, y: b.y, r: b.r } : null;
  let box = null;
  if (b.hub) box = { l: b.x - b.w / 2, t: b.y - b.h / 2, r: b.x + b.w / 2, b: b.y + b.h / 2 };
  else if (b.lw && b.lh) { const top = b.y + b.r + LABEL_GAP; box = { l: b.x - b.lw / 2, t: top, r: b.x + b.lw / 2, b: top + b.lh }; }
  return { circle, box };
}

/** The whole of a body, as a box: what must stay on the stage. */
export function extentOf(b) {
  const { circle, box } = partsOf(b);
  const xs = [], ys = [];
  if (circle) { xs.push(circle.x - circle.r, circle.x + circle.r); ys.push(circle.y - circle.r, circle.y + circle.r); }
  if (box) { xs.push(box.l, box.r); ys.push(box.t, box.b); }
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

// How far `a` must move to clear `b` (a vector), or null: circle/circle, circle/box, box/box.
function sepCC(a, b, gap) {
  const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), need = a.r + b.r + gap;
  if (d >= need) return null;
  return d ? [(dx / d) * (need - d), (dy / d) * (need - d)] : [need, 0];
}
function sepBB(a, b, gap) {
  const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l) + gap, oy = Math.min(a.b, b.b) - Math.max(a.t, b.t) + gap;
  if (ox <= 0 || oy <= 0) return null;
  const ax = (a.l + a.r) / 2, bx = (b.l + b.r) / 2, ay = (a.t + a.b) / 2, by = (b.t + b.b) / 2;
  return ox < oy ? [ax < bx ? -ox : ox, 0] : [0, ay < by ? -oy : oy];
}
function sepCB(c, box, gap) { // (moves the circle)
  const px = Math.max(box.l, Math.min(c.x, box.r)), py = Math.max(box.t, Math.min(c.y, box.b));
  const dx = c.x - px, dy = c.y - py, d = Math.hypot(dx, dy);
  if (d > 0) return d < c.r + gap ? [(dx / d) * (c.r + gap - d), (dy / d) * (c.r + gap - d)] : null;
  const exits = [[box.l - c.x - c.r - gap, 0], [box.r - c.x + c.r + gap, 0], [0, box.t - c.y - c.r - gap], [0, box.b - c.y + c.r + gap]];
  return exits.sort((p, q) => Math.hypot(...p) - Math.hypot(...q))[0];
}

/** How far body `a` must move to clear body `b`, or null. */
export function separation(a, b, gap = GAP) {
  const A = partsOf(a), B = partsOf(b);
  let best = null;
  const take = (v) => { if (v && (!best || Math.hypot(...v) > Math.hypot(...best))) best = v; };
  if (A.circle && B.circle) take(sepCC(A.circle, B.circle, gap));
  if (A.circle && B.box) take(sepCB(A.circle, B.box, gap));
  if (A.box && B.circle) { const v = sepCB(B.circle, A.box, gap); if (v) take([-v[0], -v[1]]); }
  if (A.box && B.box) take(sepBB(A.box, B.box, gap));
  return best;
}

/** Where a line from (fx, fy) towards body `b`'s centre first meets b's circle or words: lines end there, so a line
 *  never runs through a bubble's own words. */
export function lineEnd(fx, fy, b) {
  const { circle, box } = partsOf(b);
  const dx = b.x - fx, dy = b.y - fy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  let t = L - (circle ? circle.r : 0);
  if (box) { // where the line goes into the box (the slab method)
    let t0 = 0, t1 = L;
    for (const [p, d, lo, hi] of [[fx, ux, box.l - 2, box.r + 2], [fy, uy, box.t - 2, box.b + 2]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = Infinity; break; } continue; }
      let a = (lo - p) / d, c = (hi - p) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    }
    if (t0 <= t1 && t0 < t) t = t0;
  }
  t = Math.max(0, t);
  return { x: fx + ux * t, y: fy + uy * t };
}

/** The lines drawn: hub → every bubble, and a "continue" bubble's section → it. [{from, to, ends: [x1, y1, x2, y2]}] */
export function linksOf(bodies) {
  const hub = bodies.find((b) => b.hub);
  const out = [];
  for (const b of bodies) {
    if (b.hub) continue;
    const from = (b.attach && bodies.find((s) => s.key === b.attach)) || hub;
    if (!from) continue;
    const end = lineEnd(from.x, from.y, b);
    const start = lineEnd(b.x, b.y, from); // (where it leaves its start's circle or words: never through them)
    out.push({ from: from.key, to: b.key, ends: [start.x, start.y, end.x, end.y] });
  }
  return out;
}
function segPush(seg, b, gap) { // how far `b` must move off a line (a vector), or null
  const [x1, y1, x2, y2] = seg, dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  if (L2 < 1) return null;
  const L = Math.sqrt(L2);
  const { circle, box } = partsOf(b);
  let best = null;
  const off = (px, py, reach) => {
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2));
    const qx = x1 + t * dx, qy = y1 + t * dy, ex = px - qx, ey = py - qy, d = Math.hypot(ex, ey);
    if (d >= reach) return;
    const n = d ? [ex / d, ey / d] : [-dy / L, dx / L];
    const v = [n[0] * (reach - d), n[1] * (reach - d)];
    if (!best || Math.hypot(...v) > Math.hypot(...best)) best = v;
  };
  if (circle) off(circle.x, circle.y, circle.r + gap);
  if (box) { // the box as its centre and the half-size it has across the line
    const nx = Math.abs(-dy / L), ny = Math.abs(dx / L);
    off((box.l + box.r) / 2, (box.t + box.b) / 2, ((box.r - box.l) / 2) * nx + ((box.b - box.t) / 2) * ny + gap / 2);
  }
  return best;
}

/**
 * Move `bodies` ([{key, x, y, r, lw, lh} | {key, hub: true, x, y, w, h} | {…, attach: key, near}]) until nothing
 * overlaps and everything stays inside W × H. The hub never moves, nor `pinned` (a key being dragged). Bubbles drift
 * gently towards the hub (or to `rest`, their own distance from it, when they have one); a "continue" bubble stays
 * `near` px from its section's edge. Changes the bodies in place and returns them.
 */
export function relax(bodies, { W, H, steps = 900, pinned = null, pull = 0.006 } = {}) {
  const hub = bodies.find((b) => b.hub);
  const free = (b) => !b.hub && b.key !== pinned;
  const byKey = new Map(bodies.map((b) => [b.key, b]));
  for (let s = 0; s < steps; s++) {
    const drift = s < steps * 0.4; // (the pulls stop early, so the later steps only clear overlaps)
    for (const b of bodies) {
      if (!free(b)) continue;
      const sec = b.attach && byKey.get(b.attach);
      if (sec && drift) {
        const dx = b.x - sec.x, dy = b.y - sec.y, d = Math.hypot(dx, dy) || 1, want = sec.r + (b.near || 12) + b.r;
        b.x -= (dx / d) * (d - want) * 0.3; b.y -= (dy / d) * (d - want) * 0.3;
      } else if (hub && drift) {
        const dx = hub.x - b.x, dy = hub.y - b.y, d = Math.hypot(dx, dy) || 1;
        const k = b.rest ? ((d - b.rest) / d) * 0.08 : pull;
        b.x += dx * k; b.y += dy * k;
      }
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j], fa = free(a), fb = free(b);
        if (!fa && !fb) continue;
        const v = separation(a, b);
        if (!v) continue;
        const ka = fa && fb ? 0.5 : fa ? 1 : 0, kb = fa && fb ? 0.5 : fb ? 1 : 0;
        a.x += v[0] * ka; a.y += v[1] * ka; b.x -= v[0] * kb; b.y -= v[1] * kb;
      }
    }
    for (const link of linksOf(bodies)) {
      for (const b of bodies) {
        if (!free(b) || b.key === link.to || b.key === link.from) continue;
        const v = segPush(link.ends, b, GAP);
        if (!v) continue;
        // (the one in the way steps aside, and the line's far end swings the other way a little)
        b.x += v[0] * 0.6; b.y += v[1] * 0.6;
        const end = byKey.get(link.to);
        if (end && free(end)) { end.x -= v[0] * 0.25; end.y -= v[1] * 0.25; }
      }
    }
    for (const b of bodies) {
      if (!free(b)) continue;
      const e = extentOf(b);
      if (e.l < 2) b.x += 2 - e.l; else if (e.r > W - 2) b.x -= e.r - (W - 2);
      if (e.t < 2) b.y += 2 - e.t; else if (e.b > H - 2) b.y -= e.b - (H - 2);
    }
  }
  return bodies;
}

/** What still overlaps (for tests and checks): [[keyA, keyB | "line from→to" | "edge"]]. */
export function overlaps(bodies, W, H) {
  const out = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) if (separation(bodies[i], bodies[j], 0)) out.push([bodies[i].key, bodies[j].key]);
  }
  for (const link of linksOf(bodies)) {
    for (const b of bodies) {
      if (!b.hub && b.key !== link.to && b.key !== link.from && segPush(link.ends, b, 0)) out.push([b.key, `line ${link.from}→${link.to}`]);
    }
  }
  for (const b of bodies) { const e = extentOf(b); if (e.l < 0 || e.t < 0 || e.r > W || e.b > H) out.push([b.key, "edge"]); }
  return out;
}

/**
 * The map's arrangement: relax() from the layout as it is, and if anything still overlaps (the pushes can cancel
 * out), again from the same layout turned a little round the hub, a few times; the first with nothing overlapping
 * wins, else the one with least. Always the same answer for the same input. A "continue" bubble starts beside its
 * section's, on the side away from the hub. Returns new bodies.
 */
export function arrange(bodies, { W, H, tries = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.4, -1.4, 2.2, -2.2, Math.PI] } = {}) {
  const hub = bodies.find((b) => b.hub);
  let best = null;
  for (const turn of tries) {
    const c = Math.cos(turn), s = Math.sin(turn);
    const set = bodies.map((b) => ({ ...b }));
    const byKey = new Map(set.map((b) => [b.key, b]));
    for (const b of set) {
      if (b.hub || b.attach || !hub) continue;
      const dx = b.x - hub.x, dy = b.y - hub.y;
      b.x = hub.x + dx * c - dy * s; b.y = hub.y + dx * s + dy * c;
    }
    for (const b of set) {
      const sec = b.attach && byKey.get(b.attach);
      if (!sec || !hub) continue;
      const dx = sec.x - hub.x, dy = sec.y - hub.y, d = Math.hypot(dx, dy) || 1, out = sec.r + (b.near || 12) + b.r;
      b.x = sec.x + (dx / d) * out; b.y = sec.y + (dy / d) * out;
    }
    relax(set, { W, H });
    const left = overlaps(set, W, H).length;
    const ext = set.map(extentOf);
    const tall = Math.max(...ext.map((e) => e.b)) - Math.min(...ext.map((e) => e.t));
    if (!best || left < best.left || (left === best.left && left > 0 && tall < best.tall)) best = { set, left, tall };
    if (!left) break;
  }
  return best.set;
}

// ---------- the bubbles as things you can move (prototype "library_physics") ----------
// The owner, 2026-11-27: "they try not to overlap, but they can be pulled apart and stuff, but they tend to be
// lightly pulled inwards towards the main category. Unless they're connected to another category, then they're
// pulled in towards that one", and "they try to reach like a static state. They're not like constantly moving".
// So: each bubble has a velocity; a light spring pulls it towards its parent (the hub, or the bubble it hangs from)
// once it is further than its natural length (`home`: its distance there in the arranged layout, see setHomes); overlapping bodies push apart softly (a held one can be pulled through); lines
// push names and bubbles off them softly; strong damping. The resting layout has no pressure left: the pull stops at
// touching distance and the pushes only act inside the clear space, so at rest nothing moves, and the simulation
// stops (no idle animation).

export const PHYSICS = { pull: 0.004, push: 0.18, damp: 0.72, rest: 0.03 };

/** One frame. `held`: the key being dragged (it doesn't move here). Returns the fastest speed (px a frame). */
export function physicsStep(bodies, { W, H, held = null, pull = PHYSICS.pull, push = PHYSICS.push, damp = PHYSICS.damp } = {}) {
  const hub = bodies.find((b) => b.hub);
  const byKey = new Map(bodies.map((b) => [b.key, b]));
  const moves = (b) => !b.hub && b.key !== held;
  for (const b of bodies) { b.vx = b.vx || 0; b.vy = b.vy || 0; }
  // The pull towards the parent, beyond touching distance only.
  for (const b of bodies) {
    if (!moves(b)) continue;
    const parent = (b.attach && byKey.get(b.attach)) || hub;
    if (!parent) continue;
    const dx = parent.x - b.x, dy = parent.y - b.y, d = Math.hypot(dx, dy) || 1;
    // (its natural length: `home`, its distance in the layout as arranged, else touching distance)
    const touch = b.home || (parent.hub ? Math.hypot(parent.w, parent.h) / 2 : parent.r) + b.r + GAP;
    if (d > touch) { b.vx += (dx / d) * (d - touch) * pull; b.vy += (dy / d) * (d - touch) * pull; }
  }
  // Soft pushes apart, and off the lines: only where things really overlap, so a layout with nothing overlapping
  // has nothing pushing in it, and stays still.
  const soft = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], ma = moves(a), mb = moves(b);
      if (!ma && !mb) continue;
      const v = separation(a, b, soft);
      if (!v) continue;
      const ka = ma && mb ? 0.5 : ma ? 1 : 0, kb = ma && mb ? 0.5 : mb ? 1 : 0;
      a.vx += v[0] * push * ka; a.vy += v[1] * push * ka; b.vx -= v[0] * push * kb; b.vy -= v[1] * push * kb;
    }
  }
  for (const link of linksOf(bodies)) {
    for (const b of bodies) {
      if (!moves(b) || b.key === link.to || b.key === link.from) continue;
      const v = segPush(link.ends, b, soft);
      if (v) { b.vx += v[0] * push * 0.5; b.vy += v[1] * push * 0.5; }
    }
  }
  // Move, slowed by the damping, and kept on the stage.
  let fastest = 0;
  for (const b of bodies) {
    if (!moves(b)) { b.vx = 0; b.vy = 0; continue; }
    b.vx *= damp; b.vy *= damp;
    b.x += b.vx; b.y += b.vy;
    const e = extentOf(b);
    if (e.l < 2) { b.x += 2 - e.l; b.vx = 0; } else if (e.r > W - 2) { b.x -= e.r - (W - 2); b.vx = 0; }
    if (e.t < 2) { b.y += 2 - e.t; b.vy = 0; } else if (e.b > H - 2) { b.y -= e.b - (H - 2); b.vy = 0; }
    fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
  }
  return fastest;
}

/** Run frames until everything is still (slower than PHYSICS.rest for a few frames in a row), at most `most`.
 *  Returns how many frames it took. Velocities are left at 0: at rest. */
export function settle(bodies, opts, most = 600) {
  let still = 0, n = 0;
  for (; n < most && still < 6; n++) still = physicsStep(bodies, opts) < PHYSICS.rest ? still + 1 : 0;
  for (const b of bodies) { b.vx = 0; b.vy = 0; }
  return n;
}

/** Each bubble's natural distance from its parent, as the layout now has it: the arranged layout is then at rest. */
export function setHomes(bodies) {
  const hub = bodies.find((b) => b.hub);
  const byKey = new Map(bodies.map((b) => [b.key, b]));
  for (const b of bodies) {
    const parent = (b.attach && byKey.get(b.attach)) || hub;
    if (!b.hub && parent) b.home = Math.hypot(parent.x - b.x, parent.y - b.y);
  }
  return bodies;
}
