// Arabic vowel marks on screen: "Show vowels" draws a vowelled copy of each word.
//
// The computer makes the copy (app/tashkeel.py) and it travels to the phone inside the
// transcript, as `vowels` beside the words: { words: [vowelled word or null], dialect, guess }.
// Only what is DRAWN changes. Every screen keeps using the original words for everything else
// (looking a word up, saving it, seen words, search), so nothing matches differently.
//
// The vowel model learned Standard Arabic. A transcript that sounds like Egyptian, Levantine or
// Gulf Arabic (`dialect`), and lines with a dialect word in them (`guess`), get vowels that are
// only a guess: they are left plain unless the learner turned on "Also on dialect speech".
//
// Shared by the desktop app and the phone.

import { api, h, on, saveSettings, state, toast } from "./app.js";
import { openModal } from "./components/modal.js";
import { findWord, unmarked } from "./cardtext.js";
import { bare, chooseWords } from "./vowelmarks.js";

const settings = () => (state.status && state.status.settings) || {};
const DIALECTS = { egy: "Egyptian", lev: "Levantine", glf: "Gulf" };

export const vowelsShown = () => !!settings().show_vowels;

/** The words to draw (vowelmarks.js), with this device's settings. */
export function displayWords(texts, vowels, segOf = () => -1) {
  return chooseWords(texts, vowels, segOf, { show: vowelsShown(), dialect: !!settings().vowels_dialect });
}

/** One sentence about the vowels of this text, or "" when there is nothing to say. */
export function vowelsNote(vowels) {
  if (!vowelsShown() || !vowels || !vowels.dialect) return "";
  const name = DIALECTS[vowels.dialect] || "a dialect";
  return settings().vowels_dialect
    ? `Vowels are a guess here: this sounds like ${name} Arabic, and the vowel model learned Standard Arabic.`
    : `No vowels here: this sounds like ${name} Arabic, and the vowel model only knows Standard Arabic. Settings can show them as a guess.`;
}

/** Call `fn(vowels)` when episode `id` gets its vowels (the computer makes them in the background). */
export function watchVowels(id, fn) {
  return on("vowels", async (d) => {
    if (!d || String(d.episode_id) !== String(id)) return;
    try {
      const r = await api(`/episodes/${id}/vowels`);
      if (r && r.vowels) fn(r.vowels);
    } catch { /* shown next time */ }
  });
}

async function modelStatus() {
  try { return await api("/vowels/status"); } catch { return null; }
}

/** Ask once before the 22 MB download (computer only). Resolves true if it was started. */
function offerDownload(st) {
  return new Promise((resolve) => {
    const mb = Math.round((st.bytes || 21.6e6) / 1e6);
    const m = openModal({ title: "Add vowels to Arabic?", onClose: () => resolve(false) });
    m.body.append(h(`<div class="stack">
      <p>Arabic is written without its short vowels. Tamkeen can add them to your Arabic transcripts, pages and reels,
        so you can see how each word is said. That needs a vowel model, a one-time ${mb} MB download kept on this computer.
        Your phone gets the vowels from here when it syncs.</p>
      <p class="small muted">It learned Standard Arabic: on news-style Arabic about 4 words in 5 come out fully right.
        It doesn't know Egyptian, Levantine or Gulf speech, so those are left without vowels unless you ask for a guess.</p>
      <div class="row"><button type="button" class="primary" data-go>Download (${mb} MB)</button>
        <button type="button" class="ghost" data-close>Not now</button></div>
    </div>`));
    m.body.querySelector("[data-go]").onclick = async () => {
      try { await api("/vowels/download", { method: "POST" }); } catch (e) { toast(e.message, { error: true }); m.close(); return; }
      toast("Downloading the vowel model. Vowels appear when it is done.");
      resolve(true);
      m.close(); // (its onClose answer comes too late to count)
    };
  });
}

/**
 * Turn "Show vowels" on or off, from anywhere (a player's button, Settings). Turning it on where
 * the vowel model isn't downloaded yet asks first (computer); on the phone it explains that the
 * computer adds them. Returns the new setting.
 */
export async function setVowels(onOff) {
  if (onOff) {
    const st = await modelStatus();
    if (st && !st.phone && !st.installed && st.state !== "downloading" && !(await offerDownload(st))) return vowelsShown();
  }
  await saveSettings({ show_vowels: !!onOff });
  return vowelsShown();
}

/**
 * The players' quick switch: a small حَ button. `onChange()` redraws the words; `current()` gives
 * the vowels of what is on screen (its button says when they are held back as dialect). Call
 * `.repaint()` when those change. Only Arabic has one.
 */
export function vowelsButton(lang, onChange, current = () => null) {
  if (lang !== "ar") return null;
  const b = h(`<button type="button" class="ghost vowels-btn" lang="ar" aria-pressed="false">حَ</button>`);
  const paint = () => {
    const note = vowelsNote(current());
    b.setAttribute("aria-pressed", String(vowelsShown()));
    b.classList.toggle("on", vowelsShown());
    b.classList.toggle("held", !!note && !settings().vowels_dialect); // on, but this one is dialect: no vowels
    b.title = note || "Show or hide vowel marks (V)";
  };
  paint();
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await setVowels(!vowelsShown()); } catch (e) { toast(e.message, { error: true }); }
    b.disabled = false;
    paint();
    onChange();
    const note = vowelsNote(current());
    if (note) toast(note);
  });
  b.repaint = paint;
  return b;
}

/** Redraw word elements `els` (word `first`, `first`+1, ...) with `shown`, keeping their classes. */
export function paintWords(els, shown, first = 0) {
  for (let k = 0; k < els.length; k++) {
    const text = shown[first + k];
    if (text !== undefined && els[k].textContent !== text) els[k].textContent = text;
  }
}

// ---------- review cards ----------
const sentences = new Map();

/** A saved word's sentence with vowels (the computer vowels it; the phone takes it from the
 * transcript it was saved from, when that is here), or null. (Without the ⟦ ⟧ round the parts the
 * learner lit up on the card: cardtext.js.) */
export async function vowelledSentence(v) {
  const sentence = unmarked(v && v.sentence);
  if (!vowelsShown() || !sentence || !/[ء-ي]/.test(sentence)) return null;
  const key = `${v.uid || v.id}|${sentence}`;
  if (!sentences.has(key)) {
    sentences.set(key, api("/vowels/sentence", { method: "POST", body: {
      sentence, episode: v.episode_uid || "", start: v.sent_start ?? null, end: v.sent_end ?? null,
    } }).catch(() => null));
  }
  const r = await sentences.get(key);
  if (!r || !r.sentence || bare(r.sentence) !== bare(sentence)) return null;
  return r.guess && !settings().vowels_dialect ? null : r.sentence;
}

/** A review card's answer side: its word and sentence drawn vowelled, once known. `drawSentence`
 * draws the card's sentence again with the vowelled one shown (lit as the card lights it). */
export async function vowelCard(face, v, drawSentence) {
  const vs = await vowelledSentence(v);
  const word = face.querySelector(".rv-word");
  if (!vs || !word || word.textContent !== v.text) return; // (the card has moved on, or its word is being typed)
  drawSentence(vs);
  const at = findWord(vs, v.text);
  if (at && bare(v.text) === v.text) word.textContent = vs.slice(at[0], at[1]);
}

/** Settings: the vowels line under "Language I'm learning" (Arabic only). */
export function vowelsRow(lang) {
  const el = h(`<div class="lex-row vowels-row small" hidden></div>`);
  if (lang !== "ar") return el;
  let off = null;
  const paint = async () => {
    const st = (await modelStatus()) || { phone: true };
    const s = settings();
    el.hidden = false;
    const switches = `<label><input type="checkbox" data-act="show" ${s.show_vowels ? "checked" : ""}> Show vowels (حَرَكات) in transcripts, pages and reels</label>
      <label><input type="checkbox" data-act="dialect" ${s.vowels_dialect ? "checked" : ""}> Also on Egyptian, Levantine and Gulf speech (a guess, often wrong)</label>`;
    if (st.phone) {
      el.innerHTML = `${switches}<span class="muted">Tamkeen on your computer adds the vowels (download the vowel model in its Settings); they come here when you sync.</span>`;
    } else if (st.installed) {
      el.innerHTML = `${switches}<span>✓ The vowel model is on this computer (${Math.round(st.bytes / 1e6)} MB).${st.working ? " Adding vowels…" : ""}</span>
        <button type="button" class="ghost" data-act="remove">Remove</button>`;
    } else if (st.state === "downloading") {
      el.innerHTML = `<span>Downloading the vowel model… ${st.bytes ? Math.round((100 * st.done) / st.bytes) : 0}%</span>`;
    } else {
      el.innerHTML = `<span>Arabic vowel marks need a vowel model (${Math.round(st.bytes / 1e6)} MB, Standard Arabic).${st.error ? ` ${st.error}` : ""}</span>
        <button type="button" data-act="get">Download</button>`;
    }
  };
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.act === "get") await api("/vowels/download", { method: "POST" });
      else await api("/vowels/remove", { method: "POST" }); // (vowels already made stay)
    } catch (err) { toast(err.message, { error: true }); }
    paint();
  });
  el.addEventListener("change", async (e) => {
    const act = e.target.dataset.act;
    try {
      if (act === "show") e.target.checked = await setVowels(e.target.checked);
      else if (act === "dialect") await saveSettings({ vowels_dialect: e.target.checked });
    } catch (err) { toast(err.message, { error: true }); }
    paint();
  });
  // Download progress and "done" arrive as events (computer); the row goes when Settings does.
  off = on("vowels", (d) => { if (!el.isConnected) { off(); return; } if (!d || d.episode_id === undefined) paint(); });
  paint();
  return el;
}
