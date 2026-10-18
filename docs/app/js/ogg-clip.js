// Cuts short clips out of an Ogg Opus file (the audio copy the phone keeps of each episode)
// without decoding it: the compressed packets for the wanted stretch are copied into a new,
// small Ogg file. Used for the word and sentence audio in an Anki deck.
//
// An Ogg file is a run of "pages"; each page carries whole or partial "packets"; in Opus each
// audio packet is a few hundredths of a second of sound. The first two packets describe the
// stream (OpusHead, OpusTags). Positions are counted in samples at 48,000 per second.

const RATE = 48000;
const PREROLL = 3840;  // 80 ms of earlier sound the decoder needs to settle; it is not played
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

/** How many samples one Opus packet plays for (read from its first byte or two). */
export function packetSamples(packet) {
  if (!packet.length) return 0;
  const config = packet[0] >> 3;
  const ms = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3];
  const code = packet[0] & 3;
  const frames = code === 0 ? 1 : code < 3 ? 2 : packet.length > 1 ? packet[1] & 0x3f : 0;
  return frames * ms * (RATE / 1000);
}

/** Calls `each(packet)` for every packet in the file, in order; stops early when it returns false.
 * Returns false when the bytes are not an Ogg stream. */
function eachPacket(bytes, each) {
  let at = 0, parts = [];
  while (at + 27 <= bytes.length) {
    if (ascii(bytes, at, 4) !== "OggS") return at > 0;
    const segments = bytes[at + 26];
    let data = at + 27 + segments, size = 0;
    for (let s = 0; s < segments; s++) {
      const lace = bytes[at + 27 + s];
      size += lace;
      if (lace === 255) continue;  // the packet goes on in the next segment (or the next page)
      parts.push(bytes.subarray(data, data + size));
      const packet = parts.length === 1 ? parts[0] : join(parts);
      parts = [];
      data += size;
      size = 0;
      if (each(packet) === false) return true;
    }
    if (size) parts.push(bytes.subarray(data, data + size));
    at = data + size;
  }
  return at > 0;
}

function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** One Ogg page holding these packets. `flags`: 2 = first page of the stream, 4 = last. */
function page(packets, granule, serial, sequence, flags) {
  const laces = [];
  for (const p of packets) {
    for (let left = p.length; left >= 255; left -= 255) laces.push(255);
    laces.push(p.length % 255);
  }
  const body = join(packets), out = new Uint8Array(27 + laces.length + body.length), view = new DataView(out.buffer);
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
 * Cut clips out of an Ogg Opus file. `ranges` is a list of [start, end] in seconds; the result
 * has one small Ogg Opus file (Uint8Array) per range, or null where nothing could be cut
 * (the range lies outside the audio, or the bytes are not Ogg Opus).
 */
export function cutOggOpus(bytes, ranges) {
  let head = null, seen = 0, position = 0;  // position: samples before the current packet
  const wanted = ranges.map(([start, end]) => ({ from: Math.max(0, start) * RATE, to: Math.max(0, end) * RATE, packets: [], first: 0, last: 0 }));
  const lastNeeded = () => Math.max(...wanted.map((w) => w.to));
  const ok = eachPacket(bytes, (packet) => {
    seen++;
    if (seen === 1) {
      if (packet.length < 19 || ascii(packet, 0, 8) !== "OpusHead") return false;
      head = packet;
      const skip = packet[10] | (packet[11] << 8);  // samples the file itself says to drop at its start
      for (const w of wanted) { w.from += skip; w.to += skip; }
      return true;
    }
    if (seen === 2) return true;  // OpusTags
    const samples = packetSamples(packet), end = position + samples;
    for (const w of wanted) {
      if (end > w.from - PREROLL && position < w.to) {
        if (!w.packets.length) w.first = position;
        w.packets.push(packet);
        w.last = end;
      }
    }
    position = end;
    return position < lastNeeded();
  });
  if (!ok || !head) return ranges.map(() => null);

  const serial = 0x7a6d6b31;
  const tags = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 7, 0, 0, 0, 0x74, 0x61, 0x6d, 0x6b, 0x65, 0x65, 0x6e, 0, 0, 0, 0]);  // "OpusTags", vendor "tamkeen", no comments
  return wanted.map((w) => {
    if (!w.packets.length || w.last <= w.from) return null;
    const skip = Math.max(0, Math.round(w.from - w.first));  // sound before the wanted start: decoded, not played
    if (skip > 0xffff) return null;
    const newHead = head.slice();
    newHead[10] = skip & 0xff;
    newHead[11] = skip >> 8;
    const total = Math.round(Math.min(w.to, w.last) - w.first);  // where playing stops, counted from the first packet
    const pages = [page([newHead], 0, serial, 0, 2), page([tags], 0, serial, 1, 0)];
    let played = 0;
    for (let i = 0; i < w.packets.length; i += PACKETS_PER_PAGE) {
      const group = w.packets.slice(i, i + PACKETS_PER_PAGE), isLast = i + PACKETS_PER_PAGE >= w.packets.length;
      for (const p of group) played += packetSamples(p);
      pages.push(page(group, isLast ? total : played, serial, pages.length, isLast ? 4 : 0));
    }
    return join(pages);
  });
}

/** What a cut clip (or any Ogg Opus file) holds: seconds of sound, and whether every page is intact. */
export function oggOpusInfo(bytes) {
  let at = 0, granule = 0, pages = 0, intact = true, skip = 0, last = 0;
  while (at + 27 <= bytes.length && ascii(bytes, at, 4) === "OggS") {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at), segments = bytes[at + 26];
    let size = 27 + segments;
    for (let s = 0; s < segments; s++) size += bytes[at + 27 + s];
    const copy = bytes.slice(at, at + size), stored = view.getUint32(22, true);
    copy.fill(0, 22, 26);
    if (crc(copy) !== stored) intact = false;
    if (pages === 0) skip = bytes[at + 27 + segments + 10] | (bytes[at + 27 + segments + 11] << 8);
    granule = view.getUint32(6, true) + view.getUint32(10, true) * 2 ** 32;
    last = bytes[at + 5];
    pages++;
    at += size;
  }
  return { seconds: Math.max(0, granule - skip) / RATE, pages, intact: intact && pages > 2 && at === bytes.length, ended: (last & 4) === 4, skip };
}
