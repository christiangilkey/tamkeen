// Phone settings: Google account & sync, AI definitions, appearance.

import { esc, h, on, toast, saveSettings } from "../app.js";
import { aiSetup } from "../components/aisetup.js";
import { commonWordsButton } from "../commonwords.js";
import { accountSection } from "../components/account.js";
import { languagePicker } from "../components/langpicker.js";
import { dictionariesRow } from "../lexicon/seen.js";
import { LANGUAGES, langAttrs, langInfo, studyLanguage } from "../languages.js";
import { transport } from "../define-service.js";
import { signIn, signOut } from "../drive.js";
import { isNative } from "../native.js";
import { settings } from "../store.js";
import { syncNow, syncState } from "../sync.js";

function ago(ts) {
  if (!ts) return "never";
  const s = Math.round(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts * 1000).toLocaleString();
}

export async function render(view) {
  const s = settings;
  view.append(h(`<div class="page settings">
    <h1>Settings</h1>
    <section class="card stack">
      <h2>Language I'm learning</h2>
      <div id="study-lang"></div>
      <p class="small muted">Used for web pages you import here and for word explanations. Set the same one on your computer, which does the transcribing.
        Things you already transcribed keep the language they were made in.</p>
    </section>

    <section class="card stack">
      <h2>Google account</h2>
      <p class="small muted">Your podcasts, transcripts and vocab come from your computer through a private app folder
        in your own Google Drive. Transcription happens on your computer; tap "Transcribe" here and it will do it on its next sync.</p>
      <div id="account"></div>
    </section>

    <section class="card stack">
      <h2>Word definitions (AI)</h2>
      <p class="small muted">Tap any word to hear it and see what it means in that sentence. Uses your own API key
        (stored only on this phone). The word and its surrounding sentences are sent to the provider you choose.</p>
      <div id="ai-setup"></div>
    </section>

    <section class="card stack">
      <h2>Appearance</h2>
      <div class="row">Theme:
        ${["system", "light", "dark"].map((t) => `<label class="switch"><input type="radio" name="theme" value="${t}" ${s.theme === t ? "checked" : ""}> ${t[0].toUpperCase() + t.slice(1)}</label>`).join("")}
      </div>
      <label class="check"><input type="checkbox" id="haptics" ${s.haptics !== false ? "checked" : ""}>
        <span>Vibrate lightly when I tap a word or save one</span></label>
      <div class="row">Podcast &amp; video text: <input type="range" id="font" min="16" max="48" value="${s.font_size}" style="flex:1"> <span id="font-val">${s.font_size}px</span></div>
      <div class="ar" ${langAttrs(studyLanguage())} style="font-size:var(--ar-size);line-height:2">${esc(langInfo(studyLanguage()).sample)}</div>
      <div class="row">Web page text: <input type="range" id="page-font" min="12" max="40" value="${s.page_font_size || 17}" style="flex:1"> <span id="page-font-val">${s.page_font_size || 17}px</span></div>
      <div class="ar" ${langAttrs(studyLanguage())} style="font-size:var(--page-size);line-height:2">${esc(langInfo(studyLanguage()).pageSample)}</div>
    </section>

    <section class="card small muted">Tamkeen for Android · <a href="https://christiangilkey.github.io/tamkeen/privacy.html" target="_blank" rel="noopener">Privacy policy</a></section>
  </div>`));
  const $ = (q) => view.querySelector(q);
  $("#haptics").onchange = (e) => saveSettings({ haptics: e.target.checked });
  $("#account").closest("section").after(accountSection());

  function paintAccount(st = syncState) {
    const box = $("#account");
    if (!settings.signed_in) {
      box.innerHTML = `<button type="button" class="primary" id="login">Sign in with Google</button>
        ${isNative ? "" : `<p class="small muted">Sign-in works in the installed app.</p>`}`;
      box.querySelector("#login").onclick = async (e) => {
        e.target.disabled = true;
        try {
          const email = await signIn();
          toast(`Signed in as ${email}`);
          paintAccount();
          syncNow();
        } catch (err) {
          toast(err.message, { error: true });
          e.target.disabled = false;
        }
      };
      return;
    }
    const busy = st.state === "syncing";
    box.innerHTML = `<div class="row"><span class="pill done">Signed in</span> <strong>${esc(settings.google_email)}</strong></div>
      <div class="small ${st.state === "error" ? "" : "muted"}" style="${st.state === "error" ? "color:var(--danger)" : ""}">
        ${st.state === "error" ? `Sync failed: ${esc(st.error)}` : busy ? "Syncing…" : `Last synced ${ago(st.last_sync)}`}</div>
      <div class="row"><button type="button" id="sync-now" ${busy ? "disabled" : ""}>Sync now</button>
        <button type="button" class="ghost danger" id="logout">Sign out</button></div>`;
    box.querySelector("#sync-now").onclick = () => syncNow();
    box.querySelector("#logout").onclick = async () => {
      if (!confirm("Sign out of Google? Your library stays on this phone; it just stops syncing.")) return;
      await signOut();
      paintAccount();
    };
  }
  paintAccount();
  const off = on("sync", paintAccount);

  // AI definitions
  $("#ai-setup").append(aiSetup({ transport }));
  $("#study-lang").append(languagePicker(s.study_language, async (code) => {
    await saveSettings({ study_language: code });
    toast(`Now learning ${LANGUAGES[code].name}`);
    window.dispatchEvent(new HashChangeEvent("hashchange")); // redraw the examples on this page
  }), commonWordsButton(studyLanguage()), dictionariesRow(studyLanguage()));

  // Appearance
  view.querySelectorAll("input[name=theme]").forEach((r) => (r.onchange = () => saveSettings({ theme: r.value })));
  $("#font").oninput = (e) => {
    $("#font-val").textContent = `${e.target.value}px`;
    saveSettings({ font_size: Number(e.target.value) });
  };
  $("#page-font").oninput = (e) => {
    $("#page-font-val").textContent = `${e.target.value}px`;
    saveSettings({ page_font_size: Number(e.target.value) });
  };
  return off;
}
