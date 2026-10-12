// Adding a YouTube video: read its captions from this device (see ytcaptions.js) and store them
// as the video's transcript. The video itself is never downloaded; it plays in YouTube's own
// embedded player (see ytmedia.js).

import { api, ytRequest } from "./app.js";
import { LANGUAGE_CODES, langInfo, studyLanguage } from "./languages.js";
import { fetchCaptions, videoId } from "./ytcaptions.js";

export { videoId };
export const YT_TYPE = "video/youtube";
export const isYouTube = (ep) => (ep.audio_type || "") === YT_TYPE;

/** Add the video at `link` to the library. Resolves to the new episode (with `auto` and `words`). */
export async function importVideo(link) {
  const id = videoId(link);
  if (!id) throw new Error("Paste a YouTube link, like https://www.youtube.com/watch?v=…");
  const v = await fetchCaptions(id, {
    language: studyLanguage(), languageName: langInfo(studyLanguage()).name, taught: LANGUAGE_CODES, request: ytRequest,
  });
  const ep = await api("/youtube", { method: "POST", body: {
    video_id: v.videoId, title: v.title, channel: v.channel, duration: v.duration, language: v.language, auto: v.auto, lines: v.lines,
  } });
  return { ...ep, auto: v.auto };
}
