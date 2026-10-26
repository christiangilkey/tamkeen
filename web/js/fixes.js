// What the learner can put right themselves, and where: a permission (the microphone), or something
// set up in Settings (an AI or Azure key, a sign-in, a language). Such a problem never comes up as a
// red message at the bottom of the screen: one popup says what is wrong, with one button that goes
// straight to the fix and a "Dismiss" (components/fixit.js shows it; every shell's toast() hands it
// any message whose cause is found here). The words, the sorting and the rules are here, with no
// screen code (tests/js/fixes.test.mjs).

/** After "Dismiss" (or Esc, or a tap beside the popup), the same cause stays quiet this long: long
 *  enough that repeated triggers don't bring it straight back, short enough that pressing the button
 *  again a little later (Say it, say) shows it again rather than doing nothing. */
export const QUIET_MS = 20 * 1000;
/** After its button was pressed, this long (messages already on their way don't bring it straight back). */
export const AFTER_FIX_MS = 10 * 1000;
/** At most this many other causes wait while a popup is on screen (each is shown after it). */
export const MAX_WAITING = 3;

/** A link into Settings: section `s` and, in it, the setting `show` (a data-find id in settingsui.js FINDS),
 * which Settings opens, unfolds and rings. */
export function settingsHref(s, show = "") {
  const q = new URLSearchParams();
  if (s) q.set("s", s);
  if (show) q.set("show", show);
  const qs = q.toString();
  return qs ? `#/settings?${qs}` : "#/settings";
}

// ---------- the causes that are put right in Settings (or on another page of the app) ----------
// `s`/`show`: where in Settings; `href`: another page instead; `run`: the caller does it (signing in).
// (Written as {title, text, button} so the translation extractor finds all three.)
const PLACES = {
  aikey: { s: "words", show: "key", icon: "message", title: "Add an AI key",
    text: "This needs your own AI key: add one in Settings → Word definitions.", button: "Add a key" },
  aikeyrefused: { s: "words", show: "key", icon: "message", title: "Your AI key isn't working",
    text: "Your AI provider refused the key, most likely because it has expired: paste a new one in Settings → Word definitions.",
    button: "Fix the key" },
  aioff: { s: "words", show: "mode", icon: "message", title: "AI is turned off",
    text: "This needs AI explanations, which are turned off: switch them on in Settings → Word definitions.", button: "Turn on AI" },
  aimodel: { s: "words", show: "aimodel", icon: "message", title: "The AI model isn't recognised",
    text: "Your AI provider doesn't know the chosen model: pick the recommended one in Settings → Word definitions.",
    button: "Choose a model" },
  azurerefused: { s: "voices", show: "azurekey", icon: "sound", title: "Your Azure key isn't working",
    text: "Azure didn't accept your key or its region: copy Key 1 and its region again into Settings → Card voices.",
    button: "Fix the key" },
  novoice: { s: "voices", show: "cardvoice", icon: "sound", title: "No voice for this language",
    text: "", button: "Choose a card voice" }, // (its text is the message itself: how to add a voice to this device)
  sttkey: { s: "listening", show: "sttkey", icon: "audio", title: "Your transcription key isn't working",
    text: "The transcription service refused the key, most likely because it has expired: paste a new one in Settings → Listening & transcripts.",
    button: "Fix the key" },
  cloudoff: { s: "listening", show: "who", icon: "audio", title: "Cloud transcription is off",
    text: "This needs cloud transcription: switch it on in Settings → Listening & transcripts.", button: "Turn it on" },
  drive: { s: "account", show: "drive", icon: "cloud", title: "Sign in to Google Drive", own: true, // (the message says what for)
    text: "This needs your Google sign-in: sign in again in Settings → Account & sync.", button: "Sign in" },
  signin: { s: "account", show: "drive", icon: "cloud", title: "Sign in to sync",
    text: "Sign in with Google to keep your library the same on all your devices.", button: "Sign in" },
  reconnect: { s: "account", show: "drive", icon: "refresh", title: "Reconnect Google",
    text: "Google gives the web app an hour at a time: reconnect to keep syncing.", button: "Reconnect Google" },
  friends: { s: "account", show: "friends", icon: "friends", title: "Connect to Friends",
    text: "Sharing needs a Friends account: connect with Google and choose a username in Settings → Account & sync.",
    button: "Connect" },
  nofriends: { href: "#/friends", icon: "userplus", title: "Add a friend first",
    text: "There is no one to send this to yet: add a friend on the Friends page.", button: "Find friends" },
  language: { s: "languages", show: "learn", icon: "page", title: "Choose a language to learn",
    text: "Tamkeen needs to know which language you're learning: choose it in Settings → Languages.", button: "Choose a language" },
  getapp: { s: "apps", show: "getapp", icon: "computer", title: "This needs the Tamkeen app",
    text: "", button: "Get the app" }, // (its text is the message itself)
};

/** Every cause there is: the microphone and the places above. */
export const CAUSES = ["mic", ...Object.keys(PLACES)];
export const isCause = (x) => typeof x === "string" && CAUSES.includes(x);

/** Where a cause is put right in the app ({s, show} in Settings, or {href}), or null for a permission. */
export function placeOf(cause) {
  const p = PLACES[cause];
  return p ? { s: p.s || "", show: p.show || "", href: p.href || settingsHref(p.s, p.show) } : null;
}

// ---------- the microphone ----------
// The text and the button depend on the device and on how the permission stands now: "prompt" (it can
// still be asked for, so the button asks), "denied" (only the system's settings can switch it back on),
// "granted" (it is allowed now: try again), "" (can't be told). `step` is what the button does:
// "ask" (ask for the microphone again) or "system" (open the system's settings for Tamkeen).
const MIC = {
  ask: "Tamkeen needs the microphone to hear you: press Allow, then say yes when you're asked.",
  retry: "Tamkeen couldn't use the microphone: press Try again, and say yes if you're asked.",
  android: "The microphone is turned off for Tamkeen: open its settings, then Permissions → Microphone, and choose Allow.",
  ios: "The microphone is turned off for Tamkeen: open Settings and switch on Microphone.",
  web: "Your browser has blocked the microphone for Tamkeen: click the lock or tune icon next to the web address, allow the microphone, then press Try again.",
  windows: "Windows is keeping the microphone from Tamkeen: in Windows settings, turn on microphone access for desktop apps, then try again.",
  mac: "macOS is keeping the microphone from Tamkeen: in System Settings → Privacy & Security → Microphone, switch Tamkeen on, then try again.",
};
const ALLOW = "Allow the microphone";
const TRY = "Try again";

function micFix({ device = "web", state = "", os = "" }) {
  const base = { cause: "mic", icon: "mic", title: "Allow the microphone", perm: "microphone" };
  const fix = (text, button, step) => ({ ...base, text, button, step });
  if (device === "desktop") {  // the computer's own window: no question is asked there, the system decides
    if (os === "windows") return fix(MIC.windows, "Open Windows settings", "system");
    if (os === "mac") return fix(MIC.mac, "Open System Settings", "system");
    return fix(MIC.retry, TRY, "ask");
  }
  if (state === "granted") return fix(MIC.retry, TRY, "ask");
  if (state === "denied") {
    if (device === "android") return fix(MIC.android, "Open Tamkeen's settings", "system");
    if (device === "ios") return fix(MIC.ios, "Open Settings", "system");
    return fix(MIC.web, TRY, "ask"); // (a web page can't open the browser's own settings: it says where they are)
  }
  return fix(MIC.ask, ALLOW, "ask");
}

/**
 * The popup for a cause: {cause, icon, title, text, button} and what the button does: `href` (a page
 * of the app: Settings at the right place), `step` + `perm` (a permission), or `run: true` (the caller's
 * own action, e.g. signing in). `env`: {device: "android" | "ios" | "web" | "desktop", os ("windows",
 * "mac", "linux": the computer), state (the permission now), message (the words that came with it),
 * run (the caller has its own action)}. Null for something that isn't a cause.
 */
export function fixFor(cause, env = {}) {
  if (cause === "mic") return micFix(env);
  const p = PLACES[cause];
  if (!p) return null;
  const own = String(env.message || "").trim();
  const out = { cause, icon: p.icon, title: p.title, text: (p.own && own) || p.text || own, button: p.button };
  if (cause === "novoice" && env.device === "android") return { ...out, button: "Open voice settings", step: "voices" };
  if (env.run) return { ...out, run: true };
  return { ...out, href: placeOf(cause).href };
}

/** Does this popup send the learner into Settings (so it is pointless while Settings is on screen)? */
export const goesToSettings = (fix) => !!(fix && fix.href && fix.href.startsWith("#/settings"));

// ---------- which cause a message is ----------
// The app's own messages (English: the screen translates them later), in the order they are tried.
const MESSAGES = [
  ["mic", /permission to use the microphone/i],
  ["sttkey", /\b(Groq|OpenAI) rejected the API key/],          // (transcription: the word providers' names end in ")")
  ["aikeyrefused", /\) rejected the API key/],                 // Claude (Anthropic), Gemini (Google), ChatGPT (OpenAI), Grok (xAI)
  ["aikey", /^NO_KEY$|No API key set\b|Add an AI key in Settings|uses your AI key\. Add one/],
  ["aioff", /AI is turned off \(Settings/],
  ["aimodel", /doesn't recognize that model name\. Check it in Settings/],
  ["azurerefused", /Azure didn't accept this key/],
  ["novoice", /\bhas no .{1,60} voice\. (To add one|Some browsers)/],
  ["cloudoff", /Cloud transcription is switched off|Turn on cloud transcription in Settings/i],
  ["friends", /Connect first \(Settings|Choose your own username first|Connect with Google first \(Settings|Connect and choose a username first/],
  ["language", /Choose (the|a) language (you're learning|to study) first/],
  ["drive", /sign-in (needs renewing|expired)|Not signed in to Google|Sign in with Google (\(Settings\)|first|under)|sign in with Google in Settings|private Drive folder|Drive access wasn't granted|Google Drive rejected the sign-in/i],
];

/** The cause of an error or a message ("" when it isn't one the learner can fix). An error may say its
 * cause itself (`fixCause`). */
export function causeOf(x) {
  if (!x) return "";
  if (typeof x === "object" && isCause(x.fixCause)) return x.fixCause;
  const text = String(typeof x === "string" ? x : x.message || "");
  for (const [cause, re] of MESSAGES) if (re.test(text)) return cause;
  return "";
}

// ---------- one at a time, never repeated ----------
/**
 * Decides when a popup is shown. `ask(cause, now, item)`: "show" (show it now), "wait" (another is on
 * screen: it comes after that one), or "skip" (it is on screen or waiting already, or quiet after
 * Dismiss). `closed(cause, how, now)` returns the next waiting item, or null; `how`: "dismissed" (quiet
 * for QUIET_MS), "fixed" (its button: quiet for AFTER_FIX_MS) or "skipped" (never shown: no quiet).
 */
export function fixGate({ quietMs = QUIET_MS, afterFixMs = AFTER_FIX_MS, maxWaiting = MAX_WAITING } = {}) {
  let showing = "";
  const waiting = [];          // [{cause, item}]
  const quiet = new Map();     // cause -> quiet until (ms)
  return {
    ask(cause, now, item = null) {
      if (!cause || cause === showing || waiting.some((w) => w.cause === cause)) return "skip";
      if ((quiet.get(cause) || 0) > now) return "skip";
      if (showing) {
        if (waiting.length >= maxWaiting) return "skip";
        waiting.push({ cause, item });
        return "wait";
      }
      showing = cause;
      return "show";
    },
    closed(cause, how, now) {
      if (showing === cause) showing = "";
      if (how === "dismissed" || how === "fixed") quiet.set(cause, now + (how === "fixed" ? afterFixMs : quietMs));
      while (waiting.length) {
        const next = waiting.shift();
        if ((quiet.get(next.cause) || 0) > now) continue;
        showing = next.cause;
        return next;
      }
      return null;
    },
    get showing() { return showing; },
  };
}
