// Ranked battles (prototype "ranked"), the online part: my rating, the queue, reporting how a match ended, the
// leaderboard. The rules and every sum that moves points are in supabase/v18-ranked.sql (the server decides; a
// device only says what it saw), the same sums for showing in game/ranked.js, the screens in game/ranked-ui.js.
// Shared by the computer, the phones and the web app. Until the owner runs v18-ranked.sql every call fails with
// `notReady` and the screens say "Ranked isn't switched on yet."

import { readMine, readTop } from "./game/ranked.js";

export const POLL_MS = 3000;   // while in the queue, ask this often (the server counts 12 s of silence as gone)

const missing = (code, msg) => code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg);

/** A plain message for what went wrong; `notReady` when the SQL file hasn't been run yet. */
export function rankedError(error) {
  const msg = String((error && error.message) || "");
  const code = String((error && error.code) || "");
  const e = new Error(missing(code, msg) ? "Ranked isn't switched on yet."
    : /Not signed in|JWT/i.test(msg) ? "Sign in to Friends first to play ranked battles."
    : /daily_limit/.test(msg) ? "That's enough ranked searching for today. Try again tomorrow."
    : /ranked_no_match/.test(msg) ? "That match has ended."
    : code === "offline" || /fetch|network|Failed to/i.test(msg) ? "Couldn't reach the online service. Check your internet connection."
    : "That didn't work. Try again in a moment.");
  e.notReady = missing(code, msg);
  return e;
}

let client = null; // (tests put a stand-in here; social.js is loaded only when needed, as it needs a page)
export function useClient(c) { client = c; }

async function rpc(name, args) {
  let res;
  try { res = await (client || (await (await import("./social.js")).sb())).rpc(name, args); } catch { throw rankedError({ code: "offline" }); }
  if (res.error) throw rankedError(res.error);
  return res.data;
}

/** My rating: {rating, games, wins, tier, place}. */
export async function myRating() {
  const row = await rpc("ranked_me", {});
  const place = Number(row && row.place);
  return { ...readMine(row), place: Number.isFinite(place) && place > 0 ? Math.floor(place) : null };
}

/** What the queue says, checked: {status: "waiting", waited, window} | {status: "matched", match, seed, host, me,
 *  rival: {id, username, rating, games}} | {status: "none"} | {status: "out"}. */
export function readQueue(x) {
  const o = x && typeof x === "object" ? x : {};
  if (o.status === "waiting") return { status: "waiting", waited: Math.max(0, Number(o.waited) || 0), window: o.window == null ? Infinity : Math.max(0, Number(o.window) || 0) };
  if (o.status === "matched" && typeof o.match === "string" && o.rival && typeof o.rival === "object") {
    const rival = readMine(o.rival);
    return {
      status: "matched", match: o.match, seed: Math.floor(Number(o.seed) || 1), host: o.host === true,
      me: readMine(o.me),
      rival: { id: typeof o.rival.id === "string" ? o.rival.id : null, username: typeof o.rival.username === "string" ? o.rival.username.slice(0, 20) : "", rating: rival.rating, games: rival.games, tier: rival.tier },
    };
  }
  return { status: o.status === "none" ? "none" : "out" };
}

export const joinQueue = async () => readQueue(await rpc("ranked_join", {}));
export const pollQueue = async () => readQueue(await rpc("ranked_poll", {}));
export const leaveQueue = () => rpc("ranked_leave", {});

/** A match's end, from my side: said = "won" | "lost" | "quit" | "broken". Answers {status: "waiting"} or
 *  {status: "settled", outcome: "won" | "lost" | "void", change, rating}. */
export async function report(match, said) {
  return readResult(await rpc("ranked_report", { match, said }));
}
export const result = async (match) => readResult(await rpc("ranked_result", { match }));

export function readResult(x) {
  const o = x && typeof x === "object" ? x : {};
  if (o.status !== "settled") return { status: "waiting" };
  const change = Math.round(Number(o.change) || 0);
  return { status: "settled", outcome: ["won", "lost"].includes(o.outcome) ? o.outcome : "void", change: Math.max(-200, Math.min(200, change)), rating: readMine(o).rating };
}

/** The leaderboard: [{username, rating, tier, me}]. */
export const top = async (most = 20) => readTop(await rpc("ranked_top", { most }));
