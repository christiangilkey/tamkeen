// A basics course's audio, packed: one file per unit of 50 words (made by tools/course/packs.py, which says why:
// GitHub Pages timed out on 17,000 small files). A pack is the unit's Ogg clips one after another; each word in
// course.json says where its own clip is, "clip": {"pack": "audio/u01-0c935ca6df.pack", "at": 10761, "size": 9097}.
// The clip is those bytes cut out of the pack: a Blob slice, which plays and is kept as a card voice like the
// one-file-per-word audio before it (still read for a course built that way: "audio": "audio/0001.ogg").
//
// A pack is downloaded once. On the phones and the web app it is kept in the browser's Cache Storage
// (KEEP_CACHE: a unit opened once plays without a connection); the web app's service worker leaves caches
// whose name starts "tamkeen-keep-" alone (webapp/build-web.mjs). The computer's own server keeps what it
// downloads already (app/course.py), so there it isn't kept twice. A pack's name changes with what is in it,
// so a kept one is never out of date, and `tidy` drops the ones a course no longer names.
// No screen code: tests/js/coursepacks.test.mjs runs it as it is.

export const KEEP_CACHE = "tamkeen-keep-course-packs";
const MEMORY = 6; // packs held in memory at once (about 650 KB each), the latest used kept

/** Where word `w`'s audio is: {file, at, size} for its clip in a pack, {file} for a word's own file, null
 * for a word without audio. `file` is the course folder's file ("audio/u01-….pack"). */
export function clipOf(w) {
  if (!w || !w.times) return null;
  const c = w.clip;
  if (c && typeof c.pack === "string" && Number.isInteger(c.at) && c.at >= 0 && Number.isInteger(c.size) && c.size > 0) {
    return { file: c.pack, at: c.at, size: c.size };
  }
  return typeof w.audio === "string" && w.audio ? { file: w.audio } : null;
}

/** The packs a list of words' audio is in (each once, in order). */
export function packsOf(words) {
  const out = [];
  for (const w of words || []) {
    const c = clipOf(w);
    if (c && c.at !== undefined && !out.includes(c.file)) out.push(c.file);
  }
  return out;
}

/** The clip cut out of its pack (or the word's own file as it is), as Ogg audio. */
export function cut(blob, clip) {
  if (clip.at === undefined) return blob.type === "audio/ogg" ? blob : blob.slice(0, blob.size, "audio/ogg");
  if (blob.size < clip.at + clip.size) throw new Error("This unit's audio came down incomplete.");
  return blob.slice(clip.at, clip.at + clip.size, "audio/ogg");
}

/**
 * Downloaded packs: `clip(w, urlOf)` gives word `w`'s clip as a Blob, `urlOf(file)` being the address of a file
 * of its course. Each pack is fetched once (and kept, when `keep` and Cache Storage is there); a word's own
 * file (a course from before the packs) is fetched each time, as it always was.
 */
export function packStore({ fetch: get = (...a) => globalThis.fetch(...a), cacheStorage = globalThis.caches, keep = true } = {}) {
  const memory = new Map(); // address -> Promise<Blob>, the latest used last
  const box = () => (keep && cacheStorage ? cacheStorage.open(KEEP_CACHE).catch(() => null) : Promise.resolve(null));

  async function download(url) {
    const kept = await box();
    if (kept) {
      try {
        const hit = await kept.match(url);
        if (hit) return await hit.blob();
      } catch { /* not kept after all */ }
    }
    const r = await get(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    if (kept) { try { await kept.put(url, new Response(blob)); } catch { /* full, or not allowed: fetched again next time */ } }
    return blob;
  }

  function pack(url) {
    let p = memory.get(url);
    if (p) memory.delete(url);
    else {
      p = download(url);
      p.catch(() => { if (memory.get(url) === p) memory.delete(url); });
    }
    memory.set(url, p);
    while (memory.size > MEMORY) memory.delete(memory.keys().next().value);
    return p;
  }

  async function forget(url) {
    memory.delete(url);
    const kept = await box();
    if (kept) { try { await kept.delete(url); } catch { /* gone already */ } }
  }

  return {
    async clip(w, urlOf) {
      const c = clipOf(w);
      if (!c) throw new Error("This word has no audio.");
      const url = urlOf(c.file);
      if (c.at === undefined) {
        const r = await get(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return cut(await r.blob(), c);
      }
      try {
        return cut(await pack(url), c);
      } catch (e) {
        await forget(url); // (a broken or cut-short download isn't kept)
        throw e;
      }
    },
    /** Start downloading the packs `words` need, so their first Word / Sentence plays at once. */
    warm(words, urlOf) {
      for (const file of packsOf(words)) pack(urlOf(file)).catch(() => {});
    },
    /** Drop the kept packs of a course (`urlOf("audio/")` is its audio's address) that it no longer names. */
    async tidy(course, urlOf) {
      const kept = await box();
      if (!kept) return 0;
      const wanted = new Set(packsOf((course && course.words) || []).map((f) => new URL(urlOf(f), base()).href));
      const prefix = new URL(urlOf("audio/"), base()).href;
      let dropped = 0;
      try {
        for (const req of await kept.keys()) {
          if (req.url.startsWith(prefix) && /\/u\d{2}-[0-9a-f]{10}\.pack$/.test(req.url) && !wanted.has(req.url)) {
            await kept.delete(req);
            dropped++;
          }
        }
      } catch { /* next time */ }
      return dropped;
    },
    /** (for tests) the addresses held in memory, the latest used last */
    held: () => [...memory.keys()],
  };
}

const base = () => (typeof location !== "undefined" && location.href) || "https://localhost/";
