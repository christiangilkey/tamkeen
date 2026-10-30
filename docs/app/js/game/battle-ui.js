// The battle screens: the menu (and the 100-word gate), the arena, and the question panel.
// All the rules live in battle.js and rules.js; this file only shows them.

import { api, h, toast } from "../app.js";
import { confirmBox } from "../components/modal.js";
import { detectLanguage, setLang } from "../languages.js";
import { BADGES, BATTLE_FRAMES, BATTLE_UNLOCK_WORDS, HABITAT, SHADOW, TYPES, moveById } from "./data.js";
import { describe } from "./genome.js";
import { answerQuestion, checkBadges, finishBattle, pickQuestion, quizzable, retention, reviewSummary, weekNumber, weeklyRule } from "./rules.js";
import { COMBO, FAST_MS, QUESTION_MS, battleResult, eligible, fighters, fits, newBattle, playTurn, publicProfile, rentalPool, teamSize, usePotion, wildTeam } from "./battle.js";
import { FRAME, composeCreature, drawSheet, icon, loadImage } from "./render.js";
import { announce, getGame, saveGame, sfx } from "./game.js";
import * as social from "../social.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const [W, H] = HABITAT.size;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const THEMES = ["meadow", "oasis", "forest", "shore"];

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

/** The battle menu. Battles open once 100 words are saved: they are made of your own words. */
export async function openBattleMenu() {
  const game = getGame();
  const { wrap, body } = sheet("Battles");
  body.append(h(`<p class="muted">Loading your words…</p>`));
  let vocab = [];
  try { vocab = await api("/vocab"); } catch { /* shown as zero words */ }
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
      <span class="today-chip">${sum.mature} well known</span>
      ${acc === null ? "" : `<span class="today-chip">${Math.round(acc * 100)}% right lately</span>`}
      <span class="today-chip">Skill ${game.rating}</span>
    </div>
    <p class="small muted">Every creature fights at the same level. You win by knowing your words: answer right and the move
      lands, answer within ${FAST_MS / 1000} seconds and a combo builds (×1.2, ×1.5, ×2).</p>
    <div class="battle-modes">
      <button type="button" class="battle-mode" id="b-wild"><strong>Wild encounter</strong>
        <span class="small muted">Your own creatures against wild ones. Their age gives yours a small edge here only.</span></button>
      <button type="button" class="battle-mode" id="b-rental"><strong>Rental duel</strong>
        <span class="small muted">Pick three of this week's six shared creatures; your rival gets the rest. Counts for your skill rating.</span></button>
    </div>
    <p class="small muted">To challenge a friend's team, open <strong>Friends</strong> in the game menu. This week's rule for
      friend battles: <strong>${rule.name}</strong>. ${rule.text}</p>
    <div id="b-team" class="row"></div>
  </div>`));
  const size = Math.min(team.length, teamSize(null));
  for (const i of team.slice(0, size)) body.querySelector("#b-team").append(portrait(game.roster[i], 56));
  body.querySelector("#b-wild").onclick = () => {
    wrap.remove();
    const rand = Math.random;
    const mine = fighters(game, team.slice(0, size).map((i) => game.roster[i]), { wild: true });
    const theirs = fighters(null, wildTeam(rand, mine.length));
    runBattle(newBattle({ mine, theirs, mode: "wild", foeForm: 0.55 + rand() * 0.25, rand }), vocab);
  };
  body.querySelector("#b-rental").onclick = () => pickRental(wrap, body, vocab);
}

/**
 * Challenge a friend's team. They aren't there: their creatures fight with the moves they chose,
 * and answer as accurately as their owner usually answers their own words. You answer yours.
 */
export async function startFriendBattle(friend, profile) {
  const game = getGame();
  const rule = weeklyRule();
  let vocab = [];
  try { vocab = await api("/vocab"); } catch { /* counted as none */ }
  if (vocab.length < BATTLE_UNLOCK_WORDS) { toast(`Battles unlock at ${BATTLE_UNLOCK_WORDS} saved words. You have ${vocab.length}.`); return; }
  if (!pickQuestion(game, vocab)) { toast("Your words need meanings before they can be asked. Fill some in on the Vocab page."); return; }
  const mineIdx = eligible(game, rule).slice(0, teamSize(rule));
  if (!mineIdx.length) { toast(`None of your creatures fit this week's rule (${rule.name}).`); return; }
  const theirTeam = ((profile && profile.team) || []).filter((g) => fits(g, rule)).slice(0, teamSize(rule));
  if (!theirTeam.length) { toast(`${friend.username} has no creatures that fit this week's rule (${rule.name}).`); return; }
  const mine = fighters(game, mineIdx.map((i) => game.roster[i]), { rule });
  const theirs = fighters(null, theirTeam, { rule });
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
      <span class="shop-name">${TYPES[g.type].name}</span><span class="small muted">${look.species} · ${look.branch || ""}</span></button>`);
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
function runBattle(b, vocab) {
  const game = getGame();
  document.querySelector(".battle-wrap")?.remove();
  const el = h(`<div class="battle-wrap"><div class="battle">
    <div class="battle-top">
      <div class="b-hp" id="hp-me"><div class="b-name"></div><div class="hud-bar"><i></i></div><div class="b-pips"></div></div>
      <button type="button" class="ghost icon" id="b-quit" title="Leave the battle">${icon("close")}</button>
      <div class="b-hp right" id="hp-foe"><div class="b-name"></div><div class="hud-bar"><i></i></div><div class="b-pips"></div></div>
    </div>
    <div class="battle-scene"><canvas width="${W}" height="${H}"></canvas><span class="b-combo" id="b-combo" hidden></span></div>
    <div class="b-log" id="b-log" aria-live="polite"></div>
    <div class="b-panel" id="b-panel"></div>
  </div></div>`);
  document.body.append(el);
  const $ = (q) => el.querySelector(q);
  const ctx = $("canvas").getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const art = {};
  for (const layer of HABITAT.layers) loadImage(`habitat/${theme}/${layer}.png`).then((img) => { art[layer] = img; });
  for (const [k, f] of Object.entries({ pad_me: "battle/pad_player.png", pad_foe: "battle/pad_rival.png", shield: "battle/shield.png",
    heal: "battle/heal.png", boost: "battle/boost.png", faint: "battle/faint.png", glance: "battle/glance.png", sparkle: "fx/sparkle.png",
    surge: "fx/surge.png", digits: "ui/digits.png" })) loadImage(f).then((img) => { art[k] = img; });
  for (const size of Object.keys(SHADOW)) loadImage(`fx/shadow_${size}.png`).then((img) => { art[`shadow_${size}`] = img; });
  const hits = {};
  for (const t of Object.keys(TYPES)) loadImage(`battle/hit_${t}.png`).then((img) => { hits[t] = img; });

  const X = { me: 92, foe: 228 };
  const actor = { me: { dx: 0, alpha: 1, sink: 0, pose: "idle" }, foe: { dx: 0, alpha: 1, sink: 0, pose: "idle" } };
  const fx = [];      // {img, frames, x, y, t, speed}
  const numbers = []; // {text, x, y, t, color}
  const frames = new Map();
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

  const cur = (side) => (side === "me" ? b.mine[b.me] : b.theirs[b.foe]);
  function frame(side, now) {
    const f = cur(side);
    const a = actor[side];
    const pose = { step: 0, bob: Math.floor(now / 480 + (side === "me" ? 0 : 1)) % 2,
      eyes: a.pose === "hurt" ? "sad" : a.pose === "down" ? "blink" : a.pose === "attack" || (side === "me" && b.combo >= COMBO.length - 1) ? "happy" : "open",
      mouth: a.pose === "attack" ? "open" : a.pose === "hurt" || a.pose === "down" ? "sad" : "neutral" };
    const key = `${side}|${side === "me" ? b.me : b.foe}|${pose.bob}|${pose.eyes}|${pose.mouth}`;
    if (!frames.has(key)) { frames.set(key, null); composeCreature(f.look, pose).then((c) => frames.set(key, c)); }
    const prefix = `${side}|${side === "me" ? b.me : b.foe}|`;
    return frames.get(key) || [...frames.entries()].find(([k, v]) => v && k.startsWith(prefix))?.[1] || null;
  }
  function draw(now) {
    if (closed) return;
    ctx.clearRect(0, 0, W, H);
    for (const layer of HABITAT.layers) if (art[layer]) ctx.drawImage(art[layer], 0, 0);
    const ground = HABITAT.ground;
    for (const side of ["me", "foe"]) {
      const pad = art[`pad_${side}`];
      if (pad) ctx.drawImage(pad, X[side] - 32, ground - 6);
      const img = frame(side, now);
      const a = actor[side];
      if (!img || a.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a.alpha;
      ctx.translate(Math.round(X[side] + a.dx), ground);
      if (side === "foe") ctx.scale(-1, 1);
      const shadow = art[`shadow_${cur(side).look.size}`];
      if (shadow) ctx.drawImage(shadow, -3 - Math.round(shadow.width / 2), -Math.floor(shadow.height / 2)); // under the body, which sits 3px behind the frame's centre
      ctx.drawImage(img, -FRAME / 2, -FRAME + Math.round(a.sink));
      ctx.restore();
    }
    if (b.combo >= COMBO.length - 1 && !b.over) { // a surge: the charge crackles round the creature
      if (art.surge) drawSheet(ctx, art.surge, 6, (now / 80) % 6, X.me - 3, ground - 28);
      if (art.sparkle) drawSheet(ctx, art.sparkle, 4, (now / 90) % 4, X.me + Math.sin(now / 200) * 18, ground - 40 + Math.cos(now / 170) * 14);
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
      const pct = Math.round((f.hp / f.max) * 100);
      const bar = box.querySelector("i");
      bar.style.width = `${pct}%`;
      bar.style.background = pct > 50 ? "" : pct > 20 ? "var(--brand-gold)" : "var(--alert)";
      const team = side === "me" ? b.mine : b.theirs;
      const pips = box.querySelector(".b-pips");
      pips.innerHTML = team.map((t) => icon(t.hp > 0 ? "ui/pip_on" : "ui/pip_off", 16)).join("");
      pips.title = `${team.filter((t) => t.hp > 0).length} of ${team.length} still standing`;
    }
    const chip = $("#b-combo");
    chip.hidden = b.combo === 0;
    chip.innerHTML = b.combo >= COMBO.length - 1 ? `${icon("surge")} SURGE ×${COMBO[b.combo]}` : `<i class="fx-combo-fire"></i> ×${COMBO[b.combo]}`;
    chip.classList.toggle("surge", b.combo >= COMBO.length - 1);
  }
  const say = (text) => { $("#b-log").textContent = text; };
  const who = (side) => (side === "me" ? "Your creature" : b.mode === "wild" ? "The wild creature" : b.mode === "friend" ? `${b.rival.name}'s creature` : "Your rival's creature");

  async function play(events) {
    for (const ev of events) {
      if (closed) return;
      const side = ev.side;
      const other = side === "me" ? "foe" : "me";
      const y = HABITAT.ground - 30;
      if (ev.kind === "attack") {
        const note = ev.side === "me" ? (ev.quality === "wrong" ? " A glancing blow." : ev.surged ? " A surging hit!" : "") : "";
        say(`${who(side)} used ${ev.name}.${ev.mult > 1 ? " It's strong against that element!" : ev.mult < 1 ? " It's weak against that element." : ""}${ev.guarded ? " Guarded." : ""}${note}`);
        actor[side].pose = "attack";
        actor[side].dx = side === "me" ? 26 : -26;
        sfx(ev.surged ? "lucky" : "common");
        await wait(220);
        actor[side].dx = 0;
        actor[other].pose = "hurt";
        // A wrong answer still lands, but only as a glancing blow: a pale slash instead of the element's burst.
        const glance = ev.quality === "wrong" && art.glance;
        const img = glance || hits[ev.element] || hits[cur(side).type];
        if (img) fx.push({ img, frames: glance ? BATTLE_FRAMES.glance : BATTLE_FRAMES.hit, x: X[other], y, t: 0, speed: 14 });
        numbers.push({ text: `-${ev.dmg}`, x: X[other], y: y - 20, t: 0, color: ev.mult > 1 || ev.surged ? "#ffd54a" : "#ffffff" });
        for (const dx of [5, -5, 3, -3, 0]) { actor[other].dx = dx; await wait(45); }
        paintBars();
        await wait(380);
        actor[side].pose = actor[other].pose = "idle";
      } else if (ev.kind === "guard" || ev.kind === "boost" || ev.kind === "heal") {
        say(ev.failed ? `${who(side)} tried ${ev.name}, but has no healing left.` : `${who(side)} used ${ev.name}.${ev.heal ? ` +${ev.heal} HP.` : ""}`);
        const img = art[ev.kind === "guard" ? "shield" : ev.kind];
        if (img && !ev.failed) fx.push({ img, frames: 6, x: X[side], y, t: 0, speed: 11 });
        if (ev.heal) numbers.push({ text: `+${ev.heal}`, x: X[side], y: y - 20, t: 0, color: "#7dffb0" });
        paintBars();
        await wait(650);
      } else if (ev.kind === "faint") {
        say(`${who(side)} is out.`);
        actor[side].pose = "down";
        if (art.faint) fx.push({ img: art.faint, frames: BATTLE_FRAMES.faint, x: X[side], y: y + 6, t: 0, speed: 10 }); // it breaks up into pixels
        for (let i = 0; i < 8; i++) { actor[side].sink += 2; actor[side].alpha -= 0.125; await wait(50); }
        await wait(250);
      } else if (ev.kind === "enter") {
        Object.assign(actor[side], { sink: 0, alpha: 1, pose: "idle", dx: side === "me" ? -60 : 60 });
        for (let i = 0; i < 6; i++) { actor[side].dx *= 0.5; await wait(45); }
        actor[side].dx = 0;
        paintBars();
        say(`${who(side)} steps in.`);
        await wait(350);
      }
    }
  }

  // ----- choosing a move, then answering for it -----
  function showMoves() {
    const panel = $("#b-panel");
    panel.innerHTML = "";
    const grid = h(`<div class="b-moves"></div>`);
    for (const id of cur("me").moves) {
      const m = moveById(id);
      const element = m.own ? cur("me").type : m.element;
      const btn = h(`<button type="button" class="b-move">${icon(`icon/move/${m.id}`, 32)}
        <span><strong></strong><span class="small muted">${m.kind === "attack" ? `Power ${m.power}` : m.kind === "guard" ? "Blocks the next hit" : m.kind === "boost" ? "Stronger hits for a while" : `Heals (${cur("me").heals} left)`}</span></span>
        ${element ? `<img class="px-icon" width="16" height="16" alt="${TYPES[element].name}" title="${TYPES[element].name}" src="${ART}icon/type_${element}.png">` : ""}</button>`);
      btn.querySelector("strong").textContent = m.name;
      btn.onclick = () => ask(id);
      grid.append(btn);
    }
    panel.append(grid);
    if (b.mode === "wild" && !b.potionUsed && game.items.potion > 0 && cur("me").hp < cur("me").max) {
      const drink = h(`<button type="button" class="b-potion">${icon("potion")} Use a potion (${game.items.potion}): half its health back, once a battle</button>`);
      drink.onclick = () => {
        const amount = usePotion(b);
        if (!amount) return;
        game.items.potion--;
        saveGame();
        sfx("lucky");
        numbers.push({ text: `+${amount}`, x: X.me, y: HABITAT.ground - 50, t: 0, color: "#7dffb0" });
        paintBars();
        showMoves();
      };
      panel.append(drink);
    }
    say("Choose a move. A question about one of your words decides how well it lands.");
  }

  function ask(moveId) {
    const q = pickQuestion(game, vocab, Math.random, new Date(), asked);
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
      say(correct ? (fast ? "Right, and fast!" : "Right.") : choice < 0 ? "Out of time." : "Not quite: the right answer is marked.");
      await wait(correct ? 550 : 1500);
      turn(moveId, correct ? (fast ? "fast" : "right") : "wrong");
    }
    panel.append(box);
    say("");
  }

  async function turn(moveId, quality) {
    $("#b-panel").innerHTML = "";
    const events = playTurn(b, moveId, quality);
    paintBars();
    await play(events);
    if (closed) return;
    if (b.over) end(); else showMoves();
  }

  function end() {
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
      pay.tags.includes("flawless") ? icon("trophy") + " Not one wrong answer: the Champion form and the move Perfect Form are now open." : "",
      pay.tags.includes("comeback") ? icon("trophy") + " Won from the brink: the Champion form and the move Second Wind are now open." : "",
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
    say(result.won ? "Well fought." : "Every answer still counted toward your words.");
    box.querySelector("#b-done").onclick = close;
    box.querySelector("#b-again").onclick = () => { close(); openBattleMenu(); };
  }

  function close() { closed = true; el.remove(); }
  $("#b-quit").onclick = async () => {
    if (!b.over && !(await confirmBox("Leave this battle?", "Your answers so far still count.", { ok: "Leave" }))) return;
    if (closed) return;
    saveGame();
    close();
  };
  paintBars();
  showMoves();
  requestAnimationFrame(draw);
}
