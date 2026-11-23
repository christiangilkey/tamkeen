// "Find an older game" (Settings → Game features, and a note on Home): the older versions Google Drive keeps of
// the synced library, each shown by what a user can recognise of its game, and one brought back on request by
// combining it with the game as it is now (game.js restoreGame, merge.js), so nothing earned since is lost. Only
// the game: an old version's words and library are never touched. Rules: oldgames.js. A prototype ("old_games").

import { api, h } from "../app.js";
import { confirmBox, openModal } from "../components/modal.js";
import { t, uiLanguage } from "../i18n.js";
import { getGame, restoreGame } from "./game.js";
import { LEADERS } from "./gyms.js";
import { cameBack, clearlyMore, hintPicks, perDay, summary } from "./oldgames.js";

const CACHE_KEY = "tamkeenOldGames";   // version id -> its summary (0: no game in it), so each is read once
const HINT_KEY = "tamkeenOldGameHint"; // "done": the note on Home is not shown again

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };
function cached() {
  try { const c = JSON.parse(read(CACHE_KEY) || "{}"); return c && typeof c === "object" && !Array.isArray(c) ? c : {}; } catch { return {}; }
}
function remember(id, s) {
  const c = cached();
  c[id] = s || 0;
  const keys = Object.keys(c);
  for (const k of keys.slice(0, Math.max(0, keys.length - 80))) delete c[k];
  write(CACHE_KEY, JSON.stringify(c));
}

const path = (id) => `/sync/game-versions/${encodeURIComponent(id)}`;
/** The summary of version `id`'s game (read from Drive the first time only), or null. */
async function summaryOf(id) {
  const c = cached();
  if (Object.prototype.hasOwnProperty.call(c, id)) return c[id] || null;
  const { game } = await api(path(id));
  const s = summary(game);
  remember(id, s);
  return s;
}

function dateText(at) {
  const d = new Date(at * 1000);
  const opts = { weekday: "short", day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  try { return d.toLocaleDateString(uiLanguage() || undefined, opts); } catch { return d.toDateString(); }
}

/** The facts of a game as short pieces (each translated on its own). */
function facts(s) {
  if (!s) return [t("No game in this copy")];
  return [
    t("Level {0}", s.level),
    t("{0} of {1} gym leaders beaten", s.gyms, LEADERS.length),
    s.buildings === 1 ? t("1 garden building") : t("{0} garden buildings", s.buildings),
    s.creatures === 1 ? t("1 creature") : t("{0} creatures", s.creatures),
  ];
}
function factLine(el, s) {
  el.textContent = "";
  for (const [i, f] of facts(s).entries()) {
    if (i) el.append(" · ");
    el.append(Object.assign(document.createElement("span"), { textContent: f }));
  }
}

/** The list of older copies, in its own box. */
export async function openOldGames() {
  const m = openModal({ title: t("Find an older game"), wide: true, cls: "oldgames" });
  const body = h(`<div class="stack">
    <p class="muted"></p>
    <div class="og-row og-now"><div class="og-when"></div><div class="og-facts small"></div></div>
    <div class="og-list stack"><p class="muted og-wait"></p></div>
  </div>`);
  body.querySelector("p").textContent = t("Google Drive keeps older copies of what Tamkeen syncs, for about 30 days. If your garden, gym leaders or creatures went missing, bring back a copy that still has them: it is added to your game as it is now, so nothing you've earned since is lost. Your words and library stay as they are.");
  body.querySelector(".og-now .og-when").textContent = t("Your game now");
  factLine(body.querySelector(".og-now .og-facts"), summary(getGame()));
  const list = body.querySelector(".og-list");
  const say = (text, error = false) => {
    list.textContent = "";
    list.append(Object.assign(document.createElement("p"), { className: error ? "error" : "muted", textContent: text }));
  };
  say(t("Looking in your Google Drive…"));
  m.body.append(body);

  let res;
  try { res = await api("/sync/game-versions"); } catch (e) { say(e.message || t("Google Drive isn't answering. Try again in a moment."), true); return; }
  if (!res.signed_in) { say(t("Sign in with Google in Settings first: the older copies are in your Google Drive.")); return; }
  const versions = perDay(res.versions);
  if (!versions.length) { say(t("No older copies are left. Google Drive keeps them for about 30 days.")); return; }
  list.textContent = "";
  const rows = versions.map((v) => {
    const row = h(`<div class="og-row"><div class="og-when" translate="no"></div><div class="og-facts small muted"></div>
      <span class="og-more" hidden></span><button type="button" class="og-pick" disabled></button></div>`);
    row.querySelector(".og-when").textContent = dateText(v.at);
    row.querySelector(".og-facts").textContent = "…";
    row.querySelector(".og-more").textContent = t("More than now");
    const btn = row.querySelector(".og-pick");
    btn.textContent = t("Bring back");
    btn.onclick = () => bringBack(v, m);
    list.append(row);
    return { v, row };
  });
  // One at a time, the newest first: each is a whole library to download (once; then remembered).
  const now = summary(getGame());
  for (const { v, row } of rows) {
    if (!row.isConnected) return; // (the box was closed)
    let s;
    try { s = await summaryOf(v.id); } catch { row.querySelector(".og-facts").textContent = t("Couldn't read this copy."); continue; }
    factLine(row.querySelector(".og-facts"), s);
    row.querySelector(".og-pick").disabled = !s;
    if (clearlyMore(s, now)) { row.classList.add("more"); row.querySelector(".og-more").hidden = false; }
  }
}

async function bringBack(v, list) {
  const when = dateText(v.at);
  const ok = await confirmBox(t("Bring back the game from {0}?", when),
    t("Its gym leaders beaten, garden, creatures and items are added to your game as it is now. Nothing you've earned since is lost, and your words aren't changed."),
    { ok: t("Bring it back") });
  if (!ok) return;
  const before = summary(getGame());
  let game;
  try { ({ game } = await api(path(v.id))); } catch (e) {
    await confirmBox(t("Couldn't bring it back"), e.message || t("Google Drive isn't answering. Try again in a moment."), { ok: t("OK") });
    return;
  }
  const { changed } = restoreGame(game);
  const after = summary(getGame());
  write(HINT_KEY, "done");
  for (const note of document.querySelectorAll(".home-oldgame")) note.hidden = true; // (its job is done)
  list.close();
  const box = openModal({ title: changed ? t("Your game is back") : t("Nothing to bring back") });
  const lines = changed ? cameBack(before, after) : [];
  const out = h(`<div class="stack"><p class="muted"></p><ul class="og-back"></ul>
    <div class="confirm-buttons"><button type="button" class="primary"></button></div></div>`);
  out.querySelector("p").textContent = !changed ? t("Your game already has everything that copy had.")
    : lines.length ? t("Added to your game from {0}:", when) : t("Its items and progress were added to your game.");
  for (const l of lines) {
    const li = h(`<li><span></span>: <b translate="no"></b></li>`);
    li.querySelector("span").textContent = t(l.label);
    li.querySelector("b").textContent = `${l.from.toLocaleString()} → ${l.to.toLocaleString()}`;
    out.querySelector("ul").append(li);
  }
  out.querySelector("ul").hidden = !lines.length;
  out.querySelector("button").textContent = t("OK");
  out.querySelector("button").onclick = () => box.close();
  box.body.append(out);
}

let check = null; // (the check, once a visit: it can read a few libraries from Drive; Home redraws often)
/**
 * The note on Home, once: when an older copy in Drive clearly has more than the game now (and than the newest copy
 * in Drive, so a device that hasn't synced yet isn't told so), it says so, with a button to the list. Shown until
 * "Not now" or a copy is brought back; never again once a check finds nothing.
 */
export async function homeHint(box) {
  if (!box || read(HINT_KEY) === "done") return;
  check ||= findBetter().catch(() => { check = null; return null; });
  const best = await check;
  if (!best || read(HINT_KEY) === "done" || !box.isConnected) return;
  const note = h(`<div class="og-hint card"><div class="og-hint-text"><b></b><span class="small muted"></span></div>
    <div class="row"><button type="button" class="primary"></button><button type="button" class="ghost"></button></div></div>`);
  note.querySelector("b").textContent = t("An older copy of your game has more progress");
  note.querySelector("span").textContent = `${dateText(best.v.at)}: ${facts(best.s).join(" · ")}`;
  note.querySelector("span").setAttribute("translate", "no");
  const [see, later] = note.querySelectorAll("button");
  see.textContent = t("See older copies");
  later.textContent = t("Not now");
  see.onclick = () => openOldGames();
  later.onclick = () => { write(HINT_KEY, "done"); box.hidden = true; };
  box.textContent = "";
  box.append(note);
  box.hidden = false;
}

/** The older copy the note on Home is about ({v, s}), or null (then the note is never shown again). */
async function findBetter() {
  const res = await api("/sync/game-versions");
  if (!res || !res.signed_in) throw new Error("not signed in"); // (asked again on a later visit)
  const versions = perDay(res.versions);
  const picks = hintPicks(versions);
  if (!picks.length) { write(HINT_KEY, "done"); return null; }
  const sums = new Map();
  for (const v of picks) sums.set(v.id, await summaryOf(v.id));
  const c = cached();
  for (const v of versions) if (!sums.has(v.id) && c[v.id]) sums.set(v.id, c[v.id]); // (copies read in Settings before)
  const now = summary(getGame());
  const newest = sums.get(versions[0].id);
  const ref = now && newest ? Object.fromEntries(Object.keys(now).map((k) => [k, Math.max(now[k], newest[k])])) : now || newest;
  let best = null;
  for (const v of versions.slice(1)) {
    const s = sums.get(v.id);
    if (s && clearlyMore(s, ref) && (!best || s.gyms > best.s.gyms || (s.gyms === best.s.gyms && s.tiers > best.s.tiers))) best = { v, s };
  }
  if (!best) write(HINT_KEY, "done");
  return best;
}
