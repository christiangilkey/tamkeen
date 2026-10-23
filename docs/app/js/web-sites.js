// The Library's "Web page" screen (route #/sites) on the phones and the web app: the one screen
// every version shares (pages/websites.js: paste an address to import it, your saved sites with
// "Add a site", news in the language being learned).
//
// The phone apps show it as it is; their sites open in the app's own browser. The web app has no
// browser of its own (a web page can't hold other sites with an import button), so there a site
// opens in a new tab: the learner copies an article's address there and comes back to the round
// teal import button (or pastes it in the box), or shares the article to Tamkeen from Chrome's
// menu when the web app is installed on an Android phone (web-import.js).

import { toast } from "./app.js";
import { isWeb } from "./native.js";
import { renderSites } from "./pages/websites.js";
import { importButton } from "./web-import.js";
import { device } from "./web-install.js";

export function render(view) {
  if (!isWeb) return renderSites(view);
  // (Added with push, not written inside [ ]: the translation collector, tools/i18n/extract.mjs, reads text
  // straight after a "[" as a lookup key and leaves it out, so this stayed in English.)
  const notes = [];
  notes.push("Open a site (it opens in a new tab), find an article and copy its address, then come back and tap the round teal button.");
  if (device().os === "android") {
    notes.push("With Tamkeen added to your home screen you can also share the article straight to Tamkeen: in Chrome tap ⋮, then Share, then Tamkeen.");
  }
  return renderSites(view, { web: { notes, after: (page, input) => {
    // Paste: a phone's browser often hides its own Paste until the box is long-pressed.
    const paste = document.createElement("button");
    paste.type = "button";
    paste.className = "ghost sites-paste";
    paste.textContent = "Paste";
    paste.onclick = async () => {
      try { input.value = (await navigator.clipboard.readText()).trim(); input.focus(); }
      catch { toast("Your browser didn't allow pasting from here. Long-press the box and choose Paste.", { error: true }); }
    };
    input.after(paste);
    page.append(importButton(input)); // bottom right, like the browsers' import button
    page.classList.add("with-fab"); // the last sites never sit under it
  } } });
}
