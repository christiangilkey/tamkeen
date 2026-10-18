// Settings: model, GPU, audio storage, appearance, data backup, updates.

import { taskTargetCard } from "../components/tasktarget.js";
import { api, esc, h, on, toast, download, loadStatus, saveSettings, fmtBytes, state, offerUpdate } from "../app.js";
import { modelManager, gpuPanel } from "../components/models.js";
import { aiSetup } from "../components/aisetup.js";
import { sttSetup } from "../components/sttsetup.js";
import { STT_PROVIDERS, sttConfig } from "../stt.js";
import { commonWordsButton } from "../commonwords.js";
import { accountSection } from "../components/account.js";
import { ankiSyncPanel } from "../components/ankisync.js";
import { gameSwitch } from "../components/gameswitch.js";
import { languagePicker, speakPicker } from "../components/langpicker.js";
import { chooseUiLanguage } from "../components/onboarding.js";
import { isUiLanguage } from "../i18n.js";
import { dictionariesRow } from "../lexicon/seen.js";
import { vowelsRow } from "../vowels.js";
import { readingsRow } from "../lexicon/readings.js";
import { resetSection } from "../components/resetapp.js";
import { LANGUAGES, langAttrs, langInfo, studyLanguage } from "../languages.js";

export async function render(view) {
  const status = await loadStatus();
  const hw = status.hardware;
  const s = status.settings;
  const engineLabel = hw.engine === "mlx" ? "mlx-whisper on the Apple GPU (Metal)"
    : hw.device === "cuda" ? "faster-whisper on the NVIDIA GPU (CUDA, float16)"
    : "faster-whisper on the CPU (int8)";

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
      <p class="small muted">Used for new transcriptions, imported web pages and word explanations.
        Things you already transcribed keep the language they were made in.</p>
    </section>

    <section class="card" id="stt"></section>

    <section class="card">
      <h2>Transcription model</h2>
      <p class="small" id="model-unused" hidden></p>
      <dl class="kv small" style="margin-bottom:10px">
        <dt>Engine</dt><dd>${esc(engineLabel)}</dd>
        <dt>Hardware</dt><dd>${esc(hw.cpu)} · ${hw.cpu_cores} threads · ${hw.ram_gb} GB RAM${hw.nvidia_gpu ? ` · ${esc(hw.nvidia_gpu)}${hw.nvidia_vram_gb ? ` (${hw.nvidia_vram_gb} GB)` : ""}` : ""}</dd>
      </dl>
      <p class="small muted">${esc(hw.recommendation_reason)} Changing the model affects new transcriptions only; re-transcribe an episode from the library to use it there.</p>
      <div id="models"></div>
    </section>

    ${hw.gpu_pack_supported ? `<section class="card"><h2>GPU acceleration</h2><div id="gpu"></div></section>` : ""}

    <section class="card stack" id="sync">
      <h2>Sync with Google Drive</h2>
      <p class="small muted">Keep your podcasts, transcripts and vocab in sync between this computer, other computers
        and the Android app. Everything is stored in a private app folder in <em>your own</em> Google Drive that only
        this app can see. Sync never goes through any other server.</p>
      <div id="sync-panel"></div>
    </section>

    <section class="card stack">
      <h2>Anki (optional)</h2>
      <div id="anki-sync" class="stack"></div>
      <h3 style="margin:8px 0 0">The Anki add-on</h3>
      <p class="small muted">If you study with Anki on this computer, a small add-on connects it to Tamkeen. It tells Tamkeen how your
        reviews are going, so they count toward your creature: clearing what is due is the day's goal (whatever the number of cards),
        and cards that become mature earn a bonus. For that, only numbers are sent. With the switch above on, it also keeps that one
        deck and your saved words in step. Everything stays on this computer. If you installed the add-on before the sync existed,
        download and install it again.</p>
      <ol class="small">
        <li>Press the button below and save the file.</li>
        <li>Double-click the saved file. Anki opens and asks to install it; say yes, then restart Anki.</li>
        <li>Review as usual with Tamkeen open. In Anki, <em>Tools → Tamkeen companion…</em> shows whether it is connected,
          and <em>Tools → Sync Tamkeen now</em> syncs the deck at once.</li>
      </ol>
      <div class="row"><button type="button" id="anki-get">Download the Anki add-on</button><span class="small muted" id="anki-status"></span></div>
    </section>

    <section class="card stack">
      <h2>Audio storage</h2>
      <label class="check"><input type="checkbox" id="delete-after" ${s.delete_audio_after ? "checked" : ""}>
        <span>Delete downloaded audio after transcription<br><span class="small muted">Saves disk space. The player then streams the audio from the podcast's server.</span></span></label>
      <label class="check"><input type="checkbox" id="stream" ${s.stream_from_source ? "checked" : ""}>
        <span>Always stream from the original URL<br><span class="small muted">Audio is downloaded only temporarily for transcription and never kept. Playback needs an internet connection.</span></span></label>
    </section>

    <section class="card stack">
      <h2>Appearance</h2>
      <div class="row">Theme:
        <label class="switch"><input type="radio" name="theme" value="system" ${s.theme === "system" ? "checked" : ""}> System</label>
        <label class="switch"><input type="radio" name="theme" value="light" ${s.theme === "light" ? "checked" : ""}> Light</label>
        <label class="switch"><input type="radio" name="theme" value="dark" ${s.theme === "dark" ? "checked" : ""}> Dark</label>
      </div>
      <div class="row">Podcast &amp; video text size:
        <input type="range" id="font" min="16" max="56" step="1" value="${s.font_size}" style="width:220px">
        <span id="font-val">${s.font_size}px</span>
      </div>
      <div class="ar" ${langAttrs(studyLanguage())} style="font-size:var(--ar-size);line-height:2.1">${esc(langInfo(studyLanguage()).sample)}</div>
      <div class="row">Web page text size:
        <input type="range" id="page-font" min="12" max="40" step="1" value="${s.page_font_size || 17}" style="width:220px">
        <span id="page-font-val">${s.page_font_size || 17}px</span>
      </div>
      <div class="ar" ${langAttrs(studyLanguage())} style="font-size:var(--page-size);line-height:2">${esc(langInfo(studyLanguage()).pageSample)}</div>
    </section>

    <section class="card" id="game-switch"></section>

    <section class="card" id="task-target"></section>

    <section class="card stack">
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

    <section class="card stack">
      <h2>Updates</h2>
      <div class="row"><span>Version ${esc(status.version)}</span><button type="button" id="check-updates">Check for updates</button></div>
      <div id="update-result" class="small"></div>
    </section>

    <section class="card" id="reset-app"></section>
  </div>`));

  const $ = (q) => view.querySelector(q);
  $("#sync").after(accountSection());
  $("#data-dir").textContent = status.data_dir;
  resetSection($("#reset-app"), async () => {
    const r = await api("/reset", { method: "POST" });
    if (!r.ok) throw new Error(r.error);
  });
  const cleanups = [modelManager($("#models"), { hardware: hw })];
  if (hw.gpu_pack_supported) cleanups.push(gpuPanel($("#gpu"), hw));

  // ----- Google Drive sync -----
  function ago(ts) {
    if (!ts) return "never";
    const s = Math.round(Date.now() / 1000 - ts);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return new Date(ts * 1000).toLocaleString();
  }
  function paintSync(st) {
    const box = $("#sync-panel");
    if (!st.configured) {
      box.innerHTML = `<p class="small" style="color:var(--warn)">Sync isn't available in this build (no Google sign-in configured).</p>`;
      return;
    }
    if (!st.signed_in) {
      box.innerHTML = `<div class="row"><button type="button" class="primary" id="sync-login">Sign in with Google</button>
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
    box.innerHTML = `
      <div class="row"><span class="pill done">Signed in</span> <strong>${esc(st.email || "Google account")}</strong>
        <span class="spacer"></span>
        <button type="button" id="sync-now" ${busy ? "disabled" : ""}>${busy ? "Syncing…" : "Sync now"}</button>
        <button type="button" class="ghost danger" id="sync-logout">Sign out</button></div>
      <div class="small ${st.state === "error" ? "" : "muted"}" style="${st.state === "error" ? "color:var(--danger)" : ""}">
        ${st.state === "error" ? `Last sync failed: ${esc(st.error)}` : `Last synced ${ago(st.last_sync)}`}
        ${r && st.state !== "error" ? ` · ${r.uploaded_transcripts} transcript(s) up, ${r.downloaded_transcripts} down, ${r.uploaded_audio} audio up` : ""}
      </div>
      <label class="check"><input type="checkbox" id="sync-audio" ${st.sync_audio ? "checked" : ""}>
        <span>Upload compressed audio copies (about 12 MB per hour)<br><span class="small muted">Lets your phone and other computers
        play exactly the audio that was transcribed, so highlighting stays in sync even on podcasts that insert different ads
        per download. Uses your Google Drive storage.</span></span></label>`;
    box.querySelector("#sync-now").onclick = async () => {
      try { paintSync(await api("/sync/now", { method: "POST" })); } catch (err) { toast(err.message, { error: true }); }
    };
    box.querySelector("#sync-logout").onclick = async () => {
      if (!confirm("Sign out of Google? Your library stays on this computer; it just stops syncing.")) return;
      paintSync(await api("/sync/logout", { method: "POST" }));
    };
    box.querySelector("#sync-audio").onchange = async (e) => {
      paintSync(await api("/sync/settings", { method: "PATCH", body: { sync_audio: e.target.checked } }));
    };
  }
  paintSync(await api("/sync/status"));
  cleanups.push(on("sync", paintSync));

  // ----- AI definitions -----
  cleanups.push(aiSetup($("#definer"), { transport: (req) => api("/llm/relay", { method: "POST", body: req }) }));
  $("#ui-lang").append(speakPicker(isUiLanguage(s.ui_language) ? s.ui_language : "en", async (code) => {
    // redrawn either way: the languages to learn leave this one out, and a failed change shows the old one
    try { await chooseUiLanguage(code); } finally { window.dispatchEvent(new HashChangeEvent("hashchange")); }
  }));
  $("#study-lang").append(languagePicker(s.study_language, async (code) => {
    await saveSettings({ study_language: code });
    toast(`Now learning ${LANGUAGES[code].name}`);
    window.dispatchEvent(new HashChangeEvent("hashchange")); // redraw the examples on this page
  }, { speaks: isUiLanguage(s.ui_language) ? s.ui_language : "en" }), commonWordsButton(studyLanguage()), dictionariesRow(studyLanguage()), vowelsRow(studyLanguage()));
  $("#study-lang").append(readingsRow(studyLanguage())); // Japanese and Chinese: furigana, pinyin, characters

  // ----- cloud transcription -----
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
  }));

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
  cleanups.push(on("anki", paintAnki));
  cleanups.push(ankiSyncPanel($("#anki-sync")));
  gameSwitch($("#game-switch"));
  taskTargetCard($("#task-target"));

  $("#delete-after").onchange = (e) => saveSettings({ delete_audio_after: e.target.checked });
  $("#stream").onchange = (e) => saveSettings({ stream_from_source: e.target.checked });
  view.querySelectorAll("input[name=theme]").forEach((r) => (r.onchange = () => saveSettings({ theme: r.value })));
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
    const v = Number(e.target.value);
    $("#page-font-val").textContent = `${v}px`;
    document.documentElement.style.setProperty("--page-size", `${v}px`);
    clearTimeout(pageFontTimer);
    pageFontTimer = setTimeout(() => saveSettings({ page_font_size: v }), 300);
  };

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
    if (!confirm(`Import “${file.name}”? This REPLACES your current library, transcripts and vocab with the backup's contents.`)) return;
    try {
      const r = await api("/backup/import", { method: "POST", raw: file });
      toast(`Imported. ${r.audio_files ? `${r.audio_files} audio files restored.` : ""}`);
      location.hash = "#/";
    } catch (err) {
      toast(err.message, { error: true });
    }
  };
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

  return () => cleanups.forEach((f) => f());
}
