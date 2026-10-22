// Where YouTube opens: "Popular now", a page full of what is popular right now in the language
// being studied, or one of the TOPICS further down (the menu in the Library's add sheet). Pure (no
// page, no imports from the app), so it is unit-tested and serves every version.
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
// "Popular in" list under the topics); the choice is remembered on this device and used by every topic.
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
  it: ["che", "IT", "it", 0],
  tl: ["ang", "PH", "fil", 0],
  pt: ["não", "BR", "pt-BR", 0],
  ca: ["amb", "ES", "ca", 0],
  ceb: ["kaayo", "PH", "fil", 0],  // (YouTube has no Bisaya interface: Filipino is the nearest)
  th: ["ที่", "TH", "th", 0],
  hi: ["है", "IN", "hi", 0], // ("is": every one of the top 20 titles in Devanagari, checked 2026-10-21)
  en: ["the", "US", "en", 0],
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
  it: [["IT", "Italy"], ["CH", "Switzerland"]],
  tl: [["PH", "Philippines"]],
  pt: [["BR", "Brazil"], ["PT", "Portugal"], ["AO", "Angola"], ["MZ", "Mozambique"]],
  ca: [["ES", "Spain"], ["AD", "Andorra"], ["FR", "France"]],
  ceb: [["PH", "Philippines"]],
  th: [["TH", "Thailand"]],
  hi: [["IN", "India"]],
  en: [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IE", "Ireland"],
       ["NZ", "New Zealand"], ["IN", "India"], ["NG", "Nigeria"], ["ZA", "South Africa"], ["PH", "Philippines"]],
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

// "Only videos with handmade subtitles": YouTube's own Subtitles/CC search filter, which keeps the
// videos whose captions a person wrote and uploaded, and leaves out those with only YouTube's automatic
// ones (often wrong, and with no punctuation). Off unless chosen; remembered on this device.
const HANDMADE_KEY = "ytHandmadeCaptions";
export function handmadeOnly() {
  try { return localStorage.getItem(HANDMADE_KEY) === "1"; } catch { return false; }
}
export function setHandmadeOnly(on) {
  try { localStorage.setItem(HANDMADE_KEY, on ? "1" : "0"); } catch { /* storage unavailable */ }
}

const SORT_BY_VIEWS = 3;
// YouTube's "Upload date" filter: 3 this week, 4 this month, 5 this year.
export const THIS_WEEK = 3;
export const THIS_MONTH = 4;
export const THIS_YEAR = 5;
const VIDEOS_ONLY = 1;
const SUBTITLES = 0x28; // the filters' field 5, "Subtitles/CC"

/** YouTube's search-filter code (its "sp" value): most viewed, uploaded this week (or `within`
 * THIS_MONTH / THIS_YEAR), videos only, optionally a length, and optionally only videos with
 * handmade subtitles. It is a few numbered fields packed together and written in base64. */
export function filterCode(length = 0, { handmade = false, within = THIS_WEEK } = {}) {
  const filters = [0x08, within, 0x10, VIDEOS_ONLY, ...(length ? [0x18, length] : []), ...(handmade ? [SUBTITLES, 1] : [])];
  const bytes = [0x08, SORT_BY_VIEWS, 0x12, filters.length, ...filters];
  return btoa(String.fromCharCode(...bytes));
}

/** The filter code for an ordinary search (most relevant first): only handmade subtitles, or none. */
export const searchFilterCode = (handmade) => (handmade ? btoa(String.fromCharCode(0x12, 2, SUBTITLES, 1)) : "");

/**
 * The address "Open YouTube" should open for a study language.
 * @param {string} lang one of the app's language codes
 * @param {{mobile?: boolean, country?: string, handmade?: boolean}} [opts] the phone uses YouTube's
 *   phone site; `country` is the user's choice from COUNTRIES (anything else falls back to the usual
 *   one); `handmade`: only videos whose subtitles a person made (handmadeOnly())
 */
export function youtubeHome(lang, { mobile = false, country = "", handmade = false } = {}) {
  const site = mobile ? "https://m.youtube.com" : "https://www.youtube.com";
  const start = START[lang];
  if (!start) return `${site}/`;
  const [word, , language, length] = start;
  const gl = countryFor(lang, country);
  const own = (COUNTRIES[lang] || []).find(([c]) => c === gl);
  const q = new URLSearchParams({
    search_query: (own && own[2]) || word, sp: filterCode(length, { handmade }),
    gl, hl: language, persist_gl: "1", persist_hl: "1", // remembered, so going back or reloading keeps them
  });
  return `${site}/results?${q}`;
}

// ---------------------------------------------------------------------------------------------
// Topics: the menu YouTube opens from in the Library's add sheet (components/addsheet.js) and on
// the web app's YouTube page. "Popular now" is the start search above. Every other topic is the
// same kind of search with the topic's words written IN the language being studied (TOPIC_WORDS):
// most watched first, uploaded this month (lessons: this year, as there are fewer and they keep),
// with the same country and language hints. Words in the language, not in English, so the videos
// are in the language: YouTube matches the words in titles, and an English word ("vlog", "podcast")
// is paired with one of the language's own where it is the word people actually use.
//
// To tune a topic for a language, change its words in TOPIC_WORDS; a language may leave a topic
// out (it then isn't offered). `label` is interface text (translated like the rest of the app);
// "Learn {0}" gets the language's name.

export const TOPICS = [
  { key: "popular", label: "Popular now", icon: "trending" },
  { key: "news", label: "News", icon: "news" },
  { key: "music", label: "Music", icon: "music" },
  { key: "comedy", label: "Comedy", icon: "smile" },
  { key: "food", label: "Food & cooking", icon: "food" },
  { key: "travel", label: "Travel", icon: "travel" },
  { key: "sport", label: "Sport", icon: "sport" },
  { key: "science", label: "Science & tech", icon: "science" },
  { key: "gaming", label: "Gaming", icon: "game" },
  { key: "kids", label: "Kids & cartoons", icon: "kids" },
  { key: "vlog", label: "Vlogs & daily life", icon: "vlog" },
  { key: "podcast", label: "Podcasts & interviews", icon: "podcast" },
  { key: "learn", label: "Learn {0}", icon: "learn", within: THIS_YEAR },
];

/** Each topic's search words in each study language (search data for YouTube, not interface text). */
export const TOPIC_WORDS = {
  ar: { news: "أخبار", music: "أغنية", comedy: "كوميدي", food: "طبخ", travel: "سفر", sport: "رياضة",
        science: "علوم وتقنية", gaming: "ألعاب فيديو", kids: "كرتون أطفال", vlog: "فلوق", podcast: "بودكاست",
        learn: "تعلم العربية لغير الناطقين بها" },
  es: { news: "noticias", music: "música", comedy: "comedia", food: "recetas de cocina", travel: "viajes", sport: "deportes",
        science: "ciencia y tecnología", gaming: "videojuegos", kids: "dibujos animados", vlog: "vlog en español",
        podcast: "podcast en español", learn: "español para extranjeros" },
  fr: { news: "actualités", music: "musique", comedy: "humoriste", food: "recette de cuisine", travel: "voyage", sport: "sport",
        science: "science et technologie", gaming: "jeux vidéo", kids: "dessin animé", vlog: "vlog en français",
        podcast: "podcast en français", learn: "français langue étrangère" },
  ja: { news: "ニュース", music: "音楽", comedy: "お笑い", food: "料理", travel: "旅行", sport: "スポーツ",
        science: "科学 テクノロジー", gaming: "ゲーム実況", kids: "子供向けアニメ", vlog: "日常 vlog", podcast: "ポッドキャスト",
        learn: "やさしい日本語" },
  zh: { news: "新闻", music: "音乐", comedy: "搞笑", food: "做菜", travel: "旅游", sport: "体育", science: "科技",
        gaming: "游戏实况", kids: "儿童动画", vlog: "vlog 日常", podcast: "播客", learn: "慢速中文" },
  ru: { news: "новости", music: "музыка", comedy: "юмор", food: "рецепты", travel: "путешествия", sport: "спорт",
        science: "наука и технологии", gaming: "прохождение игры", kids: "мультфильмы", vlog: "влог", podcast: "подкаст",
        learn: "русский язык для иностранцев" },
  it: { news: "notizie", music: "musica", comedy: "comici italiani", food: "ricetta", travel: "viaggio", sport: "sport",
        science: "scienza e tecnologia", gaming: "videogiochi", kids: "cartoni animati", vlog: "vlog in italiano",
        podcast: "podcast italiano", learn: "italiano per stranieri" },
  tl: { news: "balita", music: "OPM kanta", comedy: "nakakatawa", food: "lutong bahay", travel: "pasyalan", sport: "balitang sports",
        science: "agham at teknolohiya", gaming: "gameplay tagalog", kids: "kwentong pambata", vlog: "vlog tagalog",
        podcast: "podcast tagalog", learn: "aralin sa Filipino" },
  pt: { news: "notícias", music: "música", comedy: "humor", food: "receita", travel: "viagem", sport: "esportes",
        science: "ciência e tecnologia", gaming: "jogando", kids: "desenho animado", vlog: "vlog rotina",
        podcast: "podcast brasileiro", learn: "português para estrangeiros" },
  ca: { news: "notícies", music: "música en català", comedy: "humor en català", food: "receptes de cuina", travel: "viatge",
        sport: "futbol en català", science: "ciència i tecnologia", gaming: "videojocs", kids: "dibuixos animats",
        vlog: "vlog en català", podcast: "podcast en català", learn: "curs de català" },
  // Bisaya has little on YouTube: searched over a year (TOPIC_WITHIN), and travel, sport, gaming and
  // science are left out, as their searches came back in Tagalog or English (checked 2026-10-21).
  ceb: { news: "balita karon", music: "kantang bisaya", comedy: "kataw-anan bisaya", food: "lutong bisaya",
         kids: "kanta pambata bisaya", vlog: "bisaya vlog", podcast: "podcast bisaya", learn: "learn bisaya" },
  th: { news: "ข่าว", music: "เพลง", comedy: "ตลก", food: "ทำอาหาร", travel: "เที่ยว", sport: "กีฬา",
        science: "วิทยาศาสตร์ เทคโนโลยี", gaming: "เล่นเกม", kids: "การ์ตูน", vlog: "vlog ชีวิตประจำวัน", podcast: "พอดแคสต์",
        learn: "ภาษาไทย สำหรับชาวต่างชาติ" },
  // Hindi (checked against YouTube's results on 2026-10-21, by the channels as well as the titles: with the hl
  // hint YouTube translates other videos' titles into Hindi, so "व्लॉग" alone brought PewDiePie and Kylie Jenner,
  // "खेल समाचार" NBC's Premier League, "हास्य" Marathi and Maithili shows; Bollywood songs are titled in Latin
  // letters, so "हिंदी गाने" finds Hindi songs with few Devanagari titles; the lessons are mostly for Indian children)
  hi: { news: "हिंदी समाचार", music: "हिंदी गाने", comedy: "कॉमेडी वीडियो", food: "खाना बनाने की विधि", travel: "घूमने की जगह",
        sport: "क्रिकेट", science: "विज्ञान", gaming: "गेमिंग", kids: "बच्चों की कहानियाँ", vlog: "daily vlog हिंदी",
        podcast: "हिंदी पॉडकास्ट", learn: "हिंदी सीखें" },
  en: { news: "news", music: "music", comedy: "comedy", food: "cooking", travel: "travel", sport: "sports",
        science: "science and technology", gaming: "gaming", kids: "cartoons for kids", vlog: "vlog", podcast: "podcast",
        learn: "English listening practice" },
};

/** How far back a language's topics look when it has few videos (otherwise this month). */
export const TOPIC_WITHIN = { ceb: THIS_YEAR };

/** The topics offered for a language: Popular now, then each topic it has words for. */
export function topicsFor(lang) {
  if (!START[lang]) return [];
  const words = TOPIC_WORDS[lang] || {};
  return TOPICS.filter((t) => t.key === "popular" || words[t.key]);
}

/**
 * The address a topic opens on, for a study language (same options as youtubeHome). "popular",
 * or a topic the language has no words for, is youtubeHome itself.
 */
export function topicAddress(lang, key, { mobile = false, country = "", handmade = false } = {}) {
  const topic = TOPICS.find((t) => t.key === key);
  const words = (TOPIC_WORDS[lang] || {})[key];
  const start = START[lang];
  if (!topic || key === "popular" || !words || !start) return youtubeHome(lang, { mobile, country, handmade });
  const [, , language, length] = start;
  const q = new URLSearchParams({
    search_query: words, sp: filterCode(length, { handmade, within: topic.within || TOPIC_WITHIN[lang] || THIS_MONTH }),
    gl: countryFor(lang, country), hl: language, persist_gl: "1", persist_hl: "1",
  });
  return `${mobile ? "https://m.youtube.com" : "https://www.youtube.com"}/results?${q}`;
}

/** YouTube's own search for what the user typed (most relevant first), with the same hints; with
 * nothing typed, YouTube's front page. */
export function searchAddress(lang, words, { mobile = false, country = "", handmade = false } = {}) {
  const site = mobile ? "https://m.youtube.com" : "https://www.youtube.com";
  const text = String(words || "").trim();
  if (!text) return `${site}/`;
  const q = new URLSearchParams({ search_query: text });
  const sp = searchFilterCode(handmade);
  if (sp) q.set("sp", sp);
  const start = START[lang];
  if (start) { q.set("gl", countryFor(lang, country)); q.set("hl", start[2]); }
  return `${site}/results?${q}`;
}
