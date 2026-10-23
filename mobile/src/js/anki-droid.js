// The phone's side of the two-way Anki sync: keeps the saved words and the Tamkeen decks in
// AnkiDroid (one per language being learned) in step.
//
// The rules are in anki-sync.js (the same ones the computer uses) and know nothing about
// AnkiDroid. This file feeds them: it reads the deck through the small native plugin
// (android/.../AnkiDroidPlugin.java), applies Tamkeen's share of the plan to the words kept on
// the phone, and asks the plugin to make AnkiDroid's share. What it is given to work with comes
// in as `env`, so the whole thing can be run in a test against a stand-in for AnkiDroid.
//
// What AnkiDroid lets another app do, and what follows from it (read from AnkiDroid's own
// source, October 2026):
//   - A note's guid cannot be set. A card made here carries its word's id as a tag instead
//     ("tamkeen-id::<uid>"), which Anki's own sync carries to the computer.
//   - Notes can be added, changed and deleted, so deletions are real here too.
//   - There is no record of what was deleted in AnkiDroid. A card that has gone is therefore
//     "missing", never a deletion: the learner is asked what to do.
//   - A card's schedule (due, interval, how often answered and failed) can be read from
//     AnkiDroid 2.24 on; older versions report none. Single answers cannot be read on any
//     version, so "right" and "wrong" are worked out from the counts.

import { deckMap, deckProblem, defaultDeck, firstDecks, misplacedCards, noteUid, plan, progressRecord } from "./anki-sync.js";
import { ankiFields } from "./shared-logic.js";
import { clipRanges, cutClips } from "./anki-export.js";

export const FIELDS = ["Front", "Back", "image", "TTS Input"];
export const LAYOUT = "Tamkeen";
const FONT = "_tamkeen-naskh.woff2";
const ROUNDS = 6;
const CREATE_PER_ROUND = 150;
const zero = () => ({ to_anki: { added: 0, changed: 0, removed: 0 }, to_tamkeen: { added: 0, changed: 0, removed: 0 } });

/** A moment as a count of local calendar days, to tell how many days away a due date is. */
export function dayNumber(seconds) {
  const d = new Date(seconds * 1000);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

const base64 = (bytes) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/**
 * The deck's notes in the shape the rules want, the ids of those notes, and how many were left
 * out because one of their cards sits in another deck.
 */
export async function readDeck(droid, deck, now) {
  const r = await droid.readDeck({ deck });
  const decks = new Set(r.decks.map((d) => d.id));
  const cards = new Map();
  for (const c of r.cards || []) cards.set(c.note, [...(cards.get(c.note) || []), c]);
  for (const list of cards.values()) list.sort((a, b) => a.ord - b.ord);

  // Which of AnkiDroid's own day numbers is today? Only a card can tell: look for one due today,
  // tomorrow, yesterday... and count back from its due number. (Used for cards that carry no
  // "last reviewed" time; newer cards have one, which is simpler.)
  let today = null;
  const needsToday = (r.cards || []).some((c) => (c.queue === 2 || c.queue === 3) && c.last == null);
  if (needsToday && droid.probe) {
    for (const k of [0, 1, -1, 2, -2, 3, 7, -7, 14, 30]) {
      try {
        const hit = (await droid.probe({ deck, extra: `prop:due=${k}` })).cards.find((c) => c.queue === 2 && !c.home);
        if (hit) { today = hit.due - k; break; }
      } catch { break; }
    }
  }
  const dueDays = (c) => {
    if (c.queue === 1) return 0;
    if (!(c.queue === 2 || c.queue === 3 || (c.queue < 0 && c.type === 2))) return null;
    if (today != null) return (c.home && c.homeDue ? c.homeDue : c.due) - today;
    if (c.last != null && c.interval > 0) return dayNumber(c.last) + c.interval - dayNumber(now);
    return null;
  };

  const notes = [];
  let outside = 0;
  for (const n of r.notes) {
    const model = r.models[String(n.mid)] || {};
    const mine = cards.get(n.id) || [];
    if ((model.cards || 1) > 1 || (r.cards && !mine.length)) {
      // A note with several cards: all of them must be in the deck (or out on loan to a
      // filtered deck from it), or the note is not Tamkeen's to change.
      const allowed = new Set([...decks, ...mine.map((c) => c.deck)]);
      const all = (await droid.noteCards({ id: n.id })).cards;
      if (!all.length || all.some((c) => !allowed.has(c.deck))) { outside++; continue; }
    }
    const names = model.fields || [];
    const at = (name) => (names.includes(name) ? n.fields[names.indexOf(name)] ?? "" : null);
    const first = mine[0];
    notes.push({
      id: n.id, guid: n.guid, mod: n.mod, tags: n.tags, front: at("Front"), back: at("Back"),
      reps: r.cards ? mine.reduce((sum, c) => sum + (c.reps || 0), 0) : null,
      progress: first ? progressRecord(first.type, first.queue, dueDays(first), first.interval, first.reps, first.lapses) : null,
    });
  }
  return { notes, ids: new Set(notes.map((n) => n.id)), outside, schedules: Boolean(r.cards) };
}

/** All the Tamkeen decks read together: each note with its deck's language, which deck each note is
 * in (by id), and the rest as readDeck gives it for one deck. */
export async function readDecks(droid, decks, now) {
  const notes = [], ids = new Set(), deckOf = new Map();
  let outside = 0, schedules = true;
  for (const [code, name] of Object.entries(decks)) {
    const found = await readDeck(droid, name, now);
    outside += found.outside;
    schedules = schedules && found.schedules;
    for (const n of found.notes) {
      if (ids.has(n.id)) continue;
      notes.push({ ...n, language: code });
      ids.add(n.id);
      deckOf.set(n.id, name);
    }
  }
  return { notes, ids, deckOf, outside, schedules };
}

/** The words whose card carries Tamkeen's mark but is no longer in any of the decks (moved by the learner). */
export async function movedAway(droid, inDeck) {
  const uids = new Set();
  for (const n of (await droid.marked()).notes) {
    if (inDeck.has(n.id)) continue;
    const uid = noteUid(n);
    if (uid) uids.add(uid);
  }
  return [...uids].sort();
}

/** Each word's audio clips (Ogg Opus, as in a deck exported on the phone): { uid: { word, sentence } }. */
export async function wordClips(words, source) {
  const groups = new Map(), clips = {};
  if (!source) return clips;
  for (const v of words) {
    const audio = await source.audioFor(v);
    if (!audio) continue;
    const w = audio.times ? { ...v, ...audio.times } : v;  // a card's voice: its own times in its file
    if (!Object.keys(clipRanges(w)).length) continue;
    if (!groups.has(audio.key)) groups.set(audio.key, { load: audio.load, words: [] });
    groups.get(audio.key).words.push(w);
  }
  for (const { load, words: together } of groups.values()) {
    try {
      const blob = await load();
      if (blob) Object.assign(clips, cutClips(new Uint8Array(await blob.arrayBuffer()), together));
    } catch (e) {
      console.warn("No audio for some new Anki cards:", e);  // those cards go without sound
    }
  }
  return clips;
}

/**
 * env:
 *   droid         the AnkiDroid plugin (or null in a plain browser)
 *   vocab()       the saved words, tombstones included (the live list: changed in place)
 *   settings      the app's settings object (anki_sync, anki_decks, anki_deck, anki_delete_ok, learning_languages)
 *   languages     { names: {code: English name}, valid(code), study() } (optional: Arabic only without it)
 *   saveSettings  (patch) => Promise
 *   load(), save(state)   this file's own record: links, progress and what Settings shows
 *   changed()     called after the words were changed (store them, and sync with Drive)
 *   emit(name, data)      tell the screens something changed
 *   now()         seconds
 *   source        { audioFor(word), asset(path) } for new cards' audio and the card layout; may be set later
 */
export function createAnkiSync(env) {
  let busy = false;
  let record = null;

  const data = async () => {
    if (!record) record = { links: {}, progress: {}, state: {}, ...((await env.load()) || {}) };
    return record;
  };
  const langs = () => env.languages || { names: { ar: "Arabic" }, valid: (c) => typeof c === "string" && !!c, study: () => "ar" };

  /** Each language's deck, by language code ("es" -> "Tamkeen – Spanish"). The first time this is
   * asked, the single deck there used to be keeps its name for the language most words are in. */
  function deckNames() {
    const L = langs();
    const counts = {};
    for (const v of env.vocab()) if (!v.deleted && L.valid(v.language)) counts[v.language] = (counts[v.language] || 0) + 1;
    let stored = env.settings.anki_decks;
    if (!stored || typeof stored !== "object") {
      stored = firstDecks(env.settings.anki_deck || "", counts);
      Promise.resolve(env.saveSettings({ anki_decks: stored })).catch((e) => console.warn(e));
    }
    const codes = new Set([...Object.keys(counts), ...(env.settings.learning_languages || []).filter(L.valid), L.study()]);
    return deckMap(stored, [...codes].sort(), L.names);
  }
  const deckList = (decks) => Object.entries(decks).map(([language, name]) => ({ language, name }));
  const word = (uid) => env.vocab().find((v) => v.uid === uid);
  const named = (uids) => (uids || []).map(word).filter(Boolean).map((v) => ({ uid: v.uid, text: v.text, meaning: v.meaning }));

  /** Is AnkiDroid there and are we allowed in? Returns "" when ready, else what is in the way. */
  async function ready(ask) {
    if (!env.droid) return "The sync with AnkiDroid works in the installed app.";
    let st = await env.droid.status();
    if (!st.installed) return "AnkiDroid is not installed on this phone.";
    if (st.permission !== "granted" && ask) st = await env.droid.requestAccess();
    if (st.permission !== "granted") {
      return st.known === false
        ? "Android does not know AnkiDroid's permission yet. Open AnkiDroid once, then try again; if that does not help, install Tamkeen again (Android only offers the permission to apps installed after AnkiDroid)."
        : "Tamkeen has not been allowed to use AnkiDroid's cards. Tap Sync now and choose Allow, or allow it in Android's settings for Tamkeen (Permissions).";
    }
    return "";
  }

  async function applyToAnki(decks, found, made, state) {
    const done = { added: 0, changed: 0, removed: 0, tagged: 0, failed: 0 };
    const creates = made.anki.create.slice(0, CREATE_PER_ROUND);
    const deckOf = (id) => found.deckOf.get(id) || "";
    if (creates.length) {
      const source = env.source;
      const text = async (path) => (source ? (await source.asset(path)).text() : "");
      let css = await text("anki-card/style.css");
      if (source && !state.font) {
        try {  // AnkiDroid stores the font under a name of its own choosing: the layout must use that name
          const font = new Uint8Array(await (await source.asset("fonts/NotoNaskhArabic.woff2")).arrayBuffer());
          state.font = (await env.droid.addMedia({ name: FONT, data: base64(font) })).name;
        } catch (e) { console.warn("The card font could not be given to AnkiDroid:", e); }
      }
      if (state.font) css = css.split(FONT).join(state.font);
      const model = { name: LAYOUT, fields: FIELDS, css, front: await text("anki-card/front.html"), back: await text("anki-card/back.html") };
      const prepared = new Map();  // deck name -> what prepare() said: the deck and layout to use
      const clips = await wordClips(creates.map((c) => word(c.uid)).filter(Boolean), source);
      for (const c of creates) {
        try {
          let sounds = "";
          for (const [part, tail] of [["word", "w"], ["sentence", "s"]]) {
            const bytes = (clips[c.uid] || {})[part];
            if (!bytes) continue;
            try {
              sounds += `[sound:${(await env.droid.addMedia({ name: `tk-${c.uid}-${tail}.ogg`, data: base64(bytes) })).name}]`;
            } catch (e) { console.warn("A clip could not be given to AnkiDroid:", e); }
          }
          const values = { Front: c.front, Back: c.back, "TTS Input": sounds };
          const deck = decks[c.language] || defaultDeck(c.language, langs().names);
          if (!prepared.has(deck)) prepared.set(deck, await env.droid.prepare({ deck, model }));
          const prep = prepared.get(deck);
          await env.droid.addNote({ deckId: prep.deckId, modelId: prep.modelId, tags: c.tags,
            fields: prep.fields.map((name) => values[name] ?? "") });
          done.added++;
        } catch (e) { done.failed++; console.warn("A card could not be made:", e); }
      }
    }
    for (const u of made.anki.update) {
      try {
        const r = await env.droid.updateNote({ deck: deckOf(u.note), id: u.note, ...("front" in u ? { front: u.front } : {}), ...("back" in u ? { back: u.back } : {}) });
        if (r.changed) done.changed++;
      } catch (e) { done.failed++; console.warn(e); }
    }
    for (const t of made.anki.tag) {
      try { if ((await env.droid.updateNote({ deck: deckOf(t.note), id: t.note, addTags: t.add })).tagged) done.tagged++; }
      catch (e) { done.failed++; console.warn(e); }
    }
    for (const d of made.anki.delete) {
      try { if ((await env.droid.deleteNote({ deck: deckOf(d.note), id: d.note })).deleted && d.why === "word") done.removed++; }
      catch (e) { done.failed++; console.warn(e); }
    }
    return { done, more: made.anki.create.length > creates.length };
  }

  function applyToTamkeen(made, now) {
    const list = env.vocab();
    for (const w of made.tamkeen.add) {
      if (word(w.uid)) continue;
      list.push({ uid: w.uid, episode_uid: null, text: w.text, sentence: w.sentence, start: null, end: null,
        sent_start: null, sent_end: null, meaning: w.meaning, notes: w.notes, translation: w.translation,
        language: w.language,  // the language of the deck the card was made in
        episode_title: "", folders: [], deleted: 0, created_at: w.created_at, updated_at: now });
    }
    for (const change of made.tamkeen.update) {
      const v = word(change.uid);
      if (v) Object.assign(v, change.set, { updated_at: now });
    }
    for (const uid of made.tamkeen.restore) { const v = word(uid); if (v) Object.assign(v, { deleted: 0, updated_at: now }); }
    for (const uid of made.tamkeen.remove) { const v = word(uid); if (v) Object.assign(v, { deleted: 1, updated_at: now }); }
    return made.tamkeen.add.length + made.tamkeen.update.length + made.tamkeen.restore.length + made.tamkeen.remove.length > 0;
  }

  /** Sync now. `ask` = the learner pressed the button, so Android may show its permission question. */
  async function run({ ask = false } = {}) {
    const rec = await data();
    if (!env.settings.anki_sync || busy) return status();
    busy = true;
    env.emit("anki", { syncing: true });
    const state = rec.state;
    try {
      state.problem = await ready(ask);
      if (state.problem) return status();
      const decks = deckNames();
      state.problem = deckProblem(decks);
      if (state.problem) return status();
      const total = zero();
      for (let round = 1; round <= ROUNDS; round++) {
        const now = env.now();
        const found = await readDecks(env.droid, decks, now);
        // Every word can carry the learner's own notes ("memo"); one that has none yet simply lacks the key.
        const words = env.vocab().map((v) => ("memo" in v ? v : { ...v, memo: "" }));
        const made = plan(words, found.notes, rec.links, ankiFields, {
          now, deletedNotes: {}, elsewhere: await movedAway(env.droid, found.ids),
          deleteOk: Boolean(env.settings.anki_delete_ok), language: langs().study(),
        });
        if (applyToTamkeen(made, now)) env.changed();
        const today = new Date(now * 1000);
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        rec.links = made.links;
        rec.progress = {};
        for (const [uid, p] of Object.entries(made.progress)) {
          rec.progress[uid] = { ...p, seen: iso(today),
            due: p.due_days == null ? null : iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + p.due_days)) };
        }
        const { done, more } = await applyToAnki(decks, found, made, state);
        for (const k of ["added", "changed", "removed"]) {
          total.to_tamkeen[k] += made.counts.to_tamkeen[k];
          total.to_anki[k] += done[k];
        }
        Object.assign(state, { last_sync: now, last: total, held: made.held, missing: made.missing, moved: made.moved,
          duplicates: made.duplicates, skipped: made.skipped + found.outside, linked: Object.keys(made.links).length,
          schedules: found.schedules, failed: done.failed });
        await env.save(rec);
        if (!(done.added || done.changed || done.removed || done.tagged || more)) break;  // else look again, to link what was made
      }
      if (Object.values(total).some((side) => Object.values(side).some(Boolean))) state.last_change = { at: state.last_sync, ...total };
    } catch (e) {
      state.problem = e && e.code === "NO_PERMISSION" ? "Tamkeen has not been allowed to use AnkiDroid's cards."
        : `The sync with AnkiDroid stopped: ${(e && e.message) || e}`;
    } finally {
      busy = false;
      await env.save(rec);
      env.emit("anki", { synced: true });
    }
    return status();
  }

  /** Everything Settings shows about the sync (the same shape as the computer's /api/anki/sync/status). */
  async function status() {
    const { state } = await data();
    return {
      enabled: Boolean(env.settings.anki_sync), deck: deckNames()[langs().study()], decks: deckList(deckNames()),
      deck_problem: deckProblem(deckNames()), delete_ok: Boolean(env.settings.anki_delete_ok),
      last_sync: state.last_sync || null, last: state.last || zero(), last_change: state.last_change || null,
      linked: state.linked || 0, profile: "", other: null, held: named(state.held), missing: named(state.missing),
      moved: (state.moved || []).length, duplicates: state.duplicates || 0, skipped: state.skipped || 0,
      phone: true, busy, problem: state.problem || "", schedules: state.schedules !== false, failed: state.failed || 0,
      last_move: state.last_move || null, move_pending: false,
    };
  }

  async function options({ enabled, deck, decks, delete_ok: deleteOk } = {}) {
    const patch = {};
    if (enabled != null) patch.anki_sync = Boolean(enabled);
    const names = { ...deckNames() }, before = JSON.stringify(names);
    if (typeof deck === "string" && deck.trim()) names[langs().study()] = deck.trim().slice(0, 100);
    for (const [code, name] of Object.entries(decks || {})) {
      if (langs().valid(code) && typeof name === "string" && name.trim()) names[code] = name.trim().slice(0, 100);
    }
    if (JSON.stringify(names) !== before) {
      const problem = deckProblem(names);
      if (problem) throw new Error(problem);
      patch.anki_decks = names;
    }
    if (deleteOk != null) patch.anki_delete_ok = Boolean(deleteOk);
    if (Object.keys(patch).length) await env.saveSettings(patch);
    env.emit("anki", { synced: false });
    return status();
  }

  /** The learner's answer about held deletions or missing cards (see `resolve` in app/anki_bridge.py). */
  async function resolve(what, choice) {
    const rec = await data();
    const now = env.now();
    const each = (uids, fn) => { for (const uid of uids || []) { const v = word(uid); if (v) fn(v); } };
    if (what === "held" && choice === "delete") await env.saveSettings({ anki_delete_ok: true });
    else if (what === "held" && choice === "restore") {
      each(rec.state.held, (v) => Object.assign(v, { deleted: 0, updated_at: now }));
      rec.state.held = [];
    } else if (what === "missing" && (choice === "remove" || choice === "recreate")) {
      if (choice === "remove") each(rec.state.missing, (v) => Object.assign(v, { deleted: 1, updated_at: now }));
      for (const uid of rec.state.missing || []) delete rec.links[uid];
      rec.state.missing = [];
    } else throw new Error("Unknown choice.");
    env.changed();
    await env.save(rec);
    env.emit("anki", { synced: false });
    return status();
  }

  // ----- "Move Anki cards to their language's deck" (the Vocab page's ⋯ menu) -----

  /** The cards that sit in another language's deck than their word's, read from AnkiDroid now. */
  async function misplaced() {
    const rec = await data(), decks = deckNames();
    const found = await readDecks(env.droid, decks, env.now());
    const linkedTo = new Map(Object.entries(rec.links).map(([uid, link]) => [link.note, uid]));
    const links = {};
    for (const n of found.notes) {
      const uid = noteUid(n) || linkedTo.get(n.id);
      if (uid) links[uid] = { note: n.id };
    }
    return { decks, found, list: misplacedCards(env.vocab(), found.notes, links).filter((m) => decks[m.to]) };
  }

  /** How many cards would move, and to which decks (the same shape as the computer's /api/anki/move). */
  async function moveInfo() {
    const rec = await data();
    const base = { enabled: Boolean(env.settings.anki_sync), synced: true, count: 0, moves: {}, pending: false,
      last: rec.state.last_move || null, phone: true };
    if (!base.enabled) return base;
    const problem = await ready(false) || deckProblem(deckNames());
    if (problem) return { ...base, problem };
    const { decks, list } = await misplaced();
    for (const m of list) base.moves[decks[m.to]] = (base.moves[decks[m.to]] || 0) + 1;
    return { ...base, count: list.length };
  }

  /** Move them now (AnkiDroid keeps each card's review history). Safe to run again: only cards still in
   * another language's deck are touched. */
  async function moveCards() {
    if (busy) throw new Error("A sync with AnkiDroid is running. Try again in a moment.");
    const problem = await ready(true) || deckProblem(deckNames());
    if (problem) throw new Error(problem);
    busy = true;
    let moved = 0, skipped = 0;
    try {
      const { decks, found, list } = await misplaced();
      for (const m of list) {
        try {
          const r = await env.droid.moveNote({ deck: found.deckOf.get(m.note), id: m.note, to: decks[m.to] });
          if (r.moved) moved++;
          else skipped++;
        } catch (e) { skipped++; console.warn(e); }
      }
      const rec = await data();
      rec.state.last_move = { at: env.now(), moved, skipped };
      await env.save(rec);
    } finally {
      busy = false;
      env.emit("anki", { synced: false });
    }
    return { ...(await moveInfo()), moved, skipped };
  }

  return {
    run, status, options, resolve, deckNames, moveInfo, moveCards,
    progress: async () => ({ ...(await data()).progress }),
    linked: async (uid) => Boolean(((await data()).links[uid] || {}).note),
    setSource: (source) => { env.source = source; },
  };
}
