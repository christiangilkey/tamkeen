// Run with: node --test tests/js/
// The fix popup (web/js/fixes.js, shown by components/fixit.js): which messages are problems the
// learner can put right and where, the popup for each, one at a time and quiet after Dismiss; and the
// short messages at the bottom (web/js/toaster.js) never stacking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AFTER_FIX_MS, CAUSES, MAX_WAITING, QUIET_MS, causeOf, fixFor, fixGate, goesToSettings, placeOf, settingsHref } from "../../web/js/fixes.js";
import { MAX_TOASTS, placeToast } from "../../web/js/toaster.js";
import { define } from "../../web/js/definer.js";
import { sttFailure } from "../../web/js/stt.js";
import { addVoiceHelp, azureError } from "../../web/js/cardvoice.js";
import { AUDIO_ERRORS } from "../../web/js/cardaudio.js";
import { micProblem } from "../../web/js/review/pronounce.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const refusedLookup = async (provider, status, body) => {
  try { await define({ provider, key: "k" }, { word: "hola", marked: "⟦hola⟧ amigo", lang: "es" }, async () => ({ status, text: JSON.stringify(body) })); }
  catch (e) { return e; }
  throw new Error("expected the lookup to fail");
};

// ---------------------------------------------------------------- choosing the popup for each cause

test("a refused microphone is the microphone's popup, whatever said it", () => {
  assert.equal(causeOf("Tamkeen needs permission to use the microphone to hear you say the word."), "mic"); // Say it
  assert.equal(causeOf(new Error(AUDIO_ERRORS.mic)), "mic");                                                // Add words: Record
  assert.equal(causeOf("The app needs permission to use the microphone for voice notes."), "mic");         // a chat's voice note
  assert.equal(causeOf(Object.assign(new Error("anything"), { fixCause: "mic" })), "mic");                // an error that says so itself
  // No microphone, or one another app holds: nothing in the settings changes that, so they stay messages.
  for (const name of ["NotFoundError", "NotReadableError", "AbortError", "OverconstrainedError"]) {
    const said = micProblem({ name });
    assert.ok(said, name);
    assert.equal(causeOf(said), "", name);
  }
  assert.equal(micProblem({ name: "NotAllowedError" }), "");
  assert.equal(micProblem(null), "");
  assert.equal(causeOf(AUDIO_ERRORS.busy), "");
  assert.equal(causeOf(AUDIO_ERRORS.none), "");
});

test("AI keys: none, refused, AI off, an unknown model; transcription keys apart from them", async () => {
  assert.equal(causeOf(new Error("NO_KEY")), "aikey");
  assert.equal(causeOf("No API key set. Add one in Settings → Word definitions."), "aikey");
  assert.equal(causeOf("Add an AI key in Settings → Word definitions first."), "aikey");                 // a grammar lesson
  assert.equal(causeOf("The Mnemonic maker uses your AI key. Add one in Settings → Word definitions."), "aikey");
  for (const [provider, status, body] of [
    ["claude", 401, { error: { type: "authentication_error", message: "invalid x-api-key" } }],
    ["openai", 401, { error: { message: "Incorrect API key provided." } }],
    ["grok", 403, { error: "Forbidden" }],
    ["gemini", 400, { error: { message: "API key expired. Please renew the API key." } }],
  ]) assert.equal(causeOf(await refusedLookup(provider, status, body)), "aikeyrefused", provider);
  assert.equal(causeOf(await refusedLookup("gemini", 404, { error: { message: "model not found" } })), "aimodel");
  assert.equal(causeOf("AI is turned off (Settings → Word definitions → No AI), so this isn't available."), "aioff");
  // The same provider (OpenAI) refusing a transcription key goes to Listening & transcripts.
  for (const provider of ["groq", "openai"]) {
    const e = sttFailure(provider, 401, "{}");
    assert.equal(causeOf(e), "sttkey", provider);
    assert.equal(causeOf(`Transcription failed: My podcast. ${e.message}`), "sttkey", provider);
  }
  assert.equal(causeOf("Cloud transcription is switched off. Turn it on in Settings."), "cloudoff");
  assert.equal(causeOf("Turn on cloud transcription in Settings first: it is what lets this phone listen to reels."), "cloudoff");
  // What the key can't help with stays a message (the provider's own page, or waiting, puts it right).
  assert.equal(causeOf(await refusedLookup("openai", 429, { error: { message: "Rate limit reached" } })), "");
  assert.equal(causeOf(await refusedLookup("claude", 529, "overloaded")), "");
  assert.equal(causeOf(await refusedLookup("openai", 0, "")), "");
});

test("card voices: a refused Azure key, and a device with no voice for the language", () => {
  assert.equal(causeOf(azureError(401, "eastus")), "azurerefused");
  assert.equal(causeOf(`The word is saved, but its voice couldn't be made now: ${azureError(403, "westeurope").message} It's tried again when you play the card.`), "azurerefused");
  assert.equal(causeOf(azureError(429)), "");  // too many requests for now: a message
  for (const where of ["android", "ios", "mac", "windows", "web"]) {
    assert.equal(causeOf(addVoiceHelp("Arabic", where)), "novoice", where);
    assert.equal(causeOf(`${addVoiceHelp("Bisaya (Cebuano)", where)} This device's own voice is used meanwhile.`), "novoice", where);
  }
});

test("sign-ins, Friends and the language being learned", () => {
  for (const said of [
    "Sign in with Google (Settings) to watch videos stored in your Drive.",
    "Sign in with Google first (Settings → Account & sync).",
    "Your Google sign-in needs renewing. Open Settings and sign in again.",
    "Your Google sign-in expired. Please sign in again.",
    "Not signed in to Google.",
    "Sign in with Google first.",
    "Syncing needs Tamkeen's private Drive folder: sign in again and leave that box ticked.",
    "Transcription failed: X. This video is stored in Google Drive: sign in with Google in Settings to transcribe it.",
  ]) assert.equal(causeOf(said), "drive", said);
  for (const said of ["Connect first (Settings → Friends & sharing).", "Choose your own username first (Settings → Friends & sharing).",
    "Connect with Google first (Settings → Friends & sharing)."]) assert.equal(causeOf(said), "friends", said);
  for (const said of ["Choose the language you're learning first, then open the video again.",
    "Choose the language you're learning first, then share the page to Tamkeen again.", "Choose a language to study first (Settings)."]) {
    assert.equal(causeOf(said), "language", said);
  }
  // Not the learner's to fix in the app: said as before.
  for (const said of ["Sign-in was cancelled.", "Google didn't sign you in.", "That couldn't be copied here.", "Couldn't sync.",
    "Google Tasks wasn't allowed, so the task couldn't be added.", "Couldn't reach Claude (Anthropic). Check your internet connection.",
    "Lost connection to the app's local server.", "", null]) assert.equal(causeOf(said), "", String(said));
});

test("each popup has a title, one sentence and a button that goes to the right place", () => {
  for (const cause of CAUSES) {
    const fix = fixFor(cause, { device: "web", message: "The words that came with it." });
    assert.ok(fix && fix.title && fix.text && fix.button, cause);
    assert.ok(fix.href || fix.step, cause);
  }
  assert.equal(fixFor("azurerefused").href, "#/settings?s=voices&show=azurekey");
  assert.equal(fixFor("aikey").href, "#/settings?s=words&show=key");
  assert.equal(fixFor("aikeyrefused").href, "#/settings?s=words&show=key");
  assert.equal(fixFor("aioff").href, "#/settings?s=words&show=mode");
  assert.equal(fixFor("sttkey").href, "#/settings?s=listening&show=sttkey");
  assert.equal(fixFor("drive").href, "#/settings?s=account&show=drive");
  assert.equal(fixFor("friends").href, "#/settings?s=account&show=friends");
  assert.equal(fixFor("language").href, "#/settings?s=languages&show=learn");
  assert.equal(fixFor("getapp").href, "#/settings?s=apps&show=getapp");
  assert.equal(fixFor("nofriends").href, "#/friends");
  assert.ok(goesToSettings(fixFor("aikey")) && !goesToSettings(fixFor("nofriends")) && !goesToSettings(fixFor("mic")));
  // A sign-in the caller makes itself: the button runs it, there is no page to go to.
  const signin = fixFor("signin", { run: true });
  assert.equal(signin.run, true);
  assert.equal(signin.href, undefined);
  assert.equal(goesToSettings(signin), false);
  // The words that came with it: the popup's sentence where it has none of its own (a device voice).
  assert.equal(fixFor("novoice", { message: addVoiceHelp("Thai", "ios") }).text, addVoiceHelp("Thai", "ios"));
  assert.equal(fixFor("drive", { message: "Sign in with Google (Settings) to watch videos stored in your Drive." }).text,
    "Sign in with Google (Settings) to watch videos stored in your Drive.");
  assert.ok(fixFor("drive").text.length > 10);
  // Android opens the phone's own text-to-speech settings for a missing voice.
  assert.equal(fixFor("novoice", { device: "android", message: "x" }).step, "voices");
  assert.equal(fixFor("novoice", { device: "ios", message: "x" }).href, "#/settings?s=voices&show=cardvoice");
  assert.equal(fixFor("not a cause"), null);
});

test("the microphone's popup: ask again while it can be asked, else the system's settings", () => {
  const mic = (env) => fixFor("mic", env);
  // Never asked, or refused once: the button asks again (Android, iPhone and browsers alike).
  for (const device of ["android", "ios", "web"]) {
    for (const state of ["prompt", ""]) {
      assert.equal(mic({ device, state }).step, "ask", `${device} ${state}`);
      assert.equal(mic({ device, state }).button, "Allow the microphone");
    }
  }
  // Android and the iPhone won't ask any more: their settings for Tamkeen.
  assert.equal(mic({ device: "android", state: "denied" }).step, "system");
  assert.equal(mic({ device: "android", state: "denied" }).button, "Open Tamkeen's settings");
  assert.match(mic({ device: "android", state: "denied" }).text, /Permissions → Microphone/);
  assert.equal(mic({ device: "ios", state: "denied" }).step, "system");
  assert.equal(mic({ device: "ios", state: "denied" }).button, "Open Settings");
  // A web page can't open its browser's settings: it says where they are, and asks again.
  const web = mic({ device: "web", state: "denied" });
  assert.equal(web.step, "ask");
  assert.equal(web.button, "Try again");
  assert.match(web.text, /lock or tune icon/);
  // Allowed by now: just try again.
  assert.equal(mic({ device: "android", state: "granted" }).button, "Try again");
  // The computer's own window: the system's microphone privacy page.
  assert.equal(mic({ device: "desktop", os: "windows" }).step, "system");
  assert.equal(mic({ device: "desktop", os: "windows" }).button, "Open Windows settings");
  assert.equal(mic({ device: "desktop", os: "mac" }).button, "Open System Settings");
  assert.equal(mic({ device: "desktop", os: "linux" }).step, "ask");
  for (const env of [{ device: "android", state: "denied" }, { device: "web" }, { device: "desktop", os: "windows" }]) {
    assert.equal(mic(env).perm, "microphone");
    assert.equal(mic(env).title, "Allow the microphone");
  }
});

// ---------------------------------------------------------------- Settings links

test("Settings links are built the way Settings reads them", () => {
  assert.equal(settingsHref("voices", "cardvoice"), "#/settings?s=voices&show=cardvoice");
  assert.equal(settingsHref("words"), "#/settings?s=words");
  assert.equal(settingsHref("", "anki"), "#/settings?show=anki");
  assert.equal(settingsHref(), "#/settings");
  assert.equal(settingsHref("account", "a b&c"), "#/settings?s=account&show=a+b%26c");
  // The same link the word popup's "Add audio" and the builder already use.
  assert.equal(settingsHref("voices", "cardvoice"), read("web/js/cardvoice.js").match(/VOICE_SETTINGS = "([^"]+)"/)[1]);
});

test("every popup's place in Settings is a setting Settings' search knows, in that section", () => {
  // settingsui.js FINDS (one entry per line there): {s, id, on}.
  const finds = [...read("web/js/components/settingsui.js").match(/export const FINDS = \[([\s\S]*?)\n\];/)[1]
    .matchAll(/\{\s*s:\s*"([^"]+)",\s*id:\s*"([^"]+)"([^\n]*)/g)].map((m) => ({ s: m[1], id: m[2], on: (m[3].match(/on:\s*\[([^\]]*)\]/) || [])[1] || "" }));
  for (const cause of CAUSES) {
    const place = placeOf(cause);
    if (!place || !place.s) continue;
    const hits = finds.filter((f) => f.id === place.show);
    assert.ok(hits.length, `${cause}: "${place.show}" isn't in FINDS`);
    assert.ok(hits.some((f) => f.s === place.s), `${cause}: "${place.show}" isn't in section ${place.s}`);
  }
  // "Get the app" is only in the web app's Settings, and only the web app sends people there.
  assert.match(finds.find((f) => f.id === "getapp").on, /"web"/);
  assert.match(read("mobile/src/js/web-youtube.js"), /offerFix\("getapp"/);
});

// ---------------------------------------------------------------- one at a time, never repeated

test("one popup at a time: the same cause never twice, others wait their turn", () => {
  const gate = fixGate();
  assert.equal(gate.ask("mic", 0), "show");
  // The screenshot's four red messages: four presses of Say it. Now: one popup, the rest skipped.
  for (let i = 0; i < 4; i++) assert.equal(gate.ask("mic", 10 + i), "skip");
  assert.equal(gate.ask("azurerefused", 20, { n: 1 }), "wait");
  assert.equal(gate.ask("azurerefused", 21, { n: 2 }), "skip");  // waiting already
  assert.equal(gate.showing, "mic");
  const next = gate.closed("mic", "dismissed", 100);
  assert.deepEqual(next, { cause: "azurerefused", item: { n: 1 } });
  assert.equal(gate.showing, "azurerefused");
  assert.equal(gate.closed("azurerefused", "fixed", 200), null);
  assert.equal(gate.showing, "");
});

test("after Dismiss the same cause stays quiet for a little while; after its button, more briefly", () => {
  const gate = fixGate();
  gate.ask("mic", 0);
  gate.closed("mic", "dismissed", 1000);
  assert.equal(gate.ask("mic", 1000 + 5 * 1000), "skip");
  assert.equal(gate.ask("mic", 1000 + QUIET_MS - 1), "skip");
  assert.equal(gate.ask("aikey", 2000), "show");  // another cause isn't kept quiet by it
  gate.closed("aikey", "fixed", 3000);
  assert.equal(gate.ask("aikey", 3000 + AFTER_FIX_MS - 1), "skip");
  assert.equal(gate.ask("aikey", 3000 + AFTER_FIX_MS), "show");
  gate.closed("aikey", "fixed", 3000 + AFTER_FIX_MS);
  assert.equal(gate.ask("mic", 1000 + QUIET_MS), "show");
  assert.ok(QUIET_MS >= 10 * 1000 && QUIET_MS <= 60 * 1000 && AFTER_FIX_MS < QUIET_MS);
});

test("only a few causes wait, and one that went quiet meanwhile is passed over", () => {
  const gate = fixGate();
  gate.ask("mic", 0);
  const others = ["aikey", "azurerefused", "drive", "friends", "language"];
  const answers = others.map((c) => gate.ask(c, 1));
  assert.deepEqual(answers, [...Array(MAX_WAITING).fill("wait"), ...Array(others.length - MAX_WAITING).fill("skip")]);
  // When the one on screen closes, the next waiting one shows, in the order they came.
  assert.equal(gate.closed("mic", "dismissed", 5).cause, "aikey");
  assert.equal(gate.closed("aikey", "dismissed", 6).cause, "azurerefused");
  assert.equal(gate.closed("azurerefused", "dismissed", 7).cause, "drive");
  assert.equal(gate.closed("drive", "dismissed", 8), null);
  assert.equal(gate.ask("aikey", 9), "skip");     // quiet after its Dismiss
  assert.equal(gate.ask("", 9), "skip");
  // One passed over without being shown (Settings was on screen by then) isn't kept quiet.
  gate.ask("language", 10);
  gate.ask("getapp", 10);
  assert.equal(gate.closed("language", "fixed", 11).cause, "getapp");
  assert.equal(gate.closed("getapp", "skipped", 12), null);
  assert.equal(gate.ask("getapp", 13), "show");
});

// ---------------------------------------------------------------- the messages at the bottom

function fakeScreen() {
  const box = {
    children: [],
    append(el) { el.parent = box; box.children.push(el); },
  };
  const make = (error = false) => () => ({
    dataset: {}, parent: null,
    classList: { contains: (c) => c === "error" && error },
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } },
  });
  const timers = { live: new Set(), n: 0,
    setTimeout(fn) { const id = ++this.n; this.live.add(id); return id; },
    clearTimeout(id) { this.live.delete(id); } };
  return { box, make, timers };
}

test("the same message pressed four times is one message on screen, shown afresh", () => {
  const { box, make, timers } = fakeScreen();
  const text = "That couldn't be copied here.";
  let last;
  for (let i = 0; i < 4; i++) last = placeToast(box, text, { error: true, build: make(true), timers });
  assert.equal(box.children.length, 1);
  assert.equal(box.children[0], last);        // the newest one, its time starting again
  assert.equal(timers.live.size, 1);          // the replaced ones' timers are gone
  assert.equal(last.dataset.text, text);
});

test("different messages stack only up to a few; the same words of another kind are another message", () => {
  const { box, make, timers } = fakeScreen();
  placeToast(box, "Saved.", { build: make(false), timers });
  placeToast(box, "Saved.", { error: true, build: make(true), timers });
  assert.equal(box.children.length, 2);
  for (const t of ["One", "Two", "Three", "Four"]) placeToast(box, t, { build: make(false), timers });
  assert.equal(box.children.length, MAX_TOASTS);
  assert.deepEqual(box.children.map((el) => el.dataset.text), ["Two", "Three", "Four"]);
  assert.equal(timers.live.size, MAX_TOASTS);
});

test("every shell's toast() hands a fixable problem to the popup and never stacks", () => {
  for (const shell of ["web/js/app.js", "mobile/src/js/app.js"]) {
    const src = read(shell);
    const body = src.slice(src.indexOf("export function toast("), src.indexOf("export function toast(") + 1200);
    assert.match(body, /offerFix\(message\)/, shell);
    assert.match(body, /placeToast\(/, shell);
    assert.match(src, /export const systemAccess = \{/, shell);
  }
  assert.match(read("extension/src/js/app.js"), /placeToast\(/);
  // The phones' native side has what the popup calls.
  assert.match(read("mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio/GoogleDriveAuthPlugin.java"),
    /public void permissionState\(PluginCall call\)[\s\S]*ACTION_APPLICATION_DETAILS_SETTINGS/);
  const swift = read("mobile/native-ios/ios/Sources/TamkeenNative/GoogleDriveAuthPlugin.swift");
  for (const name of ["permissionState", "openAppSettings"]) {
    assert.match(swift, new RegExp(`CAPPluginMethod\\(name: "${name}"`));
    assert.match(swift, new RegExp(`@objc func ${name}\\(_ call: CAPPluginCall\\)`));
  }
  assert.match(swift, /UIApplication\.openSettingsURLString/);
});
