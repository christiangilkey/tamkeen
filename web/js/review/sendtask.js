// "Send to Google Tasks" / "Send to Onyx" beside the day's goal on the Review banner: today's review
// session as a to-do with the time it should take (review/goal.js's estimate). Settings chooses where
// it goes (setting `review_task_target`): the learner's Google Tasks (app/googletasks.py on the computer,
// mobile/src/js/googletasks.js on the phone and web), or Onyx Calendar, which is opened with an
// onyx:// link and fits the task into the day with its Magic add. Shared by the computer and the phone.

import { api, state, toast } from "../app.js";
import { onyxLink } from "./tasktext.js";

export { onyxLink, reviewTask } from "./tasktext.js";

const settings = () => (state.status && state.status.settings) || {};
export const taskTarget = () => (settings().review_task_target === "onyx" ? "onyx" : "google");
export const TARGET_NAMES = { google: "Google Tasks", onyx: "Onyx" };

/** Send today's review where Settings says. Tells the learner what happened. */
export async function sendReviewTask(task) {
  if (taskTarget() === "onyx") {
    await api("/open-onyx", { method: "POST", body: { url: onyxLink(task) } });
    toast(`Sent to Onyx: ${task.title}.`);
    return;
  }
  const r = await api("/tasks/review", { method: "POST", body: task });
  if (r && r.needs_permission) {
    toast("Allow Tamkeen to add tasks in the browser window that opened, then press Send again.", { timeout: 8000 });
    return;
  }
  toast(r && r.updated ? `Today's review task in Google Tasks is updated: ${task.title}.` : `Added to Google Tasks: ${task.title}.`);
}
