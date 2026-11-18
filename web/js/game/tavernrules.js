// The guild tavern's rules, with no screen code (tavern.js draws it): who is inside, and where in the room a creature
// may stand. The room is web/game-art/tavern/room.png (400 x 200, made by tools/game_art/tavern.py); the numbers
// below are places in that picture.

export const ROOM = { w: 400, h: 200 };
export const TAVERN_MAX = 6;   // creatures inside at once (the room is small; the rest are "out")
export const ONLINE_S = 150;   // seen this recently = online (the same as the Friends tab's dot)

// Furniture that stands in front of the creatures: its picture, its top-left, and the row its feet stand on (things
// are drawn in order of that row, so a creature behind a table has its legs hidden by it: it looks seated).
export const PROPS = [
  { id: "stool", x: 86, y: 160, base: 173 },
  { id: "table_round", x: 102, y: 148, base: 176 },
  { id: "stool", x: 148, y: 164, base: 177 },
  { id: "table_long", x: 290, y: 166, base: 194 },
  { id: "stool", x: 270, y: 182, base: 195 },
];
// The animated bits: the hearth's fire (4 frames of 32 x 26) and the candle flames (4 frames of 5 x 7), top-left.
export const FIRE = { x: 42, y: 89, w: 32, h: 26, frames: 4 };
export const FLAMES = [{ x: 29, y: 61 }, { x: 83, y: 61 }, { x: 122, y: 49 }, { x: 251, y: 49 }, { x: 319, y: 87 }];
export const BANNER = { x: 222, y: 52 }; // the middle of the banner, where the guild's tag is written

// Where a creature may stop (the point between its feet). "seat" spots are just behind a table.
export const SPOTS = [
  { x: 124, y: 168, kind: "seat" },
  { x: 314, y: 186, kind: "seat" }, { x: 354, y: 186, kind: "seat" },
  { x: 282, y: 138, kind: "bar" }, { x: 330, y: 138, kind: "bar" }, { x: 374, y: 138, kind: "bar" },
  { x: 60, y: 138, kind: "fire" }, { x: 100, y: 136, kind: "fire" },
  { x: 186, y: 158, kind: "floor" }, { x: 222, y: 170, kind: "floor" }, { x: 196, y: 190, kind: "floor" },
  { x: 40, y: 182, kind: "floor" }, { x: 250, y: 150, kind: "floor" },
];

/**
 * Who of a guild is in its tavern: every member whose favourite creature is known, me first, then whoever is online,
 * then whoever was seen most recently. At most TAVERN_MAX.
 *   members  [{id, username}]
 *   genomes  Map(id -> a creature genome, or null: no favourite yet, or only eggs)
 *   seen     Map(id -> seconds since last seen)
 * Returns {inside: [{id, username, me, online, genome}], out: n with a creature who didn't fit, none: n without one}.
 */
export function castOf(members, { meId = null, genomes = new Map(), seen = new Map() } = {}) {
  const all = [];
  let none = 0;
  for (const m of members || []) {
    const genome = genomes.get(m.id) || null;
    if (!genome) { none++; continue; }
    const s = seen.has(m.id) ? seen.get(m.id) : Infinity;
    all.push({ id: m.id, username: m.username || "", me: m.id === meId, online: m.id === meId || s <= ONLINE_S, seen: m.id === meId ? -1 : s, genome });
  }
  all.sort((a, b) => (b.me - a.me) || (b.online - a.online) || (a.seen - b.seen) || a.username.localeCompare(b.username));
  const inside = all.slice(0, TAVERN_MAX).map(({ seen: _, ...rest }) => rest);
  return { inside, out: Math.max(0, all.length - TAVERN_MAX), none };
}

/** A free spot for a creature to go to next: not the one it is at, not one another creature has taken (or is heading
 * to). `rand` gives 0..1. Null when every spot is taken. */
export function nextSpot(rand, taken, at = -1) {
  const free = SPOTS.map((_, i) => i).filter((i) => i !== at && !taken.has(i));
  if (!free.length) return null;
  return free[Math.floor(rand() * free.length) % free.length];
}

/** The guild to show: the one chosen last time if it is still one of mine, else the first. */
export function pickGuild(guilds, remembered) {
  if (!guilds || !guilds.length) return null;
  return guilds.find((g) => g.id === remembered) || guilds[0];
}
