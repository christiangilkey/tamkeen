// The web app's YouTube list, page after page: when the learner scrolls near the end, the next videos are asked
// for the way YouTube's own page asks for them (the owner, 2026-11-25: "it should probably load another page of
// things instead of that"; he chose this, YouTube's own address for it, knowing it is the same kind of reading of
// YouTube as the captions are). Only YouTube's answers are read: nothing is played or run on YouTube.
//
// A YouTube page (m.youtube.com, read once through the go-between server by web-youtube.js) carries:
//   - its settings for the next requests ("ytcfg": INNERTUBE_CONTEXT, the client's name and version, a key), and
//   - at the end of its list a "continuation": a token and the address it goes to (/youtubei/v1/search for results,
//     /youtubei/v1/browse for the home page or a channel).
// Sending the token there (POST, JSON) answers with the next videos and, while there are more, the next token.
// Pure logic, no imports: tested in tests/js/ytmore.test.mjs against saved answers.

/** Where the next pages may be asked for: only these two addresses (webapp/worker.js allows the same). */
export const MORE_ADDRESSES = ["/youtubei/v1/search", "/youtubei/v1/browse"];
/** At most this many more pages for one list (a long scroll stays polite to YouTube). */
export const MAX_PAGES = 25;

/** A JSON object written in `html` right after `key` ("INNERTUBE_CONTEXT":{…}), read by matching its braces. */
function objectAfter(html, key) {
  const at = html.indexOf(`"${key}":{`);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  let depth = 0, inString = false;
  for (let i = start; i < html.length && i < start + 20000; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}
const stringAfter = (html, key) => (String(html).match(new RegExp(`"${key}":"([^"\\\\]*)"`)) || [])[1] || "";

/** The page's settings for asking for more: {context, key}, or null when the page has none. */
export function pageSettings(html) {
  const text = String(html || "");
  let context = objectAfter(text, "INNERTUBE_CONTEXT");
  const name = stringAfter(text, "INNERTUBE_CLIENT_NAME") || "MWEB";
  const version = stringAfter(text, "INNERTUBE_CLIENT_VERSION");
  if (!context || !context.client) {
    if (!version) return null;
    context = { client: { clientName: name, clientVersion: version } };
  }
  return { context, key: stringAfter(text, "INNERTUBE_API_KEY") };
}

/** The list's "load more" in YouTube's data (a page's or a "more" answer's): {token, api}, or null at the end.
 *  Only the list's own continuation counts, not a topic chip's (those also carry tokens). */
export function nextPage(data) {
  let found = null;
  (function walk(o, depth) {
    if (!o || typeof o !== "object" || depth > 60) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== "object") continue;
      if (k === "continuationItemRenderer") {
        const end = v.continuationEndpoint || (v.button && v.button.buttonRenderer && v.button.buttonRenderer.command) || {};
        const token = end.continuationCommand && end.continuationCommand.token;
        const api = (((end.commandMetadata || {}).webCommandMetadata || {}).apiUrl) || "";
        if (token) found = { token, api }; // (the last one in the list is the list's own)
        continue;
      }
      if (k === "nextContinuationData" && v.continuation) { found = { token: v.continuation, api: "" }; continue; }
      if (k === "feedFilterChipBarRenderer" || k === "chipCloudRenderer") continue; // (the topic chips' tokens)
      walk(v, depth + 1);
    }
  })(data, 0);
  return found;
}

/** The request for the next page: {url, body} (JSON text), or null when it can't be asked (an address not allowed).
 *  `pageUrl`: the YouTube page the list came from (a results page asks /search, anything else /browse). */
export function moreRequest(pageUrl, settings, next) {
  if (!settings || !next || !next.token) return null;
  const site = new URL(pageUrl);
  const api = next.api || (site.pathname === "/results" ? MORE_ADDRESSES[0] : MORE_ADDRESSES[1]);
  if (!MORE_ADDRESSES.includes(api)) return null;
  const url = new URL(api, `${site.protocol}//${site.host}`);
  url.searchParams.set("prettyPrint", "false");
  if (settings.key) url.searchParams.set("key", settings.key);
  return { url: url.href, body: JSON.stringify({ context: settings.context, continuation: next.token }) };
}
