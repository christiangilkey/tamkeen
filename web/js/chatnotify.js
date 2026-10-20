// Notifications for chat messages, on every version: a friend's message (text, voice note, shared
// words, or a podcast / video / web page / reel sent from the share button) while Tamkeen isn't on
// screen shows as the system's notification; while Tamkeen is open on another page, as a banner with
// "Open"; in that very chat, nothing. Tapping either opens the chat (#/chat/<friend id>).
//
// Each app hands in how it shows a system notification (startChatNotifications): the desktop asks its
// server (Windows, Mac and Linux notifications, app/notify.py), the phones their own plugin
// (AppBadge.notifyMessage), the web app the browser's Notification. It works while Tamkeen is running,
// also in the background; when it isn't running at all, nothing can arrive (that would need a push service).

import { t } from "./i18n.js";
// (The app shell and the Friends code are loaded when listening starts, not with this file, so its
// message lines can be tested on their own.)
const appShell = () => import("./app.js");
const friends = () => import("./social.js");

// (Translated here with t(): a notification is outside the page, where the app's words are translated.)
const MEDIA_LINE = {
  podcast: (title) => t("Sent you a podcast episode: {0}", title),
  youtube: (title) => t("Sent you a video: {0}", title),
  page: (title) => t("Sent you a web page: {0}", title),
  reel: () => t("Sent you a reel"),
};

/** The one line a notification shows for message `m`, in the app's language. */
export function messageLine(m) {
  const p = m.payload || {};
  if (m.kind === "voice") return t("Sent you a voice message");
  if (m.kind === "share" && p.media) {
    const title = String(p.media.title || "").trim();
    const line = MEDIA_LINE[p.media.kind];
    return line ? line(title) : title ? t("Sent you: {0}", title) : t("Sent you something to study");
  }
  if (m.kind === "share" && Array.isArray(p.words)) {
    const n = p.words.length;
    if (p.folder) return t("Sent you a folder: {0} ({1})", p.folder, n === 1 ? t("1 word") : t("{0} words", n));
    return n === 1 ? t("Sent you a word: {0}", p.words[0].text) : t("Sent you {0} words", n);
  }
  const text = String(m.body || "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text || t("Sent you a message");
}

let started = false;
let names = new Map(); // friend id -> username

async function nameOf(id) {
  if (!names.has(id)) {
    try {
      const st = await (await friends()).friendsState();
      if (st) names = new Map(st.friends.map((f) => [f.user.id, f.user.username]));
    } catch { /* offline: no name */ }
  }
  return names.get(id) || "A friend";
}

/** Whether Tamkeen is on screen and in use (not minimised, not behind another window). */
const onScreen = () => document.visibilityState === "visible" && document.hasFocus();

/** What to do with a friend's message: "none" (that chat is open on screen), "banner" (Tamkeen is on
 * screen elsewhere) or "system" (it isn't on screen: the system's notification). */
export function howToTell({ shown, hash, sender }) {
  if (shown && hash === `#/chat/${sender}`) return "none";
  return shown ? "banner" : "system";
}

/**
 * Start listening (once). `system({friend, title, text, id})` shows the system's notification for one
 * message and may return a promise; `ask()` asks once for permission to (see askChatNotifications).
 */
export function startChatNotifications({ system, ask = async () => {} }) {
  if (started) return;
  started = true;
  askHook = ask;
  let off = () => {};
  const watch = async () => {
    off();
    const social = await friends();
    const { toast } = await appShell();
    const me = await social.currentUser().catch(() => null);
    if (!me) { off = () => {}; return; }
    off = await social.onMessage(async (m) => {
      if (!m || m.recipient !== me.id || m.sender === me.id) return;
      const chat = `#/chat/${m.sender}`;
      const how = howToTell({ shown: onScreen(), hash: location.hash, sender: m.sender });
      if (how === "none") return; // reading that chat already
      const title = await nameOf(m.sender);
      const text = messageLine(m);
      if (how === "banner") {
        toast(`${title}: ${text}`, { action: { label: "Open", run: () => (location.hash = chat) } });
        return;
      }
      try { await system({ friend: m.sender, title, text, id: m.id }); } catch { /* not allowed or unsupported */ }
    }).catch(() => () => {});
  };
  friends().then((social) => social.sb()).then((c) => c.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") setTimeout(watch, 0);
  })).catch(() => {});
}

let askHook = async () => {};
let asked = false;
/** Ask for permission to show notifications, once per run (the chat page calls it). */
export function askChatNotifications() {
  if (asked) return;
  asked = true;
  askHook().catch(() => {});
}
