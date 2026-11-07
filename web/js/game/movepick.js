// Choosing a creature's four battle moves (the Creatures page, movesui.js), as plain rules with no screen code.
// Like a handheld monster game's move list: four slots, and a move is only ever put in or swapped out on purpose.
// A move that doesn't fit is never dropped silently: when all four slots are full the screen asks which one to
// replace. Every creature keeps at least one attacking move.
//
// The four are kept in `g.moves` as move ids (the same list battle.js `loadout` reads and friends receive, checked
// by remote.js): slot 0 is the battle's A button, 1 B, 2 X and 3 Y (livebattle-ui.js PLACES).

import { LIVE_STYLE_TEXT, MOVES, MOVE_STYLES, liveMove } from "./data.js";
import { TERRAIN as GROUND } from "./battlemap.js";

export const SLOTS = 4;
// How the slots are laid out on the card, row by row: the battle screen's X Y over A B, so a move sits where its
// button is in a battle.
export const SLOT_ORDER = [2, 3, 0, 1];
// How much faster a speed power-up makes a creature (livebattle.js HASTE, 1.3; a test keeps the two the same).
export const HASTE_UP = 30;

const find = (id) => MOVES.find((m) => m.id === id) || null;
const attacks = (id) => (find(id) || {}).kind === "attack";

/** The slots as they are now, cleaned: real moves only, each once, at most four. */
export function slotsOf(ids) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) if (find(id) && !out.includes(id) && out.length < SLOTS) out.push(id);
  return out;
}

/** True when the move in slot `at` is the only attacking move of the four (so it can only be swapped for another attack). */
export function onlyAttack(slots, at) {
  return attacks(slots[at]) && slots.filter((id, i) => i !== at && attacks(id)).length === 0;
}

/**
 * Why `id` can't go into slot `at` (or into a free slot, when `at` is null), or "" when it can:
 * "unknown" (no such move), "already" (it is one of the four), "full" (all four are taken: ask which to replace),
 * "attack" (it would leave no attacking move).
 */
export function whyNot(slots, id, at = null) {
  if (!find(id)) return "unknown";
  if (slots.includes(id)) return "already";
  if (at === null || at >= slots.length) return slots.length < SLOTS ? "" : "full";
  return !attacks(id) && onlyAttack(slots, at) ? "attack" : "";
}

/**
 * Put `id` among the four: into slot `at` (replacing the move there), or with `at` null into the first free slot.
 * Returns { slots, problem }: the new four (the old ones, unchanged, when there is a problem) and whyNot's answer.
 */
export function useMove(slots, id, at = null) {
  const now = slotsOf(slots);
  const problem = whyNot(now, id, at);
  if (problem) return { slots: now, problem };
  const next = now.slice();
  if (at === null || at >= next.length) next.push(id);
  else next[at] = id;
  return { slots: next, problem: "" };
}

/** The moves it knows but doesn't use, strongest attacks first (as battle.js tops up a loadout). */
export function benched(known, slots) {
  return known.filter((m) => !slots.includes(m.id))
    .sort((a, b) => (b.kind === "attack") - (a.kind === "attack") || b.power - a.power || a.name.localeCompare(b.name));
}

/**
 * A move's numbers for its details, in English (the screen translates them): its kind, what it does in one number,
 * and how long it waits before it can be used again in a live battle.
 * { kind: "Strike", effect: { label: "Power", value: "55" }, wait: 2.2, text: what the style does }
 */
export function moveFacts(m) {
  const live = liveMove(m);
  let effect;
  if (m.kind === "attack") effect = { label: "Power", value: String(m.power) };
  else if (m.kind === "guard") effect = { label: "Blocks", value: `${Math.min(75, m.power)}%` };
  else if (m.kind === "heal") effect = { label: "Heals", value: `${m.power}%` };
  else if (m.kind === "boost") effect = m.buff === "spd" ? { label: "Speed", value: `+${HASTE_UP}%` } : { label: "Attack", value: `+${m.power}%` };
  else effect = { label: "Ground", value: (GROUND[live.terrain] || {}).name || "", name: true };
  return { kind: MOVE_STYLES[m.style].name, effect, wait: live.cooldown, text: LIVE_STYLE_TEXT[m.style] || MOVE_STYLES[m.style].text };
}

/** The element a move takes in battle: its own, the creature's for a move of "its own element", or null for a plain one. */
export const moveElement = (m, g) => (m.own ? g.type : m.element || null);
