"""Embedding sidecar для hybrid RAG-поиска ProcessMap (ONNX int8).

Модель: intfloat/multilingual-e5-small, экспорт + int8 dynamic quantization
на этапе сборки образа (export_onnx.py), .onnx запечён в образ.
Рантайм: onnxruntime (CPU) + tokenizers (tokenizer.json) + numpy.
Пулинг: mean-pooling по attention_mask + L2-нормализация — формула
идентична sentence-transformers (MeanPooling + Normalize).

e5-контракт: к текстам добавляются префиксы "query: " / "passage: " по input_type.
model_id в ответе — ровно "local-e5-small" (совместимость с DEFAULT из миграции 023).
HTTP-контракт (/embed, /health) не менялся относительно torch-версии.
"""
import os
from typing import List, Optional

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

MODEL_DIR = os.environ.get("EMBEDDINGS_MODEL_DIR", "/models")
MODEL_ID = "local-e5-small"
DIMENSIONS = 384
MAX_SEQ = 512

app = FastAPI(title="processmap-rag-embedder")
_sess = None
_tok = None


@app.on_event("startup")
def _load_model() -> None:
    global _sess, _tok
    import onnxruntime as ort
    from tokenizers import Tokenizer

    opts = ort.SessionOptions()
    threads = int(os.environ.get("EMBEDDINGS_ORT_THREADS", "0") or 0)
    if threads > 0:
        opts.intra_op_num_threads = threads
    sess_path = os.path.join(MODEL_DIR, "model_int8.onnx")
    _sess = ort.InferenceSession(sess_path, providers=["CPUExecutionProvider"], sess_options=opts)
    _tok = Tokenizer.from_file(os.path.join(MODEL_DIR, "tokenizer.json"))
    _tok.enable_truncation(max_length=MAX_SEQ)
    # Прогрев сессии (инициализация тред-пула ort) до первого реального запроса.
    _embed(["passage: warm-up"], "passage")


def _embed(texts: List[str], input_type: str) -> np.ndarray:
    prefix = "query: " if input_type == "query" else "passage: "
    enc = _tok.encode_batch([prefix + t for t in texts])
    max_len = max(len(e.ids) for e in enc)
    input_ids = np.zeros((len(enc), max_len), dtype="int64")
    attn = np.zeros((len(enc), max_len), dtype="int64")
    for i, e in enumerate(enc):
        input_ids[i, : len(e.ids)] = e.ids
        attn[i, : len(e.attention_mask)] = e.attention_mask

    (last_hidden,) = _sess.run(
        ["last_hidden_state"],
        {"input_ids": input_ids, "attention_mask": attn},
    )
    # Mean pooling + L2 normalize — идентично sentence-transformers.
    mask = attn.astype("float32")[..., None]
    summed = (last_hidden * mask).sum(axis=1)
    counts = mask.sum(axis=1).clip(min=1e-9)
    pooled = summed / counts
    norms = np.linalg.norm(pooled, axis=1, keepdims=True).clip(min=1e-12)
    return (pooled / norms).astype("float32")


class EmbedIn(BaseModel):
    texts: List[str] = Field(default_factory=list)
    input_type: Optional[str] = Field(default="passage")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model_id": MODEL_ID, "dimensions": DIMENSIONS, "model_loaded": _sess is not None}


@app.post("/embed")
def embed(inp: EmbedIn) -> dict:
    if _sess is None:
        return {"embeddings": [], "model_id": MODEL_ID, "dimensions": DIMENSIONS, "error": "model_not_loaded"}
    texts = [str(t) for t in (inp.texts or []) if str(t or "").strip()]
    if not texts:
        return {"embeddings": [], "model_id": MODEL_ID, "dimensions": DIMENSIONS}
    vectors = _embed(texts, inp.input_type)
    return {
        "embeddings": [[float(v) for v in row] for row in vectors],
        "model_id": MODEL_ID,
        "dimensions": DIMENSIONS,
    }
