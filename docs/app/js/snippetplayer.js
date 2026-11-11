// One audio player for short stretches of a card's recording: the word or its sentence, cut out of the
// card's own clip, its episode, or the voice kept for it. The Vocab page and the review cards use it, and so
// do battles (the right answer's word after a choice). Moved here from pages/vocab.js unchanged.

import { audioUrl, clipUrl } from "./app.js";
import { audioKey, failedHere, loadError } from "./cardvoice.js";

/** A player of its own: { audio, playSnippet(v, start, end, {voice}), stop() }. */
export function snippetPlayer() {
  const audio = new Audio();
  let stopAt = Infinity;
  let raf = 0;
  const watch = () => {
    if (audio.currentTime >= stopAt) { audio.pause(); return; }
    if (!audio.paused) raf = requestAnimationFrame(watch);
  };
  // Backup for when animation frames are paused (window in the background).
  audio.addEventListener("timeupdate", () => { if (audio.currentTime >= stopAt) audio.pause(); });
  // The recording in the player, and the promise of its loading: a second press while it loads waits
  // for the same loading (rather than asking a player that has nothing yet to play, which the browser
  // answers with its own words: "NotSupportedError: … no supported source was found").
  let loaded = { source: "", ready: null };
  const LOAD_WAIT = 12000;  // a recording that hasn't started loading by then is taken as unreachable
  const superseded = () => Object.assign(new Error("superseded"), { superseded: true });
  /** Load recording `source` into the player. Rejects with loadError() (cardvoice.js: plain words,
   * marked `unplayable`) when this device can't play it, or `superseded` when another card took over. */
  function loadRecording(source, address) {
    if (loaded.source === source) return loaded.ready;
    const ready = (async () => {
      let url;
      try { url = await address(); } catch { throw loadError(); }  // e.g. "This word's audio isn't on this phone yet"
      if (loaded.source !== source) throw superseded();
      if (!url) throw loadError();
      audio.src = url;
      await new Promise((res, rej) => {
        const finish = (ok) => {
          clearTimeout(timer);
          audio.removeEventListener("loadedmetadata", onMeta);
          audio.removeEventListener("error", onError);
          if (loaded.source !== source) rej(superseded());
          else if (ok) res();
          else rej(loadError());
        };
        const onMeta = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), LOAD_WAIT);
        audio.addEventListener("loadedmetadata", onMeta);
        audio.addEventListener("error", onError);
      });
    })();
    loaded = { source, ready };
    ready.catch(() => { if (loaded.ready === ready) loaded = { source: "", ready: null }; });  // tried afresh next time
    return ready;
  }
  /** Play part of a word's audio: its own clip (a word a friend shared), its episode, or (`voice`)
   * the voice kept for it (cardvoice.js: the same stored file as a clip). Never rejects with the
   * browser's own words: only loadError() (the card's voice then says it: cardvoice.js sayCard). */
  async function playSnippet(v, start, end, { voice = false } = {}) {
    const own = v.clip || voice;
    const source = audioKey(v, voice);
    if (failedHere(source)) throw loadError();  // failed a moment ago: not tried (and waited for) again
    const quietly = { ended: Promise.resolve() };
    try {
      await loadRecording(source, () => (own ? clipUrl(v) : audioUrl(v.episode_id, { quiet: true })));
    } catch (e) {
      if (e && e.superseded) return quietly;  // another card pressed meanwhile: that one plays
      throw e;
    }
    if (loaded.source !== source) return quietly;
    audio.currentTime = Math.max(0, start - 0.25);
    stopAt = end + 0.35;
    try {
      await audio.play();
    } catch (e) {
      if (e && e.name === "AbortError") return quietly;  // interrupted by another press
      if (e && e.name === "NotSupportedError") { loaded = { source: "", ready: null }; throw loadError(); }
      throw Object.assign(new Error("Couldn't load this word's audio."), { cause: e });  // e.g. not allowed to play yet
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(watch);
    // `ended` settles once this stretch has finished playing: the player pauses at `stopAt`, or the
    // file ends, or something else takes the player over. A timer backs it up, so nothing waiting on
    // it can hang. (The review card's "Say it" plays the learner's attempt after it.)
    const ended = new Promise((done) => {
      const finish = () => {
        clearTimeout(backup);
        audio.removeEventListener("pause", finish);
        audio.removeEventListener("ended", finish);
        done();
      };
      const backup = setTimeout(finish, Math.max(0, stopAt - audio.currentTime) * 1000 + 5000);  // room for a phone that stalls while loading
      audio.addEventListener("pause", finish);
      audio.addEventListener("ended", finish);
    });
    return { ended };
  }
  const stop = () => { audio.pause(); cancelAnimationFrame(raf); };
  return { audio, playSnippet, stop };
}
