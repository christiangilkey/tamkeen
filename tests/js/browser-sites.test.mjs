// Run with: node --test tests/js/
// Sites saved to the in-app browser's start page: the list's rules (the computer's copy in
// app/pages.py is checked against the same cases in tests/test_browser_sites.py), and the
// start page that draws them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSites, isSaved, mergeSites, savedSites, setSite, siteKey } from "../../web/js/browser-sites.js";
import { homeBody, homeHtml, paintSaved } from "../../web/js/browser-home.js";

test("an address is kept without its #part, and only web addresses count", () => {
  assert.equal(siteKey("https://www.aljazeera.net/news/2026/1#top"), "https://www.aljazeera.net/news/2026/1");
  assert.equal(siteKey("https://example.com"), "https://example.com/");
  assert.equal(siteKey("http://example.com/a?b=1"), "http://example.com/a?b=1");
  for (const bad of ["", "hello", "ftp://example.com/x", "javascript:alert(1)", "file:///c:/x", null, "https://x.example/" + "a".repeat(600)]) {
    assert.equal(siteKey(bad), "", String(bad).slice(0, 30));
  }
});

test("saving, taking off and saving again", () => {
  let list = setSite([], { url: "https://example.com/a?b=1#c", title: "  Hello   there " }, true, 100);
  assert.deepEqual(list, [{ url: "https://example.com/a?b=1", title: "Hello there", on: 1, updated_at: 100 }]);
  assert.ok(isSaved(list, "https://example.com/a?b=1#other") && !isSaved(list, "https://example.com/"));
  // Taken off with a clock that runs behind: the change still counts as the newer one.
  list = setSite(list, { url: "https://example.com/a?b=1" }, false, 50);
  assert.deepEqual(list, [{ url: "https://example.com/a?b=1", title: "Hello there", on: 0, updated_at: 101 }]);
  assert.deepEqual(savedSites(list), []);
  list = setSite(list, { url: "https://example.com/a?b=1", title: "New name" }, true, 200);
  assert.deepEqual(savedSites(list), [{ url: "https://example.com/a?b=1", title: "New name" }]);
  assert.deepEqual(setSite(list, { url: "not an address" }, true, 300), list, "nonsense changes nothing");
});

test("the start page lists sites in the order they were saved", () => {
  let list = setSite([], { url: "https://b.example/", title: "B" }, true, 10);
  list = setSite(list, { url: "https://a.example/", title: "A" }, true, 20);
  list = setSite(list, { url: "https://c.example/", title: "C" }, true, 15); // a clock that runs behind
  list = setSite(list, { url: "https://d.example/", title: "D" }, true, 15); // and the same second
  assert.deepEqual(savedSites(list).map((s) => s.title), ["B", "A", "C", "D"]);
  assert.deepEqual(list.map((r) => r.url), ["https://a.example/", "https://b.example/", "https://c.example/", "https://d.example/"], "stored in a fixed order");
  assert.deepEqual(list.map((r) => r.updated_at), [20, 10, 21, 22]);
});

test("a messy list is tidied: one record per address, junk dropped", () => {
  const list = cleanSites([
    { url: "https://a.example/#x", title: "old", on: 1, updated_at: 5 },
    { url: "https://a.example/", title: "new", on: 0, updated_at: 9 },
    { url: "nope", title: "x", on: 1, updated_at: 1 },
    null, "text", { title: "no address" },
    { url: "https://b.example/", title: "t".repeat(300), on: "yes", updated_at: "12.9" },
  ]);
  assert.deepEqual(list, [
    { url: "https://a.example/", title: "new", on: 0, updated_at: 9 },
    { url: "https://b.example/", title: "t".repeat(120), on: 1, updated_at: 12 },
  ]);
  assert.deepEqual(cleanSites("nonsense"), []);
});

test("two devices' lists merge the same way whichever does the merging", () => {
  const phone = [
    { url: "https://a.example/", title: "A", on: 1, updated_at: 10 },
    { url: "https://b.example/", title: "B", on: 0, updated_at: 30 },
    { url: "https://tie.example/", title: "T", on: 0, updated_at: 7 },
  ];
  const computer = [
    { url: "https://a.example/", title: "A", on: 0, updated_at: 20 },
    { url: "https://b.example/", title: "B", on: 1, updated_at: 25 },
    { url: "https://c.example/", title: "C", on: 1, updated_at: 5 },
    { url: "https://tie.example/", title: "T", on: 1, updated_at: 7 },
  ];
  const expected = [
    { url: "https://a.example/", title: "A", on: 0, updated_at: 20 },
    { url: "https://b.example/", title: "B", on: 0, updated_at: 30 },
    { url: "https://c.example/", title: "C", on: 1, updated_at: 5 },
    { url: "https://tie.example/", title: "T", on: 1, updated_at: 7 },
  ];
  assert.deepEqual(mergeSites(phone, computer), expected);
  assert.deepEqual(mergeSites(computer, phone), expected, "the same answer on both devices, ties included");
  assert.deepEqual(mergeSites(expected, expected), expected);
});

test("the list cannot grow without end", () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ url: `https://s${i}.example/`, title: "", on: i < 20 ? 1 : 0, updated_at: i }));
  const list = cleanSites(many);
  assert.equal(list.length, 300);
  assert.equal(list.filter((r) => r.on).length, 20, "sites still on the start page are never the ones dropped");
});

// ----- the start page -----
// A small stand-in for the page, enough for paintSaved.
function fakePage() {
  const el = (tag) => {
    const e = { tag, children: [], attrs: {}, className: "", textContent: "", hidden: false,
      appendChild(c) { c.parent = e; e.children.push(c); return c; },
      setAttribute(k, v) { e.attrs[k] = v; },
      remove() { e.parent.children = e.parent.children.filter((c) => c !== e); },
    };
    return e;
  };
  const box = el("section");
  const grid = el("div");
  box.hidden = true;
  Object.defineProperty(grid, "textContent", { set(v) { if (v === "") grid.children = []; }, get() { return ""; } });
  return { doc: { getElementById: (id) => (id === "saved" ? box : id === "saved-grid" ? grid : null), createElement: el }, box, grid };
}

test("the start page draws the saved sites, and takes one off when asked", () => {
  const { doc, box, grid } = fakePage();
  const removed = [];
  paintSaved(doc, [{ url: "https://www.aljazeera.net/news", title: "الجزيرة" }, { url: "javascript:alert(1)", title: "bad" },
                   { url: "https://plain.example/", title: "" }], (url) => removed.push(url));
  assert.equal(box.hidden, false);
  assert.equal(grid.children.length, 2, "only real web addresses are drawn");
  const [first, second] = grid.children;
  const link = first.children[0];
  assert.equal(link.href, "https://www.aljazeera.net/news");
  const [name, note] = link.children[1].children;
  assert.deepEqual([name.textContent, note.textContent], ["الجزيرة", "aljazeera.net"], "the real address always shows under the name");
  assert.equal(second.children[0].children[1].children[0].textContent, "plain.example", "no title: the address stands in");
  first.children[1].onclick({ preventDefault() {} });
  assert.deepEqual(removed, ["https://www.aljazeera.net/news"]);
  assert.equal(grid.children.length, 1);
  second.children[1].onclick({ preventDefault() {} });
  assert.equal(box.hidden, true, "nothing left: the heading goes too");
  paintSaved(doc, [], null);
  assert.equal(box.hidden, true);
});

test("the phone's one-piece start page carries the saved sites and their way of being taken off", () => {
  const html = homeHtml("ar", [{ url: "https://example.com/a", title: "A </script><b>x" }]);
  assert.ok(html.includes('id="saved"') && html.includes("Your saved sites"));
  assert.ok(html.includes("tamkeen-video://site?do=remove&u="), "taking a site off goes through the made-up address");
  assert.ok(html.includes("window.__tkSites = function"), "the browser can hand the page a fresh list");
  const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.ok(!/<\/script/i.test(script), "a page title can't end the script early");
  // Run it against the stand-in page: the site is drawn, and a fresh list replaces it.
  const { doc, grid } = fakePage();
  const win = {};
  new Function("document", "location", "window", script)(doc, {}, win);
  assert.equal(grid.children.length, 1);
  win.__tkSites([]);
  assert.equal(grid.children.length, 0);
  assert.ok(homeBody("es").includes('id="saved-grid"') && homeBody("es").includes("press the star"));
  assert.ok(homeHtml("fr").includes("window.__tkSites([]);"), "no sites: an empty list");
});
