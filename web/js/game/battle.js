// The battle engine, with no screen code. A battle is a vocab review with stakes: each turn you
// pick a move and answer a question from your own word list, and how well you answer decides how
// hard the move lands. Every creature fights at the same level, whatever its age, so a beginner's
// three creatures can beat a veteran's twelve; what studying adds is choice.

import { BASE_STATS, MOVES, matchup, moveById } from "./data.js";
import { describe, leadingBranch, newGenome, rng, stageOf } from "./genome.js";
import { retention, wildBonus, weekNumber, raidDamage } from "./rules.js";

export const FAST_MS = 5000;       // answer correctly within this and the combo chain grows
export const QUESTION_MS = 12000;  // after this the question counts as missed
export const COMBO = [1, 1.2, 1.5, 2]; // the chain's multiplier on the next move; the last step is a "surge"
export const TEAM_SIZE = 3;
const QUALITY = { wrong: 0.5, right: 1, fast: 1.1 }; // a wrong answer still lands a glancing blow

const reached = (g, stage) => ["egg", "hatchling", "juvenile", "adult"].indexOf(stageOf(g.growth).id) >= ["egg", "hatchling", "juvenile", "adult"].indexOf(stage);

/** Every move a creature could take into battle. More study means a longer list, not bigger numbers. */
export function knownMoves(state, g) {
  const species = describe(g).species;
  return MOVES.filter((m) => {
    if (m.from === "all") return true;
    if (m.tag) return state.tags.includes(m.tag);
    if (m.stage && !reached(g, m.stage)) return false;
    if (m.branch) return (g.branches || []).includes(m.branch);
    if (m.species) return m.species === species;
    return m.element === g.type;
  });
}

/** The (up to four) moves a creature fights with: its owner's picks, topped up with its strongest. */
export function loadout(state, g, rule = null) {
  let known = knownMoves(state, g);
  if (rule && rule.id === "no_heal") known = known.filter((m) => m.kind !== "heal");
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
  if (!moves.some((m) => m.kind === "attack")) moves.push(MOVES[0]);
  return moves.map((m) => m.id);
}

/** Whether a creature (the player's or a friend's) may fight under a rule. */
export function fits(g, rule) {
  if (!g || !Number.isFinite(g.seed) || stageOf(g.growth || 0).id === "egg") return false;
  if (rule && rule.types && !rule.types.includes(g.type)) return false;
  return !(rule && rule.id === "starters" && g.branch);
}

/** What a player shares with friends: the team they may challenge (with its chosen moves), how
 * accurately the player answers their own words, and this week's numbers. No words are shared. */
export function publicProfile(state, rule, now = new Date()) {
  const team = eligible(state, rule).slice(0, teamSize(rule)).map((i) => {
    const g = state.roster[i];
    return { seed: g.seed, type: g.type, growth: Math.round(g.growth * 1000) / 1000, branch: g.branch || null, branches: g.branches || [],
             variant: g.variant || null, partnerHue: g.partnerHue, name: (g.name || "").slice(0, 20), equipped: g.equipped || {},
             loadout: loadout(state, g, rule) };
  });
  const form = retention(state);
  return { team, form: form === null ? 0.7 : Math.round(form * 100) / 100, rating: state.rating, league: state.league,
           week: weekNumber(now), goal_days: state.goalWeek.n === weekNumber(now) ? state.goalWeek.days : 0, reviews: raidDamage(state, now) };
}

/** A creature ready to fight. `wild` adds the small edge its age gives against wild creatures only. */
export function fighter(state, g, { wild = false, rule = null } = {}) {
  const look = describe(g);
  const base = BASE_STATS[look.species];
  const k = wild ? wildBonus(g) : 1;
  const hp = Math.round(base.hp * k);
  return { name: g.name || "", look, type: g.type, max: hp, hp, atk: base.atk * k, def: base.def * k, spd: base.spd,
           moves: Array.isArray(g.loadout) ? checkedMoves(g.loadout, rule) : loadout(state, g, rule), boost: 0, guard: 0, heals: 2 };
}

/** Which of the owner's creatures may fight under this week's rule (indexes into the roster). */
export function eligible(state, rule = null) {
  const out = [];
  state.roster.forEach((g, i) => {
    if (stageOf(g.growth).id === "egg") return;
    if (rule && rule.types && !rule.types.includes(g.type)) return;
    if (rule && rule.id === "starters" && g.branch) return;
    out.push(i);
  });
  // The creature in the habitat leads.
  return out.sort((a, b) => (b === state.active) - (a === state.active));
}

export const teamSize = (rule) => (rule && rule.team) || TEAM_SIZE;

function grown(seed, growth) {
  const g = newGenome(seed);
  g.growth = growth;
  if (growth >= 0.7) { g.branch = leadingBranch(g); g.branches = [g.branch]; }
  return g;
}

/** Wild creatures to fight: as many as the player brings, of mixed ages. */
export function wildTeam(rand, size) {
  return Array.from({ length: size }, () => grown((rand() * 2 ** 32) >>> 0, 0.08 + rand() * 0.9));
}

/** This week's rental creatures: the same six for everyone, so a duel with them is as level as
 * it gets. Returns genomes (adults with fixed movesets). */
export function rentalPool(week) {
  const r = rng((week * 2654435761) >>> 0);
  return Array.from({ length: 6 }, () => grown((r() * 2 ** 32) >>> 0, 0.9));
}

const NO_TAGS = { tags: [] };

/**
 * Start a battle.
 *   mine / theirs  arrays of fighters (see fighter())
 *   mode           "wild" | "rental" | "friend"
 *   foeForm        how often the other side answers its own questions right (0..1)
 */
export function newBattle({ mine, theirs, mode = "wild", foeForm = 0.7, rule = null, rand = Math.random, rival = null }) {
  return { mode, rule, rival, mine, theirs, me: 0, foe: 0, combo: 0, foeCombo: 0, turn: 0, over: false, won: null, brink: false,
           answers: { right: 0, wrong: 0, fast: 0 }, foeForm: Math.max(0.35, Math.min(0.95, foeForm)), rand };
}

export const fighters = (state, genomes, opts) => genomes.map((g) => fighter(state || NO_TAGS, g, opts));

function act(b, side, moveId, power, events) {
  const a = side === "me" ? b.mine[b.me] : b.theirs[b.foe];
  const d = side === "me" ? b.theirs[b.foe] : b.mine[b.me];
  const m = moveById(moveId);
  const ev = { side, kind: m.kind, move: m.id, name: m.name };
  if (m.kind === "attack") {
    const element = m.own ? a.type : m.element || null;
    const mult = matchup(element, d.type);
    const same = element && element === a.type ? 1.1 : 1;
    let dmg = m.power * 0.32 * ((a.atk * (a.boost > 0 ? 1.3 : 1)) / d.def) * mult * same * power * (0.92 + b.rand() * 0.16);
    if (d.guard > 0) { dmg *= 1 - d.guard; ev.guarded = true; d.guard = 0; }
    dmg = Math.max(1, Math.round(dmg));
    d.hp = Math.max(0, d.hp - dmg);
    Object.assign(ev, { dmg, mult, element: element || "plain", hp: d.hp });
    if (a.boost > 0) a.boost--;
  } else if (m.kind === "guard") {
    a.guard = Math.min(0.75, (m.power / 100) * power);
  } else if (m.kind === "boost") {
    a.boost = power < 1 ? 1 : 3;
  } else if (m.kind === "heal") {
    if (a.heals <= 0) ev.failed = true;
    else {
      a.heals--;
      const amount = Math.round(a.max * (m.power / 100) * power);
      a.hp = Math.min(a.max, a.hp + amount);
      Object.assign(ev, { heal: amount, hp: a.hp });
    }
  }
  events.push(ev);
  if (d.hp <= 0) {
    events.push({ side: side === "me" ? "foe" : "me", kind: "faint" });
    const team = side === "me" ? b.theirs : b.mine;
    const key = side === "me" ? "foe" : "me";
    if (b[key] + 1 < team.length) { b[key]++; events.push({ side: key, kind: "enter", index: b[key] }); return "switched"; }
    b.over = true;
    b.won = side === "me";
    events.push({ kind: "end", won: b.won });
    return "over";
  }
  return "";
}

function foeChoice(b) {
  const f = b.theirs[b.foe];
  const me = b.mine[b.me];
  const moves = f.moves.map(moveById);
  const heal = moves.find((m) => m.kind === "heal");
  if (heal && f.heals > 0 && f.hp < f.max * 0.35 && b.rand() < 0.5) return heal.id;
  const attacks = moves.filter((m) => m.kind === "attack");
  if (b.rand() < 0.15) { const other = moves.filter((m) => m.kind === "guard" || (m.kind === "boost" && f.boost === 0)); if (other.length) return other[Math.floor(b.rand() * other.length)].id; }
  attacks.sort((x, y) => y.power * matchup(y.own ? f.type : y.element, me.type) - x.power * matchup(x.own ? f.type : x.element, me.type));
  return (b.rand() < 0.7 ? attacks[0] : attacks[Math.floor(b.rand() * attacks.length)]).id;
}

/**
 * Play one turn: the player's move with how they answered ("wrong" | "right" | "fast"), then the
 * other side's reply (the faster creature goes first). Returns the list of things that happened,
 * for the screen to animate: {side, kind, move, dmg, mult, hp, ...}.
 */
export function playTurn(b, moveId, quality) {
  if (b.over) return [];
  const events = [];
  b.turn++;
  b.answers[quality]++;
  if (quality === "fast") b.answers.right++;
  // The chain built by earlier fast answers multiplies this move; then this answer extends or ends it.
  const power = QUALITY[quality] * (quality === "wrong" ? 1 : COMBO[Math.min(b.combo, COMBO.length - 1)]);
  const surged = quality !== "wrong" && b.combo >= COMBO.length - 1;
  b.combo = quality === "fast" ? Math.min(COMBO.length - 1, b.combo + 1) : 0;

  // The other side answers its own words, as well as its owner usually does.
  const foeRight = b.rand() < b.foeForm;
  const foeFast = foeRight && b.rand() < 0.4;
  const foePower = foeRight ? (foeFast ? QUALITY.fast : 1) * COMBO[Math.min(b.foeCombo, COMBO.length - 1)] : QUALITY.wrong;
  b.foeCombo = foeFast ? Math.min(COMBO.length - 1, b.foeCombo + 1) : 0;
  const foeMove = foeChoice(b);

  const first = b.mine[b.me].spd >= b.theirs[b.foe].spd ? "me" : "foe";
  for (const side of first === "me" ? ["me", "foe"] : ["foe", "me"]) {
    const before = events.length;
    const outcome = side === "me" ? act(b, "me", moveId, power, events) : act(b, "foe", foeMove, foePower, events);
    if (side === "me") Object.assign(events[before], { quality, surged, power });
    if (outcome) break; // a creature that just came in waits for the next turn
  }
  const mine = b.mine[b.me];
  if (!b.over && b.me === b.mine.length - 1 && mine.hp <= mine.max * 0.15) b.brink = true;
  return events;
}

/** What rules.finishBattle needs to know once a battle is over. */
export function battleResult(b) {
  const asked = b.answers.right + b.answers.wrong;
  return { mode: b.mode, won: !!b.won, flawless: !!b.won && b.answers.wrong === 0 && asked >= 3, comeback: !!b.won && b.brink, rival: b.rival };
}
