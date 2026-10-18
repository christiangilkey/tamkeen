// First run on the phone: the three boxes (components/onboarding.js), then what the app does and
// Google sign-in to bring in the library.

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
      <p class="muted" style="margin:0">Your podcasts, transcripts and vocab, on your phone.</p></div></div>
    <div class="ar-sample" id="hello"></div>
    <div class="card stack">
      <ol>
        <li><strong>Transcribe on your computer.</strong> The desktop app makes the word-by-word transcripts.</li>
        <li><strong>Sign in with the same Google account</strong> here and on your computer. Everything syncs through a
          private app folder in your own Google Drive.</li>
        <li><strong>Tap any word</strong> to hear it and see what it means in context. Long-press for more options.</li>
      </ol>
      <button type="button" class="primary" id="go">Sign in with Google</button>
      <button type="button" class="ghost" id="skip">Not now</button>
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
