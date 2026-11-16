// The long-term goal on the Vocab page (the maths is review/longgoal.js, the setting review/goalsetting.js):
// "300 new words by 15 December", a bar with a mark where a steady pace would have it today, the pace still
// needed ("About 12 a day"), today's and this week's part, and a short honest check-in. 25, 50 and 75 % are
// marked on the bar and celebrated once each when passed. Without a goal it is one quiet button.
//
// Each language has its own goal (the owner: "a user can have Spanish goals as well as an Arabic goal"): the card
// shows the goal of the language being learned, and counts only the answers to that language's words. The goals
// sync like other settings (study_goals, goalsetting.js); the numbers come from the answer log, which syncs too, so
// every device shows the same. It is drawn again whenever the Vocab page redraws its Review block, every
// minute, and when the app comes back to the front, so the day rolling over at midnight shows at once.
//
// A "new words" goal also looks at the reviewer's day (longgoal.js goalNewWords): when today's part wants more
// new words than the day's allowance lets in, the card offers "Learn N new words now" (one session with that
// many extra, the setting left as it is; the Vocab page's Review banner offers the same), and when no words
// are left to learn it says so and offers Add words.

import { h, saveSettings, state, toast } from "../app.js";
import { openModal } from "../components/modal.js";
import { uiLanguage } from "../i18n.js";
import { icon } from "../icons.js";
import { dayNumber } from "./fsrs.js";
import { plan, states } from "./deck.js";
import { newPerDay } from "../pages/review.js";
import { dliState } from "../dli.js";
import { studyLanguage } from "../languages.js";
import { goalOf, migrateGoal, withGoal } from "./goalsetting.js";
import { LENGTHS, MILESTONES, checkIn, dailyAmounts, friendly, goalNewWords, langLog, progress, suggestTarget } from "./longgoal.js";

const TITLE = {
  learned: (n, date) => `${n} new words by ${date}`,
  reviews: (n, date) => `${n} reviews by ${date}`,
  minutes: (n, date) => `${n} minutes by ${date}`,
};
const PACE = {
  learned: (n) => (n === 1 ? "About 1 new word a day" : `About ${n} new words a day`),
  reviews: (n) => (n === 1 ? "About 1 review a day" : `About ${n} reviews a day`),
  minutes: (n) => (n === 1 ? "About 1 minute a day" : `About ${n} minutes a day`),
};
/** "17 new words to go today": today's part still to do, when the learner isn't behind. */
const TO_GO = {
  learned: (n) => (n === 1 ? "1 new word to go today" : `${n} new words to go today`),
  reviews: (n) => (n === 1 ? "1 review to go today" : `${n} reviews to go today`),
  minutes: (n) => (n === 1 ? "1 minute to go today" : `${n} minutes to go today`),
};
const MEASURE_NAME = { learned: "New words learned", reviews: "Reviews", minutes: "Minutes on flashcards" };
const LENGTH_NAME = { 14: "2 weeks", 30: "1 month", 60: "2 months", 90: "3 months" };
const LINE = {
  reached: "Goal reached! Well done.",
  "today-done": "Today's part is done. Anything more is a head start.",
  "fresh-week": "A new week, a fresh start: this week's part puts you back on track.",
  ahead: "You're ahead of plan.",
  "on-track": "Right on track.",
  bent: "A missed day just spreads the rest out: the pace has adjusted.",
  rethink: "The pace needed has grown. A smaller goal you finish beats a big one you drop: you can change it.",
};

const SEEN_KEY = "longGoalMilestone";  // {made, m}: the last milestone celebrated on this device
const seenMilestone = (made) => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "null"); return v && v.made === made ? v.m : 0; } catch { return 0; } };
const setSeen = (made, m) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify({ made, m })); } catch { /* storage unavailable */ } };

const dateText = (day) => {
  try { return new Date(day * 86400000).toLocaleDateString(uiLanguage() || undefined, { timeZone: "UTC", month: "short", day: "numeric" }); }
  catch { return new Date(day * 86400000).toISOString().slice(0, 10); }
};
const shown = (n) => Math.floor(n + 1e-9);  // an amount done (minutes are counted in fractions)

/** Has this learner the DLI tab, with its decks, for the language studied now (components/dlipanel.js dliShown)? */
const dliHere = () => { const st = dliState((state.status && state.status.settings) || {}); return Boolean(st.ready && st.language === studyLanguage()); };

const settingsNow = () => (state.status && state.status.settings) || {};

/** The goal of language `lang` (the one being learned). The one goal from before goals had a language becomes
 * this language's the first time it is asked for (goalsetting.js migrateGoal), and that is kept and synced. */
export function currentGoal(lang = studyLanguage()) {
  const s = settingsNow();
  const moved = migrateGoal(s.study_goals, s.study_goal, lang);
  if (moved) {
    s.study_goals = moved;
    saveSettings({ study_goals: moved }).catch(() => {});
  }
  return goalOf(s.study_goals, lang);
}

/** What a "new words" goal wants of the reviewer today among `words` (longgoal.js goalNewWords), or null.
 * `langWords`: all the words of the language being learned, whose answers the goal counts (`words` may be one
 * folder's). */
export function goalOffer(words, log, langWords = words) {
  const goal = currentGoal();
  if (!goal || goal.measure !== "learned") return null;
  const today = dayNumber();
  const p = progress(goal, dailyAmounts(langLog(log, langWords), goal.measure), today);
  const day = plan(words, states(log), today, newPerDay());
  return goalNewWords(goal, p, day.waiting, day.startedToday, newPerDay());
}

/** Keep `goal` (null removes it) as the goal of the language being learned. */
async function saveGoal(goal) {
  await saveSettings({ study_goals: withGoal(settingsNow().study_goals, studyLanguage(), goal, Date.now()) });
}

/** Draw the goal into `root`. `onLearn(bonus)` opens the reviewer with that many more new words allowed today;
 * `onAddWords()` opens Add words. Returns {update(log, words), close()}. */
export function longGoal(root, { onLearn = () => {}, onAddWords = () => {} } = {}) {
  root.classList.add("lg");
  let log = {}, words = [];
  let celebrate = false;  // milestones are only celebrated after the first drawing (not for ones passed long ago)

  function draw() {
    const goal = currentGoal();
    if (!goal) {
      // (the owner: "it should show a blank bar and the top part should say 'no long term goal set'": the card
      // keeps its place and shape, and a tap anywhere on it, or its pencil, sets one)
      root.innerHTML = `
        <div class="lg-card lg-empty">
          <div class="lg-top">
            <span class="lg-title">${icon("target", 18)} <span>No long-term goal set</span></span>
            <button type="button" class="ghost icon lg-edit" aria-label="Set a long-term goal" title="Set a long-term goal">${icon("edit", 16)}</button>
          </div>
          <div class="lg-bar" aria-hidden="true">${MILESTONES.slice(0, 3).map((m) => `<span class="lg-tick" style="inset-inline-start:${m}%"></span>`).join("")}</div>
          <p class="lg-line">Tap the pencil to set one. Goals of 1 to 3 months work best.</p>
        </div>`;
      root.querySelector(".lg-card").onclick = () => openGoalEditor(null, langLog(log, words));
      return;
    }
    const today = dayNumber();
    const own = langLog(log, words);  // (this language's answers only)
    const p = progress(goal, dailyAmounts(own, goal.measure), today);
    const kind = checkIn(p);
    const left = p.status === "active" ? (p.daysLeft === 1 ? "Last day" : `${p.daysLeft} days left`)
      : p.status === "upcoming" ? `Starts ${dateText(goal.start)}` : "";
    const line = kind === "ended" ? `This goal has ended at ${Math.round(p.pct * 100)}%. That progress is real: set the next one when you're ready.`
      : kind === "upcoming" ? `Starts ${dateText(goal.start)}.` : kind === "today-left" ? TO_GO[goal.measure](Math.ceil(p.todayLeft - 1e-9)) : LINE[kind];
    const offer = goalOffer(words, log);
    const plan = Math.min(100, (p.planToday / goal.target) * 100);
    root.innerHTML = `
      <div class="lg-card${p.status === "reached" ? " reached" : ""}">
        <div class="lg-top">
          <span class="lg-title">${icon("target", 18)} <span></span></span>
          <button type="button" class="ghost icon lg-edit" aria-label="Change goal" title="Change goal">${icon("edit", 16)}</button>
        </div>
        <div class="lg-bar" role="progressbar" aria-label="Goal progress" aria-valuemin="0" aria-valuemax="${goal.target}" aria-valuenow="${shown(p.done)}">
          <i class="lg-fill" style="width:${(p.pct * 100).toFixed(2)}%"></i>
          ${MILESTONES.slice(0, 3).map((m) => `<span class="lg-tick${p.milestone >= m ? " passed" : ""}" style="inset-inline-start:${m}%"></span>`).join("")}
          ${p.status === "active" ? `<span class="lg-plan" style="inset-inline-start:${plan.toFixed(2)}%" title="Where a steady pace would be today"></span>` : ""}
        </div>
        <div class="lg-nums"><span><b>${shown(p.done)}</b> of ${goal.target} · ${Math.floor(p.pct * 100)}%</span><span>${left}</span></div>
        ${p.status === "active" ? `
        <p class="lg-pace"></p>
        <div class="lg-parts">
          <span>Today <b>${shown(p.doneToday)}</b> of ${p.todayTarget}</span>
          <span>This week <b>${shown(p.week.done)}</b> of ${p.week.target}</span>
        </div>` : ""}
        <p class="lg-line"></p>
        ${offer && offer.none ? `<p class="lg-line">No new words are waiting to be learned. Add your own, or take some from a course.</p>
        <div class="lg-ways">
          <button type="button" class="lg-add">${icon("plus", 16)} Add words</button>
          <button type="button" class="ghost lg-course">${icon("learn", 16)} Words course</button>
          ${dliHere() ? `<button type="button" class="ghost lg-dli">${icon("lock", 16)} DLI decks</button>` : ""}
        </div>`
          : offer && offer.extra > 0 ? `<button type="button" class="lg-learn">${offer.extra === 1 ? "Learn 1 new word now" : `Learn ${offer.extra} new words now`}</button>` : ""}
        ${kind === "ended" || kind === "reached" ? `<button type="button" class="lg-next">Set the next goal</button>` : ""}
        ${kind === "rethink" ? `<button type="button" class="ghost lg-change">Change goal</button>` : ""}
      </div>`;
    root.querySelector(".lg-title span").textContent = TITLE[goal.measure](goal.target, dateText(goal.end));
    if (p.status === "active") root.querySelector(".lg-pace").textContent = PACE[goal.measure](friendly(p.pace));
    root.querySelector(".lg-line").textContent = line;
    root.querySelector(".lg-edit").onclick = () => openGoalEditor(goal, own);
    const next = root.querySelector(".lg-next");
    if (next) next.onclick = () => openGoalEditor({ ...goal, fresh: true }, own);
    const learn = root.querySelector(".lg-learn");
    if (learn) learn.onclick = () => onLearn(offer.bonus);
    const add = root.querySelector(".lg-add");
    if (add) add.onclick = () => onAddWords();
    // (where else words come from: the Library's Words course, and a DLI student's decks)
    const course = root.querySelector(".lg-course");
    if (course) course.onclick = () => { location.hash = "#/library?tab=basics"; };
    const dli = root.querySelector(".lg-dli");
    if (dli) dli.onclick = () => { location.hash = "#/library?tab=dli"; };
    const change = root.querySelector(".lg-change");
    if (change) change.onclick = () => openGoalEditor(goal, own);
    // A milestone passed since the last one celebrated on this device: said once, gently.
    const seen = seenMilestone(goal.made);
    if (p.milestone > seen) {
      if (celebrate) {
        toast(p.milestone === 100 ? "Goal reached! Well done." : `${p.milestone}% of your goal done!`, { timeout: 5000, fix: false });
        const card = root.querySelector(".lg-card");
        card.classList.add("cheer");
        setTimeout(() => card.classList.remove("cheer"), 1200);
      }
      setSeen(goal.made, p.milestone);
    }
    celebrate = true;
  }

  const timer = setInterval(() => { if (!document.hidden && root.isConnected) draw(); }, 60000);
  const onShow = () => { if (!document.hidden && root.isConnected) draw(); };
  document.addEventListener("visibilitychange", onShow);
  const onSaved = () => { if (root.isConnected) draw(); };
  window.addEventListener("tamkeen:goal", onSaved);

  return {
    update(answers, list = words) { log = answers || {}; words = list || []; draw(); },
    close() { clearInterval(timer); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("tamkeen:goal", onSaved); },
  };
}

/** The box for setting (or changing) the goal. `goal` null for a new one; `goal.fresh` for the next one after it. */
export function openGoalEditor(goal, log) {
  const today = dayNumber();
  const editing = goal && !goal.fresh;
  let measure = goal ? goal.measure : "learned";
  let length = editing ? null : 30;  // a new goal: a month (the length people finish most)
  let end = editing ? goal.end : today + 29;
  let touched = editing;  // the target typed by the learner is kept when the measure or length changes
  const m = openModal({ title: editing ? "Change your goal" : "Set a long-term goal" });
  m.body.append(h(`<div class="lg-edit-box">
    <p class="muted small">Goals of 1 to 3 months are the ones people finish most often. Missed days never break it: the rest is spread over the days left.</p>
    <h4>What counts</h4>
    <div class="rv-chips lg-measures">${Object.keys(MEASURE_NAME).map((k) => `<button type="button" data-m="${k}">${MEASURE_NAME[k]}</button>`).join("")}</div>
    <h4>How long</h4>
    <div class="rv-chips lg-lengths">${LENGTHS.map((d) => `<button type="button" data-d="${d}">${LENGTH_NAME[d]}</button>`).join("")}</div>
    <p class="muted small lg-ends"></p>
    <h4><label for="lg-target">How many</label></h4>
    <input type="number" id="lg-target" class="lg-target" min="1" max="1000000" step="1" inputmode="numeric">
    <p class="lg-about"></p>
    <div class="lg-buttons">
      ${editing ? `<button type="button" class="ghost lg-remove">Remove goal</button>` : ""}
      <button type="button" class="lg-save">Save goal</button>
    </div>
  </div>`));
  const $ = (s) => m.body.querySelector(s);
  const input = $("#lg-target");
  const amounts = () => dailyAmounts(log, measure);
  const start = () => (editing ? goal.start : today);

  function refresh() {
    for (const b of m.body.querySelectorAll(".lg-measures button")) b.classList.toggle("on", b.dataset.m === measure);
    for (const b of m.body.querySelectorAll(".lg-lengths button")) b.classList.toggle("on", Number(b.dataset.d) === length);
    if (length) end = start() + length - 1;
    if (end < today) end = today;
    $(".lg-ends").textContent = `Ends ${dateText(end)}`;
    if (!touched) input.value = String(suggestTarget(amounts(), measure, today, end - start() + 1));
    const n = Math.max(0, Math.round(Number(input.value) || 0));
    const days = Math.max(1, end - Math.max(today, start()) + 1);
    $(".lg-about").textContent = n ? PACE[measure](friendly(n / days)) : "";
    $(".lg-save").disabled = !(n >= 1 && n <= 1000000);
  }
  m.body.querySelector(".lg-measures").onclick = (e) => { const b = e.target.closest("button"); if (b) { measure = b.dataset.m; touched = false; refresh(); } };
  m.body.querySelector(".lg-lengths").onclick = (e) => { const b = e.target.closest("button"); if (b) { length = Number(b.dataset.d); if (!editing) touched = false; refresh(); } };
  input.oninput = () => { touched = true; refresh(); };
  $(".lg-save").onclick = async () => {
    const target = Math.round(Number(input.value));
    const next = { measure, target, start: start(), end, made: editing ? goal.made : Date.now() };
    try { await saveGoal(next); } catch { toast("Couldn't save the goal.", { error: true }); return; }
    m.close();
    window.dispatchEvent(new CustomEvent("tamkeen:goal"));
  };
  const remove = $(".lg-remove");
  if (remove) remove.onclick = async () => {
    try { await saveGoal(null); } catch { toast("Couldn't save the goal.", { error: true }); return; }
    m.close();
    window.dispatchEvent(new CustomEvent("tamkeen:goal"));
  };
  refresh();
  input.focus();
}
