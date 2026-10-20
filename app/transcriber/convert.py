"""Turns a Whisper model published for Hugging Face transformers into the CTranslate2 form faster-whisper reads.

The Bisaya model (models_manager.LANGUAGE_MODELS) is only published that way. CTranslate2's own converter
needs PyTorch and transformers (about 2 GB); this does the same with numpy, following its WhisperLoader
(ctranslate2/converters/transformers.py), and gives the same model.bin (checked 2026-10-19 on BuzzASR/cebuano).
"""

from __future__ import annotations

import json
import shutil
import struct
from pathlib import Path

import numpy as np

_DTYPES = {"F16": np.float16, "F32": np.float32, "BF16": np.uint16}


def _bf16(raw: np.ndarray) -> np.ndarray:
    """bfloat16 weights (the Thai model's) as float16: a bfloat16 is the top half of a float32, so it is
    widened exactly and then rounded to float16 (what the model is saved as anyway)."""
    return (raw.astype(np.uint32) << 16).view(np.float32).astype(np.float16)


def _tensors(path: Path) -> dict[str, np.ndarray]:
    """The weights in a .safetensors file, read in place (nothing is copied until it is used; bfloat16 ones
    are turned into float16 as they are read)."""
    with open(path, "rb") as f:
        size = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(size))
    header.pop("__metadata__", None)
    data = np.memmap(path, dtype=np.uint8, mode="r", offset=8 + size)
    out = {}
    for name, info in header.items():
        dtype = _DTYPES.get(info["dtype"])
        if dtype is None:
            raise ValueError(f"Unsupported weight type {info['dtype']} in {path.name}")
        start, end = info["data_offsets"]
        tensor = data[start:end].view(dtype).reshape(info["shape"])
        out[name] = _bf16(tensor) if info["dtype"] == "BF16" else tensor
    return out


def convert(src: Path, dest: Path) -> None:
    """Writes `dest` (model.bin, config.json, vocabulary.json, tokenizer.json, preprocessor_config.json)."""
    from ctranslate2.converters import utils
    from ctranslate2.specs import common_spec, whisper_spec

    config = json.loads((src / "config.json").read_text(encoding="utf-8"))
    gen = json.loads((src / "generation_config.json").read_text(encoding="utf-8"))
    w: dict[str, np.ndarray] = {}
    for f in sorted(src.glob("*.safetensors")):
        w.update(_tensors(f))
    w = {k.removeprefix("model."): v for k, v in w.items()}

    spec = whisper_spec.WhisperSpec(config["encoder_layers"], config["encoder_attention_heads"],
                                    config["decoder_layers"], config["decoder_attention_heads"])

    def linear(s, name, bias=True):
        s.weight = w[name + ".weight"]
        if bias and name + ".bias" in w:
            s.bias = w[name + ".bias"]

    def norm(s, name):
        s.gamma = w[name + ".weight"]
        s.beta = w[name + ".bias"]

    def attention(s, name, self_attention):
        q, k, v = (common_spec.LinearSpec() for _ in range(3))
        linear(q, name + ".q_proj")
        linear(k, name + ".k_proj")
        linear(v, name + ".v_proj")
        if self_attention:
            utils.fuse_linear(s.linear[0], [q, k, v])
        else:
            utils.fuse_linear(s.linear[0], [q])
            utils.fuse_linear(s.linear[1], [k, v])
        linear(s.linear[-1], name + ".out_proj")

    def layers(s, name, cross):
        for i, ls in enumerate(s.layer):
            p = f"{name}.layers.{i}"
            attention(ls.self_attention, p + ".self_attn", True)
            norm(ls.self_attention.layer_norm, p + ".self_attn_layer_norm")
            if cross:
                attention(ls.attention, p + ".encoder_attn", False)
                norm(ls.attention.layer_norm, p + ".encoder_attn_layer_norm")
            linear(ls.ffn.linear_0, p + ".fc1")
            linear(ls.ffn.linear_1, p + ".fc2")
            norm(ls.ffn.layer_norm, p + ".final_layer_norm")

    enc, dec = spec.encoder, spec.decoder
    linear(enc.conv1, "encoder.conv1")
    linear(enc.conv2, "encoder.conv2")
    enc.position_encodings.encodings = w["encoder.embed_positions.weight"]
    norm(enc.layer_norm, "encoder.layer_norm")
    layers(enc, "encoder", cross=False)
    dec.embeddings.weight = w["decoder.embed_tokens.weight"]
    dec.position_encodings.encodings = w["decoder.embed_positions.weight"]
    norm(dec.layer_norm, "decoder.layer_norm")
    layers(dec, "decoder", cross=True)
    # The output layer shares the token table unless the model has its own.
    dec.projection.weight = w.get("proj_out.weight", w["decoder.embed_tokens.weight"])

    spec.config.suppress_ids = gen["suppress_tokens"]
    spec.config.suppress_ids_begin = gen["begin_suppress_tokens"]
    spec.config.alignment_heads = gen["alignment_heads"]
    spec.config.lang_ids = sorted(gen["lang_to_id"].values())

    # Tokens in id order, then the timestamp tokens that fill the rest of the table.
    tok = json.loads((src / "tokenizer.json").read_text(encoding="utf-8"))
    vocab = dict(tok["model"]["vocab"])
    vocab.update({t["content"]: t["id"] for t in tok["added_tokens"]})
    tokens = [t for t, _ in sorted(vocab.items(), key=lambda kv: kv[1])]
    tokens.extend("<|%.2f|>" % (i * 0.02) for i in range(config["vocab_size"] - len(tokens)))
    spec.register_vocabulary(tokens)

    spec.validate()
    spec.optimize(quantization="float16")
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    spec.save(str(dest))
    for name in ("tokenizer.json", "preprocessor_config.json"):
        shutil.copy2(src / name, dest / name)
