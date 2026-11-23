// The picture on the back of a flashcard, and the picker that chooses it (prototype "card_pictures"; the rules and
// Openverse's terms are in cardpicture.js). Shown on the back of a review card (pages/review.js) and on a word
// opened on the Vocab page (components/wordeditor.js). Shared by the desktop app, the phone and the web app.
//
//   - A card with a picture shows it, with its credit under it ("Photo: Jane Doe · CC BY 2.0", a link to where it
//     came from, as CC BY asks). A tap on the picture opens the picker.
//   - A card without one shows a small "Add picture" button (no room taken otherwise), which opens the picker.
//   - The picker: pictures from Openverse for the card's short meaning (a search box to try other words, "More
//     pictures"), "Use my own picture" (the camera or the photos on a phone, a file on a computer) and
//     "Remove picture". The chosen picture is made small here (cardpicture.js PICTURE_SIDE) and kept on the card.

import { esc, h, pictureUrl, removePicture, savePicture, toast } from "../app.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { feature } from "../prototype.js";
import { openModal } from "./modal.js";
import { DOWN, MAX_BYTES, NOTICE, PICTURE_SIDE, QUALITY, cleanMeta, countSearch, creditText, licenseName, pictureMeta, pictureOf,
         searchPictures, searchQuery } from "../cardpicture.js";

/** A phone or tablet (a camera to take the photo with), rather than a computer. */
const touchDevice = () => {
  try { return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent); } catch { return false; }
};
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
const storage = () => { try { return localStorage; } catch { return { getItem: () => null, setItem() {} }; } };

/** Is the picture feature on (prototype mode, until the owner releases it)? */
export const picturesOn = () => feature("card_pictures");

// ---------------------------------------------------------------- making a picture small

/** A picture (a Blob or File) made into a small JPEG: PICTURE_SIDE px on its longest side at most. */
export async function shrinkPicture(blob, side = PICTURE_SIDE) {
  let source = null, w = 0, hgt = 0, url = "";
  try {
    if (typeof createImageBitmap === "function") {
      try {
        source = await createImageBitmap(blob, { imageOrientation: "from-image" });
        w = source.width; hgt = source.height;
      } catch { source = null; }
    }
    if (!source) {
      url = URL.createObjectURL(blob);
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("This picture can't be opened here. Choose a JPEG or PNG."));
        img.src = url;
      });
      w = source.naturalWidth; hgt = source.naturalHeight;
    }
    if (!w || !hgt) throw new Error("This picture is empty.");
    const scale = Math.min(1, side / Math.max(w, hgt));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(hgt * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";  // (a see-through PNG gets a white back, as JPEG has none)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const q of [QUALITY, 0.6, 0.45]) {
      const out = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (out && out.size <= MAX_BYTES) return out;
    }
    throw new Error("This picture is too large.");
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (source && typeof source.close === "function") source.close();
  }
}

/** Openverse's small copy of a result (its thumbnail), as a Blob. */
export async function fetchThumb(result) {
  let res;
  try {
    res = await fetch(result.thumb, { credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw Object.assign(new Error("Couldn't reach Openverse. Check the internet connection and try again."), { offline: true });
    }
    throw Object.assign(new Error(DOWN), { down: true });
  }
  if (res.status === 429) throw Object.assign(new Error("Openverse asks Tamkeen to slow down: try again in a while."), { rate: true });
  if (!res.ok) throw new Error("That picture couldn't be fetched. Try another one.");
  return res.blob();
}

/** Put an Openverse result on a card: fetched, made small, kept. Returns the card as saved. */
export async function useResult(card, result) {
  const blob = await shrinkPicture(await fetchThumb(result));
  return savePicture(card.id, blob, cleanMeta(pictureMeta(result)));
}

// ---------------------------------------------------------------- the picture on a card

/**
 * Show card `v`'s picture in `host` (or the "Add picture" button). `onChange(card)` is told when the picker
 * changed it (the saved card, whose `picture` is new). Returns { refresh() }.
 */
export function cardPicture(host, v, { onChange = () => {} } = {}) {
  let shown = "";
  function refresh() {
    if (!picturesOn()) { host.hidden = true; host.innerHTML = ""; return; }
    const meta = pictureOf(v);
    const key = meta ? meta.v : "";
    if (key === shown && host.childElementCount) return;
    shown = key;
    host.hidden = false;
    host.classList.add("cp");
    if (!meta) {
      host.innerHTML = `<button type="button" class="cp-add">${icon("image", 16)} <span>Add picture</span></button>`;
      host.querySelector(".cp-add").onclick = (e) => { e.stopPropagation(); pick(); };
      return;
    }
    const credit = creditText(meta);
    host.innerHTML = `<figure class="cp-fig">
        <button type="button" class="cp-img" title="Change or remove the picture" aria-label="Change or remove the picture"><img alt="" referrerpolicy="no-referrer"></button>
        ${credit ? `<figcaption class="cp-credit">${meta.url ? `<a href="${esc(meta.url)}" target="_blank" rel="noopener noreferrer"></a>` : "<span></span>"}</figcaption>` : ""}
      </figure>`;
    const img = host.querySelector("img");
    const line = host.querySelector(".cp-credit a, .cp-credit span");
    if (line) { line.textContent = credit; line.title = meta.title || credit; }
    host.querySelector(".cp-img").onclick = (e) => { e.stopPropagation(); pick(); };
    img.onerror = () => { if (shown === key) host.querySelector(".cp-img").classList.add("cp-missing"); };
    pictureUrl(v, meta).then((url) => { if (shown === key) img.src = url; }, () => {
      if (shown !== key) return;
      const b = host.querySelector(".cp-img");
      b.classList.add("cp-missing");
      b.insertAdjacentHTML("beforeend", `<span>${esc(t("This picture isn't on this device yet. Sync and try again."))}</span>`);
    });
  }
  function pick() {
    openPicturePicker(v, { onChange: (card) => { Object.assign(v, { picture: card.picture || "", updated_at: card.updated_at ?? v.updated_at }); refresh(); onChange(card); } });
  }
  // A picture "Add pictures" gave this card while it is on screen (picturebatch.js announces it).
  const onPicture = (e) => {
    if (!host.isConnected) { window.removeEventListener("tk-card-picture", onPicture); return; }
    const d = (e && e.detail) || {};
    if ((d.uid && d.uid === v.uid) || d.id === v.id) { v.picture = d.picture || ""; refresh(); }
  };
  window.addEventListener("tk-card-picture", onPicture);
  refresh();
  return { refresh };
}

// ---------------------------------------------------------------- the picker

/** The picker for card `v`: Openverse's pictures for its meaning, your own picture, or none. */
export function openPicturePicker(v, { onChange = () => {} } = {}) {
  const has = !!pictureOf(v);
  const phone = touchDevice();
  const modal = openModal({ title: t("Picture for “{0}”", v.text || ""), wide: true, cls: "cp-back" });
  const body = modal.body;
  body.innerHTML = `
    <form class="cp-search" role="search">
      <input type="search" class="cp-q" enterkeyhint="search" aria-label="Words to search pictures for" placeholder="Search pictures (in English)">
      <button type="submit" class="primary">${icon("search", 16)} <span>Search</span></button>
    </form>
    <div class="cp-status muted" role="status"></div>
    <div class="cp-grid"></div>
    <div class="cp-more-row" hidden><button type="button" class="cp-more">More pictures</button></div>
    <div class="cp-own">
      ${phone ? `<button type="button" class="cp-camera">${icon("camera", 16)} <span>Take a photo</span></button>
                 <button type="button" class="cp-file">${icon("image", 16)} <span>Choose a photo</span></button>`
              : `<button type="button" class="cp-file">${icon("upload", 16)} <span>Use my own picture</span></button>`}
      ${has ? `<button type="button" class="cp-remove danger">${icon("trash", 16)} <span>Remove picture</span></button>` : ""}
    </div>
    <p class="cp-notice muted"></p>`;
  const $ = (s) => body.querySelector(s);
  $(".cp-notice").textContent = t(NOTICE);
  const box = $(".cp-q"), grid = $(".cp-grid"), status = $(".cp-status"), moreRow = $(".cp-more-row");
  box.value = searchQuery(v.meaning) || "";
  let query = "", page = 1, pages = 0, busy = false, run = 0;

  const say = (text, error = false) => { status.textContent = text ? t(text) : ""; status.classList.toggle("cp-error", error); };
  const done = (card) => { modal.close(); onChange(card); };

  async function search(q, next = false) {
    q = String(q || "").trim();
    if (!q) { say("Type a word or two to search for."); return; }
    if (busy && next) return;
    const mine = ++run;
    busy = true;
    if (!next) { query = q; page = 1; grid.innerHTML = ""; }
    say("Searching Openverse…");
    moreRow.hidden = true;
    try {
      countSearch(storage(), today());
      const found = await searchPictures(query, { page });
      if (mine !== run) return;
      pages = found.pages;
      for (const r of found.results) grid.append(tile(r));
      say(grid.childElementCount ? "" : "No pictures found. Try other words, in English.");
      moreRow.hidden = !found.results.length || page >= pages;
    } catch (e) {
      if (mine === run) say(e.message, true);
    } finally {
      if (mine === run) busy = false;
    }
  }

  function tile(r) {
    const b = h(`<button type="button" class="cp-tile"><img alt="" loading="lazy" referrerpolicy="no-referrer"><span class="cp-tile-credit"></span></button>`);
    b.querySelector("img").src = r.thumb;
    b.querySelector("img").alt = r.title || "";
    b.querySelector(".cp-tile-credit").textContent = `${licenseName(r.license, r.license_version)}${r.creator ? ` · ${r.creator}` : ""}`;
    b.title = r.title || "";
    b.querySelector("img").onerror = () => b.remove();
    b.onclick = async () => {
      if (b.classList.contains("busy")) return;
      b.classList.add("busy");
      say("Adding the picture…");
      try {
        done(await useResult(v, r));
      } catch (e) {
        b.classList.remove("busy");
        say(e.message, true);
      }
    };
    return b;
  }

  /** The camera (`camera`), or the photos / files, through the browser's own file box. */
  function choose(camera) {
    const input = h(`<input type="file" accept="image/*" hidden>`);
    if (camera) input.setAttribute("capture", "environment");
    input.onchange = async () => {
      const file = (input.files || [])[0];
      input.remove();
      if (!file) return;
      say("Adding the picture…");
      try {
        const blob = await shrinkPicture(file);
        done(await savePicture(v.id, blob, cleanMeta(pictureMeta(null))));
      } catch (e) {
        say(e.message, true);
      }
    };
    document.body.append(input);
    input.click();  // (still inside the tap, so a phone lets it open)
  }

  $(".cp-search").onsubmit = (e) => { e.preventDefault(); search(box.value); };
  $(".cp-more").onclick = () => { page++; search(query, true); };
  $(".cp-file").onclick = () => choose(false);
  if ($(".cp-camera")) $(".cp-camera").onclick = () => choose(true);
  if ($(".cp-remove")) {
    $(".cp-remove").onclick = async () => {
      try { done(await removePicture(v.id)); } catch (e) { toast(e.message, { error: true }); }
    };
  }
  if (box.value) search(box.value);
  else say("Type a word or two to search for.");
  if (!phone) box.focus();
  return modal;
}
