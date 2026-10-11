// The small bar next to a person's name in the friends list: the language they're learning,
// their league, the XP they've earned today, and the creature they chose to show off.
// Everything comes from their shared game profile (social.gameProfiles); never any words.

import { h } from "../app.js";
import { isLanguage, langInfo } from "../languages.js";
import { BRANCHES, LEAGUES, SPECIES, TYPES, VARIANTS } from "./data.js";
import { describe, formOf } from "./genome.js";
import { showcaseGenome, xpToday } from "./battle.js";
import { portrait } from "./battle-ui.js";
import { icon } from "./render.js";

const STAGE_NAME = { hatchling: "Hatchling", juvenile: "Juvenile", adult: "Adult" };

/** Element for one person's bar, or null when they haven't started the game. */
export function gameBar(profile, { now = new Date() } = {}) {
  if (!profile) return null;
  const bar = h(`<span class="game-bar"></span>`);

  if (isLanguage(profile.language)) {
    const lang = langInfo(profile.language);
    const chip = h(`<span class="gb-lang" title="Learning ${lang.name}"></span>`);
    chip.textContent = lang.name;
    bar.append(chip);
  }

  const league = LEAGUES[profile.league] || LEAGUES[0];
  bar.append(h(`<span class="gb-league" title="${league} league">${icon(`league_${league.toLowerCase()}`, 24, `${league} league`)}</span>`));

  const xp = xpToday(profile, now);
  const xpEl = h(`<span class="gb-xp${xp ? "" : " none"}" title="XP earned today">${icon("xp")}<b></b><span class="small"> today</span></span>`);
  xpEl.querySelector("b").textContent = xp.toLocaleString();
  bar.append(xpEl);

  const g = showcaseGenome(profile);
  if (g) {
    const look = describe(g);
    const name = g.name || SPECIES[look.species].name;
    const about = [TYPES[g.type] && TYPES[g.type].name, STAGE_NAME[formOf(g).id], look.branch && BRANCHES[look.branch].name,
                   look.variant && VARIANTS[look.variant].name].filter(Boolean).join(" · ");
    const show = h(`<button type="button" class="gb-creature" title="Their favourite creature"></button>`);
    show.append(portrait(g, 40));
    // Tap for a closer look.
    show.onclick = (e) => {
      e.stopPropagation();
      const open = bar.parentElement && bar.parentElement.parentElement.querySelector(".gb-showcase");
      if (open) { open.remove(); return; }
      const card = h(`<div class="gb-showcase"><span class="gb-big"></span><div><strong></strong><div class="small muted"></div>
        <div class="small muted">Their favourite creature</div></div></div>`);
      card.querySelector(".gb-big").append(portrait(g, 96));
      card.querySelector("strong").textContent = name;
      card.querySelector(".small").textContent = about;
      (bar.closest(".friend-head") || bar).after(card);
    };
    bar.append(show);
  }
  return bar;
}
