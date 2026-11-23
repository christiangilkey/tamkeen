// A lesson's own words, tappable where they are (prototype lesson_words; the owner, 2026-11-23: "The read with word
// help shouldn't take you to a new screen, and right now it only encompasses the first passage of my document, it
// should work on all the words in the whole document").
//
// Every passage paragraph, heading, list item, question and option on the lesson page (components/lessonview.js) has
// its words drawn as tappable words, like a web page in the reader (pages/reader.js): a tap opens the usual popup
// (meaning, Save, the folder button, the !), a drag or a held finger picks several words (components/phrasepick.js),
// a held word is marked known, a right click or a long hold opens the word menu, and words never looked up are drawn
// in purple (lexicon/seen.js colours them a piece at a time, the first piece first). The Tap words switch
// (components/tapswitch.js) makes them plain text to select and copy. A word saved here keeps the lesson as where it
// came from: the passage's episode (the lesson's file name) and the lesson's title.
//
// A word in an option opens its popup instead of choosing the option: the option's circle, its letter and the space
// around the text still choose it (and, with Tap words off, the whole option does, as before).
//
// The page is drawn again whenever answers are checked or the text is edited, so `paint(slots)` takes the texts anew
// each time; the popup, the gestures and the switch stay with the page. Shared by every version.

import { api, buzz, hideMenu, showMenu, toast } from "../app.js";
import { voiceNewCard } from "../voiceplay.js";
import { sentenceBounds, EDGE_PUNCT } from "../wordlookup.js";
import { joinWords, vocabFromDefinition } from "../languages.js";
import { lessonTokens, wordsHtml } from "../lessonwordlist.js";
import { createWordBubble } from "./wordbubble.js";
import { getDefinition } from "../define-service.js";
import { PLAIN_CLASS, TAP_EVENT, tapWordsOn } from "./tapswitch.js";
import { markWord } from "../definer.js";
import { reward } from "../game/game.js";
import { seenWords } from "../lexicon/seen.js";
import { wordHtml } from "../wordface.js";
import { readingsReady } from "../lexicon/readings.js";
import { phrasePicker } from "./phrasepick.js";
import { isPhrase, phraseText } from "../phrase.js";

/**
 * The words of the lesson page. `host` holds the popup (it stays when the text is drawn again), `root` the texts.
 * `opts`: lang() (the lesson's language), title() (the lesson's name), episodeId() (its passage's episode id, or "").
 * Returns {paint(slots), close()}: slots = [{el, text}] in the page's order, each filled with its text's words.
 */
export function lessonWords(host, root, opts) {
  const lang = () => opts.lang() || "";
  let texts = [];
  let segOf = [];
  let els = [];
  let seen = null;
  let target = null; // {i, j, si, sj, text}
  let marked = null;
  let paints = 0;
  const savedHere = new Set();
  const savedRows = new Map();
  const savedKey = (i, j) => `${texts[i]}|${i}-${j}|${paints}`;

  /** Draw `slots` as words (after the language's word splitter is ready: Japanese and Chinese). */
  async function paint(slots) {
    const n = ++paints;
    closeBubble();
    // the text first, as it is (it never waits for the words)
    for (const s of slots) s.el.textContent = s.text;
    await readingsReady(lang(), 3000).catch(() => null);
    if (n !== paints) return; // drawn again meanwhile
    const tok = lessonTokens(slots.map((s) => s.text), lang());
    let w = 0;
    slots.forEach((s, k) => {
      const out = wordsHtml(tok, k, w, lang(), wordHtml);
      if (out.next > w) s.el.innerHTML = out.html;
      w = out.next;
    });
    texts = tok.text;
    segOf = tok.seg;
    els = new Array(texts.length);
    for (const el of root.querySelectorAll(".w[data-i]")) els[Number(el.dataset.i)] = el;
    if (seen) seen.close();
    seen = seenWords({ tokens: texts, lang: lang(), els });
  }

  // ---------- the popup ----------
  const sentenceText = (a, b) => joinWords(texts.slice(a, b + 1), lang());
  function contextFor(i, j) {
    const [si, sj] = sentenceBounds(texts, segOf, i, j);
    const prev = si > 0 ? sentenceBounds(texts, segOf, si - 1) : null;
    const next = sj < texts.length - 1 ? sentenceBounds(texts, segOf, sj + 1) : null;
    const word = phraseText(texts, i, j, lang());
    return {
      si, sj, word,
      ctx: { word, lang: lang(), marked: markWord(texts.slice(si, sj + 1), i - si, j - si, lang()),
             before: prev ? sentenceText(prev[0], prev[1]) : "", after: next ? sentenceText(next[0], next[1]) : "",
             podcast: "My files", episode: opts.title(), phrase: isPhrase(i, j) },
    };
  }

  async function saveWord(tg, def) {
    const key = savedKey(tg.i, tg.j);
    if (savedHere.has(key)) return savedRows.get(key) || null;
    const id = opts.episodeId();
    const row = await api("/vocab", { method: "POST", body: {
      ...vocabFromDefinition(def, tg.text, lang()), sentence: sentenceText(tg.si, tg.sj),
      ...(id ? { episode_id: id } : {}), source: opts.title() } });
    voiceNewCard(row, "text/html"); // (nothing to listen to here: its voice, now)
    savedHere.add(key);
    savedRows.set(key, row);
    if (els[tg.i]) reward({ type: "save" }, els[tg.i]);
    if (seen) seen.markSeen(tg.i, tg.j);
    return row;
  }

  const bubble = createWordBubble(host, {
    noAudio: true,
    voiceless: true,
    fetch: (ctx, refresh, o) => getDefinition(ctx, refresh, o),
    onPlayWord: () => {}, onPlaySentence: () => {}, onPlayFrom: () => {},
    onSettings: () => (location.hash = "#/settings?s=words"),
    onSave: async (def) => {
      try { await saveWord(target, def); } catch (e) { toast(e.message, { error: true }); throw e; }
    },
  });

  function mark(i, j) {
    if (marked) for (let k = marked[0]; k <= marked[1]; k++) if (els[k]) els[k].classList.remove("cur");
    marked = i === null ? null : [i, j];
    if (marked) for (let k = i; k <= j; k++) if (els[k]) els[k].classList.add("cur");
  }
  function defineAt(i, j = i) {
    if (!els[i]) return;
    const c = contextFor(i, j);
    target = { i, j, si: c.si, sj: c.sj, text: c.word };
    buzz("tick");
    mark(i, j);
    bubble.show(els[i], c.ctx, { saved: savedHere.has(savedKey(i, j)) });
    reward({ type: "word", key: `${lang()}:${c.word.toLowerCase()}` }, els[i]);
    if (seen) seen.markSeen(i, j); // looked up: this word, in all its forms, is no longer new
  }
  function closeBubble() { bubble.hide(); mark(null); }

  // ---------- gestures ----------
  const plain = () => root.classList.contains(PLAIN_CLASS);
  let down = null;
  function selectionWords() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const at = (node) => { const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node; const w = el && el.closest && el.closest(".w"); return w ? Number(w.dataset.i) : -1; };
    let i = at(range.startContainer), j = at(range.endContainer);
    if (i < 0 || j < 0) return null;
    if (j < i) [i, j] = [j, i];
    const text = sel.toString().replace(/\s+/g, " ").trim();
    return text ? { i, j, text } : null;
  }
  function openMenu(x, y, wEl) {
    let tg = selectionWords();
    if (!tg && wEl) { const i = Number(wEl.dataset.i); tg = { i, j: i, text: texts[i] }; }
    if (!tg) return;
    const clean = tg.text.replace(EDGE_PUNCT, "") || tg.text;
    const [si, sj] = sentenceBounds(texts, segOf, tg.i, tg.j);
    showMenu(x, y, clean, [
      { label: savedHere.has(savedKey(tg.i, tg.j)) ? "✓ Saved to vocab" : "★ Save to vocab", run: () => saveWord({ ...tg, si, sj, text: clean }, null).catch((e) => toast(e.message, { error: true })) },
      { label: "📖 Define", run: () => defineAt(tg.i, tg.j) },
      ...(seen ? seen.menuItems(tg.i, tg.j) : []),
      { label: "⧉ Copy", run: () => { navigator.clipboard.writeText(tg.text).catch(() => {}); toast("Copied"); } },
    ]);
  }

  const onDown = (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; };
  const onClick = (e) => {
    if (plain()) return; // (plain text: an option is chosen as before)
    const wEl = e.target.closest && e.target.closest(".w");
    if (!wEl || !root.contains(wEl)) return;
    if (wEl.closest("label")) e.preventDefault(); // a word in an option: its popup, not the choice
    if (e.detail > 1) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // selecting text
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    defineAt(Number(wEl.dataset.i));
  };
  const onMenu = (e) => {
    if (plain()) return; // (the computer's own menu, with Copy)
    const wEl = e.target.closest && e.target.closest(".w");
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed && root.contains(sel.anchorNode);
    if (!wEl && !hasSel) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, wEl);
  };
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("click", onClick);
  root.addEventListener("contextmenu", onMenu);
  const picker = phrasePicker(root, {
    blockOf: (k) => segOf[k],
    elOf: (k) => els[k] || null,
    onPick: (i, j) => defineAt(i, j),
    onHold: (i, x, y, el) => { if (!seen || !seen.toggleKnown(i)) openMenu(x, y, el); },
    onMenu: (i, x, y, el) => openMenu(x, y, el),
  });

  const onOutside = (e) => {
    if (bubble.open && !e.target.closest(".word-bubble") && !e.target.closest(".w") && !e.target.closest("#ctxmenu")
        && !e.target.closest(".modal-back")) closeBubble();
  };
  document.addEventListener("pointerdown", onOutside);
  const onKey = (e) => { if (e.key === "Escape" && bubble.open) closeBubble(); };
  document.addEventListener("keydown", onKey);
  const onResize = () => bubble.position();
  window.addEventListener("resize", onResize);

  // Tap words on or off (components/tapswitch.js). The page's buttons inside the text (a sound's Play, Add) keep
  // working either way, so the words are made plain here rather than with plainWhenOff (which stops every tap).
  const paintPlain = () => {
    const off = !tapWordsOn();
    root.classList.toggle(PLAIN_CLASS, off);
    if (off) closeBubble();
  };
  window.addEventListener(TAP_EVENT, paintPlain);
  paintPlain();

  return {
    paint,
    close() {
      paints++;
      if (seen) seen.close();
      closeBubble();
      picker.destroy();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("contextmenu", onMenu);
      root.classList.remove(PLAIN_CLASS);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener(TAP_EVENT, paintPlain);
      hideMenu();
    },
  };
}
