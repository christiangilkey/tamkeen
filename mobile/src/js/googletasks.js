// The phone's and web app's side of the Review tab's "Send to Google Tasks" (the computer's is
// app/googletasks.py): today's review session as a task in the learner's Google Tasks, one a day
// (sending again the same day updates it, setting `review_task` = {day, id}); and "Send to Onyx",
// which opens Onyx Calendar with an onyx:// link instead.

import { GOOGLE_WEB_CLIENT_ID, GoogleDriveAuth, isIOS, isNative, isWeb } from "./native.js";
import { AuthError, googleScript } from "./drive.js";
import { saveSettingsPatch, settings } from "./store.js";

const API = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";

/** A pass for Google Tasks. The first time, Google asks the learner to allow it. */
async function tasksToken() {
  if (!settings.signed_in) throw new AuthError("Sign in with Google first (Settings → Google account).");
  if (isWeb) {
    const google = await googleScript();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_WEB_CLIENT_ID, scope: TASKS_SCOPE, include_granted_scopes: true,
        login_hint: settings.google_email || undefined,
        callback: (r) => (r && r.access_token && google.accounts.oauth2.hasGrantedAllScopes(r, TASKS_SCOPE)
          ? resolve(r.access_token) : reject(new AuthError("Google Tasks wasn't allowed, so the task couldn't be added."))),
        error_callback: () => reject(new AuthError("Google's window was closed before allowing Google Tasks.")),
      });
      client.requestAccessToken();
    });
  }
  if (isIOS || !isNative) throw new AuthError("Sending to Google Tasks works on Android, the computer and the web app. Choose Onyx in Settings, or use one of those.");
  const r = await GoogleDriveAuth.authorize({ interactive: true, tasks: true });
  if (r.scopes && !r.scopes.includes(TASKS_SCOPE)) throw new AuthError("Google Tasks wasn't allowed, so the task couldn't be added.");
  return r.accessToken;
}

/** Add (or update) today's review task: {title, notes, due: "YYYY-MM-DD"}. Resolves to {updated}. */
export async function sendReviewTask(task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(task.due || ""))) throw new Error("The task needs a day.");
  const token = await tasksToken();
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
