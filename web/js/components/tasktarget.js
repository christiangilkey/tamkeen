// Settings: where the Review tab's "Send to …" button puts today's review session (setting
// `review_task_target`, review/sendtask.js): the learner's Google Tasks, or Onyx Calendar, which
// opens with the task and fits it into the day with its Magic add. Desktop and phone.

import { h, saveSettings } from "../app.js";
import { taskTarget } from "../review/sendtask.js";

/** Fill `box` (a Settings card) with the choice. */
export function taskTargetCard(box) {
  const now = taskTarget();
  box.append(h(`<div class="stack">
    <h2>Today's review as a to-do</h2>
    <div class="small muted">The Review tab's button sends the rest of today's review, with the time it should take, to:</div>
    <label class="check"><input type="radio" name="task-target" value="google" ${now === "google" ? "checked" : ""}>
      <span>Google Tasks <span class="small muted">(Google asks you to allow it the first time)</span></span></label>
    <label class="check"><input type="radio" name="task-target" value="onyx" ${now === "onyx" ? "checked" : ""}>
      <span>Onyx <span class="small muted">(opens Onyx, which fits it into your day)</span></span></label>
  </div>`));
  for (const r of box.querySelectorAll("input[name=task-target]")) {
    r.onchange = () => saveSettings({ review_task_target: r.value });
  }
}
