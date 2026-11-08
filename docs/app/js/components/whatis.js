// Settings → What is Tamkeen: three pages, each a Markdown file carried by every version of the app.
// "How to use" (a short guide, then everything the app can do), "What makes Tamkeen special" (its own
// solutions and techniques) and "Supporting studies" (the research behind its design, every study linked).
// English only, like the changelog, so the pages are marked translate="no". Drawn by the changelog's
// little Markdown reader.

import { changelogHtml } from "./changelog.js";
import { t } from "../i18n.js";

/** The three pages: their file, their title (the button's label), and whether each "###" part of the page
 * opens and closes (`fold`). */
export const WHATIS_PAGES = {
  howto: { file: "whatis-howto.md", title: () => t("How to use Tamkeen") },
  special: { file: "whatis-special.md", title: () => t("What makes Tamkeen special"), fold: true },
  studies: { file: "whatis-studies.md", title: () => t("Supporting studies") },
};

/** Each "###" part of a drawn page (an h4 from changelogHtml, up to the next heading) as a section that opens
 * and closes, its heading the button. The page's opening lines stay as they are. */
export function foldSections(html) {
  return String(html).replace(/<h4>([\s\S]*?)<\/h4>([\s\S]*?)(?=<h[1-4]>|$)/g,
    (_, head, rest) => `<details class="whatis-fold"><summary>${head}</summary><div class="whatis-fold-body">${rest}</div></details>`);
}

/** Open one of the "What is Tamkeen" pages in a box over the page. */
export async function openWhatIs(page = "howto") {
  const p = WHATIS_PAGES[page] || WHATIS_PAGES.howto;
  const { openModal } = await import("./modal.js");
  const box = openModal({ title: p.title(), wide: true });
  box.body.classList.add("changelog", "whatis");
  box.body.setAttribute("translate", "no");
  box.body.textContent = "…";
  try {
    const r = await fetch(p.file, { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    const html = changelogHtml(await r.text());
    box.body.innerHTML = p.fold ? foldSections(html) : html;
  } catch {
    box.body.textContent = t("Couldn't open this page.");
  }
}
