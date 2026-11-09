// The Battle screen and its Friends side, with no screen code (battle-ui.js, gyms-ui.js and friends-game.js draw
// them): whether battles are open yet, the team that fights, what each choice of words means, the gym leaders as a
// path, choosing a rental team, the friends' league in order and the guild raid's boss. Pure, so
// tests/js/battlescreen.test.mjs can check it.

import { BATTLE_UNLOCK_WORDS, RAID_HP_PER_MEMBER } from "./data.js";
import { WORD_MODES, eligible, teamSize } from "./battle.js";
import { GYM_COUNT, LEADERS, gymProgress, gymStatus, leaderElement } from "./gyms.js";
import { LAST_WORDS, MIN_SET, leaguePercent, raidDamage, weekNumber } from "./rules.js";
import { raidShare } from "./remote.js";

/** How many creatures a rental duel's team has (of the week's six). */
export const RENTAL_PICK = 3;

/**
 * What keeps battles closed, or null once they are open: {id, have, need}.
 *   "words"     fewer saved words than battles need (have: saved, need: BATTLE_UNLOCK_WORDS)
 *   "meanings"  no saved word has a meaning to ask about (have: with a meaning, need: saved)
 *   "egg"       no creature has hatched yet
 * `words`: words saved; `meanings`: how many of them have a meaning; `canAsk`: a question can be made from them
 * (rules.pickQuestion); `hatched`: creatures out of the egg.
 */
export function battleGate({ words = 0, meanings = 0, canAsk = meanings > 0, hatched = 0 } = {}) {
  if (words < BATTLE_UNLOCK_WORDS) return { id: "words", have: Math.max(0, words), need: BATTLE_UNLOCK_WORDS };
  if (!canAsk) return { id: "meanings", have: Math.max(0, meanings), need: words };
  if (!hatched) return { id: "egg", have: 0, need: 1 };
  return null;
}

/** The creatures that fight for you (roster indexes): the first hatched ones, as many as a team holds (this week's
 * rule, in friend battles, may leave some out or make the team smaller). */
export const teamOf = (state, rule = null) => eligible(state, rule).slice(0, teamSize(rule));

/** The team as the screen shows it: a place for each member of a full team, `null` where there is no one yet. */
export function teamSlots(state) {
  const team = teamOf(state);
  return Array.from({ length: teamSize(null) }, (_, k) => (k < team.length ? team[k] : null));
}

/** What a choice of words means: {mode, questions, all, strength, set, short}. `questions`: how many words can be
 * asked (the newest LAST_WORDS, every one with a meaning, or those due for review or in the folder: `setSize`);
 * `strength`: how strong your creatures fight (1 = the same as everyone; an all-time battle scales with the cards
 * saved: livebattle.cardScale gives `scale`). `set`: "due" or "folder" for those choices (else null); `short`: it
 * has fewer than MIN_SET words, so battles ask the newest words until it has. */
export function wordChoice(mode, { meanings = 0, scale = 1, setSize = 0 } = {}) {
  const m = WORD_MODES.includes(mode) ? mode : "last100";
  const all = m === "unlimited";
  const set = m === "due" || m === "folder" ? m : null;
  const n = Math.max(0, Math.floor(Number(meanings) || 0));
  const size = Math.max(0, Math.floor(Number(setSize) || 0));
  const short = !!set && size < MIN_SET;
  return { mode: m, all, questions: all ? n : set && !short ? size : Math.min(LAST_WORDS, n),
    strength: all ? Math.round(Math.max(1, Number(scale) || 1) * 100) / 100 : 1, set, short };
}

// ---------- the gym leaders ----------

/** The leaders in order, as a path: [{index, id, name, status, element}], status "beaten" (shown in colour), "open"
 * (the next to beat, highlighted) or "locked". */
export const gymPath = (state) => LEADERS.map((leader, index) => ({
  index, id: leader.id, name: leader.name, status: gymStatus(state, index), element: leaderElement(leader),
}));

/** The leader to beat next (its index), or -1 once all of them are beaten. */
export function nextGym(state) {
  const { beaten } = gymProgress(state);
  return beaten < GYM_COUNT ? beaten : -1;
}

/** One leader's entry: {status, number, of, creatures, seconds, reward, wins, after, canFight}. `reward` is the first
 * win's {coins, xp} until it is beaten; `wins` the wins against it once it is (at least 1); `after` the leader to beat
 * first (a locked gym). */
export function gymEntry(state, index) {
  const leader = LEADERS[index];
  const status = gymStatus(state, index);
  const beaten = status === "beaten";
  return {
    status, number: index + 1, of: GYM_COUNT, creatures: leader.team.length, seconds: leader.quiz,
    reward: beaten ? null : { ...leader.reward },
    wins: beaten ? Math.max(1, Math.floor(Number(gymProgress(state).wins[leader.id]) || 0)) : 0,
    after: index > 0 ? LEADERS[index - 1].name : null, canFight: status !== "locked",
  };
}

// ---------- a rental duel: choosing three ----------

/** Choose or put back the rental creature `i` (a copy of `chosen` is returned); never more than RENTAL_PICK. */
export function toggleRental(chosen, i, pick = RENTAL_PICK) {
  const next = new Set(chosen);
  if (next.has(i)) next.delete(i);
  else if (next.size < pick) next.add(i);
  return next;
}
/** How many more there are to choose before the duel can start. */
export const rentalLeft = (chosen, pick = RENTAL_PICK) => Math.max(0, pick - chosen.size);

// ---------- the Friends side ----------

/**
 * The friends' league, best first: [{id, name, league, rating, pct, mine, team, profile, user}]. Each row's `pct` is
 * the share of this week's days that player reached their own daily goal (rules.leaguePercent); ties go to the higher
 * skill. `me` = {id}; `people` = Map of id -> {id, username}; `profiles` = Map of id -> a friend's checked game row.
 */
export function leagueRows({ me, game, people, profiles, now = new Date() }) {
  const week = weekNumber(now);
  const rows = [{ id: me.id, name: "You", league: game.league, rating: game.rating,
    pct: leaguePercent(game.goalWeek && game.goalWeek.n === week ? game.goalWeek.days : 0, now), mine: true, team: [], profile: null, user: null }];
  for (const [id, p] of people) {
    const gp = profiles.get(id);
    rows.push({ id, name: p.username, league: gp ? gp.league : 0, rating: gp ? gp.rating : null,
      pct: gp && gp.week === week ? leaguePercent(gp.goal_days, now) : 0, mine: false, team: gp ? gp.team || [] : [], profile: gp || null, user: p });
  }
  return rows.sort((a, b) => b.pct - a.pct || (b.rating || 0) - (a.rating || 0));
}

/**
 * A guild's raid this week: {hp, dealt, left, down, parts: [[name, dealt]] most first}. Everyone's right answers in
 * battles this week wear the boss down; each guild-mate counts for at most twice their share (remote.raidShare).
 * `members` = [{id, username}] (me among them), `profiles` as in leagueRows.
 */
export function raidState({ me, game, members, profiles, now = new Date() }) {
  const week = weekNumber(now);
  const hp = Math.max(1, members.length) * RAID_HP_PER_MEMBER;
  const mine = raidDamage(game, now);
  const parts = [["You", mine]];
  let dealt = mine;
  for (const m of members) {
    if (m.id === me.id) continue;
    const gp = profiles.get(m.id);
    const d = gp && gp.week === week ? raidShare(gp.reviews, RAID_HP_PER_MEMBER) : 0;
    dealt += d;
    parts.push([m.username, d]);
  }
  const left = Math.max(0, hp - dealt);
  return { hp, dealt, left, down: left === 0, parts: parts.sort((a, b) => b[1] - a[1]) };
}
