// The word popup's Save asks which folder the card goes in (the owner, 2026-11-21: "When Clicking Save on a word popup
// it should ask you what folder to put it in"). One small box: New folder at the top, then the folder chosen last time
// (so saving word after word into the same folder is one tap), then "Not in a folder" and this language's folders.
// A tap saves and closes; closing the box saves nothing.
//
// One card per word (prototype word_pool, released): a word already in their words says which folders it is in, and a
// tap puts that same card in another folder too, as Add words does; "Make a second card" is there for the rare time
// they want one.
//
// Asked after "Which meaning?" (components/dictpick.js) when that applies. Shared by the desktop app, the phone and the
// web app; the browser extension's popup has no folders of its own (its words go to the web app later), so it doesn't ask.

import { api, esc, h, platform, toast } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs } from "../languages.js";
import { askName, openModal } from "./modal.js";
import { cardFor, folderNames } from "../addwords.js";
import { feature } from "../prototype.js";
import { sortFolders } from "../review/vocabedit.js";
import { saveChoices } from "../review/folderpicks.js";

const LAST_KEY = "saveFolder";  // {lang: folder uid, or "none"}: the last choice, per language studied

/** The folder chosen last time in `lang` ("none": not in a folder; "" when never chosen). */
export function lastFolder(lang) {
  try { return String((JSON.parse(localStorage.getItem(LAST_KEY) || "{}") || {})[lang] || ""); } catch { return ""; }
}
function rememberFolder(lang, uid) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) || "{}") || {};
    all[lang] = uid || "none";
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch { /* storage unavailable: asked the same way next time */ }
}

/**
 * Ask where the card for `word` goes. `text`: the card's own text (with its vowel marks, if any); `lang` the
 * language studied. Resolves to {folders: [uid]} for a new card ([] for none), {filed: true} when a card they had
 * already was put in another folder (nothing new to save), or null when they closed the box (nothing is saved).
 * Where there are no folders to choose from (the extension), {folders: []} straight away.
 */
export async function askSaveFolder({ word, text = "", lang = "" }) {
  if (platform === "extension") return { folders: [] };
  let folders = [];
  try { folders = sortFolders(await api(`/vocab/folders?language=${encodeURIComponent(lang)}`)); } catch { return { folders: [] }; }
  let have = null;
  if (feature("word_pool")) {
    try {
      const found = await api(`/vocab?q=${encodeURIComponent(word)}`);
      have = cardFor(found, text || word, lang) || (text && text !== word ? cardFor(found, word, lang) : null);
    } catch { have = null; }
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (done) return; done = true; resolve(value); };
    const sheet = openModal({ title: t("Which folder?"), onClose: () => finish(null) });
    sheet.el.querySelector(".modal-box").classList.add("sf-box");
    const attrs = langAttrs(lang);
    let second = false;  // "Make a second card": the word they have, saved again as a card of its own

    const pick = async (key, button) => {
      if (have && !second) {
        if (key === "none") { finish({ filed: true }); sheet.close(); return; }
        button.disabled = true;
        try {
          await api("/vocab/bulk-folders", { method: "POST", body: { ids: [have.id], add: [key] } });
          const name = (folders.find((f) => f.uid === key) || {}).name || "";
          toast(t("“{0}” is in {1} now too.", have.text, name));
          rememberFolder(lang, key);
          finish({ filed: true });
          sheet.close();
        } catch (err) { button.disabled = false; toast(err.message, { error: true }); }
        return;
      }
      rememberFolder(lang, key);
      finish({ folders: key === "none" ? [] : [key] });
      sheet.close();
    };

    const make = async () => {
      const name = await askName(t("New folder"), t("Name for the new folder"));
      if (!name || done) return;
      try {
        const made = await api("/vocab/folders", { method: "POST", body: { name, language: lang } });
        folders = sortFolders([...folders, made]);
        await pick(made.uid, document.createElement("button"));
      } catch (err) { toast(err.message, { error: true }); }
    };

    const draw = () => {
      const filing = have && !second;
      const inIt = filing ? new Set(have.folders || []) : new Set();
      const shown = saveChoices(folders.filter((f) => !inIt.has(f.uid)), lastFolder(lang), t("Not in a folder"))
        .filter((c) => !(filing && c.key === "none"));
      const names = filing ? folderNames(have, folders) : [];
      const body = h(`<div class="sf">
        <div class="sf-word" ${attrs}>${esc(text || word)}</div>
        ${filing ? `<p class="sf-lead">${esc(names.length ? t("You have it already: in {0}", names.join(", ")) : t("You have it already: not in a folder"))}</p>
          ${shown.length ? `<p class="sf-lead muted">${esc(t("Put the same card in another folder too:"))}</p>` : ""}` : ""}
        <button type="button" class="sf-new">${icon("plus", 18)}<span>${esc(t("New folder"))}</span></button>
        <div class="sf-list" role="list"></div>
        ${filing ? `<div class="sf-foot">
          <button type="button" class="ghost sf-keep">${esc(t("Leave it where it is"))}</button>
          <button type="button" class="ghost sf-second">${esc(t("Make a second card"))}</button>
        </div>` : ""}
      </div>`);
      const list = body.querySelector(".sf-list");
      for (const c of shown) {
        const b = h(`<button type="button" class="sf-opt${c.last ? " last" : ""}" role="listitem">
          ${c.folder ? icon("folder", 18) : icon("vocab", 18)}<span class="sf-name"></span>${c.last ? `<span class="sf-tag">${esc(t("Last time"))}</span>` : ""}
        </button>`);
        const name = b.querySelector(".sf-name");
        name.textContent = c.name;
        if (c.folder) name.setAttribute("translate", "no");
        b.onclick = () => pick(c.key, b);
        list.append(b);
      }
      body.querySelector(".sf-new").onclick = make;
      const keep = body.querySelector(".sf-keep");
      if (keep) keep.onclick = () => { finish({ filed: true }); sheet.close(); };
      const again = body.querySelector(".sf-second");
      if (again) again.onclick = () => { second = true; draw(); };
      sheet.body.replaceChildren(body);
      (list.querySelector(".sf-opt") || body.querySelector(".sf-new")).focus({ preventScroll: true });
    };
    draw();
  });
}
