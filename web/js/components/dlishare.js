// A DLI student's sharing step and classes (the online side is dliclass.js; the rules are in
// supabase/v10-dli-classes.sql). Shown in Settings → DLI students (components/dlicard.js) once the content is
// unlocked, and in place of the content in Library → Courses → DLI (components/dlipanel.js) until it is done:
//   1. sign in with Google (the same sign-in as Friends);
//   2. agree to what is shared, said in plain words (SHARE_TEXT), choosing a username first if they have none.
//      Never a real name: students show to their teachers by username (the owner's rule, 2026-11-16);
//   3. then: "Sharing as …", the classes joined, a box for a class code, and "What is shared" (the numbers
//      exactly as the teachers and the developer see them, a way to change the name and to stop sharing).
// While the online service has no DLI classes yet, the part hides itself and the content opens as before.
// Shared by the computer, the phones and the web app.

import { esc, h, state, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import * as social from "../social.js";
import { onlineStatus, youngNote } from "../agegate.js";
import { dliLanguageName, dliState } from "../dli.js";
import { gate, leaveClass, myWeekNow, refresh, register, reportWeeks, shareInfo, thisWeek, unregister, useCode } from "../dliclass.js";
import { confirmBox, openModal } from "./modal.js";

const settings = () => (state.status && state.status.settings) || {};
const PRIVACY = "https://christiangilkey.github.io/tamkeen/privacy.html#dli";

/** "9 Nov" for "2026-11-09" (a week's Monday), on the reader's own calendar. */
export function weekLabel(week) {
  const [y, m, d] = String(week).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");

/** The headings of a table of weekly numbers, and one week's cells in the same order. "Days" are days with any
 *  study; the four kinds of minutes follow. */
// ("% remembered", not the answer button's "Remembered": in other languages that button says "I remembered it")
export const NUMBER_HEADS = ["Days", "Flashcards (min)", "Listening (min)", "Watching (min)", "Reading (min)", "Reviews", "% remembered", "New words", "Words known"];
export const percent = (w) => (w.reviews ? `${Math.round((100 * w.remembered) / w.reviews)}%` : "–");
const shown = (v) => (typeof v === "number" ? v.toLocaleString() : v);
export const numberCells = (w) => [w.active_days ?? w.days, w.minutes, w.listening || 0, w.watching || 0, w.reading || 0, w.reviews,
  percent(w), w.new_words, w.known].map(shown);

/** A table of weeks, newest first: Week of | Days | Minutes | … */
export function weeksTable(weeks) {
  const table = h(`<div class="dls-scroll"><table class="dls-table"><thead><tr><th>Week of</th>${NUMBER_HEADS.map((x) => `<th>${x}</th>`).join("")}</tr></thead>
    <tbody></tbody></table></div>`);
  const body = table.querySelector("tbody");
  for (const w of weeks) {
    const tr = h(`<tr><td translate="no"></td>${numberCells(w).map((v) => `<td translate="no">${esc(v)}</td>`).join("")}</tr>`);
    tr.firstChild.textContent = weekLabel(w.week);
    body.append(tr);
  }
  return table;
}

/** A "Sign in with Google" button in `spot` (the web app shows Google's own); `done` runs once signed in. */
export async function signInSpot(spot, done) {
  spot.innerHTML = "";
  const age = await onlineStatus();
  if (age === "young") {
    const p = h(`<p class="small muted"></p>`);
    p.textContent = youngNote(settings().online_from);
    spot.append(p);
    return;
  }
  const web = window.TAMKEEN_WEB === true;
  const fail = (err) => { if (!err.age) toast(err.message, { error: true }); };
  if (web && age === "ok") {
    social.connect({ host: spot }).then(done).catch(fail);
    return;
  }
  const b = h(`<button type="button" class="primary">Sign in with Google</button>`);
  b.onclick = async () => {
    b.disabled = true;
    b.textContent = "Signing in…";
    try {
      const p = social.connect(web ? { host: spot } : {});
      if (web) setTimeout(() => { if (b.disabled) b.hidden = true; }, 600);
      await p;
      done();
    } catch (err) {
      fail(err);
      b.hidden = false;
      b.disabled = false;
      b.textContent = "Sign in with Google";
    }
  };
  spot.append(b);
}

/** A box for a code with its button: `go(code)` runs on Enter or the button, with the button busy meanwhile. */
export function codeBox({ label, button, placeholder = "", go }) {
  const form = h(`<form class="dls-code"><input type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" translate="no">
    <button type="submit" class="primary"></button></form>`);
  const input = form.querySelector("input");
  const b = form.querySelector("button");
  input.setAttribute("aria-label", label);
  input.placeholder = placeholder;
  b.textContent = button;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (!code || b.disabled) { input.focus(); return; }
    b.disabled = true;
    try { if (await go(code)) input.value = ""; } catch (err) { toast(err.message, { error: true }); } finally { b.disabled = false; }
  };
  return form;
}

/** What a typed code turned out to be, in words (for the codes that didn't do what the box is for). */
export function codeProblem(status) {
  return {
    no: "That code isn't right. Check it and try again.",
    wait: "Too many wrong codes today. Try again tomorrow.",
    full: "That class is full.",
    need_student: "That's a class code. Finish the sharing step first, then join the class.",
    need_teacher: "That's a code for teachers. Enter your teacher code first.",
  }[status] || "";
}

/** The sharing step and the classes, in `el`. `onChange` runs whenever sharing was switched on or off (the
 *  caller shows or hides the content). Returns a cleanup function. */
export function sharePart(el, { onChange = () => {} } = {}) {
  el.classList.add("dls");
  let alive = true;

  async function paint() {
    el.innerHTML = `<p class="small muted">Checking…</p>`;
    const before = gate(settings());
    const r = await refresh();
    if (!alive) return;
    // (asking found something out: the service has DLI classes after all, or sharing was stopped on another device)
    if (gate(settings()) !== before) setTimeout(onChange, 0);
    el.innerHTML = "";
    el.hidden = !!r.notReady; // (no DLI classes online yet: nothing to ask, the content opens as before)
    if (r.notReady) return;
    if (!r.signedIn) { signIn(); return; }
    if (!r.me) { unreachable(r.error); return; }
    if (!r.me.student || !shareInfo()) form();
    else shared(r.me);
  }

  function signIn() {
    const box = h(`<div class="dls-step"><h3>One more step</h3>
      <p class="set-hint">DLI content is for DLI students, so it asks you to sign in and say who you are. Sign in with your Google
        account to go on.</p>
      <div class="dls-signin"></div></div>`);
    el.append(box);
    signInSpot(box.querySelector(".dls-signin"), () => { if (alive) paint().then(onChange); });
  }

  function unreachable(error) {
    const box = h(`<div class="dls-step"><p class="set-hint"></p><div class="set-actions"><button type="button">Try again</button></div></div>`);
    box.querySelector("p").textContent = (error && error.message) || "Couldn't reach the online service. Check your internet connection.";
    box.querySelector("button").onclick = () => paint().then(onChange);
    el.append(box);
  }

  async function form() {
    const language = dliState(settings()).language;
    let profile = null;
    try { profile = await social.myProfile(); } catch { /* offline: asked for below */ }
    if (!alive) return;
    const has = !!(profile && profile.username);
    const box = h(`<form class="dls-step dls-form">
      <div class="dls-uname">
        <h3><label for="dls-uname">Choose a username</label></h3>
        <p class="set-hint">Your teachers see you by it. Pick a nickname, not your real name.</p>
        <input type="text" id="dls-uname" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" translate="no" placeholder="e.g. layla_learns">
      </div>
      <p class="set-hint dls-as-will"></p>
      <div class="dls-terms">${SHARE_TEXT}</div>
      <p class="small dls-wrong" role="alert" hidden></p>
      <div class="set-actions"><button type="submit" class="primary">Agree and continue</button></div>
      <p class="small muted dls-policy"><a href="${PRIVACY}" target="_blank" rel="noopener">Privacy policy</a></p>
    </form>`);
    const input = box.querySelector("#dls-uname");
    const wrong = box.querySelector(".dls-wrong");
    const button = box.querySelector("button[type=submit]");
    box.querySelector(".dls-uname").hidden = has;
    box.querySelector(".dls-as-will").hidden = !has;
    if (has) box.querySelector(".dls-as-will").textContent = t("Your teachers will see you as {0}. You can change your username in Settings → Account & sync.", profile.username);
    input.oninput = () => { wrong.hidden = true; };
    box.onsubmit = async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!has) {
        const problem = social.checkUsername(name);
        if (problem) { wrong.textContent = name ? problem : t("Choose a username first."); wrong.hidden = false; input.focus(); return; }
      }
      button.disabled = true;
      button.textContent = t("Saving…");
      try {
        if (!has) await social.setUsername(name);
        await register(language);
        if (!alive) return;
        reportWeeks({ force: true });
        await paint();
        onChange();
      } catch (err) {
        wrong.textContent = err.message;
        wrong.hidden = false;
        button.disabled = false;
        button.textContent = t("Agree and continue");
      }
    };
    el.append(box);
  }

  function shared(me) {
    const box = h(`<div class="dls-step">
      <div class="set-state"><span class="dls-ico">${icon("check", 18)}</span><strong class="dls-as"></strong></div>
      <p class="set-hint">Your teachers and Tamkeen's developer see your username and your weekly study numbers. Nothing else.</p>
      <div class="set-actions"><button type="button" class="dls-what">What is shared</button></div>
      <h3>My classes</h3>
      <div class="dls-list"></div>
      <p class="set-hint">Your teacher gives you a class code. In a class, its teachers see your numbers from the week you joined.</p>
    </div>`);
    box.querySelector(".dls-as").textContent = t("Sharing as {0}", me.student.username || "–");
    box.querySelector(".dls-what").onclick = () => whatIsShared(me, { onChange: () => { if (alive) paint().then(onChange); } });
    const list = box.querySelector(".dls-list");
    const mine = me.classes.filter((c) => c.role === "student");
    if (!mine.length) list.append(h(`<p class="small muted dls-none">You aren't in a class yet.</p>`));
    for (const c of mine) {
      const row = h(`<div class="dls-row"><span class="dls-row-text"><strong translate="no"></strong><span class="small muted"></span></span>
        <button type="button" class="ghost">Leave</button></div>`);
      row.querySelector("strong").textContent = c.name;
      row.querySelector(".muted").textContent = c.teachers.length ? t("With {0}", c.teachers.join(", ")) : "";
      row.querySelector("button").onclick = async () => {
        if (!(await confirmBox(t("Leave the class {0}?", c.name), t("Its teachers stop seeing your numbers. You can join again with the class code."),
          { ok: t("Leave"), danger: true }))) return;
        try { await leaveClass(c.id); } catch (err) { toast(err.message, { error: true }); }
        if (alive) paint();
      };
      list.append(row);
    }
    box.querySelector(".dls-list").after(codeBox({ label: t("Class code"), placeholder: t("Class code"), button: t("Join"), go: async (code) => {
      const r = await useCode(code);
      if (r.status === "joined") { toast(t("You're in {0}.", r.name)); if (alive) paint(); return true; }
      // (a teacher's or the owner's code typed here still works: that side shows under "DLI teachers")
      if (["teacher", "owner", "coteacher"].includes(r.status)) { toast("Code accepted. See “I'm a DLI teacher” below."); onChange(); return true; }
      toast(codeProblem(r.status), { error: true });
      return false;
    } }));
    el.append(box);
  }

  paint();
  return () => { alive = false; };
}

/** What a student agrees to, in plain words. Changing what is shared here means raising dliclass.js WORDING. */
export const SHARE_TEXT = `<p><strong>What you share by going on</strong></p>
  <ul><li>Your username and your DLI language (never your real name)</li>
    <li>Your weekly study numbers: days studied; minutes on flashcards and minutes listening, watching and reading in your DLI language; reviews, how many you remembered, new words and words known</li></ul>
  <p><strong>Who sees it</strong></p>
  <ul><li>Tamkeen's developer</li><li>The teachers of the classes you join</li></ul>
  <p>Never shared: your words, your library, your recordings or anything else you study.</p>
  <p>You can stop at any time here in Settings. What was shared is then deleted, and the DLI content is locked again.</p>`;

/** The box "What is shared": my record as the others see it, and stopping. */
export function whatIsShared(me, { onChange = () => {} } = {}) {
  const box = openModal({ title: t("What is shared"), wide: true, cls: "dlt-back" });
  const view = h(`<div class="dls dls-what-box">
    <div class="dls-facts">
      <div><span class="small muted">Username</span><strong class="dls-f-name" translate="no"></strong></div>
      <div><span class="small muted">DLI language</span><strong class="dls-f-lang"></strong></div>
      <div><span class="small muted">Sharing since</span><strong class="dls-f-since" translate="no"></strong></div>
    </div>
    <h3>Your weekly numbers</h3>
    <p class="set-hint">Exactly what your teachers and Tamkeen's developer see. A teacher sees them from the week you joined their class. Listening, watching and reading are counted on each of your devices and added up online.</p>
    <div class="dls-weeks"><p class="small muted">Loading…</p></div>
    <h3>Who sees it</h3>
    <ul class="dls-who"><li>Tamkeen's developer</li></ul>
    <p class="small muted">You can change your username in Settings → Account & sync.</p>
    <div class="set-actions"><button type="button" class="ghost danger dls-stop">Stop sharing</button></div>
  </div>`);
  view.querySelector(".dls-f-name").textContent = me.student.username || "–";
  view.querySelector(".dls-f-lang").textContent = t(dliLanguageName(me.student.language));
  view.querySelector(".dls-f-since").textContent = dayLabel(me.student.agreed_at);
  const who = view.querySelector(".dls-who");
  for (const c of me.classes.filter((x) => x.role === "student")) {
    const li = h(`<li></li>`);
    li.textContent = c.teachers.length ? t("{0}: {1}", c.name, c.teachers.join(", ")) : c.name;
    who.append(li);
  }
  // The weeks on record online, with this week replaced by what this device would send now.
  myWeekNow().catch(() => null).then((now) => {
    const weeks = me.weeks.filter((w) => !now || w.week !== now.week);
    if (now) weeks.unshift(now);
    const spot = view.querySelector(".dls-weeks");
    spot.innerHTML = "";
    if (!weeks.length) spot.append(h(`<p class="small muted">Nothing yet. Your first week shows here after you review some flashcards.</p>`));
    else spot.append(weeksTable(weeks.slice(0, 12)));
    if (now && now.week === thisWeek()) spot.append(h(`<p class="small muted">The top row is this week so far.</p>`));
  });
  view.querySelector(".dls-stop").onclick = async () => {
    if (!(await confirmBox(t("Stop sharing?"),
      t("Your classes and your weekly numbers are deleted online now. The DLI content is locked on all your devices until you share again. Anything already added to your library stays."),
      { ok: t("Stop sharing"), danger: true }))) return;
    try {
      await unregister();
      toast("Sharing stopped. What was shared has been deleted.");
      box.close();
      onChange();
    } catch (err) { toast(err.message, { error: true }); }
  };
  box.body.append(view);
  return box;
}

// ---------- looks (added once; plain solid surfaces) ----------
if (typeof document !== "undefined" && !document.getElementById("dls-css")) {
  const style = document.createElement("style");
  style.id = "dls-css";
  style.textContent = `
    .dls[hidden], .dls [hidden] { display: none; }
    .dls-step { display: flex; flex-direction: column; gap: 10px; }
    .dls-step h3, .dls-step .set-hint, .dls-what-box h3 { margin: 0; }
    .dls-step h3 { margin-top: 6px; }
    .dls-form input, .dls-code input { min-height: 44px; font-size: 16px; min-width: 0; }
    .dls-terms { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--surface-2); font-size: 14px; }
    .dls-terms p { margin: 0 0 6px; }
    .dls-terms p:last-child { margin-bottom: 0; }
    .dls-terms ul { margin: 0 0 10px; padding-inline-start: 20px; }
    .dls-wrong { color: var(--danger); margin: 0; }
    .dls-policy { margin: 0; text-align: center; }
    .dls-step .set-actions { justify-content: center; }
    .dls-step .set-actions .primary { min-width: 220px; justify-content: center; min-height: 44px; }
    .dls-ico { display: inline-flex; color: var(--teal); }
    .dls-signin { display: flex; justify-content: center; }
    .dls-signin .primary { min-width: 220px; justify-content: center; min-height: 44px; }
    .dls-list { border-radius: 14px; border: 1px solid var(--line); background: var(--surface); overflow: hidden; }
    .dls-none { margin: 0; padding: 14px; text-align: center; }
    .dls-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-height: 56px; }
    .dls-row + .dls-row { border-top: 1px solid var(--line); }
    .dls-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .dls-row-text strong { overflow-wrap: anywhere; }
    .dls-code { display: flex; gap: 8px; }
    .dls-code input { flex: 1; text-transform: uppercase; letter-spacing: 0.06em; }
    .dls-code input::placeholder { text-transform: none; letter-spacing: 0; }
    .dls-code button { min-height: 44px; flex: none; }
    .dls-what-box { display: flex; flex-direction: column; gap: 12px; }
    .dls-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
    .dls-facts > div { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px;
      background: var(--surface); text-align: center; }
    .dls-facts strong { font-size: 18px; overflow-wrap: anywhere; }
    .dls-who { margin: 0; padding-inline-start: 20px; }
    .dls-scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
    .dls-table { border-collapse: collapse; width: 100%; font-size: 14px; }
    .dls-table th, .dls-table td { padding: 9px 8px; text-align: center; white-space: nowrap; }
    .dls-table th { font-weight: 600; color: var(--ink-2); font-size: 13px; border-bottom: 1px solid var(--line); }
    .dls-table td:first-child, .dls-table th:first-child { text-align: start; }
    .dls-table tbody tr + tr td { border-top: 1px solid var(--line); }
    .dls-what-box .set-actions { justify-content: center; flex-wrap: wrap; }
    .dlt-back .modal-box.wide { width: min(940px, 100%); box-shadow: none; }
  `;
  document.head.append(style);
}
