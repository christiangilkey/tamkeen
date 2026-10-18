// Settings → Reset Tamkeen (desktop and phone): start again as on first use. Nothing is deleted:
// the library is set aside and comes back once the user signs in to Google or finishes the
// first-run screens (desktop: app/reset.py; phone: mobile/src/js/reset.js). Each shell passes
// `run`, which sets its library aside and signs it out; this file is the card and the question.

import { h } from "../app.js";
import { openModal } from "./modal.js";

/** Fill `box` (the last Settings card). `run()` resolves when done, or throws with a reason. */
export function resetSection(box, run) {
  box.append(h(`<div class="stack">
    <h2>Reset Tamkeen</h2>
    <div class="small muted">Start again as if Tamkeen were new: you're signed out and see the first screens again.
      Nothing is deleted. Your library, words and settings come back when you sign in.</div>
    <div><button type="button" class="danger-solid reset-app">Reset Tamkeen</button></div>
  </div>`));
  box.querySelector(".reset-app").onclick = () => ask(run);
}

function ask(run) {
  const m = openModal({ title: "Reset Tamkeen?" });
  m.body.append(h(`<div class="stack reset-ask">
    <p>Tamkeen will start again as on first use:</p>
    <ul>
      <li>signed out of Google, your Friends account, and Instagram and YouTube in the app's browser</li>
      <li>your AI and transcription keys removed from this device</li>
      <li>the welcome screens and language questions shown again</li>
    </ul>
    <p><strong>Nothing is deleted.</strong> Your podcasts, videos, words, reviews and settings are set aside
      and come back as soon as you sign in to Google, or when you finish the first screens.</p>
    <div class="small muted error-line" hidden></div>
    <div class="row reset-buttons">
      <button type="button" class="cancel">Cancel</button>
      <button type="button" class="danger-solid go">Reset Tamkeen</button>
    </div>
  </div>`));
  const go = m.body.querySelector(".go");
  const error = m.body.querySelector(".error-line");
  m.body.querySelector(".cancel").onclick = () => m.close();
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = "Resetting…";
    error.hidden = true;
    try {
      try {
        const social = await import("../social.js");
        await social.disconnect();
      } catch { /* not signed in to Friends, or offline: the reset still goes ahead */ }
      await run();
      location.hash = "#/welcome";
      location.reload();
    } catch (e) {
      error.textContent = e.message || "Tamkeen couldn't be reset. Nothing was changed.";
      error.hidden = false;
      go.disabled = false;
      go.textContent = "Reset Tamkeen";
    }
  };
}
