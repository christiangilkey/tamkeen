// What was shared to the web app ("Share → Tamkeen", the manifest's share_target in
// webapp/build-web.mjs): the page's address, picked out of the query the browser opens the app with.
// Plain functions with no page around them, so tests/js/share-target.test.mjs can run them.

export const SHARE_KEYS = ["share_url", "share_text", "share_title"];

/** The first web address in a piece of text (Chrome often puts the page's address in the text,
 *  after its title, instead of in the url field), with any trailing punctuation left off. */
export function firstAddress(text) {
  const m = String(text || "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[.,;:!?)\]}»”’]+$/, "") : "";
}

/** What was shared to the web app, from its address's query (`?share_url=…`): {shared, url}.
 *  `shared` is false when the app was opened normally; `url` is "" when nothing shared was a web address. */
export function sharedPage(search) {
  const q = new URLSearchParams(search || "");
  if (!SHARE_KEYS.some((k) => q.has(k))) return { shared: false, url: "" };
  for (const k of SHARE_KEYS) {
    const url = firstAddress(q.get(k));
    if (url) return { shared: true, url };
  }
  return { shared: true, url: "" };
}

/** The app's address without the shared bits, so a reload doesn't import the page again. */
export function withoutShare(href) {
  const u = new URL(href);
  for (const k of SHARE_KEYS) u.searchParams.delete(k);
  return u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash;
}
