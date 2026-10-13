// Sites the user saved to the in-app browser's start page: the list itself and the rules for
// changing and merging it. Pure (no page, no imports from the app), so it is unit-tested
// (tests/js/browser-sites.test.mjs) and the phone's sync uses the very same merge. app/pages.py
// holds the computer's copy (site_key, clean_sites, set_site, merge_sites, saved_sites); keep
// the two alike.
//
// One record per address, kept even after it is taken off the start page so that the removal
// reaches the user's other devices:
//   url         the page's address, without any "#part" (this is what makes two records the same)
//   title       the page's name when it was saved
//   on          1 on the start page, 0 taken off
//   updated_at  when this record last changed (whole seconds); the newer copy wins between devices

const MAX_RECORDS = 300; // more than anyone keeps; a limit so a faulty copy can't grow without end
const text = (x, max) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, max);
const whole = (x) => Math.max(0, Math.floor(Number(x) || 0));
// Plain character-code order (not alphabetical): every device must sort the list identically,
// or each would keep "correcting" the other's copy.
const byUrl = (a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);

/** A web address as the list keeps it ("" if it is not an http or https address). */
export function siteKey(url) {
  let u;
  try { u = new URL(String(url || "").trim()); } catch { return ""; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  u.hash = "";
  const key = u.href;
  return key.length <= 500 ? key : "";
}

/** Which of two copies of one record stands: the one changed last; on a tie, the same one on
 * every device (kept beats removed, then the title that sorts first). */
function newer(a, b) {
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? a : b;
  if (a.on !== b.on) return a.on ? a : b;
  return a.title <= b.title ? a : b;
}

/** A list as stored or received → tidy records, one per address, in a fixed order. */
export function cleanSites(raw) {
  const seen = new Map();
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r !== "object") continue;
    const url = siteKey(r.url);
    if (!url) continue;
    const rec = { url, title: text(r.title, 120), on: r.on ? 1 : 0, updated_at: whole(r.updated_at) };
    const had = seen.get(url);
    seen.set(url, had ? newer(had, rec) : rec);
  }
  let all = [...seen.values()];
  if (all.length > MAX_RECORDS) {
    // Too many: the ones still on the start page stay, then the most recently changed.
    all = all.sort((a, b) => b.on - a.on || b.updated_at - a.updated_at || byUrl(a, b)).slice(0, MAX_RECORDS);
  }
  return all.sort(byUrl);
}

export const isSaved = (list, url) => { const key = siteKey(url); return !!key && cleanSites(list).some((r) => r.on && r.url === key); };

/** Put a site on the start page, or take it off. `site` is {url, title?}; `now` is in seconds. */
export function setSite(list, site, on, now) {
  const url = siteKey(site && site.url);
  const all = cleanSites(list);
  if (!url) return all;
  const had = all.find((r) => r.url === url);
  // Always later than everything already in the list: a change made with a clock that runs
  // behind still wins, and two sites saved in the same second keep their order.
  const latest = all.reduce((t, r) => Math.max(t, r.updated_at), 0);
  const rec = { url, title: text(site.title, 120) || (had ? had.title : ""), on: on ? 1 : 0,
                updated_at: Math.max(whole(now), latest + 1) };
  return cleanSites([...all.filter((r) => r.url !== url), rec]);
}

/** The sites on the start page, in the order they were saved: [{url, title}]. */
export function savedSites(list) {
  return cleanSites(list).filter((r) => r.on).sort((a, b) => a.updated_at - b.updated_at || byUrl(a, b))
    .map((r) => ({ url: r.url, title: r.title }));
}

/** Two devices' lists → one: for each address the copy that changed last wins. */
export function mergeSites(mine, theirs) {
  return cleanSites([...cleanSites(mine), ...cleanSites(theirs)]);
}
