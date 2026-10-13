// Where "Open YouTube" starts: a page full of what is popular right now in the language being
// studied. Pure (no page, no imports from the app), so it is unit-tested and serves both apps.
//
// YouTube closed its own Trending page in 2025, and a signed-out YouTube home page is empty
// ("Try searching to get started"). So the start page is a YouTube search set up to behave like
// a trending list: videos uploaded this week, most watched first, matching one very common
// word of the language (so nearly everything in that language qualifies), with YouTube told
// which country to favour and to show titles in that language rather than translated.
//
// To tune a language, edit START below: [search word, country, YouTube's language code, length].
// "length" is YouTube's length filter (1 short, 2 long, 3 medium) or 0 for any length; Japanese
// uses medium because its weekly top is otherwise crowded with 15-second adverts.
// The country in START is only the one used until the user picks another from COUNTRIES (the
// "Popular in" list under the Open YouTube button); the choice is remembered on this device.
//
// What a country changes. A most-watched list is decided by the language, not the country:
// measured on 2026-10-12, telling YouTube "Egypt" or "Morocco" instead of "Saudi Arabia" left 19
// of the 20 videos the same. So where a country has a word of its own that the others don't use
// (Arabic dialects: Egyptian "عشان", Moroccan "ديال", Levantine "هيك"), that word replaces the
// general one and the list really is that country's. Countries without such a word only tell
// YouTube where the viewer is, which shapes its later searches and suggestions more than this
// first page. (Country NAMES were tried as the word and rejected: YouTube also matches the name
// in other languages, so "Québec" or "新加坡" bring English videos.)

export const START = {
  ar: ["في", "SA", "ar", 0],
  es: ["el", "MX", "es", 0],
  fr: ["avec", "FR", "fr", 0],
  ja: ["の", "JP", "ja", 3],
  zh: ["的", "TW", "zh-CN", 0],
  ru: ["это", "RU", "ru", 0],
};

/** Countries offered for each language: [YouTube's country code, name, a search word of its own
 * if it has one], the usual country first. */
export const COUNTRIES = {
  ar: [["SA", "Saudi Arabia"], ["EG", "Egypt", "عشان"], ["MA", "Morocco", "ديال"], ["LB", "Lebanon", "هيك"],
       ["JO", "Jordan", "هيك"], ["AE", "United Arab Emirates"], ["DZ", "Algeria"], ["IQ", "Iraq"], ["KW", "Kuwait"],
       ["LY", "Libya"], ["OM", "Oman"], ["QA", "Qatar"], ["TN", "Tunisia"], ["BH", "Bahrain"], ["YE", "Yemen"]],
  es: [["MX", "Mexico"], ["ES", "Spain"], ["AR", "Argentina"], ["CO", "Colombia"], ["CL", "Chile"], ["PE", "Peru"],
       ["US", "United States"], ["VE", "Venezuela"], ["EC", "Ecuador"], ["GT", "Guatemala"], ["DO", "Dominican Republic"],
       ["BO", "Bolivia"], ["CR", "Costa Rica"], ["UY", "Uruguay"], ["PY", "Paraguay"], ["PA", "Panama"],
       ["HN", "Honduras"], ["SV", "El Salvador"], ["NI", "Nicaragua"], ["PR", "Puerto Rico"]],
  fr: [["FR", "France"], ["BE", "Belgium"], ["CA", "Canada"], ["CH", "Switzerland"], ["SN", "Senegal"],
       ["MA", "Morocco"], ["DZ", "Algeria"], ["TN", "Tunisia"]],
  ja: [["JP", "Japan"]],
  zh: [["TW", "Taiwan"], ["HK", "Hong Kong"], ["SG", "Singapore"], ["MY", "Malaysia"]],
  ru: [["RU", "Russia"], ["KZ", "Kazakhstan"], ["BY", "Belarus"], ["UA", "Ukraine"]],
};

/** The country to use: the chosen one if it is on the language's list, else the usual one. */
export function countryFor(lang, chosen) {
  const start = START[lang];
  if (!start) return "";
  const code = String(chosen || "").toUpperCase();
  return (COUNTRIES[lang] || []).some(([c]) => c === code) ? code : start[1];
}

const storeKey = (lang) => `ytCountry:${lang}`;
/** The country the user picked for this language on this device (the usual one if they never picked). */
export function chosenCountry(lang) {
  try { return countryFor(lang, localStorage.getItem(storeKey(lang))); } catch { return countryFor(lang, ""); }
}
export function chooseCountry(lang, code) {
  try { localStorage.setItem(storeKey(lang), countryFor(lang, code)); } catch { /* storage unavailable */ }
}

const SORT_BY_VIEWS = 3;
const THIS_WEEK = 3;
const VIDEOS_ONLY = 1;

/** YouTube's search-filter code (its "sp" value): most viewed, uploaded this week, videos only,
 * and optionally a length. It is a few numbered fields packed together and written in base64. */
export function filterCode(length = 0) {
  const filters = [0x08, THIS_WEEK, 0x10, VIDEOS_ONLY, ...(length ? [0x18, length] : [])];
  const bytes = [0x08, SORT_BY_VIEWS, 0x12, filters.length, ...filters];
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The address "Open YouTube" should open for a study language.
 * @param {string} lang one of the app's language codes
 * @param {{mobile?: boolean, country?: string}} [opts] the phone uses YouTube's phone site;
 *   `country` is the user's choice from COUNTRIES (anything else falls back to the usual one)
 */
export function youtubeHome(lang, { mobile = false, country = "" } = {}) {
  const site = mobile ? "https://m.youtube.com" : "https://www.youtube.com";
  const start = START[lang];
  if (!start) return `${site}/`;
  const [word, , language, length] = start;
  const gl = countryFor(lang, country);
  const own = (COUNTRIES[lang] || []).find(([c]) => c === gl);
  const q = new URLSearchParams({
    search_query: (own && own[2]) || word, sp: filterCode(length),
    gl, hl: language, persist_gl: "1", persist_hl: "1", // remembered, so going back or reloading keeps them
  });
  return `${site}/results?${q}`;
}
