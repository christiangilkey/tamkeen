// Fixes made to a DLI podcast's ready-made transcripts while packaging them (tools/dli/encrypt.mjs), so
// the app itself stays general. FIXES lists them by podcast (its folder's name).
//
// Arabic101: every episode opens with a spoken English line, "Unit N Chapter N Review". Whisper wrote
// it in Latin letters in some episodes ("unit 10 chapter 49 review"), in Arabic letters in others
// (يونيت 5 كابتر 25 ريفيو, sometimes over two or three lines), and left it out in a few. Wherever it is
// there, it becomes the Latin "Unit N Chapter N Review" (the numbers from the episode's title) on the
// same times, as one line, so learners don't see it as unknown Arabic words. Where it is missing,
// nothing is added (there are no times for it).

const UNIT = /^(unit|يوني\S*)$/i;
const REVIEW = /^(review|ريفي\S*)$/i;
const bare = (w) => String(w || "").replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");

/** The intro's last line (0, 1 or 2): the first lines start with "Unit" and end with "Review" within
 *  three lines and the first 8 seconds; -1 when the transcript doesn't open with it. */
export function introLines(payload) {
  const segs = payload.segments;
  if (!segs.length || !UNIT.test(bare(segs[0][2].trim().split(/\s+/)[0]))) return -1;
  for (let k = 0; k < Math.min(3, segs.length); k++) {
    if (segs[k][0] > 8) return -1;
    const words = segs[k][2].trim().split(/\s+/);
    if (words.length > 6) return -1;
    if (REVIEW.test(bare(words[words.length - 1]))) return k;
  }
  return -1;
}

/** Arabic101's intro line, in Latin letters. Returns { payload, how }: how is "latin" (it was in Latin
 *  letters: written alike now), "arabic" (it was in Arabic letters), "same" (nothing to change),
 *  "missing" or "no-title". */
export function fixIntro(payload, episode) {
  const m = /unit\s*0*(\d+)\D+chapter\s*0*(\d+)/i.exec(String((episode && episode.title) || ""));
  if (!m) return { payload, how: "no-title" };
  const k = introLines(payload);
  if (k < 0) return { payload, how: "missing" };
  const text = `Unit ${m[1]} Chapter ${m[2]} Review`;
  const wanted = text.split(" ");
  const { segments, words } = payload;
  let n = 0; // the intro's words: the first ones, on its lines
  while (n < words.seg.length && words.seg[n] <= k) n++;
  if (words.seg.slice(n).some((g) => g <= k)) return { payload, how: "missing" }; // (not one run: left alone)
  if (k === 0 && segments[0][2] === text && n === wanted.length && words.text.slice(0, n).join(" ") === text) return { payload, how: "same" };
  const how = /[a-z]/i.test(segments[0][2]) ? "latin" : "arabic";
  const t0 = segments[0][0], t1 = segments[k][1];
  // The same times: word for word when there were five words, else spread evenly over the line.
  const from = n ? words.start[0] : t0, to = n ? Math.max(words.end[n - 1], from) : t1;
  const step = (to - from) / wanted.length;
  const round3 = (v) => Math.round(v * 1000) / 1000;
  const times = wanted.map((_, i) => (n === wanted.length ? [words.start[i], words.end[i]] : [round3(from + i * step), round3(from + (i + 1) * step)]));
  const out = {
    ...payload,
    segments: [[t0, t1, text], ...segments.slice(k + 1)],
    words: {
      start: [...times.map((t) => t[0]), ...words.start.slice(n)],
      end: [...times.map((t) => t[1]), ...words.end.slice(n)],
      text: [...wanted, ...words.text.slice(n)],
      seg: [...wanted.map(() => 0), ...words.seg.slice(n).map((g) => g - k)],
    },
  };
  if (Array.isArray(payload.kinds)) out.kinds = [payload.kinds[0] ?? null, ...payload.kinds.slice(k + 1)];
  if (payload.vowels && Array.isArray(payload.vowels.words)) {
    // (English has no vowel marks; the marks of the words after it move with them)
    out.vowels = { ...payload.vowels, words: [...wanted.map(() => null), ...payload.vowels.words.slice(n)],
                   guess: (payload.vowels.guess || []).filter((g) => g >= n).map((g) => g - n + wanted.length) };
  }
  return { payload: out, how };
}

/** The fixes for each podcast, by its folder's name. Each takes (payload, episode) and returns { payload, how }. */
export const FIXES = { arabic101: [fixIntro] };
