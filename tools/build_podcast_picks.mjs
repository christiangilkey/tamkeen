// Build web/js/podcast-picks.js: podcasts for languages that never reach the podcast charts, most-rated
// first. The Trending page shows them (web/js/trending.js) after anything that does chart.
//
//     node tools/build_podcast_picks.mjs
//
// Bisaya (Cebuano) is the one such language: on 2026-10-18 not one Bisaya podcast was in Apple's top
// 200 for the Philippines, in any of its 19 category charts there, or in Spotify's top 100. So
// "popular" is measured by listener ratings instead. The shows below are every Bisaya podcast with a
// public feed that was found (Apple searches for about 50 Bisaya words in the Philippines and the US,
// Spotify's and Podcast Index's searches; each feed read to check it is really in Bisaya and not
// Tagalog or English), with how many ratings each had on Spotify, read off its Spotify page by hand
// (Spotify has no open way to ask). This tool adds each show's Apple ratings in ten countries, checks
// the feed still answers, takes the title, picture and description from Apple and the feed, and
// sorts them: most ratings (Spotify + Apple) first, then most episodes.
//
// Well-known Bisaya shows that are only on Spotify (Batang Bisaya, RMN's Bisayang Sugilanon radio
// dramas) can't be added: the app subscribes by feed, and they have none.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "web", "js", "podcast-picks.js");
const MEASURED = "2026-10-18";

// [Apple id, Spotify ratings on MEASURED (0 = none shown), what it is]
const SHOWS = {
  ceb: [
    [1879749765, 284, "Unsa'y Cheka Sa Parlor: comedy in Bisaya gay lingo (TAGM)"],
    [1492152676, 43, "Crosseyed: Gary Monton's Bisaya podcast"],
    [1731520640, 36, "Dili Ni Advice: two sisters from Davao (The Pod Network)"],
    [1445558228, 11, "Barok and Takya: family, tradition, society"],
    [1733215814, 11, "Cge Storya Ta: a Bisaya couple"],
    [1715623839, 11, "Kasikas: comedy"],
    [1575769216, 8, "Wanbats Ra Besh: two friends from Cebu"],
    [1498469597, 5, "Brighter Bisaya"],
    [1655535923, 6, "Sunday Mass readings in Cebuano"],
    [1552825902, 6, "Bisaya Jokes!"],
    [1591409921, 4, "Storytelling with Ziwi"],
    [1723424172, 3, "Kinabuhing Kristohanon: preaching (Barok and Takya)"],
    [1896525308, 3, "Purok Pabula Ph: comedy"],
    [1549595896, 2, "NAYSJUAN SESSIONS"],
    [1838637031, 2, "Coffee Break with Juppe"],
    [1589049137, 2, "Unsa Man Jud"],
    [1531650848, 1, "Bisaya In America"],
    [1819240232, 0, "Bisaya Thoughts"],
    [1560805705, 0, "Bisaya Podcasts PH"],
    [1646909839, 0, "NAYSJUAN DAILY"],
    [1645971484, 0, "BANHA: Istorya Ug Uban Pa"],
    [1532105184, 0, "Bisaya Vibes"],
    [1477091693, 0, "Bored Bisayas"],
    [1546794506, 0, "Teacher D"],
    [1544710458, 0, "Ang Santos nga Ebanghelyo sa Matag Adlaw"],
    [1553865357, 0, "PAMALANDONG"],
    [1557614476, 0, "Sugboanon (Cebuano) nga Bibliya"],
    [738465091, 0, "Pagkatinon-an sa Biblia"],
    [6786046649, 0, "Balaan nga Bibliya: the Bible read in Cebuano"],
    [6805583213, 0, "Thru the Bible in Cebuano"],
    [1502596394, 0, "Hisgutanan"],
    [1542498429, 0, "Bisaya Espesyal"],
    [1526892193, 0, "Binisaya nga tulumanon"],
    [1530624840, 0, "Mga Balak Sugbuanon: poems"],
    [667709105, 0, "LibriVox: Si Amboy, ang Palahubog (Vicente Rama)"],
  ],
};
const STORE = { ceb: "ph" };
const RATING_STORES = ["ph", "us", "ae", "sa", "gb", "ca", "au", "jp", "kr", "sg"];
// Apple's main podcast headings (as in web/js/trending.js).
const MAIN = ["Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness", "History",
  "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture", "Sports",
  "TV & Film", "Technology", "True Crime"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const squeeze = (s, max) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);

async function appleRatings(id) {
  let total = 0;
  for (const store of RATING_STORES) {
    try {
      const html = await fetch(`https://podcasts.apple.com/${store}/podcast/id${id}`, { headers: { "user-agent": UA } }).then((r) => r.text());
      const m = html.match(/"productId":"(\d+)","ratingAverage":[\d.]+,"totalNumberOfRatings":(\d+)/);
      if (m && m[1] === String(id)) total += Number(m[2]);
    } catch { /* that store is left out */ }
    await sleep(150);
  }
  return total;
}

async function feedInfo(url) {
  const r = await fetch(url, { headers: { "user-agent": "Tamkeen/1.0 (+https://github.com/christiangilkey/tamkeen)" } });
  if (!r.ok) throw new Error(`feed answered ${r.status}`);
  const xml = await r.text();
  const items = (xml.match(/<item[\s>]/g) || []).length;
  if (!items) throw new Error("feed has no episodes");
  const channel = xml.split(/<item[\s>]/)[0];
  const desc = channel.match(/<itunes:summary>([^]*?)<\/itunes:summary>/) || channel.match(/<description>([^]*?)<\/description>/);
  const text = desc ? desc[1].replace(/<!\[CDATA\[|\]\]>/g, "") : "";
  return { items, description: squeeze(text, 600) };
}

const out = {};
for (const [lang, shows] of Object.entries(SHOWS)) {
  const ids = shows.map(([id]) => id);
  const details = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const data = await fetch(`https://itunes.apple.com/lookup?id=${ids.slice(i, i + 100).join(",")}&country=${STORE[lang]}&entity=podcast&lang=en_us`).then((r) => r.json());
    for (const d of data.results || []) details.set(d.collectionId, d);
  }
  const list = [];
  for (const [id, spotify, what] of shows) {
    const d = details.get(id);
    if (!d || !d.feedUrl) { console.warn(`skipped ${id} (${what}): Apple doesn't list it any more`); continue; }
    let feed;
    try { feed = await feedInfo(d.feedUrl); } catch (e) { console.warn(`skipped ${id} (${what}): ${e.message}`); continue; }
    const apple = await appleRatings(id);
    const named = [...(d.genres || []), d.primaryGenreName];
    const category = named.find((g) => MAIN.includes(g)) || named.find((g) => g && g !== "Podcasts") || "";
    list.push({
      id: String(id), url: d.feedUrl, title: squeeze(d.collectionName, 300), author: squeeze(d.artistName, 200),
      description: feed.description, image: d.artworkUrl600 || d.artworkUrl100 || null,
      categories: category ? [category] : [], ratings: spotify + apple, episodes: feed.items,
    });
    console.log(`${String(spotify + apple).padStart(4)} ratings  ${String(feed.items).padStart(4)} episodes  ${d.collectionName}`);
  }
  list.sort((a, b) => b.ratings - a.ratings || b.episodes - a.episodes);
  out[lang] = list;
}

const body = `// Made by tools/build_podcast_picks.mjs on ${MEASURED}: don't edit by hand, run the tool again.
// Podcasts for languages none of whose podcasts reach the charts, most-rated first (listener ratings on
// Spotify and Apple Podcasts together). Used by trending.js.

export const PICKS_MEASURED = "${MEASURED}";

export const PICKS = ${JSON.stringify(out, null, 2)};
`;
fs.writeFileSync(OUT, body.replace(/\r\n/g, "\n"));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.entries(out).map(([l, v]) => `${l} ${v.length}`).join(", ")}`);
