// Library → My audio → Listen: a recording from the microphone, made until the learner presses Stop,
// kept as a new item in "My audio" exactly like an audio file they added themself (the same upload,
// the same transcription: the computer's own speech model, or on a phone the learner's cloud
// transcription key, else the computer). Every version has it; the box is components/listenbox.js and
// the microphone is cardaudio.js startRecording.
//
// The file is one every version plays and every transcriber takes. A browser's recorder gives:
//   - Chromium (the Windows window, Android, Chrome and Edge): WebM. A recorder's WebM has no length and
//     no index, so a player can't jump about in it (tapping a word in the transcript). Its sound is
//     already Opus, so the packets are taken out of the WebM as they are (nothing is decoded or made
//     again) and put into an Ogg Opus file (oggjoin.js), the format of the app's audio copies.
//   - Firefox: Ogg Opus already. Safari (iPhone, Mac): MP4 with AAC, kept as an .m4a.
// If the WebM can't be read, it is sent as it is: the computer turns it into Ogg Opus when it keeps it
// (app/videos.py, `recording`).
//
// The pure part (titles, the clock, the WebM reader) is tested in tests/js/listenrec.test.mjs.

import { oggOpusFile } from "./oggjoin.js";

/** The longest recording (minutes): it is saved by itself then. At the recorder's 32 kbit/s that is about
 * 21 MB, under the 24 MB a cloud transcription service takes in one go. */
export const LISTEN_MAX_MINUTES = 90;

const pad = (n) => String(n).padStart(2, "0");

/** "0:07", "12:34", "1:02:03" for a length in milliseconds. */
export function clock(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** The date and time a recording is named after: "16 Nov 14:05" (in `locale`'s words for the month). */
export function recordingStamp(date = new Date(), locale = "en-GB") {
  let day;
  try {
    day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
  } catch {
    day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
  }
  return `${day.replace(/\.$/, "")} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The locale a recording's date is written in for the app's own language (English: "16 Nov"). */
export const stampLocale = (ui) => (!ui || ui === "en" ? "en-GB" : ui);

/** The recording's file name (its ending tells every version what it is): "recording-20261116-1405.ogg". */
export function recordingName(date, ext) {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `recording-${d}-${pad(date.getHours())}${pad(date.getMinutes())}${ext}`;
}

/** The ending and type a recorder's own file is kept under, from the type it says it made. */
export function recorderKind(type) {
  const t = String(type || "").toLowerCase();
  if (/ogg/.test(t)) return { ext: ".ogg", mime: "audio/ogg" };
  if (/mp4|m4a|aac/.test(t)) return { ext: ".m4a", mime: "audio/mp4" };
  return { ext: ".webm", mime: "audio/webm" };
}

// ---------------------------------------------------------------- WebM (Matroska) without decoding

const ID = {
  EBML: 0x1a45dfa3, SEGMENT: 0x18538067, TRACKS: 0x1654ae6b, TRACK_ENTRY: 0xae, TRACK_NUMBER: 0xd7, CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63a2, CLUSTER: 0x1f43b675, BLOCK_GROUP: 0xa0, BLOCK: 0xa1, SIMPLE_BLOCK: 0xa3,
};
// Elements whose insides are read in turn (a recorder writes the Segment and its Clusters without a size,
// as it can't know it while recording; reading their insides one after another needs none).
const OPEN = new Set([ID.SEGMENT, ID.TRACKS, ID.TRACK_ENTRY, ID.CLUSTER, ID.BLOCK_GROUP]);

/** An element's id at `at` (its marker bits kept, as ids are written): {value, length}, or null. */
function readId(bytes, at) {
  const first = bytes[at];
  if (first === undefined) return null;
  const length = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (!length || at + length > bytes.length) return null;
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[at + i];
  return { value, length };
}

/** A size (or a block's track number) at `at`, its marker bit taken off: {value, length, unknown}. */
function readSize(bytes, at) {
  const first = bytes[at];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (!(first & (0x80 >> (length - 1)))) length++;
  if (at + length > bytes.length) return null;
  let value = first & (0xff >> length), all = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[at + i];
    if (bytes[at + i] !== 0xff) all = false;
  }
  return { value, length, unknown: all };
}

/**
 * The Opus sound in a WebM file as a recorder writes it: {head, packets, channels}, `head` the stream's
 * OpusHead (WebM keeps it as the track's CodecPrivate), `packets` the Opus packets in order. Null when the
 * bytes are not WebM with an Opus track, or use something a recorder doesn't (laced blocks).
 */
export function webmOpus(bytes) {
  if (!bytes || bytes.length < 8) return null;
  const top = readId(bytes, 0);
  if (!top || top.value !== ID.EBML) return null;
  const tracks = [];
  const packets = [];
  let opus = null; // the Opus track's number, once the tracks have been read
  let at = 0;
  while (at < bytes.length) {
    const id = readId(bytes, at);
    if (!id) break;
    const size = readSize(bytes, at + id.length);
    if (!size) break;
    const start = at + id.length + size.length;
    if (OPEN.has(id.value)) {
      if (id.value === ID.TRACK_ENTRY) tracks.push({});
      if (id.value === ID.CLUSTER && opus === null) {
        const track = tracks.find((t) => t.codec === "A_OPUS" && t.head);
        if (!track) return null;
        opus = track.number;
      }
      at = start; // (the insides next, whatever the size says)
      continue;
    }
    if (size.unknown) break; // (only the elements above may leave their size open)
    const end = start + size.value;
    if (end > bytes.length) break; // (cut short: what came before is kept)
    const body = bytes.subarray(start, end);
    const entry = tracks[tracks.length - 1];
    if (id.value === ID.TRACK_NUMBER && entry) entry.number = body.reduce((n, b) => n * 256 + b, 0);
    else if (id.value === ID.CODEC_ID && entry) entry.codec = String.fromCharCode(...body).replace(/\0+$/, "");
    else if (id.value === ID.CODEC_PRIVATE && entry) entry.head = body.slice();
    else if ((id.value === ID.SIMPLE_BLOCK || id.value === ID.BLOCK) && opus !== null) {
      const track = readSize(body, 0);
      if (!track || body.length < track.length + 3) return null;
      const flags = body[track.length + 2];
      if (flags & 0x06) return null; // laced: several packets in one block
      if (track.value === opus && body.length > track.length + 3) packets.push(body.slice(track.length + 3));
    }
    at = end;
  }
  const track = tracks.find((t) => t.number === opus);
  if (!track || !track.head || track.head.length < 19 || String.fromCharCode(...track.head.subarray(0, 8)) !== "OpusHead") return null;
  if (!packets.length) return null;
  return { head: track.head, packets, channels: track.head[9] };
}

/** A recorder's WebM as Ogg Opus bytes (the same packets, in Ogg pages), or null when it can't be. */
export function webmToOgg(bytes) {
  const sound = webmOpus(bytes);
  return sound ? oggOpusFile(sound.head, sound.packets) : null;
}

/**
 * The file to keep for a recording (a Blob from the recorder, `type` what the recorder said it made),
 * named after `date`: Ogg Opus where it can be, else the recorder's own file. A File where the device has
 * them (every browser the app runs in), else a Blob with a `name`.
 */
export async function recordingFile(blob, { type = "", date = new Date() } = {}) {
  let kind = recorderKind(type || blob.type);
  let out = blob;
  if (kind.ext === ".webm") {
    let ogg = null;
    try { ogg = webmToOgg(new Uint8Array(await blob.arrayBuffer())); } catch { ogg = null; }
    if (ogg) { out = new Blob([ogg], { type: "audio/ogg" }); kind = { ext: ".ogg", mime: "audio/ogg" }; }
  }
  const name = recordingName(date, kind.ext);
  if (typeof File === "function") return new File([out], name, { type: kind.mime, lastModified: date.getTime() });
  return Object.assign(new Blob([out], { type: kind.mime }), { name });
}
