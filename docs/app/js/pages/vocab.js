// Vocab list: saved words/phrases with their sentence, notes, audio replay and export.
// Words can be filed in any number of folders; the list can be sorted and filtered by when
// a word was added or last changed.

import { api, esc, h, toast, download, fmtDate, audioUrl, showMenu, shareClip, clipUrl, platform } from "../app.js";
import { ANKI_SETTINGS, MOVE_LABEL, ankiProgressLine, ankiSettingsLabel, ankiSyncHere, confirmDelete, loadAnkiProgress, moveToLanguageDecks } from "../components/ankisync.js";
import { formatTime } from "../wordlookup.js";
import { detectLanguage, langAttrs, langInfo, studyLanguage } from "../languages.js";
import * as social from "../social.js";
import { icon } from "../icons.js";
import { cardSentence, findWord } from "../cardtext.js";
import { audioKey, canSay, failedHere, hasOwnAudio, loadError, voiceTimes } from "../cardvoice.js";
import { cardLanguage, cardSayer, learnVoices, stopDevice, voiceHere } from "../voiceplay.js";
import { CARDS_ICON, loadLog, openReview, overview } from "./review.js";
import { waitText } from "../review/deck.js";
import { goalBar } from "../review/goalbar.js";
import { firstVisitTour } from "../components/tour.js";
import { openWordBuilder } from "../components/wordbuilder.js";

const DAY = 86400;
const SORTS = {
  added_desc: ["Newest first", (a, b) => b.created_at - a.created_at],
  added_asc: ["Oldest first", (a, b) => a.created_at - b.created_at],
  changed_desc: ["Recently changed", (a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at)],
  changed_asc: ["Least recently changed", (a, b) => (a.updated_at || a.created_at) - (b.updated_at || b.created_at)],
  alpha: ["A–Z", (a, b) => a.text.localeCompare(b.text, studyLanguage())],
};
const RANGES = { any: "Any time", today: "Today", week: "Last 7 days", month: "Last 30 days", year: "Last 12 months", custom: "Between dates…" };

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
  // Found whatever its vowel marks: a word saved with them sits unvowelled in a web page's text.
  const at = findWord(sentence, word);
  if (!at) return esc(sentence);
  return `${esc(sentence.slice(0, at[0]))}<b>${esc(sentence.slice(at[0], at[1]))}</b>${esc(sentence.slice(at[1]))}`;
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
  Or type your own with Add words, above: one at a time or a whole list.`;

export async function render(view) {
  const prefs = lsGet("vocabView", {});
  const st = {
    folder: prefs.folder || "",           // "" = all, "none" = not in any folder, else a folder uid
    sort: SORTS[prefs.sort] ? prefs.sort : "added_desc",
    dateField: prefs.dateField === "changed" ? "changed" : "added",
    range: RANGES[prefs.range] ? prefs.range : "any",
    from: prefs.from || "",
    to: prefs.to || "",
    q: "",
  };
  const savePrefs = () => lsSet("vocabView", { folder: st.folder, sort: st.sort, dateField: st.dateField,
                                               range: st.range, from: st.from, to: st.to });

  // The owner's layout (2026-10-16): the Review block first and bold, so the day's task is the first
  // thing seen; then search and folders; each word a short card that opens on a tap; the less used
  // things (adding a word by hand, the exports, Anki's settings) in the ⋯ menu.
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
        <button type="button" class="ghost va-add" id="add-words" title="Type or paste new words: Tamkeen can fill in their meanings, example sentences and audio">${icon("plus", 18)} Add words</button>
      </div>
    </section>
    <input type="search" id="q" class="vocab-search" placeholder="Search vocab… ${esc(langInfo(studyLanguage()).search)}" dir="auto">
    <div class="folder-bar" id="folders"></div>
    <div class="row vocab-filters">
      <label class="small muted">Sort
        <select id="sort">${Object.entries(SORTS).map(([k, [label]]) => `<option value="${k}">${label}</option>`).join("")}</select></label>
      <label class="small muted">Show words
        <select id="date-field"><option value="added">added</option><option value="changed">changed</option></select></label>
      <select id="range">${Object.entries(RANGES).map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}</select>
      <span id="custom-range" class="row" hidden>
        <input type="date" id="from" aria-label="From"> <span class="small muted">to</span> <input type="date" id="to" aria-label="To">
      </span>
      <span class="spacer"></span>
      <button type="button" id="select-all" hidden>Select all</button>
    </div>
    <div class="bulk-bar" id="bulk" hidden>
      <span id="bulk-count"></span>
      <button type="button" id="bulk-add">${icon("folder", 16)} Add to folder</button>
      <button type="button" id="bulk-remove">Remove from folder</button>
      <button type="button" id="bulk-send">📨 Send to a friend</button>
      <span class="spacer"></span>
      <button type="button" class="ghost" id="bulk-clear">Clear selection</button>
    </div>
    <div class="vocab-list" id="list"></div>
  </div>`));
  const $ = (s) => view.querySelector(s);
  const list = $("#list");

  let all = [];      // every word matching the search box
  let folders = [];  // [{uid, name}]
  let log = {};      // the reviewer's record: every answer by word uid (see pages/review.js)
  const selected = new Set();
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
  async function newFolder() {
    const name = prompt("Name for the new folder:");
    if (!name || !name.trim()) return null;
    try {
      const f = await api("/vocab/folders", { method: "POST", body: { name: name.trim() } });
      folders.push(f);
      folders.sort((a, b) => a.name.localeCompare(b.name));
      return f;
    } catch (e) { toast(e.message, { error: true }); return null; }
  }

  function renderFolders() {
    const bar = $("#folders");
    bar.innerHTML = "";
    const count = (uid) => all.filter((v) => (uid === "none" ? !v.folders.length : v.folders.includes(uid))).length;
    const chip = (key, label, n, isFolder = false) => {
      const b = h(`<button type="button" class="folder-chip${st.folder === key ? " active" : ""}">${isFolder ? `${icon("folder", 15)} ` : ""}<span></span> <span class="n">${n}</span></button>`);
      b.querySelector("span").textContent = label;
      b.onclick = () => { st.folder = key; savePrefs(); renderAll(); };
      bar.append(b);
    };
    chip("", "All words", all.length);
    chip("none", "Not in a folder", count("none"));
    for (const f of folders) chip(f.uid, f.name, count(f.uid), true);
    const add = h(`<button type="button" class="folder-chip ghost">＋ New folder</button>`);
    add.onclick = async () => { const f = await newFolder(); if (f) { st.folder = f.uid; savePrefs(); renderAll(); } };
    bar.append(add);
    const current = folders.find((f) => f.uid === st.folder);
    if (current) {
      const rn = h(`<button type="button" class="ghost small-btn">Rename</button>`);
      rn.onclick = async () => {
        const name = prompt("Rename folder:", current.name);
        if (!name || !name.trim() || name.trim() === current.name) return;
        try {
          Object.assign(current, await api(`/vocab/folders/${current.uid}`, { method: "PATCH", body: { name: name.trim() } }));
          renderAll();
        } catch (e) { toast(e.message, { error: true }); }
      };
      const del = h(`<button type="button" class="ghost danger small-btn">Delete folder</button>`);
      del.onclick = async () => {
        if (!confirm(`Delete the folder “${current.name}”? The words in it are kept.`)) return;
        try {
          await api(`/vocab/folders/${current.uid}`, { method: "DELETE" });
          st.folder = "";
          savePrefs();
          await load();
        } catch (e) { toast(e.message, { error: true }); }
      };
      const share = h(`<button type="button" class="ghost small-btn">📨 Send folder to a friend</button>`);
      share.onclick = (e) => {
        const words = all.filter((v) => v.folders.includes(current.uid));
        const r = e.currentTarget.getBoundingClientRect();
        sendMenu(r.left, r.bottom + 4, words, current.name);
      };
      bar.append(rn, del, share);
    }
  }

  /** Menu of folders to put the given words into (or take them out of). */
  function folderMenu(x, y, items, mode) {
    const targets = mode === "remove"
      ? folders.filter((f) => items.some((v) => v.folders.includes(f.uid)))
      : folders;
    const apply = async (uid, add) => {
      try {
        await api("/vocab/bulk-folders", { method: "POST",
          body: { ids: items.map((v) => v.id), add: add ? [uid] : [], remove: add ? [] : [uid] } });
        for (const v of items) {
          const set = new Set(v.folders);
          add ? set.add(uid) : set.delete(uid);
          v.folders = [...set].sort();
          v.updated_at = Date.now() / 1000;
        }
        renderAll();
      } catch (e) { toast(e.message, { error: true }); }
    };
    const entries = targets.map((f) => {
      const inAll = items.every((v) => v.folders.includes(f.uid));
      if (mode === "remove") return { label: `✕ ${f.name}`, run: () => apply(f.uid, false) };
      if (mode === "add") return { label: f.name, icon: icon("folder", 16), run: () => apply(f.uid, true) };
      return { label: `${inAll ? "☑" : "☐"} ${f.name}`, run: () => apply(f.uid, !inAll) };
    });
    if (mode !== "remove") {
      entries.push({ label: "＋ New folder…", run: async () => { const f = await newFolder(); if (f) apply(f.uid, true); } });
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
      toast("Connect and choose a username first.", { action: { label: "Settings", run: () => (location.hash = "#/settings?s=account&show=friends") } });
      return;
    }
    if (!st.friends.length) {
      toast("Add a friend first.", { action: { label: "Friends", run: () => (location.hash = "#/friends") } });
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

  // ----- items -----
  const ankiProgress = await loadAnkiProgress();  // each word's review progress in Anki, when the deck is synced
  // A word is a short card: the word, its meaning, the bit of its sentence around it and its play
  // buttons. A tap opens it in place for editing (meaning, grammar notes, personal notes, folders, delete); one
  // card is open at a time, and it stays open when the list is drawn again.
  let openId = null;
  function item(v) {
    const changed = v.updated_at && v.updated_at - v.created_at > 60;
    const lang = langAttrs(detectLanguage(v.sentence || v.text));
    const translation = String(v.translation || "").replace(/[⟦⟧]/g, "").trim();
    const el = h(`<div class="card vocab-item${justAdded.has(v.id) ? " vi-new" : ""}">
      <div class="vi-head" role="button" tabindex="0" aria-expanded="false">
        <input type="checkbox" class="pick" aria-label="Select word">
        <div class="vi-main">
          <div class="word" ${lang}></div>
          <div class="vi-meaning"></div>
          ${v.sentence ? `<div class="sentence" ${lang}>${highlight(cardSentence(v.sentence, v.text), v.text)}</div>` : ""}
          <div class="vi-quick" hidden>
            <button type="button" class="play-word" hidden>${icon("sound", 15)} Word</button>
            <button type="button" class="play-sent" hidden>${icon("sound", 15)} Sentence</button>
          </div>
        </div>
        <span class="vi-chev" aria-hidden="true">${icon("chevron", 20)}</span>
      </div>
      <div class="vi-body" hidden>
        <div class="small muted">
          ${v.episode_id ? `<a href="#/episode/${v.episode_id}?t=${v.start ?? 0}">${esc(v.episode_title || "Episode")}</a>` : esc(v.episode_title || "Added manually")}
          ${v.episode_id && v.start != null ? ` · ${formatTime(v.start)}` : ""} · added ${fmtDate(v.created_at)}${changed ? ` · changed ${fmtDate(v.updated_at)}` : ""}
        </div>
        ${ankiProgressLine(ankiProgress[v.uid || v.id])}
        <div class="item-folders"></div>
        ${translation ? `<div class="vi-translation small"></div>` : ""}
        <input type="text" class="meaning" placeholder="Meaning" aria-label="Meaning">
        <textarea class="notes" rows="2" placeholder="Grammar notes (root, grammar, usage…)" aria-label="Grammar notes"></textarea>
        <textarea class="memo" rows="1" placeholder="Personal notes (a mnemonic, where you heard it…)" aria-label="Personal notes"></textarea>
        <div class="row vi-actions">
          <button type="button" class="ghost folders-btn">${icon("folder", 16)} Folders</button>
          <span class="spacer"></span>
          <span class="small muted saved" hidden>Saved</span>
          <button type="button" class="ghost danger del">Delete</button>
        </div>
      </div>
    </div>`);
    el.querySelector(".word").textContent = v.text;
    const shownMeaning = el.querySelector(".vi-meaning");
    shownMeaning.textContent = v.meaning;
    shownMeaning.hidden = !v.meaning;
    if (translation) el.querySelector(".vi-translation").textContent = translation;
    el.querySelector(".meaning").value = v.meaning;
    el.querySelector(".notes").value = v.notes;
    el.querySelector(".memo").value = v.memo || "";
    // Opening and closing: a tap anywhere on the card's top part, except its own controls.
    const head = el.querySelector(".vi-head");
    const body = el.querySelector(".vi-body");
    const setOpen = (on) => {
      el.classList.toggle("open", on);
      body.hidden = !on;
      head.setAttribute("aria-expanded", String(on));
    };
    el.__close = () => setOpen(false);
    const toggle = () => {
      const on = openId !== v.id;
      for (const other of list.querySelectorAll(".vocab-item.open")) if (other !== el) other.__close();
      openId = on ? v.id : null;
      setOpen(on);
    };
    head.onclick = (e) => { if (!e.target.closest("input, button, a, textarea, select")) toggle(); };
    head.onkeydown = (e) => {
      if (e.target === head && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); }
    };
    setOpen(openId === v.id);
    const chips = el.querySelector(".item-folders");
    for (const uid of v.folders) {
      const name = folderName(uid);
      if (!name) continue;
      const c = h(`<span class="tag"></span>`);
      c.innerHTML = `${icon("folder", 13)} `;
      c.append(name);
      chips.append(c);
    }
    const pick = el.querySelector(".pick");
    pick.checked = selected.has(v.id);
    pick.onchange = () => { pick.checked ? selected.add(v.id) : selected.delete(v.id); renderBulk(); };
    let timer;
    const save = (field, value) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await api(`/vocab/${v.id}`, { method: "PATCH", body: { [field]: value } });
          v[field] = value;
          v.updated_at = Date.now() / 1000;
          const s = el.querySelector(".saved");
          s.hidden = false;
          setTimeout(() => (s.hidden = true), 1200);
        } catch (e) { toast(e.message, { error: true }); }
      }, 500);
    };
    el.querySelector(".meaning").oninput = (e) => {
      save("meaning", e.target.value);
      shownMeaning.textContent = e.target.value;  // the closed card shows it too
      shownMeaning.hidden = !e.target.value;
    };
    el.querySelector(".notes").oninput = (e) => save("notes", e.target.value);
    el.querySelector(".memo").oninput = (e) => save("memo", e.target.value);
    el.querySelector(".folders-btn").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      folderMenu(r.left, r.bottom + 4, [v], "toggle");
    };
    // Word and Sentence: shown when the card can be heard on this device: its own recording when this
    // device can play it, else its kept voice, else the voice chosen in Settings (cardvoice.js canSay).
    // Drawn again when that changes: a recording that failed to load, or no voice for the language here.
    const quick = el.querySelector(".vi-quick");
    const pw = el.querySelector(".play-word");
    const ps = el.querySelector(".play-sent");
    el.__quick = () => {
      const voice = voiceHere(cardLanguage(v));
      pw.hidden = !canSay(v, "word", voice);
      ps.hidden = !canSay(v, "sentence", voice);
      quick.hidden = pw.hidden && ps.hidden;
    };
    el.__quick();
    // (Never fails: at worst one calm message, see voiceplay.js. Afterwards every card is checked
    // again, since a recording that failed is shared by all the cards from its episode.)
    pw.onclick = () => say(v, "word").finally(refreshQuick);
    ps.onclick = () => say(v, "sentence").finally(refreshQuick);
    el.querySelector(".del").onclick = async () => {
      if (!(await confirmDelete(v))) return;  // says so first when the word's Anki card would go too
      await api(`/vocab/${v.id}`, { method: "DELETE" });
      all = all.filter((x) => x !== v);
      selected.delete(v.id);
      renderAll();
    };
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
    // No words yet (or none in the open folder): the box stays where it always is, with nothing to start.
    const none = !reviewWords().length;
    banner.disabled = none;
    if (banner.hidden || none) {
      goal.close(); $("#goal").hidden = true; $("#send-slot").hidden = true;
      if (banner.hidden) return;
      banner.classList.add("idle");
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
    openReview({
      words: reviewWords(), allWords: all, log, playSnippet, say, highlight,
      scope: st.folder && st.folder !== "none" ? folderName(st.folder) || "" : "",
      onDelete: (v) => { all = all.filter((x) => x !== v); selected.delete(v.id); },  // a word deleted from its card
      onClose: () => { audio.pause(); stopDevice(); if (view.isConnected) renderAll(); },  // meanings and notes may have been edited on a card
    });
  }

  function renderBulk() {
    for (const id of [...selected]) if (!all.some((v) => v.id === id)) selected.delete(id);
    $("#bulk").hidden = selected.size === 0;
    $("#bulk-count").textContent = `${selected.size} selected`;
    // "Select all" ticks every word listed; once they all are, the same button unticks them.
    const every = shown.length > 0 && shown.every((v) => selected.has(v.id));
    const button = $("#select-all");
    button.hidden = shown.length === 0;
    button.textContent = every ? "Deselect all" : `Select all ${shown.length}`;
    button.title = every ? "Untick every word listed below" : "Tick every word listed below, to file or send them together";
  }

  function renderAll() {
    if (st.folder && st.folder !== "none" && !folderName(st.folder)) st.folder = "";
    renderFolders();
    const items = visible();
    const filtered = items.length !== all.length;
    $("#count").textContent = `${items.length}${filtered ? ` of ${all.length}` : ""} item${items.length === 1 ? "" : "s"}`;
    list.innerHTML = "";
    if (!items.length) {
      list.append(h(`<div class="empty">${all.length ? "No words match these filters." : st.q ? "No matches." : `No saved words yet.<p class="small">${TIP}</p>`}</div>`));
    }
    for (const v of items) list.append(item(v));
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
    all = items.map((v) => ({ ...v, folders: v.folders || [] }));
    folders = fl;
    renderAll();
    // Whether this device has a voice for the cards' languages (a moment's work, asked once): a card
    // with nothing it can play, in a language with no voice here, then shows no buttons.
    learnVoices(all.map(cardLanguage)).then((changed) => { if (changed && view.isConnected) refreshQuick(); }, () => {});
  }

  // ----- wiring -----
  $("#sort").value = st.sort;
  $("#date-field").value = st.dateField;
  $("#range").value = st.range;
  $("#from").value = st.from;
  $("#to").value = st.to;
  $("#custom-range").hidden = st.range !== "custom";
  $("#sort").onchange = (e) => { st.sort = e.target.value; savePrefs(); renderAll(); };
  $("#date-field").onchange = (e) => { st.dateField = e.target.value; savePrefs(); renderAll(); };
  $("#range").onchange = (e) => {
    st.range = e.target.value;
    $("#custom-range").hidden = st.range !== "custom";
    savePrefs();
    renderAll();
  };
  $("#from").onchange = (e) => { st.from = e.target.value; savePrefs(); renderAll(); };
  $("#to").onchange = (e) => { st.to = e.target.value; savePrefs(); renderAll(); };

  $("#review").onclick = startReview;
  const pickedItems = () => all.filter((v) => selected.has(v.id));
  $("#bulk-add").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); folderMenu(r.left, r.bottom + 4, pickedItems(), "add"); };
  $("#bulk-remove").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); folderMenu(r.left, r.bottom + 4, pickedItems(), "remove"); };
  $("#bulk-send").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); sendMenu(r.left, r.bottom + 4, pickedItems()); };
  $("#bulk-clear").onclick = () => { selected.clear(); renderAll(); };
  $("#select-all").onclick = () => {
    const every = shown.every((v) => selected.has(v.id));
    for (const v of shown) every ? selected.delete(v.id) : selected.add(v.id);
    for (const box of list.querySelectorAll(".pick")) box.checked = !every;
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
  // new cards come first in the list, lit up for a moment, whatever it is sorted by.
  const openAdd = () => openWordBuilder({
    existing: () => all,
    folders,
    folder: st.folder && st.folder !== "none" ? st.folder : "",
    onFolder: (f) => {  // a folder made in the builder shows among the folders at once
      if (folders.some((x) => x.uid === f.uid)) return;
      folders.push(f);
      folders.sort((a, b) => a.name.localeCompare(b.name));
      if (view.isConnected) renderFolders();
    },
    onAdded: (cards) => {
      justAdded = new Set(cards.map((v) => v.id));
      if (view.isConnected) load().then(() => list.firstElementChild && list.firstElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" }), () => {});
    },
  });
  $("#add-words").onclick = openAdd;
  // The ⋯ menu: the things used now and then.
  $("#more").onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 6, "", [
      { label: "Add words", icon: icon("plus", 16), run: openAdd },
      { label: "Export CSV", icon: icon("page", 16), run: () => download(exportUrl("csv"), "tamkeen-vocab.csv") },
      { label: "Export for Anki", icon: icon("send", 16), run: exportAnki },
      ...(ankiSyncHere() ? [ // (no Anki sync on the iPhone or in the web app: only the export)
        { label: ankiSettingsLabel(), icon: icon("settings", 16), run: () => { location.hash = ANKI_SETTINGS; } },  // Settings, at its Anki part
        { label: MOVE_LABEL, icon: icon("folder", 16), run: moveToLanguageDecks },
      ] : []),
    ]);
  };
  await load();
  firstVisitTour("vocab", view.querySelector(".vocab-page"), [
    { target: "#review", title: "Review",
      text: "Your saved words as flashcards. It shows how many are due today and how many are new: press it to start." },
    { target: "#goal", title: "Daily goal", text: "How many new words you want to learn each day. Change it here." },
    { target: "#add-words", title: "Add words",
      text: "Type or paste new words, one or many at a time. Tamkeen can fill in their meanings, example sentences and audio, or you can." },
    { target: "#q", title: "Search", text: "Find a saved word by the word itself or by its meaning." },
    { target: "#folders", title: "Folders",
      text: "Tap a folder to see only its words; Review then covers just those. New folder makes one." },
    { target: "#list .vocab-item", title: "A saved word",
      text: "Tap a word to open it: its meaning, the sentence it came from, and its recording. Tick the box to pick several." },
    { target: "#more", title: "More", text: "Add words, export your words for Anki or as a spreadsheet, and Anki's settings." },
  ]);
  return () => { audio.pause(); stopDevice(); cancelAnimationFrame(raf); reviewRoom.disconnect(); goal.close(); };
}
