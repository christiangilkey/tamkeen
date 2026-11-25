// The Classroom (prototype "classroom"): a teacher's notes on the words of something shared with a class
// (web/js/classnotes.js), what arrives from the online service (dliweeks.js cleanRoom), and that the database file
// (supabase/v17-dli-classroom.sql, which cannot be run here) keeps its rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOTES_MAX, cleanNotes, episodeOfHash, importantKeys, noteFor, noteKey, notesFromCards } from "../../web/js/classnotes.js";
import { cleanRoom } from "../../web/js/dliweeks.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID2 = "1f8fad5b-d9cb-469f-a165-70867728950e";

test("a word is matched whatever its marks, capitals and the punctuation round it", () => {
  assert.equal(noteKey("المَدْرَسَةِ"), noteKey("المدرسة"));
  assert.equal(noteKey("«Café»,"), "cafe");
  assert.equal(noteKey("  Hello!  "), "hello");
  assert.equal(noteKey("كتـــاب"), noteKey("كتاب"), "the stretch line is not a letter");
  assert.equal(noteKey("in  the   end"), "in the end");
  assert.equal(noteKey("…"), "");
  assert.equal(noteKey(null), "");
});

test("notes are cut to size, stripped of markup, and kept only when they say something", () => {
  const list = cleanNotes([
    { w: "المدرسة", important: true, meaning: "<b>school</b>", note: "Feminine.\n\n\n\nPlural: مدارس", s: "ذهب إلى المدرسة." },
    { w: "المَدْرَسَة", meaning: "again" },          // the same word: once
    { w: "كتاب" },                                  // nothing to say
    { w: "", important: true }, null, "junk",
    { w: "x".repeat(200), meaning: "y".repeat(900), important: "yes" },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { w: "المدرسة", important: true, meaning: "bschool/b", note: "Feminine.\n\nPlural: مدارس", s: "ذهب إلى المدرسة." });
  assert.equal(list[1].w.length, 80);
  assert.equal(list[1].meaning.length, 300);
  assert.equal(list[1].important, false, "important is true or nothing");
  assert.equal(cleanNotes(new Array(1000).fill(0).map((_, i) => ({ w: `w${i}`, important: true }))).length, NOTES_MAX);
  assert.deepEqual(cleanNotes("nope"), []);
});

test("a teacher's notes are their own flashcards of the item: important, their meaning, their grammar notes", () => {
  const notes = notesFromCards([
    { text: "كتابا", meaning: "a book", notes: "", sentence: "قرأ ⟦كتابا⟧ جديدا.", important: 0 },
    { text: "المدرسة", meaning: "", notes: "", sentence: "", important: 1 },
    { text: "التاريخ", meaning: "", notes: "", important: 0 },   // a plain saved word: nothing for students
    { text: "قديم", meaning: "old", deleted: 1 },
  ]);
  assert.deepEqual(notes.map((n) => n.w), ["المدرسة", "كتابا"], "important ones first; nothing said, nothing sent");
  assert.equal(notes[1].s, "قرأ كتابا جديدا.", "the sentence without the marks round the word");
  assert.deepEqual(Object.keys(notes[0]).sort(), ["important", "meaning", "note", "s", "w"], "nothing else of a card leaves the teacher's device");
});

test("the popup's lookup and the underlined words", () => {
  const notes = cleanNotes([{ w: "المدرسة", important: true, meaning: "school" }, { w: "في النهاية", important: true }, { w: "كتاب", meaning: "book" }]);
  assert.equal(noteFor(notes, "المَدْرَسَةِ،").meaning, "school");
  assert.equal(noteFor(notes, "في النهاية").important, true, "a phrase is matched whole");
  assert.equal(noteFor(notes, "قلم"), null);
  assert.equal(noteFor(notes, ""), null);
  assert.deepEqual([...importantKeys(notes)], [noteKey("المدرسة")], "single words only: what a transcript's words are checked against");
  assert.equal(episodeOfHash("#/episode/12?t=30"), 12);
  assert.equal(episodeOfHash("#/library"), 0);
});

test("a classroom from the online service is checked", () => {
  const room = cleanRoom({ folders: [{ id: ID, name: "<b>Week 1</b>" }, { id: "nope", name: "x" }, { id: ID2, name: "" }],
    items: [
      { id: ID, item: { kind: "page", title: "News", url: "https://example.org/1" }, path: `${ID}/${ID}.gz`, folder: ID, sender: "ms.rivera", mine: true,
        notes: [{ w: "school", important: true, meaning: "<i>where</i>" }, { w: "x" }], created_at: "2026-11-24T00:00:00Z", updated_at: "2026-11-25T00:00:00Z" },
      { id: ID2, item: { kind: "podcast", title: "Ep" }, folder: ID2, path: "../etc", notes: "junk" },   // its folder is gone
      { id: ID2, item: { kind: "netflix", title: "x" } }, null],
  });
  assert.equal(room.folders.length, 1, "a folder needs an id and a name");
  assert.ok(room.folders[0].id === ID && room.folders[0].name.includes("Week 1") && !/[<>]/.test(room.folders[0].name), "no markup in a folder's name");
  assert.equal(room.items.length, 2, "a kind that is never shared is dropped");
  assert.equal(room.items[0].folder, ID);
  assert.deepEqual(room.items[0].notes, [{ w: "school", important: true, meaning: "iwhere/i", note: "", s: "" }]);
  assert.equal(room.items[1].folder, "", "an item whose folder is gone shows at the top");
  assert.equal(room.items[1].path, "");
  assert.deepEqual(room.items[1].notes, []);
  assert.deepEqual(cleanRoom(null), { folders: [], items: [] });
});

test("the database file keeps the rules (it can't be run here: there is no database on this machine)", () => {
  const sql = read("supabase/v17-dli-classroom.sql");
  const bare = sql.replace(/--[^\n]*/g, "");
  assert.equal(sql.split("$$").length % 2, 1, "every function body is opened and closed");
  assert.ok(sql.includes("alter table public.dli_class_folders enable row level security;"));
  assert.ok(!/create policy/i.test(bare), "no rule on a table and no new file rule: everything goes through the functions");
  const all = ["dli_classroom", "dli_class_posts", "dli_folder_save", "dli_folder_remove", "dli_room_add", "dli_post", "dli_room_update", "dli_room_move"];
  for (const name of all) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    const fn = body.slice(0, body.indexOf("end $$;"));
    assert.ok(/security definer set search_path = ''/.test(fn), `${name} pins its search path`);
    assert.ok(new RegExp(`grant execute on function[^;]*public\\.${name}\\(`).test(sql), `${name} may be run by signed-in people`);
    assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(sql), `${name} is closed to everyone else`);
    if (name === "dli_post") { assert.ok(/public\.dli_room_add\(/.test(fn), "the old call goes through the new one, checks and all"); continue; }
    assert.ok(/(me|auth\.uid\(\)) is null then raise exception 'Not signed in'/.test(fn), `${name} refuses a signed-out caller`);
    const teachers = !["dli_classroom", "dli_class_posts"].includes(name);
    assert.equal(/if not private\.dli_teaches\(/.test(fn), teachers, `${name}: teachers of the class only, or its members`);
    if (!teachers) assert.ok(/if not private\.dli_member\(me, class\)/.test(fn), `${name} is for the class's members`);
  }
  // nothing expires any more, and a file must be the class's own
  assert.ok(!/interval '60 days'/.test(bare));
  assert.ok(/private\.dli_room_path_ok\(class, v_path\)/.test(bare) && /private\.dli_room_path_ok\(v_class, v_path\)/.test(bare));
  // every UPDATE and DELETE has a WHERE (the API refuses one without)
  const risky = bare.split(";").map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky, []);
  const selftest = read("supabase/test_rls_dli_classroom.sql");
  assert.ok(/raise exception 'RESULTS ok=% bad=\[%\]/.test(selftest));
  for (const name of all) assert.ok(selftest.includes(`'${name}'`), `the self-test checks ${name} is closed to the signed-out`);
});

test("wiring: a prototype, on every version, one place for a class's material", () => {
  assert.ok(/classroom: \{[^}]*released: (true|false)/.test(read("web/js/prototype.js")));
  const app = read("web/js/dliclass.js");
  assert.ok(app.includes('export const classroomShown = () => feature("classroom") && serviceOn() && (!!shareInfo() || isTeacherHere());'));
  for (const call of ["dli_classroom", "dli_room_add", "dli_room_update", "dli_room_move", "dli_folder_save", "dli_folder_remove"]) assert.ok(app.includes(`rpc("${call}"`), call);
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/classnotes.js", "js/components/classroompanel.js"]) assert.ok(build.includes(`"${f}"`), `${f} is in the phones' and the web app's build`);
  // the word popup asks for the teacher's line, behind the prototype switch; so does the player's underline
  const bubble = read("web/js/components/wordbubble.js");
  assert.ok(bubble.includes('if (!feature("classroom")) return "";') && bubble.includes("teacherNote(fix ? fix.to : ctx.word)"));
  assert.ok(read("web/js/pages/player.js").includes('if (feature("classroom")) {\n    const marked = importantKeys(keptNotes(id));'));
  // the Class tab points at the classroom instead of keeping a second list
  assert.ok(read("web/js/pages/class.js").includes('href="#/library?show=classroom"'));
  // sending to a class carries the notes, and falls back to the v15 call on a database without v17
  const send = read("web/js/components/sendmedia.js");
  assert.ok(send.includes("r = await roomAdd(classId, p.item, { file: p.file, notes: p.notes, folder });") && send.includes("if (!r) r = await postToClass(classId, p.item, p.file);"));
  assert.ok(send.includes('if (type === "video/netflix") return null;'), "Netflix is still never shared");
  // a student's words are added only when they press the button
  const panel = read("web/js/components/classroompanel.js");
  assert.ok(panel.includes("add.onclick = async () => {") && !/addImportant\(p, language\);\s*\n\s*keepNotes/.test(panel));
});
