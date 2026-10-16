// "Find in a video": giving a saved word that has nothing to listen to a real video to hear it in.
//
// A word typed in by hand, or saved from a web page, has no audio. Filmot (filmot.com) is a
// search engine over YouTube's captions. The button on the Vocab page opens Filmot's ordinary
// results page for the word in the app's own browser; tapping a result there hands the video and
// the moment to the app (web/js/filmot-browser.js), which opens it in its own player and keeps
// that video, the times and the whole spoken sentence on the word, exactly as if the word had
// been saved from the player.
//
// The app asks Filmot nothing itself: the user browses its pages, as in any browser.

import { episodeLanguage, joinWords, regroupWords } from "./languages.js";
import { sentenceBounds } from "./wordlookup.js";
import { fold } from "./cardtext.js";

export { fold };

export const FILMOT = "https://filmot.com";

// Arabic vowel marks and the stretching line: captions are written without them.
const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Filmot's results page for `word`: the address its own search box goes to. */
export function filmotAddress(word) {
  let q = String(word || "").replace(HARAKAT, "").replace(/["“”]/g, " ").replace(/\s+/g, " ").trim().replace(/\//g, "\\");
  if (!q) return `${FILMOT}/`;
  if (q.includes(" ")) q = `"${q}"`; // several words: Filmot looks for them together only in quotation marks
  return `${FILMOT}/search/${encodeURIComponent(q)}/1?gridView=1`;
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

/** Open Filmot's results for this word in the app's own browser, remembering which word it is for. */
export async function findInVideo(v) {
  const { openBrowser } = await import("./app.js");
  startHunt(v);
  await openBrowser(filmotAddress(v.text));
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
  let t = at;
  const h = at === null ? null : currentHunt();
  if (h) {
    try {
      const hit = findSpoken(await api(`/episodes/${ep.id}/transcript`), h.text, at, episodeLanguage(ep));
      if (hit) {
        await api(`/vocab/${h.id}/source`, { method: "POST", body: { episode_id: ep.id, ...hit, note: h.note || "" } });
        hunt = null;
        t = hit.sent_start;
        toast(`Saved this video and its sentence with “${h.text}”.`);
      } else {
        toast(`“${h.text}” isn't in this video's captions, so nothing was saved with it. Try another result.`);
      }
    } catch (e) {
      toast(`Couldn't save this video with “${h.text}”: ${e.message}`, { error: true });
    }
  }
  location.hash = `#/episode/${ep.id}${t !== null && t > 0 ? `?t=${Math.round(t * 1000) / 1000}` : ""}`;
  return ep;
}
