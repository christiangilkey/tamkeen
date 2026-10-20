// "Which language am I learning right now": the chip in the top bar (desktop and phone). Tapping it
// lists the languages being learned and "Add a language…". Choosing one sets `study_language`;
// the library, vocab, reviews, Home and search then show only what is in that language (the
// server, or the phone's backend.js, filters by it). The languages being learned are the setting
// `learning_languages`: the ticked tiles in Settings → Languages (learningSettings below) and the
// switch's menu are the same list, so a change in one shows in the other at once. The list travels
// between devices with the library (web/js/learnlist.js has the rules; app/learning.py the computer's copy).

import { api, h, on, saveSettings, showMenu, state, toast } from "../app.js";
import { LANGUAGES, isLanguage, langAttrs, onStudyLanguage, setStudyLanguage, studyLanguage } from "../languages.js";
import { effectiveList, toggleLearning, withLearning } from "../learnlist.js";
import { languagePicker, learningPicker } from "./langpicker.js";
import { openModal } from "./modal.js";

const settingsNow = () => (state.status && state.status.settings) || {};
const nameOf = (code) => (LANGUAGES[code] || {}).name || code;

/** The languages being learned, the current one first if it isn't on the list yet. */
export function learningList(s = settingsNow()) {
  return effectiveList(s);
}

/** `values` about to be saved, with the list of languages being learned (and when each changed)
 *  filled in: a language switched to goes on the list. Used by each shell's saveSettings. */
export function withLearningList(values, s = settingsNow()) {
  return withLearning(values, s, Date.now());
}

/** Settings home screen's line: "Learning Arabic", or "Learning Arabic and 2 more" (the one now first). */
export function learningSummary(list = learningList(), now = studyLanguage()) {
  const others = list.filter((c) => c !== now).length;
  return others ? `Learning ${nameOf(now)} and ${others} more` : `Learning ${nameOf(now)}`;
}

// Everything showing the list (the Settings tiles) repaints when it changes, whoever changed it.
const painters = new Set();
const keyOf = (s) => JSON.stringify([s.study_language || "", effectiveList(s)]);
function changed() {
  for (const fn of painters) { try { fn(); } catch (e) { console.error(e); } }
}

/** Learn `code` now: everything shown switches to it. */
export async function switchTo(code) {
  if (!isLanguage(code)) return;
  if (code !== studyLanguage()) await saveSettings({ study_language: code });
  changed();
  redraw();
}

/** Redraw the page for the language studied now. On Settings, the languages card stays in view
 *  (twice, like settingsui.js revealFind: the parts above it are still filling in at first). */
function redraw() {
  const old = document.querySelector(".learn-set");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  if (!old) return;
  let tries = 0;
  const back = () => {
    const el = document.querySelector(".learn-set");
    if (el && el !== old) {
      el.scrollIntoView({ block: "center" });
      setTimeout(() => el.isConnected && el.scrollIntoView({ block: "center" }), 450);
    } else if (++tries < 40) setTimeout(back, 50);
  };
  setTimeout(back, 50);
}

/** Tick (`on`) or untick a language. At least one stays ticked; unticking the one studied now moves
 *  to another ticked one. Nothing is deleted: an unticked language's podcasts and words stay. */
export async function setLearning(code, on) {
  const s = settingsNow();
  const was = s.study_language;
  const next = toggleLearning(s, code, on);
  if (next.kept) { toast("Keep at least one language ticked.", { error: true }); changed(); return; }
  await saveSettings({ learning_languages: next.list, ...(next.now !== was ? { study_language: next.now } : {}) });
  changed();
  if (next.now !== was) {
    toast(`Now learning ${nameOf(next.now)}. Your ${nameOf(code)} podcasts and words are kept.`);
    redraw();
  }
}

function addLanguage() {
  const m = openModal({ title: "Add a language to learn" });
  const s = settingsNow();
  m.body.append(h(`<p class="muted">Its podcasts, videos, words and reviews are kept apart from your other languages.
    Switch between them from the top bar.</p>`));
  m.body.append(languagePicker(null, async (code) => { m.close(); await switchTo(code); },
    { speaks: s.ui_language || "en", hide: learningList(s) }));
}

/** Settings → Languages: the tiles (tap = tick or untick) and, under them, "Studying now" with one
 *  button per ticked language (tap = study it now). Returns the element; it repaints itself. */
export function learningSettings({ speaks = "en" } = {}) {
  const el = h(`<div class="learn-set">
    <div class="learn-tiles"></div>
    <div class="learn-now">
      <span class="learn-now-label">Studying now</span>
      <div class="learn-now-opts" role="radiogroup" aria-label="Studying now"></div>
    </div>
    <p class="set-hint learn-keep">Unticking a language only takes it out of the switch. Its podcasts, videos, words and reviews are kept, and come back when you tick it again.</p>
  </div>`);
  const s = settingsNow();
  const tiles = learningPicker({ list: learningList(s), now: s.study_language, speaks, onToggle: (code, on) => setLearning(code, on) });
  el.querySelector(".learn-tiles").append(tiles);
  const opts = el.querySelector(".learn-now-opts");
  const paint = () => {
    const now = settingsNow().study_language;
    const list = learningList();
    tiles.paint(list, now);
    opts.innerHTML = list.map((c) => `<button type="button" class="learn-now-opt" role="radio" data-lang="${c}"
      aria-checked="${c === now}" aria-label="${nameOf(c)}"><span ${langAttrs(c)}>${LANGUAGES[c].native}</span></button>`).join("");
  };
  opts.addEventListener("click", async (e) => {
    const b = e.target.closest(".learn-now-opt");
    if (!b || b.getAttribute("aria-checked") === "true") return;
    await switchTo(b.dataset.lang);
    toast(`Now learning ${nameOf(b.dataset.lang)}`);
  });
  paint();
  painters.add(paint);
  // Gone from the page (another Settings section opened): stop repainting it.
  const watch = new MutationObserver(() => { if (!el.isConnected) { painters.delete(paint); watch.disconnect(); } });
  queueMicrotask(() => watch.observe(document.body, { childList: true, subtree: true }));
  return el;
}

/** After a sync: another device may have ticked or unticked a language. Take the new settings and,
 *  if the language studied here was unticked there, say so and redraw for the new one. */
function fromOtherDevice(s, before = settingsNow()) {
  if (!s || keyOf(s) === keyOf(before)) return;
  const was = before.study_language;
  // In place: on the phone this object is the stored settings themselves.
  if (state.status && state.status.settings) {
    Object.assign(state.status.settings, { study_language: s.study_language, learning_languages: s.learning_languages, learning_times: s.learning_times });
  }
  setStudyLanguage(s.study_language);
  changed();
  if (was && s.study_language && s.study_language !== was) {
    toast(`Now learning ${nameOf(s.study_language)}: ${nameOf(was)} was unticked on another device. Its podcasts and words are kept.`);
    redraw();
  }
}

/** The chip, put into the top bar after `anchor`. */
export function mountLanguageSwitch(anchor) {
  if (!anchor || document.querySelector(".lang-switch")) return;
  const chip = h(`<button type="button" class="lang-switch" aria-haspopup="menu" title="The language you're learning now"></button>`);
  const paint = () => {
    const code = studyLanguage();
    chip.innerHTML = `<span class="lang-switch-name" ${langAttrs(code)}></span><span class="lang-switch-caret" aria-hidden="true">▾</span>`;
    chip.firstChild.textContent = (LANGUAGES[code] || {}).native || code;
    chip.setAttribute("aria-label", `Learning ${(LANGUAGES[code] || {}).name || code}. Change language`);
  };
  chip.onclick = (e) => {
    e.stopPropagation();
    const r = chip.getBoundingClientRect();
    const now = studyLanguage();
    const items = learningList().map((code) => ({
      label: `${code === now ? "✓ " : ""}${LANGUAGES[code].native} · ${LANGUAGES[code].name}`,
      run: () => switchTo(code),
    }));
    items.push({ label: "＋ Add a language…", run: addLanguage });
    showMenu(r.left, r.bottom + 6, "Learning now", items);
  };
  paint();
  onStudyLanguage(paint);
  anchor.after(chip);
  // The phone's sync says so itself, with the settings before and after (mobile/src/js/sync.js);
  // the computer is asked after each sync.
  window.addEventListener("tamkeen:learning", (e) => e.detail && fromOtherDevice(e.detail.after, e.detail.before));
  on("sync", (st) => {
    if (st && st.state && st.state !== "idle") return;
    api("/settings").then((s) => fromOtherDevice(s)).catch(() => {});
  });
}
