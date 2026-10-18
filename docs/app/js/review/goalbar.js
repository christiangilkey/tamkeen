// The day's goal bar under the Review banner on the Vocab page (desktop and phone): one bar, its
// teal part the new words done today out of the day's goal, its purple part the reviews done out of
// those due today, the counts under it and about how long the rest will take. Tapping it opens a
// small popup to change "new words a day", the same setting as the reviewer's own (one setting,
// localStorage `reviewNewPerDay`). The numbers are worked out in review/goal.js. Under it, "Send to
// Google Tasks" (or "Send to Onyx", as Settings says) puts the rest of today's review in the learner's
// to-do list with its estimated time (review/sendtask.js).

import { toast } from "../app.js";
import { icon } from "../icons.js";
import { dayNumber } from "./fsrs.js";
import { NEW_CHOICES, states } from "./deck.js";
import { deviceTimes, estimate, expectedReviews, model, secondsText, timeText, today, wordCost } from "./goal.js";
import { newPerDay, setNewPerDay } from "../pages/review.js";
import { TARGET_NAMES, reviewTask, sendReviewTask, taskTarget } from "./sendtask.js";

const MIN_SHARE = 0.15;  // the smaller part of the bar is never thinner than this, so it can be seen

const FROM = {
  device: "measured on this device",
  log: "from your past answers",
  guess: "a first guess until you have reviewed a few more",
};

/** Draw the bar into `root` (an empty element). Returns {update(words, log), close()}. */
export function goalBar(root) {
  root.classList.add("goal-wrap");
  root.innerHTML = `
    <button type="button" class="goal" aria-haspopup="dialog" aria-expanded="false">
      <span class="goal-bar" aria-hidden="true"><span class="goal-part new"><i></i></span><span class="goal-part rev"><i></i></span></span>
      <span class="goal-counts"><span class="goal-key new">New <b></b></span><span class="goal-key rev">Reviews <b></b></span></span>
      <span class="goal-time"></span>
    </button>
    <button type="button" class="ghost goal-send" hidden>${icon("send", 15)} <span></span></button>
    <div class="goal-pop" role="dialog" aria-label="Today's goal" hidden>
      <h3>${icon("target", 18)} New words a day</h3>
      <div class="goal-chips">${NEW_CHOICES.map((n) => `<button type="button" data-n="${n}">${n}</button>`).join("")}</div>
      <p class="goal-help"></p>
      <p class="goal-pace"></p>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const button = $(".goal"), pop = $(".goal-pop");
  let words = [], log = {};
  let plan = null; // today's review as a task, while there is some left (review/sendtask.js)

  function draw() {
    const goal = newPerDay();
    const t = today(words, states(log), dayNumber(), goal);
    const m = model(log, deviceTimes());

    // The two parts share the bar by how many each has today.
    const total = t.newTarget + t.revTarget;
    let share = total ? t.newTarget / total : 0.5;
    if (t.newTarget && t.revTarget) share = Math.min(1 - MIN_SHARE, Math.max(MIN_SHARE, share));
    const parts = { new: [t.newDone, t.newTarget, total ? share : 0.5], rev: [t.revDone, t.revTarget, total ? 1 - share : 0.5] };
    for (const [kind, [done, target, grow]] of Object.entries(parts)) {
      const part = $(`.goal-part.${kind}`);
      part.style.flexGrow = String(grow);
      part.classList.toggle("none", !target && total > 0);
      part.querySelector("i").style.width = `${target ? Math.min(100, (done / target) * 100) : 0}%`;
      const count = $(`.goal-key.${kind} b`);
      count.textContent = `${done}/${target}`;
      count.style.minWidth = `${String(target).length * 2 + 1}ch`;  // the line doesn't shift as the done count grows
    }

    const left = estimate(t, m);
    const time = $(".goal-time");
    time.textContent = left.ms ? `${cap(timeText(left))} left today${left.guess ? " (a first guess)" : ""}`
      : t.newDone + t.revDone ? "All done for today" : "Nothing due today";
    plan = left.ms ? reviewTask(t, left) : null;
    const send = $(".goal-send");
    send.hidden = !plan;
    send.querySelector("span").textContent = `Send to ${TARGET_NAMES[taskTarget()]}`;
    send.title = plan ? `Add “${plan.title}” to ${TARGET_NAMES[taskTarget()]} for today (choose where in Settings)` : "";
    button.setAttribute("aria-label", `Today: new words ${t.newDone} of ${t.newTarget}, reviews ${t.revDone} of ${t.revTarget}. ${time.textContent}. Change the new words a day`);

    for (const b of pop.querySelectorAll(".goal-chips button")) b.classList.toggle("on", Number(b.dataset.n) === goal);
    const short = t.newDone + t.newLeft < goal ? `Only ${t.waiting} new word${t.waiting === 1 ? " is" : "s are"} waiting. ` : "";
    $(".goal-help").textContent = `${short}Reviews are simply the words due today. In the long run expect about 10 a day per new word (Anki's manual): ${goal} new a day ≈ ${expectedReviews(goal)} reviews a day.`;
    // Per word, counting the looks a missed word takes coming back. Where the times come from: the
    // least measured of the kinds involved.
    const from = ["guess", "log", "device"].find((f) => [m.new, m.review, m.again].some((k) => k.from === f));
    $(".goal-pace").textContent = `Time per word, counting the times a missed word comes back: about ${secondsText(wordCost(m, "new").ms)} for a new one, ${secondsText(wordCost(m, "review").ms)} for a review (${FROM[from]}).`;
  }

  // ----- the popup -----
  const outside = (e) => { if (!root.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") { close(); button.focus(); } };
  function open() {
    pop.hidden = false;
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey);
    pop.querySelector(".goal-chips .on")?.focus({ preventScroll: true });
  }
  function close() {
    pop.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", onKey);
  }
  button.onclick = () => (pop.hidden ? open() : close());
  $(".goal-send").onclick = async (e) => {
    if (!plan) return;
    const b = e.currentTarget;
    b.disabled = true;
    try { await sendReviewTask(plan); } catch (err) { toast(err.message || "Couldn't send the task.", { error: true }); }
    finally { b.disabled = false; }
  };
  for (const b of pop.querySelectorAll(".goal-chips button")) {
    b.onclick = () => { setNewPerDay(Number(b.dataset.n)); draw(); root.dispatchEvent(new Event("goalchange", { bubbles: true })); };
  }

  return {
    update(w, l) { words = w || []; log = l || {}; draw(); },
    close,
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
