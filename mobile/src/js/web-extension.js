// The web app's side of the Tamkeen browser extension (extension/), on a computer: the extension adds
// Tamkeen's subtitle bar to Netflix's own tab and a lyrics panel to Spotify's web player, but it can't
// read the web app's library (browsers keep each website's storage apart). Its small part on this page
// (extension/src/content/webapp.js) and this file pass what each needs (web/js/extbridge.js explains
// the messages):
//   - the settings it needs to look words up (languages, AI provider and key, lookup mode, pause on a
//     tapped word), whenever this page opens and whenever they change;
//   - the words saved in Netflix and the titles watched there, which come into the library here (and
//     then sync to Drive as usual): each title as a Netflix item with its subtitles, each word linked
//     to it, at its place in the title;
//   - the words saved on Spotify: cards with their lyric line as the sentence and "Spotify – Artist –
//     Title" as where they came from (no Library item: a song's lyrics are never kept).
// Only messages from this very page's window and address, with the nonce of this visit, are taken,
// and what arrives is cleaned to plain values first (extbridge.js).
import { APP, EXT, checkMessage, cleanPending, cleanSettings, message, spotifySource } from "./extbridge.js";
import { NETFLIX_FEED } from "./netflix.js";
import { lib, settings } from "./store.js";
import { episodeUid, feedUid } from "./shared-logic.js";
import { lookupMode, LOOKUP_EVENT } from "./components/lookupmode.js";
import { pauseAfterWord } from "./components/wordbubble.js";
import { voicesOnSave } from "./cardvoice.js";

let nonce = "";
let deps = null;
let busy = false;
const IMPORTED = "tk_ext_imported"; // words already taken (by uid), in case an answer got lost

const post = (type, fields = {}) => window.postMessage(message(APP, type, nonce, fields), location.origin);

/** Listen for the extension on this page. `api` answers the app's requests (backend.js), `toast`
 * says what came in, `refresh` redraws the screen on show. */
export function startExtensionBridge({ api, toast, refresh = () => {} }) {
  deps = { api, toast, refresh };
  window.addEventListener("message", (e) => {
    const d = checkMessage(e, { win: window, tag: EXT, nonce });
    if (!d) return;
    if (d.type === "hello") { // the extension's part on this page (again, if it was reloaded)
      nonce = d.nonce;
      post("hello");
      sendSettings();
      return;
    }
    if (d.type === "pending") takePending(cleanPending(d)).catch((err) => console.warn("Tamkeen extension:", err));
    if (d.type === "gone") { // the extension was updated or turned off since this page opened: its part here can't pass anything on
      nonce = "";
      deps.toast("Tamkeen for Netflix changed since this page opened. Reload the page so Netflix follows your Tamkeen settings again.");
    }
  });
  window.addEventListener(LOOKUP_EVENT, () => sendSettings());
  // The language studied changed by a sync (unticked on another device; sync.js), not by saveSettings.
  window.addEventListener("tamkeen:learning", () => sendSettings());
}

/** Is the extension talking to this page? */
export const extensionConnected = () => !!nonce;

/** Give the extension the settings it needs (after a change too). */
export function sendSettings() {
  if (!nonce) return;
  // (card_voices: only whether saved words get their voice by themselves, for the popup's "Add audio";
  // the voice settings and the Azure key never go to the extension.)
  post("settings", { settings: cleanSettings({ ...settings, card_voices: voicesOnSave(settings) }),
    device: { lookup_mode: lookupMode(), word_pause: pauseAfterWord() } });
}

function imported() {
  try { return new Set(JSON.parse(localStorage.getItem(IMPORTED) || "[]")); } catch { return new Set(); }
}
function remember(set) {
  try { localStorage.setItem(IMPORTED, JSON.stringify([...set].slice(-2000))); } catch { /* storage full or off */ }
}

let next = null; // what came while the last batch was being taken in: taken right after it

/** Titles watched and words saved in Netflix: into the library, then tell the extension which. */
async function takePending({ words, titles }) {
  if (!words.length && !titles.length) return;
  if (busy) { next = { words, titles }; return; }
  busy = true;
  const { api, toast, refresh } = deps;
  const kept = { words: [], titles: [] };
  const voiced = []; // the cards made here: they get their voice afterwards (Netflix's and Spotify's sound is never kept)
  try {
    for (const t of titles) {
      try {
        await api("/netflix", { method: "POST", body: { id: t.id, info: t.info, language: t.language, lines: t.lines } });
        kept.titles.push({ id: t.id, at: t.at });
      } catch (err) { console.warn("Couldn't keep a Netflix title:", err); }
    }
    const feed = await feedUid(NETFLIX_FEED);
    const done = imported();
    let added = 0, fromSpotify = 0;
    for (const w of words) {
      if (done.has(w.uid)) { kept.words.push(w.uid); continue; }
      if (w.spotify) { // a word from a song's lyrics: its line, its song, and the language it was looked up in
        try {
          voiced.push(await api("/vocab", { method: "POST", body: { text: w.text, sentence: w.sentence, meaning: w.meaning, notes: w.notes,
            translation: w.translation, language: w.language, source: spotifySource(w.spotify) } }));
          done.add(w.uid);
          kept.words.push(w.uid);
          fromSpotify++;
        } catch (err) { console.warn("Couldn't keep a word saved on Spotify:", err); }
        continue;
      }
      try {
        const uid = await episodeUid(feed, w.netflix_id);
        if (!lib.episodes.some((e) => e.uid === uid && !e.deleted)) { // its title isn't here yet (or was removed)
          await api("/netflix", { method: "POST", body: { id: w.netflix_id, info: { title: w.title }, language: w.language } });
        }
        voiced.push(await api("/vocab", { method: "POST", body: { text: w.text, sentence: w.sentence, episode_id: uid, start: w.start, end: w.end,
          sent_start: w.sent_start, sent_end: w.sent_end, meaning: w.meaning, notes: w.notes, translation: w.translation } }));
        done.add(w.uid);
        kept.words.push(w.uid);
        added++;
      } catch (err) { console.warn("Couldn't keep a word saved in Netflix:", err); }
    }
    remember(done);
    if (kept.words.length || kept.titles.length) post("ack", kept);
    if (added === 1) toast("1 word you saved in Netflix is now in your Vocab");
    else if (added > 1) toast(`${added} words you saved in Netflix are now in your Vocab`);
    if (fromSpotify === 1) toast("1 word you saved on Spotify is now in your Vocab");
    else if (fromSpotify > 1) toast(`${fromSpotify} words you saved on Spotify are now in your Vocab`);
    if (added || fromSpotify || kept.titles.length) refresh();
    // Each word's voice: Azure says the word and its sentence, kept with the card (Settings → Card voices).
    // (A Spotify card has no episode: like a card typed in, it has no sound of its own.)
    if (voiced.length) {
      import("./voiceplay.js").then(({ voiceNewCard }) => {
        for (const row of voiced) voiceNewCard(row, row && row.episode_id ? "video/netflix" : "missing");
      }).catch((err) => console.warn("Tamkeen extension: voices", err));
    }
  } finally {
    busy = false;
    const again = next;
    next = null;
    if (again) takePending(again).catch((err) => console.warn("Tamkeen extension:", err));
  }
}
