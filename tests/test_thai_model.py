"""Thai's own speech model (NECTEC's Pathumma Whisper large-v3, models_manager.LANGUAGE_MODELS "pathumma"):
its download (with the tokenizer file it lacks, from Whisper large-v3), the removal of Typhoon, which it
replaced, the bfloat16 weights some models come in, the cut of words it makes up, and Thai ำ as one letter."""

from __future__ import annotations

import json
import struct
from types import SimpleNamespace

import numpy as np

from app import jobs, models_manager
from app.transcriber import convert
from app.transcriber.base import Segment, Word
from app.transcriber.faster import trim_invented


def test_pathumma_is_thai_s_own_model():
    spec = models_manager.LANGUAGE_MODELS["pathumma"]
    assert spec["language"] == "th" and spec["repo"] == "nectec/Pathumma-whisper-th-large-v3"
    assert len(spec["revision"]) == 40, "a fixed revision: the files that were tested"
    assert {"model.safetensors", "generation_config.json", "config.json"} <= spec["files"]
    assert "tokenizer.json" not in spec["files"], "Pathumma has none: it is borrowed"
    borrow = spec["borrow"]
    assert borrow["repo"] == "openai/whisper-large-v3" and len(borrow["revision"]) == 40
    assert borrow["files"] == {"tokenizer.json"}
    assert spec["trim"] and not spec["prompt"] and spec["engines"] == {"faster-whisper"} and spec["cloud_ok"]
    # Typhoon is gone (the OpenTyphoon terms forbid letting others use it without written permission)
    assert "typhoon" not in models_manager.LANGUAGE_MODELS and "typhoon" in models_manager.RETIRED
    assert [n for n, m in models_manager.LANGUAGE_MODELS.items() if m["language"] == "th"] == ["pathumma"]


def test_the_download_borrows_the_tokenizer_then_converts(fresh_db, monkeypatch):
    spec = models_manager.LANGUAGE_MODELS["pathumma"]
    monkeypatch.setattr(models_manager.hardware, "detect", lambda: SimpleNamespace(engine="faster-whisper"))
    lists = {spec["repo"]: sorted(spec["files"] | {"vocab.json", "merges.txt", "README.md"}),
             spec["borrow"]["repo"]: ["tokenizer.json", "model.safetensors", "vocab.json"]}
    asked = []

    def file_list(repo, sha=None):
        asked.append((repo, sha))
        return sha, [{"path": name, "size": 3} for name in lists[repo]]

    urls = []

    def download(url, dest, prog, expected_sha256=None, expected_size=None, cancel=None):
        urls.append(url)
        dest.write_bytes(b"abc")

    def fake_convert(src, dest):
        assert sorted(p.name for p in src.iterdir()) == sorted(spec["files"] | {"tokenizer.json"})
        dest.mkdir(parents=True)
        (dest / "model.bin").write_bytes(b"ct2")

    monkeypatch.setattr(models_manager, "_file_list", file_list)
    monkeypatch.setattr(models_manager.downloader, "download", download)
    monkeypatch.setattr(models_manager.downloader, "git_blob_sha1", lambda p: None)
    monkeypatch.setattr(convert, "convert", fake_convert)
    try:
        models_manager._download("pathumma", "faster-whisper")
        assert models_manager.status()["state"] == "done", models_manager.status()
        assert asked == [(spec["repo"], spec["revision"]), (spec["borrow"]["repo"], spec["borrow"]["revision"])]
        hf = models_manager.HF
        assert sorted(urls) == sorted([f"{hf}/{spec['repo']}/resolve/{spec['revision']}/{n}" for n in spec["files"]]
                                      + [f"{hf}/openai/whisper-large-v3/resolve/{spec['borrow']['revision']}/tokenizer.json"]), \
            "only Pathumma's own files from its page, and only the tokenizer from Whisper's"
        assert models_manager.for_language("th") == "pathumma"
    finally:
        models_manager.delete("pathumma")


def test_a_typhoon_downloaded_before_is_removed(fresh_db, monkeypatch):
    monkeypatch.setattr(models_manager.hardware, "detect", lambda: SimpleNamespace(engine="faster-whisper"))
    old = models_manager.model_dir("typhoon", "faster-whisper")
    old.mkdir(parents=True)
    (old / "model.bin").write_bytes(b"ct2")
    (old / "manifest.json").write_text("{}")
    keep = models_manager.model_dir("small", "faster-whisper")
    keep.mkdir(parents=True, exist_ok=True)
    (keep / "manifest.json").write_text("{}")
    try:
        assert models_manager.for_language("th") is None, "it is no longer used for Thai"
        assert "typhoon" not in [m["size"] for m in models_manager.list_models()]
        models_manager.forget_retired()
        assert not old.exists()
        assert models_manager.is_installed("small", "faster-whisper"), "other models stay"
        models_manager.forget_retired()  # nothing left to remove: no error
    finally:
        models_manager.delete("small")


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
    # what Typhoon (the Thai model before Pathumma) did after a sentence that ended in silence: a Latin word, then letters piled at one moment
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
    # the Thai models' pieces are letters and marks: ค่ะ comes as ค + ่ะ, and a loop can stop half-way (ค)
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
