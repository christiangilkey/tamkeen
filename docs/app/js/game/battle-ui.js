// The battle screens: the menu (the 100-word gate and the choice of words), the arena on its
// grid, the timeline, and the question panel. All the rules live in battle.js and rules.js; this
// file only shows them.

import { api, h, toast } from "../app.js";
import { confirmBox } from "../components/modal.js";
import { detectLanguage, setLang } from "../languages.js";
import { states } from "../review/deck.js";
import { AIMS, BADGES, BATTLE_FRAMES, BATTLE_UNLOCK_WORDS, HABITAT, MOVE_STYLES, SHADOW, SPECIES, TERRAIN, TYPES, aimOf, moveById, moveIcon } from "./data.js";
import { describe } from "./genome.js";
import { t, uiLanguage } from "../i18n.js";
import { LAST_WORDS, answerQuestion, battleWords, checkBadges, finishBattle, knownWords, pickQuestion, quizzable, retention, reviewSummary, weekNumber, weeklyRule } from "./rules.js";
import { COLS, COMBO, FAST_MS, QUESTION_MS, ROWS, act, area, battleResult, eligible, fighters, fits, knownScale, moveTo, newBattle, reachable,
  rentalPool, start, teamSize, timeline, usePotion, wildTeam, wouldHit } from "./battle.js";
import { FRAME, composeCreature, drawSheet, icon, loadImage } from "./render.js";
import { announce, getGame, saveGame, sfx } from "./game.js";
import * as social from "../social.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const [W, H] = HABITAT.size;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const THEMES = ["meadow", "oasis", "forest", "shore"];
const MODE_NAME = { last100: `Last ${LAST_WORDS} words`, unlimited: "Unlimited" };

/** A move in a few words, each translated on its own: "Strike · Power 45 · Straight line". `extra`
 * replaces the power for moves that don't attack (how many heals are left, what it does). */
export function moveLine(m, extra = null) {
  const what = m.kind === "attack" ? t("Power {0}", m.power) : extra || "";
  return [t(MOVE_STYLES[m.style].name), what, aimOf(m) === "self" ? "" : t(AIMS[aimOf(m)].name)].filter(Boolean).join(" · ");
}
/** What a move does and where it lands, in full (for a tooltip). */
export const moveHelp = (m) => `${t(MOVE_STYLES[m.style].text)} ${t(AIMS[aimOf(m)].name)}: ${t(AIMS[aimOf(m)].text)}`;

/** A small picture of a creature (a canvas element). */
export function portrait(genome, size = 72) {
  const c = h(`<canvas class="portrait" width="${FRAME}" height="${FRAME}" style="width:${size}px;height:${size}px"></canvas>`);
  composeCreature(describe(genome), { eyes: "open", mouth: "smile" }).then((frame) => {
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    if (frame) ctx.drawImage(frame, 0, 0);
  });
  return c;
}

function sheet(title) {
  document.querySelector(".game-sheet-wrap")?.remove();
  const wrap = h(`<div class="game-sheet-wrap"><div class="game-sheet" role="dialog">
    <div class="game-sheet-head"><strong></strong><span class="spacer"></span>
      <button type="button" class="ghost icon" data-close title="Close">${icon("close")}</button></div>
    <div class="game-sheet-body"></div></div></div>`);
  wrap.querySelector("strong").textContent = title;
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-close]")) wrap.remove(); });
  document.body.append(wrap);
  return { wrap, body: wrap.querySelector(".game-sheet-body") };
}

/** The saved words, and how many of them the owner knows (remembered in the flashcards, or well
 * known from battles). The count is kept in the game, so friends' Unlimited battles can use it. */
async function loadWords(game) {
  let vocab = [];
  let log = {};
  try { vocab = await api("/vocab"); } catch { /* shown as zero words */ }
  try { log = (await api("/reviews")).reviews || {}; } catch { /* counted from battles only */ }
  const learned = new Set([...states(log)].filter(([, card]) => card && card.known).map(([uid]) => uid));
  game.known = knownWords(game, vocab, learned);
  return vocab;
}

/** The choice of words for battles: two buttons, and what each means. */
export function wordModePicker(game, onChange = () => {}) {
  const box = h(`<div class="stack"><div class="pick-row b-wordmode"></div><p class="small muted"></p></div>`);
  const paint = () => {
    const row = box.querySelector(".pick-row");
    row.innerHTML = "";
    for (const mode of ["last100", "unlimited"]) {
      const b = h(`<button type="button" class="pick${game.battleMode === mode ? " on" : ""}"></button>`);
      b.textContent = MODE_NAME[mode];
      b.onclick = () => { game.battleMode = mode; saveGame(); paint(); onChange(); };
      row.append(b);
    }
    box.querySelector("p").textContent = game.battleMode === "unlimited"
      ? `Questions can be any word you have saved in this language. Your creatures grow stronger with the words you know: you know ${game.known}, so they fight at ×${knownScale(game.known).toFixed(2)} (×2 at most).`
      : `Questions come from the ${LAST_WORDS} words you saved most recently, and every creature fights at the same level: the fairest fight for everyone.`;
  };
  paint();
  return box;
}

/** The battle menu. Battles open once 100 words are saved: they are made of your own words. */
export async function openBattleMenu() {
  const game = getGame();
  const { wrap, body } = sheet("Battles");
  body.append(h(`<p class="muted">Loading your words…</p>`));
  const vocab = await loadWords(game);
  if (!wrap.isConnected) return;
  for (const id of checkBadges(game, { words: vocab.length })) badgeToast(id);
  saveGame();
  body.innerHTML = "";

  if (vocab.length < BATTLE_UNLOCK_WORDS) {
    body.append(h(`<div class="stack">
      <p><strong>Battles unlock at ${BATTLE_UNLOCK_WORDS} saved words.</strong> You have ${vocab.length}.</p>
      <div class="hud-bar goal"><i style="width:${Math.round((vocab.length / BATTLE_UNLOCK_WORDS) * 100)}%"></i></div>
      <p class="small muted">A battle is a review of your own vocab: each move you make is powered by a question about one of
        your saved words, and your rival answers from theirs. It takes about ${BATTLE_UNLOCK_WORDS} words for the questions to
        stay fresh. Save words with ★ while you listen and read.</p></div>`));
    return;
  }
  if (!pickQuestion(game, vocab)) {
    body.append(h(`<p>You have ${vocab.length} words saved, but only ${quizzable(vocab).length} have a meaning written in. Questions
      need meanings: open Vocab and fill some in, or save words from the definition popup (it fills the meaning in for you).</p>`));
    return;
  }
  const team = eligible(game);
  if (!team.length) {
    body.append(h(`<p>Your egg hasn't hatched yet. Reach today's goal to hatch it, then come back to battle.</p>`));
    return;
  }
  const sum = reviewSummary(game, vocab);
  const acc = retention(game);
  const rule = weeklyRule();
  body.append(h(`<div class="stack">
    <div class="today-chips">
      <span class="today-chip lit">${sum.due} word${sum.due === 1 ? "" : "s"} due</span>
      <span class="today-chip">${game.known} known</span>
      ${acc === null ? "" : `<span class="today-chip">${Math.round(acc * 100)}% right lately</span>`}
      <span class="today-chip">Skill ${game.rating}</span>
    </div>
    <p class="small muted">Battles happen on a small grid. On your turn, move your creature up to two squares (drag it, or tap a
      square), then choose a move and answer a question about one of your words: a right answer lands it, a wrong one misses.
      Answer within ${FAST_MS / 1000} seconds and a combo builds (×1.2, ×1.5, ×2). The timeline at the top shows who acts next.</p>
    <div><strong>Which words?</strong></div>
    <div id="b-wordmode"></div>
    <div class="battle-modes">
      <button type="button" class="battle-mode" id="b-wild"><strong>Wild encounter</strong>
        <span class="small muted">Your own creatures against wild ones. Their age gives yours a small edge here only.</span></button>
      <button type="button" class="battle-mode" id="b-rental"><strong>Rental duel</strong>
        <span class="small muted">Pick three of this week's six shared creatures; your rival gets the rest. Always an even fight. Counts for your skill rating.</span></button>
    </div>
    <p class="small muted">To challenge a friend's team, open <strong>Friends</strong> in the game menu. This week's rule for
      friend battles: <strong>${rule.name}</strong>. ${rule.text}</p>
    <div id="b-team" class="row"></div>
  </div>`));
  body.querySelector("#b-wordmode").append(wordModePicker(game));
  const size = Math.min(team.length, teamSize(null));
  for (const i of team.slice(0, size)) body.querySelector("#b-team").append(portrait(game.roster[i], 56));
  body.querySelector("#b-wild").onclick = () => {
    wrap.remove();
    const rand = Math.random;
    const scale = game.battleMode === "unlimited" ? knownScale(game.known) : 1;
    const mine = fighters(game, team.slice(0, size).map((i) => game.roster[i]), { wild: true, scale });
    const theirs = fighters(null, wildTeam(rand, mine.length));
    runBattle(newBattle({ mine, theirs, mode: "wild", foeForm: 0.55 + rand() * 0.25, rand }), vocab);
  };
  body.querySelector("#b-rental").onclick = () => pickRental(wrap, body, vocab);
}

/**
 * Challenge a friend's team. They aren't there: their creatures fight with the moves they chose,
 * and answer as accurately as their owner usually answers their own words. You answer yours.
 * In an Unlimited battle each side is as strong as the words its owner knows.
 */
export async function startFriendBattle(friend, profile) {
  const game = getGame();
  const rule = weeklyRule();
  const vocab = await loadWords(game);
  saveGame();
  if (vocab.length < BATTLE_UNLOCK_WORDS) { toast(`Battles unlock at ${BATTLE_UNLOCK_WORDS} saved words. You have ${vocab.length}.`); return; }
  if (!pickQuestion(game, vocab)) { toast("Your words need meanings before they can be asked. Fill some in on the Vocab page."); return; }
  const mineIdx = eligible(game, rule).slice(0, teamSize(rule));
  if (!mineIdx.length) { toast(`None of your creatures fit this week's rule (${rule.name}).`); return; }
  const theirTeam = ((profile && profile.team) || []).filter((g) => fits(g, rule)).slice(0, teamSize(rule));
  if (!theirTeam.length) { toast(`${friend.username} has no creatures that fit this week's rule (${rule.name}).`); return; }
  const unlimited = game.battleMode === "unlimited";
  const mine = fighters(game, mineIdx.map((i) => game.roster[i]), { rule, scale: unlimited ? knownScale(game.known) : 1 });
  const theirs = fighters(null, theirTeam, { rule, scale: unlimited ? knownScale(Math.min(100000, Number(theirTeam[0].known) || 0)) : 1 });
  for (const f of theirs) f.name = f.name || friend.username;
  runBattle(newBattle({ mine, theirs, mode: "friend", rule, foeForm: Number(profile.form) || 0.7,
    rival: { id: friend.id, name: friend.username, rating: Number(profile.rating) || 1000 } }), vocab);
}

function pickRental(wrap, body, vocab) {
  const game = getGame();
  const pool = rentalPool(weekNumber());
  const chosen = new Set();
  body.innerHTML = "";
  body.append(h(`<p>Choose three. Your rival fights with the other three.</p>`));
  const grid = h(`<div class="shop-grid"></div>`);
  const go = h(`<button type="button" class="primary" disabled>Start the duel</button>`);
  pool.forEach((g, i) => {
    const look = describe(g);
    const card = h(`<button type="button" class="shop-item rental"><span class="shop-pic"></span>
      <span class="shop-name">${TYPES[g.type].name}</span><span class="small muted">${SPECIES[look.species].name}</span></button>`);
    card.querySelector(".shop-pic").append(portrait(g, 64));
    card.onclick = () => {
      if (chosen.has(i)) chosen.delete(i); else if (chosen.size < 3) chosen.add(i);
      card.classList.toggle("on", chosen.has(i));
      go.disabled = chosen.size !== 3;
    };
    grid.append(card);
  });
  go.onclick = () => {
    wrap.remove();
    const mine = fighters(null, pool.filter((_, i) => chosen.has(i)));
    const theirs = fighters(null, pool.filter((_, i) => !chosen.has(i)));
    runBattle(newBattle({ mine, theirs, mode: "rental", foeForm: 0.7, rival: { id: null, name: "Rival", rating: game.rating } }), vocab);
  };
  body.append(grid, go);
}

export function badgeToast(id) {
  const b = BADGES.find((x) => x.id === id);
  if (b) toast(`Badge earned: ${b.name}`).prepend(h(icon("badge")));
}

// ---------- the arena ----------
// Where the grid sits in the scene: column centres, and the line each row's creatures stand on
// (the back row is higher up the picture).
const colX = (c) => Math.round(W / 2 + (c - (COLS - 1) / 2) * 52);
const rowY = (r) => 100 + r * 15;
const TILE = [48, 13];
const TERRAIN_COLOR = { grass: "#3f9a45", high: "#a08a62", puddle: "#3a7cc0", coals: "#c2482c", spring: "#58d2c6" };
const sameSquare = (p, q) => p && q && p.c === q.c && p.r === q.r;

function runBattle(b, vocab) {
  const game = getGame();
  const words = battleWords(vocab, game.battleMode);
  document.querySelector(".battle-wrap")?.remove();
  const el = h(`<div class="battle-wrap"><div class="battle">
    <div class="battle-top">
      <div class="b-hp" id="hp-me"><div class="b-name"></div><div class="hud-bar"><i></i></div><div class="b-pips"></div></div>
      <button type="button" class="ghost icon" id="b-quit" title="Leave the battle">${icon("close")}</button>
      <div class="b-hp right" id="hp-foe"><div class="b-name"></div><div class="hud-bar"><i></i></div><div class="b-pips"></div></div>
    </div>
    <div class="b-timeline" title="Who acts next: the further right, the later"><span class="small">Next</span><div class="b-tl-track"></div></div>
    <div class="battle-scene"><canvas width="${W}" height="${H}"></canvas><span class="b-combo" id="b-combo" hidden></span></div>
    <div class="b-log" id="b-log" aria-live="polite"></div>
    <div class="b-panel" id="b-panel"></div>
  </div></div>`);
  document.body.append(el);
  const $ = (q) => el.querySelector(q);
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const art = {};
  for (const layer of HABITAT.layers) loadImage(`habitat/${theme}/${layer}.png`).then((img) => { art[layer] = img; });
  for (const [k, f] of Object.entries({ shield: "battle/shield.png", heal: "battle/heal.png", boost: "battle/boost.png", faint: "battle/faint.png",
    glance: "battle/glance.png", sparkle: "fx/sparkle.png", surge: "fx/surge.png", dust: "fx/dust.png", digits: "ui/digits.png" })) loadImage(f).then((img) => { art[k] = img; });
  for (const size of Object.keys(SHADOW)) loadImage(`fx/shadow_${size}.png`).then((img) => { art[`shadow_${size}`] = img; });
  const hits = {};
  for (const t of Object.keys(TYPES)) loadImage(`battle/hit_${t}.png`).then((img) => { hits[t] = img; });

  // What the screen shows. The engine runs ahead (a whole turn's events at once); the view catches
  // up event by event, so health, squares and positions change when their moment is shown.
  const view = { idx: { me: 0, foe: 0 }, pos: {}, hp: new Map(), aims: { me: null, foe: null }, tiles: [] };
  const sync = () => {
    view.idx = { me: b.me, foe: b.foe };
    view.pos = { me: { ...b.mine[b.me].pos }, foe: { ...b.theirs[b.foe].pos } };
    for (const f of [...b.mine, ...b.theirs]) view.hp.set(f, f.hp);
    view.aims = { me: b.mine[b.me].charging ? b.mine[b.me].charging.tiles : null, foe: b.theirs[b.foe].charging ? b.theirs[b.foe].charging.tiles : null };
    view.tiles = b.tiles.slice();
  };
  sync();
  const cur = (side) => (side === "me" ? b.mine : b.theirs)[view.idx[side]];
  const hpOf = (f) => (view.hp.has(f) ? view.hp.get(f) : f.hp);
  const footOf = (side) => ({ x: colX(view.pos[side].c), y: rowY(view.pos[side].r) });

  const actor = { me: { dx: 0, dy: 0, alpha: 1, sink: 0, pose: "idle" }, foe: { dx: 0, dy: 0, alpha: 1, sink: 0, pose: "idle" } };
  const fx = [];      // {img, frames, x, y, t, speed}
  const numbers = []; // {text, x, y, t, color}
  const flashes = []; // squares that light up for a moment: {tiles, color, t}
  const frames = new Map();
  let input = null;   // while it is the player's turn: {reach, preview, drag: {x, y} | null, hover}
  // Damage and healing numbers in the game's own pixel digits (ui/digits.png: 8x10 glyphs, white), tinted.
  const GLYPHS = "0123456789+-x.,%!?kM";
  const labels = new Map();
  function pixelNumber(text, color) {
    const key = `${text}|${color}`;
    if (!labels.has(key) && art.digits && [...text].every((ch) => GLYPHS.includes(ch))) {
      const c = document.createElement("canvas");
      c.width = text.length * 6 + 2;
      c.height = 10;
      const g = c.getContext("2d");
      [...text].forEach((ch, i) => g.drawImage(art.digits, GLYPHS.indexOf(ch) * 8, 0, 8, 10, i * 6 - 1, 0, 8, 10));
      g.globalCompositeOperation = "source-in";
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      labels.set(key, c);
    }
    return labels.get(key) || null;
  }
  let closed = false;
  let asked = [];
  let graduated = 0;

  function frame(side, now) {
    const f = cur(side);
    const a = actor[side];
    const pose = { step: a.dx || a.dy ? Math.floor(now / 120) % 2 : 0, bob: Math.floor(now / 480 + (side === "me" ? 0 : 1)) % 2,
      eyes: a.pose === "hurt" ? "sad" : a.pose === "down" ? "blink" : a.pose === "attack" || (side === "me" && b.combo >= COMBO.length - 1) ? "happy" : "open",
      mouth: a.pose === "attack" ? "open" : a.pose === "hurt" || a.pose === "down" ? "sad" : "neutral" };
    const key = `${side}|${view.idx[side]}|${pose.step}|${pose.bob}|${pose.eyes}|${pose.mouth}`;
    if (!frames.has(key)) { frames.set(key, null); composeCreature(f.look, pose).then((c) => frames.set(key, c)); }
    const prefix = `${side}|${view.idx[side]}|`;
    return frames.get(key) || [...frames.entries()].find(([k, v]) => v && k.startsWith(prefix))?.[1] || null;
  }

  function drawTile(c, r, now) {
    const x = colX(c) - TILE[0] / 2;
    const y = rowY(r) - 7;
    const kind = view.tiles[r * COLS + c];
    ctx.fillStyle = "rgba(12, 8, 24, .55)"; // a dark base, so the squares read over any scene
    ctx.fillRect(x, y, TILE[0], TILE[1]);
    ctx.fillStyle = c < COLS / 2 ? "rgba(90, 160, 255, .3)" : "rgba(255, 110, 110, .28)";
    ctx.fillRect(x, y, TILE[0], TILE[1]);
    if (kind) {
      ctx.fillStyle = TERRAIN_COLOR[kind];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 1, y + 1, TILE[0] - 2, TILE[1] - 2);
      ctx.globalAlpha = 1;
      // A little pixel pattern so each kind reads at a glance.
      ctx.fillStyle = { grass: "#2a6b2f", high: "#d8c79c", puddle: "#8fc6ff", coals: "#ffb347", spring: "#e6fffb" }[kind];
      for (let i = 0; i < 6; i++) {
        const px = x + 4 + i * 8 + ((r + c) % 2) * 3;
        if (kind === "grass") ctx.fillRect(px, y + 3 + (i % 2), 1, 4);
        else if (kind === "high") ctx.fillRect(x + 1, y + 1, TILE[0] - 2, 1);
        else if (kind === "puddle") ctx.fillRect(px, y + 5 + (i % 2) * 3, 3, 1);
        else if (kind === "coals") { if ((Math.floor(now / 250) + i) % 3) ctx.fillRect(px, y + 4 + (i % 3) * 2, 2, 2); }
        else if (kind === "spring" && (Math.floor(now / 300) + i) % 4 === 0) ctx.fillRect(px, y + 3 + (i % 3) * 3, 1, 1);
      }
    }
    ctx.strokeStyle = "rgba(255, 255, 255, .45)";
    ctx.strokeRect(x + 0.5, y + 0.5, TILE[0] - 1, TILE[1] - 1);
  }
  const outline = (p, color, width = 1) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(colX(p.c) - TILE[0] / 2 + 0.5, rowY(p.r) - 6.5, TILE[0] - 1, TILE[1] - 1);
    ctx.lineWidth = 1;
  };
  const fill = (p, color) => { ctx.fillStyle = color; ctx.fillRect(colX(p.c) - TILE[0] / 2 + 1, rowY(p.r) - 6, TILE[0] - 2, TILE[1] - 2); };

  function draw(now) {
    if (closed) return;
    ctx.clearRect(0, 0, W, H);
    for (const layer of HABITAT.layers) if (art[layer]) ctx.drawImage(art[layer], 0, 0);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawTile(c, r, now);
    ctx.fillStyle = "rgba(255, 255, 255, .5)";
    ctx.fillRect(W / 2, rowY(0) - 8, 1, rowY(ROWS - 1) - rowY(0) + 16); // the line between the halves
    // A charge winding up shows where it will land, pulsing.
    const pulse = 0.25 + 0.2 * Math.sin(now / 120);
    for (const side of ["me", "foe"]) for (const p of view.aims[side] || []) fill(p, side === "me" ? `rgba(255, 213, 74, ${pulse})` : `rgba(255, 70, 70, ${pulse})`);
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += 1 / 60;
      if (f.t > 0.6) { flashes.splice(i, 1); continue; }
      for (const p of f.tiles) fill(p, f.color.replace("A", String(0.6 - f.t)));
    }
    if (input) {
      for (const p of input.reach) outline(p, "rgba(255, 255, 255, .9)");
      if (input.hover) outline(input.hover, "#ffd54a", 2);
      for (const p of input.preview || []) { fill(p, "rgba(255, 213, 74, .55)"); outline(p, "#ffd54a", 2); }
    }
    // Creatures, back row first.
    for (const side of ["me", "foe"].sort((x, y) => view.pos[x].r - view.pos[y].r)) {
      const img = frame(side, now);
      const a = actor[side];
      if (!img || a.alpha <= 0) continue;
      const dragging = side === "me" && input && input.drag;
      const foot = dragging ? input.drag : footOf(side);
      ctx.save();
      ctx.globalAlpha = a.alpha * (dragging ? 0.75 : 1);
      ctx.translate(Math.round(foot.x + a.dx), Math.round(foot.y + a.dy));
      if (side === "foe") ctx.scale(-1, 1);
      const shadow = art[`shadow_${cur(side).look.size}`];
      if (shadow) ctx.drawImage(shadow, -3 - Math.round(shadow.width / 2), -Math.floor(shadow.height / 2));
      ctx.drawImage(img, -FRAME / 2, -FRAME + Math.round(a.sink));
      ctx.restore();
      if (view.aims[side] && art.sparkle) drawSheet(ctx, art.sparkle, 4, (now / 70) % 4, foot.x + Math.sin(now / 150) * 12, foot.y - 34 + Math.cos(now / 130) * 8);
    }
    if (b.combo >= COMBO.length - 1 && !b.over) { // a surge: the charge crackles round the creature
      const foot = footOf("me");
      if (art.surge) drawSheet(ctx, art.surge, 6, (now / 80) % 6, foot.x - 3, foot.y - 28);
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += 1 / 60;
      if (f.t * f.speed >= f.frames) { fx.splice(i, 1); continue; }
      drawSheet(ctx, f.img, f.frames, f.t * f.speed, f.x, f.y);
    }
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.t += 1 / 60;
      if (n.t > 1) { numbers.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - n.t * n.t;
      const label = pixelNumber(n.text, n.color);
      const dark = label && pixelNumber(n.text, "#1b1420");
      if (label && dark) {
        const lx = Math.round(n.x - label.width / 2), ly = Math.round(n.y - n.t * 22 - 9);
        ctx.drawImage(dark, lx + 1, ly + 1);
        ctx.drawImage(label, lx, ly);
      } else {
        ctx.fillStyle = "#1b1420";
        ctx.fillText(n.text, n.x + 1, n.y - n.t * 22 + 1);
        ctx.fillStyle = n.color;
        ctx.fillText(n.text, n.x, n.y - n.t * 22);
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(draw);
  }

  function paintBars() {
    for (const side of ["me", "foe"]) {
      const f = cur(side);
      const box = $(`#hp-${side}`);
      box.querySelector(".b-name").textContent = `${f.name || (side === "me" ? "You" : b.mode === "wild" ? "Wild" : "Rival")} · ${TYPES[f.type].name}`;
      const pct = Math.round((hpOf(f) / f.max) * 100);
      const bar = box.querySelector("i");
      bar.style.width = `${pct}%`;
      bar.style.background = pct > 50 ? "" : pct > 20 ? "var(--brand-gold)" : "var(--alert)";
      const team = side === "me" ? b.mine : b.theirs;
      const pips = box.querySelector(".b-pips");
      pips.innerHTML = team.map((t) => icon(hpOf(t) > 0 ? "ui/pip_on" : "ui/pip_off", 16)).join("");
      pips.title = `${team.filter((t) => hpOf(t) > 0).length} of ${team.length} still standing`;
    }
    const chip = $("#b-combo");
    chip.hidden = b.combo === 0;
    chip.innerHTML = b.combo >= COMBO.length - 1 ? `${icon("surge")} SURGE ×${COMBO[b.combo]}` : `<i class="fx-combo-fire"></i> ×${COMBO[b.combo]}`;
    chip.classList.toggle("surge", b.combo >= COMBO.length - 1);
  }
  /** The timeline: the next turns, spaced by when they come. */
  function paintTimeline() {
    const track = $(".b-tl-track");
    track.innerHTML = "";
    if (b.over) return;
    const next = timeline(b, 6);
    const span = Math.max(1, next[next.length - 1].at);
    // Spaced by when each turn comes, but never on top of the one before; then fitted to the track.
    const lefts = [];
    for (const t of next) lefts.push(Math.max((t.at / span) * 84, lefts.length ? lefts[lefts.length - 1] + 14 : 0));
    const fit = Math.min(1, 84 / Math.max(1, lefts[lefts.length - 1]));
    next.forEach((t, i) => {
      const chip = h(`<span class="b-tl-chip ${t.side}${t.charging ? " charging" : ""}${i === 0 ? " now" : ""}"></span>`);
      chip.style.insetInlineStart = `${Math.round(lefts[i] * fit)}%`;
      chip.textContent = t.side === "me" ? "You" : b.mode === "wild" ? "Wild" : "Rival";
      if (t.charging) { chip.prepend(h(icon("surge")), " "); chip.title = `Winding up ${moveById(t.charging).name}`; }
      track.append(chip);
    });
  }
  const say = (text) => { $("#b-log").textContent = text; };
  // The battle log is put together from sentences, each translated on its own, then joined (with no
  // space in languages written without spaces). Names inside a sentence are passed translated;
  // a translation lowers their first letter itself where its language wants it ({0:lower}).
  const said = (...parts) => parts.filter(Boolean).join(["ja", "zh", "th"].includes(uiLanguage()) ? "" : " ");
  const who = (side) => (side === "me" ? t("Your creature") : b.mode === "wild" ? t("The wild creature")
    : b.mode === "friend" ? t("{0}'s creature", b.rival.name) : t("Your rival's creature"));
  // English lowers a name's first letter inside a sentence ("the wild creature", "hot coals"), but not a person's ("Sam's creature").
  const inside = (text) => (uiLanguage() === "en" && !/^\p{Lu}[^\s]*'s /u.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
  const named = (name) => t(name);

  async function slide(side, from, to) {
    const dx = colX(from.c) - colX(to.c);
    const dy = rowY(from.r) - rowY(to.r);
    view.pos[side] = { ...to };
    for (let i = 6; i >= 0; i--) { actor[side].dx = (dx * i) / 6; actor[side].dy = (dy * i) / 6; await wait(28); }
  }

  async function play(events) {
    for (const ev of events) {
      if (closed) return;
      const side = ev.side;
      const other = side === "me" ? "foe" : "me";
      if (ev.kind === "step") {
        await slide(side, ev.from, ev.to);
      } else if (ev.kind === "attack" || ev.kind === "dodge" || ev.kind === "miss") {
        if (view.aims[side] && view.aims[side].length && ev.kind !== "miss") view.aims[side] = null; // a charge lands
        const target = footOf(other);
        if (ev.kind === "miss") say(said(t("{0} tried {1}, but missed.", who(side), named(ev.name)), side === "me" && t("(A wrong answer misses.)")));
        else if (ev.kind === "dodge") say(t("{0} used {1}, but {2} wasn't there.", who(side), named(ev.name), inside(who(other))));
        else {
          say(said(t("{0} used {1}.", who(side), named(ev.name)),
            ev.mult > 1 ? t("It's strong against that element!") : ev.mult < 1 ? t("It's weak against that element.") : "",
            ev.guarded && t("Guarded."), ev.side === "me" && ev.surged && t("A surging hit!"),
            ev.interrupted && t("It cut {0} short!", named(moveById(ev.interrupted).name)), ev.delayed && t("Its next turn is pushed back.")));
        }
        actor[side].pose = "attack";
        const lunge = side === "me" ? 18 : -18;
        actor[side].dx = lunge;
        sfx(ev.kind === "attack" ? (ev.surged ? "lucky" : "common") : "surprise");
        await wait(200);
        actor[side].dx = 0;
        if (ev.kind === "dodge") {
          flashes.push({ tiles: ev.tiles || [], color: "rgba(255, 255, 255, A)", t: 0 });
          if (art.dust) fx.push({ img: art.dust, frames: 4, x: target.x, y: target.y - 8, t: 0, speed: 10 });
          await wait(450);
        } else if (ev.kind === "miss") {
          if (art.glance) fx.push({ img: art.glance, frames: BATTLE_FRAMES.glance, x: target.x, y: target.y - 26, t: 0, speed: 12 });
          await wait(500);
        } else {
          actor[other].pose = "hurt";
          if (ev.interrupted) view.aims[other] = null;
          const img = hits[ev.element] || hits[cur(side).type];
          if (img) fx.push({ img, frames: BATTLE_FRAMES.hit, x: target.x, y: target.y - 26, t: 0, speed: 14 });
          numbers.push({ text: `-${ev.dmg}`, x: target.x, y: target.y - 46, t: 0, color: ev.mult > 1 || ev.surged ? "#ffd54a" : "#ffffff" });
          for (const dx of [5, -5, 3, -3, 0]) { actor[other].dx = dx; await wait(45); }
          view.hp.set(cur(other), ev.hp);
          paintBars();
          await wait(330);
        }
        actor[side].pose = actor[other].pose = "idle";
      } else if (ev.kind === "charge") {
        view.aims[side] = ev.tiles;
        say(said(t("{0} is winding up {1}!", who(side), named(ev.name)),
          side === "me" ? t("It lands on the lit squares when its turn comes.") : t("Get out of the red squares, or cut it short with an interrupt.")));
        sfx("lucky");
        await wait(700);
      } else if (ev.kind === "guard" || ev.kind === "boost" || ev.kind === "heal") {
        const m = moveById(ev.move);
        say(ev.failed ? t("{0} tried {1}, but has no healing left.", who(side), named(ev.name))
          : said(t("{0} used {1}.", who(side), named(ev.name)), ev.heal ? t("+{0} HP.", ev.heal) : m.buff === "spd" && t("Its turns come sooner for a while.")));
        const img = art[ev.kind === "guard" ? "shield" : ev.kind];
        const at = footOf(side);
        if (img && !ev.failed) fx.push({ img, frames: 6, x: at.x, y: at.y - 26, t: 0, speed: 11 });
        if (ev.heal) { numbers.push({ text: `+${ev.heal}`, x: at.x, y: at.y - 46, t: 0, color: "#7dffb0" }); view.hp.set(cur(side), ev.hp); }
        paintBars();
        await wait(650);
      } else if (ev.kind === "terrain") {
        const at = footOf(side);
        if (ev.tiles) { // a move that changes the squares
          for (const p of ev.tiles) view.tiles[p.r * COLS + p.c] = ev.terrain;
          flashes.push({ tiles: ev.tiles, color: "rgba(255, 255, 255, A)", t: 0 });
          say(t("{0} used {1}: {2}.", who(side), named(ev.name), inside(t(TERRAIN[ev.terrain].name))));
          await wait(650);
        } else { // the square under it has its say
          numbers.push({ text: ev.heal ? `+${ev.heal}` : `-${ev.dmg}`, x: at.x, y: at.y - 46, t: 0, color: ev.heal ? "#7dffb0" : "#ff9a6a" });
          view.hp.set(cur(side), ev.hp);
          paintBars();
          await wait(380);
        }
      } else if (ev.kind === "faint") {
        say(t("{0} is out.", who(side)));
        actor[side].pose = "down";
        view.aims[side] = null;
        const at = footOf(side);
        if (art.faint) fx.push({ img: art.faint, frames: BATTLE_FRAMES.faint, x: at.x, y: at.y - 24, t: 0, speed: 10 }); // it breaks up into pixels
        for (let i = 0; i < 8; i++) { actor[side].sink += 2; actor[side].alpha -= 0.125; await wait(50); }
        await wait(250);
      } else if (ev.kind === "enter") {
        view.idx[side] = ev.index;
        view.pos[side] = { ...ev.at };
        Object.assign(actor[side], { sink: 0, alpha: 1, pose: "idle", dy: 0, dx: side === "me" ? -60 : 60 });
        for (let i = 0; i < 6; i++) { actor[side].dx *= 0.5; await wait(45); }
        actor[side].dx = 0;
        paintBars();
        say(t("{0} steps in.", who(side)));
        await wait(350);
      }
    }
    sync();
    paintBars();
    paintTimeline();
  }

  // ----- the player's turn: move, choose a move, then answer for it -----
  const tileUnder = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) {
      if (Math.abs(x - colX(c)) <= TILE[0] / 2 + 2 && Math.abs(y - rowY(row)) <= 9) return { c, r: row, x, y };
    }
    return { c: -1, r: -1, x, y };
  };
  async function stepTo(p) {
    if (!input || b.moved) return;
    const ev = moveTo(b, "me", { c: p.c, r: p.r });
    if (!ev) return;
    input.reach = [];
    input.hover = null;
    sfx("pet");
    await slide("me", ev.from, ev.to);
    sync();
    showTurn();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!input || b.moved) return;
    const p = tileUnder(e);
    if (sameSquare(p, view.pos.me)) { input.drag = { x: p.x, y: p.y }; try { canvas.setPointerCapture(e.pointerId); } catch { /* the drag still ends on pointerup */ } }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!input) return;
    const p = tileUnder(e);
    input.hover = input.reach.some((q) => sameSquare(q, p)) ? { c: p.c, r: p.r } : null;
    if (input.drag) input.drag = { x: p.x, y: p.y };
    canvas.style.cursor = input.hover || sameSquare(p, view.pos.me) ? "pointer" : "";
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!input) return;
    const p = tileUnder(e);
    input.drag = null;
    if (input.reach.some((q) => sameSquare(q, p)) && !sameSquare(p, view.pos.me)) stepTo(p);
  });
  canvas.addEventListener("pointercancel", () => { if (input) input.drag = null; });

  function showTurn() {
    const me = cur("me");
    const panel = $("#b-panel");
    panel.innerHTML = "";
    input = { reach: b.moved ? [] : reachable(b, "me").filter((p) => !sameSquare(p, view.pos.me)), preview: null, drag: null, hover: null };
    // Moving: tap a square on the grid above, drag the creature, or use these buttons.
    if (!b.moved) {
      const pad = h(`<div class="b-movepad"><span class="small muted">Move (up to 2 squares)</span><div class="b-minigrid"></div></div>`);
      const grid = pad.querySelector(".b-minigrid");
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS / 2; c++) {
        const here = sameSquare({ c, r }, view.pos.me);
        const can = input.reach.some((p) => sameSquare(p, { c, r }));
        const kind = view.tiles[r * COLS + c];
        const cell = h(`<button type="button" class="b-cell${here ? " here" : ""}${kind ? ` t-${kind}` : ""}" ${can ? "" : "disabled"}></button>`);
        cell.title = here ? "Your creature is here" : kind ? `${TERRAIN[kind].name}: ${TERRAIN[kind].text}` : can ? "Move here" : "Too far this turn";
        cell.setAttribute("aria-label", cell.title);
        if (here) cell.append(h(icon("star")));
        cell.onclick = () => stepTo({ c, r });
        grid.append(cell);
      }
      panel.append(pad);
    }
    const moves = h(`<div class="b-moves"></div>`);
    for (const id of me.moves) {
      const m = moveById(id);
      const element = m.own ? me.type : m.element;
      const hits = m.kind === "attack" ? wouldHit(b, "me", id) : null;
      const btn = h(`<button type="button" class="b-move">${icon(moveIcon(m), 32)}
        <span><strong></strong><span class="small muted"></span></span>
        ${hits === null ? "" : `<span class="b-hit ${hits ? "yes" : "no"}">${hits ? "In reach" : "Out of line"}</span>`}
        ${element ? `<img class="px-icon" width="16" height="16" alt="${TYPES[element].name}" title="${TYPES[element].name}" src="${ART}icon/type_${element}.png">` : ""}</button>`);
      btn.querySelector("strong").textContent = m.name;
      btn.querySelector(".small").textContent = moveLine(m, m.kind === "heal" ? t("Heals ({0} left)", me.heals) : t(MOVE_STYLES[m.style].text));
      btn.title = moveHelp(m);
      const show = () => { if (input) input.preview = m.kind === "attack" || m.kind === "terrain" ? area(b, "me", id) : null; };
      const hide = () => { if (input) input.preview = null; };
      btn.addEventListener("pointerenter", show);
      btn.addEventListener("focus", show);
      btn.addEventListener("pointerleave", hide);
      btn.addEventListener("blur", hide);
      btn.onclick = () => { input = null; ask(id); };
      moves.append(btn);
    }
    panel.append(moves);
    if (b.mode === "wild" && !b.potionUsed && game.items.potion > 0 && hpOf(me) < me.max) {
      const drink = h(`<button type="button" class="b-potion">${icon("potion")} Use a potion (${game.items.potion}): half its health back, once a battle</button>`);
      drink.onclick = () => {
        const amount = usePotion(b);
        if (!amount) return;
        game.items.potion--;
        saveGame();
        sfx("lucky");
        const at = footOf("me");
        numbers.push({ text: `+${amount}`, x: at.x, y: at.y - 46, t: 0, color: "#7dffb0" });
        sync();
        paintBars();
        showTurn();
      };
      panel.append(drink);
    }
    paintTimeline();
    say(b.moved ? "Choose a move. A question about one of your words decides whether it lands."
      : "Your turn. Move first if you like (drag your creature or tap a square), then choose a move.");
  }

  function ask(moveId) {
    const q = pickQuestion(game, words, Math.random, new Date(), asked);
    if (!q) { turn(moveId, "right"); return; }
    asked = [...asked.slice(-12), q.uid];
    const panel = $("#b-panel");
    panel.innerHTML = "";
    const box = h(`<div class="bq">
      <div class="bq-timer"><i style="animation-duration:${QUESTION_MS}ms"></i><b style="left:${(1 - FAST_MS / QUESTION_MS) * 100}%"></b></div>
      <div class="bq-ask small muted">${q.reverse ? "Which of your words means this?" : "What does this mean?"}</div>
      <div class="bq-prompt ar"></div><div class="bq-sentence small muted" dir="auto"></div>
      <div class="bq-options"></div>
      <button type="button" class="ghost small" id="bq-hint" ${game.items.hint > 0 ? "" : "hidden"}>${icon("hint")} Use a hint card (${game.items.hint})</button>
    </div>`);
    const prompt = box.querySelector(".bq-prompt");
    prompt.textContent = q.prompt;
    setLang(prompt, detectLanguage(q.prompt));
    box.querySelector(".bq-sentence").textContent = q.sentence;
    const started = performance.now();
    let done = false;
    const buttons = q.options.map((text, i) => {
      const btn = h(`<button type="button" class="bq-option" dir="auto"></button>`);
      btn.textContent = text;
      btn.onclick = () => finish(i);
      box.querySelector(".bq-options").append(btn);
      return btn;
    });
    box.querySelector("#bq-hint").onclick = (e) => {
      if (game.items.hint <= 0) return;
      game.items.hint--;
      e.currentTarget.hidden = true; // the button itself, even when the tap lands on its icon
      const wrong = buttons.map((_, i) => i).filter((i) => i !== q.answer).sort(() => Math.random() - 0.5).slice(0, 2);
      for (const i of wrong) { buttons[i].disabled = true; buttons[i].classList.add("out"); }
    };
    const timeout = setTimeout(() => finish(-1), QUESTION_MS);
    async function finish(choice) {
      if (done || closed) return;
      done = true;
      clearTimeout(timeout);
      const elapsed = performance.now() - started;
      const correct = choice === q.answer;
      for (const btn of buttons) btn.disabled = true;
      buttons[q.answer].classList.add("right");
      if (choice >= 0 && !correct) buttons[choice].classList.add("wrong");
      box.querySelector(".bq-timer i").style.animationPlayState = "paused";
      const fast = correct && elapsed <= FAST_MS;
      sfx(correct ? (fast ? "lucky" : "common") : "surprise");
      const r = answerQuestion(game, q.uid, correct);
      if (r.graduated) { graduated++; toast("That word is now well known. +15 XP").prepend(h(icon("star")), " "); }
      if (r.retentionBonus) toast("Accurate all week: +60 XP and 5 coins").prepend(h(icon("goal")), " ");
      say(correct ? (fast ? "Right, and fast!" : "Right.") : choice < 0 ? "Out of time: the move misses." : "Not quite: the move misses. The right answer is marked.");
      await wait(correct ? 550 : 1500);
      turn(moveId, correct ? (fast ? "fast" : "right") : "wrong");
    }
    panel.append(box);
    say("");
  }

  async function turn(moveId, quality) {
    $("#b-panel").innerHTML = "";
    const events = act(b, moveId, quality);
    await play(events);
    if (closed) return;
    if (b.over) end(); else showTurn();
  }

  function end() {
    input = null;
    const result = battleResult(b);
    const pay = finishBattle(game, result);
    saveGame();
    announce({ type: "battle", xp: pay.xp, tier: result.won ? "lucky" : "common" });
    if (b.mode === "friend" && b.rival && b.rival.id) {
      // Let the friend know how it went, and refresh what friends see of me.
      social.reportBattle(b.rival.id, result.won, { rating: game.rating }).catch((e) => toast(`Couldn't tell ${b.rival.name}: ${e.message}`, { error: true }));
    }
    import("./friends-game.js").then((m) => m.publishNow(true));
    sfx(result.won ? "jackpot" : "surprise");
    for (const id of pay.badges) badgeToast(id);
    const lines = [
      `+${pay.xp} XP${pay.coins ? ` · ${icon("coin")} ${pay.coins} coins` : ""}`,
      `${b.answers.right} right, ${b.answers.wrong} wrong${graduated ? ` · ${graduated} word${graduated === 1 ? "" : "s"} now well known` : ""}`,
      pay.rating ? `${icon("rating")} Skill ${pay.rating > 0 ? "+" : ""}${pay.rating} ${icon("arrow")} ${game.rating}` : "",
      pay.tags.includes("flawless") ? icon("trophy") + " Not one wrong answer: the Champion colouring and the move Perfect Form are now open." : "",
      pay.tags.includes("comeback") ? icon("trophy") + " Won from the brink: the Champion colouring and the move Second Wind are now open." : "",
      pay.egg ? icon("egg_mystery") + " The wild creature left you an egg." : "",
      pay.ticket ? icon("ticket") + " A battle ticket made this one pay in full." : "",
      pay.both ? `${icon("check")} A battle and your flashcards, both done today: +${pay.both.xp} XP · ${icon("coin")} ${pay.both.coins} coins` : "",
    ].filter(Boolean);
    const panel = $("#b-panel");
    panel.innerHTML = "";
    const box = h(`<div class="b-result"><h2>${result.won ? "You won!" : "You lost this one"}</h2>
      <div class="stack small"></div>
      <div class="row"><button type="button" class="primary" id="b-again">Battle again</button><button type="button" id="b-done">Done</button></div></div>`);
    for (const line of lines) { const p = document.createElement("div"); p.innerHTML = line; box.querySelector(".stack").append(p); } // numbers and fixed text only
    panel.append(box);
    paintTimeline();
    say(result.won ? "Well fought." : "Every answer still counted toward your words.");
    box.querySelector("#b-done").onclick = close;
    box.querySelector("#b-again").onclick = () => { close(); openBattleMenu(); };
  }

  function close() { closed = true; input = null; el.remove(); }
  $("#b-quit").onclick = async () => {
    if (!b.over && !(await confirmBox("Leave this battle?", "Your answers so far still count.", { ok: "Leave" }))) return;
    if (closed) return;
    saveGame();
    close();
  };
  paintBars();
  paintTimeline();
  requestAnimationFrame(draw);
  say("The battle begins.");
  play(start(b)).then(() => { if (closed) return; if (b.over) end(); else showTurn(); });
}
