// Phone settings: Google account & sync, AI definitions, appearance.

import { checkForUpdate, esc, h, on, toast, saveSettings } from "../app.js";
import { aiSetup } from "../components/aisetup.js";
import { sttSetup } from "../components/sttsetup.js";
import { STT_EVENT, testKey, usageToday } from "../transcribe-service.js";
import { commonWordsButton } from "../commonwords.js";
import { accountSection } from "../components/account.js";
import { ankiSyncPanel } from "../components/ankisync.js";
import { gameSwitch } from "../components/gameswitch.js";
import { languagePicker, speakPicker } from "../components/langpicker.js";
import { chooseUiLanguage } from "../components/onboarding.js";
import { isUiLanguage } from "../i18n.js";
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
    <section class="card" id="definer"></section>

    <section class="card stack">
      <h2>Language I speak</h2>
      <div id="ui-lang"></div>
      <p class="small muted">The app's buttons and messages are shown in this language, and words are explained in it.</p>
    </section>

    <section class="card stack">
      <h2>Language I'm learning</h2>
      <div id="study-lang"></div>
      <p class="small muted">Used for web pages you import here, for word explanations and for anything transcribed from this phone. Set the same one on your computer.
        Things you already transcribed keep the language they were made in.</p>
    </section>

    <section class="card" id="stt"></section>

    <section class="card stack">
      <h2>Google account</h2>
      <p class="small muted">Your podcasts, transcripts and vocab are shared with your computer through a private app folder
        in your own Google Drive. Unless a cloud provider is chosen above, transcription happens on your computer: tap "Transcribe"
        here and it will do it on its next sync.</p>
      <div id="account"></div>
    </section>

    <section class="card stack">
      <h2>AnkiDroid (optional)</h2>
      <div id="anki-sync" class="stack"></div>
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

    <section class="card" id="game-switch"></section>

    <section class="card stack">
      <h2>Updates</h2>
      <div class="row"><span id="app-version"></span><span class="spacer"></span>
        <button type="button" id="check-updates">Check for updates</button></div>
      <div class="small muted" id="update-result"></div>
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
  const offAi = aiSetup($("#definer"), { transport });
  // Cloud transcription
  const offStt = sttSetup($("#stt"), {
    test: testKey,
    usage: () => usageToday(),
    onUsage: (fn) => {
      const hear = () => fn(usageToday());
      window.addEventListener(STT_EVENT, hear);
      return () => window.removeEventListener(STT_EVENT, hear);
    },
  });
  $("#ui-lang").append(speakPicker(isUiLanguage(s.ui_language) ? s.ui_language : "en", async (code) => {
    // redrawn either way: the languages to learn leave this one out, and a failed change shows the old one
    try { await chooseUiLanguage(code); } finally { window.dispatchEvent(new HashChangeEvent("hashchange")); }
  }));
  $("#study-lang").append(languagePicker(s.study_language, async (code) => {
    await saveSettings({ study_language: code });
    toast(`Now learning ${LANGUAGES[code].name}`);
    window.dispatchEvent(new HashChangeEvent("hashchange")); // redraw the examples on this page
  }, { speaks: isUiLanguage(s.ui_language) ? s.ui_language : "en" }), commonWordsButton(studyLanguage()), dictionariesRow(studyLanguage()));

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
  const offAnki = ankiSyncPanel($("#anki-sync"));
  gameSwitch($("#game-switch"));
  import("../version.js").then(({ APP_VERSION }) => { $("#app-version").textContent = `Version ${APP_VERSION}`; }).catch(() => {});
  $("#check-updates").onclick = async () => {
    const box = $("#update-result"), button = $("#check-updates");
    button.disabled = true;
    box.textContent = "Checking…";
    const r = await checkForUpdate({ manual: true });
    button.disabled = false;
    box.textContent = r.error ? r.error
      : r.available ? `Version ${r.latest} is available: tap Update now in the box that just opened.`
      : `You're up to date (${r.current}).`;
  };
  return () => { off(); offAi(); offStt(); offAnki(); };
}
