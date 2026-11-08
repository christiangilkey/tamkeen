// The Battle screen: the game sheet's "battle" section (shop.js openShop draws its head, its "?" and the X back to
// Home, with a switch to its Friends side, friends-game.js). Laid out in blocks like the other game screens: your team,
// quick battles (wild, rental), the gym leaders as a path (gyms-ui.js), which words battles ask, and your record. The
// explanations live behind the "?" (battleHelp), not on the screen; what it shows is worked out in battlescreen.js.
// Also here: choosing a rental team, a friend's challenge, and small parts other battle screens share (a move in a
// few words, a creature's portrait). The battle itself is live (livebattle-ui.js shows it, livebattle.js runs it).

import { api, h, state, toast } from "../app.js";
import { commonWords } from "../commonwords.js";
import { studyLanguage } from "../languages.js";
import { installedMeanings } from "../meanings.js";
import { dictionaryChoices } from "./dictwords.js";
import { states } from "../review/deck.js";
import { BADGES, BATTLE_UNLOCK_WORDS, LIVE_FORMS, LIVE_STYLE_TEXT, MOVE_STYLES, TYPES, beastById, liveMove } from "./data.js";
import { describe } from "./genome.js";
import { t } from "../i18n.js";
import {
  LAST_WORDS, battleWords, checkBadges, knownWords, pickQuestion, quizzable, retention, reviewSummary, weekNumber, weeklyRule,
} from "./rules.js";
import { WORD_MODES, fighters, fits, rentalPool, teamSize, wildTeam } from "./battle.js";
import { cardScale } from "./livebattle.js";
import { LIMITS, cleanName, cleanProfile } from "./remote.js";
import { FRAME, composeCreature, icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { getGame, saveGame } from "./game.js";
import { runLiveBattle } from "./livebattle-ui.js";
import { sheet as helpSheet } from "./info.js";
import { elementBadge } from "./movesui.js";
import { gymsBlock } from "./gyms-ui.js";
import { block, details, fact, fmt, switcher, tile } from "./screenparts.js";
import { battleGate, rentalLeft, teamOf, teamSlots, toggleRental, wordChoice } from "./battlescreen.js";

const ART = new URL("../../game-art/", import.meta.url).href;
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

/** Facts in labelled cells, two to a row (the shared .gs-facts look): [[label, value markup]]. */
function factCells(list) {
  const box = h(`<div class="gs-facts"></div>`);
  for (const [label, value] of list) {
    const cell = h(`<div class="gs-fact"><span class="gs-label"></span><span class="gs-fact-v">${value}</span></div>`);
    cell.querySelector(".gs-label").textContent = label;
    box.append(cell);
  }
  return box;
}

/** The choice of words for battles: a switch of two, and what the one chosen means, in facts that keep their place.
 * `meanings`: saved words with a meaning (what can be asked); `dueOf(mode)`: how many of the words that choice asks
 * are due (shown when given). */
export function wordModePicker(game, onChange = () => {}, { meanings = 0, dueOf = null } = {}) {
  const box = h(`<div class="bt-words"></div>`);
  const paint = () => {
    const w = wordChoice(game.battleMode, { meanings, scale: cardScale(game.cards || 0) });
    const sw = switcher(WORD_MODES.map((id) => ({ id, word: MODE_NAME[id] })), w.mode, (id) => {
      game.battleMode = id; saveGame(); paint(); onChange();
    }, "bt-seg");
    const cells = [
      fact("Questions from", w.all ? t("All {0} words", fmt(w.questions)) : t("Newest {0}", fmt(w.questions))),
      fact("Strength", w.all ? `×${w.strength.toFixed(2)}` : t("Same for all")),
    ];
    if (dueOf) cells.push(fact("Words due", fmt(dueOf(w.mode))));
    box.replaceChildren(sw, factCells(cells));
  };
  paint();
  return box;
}

/** Open the Battle screen (the home card's Battle tile, "Battle again" after a battle). `changed()` runs when
 * something there changes the game; `waiting` > 0 puts that number on the Friends switch (gifts and challenges
 * waiting); `focus` = "gyms" scrolls to the gym leaders. */
export function openBattleMenu({ changed = () => {}, waiting = 0, focus = null } = {}) {
  return import("./shop.js").then((m) => m.openShop("battle", changed, { counts: { friends: Math.max(0, Number(waiting) || 0) }, focus }));
}

/**
 * Fill `body` with the Battle screen. Battles open once 20 words are saved: they are made of your own words. `go`
 * turns the sheet to another section (a team member opens Creatures); `close` closes the sheet (before a battle);
 * `focus` = "gyms" scrolls to the gym leaders once they are drawn.
 */
export function battlePanel(body, game, changed, go, close, focus = null) {
  const page = h(`<div class="bt-page"></div>`);
  const wait = block();
  wait.append(h(`<p class="gs-state muted">Loading your words…</p>`));
  page.append(wait);
  body.append(page);
  loadWords(game).then((vocab) => {
    if (!page.isConnected) return; // closed, or turned to Friends meanwhile
    for (const id of checkBadges(game, { words: vocab.length })) badgeToast(id);
    saveGame();
    page.replaceChildren(...battleBlocks(game, vocab, { changed, go, close }));
    const gyms = focus === "gyms" && page.querySelector(".bt-gyms");
    if (gyms) {
      body.scrollTop = Math.max(0, gyms.offsetTop - page.offsetTop - 4);
      (gyms.querySelector(".bt-gym.open") || gyms.querySelector(".bt-gym"))?.focus({ preventScroll: true }); // (for the controller)
    }
  });
}

/** The screen's blocks, or the one block saying what keeps battles closed. */
function battleBlocks(game, vocab, ctx) {
  const team = teamOf(game);
  const gate = battleGate({ words: vocab.length, meanings: quizzable(vocab).length, canAsk: !!pickQuestion(game, vocab), hatched: team.length });
  if (gate) return [gateBlock(game, gate)];
  return [
    teamBlock(game, ctx.go),
    quickBlock(game, vocab, ctx.close),
    gymsBlock(game, vocab, ctx.close),
    wordsBlock(game, vocab),
    recordBlock(game),
  ];
}

// ---------- when battles are still closed ----------

function gateBlock(game, gate) {
  const b = block();
  const box = h(`<div class="gs-empty bt-gate"><span class="bt-gate-pic"></span><strong class="bt-gate-title"></strong></div>`);
  const title = box.querySelector(".bt-gate-title");
  const pic = box.querySelector(".bt-gate-pic");
  if (gate.id === "words") {
    pic.innerHTML = icon("battle", 48);
    title.textContent = t("Battles open at {0} saved words", fmt(gate.need));
    box.append(factCells([fact("Saved", fmt(gate.have)), fact("Still to save", fmt(gate.need - gate.have))]),
      h(`<span class="cr-bar bt-gate-bar"><i style="width:${Math.round(Math.min(1, gate.have / gate.need) * 100)}%"></i></span>`),
      h(`<span>Save words with ★ while you listen and read.</span>`));
  } else if (gate.id === "meanings") {
    pic.innerHTML = icon("hint", 48);
    title.textContent = t("Your words need meanings");
    box.append(factCells([fact("Saved", fmt(gate.need)), fact("With a meaning", fmt(gate.have))]),
      h(`<span>Questions need meanings: fill some in on the Vocab page.</span>`),
      h(`<a class="btn primary" href="#/vocab" data-close>Open Vocab</a>`));
  } else {
    pic.innerHTML = `<img class="cr-egg" alt="" width="64" height="64" src="${ART}egg/${TYPES[game.creature.type] ? game.creature.type : "ember"}.png">`;
    title.textContent = t("Your egg hasn't hatched yet");
    box.append(h(`<span>Reach today's goal to hatch it, then come back to battle.</span>`));
  }
  b.append(box);
  return b;
}

// ---------- your team ----------

const nameOf = (g) => g.name || beastById(describe(g).beast).name;

/** The creatures that fight for you, in a row like a party: picture, name, element; an empty place for each one
 * still to come. A tap opens the Creatures screen (moves are chosen there). */
function teamBlock(game, go) {
  const b = block("Your team");
  const row = h(`<div class="bt-team"></div>`);
  for (const i of teamSlots(game)) {
    if (i === null) { row.append(h(`<div class="bt-member empty"><span>Empty</span></div>`)); continue; }
    const g = game.roster[i];
    const m = h(`<button type="button" class="cr-tile bt-member"><span class="cr-tile-pic"></span><strong></strong></button>`);
    m.querySelector(".cr-tile-pic").append(portrait(g, 72));
    const name = m.querySelector("strong");
    name.textContent = nameOf(g);
    if (g.name) name.setAttribute("translate", "no"); // a name its owner gave it
    m.append(elementBadge(g.type));
    m.onclick = () => go("creatures");
    row.append(m);
  }
  b.append(row);
  return b;
}

// ---------- quick battles ----------

/** Two big tiles: a wild encounter (your team against wild creatures) and a rental duel (three of the week's six). */
function quickBlock(game, vocab, close) {
  const b = block("Quick battles");
  const grid = h(`<div class="gs-grid bt-two"></div>`);
  const wild = tile({ pic: "", name: "Wild encounter", sub: "Your team", open: () => wildBattle(game, vocab, close) });
  wild.querySelector(".gs-tile-pic").append(portrait(wildTeam(Math.random, 1)[0], 64));
  const pool = rentalPool(weekNumber());
  const rental = tile({ pic: "", name: "Rental duel", sub: "Even fight", open: () => rentalBox(game, vocab, close) });
  rental.querySelector(".gs-tile-pic").append(portrait(pool[0], 64));
  grid.append(wild, rental);
  b.append(grid);
  return b;
}

function wildBattle(game, vocab, close) {
  close();
  const rand = Math.random;
  const mine = fighters(game, teamOf(game).map((i) => game.roster[i]), { wild: true });
  const theirs = fighters(null, wildTeam(rand, mine.length));
  runLiveBattle({ mine, theirs, mode: "wild", foeForm: 0.55 + rand() * 0.25, cards: { me: vocab.length } }, vocab);
}

/** A rental duel: the week's six shared creatures in a box; choose three (a tap chooses or puts back), and your rival
 * fights with the other three. */
function rentalBox(game, vocab, close) {
  const pool = rentalPool(weekNumber());
  let chosen = new Set();
  const grid = h(`<div class="bt-rentals"></div>`);
  const cards = pool.map((g, i) => {
    const c = h(`<button type="button" class="cr-tile bt-rental"><span class="cr-tile-pic"></span><strong></strong><span class="bt-pick" hidden>${lineIcon("check", 14)}</span></button>`);
    c.querySelector(".cr-tile-pic").append(portrait(g, 64));
    c.querySelector("strong").textContent = beastById(describe(g).beast).name;
    c.append(elementBadge(g.type));
    c.onclick = () => { chosen = toggleRental(chosen, i); d.redraw(); };
    grid.append(c);
    return c;
  });
  const d = details(() => {
    cards.forEach((c, i) => {
      c.classList.toggle("on", chosen.has(i));
      c.setAttribute("aria-pressed", chosen.has(i) ? "true" : "false");
      c.querySelector(".bt-pick").hidden = !chosen.has(i);
    });
    const left = rentalLeft(chosen);
    return {
      title: "Rental duel",
      text: "Choose three. Your rival fights with the other three.",
      more: grid,
      note: left ? t("Choose {0} more", left) : "",
      buttons: [
        { word: "Close", run: () => d.close() },
        { word: "Start the duel", primary: true, disabled: left > 0, run: () => {
          d.close();
          close();
          const mine = fighters(null, pool.filter((_, i) => chosen.has(i)));
          const theirs = fighters(null, pool.filter((_, i) => !chosen.has(i)));
          runLiveBattle({ mine, theirs, mode: "rental", foeForm: 0.7, rival: { id: null, name: "Rival", rating: game.rating } }, vocab);
        } },
      ],
    };
  });
}

// ---------- words and record ----------

function wordsBlock(game, vocab) {
  const b = block("Words");
  b.append(wordModePicker(game, () => {}, { meanings: quizzable(vocab).length, dueOf: (mode) => reviewSummary(game, battleWords(vocab, mode)).due }));
  return b;
}

/** Your record, like a trainer's card: skill, wins, how many answers were right lately, words known. */
function recordBlock(game) {
  const acc = retention(game);
  const b = block("Your record");
  b.append(factCells([
    fact("Skill", `${icon("rating")}${fmt(game.rating)}`),
    fact("Wins", fmt(game.stats.wins)),
    fact("Right lately", acc === null ? "–" : `${Math.round(acc * 100)}%`),
    fact("Words known", fmt(game.known)),
  ]));
  return b;
}

// ---------- the "?": how battles work ----------

/** A part of an explanation: a heading, then its points (markup). (Points as arguments, not in a list: the
 * translation finder passes over a string that opens a list.) */
function helpPart(title, ...items) {
  const part = h(`<div><strong></strong><ul class="info-list"></ul></div>`);
  part.querySelector("strong").textContent = title;
  for (const it of items) part.querySelector("ul").append(h(`<li>${it}</li>`));
  return part;
}

/** How battles work, over the Battle screen (its "?"). The explanations that used to sit on the screen are here. */
export function battleHelp(game, go, opts = {}) {
  const { body } = helpSheet("How battles work", "battle", opts);
  body.append(
    helpPart("A battle",
      `A battle is a review of your own vocab: each move you make is powered by a question about one of your saved words, and your rival answers from theirs. It takes about ${BATTLE_UNLOCK_WORDS} words for the questions to stay fresh. Save words with ★ while you listen and read.`,
      "Battles are live: walk your creature round the arena with the controller's stick, the keys, a click or your finger, and use a move with its button. Each move asks about one of your words while the battle waits: answer within 5 seconds or the move fails. The ground matters: some of it makes you faster, tougher or stronger."),
    helpPart("Your team", "Your first three hatched creatures fight, in the order of the Creatures page. Tap one to see it and choose its moves."),
    helpPart("Wild encounter",
      "Your own creatures against wild ones. Their age gives yours a small edge here only.",
      "A win may leave you an egg, while you have fewer than six creatures."),
    helpPart("Rental duel", "Pick three of this week's six shared creatures; your rival gets the rest. Always an even fight. Counts for your skill rating."),
    helpPart("Gym leaders",
      "Ten gym leaders, each harder than the last: they react faster, dodge more, aim where you are going and give you less time for each question. Beat one to open the next.",
      "The first win against each one pays coins and XP on top. Gyms don't change your skill rating."),
    helpPart("Which words?",
      `Questions come from the ${LAST_WORDS} words you saved most recently, and every creature fights at the same level: the fairest fight for everyone.`,
      `Questions can be any word you have saved in this language, so they are harder. Your creatures grow stronger with every card you have: you have ${game.cards || 0}, so they fight at ×${cardScale(game.cards || 0).toFixed(2)} (×2 at most).`),
    helpPart("Your record",
      "Skill goes up when you win rental duels and friend battles, and down when you lose them.",
      "Right lately: how many of your answers in battles were right this week."),
  );
}

/**
 * Challenge a friend's team. They aren't there: their creatures fight with the moves they chose,
 * and answer as accurately as their owner usually answers their own words. You answer yours.
 * In an all-time battle each side is as strong as the cards its owner has saved.
 */
export async function startFriendBattle(friend, row) {
  const game = getGame();
  // Their team came from their device: only the checked copy fights (remote.js), whoever called this.
  const profile = cleanProfile(row) || cleanProfile({});
  const rivalName = cleanName(friend && friend.username, LIMITS.username) || "A friend";
  const rule = weeklyRule();
  const vocab = await loadWords(game);
  saveGame();
  if (vocab.length < BATTLE_UNLOCK_WORDS) { toast(`Battles unlock at ${BATTLE_UNLOCK_WORDS} saved words. You have ${vocab.length}.`); return; }
  if (!pickQuestion(game, vocab)) { toast("Your words need meanings before they can be asked. Fill some in on the Vocab page."); return; }
  const mineIdx = teamOf(game, rule);
  if (!mineIdx.length) { toast(`None of your creatures fit this week's rule (${rule.name}).`); return; }
  const theirTeam = ((profile && profile.team) || []).filter((g) => fits(g, rule)).slice(0, teamSize(rule));
  if (!theirTeam.length) { toast(`${rivalName} has no creatures that fit this week's rule (${rule.name}).`); return; }
  const mine = fighters(game, mineIdx.map((i) => game.roster[i]), { rule });
  const theirs = fighters(null, theirTeam, { rule });
  // (a friend on an older version shares how many words they know, not their cards: those count instead)
  const theirCards = Number(theirTeam[0].cards ?? theirTeam[0].known) || 0;
  for (const f of theirs) f.name = f.name || rivalName;
  runLiveBattle({ mine, theirs, mode: "friend", rule, foeForm: Number(profile.form) || 0.7, cards: { me: vocab.length, foe: Math.min(100000, theirCards) },
    rival: { id: friend.id, name: rivalName, rating: profile.rating } }, vocab);
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
