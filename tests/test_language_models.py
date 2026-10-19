"""Models made for one language (models_manager.LANGUAGE_MODELS): the Bisaya model, its conversion, and when it is used."""

from __future__ import annotations

import json
import struct
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import db, hardware, models_manager, transcriber
from app.transcriber import convert, faster


def _write_safetensors(path, tensors):
    header, blobs, offset = {}, [], 0
    for name, arr in tensors.items():
        raw = arr.astype(np.float16).tobytes()
        header[name] = {"dtype": "F16", "shape": list(arr.shape), "data_offsets": [offset, offset + len(raw)]}
        blobs.append(raw)
        offset += len(raw)
    head = json.dumps(header).encode()
    path.write_bytes(struct.pack("<Q", len(head)) + head + b"".join(blobs))


def _tiny_whisper(src, d=8, ffn=16, mels=4, vocab=40, positions=6):
    """A made-up Whisper (38 tokens, then 2 timestamps) of one layer each way, laid out as Hugging Face transformers publishes one."""
    rng = np.random.default_rng(1)
    t = {}

    def r(*shape):
        return rng.standard_normal(shape).astype(np.float32)

    t["model.encoder.conv1.weight"], t["model.encoder.conv1.bias"] = r(d, mels, 3), r(d)
    t["model.encoder.conv2.weight"], t["model.encoder.conv2.bias"] = r(d, d, 3), r(d)
    t["model.encoder.embed_positions.weight"] = r(positions, d)
    t["model.decoder.embed_tokens.weight"] = r(vocab, d)
    t["model.decoder.embed_positions.weight"] = r(positions, d)
    for side, cross in (("encoder", False), ("decoder", True)):
        for att in ["self_attn"] + (["encoder_attn"] if cross else []):
            p = f"model.{side}.layers.0.{att}"
            for proj in ("q_proj", "k_proj", "v_proj", "out_proj"):
                t[f"{p}.{proj}.weight"] = r(d, d)
                if proj != "k_proj":  # Whisper's keys have no bias
                    t[f"{p}.{proj}.bias"] = r(d)
            t[f"{p}_layer_norm.weight"], t[f"{p}_layer_norm.bias"] = r(d), r(d)
        p = f"model.{side}.layers.0"
        t[f"{p}.fc1.weight"], t[f"{p}.fc1.bias"] = r(ffn, d), r(ffn)
        t[f"{p}.fc2.weight"], t[f"{p}.fc2.bias"] = r(d, ffn), r(d)
        t[f"{p}.final_layer_norm.weight"], t[f"{p}.final_layer_norm.bias"] = r(d), r(d)
        t[f"model.{side}.layer_norm.weight"], t[f"model.{side}.layer_norm.bias"] = r(d), r(d)
    _write_safetensors(src / "model.safetensors", t)

    words = {f"w{i}": i for i in range(28)}
    special = ["<|endoftext|>", "<|startoftranscript|>", "<|en|>", "<|tl|>", "<|translate|>", "<|transcribe|>",
               "<|startoflm|>", "<|startofprev|>", "<|nocaptions|>", "<|notimestamps|>"]
    added = [{"id": 28 + i, "content": tok} for i, tok in enumerate(special)]
    (src / "tokenizer.json").write_text(json.dumps({"model": {"vocab": words}, "added_tokens": added}))
    (src / "config.json").write_text(json.dumps({"encoder_layers": 1, "decoder_layers": 1, "encoder_attention_heads": 2,
                                                 "decoder_attention_heads": 2, "vocab_size": vocab}))
    (src / "generation_config.json").write_text(json.dumps({
        "suppress_tokens": [1, 2], "begin_suppress_tokens": [28], "alignment_heads": [[0, 1]],
        "lang_to_id": {"<|tl|>": 31, "<|en|>": 30}}))
    (src / "preprocessor_config.json").write_text(json.dumps({"feature_size": mels}))
    return t


def test_conversion_gives_a_model_ctranslate2_can_load(tmp_path):
    import ctranslate2

    src, dest = tmp_path / "src", tmp_path / "out"
    src.mkdir()
    weights = _tiny_whisper(src, vocab=40)
    convert.convert(src, dest)
    assert {p.name for p in dest.iterdir()} >= {"model.bin", "config.json", "vocabulary.json", "tokenizer.json",
                                                 "preprocessor_config.json"}
    config = json.loads((dest / "config.json").read_text())
    assert config["lang_ids"] == [30, 31] and config["alignment_heads"] == [[0, 1]]
    assert config["suppress_ids_begin"] == [28]
    vocab = json.loads((dest / "vocabulary.json").read_text())
    assert vocab[:2] == ["w0", "w1"] and vocab[28] == "<|endoftext|>" and vocab[38:] == ["<|0.00|>", "<|0.02|>"]
    model = ctranslate2.models.Whisper(str(dest), device="cpu")
    assert model.n_mels == 4
    assert weights["model.decoder.embed_tokens.weight"].shape == (40, 8)


class FakeWhisper:
    def __init__(self, path, size, device, beam_size=5, prompt=True):
        self.path, self.model_size, self.device, self.engine = path, size, device, "faster-whisper"
        self.prompt = prompt


@pytest.fixture()
def local(fresh_db, monkeypatch):
    monkeypatch.setattr(hardware, "detect", lambda: SimpleNamespace(engine="faster-whisper", device="cpu", to_dict=dict))
    monkeypatch.setattr(faster, "FasterWhisperTranscriber", FakeWhisper)
    transcriber.unload()

    def install(size):
        d = models_manager.model_dir(size, "faster-whisper")
        d.mkdir(parents=True, exist_ok=True)
        (d / "manifest.json").write_text("{}")

    yield install
    transcriber.unload()
    for size in ("small", "bisaya"):
        models_manager.delete(size)


def test_the_bisaya_model_writes_bisaya_and_only_bisaya(local):
    with pytest.raises(transcriber.NoModelError):
        transcriber.get(language="ceb")
    local("bisaya")
    assert models_manager.for_language("ceb") == "bisaya"
    assert models_manager.for_language("tl") is None, "Tagalog is not Bisaya"
    own = transcriber.get(language="ceb")
    assert own.model_size == "bisaya", "no model picked, but Bisaya has its own"
    assert own.prompt is False, "it needs no Bisaya opening prompt"
    with pytest.raises(transcriber.NoModelError):
        transcriber.get(language="es")
    local("small")
    db.set_settings({"model_size": "small"})
    assert transcriber.get(language="es").model_size == "small"
    assert transcriber.get(language="es").prompt is True
    assert transcriber.get(language="ceb").model_size == "bisaya"
    assert transcriber.get().model_size == "small"
    # Cloud transcription, once chosen, writes everything except Bisaya: the Bisaya model wins there,
    # as no cloud provider knows the language.
    db.set_settings({"stt_mode": "cloud", "stt_key_groq": "gsk_test"})
    assert transcriber.get(language="es").engine == "cloud"
    assert transcriber.get(language="ceb").model_size == "bisaya"
    models_manager.delete("bisaya")
    assert transcriber.get(language="ceb").engine == "cloud", "without the Bisaya model, the cloud as before"


def test_the_bisaya_model_is_offered_but_cannot_be_picked(local):
    from app.main import create_app

    client = TestClient(create_app(start_worker=False))
    db.set_settings({"study_language": "ceb"})
    data = client.get("/api/models").json()
    row = next(m for m in data["models"] if m["size"] == "bisaya")
    assert row["language"] == "ceb" and not row["installed"] and data["study_language"] == "ceb"
    assert all("language" not in m for m in data["models"] if m["size"] in models_manager.SIZES)
    assert client.patch("/api/settings", json={"model_size": "bisaya"}).status_code == 400
    assert not client.get("/api/status").json()["model_ready"]
    local("bisaya")
    assert client.get("/api/status").json()["model_ready"], "a Bisaya learner can transcribe with it alone"
    assert client.delete("/api/models/bisaya").json() == {"ok": True}
    assert not models_manager.is_installed("bisaya", "faster-whisper")


def test_download_fetches_the_pinned_files_then_converts(local, monkeypatch):
    spec = models_manager.LANGUAGE_MODELS["bisaya"]
    asked = {}

    def file_list(repo, sha=None):
        asked["repo"], asked["sha"] = repo, sha
        return sha, [{"path": name, "size": 3} for name in sorted(spec["files"] | {"README.md", "vocab.json"})]

    fetched = []

    def download(url, dest, prog, expected_sha256=None, expected_size=None, cancel=None):
        fetched.append(dest.name)
        dest.write_bytes(b"abc")

    def fake_convert(src, dest):
        assert sorted(p.name for p in src.iterdir()) == sorted(spec["files"])
        dest.mkdir(parents=True)
        (dest / "model.bin").write_bytes(b"ct2")

    monkeypatch.setattr(models_manager, "_file_list", file_list)
    monkeypatch.setattr(models_manager.downloader, "download", download)
    monkeypatch.setattr(models_manager.downloader, "git_blob_sha1", lambda p: None)
    monkeypatch.setattr(convert, "convert", fake_convert)
    models_manager._download("bisaya", "faster-whisper")
    assert models_manager.status()["state"] == "done", models_manager.status()
    assert (asked["repo"], asked["sha"]) == (spec["repo"], spec["revision"])
    assert sorted(fetched) == sorted(spec["files"]), "only what the conversion needs"
    final = models_manager.model_dir("bisaya", "faster-whisper")
    assert sorted(p.name for p in final.iterdir()) == ["manifest.json", "model.bin"]
    assert models_manager.for_language("ceb") == "bisaya"


def test_words_go_back_to_the_line_their_text_is_on():
    """From a real Bisaya transcript: a line began without a space, so faster-whisper glued "unya" onto
    "-walking" and filed every later word one line early, until the lines' text and words met again."""
    from app.transcriber.base import Segment, Word
    from app.transcriber.faster import regroup

    def seg(text, *words):
        return Segment(words[0][1] if words else 0, words[-1][2] if words else 0, text,
                       [Word(a, b, t) for t, a, b in words])

    got = list(regroup([
        seg("so niundang napug-walking", ("so", 0, .26), ("niundang", .26, .76), ("napug", .76, 1.04),
            ("-walkingunya", 1.04, 1.82)),
        seg("unya layo pudyud kaayo", ("layo", 2.48, 2.78), ("pudyud", 2.78, 3.06), ("kaayo", 3.06, 3.44),
            ("kay", 3.44, 3.92)),
        seg("kay nilayo man", ("nilayo", 3.92, 4.3), ("man", 4.3, 4.5)),
        seg("Dili na.", ("Dili", 5, 5.3), ("na.", 5.3, 5.6)),  # already right: passes straight through
    ]))
    assert [[w.text for w in s.words] for s in got] == [
        ["so", "niundang", "napug", "-walking"], ["unya", "layo", "pudyud", "kaayo"], ["kay", "nilayo", "man"],
        ["Dili", "na."]]
    assert got[0].words[-1].end == got[1].words[0].start == pytest.approx(1.04 + .78 * 8 / 12)
    assert (got[1].start, got[1].end, got[2].start) == (pytest.approx(1.56), 3.44, 3.44)
    # Lines that never match up again are left as faster-whisper gave them.
    odd = [seg("unya layo", ("layo", 1, 2)), seg("kay", ("kay", 2, 3), ("x", 3, 4))]
    assert [[w.text for w in s.words] for s in regroup(odd)] == [["layo"], ["kay", "x"]]
