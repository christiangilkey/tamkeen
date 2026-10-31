// The battle engine, with no screen code. A battle is a vocab review with stakes, played on a small
// grid: on its turn a creature may step to another square of its half, then uses a move, and the
// player answers a question from their own word list for it. A right answer lands the move, a wrong
// one misses. Who acts next is decided by a timeline: faster creatures act more often, charges wind
// up and can be cut short, and some moves push the other creature's turn back.
// In "Last 100 words" battles every creature fights at the same level, whatever its age, so a
// beginner's three creatures can beat a veteran's twelve. In "Unlimited" battles a creature's
// numbers grow with how many words its owner knows (knownScale).

import { BASE_STATS, MOVES, TERRAIN, aimOf, matchup, moveById } from "./data.js";
import { describe, newGenome, rng, stageOf } from "./genome.js";
import { retention, wildBonus, weekNumber, raidDamage, dayKey, showcaseOf } from "./rules.js";

export const FAST_MS = 5000;       // answer correctly within this and the combo chain grows
export const QUESTION_MS = 12000;  // after this the question counts as missed
export const COMBO = [1, 1.2, 1.5, 2]; // the chain's multiplier on the next move; the last step is a "surge"
export const TEAM_SIZE = 3;
// The two kinds of battle by the words they ask: the 100 most recent words (the same for everyone),
// or every word saved in the language, with creatures as strong as how many words are known.
export const WORD_MODES = ["last100", "unlimited"];
/** How much stronger creatures are in an Unlimited battle, by words known: x1 at none, x1.25 at
 * 100, x1.5 at 300, x1.75 at 700, and never more than x2. */
export const knownScale = (known) => Math.min(2, 1 + 0.25 * Math.log2(1 + Math.max(0, Number(known) || 0) / 100));

const RANK = ["egg", "hatchling", "juvenile"];
const reached = (g, stage) => RANK.indexOf(stageOf(g.growth).id) >= RANK.indexOf(stage);

/** Every move a creature could take into battle. More study means a longer list, not bigger numbers. */
export function knownMoves(state, g) {
  const species = describe(g).species;
  return MOVES.filter((m) => {
    if (m.from === "all") return true;
    if (m.price) return (state.attacks || []).includes(m.id); // bought in the shop, for every creature
    if (m.tag) return state.tags.includes(m.tag);
    if (m.stage && !reached(g, m.stage)) return false;
    if (m.species) return m.species === species;
    return m.element === g.type;
  });
}

/** The (up to four) moves a creature fights with: its owner's picks, topped up with its strongest. */
export function loadout(state, g, rule = null) {
  let known = knownMoves(state, g);
  if (rule && rule.id === "no_heal") known = known.filter((m) => m.kind !== "heal");
  if (rule && rule.id === "basic") known = known.filter((m) => !m.price);
  const picked = (g.moves || []).map((id) => known.find((m) => m.id === id)).filter(Boolean).slice(0, 4);
  const rest = known.filter((m) => !picked.includes(m)).sort((a, b) => (b.kind === "attack") - (a.kind === "attack") || b.power - a.power);
  while (picked.length < 4 && rest.length) picked.push(rest.shift());
  if (!picked.some((m) => m.kind === "attack")) picked[picked.length - 1] = MOVES[0];
  return picked.map((m) => m.id);
}

/** A friend's published moves, checked: only real moves, at most four, at least one attack. */
function checkedMoves(ids, rule) {
  let moves = ids.map((id) => MOVES.find((m) => m.id === id)).filter(Boolean).slice(0, 4);
  if (rule && rule.id === "no_heal") moves = moves.filter((m) => m.kind !== "heal");
  if (rule && rule.id === "basic") moves = moves.filter((m) => !m.price);
  if (!moves.some((m) => m.kind === "attack")) moves.push(MOVES[0]);
  return moves.map((m) => m.id);
}

/** Whether a creature (the player's or a friend's) may fight under a rule. */
export function fits(g, rule) {
  if (!g || !Number.isFinite(g.seed) || stageOf(g.growth || 0).id === "egg") return false;
  return !(rule && rule.types && !rule.types.includes(g.type));
}

/** What a player shares with friends: the team they may challenge (with its chosen moves), how
 * accurately the player answers their own words, and this week's numbers. No words are shared. */
export function publicProfile(state, rule, now = new Date()) {
  const team = eligible(state, rule).slice(0, teamSize(rule)).map((i) => {
    const g = state.roster[i];
    return { seed: g.seed, type: g.type, growth: Math.round(g.growth * 1000) / 1000,
             variant: g.variant || null, partnerHue: g.partnerHue, name: (g.name || "").slice(0, 20), equipped: g.equipped || {},
             loadout: loadout(state, g, rule), known: Math.max(0, Math.round(state.known || 0)) };
  });
  const form = retention(state);
  const fav = showcaseOf(state);
  return { team, form: form === null ? 0.7 : Math.round(form * 100) / 100, rating: state.rating, league: state.league,
           week: weekNumber(now), goal_days: state.goalWeek.n === weekNumber(now) ? state.goalWeek.days : 0, reviews: raidDamage(state, now),
           // The small bar next to my name in a friend's list: today's XP and my favourite creature.
           xp_day: dayKey(now), xp_today: state.day.key === dayKey(now) ? Math.max(0, Math.round(state.day.xp || 0)) : 0,
           showcase: fav ? { seed: fav.seed, type: fav.type, growth: Math.round(fav.growth * 1000) / 1000,
                             variant: fav.variant || null, partnerHue: fav.partnerHue, show: fav.show || null,
                             name: (fav.name || "").slice(0, 20) } : null };
}

/** A friend's XP for "today". Days start at each player's own midnight, so a number counts while
 * it is dated today, or dated a day either side and updated within the last 18 hours. */
export function xpToday(profile, now = new Date()) {
  if (!profile || !profile.xp_day || !Number.isFinite(profile.xp_today)) return 0;
  if (profile.xp_day === dayKey(now)) return profile.xp_today;
  const near = [-1, 1].some((d) => dayKey(new Date(now.getTime() + d * 86400000)) === profile.xp_day);
  const fresh = profile.updated_at && now.getTime() - new Date(profile.updated_at).getTime() < 18 * 3600000;
  return near && fresh ? profile.xp_today : 0;
}

/** A friend's showcased creature, checked before it is drawn (it came from another device). */
export function showcaseGenome(profile) {
  const g = profile && profile.showcase;
  if (!g || typeof g !== "object" || !Number.isFinite(g.seed) || !Number.isFinite(g.growth)) return null;
  if (stageOf(g.growth).id === "egg") return null;
  const made = newGenome(g.seed);
  if (typeof g.type === "string") made.type = g.type;
  made.growth = Math.max(0, Math.min(1, g.growth));
  for (const k of ["variant", "show"]) made[k] = typeof g[k] === "string" ? g[k] : null;
  if (made.show === "adult") made.show = null; // from a device on an older version
  if (Number.isFinite(g.partnerHue)) made.partnerHue = g.partnerHue;
  made.name = typeof g.name === "string" ? g.name.slice(0, 20) : "";
  return made;
}

/** A creature ready to fight. `wild` adds the small edge its age gives against wild creatures only;
 * `scale` multiplies its health, attack and defence (an Unlimited battle: see knownScale). */
export function fighter(state, g, { wild = false, rule = null, scale = 1 } = {}) {
  const look = describe(g);
  const base = BASE_STATS[look.species];
  const k = (wild ? wildBonus(g) : 1) * (Number.isFinite(scale) && scale > 0 ? Math.min(2, scale) : 1);
  const hp = Math.round(base.hp * k);
  return { name: g.name || "", look, type: g.type, max: hp, hp, atk: base.atk * k, def: base.def * k, spd: base.spd,
           moves: Array.isArray(g.loadout) ? checkedMoves(g.loadout, rule) : loadout(state, g, rule), boost: 0, guard: 0, haste: 0, heals: 2,
           pos: { c: 0, r: 0 }, next: 0, charging: null };
}

/** Which of the owner's creatures may fight under this week's rule (indexes into the roster). */
export function eligible(state, rule = null) {
  const out = [];
  state.roster.forEach((g, i) => {
    if (stageOf(g.growth).id === "egg") return;
    if (rule && rule.types && !rule.types.includes(g.type)) return;
    out.push(i);
  });
  // The creature in the habitat leads.
  return out.sort((a, b) => (b === state.active) - (a === state.active));
}

export const teamSize = (rule) => (rule && rule.team) || TEAM_SIZE;

function grown(seed, growth) {
  const g = newGenome(seed);
  g.growth = growth;
  return g;
}

/** Wild creatures to fight: as many as the player brings, of mixed ages. */
export function wildTeam(rand, size) {
  return Array.from({ length: size }, () => grown((rand() * 2 ** 32) >>> 0, 0.08 + rand() * 0.9));
}

/** This week's rental creatures: the same six for everyone, so a duel with them is as level as
 * it gets. Returns genomes (fully grown juveniles with fixed movesets). */
export function rentalPool(week) {
  const r = rng((week * 2654435761) >>> 0);
  return Array.from({ length: 6 }, () => grown((r() * 2 ** 32) >>> 0, 0.9));
}

const NO_TAGS = { tags: [] };
export const fighters = (state, genomes, opts) => genomes.map((g) => fighter(state || NO_TAGS, g, opts));

// ---------- the battlefield ----------
// A grid COLS x ROWS: columns 0-2 are the player's half, 3-5 the other side's. Each creature moves
// only in its own half, up to MOVE_RANGE squares (counted along rows and columns) before it acts.
export const COLS = 6;
export const ROWS = 3;
export const MOVE_RANGE = 2;
const HALF = COLS / 2;
const START = { me: { c: 1, r: 1 }, foe: { c: 4, r: 1 } };
// Time on the timeline. A creature's turn comes every WAIT / (speed + SPEED_DAMP): faster creatures
// act more often, but the damping keeps the fastest body plan from simply acting twice as often.
const WAIT = 1000;
const SPEED_DAMP = 20;
const TERRAIN_KINDS = Object.keys(TERRAIN);

export const tileAt = (b, c, r) => b.tiles[r * COLS + c] || null;
export const other = (side) => (side === "me" ? "foe" : "me");
export const current = (b, side) => (side === "me" ? b.mine[b.me] : b.theirs[b.foe]);
const ownCols = (side) => (side === "me" ? [0, 1, 2] : [3, 4, 5]);
const same = (p, q) => p.c === q.c && p.r === q.r;

/** A few squares with something on them: the same on both sides, mirrored, so neither starts better off. */
export function layTerrain(rand, count = 2) {
  const tiles = Array(COLS * ROWS).fill(null);
  const spots = [];
  for (let c = 0; c < HALF; c++) for (let r = 0; r < ROWS; r++) if (!same({ c, r }, START.me)) spots.push({ c, r });
  for (let i = 0; i < count && spots.length; i++) {
    const { c, r } = spots.splice(Math.floor(rand() * spots.length), 1)[0];
    const kind = TERRAIN_KINDS[Math.floor(rand() * TERRAIN_KINDS.length)];
    tiles[r * COLS + c] = kind;
    tiles[r * COLS + (COLS - 1 - c)] = kind;
  }
  return tiles;
}

/** How long a creature waits between turns right now (puddles slow it, Haste speeds it up). */
export function turnLength(b, f) {
  let spd = f.spd;
  if (f.haste > 0) spd *= 1.35;
  if (tileAt(b, f.pos.c, f.pos.r) === "puddle") spd *= 0.7;
  return WAIT / (spd + SPEED_DAMP);
}

/** Whose turn it is: the creature whose time on the timeline comes first. */
export function whoseTurn(b) {
  const me = current(b, "me");
  const foe = current(b, "foe");
  if (me.next !== foe.next) return me.next < foe.next ? "me" : "foe";
  return me.spd >= foe.spd ? "me" : "foe";
}

/** The next few turns, for the timeline at the top of the screen: [{side, at, charging}], `at`
 * counted from now. Assumes plain moves from here on. */
export function timeline(b, count = 6) {
  const t = { me: current(b, "me").next, foe: current(b, "foe").next };
  const out = [];
  for (let i = 0; i < count; i++) {
    const side = t.me !== t.foe ? (t.me < t.foe ? "me" : "foe") : current(b, "me").spd >= current(b, "foe").spd ? "me" : "foe";
    const f = current(b, side);
    const first = out.every((o) => o.side !== side);
    out.push({ side, at: Math.max(0, t[side] - b.now), charging: first && f.charging ? f.charging.move : null });
    t[side] += turnLength(b, f);
  }
  return out;
}

/** The squares a creature may stand on this turn (its own half, up to MOVE_RANGE steps away). */
export function reachable(b, side) {
  const { pos } = current(b, side);
  const out = [];
  for (const c of ownCols(side)) for (let r = 0; r < ROWS; r++) if (Math.abs(c - pos.c) + Math.abs(r - pos.r) <= MOVE_RANGE) out.push({ c, r });
  return out;
}

/** Step to a square before acting (once a turn). Returns the event, or null if it isn't allowed. */
export function moveTo(b, side, to) {
  if (b.over || b.moved || whoseTurn(b) !== side || current(b, side).charging) return null;
  const f = current(b, side);
  if (!reachable(b, side).some((p) => same(p, to)) || same(f.pos, to)) return null;
  const from = f.pos;
  f.pos = { c: to.c, r: to.r };
  b.moved = true;
  return { side, kind: "step", from, to: f.pos };
}

/** The squares a move lands on, aimed from where the attacker stands (or from `from`). */
export function area(b, side, moveId, from = current(b, side).pos) {
  const m = moveById(moveId);
  const theirs = ownCols(other(side));
  const rows = (r) => [r - 1, r, r + 1].filter((x) => x >= 0 && x < ROWS);
  const aim = aimOf(m);
  if (aim === "line") return theirs.map((c) => ({ c, r: from.r }));
  if (aim === "column") return [0, 1, 2].map((r) => ({ c: COLS - 1 - from.c, r }));
  if (aim === "burst") {
    const front = side === "me" ? [HALF, HALF + 1] : [HALF - 1, HALF - 2];
    return front.flatMap((c) => rows(from.r).map((r) => ({ c, r })));
  }
  if (aim === "homing") return [{ ...current(b, other(side)).pos }];
  return [{ ...from }];
}

/** Whether a move would reach the other creature where it stands now. */
export function wouldHit(b, side, moveId) {
  if (moveById(moveId).kind !== "attack") return true;
  const target = current(b, other(side)).pos;
  return area(b, side, moveId).some((p) => same(p, target));
}

/**
 * Start a battle.
 *   mine / theirs  arrays of fighters (see fighter())
 *   mode           "wild" | "rental" | "friend"
 *   foeForm        how often the other side answers its own questions right (0..1)
 *   tiles          the battlefield's squares (layTerrain() when not given)
 */
export function newBattle({ mine, theirs, mode = "wild", foeForm = 0.7, rule = null, rand = Math.random, rival = null, tiles = null }) {
  const b = { mode, rule, rival, mine, theirs, me: 0, foe: 0, combo: 0, foeCombo: 0, turn: 0, over: false, won: null, brink: false,
              answers: { right: 0, wrong: 0, fast: 0 }, foeForm: Math.max(0.35, Math.min(0.95, foeForm)), rand, now: 0, moved: false,
              tiles: tiles || layTerrain(rand) };
  enter(b, "me");
  enter(b, "foe");
  return b;
}

function enter(b, side) {
  const f = current(b, side);
  f.pos = { ...START[side] };
  f.charging = null;
  f.next = b.now + turnLength(b, f) * 0.5;
}

const QUALITY = { right: 1, fast: 1.1 };

/** Damage, with the squares' effects: grass covers the defender; high ground (and hot coals, for Ember) lift the attacker. */
function damage(b, a, d, m, power) {
  const element = m.own ? a.type : m.element || null;
  const mult = matchup(element, d.type);
  const sameType = element && element === a.type ? 1.1 : 1;
  const at = tileAt(b, a.pos.c, a.pos.r);
  const lift = at === "high" ? 1.2 : at === "coals" && a.type === "ember" ? 1.15 : 1;
  const cover = tileAt(b, d.pos.c, d.pos.r) === "grass" ? 1.25 : 1;
  const dmg = m.power * 0.32 * ((a.atk * (a.boost > 0 ? a.boostMult || 1.3 : 1) * lift) / (d.def * cover)) * mult * sameType * power * (0.92 + b.rand() * 0.16);
  return { dmg, mult, element: element || "plain" };
}

/** Carry out a move that has landed (or a charge being released, at the squares it aimed at). */
function resolve(b, side, m, power, events, aimed = null) {
  const a = current(b, side);
  const d = current(b, other(side));
  const ev = { side, kind: m.kind, style: m.style, move: m.id, name: m.name };
  events.push(ev);
  if (m.kind === "attack") {
    const tiles = aimed || area(b, side, m.id);
    if (!tiles.some((p) => same(p, d.pos))) { ev.kind = "dodge"; ev.tiles = tiles; return ""; }
    const hit = damage(b, a, d, m, power);
    let dmg = hit.dmg;
    if (d.guard > 0) { dmg *= 1 - d.guard; ev.guarded = true; d.guard = 0; }
    dmg = Math.max(1, Math.round(dmg));
    d.hp = Math.max(0, d.hp - dmg);
    Object.assign(ev, { dmg, mult: hit.mult, element: hit.element, hp: d.hp, at: { ...d.pos } });
    if (a.boost > 0) a.boost--;
    if (m.style === "interrupt" && d.charging) { ev.interrupted = d.charging.move; d.charging = null; d.next = b.now; }
    if (m.delay && d.hp > 0) { d.next += m.delay * turnLength(b, d); ev.delayed = true; }
    return d.hp <= 0 ? faint(b, side, events) : "";
  }
  if (m.kind === "guard") a.guard = Math.min(0.75, (m.power / 100) * power);
  else if (m.kind === "boost") {
    if (m.buff === "spd") a.haste = 3;
    else { a.boost = 3; a.boostMult = 1 + m.power / 100; }
  } else if (m.kind === "heal") {
    if (a.heals <= 0) ev.failed = true;
    else {
      a.heals--;
      const amount = Math.round(a.max * (m.power / 100) * power);
      a.hp = Math.min(a.max, a.hp + amount);
      Object.assign(ev, { heal: amount, hp: a.hp });
    }
  } else if (m.kind === "terrain") {
    ev.tiles = area(b, side, m.id);
    for (const p of ev.tiles) b.tiles[p.r * COLS + p.c] = m.terrain;
    ev.terrain = m.terrain;
  }
  return "";
}

/** `side` has just knocked the other side's creature out: the next one steps in, or the battle ends. */
function faint(b, side, events) {
  const key = other(side);
  events.push({ side: key, kind: "faint" });
  const team = key === "me" ? b.mine : b.theirs;
  if (b[key] + 1 < team.length) {
    b[key]++;
    enter(b, key);
    events.push({ side: key, kind: "enter", index: b[key], at: { ...current(b, key).pos } });
    return "switched";
  }
  b.over = true;
  b.won = side === "me";
  events.push({ kind: "end", won: b.won });
  return "over";
}

/** The end of a creature's turn: its next turn is booked, and the square it stands on has its say. */
function endTurn(b, side, m, events) {
  const f = current(b, side);
  f.next = b.now + turnLength(b, f) * ((m && m.wait) || 1);
  if (f.haste > 0) f.haste--;
  const t = tileAt(b, f.pos.c, f.pos.r);
  if (t === "spring" && f.hp < f.max) {
    const amount = Math.max(1, Math.round(f.max * 0.06));
    f.hp = Math.min(f.max, f.hp + amount);
    events.push({ side, kind: "terrain", terrain: t, heal: amount, hp: f.hp });
  } else if (t === "coals" && f.type !== "ember") {
    const amount = Math.max(1, Math.round(f.max * 0.05));
    f.hp = Math.max(0, f.hp - amount);
    events.push({ side, kind: "terrain", terrain: t, dmg: amount, hp: f.hp });
    if (f.hp <= 0) return faint(b, other(side), events);
  }
  return "";
}

/** One side uses a move, answered well or not. A wrong answer means the move misses. */
function perform(b, side, moveId, quality, power, events) {
  const a = current(b, side);
  const m = moveById(moveId);
  if (quality === "wrong") {
    events.push({ side, kind: "miss", move: m.id, name: m.name });
    return endTurn(b, side, m, events);
  }
  if (m.style === "charge") { // it winds up now, aimed where it stands, and lands when its time comes
    a.charging = { move: m.id, power, tiles: area(b, side, m.id) };
    a.next = b.now + turnLength(b, a) * (m.cast || 1);
    events.push({ side, kind: "charge", move: m.id, name: m.name, tiles: a.charging.tiles });
    return "";
  }
  return resolve(b, side, m, power, events) || endTurn(b, side, m, events);
}

/** A wound-up charge lands (or misses, if its target moved out of the way). */
function release(b, side, events) {
  const a = current(b, side);
  const { move, power, tiles } = a.charging;
  a.charging = null;
  const m = moveById(move);
  return resolve(b, side, m, power, events, tiles) || endTurn(b, side, m, events);
}

/** How the other side plays its turn: pick a move, find a good square for it, then answer. */
function foeTurn(b, events) {
  const f = current(b, "foe");
  const me = current(b, "me");
  const moves = f.moves.map(moveById);
  let m = null;
  const heal = moves.find((x) => x.kind === "heal");
  const interrupt = moves.find((x) => x.style === "interrupt");
  if (me.charging && interrupt && b.rand() < 0.7) m = interrupt;
  else if (heal && f.heals > 0 && f.hp < f.max * 0.35 && b.rand() < 0.5) m = heal;
  else if (b.rand() < 0.15) {
    const others = moves.filter((x) => x.kind === "guard" || x.kind === "terrain" || (x.kind === "boost" && !f.boost && !f.haste));
    if (others.length) m = others[Math.floor(b.rand() * others.length)];
  }
  if (!m) {
    const attacks = moves.filter((x) => x.kind === "attack").sort((x, y) =>
      y.power * matchup(y.own ? f.type : y.element, me.type) - x.power * matchup(x.own ? f.type : x.element, me.type));
    m = b.rand() < 0.7 ? attacks[0] : attacks[Math.floor(b.rand() * attacks.length)];
  }
  // Where to stand: somewhere the move reaches, on a helpful square, out of the way of a charge aimed at it.
  const scoreOf = (p) => {
    let s = same(p, f.pos) ? 0.1 : 0;
    if (m.kind === "attack" && area(b, "foe", m.id, p).some((q) => same(q, me.pos))) s += 3;
    const t = tileAt(b, p.c, p.r);
    s += { high: m.kind === "attack" ? 1 : 0.2, grass: 0.8, spring: f.hp < f.max * 0.7 ? 1.2 : 0.3, puddle: -0.8,
           coals: f.type === "ember" ? 0.6 : -1.5 }[t] || 0;
    if (me.charging && me.charging.tiles.some((q) => same(q, p))) s -= 5;
    if (p.r !== me.pos.r) s += 0.3;
    return s + b.rand() * 0.2;
  };
  const best = reachable(b, "foe").map((p) => [p, scoreOf(p)]).sort((x, y) => y[1] - x[1])[0][0];
  if (!same(best, f.pos)) { events.push({ side: "foe", kind: "step", from: f.pos, to: { ...best } }); f.pos = { ...best }; }
  // It answers its own words, as well as its owner usually does.
  const right = b.rand() < b.foeForm;
  const fast = right && b.rand() < 0.4;
  const power = right ? (fast ? QUALITY.fast : 1) * COMBO[Math.min(b.foeCombo, COMBO.length - 1)] : 0;
  b.foeCombo = fast ? Math.min(COMBO.length - 1, b.foeCombo + 1) : 0;
  return perform(b, "foe", m.id, right ? (fast ? "fast" : "right") : "wrong", power, events);
}

/** Run the timeline until the player has to choose something (or the battle ends). */
function advance(b, events) {
  for (let n = 0; n < 200 && !b.over; n++) {
    const side = whoseTurn(b);
    const f = current(b, side);
    b.now = Math.max(b.now, f.next);
    if (f.charging) { release(b, side, events); continue; }
    if (side === "me") { b.moved = false; return events; }
    foeTurn(b, events);
  }
  return events;
}

/** Begin: if the other side is faster, it acts first. Returns the events to show. */
export const start = (b) => advance(b, []);

/**
 * The player's turn: the move they chose and how they answered ("wrong" | "right" | "fast"), then
 * the timeline runs on until it is their turn again. Returns the list of things that happened, for
 * the screen to show: {side, kind, move, dmg, mult, hp, ...}.
 */
export function act(b, moveId, quality) {
  if (b.over || whoseTurn(b) !== "me" || current(b, "me").charging) return [];
  const events = [];
  b.turn++;
  b.answers[quality]++;
  if (quality === "fast") b.answers.right++;
  // The chain built by earlier fast answers multiplies this move; then this answer extends or ends it.
  const power = quality === "wrong" ? 0 : QUALITY[quality] * COMBO[Math.min(b.combo, COMBO.length - 1)];
  const surged = quality !== "wrong" && b.combo >= COMBO.length - 1;
  b.combo = quality === "fast" ? Math.min(COMBO.length - 1, b.combo + 1) : 0;
  perform(b, "me", moveId, quality, power, events);
  if (events[0]) Object.assign(events[0], { quality, surged, power });
  advance(b, events);
  const mine = current(b, "me");
  if (!b.over && b.me === b.mine.length - 1 && mine.hp <= mine.max * 0.15) b.brink = true;
  return events;
}

/** Drink a potion: half the current creature's health back, once a battle, and only against wild
 * creatures (battles between people stay a level field). Returns the health restored, or 0. */
export function usePotion(b) {
  if (b.over || b.mode !== "wild" || b.potionUsed) return 0;
  const f = b.mine[b.me];
  const amount = Math.min(f.max - f.hp, Math.round(f.max / 2));
  if (amount <= 0) return 0;
  f.hp += amount;
  b.potionUsed = true;
  return amount;
}

/** What rules.finishBattle needs to know once a battle is over. */
export function battleResult(b) {
  const asked = b.answers.right + b.answers.wrong;
  return { mode: b.mode, won: !!b.won, flawless: !!b.won && b.answers.wrong === 0 && asked >= 3, comeback: !!b.won && b.brink, rival: b.rival };
}
