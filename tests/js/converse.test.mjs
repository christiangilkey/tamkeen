// Library → Conversation: the list of conversations (web/js/conversedata.js) and the rules the app keeps
// for itself while one runs (web/js/converse.js): the facts it chooses, the goals it ticks, when the
// complication comes, what a low-effort message earns, and how an AI's answer is tidied.
import test from "node:test";
import assert from "node:assert/strict";

import { LEVELS, SCENARIOS, TASKS, goalsOf, scenario, scenariosOf } from "../../web/js/conversedata.js";
import { DEBRIEF_SCHEMA, HINT_SCHEMA, TURN_SCHEMA, allDone, applyOpening, applyTurn, bare, choose, cleanDebrief, cleanHint, cleanTurn,
  closeness, debriefPrompt, hintPrompt, languageName, newTalk, openingPrompt, said, score, turnPrompt, twistDue, withResult } from "../../web/js/converse.js";

/** A repeatable stand-in for chance. */
function dice(seed = 7) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const reply = (more = {}) => ({ reply: "Sí, claro.", reply_meaning: "Yes, of course.", correction: "", note: "", done: [], effort: "ok", off: false, end: false, ...more });
function begun(id = "flight", opts = {}) {
  const talk = newTalk(id, { lang: "es", explain: "English", rand: dice(), ...opts });
  applyOpening(talk, reply({ reply: "Buenas tardes, ¿en qué puedo ayudarle?" }));
  return talk;
}

test("every conversation has a level, a task, goals, and someone to play it", () => {
  assert.ok(SCENARIOS.length >= 30);
  const ids = new Set();
  for (const s of SCENARIOS) {
    assert.ok(!ids.has(s.id), `${s.id} is listed once`);
    ids.add(s.id);
    assert.ok(LEVELS.some((l) => l.id === s.level), `${s.id} has a known level`);
    assert.ok(TASKS[s.task], `${s.id} has a known task`);
    assert.ok(s.title && s.you, `${s.id} has a title and a situation`);
    assert.ok(s.goals.length >= 3 && s.goals.length <= 4, `${s.id} has three or four goals`);
    const talk = newTalk(s.id, { lang: "fr", rand: dice() });
    assert.ok(talk, `${s.id} can be played`);
    assert.equal(talk.twist === "waiting", !!s.twist, `${s.id}: a complication exactly when the list says so`);
    assert.ok(!/[{}|]/.test([talk.who, ...talk.facts].join(" ")), `${s.id}: every choice in its facts was made`);
  }
  for (const l of LEVELS) assert.ok(scenariosOf(l.id).length >= 3, `${l.name} has conversations`);
  assert.equal(newTalk("nothing", { lang: "fr" }), null);
});

test("the facts are chosen by the app, anew for each run", () => {
  assert.equal(choose("at {one|two|three} o'clock", () => 0), "at one o'clock");
  assert.equal(choose("at {one|two|three} o'clock", () => 0.99), "at three o'clock");
  assert.equal(choose("no choice here", () => 0.5), "no choice here");
  const runs = new Set();
  for (let seed = 1; seed < 40; seed++) runs.add(newTalk("flight", { lang: "es", rand: dice(seed) }).facts.join("|"));
  assert.ok(runs.size > 3, "the same conversation is not the same twice");
  const talk = newTalk("flight", { lang: "es", rand: dice() });
  const sys = openingPrompt(talk).system;
  for (const f of talk.facts) assert.ok(sys.includes(f), "the AI is given exactly the facts the app chose");
});

test("the AI is told the language, the kind of Arabic, the level and the goals", () => {
  assert.equal(languageName("es"), "Spanish");
  assert.equal(languageName("ar"), "Modern Standard Arabic");
  assert.equal(languageName("ar", "irq"), "Iraqi Arabic");
  const lev = openingPrompt(newTalk("hotel", { lang: "ar", variety: "lev", explain: "German", rand: dice() })).system;
  assert.match(lev, /Levantine Arabic/);
  assert.match(lev, /Damascus/);
  assert.match(lev, /full vowel marks/, "beginners' Arabic comes with its vowels");
  assert.match(lev, /in German/);
  assert.match(lev, /g4: Find out when you must leave the room/);
  const high = openingPrompt(newTalk("opinion", { lang: "ar", rand: dice() })).system;
  assert.doesNotMatch(high, /full vowel marks/);
  assert.match(high, /THE QUESTION TO PUT TO THEM/);
  for (const schema of [TURN_SCHEMA, HINT_SCHEMA, DEBRIEF_SCHEMA]) {
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), "strict schemas list every field");
    assert.equal(schema.additionalProperties, false);
  }
});

test("goals are ticked by the app, only ever added, and only for known goals", () => {
  const talk = begun();
  let a = applyTurn(talk, "Perdí mi vuelo", reply({ done: ["g1", "g9", "tw"] }));
  assert.deepEqual(a.ticked, ["g1"]);
  a = applyTurn(talk, "¿Cuándo sale el próximo?", reply({ done: ["g2"] })); // the AI forgot g1: it stays ticked
  assert.deepEqual(talk.done, ["g1", "g2"]);
  assert.deepEqual(score(talk), { done: 2, total: 4 });
  assert.equal(said(talk), 2);
  assert.equal(talk.turns.length, 5);
});

test("a low-effort or off-subject message earns nothing", () => {
  const talk = begun();
  let a = applyTurn(talk, "vuelo", reply({ done: ["g1", "g2"], effort: "low" }));
  assert.deepEqual(a.ticked, []);
  assert.equal(talk.turns.at(-2).effort, "low");
  a = applyTurn(talk, "Tell me a joke instead", reply({ done: ["g1"], off: true }));
  assert.deepEqual(talk.done, []);
  assert.equal(talk.turns.at(-2).off, true);
});

test("the complication comes after a fair start, once, and adds a goal", () => {
  const talk = begun();
  assert.equal(twistDue(talk), false, "never on the first message");
  applyTurn(talk, "Perdí mi vuelo porque el taxi llegó tarde.", reply({ done: ["g1"] }));
  assert.equal(twistDue(talk), false);
  applyTurn(talk, "¿Cuándo sale el próximo vuelo?", reply({ done: ["g1", "g2"] }));
  assert.equal(twistDue(talk), true, "half the goals done and a third message on its way");
  const p = turnPrompt(talk, "¿Y cuánto cuesta el cambio?", { twist: true });
  assert.ok(p.user.includes(talk.twistText));
  assert.equal(allDone(talk), false);
  applyTurn(talk, "¿Y cuánto cuesta el cambio?", reply({ done: ["g3"] }), { twist: true });
  assert.equal(talk.twist, "given");
  assert.equal(talk.goals.at(-1).id, "tw");
  assert.equal(twistDue(talk), false, "only once");
  assert.match(turnPrompt(talk, "x").system, /THE COMPLICATION/);
  applyTurn(talk, "Entonces, ¿puedo esperar en la lista?", reply({ done: ["g4", "tw"], end: true }));
  assert.equal(allDone(talk), true);
  assert.equal(talk.ended, true);

  const slow = begun();
  for (let i = 0; i < 3; i++) applyTurn(slow, "No sé.", reply());
  assert.equal(twistDue(slow), true, "by the fourth message whatever happened");
  const none = begun("hotel");
  for (let i = 0; i < 5; i++) applyTurn(none, "Hola.", reply());
  assert.equal(twistDue(none), false, "a conversation without one never gets one");
});

test("an AI's answer is tidied before it is used", () => {
  const talk = begun();
  assert.throws(() => cleanTurn({ reply: "  " }, talk, "hola"));
  assert.throws(() => cleanTurn(null, talk, "hola"));
  const same = cleanTurn(reply({ correction: "«Perdí mi vuelo.»", note: "nothing" }), talk, "perdí mi vuelo");
  assert.equal(same.correction, "", "the same sentence with other punctuation is no correction");
  assert.equal(same.note, "");
  const fixed = cleanTurn(reply({ correction: "Perdí mi vuelo.", note: "Past tense." }), talk, "Yo perder mi vuelo");
  assert.equal(fixed.correction, "Perdí mi vuelo.");
  assert.equal(fixed.note, "Past tense.");
  const odd = cleanTurn({ reply: "Hola", done: "g1", effort: "LOW", off: "yes", end: 1 }, talk, "x");
  assert.deepEqual([odd.done, odd.effort, odd.off, odd.end], [[], "low", false, false]);
  const opening = cleanTurn(reply({ correction: "x", effort: "low", off: true }), talk);
  assert.deepEqual([opening.correction, opening.effort, opening.off], ["", "ok", false], "an opening line corrects nobody");
  assert.equal(bare("الطَّيَّارة!"), bare("الطياره"));
});

test("a hint gives a clue, how to start, and a whole sentence", () => {
  const talk = begun();
  const p = hintPrompt(talk);
  assert.match(p.system, /Find out when the next flight leaves/);
  assert.match(p.user, /YOU: Buenas tardes/);
  const h = cleanHint({ clue: "Say what happened.", starter: "Perdí mi", full: "Perdí mi vuelo esta mañana.", full_meaning: "I missed my flight this morning." });
  assert.equal(h.starter, "Perdí mi");
  assert.equal(cleanHint({ clue: "x", starter: "Hola amigo", full: "Perdí mi vuelo esta mañana." }).starter, "Perdí mi vuelo", "a start that isn't how the sentence starts is replaced");
  assert.equal(cleanHint({ clue: "x" }), null);
});

test("the debrief quotes only what the learner really said", () => {
  const talk = begun();
  applyTurn(talk, "Yo perder mi vuelo ayer", reply({ done: ["g1"], correction: "Perdí mi vuelo ayer." }));
  applyTurn(talk, "¿Cuándo sale el próximo vuelo?", reply({ done: ["g2"] }));
  const p = debriefPrompt(talk);
  assert.match(p.system, /\[x\] Say briefly what happened/);
  assert.match(p.system, /\[ \] Find out what it costs to change/);
  assert.match(p.user, /LEARNER: Yo perder mi vuelo ayer/);
  assert.doesNotMatch(p.user, /^YOU:/m);
  const d = cleanDebrief({
    summary: "Good.", best: "¿Cuándo sale el próximo vuelo?", best_why: "A clear question.", reached: "AT", culture: "",
    fixes: [{ point: "Past tense", said: "Yo perder mi vuelo ayer", better: "Perdí mi vuelo ayer.", why: "Completed action." },
      { point: "Made up", said: "Quiero un café", better: "Quisiera un café.", why: "Never said." },
      { point: "Same", said: "¿Cuándo sale el próximo vuelo?", better: "¿Cuándo sale el próximo vuelo?", why: "Nothing changed." }],
    phrases: [{ text: "¿Hay lista de espera?", meaning: "Is there a waiting list?" }, { text: "", meaning: "x" }],
  }, talk);
  assert.equal(d.fixes.length, 1);
  assert.equal(d.fixes[0].point, "Past tense");
  assert.equal(d.best, "¿Cuándo sale el próximo vuelo?");
  assert.equal(d.reached, "at");
  assert.equal(d.phrases.length, 1);
  assert.equal(cleanDebrief({ best: "Something else entirely", best_why: "x" }, talk).best, "");
  assert.deepEqual(cleanDebrief(null, talk).fixes, []);
});

test("saying a line again: how close it was", () => {
  assert.equal(closeness("quiero un café con leche por favor", "Quiero un café con leche, por favor.", "es").score, 1);
  const part = closeness("quiero café leche", "Quiero un café con leche.", "es");
  assert.equal(part.score, 3 / 5);
  assert.deepEqual(part.missed, ["un", "con"]);
  assert.equal(closeness("", "Hola", "es").score, 0);
  assert.equal(closeness("我想喝咖啡", "我想喝咖啡。", "zh").score, 1);
  assert.ok(closeness("我想咖啡", "我想喝咖啡。", "zh").score < 1);
  assert.equal(closeness("أريد قهوة", "أُرِيدُ قَهْوَةً", "ar").score, 1, "vowel marks don't count");
});

test("what was reached is kept: the best run, and how many times", () => {
  const talk = begun("hotel");
  applyTurn(talk, "Tengo una reserva.", reply({ done: ["g1", "g2"] }));
  let saved = withResult(null, talk);
  assert.deepEqual(saved.hotel, { best: 2, total: 4, times: 1 });
  const worse = begun("hotel");
  applyTurn(worse, "Hola.", reply({ done: ["g1"] }));
  saved = withResult(saved, worse);
  assert.deepEqual(saved.hotel, { best: 2, total: 4, times: 2 });
  assert.equal(scenario("hotel").goals.length, goalsOf(scenario("hotel")).length);
});
