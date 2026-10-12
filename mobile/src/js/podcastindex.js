// Trending podcasts from the Podcast Index (podcastindex.org), asked for straight from the phone.
// The phone twin of the computer's app/podcastindex.py: same request, same tidy-up.
// The app's key and secret are written into js/keys.js when the app is built
// (scripts/build-www.mjs, from PODCASTINDEX_KEY / PODCASTINDEX_SECRET).

import { NativeHttp, isNative } from "./native.js";

const API = "https://api.podcastindex.org/api/1.0";
const CACHE_MS = 60 * 60 * 1000;
const SINCE_SECONDS = 30 * 24 * 3600; // "trending" among podcasts with something new in the last month
const MAX_FEEDS = 300;
const cache = new Map();

async function credentials() {
  try {
    const { PODCASTINDEX } = await import("./keys.js");
    return PODCASTINDEX && PODCASTINDEX.key && PODCASTINDEX.secret ? PODCASTINDEX : null;
  } catch {
    return null; // a build made without the keys
  }
}

async function sha1(text) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const squeeze = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);

/** Keep only what the Trending screen shows. */
export function tidy(feed) {
  const url = String(feed.url || "").trim();
  const title = squeeze(feed.title, 300);
  if (!/^https?:\/\//.test(url) || !title) return null;
  const image = String(feed.artwork || feed.image || "").trim();
  const cats = feed.categories;
  return {
    id: feed.id, url, title, author: squeeze(feed.author, 200), description: squeeze(feed.description, 600),
    image: image.startsWith("https://") ? image : null, language: String(feed.language || "").toLowerCase(),
    categories: cats && typeof cats === "object" ? Object.values(cats).map(String) : [],
    score: feed.trendScore || 0, newest: feed.newestItemPublishTime || null,
  };
}

/** Trending podcasts in the given language(s) (comma-separated codes), best first. */
export async function trending(lang, fresh = false) {
  const creds = await credentials();
  if (!creds) throw new Error("Trending podcasts aren't switched on in this copy of the app yet.");
  const langs = String(lang || "").toLowerCase().split(/[,\s]+/).filter((c) => /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(c)).slice(0, 40).join(",");
  if (!langs) throw new Error("Choose a language to study first (Settings).");
  const hit = cache.get(langs);
  if (hit && !fresh && Date.now() - hit.at < CACHE_MS) return hit.feeds;
  const now = Math.floor(Date.now() / 1000);
  const headers = { "X-Auth-Key": creds.key, "X-Auth-Date": String(now), Authorization: await sha1(`${creds.key}${creds.secret}${now}`),
                    "User-Agent": "Tamkeen/Android" };
  const url = `${API}/podcasts/trending?lang=${encodeURIComponent(langs)}&max=${MAX_FEEDS}&since=${now - SINCE_SECONDS}`;
  let status;
  let data;
  try {
    if (isNative) {
      const res = await NativeHttp.get({ url, headers, connectTimeout: 15000, readTimeout: 30000 });
      status = res.status;
      data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    } else { // development preview in a browser
      const res = await fetch(url, { headers });
      status = res.status;
      data = await res.json();
    }
  } catch {
    throw new Error("Couldn't reach the podcast directory. Check your connection.");
  }
  if (status === 401 || status === 403) throw new Error("The podcast directory refused the app's key.");
  if (status >= 400) throw new Error(`The podcast directory answered with an error (${status}).`);
  const feeds = ((data && data.feeds) || []).map(tidy).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
  cache.set(langs, { at: Date.now(), feeds });
  return feeds;
}
