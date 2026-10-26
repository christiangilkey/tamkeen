// The extension's stand-in for the app shell (web/js/app.js on the computer, mobile/src/js/app.js on
// the phones): the shared parts the subtitle bar uses (the word popup, the dictionaries, the definer)
// import these names from "../app.js". `api` answers the few requests they make, from the extension's
// own storage: the dictionaries (downloaded like the web app's, lexicon-store.js), the answers already
// looked up, and the "seen words" list (not kept here: the web app keeps it).
import { kv, saveSettingsPatch, settings } from "./store.js";
import { lexiconData, lexiconDownload, lexiconRemove, lexiconStatus } from "./lexicon-store.js";
import { placeToast } from "./toaster.js";

export const platform = "extension";
export const state = { status: { settings } };

export class ApiError extends Error {}

export async function api(path, { method = "GET", body } = {}) {
  const [p, qs] = String(path).split("?");
  const q = new URLSearchParams(qs || "");
  const b = body || {};
  if (method === "GET" && p === "/lexicon/status") return lexiconStatus(q.get("lang") || "ar", q.get("kind") || "words");
  if (method === "POST" && p === "/lexicon/download") {
    try { return await lexiconDownload(b.lang || "ar", b.kind || "words"); } catch (e) { throw new ApiError(e.message); }
  }
  if (method === "POST" && p === "/lexicon/remove") return lexiconRemove(b.lang || "ar", b.kind || "words");
  let m = /^\/lexicon\/data\/([\w-]+)$/.exec(p);
  if (m && method === "GET") {
    const data = await lexiconData(m[1]);
    if (!data) throw new ApiError("That dictionary hasn't been downloaded.");
    return data;
  }
  m = /^\/definitions\/(\w+)$/.exec(p);
  if (m && method === "GET") return (await kv.get(`def:${m[1]}`)) || null;
  if (m && method === "PUT") {
    await kv.set(`def:${m[1]}`, b.data);
    return { ok: true };
  }
  // Seen words and the vocab list live in the web app; here nothing is counted as seen yet.
  if (method === "GET" && p === "/lexemes") return { keys: [] };
  if (method === "POST" && (p === "/lexemes" || p === "/lexemes/forget")) return { added: 0 };
  if (method === "GET" && (p === "/lexemes/lookups" || p === "/vocab")) return [];
  throw new ApiError(`Not available in the extension: ${method} ${p}`);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** A short message (the same words are never shown twice at once: toaster.js). */
export function toast(message, { error = false, timeout = 4000 } = {}) {
  const box = document.getElementById("toasts");
  if (!box) return;
  placeToast(box, message, { error, ms: error ? timeout * 2 : timeout, build: () => {
    const el = h(`<div class="toast${error ? " error" : ""}"><span></span></div>`);
    el.firstChild.textContent = message;
    return el;
  } });
}

export function buzz() { /* no vibration on a computer */ }

export async function saveSettings(values) {
  return saveSettingsPatch(values);
}
