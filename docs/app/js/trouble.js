// "Troubleshoot": when an AI or transcription key fails, the likely reasons and what to do about
// each, picked from what actually went wrong. The words and the sorting are here (no screen code,
// tested in tests/js/trouble.test.mjs); components/troubleshoot.js shows them in a box.
//
// A failure is sorted into one kind:
//   key      the provider refused the key (401/403)
//   credit   no credit, billing or spending limit (402, "quota", "billing")
//   rate     too many requests for now (429)
//   network  no answer at all: no internet, a VPN, proxy or firewall in the way, the provider unreachable
//   region   the provider doesn't serve the country the request comes from
//   model    the chosen model isn't available to this key (404)
//   server   the provider itself is having problems (5xx)
//   other    none of those could be told apart

/** Each provider's status page (word definitions and transcription providers alike). */
export const STATUS_PAGES = {
  claude: "https://status.claude.com",
  gemini: "https://aistudio.google.com/status",
  openai: "https://status.openai.com",
  grok: "https://status.x.ai",
  groq: "https://groqstatus.com",
};

const REGION = /unsupported[_ ]country|country, region,? or territory|location is not supported|not (available|supported) in your (country|region|location)|region (is )?not supported/i;
const CREDIT = /billing|quota|credit|insufficient[_ ]funds|payment|spend(ing)? limit/i;
const MODEL = /model/i;

/** The kind of a failed request, from its HTTP status (0 = no answer at all) and the provider's answer. */
export function problemKind(status, text = "") {
  const body = String(text || "").slice(0, 2000);
  if (REGION.test(body)) return "region";
  if (!status) return "network";
  if (status === 401 || status === 403) return "key";
  if (status === 400 && /api[ _-]?key/i.test(body)) return "key"; // Gemini: "API key not valid", "API key expired"
  if (status === 402) return "credit";
  if (status === 429) return CREDIT.test(body) ? "credit" : "rate";
  if (status === 404 || (status === 400 && MODEL.test(body) && !CREDIT.test(body))) return "model";
  if (status >= 500) return "server";
  if (CREDIT.test(body)) return "credit";
  return "other";
}

// The app's own messages, for failures that arrive only as text (a transcription the computer
// tried, kept with the episode). Returns "" when the text isn't about a provider at all.
const MESSAGES = [
  ["region", REGION],
  ["key", /rejected the API key|key (is )?(not valid|invalid|expired)/i],
  ["credit", /no credit|billing|quota|credit balance|spending limit/i],
  ["rate", /reached its limit|rate limit|slow down|too many requests/i],
  ["network", /couldn't reach|internet connection|network error|timed out|didn't answer|connection (was )?(reset|refused|closed)/i],
  ["model", /doesn'?t recogni[sz]e (the chosen |that )?model/i],
  ["server", /having (problems|trouble)|\b(HTTP|error) 5\d\d\b|overloaded/i],
];
export function kindFromMessage(message) {
  const text = String(message || "");
  for (const [kind, re] of MESSAGES) if (re.test(text)) return kind;
  return "";
}

/** Whatever was thrown, as a kind ("" for something that isn't a provider problem, like no key yet). */
export function kindOf(error) {
  if (!error) return "";
  if (error.kind) return error.kind;
  if (error.keyRejected) return "key";
  if (error.message === "NO_KEY") return "";
  return kindFromMessage(error.message);
}

// Every cause: what it is, and the one thing to do about it. (Written as {title, fix} so the
// translation extractor, tools/i18n/extract.mjs, finds both: it skips a string just after "[".)
const CAUSE = {
  expired: { title: "The key has expired or been switched off", fix: "Make a new key on the provider's key page and paste it in." },
  copied: { title: "Part of the key is missing, or a space came with it", fix: "Copy the whole key again and paste it fresh." },
  wrongProvider: { title: "The key is from a different provider", fix: "Choose the provider whose website gave you the key." },
  deleted: { title: "The key was deleted, or the account was closed", fix: "Check the key is still listed on the key page. If not, make a new one." },
  noCredit: { title: "No credit or billing is set up", fix: "Add a payment card and a little credit on the provider's Billing page." },
  limit: { title: "A spending limit was reached", fix: "Raise the monthly limit in the provider's billing settings, or wait for next month." },
  freeUsed: { title: "The free allowance is used up for now", fix: "Wait until tomorrow, or add billing to lift the limit." },
  tooMany: { title: "Too many requests in a short time", fix: "Wait a minute, then try again." },
  freeLimit: { title: "Free accounts may only send so much per hour and per day", fix: "Wait a while, or add billing to raise the limit." },
  offline: { title: "This device isn't online", fix: "Open any website to check, then try again." },
  vpn: { title: "A VPN or proxy is in the way", fix: "Turn the VPN or proxy off and try again." },
  firewall: { title: "A firewall, or a work or school network, blocks it", fix: "Try another network, such as your phone's mobile data." },
  down: { title: "The provider is down", fix: "Check its status page, then try again later." },
  clock: { title: "The date and time on this device are wrong", fix: "Set the clock to update automatically: secure connections fail when it is off." },
  country: { title: "The provider doesn't serve your country or region", fix: "Choose another provider in Settings." },
  vpnCountry: { title: "A VPN makes it look as if you are somewhere else", fix: "Turn the VPN off, or set it to your own country." },
  noModel: { title: "That model isn't available to your key", fix: "Set Model back to the recommended one in Settings." },
  renamed: { title: "The model was renamed or retired", fix: "Choose a model from the list instead of typing a name." },
  newAccount: { title: "New or free accounts can't use every model", fix: "Use the recommended model, or add billing to the account." },
  busy: { title: "The provider is having problems or is very busy", fix: "Check its status page and try again in a few minutes." },
};

const LIKELY = {
  key: ["expired", "copied", "wrongProvider", "deleted"],
  credit: ["noCredit", "limit", "freeUsed"],
  rate: ["tooMany", "freeLimit", "noCredit"],
  network: ["offline", "vpn", "firewall", "down", "clock"],
  region: ["country", "vpnCountry"],
  model: ["noModel", "renamed", "newAccount"],
  server: ["busy", "tooMany"],
  other: ["expired", "noCredit", "offline", "vpn", "down"],
};
// What else commonly goes wrong, shown folded away under the likely ones.
const COMMON = ["expired", "copied", "noCredit", "offline", "vpn", "firewall", "down", "country"];

// (Pairs, not an object: the extractor takes a string after "key:" for code.)
const HEADINGS = new Map([
  ["key", "The provider refused the key"],
  ["credit", "The account has no credit or reached a limit"],
  ["rate", "The provider asked the app to slow down"],
  ["network", "The provider couldn't be reached"],
  ["region", "The provider isn't available where you are"],
  ["model", "The provider doesn't recognise the model"],
  ["server", "The provider is having problems"],
  ["other", "Something went wrong with the provider"],
]);

const STT_WRONG_PROVIDER = {
  title: "The key is for word definitions, not transcription",
  fix: "Transcription needs its own key: a Groq key starts with gsk_. An OpenAI key works for both.",
};

const cause = (id, stt) => ({ id, ...(stt && id === "wrongProvider" ? STT_WRONG_PROVIDER : CAUSE[id]) });

/** What the box shows for one kind: {heading, likely: [{id, title, fix}], other: [...]} ("other" = the
 * common causes not already listed). `stt` = a transcription key (its own wording for the wrong provider). */
export function troubleshooting(kind, { stt = false } = {}) {
  const k = LIKELY[kind] ? kind : "other";
  const shown = new Set(LIKELY[k]);
  return {
    heading: HEADINGS.get(k),
    likely: LIKELY[k].map((id) => cause(id, stt)),
    other: COMMON.filter((id) => !shown.has(id)).map((id) => cause(id, stt)),
  };
}
