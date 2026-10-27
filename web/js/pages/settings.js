// Settings on the computer. The home screen lists the sections, each with what it is set to now;
// each section is its own screen (#/settings?s=<id>) with the things most people change in view and
// the rest under "More options". components/settingsui.js has the frame, the search and the looks;
// the phone's page (mobile/src/js/pages/settings.js) has the same sections.

import { taskTargetCard } from "../components/tasktarget.js";
import { api, esc, h, on, toast, download, loadStatus, saveSettings, fmtBytes, state, offerUpdate } from "../app.js";
import { modelManager, gpuPanel } from "../components/models.js";
import { aiSetup } from "../components/aisetup.js";
import { sttSetup } from "../components/sttsetup.js";
import { voiceSetup, voiceSummary } from "../components/voicesetup.js";
import { STT_PROVIDERS, sttConfig } from "../stt.js";
import { PROVIDERS, definerModeOf } from "../definer.js";
import { commonWordsButton } from "../commonwords.js";
import { accountSection } from "../components/account.js";
import { ankiSyncPanel } from "../components/ankisync.js";
import { gameOn, gameSwitch } from "../components/gameswitch.js";
import { speakPicker } from "../components/langpicker.js";
import { learningList, learningSettings, learningSummary } from "../components/langswitch.js";
import { chooseUiLanguage } from "../components/onboarding.js";
import { UI_LANGUAGES, isUiLanguage } from "../i18n.js";
import { dictionariesRow } from "../lexicon/seen.js";
import { vowelsRow } from "../vowels.js";
import { readingsRow } from "../lexicon/readings.js";
import { resetSection } from "../components/resetapp.js";
import { licensesFold } from "../components/licenses.js";
import { langAttrs, langInfo, studyLanguage } from "../languages.js";
import { applyPageSize, pageSize, pageSizeLabel, PAGE_SIZE_MAX, PAGE_SIZE_MIN } from "../textsize.js";
import { TARGET_NAMES, taskTarget } from "../review/sendtask.js";
import { resetTours } from "../components/tour.js";
import { controllerSection, controllerSummary } from "../components/controllerpanel.js";
import { SECTIONS, confirmBox, findsFor, moreOptions, revealFind, sectionOfFind, sectionPage, settingsHome } from "../components/settingsui.js";

const THEMES = { system: "System", light: "Light", dark: "Dark" };
const THEME_LINE = { system: "System theme", light: "Light theme", dark: "Dark theme" };

export async function render(view, { query } = {}) {
  const status = await loadStatus();
  const show = (query && query.get("show")) || "";
  const id = (query && query.get("s")) || sectionOfFind(show);
  if (!SECTIONS.some((x) => x.id === id)) { home(view, status); return; }
  const { body } = sectionPage(view, id);
  const cleanups = (await BUILD[id](body, status)) || [];
  revealFind(view, show);
  return () => cleanups.forEach((f) => f());
}

// ---------- the home screen: the sections, and what each is set to now ----------

function home(view, status) {
  const s = status.settings;
  const ui = isUiLanguage(s.ui_language) ? s.ui_language : "en";
  settingsHome(view, {
    finds: findsFor({ desktop: true }, studyLanguage()),
    summaries: {
      languages: () => [{ text: learningSummary(learningList(s)) }, { text: `App in ${UI_LANGUAGES[ui].native}` }],
      words: () => {
        const how = definerModeOf(s);
        if (how === "dictionary") return { text: "No AI: built-in dictionary" };
        const p = PROVIDERS[s.definer_provider] ? s.definer_provider : "claude";
        if (how === "dictionary_first") {
          return { text: s[`llm_key_${p}`] ? `Dictionary first, then ${PROVIDERS[p].short}` : "Built-in dictionary (no AI key yet)" };
        }
        return s[`llm_key_${p}`] ? { text: `AI explanations with ${PROVIDERS[p].short}` } : { text: "Needs an API key", warn: true };
      },
      listening: () => {
        const cfg = sttConfig(s);
        if (cfg.on) return { text: `${STT_PROVIDERS[cfg.provider].label} writes the transcripts` };
        if (cfg.mode === "cloud") return { text: "Cloud transcription needs a key", warn: true };
        return status.model_ready ? { text: "This computer writes the transcripts" } : { text: "Download a transcription model", warn: true };
      },
      voices: () => voiceSummary(s),
      look: () => [{ text: THEME_LINE[s.theme] || THEME_LINE.system }, { text: gameOn() ? "Game features on" : "Game features off" }],
      controller: () => controllerSummary(),
      account: async () => {
        const st = await api("/sync/status");
        if (!st.configured) return null;
        if (!st.signed_in) return { text: "Google Drive: not connected" };
        if (st.state === "error") return { text: "Last sync failed", warn: true };
        return { text: st.email ? `Google Drive: ${st.email}` : "Google Drive: connected" };
      },
      apps: async () => {
        const parts = [{ text: `Review to-do: ${TARGET_NAMES[taskTarget()]}` }];
        const st = await api("/anki/sync/status").catch(() => null);
        if (st && st.enabled) parts.unshift({ text: "Anki sync on" });
        return parts;
      },
      data: () => ({ text: `Version ${status.version}` }),
    },
  });
}

// ---------- the sections ----------

const BUILD = { languages, words, listening, voices, look, controller: controllerSection, account, apps, data };

function languages(body, status) {
  const s = status.settings;
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
        The one you're studying now is used for new transcriptions, imported web pages and word explanations.</p>
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
  return [aiSetup(body.querySelector("#definer"), { transport: (req) => api("/llm/relay", { method: "POST", body: req }) })];
}

function listening(body, status) {
  const hw = status.hardware;
  const s = status.settings;
  const engineLabel = hw.engine === "mlx" ? "mlx-whisper on the Apple GPU (Metal)"
    : hw.device === "cuda" ? "faster-whisper on the NVIDIA GPU (CUDA, float16)"
    : "faster-whisper on the CPU (int8)";
  body.append(h(`<div>
    <section class="card" id="stt"></section>
    <section class="card set-card" data-find="whisper">
      <h2>Transcription model</h2>
      <p class="small" id="model-unused" hidden></p>
      <p class="set-hint">${esc(hw.recommendation_reason)} Changing the model affects new transcriptions only; re-transcribe an episode from the library to use it there.</p>
      <div id="models"></div>
      ${moreOptions(`
        <dl class="kv small">
          <dt>Engine</dt><dd>${esc(engineLabel)}</dd>
          <dt>Hardware</dt><dd>${esc(hw.cpu)} · ${hw.cpu_cores} threads · ${hw.ram_gb} GB RAM${hw.nvidia_gpu ? ` · ${esc(hw.nvidia_gpu)}${hw.nvidia_vram_gb ? ` (${hw.nvidia_vram_gb} GB)` : ""}` : ""}</dd>
        </dl>
        <div class="stack" data-find="storage">
          <h3>Audio storage</h3>
          <label class="check"><input type="checkbox" id="delete-after" ${s.delete_audio_after ? "checked" : ""}>
            <span>Delete downloaded audio after transcription<br><span class="small muted">Saves disk space. The player then streams the audio from the podcast's server.</span></span></label>
          <label class="check"><input type="checkbox" id="stream" ${s.stream_from_source ? "checked" : ""}>
            <span>Always stream from the original URL<br><span class="small muted">Audio is downloaded only temporarily for transcription and never kept. Playback needs an internet connection.</span></span></label>
        </div>`)}
    </section>
    ${hw.gpu_pack_supported ? `<section class="card set-card" data-find="gpu"><h2>GPU acceleration</h2><div id="gpu"></div></section>` : ""}
  </div>`));
  const $ = (q) => body.querySelector(q);
  const cleanups = [modelManager($("#models"), { hardware: hw })];
  if (hw.gpu_pack_supported) cleanups.push(gpuPanel($("#gpu"), hw));
  // While a cloud provider writes the transcripts, the model below isn't used: say so there.
  const paintUnused = () => {
    const cfg = sttConfig(state.status.settings);
    $("#model-unused").hidden = !cfg.on;
    $("#model-unused").textContent = cfg.on
      ? `Not used at the moment: ${STT_PROVIDERS[cfg.provider].label} writes the transcripts (Cloud transcription, above). Nothing needs downloading here.` : "";
  };
  paintUnused();
  cleanups.push(sttSetup($("#stt"), {
    test: async (cfg) => {
      const r = await api("/stt/test", { method: "POST", body: cfg });
      if (!r.ok) throw Object.assign(new Error(r.message), { keyRejected: !!r.key_rejected });
      return r.seconds;
    },
    usage: () => api("/stt/usage"),
    onUsage: (fn) => on("stt", fn),
    changed: async () => { await loadStatus(); paintUnused(); },
    // The study language's own model (Thai's Typhoon, Bisaya's), once downloaded, writes its transcripts here.
    ownReady: async () => {
      const r = await api("/models");
      return r.models.some((m) => m.language && m.language === r.study_language && m.installed);
    },
    onOwnChange: (fn) => on("model_download", (st) => { if (st.state === "done" || st.state === "idle") fn(); }),
  }));
  $("#delete-after").onchange = (e) => saveSettings({ delete_audio_after: e.target.checked });
  $("#stream").onchange = (e) => saveSettings({ stream_from_source: e.target.checked });
  return cleanups;
}

// Card voices: who reads out cards without a recording (components/voicesetup.js); on this computer
// also its own voice models (app/voices.py).
function voices(body) {
  body.append(h(`<section class="card" id="voices"></section>`));
  return [voiceSetup(body.querySelector("#voices"), {
    words: () => api("/vocab"),
    changed: () => loadStatus(),
    computer: {
      summary: () => api("/voices"),
      download: (voice) => api("/voices/download", { method: "POST", body: { voice } }),
      cancel: () => api("/voices/cancel", { method: "POST" }),
      remove: (voice) => api(`/voices/${encodeURIComponent(voice)}`, { method: "DELETE" }),
      pick: (lang, voice) => api("/voices/pick", { method: "POST", body: { lang, voice } }),
      sampleUrl: (lang, text) => `/api/voices/sample?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}&t=${Date.now()}`,
      onChange: (fn) => {
        const offs = [on("voice_download", fn), on("voices", fn)];
        return () => offs.forEach((f) => f());
      },
    },
  })];
}

function look(body, status) {
  const s = status.settings;
  const lang = studyLanguage();
  body.append(h(`<div>
    <section class="card set-card" data-find="theme">
      <h2>Theme</h2>
      <div class="set-seg" role="radiogroup" aria-label="Theme">${Object.entries(THEMES).map(([v, name]) => `
        <label><input type="radio" name="theme" value="${v}" ${(s.theme || "system") === v ? "checked" : ""}><span>${name}</span></label>`).join("")}
      </div>
    </section>
    <section class="card set-card" data-find="textsize">
      <h2>Text size</h2>
      <p class="set-hint">For the language you're learning. The example shows how big it will be.</p>
      <div class="set-slider"><label for="font">Podcasts &amp; videos</label>
        <input type="range" id="font" min="16" max="56" step="1" value="${s.font_size}"><output id="font-val">${s.font_size}px</output></div>
      <div class="set-sample ar" ${langAttrs(lang)} style="font-size:var(--ar-size);line-height:2.1">${esc(langInfo(lang).sample)}</div>
      <div class="set-slider"><label for="page-font">Pages &amp; books</label>
        <input type="range" id="page-font" min="${PAGE_SIZE_MIN}" max="${PAGE_SIZE_MAX}" step="1" value="${pageSize(s.page_font_size)}"><output id="page-font-val">${pageSizeLabel(s.page_font_size)}</output></div>
      <div class="set-sample ar reader-sample" ${langAttrs(lang)}>${esc(langInfo(lang).pageSample)}</div>
    </section>
    <section class="card" id="game-switch" data-find="game"></section>
    <section class="card set-card" data-find="guides">
      <h2>Page guides</h2>
      <p class="set-hint">The first time you open Home, the Library, Vocab and Friends, a short guide shows what each button does.</p>
      <div class="row"><button type="button" id="guides-again">Show the guides again</button><span class="small muted" id="guides-done"></span></div>
    </section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  gameSwitch($("#game-switch"));
  $("#guides-again").onclick = () => { resetTours(); $("#guides-done").textContent = "They'll show the next time you open each page."; };
  body.querySelectorAll("input[name=theme]").forEach((r) => (r.onchange = () => saveSettings({ theme: r.value })));
  let fontTimer;
  $("#font").oninput = (e) => {
    const v = Number(e.target.value);
    $("#font-val").textContent = `${v}px`;
    document.documentElement.style.setProperty("--ar-size", `${v}px`);
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => saveSettings({ font_size: v }), 300);
  };
  let pageFontTimer;
  $("#page-font").oninput = (e) => {
    const v = pageSize(e.target.value);
    $("#page-font-val").textContent = pageSizeLabel(v);
    applyPageSize(v);
    clearTimeout(pageFontTimer);
    pageFontTimer = setTimeout(() => saveSettings({ page_font_size: v }), 300);
  };
  return [];
}

function ago(ts) {
  if (!ts) return "never";
  const s = Math.round(Date.now() / 1000 - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts * 1000).toLocaleString();
}

async function account(body) {
  body.append(h(`<section class="card set-card stack" id="sync" data-find="drive">
    <h2>Sync with Google Drive</h2>
    <p class="set-hint">Keeps your podcasts, transcripts and vocab the same on this computer, other computers and your phone.</p>
    <div id="sync-panel"></div>
    <details class="set-info"><summary>Where is it stored?</summary>Everything is stored in a private app folder in <em>your own</em>
      Google Drive that only this app can see. Sync never goes through any other server.</details>
  </section>`));
  body.append(accountSection());
  const box = body.querySelector("#sync-panel");
  function paintSync(st) {
    if (!st.configured) {
      box.innerHTML = `<p class="small" style="color:var(--warn)">Sync isn't available in this build (no Google sign-in configured).</p>`;
      return;
    }
    if (!st.signed_in) {
      box.innerHTML = `<div class="set-state"><span class="pill">Not signed in</span>
        <button type="button" class="primary" id="sync-login">Sign in with Google</button>
        <span class="small muted">Opens your web browser to sign in.</span></div>
        ${st.error ? `<p class="small" style="color:var(--danger)">${esc(st.error)}</p>` : ""}`;
      box.querySelector("#sync-login").onclick = async (e) => {
        e.target.disabled = true;
        e.target.textContent = "Waiting for Google…";
        try { await api("/sync/login", { method: "POST" }); }
        catch (err) { toast(err.message, { error: true }); e.target.disabled = false; e.target.textContent = "Sign in with Google"; }
      };
      return;
    }
    const busy = st.state === "syncing";
    const r = st.last_result;
    const wasOpen = !!box.querySelector(".set-more[open]"); // (a repaint keeps "More options" as it was)
    box.innerHTML = `
      <div class="set-state"><span class="pill done">Signed in</span> <strong>${esc(st.email || "Google account")}</strong></div>
      <div class="small ${st.state === "error" ? "" : "muted"}" style="margin-top:8px;${st.state === "error" ? "color:var(--danger)" : ""}">
        ${st.state === "error" ? `Last sync failed: ${esc(st.error)}` : `Last synced ${ago(st.last_sync)}`}
        ${r && st.state !== "error" ? ` · ${r.uploaded_transcripts} transcript(s) up, ${r.downloaded_transcripts} down, ${r.uploaded_audio} audio up` : ""}
      </div>
      <div class="set-actions">
        <button type="button" id="sync-now" ${busy ? "disabled" : ""}>${busy ? "Syncing…" : "Sync now"}</button>
        <button type="button" class="ghost danger" id="sync-logout">Sign out</button></div>
      ${moreOptions(`<label class="check"><input type="checkbox" id="sync-audio" ${st.sync_audio ? "checked" : ""}>
        <span>Upload compressed audio copies (about 12 MB per hour)<br><span class="small muted">Lets your phone and other computers
        play exactly the audio that was transcribed, so highlighting stays in sync even on podcasts that insert different ads
        per download. Uses your Google Drive storage.</span></span></label>`)}`;
    if (wasOpen) box.querySelector(".set-more").open = true;
    box.querySelector("#sync-now").onclick = async () => {
      try { paintSync(await api("/sync/now", { method: "POST" })); } catch (err) { toast(err.message, { error: true }); }
    };
    box.querySelector("#sync-logout").onclick = async () => {
      if (!(await confirmBox("Sign out of Google?", "Your library stays on this computer; it just stops syncing.",
                             { ok: "Sign out", danger: true }))) return;
      paintSync(await api("/sync/logout", { method: "POST" }));
    };
    box.querySelector("#sync-audio").onchange = async (e) => {
      paintSync(await api("/sync/settings", { method: "PATCH", body: { sync_audio: e.target.checked } }));
    };
  }
  paintSync(await api("/sync/status"));
  return [on("sync", paintSync)];
}

function apps(body) {
  body.append(h(`<div>
    <section class="card set-card" data-find="anki">
      <h2>Anki (optional)</h2>
      <p class="set-hint">For people who also study with Anki on this computer.</p>
      <div id="anki-sync" class="stack"></div>
      <div class="set-sub stack">
        <h3>The Anki add-on</h3>
        <ol class="small">
          <li>Press the button below and save the file.</li>
          <li>Double-click the saved file. Anki opens and asks to install it; say yes, then restart Anki.</li>
          <li>Review as usual with Tamkeen open. In Anki, <em>Tools → Tamkeen companion…</em> shows whether it is connected,
            and <em>Tools → Sync Tamkeen now</em> syncs the deck at once.</li>
        </ol>
        <div class="row"><button type="button" id="anki-get">Download the Anki add-on</button><span class="small muted" id="anki-status"></span></div>
        <details class="set-info"><summary>What the add-on does</summary>It tells Tamkeen how your
          reviews are going, so they count toward your creature: clearing what is due is the day's goal (whatever the number of cards),
          and cards that become mature earn a bonus. For that, only numbers are sent. With the switch above on, it also keeps that one
          deck and your saved words in step. Everything stays on this computer. If you installed the add-on before the sync existed,
          download and install it again.</details>
      </div>
    </section>
    <section class="card" id="task-target" data-find="tasks"></section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  $("#anki-get").onclick = () => download("/api/anki/addon", "Tamkeen-Anki-Companion.ankiaddon");
  const paintAnki = async () => {
    try {
      const r = await api("/anki/days");
      const todayKey = new Date().toLocaleDateString("en-CA");
      const t = (r.days || []).find((d) => d.day === todayKey);
      $("#anki-status").textContent = !r.last_report ? "No reports yet." : `Last heard from Anki ${new Date(r.last_report * 1000).toLocaleString()}`
        + (t ? ` · today: ${t.reviews} reviewed, ${t.matured} matured, ${t.due_left ?? "?"} still due` : "");
    } catch { /* the status line is optional */ }
  };
  paintAnki();
  taskTargetCard($("#task-target"));
  return [on("anki", paintAnki), ankiSyncPanel($("#anki-sync"))];
}

function data(body, status) {
  body.append(h(`<div>
    <section class="card set-card stack" data-find="backup">
      <h2>Your data</h2>
      <p class="small">Your library, transcripts, vocab, models and settings are stored in:<br><code id="data-dir"></code></p>
      <div class="row">
        <button type="button" id="open-data">Open data folder</button>
        <button type="button" id="export">Export my data</button>
        <label class="switch small"><input type="checkbox" id="export-audio"> include downloaded audio</label>
      </div>
      <div class="row">
        <button type="button" id="import">Import data…</button>
        <input type="file" id="import-file" accept=".zip,application/zip" hidden>
        <span class="small muted">Replaces your current library with a backup (.zip).</span>
      </div>
    </section>
    <section class="card set-card stack" data-find="updates">
      <h2>Updates</h2>
      <div class="row"><span>Version ${esc(status.version)}</span><span class="spacer"></span><button type="button" id="check-updates">Check for updates</button></div>
      <div id="update-result" class="small"></div>
    </section>
    <section class="card set-card stack" data-find="changelog">
      <h2>Changelog</h2>
      <div class="row"><span class="small muted">What changed in every version (in English).</span><span class="spacer"></span>
        <button type="button" id="open-changelog">Open</button></div>
    </section>
    <section class="card" id="reset-app" data-find="reset"></section>
    <section class="card set-card stack" data-find="about privacy">
      <h2>About Tamkeen</h2>
      <p class="set-hint">Tamkeen for your computer ·
        <a href="https://christiangilkey.github.io/tamkeen/privacy.html" target="_blank" rel="noopener">Privacy policy</a> ·
        <a href="https://github.com/christiangilkey/tamkeen" target="_blank" rel="noopener">Source code</a> ·
        <a href="#/about">About</a></p>
    </section>
  </div>`));
  const $ = (q) => body.querySelector(q);
  body.querySelector('[data-find~="about"]').append(licensesFold({
    list: async () => (await api("/about")).licenses,
    text: (file) => api(`/licenses/${encodeURIComponent(file)}`),
  }));
  $("#data-dir").textContent = status.data_dir;
  resetSection($("#reset-app"), async () => {
    const r = await api("/reset", { method: "POST" });
    if (!r.ok) throw new Error(r.error);
  });
  $("#open-data").onclick = async () => {
    try { await api("/system/open-data-folder", { method: "POST" }); }
    catch (e) { toast(e.message, { error: true }); }
  };
  $("#export").onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Preparing…";
    try {
      const r = await api("/backup/export", { method: "POST", body: { include_audio: $("#export-audio").checked } });
      await download(r.url, r.name);
      if (!(window.pywebview && window.pywebview.api)) toast(`Backup ready (${fmtBytes(r.size)})`);
    } catch (err) {
      toast(err.message, { error: true });
    } finally {
      e.target.disabled = false;
      e.target.textContent = "Export my data";
    }
  };
  $("#import").onclick = () => $("#import-file").click();
  $("#import-file").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!(await confirmBox("Import data?", `Import “${file.name}”? This REPLACES your current library, transcripts and vocab with the backup's contents.`,
                           { ok: "Import", danger: true }))) return;
    try {
      const r = await api("/backup/import", { method: "POST", raw: file });
      toast(`Imported. ${r.audio_files ? `${r.audio_files} audio files restored.` : ""}`);
      location.hash = "#/";
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
  $("#open-changelog").onclick = () => import("../components/changelog.js").then((m) => m.openChangelog());
  $("#check-updates").onclick = async () => {
    const box = $("#update-result");
    box.textContent = "Checking…";
    const r = await api("/updates/check");
    if (!r.ok) box.textContent = r.error;
    else if (r.update_available) {
      box.textContent = `Version ${r.latest} is available.`;
      offerUpdate(r);
    }
    else box.textContent = r.message || `You're up to date (${r.current}).`;
  };
  return [];
}
