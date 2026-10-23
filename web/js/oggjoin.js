// Joins Ogg Opus files end to end without decoding them: a card's voice (cardvoice.js) is its word,
// then its sentence, said by Azure as two files and kept as one. Every version has it.
//
// An Ogg file is a run of "pages"; each page carries whole or partial "packets"; in Opus each audio
// packet is a few hundredths of a second of sound. The first two packets describe the stream
// (OpusHead, OpusTags). Positions are counted in samples at 48,000 per second. (The phone's Anki export
// cuts such files the same way: mobile/src/js/ogg-clip.js.)

const RATE = 48000;
const PACKETS_PER_PAGE = 50;

const CRC = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let b = 0; b < 8; b++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
  CRC[i] = r >>> 0;
}
function crc(bytes) {
  let c = 0;
  for (let i = 0; i < bytes.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return c;
}
const ascii = (bytes, from, n) => String.fromCharCode(...bytes.subarray(from, from + n));

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** How many samples one Opus packet plays for (read from its first byte or two). */
export function packetSamples(packet) {
  if (!packet.length) return 0;
  const config = packet[0] >> 3;
  const ms = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3];
  const code = packet[0] & 3;
  const frames = code === 0 ? 1 : code < 3 ? 2 : packet.length > 1 ? packet[1] & 0x3f : 0;
  return frames * ms * (RATE / 1000);
}

/** The packets of an Ogg Opus file: {head, audio: [packet…], skip, samples}, or null when the bytes
 * are not Ogg Opus. `samples`: what the audio packets play for, before the `skip` at the start. */
export function opusPackets(bytes) {
  let at = 0, parts = [], seen = 0, head = null, samples = 0;
  const audio = [];
  while (at + 27 <= bytes.length) {
    if (ascii(bytes, at, 4) !== "OggS") break;
    const segments = bytes[at + 26];
    let data = at + 27 + segments, size = 0;
    for (let s = 0; s < segments; s++) {
      const lace = bytes[at + 27 + s];
      size += lace;
      if (lace === 255) continue;  // the packet goes on in the next segment (or the next page)
      parts.push(bytes.subarray(data, data + size));
      const packet = parts.length === 1 ? parts[0].slice() : concat(parts);
      parts = [];
      data += size;
      size = 0;
      seen++;
      if (seen === 1) {
        if (packet.length < 19 || ascii(packet, 0, 8) !== "OpusHead") return null;
        head = packet;
      } else if (seen > 2) {
        audio.push(packet);
        samples += packetSamples(packet);
      }
    }
    if (size) parts.push(bytes.subarray(data, data + size));
    at = data + size;
  }
  if (!head) return null;
  return { head, audio, skip: head[10] | (head[11] << 8), samples };
}

/** One Ogg page holding these packets. `flags`: 2 = first page of the stream, 4 = last. */
function page(packets, granule, serial, sequence, flags) {
  const laces = [];
  for (const p of packets) {
    for (let left = p.length; left >= 255; left -= 255) laces.push(255);
    laces.push(p.length % 255);
  }
  const body = concat(packets), out = new Uint8Array(27 + laces.length + body.length), view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53, 0, flags]);  // "OggS", version 0
  view.setUint32(6, granule % 2 ** 32, true);
  view.setUint32(10, Math.floor(granule / 2 ** 32), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  out[26] = laces.length;
  out.set(laces, 27);
  out.set(body, 27 + laces.length);
  view.setUint32(22, crc(out), true);
  return out;
}

/**
 * An Ogg Opus file from Opus packets (as an encoder gives them, cardaudio.js): `head` is the OpusHead
 * packet, `samples` how much sound was put in (at 48,000 a second), so the encoder's padding at the end
 * is not played. Null when there is nothing to write.
 */
export function oggOpusFile(head, packets, { samples = null } = {}) {
  if (!head || head.length < 19 || ascii(head, 0, 8) !== "OpusHead" || !(packets || []).length) return null;
  const serial = 0x7a6d6b33;
  const tags = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 7, 0, 0, 0, 0x74, 0x61, 0x6d, 0x6b, 0x65, 0x65, 0x6e, 0, 0, 0, 0]);  // "OpusTags", vendor "tamkeen"
  const skip = head[10] | (head[11] << 8);
  const pages = [page([head], 0, serial, 0, 2), page([tags], 0, serial, 1, 0)];
  const total = packets.reduce((n, p) => n + packetSamples(p), 0);
  const end = samples == null ? total : Math.min(total, skip + Math.max(0, Math.round(samples)));
  let played = 0;
  for (let i = 0; i < packets.length; i += PACKETS_PER_PAGE) {
    const group = packets.slice(i, i + PACKETS_PER_PAGE), isLast = i + PACKETS_PER_PAGE >= packets.length;
    for (const p of group) played += packetSamples(p);
    pages.push(page(group, isLast ? end : played, serial, pages.length, isLast ? 4 : 0));
  }
  return concat(pages);
}

/** An OpusHead packet: one channel, `skip` samples (at 48,000 a second) the decoder drops at the start. */
export function opusHead({ skip = 312, rate = 48000, channels = 1 } = {}) {
  const head = new Uint8Array(19);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, channels]);  // "OpusHead", version 1
  const view = new DataView(head.buffer);
  view.setUint16(10, skip, true);
  view.setUint32(12, rate, true);
  return head;  // gain 0, channel mapping 0
}

/**
 * Join Ogg Opus files (Uint8Arrays) end to end into one: the later files' packets follow the first's in
 * a single stream. All must have the same number of channels (one, from the same speech service).
 * Gives {bytes, parts: [{start, seconds}]}: where each part starts in the joined file and how long it
 * plays, in seconds. Null when a file is not Ogg Opus. (The few milliseconds a decoder needs to settle
 * at the start of a later part are played as they are: they fall in the silence left at each end.)
 */
export function joinOggOpus(files) {
  const read = (files || []).map(opusPackets);
  if (!read.length || read.some((r) => !r) || read.some((r) => r.head[9] !== read[0].head[9])) return null;
  const skip = read[0].skip;
  const serial = 0x7a6d6b32;
  const tags = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 7, 0, 0, 0, 0x74, 0x61, 0x6d, 0x6b, 0x65, 0x65, 0x6e, 0, 0, 0, 0]);  // "OpusTags", vendor "tamkeen"
  const packets = read.flatMap((r) => r.audio);
  const pages = [page([read[0].head], 0, serial, 0, 2), page([tags], 0, serial, 1, packets.length ? 0 : 4)];
  const parts = [];
  let at = 0;  // samples into the stream, counted from its first packet
  read.forEach((r, i) => {
    // The stream's pre-skip drops the first part's own start-up samples; a later part's are played.
    parts.push({ start: Math.max(0, i === 0 ? 0 : at - skip) / RATE, seconds: Math.max(0, i === 0 ? r.samples - skip : r.samples) / RATE });
    at += r.samples;
  });
  let played = 0;
  for (let i = 0; i < packets.length; i += PACKETS_PER_PAGE) {
    const group = packets.slice(i, i + PACKETS_PER_PAGE), isLast = i + PACKETS_PER_PAGE >= packets.length;
    for (const p of group) played += packetSamples(p);
    pages.push(page(group, played, serial, pages.length, isLast ? 4 : 0));
  }
  return { bytes: concat(pages), parts };
}
