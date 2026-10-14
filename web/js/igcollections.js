// The user's saved Instagram collections, shared between the phone and the computer through the
// library sync (snapshot key "ig_collections"), so a list found on one device is there on the other.
// Pure (no page, no imports from the app), so it is unit-tested (tests/js/igcollections.test.mjs)
// and the phone's sync uses the very same merge. app/reels.py holds the computer's copy
// (clean_synced_collections, merge_synced_collections); keep the two alike, or the devices keep
// rewriting each other's copy.
//
// One record for the whole account:
//   at         when the list was last found (whole seconds); the newer list wins as a whole, so a
//              fresh look that no longer finds a deleted collection drops it on both devices
//   items      [{id, name}]: Instagram's number for the collection and its name, in the order found
//   chosen     the collection last chosen on the Reels page ("all" = everything saved)
//   chosen_at  when it was chosen (whole seconds); the newer choice wins
// (The computer also keeps each collection's page address; that stays on the computer.)

const whole = (x) => { const n = Number(x); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; };
// Cut by characters, not UTF-16 units, as Python does (a name may hold an emoji).
const text = (x, max) => Array.from(String(x == null ? "" : x).replace(/\s+/g, " ").trim()).slice(0, max).join("");
const ID = /^\d{5,25}$/;
export const ALL_SAVED = "all";
const MAX_ITEMS = 200;

/** A record as stored or received → a tidy one (an empty one for anything else). */
export function cleanCollections(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const items = [];
  for (const c of Array.isArray(r.items) ? r.items : []) {
    if (!c || typeof c !== "object") continue;
    const id = String(c.id == null ? "" : c.id);
    if (!ID.test(id) || items.some((x) => x.id === id)) continue;
    items.push({ id, name: text(c.name, 80) || `Collection ${items.length + 1}` });
    if (items.length >= MAX_ITEMS) break;
  }
  let chosen = String(r.chosen == null ? "" : r.chosen) || ALL_SAVED;
  if (chosen !== ALL_SAVED && !items.some((c) => c.id === chosen)) chosen = ALL_SAVED;
  return { at: whole(r.at), items, chosen, chosen_at: whole(r.chosen_at) };
}

// For two lists found at the same moment: a fixed order that every device works out alike
// (names as character numbers, since JavaScript and Python order emoji differently).
const listKey = (r) => r.items.map((c) => `${c.id}:${Array.from(c.name, (ch) => ch.codePointAt(0)).join(".")}`).join(",");

/** Two devices' records → one: the list found last, and the collection chosen last. */
export function mergeCollections(mine, theirs) {
  const a = cleanCollections(mine);
  const b = cleanCollections(theirs);
  const listB = b.at > a.at || (b.at === a.at && listKey(b) > listKey(a));
  const chooseB = b.chosen_at > a.chosen_at || (b.chosen_at === a.chosen_at && b.chosen > a.chosen);
  const list = listB ? b : a;
  const choice = chooseB ? b : a;
  return cleanCollections({ at: list.at, items: list.items, chosen: choice.chosen, chosen_at: choice.chosen_at });
}

/** A newly found list (`items` [{id, name}]), found at `now` (seconds). */
export function foundCollections(record, items, now) {
  return cleanCollections({ ...cleanCollections(record), items, at: now });
}

/** The collection just chosen (an id, or "all"), at `now` (seconds). Unchanged if it already was. */
export function chooseCollection(record, chosen, now) {
  const r = cleanCollections(record);
  if (r.chosen === chosen) return r;
  return cleanCollections({ ...r, chosen, chosen_at: now });
}
