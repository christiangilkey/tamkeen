// The creator's bar (prototype "creator_bar"): at the top of Home, for Tamkeen's creator only. It says how many
// people are online now and which of the online service's limits is nearest; a tap opens the whole list, each
// figure as "used / limit" with a bar that turns amber from 70% and red from 90%.
//
// Who the creator is, is decided by the database (supabase/v14-creator.sql: a row in a table the API cannot
// reach). Everyone else gets nothing: the app asks "am I a creator?" once per sign-in and draws no bar on a no.
// The figures are counts and sizes only (creatorstats.js cleans them again): no usernames, nothing about anyone.
// No key is in the app: what only Supabase's Usage page knows is listed with its limit and a link there.
// Shared by the computer, the phones and the web app (pages/home.js).

import { h } from "../app.js";
import { t } from "../i18n.js";
import * as social from "../social.js";
import { feature } from "../prototype.js";
import { LIMITS_READ, OTHER_SERVICES, PLANS, USAGE_LINK, amountText, bytesText, cleanStats, level, meters, percentText, planOf, share, tightest,
  unseen } from "../creatorstats.js";
import { openModal } from "./modal.js";

const ROLE_KEY = "tamkeenCreator";     // "<user id>:yes" / "<user id>:no": the answer for this sign-in, so Home doesn't ask each time
const PLAN_KEY = "tamkeenCreatorPlan"; // "free" / "pro": which plan's limits to compare against (this device)
const EVERY_MS = 60000;

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };
const plan = () => planOf(read(PLAN_KEY));

/** Am I a creator? Asked of the database once per sign-in (and again after a day). Never throws: no means no bar. */
async function isCreator() {
  const user = await social.currentUser();
  if (!user) return false;
  const kept = String(read(ROLE_KEY) || "").split(":");
  if (kept[0] === user.id && Date.now() - Number(kept[2] || 0) < 86400000) return kept[1] === "yes";
  try {
    const { data, error } = await (await social.sb()).rpc("am_creator");
    if (error) return false; // (a database without v14, or offline: nothing is kept, so it is asked again next time)
    write(ROLE_KEY, `${user.id}:${data === true ? "yes" : "no"}:${Date.now()}`);
    return data === true;
  } catch { return false; }
}

async function fetchStats() {
  const { data, error } = await (await social.sb()).rpc("creator_stats");
  if (error) throw new Error(/fetch|network|Failed to/i.test(error.message || "") ? "Couldn't reach the online service." : "The figures couldn't be read.");
  return cleanStats(data);
}

/** One "used / limit" line with its bar. */
function meterRow(m) {
  const lv = level(m.used, m.limit);
  const row = h(`<div class="crb-meter"><div class="crb-meter-top"><strong></strong><span class="crb-meter-n" translate="no"></span></div>
    <div class="crb-track"><div class="crb-fill"></div></div><p class="small muted"></p></div>`);
  row.classList.add(`crb-${lv}`);
  row.querySelector("strong").textContent = t(m.label);
  row.querySelector(".crb-meter-n").textContent = `${amountText(m.used, m.unit)} / ${amountText(m.limit, m.unit)} · ${percentText(m.used, m.limit)}`;
  row.querySelector(".crb-fill").style.width = `${Math.max(share(m.used, m.limit) * 100, m.used > 0 ? 1.5 : 0)}%`;
  const note = row.querySelector("p");
  note.textContent = m.note ? t(m.note) : "";
  note.hidden = !m.note;
  return row;
}

/** The whole list, in a box. */
export function openCreatorPanel(first = null) {
  const box = openModal({ title: t("Creator"), wide: true, cls: "crb-back" });
  const view = h(`<div class="crb-panel"><p class="small muted">Loading…</p></div>`);
  box.body.append(view);
  let stats = first;

  function paint() {
    view.innerHTML = "";
    const top = h(`<div class="crb-top"><div class="crb-online"><span class="crb-dot"></span><strong translate="no"></strong><span></span></div>
      <label class="crb-plan"><span class="small muted">Compare with</span> <select></select></label></div>`);
    top.querySelector("strong").textContent = stats.online.toLocaleString();
    top.querySelector(".crb-online span:last-child").textContent = stats.online === 1 ? t("person online now") : t("people online now");
    const pick = top.querySelector("select");
    for (const [id, label] of PLANS) { const o = h(`<option></option>`); o.value = id; o.textContent = t(label); pick.append(o); }
    pick.value = plan();
    pick.onchange = () => { write(PLAN_KEY, pick.value); paint(); };
    view.append(top);

    const facts = h(`<div class="crb-facts"></div>`);
    for (const [label, n] of [["Accounts", stats.users], ["Seen in the last day", stats.seen_today]]) {
      const tile = h(`<div><span class="small muted"></span><strong translate="no"></strong></div>`);
      tile.firstElementChild.textContent = t(label);
      tile.querySelector("strong").textContent = n.toLocaleString();
      facts.append(tile);
    }
    view.append(facts);

    view.append(h(`<h3>Supabase: what the app can measure</h3>`));
    for (const m of meters(stats, plan())) view.append(meterRow(m));

    view.append(h(`<h3>Supabase: only on its Usage page</h3>`),
      h(`<p class="small muted">The database can't count these, and reading them from here would need a secret key in the app. The limits are below; the amounts used are on Supabase's Usage page.</p>`));
    const list = h(`<div class="crb-list"></div>`);
    for (const u of unseen(plan())) {
      const row = h(`<div class="crb-row"><span></span><strong translate="no"></strong></div>`);
      row.firstElementChild.textContent = t(u.label);
      row.querySelector("strong").textContent = t("limit {0}", amountText(u.limit, u.unit));
      list.append(row);
    }
    view.append(list, h(`<div class="set-actions crb-acts"><a class="btn" target="_blank" rel="noopener" href="${USAGE_LINK}">Open Supabase's Usage page</a></div>`));

    if (stats.buckets.length || stats.tables.length) {
      view.append(h(`<h3>Where the space goes</h3>`));
      const where = h(`<div class="crb-list"></div>`);
      for (const b of stats.buckets) {
        const row = h(`<div class="crb-row"><span></span><strong translate="no"></strong></div>`);
        row.firstElementChild.textContent = b.files === 1 ? t("Files in “{0}”: 1 file", b.bucket) : t("Files in “{0}”: {1} files", b.bucket, b.files.toLocaleString());
        row.querySelector("strong").textContent = bytesText(b.bytes);
        where.append(row);
      }
      for (const x of stats.tables) {
        const row = h(`<div class="crb-row"><span></span><strong translate="no"></strong></div>`);
        row.firstElementChild.textContent = t("Table “{0}”", x.name);
        row.querySelector("strong").textContent = bytesText(x.bytes);
        where.append(row);
      }
      view.append(where);
    }

    view.append(h(`<h3>Tamkeen's other services</h3>`),
      h(`<p class="small muted">Their free allowances as published. The app can't read how much is used: each shows it on its own page, behind your sign-in.</p>`));
    const others = h(`<div class="crb-list"></div>`);
    for (const s of OTHER_SERVICES) {
      const row = h(`<div class="crb-row crb-other"><span><strong></strong><span class="small muted"></span></span></div>`);
      row.querySelector("strong").textContent = t(s.name);
      row.querySelector(".muted").textContent = t(s.limit);
      if (s.link) { const a = h(`<a class="btn small" target="_blank" rel="noopener">Limits</a>`); a.href = s.link; row.append(a); }
      others.append(row);
    }
    view.append(others);

    const foot = h(`<p class="small muted crb-foot"></p>`);
    foot.textContent = t("Limits as published on {0}. Bars turn amber from 70% and red from 90%.", LIMITS_READ);
    const again = h(`<div class="set-actions crb-acts"><button type="button">Refresh</button></div>`);
    again.querySelector("button").onclick = load;
    view.append(foot, again);
  }

  async function load() {
    try { stats = await fetchStats(); paint(); } catch (e) {
      if (stats) return;
      view.innerHTML = "";
      const p = h(`<p class="small muted"></p>`);
      p.textContent = e.message;
      view.append(p);
    }
  }
  if (stats) paint();
  load();
  return box;
}

/** Put the bar in `host` (Home) when this account is a creator. Returns a cleanup function. */
export function creatorBar(host) {
  let alive = true, timer = 0, stats = null;
  if (!host || !feature("creator_bar")) return () => {};
  host.hidden = true;

  function paint() {
    host.innerHTML = "";
    host.hidden = false;
    const tight = tightest(stats, plan());
    const bar = h(`<button type="button" class="crb-bar"><span class="crb-dot"></span><span class="crb-bar-online"></span>
      <span class="crb-bar-tight"><span class="crb-bar-label"></span><span class="crb-track"><span class="crb-fill"></span></span><span class="crb-bar-n" translate="no"></span></span></button>`);
    bar.querySelector(".crb-bar-online").textContent = stats.online === 1 ? t("1 online") : t("{0} online", stats.online.toLocaleString());
    if (tight) {
      bar.classList.add(`crb-${level(tight.used, tight.limit)}`);
      bar.querySelector(".crb-bar-label").textContent = t(tight.label);
      bar.querySelector(".crb-fill").style.width = `${Math.max(share(tight.used, tight.limit) * 100, tight.used > 0 ? 3 : 0)}%`;
      bar.querySelector(".crb-bar-n").textContent = percentText(tight.used, tight.limit);
    }
    bar.setAttribute("aria-label", t("Creator: people online and limits"));
    bar.onclick = () => openCreatorPanel(stats);
    host.append(bar);
  }

  async function load() {
    if (!alive || document.visibilityState === "hidden") return;
    try { stats = await fetchStats(); if (alive) paint(); } catch { /* the last figures stay */ }
  }

  isCreator().then((yes) => {
    if (!alive || !yes) return;
    load();
    timer = setInterval(load, EVERY_MS);
  });
  return () => { alive = false; clearInterval(timer); };
}

// ---------- looks (added once; plain solid surfaces) ----------
if (typeof document !== "undefined" && !document.getElementById("crb-css")) {
  const style = document.createElement("style");
  style.id = "crb-css";
  style.textContent = `
    .home-creator[hidden] { display: none; }
    .home-creator { margin: 0 0 12px; }
    .crb-bar { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 14px; border-radius: 14px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; text-align: start; }
    .crb-bar:hover:not(:disabled) { background: var(--surface-2); }
    .crb-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); flex: none; }
    .crb-bar-online { font-weight: 650; white-space: nowrap; }
    .crb-bar-tight { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
    .crb-bar-label { color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .crb-bar .crb-track { width: 90px; flex: none; }
    .crb-bar-n { font-size: 13px; font-weight: 650; white-space: nowrap; }
    .crb-track { display: block; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; border: 1px solid var(--border); }
    .crb-fill { display: block; height: 100%; background: var(--accent); border-radius: 4px; }
    .crb-warn .crb-fill { background: var(--warn); }
    .crb-full .crb-fill { background: var(--danger); }
    .crb-warn .crb-meter-n, .crb-warn .crb-bar-n { color: var(--warn); }
    .crb-full .crb-meter-n, .crb-full .crb-bar-n { color: var(--danger); }
    .crb-back .modal-box.wide { width: min(760px, 100%); box-shadow: none; }
    .crb-panel { display: flex; flex-direction: column; gap: 12px; }
    .crb-panel h3 { margin: 8px 0 0; font-size: 16px; }
    .crb-panel p { margin: 0; }
    .crb-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .crb-online { display: flex; align-items: center; gap: 10px; font-size: 16px; }
    .crb-online strong { font-size: 30px; line-height: 1; }
    .crb-plan select { min-height: 40px; }
    .crb-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .crb-facts > div { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; text-align: center; }
    .crb-facts strong { font-size: 20px; }
    .crb-meter { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--surface); }
    .crb-meter-top { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .crb-meter-n { font-weight: 650; }
    .crb-list { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .crb-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; }
    .crb-row + .crb-row { border-top: 1px solid var(--border); }
    .crb-row > span { min-width: 0; overflow-wrap: anywhere; }
    .crb-other > span { display: flex; flex-direction: column; gap: 2px; }
    .crb-acts { justify-content: center; }
    .crb-foot { text-align: center; }
  `;
  document.head.append(style);
}
