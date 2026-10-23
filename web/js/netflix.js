// Netflix titles: watched in Netflix's own web player, studied through Netflix's subtitles.
// Shared by every version of the app (the computer, the phones, the web app), but only the computer
// can play them: Netflix's videos are copy-protected and Netflix only plays them in its own player,
// which on Windows Tamkeen lays over its player's stage (app/netflix_overlay.py, nfmedia.js). In a
// computer's web browser the web app works with Netflix through the Tamkeen browser extension
// (extension/), which adds Tamkeen's subtitle bar to Netflix's own tab. The phones explain why
// Netflix isn't there, and the web app without the extension where to get it (unavailableReason,
// unavailableText).
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

/** The same messages for the browser extension, on Netflix's own pages: there a title picked plays
 * right there, in Netflix's player, with Tamkeen's subtitle bar (extension/). */
export function extensionBrowserTexts(lang = studyLanguage()) {
  return { ...browserTexts(lang), tap: t("Pick a title: it plays here with Tamkeen's subtitle bar.") };
}

// ---------- the browser extension (the web app on a computer) ----------
// Netflix's site can't be shown inside another website, and one website can't read or control
// another, so in a web browser only an extension can bring Tamkeen into Netflix's player:
// extension/ ("Tamkeen for Netflix", for Chrome and Edge; Firefox where it can). Its part on the web
// app's own pages marks the page (data-tamkeen-extension on <html>) and passes settings and saved
// words back and forth (mobile/src/js/web-extension.js).

/** The page that explains how to install the extension (docs/extension/index.html, built by
 * extension/scripts/build.mjs). */
export const EXTENSION_PAGE = "https://christiangilkey.github.io/tamkeen/extension/";
/** THE ONE PLACE TO FILL IN once "Tamkeen for Netflix" is live in the Chrome Web Store: its listing's
 * address, e.g. "https://chromewebstore.google.com/detail/tamkeen-for-netflix/<id>"
 * (extension/store/HOW-TO-PUBLISH.md, last step). Then the web app's Netflix section says "Add to
 * Chrome" (in Edge: "Add to Edge", Edge installs from that store too) and links there, and the install
 * page (extension/install.html; extension/scripts/build.mjs reads this line) puts the same button
 * first. Empty: both keep explaining how to add the extension by hand. Keep it on one line, in double
 * quotes. */
export const CHROME_WEB_STORE_URL = "";
/** The extension's pages in the browsers' add-on stores, once it is published there; until then ""
 * and the install page is used (HANDOFF.md says how to publish it). */
export const EXTENSION_STORES = { chrome: CHROME_WEB_STORE_URL, edge: "", firefox: "" };

const browserOf = (ua) => (/Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : "chrome");

/** The extension's store page for this browser, if it has one: {browser, url} (url "" while it is
 * in no store this browser can use; Edge can use the Chrome Web Store). */
export function extensionStore(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const browser = browserOf(ua);
  const url = EXTENSION_STORES[browser] || (browser === "edge" ? EXTENSION_STORES.chrome : "");
  return { browser, url: /^https:\/\//.test(url) ? url : "" };
}

/** The store button's words in this browser ("Add to Chrome"). */
export function storeButtonText(browser) {
  if (browser === "edge") return t("Add to Edge");
  if (browser === "firefox") return t("Add to Firefox");
  return t("Add to Chrome");
}

/** Where "Get the Tamkeen extension" leads in this browser: its store page once it is in a store
 * this browser can use, else the install page (in the user's language, `ui`). */
export function extensionLink(ua = typeof navigator !== "undefined" ? navigator.userAgent : "", ui = "") {
  return extensionStore(ua).url || (/^[a-z]{2,3}$/.test(ui) && ui !== "en" ? `${EXTENSION_PAGE}?lang=${ui}` : EXTENSION_PAGE);
}

/** Is the extension in this browser? Its part on the web app's pages marks the page. */
export const extensionHere = (doc = typeof document !== "undefined" ? document : null) =>
  !!(doc && doc.documentElement && doc.documentElement.dataset && doc.documentElement.dataset.tamkeenExtension);

// ---------- where Netflix can play ----------

/**
 * Why Netflix can't play in this version of the app, or "" when it can.
 *   "android"       the Android app: Netflix generally refuses to play inside other apps' web views
 *   "iphone"        the iPhone app (Netflix doesn't play its website on phones)
 *   "web-phone"     the web app on a phone (the same)
 *   "web-computer"  the web app on a computer without the browser extension (`extension`: it is there)
 *   "desktop-os"    the computer app on a system where its video window isn't built (Mac, Linux)
 *   "no-drm"        the computer app, but its web view can't play protected video
 */
export function unavailableReason({ platform, web = false, ios = false, phone = false, overlay = false, drm = true, extension = false } = {}) {
  if (platform === "desktop") return !overlay ? "desktop-os" : drm === false ? "no-drm" : "";
  if (web) return phone || ios ? "web-phone" : extension ? "" : "web-computer";
  return ios ? "iphone" : "android";
}

/** What to say when Netflix can't play here: {title, lines}. */
export function unavailableText(reason) {
  if (reason === "web-computer") {
    return {
      title: t("Netflix needs the Tamkeen extension"),
      lines: [
        t("Netflix only lets a browser extension add Tamkeen to its player. With the Tamkeen extension in Chrome or Edge, Netflix plays in its own tab with Tamkeen's subtitle bar, and its subtitles become words you can click."),
        t("The titles you watch and the words you save there come back here, to your Library and Vocab."),
      ],
    };
  }
  const elsewhere = t("Netflix works in Tamkeen on a Windows computer: choose Netflix there, and its subtitles become words you can click, like a YouTube video's. What you watch there shows up here in your Library.");
  const why = {
    android: t("Netflix doesn't let its videos play inside other apps on most phones, so it isn't in Tamkeen's phone app yet."),
    iphone: t("Netflix doesn't let its videos play inside other apps on an iPhone, so Tamkeen can't show them here."),
    "web-phone": t("Netflix doesn't play its videos in a phone's web browser, so the web app can't show them."),
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
