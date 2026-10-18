"""Build the Japanese and Chinese word files: what splits their text (written without spaces) into words.

Japanese (docs/lexicon/ja-ipadic.bin.gz): the IPADIC dictionary as prepared by kuromoji.js
(https://github.com/takuyaa/kuromoji.js, Apache 2.0; dictionary mecab-ipadic-2.7.0-20070801,
NAIST licence). Read by web/js/lexicon/kuromoji.js. The published dict/*.dat.gz files are padded
with tens of megabytes of zeros and repeat each word's spelling in its description, so this keeps
only the part in use: same format, trimmed, with the description strings shared, all in one file.

Chinese (docs/lexicon/zh-cedict.json.gz): every word of CC-CEDICT (https://cc-cedict.org,
CC BY-SA 4.0) in simplified characters with its pinyin, how common it is (wordfreq, CC BY-SA 4.0,
https://github.com/rspeer/wordfreq) so the splitter can choose between two ways of cutting a
sentence, and the simplified <-> traditional tables. Read by web/js/lexicon/chinese.js.

    python tools/build_cjk.py ja=<kuromoji package>/dict zh=cedict_1_0_ts_utf-8_mdbg.txt.gz \
        zhfreq=<wordfreq wheel>/wordfreq/data/large_zh.msgpack.gz

(kuromoji: the npm package kuromoji 0.1.2; CC-CEDICT: https://www.mdbg.net/chinese/export/cedict/;
wordfreq: the files inside its wheel; nothing from them is run, only read.)
Writes the files and adds them to docs/lexicon/index.json.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "lexicon"


# ---------------------------------------------------------------- Japanese

def _trim_zeros(b: bytes, unit: int = 1) -> bytes:
    end = len(b.rstrip(b"\0"))
    end = -(-end // unit) * unit
    return b[:end]


def _trie(base: bytes, check: bytes) -> tuple[bytes, bytes]:
    """doublearray's own shrink(): up to the last used node, plus one."""
    n = len(check) // 4
    chk = struct.unpack(f"<{n}i", check)
    last = n - 1
    while chk[last] < 0:
        last -= 1
    keep = (last + 2) * 4
    return base[:keep], check[:keep]


def _target_map(b: bytes) -> bytes:
    """Only the records the count at the front announces (the rest is padding that kuromoji
    would otherwise read as thousands of extra entries)."""
    keys = struct.unpack_from("<i", b, 0)[0]
    pos = 4
    for _ in range(keys):
        _, count = struct.unpack_from("<ii", b, pos)
        pos += 8 + 4 * count
    return b[:pos]


def _katakana(s: str) -> str:
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def _features(tid: bytes, pos: bytes, kinds: dict[str, int]) -> tuple[bytes, bytes]:
    """Each entry's description, made smaller: "kind,dictionary form,reading", where kind numbers
    one of the few thousand different part-of-speech + conjugation descriptions (`kinds`, kept
    once), and the dictionary form and reading are left empty when they are just the spelling.
    The pronunciation is dropped (unused). Identical descriptions are stored once."""
    tid = bytearray(_trim_zeros(tid, 10))
    out = bytearray()
    where: dict[bytes, int] = {}
    for i in range(0, len(tid), 10):
        p = struct.unpack_from("<i", tid, i + 6)[0]
        e = pos.index(b"\0", p)
        f = pos[p:e].decode("utf-8").split(",")
        f += ["*"] * (9 - len(f))
        surface, kind, basic, reading = f[0], ",".join(f[1:7]), f[7], f[8]
        k = kinds.setdefault(kind, len(kinds))
        s = f"{k},{'' if basic == surface else basic},{'' if reading == _katakana(surface) else reading}".encode()
        if s not in where:
            where[s] = len(out)
            out += s + b"\0"
        struct.pack_into("<i", tid, i + 6, where[s])
    return bytes(tid), bytes(out)


def build_japanese(dict_dir: Path) -> dict:
    rd = lambda n: gzip.open(dict_dir / f"{n}.dat.gz").read()  # noqa: E731
    base, check = _trie(rd("base"), rd("check"))
    kinds: dict[str, int] = {}
    tid, tid_pos = _features(rd("tid"), rd("tid_pos"), kinds)
    unk, unk_pos = _features(rd("unk"), rd("unk_pos"), kinds)
    invoke = rd("unk_invoke")
    # unk_invoke: records of (byte, byte, int32, string\0) until the padding starts.
    p = 0
    while p + 6 < len(invoke) and invoke[p + 6] != 0:
        p = invoke.index(b"\0", p + 6) + 1
    parts = {
        "base": base, "check": check, "tid": tid, "tid_pos": tid_pos, "tid_map": _target_map(rd("tid_map")),
        "cc": rd("cc"), "unk": unk, "unk_pos": unk_pos, "unk_map": _target_map(rd("unk_map")),
        "unk_char": rd("unk_char"), "unk_compat": rd("unk_compat"), "unk_invoke": invoke[:p],
        "kinds": "\n".join(kinds).encode("utf-8"),
    }
    # Pack: "TKJA", header length, JSON header {name: [offset, length]} (offsets counted from the
    # end of the header), then the parts, each starting on a multiple of 4 bytes.
    table: dict[str, list[int]] = {}
    body = bytearray()
    for name, blob in parts.items():
        body += b"\0" * (-len(body) % 4)
        table[name] = [len(body), len(blob)]
        body += blob
    header = json.dumps({"format": 1, "parts": table}).encode()
    header += b" " * (-(8 + len(header)) % 4)
    packed = b"TKJA" + struct.pack("<I", len(header)) + header + bytes(body)
    blob = gzip.compress(packed, 9, mtime=0)
    (OUT / "ja-ipadic.bin.gz").write_bytes(blob)
    entries = len(tid) // 10
    print(f"ja: {entries} entries, {len(packed) / 1e6:.1f} MB unpacked, {len(blob) / 1e6:.1f} MB gzipped")
    return {"file": "ja-ipadic.bin.gz", "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
            "title": "Japanese dictionary", "db": "mecab-ipadic-2.7.0-20070801 (kuromoji.js 0.1.2)",
            "license": "NAIST (IPADIC)", "entries": entries}


# ---------------------------------------------------------------- Chinese

def _msgpack(data: bytes):
    """Just enough MessagePack to read a wordfreq list (lists, maps, strings, small ints)."""
    pos = 0

    def item():
        nonlocal pos
        b = data[pos]
        pos += 1
        if b <= 0x7F:
            return b
        if 0x80 <= b <= 0x8F:
            return {item(): item() for _ in range(b & 0x0F)}
        if 0x90 <= b <= 0x9F:
            return [item() for _ in range(b & 0x0F)]
        if 0xA0 <= b <= 0xBF:
            n = b & 0x1F
        elif b in (0xD9, 0xDA, 0xDB):
            w = {0xD9: 1, 0xDA: 2, 0xDB: 4}[b]
            n = int.from_bytes(data[pos:pos + w], "big")
            pos += w
        elif b in (0xDC, 0xDD):
            w = 2 if b == 0xDC else 4
            n = int.from_bytes(data[pos:pos + w], "big")
            pos += w
            return [item() for _ in range(n)]
        elif b in (0xDE, 0xDF):
            w = 2 if b == 0xDE else 4
            n = int.from_bytes(data[pos:pos + w], "big")
            pos += w
            return {item(): item() for _ in range(n)}
        elif b in (0xCC, 0xCD, 0xCE):
            w = {0xCC: 1, 0xCD: 2, 0xCE: 4}[b]
            v = int.from_bytes(data[pos:pos + w], "big")
            pos += w
            return v
        elif b == 0xC0:
            return None
        else:
            raise ValueError(f"msgpack type {b:#x} not handled")
        s = data[pos:pos + n].decode("utf-8")
        pos += n
        return s

    return item()


def _frequencies(path: Path) -> dict[str, int]:
    """wordfreq's 'cBpack': bucket i holds the words whose frequency is 10^(-i/100)."""
    packed = _msgpack(gzip.decompress(path.read_bytes()))
    header, buckets = packed[0], packed[1:]
    assert header.get("format") == "cB", header
    out: dict[str, int] = {}
    for cb, words in enumerate(buckets):
        for w in words:
            out.setdefault(w, cb)
    return out


HAN = re.compile(r"^[㐀-䶿一-鿿豈-﫿\U00020000-\U0003134f〇]+$")
LINE = re.compile(r"^(\S+) (\S+) \[([^\]]*)\] /(.*)/$")
WEAK = re.compile(r"^(?:(?:old |archaic |Japanese |)variant of|surname |used in |see [^/]|erhua variant)", re.I)
# The everyday reading of characters CC-CEDICT gives several readings for, when the character
# stands on its own (inside a longer word the word's own entry decides). Checked by hand.
COMMON_READING = {
    "了": "le5", "的": "de5", "地": "de5", "得": "de5", "着": "zhe5", "过": "guo4", "都": "dou1", "还": "hai2",
    "行": "xing2", "长": "chang2", "为": "wei4", "和": "he2", "只": "zhi3", "会": "hui4", "要": "yao4",
    "说": "shuo1", "看": "kan4", "一": "yi1", "不": "bu4", "没": "mei2", "便": "bian4", "好": "hao3",
    "重": "zhong4", "中": "zhong1", "乐": "le4", "数": "shu4", "少": "shao3", "种": "zhong3", "大": "da4",
    "那": "na4", "哪": "na3", "啊": "a5", "吧": "ba5", "呢": "ne5", "吗": "ma5", "么": "me5", "差": "cha4",
    "当": "dang1", "处": "chu4", "发": "fa1", "干": "gan4", "给": "gei3", "间": "jian1", "将": "jiang1",
    "教": "jiao1", "角": "jiao3", "觉": "jue2", "空": "kong1", "落": "luo4", "难": "nan2", "片": "pian4",
    "强": "qiang2", "切": "qie1", "相": "xiang1", "应": "ying1", "与": "yu3", "正": "zheng4", "转": "zhuan3",
    "作": "zuo4", "谁": "shei2", "场": "chang3", "传": "chuan2", "调": "diao4", "度": "du4", "分": "fen1",
    "更": "geng4", "号": "hao4", "假": "jia3", "量": "liang4", "省": "sheng3", "系": "xi4", "兴": "xing4",
    "子": "zi3", "个": "ge4", "们": "men5", "这": "zhe4", "里": "li3", "上": "shang4", "下": "xia4",
    "什": "shen2", "啦": "la5", "呀": "ya5", "哦": "o4", "嗯": "ng4", "哎": "ai1", "喂": "wei4", "嘛": "ma5",
    "朝": "chao2", "似": "si4", "露": "lu4", "参": "can1", "藏": "cang2", "降": "jiang4", "银": "yin2",
    "便宜": "pian2 yi5", "睡觉": "shui4 jiao4", "觉得": "jue2 de5", "东西": "dong1 xi5", "地方": "di4 fang5",
}


# Characters shown unchanged in traditional when they stand alone (Taiwan writes 台, not 檯).
SAME_ALONE = set("台")


def _cedict(path: Path):
    """(traditional, simplified, pinyin, definitions) for each line."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            m = LINE.match(line.strip())
            if m:
                yield m.group(1), m.group(2), m.group(3), m.group(4).split("/")


def _pinyin(p: str) -> str:
    """CC-CEDICT's pinyin, tidied: u: is ü, lower case, only syllables."""
    syl = [s.replace("u:", "ü").replace("U:", "ü").lower() for s in p.split()]
    return " ".join(s for s in syl if re.match(r"^[a-zü]+[1-5]$", s))


def _rank(entry) -> tuple:
    trad, simp, p, defs = entry
    proper = p[:1].isupper()
    weak = all(WEAK.match(d) for d in defs if d)
    variant = any("variant of" in d for d in defs)  # 荳: "bean (variant of 豆)"
    return (weak, proper, variant)


def build_chinese(path: Path, freq_path: Path) -> dict:
    freq = _frequencies(freq_path)
    entries: dict[str, list] = {}
    t2s: dict[str, str] = {}
    for trad, simp, p, defs in _cedict(path):
        if not HAN.match(simp) or not HAN.match(trad) or len(simp) != len(trad):
            continue
        py = _pinyin(p)
        if len(py.split()) != len(simp):
            continue
        entries.setdefault(simp, []).append((trad, simp, py, defs, p))
        for a, b in zip(trad, simp):
            if a != b:
                t2s.setdefault(a, b)
    # The usual traditional form of each character first (from the one-character entries), so a
    # word's traditional spelling can prefer it over a rare variant (咖啡豆, not 咖啡荳).
    usual: dict[str, str] = {}
    for simp, es in entries.items():
        if len(simp) == 1:
            usual[simp] = sorted(es, key=lambda e: _rank((e[0], e[1], e[4], e[3])))[0][0]
    unusual = lambda e: sum(t != usual.get(c, c) for t, c in zip(e[0], e[1]))  # noqa: E731
    words: dict[str, list] = {}
    s2t: dict[str, str] = {}
    s2tc: dict[str, str] = {}
    for simp, es in entries.items():
        # stable sort: file order breaks ties
        # (A character that is also written that way in traditional keeps that spelling when it
        # stands alone: 台 stays 台, not 檯; words decide for themselves: 這裡.)
        best = sorted(es, key=lambda e: (*_rank((e[0], e[1], e[4], e[3])), len(simp) == 1 and e[0] != simp, unusual(e)))[0]
        py = COMMON_READING.get(simp, best[2])
        # How common, in centibels below 1 (wordfreq); 0 = unknown to it.
        words[simp] = [py, freq.get(simp, freq.get(best[0], 0))]
        if best[0] != simp and simp not in SAME_ALONE:
            if len(simp) == 1:
                s2tc[simp] = best[0]
            else:
                s2t[simp] = best[0]
    data = {"format": 1, "kind": "zh", "name": "zh", "words": words, "t2s": t2s, "s2t": s2t, "s2tc": s2tc}
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    blob = gzip.compress(raw, 9, mtime=0)
    (OUT / "zh-cedict.json.gz").write_bytes(blob)
    print(f"zh: {len(words)} words, {len(t2s)} traditional characters, {len(raw) / 1e6:.1f} MB, {len(blob) / 1e6:.1f} MB gzipped")
    return {"file": "zh-cedict.json.gz", "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
            "title": "Chinese dictionary", "db": "CC-CEDICT + wordfreq", "license": "CC-BY-SA-4.0", "words": len(words)}


def main(argv: list[str]) -> None:
    args = dict(a.split("=", 1) for a in argv)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    if "ja" in args:
        index["files"]["ja"] = build_japanese(Path(args["ja"]))
    if "zh" in args:
        index["files"]["zh"] = build_chinese(Path(args["zh"]), Path(args["zhfreq"]))
    index["files"] = dict(sorted(index["files"].items()))
    index_path.write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
