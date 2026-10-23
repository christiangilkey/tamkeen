// The nudge between the learner's own open devices (see syncpace.js): after this device has sent
// something to Drive, a tiny "sync" ping on a realtime channel only the learner's devices know, so
// their other open devices sync within a second or two instead of at their next check.
//
// - Only when signed in to Friends (Supabase); otherwise the devices just check Drive every minute.
// - The channel (syncpace.js nudgeChannel) is "sync:<Friends id>:<key>", the key made from the id of
//   the learner's library file in their own Drive: nobody else knows it, so nobody else can listen
//   or send there. It needs nothing set up in Supabase (an ordinary broadcast channel).
// - A nudge carries a random id for this run of the app and nothing else: no words, no titles.
// - A page that is hidden ignores nudges (it checks Drive when it is shown again).

import { currentUser, sb } from "./social.js";
import { NUDGE_DELAY_MS, NUDGE_EVENT, nudgeChannel, nudgeFromOther, nudgePayload, runId } from "./syncpace.js";

const me = runId();
let key = "";
let onNudge = () => {};
let channel = null;
let channelName = "";
let client = null;
let joining = Promise.resolve();
let timer = 0;
let started = false;

/** Start listening (once per run). `sync` runs a sync on this device. */
export function startNudges(sync) {
  onNudge = sync;
  if (started) return;
  started = true;
  sb().then((c) => c.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") setTimeout(rejoin, 0);
  })).catch(() => {});
}

/** The nudge key for this learner's Drive (from the latest sync); joins the channel it names. */
export function setNudgeKey(next) {
  next = String(next || "");
  if (next === key) return;
  key = next;
  rejoin();
}

function rejoin() {
  joining = joining.then(join, join);
  return joining;
}

async function join() {
  if (!started) return;
  const user = key ? await currentUser() : null;
  const name = user ? nudgeChannel(user.id, key) : "";
  if (name === channelName) return;
  if (channel && client) { try { await client.removeChannel(channel); } catch { /* already gone */ } }
  channel = null;
  channelName = name;
  if (!name) return;
  try {
    client = await sb();
    channel = client.channel(name, { config: { broadcast: { self: false, ack: false } } })
      .on("broadcast", { event: NUDGE_EVENT }, ({ payload }) => heard(payload))
      .subscribe();
  } catch (e) {
    console.warn("Sync nudges unavailable", e);
    channel = null;
    channelName = "";
  }
}

function heard(payload) {
  if (!nudgeFromOther(payload, me)) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // checked on return
  clearTimeout(timer);
  timer = setTimeout(() => { try { onNudge(); } catch (e) { console.warn(e); } }, NUDGE_DELAY_MS);
}

/** Tell the learner's other open devices that something new is in Drive. Never throws. */
export async function sendNudge() {
  try {
    await joining;
    if (!channel) return false;
    await channel.send({ type: "broadcast", event: NUDGE_EVENT, payload: nudgePayload(me) });
    return true;
  } catch (e) {
    console.warn("Couldn't nudge the other devices", e);
    return false;
  }
}
