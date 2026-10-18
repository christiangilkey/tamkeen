// Settings → Reset Tamkeen on the phone (the desktop's is app/reset.py; the card and question are
// web/js/components/resetapp.js). The library, settings (with the Google sign-in and AI keys) and
// sync bookkeeping are set aside in the phone's storage under "parked:<name>", checked, and the app
// starts again empty and signed out. Transcripts and audio stay where they are (only the library
// knew about them). Everything comes back once the user signs in to Google or finishes the first
// screens, keeping what was chosen meanwhile. While set aside, sync does nothing.

import { DEFAULTS, kv } from "./store.js";

const KEYS = ["library", "settings", "pending_transcripts", "pending_clips", "drive_files", "feed_checks", "anki_droid"];
// Chosen again on the first screens: always taken from the new run, even when still unset.
const ALWAYS_NEW = ["welcome_seen", "onboarded", "study_language", "ui_language"];

let isSet = false;
/** Whether a library is set aside (read once on start, see loadParked). */
export const parked = () => isSet;
export async function loadParked() { isSet = !!(await kv.get("parked")); return isSet; }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Set everything aside and start empty. Throws (having changed nothing) if it can't be done safely. */
export async function parkAll() {
  if (await loadParked()) throw new Error("Tamkeen has already been reset. Sign in or finish the first screens to bring your library back.");
  const saved = {};
  for (const key of KEYS) saved[key] = await kv.get(key);
  for (const key of KEYS) await kv.set(`parked:${key}`, saved[key]);
  for (const key of KEYS) {
    if (!same(await kv.get(`parked:${key}`), saved[key])) throw new Error("Your library couldn't be set aside safely, so nothing was reset.");
  }
  await kv.set("parked", { at: Date.now() });
  isSet = true;
  for (const key of KEYS) await kv.set(key, undefined);
  await clearCookies();
}

/** Bring everything back if the user has signed in or finished the first screens. `now` = the
 *  settings as they are in this new run. True if it was brought back (the page should reload). */
export async function maybeRestore(now) {
  if (!isSet || !(now.signed_in || (now.welcome_seen && now.onboarded))) return false;
  const old = (await kv.get("parked:settings")) || {};
  const carried = {};
  for (const [key, value] of Object.entries(now)) {
    if (ALWAYS_NEW.includes(key) || !same(value, DEFAULTS[key])) carried[key] = value;
  }
  for (const key of KEYS) {
    const value = await kv.get(`parked:${key}`);
    await kv.set(`reset-backup:${key}`, value);  // kept, never deleted, until a later reset
    await kv.set(key, key === "settings" ? { ...old, ...carried } : value);
  }
  for (const key of KEYS) await kv.set(`parked:${key}`, undefined);
  await kv.set("parked", null);
  isSet = false;
  return true;
}

/** Signed out of Instagram, YouTube and every other site in the app's browser windows. */
async function clearCookies() {
  try {
    const { AppReset } = await import("./native.js");
    if (AppReset) await AppReset.clearCookies();
  } catch { /* not on a phone, or nothing to clear */ }
}
