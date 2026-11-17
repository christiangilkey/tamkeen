// Putting an automatic transcript right, a line at a time (components/transcripteditor.js). No screen code.
//
// A line keeps its start and end. When its text is typed over, the words that are still there keep their own times
// (they are lined up with the old words, longest common run first), and new words share out the time between the
// kept words around them by their length. So the player still lights up each word as it is said, and a corrected
// word can still be tapped and heard.

const key = (w) => String(w || "").normalize("NFKC").replace(/[ً-ٰٟـ]/g, "")
  .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "").toLowerCase();

/** The lines of GET /episodes/<id>/transcript ({segments, words: {start, end, text, seg}}), each with its words. */
export function linesOf(data) {
  const segs = (data && data.segments) || [];
  const w = (data && data.words) || { start: [], end: [], text: [], seg: [] };
  const lines = segs.map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || ""), words: [] }));
  const byIdx = new Map(segs.map((s, k) => [s.idx ?? k, k]));
  for (let i = 0; i < (w.text || []).length; i++) {
    const k = byIdx.get(w.seg[i]);
    if (k === undefined) continue;
    lines[k].words.push([Number(w.start[i]) || 0, Number(w.end[i]) || 0, String(w.text[i])]);
  }
  return lines;
}

/** Old words [[start, end, text]] lined up with the new text's words: [new index] = old index or -1. */
export function lineUp(oldWords, newTokens) {
  const a = oldWords.map((x) => key(x[2])), b = newTokens.map(key);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const out = new Array(m).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) { out[j] = i; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return out;
}

/** The line with `text` typed over it: its words timed again as the top of the file says. */
export function retime(lineIn, text) {
  const start = Number(lineIn.start) || 0;
  const end = Math.max(start, Number(lineIn.end) || start);
  const tokens = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const old = (lineIn.words || []).filter((x) => Array.isArray(x) && x.length >= 3);
  const match = lineUp(old, tokens);
  const words = tokens.map((tok, j) => (match[j] >= 0 ? [old[match[j]][0], old[match[j]][1], tok] : null));
  // runs of new words: between the end of the kept word before and the start of the kept word after
  let j = 0;
  while (j < words.length) {
    if (words[j]) { j++; continue; }
    let k = j;
    while (k < words.length && !words[k]) k++;
    const from = j > 0 ? words[j - 1][1] : start;
    const to = k < words.length ? words[k][0] : end;
    const span = Math.max(0, to - from);
    const total = tokens.slice(j, k).reduce((s, t) => s + Math.max(1, [...t].length), 0);
    let at = from;
    for (let x = j; x < k; x++) {
      const len = span * (Math.max(1, [...tokens[x]].length) / total);
      words[x] = [round(at), round(at + len), tokens[x]];
      at += len;
    }
    j = k;
  }
  // kept in time order and inside the line
  let last = start;
  for (const w of words) {
    w[0] = round(Math.min(end, Math.max(last, w[0])));
    w[1] = round(Math.min(end, Math.max(w[0], w[1])));
    last = w[0];
  }
  return { start, end, text: tokens.join(" "), words };
}

const round = (x) => Math.round(x * 1000) / 1000;

/** A line cut in two before word number `at` (1 … words − 1). */
export function splitLine(lineIn, at) {
  const words = lineIn.words || [];
  if (at <= 0 || at >= words.length) return [lineIn];
  const mid = words[at][0];
  const a = words.slice(0, at), b = words.slice(at);
  return [{ start: lineIn.start, end: Math.max(lineIn.start, mid), text: a.map((w) => w[2]).join(" "), words: a },
          { start: mid, end: lineIn.end, text: b.map((w) => w[2]).join(" "), words: b }];
}

/** Two lines in a row made one. */
export function joinLines(a, b) {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end), text: `${a.text} ${b.text}`.trim(),
           words: [...(a.words || []), ...(b.words || [])] };
}

/** What PUT /episodes/<id>/transcript takes: {segments: [{start, end, text, words: [[s, e, w]]}]}; empty lines out. */
export function toSegments(lines) {
  return lines.filter((l) => String(l.text || "").trim()).map((l) => ({
    start: round(l.start), end: round(Math.max(l.start, l.end)), text: String(l.text).replace(/\s+/g, " ").trim(),
    words: (l.words && l.words.length ? l.words : retime(l, l.text).words).map((w) => [round(w[0]), round(w[1]), String(w[2])]),
  }));
}

/** How many lines differ from how they were (for "3 lines changed" and the leave-without-saving question). */
export function changedLines(before, after) {
  if (before.length !== after.length) return Math.max(1, Math.abs(before.length - after.length));
  let n = 0;
  for (let i = 0; i < before.length; i++) if (String(before[i].text).trim() !== String(after[i].text).trim()) n++;
  return n;
}
