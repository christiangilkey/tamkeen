// Ranked battles between two people, live (prototype "ranked"; the owner: "I want live now"). Two devices, one
// battle: the HOST (the server's pick, ranked_poll's `host`) runs livebattle.js as in any battle, with its rival's
// side played from the other device instead of by the computer (newLiveBattle `remote`). The GUEST runs no battle
// of its own: it draws the host's battle seen from its side (its creature as "me"), sends its moves, and answers its
// own questions.
//
// The questions are the answer race the battles already have: when either side attacks, the world stands still
// for both, the attacker gets a question about one of THEIR OWN words and the defender a dodge question about one
// of THEIR OWN words, at the same moment. Only "right or wrong, and was it fast" crosses the network, never a word.
// First right answer wins: the attacker's lands in full; the defender's takes half of it. A wrong attacker misses.
//
// The two talk over a Supabase Realtime broadcast channel named after the match (`ranked-<match id>`, an id only the
// two players are told), at most about 8 messages a second each. Everything that arrives is checked before use.
// If one goes quiet the world waits (STALL_S), and after LOST_S the battle stops with no points changed; leaving on
// purpose counts as a loss (both reported to the server, which decides: supabase/v18-ranked.sql).
//
// Nothing here touches the page: ranked-ui.js opens the battle screen (livebattle-ui.js `setup.net`) with a link
// made here, so the whole exchange can be tested with two links on a stand-in channel (tests/js/rankedlive.test.mjs).

import { FAST_S, SIDES, answer, current, fire, input, newLiveBattle, other, remoteAnswer, step } from "./livebattle.js";
import { generateMap } from "./battlemap.js";
import { fighters, friendTeam } from "./battle.js";
import { LIMITS, cleanTeam, clampInt } from "./remote.js";

export const PROTOCOL = 1;      // raised when what is sent changes: an older app is told, rather than misread
export const SNAP_HZ = 8;       // the host's pictures of the battle, a second
export const INPUT_HZ = 8;      // the guest's controls, a second at most (sent only when they change)
export const PING_S = 1;        // "still here", when nothing else has been sent for this long
export const STALL_S = 1.5;     // nothing heard for this long: the world waits for the other player
export const LOST_S = 10;       // ...this long: the connection is lost, the battle stops, no points change
export const HELLO_S = 20;      // the other player never turned up
export const HELLO_EVERY_S = 0.7;
export const MAX_EVENTS = 60;   // what happened since the last picture (more is cut: only effects are lost)
const FULL_MAP_S = 5;           // the whole ground again, every this often, once a move has repainted any of it

const DROP = new Set(["quiz", "answer", "aim", "pickup"]); // the host's own question events: the guest makes its own
const FX_KEYS = ["id", "kind", "form", "side", "move", "element", "x", "y", "dx", "dy", "r", "blast", "len", "half", "width",
  "warn", "t", "landed", "done", "speed", "turn"];
// A fighter's fixed parts (made the same on both devices from the same checked team); everything else is sent.
const FIXED = new Set(["side", "index", "name", "look", "type", "species", "moves", "atk", "def", "spd", "hungry"]);

const flip = (side) => (side === "me" ? "foe" : side === "foe" ? "me" : side);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v, k = 100) => Math.round(v * k) / k;

/** A side's team from what its device sent: checked as a friend's team is (remote.js), no week's rule. */
export function teamFrom(sent) {
  const team = friendTeam({ team: cleanTeam(Array.isArray(sent) ? sent : []) }, null);
  return fighters(null, team, { rule: null });
}
export const cardsFrom = (v) => clampInt(v, 0, LIMITS.known, 0);

/** The Realtime channel for a match, as {send, onMessage, joined, close}. `client` is the Supabase client. */
export async function realtimeLink(client, matchId) {
  const heard = new Set();
  const ch = client.channel(`ranked-${matchId}`, { config: { broadcast: { self: false, ack: false } } });
  ch.on("broadcast", { event: "rk" }, ({ payload }) => { for (const f of heard) f(payload); });
  await new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error("timeout")), HELLO_S * 1000);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(t); ok(); } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(t); no(new Error(status)); }
    });
  });
  return {
    send: (msg) => { try { ch.send({ type: "broadcast", event: "rk", payload: msg }); } catch { /* the channel is down: the other side notices the silence */ } },
    onMessage: (f) => heard.add(f),
    joined: () => ch.state === "joined",
    close: () => { heard.clear(); try { client.removeChannel(ch); } catch { /* gone already */ } },
  };
}

/**
 * One player's end of a ranked battle.
 *   host      true on the device that runs the battle
 *   seed      the arena (the server's, the same on both)
 *   team      my team as sent to friends (battle.publicProfile(...).team); cards: my saved cards
 *   rival     {name}: the other player's username
 *   transport {send, onMessage, joined, close} (realtimeLink, or a stand-in in tests)
 *   report(said)     tell the server "quit" | "won" | "broken" (the end card's "won"/"lost" go through finish)
 *   finish(said, card) the battle ended on the screen: report it and show the result on the end card
 *   now()     seconds (performance.now() / 1000 in the page); makeMap(seed): the arena (tests give a plain one)
 * Returns {connect, start, engine, attach, quit, stop, guest, host}: connect() resolves once both sides have each
 * other's team; start(opts) makes the battle the screen shows (opts: ask, aim, as livebattle-ui gives).
 */
export function rankedLink({ host, seed, team, cards = 0, rival = {}, transport, report = async () => {}, finish = async () => {},
  now = () => performance.now() / 1000, rand = Math.random, makeMap = generateMap, online = () => (typeof navigator === "undefined" || navigator.onLine !== false) }) {
  const mine = { team: Array.isArray(team) ? team : [], cards: cardsFrom(cards) };
  let theirs = null;            // {team, cards} once their hello came
  let theyHaveMine = false;     // their hello said they have my team
  let lastHeard = now(), lastSent = -1e9, lastSnap = now();
  let b = null, done = false;
  let hooks = { banner: () => {}, close: () => {} };
  let stallShown = 0;
  const inbox = [];             // messages waiting for the next step
  let connected = null;
  let helloTimer = 0;

  const send = (msg) => { lastSent = now(); transport.send({ v: PROTOCOL, ...msg }); };
  transport.onMessage((m) => {
    if (!isObj(m) || done) return;
    lastHeard = now();
    if (m.v !== PROTOCOL) { if (connected) connected.fail("version"); return; }
    if (m.t === "hello") {
      const first = !theirs;
      if (first) theirs = { team: Array.isArray(m.team) ? m.team.slice(0, 12) : [], cards: cardsFrom(m.cards) };
      if (m.have) theyHaveMine = true;
      if (first || !m.have) send({ t: "hello", team: mine.team, cards: mine.cards, have: true }); // (at once: I have theirs)
      if (connected) connected.check();
      return;
    }
    inbox.push(m);
  });

  // ---------- meeting ----------
  function connect() {
    return new Promise((ok, no) => {
      const started = now();
      const stopIt = () => { clearInterval(helloTimer); connected = null; };
      connected = {
        check() { if (theirs && theyHaveMine) { send({ t: "hello", team: mine.team, cards: mine.cards, have: true }); stopIt(); ok({ cards: theirs.cards }); } },
        fail(why) { stopIt(); no(new Error(why)); },
      };
      const hello = () => {
        if (now() - started > HELLO_S) { connected && connected.fail("timeout"); return; }
        send({ t: "hello", team: mine.team, cards: mine.cards, have: !!theirs });
      };
      hello();
      helloTimer = setInterval(hello, HELLO_EVERY_S * 1000);
      connected.check();
    });
  }

  // ---------- the battle ----------
  function start({ ask = null, aim = false } = {}) {
    if (!theirs) throw new Error("start_before_connect");
    const me = teamFrom(mine.team), them = teamFrom(theirs.team);
    for (const f of them) f.name = f.name || rival.name || "";
    b = newLiveBattle({ mine: me, theirs: them, map: makeMap(seed >>> 0), mode: "ranked", wordMode: "alltime",
      cards: { me: mine.cards, foe: theirs.cards }, ask, rand, aim, aimMoment: false, race: true, remote: true,
      rival: { id: null, name: rival.name || "" } });
    lastHeard = now();
    lastSnap = now();
    if (!host) { // the guest starts where the host has it: on the far side
      for (const side of SIDES) { const f = current(b, side), at = b.starts[flip(side)]; f.x = at.x; f.y = at.y; f.face = side === "me" ? -1 : 1; }
      send({ t: "go" });
    }
    timer = setInterval(heartbeat, PING_S * 1000);
    return b;
  }
  let timer = 0;
  function heartbeat() {
    if (done) return;
    if (now() - lastSent >= PING_S * 0.9) send({ t: "ping" });
    if (!b || b.over) return;
    if (now() - lastHeard > LOST_S || (!host && now() - lastSnap > LOST_S)) lost(); // (the screen may not be stepping)
  }

  /** The connection is gone: no points change (the server is told; it decides). */
  function lost() {
    if (done) return;
    done = true;
    clearInterval(timer);
    // Still online myself: the other one went away, so I say I won; the server counts that only against someone
    // who keeps vanishing (from the third time in a day). Offline myself: "broken", which never counts.
    const said = online() && (!transport.joined || transport.joined()) ? "won" : "broken";
    send({ t: "bye" });
    report(said);
    hooks.close("lost");
  }

  // ----- host -----
  const host$ = {
    quizSeq: 0, quiz: null, ended: null, events: [], tiles: null, under: null, mapChanged: false, fullAt: 0, go: false,
  };
  function hostIncoming() {
    const out = [];
    for (const m of inbox.splice(0)) {
      if (m.t === "go") host$.go = true;
      else if (m.t === "in") applyInput(m);
      else if (m.t === "ans") {
        if (b.quiz && b.quiz.id === m.id && !b.over) out.push(...remoteAnswer(b, m.correct === true, m.fast === true));
      } else if (m.t === "quit") theyQuit(out);
      else if (m.t === "bye") { lost(); }
    }
    return out;
  }
  function applyInput(m) {
    const cmd = {};
    if ("move" in m) cmd.move = isObj(m.move) && finite(m.move.x) && finite(m.move.y) ? { x: clamp(m.move.x, -1, 1), y: clamp(m.move.y, -1, 1) } : null;
    if ("goTo" in m) cmd.goTo = isObj(m.goTo) && finite(m.goTo.x) && finite(m.goTo.y) ? { x: clamp(m.goTo.x, 0, b.width), y: clamp(m.goTo.y, 0, b.height) } : null;
    if ("aim" in m) cmd.aim = isObj(m.aim) && finite(m.aim.x) && finite(m.aim.y) ? { x: clamp(m.aim.x, 0, b.width), y: clamp(m.aim.y, 0, b.height) } : null;
    if (typeof m.attack === "string" && current(b, "foe").moves.includes(m.attack)) cmd.attack = m.attack;
    if (Object.keys(cmd).length) input(b, cmd, "foe");
  }
  function theyQuit(out) {
    if (b.over) return;
    b.over = true;
    b.won = true; // the one who stays wins
    out.push({ kind: "end", won: true, quit: true });
  }
  /** Watch the host's question: number each one, and say how the last one ended (for the guest's question). */
  function hostQuiz(events) {
    if (host$.quiz && b.quiz !== host$.quiz) {
      const ans = events.find((e) => e.kind === "answer" && e.side === "me" && !e.waiting);
      const how = !ans ? "time" : ans.rival || ans.missed ? "theirs" : ans.correct ? "rival" : "missed";
      host$.ended = { id: host$.quiz.id, how };
      host$.quiz = null;
      host$.urgent = true;
    }
    if (b.quiz && !b.quiz.id) { b.quiz.id = ++host$.quizSeq; host$.quiz = b.quiz; host$.urgent = true; }
  }
  function hostStep(dt) {
    const pre = hostIncoming();
    if (done) return b.over ? [...pre, ...step(b, dt)] : pre; // (after the end, only the last animations run on)
    let events = pre;
    const quiet = now() - lastHeard;
    if (quiet > LOST_S && !b.over) { lost(); return events; }
    if (!b.over && (!host$.go || quiet > STALL_S)) { // the guest isn't there (yet): the world waits
      if (host$.go && now() - stallShown > 1.5) { stallShown = now(); hooks.banner("stall"); }
    } else events = [...events, ...step(b, dt)];
    hostQuiz(events);
    keep(events);
    if (b.over) host$.urgent = true;
    if (host$.urgent || now() - lastSent >= 1 / SNAP_HZ) snapshot();
    return events;
  }
  function keep(events) {
    for (const e of events) if (!DROP.has(e.kind)) host$.events.push(e);
    if (host$.events.length > MAX_EVENTS) host$.events.splice(0, host$.events.length - MAX_EVENTS);
  }
  function mapDiff() {
    const tiles = b.map.tiles, under = Array.isArray(b.map.under) ? b.map.under : null;
    if (!host$.tiles) { host$.tiles = tiles.slice(); host$.under = under ? under.slice() : null; }
    const d = [];
    for (let i = 0; i < tiles.length; i++) if (tiles[i] !== host$.tiles[i]) { d.push([i, tiles[i]]); host$.tiles[i] = tiles[i]; }
    const du = [];
    if (under) for (let i = 0; i < under.length; i++) if (under[i] !== host$.under[i]) { du.push([i, under[i]]); host$.under[i] = under[i]; }
    if (d.length || du.length) host$.mapChanged = true;
    const out = {};
    if (d.length) out.tiles = d;
    if (du.length) out.under = du;
    if (host$.mapChanged && now() - host$.fullAt > FULL_MAP_S) { host$.fullAt = now(); out.all = { tiles: tiles.slice(), under: under ? under.slice() : null }; }
    return out;
  }
  function snapshot() {
    host$.urgent = false;
    const live = (f) => { const o = {}; for (const k of Object.keys(f)) if (!FIXED.has(k)) o[k] = f[k]; return o; };
    const bench = (list) => list.map((f) => ({ hp: f.hp, max: f.max, fainted: !!f.fainted }));
    send({
      t: "s", time: round(b.time, 1000), over: b.over, won: b.won, me: b.me, foe: b.foe, swap: b.swap, combo: b.combo, foeCombo: b.foeCombo,
      spikesUp: b.spikesUp, mine: bench(b.mine), theirs: bench(b.theirs), f: { me: live(current(b, "me")), foe: live(current(b, "foe")) },
      fx: b.fx.map((p) => { const o = {}; for (const k of FX_KEYS) if (p[k] !== undefined) o[k] = p[k]; return o; }),
      quiz: b.quiz ? { id: b.quiz.id, side: b.quiz.side, move: b.quiz.move } : null, ended: host$.ended,
      map: mapDiff(), events: host$.events.splice(0),
    });
  }

  // ----- guest -----
  const guest$ = { snap: null, prevSnap: null, seen: 0, sentIn: {}, pendingIn: {}, inAt: -1e9, shown: new Map(), events: [] };
  function guestIncoming() {
    for (const m of inbox.splice(0)) {
      if (m.t === "s") { lastSnap = now(); guest$.prevSnap = guest$.snap; guest$.snap = m; applySnap(m); }
      else if (m.t === "quit") { if (!b.over) { b.over = true; b.won = true; guest$.events.push({ kind: "end", won: true, quit: true }); } }
      else if (m.t === "bye") lost();
    }
  }
  /** The host's picture, seen from my side: its "foe" is my "me". */
  function applySnap(s) {
    try {
      if (finite(s.time)) b.time = s.time;
      if (Number.isInteger(s.foe) && s.foe >= 0 && s.foe < b.mine.length) b.me = s.foe;
      if (Number.isInteger(s.me) && s.me >= 0 && s.me < b.theirs.length) b.foe = s.me;
      if (isObj(s.swap)) b.swap = { me: finite(s.swap.foe) ? s.swap.foe : null, foe: finite(s.swap.me) ? s.swap.me : null };
      b.combo = clampInt(s.foeCombo, 0, 9, 0);
      b.foeCombo = clampInt(s.combo, 0, 9, 0);
      b.spikesUp = s.spikesUp !== false;
      const bench = (list, from) => { if (Array.isArray(from)) list.forEach((f, i) => { const x = from[i]; if (isObj(x) && finite(x.hp)) { f.hp = x.hp; f.fainted = !!x.fainted; if (finite(x.max) && x.max > 0) f.max = x.max; } }); };
      bench(b.mine, s.theirs);
      bench(b.theirs, s.mine);
      if (isObj(s.f)) { fighterFrom(current(b, "me"), s.f.foe, "me"); fighterFrom(current(b, "foe"), s.f.me, "foe"); }
      if (Array.isArray(s.fx)) b.fx = s.fx.filter(isObj).slice(0, 80).map((p) => ({ ...p, side: flip(p.side) }));
      if (isObj(s.map)) mapFrom(s.map);
      if (Array.isArray(s.events)) for (const e of s.events.slice(0, MAX_EVENTS)) if (isObj(e) && !DROP.has(e.kind)) {
        if (e.kind === "refused" && e.side !== "foe") continue; // the host's own refusals are no business of mine
        const m = { ...e };
        if ("side" in m) m.side = flip(m.side);
        if ("target" in m) m.target = flip(m.target);
        if (m.kind === "end") m.won = !e.won;
        guest$.events.push(m);
      }
      if (s.over && !b.over) { b.over = true; b.won = s.won === false; }
      guestQuiz(s);
    } catch { /* a bad picture is skipped: the next one puts it right */ }
  }
  function fighterFrom(f, x, side) {
    if (!isObj(x) || !finite(x.x) || !finite(x.y)) return;
    const shown = guest$.shown.get(side);
    for (const k of Object.keys(f)) if (!FIXED.has(k) && !(k in x)) delete f[k];
    for (const [k, v] of Object.entries(x)) if (!FIXED.has(k)) f[k] = v;
    f.side = side;
    // Drawn where it was, gliding to where the host has it (unless it jumped: stepping in, thrown)
    const to = { x: f.x, y: f.y, at: now(), vx: 0, vy: 0, index: f.index };
    if (shown && shown.index === f.index && Math.hypot(to.x - shown.tx, to.y - shown.ty) < 64) {
      const dt = Math.max(0.05, to.at - shown.at);
      to.vx = clamp((to.x - shown.tx) / dt, -400, 400);
      to.vy = clamp((to.y - shown.ty) / dt, -400, 400);
      f.x = shown.x;
      f.y = shown.y;
    }
    guest$.shown.set(side, { x: f.x, y: f.y, tx: to.x, ty: to.y, vx: to.vx, vy: to.vy, at: to.at, index: f.index });
  }
  function mapFrom(m) {
    const put = (arr, list) => { if (Array.isArray(arr) && Array.isArray(list)) for (const p of list) if (Array.isArray(p) && Number.isInteger(p[0]) && p[0] >= 0 && p[0] < arr.length) arr[p[0]] = p[1]; };
    if (isObj(m.all) && Array.isArray(m.all.tiles) && m.all.tiles.length === b.map.tiles.length) {
      b.map.tiles.splice(0, b.map.tiles.length, ...m.all.tiles);
      if (Array.isArray(b.map.under) && Array.isArray(m.all.under) && m.all.under.length === b.map.under.length) b.map.under.splice(0, b.map.under.length, ...m.all.under);
    }
    put(b.map.tiles, m.tiles);
    put(b.map.under, m.under);
  }
  /** A question for me: the host has opened one I have a part in (I attack, or I dodge). */
  function guestQuiz(s) {
    const q = isObj(s.quiz) && Number.isInteger(s.quiz.id) ? s.quiz : null;
    if (q && q.id > guest$.seen) {
      guest$.seen = q.id;
      const side = flip(q.side);
      const ask = b.ask;
      const question = ask ? ask(q.move, b) : null;
      if (question && Array.isArray(question.options) && question.options.length) {
        b.quiz = { id: q.id, side, move: q.move, q: question, timeLeft: b.quizS, total: b.quizS };
        guest$.events.push({ kind: "quiz", side, move: q.move });
      } else send({ t: "ans", id: q.id, correct: false, fast: false }); // (no word to ask: as a wrong answer)
    }
    const e = isObj(s.ended) ? s.ended : null;
    if (e && b.quiz && b.quiz.id === e.id) { // the host's side settled it first
      const qz = b.quiz;
      b.quiz = null;
      const f = current(b, "me");
      const base = { kind: "answer", side: "me", dodge: qz.side === "foe", move: qz.move, uid: qz.q.uid, correct: false, fast: false, choice: null, right: qz.q.answer, x: f.x, y: f.y };
      if (e.how === "rival") guest$.events.push({ ...base, rival: true });
      else if (e.how === "missed") guest$.events.push({ ...base, missed: true });
      else { b.answers.wrong++; guest$.events.push({ ...base, plain: true }); }
    }
  }
  function guestStep(dt) {
    guestIncoming();
    const events = guest$.events.splice(0);
    if (done && !b.over) return events;
    const time = clamp(Number(dt) || 0, 0, 0.1);
    if (!done && !b.over && now() - lastSnap > STALL_S && now() - stallShown > 1.5) { stallShown = now(); hooks.banner("stall"); }
    if (!done && !b.over && (now() - lastSnap > LOST_S || now() - lastHeard > LOST_S)) { lost(); return events; }
    // my own question's seconds
    if (b.quiz) {
      b.quiz.timeLeft = Math.max(0, b.quiz.timeLeft - time);
      if (b.quiz.timeLeft <= 0) events.push(...guestAnswer(null));
    }
    // between the host's pictures: animations run on, creatures glide, shots fly
    for (const side of SIDES) { const f = current(b, side); if (f.act && !b.quiz) f.act.t = Math.min(f.act.dur, f.act.t + time); }
    if (!b.quiz && !b.over && now() - lastSnap < STALL_S) {
      b.time += time;
      for (const side of SIDES) {
        const f = current(b, side), s = guest$.shown.get(side);
        if (!s) continue;
        const age = Math.min(0.15, now() - s.at);
        const tx = s.tx + s.vx * age, ty = s.ty + s.vy * age;
        const k = 1 - Math.exp(-time * 14);
        f.x += (tx - f.x) * k;
        f.y += (ty - f.y) * k;
        s.x = f.x; s.y = f.y;
      }
      for (const p of b.fx) {
        if (finite(p.t)) p.t += time;
        if (p.kind === "projectile" && finite(p.speed) && finite(p.dx) && finite(p.dy)) { p.x += p.dx * p.speed * time; p.y += p.dy * p.speed * time; }
      }
    }
    const me = current(b, "me");
    if (!b.over && b.me === b.mine.length - 1 && me.hp > 0 && me.hp <= me.max * 0.15) b.brink = true;
    flushInput();
    if (!done && now() - lastSent >= PING_S) send({ t: "ping" });
    return events;
  }
  /** My answer (null: out of time): sent to the host, which settles the race; here only my own word is marked. */
  function guestAnswer(choice) {
    const qz = b.quiz;
    if (!qz) return [];
    b.quiz = null;
    const picked = Number.isInteger(choice) && choice >= 0 ? choice : null;
    const correct = picked !== null && picked === qz.q.answer;
    const fast = correct && qz.total - qz.timeLeft <= FAST_S;
    send({ t: "ans", id: qz.id, correct, fast });
    if (correct) b.answers.right++; else b.answers.wrong++;
    if (fast) b.answers.fast++;
    const f = current(b, "me");
    return [{ kind: "answer", side: "me", dodge: qz.side === "foe", move: qz.move, uid: qz.q.uid, correct, fast, choice: picked, right: qz.q.answer, plain: true, x: f.x, y: f.y }];
  }
  function guestInput(cmd = {}) {
    const p = guest$.pendingIn;
    const same = (a, c) => (a == null && c == null) || (a && c && a.x === c.x && a.y === c.y);
    if ("move" in cmd) {
      const m = cmd.move, len = m ? Math.hypot(m.x || 0, m.y || 0) : 0;
      const v = len > 0.01 ? { x: round((m.x || 0) / Math.max(1, len), 20), y: round((m.y || 0) / Math.max(1, len), 20) } : null;
      if (!same(v, "move" in p ? p.move : guest$.sentIn.move)) p.move = v;
      if (v) { delete p.goTo; guest$.sentIn.goTo = null; }
    }
    if ("goTo" in cmd) {
      const v = cmd.goTo && finite(cmd.goTo.x) && finite(cmd.goTo.y) ? { x: Math.round(cmd.goTo.x), y: Math.round(cmd.goTo.y) } : null;
      if (!same(v, "goTo" in p ? p.goTo : guest$.sentIn.goTo)) p.goTo = v;
    }
    if ("aim" in cmd) {
      input(b, { aim: cmd.aim }); // (the crosshair is drawn here)
      const v = cmd.aim && finite(cmd.aim.x) && finite(cmd.aim.y) ? { x: Math.round(cmd.aim.x / 4) * 4, y: Math.round(cmd.aim.y / 4) * 4 } : null;
      if (!same(v, "aim" in p ? p.aim : guest$.sentIn.aim)) p.aim = v;
    }
    if (cmd.sight) input(b, { sight: cmd.sight });
    if (cmd.attack) { p.attack = cmd.attack; flushInput(true); }
  }
  function flushInput(force = false) {
    const p = guest$.pendingIn;
    if (!Object.keys(p).length || done) return;
    if (!force && now() - guest$.inAt < 1 / INPUT_HZ) return;
    guest$.inAt = now();
    for (const k of ["move", "goTo", "aim"]) if (k in p) guest$.sentIn[k] = p[k];
    guest$.pendingIn = {};
    send({ t: "in", ...p });
  }

  // ---------- what the battle screen calls ----------
  const engine = host
    ? {
      step: (bb, dt) => hostStep(dt),
      answer: (bb, choice) => { const ev = answer(b, choice); hostQuiz(ev); keep(ev); if (host$.urgent) snapshot(); return ev; },
      input: (bb, cmd) => input(b, cmd),
      fire: (bb) => { const ev = fire(b); keep(ev); return ev; },
    }
    : {
      step: (bb, dt) => guestStep(dt),
      answer: (bb, choice) => guestAnswer(choice),
      input: (bb, cmd) => guestInput(cmd),
      fire: () => [],
    };

  return {
    host: !!host, guest: !host, connect, start, engine,
    get battle() { return b; },
    /** The screen's own: banner(kind) shows "waiting for…"; close(why) ends the battle screen ("lost"). */
    attach(h) { hooks = { ...hooks, ...h }; },
    /** Leaving on purpose: a loss (told to the other device and to the server). */
    quit() {
      if (done) return Promise.resolve();
      done = true;
      clearInterval(timer);
      for (let i = 0; i < 3; i++) send({ t: "quit" });
      return report("quit");
    },
    /** The end card is up: the battle's own result goes to the server, and its answer onto the card. */
    finish(won, card) {
      if (done) return Promise.resolve();
      done = true;
      clearInterval(timer);
      if (host) snapshot(); // (the last picture, with the end in it)
      return finish(won ? "won" : "lost", card);
    },
    stop() { done = true; clearInterval(timer); if (connected) connected.fail("stopped"); clearInterval(helloTimer); transport.close(); },
    /** For tests: what is waiting to be read. */
    get pending() { return inbox.length; },
    other: (side) => other(side),
  };
}
