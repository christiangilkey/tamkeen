// The open-source licences Tamkeen is built on, as a fold in Settings → Data & updates on every
// device. The list is licenses/index.json, shared by all of them: the computer asks its server
// (/api/about, /api/licenses/<file>); the phone, iPhone and web app read the copies their build
// made (mobile/scripts/build-www.mjs).

import { esc, h } from "../app.js";

/** `list()` resolves to [{name, license, file}], `text(file)` to that licence's text. */
export function licensesFold({ list, text }) {
  const fold = h(`<details class="set-info licenses"><summary>Open-source licenses</summary><div class="stack lic-list"></div></details>`);
  const box = fold.querySelector(".lic-list");
  let filled = false;
  fold.addEventListener("toggle", async () => {
    if (!fold.open || filled) return;
    filled = true;
    box.textContent = "Loading…";
    try {
      const items = await list();
      box.textContent = "";
      for (const l of items) {
        // (Names are shown in the app's language, as on the computer's About page; licence texts as written.)
        const d = h(`<details><summary><strong>${esc(l.name)}</strong> <span class="muted small">· ${esc(l.license)}</span></summary><pre translate="no">…</pre></details>`);
        d.addEventListener("toggle", async () => {
          if (!d.open || d.dataset.loaded) return;
          d.dataset.loaded = "1";
          try {
            d.querySelector("pre").textContent = await text(l.file);
          } catch {
            delete d.dataset.loaded;
            d.querySelector("pre").textContent = "";
          }
        });
        box.append(d);
      }
    } catch {
      filled = false;
      box.textContent = "Couldn't load the list. Try again later.";
    }
  });
  return fold;
}
