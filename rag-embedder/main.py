"""Embedding sidecar для hybrid RAG-поиска ProcessMap.

Модель: intfloat/multilingual-e5-small (CPU), загружается один раз при старте.
e5-контракт: к текстам добавляются префиксы "query: " / "passage: " по input_type.
model_id в ответе — ровно "local-e5-small" (совместимость с DEFAULT из миграции 023).
"""
import os
from typing import List, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

MODEL_NAME = os.environ.get("EMBEDDINGS_MODEL", "intfloat/multilingual-e5-small")
MODEL_ID = "local-e5-small"
DIMENSIONS = 384

app = FastAPI(title="processmap-rag-embedder")
_model = None


@app.on_event("startup")
def _load_model() -> None:
    global _model
    from sentence_transformers import SentenceTransformer

    _model = SentenceTransformer(MODEL_NAME, device="cpu")


class EmbedIn(BaseModel):
    texts: List[str] = Field(default_factory=list)
    input_type: Optional[str] = Field(default="passage")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model_id": MODEL_ID, "dimensions": DIMENSIONS, "model_loaded": _model is not None}


@app.post("/embed")
def embed(inp: EmbedIn) -> dict:
    if _model is None:
        return {"embeddings": [], "model_id": MODEL_ID, "dimensions": DIMENSIONS, "error": "model_not_loaded"}
    texts = [str(t) for t in (inp.texts or []) if str(t or "").strip()]
    prefix = "query: " if inp.input_type == "query" else "passage: "
    if not texts:
        return {"embeddings": [], "model_id": MODEL_ID, "dimensions": DIMENSIONS}
    vectors = _model.encode([prefix + t for t in texts], normalize_embeddings=True)
    return {
        "embeddings": [[float(v) for v in row] for row in vectors],
        "model_id": MODEL_ID,
        "dimensions": DIMENSIONS,
    }
