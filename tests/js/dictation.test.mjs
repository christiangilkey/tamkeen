// "Type what you hear" (web/js/dictation.js): sentences cut from a transcript, shown plainly once typed (nothing is
// marked right or wrong: the owner, 2026-11-20).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanSentence, passages, pieceWords, piecesOf, sentencesFromWords, strictKey, wordNear, wordUnits } from "../../web/js/dictation.js";

test("a word's letters: no vowel marks, capitals or punctuation; letters where no spaces are written", () => {
  assert.equal(strictKey("أحمد"), strictKey("احمد"), "the forms of alef are one letter");
  assert.equal(strictKey("ی"), strictKey("ي"), "Persian's own y");
  assert.equal(strictKey("٣"), "3");
  assert.equal(strictKey("кни́га"), "книга", "a stress mark is not a letter");
  assert.equal(strictKey("Hola,"), "hola");
  assert.deepEqual(piecesOf("Yes — no", "en").filter((p) => p.key).map((p) => p.text), ["Yes", "no"], "a lone dash is not a word");
  const th = piecesOf("สวัสดี", "th");
  assert.ok(th.length < [..."สวัสดี"].length, "a Thai vowel mark stays with its letter");
  assert.equal(piecesOf("我喜欢。", "zh").filter((p) => p.key).length, 3, "Chinese: letter by letter, the full stop not a word");
});

test("nothing is marked right or wrong, and there is no score (the owner, 2026-11-20)", async () => {
  const mod = await import("../../web/js/dictation.js");
  for (const gone of ["compareTyped", "caughtWords", "shareRight", "looseKey", "distance"]) assert.equal(mod[gone], undefined, gone);
  const panel = readFileSync(new URL("../../web/js/components/dictation.js", import.meta.url), "utf8");
  assert.match(panel, /real\.innerHTML = wordsHtml\(u\.text, lang, !!onReal\);/, "what was said, plainly");
  assert.match(panel, /: esc\(typed\);/, "what was typed, plainly");
  assert.doesNotMatch(panel, /dict-score|right so far|words right|dw-\$\{|dw-right|dw-missed|dw-extra/);
  assert.match(panel, /t\("Finished: \{0\} sentences listened to\.", done\)/);
  const css = readFileSync(new URL("../../web/css/media.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /dw-right|dw-near|dw-missed|dw-extra|dict-score/);
  assert.match(css, /\.dict-yours \{[^}]*color: var\(--text\);/, "what was typed in the normal text colour");
});

test("sentences: cut at full stops, kept whole when short, cut when long", () => {
  // Words with their own times (a computer transcript): two lines.
  const words = [
    ["Hello.", 0, 0.4, 0], ["My", 0.5, 0.7, 0], ["name", 0.7, 1, 0], ["is", 1, 1.2, 0], ["Sam.", 1.2, 2.2, 0],
    ["I", 2.5, 2.6, 1], ["like", 2.6, 3, 1], ["tea", 3, 3.5, 1],
  ];
  const ws = { texts: words.map((w) => w[0]), starts: words.map((w) => w[1]), ends: words.map((w) => w[2]), segOf: words.map((w) => w[3]), lang: "en" };
  assert.deepEqual(sentencesFromWords(ws).map((s) => s.text), ["Hello. My name is Sam.", "I like tea"],
    "a very short sentence joins the next");
  assert.deepEqual(sentencesFromWords(ws)[1], { text: "I like tea", start: 2.5, end: 3.5, first: 5, last: 7 });
  // Lines with no full stops (YouTube's automatic captions): joined until long enough.
  const lines = [];
  for (let k = 0; k < 6; k++) for (let w = 0; w < 4; w++) lines.push([`w${k}${w}`, k * 2.5 + w * 0.6, k * 2.5 + w * 0.6 + 0.5, k]);
  const auto = sentencesFromWords({ texts: lines.map((w) => w[0]), starts: lines.map((w) => w[1]), ends: lines.map((w) => w[2]), segOf: lines.map((w) => w[3]), lang: "en", lineTimed: true });
  assert.ok(auto.length >= 2 && auto.length <= 3, `six 2-second lines make two or three sentences (${auto.length})`);
  assert.ok(auto.every((s) => s.end - s.start <= 15));
  // One very long line with its own word times: cut.
  const long = [];
  for (let w = 0; w < 60; w++) long.push([w === 30 ? "word," : "word", w * 0.5, w * 0.5 + 0.4, 0]);
  const cut = sentencesFromWords({ texts: long.map((w) => w[0]), starts: long.map((w) => w[1]), ends: long.map((w) => w[2]), segOf: long.map((w) => w[3]), lang: "en" });
  assert.ok(cut.length >= 2 && cut.every((s) => s.end - s.start <= 22.5), "a 30-second line is cut");
});

test("a pause ends a sentence, so a jingle or an advert is never played as part of one", () => {
  const ws = { texts: ["Today", "we", "talk", "about"], starts: [0, 0.5, 30, 30.5], ends: [0.4, 0.9, 30.4, 31], segOf: [0, 0, 0, 0], lang: "en" };
  assert.deepEqual(sentencesFromWords(ws).map((s) => [s.text, s.start, s.end]), [["Today we", 0, 0.9], ["talk about", 30, 31]]);
});

test("captions for the deaf are left out", () => {
  assert.equal(cleanSentence("[Music] ♪ hello  there ♪"), "hello there");
  const ws = { texts: ["[Music]", "Hi", "there."], starts: [0, 3, 3.5], ends: [2, 3.4, 5], segOf: [0, 1, 1], lang: "en" };
  assert.deepEqual(sentencesFromWords(ws).map((s) => s.text), ["Hi there."], "a line that was only [Music] is not a sentence");
});

test("one word at a time: each word with letters, without its punctuation", () => {
  const u = wordUnits({ texts: ["«Hola,", "—", "amigo!"], starts: [0, 1, 2], ends: [0.5, 1.2, 2.6] });
  assert.deepEqual(u, [{ text: "Hola", start: 0, end: 0.5, i: 0 }, { text: "amigo", start: 2, end: 2.6, i: 2 }]);
});

test("the gist: 2 to 5 sentences at a time, never across a long pause", () => {
  const s = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ text: `s${k}.`, start: k * 5, end: k * 5 + 4 }));
  assert.deepEqual(passages(s, 3, "en").map((p) => p.text), ["s0. s1. s2.", "s3. s4. s5.", "s6."]);
  assert.deepEqual(passages(s, 3, "en")[0], { text: "s0. s1. s2.", start: 0, end: 14, parts: s.slice(0, 3) });
  assert.equal(passages(s, 9, "en")[0].parts.length, 5, "five at most");
  assert.equal(passages(s, 1, "en")[0].parts.length, 2, "two at least");
  const gap = [{ text: "a.", start: 0, end: 4 }, { text: "b.", start: 30, end: 34 }, { text: "c.", start: 35, end: 38 }];
  assert.deepEqual(passages(gap, 3, "en").map((p) => p.text), ["a.", "b. c."], "an advert between two sentences starts a new part");
  assert.equal(passages([{ text: "我。", start: 0, end: 1 }, { text: "你。", start: 1, end: 2 }], 2, "zh")[0].text, "我。你。");
});

test("every player with sound offers it", () => {
  for (const f of ["../../web/js/pages/player.js", "../../web/js/pages/reels.js", "../../web/js/components/coursepanel.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(src.includes("dictationPanel("), `${f} opens the panel`);
  }
  const build = readFileSync(new URL("../../mobile/scripts/build-www.mjs", import.meta.url), "utf8");
  assert.ok(build.includes('"js/dictation.js"') && build.includes('"js/components/dictation.js"'), "the phones get it too");
});

test("held back from v0.61.0: hidden everywhere until it is released or switched on on the device", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const panel = src("../../web/js/components/dictation.js");
  assert.match(panel, /export const dictationOn = \(\) => feature\("dictation"\);/, "behind prototype mode (prototype.js)");
  const player = src("../../web/js/pages/player.js");
  assert.match(player, /const dictShown = dictationOn\(\);/);
  assert.match(player, /if \(dictShown\) \(yt \? \$\("\.btnrow"\)\.append\(dictBtn\) : \$\("#font-down"\)\.before\(dictBtn\)\)/);
  assert.match(player, /dictShown && \(e\.key === "w"/);
  assert.match(player, /n && dictShown \? \{ label: "Type what you hear/);
  assert.match(src("../../web/js/pages/reels.js"), /if \(dictShown\) \$\("#rc-left"\)\.append\(dictBtn\)/);
  assert.match(src("../../web/js/components/coursepanel.js"), /dictBtn\.hidden = !dictationOn\(\) \|\|/);
});

test("YouTube's bar (the owner, 2026-11-19): the keyboard beside the speed, no start-of-sentence button, R still works", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const player = src("../../web/js/pages/player.js");
  assert.match(player, /\$\{yt \? "" : `<button type="button" id="restart"/, "no second rewind button on YouTube");
  assert.match(player, /if \(\$\("#restart"\)\) \$\("#restart"\)\.onclick = lineAgain;/);
  assert.match(player, /if \(dict\) dict\.again\(\); else lineAgain\(\);/, "the R key needs no button");
  assert.ok(!/\$\("#restart"\)\.click\(\)/.test(player), "nothing presses a button that may not be there");
  const css = src("../../web/css/media.css");
  // Out of the bar's grid (hung on its left end), so play stays in the middle; Netflix keeps its bar.
  assert.match(css, /\.player\.yt:not\(\.nf\) \.btnrow \.dict-btn \{\s*position: absolute;/);
  assert.match(css, /\.player\.yt:not\(\.nf\) \.btnrow #back5, \.player\.yt:not\(\.nf\) \.btnrow #fwd5 \{\s*height: 30px;/);
});

test("the owner's secret switch for prototype mode: five taps on the version (the About heading in the web app)", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  assert.match(src("../../web/js/pages/settings.js"), /prototypeTaps\(\$\("#app-version"\), toast\)/);
  assert.match(src("../../mobile/src/js/pages/settings.js"), /prototypeTaps\(isWeb \? body\.querySelector\('\[data-find~="about"\] h2'\) : \$\("#app-version"\), toast\)/);
});

test("while typing, back and forward step by the piece (the owner, 2026-11-18), shown as plain arrows", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const panel = src("../../web/js/components/dictation.js");
  assert.match(panel, /show\(Date\.now\(\) - playedAt > BACK_AGAIN_MS \|\| k === 0 \? k : k - 1\);/, "this piece again, or the one before");
  assert.match(panel, /if \(k \+ 1 < units\.length\) show\(k \+ 1\);\s+else finish\(\);/);
  assert.match(panel, /export function arrowButtons\(backBtn, fwdBtn\)/);
  const reels = src("../../web/js/pages/reels.js"), player = src("../../web/js/pages/player.js");
  assert.match(reels, /\$\("#rc-back"\)\.onclick = \(\) => \(dict \? dict\.back\(\) :/);
  assert.match(reels, /\$\("#rc-fwd"\)\.onclick = \(\) => \(dict \? dict\.next\(\) :/);
  assert.match(reels, /unArrow = arrowButtons\(\$\("#rc-back"\), \$\("#rc-fwd"\)\);/);
  assert.match(player, /\$\("#back5"\)\.onclick = \(\) => \(dict \? dict\.back\(\) :/);
  assert.match(player, /\$\("#fwd5"\)\.onclick = \(\) => \(dict \? dict\.next\(\) :/);
  assert.match(player, /unArrow = arrowButtons\(\$\("#back5"\), \$\("#fwd5"\)\);/);
  assert.ok(/onClose: \(\) => \{[\s\S]{0,400}unArrow\(\);/.test(player), "the 5-second buttons come back when typing ends");
});

test("the round ✓ is right of Word · Sentence · Gist, where a phone's keyboard never covers it (the owner, 2026-11-18)", () => {
  const panel = readFileSync(new URL("../../web/js/components/dictation.js", import.meta.url), "utf8");
  const line = panel.slice(panel.indexOf('<div class="dict-line">'), panel.indexOf('<div class="dict-sizes"'));
  assert.ok(line.indexOf('class="dict-seg"') < line.indexOf('class="primary dict-go"'), "right of the three");
  assert.match(line, /class="primary dict-go" title="Show what was said" aria-label="Show what was said">\$\{icon\("check", 20\)\}/);
  assert.doesNotMatch(panel.slice(panel.indexOf('<div class="dict-body">'), panel.indexOf('<div class="dict-done"')), /dict-go/, "no longer under the box");
  assert.match(panel, /<div class="dict-modes" \$\{offered\.length \? "" : "hidden"\}>/, "shown with a single way too (a course's)");
  assert.match(panel, /paintGo\(k \+ 1 < units\.length \? "next" : "finish"\)/, "then an arrow: Next, or Finish");
  const css = readFileSync(new URL("../../web/css/media.css", import.meta.url), "utf8");
  assert.match(css, /\.dict-go \{[^}]*border-radius: 50%/);
});

test("while typing, the player bar's buttons leave the box focused; the keyboard button still puts it away", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const panel = src("../../web/js/components/dictation.js");
  assert.match(panel, /const onMouse = \(e\) => \{ if \(pressed && controlAt\(e\) === pressed\) e\.preventDefault\(\); \};/, "the press doesn't take the focus");
  assert.match(panel, /on\("click", onClickFirst, true\);/, "a drop-down (speed) steps before its list can open");
  assert.match(panel, /t0\.closest\("button, select"\)/, "buttons and drop-downs only: the seek slider works as before");
  assert.match(panel, /for \(const off of offs\.splice\(0\)\) off\(\);/, "undone when the panel is put away");
  assert.match(src("../../web/js/pages/player.js"), /dict\.keepTyping\(\[\$\("\.controls"\), \$\("\.player-head \.row"\)\], \{ except: \[dictBtn\] \}\);/);
  assert.match(src("../../web/js/pages/reels.js"), /dict\.keepTyping\(\[\$\("#reel-controls"\)\], \{ except: \[dictBtn\] \}\);/);
});

test("while typing, a tap on the speed menu gives the next speed (its list would cover the keyboard)", async () => {
  const { stepChoice } = await import("../../web/js/dictation.js");
  const menu = (values, at, off = []) => {
    const options = values.map((v, i) => ({ value: v, selected: i === at, disabled: off.includes(v), hidden: false }));
    const sent = [];
    const sel = { options, get selectedIndex() { return options.findIndex((o) => o.selected); },
      dispatchEvent: (e) => sent.push(e.type) };
    for (const o of options) {
      let on = o.selected;
      Object.defineProperty(o, "selected", { get: () => on, set: (x) => { if (x) for (const p of options) if (p !== o) p.selected = false; on = !!x; } });
    }
    return { sel, sent, value: () => options[sel.selectedIndex].value };
  };
  const a = menu(["0.75", "1", "1.25"], 1);
  stepChoice(a.sel);
  assert.equal(a.value(), "1.25");
  assert.deepEqual(a.sent, ["input", "change"], "as if chosen from its list");
  stepChoice(a.sel);
  assert.equal(a.value(), "0.75", "the last goes round to the first");
  const b = menu(["0.75", "1", "1.25"], 0, ["1"]);
  stepChoice(b.sel);
  assert.equal(b.value(), "1.25", "one that can't be chosen is passed over");
});

test("the typing box takes its direction from what is in it, and its hint is in the app's font (cut off on Android, the owner, 2026-11-18)", () => {
  const panel = readFileSync(new URL("../../web/js/components/dictation.js", import.meta.url), "utf8");
  assert.match(panel, /const boxAttrs = attrs\.replace\(\/dir="\[\^"\]\*"\/, `dir="auto"`\);/);
  assert.match(panel, /<textarea class="dict-input ar" \$\{boxAttrs\}/);
  const css = readFileSync(new URL("../../web/css/media.css", import.meta.url), "utf8");
  assert.match(css, /\.dict-input::placeholder \{ font-family: var\(--ui-font\);[^}]*text-align: center; \}/);
});

test("the players have no vowels button (Settings' switch shows the marks) and play stays in the middle of the bar (the owner, 2026-11-18)", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  for (const f of ["../../web/js/pages/player.js", "../../web/js/pages/reels.js"]) assert.doesNotMatch(src(f), /vowelsButton|vowelsBtn/, f);
  const reels = src("../../web/css/reels.css");
  assert.match(reels, /\.rc-btnrow \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/, "the reels bar's ends are the same width");
  const media = src("../../web/css/media.css");
  assert.match(media, /\.player \.btnrow \{ display: grid; grid-template-columns: 1fr auto auto auto 1fr; \}/);
  assert.match(media, /\.player \.btnrow #play \{ grid-column: 3; \}/, "the middle of five columns, the outer two the same width");
});

test("a word of what was said, once checked, is the player's word it came from (a tap opens its popup, the owner 2026-11-20)", () => {
  const texts = ["Hello.", "My", "[Music]", "name", "is", "Sam.", "I", "like", "tea"];
  const n = texts.length;
  const ws = { texts, starts: texts.map((_, i) => i), ends: texts.map((_, i) => i + 0.9), segOf: texts.map(() => 0), lang: "en" };
  const ss = sentencesFromWords(ws);
  assert.equal(ss[0].text, "Hello. My name is Sam.");
  assert.deepEqual(pieceWords(ss[0], texts, "en"), [0, 1, 3, 4, 5], "[Music] is no word of the sentence");
  const gist = passages(ss, 2, "en")[0];
  assert.deepEqual(pieceWords(gist, texts, "en"), [0, 1, 3, 4, 5, 6, 7, 8], "a gist: its sentences' words in turn");
  assert.deepEqual(pieceWords(wordUnits(ws)[3], texts, "en"), [4], "one word: itself");
  // Where no spaces are written each letter is a piece: all of a word's letters are that word.
  const zh = ["你好", "朋友。"];
  const z = sentencesFromWords({ texts: zh, starts: [0, 1], ends: [0.9, 1.9], segOf: [0, 0], lang: "zh" })[0];
  assert.deepEqual(pieceWords(z, zh, "zh"), [0, 0, 1, 1]);
  assert.equal(pieceWords({ text: "a b c" }, texts, "en"), null, "no word numbers: found by its letters instead");
  assert.equal(pieceWords({ text: "Hello there", first: 0, last: 0 }, texts, "en"), null, "not lining up: the same");
  assert.equal(wordNear("Sam", texts, 0, n - 1, "en"), 5);
  assert.equal(wordNear("tea", texts, 0, 5, "en"), -1, "only between first and last");
});

test("Type what you hear: the round button stays in sight with a phone's keyboard up, and the real sentence's words open the popup (the owner, 2026-11-20)", () => {
  const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const media = src("../../web/css/media.css");
  // YouTube's video can't be less than 200 px tall: squeezed, it hung over the switches.
  assert.match(media, /\.player\.yt\.dictating \.stage \{ flex: none; min-height: 0; \}/);
  assert.match(media, /\.player\.yt\.dictating \.screen \{ aspect-ratio: auto; height: 200px; min-height: 0; \}/);
  assert.match(media, /\.player\.yt\.dictating \.yt-note \{ display: none; \}/);
  assert.match(media, /\.player \.dict-modes, \.reelplay \.dict-modes \{ position: sticky;/, "the switches row stays at the panel's top");
  const panel = src("../../web/js/components/dictation.js");
  assert.match(panel, /el\.style\.scrollPaddingTop = /, "what is scrolled to stays below that row");
  assert.match(panel, /window\.addEventListener\("resize", onResize\);/, "the keyboard coming up brings the box back into view");
  assert.match(panel, /const offs = \[\(\) => window\.removeEventListener\("resize", onResize\)\];/);
  // The words, numbered, and handed to the player.
  assert.match(panel, /real\.innerHTML = wordsHtml\(u\.text, lang, !!onReal\);/);
  assert.match(panel, /if \(onReal\) onReal\(real, u, mode\);/);
  assert.match(panel, /\$\{numbered \? ` data-p="\$\{n\+\+\}"` : ""\}/);
  const player = src("../../web/js/pages/player.js");
  assert.match(player, /const map = pieceWords\(u, texts, lang\);/);
  assert.match(player, /defineAt\(i, i, w, \{ host: playerEl, docked: false \}\);/);
  assert.match(player, /if \(!opts\.host\) opts\.host = bubbleHome;/, "a tap in the transcript afterwards: back where it was");
  const reels = src("../../web/js/pages/reels.js");
  assert.match(reels, /const map = pieceWords\(u, reel\.texts, reel\.lang\);/);
  assert.match(reels, /define\(i, i, \{ host, anchor: w \}\);/);
  assert.match(reels, /host: where \? where\.host : \$\("#reel-pop"\) \}\);/);
  const course = src("../../web/js/components/coursepanel.js");
  assert.match(course, /onReal: \(realEl, u\) => \{\s*realEl\.classList\.remove\("tw-root"\);\s*tappable\(realEl, lang,/);
});
