// The user's own AI keys (word definitions and cloud transcription), shared between their devices:
// a key saved on the phone appears on the computer and the other way round. They travel in the
// sync's library file in the user's Google Drive, in its hidden app folder (only Tamkeen can read it).
//
// Each key carries when it was last changed; for each key, the copy changed last wins, so removing a
// key on one device removes it on the others too. The computer's copy of this is app/aikeys.py: the
// two must agree exactly, or two devices would keep rewriting each other's keys.

export const KEYS = ["llm_key_claude", "llm_key_gemini", "llm_key_openai", "llm_key_grok", "stt_key_groq", "stt_key_openai"];
export const TIMES = "key_times"; // setting: {key name: when it last changed, here or on another device (whole seconds)}
const MAX_LENGTH = 500;

function record(value, at) {
  const n = Math.trunc(Number(at) || 0);
  return { value: String(value ?? "").trim().slice(0, MAX_LENGTH), at: n > 0 ? n : 0 };
}

/** Keys as {name: {value, at}}, only the known names, leaving out ones never set anywhere. */
export function cleanKeys(raw) {
  const out = {};
  for (const name of KEYS) {
    const r = raw && typeof raw === "object" ? raw[name] : null;
    if (r && typeof r === "object") {
      const rec = record(r.value, r.at);
      if (rec.value || rec.at) out[name] = rec;
    }
  }
  return out;
}

const timesOf = (settings) => (settings[TIMES] && typeof settings[TIMES] === "object" ? settings[TIMES] : {});

/** This device's keys, as the sync file carries them. */
export function keysFromSettings(settings) {
  const times = timesOf(settings);
  return cleanKeys(Object.fromEntries(KEYS.map((n) => [n, { value: settings[n], at: times[n] }])));
}

/** Does the other device's copy replace this one? The one changed last; at the same moment, the
 *  later-sorting value (so a key beats no key and both devices settle on the same one). */
export function keyWins(theirs, mine) {
  const m = mine || { value: "", at: 0 };
  if (theirs.at !== m.at) return theirs.at > m.at;
  return theirs.value > m.value;
}

/** The settings to change so this device has the keys that win ({} if none do). */
export function takeKeys(settings, theirs) {
  const mine = keysFromSettings(settings);
  const times = { ...timesOf(settings) };
  const changes = {};
  for (const [name, rec] of Object.entries(cleanKeys(theirs))) {
    if (keyWins(rec, mine[name])) {
      changes[name] = rec.value;
      times[name] = rec.at;
    }
  }
  if (Object.keys(changes).length) changes[TIMES] = times;
  return changes;
}

/** `values` about to be saved: if any key really changes, note when (`now` in ms), so it wins elsewhere. */
export function stampKeys(settings, values, now = Date.now()) {
  const changed = KEYS.filter((n) => n in values && String(values[n] ?? "").trim() !== String(settings[n] ?? "").trim());
  if (!changed.length) return values;
  const times = { ...timesOf(settings) };
  for (const n of changed) times[n] = Math.floor(now / 1000);
  return { ...values, [TIMES]: times };
}
