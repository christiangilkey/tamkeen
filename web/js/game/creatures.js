// The "Creatures" and "Badges" pages of the game sheet: which creature is out, how it looks (a
// younger look, a special colouring), and choosing its battle moves.

import { h, toast } from "../app.js";
import { BADGES, SPECIES, STAGES, TRAITS, TYPES, VARIANTS, moveById, moveIcon } from "./data.js";
import { describe, formOf, isGrown, stageOf } from "./genome.js";
import { reshape, setActive, setShowcase, showcaseOf, variantOptions } from "./rules.js";
import { fighter, knownMoves, loadout } from "./battle.js";
import { moveHelp, moveLine, portrait } from "./battle-ui.js";
import { icon } from "./render.js";
import { saveGame } from "./game.js";
import { gift, publishNow } from "./friends-game.js";
import { t } from "../i18n.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const STAGE_NAME = { egg: "Egg", hatchling: "Hatchling", juvenile: "Juvenile" };
const lockIcon = () => [h(icon("lock")), " "];
const FORM_ICON = (o) => o.id && `form_${o.id}`; // icon/form_<id>.png, for the special colourings
const STAT_NAME = { hp: "Health", atk: "Attack", def: "Defence", spd: "Speed" };
const TRAIT_NAME = { listener: "Shaped by listening", reader: "Shaped by reading", collector: "Shaped by saving words", curious: "Shaped by looking words up" };

function chips(options, isOn, onPick, iconOf = null) {
  const row = h(`<div class="pick-row"></div>`);
  for (const o of options) {
    const b = h(`<button type="button" class="pick${isOn(o) ? " on" : ""}" ${o.open === false ? "disabled" : ""}></button>`);
    b.textContent = o.name;
    const pic = iconOf && iconOf(o);
    if (pic) b.prepend(h(icon(pic)), " ");
    if (o.open === false) b.prepend(...lockIcon());
    b.title = o.why || "";
    b.onclick = () => onPick(o);
    row.append(b);
  }
  return row;
}

/** Fill `body` with the creature list. `changed()` runs after anything is altered. */
export function creaturesPanel(body, game, changed) {
  const repaint = () => { saveGame(); changed(); creaturesPanel(body, game, changed); };
  body.innerHTML = "";
  body.append(h(`<p class="small muted">The creature in the habitat is the one that grows as you study. Creatures stay young:
    a juvenile keeps growing until it is fully grown, then leaves you a new egg. Its look is yours to choose and can be changed
    later: nothing is lost by keeping a younger look or trying a special colouring.</p>`));
  game.roster.forEach((g, i) => {
    const look = describe(g);
    const stage = stageOf(g.growth);
    const egg = stage.id === "egg";
    const card = h(`<div class="creature-card${i === game.active ? " on" : ""}">
      <div class="creature-head"><span class="shop-pic"></span>
        <div class="creature-info"><strong></strong><span class="small muted"></span></div>
        <button type="button" class="${i === game.active ? "" : "primary"}" ${i === game.active ? "disabled" : ""}>${i === game.active ? "In the habitat" : "Bring out"}</button>
      </div><div class="creature-more stack"></div></div>`);
    card.querySelector(".shop-pic").append(egg ? h(`<img alt="" src="${ART}egg/${g.type}.png">`) : portrait(g, 64));
    card.querySelector("strong").textContent = g.name || (egg ? "Egg" : SPECIES[look.species].name);
    card.querySelector(".small").textContent = `${TYPES[g.type].name} · ${STAGE_NAME[formOf(g).id]}`
      + (isGrown(g) ? " · Fully grown" : "") + (look.variant ? ` · ${VARIANTS[look.variant].name}` : "") + ` · seed ${g.seed}`;
    card.querySelector("button").onclick = () => { setActive(game, i); repaint(); };
    const more = card.querySelector(".creature-more");
    if (!egg) {
      // The favourite: the creature friends see next to my name in their friends list.
      const shown = showcaseOf(game) === g;
      const fav = h(`<button type="button" class="ghost small fav-btn${shown ? " on" : ""}" title="Friends see this creature next to your name">${icon("star")} ${shown ? "Shown to friends" : "Show to friends"}</button>`);
      fav.onclick = () => { setShowcase(game, shown && game.showcase === g.seed ? null : g.seed); repaint(); publishNow(true); };
      card.querySelector(".creature-info").append(fav);
    }
    if (!egg) {
      // Its battle numbers, and how far each way of studying has shaped it.
      const f = fighter(game, g);
      const stats = Object.entries({ hp: f.max, atk: f.atk, def: f.def, spd: f.spd }).map(([id, n]) => `<span title="${STAT_NAME[id]}">${icon(`stat_${id}`)} ${Math.round(n)}</span>`);
      const traits = TRAITS.map((t) => `<span title="${TRAIT_NAME[t]}">${icon(`trait_${t}`)} ${Math.round((g.traits[t] || 0) * 100)}%</span>`);
      more.append(h(`<div class="creature-stats small">${stats.join("")}<span class="spacer"></span>${traits.join("")}</div>`));
    }

    if (!egg) {
      // An older creature may keep a younger look, and a juvenile may wear a special colouring it has earned.
      const reached = STAGES.filter((s) => s.id !== "egg" && s.from <= g.growth);
      if (reached.length > 1) {
        more.append(h(`<div class="small muted">Look</div>`), chips(reached.map((s) => ({ id: s.id, name: STAGE_NAME[s.id] })),
          (o) => formOf(g).id === o.id, (o) => { reshape(game, i, { show: o.id === reached[reached.length - 1].id ? null : o.id }); repaint(); }));
      }
      if (stage.id === "juvenile") {
        more.append(h(`<div class="small muted">Special colouring</div>`), chips([{ id: null, name: "None", open: true }, ...variantOptions(game, g)],
          (o) => (g.variant || null) === o.id, (o) => { reshape(game, i, { variant: o.id }); repaint(); }, FORM_ICON));
      }
      // Battle moves: any four of the ones it knows.
      const known = knownMoves(game, g);
      const using = loadout(game, g);
      more.append(h(`<div class="small muted">Battle moves (choose up to four of ${known.length}; buy more in the shop)</div>`), chips(
        known.map((m) => ({ id: m.id, name: m.name, why: `${moveLine(m)}${m.element ? ` · ${t(TYPES[m.element].name)}` : ""}. ${moveHelp(m)}` })),
        (o) => using.includes(o.id),
        (o) => {
          let next = using.includes(o.id) ? using.filter((id) => id !== o.id) : [...using, o.id];
          if (next.length > 4) next = next.slice(1);
          if (!next.some((id) => moveById(id).kind === "attack")) { toast("Keep at least one attacking move."); return; }
          g.moves = next;
          repaint();
        }, (o) => moveIcon(moveById(o.id))));
    } else {
      more.append(h(`<div class="small muted">Bring it out and study to hatch it.</div>`));
      if (i !== game.active && game.roster.length > 1) {
        const give = h(`<div><button type="button" class="ghost small">${icon("gift")} Give this egg to a friend</button></div>`);
        give.querySelector("button").onclick = () => gift("egg", i, () => { changed(); creaturesPanel(body, game, changed); });
        more.append(give);
      }
    }
    body.append(card);
  });
}

export function badgesPanel(body, game) {
  body.innerHTML = "";
  body.append(h(`<p class="small muted">Badges are yours for good: ${BADGES.filter((b) => game.badges.includes(b.id)).length} of ${BADGES.length} earned.</p>`));
  const grid = h(`<div class="shop-grid"></div>`);
  for (const b of BADGES) {
    const have = game.badges.includes(b.id);
    const el = h(`<div class="shop-item${have ? " on" : " locked"}"><span class="shop-pic"><img alt="" src="${ART}badge/${b.art || b.id}.png"></span>
      <span class="shop-name"></span><span class="small muted"></span></div>`);
    el.querySelector(".shop-name").textContent = b.name;
    el.querySelector(".small").textContent = b.text;
    grid.append(el);
  }
  body.append(grid);
}
