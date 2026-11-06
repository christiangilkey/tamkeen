// What friends send to the game, checked before anything uses it. A friend's game profile (their
// team, league, week numbers, favourite creature), a battle result and a gift all come from
// someone else's device through the online database, which only checks their size. Anyone can
// write their own row by hand, so nothing here trusts it: every creature, name, item, move, type
// and number is kept only when it is one the game itself knows, of a sane length or in a sane
// range; anything else is dropped or replaced. The screens then show only these checked copies,
// and never put a friend's text into HTML (they set textContent).

import { CATALOG, LEAGUES, MOVES, SLOTS, STAGES, TYPES, VARIANTS } from "./data.js";
import { newGenome } from "./genome.js";
import { isLanguage } from "../languages.js";

const own = (table, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** An element the game has (never "__proto__" or a made-up one). */
export const isType = (t) => own(TYPES, t);
/** A move the game has, by id. */
export const isMove = (id) => typeof id === "string" && MOVES.some((m) => m.id === id);

// The most a friend's numbers may be. Generous: a real player never comes near them.
export const LIMITS = {
  team: 3,            // battle.TEAM_SIZE (the database allows no more)
  name: 20,           // a creature's name (battle.publicProfile cuts it there too)
  username: 40,
  rating: [0, 5000],  // battle skill (starts at 1000)
  reviews: 3000,      // right answers in battles in one week
  xpToday: 50000,
  streak: 36500,      // days of flashcards in a row
  known: 100000,      // words known, cards saved
};
// What one guild-mate's answers may take off the raid boss in a week: twice their share. So a real
// player can still carry a quiet friend, but nobody can bring down a whole guild's boss alone by
// writing a big number into their own row.
export const RAID_SHARE_CAP = 2;

/** A whole number in [lo, hi], or `fallback` when it isn't a finite number at all. */
export function clampInt(v, lo, hi, fallback = lo) {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// Characters that never belong in a name: control characters and the ones that flip the direction of
// the text around them (they could make a name look like another, or reverse what follows it).
const UNWANTED = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩﻿]/g;

/** A name to show: a string, without control characters, at most `max` characters long ("" otherwise). */
export function cleanName(v, max = LIMITS.name) {
  if (typeof v !== "string") return "";
  return Array.from(v.slice(0, max * 4).replace(UNWANTED, "")).slice(0, max).join("").trim();
}

/** A date sent as text (an ISO time): kept when it is short and reads as a date. */
function cleanDate(v) {
  return typeof v === "string" && v.length <= 40 && Number.isFinite(new Date(v).getTime()) ? v : null;
}

/** What a creature wears: only real items, each in its own slot. */
function cleanEquipped(v) {
  const out = {};
  if (!isObject(v)) return out;
  for (const slot of Object.keys(SLOTS)) {
    const id = own(v, slot) ? v[slot] : null;
    if (typeof id !== "string") continue;
    const item = CATALOG.find((x) => x.id === id);
    if (item && item.slot === slot) out[slot] = id;
  }
  return out;
}

/**
 * A friend's creature (one of their team, or their favourite), checked: null when it can't be one.
 * Only the fields the game shares are read (battle.publicProfile): seed, type, growth, variant,
 * show, partnerHue, name, equipped, loadout, known and cards.
 */
export function cleanGenome(g) {
  if (!isObject(g) || typeof g.seed !== "number" || !Number.isFinite(g.seed)) return null;
  if (typeof g.growth !== "number" || !Number.isFinite(g.growth)) return null;
  const seed = g.seed >>> 0;
  const out = {
    seed,
    // an element the game doesn't have becomes the one its seed would have given it
    type: isType(g.type) ? g.type : newGenome(seed).type,
    growth: Math.max(0, Math.min(1, g.growth)),
    variant: own(VARIANTS, g.variant) ? g.variant : null,
    show: STAGES.some((s) => s.id !== "egg" && s.id === g.show) ? g.show : null,
    name: cleanName(g.name),
    equipped: cleanEquipped(g.equipped),
  };
  if (typeof g.partnerHue === "number" && Number.isFinite(g.partnerHue)) out.partnerHue = ((Math.round(g.partnerHue) % 360) + 360) % 360;
  // its moves: real ones only, each once, at most four (battle.fighter checks them against the week's rule)
  if (Array.isArray(g.loadout)) out.loadout = [...new Set(g.loadout.slice(0, 16).filter(isMove))].slice(0, 4);
  for (const k of ["known", "cards"]) if (typeof g[k] === "number" && Number.isFinite(g[k])) out[k] = clampInt(g[k], 0, LIMITS.known);
  return out;
}

/** A friend's team: up to three checked creatures. */
export function cleanTeam(team) {
  if (!Array.isArray(team)) return [];
  return team.slice(0, LIMITS.team * 4).map(cleanGenome).filter(Boolean).slice(0, LIMITS.team);
}

/**
 * A friend's shared game profile (a social.gameProfiles row), checked: a new object holding only
 * the fields the game reads, each a known value or a number in range. null when it isn't a row.
 */
export function cleanProfile(row) {
  if (!isObject(row)) return null;
  const out = {
    team: cleanTeam(row.team),
    form: typeof row.form === "number" && Number.isFinite(row.form) ? Math.max(0, Math.min(1, row.form)) : 0.7,
    rating: clampInt(row.rating, LIMITS.rating[0], LIMITS.rating[1], 1000),
    league: clampInt(row.league, 0, LEAGUES.length - 1, 0),
    week: Number.isInteger(row.week) && row.week >= 0 && row.week < 1e6 ? row.week : null,
    goal_days: clampInt(row.goal_days, 0, 7, 0),
    reviews: clampInt(row.reviews, 0, LIMITS.reviews, 0),
    language: isLanguage(row.language) ? row.language : null,
    xp_day: typeof row.xp_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.xp_day) ? row.xp_day : null,
    xp_today: clampInt(row.xp_today, 0, LIMITS.xpToday, 0),
    showcase: cleanGenome(row.showcase),
    updated_at: cleanDate(row.updated_at),
  };
  if (typeof row.user_id === "string" && row.user_id.length <= 64) out.user_id = row.user_id;
  // the flashcard streak, from an app new enough to send it (friend-bar.js shows it only then)
  if ("streak" in row) {
    out.streak = clampInt(row.streak, 0, LIMITS.streak, 0);
    out.streak_until = cleanDate(row.streak_until);
  }
  return out;
}

/** social.gameProfiles' Map(user id -> row), every row checked (rows that aren't rows are left out). */
export function cleanProfiles(map) {
  const out = new Map();
  if (!(map instanceof Map)) return out;
  for (const [id, row] of map) {
    const p = cleanProfile(row);
    if (p && typeof id === "string") out.set(id, p);
  }
  return out;
}

/** Someone who fought my team ({id, name, rating}), checked. */
export function cleanRival(r) {
  const id = isObject(r) && typeof r.id === "string" && r.id.length <= 64 ? r.id : null;
  return { id, name: cleanName(isObject(r) ? r.name : "", LIMITS.username) || "A friend",
           rating: clampInt(isObject(r) ? r.rating : null, LIMITS.rating[0], LIMITS.rating[1], 1000) };
}

/** A guild-mate's right answers this week, as far as the raid boss counts them. */
export const raidShare = (reviews, perMember) => clampInt(reviews, 0, Math.min(LIMITS.reviews, perMember * RAID_SHARE_CAP), 0);
