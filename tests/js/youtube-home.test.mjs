// Run with: node --test tests/js/
// Where "Open YouTube" starts: this week's most-watched videos in the language being studied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { START, filterCode, youtubeHome } from "../../web/js/youtube-home.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

test("the filter asks for videos from this week, most watched first", () => {
  // The same codes YouTube's own Filters menu puts in the address.
  assert.equal(filterCode(), "CAMSBAgDEAE=");
  assert.equal(filterCode(3), "CAMSBggDEAEYAw==");
});

test("only videos with handmade subtitles: YouTube's own Subtitles/CC filter, remembered on the device", async () => {
  const { handmadeOnly, searchFilterCode, setHandmadeOnly } = await import("../../web/js/youtube-home.js");
  assert.equal(filterCode(0, { handmade: true }), "CAMSBggDEAEoAQ==");
  assert.equal(filterCode(3, { handmade: true }), "CAMSCAgDEAEYAygB", "with a length too");
  assert.equal(searchFilterCode(true), "EgIoAQ==", "the code YouTube's Filters menu uses for Subtitles/CC");
  assert.equal(searchFilterCode(false), "");
  assert.equal(new URL(youtubeHome("es", { handmade: true })).searchParams.get("sp"), "CAMSBggDEAEoAQ==");
  assert.equal(new URL(youtubeHome("es")).searchParams.get("sp"), filterCode(0), "off unless chosen");
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    assert.equal(handmadeOnly(), false);
    setHandmadeOnly(true);
    assert.equal(handmadeOnly(), true);
    setHandmadeOnly(false);
    assert.equal(handmadeOnly(), false);
  } finally { delete globalThis.localStorage; }
});

test("every taught language starts on a list in that language", () => {
  for (const code of LANGUAGE_CODES) {
    assert.ok(START[code], `${code} has a start`);
    const u = new URL(youtubeHome(code));
    assert.equal(u.origin + u.pathname, "https://www.youtube.com/results");
    assert.equal(u.searchParams.get("search_query"), START[code][0]);
    assert.equal(u.searchParams.get("gl"), START[code][1]);
    assert.equal(u.searchParams.get("hl"), START[code][2], "titles are shown in the language, not translated");
    assert.equal(u.searchParams.get("sp"), filterCode(START[code][3]));
    assert.equal(u.searchParams.get("persist_hl"), "1");
  }
  assert.equal(new URL(youtubeHome("ar")).searchParams.get("search_query"), "في");
});

test("the phone uses YouTube's phone site, and an unknown language its front page", () => {
  assert.ok(youtubeHome("ja", { mobile: true }).startsWith("https://m.youtube.com/results?"));
  assert.equal(youtubeHome("xx"), "https://www.youtube.com/");
  assert.equal(youtubeHome("", { mobile: true }), "https://m.youtube.com/");
});

test("each language's usual country stays first, and another can be chosen from its list", async () => {
  const { COUNTRIES, countryFor } = await import("../../web/js/youtube-home.js");
  for (const code of LANGUAGE_CODES) {
    assert.equal(COUNTRIES[code][0][0], START[code][1], `${code}: the usual country leads the list`);
    const codes = COUNTRIES[code].map(([c]) => c);
    assert.equal(new Set(codes).size, codes.length, `${code}: no country twice`);
    for (const [c, name] of COUNTRIES[code]) assert.ok(/^[A-Z]{2}$/.test(c) && name, `${code}: ${c}`);
  }
  assert.equal(new URL(youtubeHome("ar", { country: "EG" })).searchParams.get("gl"), "EG");
  assert.equal(new URL(youtubeHome("ar", { country: "eg" })).searchParams.get("gl"), "EG");
  assert.equal(new URL(youtubeHome("ar")).searchParams.get("gl"), "SA", "nothing chosen: the usual one");
  assert.equal(new URL(youtubeHome("ar", { country: "JP" })).searchParams.get("gl"), "SA", "a country from another language's list is ignored");
  assert.equal(new URL(youtubeHome("ar", { country: "EG" })).searchParams.get("hl"), "ar", "the language never changes with the country");
  assert.equal(countryFor("xx", "EG"), "");
});

test("a country with a word of its own gets its own list; the others keep the language's", () => {
  const word = (lang, country) => new URL(youtubeHome(lang, { country })).searchParams.get("search_query");
  assert.equal(word("ar", "EG"), "عشان", "Egyptian Arabic");
  assert.equal(word("ar", "MA"), "ديال", "Moroccan Arabic");
  assert.equal(word("ar", "LB"), "هيك", "Levantine Arabic");
  assert.equal(word("ar", "SA"), "في", "the usual country keeps the general list");
  assert.equal(word("ar", "QA"), "في", "no word of its own: the general list, for that country");
  assert.equal(word("es", "AR"), "el");
});

// ----- topics: the YouTube menu in the Library's add sheet and on the web app's YouTube page -----

test("every taught language offers Popular now and every topic, each with its own line icon", async () => {
  const { TOPICS, TOPIC_WORDS, topicsFor } = await import("../../web/js/youtube-home.js");
  const { ICON_NAMES } = await import("../../web/js/icons.js");
  assert.equal(TOPICS[0].key, "popular", "Popular now comes first");
  assert.ok(TOPICS.length >= 11, "roughly ten topics besides Popular now");
  assert.equal(new Set(TOPICS.map((t) => t.key)).size, TOPICS.length);
  assert.equal(new Set(TOPICS.map((t) => t.label)).size, TOPICS.length);
  for (const t of TOPICS) assert.ok(ICON_NAMES.includes(t.icon), `${t.key}: icon ${t.icon}`);
  assert.equal(TOPICS.find((t) => t.key === "learn").label, "Learn {0}", "the language's name goes in");
  // Bisaya leaves out the topics whose searches came back in Tagalog or English; every other language has them all.
  const without = { ceb: ["travel", "sport", "science", "gaming"] };
  for (const code of LANGUAGE_CODES) {
    assert.deepEqual(topicsFor(code).map((t) => t.key), TOPICS.map((t) => t.key).filter((k) => !(without[code] || []).includes(k)),
                     `${code} has words for every topic it offers`);
    assert.ok(topicsFor(code).length >= 9, `${code}: a real menu`);
    for (const [key, words] of Object.entries(TOPIC_WORDS[code])) {
      assert.ok(TOPICS.some((t) => t.key === key), `${code}: ${key} is a topic`);
      assert.ok(words.trim() && words.length <= 60, `${code} ${key}`);
    }
  }
  assert.deepEqual(topicsFor("xx"), [], "an unknown language has no menu");
});

test("a topic's words are written in the language being learned", async () => {
  const { TOPIC_WORDS } = await import("../../web/js/youtube-home.js");
  const scripts = { ar: /\p{Script=Arabic}/u, ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, zh: /\p{Script=Han}/u,
                    ru: /\p{Script=Cyrillic}/u, th: /\p{Script=Thai}/u, ko: /\p{Script=Hangul}/u };
  for (const [code, script] of Object.entries(scripts)) {
    for (const [key, words] of Object.entries(TOPIC_WORDS[code])) assert.match(words, script, `${code} ${key}: ${words}`);
  }
  assert.equal(TOPIC_WORDS.es.news, "noticias");
  assert.equal(TOPIC_WORDS.ar.food, "طبخ");
});

test("a topic opens YouTube's most-watched videos about it this month, with the language's hints", async () => {
  const { THIS_MONTH, THIS_YEAR, TOPIC_WITHIN, TOPIC_WORDS, topicAddress } = await import("../../web/js/youtube-home.js");
  assert.equal(filterCode(0, { within: THIS_MONTH }), "CAMSBAgEEAE=", "the code YouTube's Filters menu uses for This month, by view count");
  assert.equal(filterCode(0, { within: THIS_YEAR }), "CAMSBAgFEAE=");
  for (const code of LANGUAGE_CODES) {
    assert.equal(topicAddress(code, "popular"), youtubeHome(code), "Popular now is the start search itself");
    const u = new URL(topicAddress(code, "news"));
    assert.equal(u.origin + u.pathname, "https://www.youtube.com/results");
    assert.equal(u.searchParams.get("search_query"), TOPIC_WORDS[code].news);
    assert.equal(u.searchParams.get("sp"), filterCode(START[code][3], { within: TOPIC_WITHIN[code] || THIS_MONTH }));
    assert.equal(u.searchParams.get("gl"), START[code][1]);
    assert.equal(u.searchParams.get("hl"), START[code][2]);
  }
  const learn = new URL(topicAddress("ar", "learn", { mobile: true, country: "EG", handmade: true }));
  assert.equal(learn.origin, "https://m.youtube.com", "the phones use YouTube's phone site");
  assert.equal(learn.searchParams.get("sp"), filterCode(0, { within: THIS_YEAR, handmade: true }), "lessons: this year; handmade subtitles apply to every topic");
  assert.equal(learn.searchParams.get("gl"), "EG", "so does the country chosen under Popular in");
  assert.equal(learn.searchParams.get("search_query"), TOPIC_WORDS.ar.learn, "a topic keeps its own words whatever the country");
  assert.equal(new URL(topicAddress("ceb", "music")).searchParams.get("sp"), filterCode(0, { within: THIS_YEAR }),
               "Bisaya, with few videos, looks back a year");
  assert.equal(topicAddress("ceb", "sport"), youtubeHome("ceb"), "a topic a language leaves out falls back to Popular now");
  assert.equal(topicAddress("es", "nonsense"), youtubeHome("es"), "an unknown topic falls back to Popular now");
  assert.equal(topicAddress("xx", "news"), "https://www.youtube.com/");
});

test("Search YouTube: what was typed, with the same hints; nothing typed opens YouTube itself", async () => {
  const { searchAddress } = await import("../../web/js/youtube-home.js");
  const u = new URL(searchAddress("fr", "  chat mignon ", { country: "CA" }));
  assert.deepEqual([u.searchParams.get("search_query"), u.searchParams.get("gl"), u.searchParams.get("hl"), u.searchParams.get("sp")],
                   ["chat mignon", "CA", "fr", null], "most relevant first");
  assert.equal(new URL(searchAddress("fr", "x", { handmade: true })).searchParams.get("sp"), "EgIoAQ==");
  assert.equal(searchAddress("fr", ""), "https://www.youtube.com/");
  assert.equal(searchAddress("fr", "", { mobile: true }), "https://m.youtube.com/");
});

test("the Library's YouTube choice is a menu of topics, on every version", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
  const sheet = read("web/js/components/addsheet.js");
  assert.doesNotMatch(sheet, /Open YouTube</, "no single Open YouTube button");
  assert.match(sheet, /topicsFor\(lang\)/);
  assert.match(sheet, /openYouTube\(address\)/, "computer and phones: their own YouTube browser, on the topic");
  assert.match(sheet, /#\/youtube\?topic=/, "web app: its own YouTube page, on the topic");
  assert.match(sheet, /Popular in/);
  assert.match(sheet, /Only videos with handmade subtitles/);
  assert.match(sheet, /Search YouTube/);
  assert.match(read("mobile/src/js/web-youtube.js"), /query\.get\("topic"\)/);
});

test("the choice is remembered per language on the device", async () => {
  const { chooseCountry, chosenCountry } = await import("../../web/js/youtube-home.js");
  assert.equal(chosenCountry("es"), "MX", "no storage at all: the usual one");
  const kept = new Map();
  globalThis.localStorage = { getItem: (k) => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => kept.set(k, String(v)) };
  try {
    assert.equal(chosenCountry("es"), "MX");
    chooseCountry("es", "AR");
    assert.equal(chosenCountry("es"), "AR");
    assert.equal(chosenCountry("ar"), "SA", "one language's choice doesn't touch another's");
    chooseCountry("es", "nonsense");
    assert.equal(chosenCountry("es"), "MX", "an unknown choice puts the usual one back");
  } finally {
    delete globalThis.localStorage;
  }
});
