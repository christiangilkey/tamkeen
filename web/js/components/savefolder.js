// The word popup's folder button, next to Save (the owner, 2026-11-21: "instead it should be a folder button which
// allows the user to select which folder the saved word goes into"; it took the place of the microphone, "Add audio").
// The button shows the folder the next card goes in, remembered per language studied, so it is set once and Save saves
// there with no question. A tap opens this menu: New folder at the top, then "Not in a folder" and the folders, the one
// chosen ticked; a tap picks and closes.
//
// One card per word (word_pool, released): for a word already in their words, the button shows the folders its card
// is in, and the menu ticks them; a tap puts the card in a folder or takes it out ("Not in a folder" takes it out of
// all of them). "Make a second card" is there for the rare time they want one.
//
// Shared by the desktop app, the phone and the web app; the browser extension's popup has no folders of its own (its
// words go to the web app later), so it has no folder button.

import { api, esc, h, platform, toast } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { langAttrs } from "../languages.js";
import { askName, openModal } from "./modal.js";
import { cardFor } from "../addwords.js";
import { feature } from "../prototype.js";
import { sortFolders } from "../review/vocabedit.js";
import { NONE } from "../review/folderpicks.js";

const LAST_KEY = "saveFolder";  // {lang: {uid, name}}: the folder the button shows, per language studied

/** Does this version have folders to choose from? (The extension doesn't.) */
export const hasFolders = () => platform !== "extension";

/** The folder the button shows in `lang`: {uid, name} ({uid: ""} for "Not in a folder", the first time too). */
export function lastFolder(lang) {
  try {
    const v = (JSON.parse(localStorage.getItem(LAST_KEY) || "{}") || {})[lang];
    if (v && typeof v === "object" && v.uid && v.uid !== NONE) return { uid: String(v.uid), name: String(v.name || "") };
  } catch { /* storage unavailable */ }
  return { uid: "", name: "" };
}
export function rememberFolder(lang, folder) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) || "{}") || {};
    all[lang] = folder && folder.uid ? { uid: folder.uid, name: folder.name || "" } : { uid: "" };
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch { /* storage unavailable: "Not in a folder" next time */ }
}

/**
 * What the popup needs for `word` in `lang`: this language's folders (sorted) and the card they have already (one card
 * per word), or null. `text`: the card's own text when it differs (its vowel marks).
 */
export async function folderState(word, text, lang) {
  if (!hasFolders()) return { folders: [], card: null };
  const [folders, card] = await Promise.all([
    api(`/vocab/folders?language=${encodeURIComponent(lang)}`).then(sortFolders).catch(() => []),
    feature("word_pool") ? api(`/vocab?q=${encodeURIComponent(word)}`)
      .then((found) => cardFor(found, text || word, lang) || (text && text !== word ? cardFor(found, word, lang) : null))
      .catch(() => null) : null,
  ]);
  return { folders, card };
}

/**
 * The menu. `current` {uid, name} the folder the button shows; `card` the card they have already, or null; `folders`
 * this language's folders (a folder made here is added to it). Resolves to {folder: {uid, name}} (the next card's
 * folder), {card} (the card they had, with its folders now), {second: true} ("Make a second card"), or null (closed).
 */
export function pickFolder({ word, text = "", lang = "", current = { uid: "" }, card = null, folders = [] }) {
  return new Promise((resolve) => {
    let done = false;
    const sheet = openModal({ title: t("Which folder?"), onClose: () => { if (!done) { done = true; resolve(null); } } });
    const finish = (value) => { if (done) return; done = true; resolve(value); sheet.close(); };
    sheet.el.querySelector(".modal-box").classList.add("sf-box");
    const nameOf = (uid) => (folders.find((f) => f.uid === uid) || {}).name || "";

    /** A card they have: into or out of `uid` ("" = out of every folder). */
    const file = async (uid, button) => {
      const before = card.folders || [];
      const isIn = before.includes(uid);
      const body = !uid ? { ids: [card.id], remove: before } : isIn ? { ids: [card.id], remove: [uid] } : { ids: [card.id], add: [uid] };
      button.disabled = true;
      try {
        await api("/vocab/bulk-folders", { method: "POST", body });
        const now = !uid ? [] : isIn ? before.filter((x) => x !== uid) : [...new Set([...before, uid])];
        toast(!uid ? t("“{0}” is in no folder now.", card.text) : isIn ? t("“{0}” is out of {1} now.", card.text, nameOf(uid))
          : t("“{0}” is in {1} now too.", card.text, nameOf(uid)));
        if (uid && !isIn) rememberFolder(lang, { uid, name: nameOf(uid) });
        finish({ card: { ...card, folders: now } });
      } catch (err) { button.disabled = false; toast(err.message, { error: true }); }
    };
    const pick = (uid, button) => {
      if (card) { file(uid, button); return; }
      const folder = { uid, name: nameOf(uid) };
      rememberFolder(lang, folder);
      finish({ folder });
    };
    const make = async () => {
      const name = await askName(t("New folder"), t("Name for the new folder"));
      if (!name || done) return;
      try {
        const made = await api("/vocab/folders", { method: "POST", body: { name, language: lang } });
        folders.splice(0, folders.length, ...sortFolders([...folders, made]));
        pick(made.uid, document.createElement("button"));
      } catch (err) { toast(err.message, { error: true }); }
    };

    const has = card ? card.folders || [] : [];
    const on = (uid) => (card ? (uid ? has.includes(uid) : !has.length) : uid === (current.uid || ""));
    const names = folders.filter((f) => has.includes(f.uid)).map((f) => f.name);
    const body = h(`<div class="sf">
      <div class="sf-word" ${langAttrs(lang)}>${esc(text || word)}</div>
      ${card ? `<p class="sf-lead">${esc(names.length ? t("You have it already: in {0}", names.join(", ")) : t("You have it already: not in a folder"))}</p>` : ""}
      <button type="button" class="sf-new">${icon("plus", 18)}<span>${esc(t("New folder"))}</span></button>
      <div class="sf-list" role="list"></div>
      ${card ? `<div class="sf-foot"><button type="button" class="ghost sf-second">${esc(t("Make a second card"))}</button></div>` : ""}
    </div>`);
    const list = body.querySelector(".sf-list");
    for (const [uid, name] of [["", t("Not in a folder")], ...folders.map((f) => [f.uid, f.name])]) {
      const b = h(`<button type="button" class="sf-opt${on(uid) ? " on" : ""}" role="listitem" aria-pressed="${on(uid)}">
        ${uid ? icon("folder", 18) : icon("vocab", 18)}<span class="sf-name"></span><span class="sf-tick" aria-hidden="true">${on(uid) ? icon("check", 18) : ""}</span>
      </button>`);
      const label = b.querySelector(".sf-name");
      label.textContent = name;
      if (uid) label.setAttribute("translate", "no");
      b.onclick = () => pick(uid, b);
      list.append(b);
    }
    body.querySelector(".sf-new").onclick = make;
    const again = body.querySelector(".sf-second");
    if (again) again.onclick = () => finish({ second: true });
    sheet.body.append(body);
    (list.querySelector(".sf-opt.on") || body.querySelector(".sf-new")).focus({ preventScroll: true });
  });
}
