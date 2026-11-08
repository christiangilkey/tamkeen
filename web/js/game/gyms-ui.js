// The gyms on the Battle screen: ten leaders to beat in order (gyms.js), shown as a path like a badge case: the ones
// beaten in colour with a tick, the next one ringed, the rest locked and faint. A tap opens a leader's entry (its team,
// its numbers, what it is like) with Fight or Rematch; under the path a button fights the next one. The battle itself
// is livebattle-ui.js; battle-ui.js has made its checks (20 words, meanings, a hatched creature) before this is shown.

import { h } from "../app.js";
import { t } from "../i18n.js";
import { TYPES } from "./data.js";
import { fighters } from "./battle.js";
import { generateMap } from "./battlemap.js";
import { GYM_COUNT, LEADERS, gymProgress, gymSetup, leaderElement, leaderTeam } from "./gyms.js";
import { getGame } from "./game.js";
import { icon } from "./render.js";
import { icon as lineIcon } from "../icons.js";
import { openBattleMenu, portrait } from "./battle-ui.js";
import { runLiveBattle } from "./livebattle-ui.js";
import { amount, block, details, fact, fmt } from "./screenparts.js";
import { gymEntry, gymPath, nextGym, teamOf } from "./battlescreen.js";

const STATUS = { beaten: "Beaten", open: "Next", locked: "Locked" };
/** Each leader's team as genomes, made once (gyms.leaderTeam searches for a seed that draws as each beast). */
const teams = new Map();
const teamOfLeader = (leader) => { if (!teams.has(leader.id)) teams.set(leader.id, leaderTeam(leader)); return teams.get(leader.id); };

/** The gym leaders' block for the Battle screen. `close` closes the game sheet (before a battle starts). */
export function gymsBlock(game, vocab, close) {
  const { beaten } = gymProgress(game);
  const b = block("Gym leaders", `${beaten} / ${GYM_COUNT}`);
  b.classList.add("bt-gyms");
  b.querySelector(".gs-block-end").title = t("{0} of {1} beaten", String(beaten), String(GYM_COUNT));
  const path = h(`<div class="badge-case bt-path"></div>`);
  for (const p of gymPath(game)) path.append(gymSlot(game, p, vocab, close));
  b.append(path);
  const next = nextGym(game);
  if (next >= 0) {
    const leader = LEADERS[next];
    const el = leaderElement(leader);
    const fight = h(`<button type="button" class="primary gs-wide bt-fight">${icon(el ? `type_${el}` : "battle")}<span></span></button>`);
    fight.querySelector("span").textContent = t("Fight {0}", leader.name);
    fight.onclick = () => fightLeader(leader, vocab, close);
    b.append(fight);
  } else {
    b.append(h(`<p class="gs-state">${icon("trophy")}<span>All ten gym leaders beaten. Fight any of them again.</span></p>`));
  }
  return b;
}

/** One leader on the path: its first creature in a circle of its element's colour, and its name. */
function gymSlot(game, p, vocab, close) {
  const leader = LEADERS[p.index];
  const slot = h(`<button type="button" class="badge-slot bt-gym ${p.status}"><span class="badge-pic tint-${p.element || "plain"}"></span>
    <span class="badge-name" translate="no"></span></button>`);
  slot.classList.toggle("got", p.status !== "locked");
  slot.querySelector(".badge-pic").append(portrait(teamOfLeader(leader)[0], 44));
  if (p.status !== "open") slot.append(h(`<span class="bt-gym-mark">${p.status === "beaten" ? lineIcon("check", 12) : icon("lock")}</span>`));
  slot.querySelector(".badge-name").textContent = leader.name;
  slot.setAttribute("aria-label", `${leader.name}: ${t(STATUS[p.status])}`);
  slot.onclick = () => leaderBox(game, p.index, vocab, close);
  return slot;
}

/** A leader's entry: its team on its element's colour with its title, then Gym, Elements, Creatures, Each question
 * and the first win's reward (or the wins against it), what it is like, and Fight / Rematch. */
function leaderBox(game, index, vocab, close) {
  const leader = LEADERS[index];
  const team = teamOfLeader(leader);
  const el = leaderElement(leader);
  const types = [...new Set([el, ...team.map((g) => g.type)].filter((x) => x && TYPES[x]))];
  const d = details(() => {
    const e = gymEntry(game, index);
    const stage = h(`<div class="bt-stage tint-${el || "plain"}${e.canFight ? "" : " locked"}"><span class="bt-plate"></span><span class="bt-stage-team"></span></div>`);
    stage.querySelector(".bt-plate").textContent = t(leader.title);
    for (const g of team) stage.querySelector(".bt-stage-team").append(portrait(g, team.length > 2 ? 96 : team.length === 2 ? 120 : 136));
    const elements = types.length === 1
      ? `<span class="el-badge tint-${types[0]}">${icon(`type_${types[0]}`)}<span>${TYPES[types[0]].name}</span></span>`
      : types.map((ty) => icon(`type_${ty}`, 16, TYPES[ty].name)).join("");
    return {
      title: leader.name, pic: stage,
      facts: [
        fact("Gym", t("{0} of {1}", String(e.number), String(e.of))),
        fact("Elements", elements),
        fact("Creatures", fmt(e.creatures)),
        fact("Each question", t("{0} seconds", String(e.seconds))),
        e.reward ? fact("First win", `${amount("coins", e.reward.coins)}<span class="gs-amount">${icon("xp")}${fmt(e.reward.xp)}</span>`)
          : fact("Wins", fmt(e.wins)),
      ],
      text: t(leader.blurb),
      note: e.canFight ? "" : t("Beat {0} to open this gym.", e.after),
      buttons: [
        { word: "Close", run: () => d.close() },
        { word: e.status === "beaten" ? "Rematch" : "Fight", primary: true, disabled: !e.canFight,
          run: () => { d.close(); fightLeader(leader, vocab, close); } },
      ],
    };
  });
}

/** Start a battle against a leader: the owner's team (as in a rental or friend battle, no wild edge) against its team.
 * `close` closes the game sheet first. */
export function fightLeader(leader, vocab, close = () => document.querySelector(".game-sheet-wrap")?.remove()) {
  const game = getGame();
  const team = teamOf(game);
  if (!team.length) return;
  close();
  const mine = fighters(game, team.map((i) => game.roster[i]));
  const theirs = fighters(null, leaderTeam(leader), { scale: leader.scale });
  const map = generateMap((Math.random() * 2 ** 32) >>> 0, leader.theme ? { theme: leader.theme } : {});
  // In an all-time battle the leader is as strong as the player's cards make the player: the words are harder, the fight as even as ever.
  runLiveBattle({ ...gymSetup(leader), mine, theirs, map, cards: { me: vocab.length, foe: vocab.length }, again: () => openGyms() }, vocab);
}

/** The Battle screen, scrolled to the gym leaders ("Battle again" after a gym battle). */
export const openGyms = () => openBattleMenu({ focus: "gyms" });
