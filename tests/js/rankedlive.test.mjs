// Run with: node --test tests/js/
// Ranked battles between two people (web/js/game/rankedlive.js): two links, a host and a guest, talking over a
// stand-in for the Realtime channel, each with its own words. The host runs the battle; the guest sees it from its
// side, sends its moves and answers its own questions; the answer race works between the two people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGenome } from "../../web/js/game/genome.js";
import { TILE, current, remoteAnswer } from "../../web/js/game/livebattle.js";
import { HELLO_S, LOST_S, PROTOCOL, STALL_S, rankedLink, teamFrom } from "../../web/js/game/rankedlive.js";

const DT = 1 / 60;
// A plain field: nothing in the way, the two starts 8 tiles apart.
const field = () => {
  const cols = 30, rows = 12;
  return { seed: 1, theme: "meadow", cols, rows, width: cols * TILE, height: rows * TILE, base: "grass",
           tiles: Array(cols * rows).fill("grass"), props: [], propTiles: Array(cols * rows).fill(null),
           starts: { me: { x: 10 * TILE + 8, y: 6 * TILE + 8 }, foe: { x: 18 * TILE + 8, y: 6 * TILE + 8 } } };
};
const genome = (seed, type) => ({ ...newGenome(seed, type), growth: 0.9, loadout: ["tackle"] });
// Each player's own question: answer 0 is right.
const asker = (who) => { let n = 0; return () => ({ uid: `${who}${++n}`, prompt: "palabra", sentence: "", options: ["right", "b", "c", "d"], answer: 0, reverse: false }); };

/** Two links on one stand-in channel, one clock. `cut` stops what one side sends from arriving. */
function pair({ hostTeam = [genome(11, "ember")], guestTeam = [genome(22, "tide")] } = {}) {
  const clock = { t: 100 };
  const queues = { host: [], guest: [] }; // what is on its way TO each side
  const cut = { host: false, guest: false }; // true: what this side sends is lost
  const sent = { host: [], guest: [] };
  const ear = { host: null, guest: null };
  const transport = (me, them) => ({
    send: (m) => { sent[me].push(m); if (!cut[me]) queues[them].push(JSON.parse(JSON.stringify(m))); },
    onMessage: (f) => { ear[me] = f; },
    joined: () => true,
    close: () => {},
  });
  const reports = { host: [], guest: [] };
  const closed = { host: [], guest: [] };
  const make = (me, them, team, host) => rankedLink({ host, seed: 5, team, cards: host ? 900 : 300, rival: { name: them }, transport: transport(me, them),
    now: () => clock.t, makeMap: field, rand: () => 0.5,
    report: async (said) => { reports[me].push(said); }, finish: async (said) => { reports[me].push(said); } });
  const host = make("host", "guest", hostTeam, true);
  const guest = make("guest", "host", guestTeam, false);
  const raw = (m) => queues.host.push(m); // (the guest's channel, as anything at all could use it)
  const deliver = () => { for (const side of ["host", "guest"]) for (const m of queues[side].splice(0)) ear[side](m); };
  for (const [side, link] of [["host", host], ["guest", guest]]) link.attach({ banner: () => {}, close: (why) => closed[side].push(why) });
  return { host, guest, clock, deliver, raw, cut, sent, reports, closed };
}

/** Connect both and open the battle on both screens; the guest has had its first picture. */
async function started(opts) {
  const p = pair(opts);
  const both = Promise.all([p.host.connect(), p.guest.connect()]);
  for (let i = 0; i < 5; i++) { p.deliver(); await Promise.resolve(); }
  await both;
  p.hb = p.host.start({ ask: asker("h") });
  p.gb = p.guest.start({ ask: asker("g") });
  p.run = (secs, each = () => {}) => {
    for (let t = 0; t < secs - 1e-9; t += DT) {
      p.clock.t += DT;
      each();
      p.deliver();
      p.host.engine.step(p.hb, DT);
      p.deliver();
      p.guest.engine.step(p.gb, DT);
    }
  };
  p.events = { host: [], guest: [] };
  p.runLog = (secs, each) => { const h = p.host.engine.step, g = p.guest.engine.step;
    const wrap = (side, f) => (bb, dt) => { const e = f(bb, dt); p.events[side].push(...e); return e; };
    p.host.engine.step = wrap("host", h); p.guest.engine.step = wrap("guest", g);
    try { p.run(secs, each); } finally { p.host.engine.step = h; p.guest.engine.step = g; } };
  p.run(0.3);
  return p;
}
const stopAll = (p) => { p.host.stop(); p.guest.stop(); };
const kinds = (events, kind) => events.filter((e) => e.kind === kind);

test("they meet: each gets the other's checked team, and the guest sees itself as the host's rival", async () => {
  const p = await started();
  try {
    assert.equal(p.hb.mode, "ranked");
    assert.equal(p.hb.wordMode, "alltime");
    assert.equal(p.hb.ai.foe, null, "nobody's computer plays a person");
    assert.equal(p.hb.theirs[0].type, "tide");
    assert.equal(p.gb.mine[0].type, "tide");
    assert.equal(p.gb.theirs[0].type, "ember");
    // the same creature, at the same place, on both screens
    const hostFoe = current(p.hb, "foe"), guestMe = current(p.gb, "me");
    assert.ok(Math.hypot(hostFoe.x - guestMe.x, hostFoe.y - guestMe.y) < 2);
    assert.equal(guestMe.max, hostFoe.max, "both sides scaled the same way by their cards");
    assert.ok(p.sent.host.every((m) => m.v === PROTOCOL));
  } finally { stopAll(p); }
});

test("an older app is told apart, and nobody turning up ends the wait", async () => {
  // a hello from an app that speaks another version
  const raw = { v: PROTOCOL + 1, t: "hello", team: [], cards: 0, have: true };
  const bad = rankedLink({ host: true, seed: 1, team: [], transport: { send() {}, onMessage(f) { setTimeout(() => f(raw), 0); }, joined: () => true, close() {} }, now: () => 0 });
  await assert.rejects(bad.connect(), /version/);
  bad.stop();
  let t = 0;
  const lonely = rankedLink({ host: true, seed: 1, team: [], transport: { send() {}, onMessage() {}, joined: () => true, close() {} }, now: () => t });
  const gone = lonely.connect();
  t = HELLO_S + 1;
  await assert.rejects(gone, /timeout/);
  lonely.stop();
});

test("the guest walks: its stick reaches the host's battle, and its creature moves on both screens", async () => {
  const p = await started();
  try {
    const x0 = current(p.hb, "foe").x;
    p.run(1, () => p.guest.engine.input(p.gb, { move: { x: 1, y: 0 } }));
    const hx = current(p.hb, "foe").x;
    assert.ok(hx > x0 + 20, `the host's copy moved right (${x0} -> ${hx})`);
    p.run(0.6, () => p.guest.engine.input(p.gb, { move: null }));
    assert.ok(Math.abs(current(p.gb, "me").x - current(p.hb, "foe").x) < 6, "the guest's picture caught up");
    // what the guest sent stayed small: only changes, at most 8 a second
    const ins = p.sent.guest.filter((m) => m.t === "in");
    assert.ok(ins.length <= 14, `${ins.length} control messages in 1.6 s`);
  } finally { stopAll(p); }
});

test("the guest attacks: both get a question at once; the guest right first lands it in full", async () => {
  const p = await started();
  try {
    const hp0 = current(p.hb, "me").hp;
    p.guest.engine.input(p.gb, { attack: "tackle" });
    p.run(0.1);
    assert.ok(p.hb.quiz && p.hb.quiz.side === "foe" && p.hb.quiz.q, "the host has a dodge question");
    assert.ok(p.gb.quiz && p.gb.quiz.side === "me" && p.gb.quiz.q.uid.startsWith("g"), "the guest has an attack question from its own words");
    const mine = p.guest.engine.answer(p.gb, 0); // right, quickly
    assert.equal(mine[0].correct, true);
    assert.equal(mine[0].fast, true);
    p.runLog(2);
    const closing = p.events.host.find((e) => e.kind === "answer");
    assert.ok(closing && closing.rival, "the host's question closed: the guest was quicker");
    const hit = kinds(p.events.host, "hit").find((e) => e.target === "me");
    assert.ok(hit && !hit.half, "a full hit on the host");
    assert.ok(current(p.hb, "me").hp < hp0);
    assert.ok(kinds(p.events.guest, "hit").some((e) => e.target === "foe"), "the guest sees its hit land on its rival");
    assert.equal(p.gb.answers.right, 1);
  } finally { stopAll(p); }
});

test("the host dodges first: half damage, and the guest's question closes saying so", async () => {
  const p = await started();
  try {
    p.guest.engine.input(p.gb, { attack: "tackle" });
    p.run(0.1);
    const ev = p.host.engine.answer(p.hb, 0); // the host right before the guest
    assert.equal(ev[0].correct, true);
    p.runLog(2);
    assert.equal(p.gb.quiz, null);
    const told = p.events.guest.find((e) => e.kind === "answer");
    assert.ok(told && told.rival, "the guest is told the rival answered quicker");
    const hit = kinds(p.events.host, "hit").find((e) => e.target === "me");
    assert.ok(hit && hit.half, "half damage");
    // the guest's late answer changes nothing now
    assert.deepEqual(p.guest.engine.answer(p.gb, 0), []);
  } finally { stopAll(p); }
});

test("a wrong attack misses, even if the defender got it wrong too; a defender's wrong answer waits for the attacker", async () => {
  const p = await started();
  try {
    p.guest.engine.input(p.gb, { attack: "tackle" });
    p.run(0.1);
    const ev = p.host.engine.answer(p.hb, 2); // the host wrong first
    assert.ok(ev[0].waiting, "nothing decided yet");
    assert.ok(p.hb.quiz && p.hb.quiz.done, "the world still waits for the guest");
    p.guest.engine.answer(p.gb, 3); // the guest wrong too
    p.runLog(1.5);
    assert.equal(p.hb.quiz, null);
    assert.ok(kinds(p.events.host, "failed").some((e) => e.side === "foe"), "the guest's move failed");
    assert.ok(!kinds(p.events.host, "hit").length);
  } finally { stopAll(p); }
});

test("the host attacks: the guest dodging right first halves it; the guest wrong leaves the host to answer", async () => {
  const p = await started();
  try {
    // dodged
    p.host.engine.input(p.hb, { attack: "tackle" });
    p.run(0.1);
    assert.ok(p.hb.quiz && p.hb.quiz.side === "me");
    assert.ok(p.gb.quiz && p.gb.quiz.side === "foe", "the guest has a dodge question");
    p.guest.engine.answer(p.gb, 0);
    p.runLog(2);
    const closing = p.events.host.find((e) => e.kind === "answer");
    assert.ok(closing && closing.rival, "the host is told the guest was quicker");
    assert.ok(kinds(p.events.host, "hit").some((e) => e.target === "foe" && e.half));
    // not dodged: the guest wrong, the host right a moment later
    p.run(3); // (cooldown)
    p.events = { host: [], guest: [] };
    p.host.engine.input(p.hb, { attack: "tackle" });
    p.run(0.1);
    p.guest.engine.answer(p.gb, 1);
    p.run(0.2);
    assert.ok(p.hb.quiz, "a wrong dodge changes nothing: the host still answers");
    p.host.engine.answer(p.hb, 0);
    p.runLog(2);
    assert.ok(kinds(p.events.host, "hit").some((e) => e.target === "foe" && !e.half), "a full hit");
  } finally { stopAll(p); }
});

test("the host gets it wrong: the guest's dodge question closes with 'no damage'", async () => {
  const p = await started();
  try {
    p.host.engine.input(p.hb, { attack: "tackle" });
    p.run(0.1);
    p.host.engine.answer(p.hb, 1);
    p.runLog(0.5);
    const told = p.events.guest.find((e) => e.kind === "answer");
    assert.ok(told && told.missed, "missed: nothing to dodge");
    assert.equal(p.gb.quiz, null);
  } finally { stopAll(p); }
});

test("an attacker who never answers misses, a moment after the time is up", async () => {
  const p = await started();
  try {
    p.cut.guest = true; // the guest's answers never arrive...
    p.guest.engine.input(p.gb, { attack: "tackle" });
    p.cut.guest = false;
    p.guest.engine.input(p.gb, { attack: "tackle" }); // (sent again: the first was lost)
    p.run(0.1);
    assert.ok(p.hb.quiz);
    p.host.engine.answer(p.hb, 2);
    p.runLog(p.hb.quizS + 1, () => { if (p.gb.quiz) p.gb.quiz.timeLeft = 99; }); // the guest just sits there
    assert.equal(p.hb.quiz, null);
    assert.ok(kinds(p.events.host, "failed").some((e) => e.side === "foe" && e.why === "time"));
  } finally { stopAll(p); }
});

test("what arrives is checked: no moves it doesn't have, no stick past full, no aim off the arena, no junk", async () => {
  const p = await started();
  try {
    const before = current(p.hb, "foe").x;
    p.guest.engine.input(p.gb, { attack: "meteor_of_doom" });
    p.run(0.2);
    assert.equal(p.hb.quiz, null, "a move it doesn't have does nothing");
    // straight onto the channel, as a changed app could send them
    p.raw({ v: PROTOCOL, t: "in", move: { x: 50, y: 0 } });
    p.run(0.5);
    const speed = (current(p.hb, "foe").x - before) / 0.5;
    assert.ok(speed > 10 && speed < 200, `no faster than walking (${speed})`);
    p.raw({ v: PROTOCOL, t: "in", move: null, aim: { x: -1e9, y: 1e9 }, goTo: { x: "a" } });
    p.run(0.1);
    const aim = p.hb.ctl.foe.aim;
    assert.ok(aim.x >= 0 && aim.y <= p.hb.height, "the aim is kept on the arena");
    p.raw({ v: PROTOCOL, t: "ans", id: 999, correct: true });
    p.raw("nonsense");
    p.raw(null);
    p.run(0.1);
    assert.equal(p.hb.over, false);
  } finally { stopAll(p); }
});

test("the end: the host's battle over is the guest's too, the other way round; both report", async () => {
  const p = await started();
  try {
    for (const f of p.hb.mine) { f.hp = 1; }
    p.hb.theirs[0].atk = 999;
    p.guest.engine.input(p.gb, { attack: "tackle" });
    p.run(0.1);
    p.guest.engine.answer(p.gb, 0);
    p.runLog(4);
    assert.equal(p.hb.over, true);
    assert.equal(p.hb.won, false);
    assert.equal(p.gb.over, true);
    assert.equal(p.gb.won, true);
    assert.ok(kinds(p.events.guest, "end").some((e) => e.won === true));
    await p.host.finish(p.hb.won, null);
    await p.guest.finish(p.gb.won, null);
    assert.deepEqual(p.reports.host, ["lost"]);
    assert.deepEqual(p.reports.guest, ["won"]);
  } finally { stopAll(p); }
});

test("leaving on purpose: a loss for the one who left, a win the other's screen shows", async () => {
  const p = await started();
  try {
    await p.guest.quit();
    assert.deepEqual(p.reports.guest, ["quit"]);
    p.runLog(0.2);
    assert.equal(p.hb.over, true);
    assert.equal(p.hb.won, true);
    assert.ok(kinds(p.events.host, "end").some((e) => e.won && e.quit));
    await p.host.finish(true, null);
    assert.deepEqual(p.reports.host, ["won"]);
  } finally { stopAll(p); }
});

test("the connection drops: the world waits, then the battle stops with no points moved", async () => {
  const p = await started();
  try {
    p.cut.guest = true;
    const t0 = p.hb.time;
    p.run(STALL_S + 1);
    assert.ok(p.hb.time - t0 < STALL_S + 0.1, "the host's world stopped soon after the guest went quiet");
    p.run(LOST_S);
    assert.deepEqual(p.closed.host, ["lost"]);
    assert.deepEqual(p.reports.host, ["won"], "still online itself: it says so (counted only against someone who keeps vanishing)");
    assert.deepEqual(p.closed.guest, ["lost"], "the guest saw no pictures either");
    assert.ok(["won", "broken"].includes(p.reports.guest[0]));
  } finally { stopAll(p); }
});

test("a short break heals: the battle carries on where it was", async () => {
  const p = await started();
  try {
    p.cut.guest = true;
    p.run(3);
    p.cut.guest = false;
    const t0 = p.hb.time;
    p.run(1, () => p.guest.engine.input(p.gb, { move: { x: 0, y: 1 } }));
    assert.ok(p.hb.time > t0 + 0.8, "the world runs again");
    assert.deepEqual(p.closed.host, []);
    assert.deepEqual(p.reports.host, []);
  } finally { stopAll(p); }
});

test("teams come only from what the game can make: a sent team is checked as a friend's is", () => {
  const strong = { ...genome(9, "tide"), growth: 50, atk: 99999, max: 99999, loadout: ["tackle", "not_a_move"] };
  const [f] = teamFrom([strong, null, "x"]);
  assert.ok(f.max < 1000 && f.atk < 200, "its numbers come from its kind and growth, never from what was sent");
  assert.deepEqual(f.moves, ["tackle"]);
  assert.equal(teamFrom("nonsense").length, 0);
});

test("the host's own remoteAnswer does nothing in a battle against the computer", () => {
  const b = { remote: false, quiz: { side: "me" } };
  assert.deepEqual(remoteAnswer(b, true), []);
});
