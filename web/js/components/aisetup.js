// The "Word definitions (AI)" controls in Settings, on the computer and the phone: which
// provider, getting a key from it, the key itself, which model the key is used with, and a test.

import { esc, h, state, saveSettings } from "../app.js";
import { PROVIDERS, define, modelFor } from "../definer.js";
import { langInfo, studyLanguage } from "../languages.js";
import { showKeyHelp } from "./keyhelp.js";

const OTHER = "__other__";

/** `transport` sends one request to a provider (each app has its own way: see definer.define). */
export function aiSetup({ transport }) {
  const cur = () => state.status.settings;
  const el = h(`<div class="ai-setup stack">
    <div class="ai-field"><label for="def-provider">Provider</label>
      <select id="def-provider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></div>
    <div id="def-callout"></div>
    <div class="ai-field"><label for="def-key">API key</label>
      <div class="row"><input type="password" id="def-key" autocomplete="off" spellcheck="false" placeholder="Paste your API key here">
        <button type="button" class="ghost" id="def-show">Show</button></div></div>
    <div class="ai-field"><label for="def-model">Model</label>
      <select id="def-model"></select>
      <input type="text" id="def-model-other" spellcheck="false" autocomplete="off" placeholder="Model name, exactly as the provider writes it" hidden>
      <span class="small muted">Which of the provider's AI models your key is used with. The recommended one is the low-cost
        choice and explains words well; change it any time. (Prices are US dollars per million tokens read / written;
        a lookup uses about a thousand.)</span></div>
    <div class="ai-field"><label for="def-lang">Explain in</label>
      <input type="text" id="def-lang"></div>
    <div class="row"><button type="button" id="def-test">Test with an example</button><span id="def-test-result" class="small"></span></div>
  </div>`);
  const $ = (q) => el.querySelector(q);
  const prov = () => $("#def-provider").value;
  $("#def-provider").value = PROVIDERS[cur().definer_provider] ? cur().definer_provider : "claude";
  $("#def-lang").value = cur().definer_language || "English";

  // The way to a key: loud while there is none (nearly everyone has to press it), quiet after.
  function paintCallout() {
    const info = PROVIDERS[prov()];
    const has = !!cur()[`llm_key_${prov()}`];
    const box = $("#def-callout");
    box.className = `key-callout${has ? " has-key" : ""}`;
    box.innerHTML = has
      ? `<span class="pill done">✓ ${esc(info.short)} key saved</span>
         <a class="btn" href="${esc(info.keyUrl)}" target="_blank" rel="noopener">Get a new key ↗</a>
         <button type="button" data-stuck>I'm stuck</button>`
      : `<div><strong>Step 1: get a key from ${esc(info.short)}.</strong>
           <div class="small">It opens their website. Make the key there, copy it, then paste it in the box below.</div></div>
         <div class="row"><a class="btn primary big" href="${esc(info.keyUrl)}" target="_blank" rel="noopener">Get your ${esc(info.short)} API key ↗</a>
           <button type="button" class="big" data-stuck>I'm stuck</button></div>`;
    box.querySelector("[data-stuck]").onclick = () => showKeyHelp(prov());
  }

  function paintProvider() {
    const p = prov();
    const info = PROVIDERS[p];
    const chosen = modelFor(p, cur());
    const listed = info.models.some((m) => m.id === chosen);
    $("#def-key").value = cur()[`llm_key_${p}`] || "";
    $("#def-model").innerHTML = info.models.map((m) =>
      `<option value="${esc(m.id)}">${esc(m.name)}${m.id === info.defaultModel ? " (recommended)" : ""}: ${esc(m.note)}</option>`).join("")
      + `<option value="${OTHER}">Another model… (type its name)</option>`;
    $("#def-model").value = listed ? chosen : OTHER;
    $("#def-model-other").hidden = listed;
    $("#def-model-other").value = listed ? "" : chosen;
    $("#def-test-result").textContent = "";
    paintCallout();
  }
  paintProvider();

  // "" = the recommended model, so a later version of the app can recommend a better one.
  const saveModel = (id) => saveSettings({ [`definer_model_${prov()}`]: id === PROVIDERS[prov()].defaultModel ? "" : id });
  $("#def-provider").onchange = async () => { await saveSettings({ definer_provider: prov() }); paintProvider(); };
  $("#def-key").onchange = async (e) => { await saveSettings({ [`llm_key_${prov()}`]: e.target.value.trim() }); paintCallout(); };
  $("#def-model").onchange = async (e) => {
    const other = e.target.value === OTHER;
    $("#def-model-other").hidden = !other;
    if (other) $("#def-model-other").focus();
    else await saveModel(e.target.value);
  };
  $("#def-model-other").onchange = (e) => saveModel(e.target.value.trim());
  $("#def-lang").onchange = (e) => saveSettings({ definer_language: e.target.value.trim() || "English" });
  $("#def-show").onclick = (e) => {
    const k = $("#def-key");
    k.type = k.type === "password" ? "text" : "password";
    e.target.textContent = k.type === "password" ? "Show" : "Hide";
  };

  $("#def-test").onclick = async (e) => {
    const out = $("#def-test-result");
    e.target.disabled = true;
    out.textContent = "Asking…";
    out.style.color = "";
    const p = prov();
    const sample = langInfo(studyLanguage()).test;
    const model = $("#def-model").value === OTHER ? $("#def-model-other").value.trim() : $("#def-model").value;
    const t0 = performance.now();
    try {
      const d = await define({ provider: p, key: $("#def-key").value.trim(), model, language: $("#def-lang").value.trim() || "English" },
                             { ...sample, lang: studyLanguage() }, transport);
      out.textContent = `✓ Works (${((performance.now() - t0) / 1000).toFixed(1)} s): ${sample.word} = “${d.meaning}”`;
      out.style.color = "var(--accent)";
    } catch (err) {
      out.textContent = err.message;
      out.style.color = "var(--danger)";
    } finally {
      e.target.disabled = false;
    }
  };
  return el;
}
