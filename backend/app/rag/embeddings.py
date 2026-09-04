"""HTTP-клиент embedding-sidecar (rag-embedder).

Контракт sidecar: POST /embed {"texts": [...], "input_type": "query"|"passage"}
-> {"embeddings": [[float...]], "model_id": "local-e5-small", "dimensions": 384}.

Любой сбой (connect, timeout, битый payload) -> None: вызывающий код деградирует
на keyword-only. Дополнительно — короткий cooldown после серии неудач, чтобы
упавший sidecar не добавлял таймаут к каждому поиску.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from array import array
from typing import Any, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "http://rag-embedder:8000"
TIMEOUT_SECONDS = 3.0
FAILURE_COOLDOWN_SECONDS = 30.0

_state_lock = threading.Lock()
_failures = 0
_cooldown_until = 0.0

QueryEmbedding = Tuple[list, str, int]


def _base_url() -> str:
    return os.environ.get("EMBEDDINGS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _in_cooldown() -> bool:
    with _state_lock:
        return time.monotonic() < _cooldown_until


def _record_success() -> None:
    global _failures, _cooldown_until
    with _state_lock:
        _failures = 0
        _cooldown_until = 0.0


def _record_failure() -> None:
    global _failures, _cooldown_until
    with _state_lock:
        _failures += 1
        if _failures >= 3:
            _cooldown_until = time.monotonic() + FAILURE_COOLDOWN_SECONDS


def _post_embed(texts: list, input_type: str) -> Optional[QueryEmbedding]:
    texts = [str(t) for t in (texts or []) if str(t or "").strip()]
    if not texts:
        return None
    if _in_cooldown():
        logger.warning("rag-embedder skipped (%s): failure cooldown active", input_type)
        return None
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.post(
                f"{_base_url()}/embed",
                json={"texts": texts, "input_type": input_type},
            )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise ValueError("bad embeddings payload")
        model_id = str(data.get("model_id") or "")
        dimensions = int(data.get("dimensions") or 0)
        _record_success()
        return (embeddings, model_id, dimensions)
    except Exception as exc:
        logger.warning("rag-embedder unavailable (input_type=%s): %s", input_type, exc)
        _record_failure()
        return None


def get_query_embedding(text: str) -> Optional[QueryEmbedding]:
    return _post_embed([text], "query")


def get_embeddings_for_texts(texts: list) -> Optional[QueryEmbedding]:
    return _post_embed(list(texts or []), "passage")


def encode_vector(values: Any) -> bytes:
    """[float] -> float32 little-endian bytes для rag_embeddings.vector_data (array('f'), без numpy)."""
    return array("f", [float(v) for v in (values or [])]).tobytes()
