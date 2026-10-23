// "Send to Google Calendar" / "Send to Google Tasks" / "Send to Onyx" beside the day's goal on the
// Review banner: today's review session as a to-do with the time it should take (review/goal.js's
// estimate). Settings chooses where it goes (setting `review_task_target`):
// - "calendar" (the default): an event in the learner's Google Calendar today, at a time chosen in a
//   small popup (review/calpopup.js), as long as the estimate; app/googlecalendar.py on the computer,
//   mobile/src/js/googlecalendar.js on the phone and web;
// - "google": a task on today's list in Google Tasks, no time (app/googletasks.py,
//   mobile/src/js/googletasks.js);
// - "onyx": Onyx Calendar, opened with an onyx:// link, as an unscheduled task (Onyx fits it into the day).
// Shared by the computer and the phone.

import { api, state, toast } from "../app.js";
import { onyxLink } from "./tasktext.js";
import { clockText, deviceTimeZone } from "./eventtime.js";

export { onyxLink, reviewTask } from "./tasktext.js";

const settings = () => (state.status && state.status.settings) || {};
/** "calendar", "google" (Google Tasks) or "onyx". */
export const taskTarget = () => {
  const t = settings().review_task_target;
  return t === "onyx" || t === "google" ? t : "calendar";
};
export const TARGET_NAMES = { calendar: "Google Calendar", google: "Google Tasks", onyx: "Onyx" };

/** Send today's review to Google Tasks or Onyx, as Settings says (Google Calendar asks for a time
 *  first: sendReviewEvent). Tells the learner what happened. */
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

const CAL_KEY = "tk_review_cal"; // this device's last choice: {time: "HH:MM", sent: the day it last went in, sentAt: at what time}

/** The time chosen last time on this device, and the day and time it last went in: {time, sent, sentAt}. */
export function remembered() {
  try { return JSON.parse(localStorage.getItem(CAL_KEY) || "{}") || {}; } catch { return {}; }
}
/** Keep the chosen time on this device (the web app does this before it leaves for Google's page);
 *  `sentDay` once it is in the calendar. */
export function rememberTime(time, sentDay = "") {
  try { localStorage.setItem(CAL_KEY, JSON.stringify({ ...remembered(), time, ...(sentDay ? { sent: sentDay, sentAt: time } : {}) })); } catch { /* storage off */ }
}

/** Put today's review in Google Calendar at `time` ("HH:MM", this device's clock), for its minutes.
 *  Resolves to the answer: {updated} or {needs_permission} (the computer: allow it in the browser,
 *  then press Add again). */
export async function sendReviewEvent(task, time) {
  const r = await api("/calendar/review", { method: "POST", body: { ...task, time, time_zone: deviceTimeZone() } });
  if (r && r.needs_permission) return r;
  rememberTime(time, task.due);
  const at = clockText(time);
  toast(r && r.updated ? `Updated in Google Calendar to ${at}: ${task.title}.` : `Added to Google Calendar at ${at}: ${task.title}.`);
  return r || {};
}
