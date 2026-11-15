// Several vocab folders picked at once (the owner: "There should be an option for a user to select multiple
// folders at once"; and for battles: "'not in a folder' should show up here as well"). A pick is a folder's uid,
// or NONE for the words in no folder. The Vocab page keeps its picks as one string, the uids joined by commas
// (`key`: "" = every word, "none", "d12ab", "d12ab,d34cd,none"), so a single folder is stored just as before.
// Pure rules, shared by the Vocab page (pages/vocab.js), its counts (vocabedit.js folderCount) and battles
// (game/rules.js setWords); tested in tests/js/folderpicks.test.mjs. The computer's server and the phone's
// library read the same "a,b" form for GET /vocab?folder= (app/api/vocab.py, mobile/src/js/backend.js).

/** The pick that means "the words in no folder". */
export const NONE = "none";

const MAX_PICKS = 50;

/** The picks in a key or a list, each once, in their order: a key "a,b" or ["a", "b"] → ["a", "b"]. */
export function pickList(key) {
  const parts = Array.isArray(key) ? key : String(key || "").split(",");
  const out = [];
  for (const p of parts) {
    const s = typeof p === "string" ? p.trim() : "";
    if (s && s.length <= 64 && !out.includes(s)) out.push(s);
    if (out.length >= MAX_PICKS) break;
  }
  return out;
}

/** The key for a list of picks ("" for none at all). */
export const pickKey = (list) => pickList(list).join(",");

/** Is word `v` among the picks? No picks at all: every word is. */
export function inPicks(v, picks) {
  const list = pickList(picks);
  if (!list.length) return true;
  const own = (v && v.folders) || [];
  if (!own.length) return list.includes(NONE);
  return own.some((uid) => list.includes(uid));
}

/** The picks with `id` added (or taken out if it was there). Picking every word ("") clears them. */
export function togglePick(key, id) {
  if (!id) return "";
  const list = pickList(key);
  return pickKey(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
}

/** The picks that still exist: NONE, and the uids of `folders` (a folder deleted, or of another language, drops out). */
export function livePicks(key, folders) {
  const have = new Set((folders || []).map((f) => f.uid));
  return pickKey(pickList(key).filter((p) => p === NONE || have.has(p)));
}

/** The first real folder among the picks ("" if none): where a new word goes (Add words takes one folder). */
export const firstFolder = (key) => pickList(key).find((p) => p !== NONE) || "";

/** Do the picks include a real folder (not only the words in no folder)? */
export const hasFolder = (key) => pickList(key).some((p) => p !== NONE);

/** The picks' names, joined: "Greetings, Food, Not in a folder". `nameOf(uid)` gives a folder's name;
 * `noneName` the words in no folder's. Picks without a name are left out. */
export function picksName(key, nameOf, noneName = "Not in a folder") {
  return pickList(key).map((p) => (p === NONE ? noneName : nameOf(p))).filter(Boolean).join(", ");
}
