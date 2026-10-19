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
