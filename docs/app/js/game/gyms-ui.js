// The gyms: ten leaders to beat in order (gyms.js), shown as locked, open or beaten, with a button to fight
// the open one (or a beaten one again). Opened from the battle menu, after its checks (100 words, meanings,
// a hatched creature) have passed; the battle itself is livebattle-ui.js.

import { h } from "../app.js";
import { t } from "../i18n.js";
import { TYPES } from "./data.js";
import { eligible, fighters, teamSize } from "./battle.js";
import { generateMap } from "./battlemap.js";
import { GYM_COUNT, LEADERS, gymProgress, gymSetup, gymStatus, leaderElement, leaderTeam } from "./gyms.js";
import { getGame } from "./game.js";
import { icon } from "./render.js";
import { portrait, sheet } from "./battle-ui.js";
import { runLiveBattle } from "./livebattle-ui.js";


/** The gym list. `vocab` = the learner's saved words (the battle menu has loaded them). */
export function openGyms(vocab) {
  const game = getGame();
  const { body } = sheet(t("Gyms"));
  const { beaten } = gymProgress(game);
  body.append(h(`<div class="stack">
    <p class="small muted">Ten gym leaders, each harder than the last: they react faster, dodge more, aim where you are going and give you less time for each question. Beat one to open the next.</p>
    <div class="today-chips"><span class="today-chip lit"></span></div>
    <div class="gym-list"></div></div>`));
  body.querySelector(".today-chip").textContent = t("{0} of {1} beaten", String(beaten), String(GYM_COUNT));
  const list = body.querySelector(".gym-list");
  LEADERS.forEach((leader, i) => list.append(leaderRow(game, leader, i, vocab)));
  // the open gym in view (and focused, for the controller)
  const open = list.querySelector(".gym.open button");
  if (open) setTimeout(() => { open.scrollIntoView({ block: "nearest" }); open.focus({ preventScroll: true }); }, 0);
}

function leaderRow(game, leader, i, vocab) {
  const status = gymStatus(game, i);
  const el = leaderElement(leader);
  const team = leaderTeam(leader);
  const types = [...new Set(team.map((g) => g.type))];
  const row = h(`<div class="gym ${status}">
    <div class="gym-num">${i + 1}</div>
    <div class="gym-main">
      <div class="gym-head"><strong class="name"></strong><span class="gym-title"></span><span class="gym-els"></span></div>
      <div class="gym-team"></div>
      <p class="small muted gym-blurb"></p>
      <p class="small gym-facts"></p>
    </div>
    <div class="gym-side"></div></div>`);
  row.querySelector(".name").textContent = leader.name;
  row.querySelector(".gym-title").textContent = t(leader.title);
  const els = row.querySelector(".gym-els");
  for (const ty of el ? [el, ...types.filter((x) => x !== el)] : types) {
    els.insertAdjacentHTML("beforeend", icon(`type_${ty}`));
    els.lastElementChild.title = t(TYPES[ty].name);
  }
  const side = row.querySelector(".gym-side");
  if (status === "locked") {
    row.querySelector(".gym-blurb").textContent = t("Beat {0} to open this gym.", LEADERS[i - 1].name);
    side.innerHTML = `${icon("lock")}`;
    side.querySelector("img").title = t("Locked");
    return row;
  }
  for (const g of team) row.querySelector(".gym-team").append(portrait(g, 48));
  row.querySelector(".gym-blurb").textContent = t(leader.blurb);
  const facts = [
    t(leader.team.length === 1 ? "1 creature" : "{0} creatures", String(leader.team.length)),
    t("{0} seconds a question", String(leader.quiz)),
    status === "beaten" ? t("Wins against this leader: {0}", String((game.gyms.wins || {})[leader.id] || 1)) : t("First win: {0} coins and {1} XP", String(leader.reward.coins), String(leader.reward.xp)),
  ];
  row.querySelector(".gym-facts").textContent = facts.join(" · ");
  if (status === "beaten") side.insertAdjacentHTML("beforeend", `<span class="gym-done">${icon("check")}</span>`);
  const fight = h(`<button type="button" class="${status === "open" ? "primary" : ""}"></button>`);
  fight.textContent = status === "open" ? t("Fight") : t("Rematch");
  fight.onclick = () => fightLeader(leader, vocab);
  side.append(fight);
  return row;
}

/** Start a battle against a leader: the owner's team (as in a rental or friend battle, no wild edge) against its team. */
export function fightLeader(leader, vocab) {
  const game = getGame();
  const team = eligible(game).slice(0, teamSize(null));
  if (!team.length) return;
  document.querySelector(".game-sheet-wrap")?.remove();
  const mine = fighters(game, team.map((i) => game.roster[i]));
  const theirs = fighters(null, leaderTeam(leader), { scale: leader.scale });
  const map = generateMap((Math.random() * 2 ** 32) >>> 0, leader.theme ? { theme: leader.theme } : {});
  // In an all-time battle the leader is as strong as the player's cards make the player: the words are harder, the fight as even as ever.
  runLiveBattle({ ...gymSetup(leader), mine, theirs, map, cards: { me: vocab.length, foe: vocab.length }, again: () => openGyms(vocab) }, vocab);
}
