// Drag and drop for files (web/js/filedrop.js, prototype drag_drop): which files a place takes, the drop area, the
// innermost place winning, and a stray drop never opening the file in place of the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(root, p), "utf8");

// ---- a tiny page: elements that pass events up to their parent, a body, and prototype mode ----
let protoOn = true;
globalThis.localStorage = { getItem: (k) => (k === "tamkeenPrototype" && protoOn ? "1" : null), setItem() {}, removeItem() {} };
class El {
  constructor(parent = null) { this.parent = parent; this.ls = {}; this.isConnected = true; this.style = {}; this.hidden = false; this.kids = []; }
  addEventListener(type, fn) { (this.ls[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.ls[type] = (this.ls[type] || []).filter((f) => f !== fn); }
  fire(e) { for (const fn of this.ls[e.type] || []) fn(e); if (this.parent) this.parent.fire(e); }
  getBoundingClientRect() { return { top: 10, left: 20, right: 220, bottom: 310 }; }
  setAttribute() {}
  append(...k) { this.kids.push(...k); }
  querySelector(sel) { return (this.q ||= {})[sel] ||= new El(this); }
  set innerHTML(v) { this.html = v; }
}
const win = new El();
win.innerWidth = 1000; win.innerHeight = 800;
globalThis.window = win;
globalThis.document = { body: new El(win), createElement: () => new El() };

const file = (name, type = "") => ({ name, type });
const ev = (type, files, { types = ["Files"] } = {}) => ({
  type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
  dataTransfer: { types, files, items: files.map((f) => ({ kind: "file", type: f.type })), dropEffect: "" },
});

const { matchesAccept, sortDrop, hasFiles, dropZone, blockStrayDrops } = await import("../../web/js/filedrop.js");

test("a file fits an accept list the way a file chooser's does: type with a star, exact type, or ending", () => {
  assert.equal(matchesAccept(file("talk.mp3", "audio/mpeg"), "audio/*"), true);
  assert.equal(matchesAccept(file("talk.MP3"), "audio/*,.mp3"), true);       // (no type from the system: the ending decides)
  assert.equal(matchesAccept(file("film.mkv"), "video/*,.mkv"), true);
  assert.equal(matchesAccept(file("film.mkv", ""), "video/*"), false);
  assert.equal(matchesAccept(file("notes.pdf", "application/pdf"), "audio/*,.mp3"), false);
  assert.equal(matchesAccept(file("backup.zip", "application/zip"), ".zip,application/zip"), true);
  assert.equal(matchesAccept(file("backup.zip", "application/x-zip-compressed"), ".zip,application/zip"), true);
  assert.equal(matchesAccept(file("anything.xyz"), ""), true);
  assert.equal(matchesAccept(file("photo.webp", "image/webp"), "image/*"), true);
  assert.equal(matchesAccept(file("mp3"), ".mp3"), false);                   // (a name that only looks like an ending)
});

test("dropped files are sorted: one at a time where the button takes one, the wrong kind is named, mixed lots keep the right ones", () => {
  assert.deepEqual(sortDrop([], {}), { problem: "none" });
  assert.deepEqual(sortDrop([file("a.mp3"), file("b.mp3")], { accept: ".mp3", multiple: false }), { problem: "many" });
  assert.deepEqual(sortDrop([file("a.pdf")], { accept: "audio/*,.mp3" }), { problem: "kind" });
  const mixed = sortDrop([file("a.mp3"), file("b.pdf")], { accept: ".mp3" });
  assert.deepEqual(mixed.files.map((f) => f.name), ["a.mp3"]);
  assert.deepEqual(mixed.left.map((f) => f.name), ["b.pdf"]);
  // A lesson sorts its own files (a document and its MP3s): all of them go to it once any one fits.
  const lesson = sortDrop([file("lesson.pdf"), file("track.mp3"), file("x.exe")], { accept: ".pdf,.mp3", check: "some" });
  assert.deepEqual(lesson.files.map((f) => f.name), ["lesson.pdf", "track.mp3", "x.exe"]);
  assert.deepEqual(lesson.left, []);
});

test("only a drag that carries files counts (not text or a link dragged inside the page)", () => {
  assert.equal(hasFiles({ types: ["Files"] }), true);
  assert.equal(hasFiles({ types: ["text/plain"], items: [{ kind: "string" }] }), false);
  assert.equal(hasFiles({ types: [], items: [{ kind: "file" }] }), true);
  assert.equal(hasFiles(null), false);
});

test("files over a place show its drop area; a drop hands the right files to its import and names the wrong ones", () => {
  protoOn = true;
  const page = new El(document.body);
  const said = [], got = [];
  const off = dropZone(page, { label: "Drop to add to My audio", hint: "MP3…", accept: "audio/*", multiple: false,
    wrongKind: "That isn't an audio file.", many: "Drop one file at a time here.", onFiles: (f) => got.push(f), say: (m, o) => said.push([m, o.error]) });
  const over = ev("dragover", [file("a.mp3", "audio/mpeg")]);
  page.fire(over);
  assert.equal(over.defaultPrevented, true);
  assert.equal(over.dataTransfer.dropEffect, "copy");
  const area = document.body.kids.find((k) => k.className === "file-drop");
  assert.ok(area, "the drop area is on the page");
  assert.equal(area.hidden, false);
  assert.equal(area.querySelector("strong").textContent, "Drop to add to My audio");
  assert.equal(area.style.top, "10px");
  assert.equal(area.style.width, "200px");

  page.fire(ev("drop", [file("a.mp3", "audio/mpeg")]));
  assert.equal(area.hidden, true);
  assert.equal(got.length, 1);
  assert.equal(got[0][0].name, "a.mp3");

  page.fire(ev("drop", [file("doc.pdf", "application/pdf")]));
  assert.deepEqual(said.pop(), ["That isn't an audio file.", true]);
  page.fire(ev("drop", [file("a.mp3", "audio/mpeg"), file("b.mp3", "audio/mpeg")]));
  assert.deepEqual(said.pop(), ["Drop one file at a time here.", true]);
  assert.equal(got.length, 1, "nothing else was imported");

  // A failed import says why.
  const page2 = new El(document.body);
  dropZone(page2, { label: "x", accept: "", onFiles: async () => { throw new Error("Upload failed."); }, say: (m) => said.push([m]) });
  page2.fire(ev("drop", [file("a.mp3")]));
  off();
  const after = ev("dragover", [file("a.mp3", "audio/mpeg")]);
  page.fire(after);
  assert.equal(after.defaultPrevented, false, "a stopped place takes no more files");
});

test("the innermost place showing takes the drop; a hidden one leaves it to the place around it", () => {
  protoOn = true;
  const outer = new El(document.body);
  const inner = new El(outer);
  const got = [];
  let innerShown = true;
  dropZone(outer, { label: "outer", onFiles: () => got.push("outer") });
  dropZone(inner, { label: "inner", active: () => innerShown, onFiles: () => got.push("inner") });
  inner.fire(ev("drop", [file("a.mp3")]));
  assert.deepEqual(got, ["inner"]);
  innerShown = false;
  inner.fire(ev("drop", [file("a.mp3")]));
  assert.deepEqual(got, ["inner", "outer"]);
});

test("released for everyone (v0.64.0, the owner, 2026-11-19): with prototype mode off, places still take files", () => {
  protoOn = false;
  const page = new El(document.body);
  let got = 0;
  dropZone(page, { label: "x", onFiles: () => { got += 1; } });
  const over = ev("dragover", [file("a.mp3")]);
  page.fire(over);
  page.fire(ev("drop", [file("a.mp3")]));
  assert.equal(over.defaultPrevented, true);
  assert.equal(got, 1);
  protoOn = true;
});

test("a file dropped where nothing takes files never opens in place of the app (for everyone)", () => {
  protoOn = false;
  blockStrayDrops(win);
  const spot = new El(document.body);
  const over = ev("dragover", [file("a.mp3")]);
  spot.fire(over);
  assert.equal(over.defaultPrevented, true);
  assert.equal(over.dataTransfer.dropEffect, "none", "the pointer says it can't be dropped here");
  const drop = ev("drop", [file("a.mp3")]);
  spot.fire(drop);
  assert.equal(drop.defaultPrevented, true);
  // Text dragged inside the page is left alone.
  const text = ev("dragover", [], { types: ["text/plain"] });
  text.dataTransfer.items = [{ kind: "string" }];
  spot.fire(text);
  assert.equal(text.defaultPrevented, false);
  protoOn = true;
});

test("every place that uploads files takes dropped ones, and both versions guard against stray drops", () => {
  for (const p of ["web/js/pages/library.js", "web/js/pages/books.js", "web/js/components/lessonpanel.js",
    "web/js/components/lessonview.js", "web/js/pages/settings.js", "web/js/pages/friends.js"]) {
    assert.match(src(p), /dropZone\(/, `${p} has a drop place`);
  }
  for (const label of ["Drop to add to My videos", "Drop to add to My audio", "Drop to add an audiobook"]) assert.ok(src("web/js/pages/library.js").includes(label), label);
  assert.match(src("web/js/app.js"), /blockStrayDrops\(\)/);
  assert.match(src("mobile/src/js/app.js"), /blockStrayDrops\(\)/);
  assert.ok(src("mobile/scripts/build-www.mjs").includes(`"js/filedrop.js"`), "the phone and web app build carry filedrop.js");
  assert.match(src("web/js/prototype.js"), /drag_drop: \{[^}]*released: true[^}]*since: "2026-11-19"/);
});
