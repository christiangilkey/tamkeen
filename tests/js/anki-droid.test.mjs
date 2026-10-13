// The phone's side of the Anki sync (mobile/src/js/anki-droid.js), run against a stand-in for
// AnkiDroid that behaves like the door AnkiDroid opens to other apps: notes can be added, changed
// and deleted; a guid cannot be chosen; nothing says what was deleted. The stand-in also holds a
// second deck, and every test checks the sync never so much as asked about a note in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnkiSync, dayNumber, FIELDS } from "../../mobile/src/js/anki-droid.js";
import { ankiFields } from "../../mobile/src/js/shared-logic.js";
import { uidFromGuid } from "../../mobile/src/js/anki-sync.js";

const NOW = 1_800_000_000;

/** A stand-in for the native plugin. `old` = an AnkiDroid from before 2.24 (no schedules to read). */
function fakeDroid({ installed = true, permission = "granted", old = false } = {}) {
  const decks = [{ id: 1, name: "Default" }, { id: 50, name: "Other" }];
  const models = { 900: { name: "Basic", fields: ["Front", "Back"], cards: 1 }, 901: { name: "Two", fields: ["Front", "Back"], cards: 2 } };
  const notes = new Map(), media = [], calls = [];
  let nextId = 1_700_000_000_000, clock = NOW;
  const droid = {
    notes, models, decks, media, calls,
    tick(seconds) { clock += seconds; },
    /** Put a note straight into the stand-in, as if made in AnkiDroid by hand. */
    make(deckName, fields, { model = 900, tags = [], guid, cards } = {}) {
      const deck = decks.find((d) => d.name === deckName) || decks[decks.push({ id: 100 + decks.length, name: deckName }) - 1];
      const id = nextId++;
      const names = models[model].fields;
      notes.set(id, { id, guid: guid || `g${id}`, mid: model, mod: clock, tags: [...tags], fields: names.map((n) => fields[n] ?? ""),
        cards: cards || Array.from({ length: models[model].cards }, (_, ord) => ({ ord, deck: deck.id, home: 0, type: 0, queue: 0, due: ord + 1, homeDue: 0, interval: 0, reps: 0, lapses: 0, last: null })) });
      return notes.get(id);
    },
    inDeck(name) {
      const ids = new Set(decks.filter((d) => d.name === name || d.name.startsWith(`${name}::`)).map((d) => d.id));
      return [...notes.values()].filter((n) => n.cards.some((c) => ids.has(c.deck) || ids.has(c.home)));
    },
    async status() { return { installed, version: old ? "2.23.3" : "2.25.1", known: installed, permission: installed ? permission : "prompt" }; },
    async requestAccess() { calls.push(["requestAccess"]); permission = "granted"; return droid.status(); },
    async readDeck({ deck }) {
      calls.push(["readDeck", deck]);
      const mine = droid.inDeck(deck);
      const used = {};
      for (const n of mine) used[n.mid] = models[n.mid];
      const ours = decks.filter((d) => d.name === deck || d.name.startsWith(`${deck}::`));
      const ids = new Set(ours.map((d) => d.id));
      return { decks: ours, models: used, notes: mine.map(({ cards, ...n }) => structuredClone(n)),
        // like AnkiDroid's own search: only the cards that are in the deck (or out on loan from it)
        cards: old ? null : mine.flatMap((n) => n.cards.filter((c) => ids.has(c.deck) || ids.has(c.home)).map((c) => ({ note: n.id, ...c }))) };
    },
    async noteCards({ id }) { calls.push(["noteCards", id]); return { cards: notes.get(id).cards.map((c) => ({ ord: c.ord, deck: c.deck })) }; },
    async probe() { return { cards: [] }; },
    async marked() {
      return { notes: [...notes.values()].filter((n) => n.guid.startsWith("tk-v") || n.tags.some((t) => t.startsWith("tamkeen-id::")))
        .map((n) => ({ id: n.id, guid: n.guid, tags: [...n.tags] })) };
    },
    async prepare({ deck, model }) {
      calls.push(["prepare", deck]);
      let d = decks.find((x) => x.name.toLowerCase() === deck.toLowerCase());
      const madeDeck = !d;
      if (!d) decks.push(d = { id: 100 + decks.length, name: deck });
      let id = Object.keys(models).find((k) => models[k].name === model.name);
      const madeModel = !id;
      if (!id) { id = String(1000 + Object.keys(models).length); models[id] = { name: model.name, fields: [...model.fields], cards: 1, css: model.css }; }
      return { deckId: d.id, modelId: Number(id), fields: models[id].fields, madeDeck, madeModel };
    },
    async addNote({ deckId, modelId, fields, tags }) {
      assert.equal(fields.length, models[modelId].fields.length, "one value per field");
      const id = nextId++;
      notes.set(id, { id, guid: `rand${id}`, mid: modelId, mod: clock, tags: [...tags], fields: [...fields],
        cards: [{ ord: 0, deck: deckId, home: 0, type: 0, queue: 0, due: 1, homeDue: 0, interval: 0, reps: 0, lapses: 0, last: null }] });
      calls.push(["addNote", id]);
      return { id };
    },
    async updateNote({ deck, id, front, back, addTags = [] }) {
      calls.push(["updateNote", id]);
      const n = notes.get(id);
      if (!droid.inDeck(deck).includes(n)) return { changed: false, refused: true };
      const names = models[n.mid].fields;
      let changed = false, tagged = false;
      for (const [name, value] of [["Front", front], ["Back", back]]) {
        if (value == null || !names.includes(name) || n.fields[names.indexOf(name)] === value) continue;
        n.fields[names.indexOf(name)] = value;
        changed = true;
      }
      for (const t of addTags) if (!n.tags.map((x) => x.toLowerCase()).includes(t.toLowerCase())) { n.tags.push(t); tagged = true; }
      if (changed || tagged) n.mod = clock;
      return { changed, tagged };
    },
    async deleteNote({ deck, id }) {
      calls.push(["deleteNote", id]);
      if (!droid.inDeck(deck).includes(notes.get(id))) return { deleted: false, refused: true };
      notes.delete(id);
      return { deleted: true };
    },
    async addMedia({ name, data }) { media.push([name, data.length]); return { name: name.replace(/(\.\w+)$/, "_77$1") }; },
  };
  return droid;
}

function world(options = {}) {
  const droid = options.noDroid ? null : fakeDroid(options);
  const vocab = [];
  const settings = { anki_sync: true, anki_deck: "Tamkeen", anki_delete_ok: false, study_language: "ar" };
  let saved = null, changes = 0, clock = NOW;
  const env = {
    droid, vocab: () => vocab, settings,
    saveSettings: async (patch) => Object.assign(settings, patch),
    load: async () => saved && structuredClone(saved), save: async (state) => { saved = structuredClone(state); },
    changed: () => { changes++; }, emit: () => {}, now: () => clock,
    source: { asset: async (path) => ({ text: async () => `[${path}] _tamkeen-naskh.woff2`, arrayBuffer: async () => new ArrayBuffer(8) }), audioFor: async () => null },
  };
  const sync = createAnkiSync(env);
  let n = 0;
  const w = {
    droid, vocab, settings, sync, env,
    changes: () => changes,
    tick(seconds = 60) { clock += seconds; droid && droid.tick(seconds); },
    save(text, meaning, more = {}) {
      const v = { uid: `v${String(++n).padStart(20, "0")}`, text, meaning, notes: "", translation: "", sentence: "", deleted: 0,
        created_at: clock, updated_at: clock, ...more };
      vocab.push(v);
      return v;
    },
    edit(v, patch) { Object.assign(v, patch, { updated_at: clock }); },
    card(v) { return droid.inDeck("Tamkeen").filter((x) => x.tags.includes(`tamkeen-id::${v.uid}`) || x.guid === `tk-${v.uid}`); },
  };
  if (droid) {
    // The second deck, which must come out untouched: the same word, and Tamkeen's own tag.
    droid.make("Other", { Front: "book", Back: "كتاب" });
    droid.make("Other", { Front: "pen", Back: "قلم" }, { tags: ["tamkeen"] });
    w.other = () => JSON.stringify(droid.inDeck("Other"));
    w.before = w.other();
    w.untouched = () => {
      assert.equal(w.other(), w.before, "the other deck was changed");
      const outside = new Set(droid.inDeck("Other").map((x) => x.id));
      for (const [name, id] of droid.calls) assert.ok(!outside.has(id), `${name} was asked about a note in another deck`);
    };
  }
  return w;
}

test("new words become cards in the Tamkeen deck, carrying their id as a tag", async () => {
  const w = world();
  const a = w.save("كتاب", "book", { sentence: "هذا كتاب جميل" });
  w.save("قلم", "pen");
  const st = await w.sync.run();
  assert.deepEqual(st.last.to_anki, { added: 2, changed: 0, removed: 0 });
  const [card] = w.card(a);
  assert.deepEqual(card.tags, ["tamkeen", `tamkeen-id::${a.uid}`]);
  const names = w.droid.models[card.mid].fields;
  assert.deepEqual(names, FIELDS);
  assert.deepEqual([card.fields[0], card.fields[1]], ankiFields(a), "the same card the computer makes");
  assert.equal(card.fields[names.indexOf("image")], "", "the image field is left empty");
  assert.equal(st.linked, 2, "the second look linked them");
  assert.equal(w.droid.calls.filter(([c]) => c === "addNote").length, 2);
  assert.equal(w.droid.media[0][0], "_tamkeen-naskh.woff2", "the card font went along");
  assert.match(w.droid.models[card.mid].css, /_tamkeen-naskh_77\.woff2/, "the layout names the font as AnkiDroid stored it");
  await w.sync.run();
  assert.equal(w.droid.calls.filter(([c]) => c === "addNote").length, 2, "a second sync makes nothing new");
  w.untouched();
});

test("edits travel both ways, and only Front and Back are ever sent", async () => {
  const w = world();
  const a = w.save("كتاب", "book", { notes: "Dictionary form: كِتَاب · noun · common" });
  await w.sync.run();
  const [card] = w.card(a);
  const image = w.droid.models[card.mid].fields.indexOf("image");
  card.fields[image] = "<img src=mine.jpg>";   // the learner adds a picture in AnkiDroid
  w.tick();
  w.edit(a, { meaning: "a book" });
  let st = await w.sync.run();
  assert.equal(st.last.to_anki.changed, 1);
  assert.equal(card.fields[0], "a book");
  assert.equal(card.fields[image], "<img src=mine.jpg>", "the picture is still there");
  w.tick();
  card.fields[1] = card.fields[1].replace("Note: common", "Note: very common");
  card.mod += 120;
  st = await w.sync.run();
  assert.equal(a.notes, "noun · Dictionary form: كِتَاب · very common");
  assert.deepEqual(st.last.to_tamkeen, { added: 0, changed: 1, removed: 0 });
  assert.ok(w.changes() >= 1, "the change is handed on to Drive sync");
  for (const [name, , extra] of w.droid.calls) assert.equal(extra, undefined, name);
  w.untouched();
});

test("a hand-made card becomes a word; one of an existing word is linked, not doubled", async () => {
  const w = world();
  const a = w.save("كتاب", "book");
  w.droid.make("Tamkeen", { Front: "the book", Back: "كِتَاب" });
  const made = w.droid.make("Tamkeen", { Front: "window", Back: "شباك<br>افتح الشباك" });
  await w.sync.run();
  assert.equal(w.droid.inDeck("Tamkeen").length, 2, "no second card for the word that has a hand-made one");
  const fresh = w.vocab.find((v) => v.text === "شباك");
  assert.equal(fresh.uid, uidFromGuid(made.guid), "the uid the computer would give it too");
  assert.equal(fresh.meaning, "window");
  assert.equal(fresh.sentence, "افتح الشباك");
  assert.ok(made.tags.includes(`tamkeen-id::${fresh.uid}`));
  assert.equal(w.card(a)[0].fields[0], "the book", "the hand-made card keeps its own text");
  assert.equal(a.meaning, "book");
  w.untouched();
});

test("a card made on the computer (guid) and synced over is recognised, not made again", async () => {
  const w = world();
  const a = w.save("كتاب", "book");
  const [front, back] = ankiFields(a);
  w.droid.make("Tamkeen", { Front: front, Back: back }, { guid: `tk-${a.uid}`, tags: ["tamkeen", `tamkeen-id::${a.uid}`] });
  const st = await w.sync.run();
  assert.equal(w.droid.calls.filter(([c]) => c === "addNote").length, 0);
  assert.equal(st.linked, 1);
  w.untouched();
});

test("deleting a word waits for the learner, then really deletes the card", async () => {
  const w = world();
  const a = w.save("كتاب", "book");
  await w.sync.run();
  assert.equal(await w.sync.linked(a.uid), true);
  w.tick();
  w.edit(a, { deleted: 1 });
  let st = await w.sync.run();
  assert.deepEqual(st.held.map((x) => x.text), ["كتاب"]);
  assert.equal(w.card(a).length, 1, "nothing is deleted before the learner agrees");
  st = await w.sync.resolve("held", "delete");
  assert.equal(st.delete_ok, true);
  st = await w.sync.run();
  assert.equal(st.last.to_anki.removed, 1);
  assert.equal(w.card(a).length, 0);
  w.untouched();
});

test("a card that has gone from AnkiDroid is missing, never a deletion", async () => {
  const w = world();
  const a = w.save("كتاب", "book"), b = w.save("قلم", "pen");
  await w.sync.run();
  for (const n of w.droid.inDeck("Tamkeen")) w.droid.notes.delete(n.id);  // the whole deck is emptied
  w.settings.anki_delete_ok = true;
  let st = await w.sync.run();
  assert.equal(a.deleted, 0);
  assert.equal(b.deleted, 0);
  assert.deepEqual(st.missing.map((x) => x.text).sort(), ["قلم", "كتاب"]);
  assert.equal(w.droid.calls.filter(([c]) => c === "addNote").length, 2, "and the cards are not quietly made again");
  st = await w.sync.resolve("missing", "recreate");
  st = await w.sync.run();
  assert.equal(w.droid.inDeck("Tamkeen").length, 2);
  // ...or the other answer: remove the words too.
  for (const n of w.droid.inDeck("Tamkeen")) w.droid.notes.delete(n.id);
  await w.sync.run();
  await w.sync.resolve("missing", "remove");
  assert.equal(a.deleted, 1);
  w.untouched();
});

test("a card moved to another deck is left where it is", async () => {
  const w = world();
  const a = w.save("كتاب", "book");
  await w.sync.run();
  const [card] = w.card(a);
  w.droid.decks.push({ id: 60, name: "Spare" });
  card.cards[0].deck = 60;
  const st = await w.sync.run();
  assert.equal(st.moved, 1);
  assert.equal(w.droid.calls.filter(([c]) => c === "addNote").length, 1);
  assert.equal(a.deleted, 0);
});

test("a note with a card in another deck is not touched", async () => {
  const w = world();
  const n = w.droid.make("Tamkeen", { Front: "chair", Back: "كرسي" }, { model: 901 });
  n.cards[1].deck = 50;
  w.before = w.other();
  const st = await w.sync.run();
  assert.equal(st.skipped, 1);
  assert.equal(w.vocab.length, 0);
  assert.deepEqual(n.tags, []);
});

test("schedules are read where AnkiDroid offers them, and never written", async () => {
  const w = world();
  const a = w.save("كتاب", "book");
  await w.sync.run();
  const [card] = w.card(a);
  Object.assign(card.cards[0], { type: 2, queue: 2, due: 4321, interval: 12, reps: 9, lapses: 2, last: NOW - 2 * 86400 });
  const before = JSON.stringify(card.cards);
  await w.sync.run();
  const p = (await w.sync.progress())[a.uid];
  assert.equal(p.state, "review");
  assert.equal(p.due_days, 10, "last reviewed two days ago, every twelve days");
  assert.deepEqual([p.interval, p.reps, p.lapses, p.right, p.wrong, p.history], [12, 9, 2, 7, 2, null]);
  assert.match(p.due, /^\d{4}-\d\d-\d\d$/);
  assert.equal(JSON.stringify(card.cards), before);
});

test("an older AnkiDroid still syncs words, just without schedules", async () => {
  const w = world({ old: true });
  const a = w.save("كتاب", "book");
  const st = await w.sync.run();
  assert.equal(w.card(a).length, 1);
  assert.equal(st.schedules, false);
  assert.deepEqual(await w.sync.progress(), {});
  w.untouched();
});

test("without AnkiDroid, or without its permission, nothing happens and Settings can say why", async () => {
  let w = world({ installed: false });
  w.save("كتاب", "book");
  let st = await w.sync.run();
  assert.match(st.problem, /not installed/);
  assert.equal(w.droid.calls.length, 0);

  w = world({ permission: "denied" });
  w.save("كتاب", "book");
  st = await w.sync.run();
  assert.match(st.problem, /not been allowed/);
  assert.equal(w.droid.calls.length, 0, "a sync in the background never brings up Android's question");
  st = await w.sync.run({ ask: true });
  assert.equal(st.problem, "");
  assert.equal(w.droid.inDeck("Tamkeen").length, 1, "pressing Sync now asks, and then syncs");

  w = world({ noDroid: true });
  st = await w.sync.run();
  assert.match(st.problem, /installed app/);
});

test("switched off, it does nothing at all", async () => {
  const w = world();
  w.settings.anki_sync = false;
  w.save("كتاب", "book");
  await w.sync.run();
  assert.equal(w.droid.calls.length, 0);
});

test("days are counted on the local calendar", () => {
  assert.equal(dayNumber(NOW + 86400) - dayNumber(NOW), 1);
});

test("the learner's own notes, added to a card in AnkiDroid, come back to the word", async () => {
  const w = world();
  const a = w.save("كتاب", "book", { notes: "common" });
  await w.sync.run();
  const [card] = w.card(a);
  w.tick();
  card.fields[1] += "<br>Note: rhymes with kebab";   // a second "Note:" is the learner's own
  card.mod += 120;
  await w.sync.run();
  assert.equal(a.memo, "rhymes with kebab");
  assert.equal(a.notes, "common");
  w.untouched();
});
