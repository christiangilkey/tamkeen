// Two-way sync between the saved words and the Anki decks (one per language): the rules, and nothing else.
//
// This is app/anki_sync.py line for line, for the phone (which syncs with AnkiDroid through
// anki-droid.js). The rules themselves are explained at the top of that file. Both must give the
// same answers: tests/fixtures/anki_sync_parity.json is written by the Python and checked here.

import { hideAnswer, normalize } from "./shared-logic.js";

export const TAG = "tamkeen";
export const ID_TAG = "tamkeen-id::";
export const DUPLICATE_TAG = "tamkeen-duplicate";
export const GUID_PREFIX = "tk-";
export const DEFAULT_DECK = "Tamkeen";

const UID = /^v[0-9a-f]{1,40}$/;
const DROP = /<(script|style)\b[^>]*>.*?<\/\1\s*>/gis;
const BREAK = /<\s*br\s*\/?\s*>|<\/?\s*(?:div|p|li|ul|ol)\b[^>]*>/gi;
const MARKUP = /<[^>]*>/g;
const SOUND = /\[sound:[^\]]*\]/g;
const ENTITY = /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g;
const SPACES = /[ \t\r\f\v ]+/g;
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const GRAMMAR = /^<i>\s*\((.*)\)\s*<\/i>$/is;
const BRACKETED = /^[^\[\]]*(?:\[[^\[\]]+\][^\[\]]*)+$/;
const IN_BRACKETS = /\[([^\[\]]+)\]/;
const MARKED = /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u;
const NOTE = /^note:/i;
const SCRIPTS = { ar: /[؀-ۿݐ-ݿ]/, ru: /[Ѐ-ӿ]/, ja: /[぀-ヿ一-鿿]/, zh: /[一-鿿]/ };

const trim = (s) => s.replace(/^ +| +$/g, "");

// ----- identity -----

export const idTag = (uid) => ID_TAG + uid;
export const guidFor = (uid) => GUID_PREFIX + uid;

/** The word a note says it belongs to (from its guid, else its tag), or "" for a hand-made note. */
export function noteUid(note) {
  const guid = String(note.guid || "");
  if (guid.startsWith(GUID_PREFIX) && UID.test(guid.slice(GUID_PREFIX.length))) return guid.slice(GUID_PREFIX.length);
  for (const raw of note.tags || []) {
    const tag = String(raw).toLowerCase();
    if (tag.startsWith(ID_TAG) && UID.test(tag.slice(ID_TAG.length))) return tag.slice(ID_TAG.length);
  }
  return "";
}

function mix(text, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ----- one deck per language -----

/** The deck a language's words go to unless the learner named it: "Tamkeen – Spanish". */
export const defaultDeck = (code, names) => `${DEFAULT_DECK} – ${names[code] || code}`;

/** The deck names stored when languages first get a deck each: the one deck there was until then
 * keeps its name for the language most words are in, so its cards neither move nor get made twice. */
export function firstDecks(oldName, counts) {
  const top = Object.entries(counts || {}).sort((a, b) => (b[1] - a[1]) || byText(a[0], b[0]))[0];
  return top ? { [top[0]]: String(oldName || "").trim().slice(0, 100) || DEFAULT_DECK } : {};
}

/** Each language's deck: the name stored for it, else its default name. */
export function deckMap(stored, codes, names) {
  const out = {};
  for (const [code, name] of Object.entries(stored || {})) if (typeof name === "string" && name.trim()) out[code] = name.trim().slice(0, 100);
  for (const code of codes) if (!(code in out)) out[code] = defaultDeck(code, names);
  return Object.fromEntries(Object.entries(out).sort((a, b) => byText(a[0], b[0])));
}

/** Why these deck names cannot be used together ("" when they can). */
export function deckProblem(decks) {
  const seen = new Map();
  for (const [, name] of Object.entries(decks).sort((a, b) => byText(a[0], b[0]))) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) return `Two languages cannot share the deck “${name}”.`;
    for (const [other, shown] of seen) {
      if (key.startsWith(`${other}::`) || other.startsWith(`${key}::`)) {
        return `“${name}” and “${shown}” are one inside the other: give each language a deck of its own.`;
      }
    }
    seen.set(key, name);
  }
  return "";
}

/** Cards that sit in another language's deck than their word's: [{ note, uid, from, to }] (see misplaced_cards in the Python). */
export function misplacedCards(words, notes, links) {
  const byUid = new Map(words.map((w) => [w.uid, w]));
  const deckLanguage = new Map(notes.map((n) => [n.id, n.language]));
  const out = [];
  for (const uid of Object.keys(links).sort(byText)) {
    const word = byUid.get(uid), here = deckLanguage.get(links[uid].note);
    if (word && !word.deleted && here && word.language && word.language !== here) out.push({ note: links[uid].note, uid, from: here, to: word.language });
  }
  return out;
}

/** The uid a hand-made note's word gets: it depends only on the note's guid, which Anki keeps the
 * same on every device, so the computer and the phone make the same word, not two. */
export function uidFromGuid(guid) {
  return "v" + [0x1f3d5b79, 0x2545f491, 0x9e3779b9].map((seed) => mix(guid, seed).toString(16).padStart(8, "0")).join("").slice(0, 20);
}

// ----- reading a card back -----

function entity(whole, name) {
  if (name[0] === "#") {
    const code = /[xX]/.test(name[1]) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  }
  return NAMED[name.toLowerCase()] ?? whole;
}

/** A field as its lines: [the line as written, its plain text], empty lines left out. */
export function cardLines(markup) {
  const out = [];
  for (const raw of String(markup || "").replace(DROP, "").replace(SOUND, "").replace(BREAK, "\n").split("\n")) {
    const text = trim(raw.replace(MARKUP, "").replace(ENTITY, entity).replace(SPACES, " "));
    if (text) out.push([trim(raw), text]);
  }
  return out;
}

/** What a card says, taken apart the way ankiFields put it together (see parse_card in the Python). */
export function parseCard(front, back) {
  const plain = cardLines(front).map(([, text]) => text).join("\n");
  const bracketed = BRACKETED.test(plain);
  const rows = cardLines(back);
  let sentence = "", grammar = "";
  const loose = [], groups = [];
  rows.slice(1).forEach(([raw, text], i) => {
    if (GRAMMAR.test(raw) && !grammar && !groups.length) grammar = trim(text.slice(1, -1));
    else if (NOTE.test(text)) {
      const rest = trim(text.slice(5));
      groups.push(rest ? [rest] : []);
    } else if (groups.length) groups[groups.length - 1].push(text);
    else if (i === 0 && !grammar) sentence = text.replace(IN_BRACKETS, "$1");
    else loose.push(text);
  });
  return {
    front: plain,
    translation: bracketed ? plain.replace(/\[/g, "⟦").replace(/\]/g, "⟧") : "",
    meaning: bracketed ? [...plain.matchAll(new RegExp(IN_BRACKETS, "g"))].map((m) => m[1]).join(", ") : plain,
    text: rows.length ? rows[0][1] : "",
    sentence,
    grammar,
    notes: [...loose, ...(groups[0] || [])],
    memo: groups.slice(1).flat(),
  };
}

/** A card's grammar line and notes as the one notes text a word keeps. */
export function notesText(card) {
  return [...card.grammar.split(" • ").map(trim).filter(Boolean), ...card.notes].join(" · ");
}

/** The word a hand-made note stands for, or null when the note has no text to go on. */
export function wordFromNote(note, language = "") {
  const card = parseCard(note.front || "", note.back || "");
  let { text, meaning, translation } = card;
  const script = SCRIPTS[language];
  const first = card.front.split("\n")[0];
  if (!text || (script && !script.test(text) && script.test(first))) {
    // The word is on the front (a card made the other way round, or with nothing on its back).
    [text, meaning, translation] = [first, card.text, ""];
  }
  if (!text) return null;
  return { text, meaning, translation, sentence: card.sentence, notes: notesText(card) };
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** What an edit made in Anki changes in the word: only the parts that differ from `old`. */
function pull(word, old, now, front, back, hasBase) {
  const out = {};
  // A front that is only the word itself, or the "…" a card without a meaning shows, is not a meaning to keep.
  const standIn = now.front === "…" || !hideAnswer(now.front, String(word.text || ""));
  if (front && now.front !== old.front && now.front && !(standIn && !now.translation)) {
    if (now.translation) out.translation = now.translation;
    else if (!MARKED.test(word.translation || "")) out.meaning = now.front;
    else if (hasBase) { out.meaning = now.front; out.translation = ""; }  // the sentence was replaced by a plain meaning
  }
  if (back) {
    if (now.grammar !== old.grammar || !same(now.notes, old.notes)) out.notes = notesText(now);
    if (!same(now.memo, old.memo) && "memo" in word) out.memo = now.memo.join("\n");
  }
  for (const k of Object.keys(out)) if (out[k] === (word[k] || "")) delete out[k];
  return out;
}

// ----- the plan -----

const tk = (note) => String(note.guid || "").startsWith(GUID_PREFIX);
/** Which of several cards of one word is the one to keep: most reviewed, then Tamkeen's own guid, then the oldest. */
const noteOrder = (a, b) => ((b.reps || 0) - (a.reps || 0)) || ((tk(a) ? 0 : 1) - (tk(b) ? 0 : 1)) || (a.id - b.id);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * What a sync should do. `words`, `notes`, `links` and the options are described at `plan` in
 * app/anki_sync.py; `render(word)` gives [front, back] (ankiFields).
 */
export function plan(words, notes, links, render, { now, deletedNotes = {}, elsewhere = [], deleteOk = false, language = "" }) {
  elsewhere = new Set(elsewhere);
  const byUid = new Map(words.map((w) => [w.uid, w]));
  const anki = { create: [], update: [], delete: [], tag: [] };
  const tamkeen = { add: [], update: [], remove: [], restore: [] };
  const newLinks = {}, progress = {}, held = [], missing = [], moved = [];
  let skipped = 0, duplicates = 0;

  // 1. Which word is each note? By its own mark first, then by the link made last time.
  const linkedNote = new Map();
  for (const uid of Object.keys(links).sort(byText)) if (links[uid].note) linkedNote.set(links[uid].note, uid);
  const groups = new Map(), untagged = new Set(), loose = [];
  for (const note of [...notes].sort((a, b) => a.id - b.id)) {
    if (note.front == null || note.back == null) skipped++;
    else if ((note.tags || []).map((t) => String(t).toLowerCase()).includes(DUPLICATE_TAG)) duplicates++;
    else {
      let uid = noteUid(note);
      if (!uid && linkedNote.has(note.id)) { uid = linkedNote.get(note.id); untagged.add(note.id); }
      if (uid) groups.set(uid, [...(groups.get(uid) || []), note]);
      else loose.push(note);
    }
  }

  // 2. Two cards of one word: keep one. A never-studied exact copy is removed; anything else is tagged and
  //    left alone. Which one is kept depends only on the cards, never on this device's links, so the
  //    computer and the phone keep the same card instead of each removing the other's.
  const resolved = new Map();
  for (const uid of [...groups.keys()].sort(byText)) {
    const group = groups.get(uid);
    const keep = [...group].sort(noteOrder)[0];
    resolved.set(uid, keep);
    for (const extra of group) {
      if (extra === keep) continue;
      if (extra.reps === 0 && extra.front === keep.front && extra.back === keep.back) {
        anki.delete.push({ note: extra.id, uid, why: "duplicate" });
      } else {
        anki.tag.push({ note: extra.id, add: [DUPLICATE_TAG] });
        duplicates++;
      }
    }
  }

  // 3. Hand-made notes: the same front as a word's card, or the same word, means that word
  //    (a word in the language of the note's deck).
  const lang = (item) => String(item.language || language);
  const fronts = new Map(), texts = new Map(), rendered = new Map(), fresh = new Map();
  const put = (index, key, uid) => index.set(key, [...(index.get(key) || []), uid]);
  for (const w of [...words].sort((a, b) => ((a.created_at || 0) - (b.created_at || 0)) || byText(a.uid, b.uid))) {
    if (w.deleted || resolved.has(w.uid)) continue;
    rendered.set(w.uid, render(w));
    put(fronts, `${lang(w)}\0${normalize(parseCard(rendered.get(w.uid)[0], "").front)}`, w.uid);
    put(texts, `${lang(w)}\0${normalize(w.text || "")}`, w.uid);
  }
  const take = (index, here, key) => (key && (index.get(`${here}\0${key}`) || []).find((u) => !resolved.has(u))) || "";
  for (const note of loose) {
    const card = parseCard(note.front, note.back), here = lang(note);
    let uid = take(fronts, here, normalize(card.front)) || take(texts, here, normalize(card.text)) || take(texts, here, normalize(card.front));
    if (!uid) {
      uid = uidFromGuid(String(note.guid || note.id));
      if (resolved.has(uid)) { skipped++; continue; }  // (cannot happen with real guids; never give one word two cards)
    }
    resolved.set(uid, note);
    untagged.add(note.id);
  }

  // 4. A card whose word Tamkeen does not have (hand-made, or Tamkeen was reinstalled): a new word.
  for (const uid of [...resolved.keys()].sort(byText)) {
    if (byUid.has(uid)) continue;
    const note = resolved.get(uid);
    const made = wordFromNote(note, lang(note));
    if (made === null) {
      skipped++;
      resolved.delete(uid);
      untagged.delete(note.id);
      continue;
    }
    const created = note.id > 1e12 && note.id < now * 1000 ? note.id / 1000 : now;
    const word = { uid, ...made, language: lang(note), deleted: 0, created_at: created, updated_at: now };
    tamkeen.add.push({ ...word, note: note.id });
    fresh.set(uid, word);
  }

  for (const uid of [...resolved.keys()].sort(byText)) {
    const note = resolved.get(uid);
    if (untagged.has(note.id) && noteUid(note) !== uid) anki.tag.push({ note: note.id, add: [idTag(uid)] });
  }

  // 5. Word by word.
  const create = (word) => {
    const [front, back] = rendered.get(word.uid) || render(word);
    anki.create.push({ uid: word.uid, guid: guidFor(word.uid), front, back, tags: [TAG, idTag(word.uid)], language: lang(word) });
  };

  const merge = (word, note, link) => {
    const uid = word.uid;
    let [tf, tb] = rendered.get(uid) || render(word);
    const nf = note.front, nb = note.back;
    const ankiNewer = (note.mod || 0) > (word.updated_at || 0);
    let baseF, baseB, hasBase, pullF, pullB, pushF, pushB;
    if (!link) {
      // A card that is not in Tamkeen's own wording (hand-made, or made on another device) is
      // only linked: its text and the word's are both kept as they are until one is edited.
      const own = tk(note) && !fresh.has(uid);
      if (!own || (tf === nf && tb === nb)) {
        newLinks[uid] = { note: note.id, tf, tb, af: nf, ab: nb };
        return;
      }
      // Tamkeen's own card from before there was a link (an imported deck, say): the newer side wins.
      [baseF, baseB, hasBase] = [tf, tb, false];
      pullF = pullB = ankiNewer;
      pushF = !ankiNewer && tf !== nf;
      pushB = !ankiNewer && tb !== nb;
    } else {
      [baseF, baseB, hasBase] = [link.af, link.ab, true];
      const side = (mine, theirs, wasMine, wasTheirs) => {
        if (mine === theirs) return "";
        const here = mine !== wasMine, there = theirs !== wasTheirs;
        if (here && there) return ankiNewer ? "pull" : "push";
        return here ? "push" : there ? "pull" : "";
      };
      const f = side(tf, nf, link.tf, link.af), b = side(tb, nb, link.tb, link.ab);
      [pullF, pullB, pushF, pushB] = [f === "pull", b === "pull", f === "push", b === "push"];
    }
    const changes = pull(word, parseCard(baseF, baseB), parseCard(nf, nb), pullF, pullB, hasBase);
    if (Object.keys(changes).length) {
      tamkeen.update.push({ uid, set: changes });
      [tf, tb] = render({ ...word, ...changes });
    }
    if (pushF || pushB) anki.update.push({ note: note.id, uid, ...(pushF ? { front: tf } : {}), ...(pushB ? { back: tb } : {}) });
    if (!link && (pushF || pushB)) return;  // linked by the next sync, once the card is seen to hold what was sent
    const old = link || {};
    newLinks[uid] = { note: note.id, tf: pushF ? old.tf : tf, af: pushF ? old.af : nf, tb: pushB ? old.tb : tb, ab: pushB ? old.ab : nb };
  };

  for (const uid of [...new Set([...byUid.keys(), ...fresh.keys()])].sort(byText)) {
    let word = byUid.get(uid) || fresh.get(uid);
    const note = resolved.get(uid);
    const link = links[uid];
    if (note && note.progress != null) progress[uid] = note.progress;
    if (word.deleted) {
      if (!note) continue;
      if ((note.mod || 0) > (word.updated_at || 0)) {
        tamkeen.restore.push(uid);  // the card was edited after the word was deleted: the edit wins
        word = { ...word, deleted: 0 };
      } else {
        if (deleteOk) anki.delete.push({ note: note.id, uid, why: "word" });
        else {
          held.push(uid);
          if (link) newLinks[uid] = { ...link };
        }
        delete progress[uid];
        continue;
      }
    }
    if (note) merge(word, note, link && link.note === note.id ? link : null);
    else if (link && link.note) {
      const when = deletedNotes[String(link.note)];
      if (when != null) {
        if (when && (word.updated_at || 0) > when) create(word);  // edited after its card was deleted: the card comes back
        else tamkeen.remove.push(uid);
      } else {
        (elsewhere.has(uid) ? moved : missing).push(uid);
        newLinks[uid] = { ...link };
      }
    } else if (elsewhere.has(uid)) moved.push(uid);
    else create(word);
  }

  return {
    anki, tamkeen, links: newLinks, progress, held, missing, moved, duplicates, skipped,
    counts: {
      to_anki: { added: anki.create.length, changed: anki.update.length, removed: anki.delete.filter((d) => d.why === "word").length },
      to_tamkeen: { added: tamkeen.add.length, changed: tamkeen.update.length + tamkeen.restore.length, removed: tamkeen.remove.length },
    },
  };
}

// ----- progress, as shown in Tamkeen -----

/** One word's progress in the shape both the computer and the phone store (see progress_record in the Python). */
export function progressRecord(kind, queue, dueDays, interval, reps, lapses, right = null, wrong = null, history = null) {
  const state = queue === -1 ? "suspended" : kind === 0 ? "new" : kind === 2 ? "review" : kind === 3 ? "relearning" : "learning";
  if (wrong == null) wrong = Math.max(0, lapses);
  if (right == null) right = Math.max(0, reps - wrong);
  return { state, due_days: state === "new" || state === "suspended" ? null : dueDays, interval: Math.max(0, interval),
           reps: Math.max(0, reps), lapses: Math.max(0, lapses), right, wrong, history };
}
