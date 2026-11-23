// Two copies of the creature game made into one, so that progress is never lost when they meet.
//
// The game is saved as one state for the whole account and travels between devices (and browser tabs) in the
// synced settings. Until v0.68.0 the copy saved last simply replaced the other. A copy that was behind (a tab left
// open for days, a phone not synced for a week, a web app whose browser had wiped its storage and started a new
// egg) only had to earn one XP to be "newest" and wipe out the garden, the gym leaders beaten, creatures hatched.
//
// Now every save counts up its device's number in `clock` (one per device, never shared), so two copies can be told
// apart: if one has seen everything the other has, it is simply newer and replaces it (spending, releasing and
// selling must carry over too). If each has something the other hasn't (they were played apart), the two are
// combined: what only grows is kept at its best (gyms beaten, wins, buildings, creatures, items, badges, stats), and
// XP, coins and gems add up what each device earned and spent (`tally`: per device, [earned, spent]), so nothing is
// counted twice and nothing earned is dropped.
//
// Pure, with no imports: app/sync/gamemerge.py does exactly the same on the desktop (tests/fixtures/game-merge.json
// is run through both).

/** The numbers kept per device: the value shown is the sum of what every device earned minus what it spent. */
export const COUNTERS = ["xp", "coins", "gems"];
/** The share of a counter no device has claimed yet (saves from before the tally; versions that don't keep it). */
export const UNCLAIMED = "_";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Is this a saved game at all (and not a blank or broken value)? */
export const isGame = (s) => !!obj(s) && (Array.isArray(s.roster) || !!obj(s.creature));

/** How clock `a` stands to clock `b`: "same", "after" (a has seen all of b and more), "before", or "apart". */
export function order(a, b) {
  a = obj(a) || {};
  b = obj(b) || {};
  let ahead = false;
  let behind = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = num(a[k]);
    const y = num(b[k]);
    if (x > y) ahead = true;
    else if (x < y) behind = true;
  }
  return ahead && behind ? "apart" : ahead ? "after" : behind ? "before" : "same";
}

/** What a counter's tally adds up to. */
const total = (t) => Object.values(obj(t) || {}).reduce((sum, e) => sum + (Array.isArray(e) ? num(e[0]) - num(e[1]) : 0), 0);

/** Make the tally account for every counter's value, putting the difference under `key`. Changes `state`. */
function claim(state, key) {
  const tally = (state.tally = obj(state.tally) || {});
  for (const k of COUNTERS) {
    const t = (tally[k] = obj(tally[k]) || {});
    for (const [d, e] of Object.entries(t)) if (!(Array.isArray(e) && e.length === 2)) delete t[d];
    const diff = num(state[k]) - total(t);
    if (Math.abs(diff) < 1e-9) continue;
    const e = (t[key] = Array.isArray(t[key]) ? t[key] : [0, 0]);
    if (diff > 0) e[0] = num(e[0]) + diff;
    else e[1] = num(e[1]) - diff;
  }
  return state;
}

/** A save from before the tally, or changed by a version that doesn't keep it: its counters as one unclaimed share. */
export const settle = (state) => claim(state, UNCLAIMED);

/** This device is saving the game: what changed since the last save is its own, and its clock moves on. */
export function stamp(state, device) {
  claim(state, device);
  const clock = (state.clock = obj(state.clock) || {});
  clock[device] = num(clock[device]) + 1;
  return state;
}

/**
 * Another copy of the game has arrived (`theirs`) and this one is `mine`. Returns {keep, state}: keep is "mine"
 * (nothing to do), "theirs" (it replaces mine) or "merged" (a new state made from both, to be saved). Neither input
 * is changed.
 */
export function resolve(mine, theirs) {
  if (!isGame(theirs)) return { keep: "mine", state: mine };
  if (!isGame(mine)) return { keep: "theirs", state: theirs };
  // An egg nobody has played (a fresh install) never replaces a game with progress, and never joins it.
  const played = (s) => num(s.xp) > 0;
  if (played(theirs) !== played(mine)) return played(theirs) ? { keep: "theirs", state: theirs } : { keep: "mine", state: mine };
  const o = order(theirs.clock, mine.clock);
  // (A copy saved before the clocks has a history nobody knows: no other copy can be shown to have seen it all,
  // so it is combined, never replaced. A web app whose storage was wiped starts a new egg with a clock of its own.)
  const known = (s) => Object.keys(obj(s.clock) || {}).length > 0;
  if (o === "after" && known(mine)) return { keep: "theirs", state: theirs };
  if (o === "before" && known(theirs)) return { keep: "mine", state: mine };
  if (o === "same" && num(theirs.updated_at) === num(mine.updated_at)) return { keep: "mine", state: mine };
  return { keep: "merged", state: combine(mine, theirs) };
}

/** Do two games hold the same things (whatever their clocks, tallies and save times say)? */
export function sameGame(a, b) {
  const skip = new Set(["clock", "tally", "updated_at"]);
  const stable = (v, top) => {
    if (Array.isArray(v)) return `[${v.map((x) => stable(x, false)).join(",")}]`;
    if (!obj(v)) return JSON.stringify(v === undefined ? null : v);
    return `{${Object.keys(v).filter((k) => !(top && skip.has(k)) && v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k], false)}`).join(",")}}`;
  };
  return stable(a, true) === stable(b, true);
}

const rosterOf = (s) => (Array.isArray(s.roster) ? s.roster : obj(s.creature) ? [s.creature] : []).filter((c) => obj(c));
const seedOf = (c) => (obj(c) && typeof c.seed === "number" ? c.seed : null);
const union = (a, b) => {
  const out = Array.isArray(a) ? [...a] : [];
  const seen = new Set(out.map((x) => JSON.stringify(x)));
  for (const x of Array.isArray(b) ? b : []) if (!seen.has(JSON.stringify(x))) { seen.add(JSON.stringify(x)); out.push(x); }
  return out;
};
/** Per key, the entry `better` picks (b's when a has none). */
const eachKey = (a, b, better) => {
  const out = { ...(obj(a) || {}) };
  for (const [k, v] of Object.entries(obj(b) || {})) out[k] = k in out ? better(out[k], v) : v;
  return out;
};
const maxNumbers = (a, b) => eachKey(a, b, (x, y) => (typeof x === "number" && typeof y === "number" ? Math.max(x, y) : x));

/** Fishing's round (fishing.js roundOf: today's turns in the pond) from two copies: the later day's; the same day's
 * are joined, so a word answered right on either has had its turn, and one missed on either still waits (missed
 * wins over answered: it comes back once more rather than being skipped). */
function joinRounds(x, y) {
  if (!x || !y) return x || y;
  const dx = typeof x.day === "string" ? x.day : "";
  const dy = typeof y.day === "string" ? y.day : "";
  if (dx !== dy) return dy > dx ? y : x;
  const miss = new Map();
  for (const m of [...(Array.isArray(x.miss) ? x.miss : []), ...(Array.isArray(y.miss) ? y.miss : [])]) {
    if (!obj(m) || typeof m.u !== "string") continue;
    const had = miss.get(m.u);
    miss.set(m.u, { u: m.u, c: Math.max(num(had && had.c), num(m.c)), at: Math.max(num(had && had.at), num(m.at)) });
  }
  return { day: dx, n: Math.max(num(x.n), num(y.n)), done: union(x.done, y.done).filter((u) => typeof u === "string" && !miss.has(u)), miss: [...miss.values()] };
}

/** Two copies played apart, made into one. The one further along (more XP) is the base; the other adds to it. */
export function combine(mine, theirs) {
  mine = settle(clone(mine));
  theirs = settle(clone(theirs));
  const theirsFirst = num(theirs.xp) > num(mine.xp) || (num(theirs.xp) === num(mine.xp) && num(theirs.updated_at) > num(mine.updated_at));
  const [a, b] = theirsFirst ? [theirs, mine] : [mine, theirs];
  const out = a;

  // Clocks: the merged copy has seen everything both had, and is newer than either (so each side takes it, even
  // two saves from before the clocks).
  out.clock = eachKey(a.clock, b.clock, (x, y) => Math.max(num(x), num(y)));
  out.clock[UNCLAIMED] = num(out.clock[UNCLAIMED]) + 1;
  // XP, coins, gems: per device, the most it earned and the most it spent, added up.
  const tally = {};
  for (const k of COUNTERS) {
    tally[k] = eachKey(a.tally[k], b.tally[k], (x, y) => [Math.max(num(x[0]), num(y[0])), Math.max(num(x[1]), num(y[1]))]);
    out[k] = Math.max(0, total(tally[k]));
  }
  out.tally = tally;

  // The garden. Releasing a creature starts the garden over (and is kept): the copy that has released more is the
  // later garden. Otherwise each plot keeps the bigger building; a plot opened on either stays open.
  const ga = obj(a.idle);
  const gb = obj(b.idle);
  const released = union(ga && ga.released, gb && gb.released);
  const gone = new Set(released.map(seedOf).filter((s) => s !== null));
  if (gb && !ga) out.idle = gb;
  else if (ga && gb) {
    const ra = Array.isArray(ga.released) ? ga.released.length : 0;
    const rb = Array.isArray(gb.released) ? gb.released.length : 0;
    if (rb > ra) out.idle = gb;
    else if (ra === rb) {
      const pa = Array.isArray(ga.plots) ? ga.plots : [];
      const pb = Array.isArray(gb.plots) ? gb.plots : [];
      const plots = [];
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = obj(pa[i]);
        const y = obj(pb[i]);
        const p = !x ? y : !y ? x : num(y.tier) > num(x.tier) ? y : x;
        plots.push({ ...p, open: !!((x && x.open) || (y && y.open)) });
      }
      ga.plots = plots;
      for (const k of ["stardust", "badgesPaid", "raidsPaid", "leaguePaid"]) if (k in ga || k in gb) ga[k] = Math.max(num(ga[k]), num(gb[k]));
      for (const k of ["goalDay", "cardsDay"]) if (typeof gb[k] === "string" && !(typeof ga[k] === "string" && ga[k] >= gb[k])) ga[k] = gb[k];
      if ("bloom" in ga || "bloom" in gb) ga.bloom = !!(ga.bloom || gb.bloom);
    }
    out.idle.released = released;
  }

  // Creatures: every one hatched on either copy, the more grown copy of each, none that was released.
  const roster = [];
  const at = new Map();
  for (const c of [...rosterOf(a), ...rosterOf(b)]) {
    const seed = seedOf(c);
    if (seed === null || gone.has(seed)) continue;
    if (!at.has(seed)) { at.set(seed, roster.length); roster.push(c); continue; }
    const i = at.get(seed);
    if (num(c.growth) > num(roster[i].growth)) roster[i] = c;
  }
  if (roster.length) {
    const was = seedOf(rosterOf(a)[num(a.active)] || rosterOf(a)[0]);
    out.roster = roster;
    out.active = Math.max(0, roster.findIndex((c) => c.seed === was));
    delete out.creature;
  }

  // Gym leaders: the most beaten, and the most wins against each.
  const gymA = obj(a.gyms) || {};
  const gymB = obj(b.gyms) || {};
  out.gyms = { ...gymA, beaten: Math.max(num(gymA.beaten), num(gymB.beaten)), wins: maxNumbers(gymA.wins, gymB.wins) };

  // Things owned or earned once: kept from both.
  for (const k of ["owned", "attacks", "badges", "tags"]) out[k] = union(a[k], b[k]);
  out.stats = maxNumbers(a.stats, b.stats);
  for (const k of ["best_streak", "known"]) out[k] = Math.max(num(a[k]), num(b[k]));
  if (typeof b.last_complete === "string" && (typeof a.last_complete !== "string" || b.last_complete > a.last_complete
      || (b.last_complete === a.last_complete && num(b.streak) > num(a.streak)))) {
    out.last_complete = b.last_complete;
    out.streak = num(b.streak);
  }
  // Each word's place in the battles' review: the copy that has been answered more.
  const answered = (e) => (Array.isArray(e) ? num(e[2]) + num(e[3]) : -1);
  out.review = eachKey(a.review, b.review, (x, y) => (answered(y) > answered(x) ? y : x));
  const fought = (r) => (obj(r) ? num(r.wins) + num(r.losses) : -1);
  out.rivals = eachKey(a.rivals, b.rivals, (x, y) => (fought(y) > fought(x) ? y : x));
  out.reading = eachKey(a.reading, b.reading, (x) => x);
  const fa = obj(a.finished) || {};
  const fb = obj(b.finished) || {};
  out.finished = { ...fa };
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) out.finished[k] = union(fa[k], fb[k]);
  // Fishing: which words have had their turn in the pond today, joined (the rest of fishing is the base copy's).
  const fishA = obj(a.fishing);
  const fishB = obj(b.fishing);
  if (fishA && fishB) {
    const round = joinRounds(obj(fishA.round), obj(fishB.round));
    if (round) fishA.round = round;
  }
  out.updated_at = Math.max(num(a.updated_at), num(b.updated_at));
  return out;
}
