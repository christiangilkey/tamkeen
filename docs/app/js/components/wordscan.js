// "Add words" → Scan: the text of a photo, made into cards the way a pasted list is (components/wordbuilder.js
// shows it beside "One by one" and "Paste a list"). Every version has it.
//
// Phones: "Take a photo" (the camera) and "Choose a photo". Computer: "Choose a picture", a picture
// dropped on the builder, or pasted (Ctrl+V). Each photo is read by the learner's AI when it can read
// pictures, else on this device (Tesseract, ocr.js; downloaded once, on demand); scanwords.js
// chooseReader says which. All the text in it that is in the language being learned comes, in reading
// order and with its lines, into a box just like "Paste a list"'s, with the same live preview of the
// cards each line makes: the learner deletes what they don't want, splits lines, adds "– meaning", and
// "Use these" makes the builder's rows exactly as a pasted list does. Several photos in a row (the pages
// of one text) add to the same box; the photos stay above it, to compare. "Pick out the words for me"
// reads the photos again as a word list with meanings instead (the old way: scanwords.js scanPrompt,
// ocrList), into the same box; "Show all the text" goes back. Each way is read once per photo.
//
// Photos are held in memory only, never saved or synced, and let go of when the builder closes.

import { esc, h, forgetPhotos, showMenu, state } from "../app.js";
import { icon } from "../icons.js";
import { t, uiLanguage, UI_LANGUAGES } from "../i18n.js";
import { langInfo } from "../languages.js";
import { PROVIDERS } from "../definer.js";
import { definerConfig, noAi } from "../define-service.js";
import { SCRIPTS } from "../addwords.js";
import { addPage, chooseReader, itemsToPaste, ocrPair, ownLanguage, pagesText } from "../scanwords.js";
import { closeOcr, downloadOcr, ocrStatus, ocrSupport } from "../ocr.js";
import { keepCopy, openPicture, previewCopy, readAllOnDevice, readAllWithAi, readOnDevice, readWithAi } from "../scanread.js";
import { openModal } from "./modal.js";

const PREFER_KEY = "tk_scanreader";  // "device" when the learner chose this device's reader over the AI
const AI_SETTINGS = "#/settings?s=words&show=key";
const settings = () => (state.status && state.status.settings) || {};
const lsGet = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage off */ } };
const message = (err) => (err && err.message ? err.message : String(err));

/** A phone or tablet (a camera to take the photo with), rather than a computer. */
const touchDevice = () => {
  try { return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent); } catch { return false; }
};

/**
 * The Scan panel. `lang` is the language being learned; `preview(el, text, {doubt})` shows in `el` the
 * cards each line of `text` makes and returns them ({cards, total, cut}: wordbuilder.js showPreview);
 * `onUse(cards)` makes rows of them; `onDirty()` hears that something is waiting to be used;
 * `confirm(title, text, ok)` asks before the box's own changes are replaced; `goTo(hash)` leaves for
 * Settings (asking first when something would be lost). Returns {el, take(files), hasInput(), shown(), close()}.
 */
export function scanPanel({ lang, preview, onUse = () => {}, onDirty = () => {}, confirm = async () => true, goTo = () => {} }) {
  const info = langInfo(lang);
  const phone = touchDevice();
  const support = ocrSupport();
  const own = ownLanguage(settings().definer_language, uiLanguage(), UI_LANGUAGES);
  const pair = ocrPair(lang, own);
  let prefer = lsGet(PREFER_KEY);
  let device = null;        // this device's reader: {installed, bytes} once known
  let downloading = false;
  // Each photo: {id, url (its small copy, in memory), keep (a copy to read it again, in memory), state:
  // "waiting" | "reading" | "done" | "empty" | "error", reads: {text, words} (each {text, doubts} once
  // read that way), job}; a job is {photo, file, pic (the decoded picture, until it is read), camera,
  // device, view}.
  const photos = [];
  const queue = [];         // jobs still to read, in order
  let view = "text";        // "text": all the text; "words": the words picked out, with their meanings
  let made = "";            // the box's text as the panel last wrote it (anything else: the learner changed it)
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
      <textarea class="cb-scan-box" rows="8" dir="auto" spellcheck="false" aria-label="The text from the photo"></textarea>
      <p class="small muted cb-scan-help">Keep what you want as cards, one per line, and delete the rest. After a word you can add its meaning with a dash (<span translate="no">word – meaning</span>), or leave it for Fill in to look up.</p>
      <div class="cb-scan-preview" aria-live="polite"></div>
      <div class="cb-scan-go">
        <button type="button" class="cb-scan-view"></button>
        <button type="button" class="primary cb-scan-use" disabled>Use these</button>
      </div>
    </div>
    <div class="cb-scan-status" aria-live="polite" hidden></div>
    <p class="cb-scan-reader small muted"></p>
  </div>`);
  const $ = (s) => el.querySelector(s);
  const box = $(".cb-scan-box");

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
      // (other languages are told apart by their letters: in the same letters, they stay for the learner to delete)
      if (view === "text" && !SCRIPTS[lang]) html += ` ${esc(t("Text in other languages written in the same letters stays in the box: delete what you don't need."))}`;
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
    $(".cb-scan-lead").textContent = phone
      ? t("Take a photo of a page, a list of words or a single word: its {0} text comes into a box, ready to make cards from.", t(info.name))
      : t("Choose a picture of a page, a list of words or a single word: its {0} text comes into a box, ready to make cards from.", t(info.name));
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

  /** Read these pictures, one after another, adding their text to the box. */
  function take(files, { camera = false } = {}) {
    const list = [...(files || [])].filter(Boolean);
    if (!list.length || closed) return;
    // A photo that failed or had nothing on it is left behind by the next one.
    for (const p of [...photos]) if (p.state === "error" || p.state === "empty" || (p.state === "waiting" && !queue.includes(p.job))) dropPhoto(p);
    for (const file of list) {
      const photo = { id: nextId++, url: "", keep: null, state: "waiting", reads: { text: null, words: null }, job: null };
      photo.job = { photo, file, pic: null, camera, device: false, view };
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

  /** Something was read in the photo, one way or the other. */
  const hasRead = (photo) => Object.values(photo.reads).some((r) => r && r.text.trim());

  async function readOne(job) {
    const { photo } = job;
    if (!photos.includes(photo)) return;  // (gone: the box was used meanwhile)
    photo.state = "reading";
    paintPics();
    if (!job.pic) {
      setStatus({ kind: "busy", text: t("Opening the photo…") });
      const fromCamera = !!job.file && job.camera;
      try {
        if (job.file) {
          job.pic = await openPicture(job.file);
          photo.url = await previewCopy(job.pic);
          photo.keep = await keepCopy(job.pic);
          if (!photos.includes(photo)) { dropPhoto(photo); return; }  // (the box was used meanwhile: let go of it)
        } else {
          job.pic = await openPicture(photo.keep);  // (read again the other way: from the copy kept)
        }
      } catch (err) {
        photo.state = hasRead(photo) ? "done" : "error";
        setStatus({ kind: "error", text: message(err) });
        return;
      } finally {
        if (fromCamera) forgetPhotos();  // (the camera's own copy, left in the app's folder on Android, goes now)
        job.file = null;
      }
      paint();
    }
    const words = job.view === "words";
    let note = "";
    try {
      let read = null;
      if (!job.device && pick().reader === "ai") {
        setStatus({ kind: "busy", text: t("{0} is reading the photo…", providerName()) });
        try {
          read = words ? { text: itemsToPaste((await readWithAi(job.pic, { study: info.name })).cards), doubts: [] }
            : await readAllWithAi(job.pic, { study: info.name, lang });
        } catch (err) {
          // A model that doesn't take pictures, or refuses this one: this device reads it instead.
          const refused = err && [400, 404, 413, 415, 422].includes(err.status);
          if (!refused || !support.ok) throw err;
          note = t("{0} couldn't read the photo, so it was read on this device.", providerName());
        }
      }
      if (!read) {
        if (!support.ok) throw new Error(t("This device can't read photos itself. Set up AI in Settings to read them."));
        if (!device || !device.installed) device = await ocrStatus(pair).catch(() => device);
        if (!device || !device.installed) {
          photo.state = hasRead(photo) ? "done" : "waiting";  // (its picture stays in memory until it is read, or the builder closes)
          setStatus({ kind: "ask", text: t("To read it on this device, a one-time download of {0} MB is needed.", mb(toGet(device))),
            actions: [{ label: t("Download and read it"), primary: true, run: async () => {
              if (await getDevice()) { job.device = true; queue.unshift(job); run(); }
            } }] });
          return;
        }
        setStatus({ kind: "busy", text: t("Reading the photo…") });
        const opts = { pair, lang, zhScript: settings().zh_script || "", onProgress: (f, what, again) => {
          if (what !== "reading" || closed) return;
          setStatus({ kind: "busy", text: again ? t("Looking at the photo again… {0}%", Math.round(f * 100)) : t("Reading the photo… {0}%", Math.round(f * 100)) });
        } };
        if (words) {
          const list = await readOnDevice(job.pic, opts);
          read = { text: itemsToPaste(list.cards), doubts: list.cards.filter((c) => c.doubt).map((c) => c.text) };
        } else read = await readAllOnDevice(job.pic, opts);
      }
      job.pic = null;  // (let go of: only the small copies stay)
      pageRead(photo, job.view, read, note);
    } catch (err) {
      photo.state = hasRead(photo) ? "done" : "error";
      const actions = support.ok && !job.device
        ? [{ label: t("Read it on this device"), run: () => { job.device = true; queue.unshift(job); run(); } }] : [];
      setStatus({ kind: "error", text: message(err), actions });
    }
  }

  /** A photo read one way (`which`): its text into the box. Until the learner changes the box, the
   * box is all the pages' text, in order; after, a new page is added at the end. */
  function pageRead(photo, which, read, note) {
    if (!photos.includes(photo)) return;
    photo.reads[which] = read;
    const empty = !read.text.trim();
    photo.state = empty && !hasRead(photo) ? "empty" : "done";
    if (empty && which === view) {
      const text = which === "words" ? t("No words could be read in this photo.") : t("No {0} text could be read in this photo.", t(info.name));
      if (photo.state === "empty") {
        dropPhoto(photo);
        const r = pick();
        setStatus({ kind: "empty", text,
          tips: [t("Good light, without shadows or glare."), t("The page flat, and the photo taken straight on."),
            t("Close enough that the words fill most of the photo.")],
          actions: r.reader === "device" && r.ai ? [{ label: t("Read the next one with {0} (it reads handwriting too)", providerName()), run: () => act("ai") }] : [] });
        paint();
      } else setStatus({ kind: "note", text });
      return;
    }
    if (which !== view) return;  // (the learner went the other way meanwhile: kept for going back)
    if (box.value === made) fillBox();
    else { box.value = addPage(box.value, read.text); paintPreview(); }
    setStatus(note ? { kind: "note", text: note } : null);
    onDirty();
    paint();
  }

  /** The box: every page's text, read the way chosen. */
  function fillBox() {
    box.value = pagesText(photos, view);
    made = box.value;
    paintPreview();
  }

  /** "Pick out the words for me" / "Show all the text": the photos read the other way, into the box
   * (each way is read once a photo; asking first when the learner changed the box). */
  async function switchView() {
    if (busy) return;
    if (box.value.trim() && box.value !== made
      && !(await confirm(t("Replace the text in the box?"), t("The changes you made in it will be lost."), t("Replace")))) return;
    if (closed || busy) return;
    view = view === "text" ? "words" : "text";
    setStatus(null);
    fillBox();  // (the photos already read this way; the others come in as they are read)
    for (const p of photos) {
      if (p.state !== "done" || p.reads[view] || !p.keep) continue;
      p.job = { photo: p, file: null, pic: null, camera: false, device: false, view };
      queue.push(p.job);
    }
    paint();
    run();
  }

  function dropPhoto(photo) {
    const at = photos.indexOf(photo);
    if (at >= 0) photos.splice(at, 1);
    const q = queue.indexOf(photo.job);
    if (q >= 0) queue.splice(q, 1);
    if (photo.job) { photo.job.pic = null; photo.job.file = null; }
    if (photo.url) { try { URL.revokeObjectURL(photo.url); } catch { /* gone */ } }
    photo.url = "";
    photo.keep = null;
  }

  // ---------------------------------------------------------------- the box and what it makes

  /** Lines this device wasn't sure of, in the way the box is read now. */
  const doubtful = () => photos.flatMap((p) => (p.reads[view] && p.reads[view].doubts) || []);
  let parsed = { cards: [], total: 0, cut: false };
  function paintPreview() {
    const doubts = doubtful();
    parsed = preview($(".cb-scan-preview"), box.value, { doubt: (c) => doubts.some((l) => l.includes(c.text)) });
    $(".cb-scan-use").disabled = !parsed.cards.length;
  }
  box.oninput = () => {
    paintPreview();
    onDirty();
    if ($(".cb-scan-found").hidden === shownNow()) paint();  // (only when the box was emptied or filled)
  };

  function setStatus(s) {
    status = s;
    paintStatus();
  }

  function paintStatus() {
    const st = $(".cb-scan-status");
    st.innerHTML = "";
    st.className = "cb-scan-status";
    st.hidden = !status;
    if (!status) return;
    st.classList.add(`is-${status.kind}`);
    const line = h(`<p class="cb-scan-msg">${status.kind === "busy" ? `<i class="cb-spin" aria-hidden="true"></i>` : ""}<span></span></p>`);
    line.querySelector("span").textContent = status.text;
    st.append(line);
    if (status.tips) {
      const ul = h(`<ul class="cb-scan-tips"></ul>`);
      for (const tip of status.tips) { const li = h(`<li></li>`); li.textContent = tip; ul.append(li); }
      st.append(ul);
    }
    if (status.actions && status.actions.length) {
      const row = h(`<div class="cb-scan-acts"></div>`);
      for (const a of status.actions) {
        const b = h(`<button type="button"${a.primary ? ` class="primary"` : ""}></button>`);
        b.textContent = a.label;
        b.onclick = () => { setStatus(null); a.run(); };
        row.append(b);
      }
      st.append(row);
    }
  }

  function paintPics() {
    const pics = $(".cb-scan-pics");
    pics.innerHTML = "";
    const shown = photos.filter((p) => p.url);
    pics.classList.toggle("one", shown.length === 1);  // (one photo: shown bigger, to compare with the text)
    shown.forEach((p, i) => {
      const b = h(`<button type="button" class="cb-scan-pic"><img alt=""><span class="cb-scan-pic-n" aria-hidden="true"></span></button>`);
      b.querySelector("img").src = p.url;
      b.querySelector(".cb-scan-pic-n").textContent = String(i + 1);
      b.setAttribute("aria-label", t("Show photo {0}", i + 1));
      b.title = t("Show photo {0}", i + 1);
      b.classList.toggle("is-reading", p.state === "reading");
      b.onclick = () => showPhoto(p, i + 1);
      pics.append(b);
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
    pics.append(more);
  }

  /** The photo big, to compare with the text. */
  function showPhoto(p, n) {
    const m = openModal({ title: t("Photo {0}", n), wide: true });
    m.el.classList.add("cb-photo-back");
    const img = h(`<img class="cb-photo-big" alt="">`);
    img.src = p.url;
    m.body.append(img);
  }

  /** Once there is a photo, the big box gives way to the photos and the text (another page comes from there). */
  const shownNow = () => photos.some((p) => p.url) || !!box.value.trim();
  function paint() {
    const any = shownNow();
    $(".cb-scan-pick").hidden = any;
    $(".cb-scan-found").hidden = !any;
    paintPics();
    const sw = $(".cb-scan-view");
    sw.innerHTML = view === "text" ? `${icon("list", 16)} <span></span>` : `${icon("page", 16)} <span></span>`;
    sw.querySelector("span").textContent = view === "text" ? t("Pick out the words for me") : t("Show all the text");
    sw.hidden = !photos.some((p) => p.keep && p.state === "done");  // (once a photo has been read)
    sw.disabled = busy;
    paintStatus();
    paintReader();
  }

  /** After "Use these": a clean start (a photo still being read is let go of too: its text would only
   * come back into the box). */
  function reset() {
    box.value = "";
    made = "";
    queue.length = 0;
    for (const p of [...photos]) dropPhoto(p);
    paintPreview();
    setStatus(null);
    paint();
  }
  $(".cb-scan-use").onclick = () => {
    paintPreview();
    const cards = parsed.cards;
    if (!cards.length) return;
    reset();
    onUse(cards);
  };
  $(".cb-scan-view").onclick = () => switchView();

  // ---------------------------------------------------------------- start

  drawPick();
  paint();
  if (pick().reader === "device") loadDevice();

  return {
    el,
    take,
    /** Something read and not used yet, or still being read. */
    hasInput: () => !!box.value.trim() || busy || queue.length > 0,
    /** The panel came into view: what the reader line says may have changed (going offline, say). */
    shown: () => { paint(); if (pick().reader === "device" && !device) loadDevice(); },
    close: () => {
      closed = true;
      queue.length = 0;
      for (const p of [...photos]) dropPhoto(p);
      box.value = "";
      closeOcr();
    },
  };
}
