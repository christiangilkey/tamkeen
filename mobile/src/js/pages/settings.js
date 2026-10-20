// Phone settings (Android, iPhone and the web app). The home screen lists the sections, each with
// what it is set to now; each section is its own screen (#/settings?s=<id>) with the things most
// people change in view and the rest under "More options". components/settingsui.js has the frame,
// the search and the looks; the computer's page (web/js/pages/settings.js) has the same sections.

import { taskTargetCard } from "../components/tasktarget.js";
import { api, checkForUpdate, esc, h, on, toast, saveSettings } from "../app.js";
import { aiSetup } from "../components/aisetup.js";
import { sttSetup } from "../components/sttsetup.js";
import { STT_EVENT, testKey, usageToday } from "../transcribe-service.js";
import { STT_PROVIDERS, sttConfig } from "../stt.js";
import { PROVIDERS } from "../definer.js";
import { commonWordsButton } from "../commonwords.js";
import { accountSection } from "../components/account.js";
import { ankiSyncPanel } from "../components/ankisync.js";
import { gameOn, gameSwitch } from "../components/gameswitch.js";
import { resetSection } from "../components/resetapp.js";
import { licensesFold } from "../components/licenses.js";
import { parkAll } from "../reset.js";
import { speakPicker } from "../components/langpicker.js";
import { learningList, learningSettings, learningSummary } from "../components/langswitch.js";
import { chooseUiLanguage } from "../components/onboarding.js";
import { UI_LANGUAGES, isUiLanguage } from "../i18n.js";
import { dictionariesRow } from "../lexicon/seen.js";
import { vowelsRow } from "../vowels.js";
import { readingsRow } from "../lexicon/readings.js";
import { langAttrs, langInfo, studyLanguage } from "../languages.js";
import { TARGET_NAMES, taskTarget } from "../review/sendtask.js";
import { transport } from "../define-service.js";
import { signIn, signOut } from "../drive.js";
import { isIOS, isNative, isWeb } from "../native.js";
import { settings } from "../store.js";
import { syncNow, syncState } from "../sync.js";
import { resetTours } from "../components/tour.js";
import { SECTIONS, confirmBox, findsFor, moreOptions, revealFind, sectionOfFind, sectionPage, settingsHome } from "../components/settingsui.js";

const android = !isIOS && !isWeb; // AnkiDroid is an Android thing
// Vibration: Android, and the web app on a phone whose browser can (an iPhone's can't, nor a computer).
const vibrates = !isIOS && typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  && (!isWeb || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches));
const THEMES = { system: "System", light: "Light", dark: "Dark" };
const THEME_LINE = { system: "System theme", light: "Light theme", dark: "Dark theme" };
// On the phone some sections hold other things than on the computer.
const ABOUTS = {
  apps: isWeb ? "Google Tasks, Onyx, and the Tamkeen app." : android ? "AnkiDroid, Google Tasks and Onyx." : "Google Tasks and Onyx.",
  data: isWeb ? "Starting again, the privacy policy and licenses." : "Updates, starting again, the privacy policy and licenses.",
};

function ago(ts) {
  if (!ts) return "never";
  const s = Math.round(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts * 1000).toLocaleString();
}

export async function render(view, { query } = {}) {
  const show = (query && query.get("show")) || "";
  const id = (query && query.get("s")) || sectionOfFind(show);
  if (!SECTIONS.some((x) => x.id === id)) { home(view); return; }
  const { body } = sectionPage(view, id, { about: ABOUTS[id] });
  const cleanups = (await BUILD[id](body)) || [];
  revealFind(view, show);
  return () => cleanups.forEach((f) => f());
}

// ---------- the home screen: the sections, and what each is set to now ----------

function home(view) {
  const s = settings;
  const ui = isUiLanguage(s.ui_language) ? s.ui_language : "en";
  settingsHome(view, {
    abouts: ABOUTS,
    finds: findsFor({ phone: true, android, ios: isIOS, web: isWeb, vibrates }, studyLanguage()),
    summaries: {
      languages: () => [{ text: learningSummary(learningList(s)) }, { text: `App in ${UI_LANGUAGES[ui].native}` }],
      words: () => {
        if (s.definer_mode === "dictionary") return { text: "No AI: built-in dictionary" };
        const p = PROVIDERS[s.definer_provider] ? s.definer_provider : "claude";
        if (s.definer_mode === "dictionary_first") {
          return { text: s[`llm_key_${p}`] ? `Dictionary first, then ${PROVIDERS[p].short}` : "Built-in dictionary (no AI key yet)" };
        }
        return s[`llm_key_${p}`] ? { text: `AI explanations with ${PROVIDERS[p].short}` } : { text: "Needs an API key", warn: true };
      },
      listening: () => {
        const cfg = sttConfig(s);
        if (cfg.on) return { text: `${STT_PROVIDERS[cfg.provider].label} writes the transcripts` };
        if (cfg.mode === "cloud") return { text: "Cloud transcription needs a key", warn: true };
        return { text: "Your computer writes the transcripts" };
      },
      look: () => [{ text: isWeb ? THEME_LINE.dark : THEME_LINE[s.theme] || THEME_LINE.system }, { text: gameOn() ? "Game features on" : "Game features off" }],
      account: () => {
        if (!s.signed_in) return { text: "Google Drive: not connected" };
        if (syncState.state === "error") return { text: "Last sync failed", warn: true };
        return { text: s.google_email ? `Google Drive: ${s.google_email}` : "Google Drive: connected" };
      },
      apps: async () => {
        const parts = [{ text: `Review to-do: ${TARGET_NAMES[taskTarget()]}` }];
        const st = android ? await api("/anki/sync/status").catch(() => null) : null;
        if (st && st.enabled) parts.unshift({ text: "AnkiDroid sync on" });
        return parts;
      },
      data: async () => {
        if (isWeb) return null;
        const { APP_VERSION } = await import("../version.js");
        return { text: `Version ${APP_VERSION}` };
      },
    },
  });
}

// ---------- the sections ----------

const BUILD = { languages, words, listening, look, account, apps, data };

function languages(body) {
  const s = settings;
  const lang = studyLanguage();
  body.append(h(`<div>
    <section class="card set-card" data-find="speak">
      <h2>Language I speak</h2>
      <p class="set-hint">The app's buttons and messages are shown in this language, and words are explained in it.</p>
      <div id="ui-lang"></div>
    </section>
    <section class="card set-card" data-find="learn">
      <h2>Languages I'm learning</h2>
      <p class="set-hint">Tick each language you're learning: the switch at the top of the screen lists them, here and on your other devices.
        The one you're studying now is used for web pages you import here, for word explanations and for anything transcribed from this phone.</p>
      <div id="study-lang"></div>
      ${moreOptions(`<div id="basics" data-find="basics"></div>`)}
    </section>
    <section class="card set-card" id="reading-card" data-find="reading">
      <h2>Reading help</h2>
      <p class="set-hint">${esc(`Extras for reading ${langInfo(lang).name}.`)}</p>
      <div id="reading"></div>
    </section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  $("#ui-lang").append(speakPicker(isUiLanguage(s.ui_language) ? s.ui_language : "en", async (code) => {
    // redrawn either way: the languages to learn leave this one out, and a failed change shows the old one
    try { await chooseUiLanguage(code); } finally { window.dispatchEvent(new HashChangeEvent("hashchange")); }
  }));
  // Tap a tile to tick or untick it; "Studying now" under them picks the current one (langswitch.js).
  $("#study-lang").append(learningSettings({ speaks: isUiLanguage(s.ui_language) ? s.ui_language : "en" }));
  $("#basics").append(commonWordsButton(lang));
  // word dictionaries, Arabic vowels, Japanese and Chinese readings: each shows itself where it applies
  const rows = [dictionariesRow(lang), vowelsRow(lang), readingsRow(lang)];
  $("#reading").append(...rows);
  const paintCard = () => { $("#reading-card").hidden = rows.every((r) => r.hidden); };
  paintCard();
  const watch = new MutationObserver(paintCard);
  rows.forEach((r) => watch.observe(r, { attributes: true, attributeFilter: ["hidden"] }));
  return [() => watch.disconnect()];
}

function words(body) {
  body.append(h(`<section class="card" id="definer"></section>`));
  return [aiSetup(body.querySelector("#definer"), { transport })];
}

function listening(body) {
  body.append(h(`<section class="card" id="stt"></section>`));
  return [sttSetup(body.querySelector("#stt"), {
    test: testKey,
    usage: () => usageToday(),
    onUsage: (fn) => {
      const hear = () => fn(usageToday());
      window.addEventListener(STT_EVENT, hear);
      return () => window.removeEventListener(STT_EVENT, hear);
    },
  })];
}

function look(body) {
  const s = settings;
  const lang = studyLanguage();
  body.append(h(`<div>
    ${isWeb ? "" : `<section class="card set-card" data-find="theme">
      <h2>Theme</h2>
      <div class="set-seg" role="radiogroup" aria-label="Theme">${Object.entries(THEMES).map(([v, name]) => `
        <label><input type="radio" name="theme" value="${v}" ${(s.theme || "system") === v ? "checked" : ""}><span>${name}</span></label>`).join("")}
      </div>
    </section>`}
    <section class="card set-card" data-find="textsize">
      <h2>Text size</h2>
      <p class="set-hint">For the language you're learning. The example shows how big it will be.</p>
      <div class="set-slider"><label for="font">Podcasts &amp; videos</label>
        <input type="range" id="font" min="16" max="56" value="${s.font_size}"><output id="font-val">${s.font_size}px</output></div>
      <div class="set-sample ar" ${langAttrs(lang)} style="font-size:var(--ar-size);line-height:2">${esc(langInfo(lang).sample)}</div>
      <div class="set-slider"><label for="page-font">Web pages</label>
        <input type="range" id="page-font" min="12" max="40" value="${s.page_font_size || 17}"><output id="page-font-val">${s.page_font_size || 17}px</output></div>
      <div class="set-sample ar" ${langAttrs(lang)} style="font-size:var(--page-size);line-height:2">${esc(langInfo(lang).pageSample)}</div>
    </section>
    ${vibrates ? `<section class="card set-card" data-find="haptics">
      <h2>Vibration</h2>
      <label class="check"><input type="checkbox" id="haptics" ${s.haptics !== false ? "checked" : ""}>
        <span>Vibrate lightly when I tap a word or save one</span></label>
    </section>` : ""}
    <section class="card" id="game-switch" data-find="game"></section>
    <section class="card set-card" data-find="guides">
      <h2>Page guides</h2>
      <p class="set-hint">The first time you open Home, the Library, Vocab and Friends, a short guide shows what each button does.</p>
      <div class="row"><button type="button" id="guides-again">Show the guides again</button><span class="small muted" id="guides-done"></span></div>
    </section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  $("#guides-again").onclick = () => { resetTours(); $("#guides-done").textContent = "They'll show the next time you open each page."; };
  if ($("#haptics")) $("#haptics").onchange = (e) => saveSettings({ haptics: e.target.checked });
  body.querySelectorAll("input[name=theme]").forEach((r) => (r.onchange = () => saveSettings({ theme: r.value })));
  $("#font").oninput = (e) => {
    $("#font-val").textContent = `${e.target.value}px`;
    saveSettings({ font_size: Number(e.target.value) });
  };
  $("#page-font").oninput = (e) => {
    $("#page-font-val").textContent = `${e.target.value}px`;
    saveSettings({ page_font_size: Number(e.target.value) });
  };
  gameSwitch($("#game-switch"));
  return [];
}

function account(body) {
  body.append(h(`<section class="card set-card stack" data-find="drive">
    <h2>Google account</h2>
    <p class="set-hint">Your podcasts, transcripts and vocab are shared with your computer through a private app folder
      in your own Google Drive.</p>
    <div id="account"></div>
    <details class="set-info"><summary>Who transcribes what I add here?</summary>Unless a cloud provider is chosen in
      Listening &amp; transcripts, transcription happens on your computer: tap "Transcribe" here and it will do it on its next sync.</details>
  </section>`));
  body.append(accountSection());
  const box = body.querySelector("#account");
  function paintAccount(st = syncState) {
    if (!settings.signed_in) {
      box.innerHTML = `<div class="set-state"><span class="pill">Not signed in</span>
        <button type="button" class="primary" id="login">Sign in with Google</button></div>
        ${isNative || isWeb ? "" : `<p class="small muted">Sign-in works in the installed app.</p>`}`;
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
    box.innerHTML = `<div class="set-state"><span class="pill done">Signed in</span> <strong>${esc(settings.google_email)}</strong></div>
      <div class="small ${st.state === "error" ? "" : "muted"}" style="margin-top:8px;${st.state === "error" ? "color:var(--danger)" : ""}">
        ${st.state === "error" ? `Sync failed: ${esc(st.error)}` : busy ? "Syncing…" : `Last synced ${ago(st.last_sync)}`}</div>
      <div class="set-actions"><button type="button" id="sync-now" ${busy ? "disabled" : ""}>Sync now</button>
        <button type="button" class="ghost danger" id="logout">Sign out</button></div>`;
    box.querySelector("#sync-now").onclick = () => syncNow();
    box.querySelector("#logout").onclick = async () => {
      if (!(await confirmBox("Sign out of Google?", "Your library stays on this phone; it just stops syncing.",
                             { ok: "Sign out", danger: true }))) return;
      await signOut();
      paintAccount();
    };
  }
  paintAccount();
  return [on("sync", paintAccount)];
}

function apps(body) {
  body.append(h(`<div>
    ${android ? `<section class="card set-card stack" data-find="anki">
      <h2>AnkiDroid (optional)</h2>
      <div id="anki-sync" class="stack"></div>
    </section>` : ""}
    <section class="card" id="task-target" data-find="tasks"></section>
    ${isWeb ? `<section class="card set-card stack" data-find="getapp">
      <h2>Tamkeen on the web</h2>
      <p class="set-hint">This works like the app, with a few things that need the Tamkeen app on your phone or computer.</p>
      <details class="set-info"><summary>What needs the app?</summary>Reels from your Instagram saves and random reels, reels with
        a song from Instagram's music library, the built-in web browser (Import Page and Find in a video), AnkiDroid sync, and the
        number on the app icon. What you add in the app shows up here after a sync.</details>
      <div><a class="btn primary" href="https://github.com/christiangilkey/tamkeen/releases/latest" target="_blank" rel="noopener">Get the app</a></div>
    </section>` : ""}
  </div>`));
  taskTargetCard(body.querySelector("#task-target"));
  return android ? [ankiSyncPanel(body.querySelector("#anki-sync"))] : [];
}

function data(body) {
  body.append(h(`<div>
    <section class="card set-card stack" data-find="updates" ${isWeb ? "hidden" : ""}>
      <h2>Updates</h2>
      <div class="row"><span id="app-version"></span><span class="spacer"></span>
        <button type="button" id="check-updates">Check for updates</button></div>
      <div class="small muted" id="update-result"></div>
    </section>
    <section class="card" id="reset-app" data-find="reset"></section>
    <section class="card set-card stack" data-find="about privacy">
      <h2>About Tamkeen</h2>
      <p class="set-hint">Tamkeen ${isWeb ? "on the web" : isIOS ? "for iPhone" : "for Android"} ·
        <a href="https://christiangilkey.github.io/tamkeen/privacy.html" target="_blank" rel="noopener">Privacy policy</a> ·
        <a href="https://github.com/christiangilkey/tamkeen" target="_blank" rel="noopener">Source code</a></p>
    </section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  // The open-source licences, read from the copies this build carries (build-www.mjs).
  const read = async (path, as) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(String(res.status));
    return as === "json" ? res.json() : res.text();
  };
  body.querySelector('[data-find~="about"]').append(licensesFold({
    list: () => read("licenses/index.json", "json"),
    text: (file) => read(`licenses/${encodeURIComponent(file)}`, "text"),
  }));
  resetSection($("#reset-app"), parkAll);
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
  return [];
}
