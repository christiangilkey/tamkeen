// The "Creatures" and "Badges" pages of the game sheet: which creature is out, evolving one when
// it is ready, switching between the forms it has unlocked, and choosing its battle moves.

import { h, toast } from "../app.js";
import { BADGES, BRANCHES, SPECIES, STAGES, TYPES, VARIANTS, moveById } from "./data.js";
import { describe, formOf, readyToEvolve, stageOf } from "./genome.js";
import { branchOptions, evolve, reshape, setActive, variantOptions } from "./rules.js";
import { knownMoves, loadout } from "./battle.js";
import { portrait } from "./battle-ui.js";
import { saveGame, sfx } from "./game.js";

const ART = new URL("../../game-art/", import.meta.url).href;
const STAGE_NAME = { egg: "Egg", hatchling: "Hatchling", juvenile: "Juvenile", adult: "Adult" };

function chips(options, isOn, onPick) {
  const row = h(`<div class="pick-row"></div>`);
  for (const o of options) {
    const b = h(`<button type="button" class="pick${isOn(o) ? " on" : ""}" ${o.open === false ? "disabled" : ""}></button>`);
    b.textContent = o.open === false ? `🔒 ${o.name}` : o.name;
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
  body.append(h(`<p class="small muted">The creature in the habitat is the one that grows as you study. Evolving is yours to
    choose and can be changed later: nothing is lost by trying another form, or by keeping a younger look.</p>`));
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
      + (look.branch ? ` · ${BRANCHES[look.branch].name}` : "") + (look.variant ? ` · ${VARIANTS[look.variant].name}` : "") + ` · seed ${g.seed}`;
    card.querySelector("button").onclick = () => { setActive(game, i); repaint(); };
    const more = card.querySelector(".creature-more");

    if (readyToEvolve(g)) {
      // The owner picks the moment and the form; locked forms say what would open them.
      let branch = branchOptions(g).find((b) => b.open).id;
      let variant = null;
      const box = h(`<div class="evolve-box stack"><strong>✨ Ready to evolve</strong>
        <div class="small muted">Its adult form follows how you study. Choose one:</div><div id="ev-branch"></div>
        <div class="small muted">A special form, if you have earned one:</div><div id="ev-variant"></div>
        <div class="small" id="ev-why"></div>
        <div><button type="button" class="primary" id="ev-go">Evolve</button></div></div>`);
      const paint = () => {
        const bs = branchOptions(g);
        const vs = [{ id: null, name: "None", open: true, why: "" }, ...variantOptions(game, g)];
        box.querySelector("#ev-branch").replaceChildren(chips(bs, (o) => o.id === branch, (o) => { branch = o.id; paint(); }));
        box.querySelector("#ev-variant").replaceChildren(chips(vs, (o) => o.id === variant, (o) => { variant = o.id; paint(); }));
        const locked = [...bs, ...vs].filter((o) => o.open === false).map((o) => `${o.name}: ${o.why}`);
        box.querySelector("#ev-why").textContent = locked.length ? `🔒 ${locked.join(" · ")}` : "";
      };
      paint();
      box.querySelector("#ev-go").onclick = () => {
        const problem = evolve(game, i, branch, variant);
        if (problem) { toast(problem, { error: true }); return; }
        sfx("jackpot");
        toast(`It evolved into its ${BRANCHES[branch].name} form, and left you an egg.`);
        repaint();
      };
      more.append(box);
    } else if (!egg) {
      // Forms already unlocked can be switched freely, and an older creature may keep a younger look.
      const reached = STAGES.filter((s) => s.id !== "egg" && s.from <= g.growth && (s.id !== "adult" || g.branch));
      if (reached.length > 1) {
        more.append(h(`<div class="small muted">Look</div>`), chips(reached.map((s) => ({ id: s.id, name: STAGE_NAME[s.id] })),
          (o) => formOf(g).id === o.id, (o) => { reshape(game, i, { show: o.id === reached[reached.length - 1].id ? null : o.id }); repaint(); }));
      }
      if (g.branch) {
        more.append(h(`<div class="small muted">Adult form</div>`), chips(branchOptions(g).map((b) => ({ ...b, open: g.branches.includes(b.id), why: g.branches.includes(b.id) ? b.why : `Opens as you do more ${BRANCHES[b.id].trait === "listener" ? "listening" : BRANCHES[b.id].trait === "reader" ? "reading" : "word collecting"}` })),
          (o) => g.branch === o.id, (o) => { reshape(game, i, { branch: o.id }); repaint(); }));
        more.append(h(`<div class="small muted">Special form</div>`), chips([{ id: null, name: "None", open: true }, ...variantOptions(game, g)],
          (o) => (g.variant || null) === o.id, (o) => { reshape(game, i, { variant: o.id }); repaint(); }));
      }
      // Battle moves: any four of the ones it knows.
      const known = knownMoves(game, g);
      const using = loadout(game, g);
      more.append(h(`<div class="small muted">Battle moves (choose up to four of ${known.length})</div>`), chips(
        known.map((m) => ({ id: m.id, name: m.name, why: `${m.kind}${m.kind === "attack" ? `, power ${m.power}` : ""}${m.element ? `, ${TYPES[m.element].name}` : ""}` })),
        (o) => using.includes(o.id),
        (o) => {
          let next = using.includes(o.id) ? using.filter((id) => id !== o.id) : [...using, o.id];
          if (next.length > 4) next = next.slice(1);
          if (!next.some((id) => moveById(id).kind === "attack")) { toast("Keep at least one attacking move."); return; }
          g.moves = next;
          repaint();
        }));
    } else {
      more.append(h(`<div class="small muted">Bring it out and study to hatch it.</div>`));
    }
    body.append(card);
  });
}

export function badgesPanel(body, game) {
  body.innerHTML = "";
  body.append(h(`<p class="small muted">Badges are yours for good: ${game.badges.length} of ${BADGES.length} earned.</p>`));
  const grid = h(`<div class="shop-grid"></div>`);
  for (const b of BADGES) {
    const have = game.badges.includes(b.id);
    const el = h(`<div class="shop-item${have ? " on" : " locked"}"><span class="shop-pic"><img alt="" src="${ART}badge/${b.id}.png"></span>
      <span class="shop-name"></span><span class="small muted"></span></div>`);
    el.querySelector(".shop-name").textContent = b.name;
    el.querySelector(".small").textContent = b.text;
    grid.append(el);
  }
  body.append(grid);
}
