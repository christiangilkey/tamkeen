// Settings → What is Tamkeen: everything the app does, the inventive ways it does it, and the studies behind
// its design, with the studies listed (web/whatis.md, carried by every version of the app). English only,
// like the changelog, so the page is marked translate="no". Drawn by the changelog's little Markdown reader.

import { changelogHtml } from "./changelog.js";

/** Open "What is Tamkeen" in a box over the page. */
export async function openWhatIs() {
  const { openModal } = await import("./modal.js");
  const box = openModal({ title: "What is Tamkeen", wide: true });
  box.body.classList.add("changelog", "whatis");
  box.body.setAttribute("translate", "no");
  box.body.textContent = "…";
  try {
    const r = await fetch("whatis.md", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    box.body.innerHTML = changelogHtml(await r.text());
  } catch {
    box.body.textContent = "Couldn't open this page.";
  }
}
