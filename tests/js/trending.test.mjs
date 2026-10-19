// Run with: node --test tests/js/
// Trending podcasts from Apple's charts: reading a chart, keeping the podcasts in the language
// being studied, merging countries, finding feed addresses, and sorting into categories.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_CHARTS, CATEGORY_IDS, COUNTRY_NAMES, MAIN_CATEGORIES, OTHER, STOREFRONTS, chartUrl, feedKey, fetchTrending, groupByCategory,
  hasPicks, inLanguage, lookupUrl, mainCategory, mergeCharts, parseChart,
} from "../../web/js/trending.js";
import { PICKS } from "../../web/js/podcast-picks.js";
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
  assert.ok(inLanguage(item("LEGEND"), "fr", true), "nothing to judge by, in France's own chart: kept");
  assert.ok(!inLanguage(item("LEGEND"), "fr"), "nothing to judge by, in Belgium's chart: left out");
  assert.ok(!inLanguage(item("Dear MOR"), "tl", true), "Tagalog is never the main language of its chart");
});

test("shows in the other languages of a country's chart are left out", () => {
  const item = (title, description = "", author = "") => ({ title, description, author });
  // Switzerland's chart (for Italian) is mostly German and French; Belgium's (for French) half Dutch.
  const german = item("Echo der Zeit", "«Echo der Zeit» ist die älteste politische Hintergrundsendung von Radio SRF.");
  const swissFrench = item("Le Point J", "Le Point J: votre point info du jour. Du lundi au jeudi, nous répondons à une question.");
  const italian = item("Il Mondo", "Il podcast quotidiano di Internazionale: le notizie del giorno raccontate dai giornalisti.");
  assert.ok(inLanguage(italian, "it") && !inLanguage(german, "it") && !inLanguage(swissFrench, "it"));
  const dutch = item("De verrekijkers", "De verrekijkers is een wekelijkse afspraak met de wereld, waarin één buitenlands thema centraal staat.");
  assert.ok(!inLanguage(dutch, "fr") && inLanguage(swissFrench, "fr"));
  assert.ok(!inLanguage(swissFrench, "en"), "French in Canada's chart isn't English");
  // The Gulf's charts hold Persian shows, written in the same letters as Arabic.
  assert.ok(!inLanguage(item("پادکست رخ", "داستان زندگی کسانی که قسمتی از تاریخ ایران و جهان را رقم زدند"), "ar"));
  assert.ok(inLanguage(item("كتب غيّرتنا", "الشرق بودكاست تقدم كتب غیرتنا مع راما الحجي. نتطرق في هذا البودكاست"), "ar"));
  // The Philippines' charts: Chinese, Japanese, Vietnamese, Hindi, Czech, Spanish and English shows.
  for (const [title, description] of [
    ["2024TikTok音乐排行榜", "来自 TikTok Hits 的最大病毒式点击！2023年 TikTok排行榜"],
    ["NHKラジオニュース", "こちらのポッドキャストは、NHKラジオニュースを、いつでもどこでもお聞きになれるサービスです。"],
    ["VOV - Tin nhanh 24h", "Cập nhật liên tục, nhanh nhất các tin tức, sự kiện nóng nhất trong ngày."],
    ["Facebook account ko delete kaise Karen", "Aap facebook account ko kis prakar se delete kar sakte hai. Is podcast me ya jankari."],
    ["Alarm", "Audio kanál online deníku Alarm. Poslechněte si podcasty o politice, kultuře, sportu, nebo společnosti."],
    ["TikTok", "TikTok: cinco opiniones diferentes de chicas que usan esta app y la red."],
    ["Pinoy Radio Tivo", "Pinoy Radio at your own pace"],
  ]) assert.ok(!inLanguage(item(title, description), "tl"), title);
  assert.ok(inLanguage(item("Dear LOVE", "Ang mga istoryang kukurot, kikiliti, at magpapakilig sa natutulog mong puso!"), "tl"));
  // Neighbours that share letters: Portuguese "você", Catalan "Barça".
  assert.ok(inLanguage(item("BBC Lê", "A equipe da BBC lê para você algumas de suas melhores reportagens.", "BBC Brasil"), "pt"));
  assert.ok(inLanguage(item("Lo que hay que saber", "Las noticias de la jornada, condensadas en dos minutos, dos veces al día."), "es"));
  assert.ok(inLanguage(item("El Barça juga a RAC1", "Podcasts del programa El Barça juga a RAC1 - L'hora a hora", "RAC1"), "ca"));
});

test("each podcast is filed under one of Apple's 19 main headings, whatever the country calls it", () => {
  assert.equal(mainCategory({ category: "Football" }, { genres: ["Football", "Podcasts", "Sport"], genreIds: ["1546", "26", "1545"] }), "Sports");
  assert.equal(mainCategory({ category: "Football" }, { genres: ["Football", "Podcasts", "Sport"] }), "Sports", "by name when there are no numbers");
  assert.equal(mainCategory({ category: "Islam" }, { genres: ["Islam", "Religion & Spirituality"], genreIds: [1440, 1314] }), "Religion & Spirituality");
  assert.equal(mainCategory({ category: "" }, { genres: ["Podcasts"], genreIds: ["26"] }), "");
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

test("a show Apple lists twice (in two countries' stores, or under two ids) appears once", async () => {
  const apple = pretendApple({
    charts: { sa: chart(entry(1, "قناة الشيخ"), entry(2, "فنجان")), eg: chart(entry(3, "قناة الشيخ"), entry(4, "الدحيح")) },
    feeds: { 1: { feedUrl: "https://a.example/rss" }, 2: { feedUrl: "https://b.example/rss" }, 3: { feedUrl: "https://c.example/rss" },
             4: { feedUrl: "http://www.a.example/rss/" } },
  });
  const feeds = await fetchTrending("ar", apple.getJson);
  assert.deepEqual(feeds.map((f) => f.id), ["1", "2"], "same name and maker, or the same feed: once");
});

test("languages thin in their countries' overall charts read the 19 category charts too", () => {
  assert.deepEqual([...CATEGORY_CHARTS].sort(), ["ca", "th", "tl"]);
  assert.equal(CATEGORY_IDS.length, MAIN_CATEGORIES.length, "one id per main heading, in the same order");
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

test("Catalan is told from Spanish, and Bisaya from Tagalog, in the same countries' charts", () => {
  const item = (title, description = "", author = "") => ({ title, description, author });
  const catalan = item("La Sotana", "Programa d'humor esportiu i de tot el que passa amb el Barça, cada setmana.", "La Sotana");
  const catalanTitle = item("Via lliure - Il·lustres execrables", "Podcasts del programa Via lliure - Il·lustres execrables", "RAC1");
  const spanish = item("Nadie Sabe Nada", "Andreu Buenafuente y Berto Romero improvisan con las preguntas de los oyentes.", "SER Podcast");
  const french = item("L'œil de Philippe Caverivière", "Philippe Caverivière décortique l'actualité et ose tout face aux invités de RTL Matin.", "RTL");
  assert.ok(inLanguage(catalan, "ca") && inLanguage(catalanTitle, "ca"));
  assert.ok(!inLanguage(spanish, "ca") && !inLanguage(french, "ca"), "Spanish and French shows aren't Catalan");
  assert.ok(inLanguage(spanish, "es") && !inLanguage(catalan, "es"), "and Catalan ones aren't Spanish");
  const bisaya = item("Dili Ni Advice", "Usa ka Bisaya nga podcast. Dili ni advice, istorya ra gyud nato.", "Darling and Kringkay");
  const tagalog = item("Barangay Love Stories", "Ang mga kwento ng pag-ibig na hindi mo malilimutan, ngayon at kailanman.", "GMA");
  assert.ok(inLanguage(bisaya, "ceb") && !inLanguage(tagalog, "ceb"));
  assert.ok(inLanguage(tagalog, "tl") && !inLanguage(bisaya, "tl"));
  assert.ok(inLanguage(item("Não Inviabilize", "Histórias reais que você não vai acreditar."), "pt"));
  assert.ok(inLanguage(item("People You May Know", "พอดแคสต์ที่ชวนคุยเรื่องคน"), "th") && !inLanguage(item("The Daily"), "th"));
});

test("Catalan reads Spain's 19 category charts too; Bisaya adds its most-rated podcasts after any that chart", async () => {
  const apple = pretendApple({
    charts: { es: chart(entry(1, "Crims", { artist: "Catalunya Ràdio", summary: "Les històries de crims més famoses, amb Carles Porta." }),
                        entry(2, "Nadie Sabe Nada", { summary: "Andreu Buenafuente y Berto Romero improvisan con los oyentes." })) },
    feeds: { 1: { feedUrl: "https://crims.example/rss", genres: ["True Crime"] }, 2: { feedUrl: "https://nsn.example/rss" } },
  });
  const ca = await fetchTrending("ca", apple.getJson);
  assert.deepEqual(ca.map((f) => f.title), ["Crims"]);
  const chartsRead = apple.seen.filter((u) => u.includes("/rss/"));
  assert.equal(chartsRead.length, 1 + CATEGORY_IDS.length, "the overall chart and every category chart");
  assert.ok(chartsRead.includes(chartUrl("es", 1488)));
  assert.equal(chartUrl("es", 1303), "https://itunes.apple.com/es/rss/toppodcasts/limit=200/genre=1303/json?l=en");

  assert.ok(hasPicks("ceb") && !hasPicks("ca") && !hasPicks("es"));
  assert.ok(PICKS.ceb.length >= 20, "a good handful of Bisaya podcasts");
  for (const p of PICKS.ceb) {
    assert.match(p.url, /^https?:\/\//);
    assert.ok(p.title && p.id && Number.isFinite(p.ratings), p.title);
  }
  assert.ok(PICKS.ceb.every((p, i) => i === 0 || PICKS.ceb[i - 1].ratings >= p.ratings || PICKS.ceb[i - 1].ratings === p.ratings), "most-rated first");
  const ceb = await fetchTrending("ceb", pretendApple({ charts: {}, feeds: {} }).getJson);
  assert.deepEqual(ceb.map((f) => f.url), PICKS.ceb.map((p) => p.url), "with nothing charting: the picks, most-rated first");
  const offline = await fetchTrending("ceb", pretendApple({ charts: {}, feeds: {}, fail: ["/rss/", "/lookup"] }).getJson);
  assert.equal(offline.length, PICKS.ceb.length, "the picks don't need Apple to answer");
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
