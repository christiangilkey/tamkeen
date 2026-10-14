// Trending podcasts, from Apple's public podcast charts (no account or key needed). Pure logic:
// no page and no imports from the app, so it is unit-tested (tests/js/trending.test.mjs) and
// runs unchanged on the computer and the phone. The caller supplies `getJson`, which fetches
// one address on itunes.apple.com and resolves to the parsed answer. The screen is
// pages/discover.js.
//
// Apple's charts are per country, not per language. So for each language the app teaches we
// read the charts of a few countries where it is spoken, keep the podcasts that are actually in
// that language, and merge them. A chart does not say where a podcast's feed lives, so the feed
// addresses come from a second request, Apple's "lookup".
//
// Each podcast is filed under ONE category: the main heading it belongs to. Apple has 19 main
// headings and about a hundred narrower ones ("Islam" inside "Religion & Spirituality"); using
// the narrow ones gives dozens of sections with two or three podcasts each.

/** Countries whose charts stand for each language, most listeners first. */
export const STOREFRONTS = {
  ar: ["sa", "eg", "ae", "ma"],
  es: ["es", "mx", "ar", "co"],
  fr: ["fr", "be"],
  ja: ["jp"],
  zh: ["cn", "tw"],
  ru: ["ru"],
  it: ["it", "ch"],
  tl: ["ph"],
};
export const COUNTRY_NAMES = {
  sa: "Saudi Arabia", eg: "Egypt", ae: "the UAE", ma: "Morocco", es: "Spain", mx: "Mexico", ar: "Argentina", co: "Colombia",
  fr: "France", be: "Belgium", jp: "Japan", cn: "China", tw: "Taiwan", ru: "Russia", it: "Italy", ch: "Switzerland",
  ph: "the Philippines",
};
/** Apple's main podcast headings. */
export const MAIN_CATEGORIES = ["Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness",
  "History", "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture",
  "Sports", "TV & Film", "Technology", "True Crime"];
const CHART_SIZE = 200;   // the most Apple gives per chart
const LOOKUP_BATCH = 150; // podcasts asked about per lookup request
const MAX_FEEDS = 300;

export const chartUrl = (country) => `https://itunes.apple.com/${country}/rss/toppodcasts/limit=${CHART_SIZE}/json?l=en`;
export const lookupUrl = (country, ids) =>
  `https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}&entity=podcast&lang=en_us`;

const squeeze = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
const label = (x) => (x && typeof x === "object" ? x.label : x) || "";

/** One country's chart → [{id, title, author, description, image, category, rank}], best first. */
export function parseChart(data) {
  let entries = data && data.feed && data.feed.entry;
  if (!entries) return [];
  if (!Array.isArray(entries)) entries = [entries]; // a chart with a single podcast isn't a list
  const out = [];
  for (const e of entries) {
    const id = e && e.id && e.id.attributes && e.id.attributes["im:id"];
    const title = squeeze(label(e && e["im:name"]), 300);
    if (!id || !title) continue;
    const images = Array.isArray(e["im:image"]) ? e["im:image"] : [];
    const image = label(images[images.length - 1]);
    out.push({
      id: String(id), title, author: squeeze(label(e["im:artist"]), 200), description: squeeze(label(e.summary), 600),
      image: String(image).startsWith("https://") ? image : null,
      category: squeeze(e.category && e.category.attributes && e.category.attributes.label, 60),
      rank: out.length,
    });
  }
  return out;
}

const SCRIPTS = { ar: /[؀-ۿ]/, ru: /[Ѐ-ӿ]/, ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/ };
// A few of the commonest little words, enough to tell Spanish or French from English.
const LITTLE_WORDS = {
  es: ["el", "la", "los", "las", "de", "del", "que", "y", "en", "un", "una", "con", "por", "para", "más", "tu", "sobre"],
  fr: ["le", "la", "les", "des", "du", "et", "un", "une", "en", "pour", "avec", "est", "sur", "dans", "vous", "qui", "au"],
  it: ["il", "lo", "la", "gli", "le", "di", "del", "della", "che", "e", "un", "una", "con", "per", "sono", "nel", "sulla"],
  tl: ["ang", "ng", "mga", "sa", "na", "at", "ay", "si", "kung", "ito", "hindi", "para", "ko", "mo", "natin", "tayo", "kayo"],
  en: ["the", "and", "of", "to", "with", "is", "for", "in", "on", "your", "from", "that", "this", "you", "about", "we"],
};
const count = (words, list) => words.reduce((n, w) => n + (list.includes(w) ? 1 : 0), 0);

/** Is this podcast (judged by its name, maker and description) in the language being studied?
 * Charts in the UAE or Belgium, say, hold plenty of podcasts in other languages. */
export function inLanguage(item, lang) {
  const text = `${item.title} ${item.author} ${item.description}`;
  if (SCRIPTS[lang]) return SCRIPTS[lang].test(text);
  const own = LITTLE_WORDS[lang];
  if (!own) return true;
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  return count(words, own) >= count(words, LITTLE_WORDS.en);
}

/** Several countries' charts ([[country, items], ...]) → one list, the most popular overall first.
 * A podcast high in several countries beats one high in a single country. */
export function mergeCharts(charts) {
  const byId = new Map();
  for (const [country, items] of charts) {
    for (const item of items) {
      const points = CHART_SIZE - item.rank;
      const seen = byId.get(item.id);
      if (seen) seen.score += points;
      else byId.set(item.id, { ...item, country, score: points });
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/**
 * Trending podcasts for a language: [{id, url, title, author, description, image, categories, score}].
 * @param {string} lang one of the app's language codes
 * @param {(url: string) => Promise<object>} getJson fetches one itunes.apple.com address
 */
export async function fetchTrending(lang, getJson) {
  const countries = STOREFRONTS[lang];
  if (!countries) throw new Error("Choose a language to study first (Settings).");
  const charts = (await Promise.all(countries.map(async (country) => {
    try { return [country, parseChart(await getJson(chartUrl(country))).filter((item) => inLanguage(item, lang))]; }
    catch { return null; } // one country's chart being unavailable shouldn't empty the page
  }))).filter(Boolean);
  if (!charts.length) throw new Error("Couldn't reach Apple's podcast charts. Check your connection and try again.");
  const merged = mergeCharts(charts).slice(0, MAX_FEEDS);

  // Where each podcast's feed lives.
  const details = new Map();
  const batches = [];
  for (const country of countries) {
    const ids = merged.filter((item) => item.country === country).map((item) => item.id);
    for (let i = 0; i < ids.length; i += LOOKUP_BATCH) batches.push([country, ids.slice(i, i + LOOKUP_BATCH)]);
  }
  await Promise.all(batches.map(async ([country, ids]) => {
    try {
      const data = await getJson(lookupUrl(country, ids));
      for (const r of (data && data.results) || []) if (r && r.collectionId) details.set(String(r.collectionId), r);
    } catch { /* these podcasts are left out this time */ }
  }));
  if (merged.length && !details.size) throw new Error("Couldn't reach Apple's podcast directory. Check your connection and try again.");

  const feeds = [];
  for (const item of merged) {
    const d = details.get(item.id);
    const url = d && String(d.feedUrl || "").trim();
    if (!url || !/^https?:\/\//.test(url)) continue; // no public feed (Apple-only shows)
    // Apple lists a podcast's narrow category first, then the main heading it sits under.
    const named = [item.category, ...(Array.isArray(d.genres) ? d.genres.map(String) : []), squeeze(d.primaryGenreName, 60)];
    const category = named.find((g) => MAIN_CATEGORIES.includes(g)) || named.find((g) => g && g !== "Podcasts");
    const categories = category ? [category] : [];
    feeds.push({ id: item.id, url, title: item.title, author: item.author, description: item.description, image: item.image,
                 categories, score: item.score });
  }
  return feeds;
}

/** A feed address reduced to what makes it the same feed (no http/https, "www.", or final slash). */
export function feedKey(url) {
  return String(url || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

export const OTHER = "Other";

/**
 * Sort podcasts into their categories (a podcast with several appears under each). Returns [{name, feeds}], the fullest category first; podcasts keep the
 * order they came in (most popular first).
 */
export function groupByCategory(feeds) {
  const groups = new Map();
  for (const feed of feeds || []) {
    const names = [...new Set((feed.categories || []).map((c) => String(c).trim()).filter(Boolean))];
    for (const name of names.length ? names : [OTHER]) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(feed);
    }
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ name, feeds: list }))
    .sort((a, b) => (a.name === OTHER) - (b.name === OTHER) || b.feeds.length - a.feeds.length || a.name.localeCompare(b.name));
}
