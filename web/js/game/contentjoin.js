// The content rewards' record (content.js, prototype "content_rewards") from two copies of the game, made into one.
// Pure, with no imports: merge.js combine uses it, and app/sync/gamemerge.py join_content does exactly the same on the
// desktop (tests/fixtures/game_merge.json runs through both).

/** How many fingerprints are kept per list (the newest); far more than anyone adds, finishes or sends. */
export const KEPT = 5000;
/** Today's counts, one per kind of pay (content.js PAY). */
export const ACTIONS = ["add", "done", "short", "sent"];

const unionList = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
const n0 = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Two copies' records made into one (merge.js combine; app/sync/gamemerge.py does the same): every item that
 * counted on either has counted (so it never pays twice), the counts are at least what either had, today's and this
 * week's from the later day or week (the same one: joined). Pure: neither input is changed; null when neither has
 * one.
 */
export function join(a, b) {
  const x = a && typeof a === "object" && !Array.isArray(a) ? a : null;
  const y = b && typeof b === "object" && !Array.isArray(b) ? b : null;
  if (!x || !y) return x || y ? JSON.parse(JSON.stringify(x || y)) : null;
  const out = {};
  for (const k of ["add", "done", "sent"]) out[k] = unionList(x[k], y[k]).slice(-KEPT);
  out.kinds = unionList(x.kinds, y.kinds);
  out.n = {};
  const xn = x.n && typeof x.n === "object" ? x.n : {};
  const yn = y.n && typeof y.n === "object" ? y.n : {};
  for (const k of ["add", "done", "sent"]) out.n[k] = Math.max(n0(xn[k]), n0(yn[k]), out[k].length);
  const xd = x.day && typeof x.day === "object" ? x.day : {};
  const yd = y.day && typeof y.day === "object" ? y.day : {};
  const dx = typeof xd.key === "string" ? xd.key : "";
  const dy = typeof yd.key === "string" ? yd.key : "";
  if (dx !== dy) out.day = { ...(dy > dx ? yd : xd) };
  else {
    out.day = { key: dx };
    for (const k of ACTIONS) out.day[k] = Math.max(n0(xd[k]), n0(yd[k]));
  }
  const xw = x.week && typeof x.week === "object" ? x.week : {};
  const yw = y.week && typeof y.week === "object" ? y.week : {};
  if (n0(xw.n) !== n0(yw.n)) out.week = JSON.parse(JSON.stringify(n0(yw.n) > n0(xw.n) ? yw : xw));
  else out.week = { n: n0(xw.n), done: unionList(xw.done, yw.done).slice(-50), paid: xw.paid === true || yw.paid === true };
  return out;
}
