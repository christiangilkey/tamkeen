// The ranked champion in the championship hall, drawn and tapped (prototype "ranked_champion"; where things stand and
// what the server's answer means: champion.js). habitat.js calls championScene() while it draws the hall, placeChampion()
// for the name plate, and openChampion() when the dais is tapped.

import { h } from "../app.js";
import { t } from "../i18n.js";
import { feature } from "../prototype.js";
import { onlineStatus } from "../agegate.js";
import * as ranked from "../rankedsync.js";
import { DAIS, PENNANTS, STANDS, record } from "./champion.js";
export { showTeamOn } from "./champion.js";
import { describe } from "./genome.js";
import { FRAME, animAt, animatePortrait, beastHeight, composeCreature, drawLiving, icon } from "./render.js";
import { details, fmt } from "./screenparts.js";
import { tierName, leaderboard } from "./ranked-ui.js";

export const championOn = () => feature("ranked_champion");

// ---------- who it is (asked when the hall is entered, again after two minutes) ----------
const FRESH_MS = 120000;
/** {kind: "loading" | "none" | "champion" | "away", champ, why}: "away" when it can't be asked (under 16, signed out,
 *  offline: `why` says which). */
let now = { kind: "loading", champ: null, why: "" };
let askedAt = 0, asking = null;
const listeners = new Set();
/** What is known now; asks the server when it is old (`changed` runs when the answer arrives). */
export function championNow(changed) {
  if (changed) listeners.add(changed);
  if (!asking && Date.now() - askedAt > FRESH_MS) asking = ask().finally(() => { asking = null; askedAt = Date.now(); for (const f of listeners) f(now); });
  return now;
}
async function ask() {
  if ((await onlineStatus()) !== "ok") { now = { kind: "away", champ: null, why: "young" }; return; }
  try {
    const social = await import("../social.js");
    if (!(await social.currentUser().catch(() => null))) { now = { kind: "away", champ: null, why: "out" }; return; }
    const champ = await ranked.champion();
    now = champ ? { kind: "champion", champ, why: "" } : { kind: "none", champ: null, why: "" };
    frames.clear();
  } catch (e) {
    now = { kind: "away", champ: null, why: e.notReady ? "none" : e.message };
  }
}
/** (tests and the mockup) Say who the champion is without asking. */
export function setChampion(champ) { now = champ ? { kind: "champion", champ, why: "" } : { kind: "none", champ: null, why: "" }; askedAt = Date.now(); frames.clear(); }

// ---------- drawn in the hall ----------
const frames = new Map(); // `${i}|${anim}|${frame}|${eyes}` -> composed frame (null while being made)
function frameOf(i, look, pose) {
  const key = `${i}|${pose.anim}|${pose.frame}|${pose.eyes}`;
  if (!frames.has(key)) {
    frames.set(key, null);
    composeCreature(look, pose).then((c) => frames.set(key, c), () => setTimeout(() => frames.delete(key), 2000));
  }
  return frames.get(key) || [...frames.entries()].find(([k, v]) => v && k.startsWith(`${i}|`))?.[1] || null;
}

/**
 * Add the champion's dais, pennants, party and crown to the hall's scene list `out` ([{y, draw}], sorted by y by the
 * caller). `ctx` is the scene's canvas (scene pixels), `img(path)` the habitat's picture cache (null until loaded),
 * `k` how big creatures are drawn outside (habitat creatureScale).
 */
export function championScene(out, { ctx, now: ms, img, k = 2 / 3 }) {
  const state = championNow();
  const dais = img("hall/champion_dais.png"), pennant = img("hall/champion_pennant.png");
  const crown = img("hall/champion_crown.png"), hidden = img("hall/champion_hidden.png");
  if (pennant) for (const p of PENNANTS) out.push({ y: 40, draw: () => ctx.drawImage(pennant, p.x, p.y) });
  const foot = DAIS.y + DAIS.h - 1;
  if (dais) out.push({ y: foot, draw: () => ctx.drawImage(dais, DAIS.x, DAIS.y) });
  const champ = state.kind === "champion" ? state.champ : null;
  const team = champ && !champ.hidden && !champ.partial ? champ.team.slice(0, 3) : [];
  const bob = Math.round(Math.sin(ms / 420) * 1.5);
  const crownAt = (x, top) => { if (crown) ctx.drawImage(crown, (Math.floor(ms / 700) % 3 === 2 ? 1 : 0) * 11, 0, 11, 8, Math.round(x - 5), Math.round(top - 9 + bob), 11, 8); };
  if (!champ) { // nobody yet: the crown rests on the upper tier, waiting
    out.push({ y: foot + 0.1, draw: () => { if (crown) ctx.drawImage(crown, 0, 0, 11, 8, STANDS[0].x - 5, STANDS[0].y - 7, 11, 8); } });
    return;
  }
  if (!team.length) { // a champion who keeps their team private (or not known yet): a shadow with a question mark
    out.push({ y: foot + 0.1, draw: () => {
      if (hidden) ctx.drawImage(hidden, STANDS[0].x - 12, STANDS[0].y - 22);
      crownAt(STANDS[0].x, STANDS[0].y - 22);
    } });
    return;
  }
  // the lead on the upper tier first, then the two in front of it on the lower tier
  team.forEach((g, i) => {
    const at = STANDS[i], look = describe(g);
    const s = k * (at.scale / STANDS[0].scale);
    out.push({ y: foot + 0.1 + i * 0.01, draw: () => {
      const pic = frameOf(i, look, animAt(look, "idle", ms, i + 1));
      if (!pic) return;
      ctx.save();
      ctx.translate(at.x, at.y);
      if (i === 2) ctx.scale(-1, 1); // (the right one faces in, toward the lead)
      ctx.scale(s, s);
      drawLiving(ctx, pic, look, ms);
      ctx.restore();
      if (i === 0) crownAt(at.x, at.y - Math.round(beastHeight(look) * s));
    } });
  });
}

/** The name plate in front of the dais (in the habitat's scene element, over its canvas): name, rating and tier. */
export function placeChampion(canvas, W, H) {
  const box = canvas.parentElement;
  let plate = box.querySelector(".champ-plate");
  const state = championNow();
  if (!plate) {
    plate = h(`<div class="champ-plate" aria-hidden="true"><b translate="no"></b><span></span></div>`);
    box.append(plate);
  }
  const [name, line] = plate.children;
  if (state.kind === "champion") {
    name.textContent = state.champ.username;
    line.textContent = `${fmt(state.champ.rating)} · ${tierName(state.champ.tier)}`;
  } else {
    name.textContent = t("Champion");
    line.textContent = state.kind === "loading" ? "…" : t("No champion yet");
  }
  const r = canvas.getBoundingClientRect(), b = box.getBoundingClientRect();
  plate.style.left = `${r.left - b.left + ((DAIS.x + DAIS.w / 2) / W) * r.width}px`;
  plate.style.top = `${r.top - b.top + ((DAIS.y + DAIS.h + 1) / H) * r.height}px`;
  plate.hidden = false;
}
/** Out of the hall: no plate. */
export function hideChampion(canvas) {
  const plate = canvas.parentElement && canvas.parentElement.querySelector(".champ-plate");
  if (plate) plate.hidden = true;
}

// ---------- the card (tap the dais) ----------
/** A creature's portrait, alive (as battle-ui's portrait). */
function portrait(genome, size) {
  const c = h(`<canvas class="portrait" width="${FRAME}" height="${FRAME}" style="width:${size}px;height:${size}px"></canvas>`);
  const look = describe(genome);
  composeCreature(look, { eyes: "open", mouth: "smile" }).then((frame) => {
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    if (frame) g.drawImage(frame, 0, 0);
    animatePortrait(c, frame, look);
  });
  return c;
}

export function openChampion() {
  const state = championNow();
  const d = details(() => {
    const s = championNow();
    if (s.kind !== "champion") {
      return {
        title: "Ranked champion",
        text: s.kind === "loading" ? t("Loading…")
          : s.why === "young" ? t("Ranked battles are online: they open with Friends.")
          : s.why === "out" ? t("Sign in to Friends to see who the champion is.")
          : s.why && s.why !== "none" ? s.why
          : t("No champion yet. Win ranked battles to stand on this dais: the best player's team is shown here for everyone."),
        buttons: [{ word: "Close", primary: true, run: () => d.close() }],
      };
    }
    const c = s.champ, rec = record(c);
    const more = h(`<div class="champ-card">
      <span class="champ-crown" aria-hidden="true"></span>
      <p class="champ-name" translate="no"></p>
      <p class="champ-best"></p>
      <p class="champ-rating">${icon("rating")}<b>${fmt(c.rating)}</b><span></span></p>
      <div class="champ-team"></div>
      <p class="champ-record"></p>
    </div>`);
    more.querySelector(".champ-name").textContent = c.username;
    more.querySelector(".champ-best").textContent = c.me ? t("That's you: the best ranked player") : t("The best ranked player");
    more.querySelector(".champ-rating span").textContent = tierName(c.tier);
    more.querySelector(".champ-record").textContent = rec ? t("{0} wins, {1} losses", fmt(rec.wins), fmt(rec.losses)) : "";
    const team = more.querySelector(".champ-team");
    if (c.team.length && !c.hidden && !c.partial) {
      for (const g of c.team) {
        const one = h(`<figure class="champ-one"><figcaption translate="no"></figcaption></figure>`);
        one.prepend(portrait(g, 72));
        one.querySelector("figcaption").textContent = g.name || "";
        team.append(one);
      }
    } else {
      const shadow = h(`<figure class="champ-one champ-hidden"><img src="game-art/hall/champion_hidden.png" alt="" width="48" height="48"><figcaption></figcaption></figure>`);
      shadow.querySelector("figcaption").textContent = c.hidden ? t("They keep their team private.") : "";
      team.append(shadow);
    }
    return {
      title: "Ranked champion",
      more,
      buttons: [
        { word: "Leaderboard", run: () => { d.close(); leaderboard(); } },
        { word: "Close", primary: true, run: () => d.close() },
      ],
    };
  });
  if (state.kind === "loading") championNow(() => d.redraw());
  return d;
}

// ---------- my side: the team shown if I'm the champion ----------
/** Tell the server (no harm when it can't: the next ranked battle tells it again). */
export function sendShowTeam(on, team = null) {
  if (!championOn()) return Promise.resolve();
  return ranked.showcase(team, on).catch(() => {});
}
