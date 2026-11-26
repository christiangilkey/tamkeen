// Ranked battles (prototype "ranked"): the rating, its tiers and the matchmaking window. The owner (2026-11-25):
// "matchmaking with an elo system, players start at zero, it adds points to it each battle and tries to match
// players up with simlar elo players in battles".
//
// The real numbers are worked out on the server (supabase/v18-ranked.sql, private.ranked_change), never on a
// device: this file is the same sums, so the screens can show "win +18 / lose -12" before a match and the tests
// can check the two agree (tests/js/ranked.test.mjs reads the SQL file's numbers).
//
// In plain words:
//   - Everyone starts at 0 and can never go below 0.
//   - Each ranked battle moves the rating by K x (result - expected). "Expected" is the chance the rating gives you
//     of winning: 50% against someone rated the same, about 24% against someone 200 points higher, 76% against
//     someone 200 lower (the usual chess sums, 400 points = ten times as likely).
//   - K is 40 for a player's first 10 ranked battles (so a new player finds their level quickly), then 24.
//     Against an equal rating that is +20 / -20 while new, then +12 / -12. Beating someone 200 higher: +18;
//     losing to someone 200 lower: -18. A win always gives at least 1 point, a loss always costs at least 1.
//   - Tiers by rating: Bronze 0-199, Silver 200-399, Gold 400-599, Platinum 600-799, Diamond 800-999,
//     Champion 1000 and up.
//   - Matching: someone within 100 points at first, 200 after 15 seconds, 400 after 30, anyone after 45;
//     after 60 seconds with nobody, "No one found".
//
// Pure: no DOM, no network.

export const START = 0;
export const K_NEW = 40;          // K for a player's first NEW_GAMES ranked battles
export const K = 24;              // K after that
export const NEW_GAMES = 10;
export const SPREAD = 400;        // rating points that make a win ten times as likely
export const WINDOW_STEPS = [[0, 100], [15, 200], [30, 400], [45, Infinity]]; // [seconds waited, +- points]
export const GIVE_UP_S = 60;      // seconds in the queue before "No one found"

export const TIERS = [
  { id: "bronze", name: "Bronze", from: 0 },
  { id: "silver", name: "Silver", from: 200 },
  { id: "gold", name: "Gold", from: 400 },
  { id: "platinum", name: "Platinum", from: 600 },
  { id: "diamond", name: "Diamond", from: 800 },
  { id: "champion", name: "Champion", from: 1000 },
];

const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
const clampRating = (r) => Math.max(0, Math.round(num(r)));

/** The chance a player rated `mine` beats one rated `theirs` (0..1). */
export const expected = (mine, theirs) => 1 / (1 + 10 ** ((clampRating(theirs) - clampRating(mine)) / SPREAD));

/** K for a player who has had `games` ranked battles before this one. */
export const kFor = (games) => (num(games) < NEW_GAMES ? K_NEW : K);

/** How many points one battle moves `mine`: positive for a win, negative for a loss, never below 0 overall. */
export function change(mine, theirs, won, games = NEW_GAMES) {
  const r = clampRating(mine);
  let d = Math.round(kFor(games) * ((won ? 1 : 0) - expected(r, theirs)));
  if (won && d < 1) d = 1;
  if (!won && d > -1) d = -1;
  return Math.max(d, -r) || 0; // never below 0 (and never "-0")
}

/** What a match could do to me: {win, lose} points (lose as a negative number, or 0 at a rating of 0). */
export const stakes = (mine, theirs, games) => ({ win: change(mine, theirs, true, games), lose: change(mine, theirs, false, games) });

/** The tier a rating falls in. */
export function tierOf(rating) {
  const r = clampRating(rating);
  let tier = TIERS[0];
  for (const t of TIERS) if (r >= t.from) tier = t;
  return tier;
}

/** How far from my rating the matchmaker looks after `waited` seconds in the queue. */
export function windowAt(waited) {
  let w = WINDOW_STEPS[0][1];
  for (const [s, points] of WINDOW_STEPS) if (num(waited) >= s) w = points;
  return w;
}

/** "+18", "-12" or "0" (with a real minus sign), for the end card. */
export const signed = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0");

/** A rating as it came from the server, checked: {rating, games, wins, tier} with numbers in range. */
export function readMine(row) {
  const o = row && typeof row === "object" ? row : {};
  const rating = clampRating(o.rating);
  const games = Math.max(0, Math.floor(num(o.games)));
  const wins = Math.min(games, Math.max(0, Math.floor(num(o.wins))));
  return { rating, games, wins, tier: tierOf(rating).id };
}

/** The leaderboard as it came from the server, checked: [{username, rating, tier}] (usernames only, at most 50). */
export function readTop(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((x) => x && typeof x.username === "string" && /^[A-Za-z0-9_.]{3,20}$/.test(x.username))
    .slice(0, 50)
    .map((x) => ({ username: x.username, rating: clampRating(x.rating), tier: tierOf(x.rating).id, me: x.me === true }));
}
