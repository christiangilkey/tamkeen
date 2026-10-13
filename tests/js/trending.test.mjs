// Run with: node --test tests/js/
// Trending podcasts from Apple's charts: reading a chart, keeping the podcasts in the language
// being studied, merging countries, finding feed addresses, and sorting into categories.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRY_NAMES, OTHER, STOREFRONTS, chartUrl, feedKey, fetchTrending, groupByCategory, inLanguage, lookupUrl,
  mergeCharts, parseChart,
} from "../../web/js/trending.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

// One podcast the way Apple's chart lists it.
const entry = (id, name, { artist = "", summary = "", genre = "Education" } = {}) => ({
  "im:name": { label: name },
  "im:image": [{ label: `https://img.example/${id}/55.png` }, { label: `https://img.example/${id}/170.png` }],
  summary: { label: summary },
  "im:artist": { label: artist },
  id: { label: `https://podcasts.apple.com/x/id${id}`, attributes: { "im:id": String(id) } },
  category: { attributes: { "im:id": "1304", label: genre } },
});
const chart = (...entries) => ({ feed: { entry: entries } });

test("every taught language has countries to read charts from, each with a name", () => {
  for (const code of LANGUAGE_CODES) {
    assert.ok(STOREFRONTS[code] && STOREFRONTS[code].length, code);
    for (const c of STOREFRONTS[code]) assert.ok(COUNTRY_NAMES[c], `${code}: ${c} has a name`);
  }
  assert.equal(chartUrl("sa"), "https://itunes.apple.com/sa/rss/toppodcasts/limit=200/json?l=en");
  assert.equal(lookupUrl("sa", ["1", "2"]), "https://itunes.apple.com/lookup?id=1,2&country=sa&entity=podcast&lang=en_us");
});

test("a chart is read into tidy entries, best first", () => {
  const items = parseChart(chart(
    entry(11, "  فنجان  مع عبدالرحمن ", { artist: "ثمانية", summary: "x ".repeat(500), genre: "Society & Culture" }),
    { id: {}, "im:name": { label: "no id" } },
    entry(12, "   "),
    entry(13, "الدحيح"),
  ));
  assert.deepEqual(items.map((i) => [i.id, i.title, i.rank]), [["11", "فنجان مع عبدالرحمن", 0], ["13", "الدحيح", 1]]);
  assert.equal(items[0].image, "https://img.example/11/170.png", "the largest picture");
  assert.equal(items[0].category, "Society & Culture");
  assert.ok(items[0].description.length <= 600);
  assert.equal(parseChart(chart()).length, 0);
  assert.deepEqual(parseChart(null), []);
  assert.equal(parseChart({ feed: { entry: entry(1, "Solo") } }).length, 1, "a chart with one podcast isn't a list");
});

test("only podcasts in the language being studied are kept", () => {
  const item = (title, description = "", author = "") => ({ title, description, author });
  // Arabic, Russian, Japanese, Chinese: told by their letters.
  assert.ok(inLanguage(item("El Daheeh - الدحيح"), "ar"));
  assert.ok(inLanguage(item("Finjan", "بودكاست أسبوعي"), "ar"), "an Arabic description counts");
  assert.ok(!inLanguage(item("The Daily", "This is what the news should sound like."), "ar"));
  assert.ok(inLanguage(item("Живой Гвоздь"), "ru") && !inLanguage(item("The Daily"), "ru"));
  assert.ok(inLanguage(item("安住紳一郎の日曜天国"), "ja") && inLanguage(item("凹凸电波"), "zh"));
  assert.ok(!inLanguage(item("Global News Podcast"), "zh"));
  // Spanish and French share letters with English: told by their little words.
  assert.ok(inLanguage(item("Un Libro Una Hora", "Un programa para conocer los grandes libros de la literatura."), "es"));
  assert.ok(!inLanguage(item("The Joe Rogan Experience", "The official podcast of comedian Joe Rogan, with the best of his talks."), "es"));
  assert.ok(inLanguage(item("Les Grosses Têtes", "Retrouvez tous les jours le meilleur des Grosses Têtes en podcast sur RTL."), "fr"));
  assert.ok(!inLanguage(item("Up First", "The news you need to start your day, from NPR, in ten minutes."), "fr"));
  assert.ok(inLanguage(item("LEGEND"), "fr"), "nothing to judge by: kept");
});

test("countries are merged: high in several beats high in one", () => {
  const merged = mergeCharts([
    ["sa", [{ id: "a", title: "A", rank: 0 }, { id: "b", title: "B", rank: 1 }]],
    ["eg", [{ id: "c", title: "C", rank: 0 }, { id: "b", title: "B again", rank: 1 }]],
  ]);
  assert.deepEqual(merged.map((m) => [m.id, m.score, m.country]), [["b", 398, "sa"], ["a", 200, "sa"], ["c", 200, "eg"]]);
  assert.equal(merged[0].title, "B", "the first country's details are kept");
});

// A pretend Apple: charts per country, and a lookup that knows some feed addresses.
function pretendApple({ charts, feeds, fail = [] }) {
  const seen = [];
  const getJson = async (url) => {
    seen.push(url);
    if (fail.some((part) => url.includes(part))) throw new Error("offline");
    const m = url.match(/apple\.com\/(\w\w)\/rss\//);
    if (m) return charts[m[1]] || chart();
    const ids = new URL(url).searchParams.get("id").split(",");
    return { results: ids.filter((id) => feeds[id]).map((id) => ({ collectionId: Number(id), ...feeds[id] })) };
  };
  return { getJson, seen };
}

test("the whole fetch: charts, then feed addresses", async () => {
  const apple = pretendApple({
    charts: {
      sa: chart(entry(1, "فنجان", { genre: "Society & Culture" }), entry(2, "The Daily", { summary: "This is the news." }), entry(3, "بدون ورق")),
      eg: chart(entry(4, "الدحيح", { genre: "Islam" }), entry(1, "فنجان"), entry(5, "حصري على أبل")),
    },
    feeds: {
      1: { feedUrl: "https://a.example/rss", genres: ["Society & Culture", "Documentary", "Podcasts"] },
      3: { feedUrl: "https://c.example/rss", genres: ["Podcasts", "Education"] },
      4: { feedUrl: " https://d.example/rss ", genres: ["Islam", "Religion & Spirituality", "Podcasts"] },
      5: { genres: ["Comedy"] }, // no public feed
    },
  });
  const feeds = await fetchTrending("ar", apple.getJson);
  assert.deepEqual(feeds.map((f) => f.title), ["فنجان", "الدحيح", "بدون ورق"], "merged, English and feed-less ones dropped");
  assert.deepEqual(feeds[0].categories, ["Society & Culture"], "one category each: the main heading it sits under");
  assert.deepEqual(feeds[1], { id: "4", url: "https://d.example/rss", title: "الدحيح", author: "", description: "",
    image: "https://img.example/4/170.png", categories: ["Religion & Spirituality"], score: 200 });
  assert.deepEqual(feeds[2].categories, ["Education"]);
  const lookups = apple.seen.filter((u) => u.includes("/lookup"));
  assert.equal(apple.seen.length - lookups.length, STOREFRONTS.ar.length, "one chart per country");
  assert.ok(lookups.every((u) => !u.includes("id=2,") && !u.includes(",2,") && !u.endsWith("id=2")), "nothing is looked up for dropped podcasts");
  assert.equal(new Set(lookups.flatMap((u) => new URL(u).searchParams.get("id").split(","))).size, 4, "each podcast is looked up once");
});

test("one country's chart failing doesn't empty the page; all failing says so", async () => {
  const charts = { sa: chart(entry(1, "فنجان")), eg: chart(entry(4, "الدحيح")) };
  const feeds = { 1: { feedUrl: "https://a.example/rss" }, 4: { feedUrl: "https://d.example/rss" } };
  const some = await fetchTrending("ar", pretendApple({ charts, feeds, fail: ["/eg/rss/"] }).getJson);
  assert.deepEqual(some.map((f) => f.title), ["فنجان"]);
  await assert.rejects(fetchTrending("ar", pretendApple({ charts, feeds, fail: ["/rss/"] }).getJson), /Couldn't reach Apple's podcast charts/);
  await assert.rejects(fetchTrending("ar", pretendApple({ charts, feeds, fail: ["/lookup"] }).getJson), /Couldn't reach Apple's podcast directory/);
  await assert.rejects(fetchTrending("xx", pretendApple({ charts, feeds }).getJson), /Choose a language/);
  assert.deepEqual(await fetchTrending("ar", pretendApple({ charts: {}, feeds }).getJson), [], "empty charts are just empty");
});

test("the same feed is recognised however its address is written", () => {
  const key = feedKey("https://feeds.example.com/show/");
  for (const url of ["http://feeds.example.com/show", "HTTPS://WWW.feeds.example.com/show//", "  feeds.example.com/show "]) {
    assert.equal(feedKey(url), key, url);
  }
  assert.notEqual(feedKey("https://feeds.example.com/other"), key);
});

test("podcasts are sorted into categories, the fullest first", () => {
  const a = { url: "a", categories: ["News", "Politics"] };
  const b = { url: "b", categories: ["News", " News ", ""] };
  const c = { url: "c", categories: [] };
  const d = { url: "d" };
  const e = { url: "e", categories: ["Arts"] };
  const groups = groupByCategory([a, b, c, d, e]);
  assert.deepEqual(groups.map((g) => [g.name, g.feeds.map((f) => f.url)]),
    [["News", ["a", "b"]], ["Arts", ["e"]], ["Politics", ["a"]], [OTHER, ["c", "d"]]]);
  assert.deepEqual(groupByCategory([]), []);
  assert.deepEqual(groupByCategory(null), []);
});
