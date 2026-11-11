// The live battle screen: the arena drawn from battlemap.js, the creatures and their effects, the
// controls (a controller's left stick, the keys, a click or a finger on the arena; a move button, a
// face button or a key for each move), the question that freezes the action when a move is used,
// the HUD and the end of the battle. The rules are livebattle.js's and rules.js's; this only shows them.

import { h, state as appState, toast } from "../app.js";
import { icon as lineIcon } from "../icons.js";
import { openModal } from "../components/modal.js";
import { controllerArea, controllerSetting, padInUse, padSteer, padStyle } from "../gamepad.js";
import { fullMap, inputName } from "../padmap.js";
import { detectLanguage, setLang } from "../languages.js";
import { t } from "../i18n.js";
import { MOVE_STYLES, TYPES, moveById, moveIcon } from "./data.js";
import { WELL_KNOWN_XP, answerQuestion, battleWordsFor, finishBattle, pickQuestion } from "./rules.js";
import { FRAME, animAt, composeCreature, drawLiving, drawingOf, icon, iconEl, loadImage } from "./render.js";
import { isType } from "./remote.js";
import { announce, getGame, saveGame, sfx } from "./game.js";
import * as social from "../social.js";
import { badgeToast, battleDictionary, moveHelp, moveLine, openBattleMenu } from "./battle-ui.js";
import * as arena from "./battlemap.js";
import { HAZARDS, ORNAMENTS, PROPS, ROOFS, ROOF_EXTRAS, TERRAIN, drawLayers, generateMap, roofRows } from "./battlemap.js";
import { COMBO, answer, axeAngle, battleResult, crackAt, input, newLiveBattle, spendHint, spikeFrame, step, usePotion, view } from "./livebattle.js";
import { leaderById } from "./gyms.js";
import { isChallengeWord } from "./challenge.js";
import { snippetPlayer } from "../snippetplayer.js";
import { cardSayer, stopDevice } from "../voiceplay.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const TILE = 16;
const TOP = 36;           // the camera may show this much above the arena's top row, so a creature standing there keeps its head
// The camera (the owner: "the screen zooms in and focuses on the creature, showing the area around it when it moves",
// like Realm of the Mad God): a window on the world that follows the player's creature. Its size comes from the
// screen: whole device pixels per game pixel (sharp art), with the window's longer side as near to VIEW_LONG world px
// as that allows (about 620 x 300 on a computer, 360 x 520 on an upright phone).
const VIEW_LONG = 560;
const LEAD = 0.3;         // seconds of movement the camera looks ahead (a small lead where the creature is going)
const FOLLOW = 5;         // how fast the camera catches up (higher: tighter)
const ANIM_MS = 200;      // a frame of the water, lava and other moving ground (the same frame on every tile)
// Where each move and each answer sits: a 2 x 2 block shaped like the controller's face buttons turned a
// quarter (X Y over A B), so the button on the controller is where its answer is on the screen.
// `slot` is which move (or answer) the place holds; `keys` the keyboard's (U I over J K, or 1 2 over 3 4).
const PLACES = [{ slot: 2, action: "move3", keys: ["u", "1"] }, { slot: 3, action: "move4", keys: ["i", "2"] },
  { slot: 0, action: "move1", keys: ["j", "3"] }, { slot: 1, action: "move2", keys: ["k", "4"] }];
const STEER_KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
// Until the terrain art is drawn: a colour for each ground (the shapes come from the edge bits).
const PLACEHOLDER = { grass: "#5f9442", dirt: "#8a6a45", sand: "#d8c27c", snow: "#e8eef4", ash: "#5b5458", cave_floor: "#4a4452",
  tall_grass: "#3d7f35", flowers: "#c46fae", forest_floor: "#4b5f2c", mud: "#6b4a2e", shallows: "#4f8fd0", deep_water: "#24508f",
  ice: "#bfe6f2", high: "#a08a62", cobbles: "#8d8a86", crystals: "#9a7ff0", coals: "#c2482c", lava: "#f06a1d", shadow: "#2c2440",
  spring: "#58d2c6", bridge: "#9b6b3c", wall: "#56535c",
  // the built places (also the minimap's colours): walls dark, floors light, so rooms and corridors read at a glance
  fort_wall: "#5f5a66", dungeon_wall: "#1f1b26", house_wall: "#6b4a34", fence: "#8a6a45", wood_floor: "#a8794a", stone_floor: "#8e8a92",
  hall_wall: "#7a6f62", carpet: "#a8323c", farmland: "#6e4a2c", wheat: "#d8b04a", fountain: "#5aa8d8", spikes: "#6d6a76",
  cracked_wall: "#1f1b26" }; // (a cracked wall looks like any other on the minimap: it is a secret)
// A roof before its art is drawn: a colour for each style.
const ROOF_COLOUR = { thatch: "#c9a14a", red: "#b4553a", slate: "#4e5a6e", shingle: "#7a5234", tower: "#4e5a6e" };
const LIGHT = { night: "rgba(18, 24, 70, .32)", dim: "rgba(0, 0, 0, .22)", warm: "rgba(255, 110, 40, .08)" };
// The effects (game-art/battle/fx/), and the older battle art to show while one isn't drawn yet.
const FX_OLD = { projectile: (el) => `battle/shot_${el}.png`, impact: (el) => `battle/hit_${el}.png`, guard: () => "battle/shield.png",
  heal: () => "battle/heal.png", power: () => "battle/boost.png", faint: () => "battle/faint.png", miss: () => "battle/glance.png",
  dust: () => "fx/dust.png", charge: () => "fx/surge.png", burst: (el) => `battle/hit_${el}.png` };
const PER_ELEMENT = new Set(["projectile", "impact", "burst", "beam", "trail"]);
// How each effect plays (web/game-art/battle/fx/README.md): ms per frame (one number, or one per frame), whether it
// loops, and its anchor: the point of the frame put on the spot in the world, as a share of the frame's size (so the
// older, smaller art stands in at the same place).
const FX_INFO = {
  projectile: { ms: 70, loop: true, at: [0.5, 0.5] },
  impact: { ms: [60, 90, 70, 70, 90, 110], at: [0.5, 0.5] },
  burst: { ms: [90, 60, 80, 110, 80, 80, 100, 120], at: [0.5, 0.75] },
  beam: { ms: 60, loop: true, at: [0, 0.5] },
  trail: { ms: 80, at: [0.5, 0.5] },
  guard: { ms: [50, 60, 90, 120, 80, 90], at: [0.5, 0.5] },
  heal: { ms: [70, 80, 90, 100, 100, 110], at: [0.5, 0.833] },
  power: { ms: [60, 70, 80, 100, 90, 100], at: [0.5, 0.833] },
  charge: { ms: 80, loop: true, at: [0.5, 0.5] },
  delay: { ms: 120, loop: true, at: [0.5, 0.5] },
  interrupt: { ms: [50, 90, 70, 90], at: [0.5, 0.5] },
  terrain: { ms: [80, 80, 80, 60, 90, 110], at: [0.5, 0.5] },
  faint: { ms: [70, 80, 110, 100, 100, 120], at: [0.5, 0.833] },
  dust: { ms: [60, 70, 80, 90], at: [0.5, 0.75] },
  miss: { ms: [70, 90, 90, 110], at: [0.5, 0.5] },
  status: { ms: 120, loop: true, at: [0.5, 0.5] },
};
const BODY_UP = 22; // a creature's body: this far above its feet
/** Which frame of an effect shows `ms` after it started (frames from..to of its strip), or -1 once a "once" effect is over. */
function frameAt(info, frames, ms, from = 0, to = frames - 1) {
  const n = to - from + 1;
  const each = (i) => (Array.isArray(info.ms) ? info.ms[(from + i) % info.ms.length] : info.ms);
  let total = 0;
  for (let i = 0; i < n; i++) total += each(i);
  let t = info.loop ? ms % total : ms;
  if (t >= total) return -1;
  for (let i = 0; i < n; i++) { t -= each(i); if (t < 0) return from + i; }
  return to;
}

/** The end card's lines about a gym (rules.beatGym's result): the badge, its reward and what opens next. */
function gymLines(gym) {
  if (!gym || !gym.first) return [];
  const leader = leaderById(gym.leader), next = gym.next ? leaderById(gym.next) : null;
  if (!leader) return [];
  const name = (l) => l.name; // a name, the same in every language
  return [
    `${icon("trophy")} ${t("You beat {0}, the {1}!", name(leader), t(leader.title))}`,
    `${icon("coin")} ${t("Gym reward: {0} coins and {1} XP", String(gym.coins), String(gym.xp))}`,
    next ? `${icon("arrow")} ${t("{0}'s gym is open now.", name(next))}` : `${icon("star")} ${t("You have beaten every gym leader.")}`,
  ];
}

/** The move's own element, or the creature's for a move of "its own element" (none for a plain one). */
const elementOf = (m, f) => (m.own ? f.type : m.element || null);

/**
 * A battle against `theirs`, live. `setup` = { mine, theirs, mode, rule, foeForm, rival } (the fighters
 * from battle.js), `vocab` the learner's words (the questions come from them). A gym battle (gyms-ui.js) also
 * gives `brain` and `quizSeconds` (livebattle.js) and `again`, what "Battle again" opens.
 */
export function runLiveBattle(setup, vocab) {
  const game = getGame();
  // (the Battle screen's choice: the newest 100, all, due for review, a folder; or a folder challenge's words, challenge.js)
  const words = setup.words || battleWordsFor(vocab, game);
  let dict = null; // until the built-in dictionary's list is ready, the wrong answers are the learner's own words
  battleDictionary().then((d) => { dict = d; });
  let asked = [];
  // The right answer's word is said as soon as a choice is made (its own recording, else the card voice).
  // It plays on by itself: the question closes as quickly as it always did. Game sound off: not said.
  const player = snippetPlayer();
  const sayCard = cardSayer(player.playSnippet);
  const sayAnswer = (q) => {
    const s = appState.status && appState.status.settings;
    if (s && s.game_sound === false) return;
    const v = words.find((w) => String(w.uid || w.id) === q.uid);
    if (v) sayCard(v, "word").catch(() => {});
  };
  const ask = () => {
    const q = pickQuestion(game, words, Math.random, new Date(), asked, dict);
    if (q) asked = [...asked.slice(-12), q.uid];
    return q;
  };
  const b = newLiveBattle({ ...setup, map: setup.map || generateMap((Math.random() * 2 ** 32) >>> 0), wordMode: game.battleMode, rand: Math.random, ask });
  const map = b.map; // the battle's own copy: terrain moves repaint its tiles
  const W = b.width;
  const H = b.height;
  const viewport = { w: Math.min(W, 480), h: Math.min(H + TOP, 300), s: 1 }; // set by fit()
  const cam = { x: 0, y: -TOP, vx: 0, vy: 0, at: null, ready: false }; // the window's top left, in world px
  let drawn = { x: 0, y: -TOP };  // where the last frame's window was (whole pixels): clicks and labels go through it

  document.querySelector(".live-wrap")?.remove();
  const el = h(`<div class="live-wrap"><div class="lb">
    <div class="lb-top">
      <div class="lb-card me"><div class="lb-name"><span class="lb-el"></span><span class="lb-who"></span></div>
        <div class="hud-bar"><i></i></div><div class="lb-pips"></div></div>
      <button type="button" class="ghost icon lb-pause" title="Pause">${lineIcon("pause")}</button>
      <div class="lb-card foe"><div class="lb-name"><span class="lb-who"></span><span class="lb-el"></span></div>
        <div class="hud-bar"><i></i></div><div class="lb-pips"></div></div>
    </div>
    <div class="lb-stage"><div class="lb-arena"><canvas width="${viewport.w}" height="${viewport.h}"></canvas><div class="lb-floats" aria-hidden="true"></div>
      <canvas class="lb-mini" hidden aria-hidden="true"></canvas>
      <div class="lb-banner" hidden></div><span class="lb-combo" hidden></span><span class="lb-hints" hidden></span></div></div>
    <div class="lb-side">
      <div class="lb-ground"></div>
      <div class="lb-moves"></div>
      <div class="lb-extra${b.mode === "wild" ? " reserve" : ""}"></div>
      <div class="lb-help small"></div>
    </div>
    <div class="lb-quiz" hidden></div>
    <div class="lb-end" hidden></div>
  </div></div>`);
  document.body.append(el);
  const $ = (q) => el.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ----- art -----
  const art = new Map(); // file -> image (or null: missing)
  const want = (file) => { if (!art.has(file)) { art.set(file, undefined); loadImage(file).then((img) => { art.set(file, img); if (file.includes("/terrain/")) groundDirty = true; }); } return art.get(file) || null; };
  /** An effect's picture: the new art when it is there, else the older one; with its frame count. */
  const fx = (kind, element = "plain") => {
    const el2 = element && TYPES[element] ? element : "spark";
    const img = want(PER_ELEMENT.has(kind) ? `battle/fx/${el2}_${kind}.png` : `battle/fx/${kind}.png`)
      || (FX_OLD[kind] ? want(FX_OLD[kind](el2)) : null);
    return img ? { img, frames: Math.max(1, Math.round(img.width / img.height)) } : null;
  };
  const ARENA_TERRAIN = new Set([...map.tiles, map.base, "spring", "coals", "mud"]);
  for (const id of [...ARENA_TERRAIN]) if (TERRAIN[id] && TERRAIN[id].under) ARENA_TERRAIN.add(TERRAIN[id].under);
  if (arena.SHEETS && arena.SHEETS.bridge_v && ARENA_TERRAIN.has("bridge")) ARENA_TERRAIN.add("bridge_v");
  for (const id of ARENA_TERRAIN) {
    const tr = (arena.SHEETS && arena.SHEETS[id] && { anim: arena.SHEETS[id].anim, art: arena.SHEETS[id] }) || TERRAIN[id];
    if (!tr) continue;
    want(tr.art.edges);
    want(tr.art.fill);
    if (tr.anim) { want(tr.art.edges.replace(".png", "_anim.png")); want(tr.art.fill.replace(".png", "_anim.png")); }
  }
  for (const p of map.props) if (PROPS[p.id]) want(PROPS[p.id].art);
  for (const id of new Set((map.decals || []).map((d) => d.id))) if (arena.DECALS && arena.DECALS[id]) want(arena.DECALS[id].art);
  if (arena.DECALS && arena.DECALS.rubble && (map.secrets || []).length) want(arena.DECALS.rubble.art);
  for (const o of map.ornaments || []) if (ORNAMENTS[o.id]) want(ORNAMENTS[o.id].art);
  for (const r of map.roofs || []) {
    const st = ROOFS[r.style];
    if (st) want(st.sheet || st.image);
    for (const e of r.extras || []) if (ROOF_EXTRAS[e.id]) want(ROOF_EXTRAS[e.id].art);
  }
  if ((map.hazards || []).length) want(HAZARDS.axe.art);
  want("fx/shadow_m.png");
  want("ui/digits.png");

  // ----- the ground: drawn once into its own canvas, the moving tiles (water, lava…) every frame -----
  const ground = document.createElement("canvas");
  ground.width = W;
  ground.height = H;
  let groundDirty = true;
  let moving = [];  // [{x, y, layers}] the tiles with a moving layer, from that layer up
  // Two ways the ground can be cut. The "dual grid" (battlemap.drawCorners, with art drawn for it): cells offset by
  // half a tile, each drawn with the mask of its four corners that hold a terrain (NW 1, NE 2, SW 4, SE 8), so shores
  // run diagonally and corners round off. Without it, each tile with the mask of its four sides (drawLayers).
  const DUAL = typeof arena.drawCorners === "function";
  /** Draw one layer of a cell whose top left is at world (x, y). Its tile: `mask` (dual grid) or `variant`; 15 = a middle tile. */
  function drawLayer(g, layer, x, y, now) {
    // its pictures: battlemap.SHEETS names them for every layer (a bridge running north-south is "bridge_v");
    // without it, the terrain's own
    const sh = arena.SHEETS && arena.SHEETS[layer.terrain];
    const tr = sh ? { id: layer.terrain, anim: !!sh.anim, art: { edges: sh.edges, fill: sh.fill } } : TERRAIN[layer.terrain];
    if (!tr) return;
    const v0 = DUAL ? layer.mask : layer.variant;
    const full = v0 === 15;
    const f = layer.terrain === "spikes" ? spikeFrame(v.time) : Math.floor(now / ANIM_MS) % 4; // (spikes: up when they hurt)
    // Moving ground (battle/terrain/README.md): <id>_anim.png is the edge sheet once per frame side by side,
    // <id>_fill_anim.png a middle tile per row and a frame per column; without them, the plain sheets.
    if (tr.anim) {
      const moving = want((full ? tr.art.fill : tr.art.edges).replace(".png", "_anim.png"));
      if (moving) {
        if (full) g.drawImage(moving, f * TILE, (layer.fill % Math.max(1, Math.round(moving.height / TILE))) * TILE, TILE, TILE, x, y, TILE, TILE);
        else g.drawImage(moving, f * 4 * TILE + (v0 % 4) * TILE, Math.floor(v0 / 4) * TILE, TILE, TILE, x, y, TILE, TILE);
        return;
      }
    }
    const img = want(full ? tr.art.fill : tr.art.edges);
    if (img) {
      // (a middle-tile strip may hold more than 4: groups of textures for big areas)
      const i = full ? (tr.anim ? f : layer.fill) % Math.max(1, Math.round(img.width / TILE)) : v0;
      const sx = full ? i * TILE : (i % 4) * TILE;
      const sy = full ? 0 : Math.floor(i / 4) * TILE;
      g.drawImage(img, sx, sy, TILE, TILE, x, y, TILE, TILE);
      return;
    }
    // no art yet: a plain colour where the terrain is
    g.fillStyle = PLACEHOLDER[layer.terrain] || PLACEHOLDER[String(layer.terrain).replace(/_v$/, "")] || "#777";
    if (DUAL) { // the quarters whose corner holds it
      const q = TILE / 2;
      if (v0 & 1) g.fillRect(x, y, q, q);
      if (v0 & 2) g.fillRect(x + q, y, q, q);
      if (v0 & 4) g.fillRect(x, y + q, q, q);
      if (v0 & 8) g.fillRect(x + q, y + q, q, q);
    } else { // pulled back from the sides that border something else
      const inset = (bit) => (v0 & bit ? 0 : 3);
      g.fillRect(x + inset(8), y + inset(1), TILE - inset(8) - inset(2), TILE - inset(1) - inset(4));
    }
  }
  /** The flat things lying on the ground (pebbles, leaves, shells...): map.decals, drawn after the ground. */
  function drawDecals(g) {
    const kinds = arena.DECALS || {};
    for (const d of map.decals || []) {
      const info = kinds[d.id];
      const img = info && want(info.art);
      if (!img) continue;
      const [w, hgt] = info.size || [16, 16];
      if (d.flip) { g.save(); g.translate(d.x + w, d.y); g.scale(-1, 1); g.drawImage(img, (d.v || 0) * w, 0, w, hgt, 0, 0, w, hgt); g.restore(); }
      else g.drawImage(img, (d.v || 0) * w, 0, w, hgt, d.x, d.y, w, hgt);
    }
  }
  function paintGround(now) {
    const g = ground.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    moving = [];
    // the dual grid has one more cell each way, offset by half a tile
    const [nx, ny, off] = DUAL ? [map.cols + 1, map.rows + 1, -TILE / 2] : [map.cols, map.rows, 0];
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      const layers = DUAL ? arena.drawCorners(map, cx, cy) : drawLayers(map, cx, cy);
      const x = cx * TILE + off, y = cy * TILE + off;
      const k = layers.findIndex((l) => TERRAIN[l.terrain] && TERRAIN[l.terrain].anim);
      const still = k < 0 ? layers : layers.slice(0, k);
      for (const l of still) drawLayer(g, l, x, y, now);
      if (k >= 0) moving.push({ x, y, layers: layers.slice(k) });
    }
    drawDecals(g); // (never on water, so the moving tiles drawn over the ground each frame don't hide any)
    groundDirty = false;
  }

  // ----- creatures: each pose composed once, then kept -----
  const frames = new Map();
  const poseKey = (side, i, pose) => `${side}|${i}|${pose.anim}|${pose.frame}|${pose.act || ""}|${pose.t || 0}|${pose.eyes}`;
  function creatureFrame(side, f, i, pose) {
    const key = poseKey(side, i, pose);
    if (!frames.has(key)) { frames.set(key, null); composeCreature(f.look, pose).then((c) => frames.set(key, c)); }
    const got = frames.get(key);
    if (got) return got;
    const prefix = `${side}|${i}|`;
    for (const [k, v] of frames) if (v && k.startsWith(prefix)) return v; // the nearest ready one, until this one is
    return null;
  }
  const team = (side) => (side === "me" ? b.mine : b.theirs);
  function warmUp(side, i) { // every frame of its walk, wing beat and idle (and the blink) ready before they are needed
    const f = team(side)[i];
    if (!f) return;
    const anims = drawingOf(f.look).anims;
    for (const anim of ["idle", "walk", "fly"]) {
      for (let frame = 0; anims[anim] && frame < anims[anim].frames; frame++) creatureFrame(side, f, i, { anim, frame, eyes: "open" });
    }
    creatureFrame(side, f, i, { anim: "idle", frame: 0, eyes: "blink" });
  }

  // ----- what is on the screen besides the world -----
  const effects = [];  // {fx, x, y, t, fps, flip, loop}
  const numbers = [];  // {text, x, y, t, color}
  const trails = [];   // {x, y, t, element}
  let shake = 0;
  let target = null;   // where a click or a finger sent the creature (a small ring there)
  /** Play an effect once at a spot in the world (its anchor goes there); `range` plays only some of its frames. */
  const play = (kind, element, x, y, opts = {}) => { const f = fx(kind, element); if (f) effects.push({ ...f, kind, x, y, t: 0, flip: !!opts.flip, range: opts.range || null }); };
  /** Draw frame `i` of an effect with its anchor on (x, y). */
  function drawFx(f, kind, i, x, y, flip = false) {
    const size = f.img.height;
    const [ax, ay] = (FX_INFO[kind] || FX_INFO.impact).at;
    if (flip) { ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); x = 0; }
    ctx.drawImage(f.img, i * size, 0, size, size, Math.round(x - ax * size), Math.round(y - ay * size), size, size);
    if (flip) ctx.restore();
  }
  const loopFrame = (kind, f, now, from, to) => frameAt(FX_INFO[kind], f.frames, now, from, to);

  // Damage and healing numbers in the game's pixel digits (ui/digits.png: 8x10 glyphs, white), tinted.
  const GLYPHS = "0123456789+-x.,%!?kM";
  const labels = new Map();
  function pixelNumber(text, color) {
    const key = `${text}|${color}`;
    const digits = art.get("ui/digits.png");
    if (!labels.has(key) && digits && [...text].every((ch) => GLYPHS.includes(ch))) {
      const c = document.createElement("canvas");
      c.width = text.length * 6 + 2;
      c.height = 10;
      const g = c.getContext("2d");
      [...text].forEach((ch, i) => g.drawImage(digits, GLYPHS.indexOf(ch) * 8, 0, 8, 10, i * 6 - 1, 0, 8, 10));
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      labels.set(key, c);
    }
    return labels.get(key) || null;
  }

  // ----- built places: roofs, hidden rooms, things on walls, traps -----
  // A roof covers its building (walls and all) and fades away while a creature is under it, so nobody hides there.
  const roofs = (map.roofs || []).map((r) => ({ ...r, alpha: 1, canvas: null, shadow: null }));
  /** A roof's shadow: its outline in the terrain's see-through shadow colour, drawn 3 px down and right of it (the roof's
   * eaves hide the walls' own shadow), made once. */
  function roofShadow(r, img) {
    if (r.shadow && r.shadow.src === img) return r.shadow.c;
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgba(20, 10, 38, .46)";
    g.fillRect(0, 0, c.width, c.height);
    r.shadow = { src: img, c };
    return c;
  }
  /** A sheet roof put together once from its 16x16 pieces (battlemap.ROOFS): ends, middles repeated, rows by roofRows. */
  function roofImage(r) {
    const st = ROOFS[r.style];
    if (!st) return null;
    if (st.image) return want(st.image);
    if (r.canvas) return r.canvas;
    const sheet = want(st.sheet);
    if (!sheet) return null;
    const c = document.createElement("canvas");
    const w = r.w * TILE + 6;
    c.width = w;
    c.height = r.h * TILE;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    const { back, front } = roofRows(r.h);
    [0, ...Array(back).fill(1), 2, ...Array(front).fill(3), 4].forEach((row, k) => {
      const y = k * TILE, sy = row * TILE;
      g.drawImage(sheet, 0, sy, TILE, TILE, 0, y, TILE, TILE);
      for (let x = TILE; x < w - TILE; x += TILE) { const cw = Math.min(TILE, w - TILE - x); g.drawImage(sheet, TILE, sy, cw, TILE, x, y, cw, TILE); }
      g.drawImage(sheet, 2 * TILE, sy, TILE, TILE, w - TILE, y, TILE, TILE);
    });
    r.canvas = c;
    return c;
  }
  function drawRoof(r) {
    if (r.alpha < 0.02) return;
    const st = ROOFS[r.style];
    const img = roofImage(r);
    ctx.save();
    ctx.globalAlpha = r.alpha;
    let top;
    if (st && st.image) {
      const bottom = (r.y0 + r.h) * TILE - 10;
      const w = img ? img.width : r.w * TILE + 6, hgt = img ? img.height : r.h * TILE;
      const left = Math.round(r.x0 * TILE + (r.w * TILE - w) / 2);
      top = bottom - hgt;
      if (img) { ctx.drawImage(roofShadow(r, img), left + 3, top + 3); ctx.drawImage(img, left, top); }
      else { ctx.fillStyle = ROOF_COLOUR[r.style] || "#555"; ctx.fillRect(left, top + hgt - r.h * TILE, w, r.h * TILE); }
    } else {
      top = r.y0 * TILE - 10;
      if (img) { ctx.drawImage(roofShadow(r, img), r.x0 * TILE, top + 3); ctx.drawImage(img, r.x0 * TILE - 3, top); }
      else {
        ctx.fillStyle = ROOF_COLOUR[r.style] || "#555";
        ctx.fillRect(r.x0 * TILE - 3, top, r.w * TILE + 6, r.h * TILE);
        ctx.fillStyle = "rgba(0, 0, 0, .25)";
        ctx.fillRect(r.x0 * TILE - 3, top + (1 + roofRows(r.h).back) * TILE + 6, r.w * TILE + 6, 3);
      }
      // a chimney on the back slope, a bell tower or a flag on the ridge
      const ridge = top + (1 + roofRows(r.h).back) * TILE;
      for (const e of r.extras || []) {
        const info = ROOF_EXTRAS[e.id];
        const im = info && want(info.art);
        if (!im) continue;
        const bottom = ridge + info.sit;
        ctx.drawImage(im, Math.round(r.x0 * TILE + e.x * TILE - im.width / 2 + (info.dx || 0)), bottom - im.height);
      }
    }
    ctx.restore();
  }
  // A hidden room is drawn as solid rock until its cracked wall is broken open.
  const secrets = (map.secrets || []).map((sc) => ({ ...sc, alpha: 1 }));
  const secretOpen = (sc) => sc.cracks.some((i) => !(TERRAIN[map.tiles[i]] && TERRAIN[map.tiles[i]].opens));
  function drawSecret(sc) {
    if (sc.alpha < 0.02) return;
    const fill = want(TERRAIN.dungeon_wall.art.fill);
    ctx.save();
    ctx.globalAlpha = sc.alpha;
    for (let y = sc.y0; y < sc.y0 + sc.h; y++) for (let x = sc.x0; x < sc.x0 + sc.w; x++) {
      if (fill) ctx.drawImage(fill, ((x * 7 + y * 13) % 4) * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      else { ctx.fillStyle = PLACEHOLDER.dungeon_wall; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
    ctx.restore();
  }
  /** Chains, torches, weapons on the walls; the fountain's centrepiece (battlemap.ORNAMENTS). */
  function drawOrnament(o, now) {
    const info = ORNAMENTS[o.id];
    const img = info && want(info.art);
    if (!img) return;
    const [w, hgt] = info.size;
    const f = info.frames > 1 ? Math.floor(now / 140 + (o.x + o.y) / 16) % info.frames : 0;
    ctx.drawImage(img, ((o.v || 0) * info.frames + f) * w, 0, w, hgt, o.x, o.y, w, hgt);
  }
  /** A swinging axe (battlemap.HAZARDS.axe): the frame nearest its angle now, and its shadow sweeping the floor. */
  function drawAxe(hz) {
    const info = HAZARDS.axe;
    const { deg } = axeAngle(hz, v.time);
    const rad = (deg * Math.PI) / 180;
    const low = Math.cos(rad);
    const bx = hz.x + (hz.reach || info.reach) * Math.sin(rad);
    ctx.fillStyle = `rgba(20, 10, 38, ${(0.12 + 0.28 * low).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(bx, hz.y + 2, 6 + 5 * low, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    const img = want(info.art);
    const k = Math.max(0, Math.min(info.frames - 1, Math.round(((deg + info.swing) / (2 * info.swing)) * (info.frames - 1))));
    const [fw, fh] = info.size;
    if (img) { ctx.drawImage(img, k * fw, 0, fw, fh, Math.round(hz.x - info.low[0]), Math.round(hz.y - info.low[1]), fw, fh); return; }
    const L = info.low[1] - info.pivot[1] - 6, px = hz.x, py = hz.y - info.low[1] + info.pivot[1];
    ctx.strokeStyle = "#3e3e4e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + L * Math.sin(rad), py + L * Math.cos(rad));
    ctx.stroke();
    ctx.fillStyle = "#bcbec6";
    ctx.beginPath();
    ctx.arc(px + L * Math.sin(rad), py + L * Math.cos(rad), 7, 0, Math.PI * 2);
    ctx.fill();
  }
  /** Roofs fade while a creature is under them; a hidden room's rock fades once it is open. */
  function fadeCovers(dt) {
    const k = Math.min(1, dt * 8);
    for (const r of roofs) {
      const x0 = r.x0 * TILE, y0 = r.y0 * TILE, x1 = (r.x0 + r.w) * TILE, y1 = (r.y0 + r.h) * TILE;
      const under = ["me", "foe"].some((side) => { const c = v[side]; return c && !(c.fainted && !c.act) && c.x >= x0 && c.x < x1 && c.y >= y0 && c.y < y1; });
      r.alpha += ((under ? 0 : 1) - r.alpha) * k;
    }
    for (const sc of secrets) if (secretOpen(sc)) sc.alpha += (0 - sc.alpha) * Math.min(1, dt * 4);
  }
  let crackHinted = false; // the first time the player's creature comes near a cracked wall, a word on what to do
  function crackHint() {
    if (crackHinted || !secrets.length) return;
    const tx = Math.floor(v.me.x / TILE), ty = Math.floor(v.me.y / TILE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) continue;
      const tr = TERRAIN[map.tiles[y * map.cols + x]];
      if (!tr || !tr.opens) continue;
      crackHinted = true;
      banner(device === "touch" ? t("A cracked wall! Tap it to break it open.") : t("A cracked wall! Click it to break it open."), 2600);
      return;
    }
  }

  // ----- drawing a frame -----
  let v = view(b);
  function draw(now, dt) {
    if (groundDirty) paintGround(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0e0b16"; // beyond the arena's edges
    ctx.fillRect(0, 0, viewport.w, viewport.h);
    const sx = shake > 0 ? Math.round((Math.random() - 0.5) * 3) : 0;
    const sy = shake > 0 ? Math.round((Math.random() - 0.5) * 2) : 0;
    shake = Math.max(0, shake - dt);
    drawn = { x: Math.round(cam.x), y: Math.round(cam.y) };
    const ox = drawn.x + sx, oy = drawn.y + sy;
    ctx.translate(-ox, -oy);
    // only the part of the ground in the window
    const gx = Math.max(0, ox), gy = Math.max(0, oy);
    const gw = Math.min(W, ox + viewport.w) - gx, gh = Math.min(H, oy + viewport.h) - gy;
    if (gw > 0 && gh > 0) ctx.drawImage(ground, gx, gy, gw, gh, gx, gy, gw, gh);
    for (const m of moving) if (m.x >= ox - TILE && m.x <= ox + viewport.w && m.y >= oy - TILE && m.y <= oy + viewport.h) for (const l of m.layers) drawLayer(ctx, l, m.x, m.y, now);
    const seen = (x0, y0, x1, y1) => x1 >= ox && x0 <= ox + viewport.w && y1 >= oy && y0 <= oy + viewport.h;
    for (const o of map.ornaments || []) {
      const info = ORNAMENTS[o.id];
      if (info && !info.stand && seen(o.x, o.y, o.x + info.size[0], o.y + info.size[1])) drawOrnament(o, now);
    }
    fadeCovers(dt);
    crackHint();

    // Where something is about to land, on the ground: a wind-up, a beam or an area warning (gold yours, red theirs).
    const pulse = 0.22 + 0.16 * Math.sin(now / 110);
    for (const side of ["me", "foe"]) {
      const c = v[side].charging;
      if (c && c.area) warnShape(side, c.area, pulse + (side === "foe" ? 0.08 : 0));
    }
    for (const p of v.fx) {
      if (p.warn && p.kind !== "projectile") warnShape(p.side, p, 0.18 + 0.3 * (p.t || 0));
      else if (p.kind === "area") warnShape(p.side, p, 0.3 * (1 - (p.t || 0))); // as it lands: the whole circle it hit, fading (the art is smaller)
    }
    if (target) {
      ctx.strokeStyle = "rgba(255, 255, 255, .7)";
      ctx.beginPath();
      ctx.ellipse(target.x, target.y, 5 + Math.sin(now / 120), 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Props and creatures, back to front.
    const things = [];
    for (const p of map.props) {
      const px = p.x * TILE, py = (p.y + 1) * TILE;
      if (px > ox + viewport.w + 32 || px + p.w * TILE < ox - 32 || py < oy || py - 80 > oy + viewport.h) continue; // out of the window
      if (secrets.some((sc) => !secretOpen(sc) && p.x >= sc.x0 && p.x < sc.x0 + sc.w && p.y >= sc.y0 && p.y < sc.y0 + sc.h)) continue; // (a tall one would peek over the rock)
      things.push({ y: py, draw: () => drawProp(p) });
    }
    for (const p of v.pickups || []) if (seen(p.x - 12, p.y - 32, p.x + 12, p.y + 4)) things.push({ y: p.y, draw: () => drawPickup(p, now) });
    for (const side of ["me", "foe"]) things.push({ y: v[side].y, draw: () => drawCreature(side, now) });
    for (const o of map.ornaments || []) {
      const info = ORNAMENTS[o.id];
      if (info && info.stand && seen(o.x, o.y, o.x + info.size[0], o.y + info.size[1])) things.push({ y: o.y + info.size[1], draw: () => drawOrnament(o, now) });
    }
    for (const r of roofs) if (r.alpha >= 0.02 && seen(r.x0 * TILE - 16, r.y0 * TILE - 64, (r.x0 + r.w) * TILE + 16, (r.y0 + r.h) * TILE)) things.push({ y: (r.y0 + r.h) * TILE - 1, draw: () => drawRoof(r) });
    for (const sc of secrets) if (sc.alpha >= 0.02 && seen(sc.x0 * TILE, sc.y0 * TILE, (sc.x0 + sc.w) * TILE, (sc.y0 + sc.h) * TILE)) things.push({ y: (sc.y0 + sc.h) * TILE + 1, draw: () => drawSecret(sc) });
    for (const hz of v.traps || []) if (seen(hz.x - 64, hz.y - 64, hz.x + 64, hz.y + 8)) things.push({ y: hz.y + 1, draw: () => drawAxe(hz) });
    for (const p of v.fx) if (!p.warn) things.push({ y: p.y + (p.kind === "area" ? 0 : 2), draw: () => drawFlying(p, now) });
    things.sort((a, c) => a.y - c.y);
    for (const th of things) th.draw();
    if (LIGHT[map.light]) { ctx.fillStyle = LIGHT[map.light]; ctx.fillRect(ox, oy, viewport.w, viewport.h); }

    // Effects over the world.
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      tr.t += dt;
      const f = fx("trail", tr.element);
      const k = f ? frameAt(FX_INFO.trail, f.frames, tr.t * 1000) : -1;
      if (k < 0) { trails.splice(i, 1); continue; }
      drawFx(f, "trail", k, tr.x, tr.y);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      const info = FX_INFO[e.kind] || FX_INFO.impact;
      const [from, to] = e.range || [0, e.frames - 1];
      const k = frameAt({ ...info, loop: false }, e.frames, e.t * 1000, Math.min(from, e.frames - 1), Math.min(to, e.frames - 1));
      if (k < 0) { effects.splice(i, 1); continue; }
      drawFx(e, e.kind, k, e.x, e.y, e.flip);
    }
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.t += dt;
      if (n.t > 0.9) { numbers.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - (n.t / 0.9) ** 2;
      const label = pixelNumber(n.text, n.color);
      const dark = label && pixelNumber(n.text, "#1b1420");
      const lx = Math.round(n.x - (label ? label.width / 2 : 0)), ly = Math.round(n.y - n.t * 24 - 9);
      if (label && dark) { ctx.drawImage(dark, lx + 1, ly + 1); ctx.drawImage(label, lx, ly); }
      else { ctx.font = "bold 10px monospace"; ctx.textAlign = "center"; ctx.fillStyle = n.color; ctx.fillText(n.text, n.x, ly + 9); }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawRivalPointer(now);
  }

  /** The rival out of the window: an arrow at the window's edge pointing to it, with its element. */
  function drawRivalPointer(now) {
    const f = v.foe;
    if (!f || (f.fainted && !f.act) || f.waiting) return;
    const px = f.x - drawn.x, py = f.y - 20 - drawn.y;
    if (px > -6 && px < viewport.w + 6 && py > -30 && py < viewport.h + 20) return; // it can be seen
    const m = 16;
    const cx = viewport.w / 2, cy = viewport.h / 2;
    const dx = px - cx, dy = py - cy;
    const k = Math.min((cx - m) / Math.max(1e-6, Math.abs(dx)), (cy - m) / Math.max(1e-6, Math.abs(dy)));
    const ax = Math.round(cx + dx * k), ay = Math.round(cy + dy * k);
    const a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(now / 160);
    ctx.fillStyle = "#ff5a5a";
    ctx.strokeStyle = "#1b1420";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-5, -7);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    const el2 = want(`icon/type_${f.type}.png`);
    if (el2) ctx.drawImage(el2, Math.round(ax - Math.cos(a) * 15 - 8), Math.round(ay - Math.sin(a) * 15 - 8));
  }

  // ----- the minimap: the whole arena, a pixel or two per tile, both creatures and the camera's window -----
  const mini = $(".lb-mini");
  const miniCtx = mini.getContext("2d");
  const MINI = 2; // canvas px per tile
  mini.width = map.cols * MINI;
  mini.height = map.rows * MINI;
  let miniBase = null; // the terrain, drawn once (again after a terrain move)
  function paintMini() {
    const show = W > viewport.w + 1 || H + TOP > viewport.h + 1; // only when the camera moves at all
    mini.hidden = !show;
    if (!show) return;
    if (!miniBase) {
      miniBase = document.createElement("canvas");
      miniBase.width = mini.width;
      miniBase.height = mini.height;
      const g = miniBase.getContext("2d");
      const hidden = new Set();
      for (const sc of secrets) if (!secretOpen(sc)) for (let y = sc.y0; y < sc.y0 + sc.h; y++) for (let x = sc.x0; x < sc.x0 + sc.w; x++) hidden.add(y * map.cols + x);
      for (let ty = 0; ty < map.rows; ty++) for (let tx = 0; tx < map.cols; tx++) {
        const id = hidden.has(ty * map.cols + tx) ? "dungeon_wall" : map.tiles[ty * map.cols + tx];
        g.fillStyle = map.propTiles && map.propTiles[ty * map.cols + tx] ? "#241e2e" : PLACEHOLDER[id] || "#777";
        g.fillRect(tx * MINI, ty * MINI, MINI, MINI);
      }
    }
    miniCtx.clearRect(0, 0, mini.width, mini.height);
    miniCtx.drawImage(miniBase, 0, 0);
    const k = MINI / TILE;
    miniCtx.strokeStyle = "rgba(255, 255, 255, .85)";
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(Math.round(drawn.x * k) + 0.5, Math.round(Math.max(0, drawn.y) * k) + 0.5, Math.round(viewport.w * k) - 1, Math.round(Math.min(viewport.h, viewport.h + drawn.y) * k) - 1);
    const dot = (c, color) => { if (!c || (c.fainted && !c.act)) return; miniCtx.fillStyle = "#1b1420"; miniCtx.fillRect(Math.round(c.x * k) - 3, Math.round(c.y * k) - 3, 6, 6); miniCtx.fillStyle = color; miniCtx.fillRect(Math.round(c.x * k) - 2, Math.round(c.y * k) - 2, 4, 4); };
    for (const p of v.pickups || []) { // hint cards lying about
      miniCtx.fillStyle = "#1b1420";
      miniCtx.fillRect(Math.round(p.x * k) - 2, Math.round(p.y * k) - 2, 5, 5);
      miniCtx.fillStyle = "#ffd54a";
      miniCtx.fillRect(Math.round(p.x * k) - 1, Math.round(p.y * k) - 1, 3, 3);
    }
    dot(v.foe, "#ff5a5a");
    dot(v.me, "#7fd3ff");
  }

  /** Follow the player's creature: a small lead where it is going, kept inside the arena (centred when it all fits). */
  function moveCamera(dt) {
    const me = v.me;
    if (cam.at && dt > 0) {
      const jump = Math.hypot(me.x - cam.at.x, me.y - cam.at.y) > 40; // stepped in somewhere else: no lead from that
      const vx = jump ? 0 : (me.x - cam.at.x) / dt, vy = jump ? 0 : (me.y - cam.at.y) / dt;
      // smoothed slowly (about 0.4 s), so running into a wall, edging round a corner or being knocked back by a hit
      // eases the lead away instead of swinging the view
      const k = Math.min(1, dt * 2.5);
      cam.vx += (vx - cam.vx) * k;
      cam.vy += (vy - cam.vy) * k;
    }
    cam.at = { x: me.x, y: me.y };
    const lead = { x: Math.max(-36, Math.min(36, cam.vx * LEAD)), y: Math.max(-24, Math.min(24, cam.vy * LEAD)) };
    const clampTo = (want0, size, lo, hi) => (hi - lo <= size ? lo + (hi - lo - size) / 2 : Math.max(lo, Math.min(hi - size, want0)));
    const tx = clampTo(me.x + lead.x - viewport.w / 2, viewport.w, 0, W);
    const ty = clampTo(me.y - 24 + lead.y - viewport.h / 2, viewport.h, -TOP, H);
    if (!cam.ready) { cam.x = tx; cam.y = ty; cam.ready = true; return; }
    const f = 1 - Math.exp(-dt * FOLLOW);
    cam.x += (tx - cam.x) * f;
    cam.y += (ty - cam.y) * f;
  }

  /** A hint card lying on the arena: its picture bobbing over a small shadow, with a glint now and then. */
  function drawPickup(p, now) {
    const x = Math.round(p.x), y = Math.round(p.y);
    const bob = Math.round(Math.sin(now / 260 + p.id) * 2);
    ctx.fillStyle = "rgba(0, 0, 0, .28)";
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const img = want("icon/hint.png");
    if (img) ctx.drawImage(img, x - 8, y - 22 + bob);
    else { ctx.fillStyle = "#ffd54a"; ctx.fillRect(x - 5, y - 20 + bob, 10, 12); }
    if ((now + p.id * 700) % 1600 < 260) { // the glint
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 4, y - 22 + bob, 5, 1);
      ctx.fillRect(x + 6, y - 24 + bob, 1, 5);
    }
  }

  function drawProp(p) {
    const info = PROPS[p.id];
    const img = info && want(info.art);
    const footW = p.w * TILE;
    const cx = p.x * TILE + footW / 2;
    const bottom = (p.y + 1) * TILE;
    if (img) {
      ctx.save();
      ctx.translate(Math.round(cx), bottom);
      if (p.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, -Math.round(img.width / 2), -img.height);
      ctx.restore();
      return;
    }
    const [w, hgt] = (info && info.size) || [16, 16];
    ctx.fillStyle = "#3b3347";
    ctx.fillRect(Math.round(cx - w / 2) + 1, bottom - hgt + 2, w - 2, hgt - 2);
    ctx.fillStyle = "rgba(255, 255, 255, .15)";
    ctx.fillRect(Math.round(cx - w / 2) + 2, bottom - hgt + 3, w - 4, 2);
  }

  /** A warning on the ground: a circle (an area: what is inside it is hit) or a strip (a beam or a shot's line). */
  function warnShape(side, shape, alpha) {
    ctx.fillStyle = side === "me" ? `rgba(255, 213, 74, ${alpha})` : `rgba(255, 64, 64, ${alpha})`;
    if (shape.r && !shape.len) {
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const dx = shape.dx ?? (shape.dir && shape.dir.x), dy = shape.dy ?? (shape.dir && shape.dir.y);
    if (!Number.isFinite(dx) || !shape.len) return;
    const w = shape.width || 8;
    ctx.save();
    ctx.translate(shape.x, shape.y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillRect(0, -w / 2, shape.len, w);
    ctx.restore();
  }

  function drawCreature(side, now) {
    const c = v[side];
    const i = v.index[side];
    const f = team(side)[i];
    if (!f) return;
    if (c.fainted && (!c.act || c.act.t > 0.17)) return; // the faint cloud covers it from its 3rd frame; the next steps in shortly
    const actT = c.act ? Math.min(7, Math.floor(c.act.t * 8)) / 8 : 0;
    // Walking when it moves (a winged creature flies its dashes), else breathing and now and then blinking.
    const pose = c.act ? { anim: "idle", frame: 0, act: c.act.kind, t: actT, eyes: "open" }
      : c.moving ? animAt(f.look, c.dashing ? "fly" : "walk", now) : animAt(f.look, "idle", now, side === "me" ? 0 : 1);
    const img = creatureFrame(side, f, i, pose);
    const shadow = art.get("fx/shadow_m.png");
    ctx.save();
    if (c.grace) ctx.globalAlpha = Math.floor(now / 90) % 2 ? 0.45 : 1; // just stepped in: it can't be hit yet
    ctx.translate(Math.round(c.x), Math.round(c.y));
    if (shadow && !(c.act && c.act.kind === "faint")) ctx.drawImage(shadow, -Math.round(shadow.width / 2), -Math.floor(shadow.height / 2));
    if (c.face < 0) ctx.scale(-1, 1);
    if (img) drawLiving(ctx, img, f.look, now); // (as drawImage(img, -FRAME / 2, -FRAME), with a colouring's particles)
    ctx.restore();
    const charge = c.charging && fx("charge", c.type);
    if (charge) drawFx(charge, "charge", loopFrame("charge", charge, now), c.x, c.y - BODY_UP);
    const has = (id) => c.statuses.some((s) => s.id === id);
    const guard = has("guard") && fx("guard");
    if (guard) drawFx(guard, "guard", loopFrame("guard", guard, now, 2, 3), c.x, c.y - BODY_UP); // the bubble holds while the guard lasts
    const slow = has("slow") && fx("delay");
    if (slow) drawFx(slow, "delay", loopFrame("delay", slow, now), c.x, c.y - 70);
    if (c.dashing && Math.random() < 0.5) play("dust", null, c.x - c.face * 8, c.y);
    // what the ground is doing to it (wet, burning...): two of its particles drifting round the upper body
    for (const s of c.statuses) {
      const img2 = s.ground && want(`battle/fx/status_${s.id}.png`);
      if (!img2) continue;
      const f2 = { img: img2, frames: Math.max(1, Math.round(img2.width / img2.height)) };
      for (let k = 0; k < 2; k++) {
        const a = now / 700 + k * Math.PI + (side === "me" ? 0 : 1);
        drawFx(f2, "status", loopFrame("status", f2, now + k * 240), c.x + Math.cos(a) * 13, c.y - 30 + Math.sin(a * 1.3) * 8);
      }
    }
  }

  /** Something in flight or landing: a shot (drawn a little off the ground, its shadow under it), a beam, an area. */
  const trailAt = new Map(); // shot id -> where it last dropped a trail bit
  function drawFlying(p, now) {
    const lift = 12;
    const dir = p.dir || { x: 1, y: 0 };
    if (p.kind === "projectile") {
      const f = fx("projectile", p.element);
      ctx.fillStyle = "rgba(0, 0, 0, .25)";
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 1, 6, 2);
      if (!f) { ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y - lift) - 2, 4, 4); return; }
      const last = trailAt.get(p.id);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 8) {
        trailAt.set(p.id, { x: p.x, y: p.y });
        if (last) trails.push({ x: p.x - dir.x * 7, y: p.y - lift - dir.y * 7, t: 0, element: p.element });
      }
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y - lift));
      if (dir.x < 0) ctx.scale(-1, 1);
      ctx.rotate(Math.atan2(dir.y, Math.abs(dir.x))); // the art flies right: turned toward where it goes
      drawFx(f, "projectile", loopFrame("projectile", f, now), 0, 0);
      ctx.restore();
    } else if (p.kind === "beam") {
      const f = fx("beam", p.element);
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y - lift / 2));
      if (dir.x < 0) ctx.scale(-1, 1);
      ctx.rotate(Math.atan2(dir.y, Math.abs(dir.x)));
      if (f) {
        const size = f.img.height;
        const k = loopFrame("beam", f, now);
        for (let at = 0; at < p.len; at += size) { // every copy on the same frame; the last cut to length
          const w = Math.min(size, p.len - at);
          ctx.drawImage(f.img, k * size, 0, w, size, Math.round(at), -size / 2, w, size);
        }
      } else { ctx.fillStyle = "rgba(255, 255, 255, .85)"; ctx.fillRect(0, -(p.width || 8) / 4, p.len, (p.width || 8) / 2); }
      ctx.restore();
    } else if (p.kind === "area") {
      const f = fx("burst", p.element);
      if (f) { const k = frameAt(FX_INFO.burst, f.frames, (p.t || 0) * 900); if (k >= 0) drawFx(f, "burst", k, p.x, p.y); }
      else { ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - (p.t || 0))})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r || 20, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // ----- the HUD -----
  const hud = { key: "" };
  function paintHud() {
    for (const side of ["me", "foe"]) {
      const c = v[side];
      const card = $(`.lb-card.${side}`);
      const f = team(side)[v.index[side]];
      const pct = Math.max(0, Math.round((c.hp / c.max) * 100));
      const bar = card.querySelector(".hud-bar i");
      bar.style.width = `${pct}%`;
      card.classList.toggle("low", pct <= 20);
      const key = `${v.index[side]}|${c.type}`;
      if (card.dataset.key !== key) {
        card.dataset.key = key;
        const who = card.querySelector(".lb-who");
        const own = f.name || (side === "foe" && (setup.mode === "friend" || setup.mode === "gym") && setup.rival ? setup.rival.name : "");
        who.textContent = own || (side === "me" ? t("Your creature") : setup.mode === "wild" ? t("Wild creature") : t("Rival"));
        if (own) who.setAttribute("translate", "no"); else who.removeAttribute("translate"); // a name is never translated
        // The element's picture, made as an element: a friend's creature came from their device, so its
        // type is never put into HTML (and one the game doesn't have shows no picture).
        const elBox = card.querySelector(".lb-el");
        elBox.replaceChildren();
        if (isType(c.type)) {
          const img = iconEl(`type_${c.type}`, 16);
          img.title = t(TYPES[c.type].name);
          elBox.append(img);
        }
      }
      const pips = card.querySelector(".lb-pips");
      const alive = v.teams[side].map((m) => m.hp > 0);
      const pk = alive.join();
      if (pips.dataset.k !== pk) {
        pips.dataset.k = pk;
        pips.innerHTML = alive.map((up) => icon(up ? "ui/pip_on" : "ui/pip_off", 16)).join("");
        pips.title = t("{0} of {1} still standing", alive.filter(Boolean).length, alive.length);
      }
    }
    // The ground under the player's creature, and what it does: always two lines high (the full text in its
    // title), so the arena above never changes size as the creature walks from one ground to another.
    const tr = TERRAIN[v.me.terrain];
    const gk = tr ? tr.id : "";
    if (hud.ground !== gk) {
      hud.ground = gk;
      const box = $(".lb-ground");
      box.innerHTML = "";
      box.title = tr ? `${tr.name}: ${tr.text}` : "";
      if (tr) {
        const line = h(`<span class="lb-ground-in"></span>`);
        const sw = h(`<span class="lb-swatch"></span>`);
        const img = art.get(tr.art.fill);
        if (img) sw.style.backgroundImage = `url("${ART}${tr.art.fill}")`; else sw.style.background = PLACEHOLDER[tr.id] || "#777";
        const name = h(`<strong></strong>`);
        name.textContent = tr.name;
        line.append(sw, name);
        for (const [list, cls] of [[tr.likes || [], "up"], [tr.hinders || [], "down"]]) {
          for (const e of list) {
            const tag = h(`<span class="lb-tag ${cls}"><img class="px-icon" width="16" height="16" alt="" src="${ART}icon/type_${e}.png"></span>`);
            tag.title = cls === "up" ? t("Good for {0}", t(TYPES[e].name)) : t("Bad for {0}", t(TYPES[e].name));
            tag.append(cls === "up" ? "+" : "−");
            line.append(tag);
          }
        }
        const what = h(`<span class="muted"></span>`);
        what.textContent = tr.text;
        line.append(what);
        box.append(line);
      }
    }
    const combo = $(".lb-combo");
    combo.hidden = !v.combo;
    if (v.combo) combo.textContent = `×${COMBO[Math.min(COMBO.length - 1, v.combo)]}`;
    const cards = $(".lb-hints"); // the hint cards picked up this battle
    if (cards.dataset.n !== String(v.hints)) {
      cards.dataset.n = String(v.hints);
      cards.hidden = !v.hints;
      cards.innerHTML = `${icon("hint")}`;
      cards.append(`×${v.hints}`);
      cards.title = t("Hint ({0})", v.hints);
    }
    paintMoves();
  }

  // The four moves, in their places. Built once a creature steps in; their wait and reach are kept up to date.
  let moveEls = [];
  function buildMoves() {
    const box = $(".lb-moves");
    box.innerHTML = "";
    const me = b.mine[v.index.me];
    moveEls = PLACES.map((place) => {
      const id = me.moves[place.slot];
      // a banner in its element's colour: the button or key at its round end, the name, then the element in a pill and
      // the move's power (or its wait, or why it can't be used now), its picture by the slanted end
      const btn = h(`<button type="button" class="lb-move"><span class="lb-key"></span>
        <span class="lb-mt"><strong></strong><span class="lb-sub"><span class="lb-pill"></span><span class="lb-cd"></span></span></span>
        <span class="lb-mi"></span></button>`);
      if (!id) { btn.disabled = true; btn.classList.add("empty"); box.append(btn); return { btn, id: null, place }; }
      const m = moveById(id);
      const element = elementOf(m, me);
      if (element) btn.classList.add(`el-${element}`);
      btn.querySelector(".lb-mi").innerHTML = icon(moveIcon(m), 32);
      btn.querySelector("strong").textContent = m.name;
      // the pill: the element's name (a move of no element: its style, "Guard", "Strike"...)
      btn.querySelector(".lb-pill").textContent = element ? TYPES[element].name : MOVE_STYLES[m.style].name;
      btn.title = `${moveLine(m)}. ${moveHelp(m)}`;
      btn.addEventListener("click", () => use(place.slot));
      box.append(btn);
      return { btn, id, place, last: "" };
    });
    paintKeys();
  }
  // Why a move can't be used, said on its button.
  const WHY = { stunned: "Stunned", "used up": "Used up", fainted: "", busy: "", over: "" };
  function paintMoves() {
    for (const m of moveEls) {
      if (!m.id) continue;
      const s = v.moves.find((x) => x.id === m.id);
      if (!s) continue;
      const cooling = s.why === "cooldown" || s.left > 0;
      const share = cooling ? Math.min(1, s.left / Math.max(0.01, s.total)) : s.ready ? 0 : 0.35;
      const key = `${Math.round(share * 50)}|${s.why}|${s.inRange}|${s.uses}`;
      if (key === m.last) continue;
      m.last = key;
      m.btn.style.setProperty("--cd", String(share));
      m.btn.classList.toggle("waiting", !s.ready);
      m.btn.classList.toggle("far", s.ready && s.inRange === false);
      // beside the pill: its wait (a clock and the seconds), or why it can't be used now, or else its power
      const cd = m.btn.querySelector(".lb-cd");
      const mv = moveById(m.id);
      if (s.why === "cooldown") cd.innerHTML = `${icon("clock")} ${Math.ceil(s.left)}`;
      else cd.textContent = WHY[s.why] !== undefined ? t(WHY[s.why]) || ""
        : s.inRange === false ? t("Out of range") : s.uses !== null && s.uses !== undefined ? t("{0} left", s.uses)
          : mv.kind === "attack" ? t("Power {0}", mv.power) : "";
    }
  }

  // What each place's button is called on this device: the controller's button, the key, or nothing (a finger).
  let device = matchMedia("(pointer: coarse)").matches ? "touch" : "keys";
  function keyLabel(place) {
    if (device === "pad") {
      const full = fullMap(controllerSetting());
      const input = full.battle && full.battle[place.action];
      if (!input) return "";
      const { kind, standard } = padStyle();
      const face = { b0: "a", b1: "b", b2: "x", b3: "y" }[input];
      return `<b class="pl-key${kind === "xbox" && face ? ` pl-${face}` : ""}" translate="no">${inputName(input, kind, standard)}</b>`;
    }
    if (device === "keys") return `<b class="pl-key" translate="no">${place.keys[0].toUpperCase()}</b>`;
    return "";
  }
  function paintKeys() {
    for (const m of moveEls) m.btn.querySelector(".lb-key").innerHTML = keyLabel(m.place);
    for (const [i, btn] of quizButtons.entries()) btn.querySelector(".lb-key").innerHTML = keyLabel(PLACES[i]);
    $(".lb-help").textContent = device === "touch" ? t("Drag on the arena to move. Tap a move to use it.")
      : device === "pad" ? t("Left stick or D-pad: walk. The buttons use your moves.")
        : t("Walk with W A S D or the arrow keys, or click where to go. Moves: U I J K (or 1 2 3 4).");
  }
  function setDevice(d) { if (d !== device) { device = d; paintKeys(); } }

  // ----- the question: the action freezes until it is answered or the 5 seconds run out -----
  let quizButtons = [];
  let quizShown = null;     // the quiz being shown
  let holdUntil = 0;        // after an answer the world waits a moment, so the right answer can be seen
  function showQuiz(quiz) {
    quizShown = quiz;
    const q = quiz.q;
    const m = moveById(quiz.move);
    const box = $(".lb-quiz");
    box.innerHTML = "";
    const panel = h(`<div class="lbq">
      <div class="lbq-head"><span class="lbq-move"></span><span class="lbq-left" translate="no"></span></div>
      <div class="lbq-bar"><i></i></div>
      <div class="lbq-ask"></div>
      <div class="lbq-prompt"></div><div class="lbq-sentence" dir="auto"></div>
      <div class="lbq-options"></div>
      <div class="lbq-foot"><button type="button" class="ghost small lbq-hint" hidden></button><span class="lbq-verdict" hidden></span></div>
    </div>`);
    panel.querySelector(".lbq-move").innerHTML = icon(moveIcon(m), 16);
    panel.querySelector(".lbq-move").append(" ", m.name);
    panel.querySelector(".lbq-ask").textContent = q.reverse ? t("Which of your words means this?") : t("What does this mean?");
    const prompt = panel.querySelector(".lbq-prompt");
    prompt.textContent = q.prompt;
    setLang(prompt, detectLanguage(q.prompt));
    panel.querySelector(".lbq-sentence").textContent = q.sentence || "";
    quizButtons = PLACES.map((place, i) => {
      const btn = h(`<button type="button" class="lbq-opt"><span class="lb-key"></span><span class="lbq-text" dir="auto"></span></button>`);
      const text = btn.querySelector(".lbq-text");
      text.textContent = q.options[i] ?? "";
      if (q.options[i]) setLang(text, detectLanguage(q.options[i]));
      if (q.options[i] === undefined) btn.disabled = true;
      btn.addEventListener("click", () => choose(i));
      panel.querySelector(".lbq-options").append(btn);
      return btn;
    });
    const hint = panel.querySelector(".lbq-hint");
    if (b.hints > 0) { // the hint cards picked up on the arena this battle
      hint.hidden = false;
      hint.innerHTML = `${icon("hint")} `;
      hint.append(t("Hint ({0})", b.hints));
      hint.addEventListener("click", useHint);
    }
    box.append(panel);
    box.hidden = false;
    paintKeys();
    paintQuizTimer();
  }
  function paintQuizTimer() {
    const quiz = b.quiz;
    if (!quiz || !quizShown) return;
    const share = Math.max(0, quiz.timeLeft / quiz.total);
    const bar = $(".lbq-bar i");
    bar.style.width = `${share * 100}%`;
    bar.className = share < 0.2 ? "late" : share < 0.4 ? "soon" : "";
    $(".lbq-left").textContent = `${Math.ceil(quiz.timeLeft)}`;
  }
  function useHint() {
    if (!spendHint(b)) return;
    $(".lbq-hint").hidden = true;
    const q = b.quiz.q;
    const wrong = quizButtons.map((_, i) => i).filter((i) => i !== q.answer && !quizButtons[i].disabled).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const i of wrong) { quizButtons[i].disabled = true; quizButtons[i].classList.add("out"); }
  }
  function choose(i) {
    if (!b.quiz || !quizShown || quizButtons[i]?.disabled) return;
    settle(answer(b, i), i);
  }
  /** The question is over (answered, or out of time): show how it went, then carry on. */
  function settle(events, choice) {
    const q = quizShown.q;
    quizShown = null;
    const correct = choice !== null && choice === q.answer;
    if (choice !== null) sayAnswer(q);
    for (const btn of quizButtons) btn.disabled = true;
    quizButtons[q.answer]?.classList.add("right");
    if (choice !== null && !correct) quizButtons[choice]?.classList.add("wrong");
    const verdict = $(".lbq-verdict");
    verdict.hidden = false;
    verdict.className = `lbq-verdict ${correct ? "ok" : "no"}`;
    verdict.textContent = correct ? t("Right!") : choice === null ? t("Too slow: failed") : t("Wrong answer: failed");
    $(".lbq-bar i").style.width = correct ? $(".lbq-bar i").style.width : "0%";
    sfx(correct ? "common" : "surprise");
    const r = answerQuestion(game, q.uid, correct);
    if (isChallengeWord(q.uid)) delete game.review[q.uid]; // a challenge's word the player doesn't have: answered, not kept
    if (r.graduated) { graduated++; toast(t("That word is now well known: +{0} XP", WELL_KNOWN_XP)).prepend(h(icon("star")), " "); }
    if (r.retentionBonus) toast(t("Accurate all week: +60 XP and 5 coins")).prepend(h(icon("goal")), " ");
    holdUntil = performance.now() + (correct ? 450 : 1300);
    pending = events;
    setTimeout(() => { if (!closed && !b.quiz) $(".lb-quiz").hidden = true; }, correct ? 450 : 1300);
  }
  let pending = null; // what happened as the question closed, shown once the world carries on
  let graduated = 0;

  // ----- events: what the engine says happened, shown -----
  const floats = []; // {el, x, y, until}: words over the arena, kept on their spot in the world as the camera moves
  function float(text, x, y, cls) {
    const span = h(`<span class="lb-float ${cls}"></span>`);
    span.textContent = text;
    $(".lb-floats").append(span);
    floats.push({ el: span, x, y, until: performance.now() + 1300 });
    placeFloats();
  }
  function placeFloats() {
    const now = performance.now();
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      if (now > f.until) { f.el.remove(); floats.splice(i, 1); continue; }
      f.el.style.left = `${((f.x - drawn.x) / viewport.w) * 100}%`;
      f.el.style.top = `${((f.y - drawn.y) / viewport.h) * 100}%`;
    }
  }
  let bannerTimer = 0;
  function banner(text, ms = 1400) {
    const el2 = $(".lb-banner");
    el2.textContent = text;
    el2.hidden = false;
    el2.classList.remove("go");
    void el2.offsetWidth;
    el2.classList.add("go");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el2.hidden = true; }, ms);
  }
  const whose = (side) => (side === "me" ? t("Your creature") : setup.mode === "wild" ? t("The wild creature") : setup.mode === "gym" ? t("The leader's creature") : t("Your rival's creature"));
  function show(events) {
    for (const ev of events || []) {
      const x = ev.x ?? 0, y = ev.y ?? 0;
      switch (ev.kind) {
        case "step": play("dust", null, x - (v[ev.side]?.face || 1) * 4, y, { flip: (v[ev.side]?.face || 1) < 0 }); break;
        case "attack": sfx("common"); break;
        case "pickup": float(t("Hint card!"), x, y - 30, "strong"); play("power", null, x, y); sfx("lucky"); break;
        case "hit": {
          play("impact", ev.element, x, y - BODY_UP);
          numbers.push({ text: `-${ev.dmg}`, x, y: y - 44, t: 0, color: ev.mult > 1 ? "#ffd54a" : ev.mult < 1 ? "#a9b8d6" : "#ffffff" });
          if (ev.guarded) play("guard", null, x, y - BODY_UP, { range: [4, 5] }); // the bubble breaks
          if (ev.mult > 1) float(t("Strong hit!"), x, y - 58, "strong");
          else if (ev.mult < 1) float(t("Weak hit"), x, y - 58, "weak");
          shake = ev.target === "me" ? 0.18 : 0.1;
          sfx(ev.mult > 1 ? "lucky" : "common");
          break;
        }
        case "failed": play("miss", null, x, y - BODY_UP); float(t("Failed"), x, y - 66, "failed"); if (ev.side === "me") sfx("surprise"); break;
        case "miss":
          if (ev.why === "range") break;
          play("miss", null, x, y - 8);
          if (ev.why === "dodged") float(ev.side === "foe" ? t("Dodged!") : t("Missed"), x, y - 50, "missed");
          break;
        case "charge": sfx("lucky"); break;
        case "refused": nope(ev.move); break;
        case "heal": play("heal", null, x, y); numbers.push({ text: `+${ev.amount}`, x, y: y - 46, t: 0, color: "#7dffb0" }); break;
        case "guard": play("guard", null, x, y - BODY_UP, { range: [0, 1] }); break; // it forms; it holds while the guard lasts
        case "boost": play("power", null, x, y); break;
        case "interrupt": play("interrupt", null, x, y - BODY_UP); float(t("Cut short!"), x, y - 58, "strong"); break;
        case "terrain-change":
          for (const tile of ev.tiles || []) play("terrain", null, tile.c * TILE + 8, tile.r * TILE + 8);
          setTimeout(() => { groundDirty = true; miniBase = null; }, 240); // the new ground shows on the effect's flash (its 4th frame)
          if (TERRAIN[ev.terrain]) banner(t("{0}: {1}", whose(ev.side), TERRAIN[ev.terrain].name), 1200);
          break;
        case "terrain-tick": numbers.push({ text: ev.heal ? `+${ev.heal}` : `-${ev.dmg}`, x, y: y - 46, t: 0, color: ev.heal ? "#7dffb0" : "#ff9a6a" }); break;
        case "trap": // the dungeon's spikes or a swinging axe
          play("impact", null, x, y - (ev.trap === "spikes" ? 6 : BODY_UP));
          numbers.push({ text: `-${ev.dmg}`, x, y: y - 44, t: 0, color: "#ff9a6a" });
          shake = ev.side === "me" ? 0.16 : 0.08;
          sfx("common");
          break;
        case "wall-open": // a cracked wall broken open: rubble where it stood, and the room behind it shows
          for (const tile of ev.tiles || []) {
            play("dust", null, tile.c * TILE + 8, tile.r * TILE + 12);
            play("impact", "stone", tile.c * TILE + 8, tile.r * TILE + 6);
            (map.decals ||= []).push({ id: "rubble", v: (tile.c + tile.r) % 4, x: tile.c * TILE, y: tile.r * TILE, flip: tile.c % 2 === 1 });
          }
          groundDirty = true;
          miniBase = null;
          target = null;
          shake = 0.2;
          banner(t("A hidden room!"), 1400);
          sfx("lucky");
          break;
        case "faint": play("faint", null, x, y); banner(t("{0} is out!", whose(ev.side))); sfx("surprise"); break;
        case "swap": {
          const f = team(ev.side)[ev.index];
          warmUp(ev.side, ev.index);
          banner(f && f.name ? t("{0} steps in!", f.name) : t("{0} steps in!", whose(ev.side)));
          if (ev.side === "me") { v = view(b); buildMoves(); }
          break;
        }
        case "end": setTimeout(end, 900); break;
        default: break;
      }
    }
  }

  // ----- controls -----
  const held = new Set();  // steering keys down
  let pointer = null;      // {id, cx, cy} while a mouse button or a finger is down on the arena (cx, cy: where, on screen)
  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: drawn.x + ((e.clientX - r.left) / r.width) * viewport.w, y: drawn.y + ((e.clientY - r.top) / r.height) * viewport.h };
  };
  const clampWorld = (p) => ({ x: Math.max(4, Math.min(W - 4, p.x)), y: Math.max(4, Math.min(H - 2, p.y)) });
  const openedAt = performance.now(); // a tap in the first moment is the end of the one that opened the battle: the creature stands still
  canvas.addEventListener("pointerdown", (e) => {
    if (b.over || b.quiz || paused() || performance.now() - openedAt < 500) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setDevice(e.pointerType === "touch" || e.pointerType === "pen" ? "touch" : device === "pad" ? "keys" : device);
    pointer = { id: e.pointerId, cx: e.clientX, cy: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* the drag still ends on pointerup */ }
    target = clampWorld(toWorld(e));
    if (crackAt(b, target.x, target.y)) { pointer.crack = true; input(b, { open: target }); } // a cracked wall: go and break it open
    else input(b, { goTo: target });
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointer && e.pointerType === "mouse" && secrets.length) { const p0 = toWorld(e); canvas.style.cursor = crackAt(b, p0.x, p0.y) ? "pointer" : ""; }
    if (!pointer || pointer.id !== e.pointerId || b.quiz || pointer.crack) return;
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    const to = clampWorld(toWorld(e));
    if (target && Math.hypot(to.x - target.x, to.y - target.y) < 4) return; // a finger's small wobble: the same place
    target = to;
    input(b, { goTo: target });
  });
  const lift = (e) => { if (pointer && pointer.id === e.pointerId) pointer = null; };
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);

  function nope(id) { const m = moveEls.find((x) => x.id === id); if (!m) return; m.btn.classList.remove("nope"); void m.btn.offsetWidth; m.btn.classList.add("nope"); }
  /** A move's place pressed (a button, a key, the controller): its move, or in a question its answer. */
  function use(slot) {
    if (b.over || closed) return;
    if (b.quiz) { const i = PLACES.findIndex((p) => p.slot === slot); if (i >= 0) choose(i); return; }
    if (quizShown || performance.now() < holdUntil) return;
    const id = b.mine[v.index.me].moves[slot];
    if (!id) return;
    const s = v.moves.find((x) => x.id === id);
    if (s && !s.ready) { nope(id); return; }
    input(b, { attack: id });
  }
  const onKey = (e) => {
    if (closed || document.querySelector(".modal-back")) return;
    if (STEER_KEYS[e.code]) {
      setDevice("keys");
      if (!b.quiz) held.add(e.code);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    const place = PLACES.find((p) => p.keys.includes(k));
    if (place && !b.over) { setDevice("keys"); e.preventDefault(); use(place.slot); return; }
    if (k === "h" && b.quiz) { e.preventDefault(); useHint(); return; }
    if (k === "p" && !b.quiz) { e.preventDefault(); drinkPotion(); return; }
    if (e.key === "Escape" && !b.over) { e.preventDefault(); pause(); }
  };
  const onKeyUp = (e) => { held.delete(e.code); };
  const onBlur = () => held.clear();
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  // The controller: the left stick and the D-pad walk (read every frame); the face buttons are the four places.
  const slotOf = (action) => PLACES.find((p) => p.action === action).slot;
  const moveHint = (action) => () => {
    if (b.quiz) return t("Answer");
    const id = b.mine[v.index.me] && b.mine[v.index.me].moves[slotOf(action)];
    return id ? moveById(id).name : null;
  };
  const padAction = (action) => ({ run: () => { setDevice("pad"); use(slotOf(action)); }, hint: moveHint(action) });
  const walking = { run: () => setDevice("pad"), hint: () => null };
  let releasePad = controllerArea("battle", {
    move1: padAction("move1"), move2: padAction("move2"), move3: padAction("move3"), move4: padAction("move4"),
    walkUp: walking, walkDown: walking, walkLeft: walking, walkRight: walking,
    hint: { run: useHint, can: () => !!b.quiz && b.hints > 0 && !b.quiz.hinted },
    potion: { run: drinkPotion, can: () => canDrink() },
    help: { run: () => pause(true), hint: () => t("How to play") },
    pause: { run: () => pause(), hint: () => t("Pause") },
  });

  function steer() {
    let x = 0, y = 0;
    for (const code of held) { x += STEER_KEYS[code][0]; y += STEER_KEYS[code][1]; }
    const pad = padSteer();
    if (pad.x || pad.y) setDevice("pad");
    x += pad.x;
    y += pad.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return len > 0.05 ? { x, y } : null;
  }

  // ----- potions (battles with wild creatures only) -----
  const canDrink = () => v.potion && game.items.potion > 0 && !b.quiz && !v.me.fainted && v.me.hp < v.me.max;
  function drinkPotion() {
    if (!canDrink()) return;
    const amount = usePotion(b);
    if (!amount) return;
    game.items.potion--;
    saveGame();
    sfx("lucky");
    numbers.push({ text: `+${amount}`, x: v.me.x, y: v.me.y - 46, t: 0, color: "#7dffb0" });
    play("heal", null, v.me.x, v.me.y);
  }
  function paintExtra() {
    const box = $(".lb-extra");
    const can = canDrink();
    if (box.dataset.can === String(can)) return;
    box.dataset.can = String(can);
    box.innerHTML = "";
    if (!can) return;
    const btn = h(`<button type="button" class="lb-potion">${icon("potion")}<span></span></button>`);
    btn.title = t("Potion ({0}): half its health back, once a battle", game.items.potion);
    btn.lastElementChild.textContent = btn.title;
    btn.onclick = drinkPotion;
    box.append(btn);
  }

  // ----- pausing -----
  let pausedBy = 0; // how many things hold the battle still (the pause box, the window hidden)
  const paused = () => pausedBy > 0 || document.hidden;
  async function pause(help = false) {
    if (b.over || closed || pausedBy || b.quiz) return; // (a question can't be paused: its seconds are the point)
    pausedBy++;
    held.clear();
    const within = b.quizS === 5 ? t("Use a move with its button: a question about one of your words comes up and the battle waits. Answer within 5 seconds or the move fails.")
      : t("Use a move with its button: a question about one of your words comes up and the battle waits. Answer within {0} seconds or the move fails.", String(b.quizS));
    const text = `${t("Walk with the left stick, the D-pad, W A S D or the arrow keys, or click or drag on the arena.")} ${within} ${t("The ground matters: look under your creature to see what it does.")}`;
    const leave = await pauseBox(help ? t("How to play") : t("Paused"), text);
    pausedBy--;
    if (!leave || closed) return;
    saveGame(); // (the answers so far still count)
    close();
  }
  /** The pause box: how to play, "Carry on" (highlighted) or leave. Resolves to true to leave. */
  function pauseBox(title, text) {
    return new Promise((resolve) => {
      let leave = false;
      const m = openModal({ title, onClose: () => resolve(leave) });
      const p = h(`<p class="muted confirm-text"></p>`);
      p.textContent = text;
      const row = h(`<div class="confirm-buttons"><button type="button" class="ghost">Leave the battle</button><button type="button" class="primary">Carry on</button></div>`);
      row.firstElementChild.onclick = () => { leave = true; m.close(); };
      row.lastElementChild.onclick = () => m.close();
      m.body.append(p, row);
      row.lastElementChild.focus();
    });
  }
  $(".lb-pause").onclick = () => pause();
  // Going to another app or tab with a question open counts as running out of time (else the word could be
  // looked up meanwhile); without one, the battle simply waits (the frames stop while it can't be seen).
  const onHide = () => { if (document.hidden && b.quiz && quizShown) settle(answer(b, null), null); };
  document.addEventListener("visibilitychange", onHide);

  // ----- the end -----
  function end() {
    if (closed || $(".lb-end").innerHTML) return;
    releasePad(); // the end card's buttons are moved between with the D-pad, as anywhere
    releasePad = () => {};
    const result = battleResult(b);
    const pay = finishBattle(game, { ...result, wellKnown: graduated }); // its XP: the words made well known
    saveGame();
    announce({ type: "battle", xp: pay.xp, tier: result.won ? "lucky" : "common" });
    if (setup.mode === "friend" && setup.rival && setup.rival.id) {
      social.reportBattle(setup.rival.id, result.won, { rating: game.rating, ...(setup.folder ? { folder: setup.folder } : {}) }).catch((e) => toast(t("Couldn't tell {0}: {1}", setup.rival.name, e.message), { error: true }));
    }
    import("./friends-game.js").then((m) => m.publishNow(true));
    sfx(result.won ? "jackpot" : "surprise");
    for (const id of pay.badges) badgeToast(id);
    const answers = b.answers || { right: 0, wrong: 0 };
    const lines = [
      `+${pay.xp} XP${pay.coins ? ` · ${icon("coin")} ${pay.coins} coins` : ""}`,
      `${answers.right} right, ${answers.wrong} wrong${graduated ? ` · ${graduated} word${graduated === 1 ? "" : "s"} now well known` : ""}`,
      pay.rating ? `${icon("rating")} Skill ${pay.rating > 0 ? "+" : ""}${pay.rating} ${icon("arrow")} ${game.rating}` : "",
      pay.tags.includes("flawless") ? icon("trophy") + " Not one wrong answer: the Champion colouring and the move Perfect Form are now open." : "",
      pay.tags.includes("comeback") ? icon("trophy") + " Won from the brink: the Champion colouring and the move Second Wind are now open." : "",
      pay.egg ? icon("egg_mystery") + " The wild creature left you an egg." : "",
      pay.both ? `${icon("check")} A battle and your flashcards, both done today: +${pay.both.xp} XP · ${icon("coin")} ${pay.both.coins} coins` : "",
      ...gymLines(pay.gym),
    ].filter(Boolean);
    const box = $(".lb-end");
    const card = h(`<div class="lb-end-card"><h2>${result.won ? "You won!" : "You lost this one"}</h2><div class="lb-end-lines"></div>
      <div class="lb-end-buttons"><button type="button" class="primary" id="lb-again">Battle again</button><button type="button" id="lb-done">Done</button></div></div>`);
    for (const line of lines) { const p = document.createElement("div"); p.innerHTML = line; card.querySelector(".lb-end-lines").append(p); } // numbers and fixed text only
    box.append(card);
    box.hidden = false;
    card.querySelector("#lb-done").onclick = close;
    card.querySelector("#lb-again").onclick = () => { close(); (setup.again || openBattleMenu)(); };
    card.querySelector("#lb-again").focus({ preventScroll: true });
  }

  // ----- fitting the arena to the screen -----
  // The zoom (device pixels per game pixel) is picked once, when the battle opens, and kept for the whole fight (the
  // owner: the camera stays the same distance from the creature the entire fight). A new size of the screen only
  // changes how much of the arena shows; the zoom is picked again only if it would leave too small a window on the
  // world (a phone turned on its side).
  let zoom = 0;
  function fit() {
    const stage = $(".lb-stage");
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    const dpr = window.devicePixelRatio || 1;
    const dw = sw * dpr, dh = sh * dpr;
    if (!zoom || Math.floor(dw / zoom) < 220 || Math.floor(dh / zoom) < 160) {
      let best = null;
      for (let px = 1; px <= 10; px++) {
        const w = Math.floor(dw / px), h = Math.floor(dh / px);
        if (best && (w < 220 || h < 160)) break;
        const off = Math.abs(Math.max(w, h) - VIEW_LONG);
        if (!best || off < best.off) best = { px, off };
      }
      zoom = best.px;
    }
    const fullW = Math.floor(dw / zoom), fullH = Math.floor(dh / zoom);
    // never more than the arena (and the strip above it): then it all shows, centred
    const w = Math.min(fullW, W), h = Math.min(fullH, H + TOP);
    const resized = w !== viewport.w || h !== viewport.h;
    if (resized) {
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;
    }
    Object.assign(viewport, { w, h, s: zoom });
    // the rival attacks only from inside what the player can see (livebattle.js `sight`)
    const sight = { w: fullW, h: fullH };
    if (!b.sight || b.sight.w !== sight.w || b.sight.h !== sight.h) input(b, { sight });
    canvas.style.width = `${(w * zoom) / dpr}px`;
    canvas.style.height = `${(h * zoom) / dpr}px`;
    mini.style.width = `${Math.round(Math.max(72, Math.min(128, sw * 0.24)))}px`;
    if (resized) cam.ready = false; // a new window on the world: put it straight on the creature, no glide across the arena
  }
  const ro = new ResizeObserver(() => fit());
  ro.observe($(".lb-stage"));
  window.addEventListener("resize", fit);

  // ----- the loop -----
  let closed = false;
  let last = 0;
  function frame(now) {
    if (closed) return;
    if (!el.isConnected) { close(); return; } // its screen was taken away without closing it (another battle opened): stop
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!paused() && now >= holdUntil) {
      if (pending) { show(pending); pending = null; }
      const s = b.quiz ? null : steer();
      if (s) { target = null; input(b, { move: s }); } else input(b, { move: null });
      const events = step(b, dt);
      if (b.quiz && !quizShown) { held.clear(); showQuiz(b.quiz); }
      else if (!b.quiz && quizShown) settle(events, null); // the time ran out
      else show(events);
    }
    v = view(b);
    if (target && Math.hypot(v.me.x - target.x, v.me.y - target.y) < 5 && !pointer) target = null;
    if (!b.quiz && !paused()) moveCamera(dt);
    // a mouse button or finger held on the arena: what is under it changes as the camera follows, so it keeps steering
    if (pointer && !b.quiz && !paused()) {
      const to = clampWorld(toWorld({ clientX: pointer.cx, clientY: pointer.cy }));
      if (!target || Math.hypot(to.x - target.x, to.y - target.y) >= 4) { target = to; input(b, { goTo: target }); }
    }
    paintQuizTimer();
    draw(now, paused() ? 0 : dt);
    placeFloats();
    if (Math.floor(now / 50) !== Math.floor((now - dt * 1000) / 50) || !miniBase) paintMini();
    paintHud();
    paintExtra();
    requestAnimationFrame(frame);
  }

  function close() {
    if (closed) return;
    closed = true;
    player.stop();
    stopDevice();
    releasePad();
    ro.disconnect();
    window.removeEventListener("resize", fit);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onHide);
    el.remove();
  }

  warmUp("me", 0);
  warmUp("foe", 0);
  buildMoves();
  paintHud();
  fit();
  v = view(b);
  moveCamera(0);
  banner(t("Go!"), 900);
  requestAnimationFrame(frame);
  return { close, battle: b };
}

