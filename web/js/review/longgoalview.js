// The long-term goal on the Vocab page (the maths is review/longgoal.js, the setting review/goalsetting.js):
// "300 new words by 15 December", a bar with a mark where a steady pace would have it today, the pace still
// needed ("About 12 a day"), today's and this week's part, and a short honest check-in. 25, 50 and 75 % are
// marked on the bar and celebrated once each when passed. Without a goal it is one quiet button.
//
// The goal syncs like other settings (study_goal); the numbers come from the answer log, which syncs too, so
// every device shows the same. It is drawn again whenever the Vocab page redraws its Review block, every
// minute, and when the app comes back to the front, so the day rolling over at midnight shows at once.

import { h, saveSettings, state, toast } from "../app.js";
import { openModal } from "../components/modal.js";
import { uiLanguage } from "../i18n.js";
import { icon } from "../icons.js";
import { dayNumber } from "./fsrs.js";
import { cleanSetting } from "./goalsetting.js";
import { LENGTHS, MILESTONES, checkIn, dailyAmounts, friendly, progress, suggestTarget } from "./longgoal.js";

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

export const currentGoal = () => cleanSetting(state.status && state.status.settings && state.status.settings.study_goal).goal;

async function saveGoal(goal) {
  await saveSettings({ study_goal: { at: Date.now(), goal } });
}

/** Draw the goal into `root`. Returns {update(log), close()}. */
export function longGoal(root) {
  root.classList.add("lg");
  let log = {};
  let celebrate = false;  // milestones are only celebrated after the first drawing (not for ones passed long ago)

  function draw() {
    const goal = currentGoal();
    if (!goal) {
      root.innerHTML = `<button type="button" class="ghost lg-set">${icon("target", 16)} Set a long-term goal</button>`;
      root.querySelector(".lg-set").onclick = () => openGoalEditor(null, log);
      return;
    }
    const today = dayNumber();
    const p = progress(goal, dailyAmounts(log, goal.measure), today);
    const kind = checkIn(p);
    const left = p.status === "active" ? (p.daysLeft === 1 ? "Last day" : `${p.daysLeft} days left`)
      : p.status === "upcoming" ? `Starts ${dateText(goal.start)}` : "";
    const line = kind === "ended" ? `This goal has ended at ${Math.round(p.pct * 100)}%. That progress is real: set the next one when you're ready.`
      : kind === "upcoming" ? `Starts ${dateText(goal.start)}.` : LINE[kind];
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
        ${kind === "ended" || kind === "reached" ? `<button type="button" class="lg-next">Set the next goal</button>` : ""}
        ${kind === "rethink" ? `<button type="button" class="ghost lg-change">Change goal</button>` : ""}
      </div>`;
    root.querySelector(".lg-title span").textContent = TITLE[goal.measure](goal.target, dateText(goal.end));
    if (p.status === "active") root.querySelector(".lg-pace").textContent = PACE[goal.measure](friendly(p.pace));
    root.querySelector(".lg-line").textContent = line;
    root.querySelector(".lg-edit").onclick = () => openGoalEditor(goal, log);
    const next = root.querySelector(".lg-next");
    if (next) next.onclick = () => openGoalEditor({ ...goal, fresh: true }, log);
    const change = root.querySelector(".lg-change");
    if (change) change.onclick = () => openGoalEditor(goal, log);
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
    update(answers) { log = answers || {}; draw(); },
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
