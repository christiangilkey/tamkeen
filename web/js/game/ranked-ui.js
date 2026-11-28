// Ranked battles (prototype "ranked"): the Ranked block on the Battle screen, the search for a match, the
// leaderboard and the result. The owner (2026-11-25): "matchmaking with an elo system, players start at zero, it
// adds points to it each battle and tries to match players up with simlar elo players in battles".
// The sums are in ranked.js (shown) and supabase/v18-ranked.sql (decided); the calls in ../rankedsync.js; the battle
// itself, live between the two devices, in rankedlive.js (the owner: "I want live now", in All-time mode).

import { h, state, toast } from "../app.js";
import { t } from "../i18n.js";
import { feature } from "../prototype.js";
import { onlineStatus } from "../agegate.js";
import { icon } from "./render.js";
import { block, details, fmt } from "./screenparts.js";
import { GIVE_UP_S, K, K_NEW, NEW_GAMES, TIERS, signed, stakes, tierOf } from "./ranked.js";
import * as ranked from "../rankedsync.js";
import { BATTLE_UNLOCK_WORDS } from "./data.js";
import { publicProfile } from "./battle.js";
import { pickQuestion } from "./rules.js";
import { getGame, saveGame } from "./game.js";
import { wordPool } from "./livebattle.js";
import { rankedLink, realtimeLink } from "./rankedlive.js";
import { showTeamOn } from "./champion.js";

/** Why this player can't battle ranked yet (a sentence), or "" when they can: enough words with meanings, a team. */
export function notReady(game, vocab) {
  if (vocab.length < BATTLE_UNLOCK_WORDS) return t("Battles unlock at {0} saved words. You have {1}.", BATTLE_UNLOCK_WORDS, vocab.length);
  if (!pickQuestion(game, wordPool(vocab, "alltime"))) return t("Your words need meanings before they can be asked. Fill some in on the Vocab page.");
  if (!publicProfile(game, null).team.length) return t("You need a hatched creature in your team to battle.");
  return "";
}

/** A tier's name, for showing (translated). */
export const tierName = (id) => t((TIERS.find((x) => x.id === id) || TIERS[0]).name);

/** "Silver · 212" as markup (numbers and fixed words only). */
const ratingHtml = (rating) => `<span class="rk-rating rk-${tierOf(rating).id}">${icon("rating")}<b>${fmt(rating)}</b></span>`;

/** Who may play ranked here: "ok", or the reason not ("young": under 16 or not asked; "out": not signed in). */
async function whoCan() {
  if ((await onlineStatus()) !== "ok") return "young";
  const social = await import("../social.js");
  return (await social.currentUser().catch(() => null)) ? "ok" : "out";
}

/** The Ranked block on the Battle screen (nothing at all without the prototype). `play(match)` starts the battle
 *  of a match the queue found; `close` closes the Battle screen first. */
export function rankedBlock(game, vocab, close, play) {
  if (!feature("ranked")) return null;
  const help = h(`<button type="button" class="ghost icon" title="How ranked works" aria-label="How ranked works">?</button>`);
  help.onclick = rankedHelp;
  const b = block("Ranked", help);
  b.classList.add("rk-block");
  const body = h(`<div class="rk-body"><p class="gs-state muted">Loading your rating…</p></div>`);
  b.append(body);
  fill();
  return b;

  async function fill() {
    const who = await whoCan();
    if (!b.isConnected && who) { /* (still filled: the block may be added after this starts) */ }
    if (who === "young") { say("Ranked battles are online: they open with Friends."); return; }
    if (who === "out") { say("Sign in to Friends first to play ranked battles."); return; }
    let me;
    try { me = await ranked.myRating(); } catch (e) { say(e.message); return; }
    body.replaceChildren();
    const card = h(`<div class="rk-card"><div class="rk-big">${ratingHtml(me.rating)}<span class="rk-tier"></span></div>
      <div class="rk-sub small muted"></div></div>`);
    card.querySelector(".rk-tier").textContent = tierName(me.tier);
    card.querySelector(".rk-sub").textContent = me.games
      ? t("{0} wins in {1} ranked battles", fmt(me.wins), fmt(me.games)) + (me.place ? ` · ${t("#{0} on the leaderboard", fmt(me.place))}` : "")
      : t("Everyone starts at 0. Win ranked battles to climb.");
    const buttons = h(`<div class="rk-buttons"><button type="button" class="primary rk-find">${icon("battle")} <span>Find a ranked match</span></button>
      <button type="button" class="rk-top">${icon("trophy")} <span>Leaderboard</span></button></div>`);
    buttons.querySelector(".rk-find").onclick = () => {
      const why = notReady(game, vocab);
      if (why) { toast(why); return; }
      findMatch(me, close, play, fill);
    };
    buttons.querySelector(".rk-top").onclick = () => leaderboard();
    body.append(card, buttons);
  }

  function say(text) {
    body.replaceChildren(h(`<p class="gs-state muted"></p>`));
    body.firstChild.textContent = text;
  }
}

/** The search: a box with the seconds waited and how far from my rating it looks, a Cancel button; "No one
 *  found" after GIVE_UP_S seconds; on a match, both ratings and what it could win or lose, then `play(match)`. */
export function findMatch(me, close, play, refresh = () => {}) {
  let stop = false;
  let timer = null;
  let state = { status: "joining" };
  let started = Date.now();
  const d = details(() => {
    if (state.status === "matched") return matchedView(state);
    if (state.status === "none") {
      return {
        title: "No one found",
        text: "No one near your rating is looking for a ranked match right now. Try again in a little while.",
        buttons: [
          { word: "Close", run: () => { d.close(); } },
          { word: "Try again", primary: true, run: () => { state = { status: "joining" }; started = Date.now(); stop = false; d.redraw(); go(ranked.joinQueue); } },
        ],
      };
    }
    if (state.status === "error") return { title: "Ranked", text: state.message, buttons: [{ word: "Close", primary: true, run: () => d.close() }] };
    const waited = Math.floor((Date.now() - started) / 1000);
    const range = state.window == null || state.window === Infinity ? t("any rating") : t("within {0} points of yours", fmt(state.window || 100));
    return {
      title: "Finding a ranked match",
      pic: h(`<div class="rk-search">${icon("battle", 48)}</div>`),
      text: t("Looking for a player online now, {0}.", range),
      note: t("{0} of {1} seconds", waited, GIVE_UP_S),
      buttons: [{ word: "Cancel", run: () => cancel() }],
    };
  });
  const tick = setInterval(() => { if (stop) clearInterval(tick); else if (state.status === "waiting" || state.status === "joining") d.redraw(); }, 1000);
  const closeBox = d.close;
  d.close = () => { if (state.status !== "matched") cancel(); else { stop = true; clearTimeout(timer); closeBox(); } };
  go(ranked.joinQueue);
  return d;

  async function go(call) {
    if (stop) return;
    let next;
    try { next = await call(); } catch (e) { state = { status: "error", message: e.message }; d.redraw(); return; }
    if (stop) return;
    if (next.status === "out") next = { status: "none" };
    state = next;
    d.redraw();
    if (state.status === "waiting") timer = setTimeout(() => go(ranked.pollQueue), ranked.POLL_MS);
    else if (state.status === "matched") timer = setTimeout(() => { stop = true; closeBox(); close(); play(state, refresh); }, 3500);
    else if (state.status === "none") refresh();
  }

  function cancel() {
    stop = true;
    clearTimeout(timer);
    closeBox();
    if (state.status === "waiting" || state.status === "joining") ranked.leaveQueue().catch(() => {});
  }

  function matchedView(m) {
    const st = stakes(m.me.rating, m.rival.rating, m.me.games);
    const side = (name, rating) => {
      const el = h(`<div class="rk-side"><strong></strong>${ratingHtml(rating)}<span class="small muted"></span></div>`);
      el.querySelector("strong").textContent = name;
      el.querySelector("strong").setAttribute("translate", "no");
      el.querySelector(".muted").textContent = tierName(tierOf(rating).id);
      return el;
    };
    const vs = h(`<div class="rk-vs"></div>`);
    const mine = side(t("You"), m.me.rating);
    mine.querySelector("strong").removeAttribute("translate");
    vs.append(mine, h(`<span class="rk-vs-word">vs</span>`), side(m.rival.username, m.rival.rating));
    const box = h(`<div class="rk-found"></div>`);
    const at = h(`<p class="rk-stakes"></p>`);
    at.textContent = t("Win: {0} · Lose: {1}", signed(st.win), signed(st.lose));
    box.append(vs, at);
    return {
      title: "Match found!",
      more: box,
      note: "All-time words: every card you have saved.",
      buttons: [],
    };
  }
}

/** After a ranked battle: what the server decided, once both reports are in (it asks again for a short while). */
export async function showResult(match, said) {
  let r;
  try { r = await ranked.report(match, said); } catch (e) { toast(e.message, { error: true }); return null; }
  for (let i = 0; r.status === "waiting" && i < 10; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    try { r = await ranked.result(match); } catch { break; }
  }
  return r;
}

/** The end card's ranked line (markup: numbers and fixed words). */
export function resultLine(r) {
  if (!r || r.status !== "settled") return `${icon("rating")} ${t("Ranked: waiting for the other player's result. Your rating changes once it arrives.")}`;
  if (r.outcome === "void") return `${icon("rating")} ${t("Ranked: no change (the battle didn't finish properly)")}`;
  return `${icon("rating")} ${t("Ranked {0}", signed(r.change))} → <b>${fmt(r.rating)}</b> ${tierName(tierOf(r.rating).id)}`;
}

/** The leaderboard: the best ratings, by username only. */
export function leaderboard() {
  let rows = null;
  let problem = "";
  const list = h(`<ol class="rk-list"></ol>`);
  const d = details(() => {
    list.replaceChildren();
    for (const [i, x] of (rows || []).entries()) {
      const li = h(`<li class="rk-row${x.me ? " me" : ""}"><span class="rk-n">${i + 1}</span><span class="rk-name" translate="no"></span>
        <span class="rk-tiername small muted"></span>${ratingHtml(x.rating)}</li>`);
      li.querySelector(".rk-name").textContent = x.username;
      li.querySelector(".rk-tiername").textContent = tierName(x.tier);
      list.append(li);
    }
    return {
      title: "Leaderboard",
      text: problem || (rows === null ? t("Loading…") : rows.length ? "" : t("No ranked battles yet. Be the first!")),
      more: list,
      buttons: [{ word: "Close", primary: true, run: () => d.close() }],
    };
  });
  ranked.top(20).then((r) => { rows = r; d.redraw(); }, (e) => { problem = e.message; rows = []; d.redraw(); });
  return d;
}

/** How ranked works, in plain words, with the real numbers. */
export function rankedHelp() {
  const ul = h(`<ul class="info-list"></ul>`);
  const add = (text) => { const li = h(`<li></li>`); li.textContent = text; ul.append(li); };
  add(t("Ranked battles are live: you and another player online now."));
  add(t("When either of you attacks, you both get a question about your own words at the same moment: the first right answer wins."));
  add(t("Everyone starts at 0, and your rating never goes below 0."));
  add(t("Beat someone rated higher and you win more points; lose to someone rated lower and you lose more."));
  add(t("Against someone rated the same: +{0} or −{0} for your first {1} ranked battles, then +{2} or −{2}.", K_NEW / 2, NEW_GAMES, K / 2));
  add(t("Ranked battles always use all your saved words (All-time)."));
  add(t("The search starts with players within 100 points of you and widens the longer you wait."));
  add(t("Leaving a ranked battle counts as a loss. If the connection drops, nothing changes."));
  add(t("Tiers: Bronze from 0, Silver 200, Gold 400, Platinum 600, Diamond 800, Champion 1000."));
  const d = details(() => ({ title: "How ranked works", more: ul, buttons: [{ word: "OK", primary: true, run: () => d.close() }] }));
  return d;
}

/**
 * Start the battle of a match the queue found: live, against the other player on their own device (rankedlive.js),
 * always with all the player's saved words. First the two devices meet on the match's channel (a box says so, with
 * Cancel); a match that never starts is called off, so nothing changes for either player.
 */
export async function startRankedBattle(match, vocab, refresh = () => {}) {
  const game = getGame();
  const name = match.rival.username;
  const callOff = () => ranked.report(match.match, "broken").catch(() => {}).finally(refresh);
  const why = notReady(game, vocab);
  if (why) { callOff(); toast(why); return; }
  let link = null, cancelled = false;
  const d = details(() => ({
    title: "Getting ready",
    text: t("Connecting to {0}…", name),
    buttons: [{ word: "Cancel", run: () => { cancelled = true; if (link) link.stop(); d.close(); } }],
  }));
  const give = (text) => { if (link) link.stop(); callOff(); if (!cancelled) { d.close(); toast(text); } };
  try {
    const social = await import("../social.js");
    const transport = await realtimeLink(await social.sb(), match.match);
    if (cancelled) { transport.close(); callOff(); return; }
    const team = publicProfile(game, null).team;
    // (the ranked champion, prototype ranked_champion: the team taken into ranked battles is the one the hall shows if
    // this player is the best, unless they switched that off in Settings; no harm if the server can't take it yet)
    if (feature("ranked_champion")) ranked.showcase(team, showTeamOn(state.status && state.status.settings)).catch(() => {});
    link = rankedLink({
      host: match.host, seed: match.seed, team, cards: vocab.length, rival: { name }, transport,
      report: (said) => ranked.report(match.match, said).catch(() => null).finally(refresh),
      finish: async (said, lines) => { // the end card: the server's answer, once both have reported
        const line = document.createElement("div");
        line.innerHTML = `${icon("rating")} ${t("Ranked: sending the result…")}`;
        if (lines) lines.append(line);
        const r = await showResult(match.match, said);
        line.innerHTML = resultLine(r); // (numbers and fixed words only)
        refresh();
      },
    });
    await link.connect();
  } catch (e) {
    const m = String(e && e.message);
    give(m === "version" ? t("{0} has a different version of Tamkeen. Both of you need the newest one for ranked battles.", name)
      : m === "stopped" ? "" : t("Couldn't connect to {0}. No points changed.", name));
    return;
  }
  if (cancelled) { give(""); return; }
  d.close();
  saveGame();
  const { runLiveBattle } = await import("./livebattle-ui.js");
  runLiveBattle({ mode: "ranked", rival: { id: null, name }, net: link, words: wordPool(vocab, "alltime") }, vocab);
}
