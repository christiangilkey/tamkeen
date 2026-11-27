// The creature card's talent parts (prototype "talents"). The owner chose look C, the "Element card", on 2026-11-26,
// without stars: "I dont want people who are attached to their pets to think that they have a subpar pet ... the stat
// changes should be more for really in depth players". So the whole card is in its element's colour with the creature
// walking and idling on it, its stats on a dark panel with the talent in blue (a bar's blue end and a grade letter),
// and its badges on a second panel. No stars and no mark for friends; a creature born with top talents in everything
// earns a quiet "Perfect talent" badge on its owner's card only. Every part explains itself when tapped, in one small
// plain popup. The rules are in talents.js.

import { h } from "../app.js";
import { BASE_STATS, VARIANTS, prizeOf } from "./data.js";
import { describe, isGrown } from "./genome.js";
import { fighter } from "./battle.js";
import { animAt, composeCreature, drawLiving, icon } from "./render.js";
import { openModal } from "../components/modal.js";
import { t } from "../i18n.js";
import { variantOptions } from "./rules.js";
import { MAX_POINTS, ODDS_TEXT, STRENGTHS, STRENGTH_NAME, TALENT_TEXT, GRADE_TEXT, boostOf, floorOf, giftOf, gradeOf, hatched,
         perfect, talentsOf, talentsOn } from "./talents.js";

const ART = new URL("../../game-art/", import.meta.url).href;
// A stat's bar is full at the best of that stat among the body plans, with the most talent on top.
const TOP = Object.fromEntries(STRENGTHS.map((k) => [k, Math.max(...Object.values(BASE_STATS).map((s) => s[k])) * boostOf(MAX_POINTS)]));

/** Whether the creature's card is the Element card: the prototype is on and it has hatched. */
export const talentCard = (g) => talentsOn() && hatched(g);

/** A small popup: a title and a few plain lines, with OK. */
function explain(title, lines) {
  const box = openModal({ title, cls: "tl-back" });
  const view = h(`<div class="tl-explain"></div>`);
  for (const line of lines.filter(Boolean)) view.append(Object.assign(h(`<p></p>`), { textContent: t(line) }));
  const ok = h(`<div class="confirm-buttons"><button type="button" class="primary">OK</button></div>`);
  ok.querySelector("button").onclick = () => box.close();
  view.append(ok);
  box.body.append(view);
}

// ---------- the creature, alive on its card ----------
const STAGE_W = 176;             // the stage in the drawings' own pixels (shown at twice that, crisp)
const STAGE_H = 92;
const WALK_SPEED = 20;           // pixels a second
const EDGE = 34;                 // how near the sides it walks

/**
 * The creature walking and idling on its card: a canvas the width of the stage. It stands breathing for a few
 * seconds, then walks to another spot (facing the way it goes), and again. It stops once the card is gone.
 */
export function livingStage(g) {
  const c = h(`<canvas class="tl-living" width="${STAGE_W}" height="${STAGE_H}"></canvas>`);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const look = describe(g);
  const frames = {};
  const frameOf = (pose) => {
    const key = `${pose.anim}|${pose.frame}|${pose.eyes}`;
    if (!(key in frames)) {
      frames[key] = null;
      composeCreature(look, pose).then((f) => { frames[key] = f; }, () => setTimeout(() => { if (frames[key] === null) delete frames[key]; }, 2000));
    }
    return frames[key] || Object.values(frames).find(Boolean) || null;
  };
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const me = { x: STAGE_W / 2, to: STAGE_W / 2, dir: 1, walkMs: 0, restUntil: 0 };
  let last = 0;
  let shown = false;
  const step = (now) => {
    if (shown && !c.isConnected) return; // (the card was closed or drawn again)
    if (c.isConnected) shown = true;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const moving = !still && Math.abs(me.to - me.x) > 0.5;
    if (moving) {
      me.dir = me.to > me.x ? 1 : -1;
      me.x += Math.sign(me.to - me.x) * Math.min(Math.abs(me.to - me.x), WALK_SPEED * dt);
      me.walkMs += dt * 1000;
    } else if (!still && now > me.restUntil) {
      if (me.restUntil) me.to = EDGE + Math.random() * (STAGE_W - 2 * EDGE);
      me.restUntil = now + 2500 + Math.random() * 3500;
    }
    const pose = moving ? animAt(look, "walk", me.walkMs) : animAt(look, "idle", now, g.seed);
    const pic = frameOf(pose);
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    if (pic) {
      ctx.save();
      ctx.translate(Math.round(me.x), STAGE_H - 2);
      if (me.dir < 0) ctx.scale(-1, 1);
      drawLiving(ctx, pic, look, now); // (as drawImage(pic, -FRAME / 2, -FRAME))
      ctx.restore();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return c;
}

// ---------- its stats, with the talent in blue ----------

/** Its four stats: the number it fights with between people, the talent's extra (blue) against the game, a bar with
 * the talent as its blue end, and the grade. A tap on a row explains that talent. */
export function talentRows(game, g) {
  const plain = fighter(game, g, { talents: false });
  const boosted = fighter(game, g, { vsGame: true, talents: true });
  const value = (f) => ({ hp: f.max, atk: f.atk, def: f.def, spd: f.spd });
  const v = value(plain);
  const w = value(boosted);
  const pts = talentsOf(g);
  const grid = h(`<div class="tl-rows tl-panel"></div>`);
  for (const k of STRENGTHS) {
    const extra = Math.max(0, w[k] - v[k]);
    const row = h(`<button type="button" class="tl-stat"><span class="tl-ic">${icon(`stat_${k}`)}</span><span class="tl-l"></span>
      <span class="tl-n" translate="no"><b></b><small></small></span>
      <span class="tl-bar"><i class="tl-base"></i><i class="tl-plus"></i></span><span class="tl-grade" translate="no"></span></button>`);
    row.querySelector(".tl-l").textContent = t(STRENGTH_NAME[k]);
    row.querySelector(".tl-n b").textContent = String(Math.round(v[k]));
    row.querySelector(".tl-n small").textContent = `+${Math.round(extra)}`;
    row.querySelector(".tl-base").style.width = `${Math.min(100, (v[k] / TOP[k]) * 100)}%`;
    row.querySelector(".tl-plus").style.width = `${Math.min(100, (extra / TOP[k]) * 100)}%`;
    const grade = gradeOf(pts[k]);
    row.querySelector(".tl-grade").textContent = grade;
    row.setAttribute("aria-label", `${t(STRENGTH_NAME[k])} ${Math.round(v[k])}, ${grade}`);
    row.onclick = () => explain(`${t(STRENGTH_NAME[k])}: ${grade}`, [
      t("{0} of {1} talent points.", String(pts[k]), String(MAX_POINTS)),
      GRADE_TEXT[grade],
      t("In battles against the game this is {0}% higher: the blue part.", String(Math.round((boostOf(pts[k]) - 1) * 100))),
      ...TALENT_TEXT.slice(1),
      ...ODDS_TEXT,
    ]);
    grid.append(row);
  }
  return grid;
}

// ---------- its badges ----------

/** Its badges: a perfect talent (its owner's card only), fully grown, a talent passed down to it, and the colourings it
 * has earned by feats. Each explains itself when tapped. Null when it has none yet. */
export function creatureBadges(game, g) {
  const list = [];
  if (perfect(g)) list.push({ art: "badge/five_star", name: "Perfect talent", text: "Born with top talents in everything. A rare hatch." });
  if (isGrown(g)) list.push({ art: "badge/adult_sage", name: "Fully grown", text: "Raised until it was fully grown." });
  const gift = giftOf(g);
  if (gift) list.push({ art: "badge/heir", name: "Heir", text: t("It was given the best talent of a creature you released: {0} {1}.", t(STRENGTH_NAME[gift.s]), gradeOf(gift.p)) });
  for (const o of variantOptions(game, g)) {
    if (!o.open || !VARIANTS[o.id] || !VARIANTS[o.id].feat) continue;
    const prize = prizeOf(o.id);
    list.push({ art: prize ? `item/${prize.id}` : "badge/first_hatch", name: o.name, text: o.why });
  }
  if (!list.length) return null;
  const row = h(`<div class="tl-badges tl-panel"></div>`);
  for (const b of list) {
    const el = h(`<button type="button" class="tl-badge"><img alt="" width="36" height="36"><span></span></button>`);
    el.querySelector("img").src = `${ART}${b.art}.png`;
    el.querySelector("span").textContent = t(b.name);
    el.onclick = () => explain(t(b.name), [b.text]);
    row.append(el);
  }
  return row;
}

/** An egg's line about its talents: they show when it hatches, and whether its odds have been raised. */
export function eggTalentLine(g) {
  if (!talentsOn() || hatched(g)) return null;
  const warm = floorOf(g) > 0 || !!giftOf(g);
  const b = h(`<button type="button" class="ghost tl-egg"></button>`);
  b.textContent = t(warm ? "Its talents show when it hatches. Its odds have been raised." : "Its talents show when it hatches.");
  b.onclick = () => explain(t("Talents"), [...TALENT_TEXT, ...ODDS_TEXT]);
  return b;
}
