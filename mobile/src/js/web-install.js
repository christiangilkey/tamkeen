// The web app's "add to home screen" button: a small icon in the top bar, shown only in a browser
// tab (not once Tamkeen has been added and opens on its own), with steps for the device in hand:
// iPhone or iPad (Safari, or another browser there), Android (Chrome's own install prompt when it
// offers one, or the menu steps), or a computer.

import { h } from "./app.js";
import { isWeb } from "./native.js";
import { openModal } from "./components/modal.js";

let installPrompt = null; // Chrome's "install this app" prompt, kept for the button (Android, computers)
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener("appinstalled", () => { installPrompt = null; document.querySelector(".top-install")?.remove(); });
}

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/** Which device and browser: {os: "ios"|"android"|"computer", browser: "safari"|"chrome"|"samsung"|"firefox"|"edge"|"other"}. */
export function device(ua = navigator.userAgent, touchMac = false) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (touchMac && /Macintosh/.test(ua)); // an iPad says it is a Mac
  const os = ios ? "ios" : /Android/.test(ua) ? "android" : "computer";
  const browser = /SamsungBrowser/.test(ua) ? "samsung" : /EdgiOS|EdgA|Edg\//.test(ua) ? "edge"
    : /FxiOS|Firefox/.test(ua) ? "firefox" : /CriOS|Chrome/.test(ua) ? "chrome" : /Safari/.test(ua) ? "safari" : "other";
  return { os, browser, ipad: /iPad/.test(ua) || (ios && /Macintosh/.test(ua)) };
}

const SHARE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const ADD = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 8v6"/><path d="M9 11h6"/><path d="M10.5 18.5h3"/></svg>`;

/** The steps for this device, as a list of HTML lines. */
export function steps({ os, browser, ipad }) {
  if (os === "ios") {
    if (browser === "safari" || browser === "other") {
      return [`Tap the <strong>Share</strong> button ${SHARE} ${ipad ? "at the top of the screen" : "at the bottom of the screen"}.`,
        "Scroll down the list and tap <strong>Add to Home Screen</strong>.",
        "Tap <strong>Add</strong> (top right). Tamkeen is now on your home screen."];
    }
    return [`Tap the <strong>Share</strong> button ${SHARE} in the address bar${browser === "chrome" ? " (top right)" : ""}.`,
      "Tap <strong>Add to Home Screen</strong> (scroll down if you don't see it).",
      "Tap <strong>Add</strong>. If it isn't there, open this page in Safari and add it from there."];
  }
  if (os === "android") {
    if (browser === "samsung") {
      return ["Tap the menu <strong>≡</strong> at the bottom right.", "Tap <strong>Add page to</strong>, then <strong>Home screen</strong>.", "Tap <strong>Add</strong>."];
    }
    if (browser === "firefox") {
      return ["Tap the menu <strong>⋮</strong>.", "Tap <strong>Install</strong> (or <strong>Add to Home screen</strong>).", "Tap <strong>Add</strong>."];
    }
    return ["Tap the menu <strong>⋮</strong> at the top right.", "Tap <strong>Add to Home screen</strong> (it may say <strong>Install app</strong>).",
      "Tap <strong>Install</strong> or <strong>Add</strong>. Tamkeen then opens like an app, without the browser around it."];
  }
  if (browser === "chrome") {
    return ["Click the install icon at the right end of the address bar (a screen with a down arrow).",
      "Or open the menu <strong>⋮</strong>, then <strong>Cast, save and share</strong> → <strong>Install page as app</strong>.", "Click <strong>Install</strong>."];
  }
  if (browser === "edge") return ["Open the menu <strong>…</strong>, then <strong>Apps</strong> → <strong>Install this site as an app</strong>.", "Click <strong>Install</strong>."];
  if (browser === "safari") return ["On a Mac, in the menu bar choose <strong>File</strong> → <strong>Add to Dock</strong>.", "Click <strong>Add</strong>."];
  return ["This browser can't add web apps. Open this page in Chrome or Edge, then use its install button in the address bar."];
}

function showSteps() {
  const d = device(navigator.userAgent, navigator.maxTouchPoints > 1);
  const where = d.os === "ios" ? (d.ipad ? "iPad" : "iPhone") : d.os === "android" ? "Android phone" : "computer";
  const modal = openModal({ title: d.os === "computer" ? "Install Tamkeen" : "Add Tamkeen to your home screen" });
  const box = h(`<div class="stack">
    <p class="muted" style="margin:0">Tamkeen then opens from its own icon, full screen, like an app. On this ${where}:</p>
    <ol class="install-steps">${steps(d).map((s) => `<li>${s}</li>`).join("")}</ol>
    ${installPrompt ? `<button type="button" class="primary big" data-install>Install now</button>` : ""}
  </div>`);
  box.querySelector("[data-install]")?.addEventListener("click", async () => {
    const prompt = installPrompt;
    installPrompt = null;
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch { /* closed */ }
    modal.close();
  });
  modal.body.append(box);
}

/** Put the button in the top bar (web app only, and not when it is already on the home screen). */
export function mountInstallButton(topbar) {
  if (!isWeb || !topbar || standalone()) return;
  const b = h(`<button type="button" class="top-install ghost icon" title="Add Tamkeen to your home screen" aria-label="Add Tamkeen to your home screen">${ADD}</button>`);
  b.onclick = showSteps;
  const search = topbar.querySelector(".top-search");
  if (search) search.before(b); else topbar.append(b);
}
