// The book reader: a book from "My books" (books.js) one page at a time, with every word clickable,
// the same definition popup and vocab saving as the web-page reader (reader.js), and new words in
// purple. A page is as much text as fits on the screen at the chosen text size (books.paginate);
// turn pages with the arrows, a swipe, or the arrow keys. Where you got to is kept on this device.

import { api, esc, h, toast, showMenu, hideMenu, saveSettings, state, buzz } from "../app.js";
import { saveProgress } from "../progress.js";
import { sentenceBounds, EDGE_PUNCT } from "../wordlookup.js";
import { episodeLanguage, gap, joinWords, langAttrs, langInfo, regroupWords, vocabFromDefinition } from "../languages.js";
import { createWordBubble } from "../components/wordbubble.js";
import { getDefinition } from "../define-service.js";
import { lookupToggle } from "../components/lookupmode.js";
import { markWord } from "../definer.js";
import { reward, trackStudy } from "../game/game.js";
import { seenWords } from "../lexicon/seen.js";
import { wordHtml } from "../wordface.js";
import { displayWords, vowelsButton, watchVowels } from "../vowels.js";
import { readingsReady } from "../lexicon/readings.js";
import { paginateBlocks, pageOf } from "../bookpages.js";
import { icon } from "../icons.js";
import { blockTag, layoutBlocks, marksLookup, wordStyle } from "../readerlayout.js";
import { applyPageSize, pageSize, PAGE_SIZE_MAX, PAGE_SIZE_MIN } from "../textsize.js";

const LONG_PRESS_MS = 550;
const SWIPE_PX = 60;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
  toast("Copied");
}

export async function render(view, { id, data, query }) {
  const ep = data.episode;
  const lang = episodeLanguage(ep);
  await readingsReady(lang); // Japanese and Chinese: the dictionary that splits them into words, if downloaded
  const W = regroupWords(data.words, lang, false); // real words for Japanese/Chinese
  const texts = W.text;
  const n = texts.length;
  const segOf = Int32Array.from(W.seg);
  // Headings, the title page, bold and italic: the same for every book (readerlayout.js).
  const layoutList = layoutBlocks(data.segments, { book: true, title: ep.title });
  const blockAt = new Map(data.segments.map((s, k) => [s.idx, layoutList[k]]));
  const flagsOf = marksLookup(data.segments, layoutList);
  const isFront = (seg) => /^front/.test((blockAt.get(seg) || {}).role || "");
  let vowels = data.vowels || null;
  let shown = displayWords(texts, vowels, (i) => segOf[i]);

  view.append(h(`
    <div class="player reader book-reader">
      <div class="player-head">
        <a class="btn ghost" href="#/feed/${ep.feed_id}" title="Back to My books">←</a>
        <div class="meta">
          <div class="title" dir="auto">${esc(ep.title)}</div>
          <div class="small muted" dir="auto">${esc(ep.description || "")}</div>
        </div>
        <div class="row">
          <button type="button" class="ghost" id="font-down" title="Smaller text">A−</button>
          <button type="button" class="ghost" id="font-up" title="Larger text">A+</button>
        </div>
      </div>
      <div class="transcript-wrap book-wrap">
        <div class="reader-text book-page" id="text" ${langAttrs(lang)} tabindex="0"></div>
      </div>
      <div class="book-foot">
        <button type="button" class="ghost icon" id="prev" title="Previous page" aria-label="Previous page">${icon("chevron", 20)}</button>
        <input type="range" id="where" min="1" max="1" value="1" aria-label="Page">
        <span class="small muted" id="page-n"></span>
        <button type="button" class="ghost icon" id="next" title="Next page" aria-label="Next page">${icon("chevron", 20)}</button>
      </div>
    </div>`));
  const $ = (sel) => view.querySelector(sel);
  $("#font-down").before(lookupToggle()); // quick or detailed lookup
  const tr = $("#text");
  const wordEls = new Array(n); // only the words on the page shown have an element
  let pages = [[0, n]];
  let page = 0;
  let seen = null; // seenWords for the page shown (its words only: a whole book is too much at once)
  let pageFirst = 0;

  // ---------- pages ----------
  // A page is filled like a printed one. First every page is planned: how wide a line is and how
  // tall each kind of block is are measured on screen, in this book's own text at the current size,
  // and the words are laid into lines (bookpages.js). Then the page shown is fitted on the screen
  // itself: it is drawn with the words that follow too, cut after the last line that fits, and the
  // pages after it are planned again from there. So a page is never cut off and never half empty.
  // Nothing is measured while the reader isn't on screen (it has no size then).
  const KINDS = { p: "p", h1: "h2.rh.rh1", h2: "h3.rh.rh2", h3: "h4.rh.rh3", li: "li", q: "blockquote",
                  front: "p.front", "front-sub": "p.front-sub", "front-title": "h2.rh.rh1.front-title" };
  function measure() {
    const probe = document.createElement("div");
    probe.className = tr.className;
    probe.style.cssText = "position:absolute;visibility:hidden;inset:0 auto auto 0;height:auto;overflow:visible;width:" + tr.clientWidth + "px";
    for (const a of [...tr.attributes]) if (a.name === "lang" || a.name === "dir") probe.setAttribute(a.name, a.value);
    const sample = joinWords(texts.slice(Math.min(200, Math.max(0, n - 400)), Math.min(n, 400)), lang).slice(0, 400) || "x";
    const parts = Object.entries(KINDS).map(([k, sel]) => {
      const [tag, ...cls] = sel.split(".");
      const el = `<${tag} class="${cls.join(" ")}" data-k="${k}" style="white-space:nowrap"><span>${esc(sample)}</span></${tag}>`;
      return k === "li" ? `<ul>${el}</ul>` : k.startsWith("front") ? `<div class="front-block">${el}</div>` : el;
    });
    probe.innerHTML = `<p>x</p>${parts.join("")}`; // (none of them first on the page, where some lose the space above them)
    tr.parentElement.append(probe);
    const out = {};
    for (const el of probe.querySelectorAll("[data-k]")) {
      const st = getComputedStyle(el);
      const lineH = parseFloat(st.lineHeight) || parseFloat(st.fontSize) * 1.6;
      const charW = el.firstElementChild.getBoundingClientRect().width / Math.max(1, sample.length);
      const width = el.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
      const top = parseFloat(st.marginTop) || 0;
      const extra = top + (parseFloat(st.marginBottom) || 0);
      out[el.dataset.k] = { lineH, cpl: Math.max(4, Math.floor((width / Math.max(0.5, charW)) * 0.98)), extra, top };
    }
    const fb = getComputedStyle(probe.querySelector(".front-block"));
    const frontExtra = parseFloat(fb.marginTop) + parseFloat(fb.marginBottom) + parseFloat(fb.paddingTop) + parseFloat(fb.paddingBottom);
    probe.remove();
    const style = getComputedStyle(tr);
    const pageH = tr.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return { kinds: out, pageH, frontExtra };
  }
  const firstFront = (data.segments[layoutList.findIndex((b) => /^front/.test(b.role))] || { idx: null }).idx;
  let measured = false;
  let plan = null; // (from) -> planned pages from word `from` to the end
  function layout(keepWord = pages[page] ? pages[page][0] : 0) {
    if (tr.clientHeight < 80 || tr.clientWidth < 80) return; // not on screen yet: laid out when it is
    measured = true;
    lastSize = `${tr.clientWidth}x${tr.clientHeight}`;
    const m = measure();
    const blockOf = (seg) => {
      const b = blockAt.get(seg) || { role: "p", level: 0 };
      const key = b.role === "h" ? `h${b.level}` : b.role;
      const k = m.kinds[key] || m.kinds.p;
      return { ...k, extra: k.extra + (seg === firstFront ? m.frontExtra : 0), breakBefore: b.breakBefore, keep: b.role === "h" };
    };
    const space = langInfo(lang).unspaced ? 0 : 1;
    plan = (from) => paginateBlocks(texts, segOf, blockOf, Math.max(60, m.pageH), space, from);
    pages = plan(0);
    page = pageOf(pages, keepWord);
    show(page, false);
  }

  // A block that has to start a page of its own (a chapter heading, the end of the title page): the
  // first word from `from` (up to `to`) that begins one, else `to`.
  function nextBreak(from, to = n) {
    for (let w = from; w < to; w++) {
      if (w > 0 && segOf[w] !== segOf[w - 1] && (blockAt.get(segOf[w]) || {}).breakBefore) return w;
    }
    return to;
  }

  function draw(a, b) {
    const parts = [];
    let seg = -1;
    let close = "";
    let wrap = ""; // "ul" around list items, "front" around the title page's lines
    const setWrap = (want) => {
      if (want === wrap) return;
      if (wrap) parts.push(wrap === "ul" ? "</ul>" : "</div>");
      if (want) parts.push(want === "ul" ? "<ul>" : `<div class="front-block">`);
      wrap = want;
    };
    for (let w = a; w < b; w++) {
      if (segOf[w] !== seg) {
        parts.push(close);
        seg = segOf[w];
        const block = blockAt.get(seg) || { role: "p", level: 0 };
        const { tag, cls } = blockTag(block);
        setWrap(tag === "li" ? "ul" : isFront(seg) ? "front" : "");
        // A paragraph carried over from the page before is marked, so it doesn't look like a new one.
        const cont = w === a && w > 0 && segOf[w - 1] === seg;
        parts.push(`<${tag} class="seg${cls ? ` ${cls}` : ""}${cont ? " cont" : ""}" dir="auto" data-s="${seg}">`);
        close = `</${tag}>`;
      } else if (w > a) {
        parts.push(gap(texts[w - 1], texts[w], lang));
      }
      parts.push(`<span class="w${wordStyle(flagsOf(seg, W.start[w]))}" data-i="${w}">${wordHtml(shown[w], lang)}</span>`);
    }
    parts.push(close);
    setWrap("");
    tr.innerHTML = parts.join("");
    tr.scrollTop = 0;
  }

  /** Where page `a…` really ends on screen: drawn with what follows (up to the next forced page
   * break), cut after the last word whose line fits. A heading isn't left alone at the foot. */
  function fit(a, planned) {
    const limit = nextBreak(a + 1, Math.min(n, Math.max(planned, a + 1) + 400));
    draw(a, limit);
    const style = getComputedStyle(tr);
    const bottom = tr.getBoundingClientRect().top + tr.clientHeight - parseFloat(style.paddingBottom) + 1;
    const els = tr.querySelectorAll(".w");
    let cut = limit;
    for (let k = 0; k < els.length; k++) {
      if (els[k].getBoundingClientRect().bottom > bottom) { cut = a + k; break; }
    }
    if (cut < limit) {
      // Not a heading (or the end of one) as the last thing on the page.
      const lastSeg = segOf[cut - 1];
      if (cut > a && (blockAt.get(lastSeg) || {}).role === "h") {
        let s = cut - 1;
        while (s > a && segOf[s - 1] === lastSeg) s--;
        if (s > a) cut = s;
      }
    }
    return Math.max(a + 1, cut);
  }

  function show(p, remember = true) {
    page = Math.max(0, Math.min(pages.length - 1, p));
    const [a, planned] = pages[page];
    if (seen) seen.close();
    for (let k = pageFirst; k < Math.min(n, pageFirst + 50000); k++) if (wordEls[k]) wordEls[k] = undefined;
    pageFirst = a;
    let b = planned;
    if (measured && plan) {
      b = fit(a, planned);
      // The pages after this one, planned again from where it really ends.
      if (b !== planned) pages = [...pages.slice(0, page), [a, b], ...(b < n ? plan(b) : [])];
    }
    draw(a, b);
    const els = tr.querySelectorAll(".w");
    els.forEach((el, k) => { wordEls[a + k] = el; });
    seen = seenWords({ tokens: texts.slice(a, b), lang, els });
    $("#where").max = String(pages.length);
    $("#where").value = String(page + 1);
    $("#page-n").textContent = `${page + 1} / ${pages.length}`;
    // (In a right-to-left book the left arrow goes on to the next page.)
    const rtl = rtlBook();
    $("#prev").disabled = rtl ? page === pages.length - 1 : page === 0;
    $("#next").disabled = rtl ? page === 0 : page === pages.length - 1;
    bubble.hide();
    marked = null;
    if (remember) keep();
  }
  function rtlBook() { return getComputedStyle(tr).direction === "rtl"; }
  const turn = (d) => { if (page + d >= 0 && page + d < pages.length) { show(page + d); buzz("tick"); } };

  // ---------- word popup ----------
  let target = null; // {i, j, si, sj, text}
  let marked = null;
  const sentenceText = (x, y) => joinWords(texts.slice(x, y + 1), lang);
  const seenAt = { markSeen: (i, j = i) => seen && seen.markSeen(i - pageFirst, j - pageFirst),
                   menuItems: (i, j = i) => (seen ? seen.menuItems(i - pageFirst, j - pageFirst) : []) };

  function contextFor(i, j) {
    const [si, sj] = sentenceBounds(texts, segOf, i, j);
    const prev = si > 0 ? sentenceBounds(texts, segOf, si - 1) : null;
    const next = sj < n - 1 ? sentenceBounds(texts, segOf, sj + 1) : null;
    const word = joinWords(texts.slice(i, j + 1), lang).replace(EDGE_PUNCT, "") || texts[i];
    return {
      si, sj, word,
      ctx: { word, lang, marked: markWord(texts.slice(si, sj + 1), i - si, j - si, lang),
             before: prev ? sentenceText(prev[0], prev[1]) : "", after: next ? sentenceText(next[0], next[1]) : "",
             podcast: ep.description || ep.feed_title, episode: ep.title },
    };
  }

  const savedHere = new Set();
  const savedKey = (i, j) => `${i}-${j}`;
  const savedRows = new Map();
  async function saveWord(t, def) {
    if (savedHere.has(savedKey(t.i, t.j))) return savedRows.get(savedKey(t.i, t.j)) || null;
    const row = await api("/vocab", { method: "POST", body: {
      ...vocabFromDefinition(def, t.text, lang), sentence: sentenceText(t.si, t.sj), episode_id: id } });
    savedHere.add(savedKey(t.i, t.j));
    savedRows.set(savedKey(t.i, t.j), row);
    if (wordEls[t.i]) reward({ type: "save" }, wordEls[t.i]);
    seenAt.markSeen(t.i, t.j);
    return row;
  }

  const bubble = createWordBubble($(".book-wrap"), {
    noAudio: true,
    fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
    onPlayWord: () => {}, onPlaySentence: () => {}, onPlayFrom: () => {},
    onSettings: () => (location.hash = "#/settings?s=words"),
    onSave: async (def) => {
      try { await saveWord(target, def); } catch (e) { toast(e.message, { error: true }); throw e; }
    },
  });

  function mark(i, j) {
    if (marked) for (let k = marked[0]; k <= marked[1]; k++) wordEls[k]?.classList.remove("cur");
    marked = i === null ? null : [i, j];
    if (marked) for (let k = i; k <= j; k++) wordEls[k]?.classList.add("cur");
  }
  function defineAt(i, j = i) {
    const c = contextFor(i, j);
    target = { i, j, si: c.si, sj: c.sj, text: c.word };
    buzz("tick");
    mark(i, j);
    bubble.show(wordEls[i], c.ctx, { saved: savedHere.has(savedKey(i, j)) });
    reward({ type: "word", key: `${lang}:${c.word.toLowerCase()}` }, wordEls[i]);
    seenAt.markSeen(i, j); // looked up: this word, in all its forms, is no longer new
  }

  // ---------- taps, long-press, right-click, swipes ----------
  let down = null;
  let pressTimer = 0;
  let suppressClick = false;
  function selectionWords() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!tr.contains(range.commonAncestorContainer)) return null;
    const at = (node) => {
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const w = el && el.closest && el.closest(".w");
      return w ? Number(w.dataset.i) : -1;
    };
    let i = at(range.startContainer);
    let j = at(range.endContainer);
    if (i < 0 || j < 0) return null;
    if (j < i) [i, j] = [j, i];
    const text = sel.toString().replace(/\s+/g, " ").trim();
    return text ? { i, j, text } : null;
  }
  function openMenu(x, y, wEl) {
    let t = selectionWords();
    if (!t && wEl) { const i = Number(wEl.dataset.i); t = { i, j: i, text: texts[i] }; }
    if (!t) return;
    const clean = t.text.replace(EDGE_PUNCT, "") || t.text;
    const [si, sj] = sentenceBounds(texts, segOf, t.i, t.j);
    showMenu(x, y, clean, [
      { label: savedHere.has(savedKey(t.i, t.j)) ? "✓ Saved to vocab" : "★ Save to vocab", run: () => saveWord({ ...t, si, sj, text: clean }, null).catch((e) => toast(e.message, { error: true })) },
      { label: "📖 Define", run: () => defineAt(t.i, t.j) },
      ...seenAt.menuItems(t.i, t.j),
      { label: "⧉ Copy", run: () => copyText(t.text) },
    ]);
  }
  tr.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
    suppressClick = false;
    const wEl = e.target.closest(".w");
    clearTimeout(pressTimer);
    if (wEl && e.pointerType !== "mouse") {
      pressTimer = setTimeout(() => { suppressClick = true; openMenu(e.clientX, e.clientY, wEl); }, LONG_PRESS_MS);
    }
  });
  tr.addEventListener("pointermove", (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) clearTimeout(pressTimer);
  });
  tr.addEventListener("pointerup", (e) => {
    clearTimeout(pressTimer);
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const sel = window.getSelection();
    // A quick sideways swipe turns the page (towards where the text goes on: left for left-to-right text).
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - down.t < 700 && !(sel && !sel.isCollapsed)) {
      const rtl = getComputedStyle(tr).direction === "rtl";
      suppressClick = true;
      turn((dx < 0) !== rtl ? 1 : -1);
    }
  });
  tr.addEventListener("pointercancel", () => clearTimeout(pressTimer));
  tr.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const wEl = e.target.closest(".w");
    if (!wEl || e.detail > 1) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    defineAt(Number(wEl.dataset.i));
  });
  tr.addEventListener("contextmenu", (e) => {
    const wEl = e.target.closest(".w");
    const sel = window.getSelection();
    if (!wEl && !(sel && !sel.isCollapsed && tr.contains(sel.anchorNode))) return;
    e.preventDefault();
    clearTimeout(pressTimer);
    openMenu(e.clientX, e.clientY, wEl);
  });
  // The arrows point the way the text reads: in Arabic, "next" is on the left.
  $("#prev").onclick = () => turn(rtlBook() ? 1 : -1);
  $("#next").onclick = () => turn(rtlBook() ? -1 : 1);
  const paintArrows = () => {
    const rtl = rtlBook();
    $("#prev").title = rtl ? "Next page" : "Previous page";
    $("#next").title = rtl ? "Previous page" : "Next page";
  };
  $("#where").oninput = (e) => { $("#page-n").textContent = `${e.target.value} / ${pages.length}`; };
  $("#where").onchange = (e) => show(Number(e.target.value) - 1);

  const closeBubble = () => { bubble.hide(); mark(null); };
  const onOutside = (e) => {
    if (bubble.open && !e.target.closest(".word-bubble") && !e.target.closest(".w") && !e.target.closest("#ctxmenu")) closeBubble();
  };
  document.addEventListener("pointerdown", onOutside);
  const onKey = (e) => {
    if (e.key === "Escape" && bubble.open) { closeBubble(); return; }
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); turn(rtlBook() && e.key === "ArrowRight" ? -1 : 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); turn(rtlBook() && e.key === "ArrowLeft" ? 1 : -1); }
  };
  document.addEventListener("keydown", onKey);
  // The page's size changes (window resized, phone turned, the reader first shown): lay the pages out again.
  let resizeTimer = 0;
  let lastSize = "";
  const onResize = () => {
    const size = `${tr.clientWidth}x${tr.clientHeight}`;
    if (size === lastSize && measured) return;
    lastSize = size;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => layout(), measured ? 200 : 0);
  };
  window.addEventListener("resize", onResize);
  const sizeWatch = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;

  // ---------- text size and vowels ----------
  let fontTimer;
  const paintSizeButtons = (size) => {
    $("#font-down").disabled = size <= PAGE_SIZE_MIN;
    $("#font-up").disabled = size >= PAGE_SIZE_MAX;
  };
  paintSizeButtons(pageSize(state.status?.settings?.page_font_size));
  const changeFont = (d) => {
    const s = state.status?.settings || {};
    const size = pageSize(pageSize(s.page_font_size) + d);
    s.page_font_size = size;
    applyPageSize(size);
    paintSizeButtons(size);
    layout();
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => saveSettings({ page_font_size: size }), 400);
  };
  $("#font-down").onclick = () => changeFont(-1);
  $("#font-up").onclick = () => changeFont(1);
  const redrawVowels = () => { shown = displayWords(texts, vowels, (i) => segOf[i]); show(page, false); };
  const vowelsBtn = vowelsButton(lang, redrawVowels, () => vowels);
  if (vowelsBtn) $("#font-down").before(vowelsBtn);
  const stopVowels = watchVowels(id, (v) => { vowels = v; redrawVowels(); if (vowelsBtn) vowelsBtn.repaint(); });

  // ---------- where you got to ----------
  const posKey = `book:${id}`;
  function keep() {
    try { localStorage.setItem(posKey, String(pages[page][0])); } catch { /* storage unavailable */ }
    saveProgress({ id, kind: "page", title: ep.title, sub: ep.description || "", image: "", frac: (page + 1) / pages.length });
  }
  let start = 0;
  try { start = Number(localStorage.getItem(posKey)) || 0; } catch { /* storage unavailable */ }
  // Arrived from search: the page with the matching words.
  if (query && query.get("t") !== null) start = Math.max(0, Math.min(n - 1, Math.floor(Number(query.get("t")))));
  paintArrows();
  // (After the page is laid out on screen, so its size is known.)
  await new Promise((r) => setTimeout(r, 0)); // (a timer, not an animation frame: those pause while the window is hidden)
  // Measured in the book's own font, so wait for it (the stand-in font shown meanwhile is smaller).
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch { /* no font API */ }
  pages = [[0, n]];
  page = 0;
  layout(start);
  if (!measured) { pages = [[start, start]]; } // (laid out from `start` once the reader has a size)
  if (sizeWatch) sizeWatch.observe(tr);
  const onFonts = () => layout();
  if (document.fonts) document.fonts.addEventListener("loadingdone", onFonts);
  if (query && query.get("t") !== null) {
    const el = wordEls[start];
    const p = el && el.closest(".seg");
    if (p) { p.classList.add("found"); setTimeout(() => p.classList.remove("found"), 2600); }
  }

  // Reading counts toward today's goal while the book is being read (a page turned or tapped in the last two minutes).
  let lastActive = Date.now();
  const touch = () => { lastActive = Date.now(); };
  tr.addEventListener("pointerdown", touch, { passive: true });
  view.querySelector(".book-foot").addEventListener("pointerdown", touch, { passive: true });
  const stopStudy = trackStudy("read", () => Date.now() - lastActive < 120000);
  return () => {
    stopStudy();
    stopVowels();
    if (seen) seen.close();
    keep();
    bubble.hide();
    window.removeEventListener("resize", onResize);
    if (sizeWatch) sizeWatch.disconnect();
    if (document.fonts) document.fonts.removeEventListener("loadingdone", onFonts);
    document.removeEventListener("pointerdown", onOutside);
    document.removeEventListener("keydown", onKey);
    clearTimeout(pressTimer);
    clearTimeout(resizeTimer);
    hideMenu();
  };
}
