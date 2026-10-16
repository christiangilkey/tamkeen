// Followed YouTube channels: the list itself and the rules for changing and merging it.
// Pure (no page, no imports from the app), so it is unit-tested (tests/js/ytfollow.test.mjs)
// and the phone's sync uses the very same merge. app/youtube.py holds the computer's copy of
// `cleanFollows` and `mergeFollows` (clean_follows, merge_follows); keep the two alike.
//
// One record per channel, kept even after unfollowing so the "unfollow" reaches the other devices:
//   name        the channel's name as YouTube shows it (a video's "description" in the library
//               is its channel's name, which is how videos are matched to channels)
//   id          YouTube's channel id ("UC..."), or "" until it has been looked up
//   image       the channel's picture, or ""
//   on          1 followed, 0 unfollowed
//   watched_at  when one of its videos was last opened (whole seconds)
//   updated_at  when this record last changed (whole seconds); the newer copy wins between devices
//   lang        the language being learned when it was followed: it is listed only under that
//               language ("" for channels followed before languages were kept apart: listed under all)

const text = (x, max) => String(x == null ? "" : x).replace(/\s+/g, " ").trim().slice(0, max);
const whole = (x) => Math.max(0, Math.floor(Number(x) || 0));
// Plain character-code order (not alphabetical): every device must sort the list identically,
// or each would keep "correcting" the other's copy.
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** A list as stored or received → tidy records, one per name, in a fixed order. */
export function cleanFollows(raw) {
  const seen = new Map();
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r !== "object") continue;
    const name = text(r.name, 200);
    if (!name) continue;
    const id = /^UC[\w-]{20,30}$/.test(String(r.id || "")) ? String(r.id) : "";
    const image = /^https:\/\//.test(String(r.image || "")) ? String(r.image).slice(0, 500) : "";
    const lang = /^[a-z]{2,3}$/.test(String(r.lang || "")) ? String(r.lang) : "";
    const rec = { name, id, image, on: r.on ? 1 : 0, watched_at: whole(r.watched_at), updated_at: whole(r.updated_at) };
    if (lang) rec.lang = lang;
    const had = seen.get(name);
    if (!had || rec.updated_at > had.updated_at) seen.set(name, rec);
  }
  return [...seen.values()].sort(byName);
}

export const isFollowed = (list, name) => cleanFollows(list).some((r) => r.on && r.name === text(name, 200));

/** Follow or unfollow a channel. `channel` is {name, id?, image?}; `now` is in seconds. */
export function setFollow(list, channel, on, now) {
  const name = text(channel && channel.name, 200);
  const all = cleanFollows(list);
  if (!name) return all;
  const had = all.find((r) => r.name === name);
  const rec = {
    name, id: (channel.id || (had && had.id) || ""), image: (channel.image || (had && had.image) || ""),
    on: on ? 1 : 0, watched_at: on ? whole(now) : (had ? had.watched_at : 0), updated_at: whole(now),
  };
  const lang = channel.lang || (had && had.lang) || "";
  if (lang) rec.lang = lang;
  return cleanFollows([...all.filter((r) => r.name !== name), rec]);
}

/** Note that a video of this channel was just opened (only followed channels are tracked). */
export function markWatched(list, name, now) {
  const all = cleanFollows(list);
  const rec = all.find((r) => r.on && r.name === text(name, 200));
  if (!rec || whole(now) <= rec.watched_at) return all;
  rec.watched_at = rec.updated_at = whole(now);
  return all;
}

/** Add what was learnt about a channel later (its id and picture) without changing anything else. */
export function fillChannel(list, name, { id = "", image = "" } = {}, now) {
  const all = cleanFollows(list);
  const rec = all.find((r) => r.name === text(name, 200));
  if (!rec || ((!id || rec.id === id) && (!image || rec.image === image))) return all;
  return cleanFollows(all.map((r) => (r === rec ? { ...r, id: id || r.id, image: image || r.image, updated_at: whole(now) } : r)));
}

/** The followed channels, the one watched most recently first. */
export function followedChannels(list, lang = "") {
  return cleanFollows(list).filter((r) => r.on && (!lang || !r.lang || r.lang === lang))
    .sort((a, b) => b.watched_at - a.watched_at || b.updated_at - a.updated_at || byName(a, b));
}

/** Two devices' lists → one: for each channel the copy that changed last wins. */
export function mergeFollows(mine, theirs) {
  const out = new Map(cleanFollows(mine).map((r) => [r.name, r]));
  for (const r of cleanFollows(theirs)) {
    const had = out.get(r.name);
    if (!had || r.updated_at > had.updated_at) out.set(r.name, r);
  }
  return [...out.values()].sort(byName);
}

/** Where on YouTube to find more of a channel's videos. */
export function channelAddress(channel, { mobile = false } = {}) {
  const site = mobile ? "https://m.youtube.com" : "https://www.youtube.com";
  if (channel && channel.id) return `${site}/channel/${channel.id}/videos`;
  return `${site}/results?search_query=${encodeURIComponent(text(channel && channel.name, 200))}`;
}

/** A channel picture's address at a small size (YouTube sizes them by a "=s<pixels>" ending). */
export function smallImage(url, size = 88) {
  return String(url || "").replace(/=s\d+(-[^=]*)?$/, `=s${size}-c-k-c0x00ffffff-no-rj`);
}
