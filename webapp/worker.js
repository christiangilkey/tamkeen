// Tamkeen's go-between server for the web app (a Cloudflare Worker).
//
// A web page may not read other websites directly (browsers block it), so the web version of
// Tamkeen asks this Worker to fetch, for it alone:
//   - podcast feeds and podcast audio            GET  any public http(s) address
//   - web pages to import                        GET  any public http(s) address
//   - YouTube captions and channel pages         GET  youtube.com addresses
//   - YouTube's video information                POST https://www.youtube.com/youtubei/v1/player
// Nothing else: only Tamkeen's own web addresses may use it, no other POST, no addresses inside
// private networks, no cookies passed either way.
//
// Use:  https://<this worker>/fetch?url=<address>   (POST: send the body as YouTube expects it)

const ALLOWED_ORIGINS = [
  "https://christiangilkey.github.io", // the web app on GitHub Pages
  "http://localhost:8791",             // testing on the computer
];
const POST_ALLOWED = ["https://www.youtube.com/youtubei/v1/player"];
const PASS_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "range"];
const PASS_RESPONSE_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges",
  "etag", "last-modified", "cache-control"];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Accept-Language, Range",
    "Access-Control-Expose-Headers": "Content-Type, Content-Length, Content-Range, Accept-Ranges, X-Final-Url",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function refuse(status, message, origin) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...(origin ? corsHeaders(origin) : {}) } });
}

/** Only ordinary public web addresses: never this computer, a home network or a cloud's insides. */
function publicAddress(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^(127|10|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return null;
  if (host.includes(":")) return null; // raw IPv6 addresses: not needed, so not allowed
  return u;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    if (request.method === "OPTIONS") return allowed ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : refuse(403, "Not allowed.");
    if (!allowed) return refuse(403, "This server only works for the Tamkeen web app.");

    const here = new URL(request.url);
    if (here.pathname !== "/fetch") return refuse(404, "Unknown address.", origin);
    const target = publicAddress(here.searchParams.get("url") || "");
    if (!target) return refuse(400, "That address can't be fetched.", origin);

    const method = request.method;
    if (method !== "GET" && method !== "POST") return refuse(405, "Only GET and POST.", origin);
    if (method === "POST" && !POST_ALLOWED.some((p) => target.href.startsWith(p))) return refuse(403, "That address can't be sent to.", origin);

    const headers = new Headers({ "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 Tamkeen" });
    for (const name of PASS_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let answer;
    try {
      answer = await fetch(target.href, {
        method, headers, redirect: "follow",
        body: method === "POST" ? await request.arrayBuffer() : undefined,
      });
    } catch (e) {
      return refuse(502, `Couldn't reach ${target.hostname}.`, origin);
    }
    const out = new Headers(corsHeaders(origin));
    // A compressed answer arrives here already unpacked, so its packed size no longer applies.
    const packed = !!answer.headers.get("content-encoding");
    for (const name of PASS_RESPONSE_HEADERS) {
      const value = answer.headers.get(name);
      if (value && !(packed && name === "content-length")) out.set(name, value);
    }
    out.set("X-Final-Url", answer.url || target.href);
    return new Response(answer.body, { status: answer.status, headers: out });
  },
};
