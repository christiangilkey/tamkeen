// Settings → Listening & transcripts, on the computer and the phone: who writes the transcripts
// (the computer, or a cloud provider with the user's own key), a panel for a language with a
// listening model of its own (Thai, Bisaya: components/ownmodel.js), and, once the cloud is chosen,
// its provider, key, test, model with prices and how much audio was sent today.
//
// From the top: the choice as two big tiles, each with its one-line consequence, and its status tag;
// the language's own model and how it compares; the cloud provider's settings (only while the cloud
// is chosen), with the model and today's use under "More options"; and two small folds, "How it
// works" and "What is sent, and where is my key kept?". Plain surfaces, no banners (owner's taste).

import { esc, platform, state, saveSettings } from "../app.js";
import { icon } from "../icons.js";
import "./settingsui.js"; // (the looks of the "More options" fold, which holds the model and today's use)
import { LANGUAGES } from "../languages.js";
import { OWN_MODEL_LANGUAGES, STT_KEY_GUIDES, STT_PROVIDERS, cleanSttKey, describeAudioUse, forgetUnknownSttModels,
         hoursPerDollar, knownSttModel, perHourText, sttConfig, sttKeyProvider } from "../stt.js";
import { ownModelPanel } from "./ownmodel.js";
import { showKeyHelp } from "./keyhelp.js";
import { troubleshootButton } from "./troubleshoot.js";

/**
 * Fills `section` (the card). Each app does the sending its own way, so it hands in:
 *   test({provider, key, model})  tries the key; resolves to how many seconds the provider took,
 *                                 or throws (with `keyRejected` when the key itself was refused)
 *   usage()                       resolves to today's total (see stt.js addAudioUse)
 *   onUsage(fn)                   calls fn whenever that total changes; returns how to stop
 *   changed()                     called after a choice here has been saved
 *   ownReady()                    (the computer) resolves to whether the study language's own model is downloaded
 *   onOwnChange(fn)               (the computer) calls fn when that may have changed; returns how to stop
 * Returns what to call when the page goes away.
 */
export function sttSetup(section, { test, usage, onUsage, changed = () => {}, ownReady, onOwnChange } = {}) {
  const cur = () => state.status.settings;
  const phone = platform !== "desktop";
  const here = phone ? "this phone" : "this computer";
  const local = phone ? "My computer" : "This computer";
  section.classList.add("stt-card");
  section.innerHTML = `
    <div class="stt-top"><h2>Who writes the transcripts</h2><span id="stt-tag"></span></div>
    <div class="stt-who" role="radiogroup" aria-label="Who writes the transcripts" data-find="who">
      <label class="stt-choice"><input type="radio" name="stt-mode" value="local">
        <span class="stt-choice-ico">${icon("computer", 26)}</span>
        <strong>${local}</strong><span class="stt-choice-line">${phone ? "Free. Transcripts arrive when it next syncs." : "Free. Uses the model chosen below."}</span></label>
      <label class="stt-choice"><input type="radio" name="stt-mode" value="cloud">
        <span class="stt-choice-ico">${icon("cloud", 26)}</span>
        <strong>A cloud provider</strong><span class="stt-choice-line">${phone ? "Starts at once, on this phone. A few cents an hour." : "No strong computer needed. A few cents an hour."}</span></label>
    </div>
    <div id="stt-own"></div>
    <div class="stt-cloud" id="stt-fields">
      <h3>Cloud transcription</h3>
      <div class="ai-setup">
      <div class="ai-field ai-wide" data-find="sttkey"><label for="stt-provider">Provider</label>
        <select id="stt-provider">${Object.entries(STT_PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></div>
      <div class="ai-field ai-wide"><label for="stt-key">API key</label>
        <div class="ai-key" id="stt-keyrow">
          <input type="password" id="stt-key" autocomplete="off" spellcheck="false" placeholder="Paste your API key here">
          <button type="button" class="ghost" id="stt-show">Show</button>
        </div>
        <span class="small" id="stt-key-note" role="status"></span></div>
      <div class="ai-wide stt-buttons">
        <button type="button" id="stt-test">Test the key</button>
        <a class="btn key-get" id="stt-get" target="_blank" rel="noopener"></a>
        <button type="button" class="ghost" id="stt-stuck">I'm stuck</button>
      </div>
      <div class="ai-wide small" id="stt-test-result" role="status"></div>
      <div class="ai-wide small stt-limit" id="stt-limit" role="note" hidden></div>
      </div>
      <details class="set-more"><summary>${icon("chevron", 16)}<span>More options</span></summary>
      <div class="set-more-body ai-more">
        <div class="ai-field"><span class="ai-label" id="stt-model-label">Model</span>
          <div class="stt-models" role="radiogroup" aria-labelledby="stt-model-label" id="stt-model-list"></div>
          <p class="small muted stt-per-dollar" id="stt-per-dollar"></p>
          <details class="set-info"><summary>How pricing works</summary><p>You pay for the length of the audio, not for how long the work takes: an hour-long
            episode costs the hourly price, a one-minute reel a sixtieth of it. Prices are from each provider's price list.</p></details>
        </div>
        <div class="ai-use small muted">Audio sent today from ${here}: <strong id="stt-use">0 min</strong>
          <span id="stt-use-detail"></span></div>
      </div></details>
    </div>
    <div class="stt-folds">
      <details class="set-info"><summary>How it works</summary><p>${phone
        ? "Normally your computer writes the transcripts and they arrive here by sync. A cloud provider can write them instead, straight from this phone, so nothing waits for the computer."
        : "Writing a transcript needs a strong computer, most of all for Arabic. If yours is slow, a cloud provider can write the transcripts instead."}
        You use your own key and pay them directly, a few cents per hour of audio.</p></details>
      <details class="set-info"><summary>What is sent, and where is my key kept?</summary>The audio of what you transcribe goes to the provider you choose
        (${phone ? "the episode's file, or a reel's video" : "only the parts with speech in them"}), and nowhere else. Nothing else about you or your library is sent.
        Your key is kept on ${here} and, if you use Google Drive sync, in the app's private folder in your own Google Drive, so your other devices have it too. It is never part of a data export.</details>
    </div>`;
  const $ = (q) => section.querySelector(q);
  const prov = () => $("#stt-provider").value;
  const borrowed = () => prov() === "openai" && !cur().stt_key_openai && !!cur().llm_key_openai;
  $("#stt-provider").value = STT_PROVIDERS[cur().stt_provider] ? cur().stt_provider : "groq";
  let model = "";
  let refused = false; // the last test said the key itself doesn't work
  let ready = false;   // (the computer) the study language's own model is downloaded

  // "Optional" while the computer does the work; "In use" once a provider is chosen and has a key.
  function paintState() {
    const cfg = sttConfig(cur());
    const cloud = cfg.mode === "cloud";
    section.querySelectorAll("input[name=stt-mode]").forEach((r) => {
      r.checked = r.value === cfg.mode;
      r.disabled = cfg.blocked && r.value === "cloud"; // (a language with a model of its own: see paintOwn)
    });
    $("#stt-fields").hidden = !cloud;
    const tag = $("#stt-tag");
    tag.className = refused && cloud ? "req-tag" : cfg.on ? "pill done" : cloud ? "req-tag" : "pill";
    tag.textContent = cfg.blocked ? "Off for this language" : refused && cloud ? "Key not working" : cfg.on ? "✓ In use" : cloud ? "Needs a key" : "Optional";
    const info = STT_PROVIDERS[prov()];
    const has = !!cur()[`stt_key_${prov()}`] || borrowed();
    $("#stt-keyrow").classList.toggle("need", cloud && (!has || refused));
    $("#stt-get").textContent = has ? "Get a new key ↗" : `Get your ${info.short} API key ↗`;
    $("#stt-get").href = info.keyUrl;
    // On the phone, what the chosen provider does with a big episode that isn't an MP3 (the computer
    // re-encodes everything it sends, so it has no such limit).
    $("#stt-limit").hidden = !phone || !info.phoneLimit;
    $("#stt-limit").textContent = phone ? info.phoneLimit || "" : "";
    $("#stt-key").placeholder = borrowed() ? "Using your OpenAI key from Word definitions (or paste another)" : "Paste your API key here";
  }

  // A language with a listening model of its own (Thai, Bisaya): what it is and how it compares with
  // the cloud, under the choice. For a language no provider knows (Bisaya) the cloud tile is greyed out
  // and the panel says why; the saved choice is kept for other languages.
  function paintOwn() {
    const lang = cur().study_language;
    const box = $("#stt-own");
    const open = [...box.querySelectorAll("details")].map((d) => d.open);
    box.innerHTML = ownModelPanel(lang, { phone, ready, blockedText: sttConfig(cur()).blocked ? blockedText(lang) : "" });
    box.querySelectorAll("details").forEach((d, i) => { d.open = !!open[i]; });
  }
  function blockedText(lang) {
    const name = LANGUAGES[lang]?.name || lang;
    const short = name.replace(/\s*\(.*\)$/, ""); // "Bisaya (Cebuano)" once, then "Bisaya"
    const instead = OWN_MODEL_LANGUAGES[lang];
    return phone
      ? `Not for ${name}: online speech services don't know it, so they fail or write ${instead} instead. Your computer writes ${short} transcripts, with the ${short} model downloaded there (Settings → Listening & transcripts → Transcription model), and they arrive here when it next syncs. Your cloud choice is kept for when you learn another language.`
      : `Not for ${name}: online speech services don't know it, so they fail or write ${instead} instead. This computer writes ${short} transcripts itself, best with the ${short} model (Transcription model, just below). Your cloud choice is kept for when you learn another language.`;
  }
  const checkOwn = () => Promise.resolve(ownReady ? ownReady() : false)
    .then((r) => { if (!!r !== ready) { ready = !!r; paintOwn(); } }).catch(() => {});

  // ----- the provider's models: a short list with prices, the recommended one first -----
  function paintModel() {
    const info = STT_PROVIDERS[prov()];
    const m = info.models.find((x) => x.id === model) || info.models[0];
    $("#stt-model-list").innerHTML = info.models.map((x) => `
      <label class="stt-model"><input type="radio" name="stt-model" value="${esc(x.id)}" ${x.id === model ? "checked" : ""}>
        <span class="stt-model-text"><span class="stt-model-name">${esc(x.name)}${x.id === info.defaultModel ? ` <span class="badge">Recommended</span>` : ""}</span>
          <span class="small muted">${esc(x.note)}</span></span>
        <span class="model-price">${esc(perHourText(x))}</span></label>`).join("");
    $("#stt-per-dollar").textContent = `With ${m.name}, one dollar buys about ${hoursPerDollar(m)} hours of audio.`;
    section.querySelectorAll("input[name=stt-model]").forEach((r) => {
      r.onchange = async () => {
        if (!r.checked) return;
        model = r.value;
        paintModel();
        await saveModel(model);
      };
    });
  }
  const save = async (values) => { await saveSettings(values); await changed(); };
  // "" = the recommended model, so a later version of the app can recommend a better one.
  const saveModel = (id) => save({ [`stt_model_${prov()}`]: id === STT_PROVIDERS[prov()].defaultModel ? "" : id });

  function paintProvider() {
    const p = prov();
    model = knownSttModel(p, cur()[`stt_model_${p}`]);
    $("#stt-key").value = cur()[`stt_key_${p}`] || "";
    $("#stt-test-result").textContent = "";
    $("#stt-key-note").textContent = "";
    refused = false;
    paintModel();
    paintState();
  }
  paintProvider();
  paintOwn();
  checkOwn();
  const offOwn = onOwnChange ? onOwnChange(checkOwn) : () => {};
  // A model name typed in by hand under the old "Another model…" choice goes back to the recommended one.
  const unknown = forgetUnknownSttModels(cur());
  if (unknown) save(unknown).catch(() => {});

  section.querySelectorAll("input[name=stt-mode]").forEach((r) => {
    r.onchange = async () => {
      if (!r.checked) return;
      await save({ stt_mode: r.value });
      paintState();
      if (r.value === "cloud" && !sttConfig(cur()).key) $("#stt-key").focus();
    };
  });
  $("#stt-provider").onchange = async () => { await save({ stt_provider: prov() }); paintProvider(); };

  // The key is saved as soon as it is pasted or typed, tidied of anything that came along with
  // it, and filed under the provider it belongs to (a Groq key pasted with OpenAI selected
  // switches the provider rather than failing later).
  let keyTimer = 0;
  async function keyEntered() {
    clearTimeout(keyTimer);
    const input = $("#stt-key");
    const key = cleanSttKey(input.value);
    if (key !== input.value) input.value = key;
    const note = $("#stt-key-note");
    const owner = key.length >= 20 ? sttKeyProvider(key) : "";
    if (key === (cur()[`stt_key_${owner || prov()}`] || "") && (!owner || owner === prov())) return; // nothing new
    refused = false;
    try {
      if (owner && owner !== prov()) {
        $("#stt-provider").value = owner;
        await save({ stt_provider: owner, [`stt_key_${owner}`]: key });
        paintProvider();
        note.textContent = `That is a ${STT_PROVIDERS[owner].short} key, so the provider is now ${STT_PROVIDERS[owner].label}. Saved: press “Test the key” to check it.`;
      } else if (key.startsWith("sk-ant-") || key.startsWith("xai-") || key.startsWith("AIza")) {
        note.textContent = "That key is for Word definitions, not for transcription. Groq keys start with gsk_.";
        note.style.color = "var(--danger)";
        return;
      } else {
        await save({ [`stt_key_${prov()}`]: key });
        paintState();
        note.textContent = key ? "Saved. Press “Test the key” to check it." : borrowed() ? "Using your OpenAI key from Word definitions." : "Key removed.";
      }
      note.style.color = "var(--accent)";
    } catch (err) {
      note.textContent = `The key couldn't be saved: ${err.message}`;
      note.style.color = "var(--danger)";
    }
  }
  $("#stt-key").addEventListener("input", (e) => {
    clearTimeout(keyTimer);
    if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") keyEntered(); // a paste: straight away
    else keyTimer = setTimeout(keyEntered, 600);                                             // typing: once it pauses
  });
  $("#stt-key").addEventListener("change", keyEntered);
  $("#stt-stuck").onclick = () => showKeyHelp(prov(), { providers: STT_PROVIDERS, guides: STT_KEY_GUIDES,
                                                      used: "send audio to a transcription service, which writes down what is said" });
  $("#stt-show").onclick = (e) => {
    const k = $("#stt-key");
    k.type = k.type === "password" ? "text" : "password";
    e.target.textContent = k.type === "password" ? "Show" : "Hide";
  };

  $("#stt-test").onclick = async (e) => {
    const out = $("#stt-test-result");
    e.target.disabled = true;
    await keyEntered(); // (a key typed a moment ago is saved, and filed under its provider, first)
    $("#stt-key-note").textContent = "";
    out.textContent = "Sending one second of silence…";
    out.style.color = "";
    const info = STT_PROVIDERS[prov()];
    try {
      const seconds = await test({ provider: prov(), key: sttConfig(cur()).key, model });
      refused = false;
      out.textContent = `✓ Works (${info.label} answered in ${Number(seconds).toFixed(1)} s). ${phone
        ? "“Transcribe” on this phone now starts straight away." : "New transcriptions will be written by " + info.label + "."}`;
      out.style.color = "var(--accent)";
    } catch (err) {
      out.textContent = err.message;
      out.style.color = "var(--danger)";
      const fix = troubleshootButton(err, { service: "stt" });
      if (fix) out.append(" ", fix);
      refused = !!err.keyRejected; // a refused key: not "in use" after all, and the key row is framed again
    } finally {
      e.target.disabled = false;
      paintState();
    }
  };

  // ----- audio sent today: a running total, moving as pieces are sent -----
  const paintUse = (total) => {
    const use = describeAudioUse(total);
    $("#stt-use").textContent = use.length;
    $("#stt-use-detail").textContent = `(${use.detail})`;
  };
  Promise.resolve(usage ? usage() : null).then(paintUse).catch(() => {});
  const offUsage = onUsage ? onUsage(paintUse) : () => {};

  /** Call when the page goes away. */
  return () => {
    clearTimeout(keyTimer);
    offUsage();
    offOwn();
  };
}
