// Safety and privacy for the online features (supabase/v8-safety.sql): finding someone by their
// exact username, blocking, reporting, and deleting the online account.
//
// Free of screen code and of the app shell: every function takes the Supabase client `c` (or a
// stand-in for it, tests/js/online-safety.test.mjs), and social.js passes the real one.
//
// Until v8 has been run on the online database, its functions don't exist there. Then:
//   - finding people falls back to looking in the profiles table, as before;
//   - sending a friend request answers null, so social.js sends it the old way;
//   - block, report and delete throw NotReadyError, whose message says what to do instead.

export const SUPPORT_EMAIL = "tamkeen.app.help@gmail.com";

/** The reasons offered when reporting someone: [id the database stores, words on screen]. */
export const REPORT_REASONS = [
  ["spam", "Spam or a scam"],
  ["harassment", "Bullying or harassment"],
  ["hate", "Hate or violence"],
  ["sexual", "Sexual content"],
  ["underage", "They seem to be under 16"],
  ["danger", "Someone may be in danger"],
  ["other", "Something else"],
];

/** What a report says once it has been sent. */
export const REPORT_THANKS = "Thanks, we'll look at it within 7 days.";

/** Thrown when the online service hasn't been updated for this yet; its message is safe to show. */
export class NotReadyError extends Error {
  constructor(message) {
    super(message);
    this.notReady = true;
  }
}

const NOT_READY = {
  block: "Blocking isn't available yet: Tamkeen's online service needs an update first.",
  report: `Reporting from the app isn't available yet. Email ${SUPPORT_EMAIL} with their username and what happened.`,
  delete: `Deleting your account from the app isn't available yet. Email ${SUPPORT_EMAIL} from your Google account's address and we'll delete it within 7 days.`,
};

/** True when Supabase says the function or table asked for doesn't exist (an older database). */
export function missing(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(code)) return true;
  return error.status === 404 && /function|relation|table|schema cache/i.test(String(error.message || ""));
}

/** Words for the database's own refusals (daily limits and the like); "" for anything else. */
export function serverText(error) {
  const msg = String((error && error.message) || "");
  if (msg === "daily_limit") {
    const most = Number(error.hint) || 0;
    switch (error.details) {
      case "friend_request": return `You can send up to ${most} friend requests a day. Try again tomorrow.`;
      case "message": return "You've sent a lot of messages today. Try again tomorrow.";
      case "report": return `You can send up to ${most} reports a day. For something urgent, email ${SUPPORT_EMAIL}.`;
      case "block": return "You've blocked a lot of people today. Try again tomorrow.";
      default: return "That's the most for one day. Try again tomorrow.";
    }
  }
  if (msg === "guild_limit") return "You can found up to 5 guilds.";
  if (msg === "bad_report") return "That report couldn't be sent.";
  return "";
}

/** A message to show for any error from the online service. */
export function explain(error) {
  const special = serverText(error);
  if (special) return special;
  const msg = (error && (error.message || error.error_description)) || String(error);
  if (/fetch|network|Failed to/i.test(msg)) return "Couldn't reach the online service. Check your internet connection.";
  return msg;
}

const cleanName = (username) => String(username || "").trim().replace(/^@/, "");

/** {id, username, avatar_path} of the person with exactly this username (capitals don't
 * matter), or null. Never anyone's email. */
export async function findUser(c, username) {
  const name = cleanName(username);
  if (!name) return null;
  const { data, error } = await c.rpc("find_user", { name });
  if (!error) return (Array.isArray(data) ? data[0] : data) || null;
  if (!missing(error)) throw new Error(explain(error));
  // An online database older than v8: the profiles table could still be read by everyone.
  const old = await c.from("profiles").select("id, username, avatar_path").eq("username", name).limit(1);
  if (old.error) throw new Error(explain(old.error));
  return old.data[0] || null;
}

/** Ask the database to send a friend request by username in one step: {status, username}
 * (status: sent, accepted, already_friends, already_sent, not_found, self, blocked or
 * no_username). null when the database is older than v8 (send it the old way then). */
export async function sendFriendRequest(c, username) {
  const name = cleanName(username);
  const { data, error } = await c.rpc("send_friend_request", { name });
  if (error) {
    if (missing(error)) return null;
    throw new Error(explain(error));
  }
  return data && typeof data === "object" ? data : { status: String(data || "not_found"), username: null };
}

/** What sendFriendRequest's answer means: {accepted, username} (accepted: they had asked you
 * already, so now you're friends), or an Error whose message is shown. `typed`: the name as typed. */
export function requestOutcome(sent, typed) {
  const who = (sent && sent.username) || cleanName(typed);
  switch (sent && sent.status) {
    case "sent": return { accepted: false, username: who };
    case "accepted": return { accepted: true, username: who };
    case "already_friends": throw new Error(`You and ${who} are already friends.`);
    case "already_sent": throw new Error(`You already sent ${who} a request.`);
    case "self": throw new Error("That's you!");
    case "blocked": throw new Error(`You blocked ${who}. To add them, unblock them in Settings → Account & sync → Friends & sharing.`);
    case "no_username": throw new Error("Choose your own username first (Settings → Friends & sharing).");
    default: throw new Error(`Nobody is called “${cleanName(typed)}”. Usernames are exact (but not case-sensitive).`);
  }
}

async function call(c, fn, args, what) {
  const { data, error } = await c.rpc(fn, args);
  if (error) {
    if (missing(error)) throw new NotReadyError(NOT_READY[what]);
    throw new Error(explain(error));
  }
  return data;
}

/** Block someone: they can't message you, ask to be friends, see your card or online status, or
 * challenge you; you stop being friends. */
export function block(c, personId) {
  return call(c, "block_user", { person: personId }, "block");
}

export function unblock(c, personId) {
  return call(c, "unblock_user", { person: personId }, "block");
}

/** The people I blocked: [{user_id, username, avatar_path, blocked_at}], newest first; null when
 * the database is older than v8 (there is no list to show yet). */
export async function blockedPeople(c) {
  const { data, error } = await c.rpc("my_blocks");
  if (error) {
    if (missing(error)) return null;
    throw new Error(explain(error));
  }
  return data || [];
}

/** Report a person, or (with messageId) a message they sent me. The database keeps its own copy
 * of the message, so the report still shows it after the message disappears. Resolves to the
 * report's id. */
export function report(c, { personId, reason, note = "", messageId = null }) {
  if (!REPORT_REASONS.some(([id]) => id === reason)) throw new Error("Choose what is wrong first.");
  return call(c, "report_user", { person: personId, why: reason, note: String(note || "").slice(0, 1000), about_message: messageId }, "report");
}

const folderOf = (a, b) => [a, b].sort().join("_");

/** Every file of mine in online storage: my profile photos, and everything in my conversations'
 * folders. Asks the database (my_files), and also lists the folders it can work out itself
 * (in case the database can't see the files). `partnerIds`: everyone I may have chatted with. */
export async function accountFiles(c, userId, partnerIds = []) {
  const found = new Map();
  const add = (bucket, name) => { if (name) found.set(`${bucket}/${name}`, { bucket, name }); };
  const { data, error } = await c.rpc("my_files");
  if (error) {
    if (missing(error)) throw new NotReadyError(NOT_READY.delete);
    throw new Error(explain(error));
  }
  for (const f of data || []) if (f && (f.bucket === "avatars" || f.bucket === "voice")) add(f.bucket, f.name);
  const listed = async (bucket, folder) => {
    try {
      const r = await c.storage.from(bucket).list(folder, { limit: 1000 });
      for (const f of (r && r.data) || []) if (f && f.id && f.name) add(bucket, `${folder}/${f.name}`);
    } catch { /* a folder that can't be listed: the database's list still counts */ }
  };
  await listed("avatars", userId);
  for (const other of new Set(partnerIds)) if (other && other !== userId) await listed("voice", folderOf(userId, other));
  return [...found.values()];
}

/** Delete my online account and everything stored with it, then forget the sign-in on this
 * device. Files go first, through the storage (the database can't delete files itself), then the
 * account. Resolves to the database's summary, with how many files were removed. Throws
 * NotReadyError, before deleting anything, when the database is older than v8. */
export async function deleteAccount(c, { userId, partnerIds = [] }) {
  const files = await accountFiles(c, userId, partnerIds);
  let removed = 0;
  for (const bucket of ["avatars", "voice"]) {
    const names = files.filter((f) => f.bucket === bucket).map((f) => f.name);
    for (let i = 0; i < names.length; i += 100) {
      const batch = names.slice(i, i + 100);
      try {
        const r = await c.storage.from(bucket).remove(batch);
        if (!(r && r.error)) removed += batch.length;
      } catch { /* the database notes what is left, and the nightly clean-up takes it */ }
    }
  }
  const summary = await call(c, "delete_my_account", {}, "delete");
  try { await c.auth.signOut({ scope: "local" }); } catch { /* the account is gone either way */ }
  return { ...(summary || {}), files_removed: removed };
}
