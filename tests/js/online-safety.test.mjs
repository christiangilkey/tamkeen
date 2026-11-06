// Safety and privacy for the online features: web/js/safety.js against a stand-in for the Supabase
// client (nothing goes online), and checks that the database migration (supabase/v8-safety.sql),
// its self-test, the screens and the build all agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as safety from "../../web/js/safety.js";
import { TYPE_IDS, VARIANTS } from "../../web/js/game/data.js";

const root = new URL("../../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const SQL = read("supabase/v8-safety.sql");
const SELF_TEST = read("supabase/test_rls_safety.sql");

const MISSING = { code: "PGRST202", message: "Could not find the function public.x in the schema cache" };

/** A stand-in for the Supabase client: `rpc` answers by function name (an object, or a function
 * of the arguments; a name not given answers "no such function", like a database before v8),
 * `tables` answers table reads, `files` lists storage folders. Every call is recorded in `calls`. */
function fakeClient({ rpc = {}, tables = {}, files = {}, removeFails = false } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      if (!(name in rpc)) return { data: null, error: MISSING };
      const r = rpc[name];
      return typeof r === "function" ? r(args) : r;
    },
    from(table) {
      const filters = [];
      const q = {
        select: () => q, limit: () => q,
        eq: (k, v) => { filters.push([k, v]); return q; },
        then: (ok, bad) => {
          calls.push(["from", table, filters]);
          return Promise.resolve(tables[table] ? tables[table](filters) : { data: [], error: null }).then(ok, bad);
        },
      };
      return q;
    },
    storage: {
      from: (bucket) => ({
        list: async (folder) => { calls.push(["list", bucket, folder]); return { data: files[`${bucket}/${folder}`] || [], error: null }; },
        remove: async (names) => { calls.push(["remove", bucket, names]); return removeFails ? { data: null, error: { message: "nope" } } : { data: names, error: null }; },
      }),
    },
    auth: { signOut: async (opts) => { calls.push(["signOut", opts]); return {}; } },
  };
}

const ME = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const ZED = "00000000-0000-4000-8000-000000000000";

// ---------------------------------------------------------------- finding people

test("people are found by exact username through the database, never by listing profiles", async () => {
  const c = fakeClient({ rpc: { find_user: ({ name }) => ({ data: name === "Layla_Learns" ? [{ id: BOB, username: "layla_learns", avatar_path: null }] : [], error: null }) } });
  assert.deepEqual(await safety.findUser(c, "  @Layla_Learns "), { id: BOB, username: "layla_learns", avatar_path: null });
  assert.equal(await safety.findUser(c, "nobody"), null);
  assert.equal(await safety.findUser(c, "   "), null, "a blank name asks nothing");
  assert.ok(c.calls.every(([kind]) => kind === "rpc"), "the profiles table isn't read");
});

test("against a database older than v8 the old lookup still works", async () => {
  const c = fakeClient({ tables: { profiles: (f) => ({ data: f.some(([k, v]) => k === "username" && v === "omar") ? [{ id: BOB, username: "omar", avatar_path: null }] : [], error: null }) } });
  assert.equal((await safety.findUser(c, "omar")).id, BOB);
  assert.deepEqual(c.calls.map(([kind, what]) => `${kind}:${what}`), ["rpc:find_user", "from:profiles"]);
});

test("a friend request is one call, and every answer has its own words", async () => {
  const c = fakeClient({ rpc: { send_friend_request: ({ name }) => ({ data: { status: "sent", username: name.toLowerCase() }, error: null }) } });
  const sent = await safety.sendFriendRequest(c, "@Omar");
  assert.deepEqual(sent, { status: "sent", username: "omar" });
  assert.deepEqual(safety.requestOutcome(sent, "Omar"), { accepted: false, username: "omar" });
  assert.deepEqual(safety.requestOutcome({ status: "accepted", username: "omar" }, "OMAR"), { accepted: true, username: "omar" });
  const says = (status) => { try { safety.requestOutcome({ status, username: "omar" }, "omar"); return ""; } catch (e) { return e.message; } };
  assert.match(says("already_friends"), /already friends/);
  assert.match(says("already_sent"), /already sent omar a request/);
  assert.equal(says("self"), "That's you!");
  assert.match(says("blocked"), /You blocked omar\..*Settings → Account & sync → Friends & sharing/);
  assert.match(says("no_username"), /Choose your own username first/);
  assert.match(says("not_found"), /Nobody is called “omar”/);
  assert.equal(await safety.sendFriendRequest(fakeClient(), "omar"), null, "older database: null, so the old way is used");
});

test("the database's daily limits are explained in plain words", async () => {
  const limit = (details, hint) => ({ code: "P0001", message: "daily_limit", details, hint });
  assert.equal(safety.explain(limit("friend_request", "20")), "You can send up to 20 friend requests a day. Try again tomorrow.");
  assert.match(safety.explain(limit("message", "500")), /a lot of messages today/);
  assert.match(safety.explain(limit("report", "20")), /up to 20 reports a day/);
  assert.match(safety.explain(limit("shared_word", "2000")), /most for one day/);
  assert.equal(safety.explain({ code: "P0001", message: "guild_limit" }), "You can found up to 5 guilds.");
  assert.match(safety.explain({ message: "Failed to fetch" }), /Couldn't reach the online service/);
  assert.equal(safety.serverText({ message: "something else" }), "");
  const c = fakeClient({ rpc: { send_friend_request: { data: null, error: limit("friend_request", "20") } } });
  await assert.rejects(safety.sendFriendRequest(c, "omar"), /up to 20 friend requests a day/);
});

// ---------------------------------------------------------------- blocking and reporting

test("block, unblock and the blocked list call the database with the right names", async () => {
  const c = fakeClient({ rpc: { block_user: { data: null, error: null }, unblock_user: { data: null, error: null },
    my_blocks: { data: [{ user_id: BOB, username: "bob", avatar_path: null, blocked_at: "2026-11-06T10:00:00Z" }], error: null } } });
  await safety.block(c, BOB);
  await safety.unblock(c, BOB);
  assert.equal((await safety.blockedPeople(c))[0].username, "bob");
  assert.deepEqual(c.calls.map(([, name, args]) => [name, args]), [["block_user", { person: BOB }], ["unblock_user", { person: BOB }], ["my_blocks", undefined]]);
});

test("before v8 is run, blocking and reporting say so (and how to report by email)", async () => {
  const c = fakeClient();
  await assert.rejects(safety.block(c, BOB), (e) => e.notReady && /isn't available yet/.test(e.message));
  await assert.rejects(safety.report(c, { personId: BOB, reason: "spam" }), (e) => e.notReady && e.message.includes(safety.SUPPORT_EMAIL));
  assert.equal(await safety.blockedPeople(c), null, "no list to show yet");
});

test("a report needs one of the reasons, and sends the message's id for the database to copy", async () => {
  let got = null;
  const c = fakeClient({ rpc: { report_user: (args) => { got = args; return { data: "report-id", error: null }; } } });
  assert.throws(() => safety.report(c, { personId: BOB, reason: "rude" }), /Choose what is wrong/);
  assert.equal(await safety.report(c, { personId: BOB, reason: "harassment", note: "x".repeat(1500), messageId: "m1" }), "report-id");
  assert.deepEqual(Object.keys(got), ["person", "why", "note", "about_message"]);
  assert.equal(got.note.length, 1000);
  assert.equal(got.about_message, "m1");
  assert.equal(safety.REPORT_THANKS, "Thanks, we'll look at it within 7 days.");
});

// ---------------------------------------------------------------- deleting the account

test("deleting the account removes the files first, then the account, then forgets the sign-in", async () => {
  const folder = [ME, BOB].sort().join("_");
  const c = fakeClient({
    rpc: {
      my_files: { data: [{ bucket: "avatars", name: `${ME}/1.webp` }, { bucket: "voice", name: `${folder}/a.webm` }, { bucket: "secret", name: "x" }], error: null },
      delete_my_account: { data: { found: true, guilds_passed_on: 1, sign_in_removed: true }, error: null },
    },
    files: {
      [`avatars/${ME}`]: [{ id: "f1", name: "1.webp" }, { id: "f2", name: "2.webp" }],
      [`voice/${folder}`]: [{ id: "f3", name: "a.webm" }, { id: null, name: "a-folder" }],
    },
  });
  const out = await safety.deleteAccount(c, { userId: ME, partnerIds: [BOB, BOB, ME] });
  const order = c.calls.map(([kind, what]) => `${kind}:${what}`);
  assert.equal(order[0], "rpc:my_files", "asks which files before deleting anything");
  assert.ok(order.indexOf("rpc:delete_my_account") > order.lastIndexOf("remove:voice"), "files go before the account");
  assert.equal(order.at(-1), "signOut:[object Object]");
  const removed = c.calls.filter(([kind]) => kind === "remove").flatMap(([, bucket, names]) => names.map((n) => `${bucket}/${n}`)).sort();
  assert.deepEqual(removed, [`avatars/${ME}/1.webp`, `avatars/${ME}/2.webp`, `voice/${folder}/a.webm`],
    "every photo and conversation file once; never another bucket, never a folder");
  assert.deepEqual(c.calls.find(([kind]) => kind === "signOut")[1], { scope: "local" });
  assert.equal(out.guilds_passed_on, 1);
  assert.equal(out.files_removed, 3);
});

test("before v8 is run, deleting stops before touching anything and says how to ask by email", async () => {
  const c = fakeClient({ files: { [`avatars/${ME}`]: [{ id: "f1", name: "1.webp" }] } });
  await assert.rejects(safety.deleteAccount(c, { userId: ME }), (e) => e.notReady && /Email tamkeen\.app\.help@gmail\.com/.test(e.message));
  assert.ok(!c.calls.some(([kind]) => kind === "remove" || kind === "signOut"));
});

test("a file the storage won't delete doesn't stop the account being deleted", async () => {
  const c = fakeClient({ removeFails: true, rpc: { my_files: { data: [{ bucket: "avatars", name: `${ME}/1.webp` }], error: null },
    delete_my_account: { data: { found: true, files_left: 1 }, error: null } } });
  const out = await safety.deleteAccount(c, { userId: ME, partnerIds: [ZED] });
  assert.equal(out.files_removed, 0);
  assert.equal(out.files_left, 1);
});

// ---------------------------------------------------------------- the migration agrees with the app

test("the database's creature types and looks are the game's own", () => {
  const types = /function private\.game_types\(\)[\s\S]*?array\[([^\]]*)\]/.exec(SQL);
  assert.ok(types, "private.game_types is defined");
  assert.deepEqual(types[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)), TYPE_IDS,
    "web/js/game/data.js TYPES changed: update private.game_types() in a new migration");
  const variants = /'variant'\), array\[([^\]]*)\]/.exec(SQL) || /\(c->>'variant'\) = any \(array\[([^\]]*)\]/.exec(SQL);
  assert.ok(variants);
  assert.deepEqual(variants[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)), Object.keys(VARIANTS));
});

test("every function the app calls exists in v8, with the argument names the app sends", () => {
  const fns = {
    find_user: ["name"], send_friend_request: ["name"], block_user: ["person"], unblock_user: ["person"], my_blocks: [],
    report_user: ["person", "why", "note", "about_message"], my_files: [], delete_my_account: [],
  };
  for (const [name, args] of Object.entries(fns)) {
    const m = new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)`).exec(SQL);
    assert.ok(m, `${name} is created`);
    assert.deepEqual(m[1].split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean), args, `${name}'s arguments`);
  }
  const reasons = /reason in \(([^)]*)\)/.exec(SQL)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(reasons, safety.REPORT_REASONS.map(([id]) => id), "the app offers exactly the reasons the database accepts");
});

test("no public function of v8 can be run signed out, and every one fixes its search path", () => {
  const made = [...SQL.matchAll(/create or replace function (public|private)\.(\w+)\(([^)]*)\)([\s\S]*?)\$\$/g)];
  assert.ok(made.length > 30);
  for (const [, schema, name, , head] of made) {
    assert.match(head, /set search_path = ''/, `${schema}.${name} fixes its search path`);
    if (schema === "public") {
      assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(SQL), `${name} is revoked from public and anon`);
    }
  }
  assert.match(SQL, /revoke all on all functions in schema private from public, anon;\s*grant execute on function private\.pair_path/);
});

test("the rules use only the private helpers, and the old public ones are dropped", () => {
  const policies = [...SQL.matchAll(/create policy[\s\S]*?;/g)].map((m) => m[0]);
  assert.ok(policies.length >= 20);
  for (const p of policies) assert.doesNotMatch(p, /public\.(are_friends|are_connected|same_guild|in_guild|is_member|in_conversation)\(/);
  for (const f of ["are_connected(uuid, uuid)", "same_guild(uuid, uuid)", "in_guild(uuid, uuid)", "are_friends(uuid, uuid)", "is_member(uuid)", "in_conversation(text)"]) {
    assert.ok(SQL.includes(`drop function if exists public.${f};`), `public.${f} is dropped`);
  }
  // Messages: friends only, and the app's 30-day promise holds without anyone opening the app.
  assert.match(SQL, /"message a friend"[\s\S]*?private\.can_message\(recipient\)/);
  assert.match(SQL, /cron\.schedule\('tamkeen-nightly-cleanup', '17 3 \* \* \*', 'select private\.nightly_cleanup\(\)'\)/);
  assert.match(SQL, /delete from public\.messages m where m\.created_at < now\(\) - interval '30 days'/);
  assert.match(SQL, /delete from public\.battles b where b\.created_at < now\(\) - interval '60 days'/);
  assert.match(SQL, /delete from public\.gifts g where g\.claimed_at < now\(\) - interval '30 days'/);
});

test("the self-test covers every rule and ends by rolling itself back", () => {
  for (const what of ["find_user", "send_friend_request", "block_user", "unblock_user", "my_blocks", "report_user", "my_files",
    "delete_my_account", "private.delete_user", "private.nightly_cleanup", "daily_limit", "guild_limit", "set local role anon",
    "voice-note-pointing-at-another-chat", "avatar_path", "game_profiles set team", "dismiss_message"]) {
    assert.ok(SELF_TEST.includes(what), `the self-test uses ${what}`);
  }
  assert.match(SELF_TEST, /raise exception 'RESULTS ok=% bad=\[%\] notes=\[%\] \(everything was rolled back\)'/);
  // the older self-tests follow v8's rules
  assert.match(read("supabase/test_rls.sql"), /find_user\('ALICE_T'\)/);
  assert.match(read("supabase/test_rls_guilds.sql"), /messaged-a-guildmate-who-isnt-a-friend/);
  assert.match(read("supabase/test_rls_game.sql"), /"type": "ember"/);
});

test("the screens offer block, report and delete, and the phone build carries them", () => {
  const friends = read("web/js/pages/friends.js");
  assert.match(friends, /moreButton\(user/);
  assert.match(friends, /const mActs = messageIfFriend\(m\.id\)/, "guild-mates who aren't friends get no Message button");
  const chat = read("web/js/pages/chat.js");
  assert.match(chat, /onHold\(el,[\s\S]*?Report this message/);
  assert.match(chat, /moreButton\(person/);
  const account = read("web/js/components/account.js");
  assert.match(account, /Delete my online account/);
  assert.match(account, /blockedSection\(\)/);
  const build = read("mobile/scripts/build-www.mjs");
  assert.ok(build.includes('"js/safety.js"') && build.includes('"js/components/safetyui.js"'));
  const social = read("web/js/social.js");
  assert.doesNotMatch(social, /from\("profiles"\)\.select\("id(, username)?"\)\.eq\("username"/, "usernames are looked up with find_user");
  assert.match(social, /cacheControl: "3600"/, "photos are cached for an hour, not a year");
});

test("the Terms and Privacy Policy give the real places for delete, block and report", () => {
  const terms = read("docs/terms.html").replace(/\s+/g, " ");
  const privacy = read("docs/privacy.html").replace(/\s+/g, " ");
  for (const page of [terms, privacy]) {
    assert.match(page, /Settings → Account &amp; sync → Friends &amp; sharing → Delete my online account/);
  }
  assert.match(terms, /hold the message → Report/);
  assert.match(terms, /within 7 days/);
  assert.match(privacy, /block anyone and report/);
});
