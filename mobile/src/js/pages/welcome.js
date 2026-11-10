// First run on the phone and in the web app: the first-run boxes (components/onboarding.js), then what
// the app does, with Google sign-in offered for those who also use it on another device.

import { h, toast, saveSettings } from "../app.js";
import { signIn } from "../drive.js";
import { isNative, isWeb } from "../native.js";
import { syncNow } from "../sync.js";
import { settings } from "../store.js";
import { needsOnboarding, runOnboarding } from "../components/onboarding.js";
import { LANGUAGES, isLanguage, setLang } from "../languages.js";

export async function render(view) {
  view.append(h(`<div class="welcome">
    <div class="hero"><img src="icons/icon-256.png" alt=""><div>
      <h1 style="margin:0">Tamkeen</h1>
      <p class="muted" style="margin:0">Your podcasts, transcripts and vocab, ${isWeb ? "in your browser" : "on your phone"}.</p></div></div>
    <div class="ar-sample" id="hello"></div>
    <div class="card stack">
      <ol>
        <li><strong>Find something to learn from.</strong> In the Library, start a course, or press <strong>+</strong> for
          YouTube videos, podcasts, web pages and books.</li>
        <li><strong>Tap any word</strong> to hear it and see what it means. Long-press for more options.</li>
        <li><strong>Using Tamkeen on another device too?</strong> Sign in with the same Google account on each: your library,
          words and progress sync through a private folder in your own Google Drive.</li>
      </ol>
      <button type="button" class="primary" id="skip">Start learning</button>
      <button type="button" class="ghost" id="go">Sign in with Google</button>
      ${isNative || isWeb ? "" : `<p class="small muted">Preview mode: sign-in works in the installed app.</p>`}
    </div>
  </div>`));
  const hello = view.querySelector("#hello");
  const show = (code) => {
    const chosen = isLanguage(code);
    view.querySelector("#go").disabled = view.querySelector("#skip").disabled = !chosen;
    hello.textContent = chosen ? LANGUAGES[code].hello : "";
    if (chosen) setLang(hello, code);
  };
  show(settings.study_language);
  // The three first-run boxes (language, beginner or not, the API key) come before anything else.
  if (needsOnboarding(settings)) runOnboarding().then(({ lang }) => show(lang));
  const finish = async () => { await saveSettings({ welcome_seen: true }); location.hash = "#/"; };
  view.querySelector("#go").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const email = await signIn();
      toast(`Signed in as ${email}. Bringing in your library…`);
      syncNow();
      await finish();
    } catch (err) {
      toast(err.message, { error: true });
      e.target.disabled = false;
    }
  };
  view.querySelector("#skip").onclick = finish;
}
