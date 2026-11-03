// Build web/js/podcast-picks.js: podcasts for languages that never reach the podcast charts, most-rated
// first. The Trending page shows them (web/js/trending.js) after anything that does chart.
//
//     node tools/build_podcast_picks.mjs           (every language below)
//     node tools/build_podcast_picks.mjs la        (only these; the others are kept as they are in the file)
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
//
// Latin (2026-11-02): no country's chart has a podcast in Latin. The shows below are the ones spoken in Latin
// with a public feed that Apple's search found (about 40 search words in five stores, 1,300 shows read by hand,
// and the spoken-Latin podcast lists of caneweb.org and arretetonchar.fr), each feed read today. Left out: English
// talk about Latin (Latin Poetry Podcast, Daily Latin…), Satura Lanx's "Recitationes" (for its course's members
// only: its description asks not to share it), Quomodo Dicitur (its feed's site is gone), Anima Latina (Italian),
// and lessons in German, Italian, Dutch or Russian. LibriVox's Latin audiobooks are its own Apple entries.
// Spotify's ratings weren't read for these (0).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "web", "js", "podcast-picks.js");
const MEASURED = { ceb: "2026-10-18", la: "2026-11-02" };

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
  la: [
    [1329415244, 0, "Ab ovo (usque ad mala): easy spoken Latin (Irene Regini, Satura Lanx)"],
    [1163511976, 0, "Latinitium: Daniel Pettersson's Latin podcast (ended 2021)"],
    [1662488027, 0, "Litterae Latinae Simplices: Latin literature's history in easy Latin (Satura Lanx)"],
    [1153286821, 0, "Sermones Raedarii: easy Latin talks (Alexander Veronensis)"],
    [1338542908, 0, "Legio XIII: Luke Ranieri and friends speak Latin (a few in Greek)"],
    [1590674364, 0, "Latinitas Animi Causa: Latin for fun"],
    [1211902719, 0, "Nuntii Latini: weekly world news in Latin (WWU students)"],
    [1508912347, 0, "Quid Es Tu?: a Latin word-guessing game"],
    [1295432578, 0, "In Foro Romano: two friends chat in Latin"],
    [1526136202, 0, "Litterae Christianae: Christian Latin texts, read and explained in Latin"],
    [1519521369, 0, "Secunda Mensa: food and cooking, in Latin"],
    [1409210910, 0, "Philologia Perennis: Keeline and Owens talk in Latin (advanced)"],
    [1754959741, 0, "Colloquia Facilia: easy Latin dialogues for beginners"],
    [1478534457, 0, "Salvi Sitis!: science and epidemiology in Latin"],
    [1500792903, 0, "Colloquia apud Recentiores: Neo-Latin texts discussed in Latin"],
    [1427872856, 0, "Musa Pedestris: Latin poetry discussed in Latin"],
    [1760528136, 0, "Lucia et Thomas Latine loquuntur: conversations in Latin"],
    [1439859681, 0, "Fabellae Latinae: Ørberg's easy readings, read aloud"],
    [1674642489, 0, "Alea Iacta Est: Dungeons & Dragons played in Latin"],
    [1543590593, 0, "Beginner Latin AudioBooks: Corderius' school dialogues read slowly"],
    [1880980362, 0, "Latine Loquimur: simple texts read in Latin"],
    [1553850637, 0, "Fabulae Syrae: two stories read in Latin"],
    [668402257, 0, "LibriVox: Vergil's Aeneid read in Latin"],
    [668359366, 0, "LibriVox: Caesar's Gallic War read in Latin"],
    [736314030, 0, "LibriVox: Augustine's Confessions read in Latin"],
    [668403113, 0, "LibriVox: Lucretius, De Rerum Natura, read in Latin"],
    [668270708, 0, "LibriVox: Seneca's letters read in Latin"],
    [668463641, 0, "LibriVox: Vergil's Georgics read in Latin"],
    [717653419, 0, "LibriVox: Cato, De Agricultura, read in Latin"],
  ],
};
const STORE = { ceb: "ph", la: "us" };
// The Apple stores whose ratings are added up (the Philippines' and its neighbours' for Bisaya; for Latin, the
// stores its listeners rate in: the others gave nothing).
const RATING_STORES = {
  ceb: ["ph", "us", "ae", "sa", "gb", "ca", "au", "jp", "kr", "sg"],
  la: ["us", "gb", "de", "it", "ca", "au", "es", "fr", "nl", "fi"],
};
// Apple's main podcast headings (as in web/js/trending.js).
const MAIN = ["Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness", "History",
  "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture", "Sports",
  "TV & Film", "Technology", "True Crime"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const squeeze = (s, max) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);

async function appleRatings(id, lang) {
  let total = 0;
  for (const store of RATING_STORES[lang]) {
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

// Only the languages named on the command line (default: all); the others are kept from the file as it is.
const only = process.argv.slice(2);
const { PICKS: before = {}, PICKS_MEASURED_BY: measuredBefore = {} } = only.length ? await import(pathToFileURL(OUT).href) : {};
const out = {};
const measured = {};
for (const lang of Object.keys(SHOWS)) {
  if (only.length && !only.includes(lang)) { out[lang] = before[lang] || []; measured[lang] = measuredBefore[lang] || MEASURED[lang]; }
}
for (const [lang, shows] of Object.entries(SHOWS)) {
  if (only.length && !only.includes(lang)) continue;
  measured[lang] = MEASURED[lang];
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
    const apple = await appleRatings(id, lang);
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

const ordered = Object.fromEntries(Object.keys(SHOWS).map((lang) => [lang, out[lang]]));
const body = `// Made by tools/build_podcast_picks.mjs: don't edit by hand, run the tool again.
// Podcasts for languages none of whose podcasts reach the charts, most-rated first (listener ratings on
// Spotify and Apple Podcasts together). Used by trending.js.

/** When each language's shows were measured. */
export const PICKS_MEASURED_BY = ${JSON.stringify(Object.fromEntries(Object.keys(SHOWS).map((l) => [l, measured[l]])))};

export const PICKS = ${JSON.stringify(ordered, null, 2)};
`;
fs.writeFileSync(OUT, body.replace(/\r\n/g, "\n"));
console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.entries(ordered).map(([l, v]) => `${l} ${v.length}`).join(", ")}`);
