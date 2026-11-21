// The creator's view, the pure part: what the online service allows, how the figures from the database
// (supabase/v14-creator.sql creator_stats) are checked, and how each "used / limit" line is worked out.
// The screen is components/creatorbar.js. No page here: tests/js/creatorstats.test.mjs runs it without a browser.
//
// The limits are Supabase's published ones (supabase.com/pricing, read 2026-11-20). They are a copy: when
// Supabase changes its plans, change LIMITS and LIMITS_READ here.

const MB = 1024 * 1024, GB = 1024 * MB;

export const LIMITS_READ = "2026-11-20";
/** What each plan includes. Bytes for sizes, plain counts for the rest. */
export const LIMITS = {
  free: { db: 500 * MB, storage: 1 * GB, mau: 50000, egress: 5 * GB, connections: 200, messages: 2000000, functions: 500000 },
  pro: { db: 8 * GB, storage: 100 * GB, mau: 100000, egress: 250 * GB, connections: 500, messages: 5000000, functions: 2000000 },
};
export const PLANS = [["free", "Free plan"], ["pro", "Pro plan"]];
export const planOf = (v) => (v === "pro" ? "pro" : "free");

/** From this share of a limit on, a line turns amber, then red. */
export const WARN_AT = 0.7, FULL_AT = 0.9;
/** "ok", "warn" or "full" for a figure against its limit. */
export function level(used, limit) {
  if (!(limit > 0) || !(used >= 0)) return "ok";
  const share = used / limit;
  return share >= FULL_AT ? "full" : share >= WARN_AT ? "warn" : "ok";
}
/** The share used, 0 to 1 (a bar is never longer than its track). */
export const share = (used, limit) => (limit > 0 && used > 0 ? Math.min(1, used / limit) : 0);
/** "3%", "0.4%", "under 0.1%": small shares are the usual case, so they keep a decimal. */
export function percentText(used, limit) {
  if (!(limit > 0)) return "";
  const p = (100 * Math.max(0, used)) / limit;
  if (p === 0) return "0%";
  if (p < 0.1) return "under 0.1%";
  return `${p < 10 ? Math.round(p * 10) / 10 : Math.round(p)}%`;
}

/** "12 MB", "1.4 GB", "730 KB". */
export function bytesText(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v >= GB) return `${(v / GB).toFixed(v >= 10 * GB ? 0 : 1)} GB`;
  if (v >= MB) return `${(v / MB).toFixed(v >= 10 * MB ? 0 : 1)} MB`;
  return `${Math.max(0, Math.round(v / 1024))} KB`;
}
/** A figure as it is shown: a size or a count. */
export const amountText = (n, unit) => (unit === "bytes" ? bytesText(n) : Math.round(Math.max(0, Number(n) || 0)).toLocaleString("en-US"));

const whole = (v, most = Number.MAX_SAFE_INTEGER) => (Number.isFinite(Number(v)) ? Math.min(most, Math.max(0, Math.round(Number(v)))) : 0);
const word = (v) => String(v ?? "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60);

/** What creator_stats answered, made safe to show: whole numbers in range and plain names, nothing else. */
export function cleanStats(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const buckets = (Array.isArray(r.buckets) ? r.buckets : []).map((b) => ({ bucket: word(b && b.bucket), bytes: whole(b && b.bytes), files: whole(b && b.files) }))
    .filter((b) => b.bucket).slice(0, 20);
  const tables = (Array.isArray(r.tables) ? r.tables : []).map((x) => ({ name: word(x && x.name), bytes: whole(x && x.bytes), rows: whole(x && x.rows) }))
    .filter((x) => x.name).slice(0, 8);
  return { at: typeof r.at === "string" && Number.isFinite(Date.parse(r.at)) ? r.at : "", online: whole(r.online, 10000000), seen_today: whole(r.seen_today, 10000000),
    users: whole(r.users, 100000000), active_30d: whole(r.active_30d, 100000000), db_bytes: whole(r.db_bytes),
    storage_bytes: buckets.reduce((sum, b) => sum + b.bytes, 0), buckets, tables };
}

/** The lines the app can fill in: [{ id, label, used, limit, unit, note }]. `note` says what a figure is when it is
 *  an estimate. The order is the order on screen. */
export function meters(stats, plan = "free") {
  const l = LIMITS[planOf(plan)];
  return [
    { id: "connections", label: "People online now", used: stats.online, limit: l.connections, unit: "count",
      note: "Each person online holds one live connection. The limit is the most at the same moment." },
    { id: "mau", label: "Active users, last 30 days", used: stats.active_30d, limit: l.mau, unit: "count",
      note: "People who signed in or opened the app in the last 30 days. Supabase counts by billing month, so its figure can differ a little." },
    { id: "db", label: "Database size", used: stats.db_bytes, limit: l.db, unit: "bytes", note: "" },
    { id: "storage", label: "File storage", used: stats.storage_bytes, limit: l.storage, unit: "bytes",
      note: "Voice notes, profile photos and lesson files." },
  ];
}

/** The limits only Supabase's own Usage page can fill in: [{ id, label, limit, unit }]. */
export function unseen(plan = "free") {
  const l = LIMITS[planOf(plan)];
  return [
    { id: "egress", label: "Data sent out, a month", limit: l.egress, unit: "bytes" },
    { id: "messages", label: "Live messages, a month", limit: l.messages, unit: "count" },
    { id: "functions", label: "Function calls, a month", limit: l.functions, unit: "count" },
  ];
}

/** The line nearest its limit (what the bar on Home shows beside the people online). */
export function tightest(stats, plan = "free") {
  return meters(stats, plan).reduce((best, m) => (!best || share(m.used, m.limit) > share(best.used, best.limit) ? m : best), null);
}

/** Tamkeen's other services: what each allows free, as published when LIMITS_READ was written, and where its real
 *  usage is shown. The app cannot read any of these: each needs a sign-in only the creator has. */
export const OTHER_SERVICES = [
  { id: "pages", name: "GitHub Pages (the web app and the downloads)", limit: "1 GB site size, 100 GB of traffic a month (a soft limit)", link: "https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits" },
  { id: "worker", name: "Cloudflare Worker (the web app's go-between)", limit: "100,000 requests a day", link: "https://developers.cloudflare.com/workers/platform/limits/" },
  { id: "drive", name: "Google Drive (sync)", limit: "1,000,000 quota units a minute for the whole app (a read costs 5, a download 200); each learner's files use their own Drive space", link: "https://developers.google.com/drive/api/guides/limits" },
  { id: "azure", name: "Azure Speech (DLI deck audio)", limit: "500,000 characters of speech a month", link: "https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/" },
  { id: "keys", name: "Groq, Gemini and other AI keys", limit: "Each learner uses their own key, so these are their limits, not yours", link: "" },
];

export const USAGE_LINK = "https://supabase.com/dashboard/org/_/usage";
