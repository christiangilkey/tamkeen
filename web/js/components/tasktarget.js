// Settings: where the Review tab's "Send to …" button puts today's review session (setting
// `review_task_target`, review/sendtask.js): the learner's Google Calendar at a chosen time (the
// default), Google Tasks on today's list, or Onyx Calendar as an unscheduled task. Desktop and phone.

import { h, saveSettings } from "../app.js";
import { taskTarget } from "../review/sendtask.js";

/** Fill `box` (a Settings card) with the choice. */
export function taskTargetCard(box) {
  const now = taskTarget();
  const on = (v) => (now === v ? "checked" : "");
  box.append(h(`<div class="stack">
    <h2>Today's review as a to-do</h2>
    <div class="small muted">The Review tab's button sends the rest of today's review, with the time it should take, to:</div>
    <label class="check"><input type="radio" name="task-target" value="calendar" ${on("calendar")}>
      <span>Google Calendar <span class="small muted">(at a time you pick, for the estimated length)</span></span></label>
    <label class="check"><input type="radio" name="task-target" value="google" ${on("google")}>
      <span>Google Tasks <span class="small muted">(on today's list, no time)</span></span></label>
    <label class="check"><input type="radio" name="task-target" value="onyx" ${on("onyx")}>
      <span>Onyx <span class="small muted">(as an unscheduled task in Onyx)</span></span></label>
    <div class="small muted">Google asks you to allow Calendar or Tasks the first time you use it.</div>
  </div>`));
  for (const r of box.querySelectorAll("input[name=task-target]")) {
    r.onchange = () => saveSettings({ review_task_target: r.value });
  }
}
