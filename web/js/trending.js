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
// Four languages need more than a country's top 200:
//   Catalan  Spain's overall chart holds only a handful of Catalan podcasts, so its 19 category
//            charts are read too (CATEGORY_CHARTS): still ranked by listeners, and 100+ Catalan shows.
//   Tagalog  the Philippines' overall chart is mostly English (about 14 Tagalog shows); with its
//            category charts about 40 (checked 2026-10-18).
//   Thai     Thailand's overall chart gives about 90 Thai shows; with its category charts about 300.
//   Bisaya   no Bisaya podcast reaches Apple's or Spotify's charts in the Philippines (checked
//            2026-10-18: Apple's top 200 and all 19 category charts, Spotify's top 100). Its list is
//            the Bisaya podcasts with a public feed, most-rated first on Spotify and Apple together
//            (./podcast-picks.js, made by tools/build_podcast_picks.mjs), after any that do chart.

import { PICKS } from "./podcast-picks.js";
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
  pt: ["br"],
  ca: ["es"],
  ceb: ["ph"],
  th: ["th"],
  en: ["us", "gb", "au", "ca"],
};
/** Languages whose countries' 19 category charts are read as well as the overall chart. */
export const CATEGORY_CHARTS = new Set(["ca", "tl", "th"]);
/** Apple's ids for its 19 main podcast headings (the category charts). */
export const CATEGORY_IDS = [1301, 1321, 1303, 1304, 1483, 1511, 1512, 1487, 1305, 1502, 1310, 1489, 1314, 1533, 1324,
  1545, 1309, 1318, 1488];
/** Languages whose list comes (also) from PICKS: no podcast in them is on the charts. */
export const hasPicks = (lang) => Object.prototype.hasOwnProperty.call(PICKS, lang);
export const COUNTRY_NAMES = {
  sa: "Saudi Arabia", eg: "Egypt", ae: "the UAE", ma: "Morocco", es: "Spain", mx: "Mexico", ar: "Argentina", co: "Colombia",
  fr: "France", be: "Belgium", jp: "Japan", cn: "China", tw: "Taiwan", ru: "Russia", it: "Italy", ch: "Switzerland",
  ph: "the Philippines", us: "the United States", gb: "the United Kingdom", au: "Australia", ca: "Canada",
  br: "Brazil", th: "Thailand",
};
/** Apple's main podcast headings. */
export const MAIN_CATEGORIES = ["Arts", "Business", "Comedy", "Education", "Fiction", "Government", "Health & Fitness",
  "History", "Kids & Family", "Leisure", "Music", "News", "Religion & Spirituality", "Science", "Society & Culture",
  "Sports", "TV & Film", "Technology", "True Crime"];
const CHART_SIZE = 200;   // the most Apple gives per chart
const LOOKUP_BATCH = 150; // podcasts asked about per lookup request
const MAX_FEEDS = 300;

export const chartUrl = (country, category = 0) =>
  `https://itunes.apple.com/${country}/rss/toppodcasts/limit=${CHART_SIZE}${category ? `/genre=${category}` : ""}/json?l=en`;
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

const SCRIPTS = { ar: /[؀-ۿ]/, ru: /[Ѐ-ӿ]/, ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/, th: /[\u0E00-\u0E7F]/ };
// Letters of scripts other than the Latin one: a show written mostly in them isn't Spanish or Tagalog
// (the Philippines' and Spain's charts hold Chinese and Japanese shows too).
const NOT_LATIN = /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ฀-๿぀-ヿ㐀-鿿가-힯]/g;
const LATIN = /[A-Za-zÀ-ɏ]/g;
// Persian is written in Arabic letters, and Persian shows turn up in the Gulf's charts: it has letters
// Arabic doesn't (پ چ ژ گ) and little words of its own.
const PERSIAN = { letters: /[پچژگ]/g, words: ["این", "که", "را", "است", "می", "های", "برای", "از", "با", "یک", "پادکست", "شما"] };
const ARABIC_WORDS = ["في", "من", "على", "إلى", "عن", "مع", "هذا", "هذه", "التي", "الذي", "كل", "هو", "هي", "بودكاست", "لا", "و", "أن"];
// A few of the commonest little words, enough to tell Spanish or French from English.
const LITTLE_WORDS = {
  es: ["el", "la", "los", "las", "de", "del", "que", "y", "en", "un", "una", "con", "por", "para", "más", "tu", "sobre"],
  fr: ["le", "la", "les", "des", "du", "et", "un", "une", "en", "pour", "avec", "est", "sur", "dans", "vous", "qui", "au"],
  it: ["il", "lo", "la", "gli", "le", "di", "del", "della", "che", "e", "un", "una", "con", "per", "sono", "nel", "sulla"],
  tl: ["ang", "ng", "mga", "sa", "na", "at", "ay", "si", "kung", "ito", "hindi", "para", "ko", "mo", "natin", "tayo", "kayo"],
  pt: ["o", "os", "as", "de", "do", "da", "dos", "das", "que", "e", "em", "um", "uma", "com", "no", "na", "não", "você", "mais",
       "para", "seu"],
  ca: ["el", "la", "els", "les", "de", "del", "que", "i", "en", "un", "una", "amb", "per", "és", "dels", "als", "al", "més", "aquest"],
  ceb: ["ang", "sa", "nga", "ug", "og", "mga", "kay", "dili", "kini", "ni", "usa", "naa", "wala", "man", "pud", "sab", "kaayo",
        "nato", "bisaya", "binisaya"],
  en: ["the", "and", "of", "to", "with", "is", "for", "in", "on", "your", "from", "that", "this", "you", "about", "we"],
};
// Languages that share most of their little words with a neighbour (Catalan, Spanish, Portuguese, French
// and Italian; Bisaya and Tagalog) are told apart by words and letters only one of them uses.
const OWN = {
  ca: { words: ["i", "els", "amb", "per", "és", "dels", "als", "aquest", "aquesta", "més", "pel", "també", "però", "molt", "seva",
                "seu", "fins", "cada", "nostra", "nostre"], letters: /[àèòçï]|l·l/g },
  es: { words: ["y", "los", "las", "con", "por", "para", "más", "es", "está", "pero", "muy", "también", "nuestro", "nuestra",
                "su", "sus", "cómo"], letters: /[ñ¿¡]/g },
  // ("dos" is also Spanish for two; ç is Catalan and French too, and Portuguese's -ção already shows by its ã;
  // ê is French too, but "você" would otherwise count for French alone)
  pt: { words: ["o", "os", "do", "da", "das", "e", "em", "um", "não", "você", "são", "também", "seu", "sua", "pra"],
        letters: /[ãõê]/g },
  it: { words: ["il", "gli", "di", "della", "dello", "delle", "degli", "che", "sono", "nel", "nella", "sulla", "alla", "non",
                "questo", "questa", "anche", "più", "perché", "ogni", "tra"], letters: null },
  ceb: { words: ["ug", "og", "nga", "dili", "kini", "kana", "naa", "kaayo", "pud", "sab", "usab", "nato", "unsa", "asa", "karon",
                 "gyud", "jud", "mao", "bitaw", "nimo", "nako", "imong", "akong", "bisaya", "binisaya"], letters: null },
  tl: { words: ["ng", "at", "ay", "hindi", "ito", "natin", "tayo", "kayo", "po", "naman", "yung", "talaga", "din", "rin", "nang",
                "kasi", "paano", "bakit"], letters: null },
  fr: { words: ["le", "et", "des", "du", "une", "est", "pour", "avec", "dans", "sur", "vous", "qui", "au", "aux", "ses", "ce",
                "cette", "pas", "plus", "très", "où"], letters: /[œêâîûëù]/g },
};
// The charts of Belgium and Switzerland, and Spain's category charts, mix in shows from all over Europe;
// these are told apart too.
const OTHER_LITTLE_WORDS = {
  de: ["der", "die", "das", "und", "ist", "mit", "von", "nicht", "ein", "eine", "auf", "für", "ich", "wir", "sie", "zu", "über",
       "den", "dem", "im", "auch", "wie"],
  nl: ["het", "een", "van", "is", "met", "op", "voor", "niet", "dat", "zijn", "wij", "je", "ik", "naar", "over", "ook", "elke",
       "wat", "bij", "nog", "deze", "maar"],
  // (and the Philippines' category charts, shows from India, Vietnam and the Czech Republic)
  hi: ["hai", "ke", "ki", "ka", "se", "mein", "aur", "kar", "kya", "nahi", "bhi", "ek", "sakte", "hain", "apne", "kaise"],
  vi: ["và", "của", "các", "những", "là", "cho", "trong", "được", "với", "có", "này", "một", "người", "không", "nhất"],
  cs: ["je", "se", "že", "pro", "jsou", "jak", "ve", "si", "jsme", "nebo", "vás", "ale", "také"],
  sv: ["och", "är", "att", "det", "som", "på", "med", "för", "av", "inte", "jag", "vi", "om", "till", "ett", "har"],
  no: ["og", "er", "at", "det", "som", "på", "med", "for", "av", "ikke", "jeg", "vi", "om", "til", "et", "har"],
};
const ALL_LITTLE_WORDS = { ...LITTLE_WORDS, ...OTHER_LITTLE_WORDS };
// Close neighbours, told apart by OWN rather than by the little words they share.
const FAMILIES = [["es", "pt", "ca", "fr", "it"], ["tl", "ceb"]];
const familyOf = (lang) => FAMILIES.find((f) => f.includes(lang)) || [lang];
// Languages that are the smaller one in their countries' charts: a podcast must show more of the language
// than of each neighbour (and at least two signs of it); for the others a tie is enough. (Catalan's
// accents are shared with French, whose shows turn up in Spain's category charts.)
const STRICT = new Set(["ca", "ceb"]);
// Languages whose first country's chart is mostly in them: there, a show with nothing to judge it by
// (a name of a few words and no description) is taken to be in the language.
const HOME_CHART = new Set(["es", "fr", "it", "pt", "en"]);
const count = (words, list) => words.reduce((n, w) => n + (list.includes(w) ? 1 : 0), 0);
const ownCount = (text, words, lang) => count(words, OWN[lang].words) + (OWN[lang].letters ? (text.match(OWN[lang].letters) || []).length : 0);

/** Is this podcast (judged by its name, maker and description) in the language being studied?
 * Charts in the UAE or Belgium, say, hold plenty of podcasts in other languages. `home`: the podcast is
 * from the chart of the language's own main country, where a show with nothing to judge it by is kept. */
export function inLanguage(item, lang, home = false) {
  const text = `${item.title} ${item.author} ${item.description}`;
  if (SCRIPTS[lang]) {
    if (!SCRIPTS[lang].test(text)) return false;
    if (lang !== "ar") return true;
    const words = text.split(/[^\p{L}\p{M}]+/u);
    return count(words, PERSIAN.words) + (text.match(PERSIAN.letters) || []).length <= count(words, ARABIC_WORDS);
  }
  const own = LITTLE_WORDS[lang];
  if (!own) return true;
  if ((text.match(NOT_LATIN) || []).length > (text.match(LATIN) || []).length) return false;
  const lower = text.toLowerCase();
  const words = lower.split(/[^\p{L}·]+/u).filter(Boolean); // (Catalan's il·lustre is one word, not Italian "il")
  const mine = count(words, own);
  if (!mine) {
    return home && HOME_CHART.has(lang) && new Set(words).size <= 6 && !Object.values(ALL_LITTLE_WORDS).some((list) => count(words, list));
  }
  // Tagalog's commonest words are short ones other languages have too ("at", "na", "ko"): one isn't enough.
  if (lang === "tl" && mine < 2) return false;
  // More of its little words than of any language outside its family (English, German, Dutch…).
  const family = familyOf(lang);
  if (Object.entries(ALL_LITTLE_WORDS).some(([other, list]) => !family.includes(other) && count(words, list) > mine)) return false;
  // Within the family, at least as many of its own words and letters as of each neighbour's.
  const neighbours = family.filter((other) => other !== lang && OWN[other]);
  if (!neighbours.length || !OWN[lang]) return true;
  const strict = STRICT.has(lang);
  const signs = ownCount(lower, words, lang);
  if (strict && signs < 2) return false;
  return neighbours.every((other) => (strict ? signs > ownCount(lower, words, other) : signs >= ownCount(lower, words, other)));
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
  const wanted = countries.flatMap((country) => [[country, 0],
    ...(CATEGORY_CHARTS.has(lang) ? CATEGORY_IDS.map((category) => [country, category]) : [])]);
  const charts = (await Promise.all(wanted.map(async ([country, category]) => {
    const home = country === countries[0];
    try { return [country, parseChart(await getJson(chartUrl(country, category))).filter((item) => inLanguage(item, lang, home))]; }
    catch { return null; } // one country's chart being unavailable shouldn't empty the page
  }))).filter(Boolean);
  const picks = hasPicks(lang) ? PICKS[lang] : [];
  if (!charts.length && !picks.length) throw new Error("Couldn't reach Apple's podcast charts. Check your connection and try again.");
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
  if (merged.length && !details.size && !picks.length) throw new Error("Couldn't reach Apple's podcast directory. Check your connection and try again.");

  const feeds = [];
  const shows = new Set(); // a show Apple lists twice (once per country store) is shown once
  for (const item of merged) {
    const d = details.get(item.id);
    const url = d && String(d.feedUrl || "").trim();
    if (!url || !/^https?:\/\//.test(url)) continue; // no public feed (Apple-only shows)
    const show = `${item.title}\n${item.author}`.toLowerCase();
    if (shows.has(show) || shows.has(feedKey(url))) continue;
    shows.add(show).add(feedKey(url));
    const category = mainCategory(item, d);
    const categories = category ? [category] : [];
    feeds.push({ id: item.id, url, title: item.title, author: item.author, description: item.description, image: item.image,
                 categories, score: item.score });
  }
  // Then the picks (below anything that charts), most-rated first, each once.
  const have = new Set(feeds.flatMap((f) => [f.id, feedKey(f.url)]));
  for (const p of picks) {
    if (have.has(String(p.id)) || have.has(feedKey(p.url))) continue;
    feeds.push({ id: String(p.id), url: p.url, title: p.title, author: p.author, description: p.description, image: p.image,
                 categories: p.categories.slice(), score: 0, ratings: p.ratings });
  }
  return feeds;
}

/** The one main heading a podcast is filed under. Apple lists a podcast's narrow category first, then the
 * main heading it sits under; outside the US some headings have other names ("Sport"), so the heading is
 * found by its number when Apple gives one. */
export function mainCategory(item, d) {
  const ids = Array.isArray(d && d.genreIds) ? d.genreIds.map(Number) : [];
  const byId = ids.map((id) => CATEGORY_IDS.indexOf(id)).find((i) => i >= 0);
  if (byId !== undefined) return MAIN_CATEGORIES[byId];
  const named = [item.category, ...(Array.isArray(d && d.genres) ? d.genres.map(String) : []), squeeze(d && d.primaryGenreName, 60)]
    .map((g) => CATEGORY_ALIASES[g] || g);
  return named.find((g) => MAIN_CATEGORIES.includes(g)) || named.find((g) => g && g !== "Podcasts") || "";
}
const CATEGORY_ALIASES = { Sport: "Sports" };

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
