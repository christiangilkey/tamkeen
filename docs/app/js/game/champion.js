// The ranked champion in the championship hall (prototype "ranked_champion"; the owner, 2026-11-27: "Similarly to how
// we have the trophy fish, I think the highest ranked battle player should be in the battle room, like to the right,
// and it should show you their current score. As well, like as who it is and the creature. Maybe their whole party.
// And something indicating that they're like the best."). Pure: where the dais and its pieces stand in the hall, and
// what the server's answer means. The drawing and the card are in champion-ui.js; the server's side is
// supabase/v22-ranked-champion.sql.
//
// The dais (game-art/hall/champion_dais.png, 80 x 30, hand-drawn) stands on the right of the hall's floor, a royal
// pennant over it on the back wall, between the knight's statue and the banner (the owner kept those: "I like that statue
// and banner"). The champion's party stands on it: the lead creature on the upper tier
// with a gold crown floating over it, the other two on the lower tier's ends. A champion who chose not to show their
// team (the Settings switch "Show my team if I'm the ranked champion") stands there as a shadow with a question mark.

import { cleanTeam } from "./remote.js";
import { tierOf } from "./ranked.js";

/** The dais's top left in the hall (scene pixels), and its size. */
export const DAIS = { x: 216, y: 80, w: 80, h: 30 };
/** Where the party stands on it (their feet): the lead on the upper tier, the other two on the lower tier's ends. */
export const STANDS = [
  { x: DAIS.x + 40, y: DAIS.y + 6, scale: 2 / 3 },
  { x: DAIS.x + 13, y: DAIS.y + 17, scale: 0.56 },
  { x: DAIS.x + 67, y: DAIS.y + 17, scale: 0.56 },
];
/** The pennant on the back wall, over the dais's middle (its top left, 16 x 36): between the statue and the banner. */
export const PENNANTS = [{ x: DAIS.x + DAIS.w / 2 - 8, y: 2 }];
/** Where the player's creature stands to look at the dais, at its left (tap it: it walks here, then the card opens; in
 * front of the dais is its name plate). */
export const DAIS_FRONT = { x: DAIS.x - 10, y: DAIS.y + 20 };
/** The floor tiles under the dais (column, row), walked round like a prop's foot. */
export const DAIS_TILES = [14, 15, 16, 17].flatMap((c) => [[c, 5], [c, 6]]);

/** Is (x, y) on the dais, its party or its pennants (a tap there opens the champion's card)? */
export function onDais(x, y) {
  if (x >= DAIS.x - 2 && x <= DAIS.x + DAIS.w + 2 && y >= DAIS.y - 40 && y <= DAIS.y + DAIS.h) return true;
  return PENNANTS.some((p) => x >= p.x - 1 && x <= p.x + 17 && y >= p.y && y <= p.y + 37);
}

const NAME = /^[A-Za-z0-9_.]{3,20}$/;
const whole = (v, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(hi, n)) : 0; };

/**
 * The server's answer (ranked_champion, or the leaderboard's first row before v22 is run), checked. null: no champion
 * yet. Otherwise {username, rating, tier, games, wins, me, team, hidden, partial}: `team` is up to three creatures,
 * checked as a friend's team is (remote.cleanTeam); `hidden` when they chose not to show it; `partial` when only the
 * name and rating are known (the older server).
 */
export function readChampion(x, partial = false) {
  if (!x || typeof x !== "object" || typeof x.username !== "string" || !NAME.test(x.username)) return null;
  const rating = whole(x.rating, 100000);
  const games = whole(x.games, 1e7);
  const wins = Math.min(games, whole(x.wins, 1e7));
  const team = partial ? [] : cleanTeam(x.team);
  return {
    username: x.username, rating, tier: tierOf(rating).id, games, wins, me: x.me === true,
    team, hidden: !partial && x.hidden === true, partial: partial || x.partial === true,
  };
}

/** Its record in plain numbers: "24 wins, 9 losses" (null before any battle is known). */
export function record(c) {
  if (!c || !c.games) return null;
  return { wins: c.wins, losses: Math.max(0, c.games - c.wins) };
}

/** The Settings switch "Show my team if I'm the ranked champion" (the setting `ranked_show_team`; on unless off). */
export const showTeamOn = (settings) => !(settings && settings.ranked_show_team === false);
