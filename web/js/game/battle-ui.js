// The battle menus: the menu (the 100-word gate and the choice of words), picking a rental team, and
// a friend's challenge. The battle itself is live (livebattle-ui.js shows it, livebattle.js runs it);
// the rules for teams and moves live in battle.js and rules.js.

import { api, h, state, toast } from "../app.js";
import { commonWords } from "../commonwords.js";
import { studyLanguage } from "../languages.js";
import { installedMeanings } from "../meanings.js";
import { dictionaryChoices } from "./dictwords.js";
import { states } from "../review/deck.js";
import { BADGES, BATTLE_UNLOCK_WORDS, LIVE_FORMS, LIVE_STYLE_TEXT, MOVE_STYLES, TYPES, beastById, liveMove } from "./data.js";
import { describe } from "./genome.js";
import { t } from "../i18n.js";
import { LAST_WORDS, checkBadges, knownWords, pickQuestion, quizzable, retention, reviewSummary, weekNumber, weeklyRule } from "./rules.js";
import { eligible, fighters, fits, rentalPool, teamSize, wildTeam } from "./battle.js";
import { cardScale } from "./livebattle.js";
import { FRAME, composeCreature, icon } from "./render.js";
import { getGame, saveGame } from "./game.js";
import { runLiveBattle } from "./livebattle-ui.js";

const MODE_NAME = { last100: `Last ${LAST_WORDS} words`, unlimited: "All-time" };

/** A move in a few words, each translated on its own: "Strike · Power 45 · Shot" (how it works in a live
 * battle: livebattle.js, data.liveMove). `extra` replaces the power for moves that don't attack. */
export function moveLine(m, extra = null) {
  const form = liveMove(m).form;
  const what = m.kind === "attack" ? t("Power {0}", m.power) : extra || "";
  return [t(MOVE_STYLES[m.style].name), what, form === "self" ? "" : t(LIVE_FORMS[form].name)].filter(Boolean).join(" · ");
}
/** What a move does and how it reaches, in full (for a tooltip). */
export const moveHelp = (m) => {
  const form = liveMove(m).form;
  return `${t(LIVE_STYLE_TEXT[m.style] || MOVE_STYLES[m.style].text)} ${t(LIVE_FORMS[form].name)}: ${t(LIVE_FORMS[form].text)}`;
};

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
 * known from battles). The count is kept in the game, so friends' all-time battles can use it. */
async function loadWords(game) {
  let vocab = [];
  let log = {};
  try { vocab = await api("/vocab"); } catch { /* shown as zero words */ }
  try { log = (await api("/reviews")).reviews || {}; } catch { /* counted from battles only */ }
  const learned = new Set([...states(log)].filter(([, card]) => card && card.known).map(([uid]) => uid));
  game.known = knownWords(game, vocab, learned);
  game.cards = vocab.length; // an all-time battle scales with every card saved (livebattle.js cardScale)
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
      ? `Questions can be any word you have saved in this language, so they are harder. Your creatures grow stronger with every card you have: you have ${game.cards || 0}, so they fight at ×${cardScale(game.cards || 0).toFixed(2)} (×2 at most).`
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
    <p class="small muted">Battles are live: walk your creature round the arena with the controller's stick, the keys, a click
      or your finger, and use a move with its button. Each move asks about one of your words while the battle waits: answer
      within 5 seconds or the move fails. The ground matters: some of it makes you faster, tougher or stronger.</p>
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
    const mine = fighters(game, team.slice(0, size).map((i) => game.roster[i]), { wild: true });
    const theirs = fighters(null, wildTeam(rand, mine.length));
    runLiveBattle({ mine, theirs, mode: "wild", foeForm: 0.55 + rand() * 0.25, cards: { me: vocab.length } }, vocab);
  };
  body.querySelector("#b-rental").onclick = () => pickRental(wrap, body, vocab);
}

/**
 * Challenge a friend's team. They aren't there: their creatures fight with the moves they chose,
 * and answer as accurately as their owner usually answers their own words. You answer yours.
 * In an all-time battle each side is as strong as the cards its owner has saved.
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
  const mine = fighters(game, mineIdx.map((i) => game.roster[i]), { rule });
  const theirs = fighters(null, theirTeam, { rule });
  // (a friend on an older version shares how many words they know, not their cards: those count instead)
  const theirCards = Number(theirTeam[0].cards ?? theirTeam[0].known) || 0;
  for (const f of theirs) f.name = f.name || friend.username;
  runLiveBattle({ mine, theirs, mode: "friend", rule, foeForm: Number(profile.form) || 0.7, cards: { me: vocab.length, foe: Math.min(100000, theirCards) },
    rival: { id: friend.id, name: friend.username, rating: Number(profile.rating) || 1000 } }, vocab);
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
      <span class="shop-name">${TYPES[g.type].name}</span><span class="small muted">${beastById(look.beast).name}</span></button>`);
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
    runLiveBattle({ mine, theirs, mode: "rental", foeForm: 0.7, rival: { id: null, name: "Rival", rating: game.rating } }, vocab);
  };
  body.append(grid, go);
}

export function badgeToast(id) {
  const b = BADGES.find((x) => x.id === id);
  if (b) toast(`Badge earned: ${b.name}`).prepend(h(icon("badge")));
}

// ---------- the questions' wrong answers ----------
// The language's common words with their dictionary meanings, made once per language a session.
const dictLists = new Map();
/** One wrong answer in each question from the built-in dictionary, when the language's is downloaded
 * (dictwords.js); null when it isn't. */
export async function battleDictionary(lang = studyLanguage()) {
  if (!dictLists.has(lang)) {
    dictLists.set(lang, (async () => {
      const files = await installedMeanings(lang);
      return files ? dictionaryChoices(await commonWords(lang), files, lang) : null;
    })().catch(() => null).then((list) => { if (!list) dictLists.delete(lang); return list; }));
  }
  const words = await dictLists.get(lang);
  if (!words || words.length < 20) return null;
  const meanings = (state.status && state.status.settings && state.status.settings.definer_language) || "English";
  return { words, forward: /^english$/i.test(meanings) };
}
