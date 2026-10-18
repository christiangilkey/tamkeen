// The "Troubleshoot" button shown beside an error when an AI or transcription key fails, and the
// box it opens: the likely reasons, picked from what went wrong (trouble.js), each with what to
// do, and links to the provider's key page and status page. Shared by the desktop app and the phone.
// The key itself is never shown: the box only ever has the app's own message and the provider's name.

import { esc, h, state } from "../app.js";
import { PROVIDERS } from "../definer.js";
import { STT_PROVIDERS } from "../stt.js";
import { STATUS_PAGES, kindOf, troubleshooting } from "../trouble.js";
import { openModal } from "./modal.js";

// Anything in a message that looks like a key, blanked out (providers sometimes quote part of one).
const KEYISH = /\b(sk-[\w-]{6,}|gsk_\w{6,}|xai-[\w-]{6,}|AIza[\w-]{10,})/g;
const hideKeys = (text) => String(text || "").replace(KEYISH, "…");

/** Which provider a failure came from: the error's own, else the one its message starts with,
 * else the one chosen in Settings. `service` is "ai" (word definitions) or "stt" (transcription). */
function providerOf(error, service) {
  const list = service === "stt" ? STT_PROVIDERS : PROVIDERS;
  if (error && error.provider && list[error.provider]) return error.provider;
  const message = String((error && error.message) || error || "");
  for (const [id, p] of Object.entries(list)) if (message.startsWith(p.label)) return id;
  const s = (state.status && state.status.settings) || {};
  const chosen = service === "stt" ? s.stt_provider : s.definer_provider;
  return list[chosen] ? chosen : Object.keys(list)[0];
}

/** Open the box for `error` (what was thrown, or the message text kept with a failed episode). */
export function showTroubleshoot(error, { service = "ai" } = {}) {
  const id = providerOf(error, service);
  const info = (service === "stt" ? STT_PROVIDERS : PROVIDERS)[id];
  const kind = kindOf(typeof error === "string" ? { message: error } : error) || "other";
  const t = troubleshooting(kind, { stt: service === "stt" });
  const message = hideKeys(typeof error === "string" ? error : error && error.message);
  const modal = openModal({ title: "Troubleshoot" });
  const item = (c) => `<li><strong>${esc(c.title)}</strong><span>${esc(c.fix)}</span></li>`;
  modal.body.append(h(`<div class="trouble stack">
    <p class="trouble-what"><strong>${esc(t.heading)}</strong></p>
    ${message ? `<p class="small muted trouble-said"></p>` : ""}
    <h3 class="trouble-h">Most likely</h3>
    <ol class="trouble-list">${t.likely.map(item).join("")}</ol>
    ${t.other.length ? `<details class="trouble-more"><summary>Other common causes</summary>
      <ul class="trouble-list">${t.other.map(item).join("")}</ul></details>` : ""}
    <div class="row trouble-links">
      <a class="btn key-get" href="${esc(info.keyUrl)}" target="_blank" rel="noopener">${esc(info.short)} key page ↗</a>
      ${STATUS_PAGES[id] ? `<a class="btn" href="${esc(STATUS_PAGES[id])}" target="_blank" rel="noopener">${esc(info.short)} status page ↗</a>` : ""}
    </div>
  </div>`));
  const said = modal.body.querySelector(".trouble-said");
  if (said) said.textContent = message; // (the app's own message: shown as text, never as HTML)
  return modal;
}

/** A "Troubleshoot" button for `error`, or null when it isn't a provider problem (no key yet, say). */
export function troubleshootButton(error, { service = "ai" } = {}) {
  if (!kindOf(typeof error === "string" ? { message: error } : error)) return null;
  const b = h(`<button type="button" class="trouble-btn">Troubleshoot</button>`);
  b.onclick = (e) => { e.stopPropagation(); showTroubleshoot(error, { service }); };
  return b;
}
