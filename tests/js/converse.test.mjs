// Library → Conversation: the list of conversations (web/js/conversedata.js) and the rules the app keeps
// for itself while one runs (web/js/converse.js): the facts it chooses, the goals it ticks, when the
// complication comes, what a low-effort message earns, and how an AI's answer is tidied.
import test from "node:test";
import assert from "node:assert/strict";

import { LEVELS, MOCK_FORMS, MOCK_PARTS, MOCK_PHASES, SCENARIOS, TASKS, goalsOf, scenario, scenariosOf } from "../../web/js/conversedata.js";
import { DEBRIEF_SCHEMA, HINT_SCHEMA, MOCK_IDS, MOCK_TURN_SCHEMA, RATING_SCHEMA, TURN_SCHEMA, allDone, applyMockOpening, applyMockTurn, applyOpening,
  applyTurn, bare, choose, cleanDebrief, cleanHint, cleanRating, cleanTurn, closeness, corrections, debriefPrompt, hintPrompt, languageName,
  mockLevel, mockNext, mockOpeningPrompt, mockPart, mockTurnPrompt, newMock, newTalk, openingPrompt, ratedParts, ratingPrompt, said, score,
  turnPrompt, twistDue, withResult } from "../../web/js/converse.js";

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
  for (const schema of [TURN_SCHEMA, HINT_SCHEMA, DEBRIEF_SCHEMA, MOCK_TURN_SCHEMA, RATING_SCHEMA]) {
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

// ---------------------------------------------------------------- the mock interview (DLI students)
const said2 = (more = {}) => ({ reply: "Muy bien.", reply_meaning: "Very good.", correction: "", note: "", enough: false, effort: "ok", off: false, ...more });
function interview(form = "2", opts = {}) {
  const talk = newMock(form, { lang: "es", explain: "English", rand: dice(), ...opts });
  applyMockOpening(talk, said2({ reply: "Buenos días. ¿Cómo está?" }));
  return talk;
}
/** One candidate message: what the app decided before it, and what came of it. */
function answer(talk, text = "Una respuesta larga y completa.", more = {}) {
  const next = mockNext(talk);
  return { next, ...applyMockTurn(talk, text, said2(more), next) };
}

test("the two interviews go warm-up, level checks, probes, role-play, wind-down", () => {
  assert.deepEqual(MOCK_IDS, ["2", "3"]);
  assert.deepEqual(MOCK_FORMS.map((f) => f.id), MOCK_IDS);
  const order = MOCK_PHASES.map((p) => p.id);
  for (const form of MOCK_IDS) {
    const talk = newMock(form, { lang: "ar", rand: dice() });
    const kinds = talk.parts.map((p) => p.kind);
    assert.equal(kinds[0], "warmup");
    assert.equal(kinds.at(-1), "winddown");
    assert.deepEqual(kinds.map((k) => order.indexOf(k)), [...kinds.map((k) => order.indexOf(k))].sort((a, b) => a - b), `${form}: in the order of the stages`);
    const rated = ratedParts(talk);
    assert.ok(rated.filter((p) => p.group === "check").length >= 2 && rated.filter((p) => p.group === "probe").length >= 3);
    for (const p of rated) {
      assert.ok(p.judge && p.level, `${form}/${p.id} says what doing it at its level means`);
      assert.ok(MOCK_PARTS[p.id], `${form}/${p.id} has a name for the result`);
    }
    for (const p of talk.parts) assert.ok(!/\[\[|\]\]|[{}|]/.test(p.ask + (p.who || "")), `${form}/${p.id}: every choice was made`);
    const role = talk.parts.find((p) => p.kind === "roleplay");
    assert.ok(scenario(role.scene) && scenario(role.scene).twist && role.twist, "the role-play is one that goes wrong");
    assert.equal(talk.base, form === "2" ? "1" : "2");
    assert.equal(talk.reach, form);
  }
  // Level 1 is held with simple talk and questions; Level 2's own tasks are the probes, then the checks one interview up.
  assert.deepEqual(ratedParts(newMock("2", { lang: "es" })).map((p) => `${p.id}:${p.group}:${p.level}`), ["you:check:1", "ask:check:1", "story:probe:2", "detail:probe:2", "role:probe:2"]);
  assert.deepEqual(ratedParts(newMock("3", { lang: "es" })).map((p) => `${p.id}:${p.group}:${p.level}`), ["story:check:2", "report:check:2", "opinion:probe:3", "suppose:probe:3", "idea:probe:3", "role:check:2"]);
  assert.equal(newMock("9", { lang: "es" }), null);
  const runs = new Set();
  for (let seed = 1; seed < 30; seed++) runs.add(newMock("3", { lang: "es", rand: dice(seed) }).parts.map((p) => p.ask + (p.scene || "")).join("|"));
  assert.ok(runs.size > 10, "two interviews are not the same");
});

test("the app moves the interview on: when enough was heard, never before a part's least, never past its most", () => {
  const talk = interview("2");
  const trail = [];
  for (let i = 0; i < 40 && !talk.ended; i++) {
    const a = answer(talk, "Una respuesta larga y completa.", { enough: true });
    trail.push(`${mockPart(talk).id}${a.next.twist ? "!" : ""}`);
  }
  assert.equal(talk.ended, true);
  // (each entry: the part the interview is in after that message; "!" = the complication came with the reply)
  assert.deepEqual(trail, ["warm", "you", "you", "ask", "ask", "story", "story", "detail", "detail", "role", "role", "role!", "wind", "wind"]);
  assert.equal(said(talk), 14);
  assert.equal(mockNext(talk).final, true, "nothing follows the goodbye");

  // An interviewer who never says "enough" still moves on at each part's most.
  const slow = interview("3");
  let n = 0;
  while (!slow.ended && n < 60) { answer(slow); n++; }
  assert.equal(n, slow.parts.reduce((sum, p) => sum + p.max, 0));
});

test("a message that is no real attempt doesn't use a part up, but can't hold the interview for ever", () => {
  const talk = interview("2");
  answer(talk); answer(talk); // through the warm-up
  assert.equal(mockPart(talk).id, "you");
  for (let i = 0; i < 4; i++) {
    const a = answer(talk, "no sé", { effort: "low", enough: true });
    assert.equal(a.moved, -1);
    assert.equal(mockPart(talk).id, "you");
  }
  assert.equal(talk.enough, true);
  assert.equal(answer(talk, "no sé", { effort: "low" }).next.advance, true, "two messages over the part's most, it moves on");
  assert.equal(mockPart(talk).id, "ask");
});

test("the interviewer is told the part, the next part when it is time, and the role-play's hidden facts", () => {
  const talk = interview("2");
  assert.match(mockOpeningPrompt(talk).system, /THIS PART: Greet the candidate/);
  assert.match(mockOpeningPrompt(talk).system, /never mention levels, ratings, parts/);
  answer(talk);
  const on = mockTurnPrompt(talk, "Soy de Texas.");
  assert.match(on.user, /NOW MOVE ON/);
  assert.match(on.user, /THE NEXT PART: Ask simple questions about/);
  assert.match(on.user, /\[PART: warm\]\nYOU: Buenos días/);
  while (mockPart(talk).id !== "detail") answer(talk, "Una respuesta.", { enough: true });
  answer(talk, "Una respuesta.", { enough: true });
  const role = talk.parts.find((p) => p.kind === "roleplay");
  const into = mockTurnPrompt(talk, "Y eso es todo.");
  assert.match(into.user, /THE NEXT PART: A role-play/);
  assert.ok(into.user.includes(scenario(role.scene).you), "the situation on the candidate's card");
  assert.ok(into.user.includes("You play:"));
  for (const f of role.facts) assert.ok(into.user.includes(f));
  assert.ok(!into.user.includes(role.twist), "the complication is not given away early");
  answer(talk, "Y eso es todo.", { enough: true });
  assert.equal(mockPart(talk).kind, "roleplay");
  answer(talk, "Buenas tardes, tengo un problema.");
  const twist = mockTurnPrompt(talk, "¿Qué puedo hacer?");
  assert.ok(twist.user.includes(role.twist));
  answer(talk, "¿Qué puedo hacer?");
  assert.equal(talk.twistGiven, true);
  assert.match(mockTurnPrompt(talk, "x").system, /The complication \(you have raised it\)/);
  while (mockPart(talk).kind !== "winddown") answer(talk, "Entonces propongo otra cosa.", { enough: true });
  assert.match(mockTurnPrompt(talk, "Voy a descansar.").user, /THAT WAS THE LAST PART/);
});

test("the level is worked out by the app from how each part went", () => {
  const finished = (form) => { const t = interview(form); while (!t.ended) answer(t, "Una respuesta.", { enough: true }); return t; };
  const two = finished("2"), three = finished("3");
  const level = (talk, results) => mockLevel(talk, results).level;
  const all = (talk, check, probe) => Object.fromEntries(ratedParts(talk).map((p, i, list) => {
    const mine = list.filter((x) => x.group === p.group);
    return [p.id, (p.group === "check" ? check : probe)[mine.indexOf(p)]];
  }));
  // "Up to Level 2": Level 1 must hold before Level 2 counts.
  assert.equal(level(two, all(two, ["yes", "yes"], ["yes", "yes", "yes"])), "2");
  assert.equal(level(two, all(two, ["yes", "yes"], ["yes", "yes", "partly"])), "2", "four times in five is held");
  assert.equal(level(two, all(two, ["yes", "yes"], ["yes", "partly", "no"])), "1+");
  assert.equal(level(two, all(two, ["yes", "yes"], ["no", "no", "partly"])), "1");
  assert.equal(level(two, all(two, ["yes", "partly"], ["yes", "yes", "yes"])), "0+", "strong probes don't make up for a shaky base");
  assert.equal(level(two, all(two, ["no", "no"], ["no", "no", "no"])), "0");
  // "Up to Level 3"
  assert.equal(level(three, all(three, ["yes", "yes", "yes"], ["yes", "yes", "yes"])), "3");
  assert.equal(level(three, all(three, ["yes", "yes", "yes"], ["partly", "partly", "partly"])), "2+");
  assert.equal(level(three, all(three, ["yes", "yes", "yes"], ["no", "no", "no"])), "2");
  assert.equal(level(three, all(three, ["yes", "partly", "no"], ["yes", "yes", "yes"])), "1+");
  assert.equal(level(three, all(three, ["no", "no", "partly"], ["no", "no", "no"])), "1");
  assert.equal(level(three, {}), "1", "a part with no result counts as not done");
  // An interview ended early gives no estimate.
  const early = interview("2");
  for (let i = 0; i < 5; i++) answer(early, "Una respuesta.", { enough: true });
  const m = mockLevel(early, { you: "yes", ask: "yes" });
  assert.equal(m.level, "");
  assert.equal(m.complete, false);
});

test("a rating is tidied: every part that counts gets a result, and quotes must be the candidate's own", () => {
  const talk = interview("2");
  answer(talk, "Estoy bien, gracias."); answer(talk, "Soy de Texas.");
  answer(talk, "Mi familia es grande.", { correction: "Mi familia es muy grande.", note: "Sounds more natural." });
  answer(talk, "Yo tener dos hermanos.", { correction: "Tengo dos hermanos.", note: "Conjugate the verb.", enough: true });
  answer(talk, "¿Dónde vives?");                          // (still answering in "you": this reply opens "ask")
  answer(talk, "¿Cuántas personas viven en su barrio?");  // the first message in "ask"
  const p = ratingPrompt(talk);
  assert.match(p.system, /- you \(Level 1\)/);
  assert.match(p.system, /- ask \(Level 1\)/);
  assert.doesNotMatch(p.system, /- story/, "a part the candidate never reached is not judged");
  assert.match(p.user, /INTERVIEWER: Buenos días/);
  assert.match(p.user, /CANDIDATE: Yo tener dos hermanos\./);
  const r = cleanRating({
    parts: [{ id: "you", result: "YES", evidence: "Full sentences about the family." }, { id: "ask", result: "maybe", evidence: "One question." },
      { id: "story", result: "yes", evidence: "Made up." }, { id: "warm", result: "yes", evidence: "Not rated." }],
    summary: "Simple talk held.", next: ["One", "Two", "Three", "Four"], best: "Mi familia es grande.", best_why: "Clear.",
    fixes: [{ point: "Verb", said: "Yo tener dos hermanos.", better: "Tengo dos hermanos.", why: "Conjugate." },
      { point: "Invented", said: "Nunca dije esto", better: "Otra cosa", why: "x" }],
  }, talk);
  assert.deepEqual(r.parts.map((x) => `${x.id}:${x.result}`), ["you:yes", "ask:no", "story:none", "detail:none", "role:none"]);
  assert.equal(r.parts[2].evidence, "", "nothing is said about a part that was not reached");
  assert.equal(r.level, "");
  assert.equal(r.next.length, 3);
  assert.equal(r.fixes.length, 1);
  assert.equal(r.best, "Mi familia es grande.");
  assert.deepEqual(corrections(talk), [{ said: "Mi familia es grande.", better: "Mi familia es muy grande.", note: "Sounds more natural." },
    { said: "Yo tener dos hermanos.", better: "Tengo dos hermanos.", note: "Conjugate the verb." }]);
  assert.deepEqual(cleanRating(null, talk).parts.map((x) => x.result), ["no", "no", "none", "none", "none"]);
});
