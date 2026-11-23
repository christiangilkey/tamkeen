// Older copies of the creature game, from the older versions Google Drive keeps of the synced library
// (library.json.gz in the hidden app folder). Up to v0.68.0 a copy of the game that was behind could replace the
// whole game (merge.js tells why); the game it replaced is often still in one of those versions. These are the rules
// for showing them and bringing one back (screens: oldgames-ui.js; the versions come from GET /sync/game-versions,
// app/sync on the desktop, mobile/src/js/oldgames-drive.js on the phones and in the web app). No screen code here.

import { levelOf } from "./rules.js";
import { LEADERS } from "./gyms.js";

/** At most this many versions are offered: one a day, the newest first (Drive keeps them about 30 days). */
export const MOST_VERSIONS = 40;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const localDay = (seconds) => { const d = new Date(seconds * 1000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Drive's versions [{id, at (seconds), size}], as the ones to offer: the last of each day, the newest first. */
export function perDay(versions) {
  const seen = new Set();
  const out = [];
  for (const v of [...(Array.isArray(versions) ? versions : [])].filter((x) => x && x.id && num(x.at) > 0).sort((a, b) => b.at - a.at)) {
    const day = localDay(v.at);
    if (seen.has(day)) continue;
    seen.add(day);
    out.push(v);
    if (out.length >= MOST_VERSIONS) break;
  }
  return out;
}

/** The versions (from perDay) the note on Home looks at, each read once: the newest, and about two days, a week and
 *  as long ago as Drive keeps. */
export function hintPicks(versions, nowSeconds = Date.now() / 1000) {
  if (!versions.length) return [];
  const older = (days) => versions.find((v) => v.at <= nowSeconds - days * 86400);
  return [...new Set([versions[0], older(2), older(7), versions[versions.length - 1]].filter(Boolean))];
}

/** What a user can recognise a game by: its level, XP, gym leaders beaten, creatures and garden buildings.
 *  Null for something that isn't a saved game. */
export function summary(game) {
  if (!game || typeof game !== "object" || !(Array.isArray(game.roster) || (game.creature && typeof game.creature === "object"))) return null;
  const roster = Array.isArray(game.roster) ? game.roster.filter((c) => c && typeof c === "object") : [game.creature];
  const plots = game.idle && Array.isArray(game.idle.plots) ? game.idle.plots : [];
  const gyms = game.gyms && typeof game.gyms === "object" ? Math.max(0, Math.min(LEADERS.length, Math.floor(num(game.gyms.beaten)))) : 0;
  return {
    level: levelOf(num(game.xp)).level,
    xp: Math.round(num(game.xp)),
    gyms,
    creatures: roster.length,
    buildings: plots.filter((p) => p && num(p.tier) > 0).length,
    tiers: plots.reduce((sum, p) => sum + (p ? Math.max(0, num(p.tier)) : 0), 0), // (a building raised counts too)
  };
}

/** Does an older copy clearly have more than the game now: more gym leaders beaten, a bigger garden, more
 *  creatures, or a higher level? (For the note on Home; any copy can still be brought back from Settings.) */
export function clearlyMore(old, now) {
  if (!old) return false;
  if (!now) return true;
  return old.gyms > now.gyms || old.tiers > now.tiers || old.creatures > now.creatures || old.level > now.level;
}

/** What came back, for the box after bringing a copy back: the lines whose number went up. */
export function cameBack(before, after) {
  const rows = [
    ["gyms", "Gym leaders beaten"],
    ["buildings", "Garden buildings"],
    ["creatures", "Creatures"],
    ["level", "Level"],
    ["xp", "XP"],
  ];
  return rows.filter(([k]) => after && before && num(after[k]) > num(before[k]))
    .map(([k, label]) => ({ key: k, label, from: num(before[k]), to: num(after[k]) }));
}
