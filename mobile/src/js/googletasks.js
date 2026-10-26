// The phone's and web app's side of the Review tab's "Send to Google Tasks" (the computer's is
// app/googletasks.py): today's review session as a task in the learner's Google Tasks, one a day
// (sending again the same day updates it, setting `review_task` = {day, id}); and "Send to Onyx",
// which opens Onyx Calendar with an onyx:// link instead.

import { GoogleDriveAuth, isNative, isWeb } from "./native.js";
import { AuthError, TASKS_SCOPE, webPassFor } from "./drive.js";
import { saveSettingsPatch, settings } from "./store.js";

const API = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
let webTasks = null; // the web app: a Google Tasks pass just handed back by Google's page {token, until}

/** The web app: a Google Tasks pass that came back from Google's sign-in page (app.js finishWebSignIn). */
export function useTasksToken(token, expiresIn) {
  webTasks = { token, until: Date.now() + Math.max(60, (Number(expiresIn) || 3600) - 300) * 1000 };
}

/** A pass for Google Tasks, to send `task`. The first time, Google asks the learner to allow it. */
async function tasksToken(task) {
  if (!settings.signed_in) throw new AuthError("Sign in with Google first (Settings → Account & sync).");
  if (isWeb) {
    if (webTasks && Date.now() < webTasks.until) return webTasks.token;
    const pass = webPassFor(TASKS_SCOPE); // once allowed, the Drive pass covers Google Tasks too
    if (pass) return pass;
    // Otherwise Google's sign-in page asks (the first time) and comes straight back, and the task is
    // sent then (app.js finishWebSignIn). Google's small window used to ask, but in the web app on a
    // phone's home screen it opened as a blank page that never closed. The page leaves, so this waits.
    const { goToGoogleSignIn } = await import("./app.js");
    await goToGoogleSignIn({ tasks: true, then: { tasks: task } });
    return new Promise(() => {});
  }
  if (!isNative) throw new AuthError("Sending to Google Tasks works in the installed app, on the computer and in the web app.");
  // (Android and iPhone alike: each one's sign-in asks Google for Tasks too, the first time.)
  const r = await GoogleDriveAuth.authorize({ interactive: true, tasks: true });
  if (r.scopes && !r.scopes.includes(TASKS_SCOPE)) throw new AuthError("Google Tasks wasn't allowed, so the task couldn't be added.");
  return r.accessToken;
}

/** Add (or update) today's review task: {title, notes, due: "YYYY-MM-DD"}. Resolves to {updated}. */
export async function sendReviewTask(task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(task.due || ""))) throw new Error("The task needs a day.");
  const token = await tasksToken(task);
  const body = JSON.stringify({ title: String(task.title || "Tamkeen review").slice(0, 200), notes: String(task.notes || "").slice(0, 2000),
                                due: `${task.due}T00:00:00.000Z`, status: "needsAction" });
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const kept = settings.review_task || {};
  let res;
  try {
    if (kept.day === task.due && kept.id) {
      res = await fetch(`${API}/${encodeURIComponent(kept.id)}`, { method: "PATCH", headers, body });
      if (res.ok) return { updated: true };
      // (Deleted in Google Tasks meanwhile: a new one is made below.)
    }
    res = await fetch(API, { method: "POST", headers, body });
  } catch {
    throw new Error("Couldn't reach Google Tasks. Check your connection.");
  }
  if (res.status === 403 && /has not been used|disabled/i.test(await res.clone().text())) {
    throw new Error("Google Tasks isn't switched on for Tamkeen's Google project yet.");
  }
  if (!res.ok) throw new Error(`Google Tasks answered with an error (${res.status}).`);
  await saveSettingsPatch({ review_task: { day: task.due, id: (await res.json()).id || "" } });
  return { updated: false };
}

/** Hand a task to Onyx Calendar: the phone opens the onyx:// link, and Android starts Onyx with it. */
export function openOnyx(url) {
  if (!/^onyx:\/\//.test(String(url || ""))) throw new Error("That isn't an Onyx link.");
  window.location.href = url;
  return { ok: true };
}
