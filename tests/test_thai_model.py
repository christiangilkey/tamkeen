"""Thai's own speech model (Typhoon Whisper Turbo, models_manager.LANGUAGE_MODELS "typhoon"): its download,
the bfloat16 weights it comes in, the cut of words it makes up, and Thai ำ written as one letter."""

from __future__ import annotations

import json
import struct

import numpy as np

from app import jobs, models_manager
from app.transcriber import convert
from app.transcriber.base import Segment, Word
from app.transcriber.faster import trim_invented


def test_typhoon_is_thai_s_own_model():
    spec = models_manager.LANGUAGE_MODELS["typhoon"]
    assert spec["language"] == "th" and spec["repo"] == "typhoon-ai/typhoon-whisper-turbo"
    assert len(spec["revision"]) == 40, "a fixed revision: the files that were tested"
    assert {"model.safetensors", "tokenizer.json", "generation_config.json"} <= spec["files"]
    assert spec["trim"] and not spec["prompt"] and spec["engines"] == {"faster-whisper"}


def _safetensors(path, tensors):
    header, blobs, at = {}, [], 0
    for name, (dtype, shape, raw) in tensors.items():
        header[name] = {"dtype": dtype, "shape": shape, "data_offsets": [at, at + len(raw)]}
        blobs.append(raw)
        at += len(raw)
    head = json.dumps(header).encode()
    path.write_bytes(struct.pack("<Q", len(head)) + head + b"".join(blobs))


def test_bfloat16_weights_are_read_exactly(tmp_path):
    values = np.array([1.0, -2.5, 0.15625, 3.0e4, -1.0e-3, 0.0], dtype=np.float32)
    bf16 = (values.view(np.uint32) >> 16).astype(np.uint16)  # these are exact in bfloat16 (or near it)
    f16 = values.astype(np.float16)
    _safetensors(tmp_path / "m.safetensors", {"a": ("BF16", [2, 3], bf16.tobytes()), "b": ("F16", [6], f16.tobytes())})
    t = convert._tensors(tmp_path / "m.safetensors")
    assert t["a"].dtype == np.float16 and t["a"].shape == (2, 3)
    expect = (bf16.astype(np.uint32) << 16).view(np.float32).astype(np.float16)
    assert np.array_equal(t["a"].ravel(), expect)
    assert np.allclose(t["a"].ravel().astype(np.float32), values, rtol=1e-2, atol=1e-3)
    assert np.array_equal(t["b"], f16)


def _line(pieces, text=None):
    words = [Word(s, e, w) for w, s, e in pieces]
    return Segment(words[0].start, words[-1].end, text if text is not None else "".join(w.text for w in words), words)


REAL = [("ตำรวจ", 0.2, 0.6), ("กล่าว", 0.6, 0.9), ("ว่า", 0.9, 1.0), ("ศพ", 1.0, 1.3), ("อยู่", 1.3, 1.5), ("ตรงนั้น", 1.5, 2.0)]


def test_real_speech_is_left_alone():
    seg = _line(REAL)
    assert trim_invented(seg) is seg
    # a short word said a few times really is (ใช่ ใช่ ใช่ "yes yes yes"), and a lone zero-length piece
    yes = _line(REAL + [("ใช่", 2.0, 2.2), ("ใช่", 2.2, 2.4), ("ใช่", 2.4, 2.6), ("ค่ะ", 2.6, 2.6)])
    assert trim_invented(yes) is yes


def test_a_pile_of_invented_words_at_the_end_is_cut():
    # what Typhoon did after a sentence that ended in silence: a Latin word, then letters piled at one moment
    # (the app strips the spaces off the pieces)
    pile = [("Interest", 2.0, 2.5)] + [(ch, 2.5, 2.5) for ch in "สินค้าขายยังไงไปค้างต่างที่"]
    seg = _line(REAL + pile, text="ตำรวจกล่าวว่า ศพอยู่ตรงนั้น Interest สินค้า ขาย ยังไงไปค้างต่างที่")
    out = trim_invented(seg)
    assert [w.text for w in out.words] == [w for w, _, _ in REAL]
    assert out.text == "ตำรวจกล่าวว่า ศพอยู่ตรงนั้น", "the text keeps its spaces and loses exactly the cut words"
    assert out.end == 2.0
    # a pile that creeps forward by hundredths of a second is still one
    creeping = [(ch, 2.0 + i * 0.004, 2.0 + i * 0.004 + 0.003) for i, ch in enumerate("อืมโอ้โหอืมโอ้โห")]
    assert [w.text for w in trim_invented(_line(REAL + creeping)).words] == [w for w, _, _ in REAL]


def test_a_phrase_said_over_and_over_is_kept_once():
    # Typhoon's pieces are letters and marks: ค่ะ comes as ค + ่ะ, and a loop can stop half-way (ค)
    loop = [(t, 2.0 + i * 0.15, 2.15 + i * 0.15) for i, t in enumerate(["ค", "่ะ"] * 8 + ["ค"])]
    out = trim_invented(_line(REAL + loop))
    assert [w.text for w in out.words] == [w for w, _, _ in REAL] + ["ค", "่ะ"]
    longer = [(w, 2.0 + i * 0.2, 2.2 + i * 0.2) for i, w in enumerate(["บัญชี", "รายชื่อ"] * 4)]
    out = trim_invented(_line(REAL + longer + [("ครับ", 4.0, 4.3)]))
    assert [w.text for w in out.words] == [w for w, _, _ in REAL] + ["บัญชี", "รายชื่อ", "ครับ"]


def test_thai_am_is_written_as_one_letter():
    split = "ตํารวจ"  # ตํารวจ as Whisper writes it
    segs = [Segment(0, 1, split, [Word(0, 0.5, "ตํา"), Word(0.5, 1, "รวจ")])]
    jobs._thai_letters(segs)
    assert segs[0].text == "ตำรวจ" and "".join(w.text for w in segs[0].words) == "ตำรวจ"
