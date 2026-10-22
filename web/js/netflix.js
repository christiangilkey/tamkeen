// Netflix titles: watched in Netflix's own web player, studied through Netflix's subtitles.
// Shared by every version of the app (the computer, the phones, the web app), but only the computer
// can play them: Netflix's videos are copy-protected and Netflix only plays them in its own player,
// which on Windows Tamkeen lays over its player's stage (app/netflix_overlay.py, nfmedia.js). The
// phones and the web app explain why Netflix isn't there (unavailableReason, unavailableText).
//
// A title is an episode of the built-in "Netflix" feed (app/netflix.py explains its fields). It is
// added when a title is picked in the Netflix window, and its subtitles arrive once it plays.

// (Nothing here touches the page or the app's shell when the file loads, so its rules can be tested
// on their own: tests/js/netflix.test.mjs.)
import { t } from "./i18n.js";
import { langInfo, studyLanguage } from "./languages.js";

export const NF_TYPE = "video/netflix";
export const NETFLIX_FEED = "local:netflix";
export const isNetflix = (ep) => ((ep && ep.audio_type) || "") === NF_TYPE;
export const NETFLIX = "https://www.netflix.com";

// The pages that list titles by language, best first (the same list as BROWSE_PATHS in app/netflix.py).
export const BROWSE_PATHS = ["/browse/original-audio", "/browse/audio", "/browse/subtitles"];

/** The addresses that list Netflix's titles by language, in the order the Netflix window tries them. */
export function browseAddresses(base = NETFLIX) {
  return BROWSE_PATHS.map((p) => `${String(base).replace(/\/+$/, "")}${p}`);
}

/** Where "Open Netflix" starts: Netflix's "Browse by Languages" page (the window's script then
 * chooses the language being learned in it; see netflix-browser.js). */
export function browseStart(base = NETFLIX) {
  return browseAddresses(base)[0];
}

// How Netflix's language menus name each language the app teaches (its English menus), when that
// isn't the app's own English name. The language's own name is always added too.
const NETFLIX_NAMES = {
  zh: ["Mandarin", "Chinese", "Cantonese"],
  tl: ["Filipino", "Tagalog"],
  pt: ["Portuguese", "Brazilian Portuguese"],
  ceb: ["Cebuano"],
  fa: ["Persian", "Farsi"],
};

/** The names to look for in Netflix's language menu for `lang`. */
export function languageNames(lang) {
  const info = langInfo(lang);
  const names = [...(NETFLIX_NAMES[lang] || [info.name]), info.native]
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter((n) => n && n.length <= 40 && /^[\p{L}\p{M} ()'.-]+$/u.test(n));
  return names.filter((n, i) => names.indexOf(n) === i);
}

/** A language's name in the user's language ("Árabe"): t() puts its values in as they are. */
export const languageName = (lang) => t(langInfo(lang).name);

/** The Netflix window's few messages, in the user's language (it can't translate by itself). */
export function browserTexts(lang = studyLanguage()) {
  return {
    tap: t("Pick a title to watch it in Tamkeen"),
    opening: t("Opening in Tamkeen…"),
    opened: t("✓ Opened in Tamkeen"),
    signin: t("Sign in to Netflix here. Only Netflix sees your password."),
    choose: t("Choose {0} in Netflix's language menu.", languageName(lang)),
    nolang: t("Netflix didn't open its titles by language. Use “Browse by Languages” in Netflix's menu."),
    failed: t("Couldn't open this title."),
  };
}

// ---------- where Netflix can play ----------

/**
 * Why Netflix can't play in this version of the app, or "" when it can.
 *   "android"       the Android app: Netflix generally refuses to play inside other apps' web views
 *   "iphone"        the iPhone app (Netflix doesn't play its website on phones)
 *   "web-phone"     the web app on a phone (the same)
 *   "web-computer"  the web app on a computer (it would need a browser extension)
 *   "desktop-os"    the computer app on a system where its video window isn't built (Mac, Linux)
 *   "no-drm"        the computer app, but its web view can't play protected video
 */
export function unavailableReason({ platform, web = false, ios = false, phone = false, overlay = false, drm = true } = {}) {
  if (platform === "desktop") return !overlay ? "desktop-os" : drm === false ? "no-drm" : "";
  if (web) return phone || ios ? "web-phone" : "web-computer";
  return ios ? "iphone" : "android";
}

/** What to say when Netflix can't play here: {title, lines}. */
export function unavailableText(reason) {
  const elsewhere = t("Netflix works in Tamkeen on a Windows computer: choose Netflix there, and its subtitles become words you can click, like a YouTube video's. What you watch there shows up here in your Library.");
  const why = {
    android: t("Netflix doesn't let its videos play inside other apps on most phones, so it isn't in Tamkeen's phone app yet."),
    iphone: t("Netflix doesn't let its videos play inside other apps on an iPhone, so Tamkeen can't show them here."),
    "web-phone": t("Netflix doesn't play its videos in a phone's web browser, so the web app can't show them."),
    "web-computer": t("In a web browser, Tamkeen would need a browser extension to work with Netflix, and there isn't one yet."),
    "desktop-os": t("This computer's version of Tamkeen can't control Netflix's player yet."),
    "no-drm": t("This computer's built-in web viewer can't play Netflix's protected videos."),
  }[reason] || t("Netflix can't play here.");
  return { title: t("Netflix isn't available here"), lines: [why, elsewhere] };
}

/** Can this web view play protected video (Netflix's)? Asks for the systems Netflix uses. */
export async function drmAvailable(nav = typeof navigator !== "undefined" ? navigator : null) {
  if (!nav || typeof nav.requestMediaKeySystemAccess !== "function") return false;
  const config = [{
    initDataTypes: ["cenc"],
    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }],
    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
  }];
  for (const system of ["com.widevine.alpha", "com.microsoft.playready.recommendation", "com.microsoft.playready", "com.apple.fps.1_0", "com.apple.fps"]) {
    try {
      await nav.requestMediaKeySystemAccess(system, config);
      return true;
    } catch { /* not this one */ }
  }
  return false;
}

// ---------- titles in the library ----------

/** Add a title picked on Netflix (or refresh its name and picture). Resolves to its episode.
 * `replaces`: the title Netflix moved on from (see app/netflix.py save_title). */
export async function addNetflix(id, info = {}, replaces = null) {
  const { api } = await import("./app.js");
  return api("/netflix", { method: "POST", body: { id: String(id), info, language: studyLanguage(), replaces } });
}

/** Open a title picked on Netflix in the player. Resolves to its episode. */
export async function watchNetflix(id, info = {}) {
  const ep = await addNetflix(id, info);
  location.hash = `#/episode/${ep.id}`;
  return ep;
}

/** What to say about a title's soundtrack and subtitles, from Netflix's player's state `s` (see
 * player.js): {sound, subs}, each a line of text or "". `words`: how many words the transcript has. */
export function subtitleNote(s, { words = 0, lang = studyLanguage() } = {}) {
  const name = languageName(lang);
  const subs = (s && s.subs) || {};
  const playing = !!(s && s.page === "watch" && s.video); // (not while Netflix wants a sign-in, say)
  const sound = s && s.audio && s.audio.status === "switched" ? t("Playing Netflix's {0} soundtrack.", name) : "";
  let line = "";
  if (subs.status === "none") line = t("Netflix has no {0} subtitles for this title, so Tamkeen can't show its words. The video still plays.", name);
  else if (subs.status === "image") line = t("Netflix has {0} subtitles for this title only as pictures, so Tamkeen can't read their words.", name);
  else if (subs.status === "failed") line = t("Netflix didn't switch its subtitles to {0}. Try opening the title again.", name);
  else if (!words && playing && (subs.status === "chosen" || subs.status === "waiting")) line = t("Getting Netflix's {0} subtitles…", name);
  return { sound, subs: line };
}
