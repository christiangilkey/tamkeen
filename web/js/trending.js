// Trending podcasts: the pure parts (no page, no app imports), unit-tested in
// tests/js/trending.test.mjs. The screen itself is pages/discover.js.

// A podcast's feed names its own language, often with a country ("ar-sa", "es-mx"), and the
// directory matches those names exactly. So for each language the app teaches we ask for the
// plain code and its common spellings.
const VARIANTS = {
  ar: ["ar", "ara", "ar-sa", "ar-eg", "ar-ae", "ar-jo", "ar-lb", "ar-sy", "ar-iq", "ar-kw", "ar-qa", "ar-bh", "ar-om",
       "ar-ye", "ar-ma", "ar-dz", "ar-tn", "ar-ly", "ar-sd", "ar-ps"],
  es: ["es", "spa", "es-es", "es-mx", "es-ar", "es-co", "es-cl", "es-pe", "es-us", "es-419", "es-ve", "es-ec", "es-uy",
       "es-pr", "es-do", "es-gt", "es-cr", "es-bo", "es-py", "es-pa", "es-sv", "es-hn", "es-ni"],
  fr: ["fr", "fra", "fre", "fr-fr", "fr-ca", "fr-be", "fr-ch", "fr-lu", "fr-ma", "fr-sn"],
  ja: ["ja", "jpn", "ja-jp", "jp"],
  zh: ["zh", "zho", "chi", "cmn", "zh-cn", "zh-tw", "zh-hk", "zh-sg", "zh-hans", "zh-hant", "zh-hans-cn", "zh-hant-tw"],
  ru: ["ru", "rus", "ru-ru"],
};

/** The `lang` value to ask the directory for: every usual spelling of one language. */
export function languageQuery(code) {
  return (VARIANTS[code] || [code]).join(",");
}

/** A feed address reduced to what makes it the same feed (no http/https, "www.", or final slash). */
export function feedKey(url) {
  return String(url || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

export const OTHER = "Other";

/**
 * Sort podcasts into their categories. A podcast appears under each of its categories (most
 * have two or three). Returns [{name, feeds}], the fullest category first; podcasts keep the
 * order they came in (most trending first).
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
