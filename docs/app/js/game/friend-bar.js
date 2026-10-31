// The small bar next to a person's name in the friends list: the language they're learning,
// their league, the XP they've earned today, their flashcard streak (the flame) and the creature
// they chose to show off. Everything comes from their shared game profile (social.gameProfiles);
// never any words. Every part is a button that opens a short explanation (game/info.js `sheet`).

import { h } from "../app.js";
import { icon as lineIcon } from "../icons.js";
import { isLanguage, langInfo } from "../languages.js";
import { streakNow } from "../review/streak.js";
import { LEAGUES, SPECIES, TYPES, VARIANTS } from "./data.js";
import { describe, formOf } from "./genome.js";
import { showcaseGenome, xpToday } from "./battle.js";
import { portrait } from "./battle-ui.js";
import { sheet } from "./info.js";
import { weekNumber } from "./rules.js";
import { icon } from "./render.js";

const STAGE_NAME = { hatchling: "Hatchling", juvenile: "Juvenile" };

/** A sheet with a few short paragraphs (and, optionally, one button that goes somewhere). */
function explain(title, pic, lines, go = null) {
  const { body, close } = sheet(title, pic);
  for (const line of lines.filter(Boolean)) {
    const p = h(`<p></p>`);
    p.textContent = line;
    body.append(p);
  }
  if (go) {
    const b = h(`<button type="button" class="primary"></button>`);
    b.textContent = go.label;
    b.onclick = () => { close(); go.run(); };
    const row = h(`<div class="row"></div>`);
    row.append(b);
    body.append(row);
  }
  return body;
}

/** One part of the bar: a button that explains itself (the row behind it opens something else). */
function part(cls, title, open) {
  const b = h(`<button type="button" class="${cls}"></button>`);
  b.title = title;
  b.onclick = (e) => { e.stopPropagation(); open(); };
  return b;
}

/**
 * Element for one person's bar, or null when there is nothing to show.
 *   game   the creature game is on here: league, XP and creature are shown (off: only the
 *          language and the flame, which aren't part of the game)
 *   me     it is my own bar (the explanations say "you"); `today` = my streak.js result for today
 *   name   their username, for the explanations
 */
export function gameBar(profile, { now = new Date(), game = true, me = false, name = "", today = null } = {}) {
  if (!profile) return null;
  const bar = h(`<span class="game-bar"></span>`);
  const who = name ? `@${name}` : "A friend";

  if (isLanguage(profile.language)) {
    const lang = langInfo(profile.language);
    const chip = part("gb-lang", `Learning ${lang.name}: tap for more`, () => explain(lang.name, lineIcon("page", 28), [
      me ? `You are learning ${lang.name}. Friends see it next to your name.` : `${who} is learning ${lang.name}.`,
      me ? "Change it with the language switch on Home. The other numbers here are for the language you are learning now."
        : "It is the language they chose on their own Home page.",
    ]));
    chip.textContent = lang.name;
    bar.append(chip);
  }

  if (game) {
    const league = LEAGUES[profile.league] || LEAGUES[0];
    const days = profile.week === weekNumber(now) ? Math.max(0, profile.goal_days || 0) : 0;
    const chip = part("gb-league", `${league} league: tap for more`, () => explain(`${league} league`, `league_${league.toLowerCase()}`, [
      me ? "Your league in the creature game. There are four: Bronze, Silver, Gold and Diamond."
        : "Their league in the creature game. There are four: Bronze, Silver, Gold and Diamond.",
      "Reaching the daily goal (minutes of listening or reading) on 5 days or more of a week moves a player up a league the week after. 1 day or none moves them down.",
      `This week so far: ${days} day${days === 1 ? "" : "s"} with the goal reached.`,
    ]));
    chip.innerHTML = icon(`league_${league.toLowerCase()}`, 24, `${league} league`);
    bar.append(chip);

    const xp = xpToday(profile, now);
    const xpEl = part(`gb-xp${xp ? "" : " none"}`, "XP earned today: tap for more", () => explain(`${xp.toLocaleString()} XP today`, "xp", [
      me ? "The XP you have earned today in the creature game." : `The XP ${who} has earned today in the creature game.`,
      "XP comes from looking words up, saving words, listening and reading, flashcards and battles. It grows the creature and the player's level.",
      "It starts again from 0 at midnight (each person's own).",
    ]));
    xpEl.innerHTML = `${icon("xp")}<b></b><span class="small"> today</span>`;
    xpEl.querySelector("b").textContent = xp.toLocaleString();
    bar.append(xpEl);
  }

  // The flashcard streak, from an app new enough to send it.
  if ("streak" in profile) {
    const n = streakNow(profile, now);
    const flame = part(`gb-flame${n ? " lit" : ""}`, "Flashcard streak: tap for more", () => {
      const status = !me || !today ? ""
        : today.today === "met" ? "Today's flashcards are done."
        : today.today === "rest" ? "Nothing to study today: the streak carries on tomorrow."
        : `To keep it going today: ${today.check.newLeft} new word${today.check.newLeft === 1 ? "" : "s"} and ${today.check.revLeft} review${today.check.revLeft === 1 ? "" : "s"} left.`;
      explain(n ? `${n}-day flashcard streak` : "No flashcard streak yet", lineIcon("flame", 28), [
        me ? "Days in a row you finished your flashcards: the day's new words and every review that was due."
          : `Days in a row ${who} finished their flashcards: the day's new words and every review that was due.`,
        status,
        "A day with nothing to study doesn't break it. It lasts until the end of the next day, so there is all of today to keep it going.",
        me ? "The goal streak in the creature game is a different one: days of listening or reading." : "",
      ], me && today && today.today === "open" ? { label: "Review now", run: () => { location.hash = "#/vocab"; } } : null);
    });
    flame.innerHTML = `${lineIcon("flame", 16)}<b></b>`;
    flame.querySelector("b").textContent = n.toLocaleString();
    bar.append(flame);
  }

  const g = game ? showcaseGenome(profile) : null;
  if (g) {
    const look = describe(g);
    const creature = g.name || SPECIES[look.species].name;
    const about = [TYPES[g.type] && TYPES[g.type].name, STAGE_NAME[formOf(g).id],
                   look.variant && VARIANTS[look.variant].name].filter(Boolean).join(" · ");
    const show = part("gb-creature", me ? "Your favourite creature: tap for more" : "Their favourite creature: tap for more", () => {
      const body = explain(creature, "nav_roster", [
        about,
        me ? "Your favourite creature: the one friends see next to your name. Choose another on the Creatures page with Show to friends."
          : `${who}'s favourite creature, chosen to show to friends.`,
      ]);
      const big = h(`<div class="gb-big"></div>`);
      big.append(portrait(g, 96));
      body.prepend(big);
    });
    show.append(portrait(g, 40));
    bar.append(show);
  }
  return bar.children.length ? bar : null;
}
