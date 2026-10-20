// Importing a page into the web app, which can't put a button on someone else's website (a web page
// can only draw inside its own tab). So the web app takes pages two ways instead:
//  1. "Share → Tamkeen": once the web app is installed on an Android phone, Chrome's Share menu lists
//     it (the manifest's share_target, webapp/build-web.mjs). Sharing opens the web app at
//     ./?share_url=…&share_text=…&share_title=…, and boot() in app.js hands that to importShared.
//  2. A round teal import button on the "Read the web" page (web-sites.js), where a learner comes
//     back after opening a site: it imports the article address they copied in the other tab.

import { h, toast } from "./app.js";
import { icon } from "./icons.js";
import { importUrl } from "./pageimport.js";
import { firstAddress, sharedPage, withoutShare } from "./share-target.js";

let importing = false;

/** Import one page by its address and open it in the reader. Resolves to true when it worked. */
export async function importAddress(url) {
  if (importing) return false;
  importing = true;
  toast("Importing the page…");
  try {
    const ep = await importUrl(url);
    toast(`Imported “${ep.title}”.`);
    location.hash = `#/episode/${ep.id}`;
    return true;
  } catch (e) {
    toast(e.message || "Couldn't import that page.", { error: true });
    return false;
  } finally {
    importing = false;
  }
}

/** Called once at start: a page shared to the web app ("Share → Tamkeen") is imported and opened.
 *  `ready` is false before a language has been chosen (the welcome page is showing). */
export async function importShared(ready) {
  const { shared, url } = sharedPage(location.search);
  if (!shared) return;
  history.replaceState(history.state, "", withoutShare(location.href));
  if (!url) { toast("What was shared has no web address in it, so there is nothing to import.", { error: true }); return; }
  if (!ready) { toast("Choose the language you're learning first, then share the page to Tamkeen again.", { error: true }); return; }
  await importAddress(url);
}

/** The round teal import button for the "Read the web" page. `input` is the page's address box:
 *  with nothing copied, the button puts the learner there instead. */
export function importButton(input) {
  const button = h(`<button type="button" class="add-fab web-import-fab" aria-label="Import to Tamkeen">${icon("import", 28)}</button>`);
  button.title = "Import to Tamkeen: the article address you copied";
  button.onclick = async () => {
    let copied = "";
    try { copied = firstAddress(await navigator.clipboard.readText()); } catch { /* not allowed, or nothing there */ }
    if (copied) {
      if (input) input.value = copied;
      button.disabled = true;
      try { await importAddress(copied); } finally { button.disabled = false; }
      return;
    }
    if (input) { input.focus(); input.scrollIntoView({ block: "center", behavior: "smooth" }); }
    toast("Copy the article's address in the other tab (or share it to Tamkeen from there), then tap this button again.",
      { timeout: 8000 });
  };
  return button;
}
