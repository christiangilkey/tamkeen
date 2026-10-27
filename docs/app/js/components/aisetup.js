// The "How words are explained" card (Settings → Word definitions), on the computer and the phone: which
// provider, getting a key from it, the key itself, which model the key is used with, and a test.
// It is marked "Required" until there is a key, because nothing explains a word without it. In view:
// AI or No AI, the provider, the key and a test. Under "More options" (most people never change
// them): the model, the language words are explained in, today's tokens, and the review card's
// Mnemonic maker with its own model and thinking level (it uses the same key).
// Above it all, three choices: AI (strongly recommended); No AI: the built-in dictionary
// (meanings.js), downloaded per language, which gives a word's usual meanings but not the one in
// its sentence; and between them the dictionary first, with the AI for the words it doesn't have
// (definer.dictionaryFirst), which shows both the download row and the key settings.

import { esc, h, platform, state, saveSettings } from "../app.js";
import { LOOKUPS_PER_MILLION, PROVIDERS, SAME_MODEL, THINKING, askJson, askMnemonicJson, centsPerMillion, cleanKey, define, definerModeOf,
  keyProvider, mnemonicCents, mnemonicConfig, modelFor, thinkingFor } from "../definer.js";
import { langInfo, studyLanguage } from "../languages.js";
import { downloadMeanings, meaningsStatus, removeMeanings } from "../meanings.js";
import { UI_LANGUAGES, uiLanguage } from "../i18n.js";
import { makeMnemonics, syllableLine } from "../review/mnemonic.js";
import { TOKENS_EVENT, describeUsage, tokensToday } from "../tokenuse.js";
import { icon } from "../icons.js";
import "./settingsui.js"; // (the looks of the "More options" fold)
import { showKeyHelp } from "./keyhelp.js";
import { troubleshootButton } from "./troubleshoot.js";

const OTHER = "__other__";
const price = (m) => `${centsPerMillion(m).toLocaleString()}¢ per million tokens`;

/** Fills `section` (the card). `transport` sends one request to a provider (each app has its own
 * way: see definer.define). */
export function aiSetup(section, { transport }) {
  const cur = () => state.status.settings;
  const here = platform === "desktop" ? "this computer" : window.TAMKEEN_WEB === true ? "this browser" : "this phone";
  section.classList.add("ai-card");
  section.innerHTML = `
    <div class="ai-head"><h2>How words are explained</h2><span id="def-tag"></span></div>
    <div class="small muted ai-about">Tap a word to see what it means <em>in that sentence</em>. An AI provider writes the
      explanation, using your own key; you pay them directly, a fraction of a cent a word.
      <details><summary>What is sent, and where is my key kept?</summary>The word, its sentence and the sentences either
        side go to the provider you choose, and nowhere else. Your key is kept on ${here} and, if you use Google Drive sync, in the app's private folder in your own Google Drive, so your other devices have it too. It is never part of a data export.</details></div>
    <div class="def-modes" role="radiogroup" aria-label="How words are explained" data-find="mode">
      <label class="def-mode def-mode-ai">
        <span class="def-mode-row"><input type="radio" name="def-mode" value="ai">
          <span><strong>AI explanations</strong>
          <span class="small muted">The meaning in <em>this</em> sentence, its grammar and a translation. Needs an API key:
            a fraction of a cent a word (Gemini has a free allowance).</span></span></span>
      </label>
      <label class="def-mode def-mode-first">
        <span class="def-mode-row"><input type="radio" name="def-mode" value="dictionary_first">
          <span><strong>Dictionary first, AI when it has nothing <span class="badge">Recommended</span></strong>
          <span class="small muted">The built-in dictionary explains the words it has, free; your AI key is used only for the rest.</span></span></span>
      </label>
      <label class="def-mode def-mode-dict">
        <span class="def-mode-row"><input type="radio" name="def-mode" value="dictionary">
          <span><strong>No AI: built-in dictionary</strong>
          <span class="small muted">Free, and works offline. A word's usual meanings, but not which one fits the sentence.</span></span></span>
      </label>
    </div>
    <div class="def-dict" hidden>
      <div class="def-warn"><strong>AI explanations are strongly recommended.</strong> Real speech is full of words whose meaning
        depends on the sentence, slang and dialect a dictionary doesn't have, and transcription mistakes. With No AI you see
        a list of possible meanings and have to guess which one is meant.
        <button type="button" class="primary" id="def-to-ai">Use AI explanations</button></div>
      <div class="def-dict-row small" id="def-dict-row"></div>
    </div>
    <div class="ai-setup">
      <div class="ai-field ai-wide" data-find="key"><label for="def-provider">Provider</label>
        <select id="def-provider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></div>
      <div class="ai-field ai-wide"><label for="def-key">API key</label>
        <div class="ai-key" id="def-keyrow">
          <input type="password" id="def-key" autocomplete="off" spellcheck="false" placeholder="Paste your API key here">
          <button type="button" class="ghost" id="def-show">Show</button>
          <a class="btn key-get" id="def-get" target="_blank" rel="noopener"></a>
          <button type="button" id="def-stuck">I'm stuck</button>
        </div>
        <span class="small" id="def-key-note" role="status"></span></div>
      <div class="ai-field ai-test ai-wide"><button type="button" id="def-test">Test with an example</button></div>
      <div class="ai-wide small" id="def-test-result" role="status"></div>
      <details class="set-more ai-wide"><summary>${icon("chevron", 16)}<span>More options</span></summary>
      <div class="set-more-body ai-more">
      <div class="ai-more-row">
        <div class="ai-field" data-find="aimodel"><span class="ai-label" id="def-model-label">Model</span>
          <div class="model-pick">
            <button type="button" class="model-btn" id="def-model" aria-haspopup="listbox" aria-expanded="false"></button>
            <div class="model-menu" id="def-model-menu" hidden>
              <div class="model-banner">1 million tokens ≈ ${LOOKUPS_PER_MILLION} definitions</div>
              <div role="listbox" aria-labelledby="def-model-label" id="def-model-list"></div>
              <div class="model-foot small muted">Tokens are the word-pieces an AI reads and writes. Prices are estimates
                for the mix a definition uses, from each provider's price list.</div>
            </div>
          </div>
          <input type="text" id="def-model-other" spellcheck="false" autocomplete="off" placeholder="Model name, exactly as the provider writes it" hidden></div>
        <div class="ai-field" data-find="explain"><label for="def-lang">Explain in</label>
          <input type="text" id="def-lang"></div>
      </div>
      <div class="ai-use small muted" data-find="usage">Tokens used today on ${here}: <strong id="def-use">0</strong>
        <span id="def-use-detail"></span></div>
      <div class="ai-mnemo" data-find="mnemonic">
        <div class="ai-mnemo-head"><strong>Mnemonic maker</strong>
          <span class="small muted">The sound-alike words on the back of a review card, each with a picture for the meaning. It uses the same key; less thinking answers sooner.</span></div>
        <div class="ai-mnemo-row">
          <div class="ai-field"><label for="mn-model">Model</label><select id="mn-model"></select></div>
          <div class="ai-field" id="mn-think-field"><label for="mn-think">Thinking</label>
            <select id="mn-think">${THINKING.map((t) => `<option value="${t.id}">${esc(t.name)}${t.note ? ` (${esc(t.note)})` : ""}</option>`).join("")}</select></div>
          <div class="ai-field ai-test"><button type="button" id="mn-test">Try it</button></div>
        </div>
        <div class="small muted" id="mn-note"></div>
        <div class="small muted" id="mn-cost"></div>
        <div class="small" id="mn-test-result" role="status"></div>
      </div>
      </div></details>
    </div>`;
  const $ = (q) => section.querySelector(q);
  const prov = () => $("#def-provider").value;
  $("#def-provider").value = PROVIDERS[cur().definer_provider] ? cur().definer_provider : "claude";
  $("#def-lang").value = cur().definer_language || "English";
  let model = ""; // the chosen model's name, or OTHER while one is being typed in

  // ----- AI or No AI -----
  const mode = () => definerModeOf(cur());
  function paintMode() {
    const dict = mode() === "dictionary";
    const first = mode() === "dictionary_first";
    for (const r of section.querySelectorAll("input[name=def-mode]")) r.checked = r.value === mode();
    section.querySelector(".def-mode-ai").classList.toggle("on", mode() === "ai");
    section.querySelector(".def-mode-first").classList.toggle("on", first);
    section.querySelector(".def-mode-dict").classList.toggle("on", dict);
    $(".def-dict").hidden = !dict && !first;
    $(".def-warn").hidden = first;
    $(".ai-setup").hidden = dict;
    if (dict) paintDict(); else paintKey();
  }
  // The built-in dictionary of the language being learned: here, or a button to download it.
  async function paintDict() {
    if (mode() === "dictionary") { // (with Dictionary first, the tag is the key's: see paintKey)
      $("#def-tag").className = "pill";
      $("#def-tag").textContent = "No AI";
    }
    const lang = studyLanguage();
    const name = langInfo(lang).name || lang;
    const row = $("#def-dict-row");
    let st;
    try { st = await meaningsStatus(lang); } catch (err) { row.textContent = err.message; return; }
    const mb = Math.max(1, Math.round((st.bytes || 0) / 1e6));
    row.innerHTML = st.installed
      ? `<span>✓ The ${esc(name)} dictionary is on ${here} (${mb} MB).</span> <button type="button" class="ghost" data-act="remove">Remove</button>`
      : mode() === "dictionary_first" && cur()[`llm_key_${prov()}`] ? `<span>The ${esc(name)} dictionary isn't on ${here} yet, so every word goes to the AI.</span>
         <button type="button" class="primary" data-act="get">Download (about ${mb} MB)</button>`
      : `<span>The ${esc(name)} dictionary isn't on ${here} yet, so tapped words can't be explained.</span>
         <button type="button" class="primary" data-act="get">Download (about ${mb} MB)</button>`;
  }
  $("#def-dict-row").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    b.disabled = true;
    const lang = studyLanguage();
    try {
      if (b.dataset.act === "get") { b.textContent = "Downloading…"; await downloadMeanings(lang); }
      else await removeMeanings(lang);
    } catch (err) {
      $("#def-dict-row").append(Object.assign(document.createElement("div"), { className: "wb-error", textContent: err.message }));
      b.disabled = false;
      return;
    }
    paintDict();
  });
  for (const r of section.querySelectorAll("input[name=def-mode]")) {
    r.onchange = async () => {
      await saveSettings({ definer_mode: r.value });
      paintMode();
      if (r.value !== "ai") { // straight away, so the next tapped word has its meaning
        const st = await meaningsStatus(studyLanguage()).catch(() => null);
        if (st && !st.installed) $("#def-dict-row button[data-act=get]")?.click();
      }
    };
  }
  $("#def-to-ai").onclick = async () => { await saveSettings({ definer_mode: "ai" }); paintMode(); };

  // "Required" until the chosen provider has a key; the way to a key is loud until then.
  function paintKey() {
    if (mode() === "dictionary") return;
    const info = PROVIDERS[prov()];
    const has = !!cur()[`llm_key_${prov()}`];
    // Dictionary first works without a key: it is the dictionary alone until one is added.
    const first = mode() === "dictionary_first";
    if (first) paintDict(); // its download row
    $("#def-tag").className = has ? "pill done" : first ? "pill" : "req-tag";
    $("#def-tag").textContent = has ? "✓ Set up" : first ? "Dictionary only" : "Required";
    $("#def-keyrow").classList.toggle("need", !has);
    $("#def-get").textContent = has ? "Get a new key ↗" : `Get your ${info.short} API key ↗`;
    $("#def-get").href = info.keyUrl;
  }

  // ----- the model list: a menu of our own, so it can carry the banner and the prices -----
  const menu = $("#def-model-menu");
  const button = $("#def-model");
  function paintModel() {
    const info = PROVIDERS[prov()];
    const m = info.models.find((x) => x.id === model);
    button.innerHTML = m
      ? `<span class="model-name">${esc(m.name)}${m.id === info.defaultModel ? ` <span class="badge">Recommended</span>` : ""}</span>
         <span class="model-price">${esc(price(m))}</span><span class="model-caret" aria-hidden="true">▾</span>`
      : `<span class="model-name">Another model</span><span class="model-caret" aria-hidden="true">▾</span>`;
    $("#def-model-list").innerHTML = info.models.map((x) => `
      <button type="button" role="option" class="model-opt" data-id="${esc(x.id)}" aria-selected="${x.id === model}">
        <span class="model-name">${esc(x.name)}${x.id === info.defaultModel ? ` <span class="badge">Recommended</span>` : ""}
          <span class="small muted">${esc(x.note)}</span></span>
        <span class="model-price">${esc(price(x))}</span></button>`).join("")
      + `<button type="button" role="option" class="model-opt" data-id="${OTHER}" aria-selected="${model === OTHER}">
           <span class="model-name">Another model… <span class="small muted">type its name</span></span></button>`;
    $("#def-model-other").hidden = model !== OTHER;
  }
  function openMenu(open) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) (menu.querySelector("[aria-selected=true]") || menu.querySelector(".model-opt")).focus();
  }
  button.onclick = () => openMenu(menu.hidden);
  // "" = the recommended model, so a later version of the app can recommend a better one.
  const saveModel = (id) => saveSettings({ [`definer_model_${prov()}`]: id === PROVIDERS[prov()].defaultModel ? "" : id });
  menu.addEventListener("click", async (e) => {
    const opt = e.target.closest(".model-opt");
    if (!opt) return;
    model = opt.dataset.id;
    paintModel();
    openMenu(false);
    if (model === OTHER) $("#def-model-other").focus();
    else { button.focus(); await saveModel(model); }
    paintThinking();
  });
  menu.addEventListener("keydown", (e) => {
    const opts = [...menu.querySelectorAll(".model-opt")];
    const at = opts.indexOf(document.activeElement);
    if (e.key === "Escape") { e.stopPropagation(); openMenu(false); button.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      opts[(at + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length].focus();
    }
  });
  const outside = (e) => { if (!menu.hidden && !e.target.closest(".model-pick")) openMenu(false); };
  document.addEventListener("pointerdown", outside, true);

  function paintProvider() {
    const p = prov();
    const chosen = modelFor(p, cur());
    model = PROVIDERS[p].models.some((m) => m.id === chosen) ? chosen : OTHER;
    $("#def-model-other").value = model === OTHER ? chosen : "";
    $("#def-key").value = cur()[`llm_key_${p}`] || "";
    $("#def-test-result").textContent = "";
    $("#def-key-note").textContent = "";
    paintModel();
    paintKey();
  }
  paintProvider();
  paintMode();

  // ----- the Mnemonic maker: its own model and thinking level -----
  const mnModel = $("#mn-model"), mnThink = $("#mn-think");
  const lookupModel = () => (model === OTHER ? $("#def-model-other").value.trim() : model) || PROVIDERS[prov()].defaultModel;
  const mnBase = () => ({ provider: prov(), key: cleanKey($("#def-key").value), model: lookupModel() });
  const mnSettings = () => ({ ...cur(), [`mnemonic_model_${prov()}`]: mnModel.value, mnemonic_effort: mnThink.value });
  const mnConfig = () => mnemonicConfig(mnBase(), mnSettings());
  const modelName = (p, id) => (PROVIDERS[p].models.find((m) => m.id === id) || { name: id }).name;
  function paintMnemonic() {
    const p = prov(), info = PROVIDERS[p];
    const pick = cur()[`mnemonic_model_${p}`] || "";
    // "" (recommended): the model a step up from the cheapest (definer.mnemonicConfig), or the word
    // definitions' own when that is stronger still.
    const recommended = mnemonicConfig({ provider: p, model: lookupModel() }, {}).model;
    const opts = [`<option value="">${esc(modelName(p, recommended))} (recommended)</option>`,
      `<option value="${SAME_MODEL}">Same as word definitions</option>`,
      ...info.models.filter((m) => m.id !== recommended).map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.note)})</option>`)];
    if (pick && pick !== SAME_MODEL && !info.models.some((m) => m.id === pick)) opts.push(`<option value="${esc(pick)}">${esc(pick)}</option>`);
    mnModel.innerHTML = opts.join("");
    mnModel.value = pick;
    mnThink.value = mnemonicConfig({ provider: p, model: "" }, cur()).effort;
    paintThinking();
    $("#mn-test-result").textContent = "";
  }
  // The thinking choice only where the chosen model takes one, with a word where "Off" can't be quite off;
  // and about what one press costs with the chosen model.
  function paintThinking() {
    const cfg = mnConfig();
    const t = thinkingFor(prov(), cfg.model);
    $("#mn-think-field").hidden = !t.ok;
    $("#mn-note").textContent = t.ok ? t.note : "This model doesn't take a thinking setting.";
    const m = PROVIDERS[prov()].models.find((x) => x.id === cfg.model);
    const cents = m ? mnemonicCents(m) : 0;
    $("#mn-cost").textContent = !m ? "" : cents < 0.5 ? "Each press costs well under one US cent."
      : cents < 1.5 ? "Each press costs about one US cent." : `Each press costs about ${Math.round(cents)} US cents.`;
  }
  mnModel.onchange = async () => { await saveSettings({ [`mnemonic_model_${prov()}`]: mnModel.value }); paintThinking(); };
  mnThink.onchange = () => saveSettings({ mnemonic_effort: mnThink.value });
  paintMnemonic();
  // Try it: keywords for the example word, how long they took, and which model answered (the word
  // definitions' one when the key can't use the recommended model: definer.askMnemonicJson).
  $("#mn-test").onclick = async (e) => {
    const out = $("#mn-test-result");
    e.target.disabled = true;
    await keyEntered();
    out.textContent = "Thinking…";
    out.style.color = "";
    const lang = langInfo(studyLanguage());
    const speaks = (UI_LANGUAGES[uiLanguage()] || UI_LANGUAGES.en).name;
    const t0 = performance.now();
    let used = "";
    try {
      const got = await makeMnemonics({ text: lang.test.word }, {
        ask: (q) => askMnemonicJson(mnBase(), mnSettings(), q, transport, (m) => { used = m; }), study: lang.name, speaks });
      const said = syllableLine(got.pron);
      const words = [...got.items, ...got.parts].map((s) => s.keyword);
      out.textContent = `✓ ${((performance.now() - t0) / 1000).toFixed(1)} s, ${modelName(prov(), used)}: ${lang.test.word}${said ? ` (${said})` : ""} → ${words.join(" · ") || "–"}`;
      out.style.color = "var(--accent)";
    } catch (err) {
      out.textContent = err.message === "NO_KEY" ? "Add your API key above first." : err.message;
      out.style.color = "var(--danger)";
      const fix = troubleshootButton(err);
      if (fix) out.append(" ", fix);
    } finally {
      e.target.disabled = false;
    }
  };

  $("#def-provider").onchange = async () => { await saveSettings({ definer_provider: prov() }); paintProvider(); paintMnemonic(); };
  // The key is saved as soon as it is pasted or typed (not only when the box is left), tidied
  // of anything that came along with it, and filed under the provider it belongs to: a Gemini
  // key pasted with Claude selected switches the provider rather than failing later.
  let keyTimer = 0;
  async function keyEntered() {
    clearTimeout(keyTimer);
    const input = $("#def-key");
    const key = cleanKey(input.value);
    if (key !== input.value) input.value = key;
    const note = $("#def-key-note");
    const owner = key.length >= 20 ? keyProvider(key) : "";
    if (key === (cur()[`llm_key_${owner || prov()}`] || "") && (!owner || owner === prov())) return; // nothing new
    try {
      if (owner && owner !== prov()) {
        $("#def-provider").value = owner;
        await saveSettings({ definer_provider: owner, [`llm_key_${owner}`]: key });
        paintProvider();
        paintMnemonic();
        note.textContent = `That is a ${PROVIDERS[owner].short} key, so the provider is now ${PROVIDERS[owner].label}. Saved: press “Test with an example” to check it.`;
      } else {
        await saveSettings({ [`llm_key_${prov()}`]: key });
        paintKey();
        note.textContent = key ? "Saved. Press “Test with an example” to check it." : "Key removed.";
      }
      note.style.color = "var(--accent)";
    } catch (err) {
      note.textContent = `The key couldn't be saved: ${err.message}`;
      note.style.color = "var(--danger)";
    }
  }
  $("#def-key").addEventListener("input", (e) => {
    clearTimeout(keyTimer);
    if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") keyEntered(); // a paste: straight away
    else keyTimer = setTimeout(keyEntered, 600);                                             // typing: once it pauses
  });
  $("#def-key").addEventListener("change", keyEntered);
  $("#def-model-other").onchange = (e) => saveModel(e.target.value.trim());
  $("#def-lang").onchange = (e) => saveSettings({ definer_language: e.target.value.trim() || "English" });
  $("#def-stuck").onclick = () => showKeyHelp(prov());
  $("#def-show").onclick = (e) => {
    const k = $("#def-key");
    k.type = k.type === "password" ? "text" : "password";
    e.target.textContent = k.type === "password" ? "Show" : "Hide";
  };

  $("#def-test").onclick = async (e) => {
    const out = $("#def-test-result");
    e.target.disabled = true;
    await keyEntered(); // (a key typed a moment ago is saved, and filed under its provider, first)
    $("#def-key-note").textContent = "";
    out.textContent = "Asking…";
    out.style.color = "";
    const sample = langInfo(studyLanguage()).test;
    const t0 = performance.now();
    try {
      const d = await define({ provider: prov(), key: cleanKey($("#def-key").value), model: model === OTHER ? $("#def-model-other").value.trim() : model,
                               language: $("#def-lang").value.trim() || "English" },
                             { ...sample, lang: studyLanguage() }, transport);
      out.textContent = `✓ Works (${((performance.now() - t0) / 1000).toFixed(1)} s): ${sample.word} = “${d.meaning}”`;
      out.style.color = "var(--accent)";
    } catch (err) {
      out.textContent = err.message;
      out.style.color = "var(--danger)";
      const fix = troubleshootButton(err);
      if (fix) out.append(" ", fix);
      // A refused key: it isn't "set up" after all, and the key row (where "Get a new key" is) is framed again.
      if (err.keyRejected) {
        $("#def-keyrow").classList.add("need");
        $("#def-tag").className = "req-tag";
        $("#def-tag").textContent = "Key not working";
      }
    } finally {
      e.target.disabled = false;
    }
  };
  // ----- tokens used today: a running total, moving as lookups are answered -----
  const paintUse = () => {
    const use = describeUsage(tokensToday());
    $("#def-use").textContent = use.tokens.toLocaleString();
    $("#def-use-detail").textContent = `(${use.detail})`;
  };
  paintUse();
  window.addEventListener(TOKENS_EVENT, paintUse);

  /** Call when the page goes away. */
  return () => {
    clearTimeout(keyTimer);
    document.removeEventListener("pointerdown", outside, true);
    window.removeEventListener(TOKENS_EVENT, paintUse);
  };
}
