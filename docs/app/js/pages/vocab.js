// Vocab list: saved words/phrases with their sentence, notes, audio replay and export.
// Words can be filed in any number of folders; the list can be sorted and filtered by when
// a word was added or last changed.
//
// The header over the list (the owner's clean-up, 2026-11-06): the search box, then one row with the
// folder on show (a tap opens the folder sheet: every folder with its count, New folder, and each one's
// Rename / Send / Delete), one sort-and-filter icon (a sheet: the order, and which days' words to show)
// and Select (a mode where a tap ticks a word, with a bar of what to do with the ticked ones). A tap on a
// word opens it in place with every tool the back of a review card has (components/wordeditor.js).

import { api, esc, h, toast, download, audioUrl, showMenu, shareClip, clipUrl, platform, buzz } from "../app.js";
import { ANKI_SETTINGS, MOVE_LABEL, ankiProgressLine, ankiSettingsLabel, ankiSyncHere, confirmDelete, loadAnkiProgress, moveToLanguageDecks } from "../components/ankisync.js";
import { askName, confirmBox, openModal } from "../components/modal.js";
import { t } from "../i18n.js";
import { detectLanguage, langAttrs, langInfo, studyLanguage } from "../languages.js";
import * as social from "../social.js";
import { icon } from "../icons.js";
import { cardSentence, markedSentenceHtml } from "../cardtext.js";
import { audioKey, canSay, failedHere, hasOwnAudio, loadError, voiceTimes } from "../cardvoice.js";
import { cardLanguage, cardSayer, learnVoices, stopDevice, voiceHere } from "../voiceplay.js";
import { CARDS_ICON, loadLog, openReview, overview } from "./review.js";
import { waitText } from "../review/deck.js";
import { goalBar } from "../review/goalbar.js";
import { VIEW_DEFAULTS, changedView, folderCount, narrowed, sortFolders, stepFolder } from "../review/vocabedit.js";
import { firstVisitTour } from "../components/tour.js";
import { openWordBuilder } from "../components/wordbuilder.js";
import { openWordEditor, vocabIcon } from "../components/wordeditor.js";
import { offerFix } from "../components/fixit.js";

const DAY = 86400;
const SORTS = {
  added_desc: ["Newest first", (a, b) => b.created_at - a.created_at],
  added_asc: ["Oldest first", (a, b) => a.created_at - b.created_at],
  changed_desc: ["Recently changed", (a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at)],
  changed_asc: ["Least recently changed", (a, b) => (a.updated_at || a.created_at) - (b.updated_at || b.created_at)],
  alpha: ["A–Z", (a, b) => a.text.localeCompare(b.text, studyLanguage())],
};
const RANGES = { any: "Any time", today: "Today", week: "Last 7 days", month: "Last 30 days", year: "Last 12 months", custom: "Between dates…" };
/** Holding a word on the list this long starts Select with it ticked (a phone's usual way). */
const PICK_HOLD_MS = 500;

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** What to do with the exported file, shown the first time someone exports for Anki.
 * (Worked out when asked for, not when this file loads: app.js is still starting up then.) */
function ankiSteps() {
  // The deck carries where each word stands in the app's own reviews; Anki asks whether to use it.
  const progress = "Tick <strong>Import any learning progress</strong> to keep where each word stands in your Tamkeen reviews. Leave it unticked to start every card as new.";
  return platform === "desktop"
    ? { need: "You need the Anki app installed on this computer.", steps: [
      "Save the file from Tamkeen.",
      "In Anki, click <strong>Import File</strong> and choose it.",
      progress,
      "Make sure your deck is formatted the way you want the cards to appear in Anki."] }
    : window.TAMKEEN_WEB === true // the web app: the deck is downloaded as a file, for whichever Anki is at hand
    ? { need: "You need Anki: Anki on a computer, AnkiDroid on Android or AnkiMobile on an iPhone.", steps: [
      "Save the file from Tamkeen.",
      "Open the saved file with Anki. On a computer, click <strong>Import File</strong> in Anki and choose it.",
      progress,
      "Make sure your deck is formatted the way you want the cards to appear in Anki."] }
    : window.Capacitor?.getPlatform?.() === "ios" // the iPhone app: Anki there is AnkiMobile
    ? { need: "You need the AnkiMobile app installed on this iPhone.", steps: [
      "Pick <strong>AnkiMobile</strong> in the row of apps. If it isn't there, tap <strong>More</strong>.",
      progress,
      "In AnkiMobile, make sure your deck is formatted the way you want the cards to appear."] }
    : { need: "You need the AnkiDroid app installed on this phone.", steps: [
      "Pick the <strong>Anki</strong> bubble in the row at the bottom. If it isn't there, tap <strong>More</strong>.",
      "Tap the popup labelled <strong>AnkiDroid</strong>.",
      progress,
      "In AnkiDroid, make sure your deck is formatted the way you want the cards to appear."] };
}

/** Resolves true when the export should go ahead: at once after the first time, otherwise when
 * the explanation has been read and accepted (false if it was closed instead). */
function ankiHelp() {
  if (lsGet("ankiHelpSeen", false)) return Promise.resolve(true);
  const help = ankiSteps();
  const dlg = h(`<dialog class="help-dialog">
    <h2>Sending your words to Anki</h2>
    <p>${help.need}</p>
    <ol>${help.steps.map((s) => `<li>${s}</li>`).join("")}</ol>
    <div class="help-actions">
      <button type="button" class="ghost" data-go="">Cancel</button>
      <button type="button" class="primary" data-go="1">Got it, export</button>
    </div>
  </dialog>`);
  document.body.append(dlg);
  return new Promise((resolve) => {
    // Answered by the buttons themselves; "close" only covers the Esc / back key. (The browser
    // sends "close" with its next screen repaint, which would be a needless wait here.)
    const answer = (go) => {
      if (!dlg.isConnected) return;
      dlg.remove();
      if (go) lsSet("ankiHelpSeen", true);
      resolve(go);
    };
    for (const b of dlg.querySelectorAll("button")) b.onclick = () => answer(Boolean(b.dataset.go));
    dlg.addEventListener("close", () => answer(false));
    dlg.showModal();
  });
}

function highlight(sentence, word) {
  // Where its ⟦ ⟧ marks say (a course word, or one marked in a review card), else found whatever its
  // vowel marks: a word saved with them sits unvowelled in a web page's text.
  return markedSentenceHtml(sentence, word, esc);
}

/** [from, to) in seconds for a date-range choice; null bounds mean open-ended. */
export function rangeBounds(range, fromDate, toDate, now = Date.now() / 1000) {
  const startOfToday = new Date(now * 1000);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime() / 1000;
  switch (range) {
    case "today": return [today, null];
    case "week": return [now - 7 * DAY, null];
    case "month": return [now - 30 * DAY, null];
    case "year": return [now - 365 * DAY, null];
    case "custom": {
      const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() / 1000 : null;
      const to = toDate ? new Date(`${toDate}T00:00:00`).getTime() / 1000 + DAY : null; // inclusive end day
      return [from, to];
    }
    default: return [null, null];
  }
}

/** How words get here, for someone whose list is still empty. */
const TIP = `In any transcript, right-click (or long-press) a word or a selected phrase and choose “Save to vocab”.
  Or add your own with Add words, above: one at a time, a whole list, or a photo of one.`;

export async function render(view) {
  const prefs = lsGet("vocabView", {});
  const st = {
    folder: prefs.folder || "",           // "" = all, "none" = not in any folder, else a folder uid
    sort: SORTS[prefs.sort] ? prefs.sort : VIEW_DEFAULTS.sort,
    dateField: prefs.dateField === "changed" ? "changed" : "added",
    range: RANGES[prefs.range] ? prefs.range : "any",
    from: prefs.from || "",
    to: prefs.to || "",
    q: "",
  };
  const savePrefs = () => lsSet("vocabView", { folder: st.folder, sort: st.sort, dateField: st.dateField,
                                               range: st.range, from: st.from, to: st.to });

  // The owner's layout (2026-10-16): the Review block first and bold, so the day's task is the first
  // thing seen; then search and the list's header; each word a short card that opens on a tap; the less
  // used things (adding a word by hand, the exports, Anki's settings) in the ⋯ menu.
  view.append(h(`<div class="page vocab-page">
    <div class="vocab-head">
      <h1>Vocab</h1>
      <span class="muted" id="count"></span>
      <span class="spacer"></span>
      <button type="button" class="icon vocab-more" id="more" title="More: add words, export, Anki settings" aria-label="More" aria-haspopup="menu">${icon("more", 22)}</button>
    </div>
    <section class="review-block">
      <button type="button" class="review-banner idle" id="review" hidden>
        <span class="rb-icon">${CARDS_ICON}</span>
        <span class="rb-text"><strong>Review</strong><span class="rb-sub"></span></span>
        <span class="rb-go"></span>
      </button>
      <div id="goal" hidden></div>
      <div class="vocab-actions">
        <span class="va-send" id="send-slot"></span>
        <button type="button" class="ghost va-add" id="add-words" title="Type, paste or scan new words: Tamkeen can fill in their meanings, example sentences and audio">${icon("plus", 18)} Add words</button>
      </div>
    </section>
    <div id="mywords">
    <input type="search" id="q" class="vocab-search" placeholder="Search vocab… ${esc(langInfo(studyLanguage()).search)}" dir="auto">
    <div class="vocab-bar" id="vbar">
      <button type="button" class="vocab-folder" id="folder-pick" aria-haspopup="dialog" title="Choose a folder">
        ${icon("folder", 18)}<span class="vf-name"></span><span class="vf-n"></span><span class="vf-caret" aria-hidden="true">${icon("chevron", 16)}</span>
      </button>
      <button type="button" class="vocab-tool" id="sort-pick" aria-haspopup="dialog" title="Sort and filter" aria-label="Sort and filter">${vocabIcon("filter", 20)}<i class="vt-dot" hidden></i></button>
      <button type="button" class="vocab-tool" id="select-mode" title="Select words" aria-label="Select words" aria-pressed="false">${vocabIcon("select", 20)}</button>
    </div>
    <div class="vocab-selbar" id="bulk" hidden>
      <div class="vsb-top">
        <button type="button" class="vocab-tool" id="bulk-done" title="Done selecting" aria-label="Done selecting">${icon("close", 18)}</button>
        <span class="vsb-count" id="bulk-count" role="status"></span>
        <button type="button" class="ghost vsb-all" id="select-all"></button>
      </div>
      <div class="vsb-acts">
        <button type="button" class="vi-tool" id="bulk-add">${vocabIcon("folderin", 20)}<span>Add to folder</span></button>
        <button type="button" class="vi-tool" id="bulk-remove">${vocabIcon("folderout", 20)}<span>Remove from folder</span></button>
        <button type="button" class="vi-tool" id="bulk-send">${icon("send", 20)}<span>Send</span></button>
        <button type="button" class="vi-tool vi-tool-danger" id="bulk-delete">${icon("trash", 20)}<span>Delete</span></button>
      </div>
    </div>
    <div class="vocab-list" id="list"></div>
    </div>
  </div>`));
  const $ = (s) => view.querySelector(s);
  const page = $(".vocab-page");
  const list = $("#list");

  let all = [];      // every word matching the search box
  let folders = [];  // [{uid, name}]
  let log = {};      // the reviewer's record: every answer by word uid (see pages/review.js)
  const selected = new Set();
  let selecting = false;  // Select is on: a tap ticks a word instead of opening it
  let shown = [];    // the words listed right now (the open folder, narrowed by the search box and the dates)
  let justAdded = new Set();  // ids of the cards just added with "Add words": listed first, lit up a moment
  const folderName = (uid) => (folders.find((f) => f.uid === uid) || {}).name;

  // One shared audio element for snippet playback.
  const audio = new Audio();
  let stopAt = Infinity;
  let raf = 0;
  const watch = () => {
    if (audio.currentTime >= stopAt) { audio.pause(); return; }
    if (!audio.paused) raf = requestAnimationFrame(watch);
  };
  // Backup for when animation frames are paused (window in the background).
  audio.addEventListener("timeupdate", () => { if (audio.currentTime >= stopAt) audio.pause(); });
  // The recording in the player, and the promise of its loading: a second press while it loads waits
  // for the same loading (rather than asking a player that has nothing yet to play, which the browser
  // answers with its own words: "NotSupportedError: … no supported source was found").
  let loaded = { source: "", ready: null };
  const LOAD_WAIT = 12000;  // a recording that hasn't started loading by then is taken as unreachable
  const superseded = () => Object.assign(new Error("superseded"), { superseded: true });
  /** Load recording `source` into the player. Rejects with loadError() (cardvoice.js: plain words,
   * marked `unplayable`) when this device can't play it, or `superseded` when another card took over. */
  function loadRecording(source, address) {
    if (loaded.source === source) return loaded.ready;
    const ready = (async () => {
      let url;
      try { url = await address(); } catch { throw loadError(); }  // e.g. "This word's audio isn't on this phone yet"
      if (loaded.source !== source) throw superseded();
      if (!url) throw loadError();
      audio.src = url;
      await new Promise((res, rej) => {
        const finish = (ok) => {
          clearTimeout(timer);
          audio.removeEventListener("loadedmetadata", onMeta);
          audio.removeEventListener("error", onError);
          if (loaded.source !== source) rej(superseded());
          else if (ok) res();
          else rej(loadError());
        };
        const onMeta = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), LOAD_WAIT);
        audio.addEventListener("loadedmetadata", onMeta);
        audio.addEventListener("error", onError);
      });
    })();
    loaded = { source, ready };
    ready.catch(() => { if (loaded.ready === ready) loaded = { source: "", ready: null }; });  // tried afresh next time
    return ready;
  }
  /** Play part of a word's audio: its own clip (a word a friend shared), its episode, or (`voice`)
   * the voice kept for it (cardvoice.js: the same stored file as a clip). Never rejects with the
   * browser's own words: only loadError() (the card's voice then says it: cardvoice.js sayCard). */
  async function playSnippet(v, start, end, { voice = false } = {}) {
    const own = v.clip || voice;
    const source = audioKey(v, voice);
    if (failedHere(source)) throw loadError();  // failed a moment ago: not tried (and waited for) again
    const quietly = { ended: Promise.resolve() };
    try {
      await loadRecording(source, () => (own ? clipUrl(v) : audioUrl(v.episode_id, { quiet: true })));
    } catch (e) {
      if (e && e.superseded) return quietly;  // another card pressed meanwhile: that one plays
      throw e;
    }
    if (loaded.source !== source) return quietly;
    audio.currentTime = Math.max(0, start - 0.25);
    stopAt = end + 0.35;
    try {
      await audio.play();
    } catch (e) {
      if (e && e.name === "AbortError") return quietly;  // interrupted by another press
      if (e && e.name === "NotSupportedError") { loaded = { source: "", ready: null }; throw loadError(); }
      throw Object.assign(new Error("Couldn't load this word's audio."), { cause: e });  // e.g. not allowed to play yet
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(watch);
    // `ended` settles once this stretch has finished playing: the player pauses at `stopAt`, or the
    // file ends, or something else takes the player over. A timer backs it up, so nothing waiting on
    // it can hang. (The review card's "Say it" plays the learner's attempt after it.)
    const ended = new Promise((done) => {
      const finish = () => {
        clearTimeout(backup);
        audio.removeEventListener("pause", finish);
        audio.removeEventListener("ended", finish);
        done();
      };
      const backup = setTimeout(finish, Math.max(0, stopAt - audio.currentTime) * 1000 + 5000);  // room for a phone that stalls while loading
      audio.addEventListener("pause", finish);
      audio.addEventListener("ended", finish);
    });
    return { ended };
  }
  // A card's word or sentence: its own recording, else the chosen voice (Settings → Card voices).
  const say = cardSayer(playSnippet);

  // ----- folders -----
  /** Make a folder (its name asked in the app's own small box). */
  async function newFolder() {
    const name = await askName(t("New folder"), t("Name for the new folder"));
    if (!name) return null;
    try {
      const f = await api("/vocab/folders", { method: "POST", body: { name } });
      folders.push(f);
      folders.splice(0, folders.length, ...sortFolders(folders));  // (in place: the open Add words box holds this list)
      renderFolderButton();
      return f;
    } catch (e) { toast(e.message, { error: true }); return null; }
  }

  async function renameFolder(f) {
    const name = await askName(t("Rename folder"), t("Folder name"), { value: f.name, ok: t("Rename") });
    if (!name || name === f.name) return false;
    try {
      Object.assign(f, await api(`/vocab/folders/${f.uid}`, { method: "PATCH", body: { name } }));
      folders.splice(0, folders.length, ...sortFolders(folders));  // (in place: the open Add words box holds this list)
      renderAll();
      return true;
    } catch (e) { toast(e.message, { error: true }); return false; }
  }

  async function deleteFolder(f) {
    if (!(await confirmBox(t("Delete the folder “{0}”?", f.name), "The words in it are kept.", { ok: "Delete", danger: true }))) return false;
    try {
      await api(`/vocab/folders/${f.uid}`, { method: "DELETE" });
      if (st.folder === f.uid) { st.folder = ""; savePrefs(); }
      await load();
      return true;
    } catch (e) { toast(e.message, { error: true }); return false; }
  }

  /** Put `items` in folder `uid` (or take them out). The list is drawn again unless `redraw` is false
   * (the open word's own Folders tool: the word stays where it is until it is closed). */
  async function applyFolder(items, uid, add, { redraw = true } = {}) {
    try {
      await api("/vocab/bulk-folders", { method: "POST",
        body: { ids: items.map((v) => v.id), add: add ? [uid] : [], remove: add ? [] : [uid] } });
      for (const v of items) {
        const set = new Set(v.folders);
        add ? set.add(uid) : set.delete(uid);
        v.folders = [...set].sort();
        v.updated_at = Date.now() / 1000;
      }
      if (redraw) renderAll(); else { renderFolderButton(); renderReview(); }
      return true;
    } catch (e) { toast(e.message, { error: true }); return false; }
  }

  /** Show folder `key` ("" every word, "none" those in no folder, else a folder's uid). */
  function chooseFolder(key) {
    if (key === st.folder) return;
    st.folder = key;
    savePrefs();
    renderAll();
  }

  /** The folder on show, in the row over the list: its name and how many words it has. */
  function renderFolderButton() {
    const b = $("#folder-pick");
    const name = b.querySelector(".vf-name");
    const own = st.folder && st.folder !== "none";
    name.textContent = !st.folder ? "All words" : st.folder === "none" ? "Not in a folder" : folderName(st.folder) || "";
    if (own) name.setAttribute("translate", "no"); else name.removeAttribute("translate");  // (a folder's name is the learner's)
    b.querySelector(".vf-n").textContent = String(folderCount(all, st.folder));
  }

  /** The folder sheet: every word, those in no folder, then each folder with its count; a tap shows it.
   * ⋯ on a folder opens its Rename / Send to a friend / Delete under it; New folder makes one. */
  function folderSheet() {
    const m = openModal({ title: t("Folders"), cls: "vf-back" });
    let actsFor = "";  // the folder whose actions are open under it
    const draw = () => {
      const box = h(`<div class="vf-list"></div>`);
      const row = (key, label, isFolder) => {
        const on = st.folder === key;
        const r = h(`<div class="vf-row${on ? " on" : ""}">
          <button type="button" class="vf-pick" aria-pressed="${on}">${isFolder ? icon("folder", 18) : key ? vocabIcon("folderout", 18) : icon("vocab", 18)}<span class="vf-label"></span><span class="vf-count">${folderCount(all, key)}</span><span class="vf-on" aria-hidden="true">${on ? icon("check", 18) : ""}</span></button>
        </div>`);
        const text = r.querySelector(".vf-label");
        text.textContent = label;
        if (isFolder) text.setAttribute("translate", "no");
        r.querySelector(".vf-pick").onclick = () => { m.close(); chooseFolder(key); };
        if (isFolder) {
          const f = folders.find((x) => x.uid === key);
          const more = h(`<button type="button" class="vf-more" title="Rename, send or delete this folder" aria-expanded="${actsFor === key}">${icon("more", 18)}</button>`);
          more.setAttribute("aria-label", t("Folder: {0}", f.name));
          more.onclick = () => { actsFor = actsFor === key ? "" : key; draw(); };
          r.append(more);
          box.append(r);
          if (actsFor === key) {
            const acts = h(`<div class="vf-acts">
              <button type="button" class="vi-btn" data-act="rename">${icon("edit", 16)}<span>Rename</span></button>
              <button type="button" class="vi-btn" data-act="send">${icon("send", 16)}<span>Send to a friend</span></button>
              <button type="button" class="vi-btn vi-btn-danger" data-act="delete">${icon("trash", 16)}<span>Delete</span></button>
            </div>`);
            acts.querySelector('[data-act="rename"]').onclick = async () => { if (await renameFolder(f) && m.el.isConnected) draw(); };
            acts.querySelector('[data-act="delete"]').onclick = async () => { if (await deleteFolder(f)) { actsFor = ""; if (m.el.isConnected) draw(); } };
            acts.querySelector('[data-act="send"]').onclick = () => {
              m.close();  // (the list of friends opens over the page)
              const at = $("#folder-pick").getBoundingClientRect();
              sendMenu(at.left, at.bottom + 4, all.filter((v) => v.folders.includes(f.uid)), f.name);
            };
            box.append(acts);
          }
          return;
        }
        r.append(h(`<span class="vf-gap" aria-hidden="true"></span>`));  // (the counts in one column with the folders')
        box.append(r);
      };
      row("", "All words", false);
      row("none", "Not in a folder", false);
      for (const f of folders) row(f.uid, f.name, true);
      const add = h(`<button type="button" class="vf-new">${icon("plus", 18)}<span>New folder</span></button>`);
      add.onclick = async () => {
        const f = await newFolder();
        if (!f) return;
        m.close();
        chooseFolder(f.uid);
      };
      box.append(add);
      m.body.replaceChildren(box);
    };
    draw();
  }

  /** Menu of folders to put the given words into (or take them out of). */
  function folderMenu(x, y, items, mode) {
    const targets = mode === "remove"
      ? folders.filter((f) => items.some((v) => v.folders.includes(f.uid)))
      : folders;
    const entries = targets.map((f) => {
      const inAll = items.every((v) => v.folders.includes(f.uid));
      if (mode === "remove") return { label: `✕ ${f.name}`, run: () => applyFolder(items, f.uid, false) };
      if (mode === "add") return { label: f.name, icon: icon("folder", 16), run: () => applyFolder(items, f.uid, true) };
      return { label: `${inAll ? "☑" : "☐"} ${f.name}`, run: () => applyFolder(items, f.uid, !inAll) };
    });
    if (mode !== "remove") {
      entries.push({ label: "＋ New folder…", run: async () => { const f = await newFolder(); if (f) applyFolder(items, f.uid, true); } });
    }
    if (!entries.length) { toast("These words aren't in any folder."); return; }
    showMenu(x, y, items.length === 1 ? items[0].text : `${items.length} words`, entries);
  }

  /** Pick a friend, then send them copies of these words (as a folder when `folderName` is set). */
  async function sendMenu(x, y, words, folderName = null) {
    if (!words.length) { toast("There are no words to send."); return; }
    let st;
    try { st = await social.friendsState(); } catch (e) { toast(e.message, { error: true }); return; }
    if (!st || !st.me.username) {
      offerFix("friends");  // (the fix popup: Settings → Friends & sharing)
      return;
    }
    if (!st.friends.length) {
      offerFix("nofriends");  // (the fix popup: the Friends page)
      return;
    }
    const what = folderName ? `the folder “${folderName}” (${words.length} words)` : `${words.length} word${words.length === 1 ? "" : "s"}`;
    showMenu(x, y, `Send ${folderName ? "folder" : `${words.length} word${words.length === 1 ? "" : "s"}`} to…`,
      st.friends.map((f) => ({
        label: `@${f.user.username}`,
        run: async () => {
          const uploaded = [];
          try {
            // Each word takes a short clip of its sentence with it, so your friend's
            // "Word" and "Sentence" buttons play exactly what yours do.
            // (A card's kept voice goes along too: cardvoice.js.)
            const withAudio = words.filter((v) => hasOwnAudio(v) || voiceTimes(v)).slice(0, social.MAX_SHARE_CLIPS);
            if (withAudio.length) toast(`Preparing audio for ${withAudio.length} word${withAudio.length === 1 ? "" : "s"}…`, { timeout: 2500 });
            const clips = new Map();
            for (const v of withAudio) {
              const clip = await shareClip(v);
              if (!clip) continue;
              const path = await social.uploadClip(f.user.id, clip.blob);
              uploaded.push(path);
              clips.set(v.id, { clip: path, times: clip.times });
            }
            await social.sendShare(f.user.id, { folder: folderName, words: words.map((v) => ({ ...v, ...(clips.get(v.id) || {}) })) });
            const audioNote = clips.size === words.length ? " with audio" : clips.size ? ` (${clips.size} with audio)` : "";
            toast(`Sent ${what}${audioNote} to ${f.user.username}.`, { action: { label: "Open chat", run: () => (location.hash = `#/chat/${f.user.id}`) } });
          } catch (e) {
            social.removeShareClips({ words: uploaded.map((clip) => ({ clip })) }).catch(() => {});
            toast(e.message, { error: true });
          }
        },
      })));
  }

  /** Delete `words` (asked first: one word as before, saying so when its Anki card would go too; several
   * in one question). */
  async function removeWords(words) {
    if (!words.length) return;
    if (words.length === 1) {
      if (!(await confirmDelete(words[0]))) return;
    } else {
      let anki = false;
      try { anki = !!(await api("/anki/sync/status")).enabled; } catch { /* no sync on this device */ }
      const ok = await confirmBox(t("Delete {0} words from your vocab?", words.length),
        anki ? "Any of their cards in Anki go too at the next sync, with those cards' review history." : "", { ok: "Delete", danger: true });
      if (!ok) return;
    }
    if (open && words.includes(open.v)) closeOpen();
    const gone = new Set();
    for (const v of words) {
      try { await api(`/vocab/${v.id}`, { method: "DELETE" }); gone.add(v); } catch (e) { toast(e.message, { error: true }); break; }
    }
    all = all.filter((x) => !gone.has(x));
    for (const v of gone) selected.delete(v.id);
    if (gone.size > 1) toast(t("Deleted {0} words.", gone.size), { timeout: 2500 });
    if (selecting && !selected.size) setSelecting(false);
    renderAll();
  }

  // ----- the sort and filter sheet -----
  function renderSortButton() {
    const b = $("#sort-pick");
    const on = narrowed(st);
    b.classList.toggle("on", on);
    b.querySelector(".vt-dot").hidden = !on;
  }

  /** Sort (the order) and Show words (added or changed, and when): a tap changes the list behind at once. */
  function sortSheet() {
    const m = openModal({ title: t("Sort and filter"), cls: "vs-back" });
    m.body.innerHTML = `<div class="vs">
      <section class="vs-sec"><h3 class="vs-h">Sort</h3>
        <div class="vs-opts" data-k="sort">${Object.entries(SORTS).map(([k, [label]]) => `<button type="button" class="vs-opt" data-v="${k}">${label}</button>`).join("")}</div></section>
      <section class="vs-sec"><h3 class="vs-h">Show words</h3>
        <div class="vs-seg" data-k="dateField"><button type="button" class="vs-opt" data-v="added">Added</button><button type="button" class="vs-opt" data-v="changed">Changed</button></div>
        <div class="vs-opts" data-k="range">${Object.entries(RANGES).map(([k, label]) => `<button type="button" class="vs-opt" data-v="${k}">${label}</button>`).join("")}</div>
        <div class="vs-dates" hidden><input type="date" class="vs-from" aria-label="From"><span class="muted">to</span><input type="date" class="vs-to" aria-label="To"></div>
      </section>
      <div class="vs-foot"><button type="button" class="ghost vs-reset">Reset</button><button type="button" class="primary vs-done">Done</button></div>
    </div>`;
    const box = m.body.firstElementChild;
    const from = box.querySelector(".vs-from"), to = box.querySelector(".vs-to");
    const paint = () => {
      for (const group of box.querySelectorAll("[data-k]")) {
        for (const b of group.querySelectorAll(".vs-opt")) {
          const on = st[group.dataset.k] === b.dataset.v;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", String(on));
        }
      }
      box.querySelector(".vs-dates").hidden = st.range !== "custom";
      from.value = st.from;
      to.value = st.to;
      box.querySelector(".vs-reset").disabled = !changedView(st);
    };
    const changed = () => { savePrefs(); paint(); renderAll(); };
    for (const group of box.querySelectorAll("[data-k]")) {
      for (const b of group.querySelectorAll(".vs-opt")) b.onclick = () => { st[group.dataset.k] = b.dataset.v; changed(); };
    }
    from.onchange = () => { st.from = from.value; changed(); };
    to.onchange = () => { st.to = to.value; changed(); };
    box.querySelector(".vs-reset").onclick = () => { Object.assign(st, VIEW_DEFAULTS); changed(); };
    box.querySelector(".vs-done").onclick = () => m.close();
    paint();
  }

  // ----- selecting several words -----
  /** Select on or off. `first`: a word to tick at once (the word held down to start it). */
  function setSelecting(on, first = null) {
    if (on) closeOpen();  // (an open word is put away, saved)
    else selected.clear();
    selecting = on;
    if (first) selected.add(first.id);
    page.classList.toggle("selecting", on);
    $("#vbar").hidden = on;
    $("#bulk").hidden = !on;
    $("#select-mode").setAttribute("aria-pressed", String(on));
    for (const el of list.querySelectorAll(".vocab-item")) if (el.__pick) el.__pick();
    renderBulk();
  }

  function renderBulk() {
    for (const id of [...selected]) if (!all.some((v) => v.id === id)) selected.delete(id);
    $("#bulk-count").textContent = selected.size ? t("{0} selected", selected.size) : "Tap words to select them";
    // "Select all" ticks every word listed; once they all are, the same button unticks them.
    const every = shown.length > 0 && shown.every((v) => selected.has(v.id));
    const button = $("#select-all");
    button.hidden = shown.length === 0;
    button.textContent = every ? "Deselect all" : t("Select all {0}", shown.length);
    button.title = every ? "Untick every word listed below" : "Tick every word listed below, to file or send them together";
    const picked = pickedItems();
    for (const id of ["#bulk-add", "#bulk-send", "#bulk-delete"]) $(id).disabled = !picked.length;
    $("#bulk-remove").disabled = !picked.some((v) => v.folders.length);
  }

  // ----- items -----
  const ankiProgress = await loadAnkiProgress();  // each word's review progress in Anki, when the deck is synced
  // A word is a short card: the word, its meaning, the bit of its sentence around it and its play
  // buttons. A tap opens it in place with every tool of a review card's back (components/wordeditor.js);
  // one card is open at a time, and it stays open when the list is drawn again.
  let openId = null;
  let open = null;   // the open card: {v, el, editor}
  /** Put the open card away (an open text box saved first). */
  function closeOpen() {
    if (!open) return;
    const o = open;
    open = null;
    openId = null;
    o.editor.close();
    if (o.el.__closed) o.el.__closed();
  }
  /** What the open word's editor needs of the page. */
  const editorDeps = (v) => ({
    say,
    folders: () => folders,
    setFolder: (w, uid, on) => applyFolder([w], uid, on, { redraw: false }),
    newFolder,
    send: (w, x, y) => sendMenu(x, y, [w]),
    remove: (w) => removeWords([w]),
    changed: () => renderReview(),  // (a meaning typed in makes the word a card to review)
    refreshQuick,
    ankiLine: ankiProgressLine(ankiProgress[v.uid || v.id]),
  });

  function item(v) {
    const el = h(`<div class="card vocab-item${justAdded.has(v.id) ? " vi-new" : ""}">
      <div class="vi-head">
        <input type="checkbox" class="pick" tabindex="-1" aria-hidden="true">
        <div class="vi-main"></div>
        <button type="button" class="ghost icon vi-chev">${icon("chevron", 20)}</button>
      </div>
    </div>`);
    const head = el.querySelector(".vi-head"), main = el.querySelector(".vi-main");
    const chev = el.querySelector(".vi-chev"), pick = el.querySelector(".pick");
    const isOpen = () => !!open && open.el === el;

    // ----- closed: the word, its meaning, its sentence and Word / Sentence -----
    let pw = null, ps = null, quick = null;
    function drawClosed() {
      const lang = langAttrs(detectLanguage(v.sentence || v.text));
      main.innerHTML = `<div class="word" ${lang}></div>
        <div class="vi-meaning" translate="no"></div>
        ${v.sentence ? `<div class="sentence" ${lang}>${highlight(cardSentence(v.sentence, v.text), v.text)}</div>` : ""}
        <div class="vi-quick" hidden>
          <button type="button" class="play-word" hidden>${icon("sound", 15)} Word</button>
          <button type="button" class="play-sent" hidden>${icon("sound", 15)} Sentence</button>
        </div>`;
      main.querySelector(".word").textContent = v.text;
      const meaning = main.querySelector(".vi-meaning");
      meaning.textContent = v.meaning || "";
      meaning.hidden = !String(v.meaning || "").trim();
      meaning.dir = "auto";
      quick = main.querySelector(".vi-quick");
      pw = main.querySelector(".play-word");
      ps = main.querySelector(".play-sent");
      // (Never fails: at worst one calm message, see voiceplay.js. Afterwards every card is checked
      // again, since a recording that failed is shared by all the cards from its episode.)
      pw.onclick = () => say(v, "word").finally(refreshQuick);
      ps.onclick = () => say(v, "sentence").finally(refreshQuick);
      paintQuick();
    }
    // Word and Sentence: shown when the card can be heard on this device: its own recording when this
    // device can play it, else its kept voice, else the voice chosen in Settings (cardvoice.js canSay).
    // Drawn again when that changes: a recording that failed to load, or no voice for the language here.
    function paintQuick() {
      if (!quick) return;
      const voice = voiceHere(cardLanguage(v));
      pw.hidden = !canSay(v, "word", voice);
      ps.hidden = !canSay(v, "sentence", voice);
      quick.hidden = pw.hidden && ps.hidden;
    }
    el.__quick = () => (isOpen() ? open.editor.paintQuick() : paintQuick());

    // ----- open and closed -----
    function setHead(opened) {
      el.classList.toggle("open", opened);
      if (opened || selecting) {
        head.removeAttribute("aria-expanded");
      } else head.setAttribute("aria-expanded", "false");
      if (!opened) { head.setAttribute("role", selecting ? "checkbox" : "button"); head.tabIndex = 0; }
      else { head.removeAttribute("role"); head.removeAttribute("tabindex"); }
      chev.setAttribute("aria-expanded", String(opened));
      chev.setAttribute("aria-label", opened ? "Close" : "Open");
      chev.title = opened ? "Close (Esc)" : "Open";
      chev.tabIndex = opened ? 0 : -1;  // (closed, the card itself is the button)
    }
    function openIt() {
      if (isOpen() || selecting) return;
      closeOpen();
      quick = null;
      openId = v.id;
      open = { v, el, editor: openWordEditor(el, v, editorDeps(v)) };
      setHead(true);
    }
    el.__closed = () => { setHead(false); drawClosed(); };

    // ----- ticked in Select -----
    el.__pick = () => {
      const on = selected.has(v.id);
      el.classList.toggle("picked", selecting && on);
      pick.checked = on;
      if (selecting) head.setAttribute("aria-checked", String(on)); else head.removeAttribute("aria-checked");
      setHead(isOpen());
    };
    const togglePick = () => {
      selected.has(v.id) ? selected.delete(v.id) : selected.add(v.id);
      el.__pick();
      renderBulk();
    };

    // A tap: in Select it ticks the word; else, on a closed card, it opens it (its own buttons do their
    // own thing); on the open one, its texts and tools are the editor's, and the arrow closes it.
    let heldAt = 0;
    head.addEventListener("click", (e) => {
      if (Date.now() - heldAt < 700) { heldAt = 0; return; }  // (the click after a hold that started Select)
      if (selecting) { e.preventDefault(); togglePick(); return; }
      if (e.target.closest(".vi-chev")) { isOpen() ? closeOpen() : openIt(); return; }
      if (isOpen() || e.target.closest("input, button, a, textarea, select")) return;
      openIt();
    });
    head.addEventListener("keydown", (e) => {
      if (e.target !== head || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      if (selecting) togglePick(); else openIt();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !isOpen() || e.target.closest("textarea, input")) return;
      e.preventDefault();
      closeOpen();
      head.focus({ preventScroll: true });
    });
    // Holding a closed card down starts Select with it ticked (moving 8 px, a scroll, doesn't).
    let press = null;
    const endPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
    head.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || selecting || isOpen() || e.target.closest("button, a, input")) return;
      const p = { x: e.clientX, y: e.clientY, id: e.pointerId };
      p.timer = setTimeout(() => {
        if (press !== p) return;
        press = null;
        heldAt = Date.now();
        buzz("tick");
        setSelecting(true, v);
      }, PICK_HOLD_MS);
      press = p;
    });
    head.addEventListener("pointermove", (e) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) endPress();
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) head.addEventListener(type, endPress);
    head.addEventListener("contextmenu", (e) => { if (!isOpen()) e.preventDefault(); });  // (a phone's own long-press menu)

    drawClosed();
    el.__pick();
    if (openId === v.id && !selecting) openIt();
    return el;
  }

  function visible() {
    let items = all;
    if (st.folder === "none") items = items.filter((v) => !v.folders.length);
    else if (st.folder) items = items.filter((v) => v.folders.includes(st.folder));
    const [from, to] = rangeBounds(st.range, st.from, st.to);
    const when = (v) => (st.dateField === "changed" ? v.updated_at || v.created_at : v.created_at);
    if (from !== null) items = items.filter((v) => when(v) >= from);
    if (to !== null) items = items.filter((v) => when(v) < to);
    const sorted = [...items].sort(SORTS[st.sort][1]);
    if (!justAdded.size) return sorted;
    const fresh = sorted.filter((v) => justAdded.has(v.id)).sort((a, b) => b.created_at - a.created_at);  // in the order typed
    return [...fresh, ...sorted.filter((v) => !justAdded.has(v.id))];
  }

  // ----- the reviewer -----
  /** The words a review covers: the open folder's, or all of them. Never narrowed by the search box or the dates. */
  const reviewWords = () => (st.folder && st.folder !== "none" ? all.filter((v) => v.folders.includes(st.folder)) : all);

  function renderReview() {
    const banner = $("#review");
    banner.hidden = Boolean(st.q);
    // No words yet (or none in the open folder): the box stays where it always is, in its usual colour
    // (the owner: "colored as if it did have words"), with nothing to start.
    const none = !reviewWords().length;
    banner.disabled = none;
    if (banner.hidden || none) {
      goal.close(); $("#goal").hidden = true; $("#send-slot").hidden = true;
      if (banner.hidden) return;
      banner.classList.remove("idle");
      banner.querySelector("strong").textContent = "Review";
      banner.querySelector(".rb-go").textContent = "";
      banner.querySelector(".rb-sub").innerHTML = `<span class="rb-run"></span>`;
      banner.querySelector(".rb-run").textContent = "No cards to study";
      fitReview();
      return;
    }
    const o = overview(reviewWords(), log);
    $("#goal").hidden = !o.askable;
    $("#send-slot").hidden = !o.askable;  // ("Send to …" goes with the goal; "Add words" beside it is always there)
    goal.update(all, log);  // the whole day's goal, whichever folder is open
    const scope = st.folder && st.folder !== "none" ? folderName(st.folder) : "";
    const ready = o.due + o.fresh > 0;
    banner.classList.toggle("idle", !ready);
    banner.querySelector("strong").textContent = scope ? `Review “${scope}”` : "Review";
    banner.querySelector(".rb-go").textContent = ready ? "Start" : "Open";
    const parts = [];
    if (o.due) parts.push(`<b>${o.due}</b> due`);
    if (o.fresh) parts.push(`<b>${o.fresh}</b> new`);
    banner.querySelector(".rb-sub").innerHTML = `<span class="rb-run">${ready ? parts.join(" · ")
      : !o.askable ? "Words that have a meaning turn up here as flashcards."
      : `All caught up${o.next ? ` · ${o.next.count} word${o.next.count === 1 ? "" : "s"} back ${o.next.days === 1 ? "" : "in "}${waitText(o.next.days)}` : ""}`}</span>`;
    fitReview();
  }

  /** The banner's line stops before its button. When it is longer than the room it has, it
   * slides along to its end and back by itself (review.css), at an easy reading pace. */
  function fitReview() {
    const line = $("#review .rb-sub");
    line.classList.remove("scroll");
    const hidden = line.scrollWidth - line.clientWidth;  // how much of the line doesn't fit
    if (!line.clientWidth || hidden < 2) return;
    line.style.setProperty("--rb-shift", `${-(hidden + 4)}px`);
    line.style.setProperty("--rb-time", `${Math.max(6, 5 + hidden / 20)}s`);
    line.classList.add("scroll");
  }
  // The room changes with the window (and is nothing at all while the page is hidden).
  const reviewRoom = new ResizeObserver(fitReview);
  reviewRoom.observe($("#review"));
  // The day's goal under the banner; changing its new words a day changes the banner's "new" count too.
  // Its "Send to …" link sits in the row under it, beside "Add words".
  const goal = goalBar($("#goal"), { sendSlot: $("#send-slot") });
  $("#goal").addEventListener("goalchange", renderReview);

  function startReview() {
    closeOpen();  // (its edits saved: the cards show them)
    openReview({
      words: reviewWords(), allWords: all, log, playSnippet, say, highlight,
      scope: st.folder && st.folder !== "none" ? folderName(st.folder) || "" : "",
      onDelete: (v) => { all = all.filter((x) => x !== v); selected.delete(v.id); },  // a word deleted from its card
      onClose: () => { audio.pause(); stopDevice(); if (view.isConnected) renderAll(); },  // meanings and notes may have been edited on a card
    });
  }

  // The rows are drawn a few at a time as the end of the list comes near, so a list of thousands (a DLI
  // course's whole vocabulary) opens at once. The open word's row is always among the first drawn.
  const ROWS = 150;
  let moreRows = null;
  function drawRows(items) {
    if (moreRows) { moreRows.disconnect(); moreRows = null; }
    let drawn = 0;
    const draw = (upto) => {
      const frag = document.createDocumentFragment();
      for (const end = Math.min(items.length, upto); drawn < end; drawn++) frag.append(item(items[drawn]));
      list.append(frag);
    };
    const openAt = openId == null ? -1 : items.findIndex((v) => v.id === openId);
    draw(Math.max(ROWS, openAt + 1));
    if (drawn >= items.length) return;
    if (typeof IntersectionObserver === "undefined") { draw(items.length); return; }
    const mark = h(`<div class="vlist-more" aria-hidden="true"></div>`);
    list.append(mark);
    moreRows = new IntersectionObserver((seen) => {
      if (!seen.some((e) => e.isIntersecting)) return;
      moreRows.unobserve(mark);
      mark.remove();
      draw(drawn + ROWS);
      if (drawn < items.length) { list.append(mark); moreRows.observe(mark); } else { moreRows.disconnect(); moreRows = null; }
    }, { rootMargin: "1200px 0px" });
    moreRows.observe(mark);
  }

  function renderAll() {
    if (st.folder && st.folder !== "none" && !folderName(st.folder)) st.folder = "";
    // The open card is put away (saved) and opened again in the new list, if it is still in it.
    const reopen = openId;
    closeOpen();
    openId = reopen;
    renderFolderButton();
    renderSortButton();
    const items = visible();
    const filtered = items.length !== all.length;
    $("#count").textContent = `${items.length}${filtered ? ` of ${all.length}` : ""} item${items.length === 1 ? "" : "s"}`;
    list.innerHTML = "";
    if (!items.length) {
      list.append(h(`<div class="empty">${all.length ? "No words match these filters." : st.q ? "No matches." : `No saved words yet.<p class="small">${TIP}</p>`}</div>`));
    }
    drawRows(items);
    if (!open) openId = null;  // (no longer listed: it stays closed)
    shown = items;
    renderBulk();
    renderReview();
  }

  /** Check every listed card's Word and Sentence buttons again (see item()). */
  function refreshQuick() {
    for (const el of list.querySelectorAll(".vocab-item")) if (el.__quick) el.__quick();
  }

  async function load() {
    const [items, fl, answers] = await Promise.all([
      api(`/vocab${st.q ? `?q=${encodeURIComponent(st.q)}` : ""}`),
      api("/vocab/folders"),
      loadLog().catch(() => log),  // the list still works if the reviewer's record can't be read
    ]);
    log = answers;
    // (the open word keeps its own copy: the one being edited)
    all = items.map((v) => (open && open.v.id === v.id ? open.v : { ...v, folders: v.folders || [] }));
    folders = sortFolders(fl);
    renderAll();
    // Whether this device has a voice for the cards' languages (a moment's work, asked once): a card
    // with nothing it can play, in a language with no voice here, then shows no buttons.
    learnVoices(all.map(cardLanguage)).then((changed) => { if (changed && view.isConnected) refreshQuick(); }, () => {});
  }

  // ----- wiring -----
  $("#review").onclick = startReview;
  const pickedItems = () => all.filter((v) => selected.has(v.id));
  const below = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [r.left, r.bottom + 4]; };
  $("#folder-pick").onclick = folderSheet;
  // The controller's shoulder buttons (padscreens.js): the folder before or after the one on show.
  $("#folder-pick").addEventListener("folderstep", (e) => chooseFolder(stepFolder(st.folder, folders, e.detail)));
  $("#sort-pick").onclick = sortSheet;
  $("#select-mode").onclick = () => setSelecting(!selecting);
  $("#bulk-done").onclick = () => setSelecting(false);
  $("#bulk-add").onclick = (e) => folderMenu(...below(e), pickedItems(), "add");
  $("#bulk-remove").onclick = (e) => folderMenu(...below(e), pickedItems(), "remove");
  $("#bulk-send").onclick = (e) => sendMenu(...below(e), pickedItems());
  $("#bulk-delete").onclick = () => removeWords(pickedItems());
  $("#select-all").onclick = () => {
    const every = shown.every((v) => selected.has(v.id));
    for (const v of shown) every ? selected.delete(v.id) : selected.add(v.id);
    for (const el of list.querySelectorAll(".vocab-item")) if (el.__pick) el.__pick();
    renderBulk();
  };

  let debounce;
  $("#q").oninput = (e) => { clearTimeout(debounce); debounce = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 200); };
  const exportUrl = (fmt) => {
    const ids = visible().map((v) => v.id);
    return `/api/vocab/export/${fmt}${ids.length === all.length && !st.q ? "" : `?ids=${encodeURIComponent(ids.join(","))}`}`;
  };
  // "Export for Anki" is an Anki deck file (.apkg) on every device: the cards, their layout and
  // each word's audio in one file that Anki and AnkiDroid import.
  const exportAnki = async () => {
    if (!(await ankiHelp())) return;
    toast("Building the Anki deck with audio…", { timeout: 4000 });
    download(exportUrl("apkg"), "tamkeen-vocab.apkg");
  };
  // "Add words": the card builder (components/wordbuilder.js). The open folder's cards go into it; the
  // new cards come first in the list, lit up for a moment, whatever it is sorted by. "Scan words" opens
  // it on Scan (a photo of a list, components/wordscan.js).
  const openAdd = (mode = "one") => openWordBuilder({
    mode,
    existing: () => all,
    folders,
    folder: st.folder && st.folder !== "none" ? st.folder : "",
    onFolder: (f) => {  // a folder made in the builder shows among the folders at once
      if (folders.some((x) => x.uid === f.uid)) return;
      folders.push(f);
      folders.splice(0, folders.length, ...sortFolders(folders));  // (in place: the open Add words box holds this list)
      if (view.isConnected) renderFolderButton();
    },
    onAdded: (cards) => {
      justAdded = new Set(cards.map((v) => v.id));
      if (view.isConnected) load().then(() => list.firstElementChild && list.firstElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" }), () => {});
    },
  });
  $("#add-words").onclick = () => openAdd();
  // The ⋯ menu: the things used now and then.
  $("#more").onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 6, "", [
      { label: "Add words", icon: icon("plus", 16), run: () => openAdd() },
      { label: "Scan words", icon: icon("camera", 16), run: () => openAdd("scan") },
      { label: "Export CSV", icon: icon("page", 16), run: () => download(exportUrl("csv"), "tamkeen-vocab.csv") },
      { label: "Export for Anki", icon: icon("send", 16), run: exportAnki },
      ...(ankiSyncHere() ? [ // (no Anki sync on the iPhone or in the web app: only the export)
        { label: ankiSettingsLabel(), icon: icon("settings", 16), run: () => { location.hash = ANKI_SETTINGS; } },  // Settings, at its Anki part
        { label: MOVE_LABEL, icon: icon("folder", 16), run: moveToLanguageDecks },
      ] : []),
    ]);
  };
  await load();

  firstVisitTour("vocab", page, [
    { target: "#review", title: "Review",
      text: "Your saved words as flashcards. It shows how many are due today and how many are new: press it to start." },
    { target: "#goal", title: "Daily goal", text: "How many new words you want to learn each day. Change it here." },
    { target: "#add-words", title: "Add words",
      text: "Type or paste new words, one or many at a time, or scan a photo of a list. Tamkeen can fill in their meanings, example sentences and audio, or you can." },
    { target: "#q", title: "Search", text: "Find a saved word by the word itself or by its meaning." },
    { target: "#folder-pick", title: "Folders",
      text: "The folder on show. Tap it to choose another, or to make, rename or send one; Review then covers just its words." },
    { target: "#sort-pick", title: "Sort and filter", text: "Change the order, or show only the words added or changed on certain days." },
    { target: "#select-mode", title: "Select", text: "Tick several words to put them in a folder, send them to a friend or delete them together." },
    { target: "#list .vocab-item", title: "A saved word",
      text: "Tap a word to open it: hear it, put any part of it right, make a mnemonic, or find it an example sentence." },
    { target: "#more", title: "More", text: "Add words, scan words from a photo, export your words for Anki or as a spreadsheet, and Anki's settings." },
  ]);
  return () => { closeOpen(); audio.pause(); stopDevice(); cancelAnimationFrame(raf); reviewRoom.disconnect(); goal.close(); };
}
