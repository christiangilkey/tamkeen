// The live battle engine, with no screen code. One creature from each side runs around a generated
// arena in real time. The ground under a creature's feet changes how fast it runs, how hard it hits
// and how well it defends, and some ground heals or burns. Pressing a move freezes the action for a
// question about one of the player's own words (QUIZ_S seconds to answer): right, the move goes off;
// wrong or out of time, it fails. The rival's moves never ask the player anything: dodge them by
// moving. When a creature faints the next of its team steps in; the battle ends when a side has none.
//
//   const b = newLiveBattle({ mine, theirs, map, mode, wordMode, cards, ask, foeForm, rival, rule, rand });
//   input(b, { move: {x, y} | null, goTo: {x, y} | null, attack: moveId });  // only the keys given change
//   const events = step(b, dt);      // dt in seconds; while b.quiz is open only its timer runs
//   answer(b, choiceIndex | null);   // null = no answer (out of time)
//   spendHint(b);                    // in a question: one of the hint cards picked up on the arena (b.hints)
//   view(b);                         // everything the screen draws
//   battleResult(b);                 // for rules.finishBattle once b.over
//
// World units are pixels (a tile is 16x16). A creature's x, y is the point between its feet.

import { MOVES, liveMove, matchup, moveById } from "./data.js";
import { rng } from "./genome.js";
import { battleWords, pickQuestion } from "./rules.js";
import * as battlemap from "./battlemap.js";

export const TILE = battlemap.TILE;
export const QUIZ_S = 5;            // seconds to answer a question
export const FAST_S = 2;            // answered within this: a fast answer, and the combo chain grows
export const COMBO = [1, 1.15, 1.3, 1.5]; // the chain's multiplier on the next move; the last step is a "surge"
export const SIDES = ["me", "foe"];
// A creature's shapes: FEET touches walls and the ground (small, so it fits through a one-tile gap),
// BODY keeps the two creatures apart, HURT is where attacks hit it (a little above the feet).
export const FEET = { rx: 6, ry: 4 };
export const BODY = { rx: 10, ry: 5 };
export const HURT = { rx: 12, ry: 9, lift: 4 };
export const DAMAGE = 0.6;          // a move's power times this, times attack over defence, is its damage
export const RECOVER_S = 1.5;       // after any move, this long before another can start (any of the four)
export const GRACE_S = 0.8;         // a creature that has just stepped in can't be hit for this long
export const FAINT_S = 0.9;         // a fainted creature's next steps in after this
/** How much of the arena the player sees round their creature (world px; the screen passes its own camera's,
 * which differs by device): the rival only attacks from inside it, so nothing comes at the player from off screen. */
export const SIGHT = { w: 442, h: 356 }; // a 1280 x 800 computer screen
export const ENTER_GAP = 200;       // ...this far from the rival, on its own side (or at its start, if that is nearer)
const GUARD_S = 4, BOOST_S = 10, BOOST_HITS = 3, HASTE_S = 6, HASTE = 1.3, SLOW_S = 1.6, SLOW = 0.55, STUN_S = 0.5;
const GROUND_HEAL = 0.5;            // the ground heals a creature at most this share of its health a battle (no endless stand-offs)
const DELAY_PUSH = 3;               // a delay move's `delay` times this many seconds goes onto every cooldown
const ACCEL = 900;                  // px/s², how quickly a creature reaches its speed (times the ground's grip)
const KNOCK = 90;                   // px/s a hit pushes its target back
const STRIDE = 14;                  // px between footsteps
export const SPIKE_S = 2;           // spikes shoot up every this many seconds (and stay up for half of it)
const AXE_HIT = 0.08;               // a swinging axe takes this share of a creature's health
const AXE_PUSH = 220;               // px/s it throws the creature along its swing
const OPEN_REACH = 30;              // px from a cracked wall's tile centre a creature's feet must be to break it open
// Hint cards (the owner: found while walking round the map, put there at random; every battle starts with none).
// One turns up every so often on open ground the player's creature can walk to; walking over it picks it up, and in
// a question it takes away two wrong answers. They last for this battle only.
export const HINT_FIRST = [5, 10];  // seconds before the first turns up
export const HINT_EVERY = [10, 18]; // seconds between the next ones
export const HINT_MAX = 2;          // never more than this many lying about at once
export const HINT_PICK = 14;        // px from the creature's feet that picks one up
const HINT_CLEAR = 56;              // px a new one keeps from both creatures and from the others
const SHOW_S = 0.25;                // how long a beam or area stays on screen after it lands
const MAX_DT = 1 / 30;              // the simulation runs in steps no longer than this
const MAX_STEP = 0.25;              // and never jumps more than this at once (a hidden tab)
/** Top speed in px/s from the speed stat (16..24 -> 100..120). */
export const speedOf = (spd) => 60 + spd * 2.5;

// ---------- word modes ----------
// "last100": questions from the 100 newest words, and every creature at the same level (the fairest
// fight). "alltime": questions from any saved card, and creatures stronger with how many cards their
// owner has saved (cardScale), but the questions are much harder. ("unlimited" is the old name.)
export const WORD_MODES = ["last100", "alltime"];
export const wordModeOf = (mode) => (mode === "alltime" || mode === "unlimited" ? "alltime" : "last100");
/** The words a battle asks from in this word mode. */
export const wordPool = (vocab, mode) => battleWords(vocab, wordModeOf(mode) === "alltime" ? "unlimited" : "last100");
/** How much stronger creatures are in an all-time battle, by cards saved: x1.25 at 200, x1.5 at 600,
 * x1.75 at 1400, and never more than x2 (3000 cards). */
export const cardScale = (cards) => Math.min(2, 1 + 0.25 * Math.log2(1 + Math.max(0, Number(cards) || 0) / 200));

// ---------- the ground ----------
// The arena comes from battlemap.js (generateMap), and its helpers answer every question about the
// ground: what stands where, what stops a shot, what a tile does to a creature, the way round things.
// A battle can be given other helpers with the same names (`ground`), e.g. for a test.
const DEFAULT_GROUND = battlemap;

// ---------- small helpers ----------
export const other = (side) => (side === "me" ? "foe" : "me");
export const current = (b, side) => (side === "me" ? b.mine[b.me] : b.theirs[b.foe]);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const unit = (dx, dy) => { const d = Math.hypot(dx, dy); return d > 1e-9 ? { x: dx / d, y: dy / d } : { x: 1, y: 0 }; };
const who = (f) => ({ type: f.type, species: f.species });
/** What the ground under (x, y) does to this creature: {id, speed, grip, atk, def, heal, burn, status}. */
function groundAt(b, f, x = f.x, y = f.y) {
  const e = b.ground.effectsAt(b.map, x, y, who(f)) || {};
  const t = b.ground.terrainAt(b.map, x, y);
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const hp = num(e.hp, 0);
  return { id: t ? t.id : null, status: t ? t.status || null : null, speed: num(e.speed, 1), grip: num(e.grip, Number.isFinite(e.slip) ? 1 - e.slip : 1),
           atk: num(e.atk, 1), def: num(e.def, 1), heal: num(e.heal, Math.max(0, hp)), burn: num(e.burn, Math.max(0, -hp)),
           spikes: t ? num(t.spikes, 0) : 0 };
}
/** Whether the creature's feet fit at (x, y). */
function fits(b, f, x, y) {
  const c = who(f), m = b.map, cs = b.ground.canStand;
  return cs(m, x - FEET.rx, y - FEET.ry, c) && cs(m, x + FEET.rx - 0.01, y - FEET.ry, c) && cs(m, x - FEET.rx, y + FEET.ry - 0.01, c) && cs(m, x + FEET.rx - 0.01, y + FEET.ry - 0.01, c);
}
/** Whether a creature could walk straight from one point to another. */
function walkable(b, f, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i <= n; i++) if (!fits(b, f, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
  return true;
}
/** Whether a shot could fly straight from one point to another. */
function clearShot(b, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) if (b.ground.blocksShot(b.map, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
  return true;
}
const inHurt = (f, x, y, pad) => ((x - f.x) / (HURT.rx + pad)) ** 2 + ((y - (f.y - HURT.lift)) / (HURT.ry + pad)) ** 2 <= 1;
const sightOf = (v) => ({ w: Math.max(160, Number(v && v.w) || SIGHT.w), h: Math.max(160, Number(v && v.h) || SIGHT.h) });
/** Whether `p` is well inside the view of a camera centred on `o` (a margin for the creature's own size). */
const inSight = (b, p, o) => Math.abs(p.x - o.x) <= b.sight.w / 2 - 30 && Math.abs(p.y - o.y) <= b.sight.h / 2 - 30;
const touching = (a, c, pad = 0) => ((c.x - a.x) / (2 * BODY.rx + pad)) ** 2 + ((c.y - a.y) / (2 * BODY.ry + pad)) ** 2 <= 1;

// ---------- starting ----------
function liveFighter(f, side, index, scale) {
  const k = Number.isFinite(scale) && scale > 0 ? Math.min(2, scale) : 1;
  const look = f.look || {};
  const max = Math.max(1, Math.round((f.max || f.hp || 100) * k));
  const moves = (Array.isArray(f.moves) ? f.moves : []).filter((id) => MOVES.some((m) => m.id === id)).slice(0, 4);
  return { side, index, name: f.name || "", look, type: f.type, species: look.species || f.species || null, max,
           hp: f.hp < f.max ? Math.max(1, Math.round(f.hp * k)) : max, atk: (f.atk || 20) * k, def: (f.def || 20) * k, spd: f.spd || 20,
           moves: moves.length ? moves : ["tackle"], heals: Number.isFinite(f.heals) ? f.heals : 2,
           x: 0, y: 0, vx: 0, vy: 0, face: side === "me" ? 1 : -1, cd: {}, recover: 0, guard: 0, guardLeft: 0, boost: 0, boostMult: 1, boostLeft: 0,
           haste: 0, slow: 0, stun: 0, grace: 0, charging: null, dash: null, act: null, stride: 0, tick: 0, speed: 0, groundHealed: 0, fainted: false };
}
const newControl = () => ({ move: null, dest: null, path: null, attack: null, stuck: 0, tries: 0, open: null });
const newAi = () => ({ think: 0, replan: 0, dodgeUntil: 0, lastMove: 0 });

/**
 * How the computer plays a side (its "brain"). Each number can be set on its own (gyms.js makes every gym
 * leader sharper than the last); what isn't given follows `skill` (foeForm for the rival), as it always did.
 *   react     seconds between its thoughts (it also dodges only when it thinks)
 *   dodge     chance it gets out of the way of something aimed at it
 *   eager     chance it uses a ready move that reaches
 *   pick      chance it picks its best move rather than any that reaches
 *   types     0..1 how much it weighs the element chart when it picks (0 = only a move's power)
 *   ground    how much it cares about standing on helpful ground (0 = not at all, 1 = as before)
 *   lead      0..1 how far ahead of a moving target it aims (where it will be when the move lands)
 *   interrupt chance it cancels a wind-up with an interrupt move
 *   heal      chance it heals when low
 *   extras    chance a thought goes on a guard, power-up or terrain move
 *   fast      chance a move of the rival's counts as a fast answer (stronger, and its combo grows)
 */
export function brainOf(skill = 0.7, over = null) {
  const k = Math.max(0, Math.min(1, Number(skill) || 0));
  const base = { react: 0.2 + (1 - k) * 0.2, dodge: 0.15 + 0.6 * k, eager: 0.5 + 0.4 * k, pick: 0.7, types: 1, ground: 1, lead: 0,
                 interrupt: 0.8, heal: 0.6, extras: 0.12, fast: 0.4 };
  if (over && typeof over === "object") for (const key of Object.keys(base)) if (Number.isFinite(over[key])) base[key] = over[key];
  return base;
}

/**
 * Start a live battle.
 *   mine, theirs  arrays of fighters, as battle.js's fighters() makes them (unscaled: scale 1)
 *   map           the arena (battlemap.js generateMap); a new one from `rand` when not given
 *   mode          "wild" | "rental" | "friend"
 *   wordMode      "last100" | "alltime" ("unlimited" = alltime)
 *   cards         {me, foe}: cards saved by each owner; in an all-time battle each side's health,
 *                 attack and defence are multiplied by cardScale(cards) (leave foe out for wild foes)
 *   ask(moveId)   a question {uid, prompt, sentence, options, answer, reverse} (rules.pickQuestion), or
 *                 null to let the move go without one. Or give `words` (and `game`) to use pickQuestion.
 *   foeForm       how often the rival's moves come off (its owner's accuracy, 0.35..0.95); also how
 *                 well it dodges
 *   auto          the player's creature is played by the computer too (for tests and trials); its
 *                 moves still open questions. `autoSkill` 0..1 is how well it plays.
 *   brain         how the rival plays, number by number (brainOf); the ones not given follow foeForm
 *   quizSeconds   how long the player has to answer each question (QUIZ_S unless given; 2..10)
 */
export function newLiveBattle({ mine, theirs, map = null, mode = "wild", wordMode = "last100", cards = {}, ask = null, words = null, game = null,
  foeForm = 0.7, rival = null, rule = null, rand = Math.random, ground = DEFAULT_GROUND, auto = false, autoSkill = 0.7, sight = SIGHT,
  brain = null, quizSeconds = QUIZ_S } = {}) {
  const wm = wordModeOf(wordMode);
  const scale = (side) => (wm === "alltime" && cards && cards[side] != null ? cardScale(cards[side]) : 1);
  const arena = map || ground.generateMap((rand() * 2 ** 32) >>> 0);
  const b = {
    mode, rule, rival, wordMode: wm, rand, ground, sight: sightOf(sight), foeForm: Math.max(0.35, Math.min(0.95, Number(foeForm) || 0.7)), autoSkill,
    quizS: Math.max(2, Math.min(10, Number(quizSeconds) || QUIZ_S)),
    map: { ...arena, tiles: arena.tiles.slice(), under: Array.isArray(arena.under) ? arena.under.slice() : arena.under }, // terrain moves repaint the copy
    mine: mine.map((f, i) => liveFighter(f, "me", i, scale("me"))), theirs: theirs.map((f, i) => liveFighter(f, "foe", i, scale("foe"))),
    me: 0, foe: 0, time: 0, over: false, won: null, brink: false, combo: 0, foeCombo: 0, answers: { right: 0, wrong: 0, fast: 0 },
    quiz: null, fx: [], nextId: 1, swap: { me: null, foe: null }, potionUsed: false, asked: [], spikesUp: true,
    hints: 0, pickups: [], nextHint: 0, // hint cards held (this battle only) and lying on the ground
    traps: (arena.hazards || []).filter((h) => h && h.kind === "axe").map((h) => ({ ...h, hit: { me: -9, foe: -9 } })),
    ctl: { me: newControl(), foe: newControl() }, ai: { me: auto ? newAi() : null, foe: newAi() }, ask: null,
  };
  b.brain = { me: brainOf(autoSkill), foe: brainOf(b.foeForm, brain) };
  // Hint cards have dice of their own, so they never change how the fight itself rolls (a seeded battle in a test or a
  // trial plays out as it always did); in a real battle (Math.random) they differ every time, even on a gym's fixed map.
  b.hintRand = rng(rand === Math.random ? (Math.random() * 2 ** 32) >>> 0 : ((Number(arena.seed) || 1) ^ 0x5bd1e995) >>> 0);
  b.nextHint = HINT_FIRST[0] + b.hintRand() * (HINT_FIRST[1] - HINT_FIRST[0]);
  b.width = arena.width || arena.cols * TILE;
  b.height = arena.height || arena.rows * TILE;
  b.starts = arena.starts || { me: { x: 3 * TILE + 8, y: Math.floor(arena.rows / 2) * TILE + 8 }, foe: { x: (arena.cols - 4) * TILE + 8, y: Math.floor(arena.rows / 2) * TILE + 8 } };
  b.ask = ask || (words ? () => {
    const q = pickQuestion(game || { review: {} }, words, rand, new Date(), b.asked);
    if (q) b.asked = [...b.asked.slice(-12), q.uid];
    return q;
  } : null);
  enter(b, "me", true);
  enter(b, "foe", true);
  for (const side of SIDES) current(b, side).grace = 0; // nobody has just stepped in at the start
  return b;
}

/** The nearest spot to (x, y) where the creature fits. */
function nearestFit(b, f, x, y) {
  if (fits(b, f, x, y)) return { x, y };
  for (let r = 4; r < 200; r += 4) for (let a = 0; a < 16; a++) {
    const p = { x: x + Math.cos((a / 16) * 2 * Math.PI) * r, y: y + Math.sin((a / 16) * 2 * Math.PI) * r };
    if (fits(b, f, p.x, p.y)) return p;
  }
  return { x, y };
}

/**
 * Where a creature stepping in after a faint appears: near the fight rather than back at its start,
 * which on a big map can be far away. About ENTER_GAP from the rival, toward its own start, on a tile with
 * room round it that doesn't burn and from where it can walk to the rival (battlemap.safeSpotNear); its start
 * when that is nearer, or when there is no such spot.
 */
function entryPoint(b, f, o, side) {
  const s = b.starts[side];
  if (!o || o.fainted || dist(o, s) <= ENTER_GAP || !b.ground.safeSpotNear) return s;
  const u = unit(s.x - o.x, s.y - o.y);
  const x = Math.max(8, Math.min(b.width - 8, o.x + u.x * ENTER_GAP)), y = Math.max(8, Math.min(b.height - 8, o.y + u.y * ENTER_GAP));
  const p = b.ground.safeSpotNear(b.map, x, y, who(f), { from: { x: o.x, y: o.y } });
  return p && dist(p, o) > ENTER_GAP / 2 ? p : s;
}

function enter(b, side, atStart = false) {
  const f = current(b, side);
  const o = current(b, other(side));
  const at = atStart ? b.starts[side] : entryPoint(b, f, o, side);
  let p = nearestFit(b, f, at.x, at.y);
  if (o && o !== f && !o.fainted && touching(p, o, 4)) p = nearestFit(b, f, p.x + (side === "me" ? -24 : 24), p.y);
  Object.assign(f, { x: p.x, y: p.y, vx: 0, vy: 0, grace: GRACE_S, charging: null, dash: null, act: null });
  f.face = o && o.x < f.x ? -1 : 1;
  b.ctl[side] = newControl();
  if (b.ai[side]) b.ai[side] = newAi();
}

// ---------- the player's controls ----------
/**
 * The player's controls. Only the keys given change anything:
 *   move   {x, y} each -1..1 (a stick or keys): runs that way, and cancels a goTo; null lets go
 *   goTo   {x, y} in world px (a click or a finger): walks there around obstacles; null cancels it
 *   attack a move id: if it is ready, the next step opens its question (b.quiz)
 *   sight  {w, h}: the camera's view in world px, when it changes (a phone turned round)
 */
export function input(b, cmd = {}) {
  const c = b.ctl.me;
  if ("move" in cmd) {
    const m = cmd.move;
    const len = m ? Math.hypot(m.x || 0, m.y || 0) : 0;
    c.move = len > 0.01 ? { x: (m.x || 0) / Math.max(1, len), y: (m.y || 0) / Math.max(1, len) } : null;
    if (c.move) { c.dest = null; c.path = null; c.open = null; }
  }
  if ("goTo" in cmd) {
    c.open = null;
    if (cmd.goTo) { c.move = null; setDest(b, "me", cmd.goTo); } else { c.dest = null; c.path = null; }
  }
  if (cmd.open) {
    // a cracked wall: walk up to it and break it open (on the next steps, when close enough)
    const tiles = crackAt(b, cmd.open.x, cmd.open.y);
    if (tiles) { c.open = { tiles, walking: false }; c.move = null; }
  }
  if (cmd.attack) c.attack = cmd.attack;
  if (cmd.sight) b.sight = sightOf(cmd.sight);
}

function setDest(b, side, to, retry = false) {
  const f = current(b, side);
  const c = b.ctl[side];
  const goal = nearestFit(b, f, Math.max(0, Math.min(b.width, to.x)), Math.max(0, Math.min(b.height, to.y)));
  const path = b.ground.findPath(b.map, { x: f.x, y: f.y }, goal, who(f));
  c.dest = goal;
  c.path = path && path.length ? path : [goal];
  c.stuck = 0;
  c.tries = retry ? (c.tries || 0) + 1 : 0;
}

/** The tiles of the cracked wall at (x, y) world px (or just above it, where its face hangs), all of it (4 ways), or
 * null when there is none there. */
export function crackAt(b, x, y) {
  const m = b.map, T = battlemap.TERRAIN;
  const weak = (i) => i >= 0 && T[m.tiles[i]] && !!T[m.tiles[i]].opens;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || tx >= m.cols || ty < 0 || ty >= m.rows) return null;
  const start = [ty * m.cols + tx, (ty - 1) * m.cols + tx].find((i) => ty >= 0 && weak(i));
  if (start === undefined) return null;
  const seen = new Set([start]), todo = [start];
  while (todo.length) {
    const i = todo.pop(), cx = i % m.cols;
    for (const j of [cx > 0 ? i - 1 : -1, cx < m.cols - 1 ? i + 1 : -1, i - m.cols, i + m.cols]) if (j >= 0 && j < m.tiles.length && weak(j) && !seen.has(j)) { seen.add(j); todo.push(j); }
  }
  return [...seen].sort((a, c) => a - c);
}
const tileMid = (b, i) => ({ x: (i % b.map.cols) * TILE + TILE / 2, y: Math.floor(i / b.map.cols) * TILE + TILE / 2 });
/** The player's creature on its way to a cracked wall: break it open once close enough, else walk to the floor beside it. */
function opening(b, events) {
  const c = b.ctl.me, f = current(b, "me");
  const o = c.open;
  if (!o || f.fainted) { c.open = null; return; }
  const T = battlemap.TERRAIN;
  const tiles = o.tiles.filter((i) => T[b.map.tiles[i]] && T[b.map.tiles[i]].opens);
  if (!tiles.length) { c.open = null; return; }
  const near = Math.min(...tiles.map((i) => dist(f, tileMid(b, i))));
  if (near <= OPEN_REACH) {
    const changed = tiles.map((i) => {
      const to = T[b.map.tiles[i]].opens;
      b.map.tiles[i] = to;
      if (Array.isArray(b.map.under)) b.map.under[i] = null;
      return { c: i % b.map.cols, r: Math.floor(i / b.map.cols), terrain: to };
    });
    b.map.propTiles = b.map.propTiles.slice(); // a new key for the ways-through cache: the map's regions changed
    c.open = null;
    events.push({ kind: "wall-open", side: "me", tiles: changed, x: f.x, y: f.y });
    return;
  }
  if (o.walking && (c.dest || c.move)) return;
  if (o.walking) { c.open = null; return; } // it stopped short (stuck): give up
  // the floor tile beside the crack nearest the creature, that it can stand on
  let best = null;
  for (const i of tiles) for (const j of [i - 1, i + 1, i - b.map.cols, i + b.map.cols]) {
    if (j < 0 || j >= b.map.tiles.length) continue;
    const p = tileMid(b, j);
    if (!fits(b, f, p.x, p.y)) continue;
    const d = dist(f, p);
    if (!best || d < best.d) best = { p, d };
  }
  if (!best) { c.open = null; return; }
  setDest(b, "me", best.p);
  o.walking = true;
}

/** Whether the spikes are up at battle time t (seconds): up for the first half of every SPIKE_S. */
export const spikesUp = (t) => ((t % SPIKE_S) + SPIKE_S) % SPIKE_S < SPIKE_S / 2;
/** The spikes' picture at battle time t: 0 down, 1 rising, 2 up, 3 going down (battle/terrain/spikes_anim.png). */
export function spikeFrame(t) {
  const u = ((t % SPIKE_S) + SPIKE_S) % SPIKE_S;
  return u < 0.12 ? 1 : u < SPIKE_S / 2 - 0.12 ? 2 : u < SPIKE_S / 2 ? 3 : u < SPIKE_S - 0.12 ? 0 : 1;
}
/** A swinging axe's angle at battle time t, in degrees (0 = straight down, + = to the right), and which way it is going. */
export function axeAngle(h, t) {
  const a = (2 * Math.PI * t) / (h.period || 2.5) + (h.phase || 0);
  return { deg: (battlemap.HAZARDS.axe.swing || 60) * Math.sin(a), dir: Math.cos(a) >= 0 ? 1 : -1 };
}

/** Why a move can't be used now ("cooldown", "busy", "stunned", "used up", ...), or null when it can. */
export function whyNot(b, side, moveId) {
  const f = current(b, side);
  if (b.over) return "over";
  if (!f || f.fainted || b.swap[side] != null) return "fainted";
  if (!f.moves.includes(moveId)) return "unknown";
  if (side === "me" && b.quiz) return "busy";
  if (f.stun > 0) return "stunned";
  if (f.charging || f.dash || f.recover > 0) return "busy";
  if (f.cd[moveId] > 0) return "cooldown";
  if (moveById(moveId).kind === "heal" && f.heals <= 0) return "used up";
  return null;
}

/** Whether the move, used now, would reach the rival if it stood still. The same reach as the hit itself (flight()
 * and dashOn()), so the button's "Out of range" and the rival's choice of moves agree with what really lands. */
export function inRange(b, side, moveId) {
  const f = current(b, side), o = current(b, other(side));
  const lm = liveMove(moveById(moveId));
  if (lm.form === "self" || (lm.form === "terrain" && lm.where === "self")) return true;
  const d = dist(f, o);
  return d <= reachOf(lm, d > 0 ? (o.x - f.x) / d : 1, d > 0 ? (o.y - f.y) / d : 0) - 1;
}

/** How far from the user's feet to the rival's feet a move lands, aimed along (ux, uy): the run of the shot, beam,
 * area or dash, plus the part of the rival it has to touch (its hurt shape for a shot or beam, the two bodies for a
 * dash: both wider than tall, so the reach is a little shorter up and down than across). */
export function reachOf(lm, ux, uy) {
  const across = (a, c) => 1 / Math.hypot(ux / a, uy / c); // an ellipse's radius in this direction
  const hurt = (pad) => across(HURT.rx + pad, HURT.ry + pad) + HURT.lift * uy; // its middle sits `lift` above the feet
  switch (lm.form) {
    case "shot": case "homing": return 8 + lm.range + hurt(lm.r || 0); // it starts 8 px out
    case "beam": return lm.range + hurt((lm.width || 0) / 2);
    case "burst": return (lm.reach || 0) + lm.r + 6;
    case "drop": return lm.range + lm.r + 6;
    case "dash": return lm.range + across(2 * BODY.rx + 6, 2 * BODY.ry + 6);
    default: return lm.range || 0;
  }
}

// ---------- the question ----------
function pressAttack(b, moveId, events) {
  const f = current(b, "me");
  const why = whyNot(b, "me", moveId);
  if (why) { events.push({ kind: "refused", side: "me", move: moveId, why, x: f.x, y: f.y }); return false; }
  const q = b.ask ? b.ask(moveId, b) : null;
  if (q && Array.isArray(q.options) && q.options.length) {
    b.quiz = { side: "me", move: moveId, q, timeLeft: b.quizS, total: b.quizS };
    events.push({ kind: "quiz", side: "me", move: moveId, x: f.x, y: f.y });
    return true;
  }
  use(b, "me", moveId, 1, events); // nothing to ask: the move just goes
  return false;
}

/**
 * Answer the open question with the index of a choice (null = no answer: time ran out). A right
 * answer sets the move off (stronger while a chain of fast answers lasts); a wrong one, or none,
 * fails it. Returns the events; the first is {kind: "answer", uid, correct, fast, choice, right}
 * (the screen records the answer for the word with rules.answerQuestion).
 */
export function answer(b, choice) {
  const qz = b.quiz;
  if (!qz) return [];
  b.quiz = null;
  const f = current(b, "me");
  const m = moveById(qz.move);
  const picked = Number.isInteger(choice) && choice >= 0 ? choice : null;
  const correct = picked !== null && picked === qz.q.answer;
  const fast = correct && qz.total - qz.timeLeft <= FAST_S;
  const events = [{ kind: "answer", side: "me", move: m.id, uid: qz.q.uid, correct, fast, choice: picked, right: qz.q.answer, x: f.x, y: f.y }];
  if (correct) b.answers.right++; else b.answers.wrong++;
  if (fast) b.answers.fast++;
  const power = correct ? (fast ? 1.1 : 1) * COMBO[Math.min(b.combo, COMBO.length - 1)] : 0;
  const surged = correct && b.combo >= COMBO.length - 1;
  b.combo = fast ? Math.min(COMBO.length - 1, b.combo + 1) : 0;
  if (correct) use(b, "me", m.id, power, events, { surged });
  else fail(b, f, m, picked === null ? "time" : "wrong", events);
  return events;
}

/** Use a move for either side at once, with no question (tests, demos, replays). Returns the events. */
export function useNow(b, side, moveId, power = 1) {
  const events = [];
  const why = whyNot(b, side, moveId);
  const f = current(b, side);
  if (why) events.push({ kind: "refused", side, move: moveId, why, x: f.x, y: f.y });
  else use(b, side, moveId, power, events);
  return events;
}

/** A move that didn't come off: it still has to cool down. */
function fail(b, f, m, why, events) {
  f.cd[m.id] = liveMove(m).cooldown;
  f.recover = RECOVER_S;
  events.push({ kind: "failed", side: f.side, move: m.id, name: m.name, why, x: f.x, y: f.y });
}

/** The rival uses a move: it comes off as often as its owner answers their own words right. */
function rivalUse(b, side, moveId, events) {
  const f = current(b, side);
  const m = moveById(moveId);
  const right = b.rand() < b.foeForm;
  if (!right) { b.foeCombo = 0; fail(b, f, m, "wrong", events); return; }
  const fast = b.rand() < b.brain[side].fast;
  const power = (fast ? 1.1 : 1) * COMBO[Math.min(b.foeCombo, COMBO.length - 1)];
  b.foeCombo = fast ? Math.min(COMBO.length - 1, b.foeCombo + 1) : 0;
  use(b, side, moveId, power, events);
}

// ---------- moves ----------
/** The creature's attack right now: its stat, a power-up, and what the ground under it adds. */
const attackOf = (b, f) => f.atk * (f.boost > 0 ? f.boostMult : 1) * groundAt(b, f).atk;

function faceToward(f, o) { if (o && Math.abs(o.x - f.x) > 1) f.face = o.x < f.x ? -1 : 1; }

/** Where a move goes, aimed at the rival where it stands now. */
function aimFor(b, f, rival, lm) {
  const o = ahead(b, f, rival, lm);
  const d = unit(o.x - f.x, o.y - f.y);
  if (lm.form === "drop") {
    const reach = Math.min(dist(f, o), lm.range);
    return { x: f.x + d.x * reach, y: f.y + d.y * reach, r: lm.r };
  }
  if (lm.form === "burst") return { x: f.x + d.x * lm.reach, y: f.y + d.y * lm.reach, r: lm.r };
  if (lm.form === "beam") return { x: f.x, y: f.y, dx: d.x, dy: d.y, len: beamLength(b, f.x, f.y, d, lm.range), width: lm.width };
  return { x: f.x, y: f.y, dx: d.x, dy: d.y, len: lm.range };
}

/** Where to aim: at the rival, or (a brain with `lead`) where it is running to by the time the move lands. */
function ahead(b, f, o, lm) {
  const lead = b.brain && b.brain[f.side] ? b.brain[f.side].lead : 0;
  if (!(lead > 0) || !(Math.abs(o.vx) + Math.abs(o.vy) > 1)) return o;
  const d = dist(f, o);
  const t = lm.form === "shot" || lm.form === "homing" ? d / (lm.speed || 300) : lm.form === "dash" ? d / (lm.speed || 500) : (lm.warn || 0) + (lm.windup || 0);
  const s = Math.min(1, t) * lead;
  const p = { x: o.x + o.vx * s, y: o.y + o.vy * s };
  return fits(b, o, p.x, p.y) ? p : o;
}

function beamLength(b, x, y, d, range) {
  for (let s = 6; s <= range; s += 4) if (b.ground.blocksShot(b.map, x + d.x * s, y + d.y * s)) return s;
  return range;
}

function use(b, side, moveId, power, events, extra = {}) {
  const f = current(b, side);
  const o = current(b, other(side));
  const m = moveById(moveId);
  const lm = liveMove(m);
  f.cd[m.id] = lm.cooldown;
  f.recover = RECOVER_S;
  faceToward(f, o);
  f.act = { kind: "lunge", t: 0, dur: 0.3 };
  const element = m.own ? f.type : m.element || null;
  events.push({ kind: "attack", side, move: m.id, name: m.name, style: m.style, form: lm.form, element: element || "plain", power, x: f.x, y: f.y, ...extra });
  if (m.kind === "attack") {
    const shot = { side, move: m.id, element, atype: f.type, atk: attackOf(b, f), power, style: m.style, mpower: m.power, delay: m.delay || 0 };
    if (f.boost > 0 && --f.boost === 0) f.boostLeft = 0;
    const aim = aimFor(b, f, o, lm);
    if (lm.windup) {
      f.charging = { move: m.id, t: 0, total: lm.windup, aim, shot, lm };
      events.push({ kind: "charge", side, move: m.id, form: lm.form, element: element || "plain", area: aim, total: lm.windup, x: f.x, y: f.y });
      return;
    }
    launch(b, f, lm, aim, shot, events, false);
    return;
  }
  if (m.kind === "guard") {
    f.guard = Math.min(0.75, (m.power / 100) * power);
    f.guardLeft = GUARD_S;
    events.push({ kind: "guard", side, move: m.id, amount: f.guard, x: f.x, y: f.y });
  } else if (m.kind === "boost") {
    if (m.buff === "spd") f.haste = HASTE_S;
    else { f.boost = BOOST_HITS; f.boostMult = 1 + m.power / 100; f.boostLeft = BOOST_S; }
    events.push({ kind: "boost", side, move: m.id, buff: m.buff === "spd" ? "spd" : "atk", x: f.x, y: f.y });
  } else if (m.kind === "heal") {
    f.heals--;
    const amount = Math.min(f.max - f.hp, Math.round(f.max * (m.power / 100) * power));
    f.hp += amount;
    events.push({ kind: "heal", side, move: m.id, amount, hp: f.hp, x: f.x, y: f.y });
  } else if (m.kind === "terrain") {
    const tiles = terrainTiles(b, f, o, lm);
    for (const t of tiles) {
      const i = t.r * b.map.cols + t.c;
      b.map.tiles[i] = lm.terrain;
      if (Array.isArray(b.map.under)) b.map.under[i] = null;
    }
    events.push({ kind: "terrain-change", side, move: m.id, terrain: lm.terrain, tiles, x: f.x, y: f.y });
  }
}

/** The tiles a terrain move repaints: a patch at the user's feet or the rival's, or a strip toward the rival. */
function terrainTiles(b, f, o, lm) {
  const seen = new Set();
  const out = [];
  const add = (c, r) => {
    const k = r * b.map.cols + c;
    if (seen.has(k) || !b.ground.canRepaint(b.map, c, r)) return;
    seen.add(k);
    out.push({ c, r });
  };
  if (lm.where === "row") {
    const d = unit(o.x - f.x, o.y - f.y);
    const len = Math.min(lm.range, Math.max(dist(f, o), 5 * TILE));
    for (let s = TILE; s <= len; s += 6) add(Math.floor((f.x + d.x * s) / TILE), Math.floor((f.y + d.y * s) / TILE));
    return out;
  }
  let at = f;
  if (lm.where === "foe") {
    const d = unit(o.x - f.x, o.y - f.y);
    const reach = Math.min(dist(f, o), lm.range);
    at = { x: f.x + d.x * reach, y: f.y + d.y * reach };
  }
  const c0 = Math.floor(at.x / TILE), r0 = Math.floor(at.y / TILE);
  for (let r = r0 - lm.size; r <= r0 + lm.size; r++) for (let c = c0 - lm.size; c <= c0 + lm.size; c++) add(c, r);
  return out;
}

/** An attack leaves the creature: something flies, a beam or an area warns, or the creature rushes. */
function launch(b, f, lm, aim, shot, events, charged) {
  const id = b.nextId++;
  const base = { id, side: f.side, move: shot.move, form: lm.form, element: shot.element || "plain", shot };
  if (lm.form === "shot" || lm.form === "homing") {
    const p = { ...base, kind: "projectile", x: f.x + aim.dx * 8, y: f.y + aim.dy * 8, dx: aim.dx, dy: aim.dy, speed: lm.speed, r: lm.r, left: lm.range, turn: lm.turn || 0 };
    b.fx.push(p);
    events.push({ kind: "projectile", side: f.side, move: shot.move, form: lm.form, element: base.element, id, x: p.x, y: p.y, dir: { x: p.dx, y: p.dy } });
  } else if (lm.form === "beam") {
    const p = { ...base, kind: "beam", x: aim.x, y: aim.y, dx: aim.dx, dy: aim.dy, len: aim.len, width: aim.width, warn: charged ? 0.05 : lm.warn, t: 0, landed: false };
    b.fx.push(p);
    events.push({ kind: "beam", side: f.side, move: shot.move, element: base.element, id, x: p.x, y: p.y, dir: { x: p.dx, y: p.dy }, len: p.len, width: p.width, warn: p.warn });
  } else if (lm.form === "burst" || lm.form === "drop") {
    const p = { ...base, kind: "area", x: aim.x, y: aim.y, r: aim.r, warn: charged ? 0.15 : lm.warn, t: 0, landed: false };
    b.fx.push(p);
    events.push({ kind: "area", side: f.side, move: shot.move, form: lm.form, element: base.element, id, x: p.x, y: p.y, r: p.r, warn: p.warn });
  } else if (lm.form === "dash") {
    f.dash = { move: shot.move, dx: aim.dx, dy: aim.dy, left: lm.range, speed: lm.speed, shot };
    events.push({ kind: "dash", side: f.side, move: shot.move, element: base.element, x: f.x, y: f.y, dir: { x: aim.dx, y: aim.dy } });
  }
}

/** An attack reaches its target: damage, with the type chart and both creatures' ground. */
function hit(b, shot, d, dir, events) {
  if (d.fainted || d.grace > 0) return false;
  const m = moveById(shot.move);
  const mult = matchup(shot.element, d.type);
  const same = shot.element && shot.element === shot.atype ? 1.1 : 1;
  const g = groundAt(b, d);
  let dmg = shot.mpower * DAMAGE * (shot.atk / (d.def * g.def)) * mult * same * shot.power * (0.92 + b.rand() * 0.16);
  const ev = { kind: "hit", side: shot.side, target: d.side, move: m.id, element: shot.element || "plain", mult, x: d.x, y: d.y };
  if (d.guard > 0) { dmg *= 1 - d.guard; ev.guarded = true; d.guard = 0; d.guardLeft = 0; }
  dmg = Math.max(1, Math.round(dmg));
  d.hp = Math.max(0, d.hp - dmg);
  Object.assign(ev, { dmg, hp: d.hp });
  events.push(ev);
  d.vx += dir.x * KNOCK;
  d.vy += dir.y * KNOCK;
  d.act = { kind: "hurt", t: 0, dur: 0.35 };
  if (m.style === "interrupt") {
    const busy = d.charging || d.dash;
    if (busy) {
      ev.interrupted = busy.move;
      events.push({ kind: "interrupt", side: shot.side, target: d.side, move: busy.move, x: d.x, y: d.y });
      d.charging = null;
      d.dash = null;
    }
    d.stun = Math.max(d.stun, STUN_S);
  }
  if (shot.delay && d.hp > 0) {
    d.slow = Math.max(d.slow, SLOW_S);
    for (const id of d.moves) d.cd[id] = (d.cd[id] || 0) + shot.delay * DELAY_PUSH;
    ev.delayed = true;
  }
  if (d.hp <= 0) faint(b, d, events);
  return true;
}

function miss(b, p, why, events, x = p.x, y = p.y) {
  events.push({ kind: "miss", side: p.side, move: p.move, why, x, y, id: p.id });
}

/** A creature faints: the next of its team steps in after FAINT_S, or the battle is over. */
function faint(b, d, events) {
  if (d.fainted) return;
  Object.assign(d, { hp: 0, fainted: true, charging: null, dash: null, vx: 0, vy: 0, act: { kind: "faint", t: 0, dur: FAINT_S } });
  events.push({ kind: "faint", side: d.side, index: d.index, x: d.x, y: d.y });
  for (const p of b.fx) if (p.side === d.side && p.kind !== "projectile" && !p.landed) p.done = true; // its wind-ups don't land
  b.ctl[d.side] = newControl();
  if (b.over) return;
  const team = d.side === "me" ? b.mine : b.theirs;
  if (d.index + 1 < team.length) { b.swap[d.side] = b.time + FAINT_S; return; }
  b.over = true;
  b.won = d.side === "foe";
  b.quiz = null;
  events.push({ kind: "end", won: b.won });
}

function swapIn(b, side, events) {
  b.swap[side] = null;
  if (side === "me") b.me++; else b.foe++;
  enter(b, side);
  const f = current(b, side);
  events.push({ kind: "swap", side, index: f.index, x: f.x, y: f.y });
}

// ---------- the clock ----------
/**
 * Move the battle on by dt seconds and return what happened, for the screen to show. While a question
 * is open the world stands still and only the question's timer runs (it fails the move at 0).
 */
export function step(b, dt) {
  const events = [];
  const time = Math.max(0, Math.min(MAX_STEP, Number(dt) || 0));
  if (b.over) { for (const side of SIDES) acts(current(b, side), time); return events; }
  if (b.quiz) {
    b.quiz.timeLeft = Math.max(0, b.quiz.timeLeft - time);
    if (b.quiz.timeLeft <= 0) events.push(...answer(b, null));
    return events;
  }
  for (let left = time; left > 1e-9 && !b.over && !b.quiz; left -= MAX_DT) tick(b, Math.min(left, MAX_DT), events);
  return events;
}

function tick(b, h, events) {
  const press = b.ctl.me.attack;
  if (press) { b.ctl.me.attack = null; if (pressAttack(b, press, events)) return; }
  b.time += h;
  for (const side of SIDES) if (b.swap[side] != null && b.time >= b.swap[side]) swapIn(b, side, events);
  for (const side of SIDES) if (b.ai[side]) think(b, side, h, events);
  for (const side of SIDES) {
    const f = current(b, side);
    if (b.over || f.fainted) { acts(f, h); continue; }
    timers(b, f, h, events);
    if (!f.fainted) run(b, f, h, events);
  }
  separate(b);
  flight(b, h, events);
  for (const side of SIDES) groundTick(b, current(b, side), h, events);
  hintsTick(b, events);
  if (b.ctl.me.open) opening(b, events);
  traps(b, events);
  const me = current(b, "me");
  if (!b.over && b.me === b.mine.length - 1 && me.hp > 0 && me.hp <= me.max * 0.15) b.brink = true;
}

function acts(f, h) {
  if (!f.act) return;
  f.act.t = Math.min(f.act.dur, f.act.t + h);
  if (f.act.t >= f.act.dur && f.act.kind !== "faint") f.act = null;
}

function timers(b, f, h, events) {
  const rate = f.haste > 0 ? HASTE : 1;
  for (const id of Object.keys(f.cd)) f.cd[id] = Math.max(0, f.cd[id] - h * rate);
  for (const k of ["recover", "stun", "slow", "haste", "grace"]) f[k] = Math.max(0, f[k] - h);
  if (f.guardLeft > 0 && (f.guardLeft -= h) <= 0) { f.guardLeft = 0; f.guard = 0; }
  if (f.boostLeft > 0 && (f.boostLeft -= h) <= 0) { f.boostLeft = 0; f.boost = 0; }
  acts(f, h);
  if (f.charging && f.stun <= 0) {
    f.charging.t += h;
    if (f.charging.t >= f.charging.total) {
      const { lm, aim, shot } = f.charging;
      f.charging = null;
      launch(b, f, lm, aim, shot, events, true);
    }
  }
}

// ---------- moving ----------
/** The velocity the creature is trying to reach: from the stick, along its path, or standing still. */
function wanted(b, f, top) {
  const c = b.ctl[f.side];
  if (c.move) return { x: c.move.x * top, y: c.move.y * top };
  if (!c.dest || !c.path) return { x: 0, y: 0 };
  if (c.path.length > 1 && dist(f, c.path[1]) < 200 && walkable(b, f, f.x, f.y, c.path[1].x, c.path[1].y)) c.path.shift(); // cut straight across when it can
  let p = c.path[0];
  if (c.path.length > 1 && dist(f, p) < 6) { c.path.shift(); p = c.path[0]; }
  const d = dist(f, p);
  if (c.path.length === 1 && d < 1.5) { c.dest = null; c.path = null; return { x: 0, y: 0 }; }
  const speed = c.path.length === 1 ? Math.min(top, d * 6) : top;
  const u = unit(p.x - f.x, p.y - f.y);
  return { x: u.x * speed, y: u.y * speed };
}

/** Move by (dx, dy), sliding along walls and round corners. Returns whether it went the whole way. */
function slide(b, f, dx, dy) {
  let whole = true;
  for (const axis of ["x", "y"]) {
    const d = axis === "x" ? dx : dy;
    if (!d) continue;
    const to = { x: f.x, y: f.y };
    to[axis] += d;
    if (fits(b, f, to.x, to.y)) { f[axis] = to[axis]; continue; }
    whole = false;
    const s = Math.sign(d);
    let moved = 0;
    while (Math.abs(moved + s) <= Math.abs(d)) {
      const p = { x: f.x, y: f.y };
      p[axis] += s;
      if (!fits(b, f, p.x, p.y)) break;
      f[axis] = p[axis];
      moved += s;
    }
    if (Math.abs(moved) < Math.abs(d) - 1) {
      // Round a corner: if a small shift across would let it through, edge that way.
      const across = axis === "x" ? "y" : "x";
      for (const n of [1, -1, 2, -2, 3, -3, 4, -4]) {
        const p = { x: f.x, y: f.y };
        p[across] += n;
        p[axis] += s;
        if (fits(b, f, p.x, p.y)) { const q = { x: f.x, y: f.y }; q[across] += Math.sign(n); if (fits(b, f, q.x, q.y)) f[across] = q[across]; break; }
      }
      f["v" + axis] = 0;
    }
  }
  return whole;
}

function run(b, f, h, events) {
  const g = groundAt(b, f);
  const o = current(b, other(f.side));
  const x0 = f.x, y0 = f.y;
  if (f.dash) dashOn(b, f, o, h, events);
  else {
    const top = speedOf(f.spd) * g.speed * (f.haste > 0 ? HASTE : 1) * (f.slow > 0 ? SLOW : 1);
    const want = f.stun > 0 || f.charging ? { x: 0, y: 0 } : wanted(b, f, top);
    const ax = want.x - f.vx, ay = want.y - f.vy;
    const dv = Math.hypot(ax, ay), most = ACCEL * Math.max(0.05, g.grip) * h;
    if (dv > most) { f.vx += (ax / dv) * most; f.vy += (ay / dv) * most; } else { f.vx = want.x; f.vy = want.y; }
    slide(b, f, f.vx * h, f.vy * h);
    // Stuck against something on the way somewhere: find the way again (twice), then give up.
    const c = b.ctl[f.side];
    const pace = Math.hypot(want.x, want.y);
    if (c.dest && pace > 20 && Math.hypot(f.x - x0, f.y - y0) < 0.2 * h * pace) {
      if ((c.stuck += h) > 0.5) {
        if (c.tries >= 2) { c.dest = null; c.path = null; c.tries = 0; } else setDest(b, f.side, c.dest, true);
      }
    } else c.stuck = 0;
  }
  const moved = Math.hypot(f.x - x0, f.y - y0);
  f.speed = moved / h;
  if (f.charging || f.recover > 0 || f.speed < 5) faceToward(f, o.fainted ? null : o);
  else if (Math.abs(f.x - x0) / h > 12) f.face = f.x < x0 ? -1 : 1;
  f.stride += moved;
  if (f.stride >= STRIDE && !f.dash) { f.stride -= STRIDE; events.push({ kind: "step", side: f.side, x: f.x, y: f.y, terrain: g.id }); }
  if (f.stride >= STRIDE) f.stride = 0;
}

function dashOn(b, f, o, h, events) {
  const d = f.dash;
  const len = Math.min(d.left, d.speed * h);
  const x0 = f.x, y0 = f.y;
  const whole = slide(b, f, d.dx * len, d.dy * len);
  d.left -= len;
  f.vx = d.dx * d.speed;
  f.vy = d.dy * d.speed;
  if (!o.fainted && touching(f, o, 6)) {
    hit(b, d.shot, o, { x: d.dx, y: d.dy }, events);
    f.dash = null;
    f.vx *= 0.2; f.vy *= 0.2;
    return;
  }
  if (d.left <= 0 || !whole || Math.hypot(f.x - x0, f.y - y0) < 0.5) {
    miss(b, { side: f.side, move: d.move, x: f.x, y: f.y }, "dodged", events);
    f.dash = null;
    f.vx *= 0.3; f.vy *= 0.3;
  }
}

/** The two creatures never stand inside each other. */
function separate(b) {
  const a = current(b, "me"), c = current(b, "foe");
  if (a.fainted || c.fainted) return;
  const nx = (c.x - a.x) / (2 * BODY.rx), ny = (c.y - a.y) / (2 * BODY.ry);
  const d = Math.hypot(nx, ny);
  if (d >= 1) return;
  const u = d > 1e-6 ? { x: nx / d, y: ny / d } : { x: a.side === "me" ? 1 : -1, y: 0 };
  const push = (1 - d) / 2;
  const px = u.x * push * 2 * BODY.rx, py = u.y * push * 2 * BODY.ry;
  if (fits(b, a, a.x - px, a.y - py)) { a.x -= px; a.y -= py; }
  if (fits(b, c, c.x + px, c.y + py)) { c.x += px; c.y += py; }
}

// ---------- things in flight ----------
function flight(b, h, events) {
  for (const p of b.fx) {
    if (p.done) continue;
    const target = current(b, other(p.side));
    if (p.kind === "projectile") {
      if (p.turn && !target.fainted) {
        const want = Math.atan2(target.y - HURT.lift - p.y, target.x - p.x);
        const now = Math.atan2(p.dy, p.dx);
        let turn = want - now;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        while (turn < -Math.PI) turn += 2 * Math.PI;
        const a = now + Math.max(-p.turn * h, Math.min(p.turn * h, turn));
        p.dx = Math.cos(a);
        p.dy = Math.sin(a);
      }
      const len = p.speed * h;
      const n = Math.max(1, Math.ceil(len / 4));
      for (let i = 0; i < n && !p.done; i++) {
        p.x += (p.dx * len) / n;
        p.y += (p.dy * len) / n;
        p.left -= len / n;
        if (!target.fainted && target.grace <= 0 && inHurt(target, p.x, p.y, p.r)) { hit(b, p.shot, target, { x: p.dx, y: p.dy }, events); p.done = true; }
        else if (b.ground.blocksShot(b.map, p.x, p.y)) { miss(b, p, "wall", events); p.done = true; }
        else if (p.left <= 0) { miss(b, p, "range", events); p.done = true; }
      }
    } else {
      p.t += h;
      if (!p.landed && p.t >= p.warn) {
        p.landed = true;
        if (p.kind === "area") {
          const struck = !target.fainted && Math.hypot(target.x - p.x, target.y - p.y) <= p.r + 6;
          if (!(struck && hit(b, p.shot, target, unit(target.x - p.x, target.y - p.y), events))) miss(b, p, "dodged", events);
        } else {
          // The point of the beam nearest the target's middle.
          const tx = target.x, ty = target.y - HURT.lift;
          const along = Math.max(0, Math.min(p.len, (tx - p.x) * p.dx + (ty - p.y) * p.dy));
          const cx = p.x + p.dx * along, cy = p.y + p.dy * along;
          const struck = !target.fainted && inHurt(target, cx, cy, p.width / 2);
          if (!(struck && hit(b, p.shot, target, { x: p.dx, y: p.dy }, events))) miss(b, p, "dodged", events, cx, cy);
        }
      }
      if (p.landed && p.t >= p.warn + SHOW_S) p.done = true;
    }
  }
  b.fx = b.fx.filter((p) => !p.done);
}

/** The dungeon's traps: spikes shoot up every SPIKE_S (hurting whoever stands on them as they rise), axes swing. */
function traps(b, events) {
  const up = spikesUp(b.time);
  const rising = up && !b.spikesUp;
  b.spikesUp = up;
  for (const side of SIDES) {
    const f = current(b, side);
    if (b.over || f.fainted || f.grace > 0) continue;
    if (rising) {
      const g = groundAt(b, f);
      if (g.spikes > 0) {
        const dmg = Math.max(1, Math.round(f.max * g.spikes));
        f.hp = Math.max(0, f.hp - dmg);
        f.act = { kind: "hurt", t: 0, dur: 0.3 };
        events.push({ kind: "trap", trap: "spikes", side, dmg, hp: f.hp, x: f.x, y: f.y });
        if (f.hp <= 0) { faint(b, f, events); continue; }
      }
    }
    for (const h of b.traps) {
      const { deg, dir } = axeAngle(h, b.time);
      if (Math.abs(deg) > 42 || b.time - h.hit[side] < 0.9) continue; // only the low part of the swing hits
      const bx = h.x + (h.reach || 42) * Math.sin((deg * Math.PI) / 180);
      if (Math.abs(f.x - bx) > 13 || Math.abs(f.y - h.y) > 9) continue;
      h.hit[side] = b.time;
      const dmg = Math.max(1, Math.round(f.max * AXE_HIT));
      f.hp = Math.max(0, f.hp - dmg);
      f.vx += dir * AXE_PUSH;
      f.act = { kind: "hurt", t: 0, dur: 0.35 };
      events.push({ kind: "trap", trap: "axe", side, dmg, hp: f.hp, x: f.x, y: f.y, dir });
      if (f.hp <= 0) { faint(b, f, events); break; }
    }
  }
}

/** Once a second the ground heals or burns the creature standing on it. */
/** Hint cards: a new one now and then (while fewer than HINT_MAX lie about), and the player's creature picking one up. */
function hintsTick(b, events) {
  if (b.over) return;
  if (b.time >= b.nextHint) {
    b.nextHint = b.time + HINT_EVERY[0] + b.hintRand() * (HINT_EVERY[1] - HINT_EVERY[0]);
    const p = b.pickups.length < HINT_MAX ? hintSpot(b) : null;
    if (p) {
      const card = { id: b.nextId++, kind: "hint", x: p.x, y: p.y };
      b.pickups.push(card);
      events.push({ kind: "hint-appears", side: "me", id: card.id, x: card.x, y: card.y }); // (for the player)
    }
  }
  const me = current(b, "me");
  if (me.fainted) return;
  const i = b.pickups.findIndex((p) => Math.hypot(p.x - me.x, p.y - me.y) <= HINT_PICK);
  if (i < 0) return;
  const [card] = b.pickups.splice(i, 1);
  b.hints++;
  events.push({ kind: "pickup", item: "hint", side: "me", id: card.id, hints: b.hints, x: card.x, y: card.y });
}

/** Somewhere at random for a hint card: open ground that doesn't hurt, which the player's creature can walk to,
 * not right next to either creature or another card. Null when a few tries find nowhere. */
function hintSpot(b) {
  const me = current(b, "me"), foe = current(b, "foe");
  for (let tries = 0; tries < 8; tries++) {
    const x = 8 + b.hintRand() * (b.width - 16), y = 8 + b.hintRand() * (b.height - 16);
    const p = b.ground.safeSpotNear ? b.ground.safeSpotNear(b.map, x, y, who(me), { from: { x: me.x, y: me.y } }) : nearestFit(b, me, x, y);
    if (!p || !fits(b, me, p.x, p.y) || groundAt(b, me, p.x, p.y).spikes > 0) continue;
    if ([me, foe, ...b.pickups].some((o) => Math.hypot(o.x - p.x, o.y - p.y) < HINT_CLEAR)) continue;
    return { x: p.x, y: p.y };
  }
  return null;
}

/** Spend one of this battle's hint cards on the open question (one a question; the screen then takes away two wrong
 * answers). Returns whether it could. */
export function spendHint(b) {
  if (!b.quiz || b.hints <= 0 || b.quiz.hinted) return false;
  b.hints--;
  b.quiz.hinted = true;
  return true;
}

function groundTick(b, f, h, events) {
  if (f.fainted || b.over) return;
  f.tick += h;
  if (f.tick < 1) return;
  f.tick -= 1;
  const g = groundAt(b, f);
  const healLeft = Math.round(f.max * GROUND_HEAL) - (f.groundHealed || 0);
  if (g.heal > 0 && f.hp < f.max && healLeft > 0) {
    const amount = Math.min(f.max - f.hp, healLeft, Math.max(1, Math.round(f.max * g.heal)));
    f.hp += amount;
    f.groundHealed = (f.groundHealed || 0) + amount;
    events.push({ kind: "terrain-tick", side: f.side, terrain: g.id, heal: amount, hp: f.hp, x: f.x, y: f.y });
  }
  if (g.burn > 0) {
    const amount = Math.max(1, Math.round(f.max * g.burn));
    f.hp = Math.max(0, f.hp - amount);
    events.push({ kind: "terrain-tick", side: f.side, terrain: g.id, dmg: amount, hp: f.hp, x: f.x, y: f.y });
    if (f.hp <= 0) faint(b, f, events);
  }
}

// ---------- the rival ----------
// The computer plays a side by thinking a few times a second: first get out of the way of whatever
// is coming, then use a move that will reach, else go and stand somewhere good for the next one.
// How well it does all this follows its brain (brainOf: unless set, foeForm, its owner's accuracy).

function think(b, side, h, events) {
  const ai = b.ai[side];
  const f = current(b, side), o = current(b, other(side));
  if (b.over || f.fainted || o.fainted) return;
  if ((ai.think -= h) > 0) return;
  const brain = b.brain[side];
  ai.think = brain.react + b.rand() * 0.15;
  const threat = threatTo(b, f);
  if (threat && b.rand() < brain.dodge) {
    const p = escape(b, f, threat);
    if (p) { setDest(b, side, p); ai.dodgeUntil = b.time + 0.45; ai.replan = b.time + 0.7; return; }
  }
  if (b.time < ai.dodgeUntil) return;
  if (!f.charging && !f.dash && f.recover <= 0 && f.stun <= 0) {
    const id = choose(b, f, o);
    if (id && b.rand() < brain.eager) {
      if (side === "me") b.ctl.me.attack = id; else rivalUse(b, side, id, events);
      ai.lastMove = b.time;
      return;
    }
  }
  if (b.time >= ai.replan || !b.ctl[side].dest) {
    ai.replan = b.time + 0.9 + b.rand() * 0.8;
    const p = bestSpot(b, f, o, b.time - ai.lastMove);
    if (p && dist(f, p) > 6) setDest(b, side, p);
  }
}

/** Something about to hit the creature: {line: {dx, dy}} to step off, or {area: {x, y, r}} to leave. */
function threatTo(b, f) {
  for (const p of b.fx) {
    if (p.side === f.side || p.done) continue;
    if (p.kind === "projectile") {
      const rx = f.x - p.x, ry = f.y - HURT.lift - p.y;
      const along = rx * p.dx + ry * p.dy;
      if (along < -4 || along / p.speed > 1.1) continue;
      if (Math.abs(rx * p.dy - ry * p.dx) < HURT.ry + p.r + 6 || (p.turn && along < 100)) return { line: { dx: p.dx, dy: p.dy } };
    } else if (!p.landed && p.kind === "area") {
      if (Math.hypot(f.x - p.x, f.y - p.y) < p.r + 12) return { area: { x: p.x, y: p.y, r: p.r } };
    } else if (!p.landed && p.kind === "beam") {
      const rx = f.x - p.x, ry = f.y - p.y;
      const along = rx * p.dx + ry * p.dy;
      if (along > -8 && along < p.len + 8 && Math.abs(rx * p.dy - ry * p.dx) < p.width / 2 + 14) return { line: { dx: p.dx, dy: p.dy } };
    }
  }
  const o = current(b, other(f.side));
  const busy = !o.fainted && (o.charging || o.dash);
  if (busy) {
    const a = o.charging ? o.charging.aim : { x: o.x, y: o.y, dx: o.dash.dx, dy: o.dash.dy };
    if (a.r) { if (Math.hypot(f.x - a.x, f.y - a.y) < a.r + 12) return { area: { x: a.x, y: a.y, r: a.r } }; }
    else {
      const rx = f.x - a.x, ry = f.y - a.y;
      if (rx * a.dx + ry * a.dy > 0 && Math.abs(rx * a.dy - ry * a.dx) < (a.width || 10) / 2 + 16) return { line: { dx: a.dx, dy: a.dy } };
    }
  }
  return null;
}

/** Where to step to get out of the way. */
function escape(b, f, t) {
  const tries = [];
  if (t.line) {
    const side = b.rand() < 0.5 ? 1 : -1;
    for (const n of [side, -side]) for (const far of [36, 26, 48]) tries.push({ x: f.x - t.line.dy * far * n, y: f.y + t.line.dx * far * n });
  } else {
    const a = t.area;
    const u = Math.hypot(f.x - a.x, f.y - a.y) > 2 ? unit(f.x - a.x, f.y - a.y) : unit(b.rand() - 0.5, b.rand() - 0.5);
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 2]) {
      const c = Math.cos(turn), s = Math.sin(turn);
      const dx = u.x * c - u.y * s, dy = u.x * s + u.y * c;
      tries.push({ x: a.x + dx * (a.r + 18), y: a.y + dy * (a.r + 18) });
    }
  }
  return tries.find((p) => p.x > 0 && p.y > 0 && p.x < b.width && p.y < b.height && fits(b, f, p.x, p.y) && walkable(b, f, f.x, f.y, p.x, p.y)) || null;
}

const attackIds = (f) => f.moves.filter((id) => moveById(id).kind === "attack");
/** How much good a move would do to the rival; `types` 0..1 is how much the element chart counts. */
const hitValue = (f, o, id, types = 1) => { const m = moveById(id); return m.power * matchup(m.own ? f.type : m.element || null, o.type) ** types * (m.element && m.element === f.type ? 1.1 : 1); };

/** The move to use now, or null to wait. */
function choose(b, f, o) {
  // Out of the player's view it only looks after itself, or fires a beam or a homing shot (their warning line and
  // the slow shot show up near the player in time): attacks come from where they can be seen and dodged.
  const seen = inSight(b, f, o);
  const ready = f.moves.filter((id) => !whyNot(b, f.side, id)).filter((id) => {
    const m = moveById(id);
    const form = liveMove(m).form;
    return seen || m.kind === "guard" || m.kind === "boost" || m.kind === "heal" || (m.kind === "terrain" && m.where === "self") ||
      (m.kind === "attack" && (form === "beam" || form === "homing"));
  });
  if (!ready.length) return null;
  const brain = b.brain[f.side];
  const by = (k) => ready.filter((id) => moveById(id).kind === k);
  const interrupt = ready.find((id) => moveById(id).style === "interrupt" && inRange(b, f.side, id));
  if (o.charging && interrupt && b.rand() < brain.interrupt) return interrupt;
  if (f.hp < f.max * 0.35 && by("heal").length && b.rand() < brain.heal) return by("heal")[0];
  const d = dist(f, o);
  if (b.rand() < brain.extras) {
    const extras = [...by("guard").filter(() => d < 120), ...by("boost").filter(() => !f.boost && !f.haste), ...by("terrain")];
    if (extras.length) return extras[Math.floor(b.rand() * extras.length)];
  }
  const reach = by("attack").filter((id) => {
    if (!inRange(b, f.side, id)) return false;
    const form = liveMove(moveById(id)).form;
    if (form === "shot" || form === "beam") return clearShot(b, f.x, f.y, o.x, o.y);
    if (form === "dash") return walkable(b, f, f.x, f.y, o.x, o.y);
    return true;
  }).sort((x, y) => hitValue(f, o, y, brain.types) - hitValue(f, o, x, brain.types));
  if (!reach.length) return null;
  return b.rand() < brain.pick ? reach[0] : reach[Math.floor(b.rand() * reach.length)];
}

/** The distance a move likes to be used from. */
function liking(lm) {
  if (lm.form === "burst") return 34;
  if (lm.form === "dash") return lm.range * 0.7;
  return lm.range * 0.6;
}

/** Somewhere good to stand: the right distance for its best attack, on helpful ground, with a clear shot.
 * The longer it goes without a move (`idle` seconds), the closer it comes and the more it tries others. */
function bestSpot(b, f, o, idle = 0) {
  const brain = b.brain[f.side];
  const ids = attackIds(f).sort((x, y) => hitValue(f, o, y, brain.types) - hitValue(f, o, x, brain.types));
  const best = idle > 6 && ids.length ? ids[Math.floor(b.rand() * ids.length)] : ids[0];
  const lm = liveMove(moveById(best || "tackle"));
  const want = (attackIds(f).every((id) => f.cd[id] > 1.2) ? 150 : liking(lm)) * (idle > 4 ? 0.6 : 1);
  const needsLine = lm.form === "shot" || lm.form === "beam" || lm.form === "dash";
  const spots = [{ x: f.x, y: f.y }];
  const a0 = b.rand() * Math.PI * 2;
  // A ring round the rival at that distance, squashed to fit the player's view.
  const wx = Math.min(want, b.sight.w / 2 - 40), wy = Math.min(want, b.sight.h / 2 - 40);
  for (let i = 0; i < 12; i++) spots.push({ x: o.x + Math.cos(a0 + (i / 12) * 2 * Math.PI) * wx, y: o.y + Math.sin(a0 + (i / 12) * 2 * Math.PI) * wy });
  for (let i = 0; i < 4; i++) spots.push({ x: f.x + (b.rand() - 0.5) * 120, y: f.y + (b.rand() - 0.5) * 120 });
  let top = null, topScore = -Infinity;
  for (const p of spots) {
    if (p.x < 8 || p.y < 8 || p.x > b.width - 8 || p.y > b.height - 8 || !fits(b, f, p.x, p.y)) continue;
    const g = groundAt(b, f, p.x, p.y);
    let s = -Math.abs(dist(p, o) - want) / 30 - dist(f, p) / 120 + b.rand() * 0.4;
    const gw = brain.ground;
    s += gw * ((g.atk - 1) * 6 + (g.def - 1) * 5 - (1 - Math.min(1, g.speed)) * 2 - (g.grip < 0.5 ? 1 : 0));
    if (g.heal > 0) s += gw * (f.hp < f.max * 0.7 ? 2 : 0.3);
    if (g.burn > 0) s -= 4 * Math.max(0.25, gw);
    if (g.spikes > 0) s -= 4 * Math.max(0.25, gw);
    if (needsLine) s += clearShot(b, p.x, p.y, o.x, o.y) ? 1 : -3;
    if (!inSight(b, p, o)) s -= 3; // somewhere it couldn't attack from
    if (g.heal > 0 && (f.groundHealed || 0) >= f.max * GROUND_HEAL) s -= gw * (f.hp < f.max * 0.7 ? 2 : 0.3); // it has had all the ground gives
    if (s > topScore) { topScore = s; top = p; }
  }
  return top;
}

// ---------- what the screen draws ----------
function statusesOf(b, f) {
  const out = [];
  if (f.guard > 0) out.push({ id: "guard", left: f.guardLeft });
  if (f.boost > 0) out.push({ id: "boost", left: f.boostLeft, hits: f.boost });
  if (f.haste > 0) out.push({ id: "haste", left: f.haste });
  if (f.slow > 0) out.push({ id: "slow", left: f.slow });
  if (f.stun > 0) out.push({ id: "stun", left: f.stun });
  if (!f.fainted) {
    const g = groundAt(b, f);
    if (g.status) out.push({ id: g.status, left: null, ground: true });
  }
  return out;
}

function fighterView(b, side) {
  const f = current(b, side);
  const g = groundAt(b, f);
  return {
    side, index: f.index, name: f.name, look: f.look, type: f.type, x: f.x, y: f.y, face: f.face,
    moving: !f.fainted && (f.speed || 0) > 5, speed: f.speed || 0, hp: f.hp, max: f.max,
    act: f.act ? { kind: f.act.kind, t: Math.min(1, f.act.t / f.act.dur) } : null,
    statuses: statusesOf(b, f), terrain: g.id, ground: g,
    charging: f.charging ? { move: f.charging.move, form: f.charging.lm.form, t: Math.min(1, f.charging.t / f.charging.total), area: f.charging.aim } : null,
    dashing: !!f.dash, fainted: f.fainted, grace: f.grace > 0, waiting: b.swap[side] != null,
  };
}

function movesView(b) {
  const f = current(b, "me");
  return f.moves.map((id) => {
    const m = moveById(id);
    const lm = liveMove(m);
    const why = whyNot(b, "me", id);
    return { id, name: m.name, style: m.style, kind: m.kind, element: m.own ? f.type : m.element || null, form: lm.form, range: lm.range,
             left: f.cd[id] || 0, total: lm.cooldown, ready: !why, why, inRange: inRange(b, "me", id), uses: m.kind === "heal" ? f.heals : null };
  });
}

function fxView(p) {
  const v = { id: p.id, kind: p.kind, form: p.form, side: p.side, move: p.move, element: p.element, x: p.x, y: p.y };
  if (p.kind === "projectile") return { ...v, dir: { x: p.dx, y: p.dy }, r: p.r };
  if (p.kind === "beam") return { ...v, dir: { x: p.dx, y: p.dy }, len: p.len, width: p.width, warn: !p.landed, t: p.landed ? Math.min(1, (p.t - p.warn) / SHOW_S) : Math.min(1, p.t / p.warn) };
  return { ...v, r: p.r, warn: !p.landed, t: p.landed ? Math.min(1, (p.t - p.warn) / SHOW_S) : Math.min(1, p.t / p.warn) };
}

/**
 * Everything to draw, without changing anything: both creatures out (position, facing, movement,
 * health, animation, statuses, the ground under them, a wind-up), the player's moves (ready or not,
 * in reach or not), things in flight, both teams' health, the open question, the combo.
 * `t` values run 0..1: how far an animation, a wind-up or a warning has got. For beams and areas
 * `warn` is true while only the warning shows; then `t` runs again while it lands.
 */
export function view(b) {
  return {
    time: b.time, over: b.over, won: b.won, combo: b.combo, mode: b.mode, wordMode: b.wordMode,
    quiz: b.quiz ? { move: b.quiz.move, q: b.quiz.q, timeLeft: b.quiz.timeLeft, total: b.quiz.total } : null,
    map: b.map, width: b.width, height: b.height, traps: b.traps, opening: !!b.ctl.me.open,
    me: fighterView(b, "me"), foe: fighterView(b, "foe"),
    teams: { me: b.mine.map((f) => ({ hp: f.hp, max: f.max, fainted: f.fainted })), foe: b.theirs.map((f) => ({ hp: f.hp, max: f.max, fainted: f.fainted })) },
    index: { me: b.me, foe: b.foe },
    moves: movesView(b),
    fx: b.fx.map(fxView),
    potion: b.mode === "wild" && !b.potionUsed && !b.over,
    hints: b.hints, pickups: b.pickups.map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y })),
  };
}

/** Drink a potion: half the current creature's health back, once a battle, and only against wild
 * creatures (battles between people stay a level field). Returns the health restored, or 0. */
export function usePotion(b) {
  if (b.over || b.mode !== "wild" || b.potionUsed) return 0;
  const f = current(b, "me");
  if (f.fainted) return 0;
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
