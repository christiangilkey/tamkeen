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
