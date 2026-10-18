// tamkeen://watch?v=<id>[&t=<seconds>][&from=<app>] links: another app on the device asking Tamkeen
// to play a YouTube video (Onyx Calendar's News). The phone reads them here (mobile/src/js/app.js);
// the computer's copy is `parse` in app/applink.py, and the two must agree (tests/fixtures/applink_cases.json).

const MAX_START = 1_000_000; // seconds

/** {videoId, at, source} for a valid tamkeen://watch link, else null. `at`: the second to start at
 * (null when not given); `source`: its `from` part ("" when not given). Anything else is ignored. */
export function parseTamkeenLink(url) {
  let u;
  try { u = new URL(String(url || "").trim()); } catch { return null; }
  if (u.protocol.toLowerCase() !== "tamkeen:" || u.hostname.toLowerCase() !== "watch" || !["", "/"].includes(u.pathname)) return null;
  const videoId = u.searchParams.get("v") || "";
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const t = (u.searchParams.get("t") || "").trim();
  const at = /^[0-9]+(\.[0-9]+)?$/.test(t) && Number(t) < MAX_START ? Number(t) : null; // else: from the beginning
  const source = (u.searchParams.get("from") || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
  return { videoId, at, source };
}
