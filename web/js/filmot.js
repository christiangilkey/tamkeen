// "Find in a video": giving a saved word that has nothing to listen to a real video to hear it in.
//
// A word typed in by hand, or saved from a web page, has no audio. Filmot (filmot.com) is a
// search engine over YouTube's captions. The button on the Vocab page opens Filmot's ordinary
// results page for the word in the app's own browser. If Filmot asks whether you are human, the
// user answers that themselves; the app never does. Once the results are showing, the app's
// script in that browser (web/js/filmot-browser.js) hands over the videos the page lists, top
// first (findFromResults below): the first whose captions say the word becomes the word's source,
// exactly as if the word had been saved from that video's player, and the browser closes.
// Tapping a result by hand still works too (watchFound).
//
// The app asks Filmot nothing itself: one search per press of the button, in the user's own
// browser, read from the page in front of them. (Owner's choice, 2026-10-16: "Just have the user
// do the captcha, then pull the top YouTube video shown".)

import { episodeLanguage, joinWords, regroupWords } from "./languages.js";
import { sentenceBounds } from "./wordlookup.js";
import { fold } from "./cardtext.js";

export { fold };

export const FILMOT = "https://filmot.com";

// Arabic vowel marks and the stretching line: captions are written without them.
const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

// Filmot names languages by YouTube's caption codes, older ones included (its own lists use "iw" for
// Hebrew); where those differ from the app's, the caption code comes first and the app's after it.
const FILMOT_CODES = { tl: ["fil", "tl"], zh: ["zh", "zh-Hans", "zh-CN", "zh-Hant", "zh-TW"], he: ["iw", "he"],
                       pt: ["pt", "pt-BR", "pt-PT"] };
// Other English names a language may go by in Filmot's list.
const OTHER_NAMES = { tl: ["Filipino"], zh: ["Chinese (Simplified)", "Chinese (Traditional)"],
                      pt: ["Portuguese", "Portuguese (Brazil)"], ceb: ["Cebuano"], fa: ["Farsi"] };

/** The language code Filmot is asked for: the caption code for the app's language `lang`. */
export function filmotLang(lang) {
  return (FILMOT_CODES[lang] || [lang || ""])[0];
}

/** What the browser script may find in Filmot's own caption-language list for `lang`, and its
 * English `name` (from languages.js): {lang, values, names}. */
export function languageChoices(lang, name = "") {
  const values = [...new Set([...(FILMOT_CODES[lang] || []), lang].filter(Boolean))];
  const names = [...new Set([name, ...(OTHER_NAMES[lang] || [])].filter(Boolean))];
  return { lang: filmotLang(lang), values, names };
}

/** Filmot's results page for `word`: the address its own search box goes to, asking for captions in
 * language `lang` (the language being learned) when given. */
export function filmotAddress(word, lang = "") {
  let q = String(word || "").replace(HARAKAT, "").replace(/["“”]/g, " ").replace(/\s+/g, " ").trim().replace(/\//g, "\\");
  if (!q) return `${FILMOT}/`;
  if (q.includes(" ")) q = `"${q}"`; // several words: Filmot looks for them together only in quotation marks
  const code = filmotLang(lang);
  return `${FILMOT}/search/${encodeURIComponent(q)}/1?gridView=1${code ? `&lang=${encodeURIComponent(code)}` : ""}`;
}

/** True when a saved word has nothing to listen to: no moment in an episode and no clip of its own. */
export function lacksAudio(v) {
  return !((v.episode_id || v.clip) && v.start != null);
}

/**
 * Where `word` is said in a transcript, as the player would save it: the word's own times, and
 * the times and text of the sentence around it (the same sentence rule as the player's).
 * With several places, the one nearest the moment `at` (seconds) wins; without `at`, the first.
 * `data` is what GET /episodes/<id>/transcript returns. Null when the word is not there.
 */
export function findSpoken(data, word, at = null, lang = "ar") {
  const target = fold(word);
  if (!target || !data || !data.words || !data.words.text || !data.words.text.length) return null;
  const segText = new Map((data.segments || []).map((s) => [s.idx, s.text]));
  const W = regroupWords(data.words, lang, true, (s) => segText.get(s));
  const folded = W.text.map(fold);
  const n = folded.length;
  const squeezed = target.replace(/ /g, "");
  const places = []; // [first word, last word]
  for (let i = 0; i < n; i++) {
    if (!folded[i]) continue;
    let spaced = "";
    let tight = "";
    for (let j = i; j < n && tight.length < squeezed.length; j++) {
      if (!folded[j]) continue;
      spaced += (spaced ? " " : "") + folded[j];
      tight += folded[j].replace(/ /g, "");
      if (spaced === target || tight === squeezed) { places.push([i, j]); break; }
    }
  }
  // Not there as a word of its own: inside a longer one (Arabic joins "and", "the" and the like on).
  if (!places.length && squeezed.length >= 2) {
    for (let i = 0; i < n; i++) if (folded[i].replace(/ /g, "").includes(squeezed)) places.push([i, i]);
  }
  if (!places.length) return null;
  let best = places[0];
  if (at !== null && Number.isFinite(Number(at))) {
    for (const p of places) if (Math.abs(W.start[p[0]] - at) < Math.abs(W.start[best[0]] - at)) best = p;
  }
  const [i, j] = best;
  const [si, sj] = sentenceBounds(W.text, W.seg, i, j);
  return { start: W.start[i], end: W.end[j], sent_start: W.start[si], sent_end: W.end[sj],
           sentence: joinWords(W.text.slice(si, sj + 1), lang) };
}

// ----- the word a video is being looked for -----
// Kept only while the app is open, and for a limited time: a video opened from the browser long
// after the button was pressed has nothing to do with the word.
const HUNT_MS = 30 * 60 * 1000;
let hunt = null; // {id, text, since}

export function startHunt(v, now = Date.now()) {
  hunt = { id: v.id, text: v.text, note: originNote(v), since: now };
}

/** The note a word keeps about where it was first found, once a video replaces its sentence and
 * source: that source's name and the whole original sentence (nothing of it is lost). Empty for a
 * word that had neither. */
export function originNote(v) {
  const sentence = String((v && v.sentence) || "").replace(/\s+/g, " ").trim();
  const title = String((v && v.episode_title) || "").replace(/\s+/g, " ").trim();
  if (!sentence && !title) return "";
  return `First found in: ${title || "typed in by hand"}${sentence ? ` — ${sentence}` : ""}`;
}
export function currentHunt(now = Date.now()) {
  if (hunt && now - hunt.since > HUNT_MS) hunt = null;
  return hunt;
}
export function endHunt() {
  hunt = null;
}

/** Open Filmot's results for this word in the app's own browser, remembering which word it is for.
 * The browser is told it was opened to find a word, so its script takes the top result itself. */
export async function findInVideo(v) {
  const { openBrowser } = await import("./app.js");
  const { langInfo, studyLanguage } = await import("./languages.js");
  // The word's own language (each word keeps one), else the language being learned.
  const lang = v.language || studyLanguage();
  startHunt(v);
  // The search asks Filmot for captions in that language; the browser script also picks it in the
  // results page's own language list when the address alone did not (filmot-browser.js).
  await openBrowser(filmotAddress(v.text, lang), { find: languageChoices(lang, langInfo(lang).name) });
}

/** A video's caption lines (as read by ytcaptions.js) in the shape of a stored transcript, so a word
 * can be looked for before the video is kept. Lines without words are left out, as when stored. */
export function linesTranscript(lines) {
  const out = { segments: [], words: { text: [], start: [], end: [], seg: [] } };
  const kept = (lines || []).filter((l) => l && Array.isArray(l.words) && l.words.length).sort((a, b) => a.start - b.start);
  kept.forEach((l, idx) => {
    out.segments.push({ idx, start: l.start, end: l.end, text: l.text });
    for (const [start, end, text] of l.words) {
      if (!String(text || "").trim()) continue;
      out.words.text.push(String(text).trim());
      out.words.start.push(start);
      out.words.end.push(end);
      out.words.seg.push(idx);
    }
  });
  return out;
}

/** How many of the listed videos are tried before giving up. */
export const FIND_TRIES = 5;

/** Keep the place found (`hit`) in video `ep` on the waiting word `h`, then open the player at the
 * start of its sentence. */
async function keep(h, ep, hit) {
  const { api, toast } = await import("./app.js");
  await api(`/vocab/${h.id}/source`, { method: "POST", body: { episode_id: ep.id, ...hit, note: h.note || "" } });
  hunt = null;
  toast(`Saved this video and its sentence with “${h.text}”.`);
  location.hash = `#/episode/${ep.id}?t=${Math.round(hit.sent_start * 1000) / 1000}`;
}

/**
 * The results page the user is looking at listed these videos, top first: [{id, at}], `at` being
 * the moment Filmot found the word at (0 when unknown). Try them in order: the first whose captions
 * (in the language being studied) say the waiting word becomes its source. A video is only kept in
 * the library when it is the one used. Resolves to {ok, title} or {ok: false, error}.
 */
export async function findFromResults(candidates) {
  const h = currentHunt();
  if (!h) return { ok: false, error: "Press “Find in a video” on a word first." };
  const list = (candidates || []).filter((c) => c && /^[\w-]{11}$/.test(c.id)).slice(0, FIND_TRIES);
  if (!list.length) return { ok: false, error: `Filmot found no videos for “${h.text}”.` };
  const yt = await import("./youtube.js");
  const { api } = await import("./app.js");
  const { studyLanguage } = await import("./languages.js");
  for (const c of list) {
    const at = Number(c.at) > 0 ? Number(c.at) : null;
    try {
      let ep = await yt.libraryVideo(c.id);
      let v = null;
      let hit = null;
      if (ep) {
        hit = findSpoken(await api(`/episodes/${ep.id}/transcript`), h.text, at, episodeLanguage(ep));
      } else {
        // Throws when it has no captions in the language being studied. Never YouTube's translation
        // (the word must be said in the video), and automatic captions count whatever the YouTube setting.
        v = await yt.readVideo(c.id, { translate: false, handmade: false });
        hit = findSpoken(linesTranscript(v.lines), h.text, at, v.language || studyLanguage());
      }
      if (!hit) continue;
      if (!ep) {
        ep = await yt.saveVideo(v);
        // The times as stored, which is what the player and the clips use.
        hit = findSpoken(await api(`/episodes/${ep.id}/transcript`), h.text, at, episodeLanguage(ep)) || hit;
      }
      await keep(h, ep, hit);
      return { ok: true, title: ep.title };
    } catch { /* no captions, or not reachable: the next video */ }
  }
  return { ok: false, error: `“${h.text}” isn't in the captions of the top ${list.length} video${list.length === 1 ? "" : "s"}. Tap another result to try it.` };
}

/**
 * A video was handed over by the app's browser: add it if need be and open it in the player.
 * `at` (seconds) is the moment that came with it: a search result's, or the "t" of a link. When a
 * word is waiting for a video and is said in this one, the video, the times and the sentence are
 * kept on the word, and the player opens at that sentence. Resolves to the episode.
 */
export async function watchFound(link, at = null) {
  const { getVideo } = await import("./youtube.js");
  const { api, toast } = await import("./app.js");
  const ep = await getVideo(link);
  const h = at === null ? null : currentHunt();
  if (h) {
    try {
      const hit = findSpoken(await api(`/episodes/${ep.id}/transcript`), h.text, at, episodeLanguage(ep));
      if (hit) {
        await keep(h, ep, hit); // opens the player at the start of the sentence
        return ep;
      } else {
        toast(`“${h.text}” isn't in this video's captions, so nothing was saved with it. Try another result.`);
      }
    } catch (e) {
      toast(`Couldn't save this video with “${h.text}”: ${e.message}`, { error: true });
    }
  }
  location.hash = `#/episode/${ep.id}${at !== null && at > 0 ? `?t=${Math.round(at * 1000) / 1000}` : ""}`;
  return ep;
}
