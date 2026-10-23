// The phone's and web app's side of the Review tab's "Send to Google Calendar" (the computer's is
// app/googlecalendar.py): today's review session as an event in the learner's primary Google Calendar,
// today at the time chosen in the popup (review/calpopup.js), as long as the estimate. One a day:
// sending again the same day moves or updates that event (setting `review_event` = {day, id}); if it
// was deleted in Google Calendar meanwhile, a new one is added.

import { GoogleDriveAuth, isNative, isWeb } from "./native.js";
import { AuthError, CALENDAR_SCOPE, webPassFor } from "./drive.js";
import { saveSettingsPatch, settings } from "./store.js";
import { calendarError, eventAction, eventBody, patchKept } from "./review/eventtime.js";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
let webCalendar = null; // the web app: a Google Calendar pass just handed back by Google's page {token, until}

/** The web app: a Google Calendar pass that came back from Google's sign-in page (app.js finishWebSignIn). */
export function useCalendarToken(token, expiresIn) {
  webCalendar = { token, until: Date.now() + Math.max(60, (Number(expiresIn) || 3600) - 300) * 1000 };
}

/** A pass for Google Calendar, to send `task` at `time`. The first time, Google asks the learner to allow it. */
async function calendarToken(task, time) {
  if (!settings.signed_in) throw new AuthError("Sign in with Google first (Settings → Google account).");
  if (isWeb) {
    if (webCalendar && Date.now() < webCalendar.until) return webCalendar.token;
    const pass = webPassFor(CALENDAR_SCOPE); // once allowed, the Drive pass covers Google Calendar too
    if (pass) return pass;
    // Otherwise Google's sign-in page asks (the first time) and comes straight back, and the review is
    // added then, at the time chosen (app.js finishWebSignIn). The page leaves, so this waits.
    const { goToGoogleSignIn } = await import("./app.js");
    await goToGoogleSignIn({ calendar: true, then: { calendar: { task, time } } });
    return new Promise(() => {});
  }
  if (!isNative) throw new AuthError("Sending to Google Calendar works in the installed app, on the computer and in the web app.");
  // (Android and iPhone alike: each one's sign-in asks Google for Calendar too, the first time.)
  const r = await GoogleDriveAuth.authorize({ interactive: true, calendar: true });
  if (r.scopes && !r.scopes.includes(CALENDAR_SCOPE)) throw new AuthError("Google Calendar wasn't allowed, so the review couldn't be added.");
  return r.accessToken;
}

/** Add (or move) today's review event: {title, notes, due: "YYYY-MM-DD", minutes, id, time: "HH:MM",
 *  time_zone}. Resolves to {updated}. */
export async function sendReviewEvent(task) {
  const event = eventBody(task, task.time, task.time_zone); // (checks the day and the time first)
  const token = await calendarToken(task, task.time);
  const body = JSON.stringify(event);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const action = eventAction(settings.review_event, task.due);
  let res;
  try {
    if (action.method === "PATCH") {
      res = await fetch(`${API}/${encodeURIComponent(action.id)}`, { method: "PATCH", headers, body });
      if (patchKept(res.status, res.ok ? await res.clone().json().catch(() => null) : null)) return { updated: true };
      // (Deleted in Google Calendar meanwhile: a new one is added below.)
    }
    res = await fetch(API, { method: "POST", headers, body });
  } catch {
    throw new Error("Couldn't reach Google Calendar. Check your connection.");
  }
  if (!res.ok) throw new Error(calendarError(res.status, await res.text().catch(() => "")));
  await saveSettingsPatch({ review_event: { day: task.due, id: (await res.json()).id || "" } });
  return { updated: false };
}
