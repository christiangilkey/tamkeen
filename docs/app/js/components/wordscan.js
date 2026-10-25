// "Add words" → Scan: words from a photo of a list, or of a single word (components/wordbuilder.js
// shows it beside "One by one" and "Paste a list"). Every version has it.
//
// Phones: "Take a photo" (the camera) and "Choose a photo". Computer: "Choose a picture", a picture
// dropped on the builder, or pasted (Ctrl+V). Several photos in a row (the pages of one list) add to
// the same batch. Each is read by the learner's AI when it can read pictures, else on this device
// (Tesseract, ocr.js; downloaded once, on demand); scanwords.js chooseReader says which. What was
// found is shown like a pasted list: a count, each word with its meaning when the page had one,
// repeats flagged and left unticked, the photo above to compare; "Edit as text" turns it into the
// paste box; "Use these" makes the builder's rows exactly as a pasted list does. A single word goes
// straight into a row.
//
// Photos are held in memory only, never saved or synced, and let go of when the builder closes.

import { esc, h, forgetPhotos, showMenu, state, toast } from "../app.js";
import { icon } from "../icons.js";
import { t, uiLanguage, UI_LANGUAGES } from "../i18n.js";
import { langAttrs, langInfo } from "../languages.js";
import { PROVIDERS } from "../definer.js";
import { definerConfig, noAi } from "../define-service.js";
import { duplicates } from "../addwords.js";
import { chooseReader, itemsToPaste, ocrPair, ownLanguage } from "../scanwords.js";
import { closeOcr, downloadOcr, ocrStatus, ocrSupport } from "../ocr.js";
import { openPicture, previewCopy, readOnDevice, readWithAi } from "../scanread.js";
import { openModal } from "./modal.js";

const PREFER_KEY = "tk_scanreader";  // "device" when the learner chose this device's reader over the AI
const AI_SETTINGS = "#/settings?s=words&show=key";
const settings = () => (state.status && state.status.settings) || {};
const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage off */ } };
const clean = (s) => String(s ?? "").replace(/[⟦⟧]/g, "");
const message = (err) => (err && err.message ? err.message : String(err));

/** A phone or tablet (a camera to take the photo with), rather than a computer. */
const touchDevice = () => {
  try { return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent); } catch { return false; }
};

/**
 * The Scan panel. `lang` is the language being learned; `existing()` the saved words (to find
 * repeats); `onUse(cards)` makes rows of them; `onText(text)` puts them in the paste box;
 * `onDirty()` hears that something is waiting to be used; `goTo(hash)` leaves for Settings (asking
 * first when something would be lost). Returns {el, take(files), hasInput(), shown(), close()}.
 */
export function scanPanel({ lang, existing = () => [], onUse = () => {}, onText = () => {}, onDirty = () => {}, goTo = () => {} }) {
  const info = langInfo(lang);
  const phone = touchDevice();
  const support = ocrSupport();
  const own = ownLanguage(settings().definer_language, uiLanguage(), UI_LANGUAGES);
  const pair = ocrPair(lang, own);
  let prefer = lsGet(PREFER_KEY);
  let device = null;        // this device's reader: {installed, bytes} once known
  let downloading = false;
  // Each photo: {id, url (its small copy, in memory), state: "waiting" | "reading" | "done" | "empty" |
  // "error", job}; a job is {photo, file, pic (the decoded picture, until it is read), camera, device}.
  const photos = [];
  const found = [];         // [{card, on, rep, photo}]
  const queue = [];         // jobs still to read, in order
  let busy = false;
  let status = null;        // the status line: {kind: "busy" | "error" | "empty" | "ask" | "note", text, tips?, actions?}
  let nextId = 1;
  let closed = false;

  const el = h(`<div class="cb-scan">
    <div class="cb-scan-pick">
      <span class="cb-scan-ico" aria-hidden="true">${icon("camera", 34)}</span>
      <p class="cb-scan-lead"></p>
      <div class="cb-scan-buttons"></div>
      <p class="cb-scan-paste small muted" hidden>You can also drop a picture here, or paste one (Ctrl+V).</p>
    </div>
    <div class="cb-scan-found" hidden>
      <div class="cb-scan-pics"></div>
      <p class="cb-pv-count cb-scan-count"></p>
      <ol class="cb-pv cb-scan-list"></ol>
      <div class="cb-scan-go">
        <button type="button" class="cb-scan-text">${icon("edit", 16)} Edit as text</button>
        <button type="button" class="primary cb-scan-use">Use these</button>
      </div>
    </div>
    <div class="cb-scan-status" aria-live="polite" hidden></div>
    <p class="cb-scan-reader small muted"></p>
  </div>`);
  const $ = (s) => el.querySelector(s);

  // ---------------------------------------------------------------- the reader

  const cfg = () => definerConfig();
  const providerName = () => (PROVIDERS[cfg().provider] || PROVIDERS.claude).short;
  const pick = () => chooseReader({ aiOff: noAi(), hasKey: !!cfg().key, provider: cfg().provider,
    online: typeof navigator === "undefined" || navigator.onLine !== false, deviceOk: support.ok, prefer });
  const deviceNames = () => {
    const names = [t(info.name)];
    if (own !== lang && UI_LANGUAGES[own]) names.push(t(UI_LANGUAGES[own].name));
    return names.length > 1 ? t("{0} and {1}", names[0], names[1]) : names[0];
  };
  const mb = (bytes) => (Math.max(0.1, Math.round((bytes || 0) / 1e5) / 10)).toLocaleString(undefined, { maximumFractionDigits: 1 });
  /** What is still to download (Tesseract itself may be here already, for another language). */
  const toGet = (st) => {
    const files = Object.values((st && st.files) || {});
    return files.length ? files.filter((f) => !f.installed).reduce((n, f) => n + (f.bytes || 0), 0) : (st && st.bytes) || 0;
  };

  /** The line under the panel: who reads the photo, where it goes, and what this device's reader is like. */
  function paintReader() {
    const r = pick();
    const p = $(".cb-scan-reader");
    let html = "";
    if (r.reader === "ai") {
      html = esc(t("Read by your AI ({0}). The photo goes to {0} only, to be read, and isn't kept.", providerName()));
      if (support.ok) html += ` <button type="button" class="link" data-act="device">${esc(t("Read on this device instead"))}</button>`;
    } else if (r.reader === "device") {
      html = esc(t("Read on this device: it reads printed text much better than handwriting."));
      if (r.why === "chosen") html += ` <button type="button" class="link" data-act="ai">${esc(t("Read with {0} instead (it reads handwriting too)", providerName()))}</button>`;
      else if (r.why === "offline") html += ` ${esc(t("You're offline, so your AI can't read it now."))}`;
      else if (r.why === "novision") html += ` ${esc(t("Your AI can't read pictures."))}`;
      else if (r.why === "nokey") html += ` ${esc(t("AI reads both:"))} <a href="${AI_SETTINGS}" class="cb-go">${esc(t("set up AI"))}</a>.`;
      else if (r.why === "aioff") html += ` ${esc(t("AI reads both, but it is turned off in Settings."))}`;
      if (lang === "ar" || lang === "fa") html += ` ${esc(t("Vowel marks are often missed: check them."))}`;
      else if (["ja", "zh", "ko"].includes(lang)) html += ` ${esc(t("Text written from top to bottom isn't read."))}`;
      if (device && !device.installed) {
        html += downloading ? `<br><i class="cb-spin" aria-hidden="true"></i> ${esc(t("Downloading…"))}`
          : `<br>${esc(t("Reading {0} on this device needs a one-time download of {1} MB.", deviceNames(), mb(toGet(device))))} <button type="button" class="link" data-act="download">${esc(t("Download it"))}</button>`;
      }
    } else {
      html = `${esc(t("This device can't read photos itself, and AI isn't set up:"))} <a href="${AI_SETTINGS}" class="cb-go">${esc(t("set up AI"))}</a>.`;
    }
    p.innerHTML = html;
    for (const b of p.querySelectorAll("button[data-act]")) b.onclick = () => act(b.dataset.act);
    for (const a of p.querySelectorAll("a.cb-go")) a.onclick = (e) => { e.preventDefault(); goTo(a.getAttribute("href")); };
  }

  async function act(what) {
    if (what === "device" || what === "ai") {
      prefer = what === "device" ? "device" : "";
      lsSet(PREFER_KEY, prefer);
      paintReader();
      if (what === "device" && !device) loadDevice();
    } else if (what === "download") {
      await getDevice();
    }
  }

  async function loadDevice() {
    if (!support.ok) return;
    try { device = await ocrStatus(pair); } catch { device = null; }
    if (!closed) paintReader();
  }

  /** Download this device's reader (its size was said first); resolves to true once it is here. */
  async function getDevice() {
    if (downloading) return false;
    downloading = true;
    paintReader();
    try {
      device = await downloadOcr(pair);
      return !!(device && device.installed);
    } catch (err) {
      setStatus({ kind: "error", text: message(err) });
      return false;
    } finally {
      downloading = false;
      if (!closed) paintReader();
    }
  }

  // ---------------------------------------------------------------- choosing a photo

  function drawPick() {
    $(".cb-scan-lead").textContent = phone ? t("Take a photo of a list of words, a page of your book, or a single word.")
      : t("Choose a picture of a list of words, a page of a book, or a single word.");
    const buttons = $(".cb-scan-buttons");
    buttons.innerHTML = "";
    if (phone) {
      const take = h(`<button type="button" class="primary cb-scan-take">${icon("camera", 18)} Take a photo</button>`);
      take.onclick = () => choose(true);
      const fromPhotos = h(`<button type="button" class="cb-scan-choose">${icon("image", 18)} Choose a photo</button>`);
      fromPhotos.onclick = () => choose(false);
      buttons.append(take, fromPhotos);
    } else {
      const choosePic = h(`<button type="button" class="primary cb-scan-choose">${icon("image", 18)} Choose a picture</button>`);
      choosePic.onclick = () => choose(false);
      buttons.append(choosePic);
    }
    $(".cb-scan-paste").hidden = phone;
  }

  /** The camera (`camera`), or the photos / files, through the browser's own file box. */
  function choose(camera) {
    const input = h(`<input type="file" accept="image/*" hidden>`);
    if (camera) input.setAttribute("capture", "environment");  // the back camera: Android and the iPhone open it at once
    else input.multiple = true;
    input.onchange = () => {
      const files = [...(input.files || [])];
      input.remove();
      if (files.length) take(files, { camera });
    };
    document.body.append(input);
    input.click();  // (still inside the tap, so a phone lets it open)
  }

  /** Read these pictures, one after another, adding what is found to the batch. */
  function take(files, { camera = false } = {}) {
    const list = [...(files || [])].filter(Boolean);
    if (!list.length || closed) return;
    // A photo that failed or had nothing on it is left behind by the next one.
    for (const p of [...photos]) if (p.state === "error" || p.state === "empty" || (p.state === "waiting" && !queue.includes(p.job))) dropPhoto(p);
    for (const file of list) {
      const photo = { id: nextId++, url: "", state: "waiting", job: null };
      photo.job = { photo, file, pic: null, camera, device: false };
      photos.push(photo);
      queue.push(photo.job);
    }
    setStatus(null);
    paint();
    run();
  }

  async function run() {
    if (busy) return;
    busy = true;
    paint();
    try {
      while (queue.length && !closed) await readOne(queue.shift());
    } finally {
      busy = false;
      if (!closed) paint();
    }
  }

  async function readOne(job) {
    const { photo } = job;
    photo.state = "reading";
    paintPics();
    if (!job.pic) {
      setStatus({ kind: "busy", text: t("Opening the photo…") });
      try {
        job.pic = await openPicture(job.file);
        photo.url = await previewCopy(job.pic);
      } catch (err) {
        photo.state = "error";
        setStatus({ kind: "error", text: message(err) });
        return;
      } finally {
        job.file = null;
        if (job.camera) forgetPhotos();  // (the camera's own copy, left in the app's folder on Android, goes now)
      }
      paint();
    }
    let note = "";
    try {
      let result = null;
      if (!job.device && pick().reader === "ai") {
        setStatus({ kind: "busy", text: t("{0} is reading the photo…", providerName()) });
        try {
          result = await readWithAi(job.pic, { study: info.name });
        } catch (err) {
          // A model that doesn't take pictures, or refuses this one: this device reads it instead.
          const refused = err && [400, 404, 413, 415, 422].includes(err.status);
          if (!refused || !support.ok) throw err;
          note = t("{0} couldn't read the photo, so it was read on this device.", providerName());
        }
      }
      if (!result) {
        if (!support.ok) throw new Error(t("This device can't read photos itself. Set up AI in Settings to read them."));
        if (!device || !device.installed) device = await ocrStatus(pair).catch(() => device);
        if (!device || !device.installed) {
          photo.state = "waiting";  // (its picture stays in memory until it is read, or the builder closes)
          setStatus({ kind: "ask", text: t("To read it on this device, a one-time download of {0} MB is needed.", mb(toGet(device))),
            actions: [{ label: t("Download and read it"), primary: true, run: async () => {
              if (await getDevice()) { job.device = true; queue.unshift(job); run(); }
            } }] });
          return;
        }
        setStatus({ kind: "busy", text: t("Reading the photo…") });
        result = await readOnDevice(job.pic, { pair, lang, zhScript: settings().zh_script || "", onProgress: (f, what, again) => {
          if (what !== "reading" || closed) return;
          setStatus({ kind: "busy", text: again ? t("Looking at the photo again… {0}%", Math.round(f * 100)) : t("Reading the photo… {0}%", Math.round(f * 100)) });
        } });
      }
      job.pic = null;  // (let go of: only the small copy stays)
      addFound(photo, result.cards, note);
    } catch (err) {
      photo.state = "error";
      const actions = support.ok && !job.device
        ? [{ label: t("Read it on this device"), run: () => { job.device = true; queue.unshift(job); run(); } }] : [];
      setStatus({ kind: "error", text: message(err), actions });
    }
  }

  function addFound(photo, cards, note) {
    photo.state = cards.length ? "done" : "empty";
    if (!cards.length) {
      dropPhoto(photo);
      const r = pick();
      setStatus({ kind: "empty", text: t("No words could be read in this photo."),
        tips: [t("Good light, without shadows or glare."), t("The page flat, and the photo taken straight on."),
          t("Close enough that the words fill most of the photo.")],
        actions: r.reader === "device" && r.ai ? [{ label: t("Read the next one with {0} (it reads handwriting too)", providerName()), run: () => act("ai") }] : [] });
      return;
    }
    // A single word, and nothing else in the batch: straight into a row.
    if (!found.length && cards.length === 1 && !queue.length) {
      dropPhoto(photo);
      setStatus(null);
      onUse(cards);
      toast(t("One word read from the photo: it's in the card."));
      return;
    }
    const before = found.map((f) => f.card.text);
    const reps = duplicates([...before, ...cards.map((c) => c.text)], existing().map((v) => v.text)).slice(before.length);
    cards.forEach((card, i) => found.push({ card, photo: photo.id, rep: reps[i], on: !(reps[i].saved || reps[i].sameAs !== undefined) }));
    setStatus(note ? { kind: "note", text: note } : null);
    onDirty();
  }

  function dropPhoto(photo) {
    const at = photos.indexOf(photo);
    if (at >= 0) photos.splice(at, 1);
    const q = queue.indexOf(photo.job);
    if (q >= 0) queue.splice(q, 1);
    if (photo.job) { photo.job.pic = null; photo.job.file = null; }
    if (photo.url) { try { URL.revokeObjectURL(photo.url); } catch { /* gone */ } }
    photo.url = "";
  }

  // ---------------------------------------------------------------- what was found

  function setStatus(s) {
    status = s;
    paintStatus();
  }

  function paintStatus() {
    const box = $(".cb-scan-status");
    box.innerHTML = "";
    box.className = "cb-scan-status";
    box.hidden = !status;
    if (!status) return;
    box.classList.add(`is-${status.kind}`);
    const line = h(`<p class="cb-scan-msg">${status.kind === "busy" ? `<i class="cb-spin" aria-hidden="true"></i>` : ""}<span></span></p>`);
    line.querySelector("span").textContent = status.text;
    box.append(line);
    if (status.tips) {
      const ul = h(`<ul class="cb-scan-tips"></ul>`);
      for (const tip of status.tips) { const li = h(`<li></li>`); li.textContent = tip; ul.append(li); }
      box.append(ul);
    }
    if (status.actions && status.actions.length) {
      const row = h(`<div class="cb-scan-acts"></div>`);
      for (const a of status.actions) {
        const b = h(`<button type="button"${a.primary ? ` class="primary"` : ""}></button>`);
        b.textContent = a.label;
        b.onclick = () => { setStatus(null); a.run(); };
        row.append(b);
      }
      box.append(row);
    }
  }

  function paintPics() {
    const box = $(".cb-scan-pics");
    box.innerHTML = "";
    const shown = photos.filter((p) => p.url);
    box.classList.toggle("one", shown.length === 1);  // (one photo: shown bigger, to compare with the list)
    shown.forEach((p, i) => {
      const b = h(`<button type="button" class="cb-scan-pic"><img alt=""><span class="cb-scan-pic-n" aria-hidden="true"></span></button>`);
      b.querySelector("img").src = p.url;
      b.querySelector(".cb-scan-pic-n").textContent = String(i + 1);
      b.setAttribute("aria-label", t("Show photo {0}", i + 1));
      b.title = t("Show photo {0}", i + 1);
      b.classList.toggle("is-reading", p.state === "reading");
      b.onclick = () => showPhoto(p, i + 1);
      box.append(b);
    });
    const more = h(`<button type="button" class="cb-scan-more">${icon("plus", 18)} <span></span></button>`);
    more.querySelector("span").textContent = t("Another page");
    more.disabled = busy;
    more.onclick = (e) => {
      if (!phone) { choose(false); return; }
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, "", [  // (the same two ways as at the start)
        { label: t("Take a photo"), icon: icon("camera", 16), run: () => choose(true) },
        { label: t("Choose a photo"), icon: icon("image", 16), run: () => choose(false) },
      ]);
    };
    box.append(more);
  }

  /** The photo big, to compare with the list. */
  function showPhoto(p, n) {
    const m = openModal({ title: t("Photo {0}", n), wide: true });
    m.el.classList.add("cb-photo-back");
    const img = h(`<img class="cb-photo-big" alt="">`);
    img.src = p.url;
    m.body.append(img);
  }

  function paintFound() {
    $(".cb-scan-found").hidden = !found.length && !photos.some((p) => p.url);
    paintPics();
    const list = $(".cb-scan-list");
    list.innerHTML = "";
    let reps = 0;
    for (const f of found) {
      const rep = f.rep && (f.rep.saved || f.rep.sameAs !== undefined);
      if (rep) reps++;
      const li = h(`<li><label class="cb-scan-item"><input type="checkbox"><span class="cb-pv-word ar" ${langAttrs(lang)}></span><span class="cb-pv-rest" dir="auto"></span></label></li>`);
      const tick = li.querySelector("input");
      tick.checked = f.on;
      tick.setAttribute("aria-label", f.card.text);
      tick.onchange = () => { f.on = tick.checked; li.classList.toggle("is-off", !f.on); countUp(); };
      li.classList.toggle("is-off", !f.on);
      li.querySelector(".cb-pv-word").textContent = f.card.text;
      li.querySelector(".cb-pv-rest").textContent = [f.card.meaning, f.card.sentence, clean(f.card.translation)].filter(Boolean).join(" · ");
      if (rep) {
        const tag = h(`<span class="cb-pv-tag"></span>`);
        tag.textContent = f.rep.saved ? t("Already in your words") : t("Twice in the list");
        li.querySelector("label").append(tag);
      } else if (f.card.doubt) {  // (read on this device, with a word it wasn't sure of)
        const tag = h(`<span class="cb-pv-tag"></span>`);
        tag.textContent = t("Check it");
        tag.title = t("Hard to read: compare it with the photo, or fix it with Edit as text.");
        li.querySelector("label").append(tag);
      }
      list.append(li);
    }
    list.hidden = !found.length;
    const count = $(".cb-scan-count");
    count.innerHTML = "";
    count.hidden = !found.length;
    if (found.length) {
      const strong = h(`<strong></strong>`);
      strong.textContent = found.length === 1 ? t("1 word found") : t("{0} words found", found.length);
      count.append(strong);
      if (reps) {
        const more = h(`<span class="muted"></span>`);
        more.textContent = ` · ${t("{0} left out: already in your words, or twice", reps)}`;
        count.append(more);
      }
    }
    $(".cb-scan-go").hidden = !found.length;
    countUp();
  }

  function countUp() {
    const n = found.filter((f) => f.on).length;
    const use = $(".cb-scan-use");
    use.textContent = n ? t("Use these ({0})", n) : t("Use these");
    use.disabled = !n;
    $(".cb-scan-text").disabled = !n;
  }

  function paint() {
    // Once there is a photo, the big box gives way to the photos and the list (another page comes from there).
    $(".cb-scan-pick").hidden = found.length > 0 || photos.some((p) => p.url);
    paintFound();
    paintStatus();
    paintReader();
  }

  const ticked = () => found.filter((f) => f.on).map((f) => f.card);
  function reset() {
    found.length = 0;
    for (const p of [...photos]) if (p.state !== "reading" && !queue.includes(p.job)) dropPhoto(p);
    setStatus(null);
    paint();
  }
  $(".cb-scan-use").onclick = () => {
    const cards = ticked();
    if (!cards.length) return;
    reset();
    onUse(cards);
  };
  $(".cb-scan-text").onclick = () => {
    const cards = ticked();
    if (!cards.length) return;
    reset();
    onText(itemsToPaste(cards));
  };

  // ---------------------------------------------------------------- start

  drawPick();
  paint();
  if (pick().reader === "device") loadDevice();

  return {
    el,
    take,
    /** Something read and not used yet, or still being read. */
    hasInput: () => found.length > 0 || busy || queue.length > 0,
    /** The panel came into view: what the reader line says may have changed (going offline, say). */
    shown: () => { paint(); if (pick().reader === "device" && !device) loadDevice(); },
    close: () => {
      closed = true;
      queue.length = 0;
      for (const p of [...photos]) dropPhoto(p);
      found.length = 0;
      closeOcr();
    },
  };
}
