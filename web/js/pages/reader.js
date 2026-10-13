// Reader for imported web pages: the page's text with every word clickable, the same
// definition popup as the player, and "Save to vocab". (No audio: a page has no recording.)

import { api, esc, h, toast, showMenu, hideMenu, saveSettings, state, buzz } from "../app.js";
import { saveProgress } from "../progress.js";
import { sentenceBounds, EDGE_PUNCT } from "../wordlookup.js";
import { episodeLanguage, gap, joinWords, langAttrs, regroupWords, vocabFromDefinition } from "../languages.js";
import { createWordBubble } from "../components/wordbubble.js";
import { getDefinition } from "../define-service.js";
import { lookupToggle } from "../components/lookupmode.js";
import { mediaFromEpisode, sendButton } from "../components/sendmedia.js";
import { markWord } from "../definer.js";
import { reward, trackStudy } from "../game/game.js";
import { seenWords } from "../lexicon/seen.js";

const LONG_PRESS_MS = 550;
const TAGS = { h1: "h2", h2: "h3", h3: "h4", li: "li", q: "blockquote", p: "p" };
const TITLE_SEG = -1; // the title's words form a line of their own, before the page's first block

export const isPage = (ep) => (ep.audio_type || "") === "text/html";

function webUrl(text) {
  try {
    const u = new URL(String(text || ""));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
  toast("Copied");
}

export async function render(view, { id, data, query }) {
  const ep = data.episode;
  const lang = episodeLanguage(ep);
  // The title is read like the rest of the page: its words go in front of the stored ones, so
  // they can be tapped and are coloured as new or known just the same.
  const titleTokens = String(ep.title || "").split(/\s+/).filter(Boolean);
  const before = titleTokens.length;
  const W = regroupWords({
    start: [...titleTokens.map((_, k) => k - before), ...data.words.start],
    end: [...titleTokens.map((_, k) => k - before + 1), ...data.words.end],
    text: [...titleTokens, ...data.words.text],
    seg: [...titleTokens.map(() => TITLE_SEG), ...data.words.seg],
  }, lang, false); // real words for Japanese/Chinese
  const n = W.text.length;
  const segOf = Int32Array.from(W.seg);
  const texts = W.text;
  let titleWords = 0;
  while (titleWords < n && segOf[titleWords] === TITLE_SEG) titleWords++;
  const source = webUrl(ep.audio_url);
  let host = "";
  try { host = new URL(source).hostname.replace(/^www\./, ""); } catch { /* no link */ }

  view.append(h(`
    <div class="player reader">
      <div class="player-head">
        <a class="btn ghost" href="#/feed/${ep.feed_id}" title="Back">←</a>
        <div class="meta">
          <div class="title" dir="auto">${esc(ep.title)}</div>
          <div class="small muted">${esc(host || ep.feed_title)} · ${(n - titleWords).toLocaleString()} words</div>
        </div>
        <div class="row">
          <button type="button" class="ghost" id="font-down" title="Smaller text">A−</button>
          <button type="button" class="ghost" id="font-up" title="Larger text">A+</button>
          ${source ? `<a class="btn" id="original" target="_blank" rel="noopener" title="Open the original page">Original ↗</a>` : ""}
        </div>
      </div>
      <div class="transcript-wrap">
        <div class="reader-text" id="text" ${langAttrs(lang)} tabindex="0"></div>
      </div>
    </div>`));
  const $ = (sel) => view.querySelector(sel);
  if (source) $("#original").href = source;
  $("#font-down").before(lookupToggle()); // quick or detailed lookup
  // Send this page to a friend (its address travels; their copy is read from the page itself).
  if (source) $("#font-up").after(sendButton(() => mediaFromEpisode(ep)));
  const tr = $("#text");

  // Build the page in one pass. Each block keeps its own direction, so right-to-left and left-to-right text mix correctly.
  const parts = [`<h1 class="reader-title" dir="auto" data-s="${TITLE_SEG}">`];
  let w = 0;
  for (; w < titleWords; w++) {
    if (w) parts.push(gap(texts[w - 1], texts[w], lang));
    parts.push(`<span class="w" data-i="${w}">${esc(texts[w])}</span>`);
  }
  if (!titleWords) parts.push(esc(ep.title));
  parts.push("</h1>");
  let inList = false;
  for (const seg of data.segments) {
    const tag = TAGS[seg.kind] || "p";
    if (tag === "li" && !inList) { parts.push("<ul>"); inList = true; }
    if (tag !== "li" && inList) { parts.push("</ul>"); inList = false; }
    parts.push(`<${tag} class="seg" dir="auto" data-s="${seg.idx}">`);
    const first = w;
    while (w < n && segOf[w] === seg.idx) {
      if (w > first) parts.push(gap(texts[w - 1], texts[w], lang));
      parts.push(`<span class="w" data-i="${w}">${esc(texts[w])}</span>`);
      w++;
    }
    if (w === first) parts.push(esc(seg.text));
    parts.push(`</${tag}>`);
  }
  if (inList) parts.push("</ul>");
  tr.innerHTML = parts.join("");
  const wordEls = tr.querySelectorAll(".w");
  // Words never tapped before are drawn in purple; a tap makes every form of the word "seen".
  const seen = seenWords({ tokens: texts, lang, els: wordEls });

  // ---------- word popup ----------
  let target = null; // {i, j, si, sj, text}
  let marked = null;
  const sentenceText = (a, b) => joinWords(texts.slice(a, b + 1), lang);

  function contextFor(i, j) {
    const [si, sj] = sentenceBounds(texts, segOf, i, j);
    const prev = si > 0 ? sentenceBounds(texts, segOf, si - 1) : null;
    const next = sj < n - 1 ? sentenceBounds(texts, segOf, sj + 1) : null;
    const word = joinWords(texts.slice(i, j + 1), lang).replace(EDGE_PUNCT, "") || texts[i];
    return {
      si, sj, word,
      ctx: { word, lang, marked: markWord(texts.slice(si, sj + 1), i - si, j - si, lang),
             before: prev ? sentenceText(prev[0], prev[1]) : "", after: next ? sentenceText(next[0], next[1]) : "",
             podcast: host || ep.feed_title, episode: ep.title },
    };
  }

  // Words saved while this page is open. Saving shows no message of its own: the popup's Save
  // button and the right-click menu's Save entry change to "Saved" instead.
  const savedHere = new Set();
  const savedKey = (i, j) => `${i}-${j}`;

  async function saveWord(t, def) {
    if (savedHere.has(savedKey(t.i, t.j))) return;
    await api("/vocab", { method: "POST", body: {
      ...vocabFromDefinition(def, t.text, lang), sentence: sentenceText(t.si, t.sj), episode_id: id } });
    savedHere.add(savedKey(t.i, t.j));
    reward({ type: "save" }, wordEls[t.i]);
    seen.markSeen(t.i, t.j);
  }

  const bubble = createWordBubble($(".transcript-wrap"), {
    noAudio: true,
    fetch: (ctx, refresh, opts) => getDefinition(ctx, refresh, opts),
    onPlayWord: () => {}, onPlaySentence: () => {}, onPlayFrom: () => {},
    onSettings: () => (location.hash = "#/settings"),
    onSave: async (def) => {
      try { await saveWord(target, def); } catch (e) { toast(e.message, { error: true }); throw e; }
    },
  });

  function mark(i, j) {
    if (marked) for (let k = marked[0]; k <= marked[1]; k++) wordEls[k].classList.remove("cur");
    marked = i === null ? null : [i, j];
    if (marked) for (let k = i; k <= j; k++) wordEls[k].classList.add("cur");
  }
  function defineAt(i, j = i) {
    const c = contextFor(i, j);
    target = { i, j, si: c.si, sj: c.sj, text: c.word };
    buzz("tick");
    mark(i, j);
    bubble.show(wordEls[i], c.ctx, { saved: savedHere.has(savedKey(i, j)) });
    reward({ type: "word", key: `${lang}:${c.word.toLowerCase()}` }, wordEls[i]);
    seen.markSeen(i, j); // looked up: this word, in all its forms, is no longer new
  }

  // ---------- clicks, long-press and right-click (same gestures as the player) ----------
  let down = null;
  let pressTimer = 0;
  let suppressClick = false;

  function wordIndexAt(node, offset, atEnd) {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const wEl = el && el.closest && el.closest(".w");
    if (wEl) return Number(wEl.dataset.i);
    let child = node.nodeType === Node.ELEMENT_NODE ? node.childNodes[atEnd ? offset - 1 : offset] : node;
    while (child) {
      const cand = child.nodeType === Node.ELEMENT_NODE
        ? (child.classList.contains("w") ? child : (atEnd ? [...child.querySelectorAll(".w")].pop() : child.querySelector(".w")))
        : null;
      if (cand) return Number(cand.dataset.i);
      child = atEnd ? child.previousSibling : child.nextSibling;
    }
    return -1;
  }
  function selectionWords() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!tr.contains(range.commonAncestorContainer)) return null;
    let i = wordIndexAt(range.startContainer, range.startOffset, false);
    let j = wordIndexAt(range.endContainer, range.endOffset, true);
    if (i < 0 || j < 0) return null;
    if (j < i) [i, j] = [j, i];
    const text = sel.toString().replace(/\s+/g, " ").trim();
    return text ? { i, j, text } : null;
  }
  function openMenu(x, y, wEl) {
    let t = selectionWords();
    if (!t && wEl) {
      const i = Number(wEl.dataset.i);
      t = { i, j: i, text: texts[i] };
    }
    if (!t) return;
    const clean = t.text.replace(EDGE_PUNCT, "") || t.text;
    const [si, sj] = sentenceBounds(texts, segOf, t.i, t.j);
    showMenu(x, y, clean, [
      { label: savedHere.has(savedKey(t.i, t.j)) ? "✓ Saved to vocab" : "★ Save to vocab", run: () => saveWord({ ...t, si, sj, text: clean }, null).catch((e) => toast(e.message, { error: true })) },
      { label: "📖 Define", run: () => defineAt(t.i, t.j) },
      ...seen.menuItems(t.i, t.j),
      { label: "⧉ Copy", run: () => copyText(t.text) },
    ]);
  }

  tr.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
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
  const endPress = () => clearTimeout(pressTimer);
  tr.addEventListener("pointerup", endPress);
  tr.addEventListener("pointercancel", endPress);
  tr.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const wEl = e.target.closest(".w");
    if (!wEl || e.detail > 1) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // selecting text
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    defineAt(Number(wEl.dataset.i));
  });
  tr.addEventListener("contextmenu", (e) => {
    const wEl = e.target.closest(".w");
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed && tr.contains(sel.anchorNode);
    if (!wEl && !hasSel) return;
    e.preventDefault();
    clearTimeout(pressTimer);
    openMenu(e.clientX, e.clientY, wEl);
  });

  tr.addEventListener("scroll", () => bubble.position(), { passive: true });
  const onResize = () => bubble.position();
  window.addEventListener("resize", onResize);
  const closeBubble = () => { bubble.hide(); mark(null); };
  const onOutside = (e) => {
    if (bubble.open && !e.target.closest(".word-bubble") && !e.target.closest(".w") && !e.target.closest("#ctxmenu")) closeBubble();
  };
  document.addEventListener("pointerdown", onOutside);
  const onKey = (e) => { if (e.key === "Escape" && bubble.open) closeBubble(); };
  document.addEventListener("keydown", onKey);

  // ---------- text size ----------
  let fontTimer;
  const changeFont = (d) => {
    const s = state.status?.settings || {};
    const size = Math.max(12, Math.min(40, (s.page_font_size || 17) + d));
    s.page_font_size = size;
    document.documentElement.style.setProperty("--page-size", `${size}px`);
    clearTimeout(fontTimer);
    fontTimer = setTimeout(() => saveSettings({ page_font_size: size }), 400);
  };
  $("#font-down").onclick = () => changeFont(-1);
  $("#font-up").onclick = () => changeFont(1);

  // Remember where you were reading, and how far through the page you've got (for Home's
  // "Continue" button: a page counts as unfinished until you've seen 70% of it).
  const posKey = `read:${id}`;
  try { tr.scrollTop = Number(localStorage.getItem(posKey)) || 0; } catch { /* storage unavailable */ }
  const remember = () => {
    const seen = tr.scrollHeight > 0 ? Math.min(1, (tr.scrollTop + tr.clientHeight) / tr.scrollHeight) : 1;
    // A page short enough to fit on screen has been seen in full.
    saveProgress({ id, kind: "page", title: ep.title, sub: host, image: "", frac: seen });
  };
  let scrollTimer = 0;
  tr.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(remember, 400); }, { passive: true });
  setTimeout(remember, 50); // (a timer, not an animation frame: those pause while the window is hidden)
  // Arrived from search: go to the matching place and point it out.
  // (Search counts the page's own words; the title's words sit in front of them here.)
  const jump = query && query.get("t") !== null ? Math.floor(Number(query.get("t"))) + titleWords : -1;
  if (jump >= titleWords && jump < n) {
    setTimeout(() => {
      const el = wordEls[jump];
      tr.scrollTop = Math.max(0, el.offsetTop - tr.clientHeight * 0.3);
      const seg = el.closest(".seg");
      if (seg) { seg.classList.add("found"); setTimeout(() => seg.classList.remove("found"), 2600); }
    }, 60);
  }

  // Reading counts toward today's goal while the page is being read (scrolled or tapped in the last minute).
  let lastActive = Date.now();
  const touch = () => { lastActive = Date.now(); };
  tr.addEventListener("scroll", touch, { passive: true });
  tr.addEventListener("pointerdown", touch, { passive: true });
  const stopStudy = trackStudy("read", () => Date.now() - lastActive < 60000);
  return () => {
    stopStudy();
    seen.close();
    try { localStorage.setItem(posKey, String(Math.round(tr.scrollTop))); } catch { /* storage unavailable */ }
    clearTimeout(scrollTimer);
    remember();
    bubble.hide();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("pointerdown", onOutside);
    document.removeEventListener("keydown", onKey);
    clearTimeout(pressTimer);
    hideMenu();
  };
}
