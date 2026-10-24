// Adding a YouTube video: read its captions from this device (see ytcaptions.js) and store them
// as the video's transcript. The video itself is never downloaded; it plays in YouTube's own
// embedded player (see ytmedia.js).

import { api, platform, saveSettings, state, ytRequest } from "./app.js";
import { LANGUAGE_CODES, langInfo, studyLanguage } from "./languages.js";
import { audioInLanguage, fetchCaptions, fetchChannel, videoId } from "./ytcaptions.js";
import { handmadeOnly } from "./youtube-home.js";
import { cleanFollows, fillChannel, isFollowed, markWatched, setFollow } from "./ytfollow.js";

export { videoId };
export const YT_TYPE = "video/youtube";
export const isYouTube = (ep) => (ep.audio_type || "") === YT_TYPE;

/** Open a video in the player: straight away if it is already in the library, else after adding
 * it. `at`: the second to start at (a tamkeen://watch link's `t`). Resolves to its episode. */
export async function watchVideo(link, at = null) {
  const ep = await getVideo(link);
  location.hash = `#/episode/${ep.id}${at > 0 ? `?t=${Math.round(at * 1000) / 1000}` : ""}`;
  return ep;
}

/** The episode for a video: the one already in the library, else the video is added first. */
export async function getVideo(link) {
  const id = videoId(link);
  if (!id) throw new Error("That doesn't look like a YouTube video.");
  return (await libraryVideo(id)) || importVideo(id);
}

/** The video's episode when it is already in the library, else null. */
export async function libraryVideo(id) {
  try { return await api(`/youtube/${id}`); } catch { return null; /* not in the library yet */ }
}

/** Add the video at `link` to the library. Resolves to the new episode (with `auto` and `words`). */
export async function importVideo(link) {
  const id = videoId(link);
  if (!id) throw new Error("Paste a YouTube link, like https://www.youtube.com/watch?v=…");
  return saveVideo(await readVideo(id));
}

/** A video's captions in the language being studied, read from this device and not yet kept:
 * {videoId, title, channel, duration, language, auto, kind, lines, ...} (see ytcaptions.js
 * fetchCaptions). Throws when it has none. `handmade`: "Only videos with handmade subtitles";
 * `translate` false never takes YouTube's translation (when only what is said will do). */
export async function readVideo(id, { translate = true, handmade = handmadeOnly() } = {}) {
  return fetchCaptions(id, {
    language: studyLanguage(), languageName: langInfo(studyLanguage()).name, taught: LANGUAGE_CODES, request: ytRequest,
    handmadeOnly: handmade, translate,
  });
}

/** Keep a video read by readVideo in the library. Resolves to its episode. */
export async function saveVideo(v) {
  const ep = await api("/youtube", { method: "POST", body: {
    video_id: v.videoId, title: v.title, channel: v.channel, duration: v.duration, language: v.language, auto: v.auto,
    kind: v.kind || (v.auto ? "auto" : "manual"), lines: v.lines,
  } });
  return { ...ep, auto: v.auto };
}

/** How a video's captions were made, from its episode: "manual", "auto" or "translated". */
export function captionKind(ep) {
  const model = String((ep && ep.model) || "");
  return model === "youtube-auto" ? "auto" : model === "youtube-translated" ? "translated" : "manual";
}

/** Whether the video has its sound in the study language too (a dubbed audio track): {id, name} or null. */
export async function dubbedTrack(ep) {
  return audioInLanguage(videoId(ep.audio_url) || ep.guid, studyLanguage(), ytRequest);
}

// ---------- followed channels (the list and its rules are in ytfollow.js) ----------
// The list is the setting `youtube_follows`; it travels between devices with the library.

const nowSeconds = () => Math.floor(Date.now() / 1000);
/** A YouTube video's channel: its name is kept as the episode's description. */
export const channelOf = (ep) => String((ep && ep.description) || "").replace(/\s+/g, " ").trim();

/** The follow list as it stands (asked afresh on the computer, where a sync may have changed it). */
export async function loadFollows() {
  if (platform === "desktop") {
    try { return cleanFollows((await api("/settings")).youtube_follows); } catch { /* fall back to what the page knows */ }
  }
  return cleanFollows(state.status && state.status.settings && state.status.settings.youtube_follows);
}

export async function isFollowing(ep) {
  return isFollowed(await loadFollows(), channelOf(ep));
}

/** Follow or unfollow the channel of this video. Its id and picture are looked up afterwards. */
export async function followChannel(ep, on) {
  const name = channelOf(ep);
  if (!name) throw new Error("This video doesn't say which channel it is from.");
  await saveSettings({ youtube_follows: setFollow(await loadFollows(), { name, lang: studyLanguage() }, on, nowSeconds()) });
  if (on) {
    fetchChannel(videoId(ep.audio_url) || ep.guid, ytRequest).then(async (info) => {
      if (!info.id && !info.image) return;
      const list = await loadFollows();
      const filled = fillChannel(list, name, info, nowSeconds());
      if (JSON.stringify(filled) !== JSON.stringify(list)) await saveSettings({ youtube_follows: filled });
    }).catch(() => {});
  }
}

export async function unfollowChannel(name) {
  await saveSettings({ youtube_follows: setFollow(await loadFollows(), { name }, false, nowSeconds()) });
}

/** A video was opened: if its channel is followed, it moves to the front of the channel strip. */
export async function noteWatched(ep) {
  const list = await loadFollows();
  const next = markWatched(list, channelOf(ep), nowSeconds());
  if (JSON.stringify(next) !== JSON.stringify(list)) await saveSettings({ youtube_follows: next });
}
